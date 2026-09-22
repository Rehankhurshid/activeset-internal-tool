#!/usr/bin/env tsx
/**
 * Local alt-text classifier. Runs entirely on this machine against Ollama.
 *
 *   npm run alt doctor                        check the setup
 *   npm run alt page https://site.com/about   one page's undescribed images
 *   npm run alt image <url|file> [...]        one-off images
 *   npm run alt site https://site.com         every page in the sitemap
 *   npm run alt project <projectId>           the open findings on a project,
 *                                             written back for the Audit tab
 *
 * Nothing leaves the machine except the page fetches. No API key, no cloud
 * model, no image upload.
 */

import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';
import * as cheerio from 'cheerio';
import { imageFingerprint } from '@/modules/site-monitoring/domain/audit-findings';
import {
  ALT_KINDS,
  CACHE_DIR,
  checkOllama,
  clearCache,
  extractImageContexts,
  fetchPage,
  generateAltTextBatch,
  resolveOllama,
  type AltSuggestion,
  type ExtractedImage,
  type ImageContext,
} from '@/lib/alt-text';

// `.env.local` wins: Vercel stores some keys as Secrets and hands them
// back as the literal "[SECRET]", so a pulled file must never clobber a
// working local value. `.env.vercel-production` carries what only exists in
// production, such as the Firebase service account.
for (const file of ['.env.local', '.env.vercel-production', '.env']) {
  dotenv.config({ path: file, quiet: true });
}

// ─── terminal dressing ──────────────────────────────────────────────────────

const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string) => (value: string) => (useColour ? `[${code}m${value}[0m` : value);
const dim = paint('2');
const bold = paint('1');
const red = paint('31');
const green = paint('32');
const yellow = paint('33');
const blue = paint('36');
const magenta = paint('35');

const KIND_COLOUR: Record<string, (v: string) => string> = {
  decorative: dim,
  informative: green,
  functional: blue,
  logo: magenta,
  text_image: blue,
  portrait: yellow,
  product: green,
  chart: yellow,
  screenshot: blue,
  icon: dim,
};

function shortUrl(value: string, max = 60): string {
  try {
    const url = new URL(value);
    const label = `${url.hostname}${url.pathname}`;
    return label.length > max ? `…${label.slice(-(max - 1))}` : label;
  } catch {
    return value.length > max ? `…${value.slice(-(max - 1))}` : value;
  }
}

function fileName(value: string): string {
  try {
    return decodeURIComponent(new URL(value, 'https://x.invalid').pathname.split('/').pop() || value).replace(
      /^[0-9a-f]{24}_/i,
      '',
    );
  } catch {
    return value;
  }
}

function printSuggestion(suggestion: AltSuggestion, index: number, total: number): void {
  const colour = KIND_COLOUR[suggestion.kind] ?? ((v: string) => v);
  const flag = suggestion.needsReview ? yellow(' ● review') : suggestion.cached ? dim(' cached') : '';
  const timing = suggestion.cached ? '' : dim(` ${(suggestion.durationMs / 1000).toFixed(1)}s`);

  console.log(
    `${dim(`[${String(index).padStart(String(total).length)}/${total}]`)} ${bold(fileName(suggestion.src))}` +
      `  ${colour(suggestion.kind)}${flag}${timing}`,
  );

  if (suggestion.kind === 'decorative') {
    console.log(`        ${dim('alt=""')} ${dim(`— ${suggestion.notes[0] ?? 'decorative'}`)}`);
  } else {
    console.log(`        ${suggestion.alt || dim('(none)')}`);
  }
  for (const note of suggestion.notes.slice(suggestion.kind === 'decorative' ? 1 : 0)) {
    console.log(`        ${dim(`↳ ${note}`)}`);
  }
  if (suggestion.longDescription) {
    console.log(`        ${dim(`long: ${suggestion.longDescription.slice(0, 160)}`)}`);
  }
}

function printSummary(suggestions: AltSuggestion[], failures: { error: string }[], elapsedMs: number): void {
  const byKind = new Map<string, number>();
  for (const s of suggestions) byKind.set(s.kind, (byKind.get(s.kind) ?? 0) + 1);
  const review = suggestions.filter((s) => s.needsReview).length;
  const cached = suggestions.filter((s) => s.cached).length;
  const fresh = suggestions.length - cached;

  console.log();
  console.log(bold(`${suggestions.length} images`) + dim(` in ${(elapsedMs / 1000).toFixed(1)}s`));
  const spread = [...byKind.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => `${(KIND_COLOUR[kind] ?? ((v: string) => v))(kind)} ${count}`)
    .join(dim(' · '));
  if (spread) console.log(`  ${spread}`);
  if (review > 0) console.log(`  ${yellow(`${review} need a human eye`)}`);
  if (cached > 0) console.log(dim(`  ${cached} from cache, ${fresh} generated`));
  if (failures.length > 0) console.log(`  ${red(`${failures.length} failed`)}`);
}

// ─── output ─────────────────────────────────────────────────────────────────

function toCsv(rows: AltSuggestion[]): string {
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['src', 'kind', 'certainty', 'alt', 'needs_review', 'notes', 'visible_text', 'long_description'];
  const lines = rows.map((r) =>
    [r.src, r.kind, r.certainty, r.alt, r.needsReview, r.notes.join('; '), r.visibleText, r.longDescription]
      .map(escape)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

function toMarkdown(rows: AltSuggestion[]): string {
  const out = ['| Image | Kind | Alt | Review |', '| --- | --- | --- | --- |'];
  for (const r of rows) {
    const alt = r.kind === 'decorative' ? '_(leave empty)_' : r.alt.replace(/\|/g, '\\|');
    out.push(`| ${fileName(r.src)} | ${r.kind} | ${alt} | ${r.needsReview ? 'yes' : ''} |`);
  }
  return out.join('\n');
}

async function emit(
  suggestions: AltSuggestion[],
  opts: { json?: boolean; csv?: string; markdown?: string; out?: string },
): Promise<void> {
  if (opts.json) console.log(JSON.stringify(suggestions, null, 2));
  if (opts.out) {
    await fs.writeFile(opts.out, JSON.stringify(suggestions, null, 2), 'utf8');
    console.log(dim(`→ ${opts.out}`));
  }
  if (opts.csv) {
    await fs.writeFile(opts.csv, toCsv(suggestions), 'utf8');
    console.log(dim(`→ ${opts.csv}`));
  }
  if (opts.markdown) {
    await fs.writeFile(opts.markdown, toMarkdown(suggestions), 'utf8');
    console.log(dim(`→ ${opts.markdown}`));
  }
}

// ─── shared run ─────────────────────────────────────────────────────────────

interface CommonOptions {
  model?: string;
  host?: string;
  concurrency?: string;
  maxDim?: string;
  consensus?: string;
  verify?: boolean;
  noCache?: boolean;
  limit?: string;
  json?: boolean;
  csv?: string;
  markdown?: string;
  out?: string;
  quiet?: boolean;
}

function engineOptions(opts: CommonOptions) {
  return {
    model: opts.model,
    host: opts.host,
    maxDim: opts.maxDim ? Number.parseInt(opts.maxDim, 10) : undefined,
    consensus: opts.consensus ? Number.parseInt(opts.consensus, 10) : undefined,
    verify: opts.verify,
    noCache: opts.noCache,
    concurrency: opts.concurrency ? Number.parseInt(opts.concurrency, 10) : 1,
  };
}

async function ensureReady(opts: CommonOptions): Promise<void> {
  const health = await checkOllama({ model: opts.model, host: opts.host });
  if (!health.ok) {
    console.error(red('Ollama is not ready.'));
    console.error(`  ${health.problem}`);
    if (health.models.length > 0) console.error(dim(`  installed: ${health.models.join(', ')}`));
    process.exit(1);
  }
}

async function run(contexts: ImageContext[], opts: CommonOptions): Promise<AltSuggestion[]> {
  const limit = opts.limit ? Number.parseInt(opts.limit, 10) : undefined;
  const targets = limit ? contexts.slice(0, limit) : contexts;

  if (targets.length === 0) {
    console.log(green('Nothing to describe — every image already has alt text.'));
    return [];
  }

  const { model } = resolveOllama({ model: opts.model, host: opts.host });
  if (!opts.quiet && !opts.json) {
    console.log(dim(`${targets.length} images · ${model}`));
    console.log();
  }

  const startedAt = Date.now();
  const { suggestions, failures } = await generateAltTextBatch(targets, {
    ...engineOptions(opts),
    onProgress: ({ done, total, suggestion, context, error }) => {
      if (opts.quiet || opts.json) return;
      if (error) {
        console.log(`${dim(`[${done}/${total}]`)} ${bold(fileName(context.src))}  ${red('failed')}`);
        console.log(`        ${red(error)}`);
        return;
      }
      if (suggestion) printSuggestion(suggestion, done, total);
    },
  });

  if (!opts.quiet && !opts.json) printSummary(suggestions, failures, Date.now() - startedAt);
  await emit(suggestions, opts);
  return suggestions;
}

function withCommonOptions(command: Command): Command {
  return command
    .option('-m, --model <name>', 'Ollama model (default qwen2.5vl:7b)')
    .option('--host <url>', 'Ollama host (default http://127.0.0.1:11434)')
    .option('-c, --concurrency <n>', 'images in flight; Ollama serialises anyway', '1')
    .option('--max-dim <px>', 'longest side sent to the model', '1024')
    .option('--consensus <n>', 'sample N times and keep the majority')
    .option('--verify', 'ask the model to check its own answer against the image')
    .option('--no-cache', 're-ask even when the answer is cached')
    .option('-l, --limit <n>', 'stop after N images')
    .option('--json', 'print JSON instead of a report')
    .option('--out <file>', 'write JSON to a file')
    .option('--csv <file>', 'write CSV to a file')
    .option('--markdown <file>', 'write a Markdown table to a file')
    .option('-q, --quiet', 'only the summary');
}

// ─── commands ───────────────────────────────────────────────────────────────

const program = new Command();
program
  .name('alt-text')
  .description('Classify images and write their alt text, locally, with Ollama')
  .version('1.0.0');

program
  .command('doctor')
  .description('Check Ollama, the model, and the cache')
  .option('-m, --model <name>', 'model to check')
  .option('--host <url>', 'Ollama host')
  .action(async (opts: { model?: string; host?: string }) => {
    const { host, model } = resolveOllama(opts);
    console.log(bold('Local alt-text setup'));
    console.log(`  host   ${host}`);
    console.log(`  model  ${model}`);

    const health = await checkOllama(opts);
    if (health.version) console.log(`  ollama ${health.version}`);
    if (health.models.length) console.log(dim(`  installed: ${health.models.join(', ')}`));

    if (health.ok) {
      console.log(green('\n  Ready.'));
      console.log(dim(`  cache: ${CACHE_DIR}`));
    } else {
      console.log(red(`\n  ${health.problem}`));
      if (!health.reachable) {
        console.log(dim('\n  Start Ollama with:  ollama serve'));
      } else if (!health.hasModel) {
        console.log(dim(`\n  Pull the model with:  ollama pull ${model}`));
        console.log(dim('  Smaller and faster:   ollama pull gemma3:4b'));
      }
      process.exitCode = 1;
    }
  });

program
  .command('cache')
  .description('Clear the on-disk cache')
  .option('--clear', 'delete every cached answer')
  .action(async (opts: { clear?: boolean }) => {
    if (!opts.clear) {
      console.log(`Cache lives at ${CACHE_DIR}`);
      console.log(dim('Pass --clear to empty it.'));
      return;
    }
    const removed = await clearCache();
    console.log(`Cleared ${removed} cached answers.`);
  });

withCommonOptions(
  program
    .command('image')
    .description('Describe one or more images by URL or local path')
    .argument('<sources...>', 'image URLs or file paths')
    .option('--context <text>', 'what the page says around the image')
    .option('--site <name>', 'site or client name, for naming a logo'),
).action(async (sources: string[], opts: CommonOptions & { context?: string; site?: string }) => {
  await ensureReady(opts);
  const contexts: ImageContext[] = sources.map((source) => ({
    src: source.startsWith('http') || source.startsWith('data:')
      ? source
      : `file://${path.resolve(source)}`,
    nearbyText: opts.context,
    siteName: opts.site,
  }));
  await run(contexts, opts);
});

withCommonOptions(
  program
    .command('page')
    .description("Describe every image on one page that has no alt text")
    .argument('<url>', 'page URL')
    .option('--site <name>', 'site or client name')
    .option('--all', 'include images that already have alt text'),
).action(async (url: string, opts: CommonOptions & { site?: string; all?: boolean }) => {
  await ensureReady(opts);
  const html = await fetchPage(url);
  const images = extractImageContexts(html, url, {
    siteName: opts.site,
    includeDescribed: opts.all,
  });
  console.log(dim(`${shortUrl(url)} — ${images.length} images without alt text`));
  await run(images, opts);
});

withCommonOptions(
  program
    .command('site')
    .description("Walk a sitemap and describe every undescribed image across the site")
    .argument('<url>', 'site URL or sitemap.xml URL')
    .option('--site <name>', 'site or client name')
    .option('--pages <n>', 'stop after N pages', '25'),
).action(async (url: string, opts: CommonOptions & { site?: string; pages?: string }) => {
  await ensureReady(opts);

  const sitemapUrl = url.endsWith('.xml') ? url : new URL('/sitemap.xml', url).toString();
  console.log(dim(`Reading ${shortUrl(sitemapUrl)}`));
  const xml = await fetchPage(sitemapUrl);
  const $ = cheerio.load(xml, { xmlMode: true });
  const pageUrls = $('url > loc')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)
    .slice(0, Number.parseInt(opts.pages || '25', 10));

  if (pageUrls.length === 0) {
    console.error(red('No page URLs in that sitemap. If it is an index, pass the child sitemap directly.'));
    process.exit(1);
  }

  // One asset can appear on hundreds of pages; describing it once is the
  // whole point, so the first page that carries it wins and the rest only
  // add to its page count.
  const byFingerprint = new Map<string, ExtractedImage & { pageCount: number }>();
  for (const pageUrl of pageUrls) {
    try {
      const html = await fetchPage(pageUrl);
      for (const image of extractImageContexts(html, pageUrl, { siteName: opts.site })) {
        const key = imageFingerprint(image.src);
        const existing = byFingerprint.get(key);
        if (existing) existing.pageCount += 1;
        else byFingerprint.set(key, { ...image, pageCount: 1 });
      }
    } catch (error) {
      console.log(`${yellow('skipped')} ${shortUrl(pageUrl)} ${dim(String(error))}`);
    }
  }

  const images = [...byFingerprint.values()].sort((a, b) => b.pageCount - a.pageCount);
  console.log(
    dim(`${pageUrls.length} pages · ${images.length} distinct images without alt text`),
  );
  await run(images, opts);
});

withCommonOptions(
  program
    .command('project')
    .description("Describe a project's open alt-text findings and save them for the Audit tab")
    .argument('<projectId>', 'Firestore project id')
    .option('--dry-run', 'generate but do not write anything back')
    .option('--pages <n>', 'stop after N pages of the project', '40'),
).action(async (projectId: string, opts: CommonOptions & { dryRun?: boolean; pages?: string }) => {
  await ensureReady(opts);
  const { loadProjectForAltText, saveAltSuggestions } = await import('@/lib/alt-suggestions-admin');

  const project = await loadProjectForAltText(projectId);
  if (!project) {
    console.error(red(`No project ${projectId}, or no admin credentials in .env.local.`));
    console.error(dim('  Pull them with:  npx vercel env pull .env.local'));
    process.exit(1);
  }

  console.log(bold(project.name));
  const pageLimit = Number.parseInt(opts.pages || '40', 10);
  const pages = project.pagesWithMissingAlt.slice(0, pageLimit);
  console.log(dim(`${project.openFindings} open alt findings across ${project.pagesWithMissingAlt.length} pages`));

  // The audit knows *which* images are missing alt; the page knows what they
  // mean. Re-reading each page is what turns a list into a description.
  const byFingerprint = new Map<string, ImageContext & { pageCount: number }>();
  for (const page of pages) {
    try {
      const html = await fetchPage(page.url);
      for (const image of extractImageContexts(html, page.url, { siteName: project.name })) {
        if (!project.wantedFingerprints.has(imageFingerprint(image.src))) continue;
        const key = imageFingerprint(image.src);
        const existing = byFingerprint.get(key);
        if (existing) existing.pageCount += 1;
        else byFingerprint.set(key, { ...image, pageCount: 1 });
      }
    } catch (error) {
      console.log(`${yellow('skipped')} ${shortUrl(page.url)} ${dim(String(error))}`);
    }
  }

  const contexts = [...byFingerprint.values()].sort((a, b) => (b.pageCount ?? 1) - (a.pageCount ?? 1));
  const suggestions = await run(contexts, opts);

  if (suggestions.length === 0) return;
  if (opts.dryRun) {
    console.log(dim('\nDry run — nothing written.'));
    return;
  }

  const written = await saveAltSuggestions(projectId, suggestions);
  console.log(green(`\nSaved ${written} suggestions to the project.`));
  console.log(dim('They appear on the Audit tab under Alt text.'));
});

program
  .command('eval')
  .description('Score the classifier against a labelled set')
  .argument('<file>', 'JSON array of { src, expectedKind, context? }')
  .option('-m, --model <name>', 'model to score')
  .option('--host <url>', 'Ollama host')
  .option('--consensus <n>', 'samples per image')
  .option('--no-cache', 'ignore cached answers')
  .action(async (file: string, opts: CommonOptions) => {
    await ensureReady(opts);
    const cases = JSON.parse(await fs.readFile(file, 'utf8')) as {
      src: string;
      expectedKind: string;
      context?: Partial<ImageContext>;
    }[];

    const { model } = resolveOllama(opts);
    console.log(bold(`Scoring ${model} on ${cases.length} cases`));
    console.log();

    const { suggestions } = await generateAltTextBatch(
      cases.map((c) => ({ src: c.src, ...c.context })),
      engineOptions(opts),
    );

    const byUrl = new Map(suggestions.map((s) => [s.src, s]));
    const confusion = new Map<string, number>();
    let correct = 0;

    for (const testCase of cases) {
      const got = byUrl.get(testCase.src);
      const hit = got?.kind === testCase.expectedKind;
      if (hit) correct += 1;
      else {
        const key = `${testCase.expectedKind} → ${got?.kind ?? 'failed'}`;
        confusion.set(key, (confusion.get(key) ?? 0) + 1);
      }
      console.log(
        `  ${hit ? green('✓') : red('✗')} ${fileName(testCase.src).padEnd(34).slice(0, 34)} ` +
          `${dim(testCase.expectedKind.padEnd(12))} ${hit ? '' : red(got?.kind ?? 'failed')}  ${dim(got?.alt ?? '')}`,
      );
    }

    const accuracy = cases.length > 0 ? (correct / cases.length) * 100 : 0;
    console.log();
    console.log(bold(`${correct}/${cases.length} correct (${accuracy.toFixed(0)}%)`));
    if (confusion.size > 0) {
      console.log(dim('  misses:'));
      for (const [key, count] of [...confusion.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(dim(`    ${key} × ${count}`));
      }
    }
  });

program.addHelpText(
  'after',
  `
Categories: ${ALT_KINDS.join(', ')}

Examples:
  npm run alt doctor
  npm run alt page https://www.activeset.co/
  npm run alt site https://usecache.com --pages 10 --markdown fixes.md
  npm run alt image ./hero.png --context "Team page, above 'Our people'"
  npm run alt project abc123 --consensus 3 --verify
`,
);

program.parseAsync(process.argv).catch((error) => {
  console.error(red(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
