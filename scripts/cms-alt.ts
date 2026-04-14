#!/usr/bin/env tsx
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
import type { CmsImageEntry, CmsUpdatePayload, CollectionField } from '@/types/webflow';
import {
  listCollections,
  getCollection,
  listItems,
  patchItems,
  publishItems as publishItemsApi,
} from '@/lib/cms/webflow-client';
import { extractAllImages } from '@/lib/cms/extract';
import { groupUpdatesByItem } from '@/lib/cms/patch';
import { CSV_COLUMNS, entriesToCsv, parseCsv } from '@/lib/cms/csv';
import { compressBuffer, downloadImage, extFromUrl, extFromContentType } from '@/lib/cms/compress';
import { uploadAssetToWebflow } from '@/lib/cms/assets';
import { generateAltForImages } from '@/lib/cms/ai-alt';

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
  const all: CmsImageEntry[] = [];
  for (const cid of collectionIds) {
    const images = await fetchAllImagesForCollection(cid, token);
    const scoped = fieldSlugs ? images.filter(i => fieldSlugs.has(i.fieldSlug)) : images;
    log(`  ${cid}: ${scoped.length} images${fieldSlugs ? ` (of ${images.length})` : ''}`);
    all.push(...scoped);
  }

  const filtered = opts.missingOnly ? all.filter(e => e.isMissingAlt) : all;
  await fs.writeFile(opts.out, entriesToCsv(filtered), 'utf8');
  const jsonPath = opts.out.replace(/\.csv$/, '') + '.raw.json';
  await fs.writeFile(jsonPath, JSON.stringify(all, null, 2), 'utf8');

  log(`\n→ Wrote ${filtered.length} row(s) to ${opts.out}`);
  log(`→ Raw field snapshot saved to ${jsonPath} (needed by 'import')`);
  if (opts.missingOnly) log(`  (filtered: ${all.length - filtered.length} rows with ALT set were skipped)`);
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

  log(`Generating ALT for ${needAlt.length} row(s) via ${model} @ ${host}…`);

  const BATCH = 25;
  for (let i = 0; i < needAlt.length; i += BATCH) {
    const slice = needAlt.slice(i, i + BATCH);
    const entries = slice.map(r => byId.get(rowId(r))!).filter(Boolean);
    const suggestions = await generateAltForImages(entries, {
      host,
      model,
      siteName: opts.siteName,
    });
    const sugMap = new Map(suggestions.map(s => [s.entryId, s.altText]));
    for (const r of slice) {
      const a = sugMap.get(rowId(r));
      if (a != null) r.new_alt = a;
    }
    log(`  ${Math.min(i + BATCH, needAlt.length)} / ${needAlt.length}`);
  }

  await writeCsv(rows, csvPath);
  log(`→ Updated ${csvPath}`);
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

  for (let i = 0; i < batch.length; i++) {
    const r = batch[i];
    const shortUrl = (r.image_url.split('/').pop() || '').slice(0, 40);
    process.stdout.write(`[${i + 1}/${batch.length}] ${shortUrl}… `);
    try {
      const { buffer, contentType } = await downloadImage(r.image_url);
      const ext = extFromUrl(r.image_url) || extFromContentType(contentType);
      const result = await compressBuffer(buffer, ext);
      totalBefore += result.originalSize;
      totalAfter += result.compressedSize;

      if (result.skipped || result.savings < minSavings) {
        process.stdout.write(`skip (${result.reason ?? `${result.savings}% < ${minSavings}%`})\n`);
        skipped++;
        continue;
      }

      const fileName = (r.image_url.split('/').pop() || `image.${ext}`).split('?')[0];
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
    } catch (err) {
      process.stdout.write(`FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
      failed++;
    }
  }

  await writeCsv(rows, csvPath);
  const savedPct = totalBefore > 0 ? Math.round(((totalBefore - totalAfter) / totalBefore) * 100) : 0;
  log(`\n${ok} compressed, ${skipped} skipped, ${failed} failed`);
  log(`Bytes: ${Math.round(totalBefore / 1024)} KB → ${Math.round(totalAfter / 1024)} KB (-${savedPct}%)`);
}

async function importCmd(csvPath: string, opts: { token?: string; dryRun?: boolean }) {
  const token = requireToken(opts);
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
    if (!altChanged && !urlChanged) continue;
    updates.push({
      collectionId: entry.collectionId,
      itemId: entry.itemId,
      fieldSlug: entry.fieldSlug,
      fieldType: entry.fieldType,
      newAlt,
      newUrl: compressed,
      imageIndex: entry.imageIndex,
      rawFieldValue: entry.rawFieldValue,
    });
  }

  if (updates.length === 0) {
    log('Nothing to update.');
    return;
  }

  log(`${updates.length} change(s) to push.`);
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
      } else {
        failed += batch.length;
        log(`  ✗ ${collectionId.slice(-6)} failed: ${res.text.slice(0, 200)}`);
      }
    }
  }
  log(`\n${updated} updated, ${failed} failed.`);
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
    for (let i = 0; i < idList.length; i += 100) {
      const slice = idList.slice(i, i + 100);
      const res = await rateLimited(() => publishItemsApi(collectionId, token, slice));
      if (res.ok) log(`  ✓ published ${slice.length}`);
      else log(`  ✗ ${res.text.slice(0, 200)}`);
    }
  }
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
  await importCmd(opts.out, { token: opts.token });

  if (opts.publish) {
    log('\n═══ step 5: publish ═══');
    await publishCmd(opts.out, { token: opts.token });
  }
}

// ─── wire commander ─────────────────────────────────────────────────────────

const program = new Command();
program
  .name('cms-alt')
  .description('Webflow CMS ALT text + lossless compression CLI')
  .version('1.0.0');

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
  .action(importCmd);

program
  .command('publish')
  .description('publish items that have changes in the CSV')
  .argument('<csv>', 'CSV file')
  .option('-t, --token <token>', 'Webflow API token')
  .action(publishCmd);

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
  .action(runCmd);

program.parseAsync(process.argv).catch(err => {
  console.error('\n✗', err instanceof Error ? err.message : err);
  process.exit(1);
});
