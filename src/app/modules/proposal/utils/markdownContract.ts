import type {
    Proposal,
    ContractData,
    ContractClause,
    ContractParty,
    BillingCycle,
} from '../types/Proposal';
import {
    blankContractData,
    buildContractClauses,
    generateTermClauseBody,
    STANDARD_CLAUSE_HEADINGS,
} from '../lib/contractTemplate';

// ---------------------------------------------------------------------------
// Format reference
// ---------------------------------------------------------------------------
// One markdown document represents an entire retainer agreement. Everything is
// optional — anything omitted falls back to the standard template defaults, so
// the shortest useful document is a handful of preamble lines.
//
//   # Title
//   Client: / Agency: / Status:               (record-level metadata)
//   Effective: / Retainer: / Lock-in:         (commercial terms)
//   Governing Law: / Jurisdiction:
//   ## Client        Legal Name: / Address: / Signatory: / Title: / Email:
//   ## Agency        (same keys)
//   ## Clauses       ### <heading> followed by the clause body in markdown
//
// The Clauses section *overrides* the standard clause set by default: a
// "### Scope of Services" block replaces that clause's body in place, an
// unrecognised heading is appended as a new clause, and a body of "[remove]"
// drops the clause. Use "## Clauses (replace)" to discard the standard set and
// keep only what the document lists, in the listed order.
//
// Deliberately dependency-free (no lexical, no DOM) so the same parser runs in
// the browser and in the `scripts/create-contract.ts` CLI under Node.
// ---------------------------------------------------------------------------

// ─── markdown ⇄ clause HTML ─────────────────────────────────────────────────
// Clause bodies are the same small HTML subset the standard template uses:
// paragraphs, bullet/numbered lists, bold/italic, links.

const escapeHtml = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const NAMED_ENTITIES: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
    mdash: '—', ndash: '–', hellip: '…', times: '×',
    middot: '·', bull: '•', copy: '©', reg: '®',
};

/** Entity-decode stored clause HTML back to plain text (headings, summaries). */
export const decodeHtmlEntities = (s: string): string =>
    s
        .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
        .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&([a-z]+);/gi, (m: string, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m);

// Inline markdown → HTML. Runs after HTML-escaping, so any literal markup in
// the source stays literal text.
const inlineToHtml = (text: string): string =>
    escapeHtml(text)
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_]+)__/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

/**
 * Convert a markdown clause body into the HTML the contract editor stores.
 * Supports paragraphs, `- ` bullets, `1. ` numbered lists, `#### ` headings
 * and inline emphasis/links — the subset the standard clauses use.
 */
export const markdownToClauseHtml = (md: string): string => {
    const lines = (md || '').replace(/\r\n?/g, '\n').split('\n');
    const out: string[] = [];
    let paragraph: string[] = [];
    let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;

    const flushParagraph = () => {
        if (paragraph.length) out.push(`<p>${inlineToHtml(paragraph.join(' ').trim())}</p>`);
        paragraph = [];
    };
    const flushList = () => {
        if (list) out.push(`<${list.tag}>${list.items.map(i => `<li>${inlineToHtml(i)}</li>`).join('')}</${list.tag}>`);
        list = null;
    };
    const flushAll = () => { flushParagraph(); flushList(); };

    for (const raw of lines) {
        const line = raw.trim();
        const bullet = /^[-*+]\s+(.*)$/.exec(line);
        const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);

        if (!line) {
            flushAll();
        } else if (heading) {
            flushAll();
            const level = heading[1].length <= 3 ? 3 : 4;
            out.push(`<h${level}>${inlineToHtml(heading[2].trim())}</h${level}>`);
        } else if (bullet || numbered) {
            flushParagraph();
            const tag: 'ul' | 'ol' = bullet ? 'ul' : 'ol';
            const text = (bullet ?? numbered)![1].trim();
            if (list && list.tag !== tag) flushList();
            if (!list) list = { tag, items: [] };
            list.items.push(text);
        } else if (list) {
            // Continuation line of the previous list item.
            list.items[list.items.length - 1] += ` ${line}`;
        } else {
            paragraph.push(line);
        }
    }
    flushAll();
    return out.join('');
};

/**
 * Inverse of markdownToClauseHtml — turn stored clause HTML back into markdown
 * so an existing agreement can be re-edited as one document. Tolerant of the
 * attributes and wrapper spans the rich-text editor emits.
 */
export const clauseHtmlToMarkdown = (html: string): string => {
    let s = (html || '').trim();
    if (!s) return '';

    s = s
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
        .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
        .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
        .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
        .replace(/<\/?(?:span|u|s|strike|del)\b[^>]*>/gi, '');

    // Numbered lists first so their <li>s aren't claimed by the bullet pass.
    s = s.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner: string) => {
        let n = 0;
        const items = inner.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (__, item: string) => {
            n += 1;
            return `\n${n}. ${item.trim()}`;
        });
        return `\n${items.replace(/<[^>]+>/g, '').trim()}\n\n`;
    });
    s = s.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner: string) => {
        const items = inner.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (__, item: string) => `\n- ${item.trim()}`);
        return `\n${items.replace(/<[^>]+>/g, '').trim()}\n\n`;
    });

    s = s
        .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level: string, text: string) =>
            `\n\n${'#'.repeat(Math.min(6, Math.max(4, Number(level))))} ${text.trim()}\n\n`)
        .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n')
        .replace(/<[^>]+>/g, '');

    return decodeHtmlEntities(s)
        .split('\n')
        .map(l => l.trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

// ─── document scaffolding ───────────────────────────────────────────────────

/** Starter document — the shape a pasted agreement should take. */
export const CONTRACT_MARKDOWN_TEMPLATE = `# Retainer Agreement

Client: Acme Holdings PTE LTD
Agency: ActiveSet
Status: draft
Effective: 2026-08-01
Retainer: 1600 USD monthly
Lock-in: 6 months
Governing Law: India
Jurisdiction: Bangalore, Karnataka

## Client

Legal Name: Acme Holdings PTE LTD
Address:
8 Marina View, Asia Square Tower 1
#43-01, Singapore 018960
Signatory: Jane Smith <jane@acme.com>
Title: Director

## Agency

Legal Name: ActiveSet Technologies
Address: B 98, Anjuman Colony, Lower Bazar, Konka Road, Ranchi, Jharkhand, 834001, India
Signatory: John Doe <john@activeset.co>
Title: Partner, ActiveSet

## Clauses

### Scope of Services

Under the terms of this Agreement, the Consultant will provide the following
Services to the Company:

**Core Website Maintenance & Support**

- Proactive technical support and bug resolution to ensure uninterrupted website
  stability and optimal performance.
- Performance optimization and audits.

**Web Design & Motion**

- High-fidelity layouts, visual assets, and interface elements for new pages.
- Custom interactions, animations, and motion effects.
`;

/**
 * Self-contained prompt for an external AI, mirroring the proposal flow. The
 * standard clause list is interpolated from the template so the prompt can't
 * drift out of sync when clauses are added or renamed.
 */
export const CONTRACT_AI_FORMAT_INSTRUCTIONS = `# Task

You are preparing a retainer agreement for ActiveSet, a web design and
development agency. I will give you raw notes — a call transcript, an email
thread, a deal summary, or a few scribbled commercial terms.

Turn them into ONE markdown document in exactly the format specified below.
That document is parsed by software, so the structure matters as much as the
wording.

# Output rules

- Output the markdown document and nothing else. No preamble, no explanation,
  no code fences, no "Here is the agreement".
- Never invent a fact. If the notes don't say what the lock-in is, omit the
  Lock-in line entirely — a sensible default fills in. A wrong value is far
  worse than a missing one, because a missing one is obvious in review and a
  wrong one is not.
- Never write a placeholder like "TBD", "[client name]" or "XXX". Omit the
  line instead.
- Everything is optional. The shortest valid document is a title and a couple
  of preamble lines.

# Document structure

## 1. Preamble

Starts with the title as an H1, then "Key: value" lines. Include only the keys
your notes actually support.

# <Agreement title, e.g. "Acme Corp — Retainer Agreement">

Client: <client company name, as spoken about in the notes>
Agency: <agency name — use "ActiveSet" unless the notes say otherwise>
Status: <draft | sent | approved | rejected | lost — use draft unless told>
Effective: <YYYY-MM-DD — the date the agreement starts>
Retainer: <amount> <currency> <monthly | quarterly | annually | hourly>
Lock-in: <number of months, or "none">
Governing Law: <country>
Jurisdiction: <city, state>

Notes on specific keys:

- Retainer: write the amount as a plain number with no symbols or separators
  (1600, never $1,600 or 1,600 USD/mo). Currency is a 3-letter code (USD, SGD,
  EUR, GBP, INR, AUD, CAD, JPY, CHF). The three parts can be in any order, so
  "USD 1600 monthly" is equally fine. A rate-based deal ("$50/hr", "50 an
  hour") is "Retainer: 50 USD hourly" — the amount becomes the hourly rate and
  the standard Compensation and Term clauses adapt to rate wording on their
  own; do not hand-write them. If the notes give a weekly or per-day figure,
  do NOT convert it to monthly or hourly — put the figure you were given in a
  custom clause instead and omit the Retainer key.
- Effective: ISO format only. "start of August" with no year is not enough to
  guess — omit the key.
- Lock-in: "6", "6 months" and "none" are all accepted. A minimum term, a
  commitment period and a lock-in all mean the same thing here.

## 2. Parties

Two optional sections, same keys in each.

## Client

Legal Name: <registered entity name, e.g. Acme Holdings PTE LTD>
Address:
<address line 1>
<address line 2>
Signatory: <full name> <<email>>
Title: <their job title, e.g. Director>

## Agency

Legal Name: <agency legal entity>
Address: <single-line address is fine too>
Signatory: <full name> <<email>>
Title: <job title>

A bare "Address:" absorbs every following line until the next "Key:" line, so
multi-line addresses work. Keep the email inside angle brackets on the
Signatory line.

## 3. Clauses

This section is where judgement is needed, so read carefully.

Omitting the Clauses section entirely gives the full standard ActiveSet
retainer — all ${STANDARD_CLAUSE_HEADINGS.length} clauses, correctly worded. That is usually the right
answer. Only add this section when the notes actually change something.

Inside it, each clause is an H3 heading followed by its body:

## Clauses

### Scope of Services

<body in markdown>

Four behaviours, decided by the heading you use:

1. REPLACE — a heading matching a standard clause swaps that clause's wording
   in place, keeping its position. This is the common case: the notes describe
   what the retainer covers, so you write a "### Scope of Services" block.
2. ADD — any other heading is appended as a new clause at the end. Use this for
   genuinely new terms ("### Retainer Rollover", "### Response Times").
3. KEEP — a matching heading with an empty body keeps the standard wording.
   Only useful for re-ordering.
4. REMOVE — a body of exactly "[remove]" deletes a standard clause. Use this
   only when the notes explicitly say a protection is being dropped.

Heading matching ignores case, punctuation and "and" vs "&", so "scope of
services" and "Scope of Services" both hit the same clause.

The ${STANDARD_CLAUSE_HEADINGS.length} standard headings, in their default order:

${STANDARD_CLAUSE_HEADINGS.map((h, i) => `${String(i + 1).padStart(2)}. ${h.heading}`).join('\n')}

Two hard rules for clauses:

- NEVER write the "Term & Minimum Commitment" clause. It is generated from
  Effective, Retainer and Lock-in. Writing it by hand freezes the wording and
  it will silently contradict the commercial terms when they are edited later.
- Do not rewrite the legal boilerplate (indemnification, liability, governing
  law, severability, and so on) unless the notes specifically negotiated that
  clause. Lawyer-reviewed wording is better than anything you'd improvise.

Clause bodies support: paragraphs, "- " bullets, "1. " numbered lists,
**bold**, *italic*, \`code\` and [links](https://example.com). They do NOT
support tables, images, blockquotes or raw HTML — avoid them.

# Worked example

Notes: "Signed Acme Holdings (Singapore entity, 8 Marina View #43-01) for 1600
a month starting Aug 1, six month minimum. Jane Smith their director signs,
jane@acme.com. Covers bug fixes, perf work and new page builds. They asked that
unused hours don't roll over."

Correct output:

# Acme Holdings — Retainer Agreement

Client: Acme Holdings PTE LTD
Agency: ActiveSet
Status: draft
Effective: 2026-08-01
Retainer: 1600 USD monthly
Lock-in: 6 months

## Client

Legal Name: Acme Holdings PTE LTD
Address:
8 Marina View, Asia Square Tower 1
#43-01, Singapore
Signatory: Jane Smith <jane@acme.com>
Title: Director

## Clauses

### Scope of Services

Under the terms of this Agreement, the Consultant will provide the following
Services to the Company:

- Proactive technical support and bug resolution to ensure uninterrupted
  website stability.
- Performance optimization and audits.
- Development and deployment of new pages, templates and sections as needed.

### Retainer Rollover

Unused hours in any month do not roll over to the following month.

Note what the example does NOT do: it omits Governing Law and Jurisdiction
(not mentioned), omits the Agency section (nothing said about it), leaves every
other standard clause alone, and never writes the Term clause.`;

export interface ParsedContractMarkdown {
    proposal: Proposal;
    warnings: string[];
    /** Which optional field groups the document explicitly declared. */
    declared: {
        status: boolean;
        clauses: boolean;
        clientSignatory: boolean;
        agencySignatory: boolean;
    };
}

// ─── parsing helpers ────────────────────────────────────────────────────────

const CONTRACT_STATUSES: Proposal['status'][] = ['draft', 'sent', 'approved', 'rejected', 'lost'];
const BILLING_CYCLES: BillingCycle[] = ['monthly', 'quarterly', 'annually', 'hourly'];
const KNOWN_SECTIONS = ['client', 'agency', 'clauses'];

interface Section {
    heading: string;    // lowercased, parenthetical stripped
    modifier: string;   // lowercased contents of the parenthetical, e.g. "replace"
    lines: string[];
}

// Split into preamble + top-level sections. Only KNOWN_SECTIONS start a
// section; every other "## " line stays as content, and "### " and deeper
// always stay inside their parent section (clause bodies rely on this).
const splitSections = (md: string): { preamble: string[]; sections: Section[] } => {
    const preamble: string[] = [];
    const sections: Section[] = [];
    let current: Section | null = null;

    for (const line of (md || '').replace(/\r\n?/g, '\n').split('\n')) {
        const match = /^##\s+(.+?)\s*$/.exec(line);
        const isH2 = Boolean(match) && !line.startsWith('###');
        const text = isH2 ? match![1].trim() : '';
        const heading = text.replace(/\s*\(.*\)\s*$/, '').toLowerCase();

        if (isH2 && KNOWN_SECTIONS.includes(heading)) {
            current = {
                heading,
                modifier: (/\(([^)]*)\)\s*$/.exec(text)?.[1] || '').trim().toLowerCase(),
                lines: [],
            };
            sections.push(current);
        } else if (current) {
            current.lines.push(line);
        } else {
            preamble.push(line);
        }
    }
    return { preamble, sections };
};

/**
 * "Key: value" lines. A key with an empty value absorbs the following lines
 * until the next key, which is how multi-line addresses are written.
 */
const parseKeyValues = (lines: string[]): Record<string, string> => {
    const out: Record<string, string> = {};
    let openKey: string | null = null;

    for (const raw of lines) {
        const line = raw.trim();
        const match = /^([A-Za-z][A-Za-z \-]*?)\s*:\s*(.*)$/.exec(line);
        if (match) {
            openKey = match[1].trim().toLowerCase().replace(/\s+/g, ' ');
            out[openKey] = match[2].trim();
        } else if (openKey && line) {
            out[openKey] = out[openKey] ? `${out[openKey]}\n${line}` : line;
        } else if (!line) {
            openKey = null;
        }
    }
    return out;
};

// "Name <email>" → parts.
const parsePerson = (value: string): { name: string; email: string } => {
    const match = /^(.*?)\s*<([^<>]+)>\s*$/.exec(value || '');
    if (match) return { name: match[1].trim(), email: match[2].trim() };
    return (value || '').includes('@')
        ? { name: '', email: value.trim() }
        : { name: (value || '').trim(), email: '' };
};

/** "1600 USD monthly", "USD 1,600 / month", "1600" — order-independent. */
const parseRetainerLine = (
    value: string,
): { amount?: number; currency?: string; billingCycle?: BillingCycle } => {
    const out: { amount?: number; currency?: string; billingCycle?: BillingCycle } = {};
    for (const token of value.split(/[\s/,]+/).filter(Boolean)) {
        // Filler words in "per month" / "an hour" — never a currency code.
        if (/^(per|a|an|at)$/i.test(token)) continue;
        const cycle = normalizeBillingCycle(token);
        if (cycle) { out.billingCycle = cycle; continue; }
        if (/^[A-Za-z]{3}$/.test(token)) { out.currency = token.toUpperCase(); continue; }
        const numeric = parseFloat(token.replace(/[^\d.]/g, ''));
        if (!isNaN(numeric) && /\d/.test(token)) out.amount = numeric;
    }
    return out;
};

const normalizeBillingCycle = (value: string): BillingCycle | null => {
    const v = (value || '').trim().toLowerCase().replace(/^per\s+/, '');
    if (BILLING_CYCLES.includes(v as BillingCycle)) return v as BillingCycle;
    if (v === 'month' || v === 'monthy') return 'monthly';
    if (v === 'quarter') return 'quarterly';
    if (v === 'year' || v === 'yearly' || v === 'annual') return 'annually';
    if (v === 'hour' || v === 'hr' || v === 'hrs') return 'hourly';
    return null;
};

/** "6", "6 months", "none", "0" → months. */
const parseLockIn = (value: string): number => {
    const v = (value || '').trim().toLowerCase();
    if (!v || v === 'none' || v === 'no' || v === 'n/a') return 0;
    const n = parseInt(v.replace(/[^\d]/g, ''), 10);
    return isNaN(n) ? 0 : n;
};

// Headings are compared entity- and punctuation-insensitively so "Term &amp;
// Minimum Commitment", "Term & Minimum Commitment" and "term and minimum
// commitment" all resolve to the same standard clause.
const normalizeHeading = (heading: string): string =>
    decodeHtmlEntities(heading || '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const slugifyHeading = (heading: string): string =>
    decodeHtmlEntities(heading || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'clause';

interface ParsedClause {
    heading: string;
    body: string;   // markdown
}

// "### Heading" blocks inside the Clauses section.
const parseClauseBlocks = (lines: string[]): ParsedClause[] => {
    const clauses: ParsedClause[] = [];
    let current: ParsedClause | null = null;

    for (const line of lines) {
        const match = /^###\s+(.+?)\s*$/.exec(line);
        if (match && !line.startsWith('####')) {
            current = { heading: match[1].trim(), body: '' };
            clauses.push(current);
        } else if (current) {
            current.body += `${line}\n`;
        }
    }
    return clauses.map(c => ({ ...c, body: c.body.trim() }));
};

const REMOVE_MARKER = /^\[removed?\]$/i;

// Two clause bodies say the same thing if they differ only in wrapping and
// whitespace — line breaks inside a paragraph carry no meaning in markdown.
const sameProse = (a: string, b: string): boolean =>
    a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

/**
 * Merge the document's clauses onto the freshly-built standard set.
 * `replace` keeps only what the document listed, in its order.
 */
const resolveClauses = (
    contract: ContractData,
    parsed: ParsedClause[],
    mode: 'merge' | 'replace',
    warnings: string[],
): ContractClause[] => {
    const standard = buildContractClauses(contract);
    const standardByHeading = new Map(standard.map(c => [normalizeHeading(c.heading), c]));

    const toClause = (p: ParsedClause): ContractClause => {
        const match = standardByHeading.get(normalizeHeading(p.heading));
        // An empty body under a standard heading means "keep the standard
        // text" — handy for re-ordering without restating the wording.
        if (!p.body) {
            if (match) return { ...match };
            warnings.push(`Clause "${p.heading}" has no body and no standard text to fall back on.`);
            return { id: slugifyHeading(p.heading), heading: p.heading, body: '', generated: false };
        }
        // Restating a clause exactly as the standard template words it is a
        // no-op — keep the template's body (and the Term clause's `generated`
        // flag, so the editor carries on regenerating it from the commercial
        // fields). This is what makes serialize → edit → parse round-trips safe.
        if (match && sameProse(clauseHtmlToMarkdown(match.body), p.body)) return { ...match };

        return {
            id: match?.id || slugifyHeading(p.heading),
            // Headings are injected with dangerouslySetInnerHTML by the viewer,
            // so a standard heading keeps the template's entities and a custom
            // one gets escaped rather than passed through raw.
            heading: match ? match.heading : escapeHtml(p.heading),
            body: markdownToClauseHtml(p.body),
            // Hand-written wording takes manual control — including for the
            // Term clause, which the editor otherwise regenerates from the
            // commercial fields.
            generated: false,
        };
    };

    if (mode === 'replace') {
        const kept = parsed.filter(p => !REMOVE_MARKER.test(p.body.trim()));
        const seen = new Set<string>();
        return kept.map(toClause).map(c => {
            let id = c.id;
            let n = 2;
            while (seen.has(id)) id = `${c.id}-${n++}`;
            seen.add(id);
            return { ...c, id };
        });
    }

    const result = [...standard];
    for (const p of parsed) {
        const key = normalizeHeading(p.heading);
        const index = result.findIndex(c => normalizeHeading(c.heading) === key);
        if (REMOVE_MARKER.test(p.body.trim())) {
            if (index >= 0) result.splice(index, 1);
            else warnings.push(`Clause "${p.heading}" is marked [remove] but isn't in the standard set.`);
            continue;
        }
        const clause = toClause(p);
        if (index >= 0) result[index] = clause;
        else {
            let id = clause.id;
            let n = 2;
            while (result.some(c => c.id === id)) id = `${clause.id}-${n++}`;
            result.push({ ...clause, id });
        }
    }
    return result;
};

const parseParty = (lines: string[], fallback: ContractParty): ContractParty => {
    const kv = parseKeyValues(lines);
    const signatory = parsePerson(kv['signatory'] || '');
    return {
        legalName: kv['legal name'] || kv['name'] || kv['company'] || fallback.legalName,
        address: kv['address'] || fallback.address,
        signatoryName: kv['signatory name'] || signatory.name || fallback.signatoryName,
        signatoryTitle: kv['title'] || kv['signatory title'] || fallback.signatoryTitle,
        email: kv['email'] || signatory.email || fallback.email,
    };
};

const todayIso = (): string => new Date().toISOString().split('T')[0];

// ─── parse ──────────────────────────────────────────────────────────────────

/**
 * Parse a complete markdown document into a draft contract Proposal. See the
 * format reference at the top of this file. Every field is optional; anything
 * missing falls back to the standard template defaults.
 */
export const parseContractMarkdown = (md: string): ParsedContractMarkdown => {
    const warnings: string[] = [];
    const { preamble, sections } = splitSections(md);
    const declared = { status: false, clauses: false, clientSignatory: false, agencySignatory: false };

    const defaults = blankContractData();
    let title = '';
    let clientName = '';
    let agencyName = 'ActiveSet';
    let status: Proposal['status'] = 'draft';
    let effectiveDate = defaults.effectiveDate;
    let amount = defaults.retainer.amount;
    let currency = defaults.retainer.currency;
    let billingCycle = defaults.retainer.billingCycle;
    let lockInMonths = defaults.lockInMonths;
    let governingLawCountry = defaults.governingLawCountry;
    let jurisdictionCity = defaults.jurisdictionCity;

    for (const line of preamble) {
        const h1 = /^#\s+(.+?)\s*$/.exec(line);
        if (h1 && !line.startsWith('##')) {
            if (!title) title = h1[1].trim();
            continue;
        }
        const kv = /^([A-Za-z][A-Za-z \-]*?)\s*:\s*(.+)$/.exec(line.trim());
        if (!kv) continue;

        const key = kv[1].trim().toLowerCase().replace(/\s+/g, ' ');
        const value = kv[2].trim();

        switch (key) {
            case 'client': clientName = value; break;
            case 'agency': agencyName = value; break;
            case 'status': {
                const s = value.toLowerCase() as Proposal['status'];
                if (CONTRACT_STATUSES.includes(s)) { status = s; declared.status = true; }
                else warnings.push(`Status "${value}" isn't valid (draft/sent/approved/rejected/lost) and was ignored.`);
                break;
            }
            case 'effective':
            case 'effective date':
            case 'start':
                if (/^\d{4}-\d{2}-\d{2}$/.test(value)) effectiveDate = value;
                else warnings.push(`Effective date "${value}" isn't YYYY-MM-DD and was ignored.`);
                break;
            case 'retainer':
            case 'fee': {
                const parsed = parseRetainerLine(value);
                if (parsed.amount !== undefined) amount = parsed.amount;
                if (parsed.currency) currency = parsed.currency;
                if (parsed.billingCycle) billingCycle = parsed.billingCycle;
                if (parsed.amount === undefined) warnings.push(`No amount found in Retainer line "${value}".`);
                break;
            }
            case 'amount': {
                const n = parseFloat(value.replace(/[^\d.]/g, ''));
                if (!isNaN(n)) amount = n;
                break;
            }
            case 'currency':
                if (/^[A-Za-z]{3}$/.test(value)) currency = value.toUpperCase();
                break;
            case 'billing':
            case 'billing cycle': {
                const cycle = normalizeBillingCycle(value);
                if (cycle) billingCycle = cycle;
                else warnings.push(`Billing cycle "${value}" isn't monthly/quarterly/annually and was ignored.`);
                break;
            }
            case 'lock-in':
            case 'lock in':
            case 'lockin':
            case 'minimum term':
                lockInMonths = parseLockIn(value);
                break;
            case 'governing law':
            case 'law':
                governingLawCountry = value;
                break;
            case 'jurisdiction':
            case 'courts':
                jurisdictionCity = value;
                break;
            default:
                break;
        }
    }

    const clientSection = sections.find(s => s.heading === 'client');
    const agencySection = sections.find(s => s.heading === 'agency');
    const clausesSection = sections.find(s => s.heading === 'clauses');

    const client = parseParty(clientSection?.lines || [], {
        ...defaults.client,
        legalName: clientName || defaults.client.legalName,
    });
    const agency = parseParty(agencySection?.lines || [], defaults.agency);

    if (clientSection && (client.signatoryName || client.email)) declared.clientSignatory = true;
    if (agencySection && (agency.signatoryName || agency.email)) declared.agencySignatory = true;

    const contract: ContractData = {
        client,
        agency,
        effectiveDate,
        retainer: { amount, currency, billingCycle },
        lockInMonths,
        governingLawCountry,
        jurisdictionCity,
        clauses: [],
    };

    const parsedClauses = clausesSection ? parseClauseBlocks(clausesSection.lines) : [];
    if (clausesSection && parsedClauses.length === 0 && clausesSection.lines.some(l => l.trim())) {
        warnings.push('Clauses section found but no "### Heading" blocks could be parsed.');
    }
    if (parsedClauses.length > 0) declared.clauses = true;
    contract.clauses = resolveClauses(
        contract,
        parsedClauses,
        clausesSection?.modifier === 'replace' ? 'replace' : 'merge',
        warnings,
    );

    const resolvedClientName = clientName || client.legalName;
    const today = todayIso();
    const proposal: Proposal = {
        id: '',
        documentType: 'contract',
        title: title || (resolvedClientName ? `${resolvedClientName} — Retainer Agreement` : 'Retainer Agreement'),
        clientName: resolvedClientName,
        agencyName,
        status,
        createdAt: today,
        updatedAt: today,
        data: {
            overview: '',
            aboutUs: '',
            pricing: { currency, items: [], total: '' },
            timeline: { phases: [] },
            terms: '',
            signatures: {
                agency: { name: agency.signatoryName, email: agency.email },
                client: { name: client.signatoryName, email: client.email },
            },
            contract,
        },
    };

    return { proposal, warnings, declared };
};

// ─── serialize ──────────────────────────────────────────────────────────────

/**
 * Inverse of parseContractMarkdown — serialize an existing agreement back into
 * the document format so it can be re-edited as one paste. Always emits
 * "## Clauses (replace)" with every clause, so a round-trip is lossless even
 * when clauses were re-ordered or removed in the editor.
 */
export const serializeContractToMarkdown = (p: Proposal): string => {
    const c = p.data.contract;
    if (!c) return '';

    const person = (name: string, email: string) =>
        email ? `${name} <${email}>`.trim() : name;
    const addressLines = (address: string) => {
        const lines = (address || '').split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) return ['Address:'];
        if (lines.length === 1) return [`Address: ${lines[0]}`];
        return ['Address:', ...lines];
    };
    const party = (label: string, party_: ContractParty) => [
        `## ${label}`,
        '',
        `Legal Name: ${party_.legalName || ''}`,
        ...addressLines(party_.address),
        `Signatory: ${person(party_.signatoryName, party_.email)}`,
        `Title: ${party_.signatoryTitle || ''}`,
        '',
    ];

    const lines: string[] = [
        `# ${p.title || 'Retainer Agreement'}`,
        '',
        `Client: ${p.clientName || ''}`,
        `Agency: ${p.agencyName || 'ActiveSet'}`,
        `Status: ${p.status}`,
        `Effective: ${c.effectiveDate || ''}`,
        `Retainer: ${c.retainer.amount} ${c.retainer.currency} ${c.retainer.billingCycle}`,
        `Lock-in: ${c.lockInMonths ? `${c.lockInMonths} months` : 'none'}`,
        `Governing Law: ${c.governingLawCountry || ''}`,
        `Jurisdiction: ${c.jurisdictionCity || ''}`,
        '',
        ...party('Client', c.client),
        ...party('Agency', c.agency),
        '## Clauses (replace)',
        '',
        ...c.clauses.flatMap(clause => [
            `### ${decodeHtmlEntities(clause.heading)}`,
            '',
            // Auto-generated clauses (Term & Minimum Commitment) are rebuilt
            // from the commercial fields when the document is parsed back in.
            // Writing the body out would freeze today's wording and take
            // manual control of it, so a later edit to the retainer or lock-in
            // would leave the clause contradicting the fields above it. An
            // empty body means "keep the standard text" — see resolveClauses.
            ...(clause.generated ? [] : [clauseHtmlToMarkdown(clause.body), '']),
        ]),
    ];

    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
};

// ─── merge ──────────────────────────────────────────────────────────────────

/**
 * Apply a re-edited markdown document to an existing contract. Content comes
 * from the parsed document; anything markdown can't express (id, createdBy,
 * drawn signature data, timestamps, audit trails) is kept from the current
 * record. Optional groups only overwrite when the document declared them.
 */
export const mergeParsedIntoContract = (
    current: Proposal,
    parsed: Proposal,
    declared: ParsedContractMarkdown['declared'],
): Proposal => {
    const parsedContract = parsed.data.contract;
    if (!parsedContract) return current;

    // Keep the editor's clause wording when the document didn't restate it.
    const currentContract = current.data.contract;
    const clauses = declared.clauses || !currentContract?.clauses?.length
        ? parsedContract.clauses
        : currentContract.clauses.map(clause =>
            clause.generated
                ? { ...clause, body: generateTermClauseBody(parsedContract) }
                : clause);

    const sig = current.data.signatures;
    return {
        ...current,
        documentType: 'contract',
        title: parsed.title,
        clientName: parsed.clientName || current.clientName,
        agencyName: parsed.agencyName || current.agencyName,
        status: declared.status ? parsed.status : current.status,
        data: {
            ...current.data,
            signatures: {
                agency: declared.agencySignatory
                    ? { ...sig.agency, name: parsed.data.signatures.agency.name, email: parsed.data.signatures.agency.email }
                    : sig.agency,
                client: declared.clientSignatory
                    ? { ...sig.client, name: parsed.data.signatures.client.name, email: parsed.data.signatures.client.email }
                    : sig.client,
            },
            contract: { ...parsedContract, clauses },
        },
    };
};

/** Standard clause headings, entity-decoded — useful for docs and pickers. */
export const CONTRACT_CLAUSE_HEADINGS = STANDARD_CLAUSE_HEADINGS;
