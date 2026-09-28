import { safeHttpUrl } from './client-plan';

/**
 * Fathom's meeting summaries, read into plain blocks the portal can render
 * with ordinary elements.
 *
 * Fathom writes Markdown: headings, nested bullets, bold lead-ins and links to
 * moments in the recording. Nothing here produces HTML, so nothing in a
 * summary — Fathom's or a team edit — can put markup on the client's page, and
 * a link survives only if it is http(s).
 */

export type SummaryInline =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'link'; text: string; href: string };

export type SummaryBlock =
  | { type: 'heading'; content: SummaryInline[] }
  | { type: 'paragraph'; content: SummaryInline[] }
  | { type: 'list'; ordered: boolean; items: { depth: number; content: SummaryInline[] }[] };

const LINK_OR_STRONG = /\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)\)|\*\*([^*]+)\*\*|__([^_]+)__/g;

/** Bold and links; everything else as text, with stray emphasis markers dropped. */
export function parseInline(line: string): SummaryInline[] {
  const out: SummaryInline[] = [];
  const push = (text: string) => {
    const cleaned = text.replace(/(^|\s)[*_](\S)/g, '$1$2').replace(/(\S)[*_](\s|$)/g, '$1$2');
    if (!cleaned) return;
    const last = out[out.length - 1];
    if (last?.type === 'text') last.text += cleaned;
    else out.push({ type: 'text', text: cleaned });
  };
  let at = 0;
  for (const match of line.matchAll(LINK_OR_STRONG)) {
    push(line.slice(at, match.index));
    at = (match.index ?? 0) + match[0].length;
    if (match[1] !== undefined) {
      const href = safeHttpUrl(match[2]);
      const text = match[1].trim() || 'link';
      if (href) out.push({ type: 'link', text, href });
      else push(text);
    } else {
      out.push({ type: 'strong', text: (match[3] ?? match[4]).trim() });
    }
  }
  push(line.slice(at));
  return out;
}

const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;
const BULLET = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

export function parseSummary(markdown: string | undefined | null): SummaryBlock[] {
  if (!markdown) return [];
  const blocks: SummaryBlock[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', content: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };

  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const content = parseInline(heading[1].replace(/#+\s*$/, '').trim());
      if (content.length) blocks.push({ type: 'heading', content });
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      flush();
      const ordered = /\d/.test(bullet[2]);
      const depth = Math.min(3, Math.floor(bullet[1].replace(/\t/g, '  ').length / 2));
      const item = { depth, content: parseInline(bullet[3].trim()) };
      const last = blocks[blocks.length - 1];
      if (last?.type === 'list' && (last.ordered === ordered || depth > 0)) last.items.push(item);
      else blocks.push({ type: 'list', ordered, items: [item] });
      continue;
    }
    // A wrapped line under a bullet belongs to that bullet.
    const last = blocks[blocks.length - 1];
    if (!paragraph.length && last?.type === 'list' && /^\s+/.test(line)) {
      last.items[last.items.length - 1].content.push(...parseInline(` ${line.trim()}`));
      continue;
    }
    paragraph.push(line.trim());
  }
  flush();
  // Fathom indents even its top-level bullets; a list starts at its shallowest item.
  for (const block of blocks) {
    if (block.type !== 'list') continue;
    const base = Math.min(...block.items.map((item) => item.depth));
    for (const item of block.items) item.depth -= base;
  }
  return blocks;
}
