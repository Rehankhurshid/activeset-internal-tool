#!/usr/bin/env node
/**
 * @activeset/schema-gen
 *
 * Generate Schema.org JSON-LD recommendations for a Webflow site's static
 * pages using a local Ollama model. Output is a portable JSON file you can
 * upload via the dashboard's "Import schema analyses" button.
 *
 * Commands:
 *   list      — list discovered static pages
 *   generate  — scrape, analyze, write JSON file
 *
 * Auth:
 *   --token <Webflow API token> or env WEBFLOW_API_TOKEN (.env or .env.local)
 *
 * Ollama:
 *   ollama serve
 *   ollama pull gemma4:e4b  (or gemma3:4b for a smaller/faster model)
 */

import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { fetchAllStaticPages, buildLiveUrl } from './webflow';
import { scrapePageSignals } from './scrape';
import { computeContentHash } from './hash';
import { runOllama } from './ollama';
import { configureReporter, emit, flush } from './progress';
import {
  banner,
  recap,
  logSuccess,
  logError,
  logWarn,
  logInfo,
  spinner,
  summary,
  c,
  gradient,
} from './ui';
import type { SchemaExportEntry, SchemaExportFile } from './types';

const PKG_VERSION = '0.3.0';

dotenv.config({ path: '.env.local' });
dotenv.config();

function requireEnv(opts: Record<string, string | undefined>, key: string, envName: string): string {
  const v = opts[key] || process.env[envName];
  if (!v) {
    logError(`Missing --${key}`, `or set ${envName} in .env / .env.local`);
    process.exit(1);
  }
  return v;
}

const program = new Command();

program
  .name('schema-gen')
  .description('Generate Schema.org JSON-LD recommendations for Webflow static pages using local Ollama')
  .version(PKG_VERSION);

program
  .command('list')
  .description('List discovered static pages for a site')
  .requiredOption('--site <id>', 'Webflow site id')
  .option('--token <t>', 'Webflow API token (or env WEBFLOW_API_TOKEN)')
  .action(async (opts: { site: string; token?: string }) => {
    const token = requireEnv(opts, 'token', 'WEBFLOW_API_TOKEN');
    process.stdout.write(banner(PKG_VERSION));
    const sp = spinner(`Fetching pages for site ${c.cyan(opts.site)}…`);
    const pages = await fetchAllStaticPages(opts.site, token);
    sp.stop();
    logSuccess(
      `Discovered ${pages.length} published static page${pages.length === 1 ? '' : 's'}`
    );
    process.stdout.write('\n');
    for (const p of pages) {
      const route = p.publishedPath || '/' + p.slug;
      process.stdout.write(
        `  ${c.dim(p.id)}  ${c.cyan(route.padEnd(32))}  ${c.gray('·')}  ${p.title}\n`
      );
    }
    process.stdout.write('\n');
  });

program
  .command('generate')
  .description('Scrape + analyze + write JSON file (no network upload)')
  .requiredOption('--site <id>', 'Webflow site id')
  .requiredOption('--domain <d>', 'Custom live domain (e.g. www.example.com) — no .webflow.io')
  .option('--token <t>', 'Webflow API token (or env WEBFLOW_API_TOKEN)')
  .option('--out <file>', 'Output JSON path', 'schema-output.json')
  .option('--only <slugs>', 'Comma-separated slugs or paths to include')
  .option('--model <m>', 'Ollama model', process.env.OLLAMA_MODEL || 'gemma4:e4b')
  .option('--ollama-host <url>', 'Ollama base URL', process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434')
  .option('--concurrency <n>', 'Pages analyzed in parallel (single-GPU: keep low)', '1')
  .option('--site-name <name>', 'Human-readable site label (for progress UI)')
  .option('--run-id <id>', 'live-progress run ID (from the dashboard)')
  .option('--run-secret <secret>', 'live-progress auth secret')
  .option('--progress-url <url>', 'live-progress POST endpoint')
  .action(async (opts: {
    site: string;
    domain: string;
    token?: string;
    out: string;
    only?: string;
    model: string;
    ollamaHost: string;
    concurrency: string;
    siteName?: string;
    runId?: string;
    runSecret?: string;
    progressUrl?: string;
  }) => {
    const token = requireEnv(opts, 'token', 'WEBFLOW_API_TOKEN');
    const tStart = Date.now();

    process.stdout.write(banner(PKG_VERSION));

    // Wire optional backchannel so the dashboard can render a live terminal.
    if (opts.runId && opts.runSecret && opts.progressUrl) {
      configureReporter({
        runId: opts.runId,
        secret: opts.runSecret,
        url: opts.progressUrl,
      });
      emit({
        step: 'connect',
        level: 'success',
        message: `CLI attached to dashboard run ${opts.runId.slice(0, 8)}`,
      });
      logInfo(
        `Streaming progress to dashboard · run ${c.cyan(opts.runId.slice(0, 8))}`
      );
      process.stdout.write('\n');
    }

    const concurrencyNum = Math.max(1, parseInt(opts.concurrency, 10) || 1);
    process.stdout.write(
      recap([
        ['site', `${c.cyan(opts.site)}${opts.siteName ? `  ${c.dim('· ' + opts.siteName)}` : ''}`],
        ['domain', c.cyan(opts.domain)],
        ['model', `${c.cyan(opts.model)}  ${c.dim('@ ' + opts.ollamaHost)}`],
        ['concurrency', `${concurrencyNum}×`],
        ['output', c.cyan(opts.out)],
      ]) + '\n\n'
    );

    const sp1 = spinner(`Fetching pages for site ${c.cyan(opts.site)}…`);
    emit({ step: 'fetch', message: `Fetching pages for site ${opts.site}` });
    let targets = await fetchAllStaticPages(opts.site, token);
    sp1.stop();

    if (opts.only) {
      const filter = new Set(opts.only.split(',').map((s) => s.trim()).filter(Boolean));
      const before = targets.length;
      targets = targets.filter((p) => filter.has(p.slug) || filter.has(p.publishedPath ?? ''));
      logInfo(
        `--only filter: ${c.cyan(opts.only)}  ${c.dim(`(${targets.length}/${before} pages)`)}`
      );
    }

    if (targets.length === 0) {
      logWarn('No static pages to process.');
      emit({ step: 'done', level: 'warn', message: 'No static pages to process' });
      await flush();
      return;
    }

    logSuccess(
      `Discovered ${targets.length} static page${targets.length === 1 ? '' : 's'}`
    );
    emit({
      step: 'fetch',
      level: 'success',
      message: `Discovered ${targets.length} static page${targets.length === 1 ? '' : 's'}`,
      total: targets.length,
    });
    process.stdout.write('\n');
    process.stdout.write(
      `  ${c.dim('─'.repeat(8))} ${gradient('analyzing')} ${c.dim('─'.repeat(8))}\n\n`
    );

    const concurrency = concurrencyNum;
    const entries: SchemaExportEntry[] = [];
    let processed = 0;
    let failed = 0;

    // Single-worker mode gets a live spinner that updates as each stage
    // starts; multi-worker mode just logs colored lines per completion
    // (a single spinner would be ambiguous across parallel pages).
    const singleWorker = concurrency === 1;

    const queue = [...targets];
    async function worker(): Promise<void> {
      while (queue.length) {
        const page = queue.shift();
        if (!page) return;
        const url = buildLiveUrl(opts.domain, page);
        const index = ++processed;
        const progressTag = c.dim(`[${index}/${targets.length}]`);
        const pageLabel = `${progressTag} ${c.bold(page.title)}`;

        const sp = singleWorker
          ? spinner(`${pageLabel}  ${c.dim('scraping')}  ${c.gray(url)}`)
          : null;

        try {
          const tScrape = Date.now();
          const signals = await scrapePageSignals(url);
          const contentHash = computeContentHash(signals);
          emit({
            step: 'scrape',
            message: `Scraped ${page.title}`,
            detail: url,
            current: index,
            total: targets.length,
            durationMs: Date.now() - tScrape,
          });

          sp?.update(
            `${pageLabel}  ${c.dim('analyzing via')} ${c.cyan(opts.model)}`
          );

          const tAnalyze = Date.now();
          const result = await runOllama(signals, {
            baseUrl: opts.ollamaHost,
            model: opts.model,
          });

          entries.push({
            pageId: page.id,
            pageTitle: page.title,
            url,
            contentHash,
            result,
          });

          const totalMs = Date.now() - tScrape;
          sp?.stop();
          logSuccess(
            `${progressTag} ${page.title}`,
            `${c.magenta(result.pageType)} · ${result.recommended.length} rec${result.recommended.length === 1 ? '' : 's'}`,
            totalMs
          );
          emit({
            step: 'analyze',
            level: 'success',
            message: `${page.title} → ${result.recommended.length} rec(s) · ${result.pageType}`,
            current: index,
            total: targets.length,
            durationMs: Date.now() - tAnalyze,
          });
        } catch (err) {
          failed++;
          sp?.stop();
          const msg = err instanceof Error ? err.message : String(err);
          logError(`${progressTag} ${page.title}`, msg);
          emit({
            step: 'analyze',
            level: 'error',
            message: `${page.title} failed`,
            detail: msg,
            current: index,
            total: targets.length,
          });
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, worker));

    const file: SchemaExportFile = {
      version: 1,
      generatedAt: new Date().toISOString(),
      model: opts.model,
      baseUrl: opts.ollamaHost,
      siteId: opts.site,
      domain: opts.domain,
      entries,
    };

    const outPath = path.resolve(process.cwd(), opts.out);
    await fs.writeFile(outPath, JSON.stringify(file, null, 2), 'utf8');
    emit({
      step: 'write',
      level: 'success',
      message: `Wrote ${entries.length} result(s) to ${opts.out}`,
      detail: outPath,
    });

    process.stdout.write(
      summary({
        wrote: entries.length,
        failed,
        outPath,
        elapsedMs: Date.now() - tStart,
      })
    );
    emit({
      step: 'done',
      level: failed > 0 ? 'warn' : 'success',
      message: `Complete · ${entries.length} succeeded${failed > 0 ? ` · ${failed} failed` : ''}`,
    });
    await flush();
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
