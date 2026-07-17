'use client';

import { createHeadlessEditor } from '@lexical/headless';
import { $convertFromMarkdownString, TRANSFORMERS } from '@lexical/markdown';
import { $generateHtmlFromNodes } from '@lexical/html';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { CodeNode } from '@lexical/code';
import { LinkNode, AutoLinkNode } from '@lexical/link';
import { Proposal, PricingItem, TimelinePhase } from '../types/Proposal';

// Starter document shown in the compose dialog. Section headings are what the
// parser keys on; everything inside them is free-form markdown.
export const PROPOSAL_MARKDOWN_TEMPLATE = `# Website Redesign Proposal

Client: Acme Corp
Agency: ActiveSet

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

## Timeline

- Discovery | 2 weeks | Research, audits, and planning
- Design | 3 weeks | High-fidelity layouts and prototypes
- Development | 4 weeks | Build, QA, and launch

## Terms

Payment is due within 30 days of invoice. 50% upfront, 50% on delivery.
`;

export interface ParsedProposalMarkdown {
    proposal: Proposal;
    warnings: string[];
}

// Convert a markdown fragment to the same HTML the proposal RichTextEditor
// produces, so content composed here is indistinguishable from typed content.
const markdownToHtml = (md: string): string => {
    const trimmed = md.trim();
    if (!trimmed) return '';
    const editor = createHeadlessEditor({
        namespace: 'ProposalMarkdownImport',
        nodes: [HeadingNode, ListNode, ListItemNode, QuoteNode, CodeNode, LinkNode, AutoLinkNode],
        onError: (e: Error) => console.error(e),
    });
    editor.update(() => {
        $convertFromMarkdownString(trimmed, TRANSFORMERS);
    }, { discrete: true });
    return editor.getEditorState().read(() => $generateHtmlFromNodes(editor, null));
};

const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$', JPY: '¥', CHF: 'CHF', INR: '₹',
};

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

// Split the document into the preamble (before the first "## ") and top-level
// "## " sections. "###" and deeper stay inside their parent section.
const splitSections = (md: string): { preamble: string[]; sections: Section[] } => {
    const preamble: string[] = [];
    const sections: Section[] = [];
    let current: Section | null = null;
    for (const line of md.split(/\r?\n/)) {
        const match = /^##\s+(.+?)\s*$/.exec(line);
        if (match && !line.startsWith('###')) {
            const raw = match[1].trim();
            current = {
                raw,
                heading: raw.replace(/\s*\(.*\)\s*$/, '').toLowerCase(),
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

// "Name | 5000 | description" bullet rows (description optional).
const parsePipeRows = (lines: string[]): { cols: string[] }[] =>
    parseBullets(lines).map(item => ({ cols: item.split('|').map(c => c.trim()) }));

/**
 * Parse a complete markdown document into a Proposal draft.
 *
 * Recognised structure (all sections optional, matched case-insensitively):
 *   # Title
 *   Client: ... / Agency: ...            (preamble metadata)
 *   ## Overview   (+ ### Client Description / ### Services / ### Final Deliverable)
 *   ## About Us
 *   ## Pricing (CUR)                     (- Name | price | description)
 *   ## Timeline                          (- Phase | duration | description)
 *   ## Terms
 * Unrecognised "## " sections are reported as warnings and skipped.
 */
export const parseProposalMarkdown = (md: string): ParsedProposalMarkdown => {
    const warnings: string[] = [];
    const { preamble, sections } = splitSections(md);

    let title = '';
    let clientName = '';
    let agencyName = 'ActiveSet';
    const preambleProse: string[] = [];

    for (const line of preamble) {
        const h1 = /^#\s+(.+?)\s*$/.exec(line);
        const client = /^client\s*:\s*(.+)$/i.exec(line.trim());
        const agency = /^agency\s*:\s*(.+)$/i.exec(line.trim());
        if (h1 && !title) title = h1[1].trim();
        else if (client) clientName = client[1].trim();
        else if (agency) agencyName = agency[1].trim();
        else preambleProse.push(line);
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

    for (const section of sections) {
        const body = section.lines;
        switch (section.heading) {
            case 'overview': {
                const { prose, subs } = extractSubSections(body, ['client description', 'services', 'final deliverable']);
                overviewHtml = markdownToHtml(prose);
                clientDescription = subs['client description'] || '';
                finalDeliverable = subs['final deliverable'] || '';
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
                pricingItems = parsePipeRows(body).map(({ cols }) => ({
                    name: cols[0] || '',
                    price: (cols[1] || '').replace(/[^\d.]/g, ''),
                    description: cols[2] ? markdownToHtml(cols[2]) : '',
                }));
                if (pricingItems.length === 0 && body.some(l => l.trim())) {
                    warnings.push('Pricing section found but no "- Name | price | description" rows could be parsed.');
                }
                break;
            }
            case 'timeline': {
                phases = parsePipeRows(body).map(({ cols }) => ({
                    title: cols[0] || '',
                    duration: cols[1] || '',
                    description: cols[2] || '',
                }));
                if (phases.length === 0 && body.some(l => l.trim())) {
                    warnings.push('Timeline section found but no "- Phase | duration | description" rows could be parsed.');
                }
                break;
            }
            default:
                warnings.push(`Unrecognised section "## ${section.raw}" was skipped.`);
        }
    }

    // Preamble prose (below the metadata, before any ##) counts as overview
    // when no explicit Overview section exists.
    if (!overviewHtml) {
        const fallback = preambleProse.join('\n').trim();
        if (fallback) overviewHtml = markdownToHtml(fallback);
    }

    const today = new Date().toISOString().split('T')[0];
    const proposal: Proposal = {
        id: '',
        title: title || 'Untitled Proposal',
        clientName,
        agencyName,
        status: 'draft',
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
            timeline: { phases },
            terms: termsHtml,
            signatures: {
                agency: { name: '', email: '' },
                client: { name: '', email: '' },
            },
        },
    };

    return { proposal, warnings };
};
