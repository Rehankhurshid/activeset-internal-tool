'use client';

import { createHeadlessEditor } from '@lexical/headless';
import { $convertFromMarkdownString, $convertToMarkdownString, TRANSFORMERS } from '@lexical/markdown';
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { CodeNode } from '@lexical/code';
import { LinkNode, AutoLinkNode } from '@lexical/link';
import { $getRoot, $isElementNode, $isDecoratorNode, $createParagraphNode } from 'lexical';
import type { PaymentTemplate } from '@/lib/payment-templates';
import { Proposal, PricingItem, TimelinePhase, ProposalResource } from '../types/Proposal';

// ---------------------------------------------------------------------------
// Format reference
// ---------------------------------------------------------------------------
// One markdown document represents the entire proposal. Everything is
// optional; unknown "## " headings are kept as content under the previous
// section rather than dropped.
//
//   # Title
//   Client: / Agency: / Status: / Hero:      (preamble metadata)
//   ## Overview  (+ ### Client Description / ### Services / ### Final Deliverable)
//   ## About Us
//   ## Pricing (CUR)      - Name | price | description       (flat price)
//                         - Name | 10h x 50 | description    (hourly: hours x rate)
//   ## Payment Terms      Template: / Total: / Currency: / Start:
//   ## Timeline           - Phase | duration | description | 2026-01-01..2026-01-14 | after:1
//   ## Terms
//   ## Links              - Label | https://url        (audit report, Figma, staging, …)
//   ## Signatures         Agency: Name <email>  /  Client: Name <email>
// ---------------------------------------------------------------------------

// Starter document shown in the compose dialog.
export const PROPOSAL_MARKDOWN_TEMPLATE = `# Website Redesign Proposal

Client: Acme Corp
Agency: ActiveSet
Status: draft

## Overview

We propose a complete redesign of your marketing site with a focus on
conversion and performance.

### Client Description

Acme Corp is a leading provider of...

### Services

- Website Design
- Webflow Development

### Final Deliverable

A fully functional, responsive website deployed to production.

## About Us

ActiveSet is a design and development studio specialising in Webflow.

## Pricing (USD)

- Design | 5000 | UI/UX design across all key pages
- Development | 8000 | Webflow build, CMS, and integrations
- Support | 10h x 50 | Ad-hoc support (hourly)

## Payment Terms

Template: split 50/50
Start: 2026-08-01

## Timeline

- Discovery | 2 weeks | Research, audits, and planning | 2026-08-01..2026-08-14
- Design | 3 weeks | High-fidelity layouts and prototypes | 2026-08-15..2026-09-04 | after:1
- Development | 4 weeks | Build, QA, and launch | 2026-09-05..2026-10-02 | after:2

## Terms

Payment is due within 30 days of invoice. 50% upfront, 50% on delivery.

## Links

- Website Audit | https://app.activeset.co/share/audit-token
- Current Website | https://acme.com

## Signatures

Agency: John Doe <john@activeset.co>
Client: Jane Smith <jane@acme.com>
`;

// Self-contained instructions for an external AI (ChatGPT, Claude, etc.).
// Copied to the clipboard from the compose dialog so the user can paste them
// together with meeting notes and get back a valid document.
export const AI_FORMAT_INSTRUCTIONS = `You are helping write a client proposal for a web design/development agency.
From the notes I give you (meeting notes, brief, pricing details), produce ONE
markdown document in EXACTLY the format below. Output only the markdown
document — no explanations, no code fences.

Format:

# <Proposal title>

Client: <client company name>
Agency: <agency name>
Status: draft

## Overview

<2-3 paragraph project overview. Markdown formatting (bold, lists, links) is allowed in all prose sections.>

### Client Description

<1 short paragraph describing the client company>

### Services

- <service 1>
- <service 2>

### Final Deliverable

<1-2 sentences describing the final deliverable>

## About Us

<short agency description — omit this section if you have no information>

## Pricing (USD)

- <Item name> | <numeric price, no symbols> | <one-line description>
- <Hourly item name> | <hours>h x <rate> | <one-line description>

## Payment Terms

Template: <one of: one-time | split 50/50 | split 30/40/30 | split 40/60 | monthly <N> | quarterly <N> | hourly <hours> x <rate>>
Start: <YYYY-MM-DD>

## Timeline

- <Phase name> | <duration, e.g. "2 weeks"> | <one-line description> | <YYYY-MM-DD>..<YYYY-MM-DD> | after:<phase number this depends on>

## Terms

<payment and legal terms as prose>

## Links

- <Label, e.g. "Website Audit"> | <https URL>

## Signatures

Agency: <name> <<email>>
Client: <name> <<email>>

Rules:
- Every section is optional — omit sections you have no information for. Do not invent facts.
- Pricing/Timeline rows are bullet lines with " | " between columns. Never use "|" inside a column.
- In Timeline rows the date range and "after:N" columns are optional; N is the 1-based number of the phase it depends on.
- "Pricing (USD)" — replace USD with the 3-letter currency code from the notes (USD, EUR, GBP, CAD, AUD, JPY, CHF, INR).
- Status is one of: draft, sent, approved, rejected, lost. Default to draft.
- Prices are plain numbers (5000, not $5,000).`;

export interface ParsedProposalMarkdown {
    proposal: Proposal;
    warnings: string[];
    /** Which optional field groups the document explicitly declared. */
    declared: {
        status: boolean;
        hero: boolean;
        signatures: boolean;
        paymentTerms: boolean;
        links: boolean;
    };
}

const newHeadlessEditor = () =>
    createHeadlessEditor({
        namespace: 'ProposalMarkdownImport',
        nodes: [HeadingNode, ListNode, ListItemNode, QuoteNode, CodeNode, LinkNode, AutoLinkNode],
        onError: (e: Error) => console.error(e),
    });

// Convert a markdown fragment to the same HTML the proposal RichTextEditor
// produces, so content composed here is indistinguishable from typed content.
const markdownToHtml = (md: string): string => {
    const trimmed = md.trim();
    if (!trimmed) return '';
    const editor = newHeadlessEditor();
    editor.update(() => {
        $convertFromMarkdownString(trimmed, TRANSFORMERS);
    }, { discrete: true });
    return editor.getEditorState().read(() => $generateHtmlFromNodes(editor, null));
};

// Inverse of markdownToHtml — used when re-editing an existing proposal as
// markdown. Plain-text values pass through unchanged.
const htmlToMarkdown = (html: string): string => {
    const trimmed = (html || '').trim();
    if (!trimmed) return '';
    const editor = newHeadlessEditor();
    editor.update(() => {
        const dom = new DOMParser().parseFromString(trimmed, 'text/html');
        const nodes = $generateNodesFromDOM(editor, dom);
        const root = $getRoot();
        root.clear();
        nodes.forEach(node => {
            if (!$isElementNode(node) && !$isDecoratorNode(node)) {
                const paragraph = $createParagraphNode();
                paragraph.append(node);
                root.append(paragraph);
            } else {
                root.append(node);
            }
        });
    }, { discrete: true });
    return editor.getEditorState().read(() => $convertToMarkdownString(TRANSFORMERS)).trim();
};

// Pipe-row cells can't contain newlines or "|" — flatten to a single line.
const toCell = (md: string): string => md.replace(/\s*\n+\s*/g, ' ').replace(/\|/g, '/').trim();

const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$', JPY: '¥', CHF: 'CHF', INR: '₹',
};

const PROPOSAL_STATUSES: Proposal['status'][] = ['draft', 'sent', 'approved', 'rejected', 'lost'];

const formatTotal = (items: PricingItem[], currency: string): string => {
    const total = items.reduce((sum, item) => sum + (parseFloat(item.price.replace(/[^\d.-]/g, '')) || 0), 0);
    if (total <= 0) return '';
    const symbol = CURRENCY_SYMBOLS[currency] || currency || '$';
    return `${symbol} ${total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

interface Section {
    heading: string;    // lowercased, parenthetical stripped
    raw: string;        // original heading text
    lines: string[];
}

const KNOWN_SECTIONS = ['overview', 'about us', 'pricing', 'payment terms', 'timeline', 'terms', 'links', 'signatures'];

// Split the document into the preamble (before the first known "## " section)
// and top-level sections. Only KNOWN_SECTIONS headings start a section — any
// other "## " heading is kept as content, so H2s inside prose survive a
// serialize → re-edit round-trip. "###" and deeper stay inside their parent.
const splitSections = (md: string): { preamble: string[]; sections: Section[] } => {
    const preamble: string[] = [];
    const sections: Section[] = [];
    let current: Section | null = null;
    for (const line of md.split(/\r?\n/)) {
        const match = /^##\s+(.+?)\s*$/.exec(line);
        const heading = match && !line.startsWith('###')
            ? match[1].trim().replace(/\s*\(.*\)\s*$/, '').toLowerCase()
            : null;
        if (match && heading && KNOWN_SECTIONS.includes(heading)) {
            const raw = match[1].trim();
            current = { raw, heading, lines: [] };
            sections.push(current);
        } else if (current) {
            current.lines.push(line);
        } else {
            preamble.push(line);
        }
    }
    return { preamble, sections };
};

// Pull "### Sub Heading" blocks out of a section body. Returns remaining prose
// (content not under any matched sub-heading) plus each matched block.
const extractSubSections = (
    lines: string[],
    wanted: string[],
): { prose: string; subs: Record<string, string> } => {
    const subs: Record<string, string> = {};
    const proseLines: string[] = [];
    let currentKey: string | null = null;
    let currentLines: string[] = [];

    const flush = () => {
        if (currentKey) subs[currentKey] = currentLines.join('\n').trim();
        currentLines = [];
    };

    for (const line of lines) {
        const match = /^###\s+(.+?)\s*$/.exec(line);
        if (match) {
            flush();
            const key = match[1].trim().toLowerCase();
            currentKey = wanted.includes(key) ? key : null;
            if (!currentKey) proseLines.push(line); // unknown ### stays in prose
        } else if (currentKey) {
            currentLines.push(line);
        } else {
            proseLines.push(line);
        }
    }
    flush();
    return { prose: proseLines.join('\n').trim(), subs };
};

const parseBullets = (lines: string[]): string[] =>
    lines
        .map(l => /^\s*[-*+]\s+(.+)$/.exec(l)?.[1]?.trim())
        .filter((v): v is string => Boolean(v));

// "Name | 5000 | description" bullet rows.
const parsePipeRows = (lines: string[]): { cols: string[] }[] =>
    parseBullets(lines).map(item => ({ cols: item.split('|').map(c => c.trim()) }));

// "Key: value" lines (used by Payment Terms and Signatures sections).
const parseKeyValues = (lines: string[]): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const line of lines) {
        const match = /^([A-Za-z ]+?)\s*:\s*(.+)$/.exec(line.trim());
        if (match) out[match[1].trim().toLowerCase()] = match[2].trim();
    }
    return out;
};

// "10h x 50" / "10 h @ 50" → hourly pricing.
const parseHourlyPrice = (cell: string): { hours: number; rate: number } | null => {
    const match = /^(\d+(?:\.\d+)?)\s*h(?:ours?)?\s*[x@×*]\s*(\d+(?:\.\d+)?)$/i.exec(cell);
    return match ? { hours: parseFloat(match[1]), rate: parseFloat(match[2]) } : null;
};

// "Name <email>" → parts.
const parsePerson = (value: string): { name: string; email: string } => {
    const match = /^(.*?)\s*<([^<>]+)>\s*$/.exec(value);
    if (match) return { name: match[1].trim(), email: match[2].trim() };
    return value.includes('@') ? { name: '', email: value.trim() } : { name: value.trim(), email: '' };
};

// "split 50/50" / "monthly 6" / "hourly 100 x 50" → PaymentTemplate.
const parsePaymentTemplate = (value: string, warnings: string[]): PaymentTemplate | null => {
    const v = value.trim().toLowerCase();
    if (v === 'one-time' || v === 'one time' || v === 'onetime') return { kind: 'one-time' };
    const split = /^split\s+([\d/\s]+)$/.exec(v);
    if (split) {
        const percentages = split[1].split('/').map(p => parseFloat(p.trim())).filter(n => !isNaN(n));
        if (percentages.length >= 2) return { kind: 'split', percentages };
    }
    const monthly = /^monthly\s+(\d+)$/.exec(v);
    if (monthly) return { kind: 'monthly', months: parseInt(monthly[1], 10) };
    const quarterly = /^quarterly\s+(\d+)$/.exec(v);
    if (quarterly) return { kind: 'quarterly', quarters: parseInt(quarterly[1], 10) };
    const hourly = /^hourly\s+(\d+(?:\.\d+)?)\s*(?:h(?:ours?)?)?\s*[x@×*]\s*(\d+(?:\.\d+)?)$/.exec(v);
    if (hourly) return { kind: 'hourly', hours: parseFloat(hourly[1]), rate: parseFloat(hourly[2]) };
    warnings.push(`Payment terms template "${value}" wasn't recognised and was skipped.`);
    return null;
};

const serializePaymentTemplate = (template: PaymentTemplate): string => {
    switch (template.kind) {
        case 'one-time': return 'one-time';
        case 'split': return `split ${template.percentages.join('/')}`;
        case 'monthly': return `monthly ${template.months}`;
        case 'quarterly': return `quarterly ${template.quarters}`;
        case 'hourly': return `hourly ${template.hours} x ${template.rate}`;
        case 'custom': return 'custom (edit in editor)';
    }
};

/**
 * Parse a complete markdown document into a Proposal draft. See the format
 * reference at the top of this file. All sections are optional and matched
 * case-insensitively; unknown "## " headings stay as content under the
 * previous section.
 */
export const parseProposalMarkdown = (md: string): ParsedProposalMarkdown => {
    const warnings: string[] = [];
    const { preamble, sections } = splitSections(md);
    const declared = { status: false, hero: false, signatures: false, paymentTerms: false, links: false };

    let title = '';
    let clientName = '';
    let agencyName = 'ActiveSet';
    let status: Proposal['status'] = 'draft';
    let heroImage: string | undefined;
    const preambleProse: string[] = [];

    for (const line of preamble) {
        const h1 = /^#\s+(.+?)\s*$/.exec(line);
        const meta = /^(client|agency|status|hero)\s*:\s*(.+)$/i.exec(line.trim());
        if (h1 && !title) {
            title = h1[1].trim();
        } else if (meta) {
            const key = meta[1].toLowerCase();
            const value = meta[2].trim();
            if (key === 'client') clientName = value;
            else if (key === 'agency') agencyName = value;
            else if (key === 'status') {
                const s = value.toLowerCase() as Proposal['status'];
                if (PROPOSAL_STATUSES.includes(s)) { status = s; declared.status = true; }
                else warnings.push(`Status "${value}" isn't valid (draft/sent/approved/rejected/lost) and was ignored.`);
            } else if (key === 'hero') {
                if (/^https?:\/\//.test(value) || value.startsWith('data:')) { heroImage = value; declared.hero = true; }
                else warnings.push('Hero must be an image URL; the value was ignored.');
            }
        } else {
            preambleProse.push(line);
        }
    }

    let overviewHtml = '';
    let clientDescription = '';
    let services: string[] = [];
    let finalDeliverable = '';
    let aboutUsHtml = '';
    let termsHtml = '';
    let currency = 'USD';
    let pricingItems: PricingItem[] = [];
    let phases: TimelinePhase[] = [];
    let paymentTerms: Proposal['data']['paymentTerms'];
    let resources: ProposalResource[] = [];
    let agencySignatory = { name: '', email: '' };
    let clientSignatory = { name: '', email: '' };

    for (const section of sections) {
        const body = section.lines;
        switch (section.heading) {
            case 'overview': {
                const { prose, subs } = extractSubSections(body, ['client description', 'services', 'final deliverable']);
                overviewHtml = markdownToHtml(prose);
                clientDescription = markdownToHtml(subs['client description'] || '');
                finalDeliverable = markdownToHtml(subs['final deliverable'] || '');
                if (subs['services']) services = parseBullets(subs['services'].split('\n'));
                break;
            }
            case 'about us':
                aboutUsHtml = markdownToHtml(body.join('\n'));
                break;
            case 'terms':
                termsHtml = markdownToHtml(body.join('\n'));
                break;
            case 'pricing': {
                const currencyMatch = /\(([A-Za-z]{3})\)/.exec(section.raw);
                if (currencyMatch) currency = currencyMatch[1].toUpperCase();
                pricingItems = parsePipeRows(body).map(({ cols }) => {
                    const hourly = parseHourlyPrice(cols[1] || '');
                    return {
                        name: cols[0] || '',
                        price: hourly ? String(hourly.hours * hourly.rate) : (cols[1] || '').replace(/[^\d.]/g, ''),
                        description: cols[2] ? markdownToHtml(cols[2]) : '',
                        ...(hourly ? { hourly } : {}),
                    };
                });
                if (pricingItems.length === 0 && body.some(l => l.trim())) {
                    warnings.push('Pricing section found but no "- Name | price | description" rows could be parsed.');
                }
                break;
            }
            case 'payment terms': {
                const kv = parseKeyValues(body);
                const template = kv['template'] ? parsePaymentTemplate(kv['template'], warnings) : null;
                if (template) {
                    declared.paymentTerms = true;
                    paymentTerms = {
                        template,
                        totalAmount: parseFloat((kv['total'] || '').replace(/[^\d.]/g, '')) || 0,
                        currency: (kv['currency'] || '').toUpperCase() || currency,
                        startDate: /^\d{4}-\d{2}-\d{2}$/.test(kv['start'] || '') ? kv['start'] : '',
                    };
                }
                break;
            }
            case 'timeline': {
                phases = parsePipeRows(body).map(({ cols }) => {
                    const phase: TimelinePhase = {
                        title: cols[0] || '',
                        duration: cols[1] || '',
                        description: cols[2] ? markdownToHtml(cols[2]) : '',
                    };
                    // Optional trailing columns, order-independent:
                    // "2026-01-15..2026-01-29" and "after:1" (1-based phase number)
                    for (const col of cols.slice(3)) {
                        const dates = /^(\d{4}-\d{2}-\d{2})\s*(?:\.\.|→|->)\s*(\d{4}-\d{2}-\d{2})$/.exec(col);
                        const after = /^after\s*:\s*(\d+)$/i.exec(col);
                        if (dates) { phase.startDate = dates[1]; phase.endDate = dates[2]; }
                        else if (after) phase.dependsOn = parseInt(after[1], 10) - 1;
                    }
                    return phase;
                });
                if (phases.length === 0 && body.some(l => l.trim())) {
                    warnings.push('Timeline section found but no "- Phase | duration | description" rows could be parsed.');
                }
                break;
            }
            case 'links': {
                // "- Label | url" rows; a bare "- url" row gets an empty label
                // (the viewer falls back to the detected kind's name).
                resources = parsePipeRows(body)
                    .map(({ cols }, i) => {
                        const hasLabel = cols.length > 1;
                        return {
                            id: `res-md-${i}`,
                            label: hasLabel ? cols[0] : '',
                            url: (hasLabel ? cols[1] : cols[0]) || '',
                        };
                    })
                    .filter(r => r.url);
                if (resources.length > 0) declared.links = true;
                else if (body.some(l => l.trim())) {
                    warnings.push('Links section found but no "- Label | url" rows could be parsed.');
                }
                break;
            }
            case 'signatures': {
                const kv = parseKeyValues(body);
                if (kv['agency'] || kv['client']) {
                    declared.signatures = true;
                    if (kv['agency']) agencySignatory = parsePerson(kv['agency']);
                    if (kv['client']) clientSignatory = parsePerson(kv['client']);
                }
                break;
            }
        }
    }

    // Preamble prose (below the metadata, before any ##) counts as overview
    // when no explicit Overview section exists.
    if (!overviewHtml) {
        const fallback = preambleProse.join('\n').trim();
        if (fallback) overviewHtml = markdownToHtml(fallback);
    }

    // No standalone overview prose: compose it from the detail fields exactly
    // the way ProposalEditor rebuilds it, so viewer/PDF render identically.
    if (!overviewHtml && (clientDescription || services.length || finalDeliverable)) {
        const parts: string[] = [];
        if (clientDescription) parts.push(clientDescription);
        if (services.length) parts.push(services.map(s => `• ${s}`).join('\n'));
        if (finalDeliverable) parts.push(finalDeliverable);
        overviewHtml = parts.join('\n\n');
    }

    // Fill payment-terms total from pricing when the document didn't give one.
    if (paymentTerms && !paymentTerms.totalAmount) {
        paymentTerms.totalAmount = pricingItems.reduce(
            (sum, item) => sum + (parseFloat(item.price.replace(/[^\d.-]/g, '')) || 0), 0);
    }

    const today = new Date().toISOString().split('T')[0];
    const proposal: Proposal = {
        id: '',
        title: title || 'Untitled Proposal',
        clientName,
        agencyName,
        ...(heroImage ? { heroImage } : {}),
        status,
        createdAt: today,
        updatedAt: today,
        data: {
            overview: overviewHtml,
            overviewDetails: {
                clientDescription,
                services,
                finalDeliverable,
            },
            aboutUs: aboutUsHtml,
            pricing: {
                currency,
                items: pricingItems,
                total: formatTotal(pricingItems, currency),
            },
            ...(paymentTerms ? { paymentTerms } : {}),
            timeline: { phases },
            terms: termsHtml,
            ...(resources.length ? { resources } : {}),
            signatures: {
                agency: agencySignatory,
                client: clientSignatory,
            },
        },
    };

    return { proposal, warnings, declared };
};

/**
 * Inverse of parseProposalMarkdown — serialize an existing proposal back into
 * the markdown document format so it can be re-edited as one document.
 * Drawn signatures, custom payment templates and embedded hero images are not
 * representable in markdown; use mergeParsedIntoProposal when applying the
 * re-edited document so those survive.
 */
export const serializeProposalToMarkdown = (p: Proposal): string => {
    const d = p.data;
    const od = d.overviewDetails;
    const sig = d.signatures;
    const person = (s: { name: string; email: string }) =>
        s.email ? `${s.name} <${s.email}>`.trim() : s.name;

    const lines: string[] = [
        `# ${p.title || 'Untitled Proposal'}`,
        '',
        `Client: ${p.clientName || ''}`,
        `Agency: ${p.agencyName || 'ActiveSet'}`,
        `Status: ${p.status}`,
        // Embedded (data:) hero images are megabytes of base64 — keep them in
        // the editor only. URLs round-trip.
        ...(p.heroImage && /^https?:\/\//.test(p.heroImage) ? [`Hero: ${p.heroImage}`] : []),
        '',
        '## Overview',
        '',
        // The editor auto-composes data.overview from the three detail fields
        // below — serializing it too would duplicate content on round-trip.
        ...(od?.clientDescription || od?.services?.length || od?.finalDeliverable
            ? []
            : [htmlToMarkdown(d.overview), '']),
        '### Client Description',
        '',
        htmlToMarkdown(od?.clientDescription || ''),
        '',
        '### Services',
        '',
        ...(od?.services || []).map(s => `- ${s}`),
        '',
        '### Final Deliverable',
        '',
        htmlToMarkdown(od?.finalDeliverable || ''),
        '',
        '## About Us',
        '',
        htmlToMarkdown(d.aboutUs),
        '',
        `## Pricing (${d.pricing.currency || 'USD'})`,
        '',
        ...d.pricing.items
            .filter(item => item.name || item.price)
            .map(item => {
                const price = item.hourly ? `${item.hourly.hours}h x ${item.hourly.rate}` : item.price;
                return `- ${toCell(item.name)} | ${price} | ${toCell(htmlToMarkdown(item.description || ''))}`;
            }),
        '',
        ...(d.paymentTerms ? [
            '## Payment Terms',
            '',
            `Template: ${serializePaymentTemplate(d.paymentTerms.template)}`,
            `Total: ${d.paymentTerms.totalAmount || ''}`,
            `Currency: ${d.paymentTerms.currency || d.pricing.currency || 'USD'}`,
            `Start: ${d.paymentTerms.startDate || ''}`,
            '',
        ] : []),
        '## Timeline',
        '',
        ...d.timeline.phases
            .filter(ph => ph.title || ph.description)
            .map(ph => {
                const dates = ph.startDate && ph.endDate ? ` | ${ph.startDate}..${ph.endDate}` : '';
                const after = typeof ph.dependsOn === 'number' ? ` | after:${ph.dependsOn + 1}` : '';
                return `- ${toCell(ph.title)} | ${toCell(ph.duration)} | ${toCell(htmlToMarkdown(ph.description || ''))}${dates}${after}`;
            }),
        '',
        '## Terms',
        '',
        htmlToMarkdown(d.terms),
        '',
        ...((d.resources || []).filter(r => r.url).length ? [
            '## Links',
            '',
            ...(d.resources || []).filter(r => r.url).map(r => `- ${toCell(r.label)} | ${r.url.trim()}`),
            '',
        ] : []),
        '## Signatures',
        '',
        `Agency: ${person(sig.agency)}`,
        `Client: ${person(sig.client)}`,
        '',
    ];
    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
};

/**
 * Apply a re-edited markdown document to an existing proposal. Content comes
 * from the parsed document; anything markdown can't express (id, createdBy,
 * drawn signature data, embedded hero image, contract data) is kept from the
 * current proposal. Optional groups (status, hero, signatures, payment terms)
 * only overwrite when the document declared them.
 */
export const mergeParsedIntoProposal = (
    current: Proposal,
    parsed: Proposal,
    declared: ParsedProposalMarkdown['declared'],
): Proposal => {
    // NOTE: never assign explicitly-undefined keys here — Firestore's setDoc
    // rejects undefined field values, which breaks the next save.
    const phases: TimelinePhase[] = parsed.data.timeline.phases.map((phase, i) => {
        const prev = current.data.timeline.phases[i];
        const startDate = phase.startDate ?? prev?.startDate;
        const endDate = phase.endDate ?? prev?.endDate;
        const dependsOn = phase.dependsOn ?? prev?.dependsOn;
        return {
            ...phase,
            ...(startDate !== undefined ? { startDate } : {}),
            ...(endDate !== undefined ? { endDate } : {}),
            ...(dependsOn !== undefined ? { dependsOn } : {}),
        };
    });
    const heroImage = declared.hero ? parsed.heroImage : current.heroImage;
    const paymentTerms = declared.paymentTerms ? parsed.data.paymentTerms : current.data.paymentTerms;
    const resources = declared.links ? parsed.data.resources : current.data.resources;
    return {
        ...current,
        title: parsed.title,
        clientName: parsed.clientName || current.clientName,
        agencyName: parsed.agencyName || current.agencyName,
        status: declared.status ? parsed.status : current.status,
        ...(heroImage !== undefined ? { heroImage } : {}),
        data: {
            ...current.data,
            overview: parsed.data.overview,
            overviewDetails: parsed.data.overviewDetails,
            aboutUs: parsed.data.aboutUs,
            terms: parsed.data.terms,
            pricing: {
                ...current.data.pricing,
                currency: parsed.data.pricing.currency,
                items: parsed.data.pricing.items,
                total: parsed.data.pricing.total,
            },
            ...(paymentTerms !== undefined ? { paymentTerms } : {}),
            ...(resources !== undefined ? { resources } : {}),
            timeline: { phases },
            signatures: declared.signatures
                ? {
                    // Names/emails from the document; drawn signature data,
                    // timestamps and audit info always survive.
                    agency: { ...current.data.signatures.agency, name: parsed.data.signatures.agency.name, email: parsed.data.signatures.agency.email },
                    client: { ...current.data.signatures.client, name: parsed.data.signatures.client.name, email: parsed.data.signatures.client.email },
                }
                : current.data.signatures,
        },
    };
};
