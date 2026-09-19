import {
    SOPTemplate,
    SOPTemplateSection,
    SOPTemplateItem,
    ChecklistItemLink,
    StageRole,
} from '@/types';
import jsPDF from 'jspdf';

/**
 * The Markdown format, in one place.
 *
 * This is not only an export. The Checklist Creator round-trips the whole
 * template through it every time someone switches to the Markdown tab and back,
 * so a field this format cannot carry is a field deleted from the template on
 * the next save. That is why everything an item holds is written here, and why
 * the test asserts `templateToMarkdown(parse(md)) === md`.
 *
 * Section facts are a `> Key: value` blockquote under the heading; item facts are
 * `  - <emoji> Key: value` sub-bullets. `howTo` is the awkward one — several
 * lines of prose, where a sub-bullet is a single line — so each of its lines
 * becomes its own `How-to:` bullet and the parser joins them back. A file people
 * hand-edit is worth more than one long line with escaped newlines in it.
 */

/** Every role the parser will accept, so a hand-typed one that matches nothing is dropped instead. */
const STAGE_ROLES: StageRole[] = ['kickoff', 'pages', 'client_review', 'launch'];

/**
 * The item sub-bullet keys the parser understands, normalised (lower case, no
 * spaces or hyphens). Aliases are here because people hand-write this format.
 */
const SUB_BULLET_KEYS = new Set([
    'howto',
    'link',
    'links',
    'reference',
    'image',
    'check',
    'note',
    'notes',
    'assignee',
    'owner',
    'blocking',
    'due',
    'duedate',
]);

/**
 * The role a section plays, tolerating the tag that came before roles existed.
 *
 * `stage: 'kickoff' | 'launch'` means exactly the roles of the same name, so a
 * legacy template is written out as a role rather than kept on the deprecated
 * field — opening the Markdown tab is how these quietly migrate.
 */
function roleOfSection(section: SOPTemplateSection): StageRole | undefined {
    if (section.role) return section.role;
    if (section.stage === 'kickoff' || section.stage === 'launch') return section.stage;
    return undefined;
}

/**
 * A fact that may span several lines, written as one bullet per line.
 *
 * A sub-bullet is a single line, and prose typed into a Textarea is not, so the
 * key simply repeats. The parser joins repeats back with newlines, which makes
 * the trip lossless for a blank line in the middle of a paragraph too.
 */
function multilineSubBullets(emoji: string, key: string, value: string): string[] {
    return value
        .split('\n')
        .map((line) => `  - ${emoji} ${key}: ${line}`.replace(/\s+$/, ''));
}

/** Sub-bullets for one item: one line per fact it carries, in a fixed order so the file is stable. */
function itemSubBullets(item: SOPTemplateItem): string[] {
    const lines: string[] = [];

    if (item.howTo) {
        lines.push(...multilineSubBullets('📋', 'How-to', item.howTo));
    }
    for (const link of item.links || []) {
        // Ordinary Markdown link syntax, so the label and the URL cannot be
        // confused for one another no matter what punctuation the label uses.
        lines.push(`  - 🔗 Link: [${link.label}](${link.url})`);
    }
    if (item.referenceLink) {
        lines.push(`  - 🔗 Reference: ${item.referenceLink}`);
    }
    if (item.hoverImage) {
        lines.push(`  - 🖼️ Image: ${item.hoverImage}`);
    }
    if (item.autoCheck) {
        lines.push(`  - 🔍 Check: ${item.autoCheck}`);
    }
    if (item.notes) {
        lines.push(...multilineSubBullets('🗒️', 'Notes', item.notes));
    }
    if (item.assignee) {
        lines.push(`  - 👤 Assignee: ${item.assignee}`);
    }
    if (item.blocking) {
        lines.push(`  - ⛔ Blocking: yes`);
    }
    if (item.dueDate) {
        lines.push(`  - 📅 Due: ${item.dueDate}`);
    }

    return lines;
}

/**
 * Convert an SOP template to a formatted Markdown string.
 */
export function templateToMarkdown(template: Partial<SOPTemplate>): string {
    const lines: string[] = [];

    const icon = template.icon || '📝';
    const name = template.name || 'Untitled Template';
    lines.push(`# ${icon} ${name}`);
    lines.push('');
    if (template.description) {
        lines.push(`> ${template.description}`);
        lines.push('');
    }
    lines.push('---');
    lines.push('');

    for (const section of template.sections || []) {
        lines.push(`## ${section.emoji || '📁'} ${section.title}`);
        lines.push('');
        // The role is what the Delivery tab does at this stage beyond listing
        // its items, so losing it is expensive rather than cosmetic. Every
        // section is a stage whether or not it has one.
        const role = roleOfSection(section);
        if (role) {
            lines.push(`> Role: ${role}`);
            lines.push('');
        }
        for (const item of section.items || []) {
            const emoji = item.emoji ? `${item.emoji} ` : '';
            lines.push(`- [ ] ${emoji}${item.title}`);
            lines.push(...itemSubBullets(item));
        }
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Parse a Markdown string back into a partial SOP template.
 * Mirrors the format produced by `templateToMarkdown`, but is lenient
 * about whitespace and missing fields.
 */
export function parseMarkdownToTemplate(md: string): Partial<SOPTemplate> {
    const lines = md.replace(/\r\n/g, '\n').split('\n');

    let name = '';
    let icon = '📝';
    let description = '';
    const sections: SOPTemplateSection[] = [];

    let currentSection: SOPTemplateSection | null = null;
    let currentItem: SOPTemplateItem | null = null;
    let descriptionCaptured = false;

    const titleRegex = /^#\s+(.+)$/;
    const sectionRegex = /^##\s+(.+)$/;
    // Matches "- [ ] ..." or "- [x] ..." etc.
    const itemRegex = /^\s*-\s*\[[ xX]?\]\s*(.+)$/;
    // Any indented sub-bullet under an item. What it means is decided below from
    // its key, so an unknown one is skipped instead of landing in some field.
    const subBulletRegex = /^\s+-\s*(.+)$/;
    // Leading emoji on a sub-bullet: decoration, except on the older forms that
    // carried the meaning in the emoji alone ("  - 🔗 https://…").
    const leadingEmojiRegex = /^(\p{Extended_Pictographic}(?:️|⃣|\p{Emoji_Modifier}|‍\p{Extended_Pictographic})*)\s*/u;
    // "How-to: …", "Notes: …" — the value may be empty, which is how a blank
    // line inside a multi-line how-to survives the trip.
    const keyedRegex = /^([A-Za-z][A-Za-z -]*?)\s*:\s*(.*)$/;
    // "[Label](https://…)" — greedy, so a label containing "]" still parses.
    const mdLinkRegex = /^\[(.*)\]\((.*)\)$/;
    // Section-level "> Role: pages", written under the section heading, and the
    // "> Stage: kickoff" that came before it.
    const roleRegex = /^>\s*Role\s*:\s*(.+)$/i;
    const stageRegex = /^>\s*Stage\s*:\s*(.+)$/i;
    const blockquoteRegex = /^>\s*(.+)$/;
    const dividerRegex = /^---+\s*$/;

    const splitEmoji = (text: string): { emoji?: string; title: string } => {
        const trimmed = text.trim();
        // Leading emoji cluster: base pictograph + optional modifier / VS-16 / ZWJ-joined sequences.
        const m = trimmed.match(/^(\p{Extended_Pictographic}(?:️|⃣|\p{Emoji_Modifier}|‍\p{Extended_Pictographic})*)\s+(.+)$/u);
        if (m) return { emoji: m[1], title: m[2].trim() };
        return { title: trimmed };
    };

    /** A role name, accepting "client review" and "Client_Review" for the same thing. */
    const parseRole = (raw: string): StageRole | undefined => {
        const value = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
        return STAGE_ROLES.find((role) => role === value);
    };

    /** Repeats of a multi-line key join back with newlines, in the order written. */
    const appendLine = (existing: string | undefined, line: string): string =>
        existing === undefined ? line : `${existing}\n${line}`;

    const parseLink = (raw: string): ChecklistItemLink | undefined => {
        const value = raw.trim();
        const md = value.match(mdLinkRegex);
        if (md) {
            const url = md[2].trim();
            // A link with no URL is not a link; better to drop it than to render
            // a label that goes nowhere on every project made from this template.
            return url ? { label: md[1].trim(), url } : undefined;
        }
        return value ? { label: '', url: value } : undefined;
    };

    const flushItem = () => {
        if (currentSection && currentItem) {
            currentSection.items.push(currentItem);
        }
        currentItem = null;
    };

    const flushSection = () => {
        flushItem();
        if (currentSection) {
            sections.push(currentSection);
        }
        currentSection = null;
    };

    for (const rawLine of lines) {
        const line = rawLine.replace(/\s+$/, '');
        if (!line) continue;

        // Title (first H1 wins)
        if (!name) {
            const tm = line.match(titleRegex);
            if (tm) {
                const parsed = splitEmoji(tm[1]);
                if (parsed.emoji) icon = parsed.emoji;
                name = parsed.title;
                continue;
            }
        }

        // Description (first blockquote line(s) before any section)
        if (!descriptionCaptured && sections.length === 0 && !currentSection) {
            const bq = line.match(blockquoteRegex);
            if (bq) {
                description = description ? `${description} ${bq[1].trim()}` : bq[1].trim();
                continue;
            }
        }

        // Divider — marks end of description block
        if (dividerRegex.test(line)) {
            descriptionCaptured = true;
            continue;
        }

        // Section header
        const sm = line.match(sectionRegex);
        if (sm) {
            flushSection();
            const parsed = splitEmoji(sm[1]);
            currentSection = {
                title: parsed.title,
                emoji: parsed.emoji || '📁',
                items: [],
                order: sections.length,
            };
            descriptionCaptured = true;
            continue;
        }

        // Item line — must come before sub-bullet regex (since itemRegex also starts with `-`)
        const im = line.match(itemRegex);
        if (im && currentSection) {
            flushItem();
            const parsed = splitEmoji(im[1]);
            currentItem = {
                title: parsed.title,
                emoji: parsed.emoji,
                status: 'not_started',
                order: currentSection.items.length,
            };
            continue;
        }

        // Section-level role. Checked before the item sub-bullets because it
        // belongs to the section, and anything that is not a known role is
        // ignored rather than written through as a tag nothing will match.
        if (currentSection && !currentItem) {
            const roleMatch = line.match(roleRegex);
            if (roleMatch) {
                currentSection.role = parseRole(roleMatch[1]);
                continue;
            }
            // Legacy "> Stage: kickoff". Read as the role of the same name so an
            // old file keeps working and comes out the other side as a role.
            const stageMatch = line.match(stageRegex);
            if (stageMatch) {
                const value = stageMatch[1].trim().toLowerCase();
                if (value === 'kickoff' || value === 'launch') {
                    currentSection.role = value;
                }
                continue;
            }
        }

        // Sub-bullet for the current item. Its key decides what it is; a bullet
        // whose key we do not know is dropped, because guessing would put a
        // sentence into a URL field on every project made from this template.
        if (currentItem) {
            const subMatch = line.match(subBulletRegex);
            if (subMatch) {
                const body = subMatch[1].trim();
                const emojiMatch = body.match(leadingEmojiRegex);
                const emoji = emojiMatch?.[1];
                const rest = emojiMatch ? body.slice(emojiMatch[0].length) : body;
                const keyed = rest.match(keyedRegex);
                const candidate = keyed ? keyed[1].trim().toLowerCase().replace(/[\s-]+/g, '') : '';
                // A bare "https://…" looks keyed ("https:"), so a key only counts
                // when it is one we actually know — otherwise the line is read as
                // the older emoji-only form and the URL survives intact.
                const key = SUB_BULLET_KEYS.has(candidate) ? candidate : '';
                const value = key ? keyed![2].trim() : rest.trim();

                switch (key) {
                    case 'howto':
                        currentItem.howTo = appendLine(currentItem.howTo, value);
                        continue;
                    case 'link':
                    case 'links': {
                        const link = parseLink(value);
                        if (link) currentItem.links = [...(currentItem.links || []), link];
                        continue;
                    }
                    case 'reference':
                        currentItem.referenceLink = value;
                        continue;
                    case 'image':
                        currentItem.hoverImage = value;
                        continue;
                    case 'check':
                        // Kept as written; the delivery domain validates it before
                        // ever treating a check as automatic.
                        currentItem.autoCheck = value as SOPTemplateItem['autoCheck'];
                        continue;
                    case 'note':
                    case 'notes':
                        currentItem.notes = appendLine(currentItem.notes, value);
                        continue;
                    case 'assignee':
                    case 'owner':
                        currentItem.assignee = value;
                        continue;
                    case 'blocking':
                        // Only an affirmative sets the flag. "Blocking: no" is the
                        // same as not writing the line, which is what the writer does.
                        if (/^(yes|true|1)$/i.test(value)) currentItem.blocking = true;
                        continue;
                    case 'due':
                    case 'duedate':
                        currentItem.dueDate = value;
                        continue;
                }

                // Older files put the meaning in the emoji alone, with no key.
                if (!key) {
                    if (emoji === '🔗' || emoji === '🌐') {
                        currentItem.referenceLink = value;
                        continue;
                    }
                    if (emoji === '🖼️' || emoji === '🖼') {
                        currentItem.hoverImage = value;
                        continue;
                    }
                    if (emoji === '🔍') {
                        currentItem.autoCheck = value as SOPTemplateItem['autoCheck'];
                        continue;
                    }
                }
                continue;
            }
        }
    }

    flushSection();

    return {
        name,
        icon,
        description,
        sections,
    };
}

/**
 * Download a template as a Markdown (.md) file.
 */
export function downloadAsMarkdown(template: SOPTemplate): void {
    const md = templateToMarkdown(template);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    triggerDownload(blob, `${slugify(template.name)}.md`);
}

/**
 * Download a template as a PDF.
 */
export function downloadAsPDF(template: SOPTemplate): void {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 16;
    const contentWidth = pageWidth - margin * 2;
    let y = 20;

    const addPage = () => {
        pdf.addPage();
        y = 20;
    };

    const checkPageBreak = (needed: number) => {
        const pageHeight = pdf.internal.pageSize.getHeight();
        if (y + needed > pageHeight - 15) addPage();
    };

    // Title
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${template.icon}  ${template.name}`, margin, y);
    y += 10;

    // Description
    if (template.description) {
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'italic');
        const descLines = pdf.splitTextToSize(template.description, contentWidth);
        pdf.text(descLines, margin, y);
        y += descLines.length * 5 + 4;
    }

    // Divider
    pdf.setDrawColor(200);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Sections
    for (const section of template.sections) {
        checkPageBreak(20);

        // Section header
        pdf.setFontSize(13);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(30, 30, 30);
        pdf.text(`${section.emoji || '📁'}  ${section.title}`, margin, y);
        y += 8;

        // Items
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(50, 50, 50);

        for (const item of section.items) {
            checkPageBreak(10);
            const emoji = item.emoji ? `${item.emoji} ` : '';
            const text = `☐  ${emoji}${item.title}`;
            const lines = pdf.splitTextToSize(text, contentWidth - 6);
            pdf.text(lines, margin + 4, y);
            y += lines.length * 5 + 2;

            if (item.referenceLink) {
                checkPageBreak(6);
                pdf.setTextColor(80, 80, 200);
                pdf.setFontSize(8);
                pdf.text(`🔗 ${item.referenceLink}`, margin + 10, y);
                pdf.setTextColor(50, 50, 50);
                pdf.setFontSize(10);
                y += 5;
            }
        }

        y += 6;
    }

    pdf.save(`${slugify(template.name)}.pdf`);
}

/**
 * Copy template as Markdown to the clipboard.
 */
export async function copyAsMarkdown(template: SOPTemplate): Promise<void> {
    const md = templateToMarkdown(template);
    await navigator.clipboard.writeText(md);
}

// ── Helpers ─────────────────────────────────────────────────

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
