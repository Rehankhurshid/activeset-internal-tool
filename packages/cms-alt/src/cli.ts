#!/usr/bin/env node
/**
 * CMS ALT Text & Compression CLI
 *
 * Commands:
 *   scan      — list CMS collections + image/richtext field counts
 *   export    — dump every image entry in a site (or subset of collections) to CSV
 *   generate  — fill empty `new_alt` cells via local Ollama (Gemma 3 4B by default)
 *   compress  — download each image, re-encode to lossless WebP, upload to Webflow Assets
 *   import    — push CSV back to Webflow (updates ALT + swaps to compressed URL when set)
 *   publish   — publish changed items (reads item IDs from CSV)
 *   run       — one-liner pipeline: export → generate → compress → import → publish
 *
 * Auth: set WEBFLOW_API_TOKEN in .env.local, or pass --token explicitly.
 * AI: requires a running Ollama instance (default http://localhost:11434) with the
 * model pulled:  ollama pull gemma3:4b
 */

import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import * as dotenv from 'dotenv';
import type { CmsImageEntry, CmsUpdatePayload, CollectionField } from './types';
import {
  listCollections,
  getCollection,
  listItems,
  patchItems,
  publishItems as publishItemsApi,
  deleteAsset,
} from './webflow-client';
import { extractAllImages } from './extract';
import { groupUpdatesByItem } from './patch';
import { CSV_COLUMNS, entriesToCsv, parseCsv } from './csv';
import { compressBuffer, downloadImage, extFromUrl, extFromContentType } from './compress';
import { uploadAssetToWebflow } from './assets';
import { generateAltForImages } from './ai-alt';
import { configureReporter, emit, flush, isReporterActive } from './progress';

dotenv.config({ path: '.env.local' });
dotenv.config();

// ─── shared helpers ─────────────────────────────────────────────────────────

function requireToken(opts: { token?: string }): string {
  const token = opts.token || process.env.WEBFLOW_TOKEN || process.env.WEBFLOW_API_TOKEN;
  if (!token) {
    console.error('Missing Webflow token. Pass --token or set WEBFLOW_API_TOKEN in .env.local');
    process.exit(1);
  }
  return token;
}

function requireSite(opts: { site?: string }): string {
  const site = opts.site || process.env.WEBFLOW_SITE_ID;
  if (!site) {
    console.error('Missing Webflow site ID. Pass --site or set WEBFLOW_SITE_ID in .env.local');
    process.exit(1);
  }
  return site;
}

function ollamaOpts(opts: { ollamaHost?: string; model?: string }) {
  return {
    host: opts.ollamaHost || process.env.OLLAMA_HOST || 'http://localhost:11434',
    model: opts.model || process.env.OLLAMA_MODEL || 'gemma3:4b',
  };
}

function log(...args: unknown[]) {
  console.log(...args);
}

async function sleep(ms: number) {
  await new Promise(r => setTimeout(r, ms));
}

async function rateLimited<T>(fn: () => Promise<T>, delayMs = 1100): Promise<T> {
  const r = await fn();
  await sleep(delayMs);
  return r;
}

async function readJsonFile<T>(p: string): Promise<T> {
  return JSON.parse(await fs.readFile(p, 'utf8'));
}

const csvEsc = (v: string) =>
  /[",\n\r]/.test(v || '') ? `"${(v || '').replace(/"/g, '""')}"` : v || '';

function writeCsv(rows: Record<string, string>[], outPath: string) {
  const header = CSV_COLUMNS.join(',');
  const body = rows.map(r => CSV_COLUMNS.map(c => csvEsc(r[c] || '')).join(',')).join('\n');
  return fs.writeFile(outPath, header + '\n' + body + '\n', 'utf8');
}

function rowId(r: Record<string, string>): string {
  return `${r.collection_id}::${r.item_id}::${r.field_slug}::${r.image_index}`;
}

// ─── command implementations ───────────────────────────────────────────────

async function scan(opts: { site?: string; token?: string }) {
  const token = requireToken(opts);
  const site = requireSite(opts);
  log(`Scanning site ${site}…`);
  const collections = await listCollections(site, token);
  log(`Found ${collections.length} collection(s).\n`);
  for (const c of collections) {
    const full = await rateLimited(() => getCollection(c.id, token));
    const fields: CollectionField[] = (full.fields || []) as CollectionField[];
    const imgCount = fields.filter(f => f.type === 'Image' || f.type === 'MultiImage').length;
    const rtCount = fields.filter(f => f.type === 'RichText').length;
    if (imgCount === 0 && rtCount === 0) continue;
    log(
      `  ${c.displayName.padEnd(40)} ${String(imgCount).padStart(2)} image · ${String(rtCount).padStart(2)} rich-text  (${c.id})`
    );
  }
}

async function fetchAllImagesForCollection(
  collectionId: string,
  token: string
): Promise<CmsImageEntry[]> {
  const schema = await getCollection(collectionId, token);
  const allFields: CollectionField[] = (schema.fields || []) as CollectionField[];
  const collectionName = schema.displayName || schema.slug || 'Unknown';
  const hasAny = allFields.some(
    f => f.type === 'Image' || f.type === 'MultiImage' || f.type === 'RichText'
  );
  if (!hasAny) return [];

  const all: CmsImageEntry[] = [];
  let offset = 0;
  for (;;) {
    const { items, pagination } = await rateLimited(() => listItems(collectionId, token, offset, 100));
    for (const item of items) all.push(...extractAllImages(item, collectionId, collectionName, allFields));
    offset += items.length;
    const total = pagination.total ?? 0;
    if (items.length === 0 || offset >= total) break;
  }
  return all;
}

async function exportCmd(opts: {
  site?: string;
  token?: string;
  collections?: string;
  fields?: string;
  out: string;
  missingOnly?: boolean;
}) {
  const token = requireToken(opts);
  const site = requireSite(opts);
  const collectionIds = opts.collections
    ? opts.collections.split(',').map(s => s.trim()).filter(Boolean)
    : (await listCollections(site, token)).map(c => c.id);

  const fieldSlugs = opts.fields
    ? new Set(opts.fields.split(',').map(s => s.trim()).filter(Boolean))
    : null;

  log(`Exporting ${collectionIds.length} collection(s)…${fieldSlugs ? ` (fields: ${[...fieldSlugs].join(', ')})` : ''}`);
  emit({
    step: 'export',
    level: 'info',
    message: `Exporting ${collectionIds.length} collection(s)`,
    detail: fieldSlugs ? `fields: ${[...fieldSlugs].join(', ')}` : undefined,
  });
  const all: CmsImageEntry[] = [];
  for (let ci = 0; ci < collectionIds.length; ci++) {
    const cid = collectionIds[ci];
    const images = await fetchAllImagesForCollection(cid, token);
    const scoped = fieldSlugs ? images.filter(i => fieldSlugs.has(i.fieldSlug)) : images;
    log(`  ${cid}: ${scoped.length} images${fieldSlugs ? ` (of ${images.length})` : ''}`);
    emit({
      step: 'export',
      level: 'info',
      message: `${cid.slice(-6)} · ${scoped.length} images`,
      current: ci + 1,
      total: collectionIds.length,
    });
    all.push(...scoped);
  }

  const filtered = opts.missingOnly ? all.filter(e => e.isMissingAlt) : all;
  await fs.writeFile(opts.out, entriesToCsv(filtered), 'utf8');
  const jsonPath = opts.out.replace(/\.csv$/, '') + '.raw.json';
  await fs.writeFile(jsonPath, JSON.stringify(all, null, 2), 'utf8');

  log(`\n→ Wrote ${filtered.length} row(s) to ${opts.out}`);
  log(`→ Raw field snapshot saved to ${jsonPath} (needed by 'import')`);
  if (opts.missingOnly) log(`  (filtered: ${all.length - filtered.length} rows with ALT set were skipped)`);
  emit({
    step: 'export',
    level: 'success',
    message: `Exported ${filtered.length} row(s)`,
    detail: `${opts.out}${opts.missingOnly ? ` · ${all.length - filtered.length} already had ALT` : ''}`,
  });
}

async function generateCmd(
  csvPath: string,
  opts: { ollamaHost?: string; model?: string; siteName?: string; overwrite?: boolean }
) {
  const { host, model } = ollamaOpts(opts);
  const jsonPath = csvPath.replace(/\.csv$/, '') + '.raw.json';
  const rawEntries = await readJsonFile<CmsImageEntry[]>(jsonPath);
  const rows = parseCsv(await fs.readFile(csvPath, 'utf8'));
  const byId = new Map(rawEntries.map(e => [e.id, e]));

  const needAlt = rows.filter(r => {
    const entry = byId.get(rowId(r));
    if (!entry) return false;
    if (opts.overwrite) return true;
    return !r.new_alt || r.new_alt.trim() === '';
  });

  if (needAlt.length === 0) {
    log('No rows need ALT. Nothing to do.');
    return;
  }

  log(`Generating ALT for ${needAlt.length} row(s) via ${model} @ ${host}…\n`);
  emit({
    step: 'generate',
    level: 'info',
    message: `Generating ALT for ${needAlt.length} image(s)`,
    detail: `${model} @ ${host}`,
    total: needAlt.length,
    current: 0,
  });

  const startedAt = Date.now();
  const BATCH = 25;
  for (let i = 0; i < needAlt.length; i += BATCH) {
    const slice = needAlt.slice(i, i + BATCH);
    const entries = slice.map(r => byId.get(rowId(r))!).filter(Boolean);
    const baseIndex = i;
    const suggestions = await generateAltForImages(entries, {
      host,
      model,
      siteName: opts.siteName,
      onProgress: ({ entry, altText, durationMs, fallback, error }) => {
        const globalIndex = baseIndex + (entries.findIndex(e => e.id === entry.id) + 1);
        const pos = `[${String(globalIndex).padStart(String(needAlt.length).length, ' ')}/${needAlt.length}]`;
        const tag = fallback ? (error ? '✗' : '•') : '✓';
        const time = `${(durationMs / 1000).toFixed(1)}s`;
        const preview = altText.length > 60 ? altText.slice(0, 57) + '…' : altText;
        const context = `${entry.collectionName} › ${entry.itemName} · ${entry.fieldDisplayName}`;
        log(`  ${pos} ${tag} ${time.padStart(5, ' ')} · ${context}`);
        log(`         “${preview}”${error ? ` (err: ${error.slice(0, 80)})` : ''}`);
        emit({
          step: 'generate',
          level: error ? 'error' : fallback ? 'warn' : 'success',
          message: `${context} — ${preview}`,
          detail: error ? error.slice(0, 200) : undefined,
          current: globalIndex,
          total: needAlt.length,
          durationMs,
        });

        // Rolling ETA based on average time per image
        const elapsed = (Date.now() - startedAt) / 1000;
        const avg = elapsed / globalIndex;
        const remaining = Math.round(avg * (needAlt.length - globalIndex));
        if (globalIndex < needAlt.length && globalIndex % 5 === 0) {
          log(`         ⏱  ~${remaining}s remaining (avg ${avg.toFixed(1)}s/img)`);
        }
      },
    });
    const sugMap = new Map(suggestions.map(s => [s.entryId, s.altText]));
    for (const r of slice) {
      const a = sugMap.get(rowId(r));
      if (a != null) r.new_alt = a;
    }
    // Flush after every batch so Ctrl+C loses at most 25 rows
    await writeCsv(rows, csvPath);
  }

  log(`\n→ Updated ${csvPath}`);
  emit({
    step: 'generate',
    level: 'success',
    message: `ALT generation complete`,
    detail: `wrote ${needAlt.length} row(s) to ${csvPath}`,
    current: needAlt.length,
    total: needAlt.length,
  });
}

async function compressCmd(
  csvPath: string,
  opts: { site: string; token?: string; max: string; minSavings: string }
) {
  const token = requireToken(opts);
  const rows = parseCsv(await fs.readFile(csvPath, 'utf8'));
  const maxN = parseInt(opts.max, 10) || 0;
  const minSavings = parseInt(opts.minSavings, 10) || 0;
  const todo = rows.filter(r => !r.compressed_url);
  const batch = maxN > 0 ? todo.slice(0, maxN) : todo;

  let ok = 0, skipped = 0, failed = 0;
  let totalBefore = 0, totalAfter = 0;

  emit({
    step: 'compress',
    level: 'info',
    message: `Compressing ${batch.length} image(s)`,
    total: batch.length,
    current: 0,
  });

  for (let i = 0; i < batch.length; i++) {
    const r = batch[i];
    const shortUrl = (r.image_url.split('/').pop() || '').slice(0, 40);
    process.stdout.write(`[${i + 1}/${batch.length}] ${shortUrl}… `);
    const tStart = Date.now();
    try {
      const { buffer, contentType } = await downloadImage(r.image_url);
      const ext = extFromUrl(r.image_url) || extFromContentType(contentType);
      const result = await compressBuffer(buffer, ext);
      totalBefore += result.originalSize;
      totalAfter += result.compressedSize;

      if (result.skipped || result.savings < minSavings) {
        process.stdout.write(`skip (${result.reason ?? `${result.savings}% < ${minSavings}%`})\n`);
        skipped++;
        emit({
          step: 'compress',
          level: 'warn',
          message: `skip · ${shortUrl}`,
          detail: result.reason ?? `${result.savings}% savings below ${minSavings}% threshold`,
          current: i + 1,
          total: batch.length,
          durationMs: Date.now() - tStart,
        });
        continue;
      }

      // Use the compressed format's extension (usually .webp), not the
      // original, so the asset's name matches its content.
      const rawName = (r.image_url.split('/').pop() || `image.${ext}`).split('?')[0];
      const baseName = rawName.replace(/\.[^.]+$/, '') || 'image';
      const fileName = `${baseName}.${result.ext}`;
      const uploaded = await uploadAssetToWebflow(
        opts.site,
        token,
        fileName,
        result.buffer,
        result.contentType
      );
      r.compressed_url = uploaded.hostedUrl;
      process.stdout.write(`-${result.savings}% → ${uploaded.hostedUrl.slice(0, 60)}…\n`);
      ok++;
      // Flush after every row so a Ctrl+C never loses more than one upload.
      // Cheap: <1ms for typical CSVs; keeps resume behaviour honest.
      await writeCsv(rows, csvPath);
      emit({
        step: 'compress',
        level: 'success',
        message: `${shortUrl} · −${result.savings}%`,
        detail: `${Math.round(result.originalSize / 1024)} KB → ${Math.round(result.compressedSize / 1024)} KB`,
        current: i + 1,
        total: batch.length,
        durationMs: Date.now() - tStart,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`FAILED: ${msg}\n`);
      failed++;
      emit({
        step: 'compress',
        level: 'error',
        message: `failed · ${shortUrl}`,
        detail: msg.slice(0, 200),
        current: i + 1,
        total: batch.length,
      });
    }
  }

  await writeCsv(rows, csvPath);
  const savedPct = totalBefore > 0 ? Math.round(((totalBefore - totalAfter) / totalBefore) * 100) : 0;
  log(`\n${ok} compressed, ${skipped} skipped, ${failed} failed`);
  log(`Bytes: ${Math.round(totalBefore / 1024)} KB → ${Math.round(totalAfter / 1024)} KB (-${savedPct}%)`);
  emit({
    step: 'compress',
    level: failed > 0 ? 'warn' : 'success',
    message: `Compression complete · ${ok} ok · ${skipped} skipped · ${failed} failed`,
    detail: `${Math.round(totalBefore / 1024)} KB → ${Math.round(totalAfter / 1024)} KB (−${savedPct}%)`,
    current: batch.length,
    total: batch.length,
  });
}

type ImportMode = 'alt' | 'url' | 'both';

async function importCmd(
  csvPath: string,
  opts: { token?: string; dryRun?: boolean; mode?: ImportMode }
) {
  const token = requireToken(opts);
  const mode: ImportMode = opts.mode ?? 'both';
  const jsonPath = csvPath.replace(/\.csv$/, '') + '.raw.json';
  const rawEntries = await readJsonFile<CmsImageEntry[]>(jsonPath);
  const rows = parseCsv(await fs.readFile(csvPath, 'utf8'));
  const byId = new Map(rawEntries.map(e => [e.id, e]));

  const updates: CmsUpdatePayload[] = [];
  for (const r of rows) {
    const entry = byId.get(rowId(r));
    if (!entry) continue;
    const newAlt = r.new_alt ?? '';
    const compressed = r.compressed_url || undefined;
    const altChanged = newAlt !== entry.currentAlt;
    const urlChanged = !!compressed;
    // In 'alt' mode we push ALT changes only (before compression runs);
    // in 'url' mode we push compressed URLs only (after compression) and
    // piggyback the current ALT so Webflow's required `url+alt` pair is
    // preserved on Image fields. 'both' is the pre-split default.
    const shouldPush =
      mode === 'alt' ? altChanged :
      mode === 'url' ? urlChanged :
      altChanged || urlChanged;
    if (!shouldPush) continue;
    // Defensive: never clobber an existing ALT with an empty string just
    // because the user hasn't generated one yet. Only persist newAlt if it
    // actually has content OR if it intentionally replaces the current one.
    const effectiveAlt = newAlt !== '' ? newAlt : entry.currentAlt;
    updates.push({
      collectionId: entry.collectionId,
      itemId: entry.itemId,
      fieldSlug: entry.fieldSlug,
      fieldType: entry.fieldType,
      newAlt: effectiveAlt,
      newUrl: mode === 'alt' ? undefined : compressed,
      imageIndex: entry.imageIndex,
      rawFieldValue: entry.rawFieldValue,
    });
  }

  if (updates.length === 0) {
    log('Nothing to update.');
    return;
  }

  log(`${updates.length} change(s) to push.`);
  emit({
    step: 'import',
    level: 'info',
    message: `${updates.length} change(s) to push`,
    total: updates.length,
    current: 0,
  });
  if (opts.dryRun) {
    for (const u of updates.slice(0, 20)) {
      log(
        `  ${u.collectionId.slice(-6)}/${u.itemId.slice(-6)} ${u.fieldSlug}[${u.imageIndex}] alt="${u.newAlt.slice(0, 40)}"${u.newUrl ? ' +newUrl' : ''}`
      );
    }
    if (updates.length > 20) log(`  …and ${updates.length - 20} more`);
    return;
  }

  const grouped = groupUpdatesByItem(updates);
  const byCollection = new Map<string, Array<{ id: string; fieldData: Record<string, unknown> }>>();
  for (const entry of grouped.values()) {
    const items = byCollection.get(entry.collectionId) || [];
    items.push({ id: entry.itemId, fieldData: entry.fieldData });
    byCollection.set(entry.collectionId, items);
  }

  let updated = 0, failed = 0;
  for (const [collectionId, items] of byCollection) {
    const hasRt = updates.some(u => u.collectionId === collectionId && u.fieldType === 'RichText');
    const batchSize = hasRt ? 1 : 5;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const res = await rateLimited(() => patchItems(collectionId, token, batch));
      if (res.ok) {
        updated += batch.length;
        log(`  ✓ ${collectionId.slice(-6)} ${updated}/${items.length}`);
        emit({
          step: 'import',
          level: 'success',
          message: `${collectionId.slice(-6)} · PATCH ${batch.length}`,
          current: updated,
          total: updates.length,
        });
      } else {
        failed += batch.length;
        log(`  ✗ ${collectionId.slice(-6)} failed: ${res.text.slice(0, 200)}`);
        emit({
          step: 'import',
          level: 'error',
          message: `${collectionId.slice(-6)} · PATCH failed`,
          detail: res.text.slice(0, 200),
          current: updated,
          total: updates.length,
        });
      }
    }
  }
  log(`\n${updated} updated, ${failed} failed.`);
  emit({
    step: 'import',
    level: failed > 0 ? 'warn' : 'success',
    message: `Import complete · ${updated} updated · ${failed} failed`,
    current: updates.length,
    total: updates.length,
  });
}

async function publishCmd(csvPath: string, opts: { token?: string }) {
  const token = requireToken(opts);
  const jsonPath = csvPath.replace(/\.csv$/, '') + '.raw.json';
  const rawEntries = await readJsonFile<CmsImageEntry[]>(jsonPath);
  const rows = parseCsv(await fs.readFile(csvPath, 'utf8'));
  const byId = new Map(rawEntries.map(e => [e.id, e]));

  const byCollection = new Map<string, Set<string>>();
  for (const r of rows) {
    const entry = byId.get(rowId(r));
    if (!entry) continue;
    const newAlt = r.new_alt ?? '';
    const changed = newAlt !== entry.currentAlt || !!r.compressed_url;
    if (!changed) continue;
    const set = byCollection.get(r.collection_id) || new Set<string>();
    set.add(r.item_id);
    byCollection.set(r.collection_id, set);
  }

  if (byCollection.size === 0) {
    log('No changed items to publish.');
    return;
  }

  for (const [collectionId, ids] of byCollection) {
    const idList = Array.from(ids);
    log(`Publishing ${idList.length} item(s) in ${collectionId.slice(-6)}…`);
    emit({
      step: 'publish',
      level: 'info',
      message: `Publishing ${idList.length} item(s) in ${collectionId.slice(-6)}`,
      total: idList.length,
      current: 0,
    });
    for (let i = 0; i < idList.length; i += 100) {
      const slice = idList.slice(i, i + 100);
      const res = await rateLimited(() => publishItemsApi(collectionId, token, slice));
      if (res.ok) {
        log(`  ✓ published ${slice.length}`);
        emit({
          step: 'publish',
          level: 'success',
          message: `${collectionId.slice(-6)} · published ${slice.length}`,
          current: Math.min(i + slice.length, idList.length),
          total: idList.length,
        });
      } else {
        log(`  ✗ ${res.text.slice(0, 200)}`);
        emit({
          step: 'publish',
          level: 'error',
          message: `${collectionId.slice(-6)} · publish failed`,
          detail: res.text.slice(0, 200),
          current: Math.min(i + slice.length, idList.length),
          total: idList.length,
        });
      }
    }
  }
}

// ─── cleanup ────────────────────────────────────────────────────────────────

/**
 * Webflow-hosted asset URLs embed the asset ID before an underscore, e.g.
 *   https://cdn.prod.website-files.com/<siteId>/<assetId>_<filename>
 * Return the 24-char hex asset ID, or null for externally-hosted images.
 */
export function extractWebflowAssetId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/webflow|website-files|uploads-ssl\.webflow/.test(u.hostname)) return null;
    const last = (u.pathname.split('/').pop() || '').split('?')[0];
    const m = last.match(/^([a-f0-9]{24})_/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function cleanupCmd(
  csvPath: string,
  opts: { token?: string; yes?: boolean; concurrency: string }
) {
  const token = requireToken(opts);
  const rows = parseCsv(await fs.readFile(csvPath, 'utf8'));

  // Candidates: rows where we uploaded a compressed replacement AND the
  // original was a Webflow-hosted asset (external URLs obviously aren't ours
  // to delete). Dedup — the same asset often appears across many CMS items.
  const seen = new Map<string, { url: string; itemCount: number }>();
  for (const r of rows) {
    if (!r.compressed_url) continue;
    const origId = extractWebflowAssetId(r.image_url);
    if (!origId) continue;
    // Guard: don't delete the asset we just uploaded.
    const newId = extractWebflowAssetId(r.compressed_url);
    if (newId && newId === origId) continue;
    const existing = seen.get(origId);
    if (existing) existing.itemCount++;
    else seen.set(origId, { url: r.image_url, itemCount: 1 });
  }

  if (seen.size === 0) {
    log('No orphaned Webflow assets to clean up.');
    log('(cleanup only runs against rows that have a compressed_url in the CSV.)');
    return;
  }

  log(`${seen.size} original Webflow asset(s) were replaced by compressed versions.`);
  log('');
  log('⚠  These assets may still be referenced elsewhere on your site');
  log('   (other collections, static pages, templates). The Webflow API');
  log('   does NOT report back-references — deleting an asset that is still');
  log('   used will break the page/item that referenced it.');
  log('');
  log('Recommended: open the Webflow Assets panel, sort by date, and delete');
  log('manually. Or pass --yes to proceed with bulk delete (you own the risk).');
  log('');

  // Always dry-run first
  const preview = [...seen.entries()].slice(0, 10);
  for (const [id, info] of preview) {
    const shortUrl = info.url.split('/').pop()?.slice(0, 60) ?? id;
    log(`  ${id}  · ${info.itemCount} CMS row(s) · ${shortUrl}`);
  }
  if (seen.size > preview.length) log(`  …and ${seen.size - preview.length} more`);

  if (!opts.yes) {
    log('');
    log(`→ dry run. Re-run with --yes to delete ${seen.size} asset(s).`);
    return;
  }

  log('');
  log(`Deleting ${seen.size} asset(s)…`);
  emit({
    step: 'done',
    level: 'info',
    message: `Cleanup: deleting ${seen.size} original asset(s)`,
    total: seen.size,
    current: 0,
  });

  const ids = [...seen.keys()];
  const concurrency = Math.max(1, Math.min(4, parseInt(opts.concurrency, 10) || 2));
  let done = 0, ok = 0, notFound = 0, failed = 0;
  let cursor = 0;
  async function worker() {
    for (;;) {
      const idx = cursor++;
      if (idx >= ids.length) return;
      const id = ids[idx];
      const res = await deleteAsset(id, token);
      done++;
      if (res.ok || res.status === 204) {
        ok++;
        process.stdout.write(`  ✓ ${id} (${done}/${ids.length})\n`);
      } else if (res.status === 404) {
        notFound++;
        process.stdout.write(`  · ${id} already gone (${done}/${ids.length})\n`);
      } else {
        failed++;
        process.stdout.write(`  ✗ ${id} → ${res.status} ${res.text.slice(0, 120)}\n`);
      }
      // gentle pacing — Webflow rate-limits assets around 60 req/min
      await sleep(250);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  log('');
  log(`Cleanup complete: ${ok} deleted, ${notFound} already gone, ${failed} failed.`);
  emit({
    step: 'done',
    level: failed > 0 ? 'warn' : 'success',
    message: `Cleanup complete · ${ok} deleted · ${notFound} already gone · ${failed} failed`,
    current: seen.size,
    total: seen.size,
  });
}

async function runCmd(opts: {
  site?: string;
  token?: string;
  collections?: string;
  fields?: string;
  ollamaHost?: string;
  model?: string;
  siteName?: string;
  ai?: boolean;
  compress?: boolean;
  publish?: boolean;
  missingOnly?: boolean;
  out: string;
  maxCompress: string;
}) {
  const site = requireSite(opts);
  emit({
    step: 'connect',
    level: 'success',
    message: `CLI connected · site ${site.slice(-6)}`,
    detail: `steps: export${opts.ai ? ' → generate' : ''}${opts.compress ? ' → compress' : ''} → import${opts.publish ? ' → publish' : ''}`,
  });

  try {
    log('═══ step 1: export ═══');
    await exportCmd({
      site,
      token: opts.token,
      collections: opts.collections,
      fields: opts.fields,
      out: opts.out,
      missingOnly: opts.missingOnly,
    });

    if (opts.ai) {
      log('\n═══ step 2: generate ═══');
      await generateCmd(opts.out, {
        ollamaHost: opts.ollamaHost,
        model: opts.model,
        siteName: opts.siteName,
      });

      // Commit generated ALT text to Webflow BEFORE compression. Compression
      // can take a long time; if the user Ctrl+Cs during it, we don't want
      // the ALT work to be stranded in the local CSV.
      if (opts.compress) {
        log('\n═══ step 2b: import ALT (safe-point) ═══');
        log('   → pushing generated ALT to Webflow before compression starts');
        log('   → after this line, ALT work is durable — Ctrl+C is safe');
        await importCmd(opts.out, { token: opts.token, mode: 'alt' });
      }
    }

    if (opts.compress) {
      log('\n═══ step 3: compress ═══');
      await compressCmd(opts.out, {
        site,
        token: opts.token,
        max: opts.maxCompress,
        minSavings: '2',
      });
    }

    log('\n═══ step 4: import ═══');
    // If we already imported ALT above, only push URL changes now.
    const finalMode: ImportMode = opts.ai && opts.compress ? 'url' : 'both';
    await importCmd(opts.out, { token: opts.token, mode: finalMode });

    if (opts.publish) {
      log('\n═══ step 5: publish ═══');
      await publishCmd(opts.out, { token: opts.token });
    }

    // Post-run hint: if we compressed anything, the originals are now
    // orphaned in the Assets library. Don't auto-delete (they may be used
    // elsewhere on the site) — point the user at the opt-in cleanup.
    if (opts.compress) {
      const postRows = parseCsv(await fs.readFile(opts.out, 'utf8'));
      const candidates = postRows.filter(r => r.compressed_url && extractWebflowAssetId(r.image_url)).length;
      if (candidates > 0) {
        log('');
        log(`ⓘ  ${candidates} original Webflow asset(s) were replaced by compressed versions`);
        log(`   and now sit unused in your Assets library. Review and (optionally) delete:`);
        log(`     cms-alt cleanup ${opts.out} --token <token>            # dry run`);
        log(`     cms-alt cleanup ${opts.out} --token <token> --yes      # actually delete`);
        log(`   ⚠  Deletion is irreversible and assets may be referenced on static pages.`);
      }
    }

    emit({ step: 'done', level: 'success', message: 'Pipeline complete' });
  } catch (err) {
    emit({
      step: 'abort',
      level: 'error',
      message: 'Pipeline aborted',
      detail: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    await flush();
  }
}

// ─── wire commander ─────────────────────────────────────────────────────────

const program = new Command();
program
  .name('cms-alt')
  .description('Webflow CMS ALT text + lossless compression CLI')
  .version('1.0.0');

// If the web UI provisioned a run (via --run-id/--run-secret/--progress-url
// on the invoked subcommand), wire the reporter before the subcommand runs.
// Applied to every command so any flow can stream live events.
program.hook('preAction', (_thisCommand, actionCommand) => {
  const opts = actionCommand.opts() as { runId?: string; runSecret?: string; progressUrl?: string };
  if (opts.runId && opts.runSecret && opts.progressUrl) {
    configureReporter({ runId: opts.runId, secret: opts.runSecret, url: opts.progressUrl });
    try {
      console.log(`▸ live progress: streaming to ${new URL(opts.progressUrl).origin} (run ${opts.runId.slice(0, 8)})`);
    } catch {
      console.log(`▸ live progress: streaming (run ${opts.runId.slice(0, 8)})`);
    }
  }
});

// Silence unused import warning — isReporterActive is exported for future use.
void isReporterActive;

program
  .command('scan')
  .description('list CMS collections with image/richtext field counts')
  .option('-s, --site <siteId>', 'Webflow site ID (or set WEBFLOW_SITE_ID)')
  .option('-t, --token <token>', 'Webflow API token (or set WEBFLOW_TOKEN)')
  .action(scan);

program
  .command('export')
  .description('export all image entries for a site (or selected collections) to CSV')
  .option('-s, --site <siteId>', 'Webflow site ID (or set WEBFLOW_SITE_ID)')
  .option('-t, --token <token>', 'Webflow API token')
  .option('-c, --collections <ids>', 'comma-separated collection IDs (default: all)')
  .option('-f, --fields <slugs>', 'comma-separated field slugs to include (default: all image/richtext fields)')
  .option('-o, --out <file>', 'output CSV path', 'cms-alt.csv')
  .option('--missing-only', 'only include rows with missing ALT')
  .action(exportCmd);

program
  .command('generate')
  .description('fill empty new_alt cells using local Ollama (Gemma 3 4B by default)')
  .argument('<csv>', 'CSV file to update in-place')
  .option('--ollama-host <url>', 'Ollama base URL (default http://localhost:11434)')
  .option('--model <name>', 'Ollama model tag (default gemma3:4b)')
  .option('--site-name <name>', 'site name for prompt context')
  .option('--overwrite', 'regenerate even when new_alt already has a value')
  .action(generateCmd);

program
  .command('compress')
  .description('re-encode each image to lossless WebP and upload to Webflow Assets')
  .argument('<csv>', 'CSV file to update in-place')
  .requiredOption('-s, --site <siteId>', 'Webflow site ID (asset library target)')
  .option('-t, --token <token>', 'Webflow API token')
  .option('--max <n>', 'max images to process this run', '0')
  .option('--min-savings <pct>', 'skip upload if savings < this percent', '2')
  .action(compressCmd);

program
  .command('import')
  .description('push CSV changes back to Webflow')
  .argument('<csv>', 'CSV file (companion .raw.json must exist)')
  .option('-t, --token <token>', 'Webflow API token')
  .option('--dry-run', 'log changes without calling the API')
  .option('--mode <mode>', 'what to push: alt | url | both', 'both')
  .action(importCmd);

program
  .command('publish')
  .description('publish items that have changes in the CSV')
  .argument('<csv>', 'CSV file')
  .option('-t, --token <token>', 'Webflow API token')
  .action(publishCmd);

program
  .command('cleanup')
  .description('delete the original Webflow assets that were replaced by compressed versions (reads CSV)')
  .argument('<csv>', 'CSV file from a prior run/compress')
  .option('-t, --token <token>', 'Webflow API token')
  .option('-y, --yes', 'actually delete (default is dry-run)')
  .option('--concurrency <n>', 'parallel delete workers (max 4)', '2')
  .action(cleanupCmd);

program
  .command('run')
  .description('full pipeline: export → generate → compress → import → publish')
  .option('-s, --site <siteId>', 'Webflow site ID (or set WEBFLOW_SITE_ID)')
  .option('-t, --token <token>', 'Webflow API token')
  .option('-c, --collections <ids>', 'comma-separated collection IDs (default: all)')
  .option('-f, --fields <slugs>', 'comma-separated field slugs to include (default: all image/richtext fields)')
  .option('--ollama-host <url>', 'Ollama base URL (default http://localhost:11434)')
  .option('--model <name>', 'Ollama model tag (default gemma3:4b)')
  .option('--site-name <name>', 'site name for prompt context')
  .option('--ai', 'run local Gemma ALT generation for empty rows')
  .option('--compress', 'run lossless WebP compression + Webflow Assets upload')
  .option('--publish', 'publish changed items after import')
  .option('--missing-only', 'only process rows with missing ALT')
  .option('--out <file>', 'CSV path', `cms-alt-${Date.now()}.csv`)
  .option('--max-compress <n>', 'cap compression to N images', '0')
  .option('--run-id <id>', 'live-progress run ID (from the web UI)')
  .option('--run-secret <secret>', 'live-progress auth secret')
  .option('--progress-url <url>', 'live-progress POST endpoint')
  .action(runCmd);

program.parseAsync(process.argv).catch(err => {
  console.error('\n✗', err instanceof Error ? err.message : err);
  process.exit(1);
});
