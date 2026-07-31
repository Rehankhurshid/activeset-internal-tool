#!/usr/bin/env tsx
/**
 * Retainer agreement CLI — create an agreement from one pasted markdown
 * document instead of filling in the web editor field by field.
 *
 * Commands:
 *   create      — parse a markdown document and write the agreement to Firestore
 *   template    — print the starter document
 *   instructions— print the AI prompt (paste into any AI with your call notes)
 *   export      — dump an existing agreement back out as markdown
 *
 * Env (.env.local):
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID   (or FIREBASE_PROJECT_ID)
 *   FIREBASE_SERVICE_ACCOUNT_KEY      (JSON or base64)
 *   CONTRACT_AUTHOR                   optional default for --author
 *   NEXT_PUBLIC_APP_URL               optional, for the printed share link
 *
 * Examples:
 *   npm run --silent contract:template > agreement.md   (--silent: no npm banner)
 *   npm run contract:create -- --file agreement.md --author "Rehan <rehan@activeset.co>"
 *   pbpaste | npm run contract:create -- --dry-run
 *   npm run contract:create -- --file agreement.md --update <contractId>
 */

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
    CONTRACT_MARKDOWN_TEMPLATE,
    CONTRACT_AI_FORMAT_INSTRUCTIONS,
    parseContractMarkdown,
    serializeContractToMarkdown,
    mergeParsedIntoContract,
    decodeHtmlEntities,
} from '@/app/modules/proposal/utils/markdownContract';
import { formatMoney, formatContractDate, computeLockInEnd } from '@/app/modules/proposal/lib/contractTemplate';
import type { Proposal } from '@/app/modules/proposal/types/Proposal';

// quiet: these commands are piped to files, so nothing but the document itself
// may reach stdout.
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const COLLECTION = 'proposals';
const SHARED_COLLECTION = 'shared_proposals';

// ─── helpers ────────────────────────────────────────────────────────────────

const c = {
    dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
    bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
    green: (s: string) => `\x1b[32m${s}\x1b[0m`,
    yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
    red: (s: string) => `\x1b[31m${s}\x1b[0m`,
};

const fail = (message: string): never => {
    console.error(c.red(`✗ ${message}`));
    process.exit(1);
};

const readStdin = async (): Promise<string> => {
    if (process.stdin.isTTY) return '';
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8');
};

const readDocument = async (file?: string): Promise<string> => {
    const md = file ? readFileSync(file, 'utf8') : await readStdin();
    if (!md.trim()) {
        fail(
            file
                ? `${file} is empty.`
                : 'No document given. Pass --file <path> or pipe the markdown in on stdin.',
        );
    }
    return md;
};

// Firestore rejects explicitly-undefined values — mirror ProposalService.
const stripUndefinedDeep = <T>(value: T): T => {
    if (Array.isArray(value)) return value.map(stripUndefinedDeep) as unknown as T;
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => [k, stripUndefinedDeep(v)]),
        ) as T;
    }
    return value;
};

const parseAuthor = (value?: string): Proposal['createdBy'] | undefined => {
    const raw = (value || process.env.CONTRACT_AUTHOR || '').trim();
    if (!raw) return undefined;
    const match = /^(.*?)\s*<([^<>]+)>\s*$/.exec(raw);
    const name = match ? match[1].trim() : '';
    const email = match ? match[2].trim() : raw;
    return {
        // Script writes aren't tied to a signed-in session; the email is the
        // identity that matters for the dashboard's "created by" column.
        uid: `script:${email}`,
        email,
        ...(name ? { displayName: name } : {}),
    };
};

const appUrl = (): string =>
    (process.env.NEXT_PUBLIC_APP_URL || 'https://app.activeset.co').replace(/\/+$/, '');

/** Human-readable confirmation of what the document actually said. */
const printSummary = (proposal: Proposal): void => {
    const contract = proposal.data.contract!;
    const lockEnd = computeLockInEnd(contract.effectiveDate, contract.lockInMonths);
    const row = (label: string, value: string) =>
        console.log(`  ${c.dim(label.padEnd(14))} ${value}`);

    console.log(c.bold('\nAgreement'));
    row('Title', proposal.title);
    row('Status', proposal.status);
    row('Client', `${contract.client.legalName || '—'}${contract.client.signatoryName ? ` · ${contract.client.signatoryName}${contract.client.signatoryTitle ? `, ${contract.client.signatoryTitle}` : ''}` : ''}`);
    row('Agency', `${contract.agency.legalName || '—'}${contract.agency.signatoryName ? ` · ${contract.agency.signatoryName}` : ''}`);
    row('Effective', formatContractDate(contract.effectiveDate));
    row('Retainer', `${formatMoney(contract.retainer.amount, contract.retainer.currency)} / ${contract.retainer.billingCycle}`);
    row('Lock-in', contract.lockInMonths
        ? `${contract.lockInMonths} months${lockEnd ? ` (until ${formatContractDate(lockEnd)})` : ''}`
        : 'none');
    row('Jurisdiction', `${contract.jurisdictionCity || '—'}, ${contract.governingLawCountry || '—'}`);
    row('Clauses', String(contract.clauses.length));
    console.log();
    contract.clauses.forEach((clause, i) => {
        const words = clause.body.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
        console.log(c.dim(`  ${String(i + 1).padStart(2)}. ${decodeHtmlEntities(clause.heading)} (${words} words)`));
    });
};

/**
 * Loaded on demand: importing firebase-admin initialises it and logs a warning
 * when credentials are missing, which would pollute `template`/`instructions`
 * output. Aborts rather than writing through the credential-less mock db.
 */
const requireDb = async () => {
    const { db, hasFirebaseAdminCredentials } = await import('@/lib/firebase-admin');
    if (!hasFirebaseAdminCredentials) {
        fail(
            'No Firebase admin credentials. Set FIREBASE_SERVICE_ACCOUNT_KEY (and\n' +
            '  NEXT_PUBLIC_FIREBASE_PROJECT_ID) in .env.local, or re-run with --dry-run.',
        );
    }
    return db;
};

// ─── commands ───────────────────────────────────────────────────────────────

const program = new Command();

program
    .name('create-contract')
    .description('Create a retainer agreement from a single pasted markdown document');

program
    .command('template', { isDefault: false })
    .description('Print the starter markdown document')
    .action(() => {
        process.stdout.write(CONTRACT_MARKDOWN_TEMPLATE);
    });

program
    .command('instructions')
    .description('Print the AI prompt to paste into ChatGPT/Claude with your notes')
    .action(() => {
        process.stdout.write(`${CONTRACT_AI_FORMAT_INSTRUCTIONS}\n`);
    });

program
    .command('export <id>')
    .description('Dump an existing agreement back out as a markdown document')
    .action(async (id: string) => {
        const adminDb = await requireDb();
        const snap = await adminDb.collection(COLLECTION).doc(id).get();
        if (!snap.exists) fail(`No document with id ${id}.`);
        const proposal = snap.data() as Proposal;
        if (!proposal.data?.contract) fail(`${id} is a proposal, not an agreement.`);
        process.stdout.write(serializeContractToMarkdown(proposal));
    });

program
    .command('create', { isDefault: true })
    .description('Parse a markdown document and write the agreement to Firestore')
    .option('-f, --file <path>', 'markdown file to read (default: stdin)')
    .option('-a, --author <name-and-email>', 'who is creating it, e.g. "Rehan <rehan@activeset.co>"')
    .option('-u, --update <id>', 'update an existing agreement instead of creating one')
    .option('-n, --dry-run', 'parse and summarise without writing to Firestore')
    .action(async (opts: { file?: string; author?: string; update?: string; dryRun?: boolean }) => {
        const md = await readDocument(opts.file);

        const { proposal: parsed, warnings, declared } = parseContractMarkdown(md);
        warnings.forEach(w => console.warn(c.yellow(`! ${w}`)));

        if (opts.dryRun) {
            printSummary(parsed);
            console.log(c.dim('\nDry run — nothing was written.'));
            return;
        }

        const adminDb = await requireDb();

        const now = new Date().toISOString();
        let record: Proposal;

        if (opts.update) {
            const snap = await adminDb.collection(COLLECTION).doc(opts.update).get();
            if (!snap.exists) fail(`No document with id ${opts.update}.`);
            const current = snap.data() as Proposal;
            if (current.isLocked) {
                fail(`${opts.update} is locked (${current.lockedReason || 'signed'}); edits are not allowed.`);
            }
            record = { ...mergeParsedIntoContract(current, parsed, declared), id: opts.update, updatedAt: now };
        } else {
            record = {
                ...parsed,
                id: randomUUID(),
                ...(parseAuthor(opts.author) ? { createdBy: parseAuthor(opts.author) } : {}),
                createdAt: now,
                updatedAt: now,
            };
        }

        const payload = stripUndefinedDeep(record);
        // Mirror ProposalService: the agency copy plus the public share copy.
        await adminDb.collection(COLLECTION).doc(record.id).set(payload, { merge: Boolean(opts.update) });
        await adminDb
            .collection(SHARED_COLLECTION)
            .doc(record.id)
            .set({ ...payload, sharedAt: now }, { merge: Boolean(opts.update) });

        printSummary(record);
        console.log(c.green(`\n✓ ${opts.update ? 'Updated' : 'Created'} ${record.id}`));
        console.log(`  ${c.dim('Share')}  ${appUrl()}/view/${record.id}`);
        console.log(`  ${c.dim('Edit')}   ${appUrl()}/modules/proposal`);
    });

program.parseAsync(process.argv).catch((error: unknown) => {
    console.error(c.red(`✗ ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
});
