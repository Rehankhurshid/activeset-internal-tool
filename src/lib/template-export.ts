import {
    SOPTemplate,
    SOPTemplateSection,
    SOPTemplateItem,
    ChecklistItemLink,
    ChecklistItemField,
    ChecklistItemTemplate,
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
 *
 * The two list-of-records shapes follow from the same rule. A field is one
 * `Field: Label (type, expected)` bullet, with the attributes that do not fit on
 * it — an id that has drifted from its label, a placeholder — as `Field id:` and
 * `Field placeholder:` bullets attaching to the field above them. A message is a
 * `Message label:` bullet, `Message:` repeated per line of body, and one
 * `Option:` bullet per choice.
 *
 * What is deliberately never written is `values`: what a project recorded when it
 * ticked a step is that project's, and a template that carried it would hand one
 * client's dates and links to the next.
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
    'field',
    'fieldid',
    'fieldtype',
    'fieldplaceholder',
    'fieldexpected',
    'message',
    'messagelabel',
    'messagebody',
    'option',
    'options',
]);

/** The field types the parser will accept; anything else is read as free text. */
const FIELD_TYPES: ChecklistItemField['type'][] = ['date', 'url', 'text', 'emails'];

/**
 * The id a field's label alone implies, given the fields written before it.
 *
 * Nobody should have to invent a key, so the id is the slug of the label. The
 * writer and the parser derive it the same way, which is what lets the Markdown
 * stay quiet: only an id that has *drifted* from its label — a field renamed
 * after values were recorded against it — has to be written down.
 */
export function fieldIdFromLabel(label: string, taken: Iterable<string>): string {
    const base =
        label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || 'field';
    const used = new Set(taken);
    if (!used.has(base)) return base;
    let n = 2;
    while (used.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
}

/** The same derivation, against the labels of the fields already in the list. */
function derivedFieldId(previous: { label: string }[], label: string): string {
    const taken: string[] = [];
    for (const field of previous) taken.push(fieldIdFromLabel(field.label, taken));
    return fieldIdFromLabel(label, taken);
}

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

/**
 * The fields to record when the step is done.
 *
 * The type and the "expected" flag ride in a parenthetical because that is how
 * anyone would write it by hand; the id follows only when it no longer matches
 * the label, and the placeholder gets its own line because it is a sentence.
 */
function fieldSubBullets(fields: ChecklistItemField[]): string[] {
    const lines: string[] = [];

    fields.forEach((field, index) => {
        const tail = [field.type, field.expected ? 'expected' : null].filter(Boolean).join(', ');
        lines.push(`  - 🧾 Field: ${field.label} (${tail})`);
        // An id the editor has not filled in yet is the derived one in all but
        // name, so it is written as the silence rather than as an empty bullet.
        const derived = derivedFieldId(fields.slice(0, index), field.label);
        const id = field.id || derived;
        if (id !== derived) {
            lines.push(`  - 🧾 Field id: ${id}`);
        }
        if (field.placeholder) {
            lines.push(`  - 🧾 Field placeholder: ${field.placeholder}`);
        }
    });

    return lines;
}

/** The message to copy and send: its button label, its body a line at a time, then the choices. */
function messageSubBullets(message: ChecklistItemTemplate): string[] {
    const lines: string[] = [];

    if (message.label) {
        lines.push(`  - 💬 Message label: ${message.label}`);
    }
    lines.push(...multilineSubBullets('💬', 'Message', message.body || ''));
    for (const option of message.options || []) {
        lines.push(`  - 💬 Option: ${option}`);
    }

    return lines;
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
    if (item.fields?.length) {
        lines.push(...fieldSubBullets(item.fields));
    }
    if (item.template) {
        lines.push(...messageSubBullets(item.template));
    }
    // `item.values` is missing on purpose. See the note at the top of the file:
    // a template that carried it would seed every project with another's answers.

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
    /**
     * The message under construction, assembled across several bullets.
     *
     * `body` is only a string once a `Message:` line has been read, so it is kept
     * loose here and settled when the item is flushed — otherwise a message whose
     * label came first would start its body with a blank line.
     */
    let message: { label?: string; body?: string; options?: string[] } | null = null;
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
    // "Call date (date, expected)" — greedy, so only the last parenthetical is
    // read as the tail and a label may contain brackets of its own.
    const fieldTailRegex = /^(.*)\(([^()]*)\)$/;
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

    /** A type name written by hand, case and spacing ignored. */
    const parseFieldType = (raw: string): ChecklistItemField['type'] | undefined => {
        const value = raw.trim().toLowerCase();
        return FIELD_TYPES.find((type) => type === value);
    };

    /**
     * "Call date (date, expected)" — the label, then a tail saying what it is.
     *
     * The tail only counts when every token in it is one we know, so "Recording
     * link (Fathom)" keeps its whole label and falls back to a free-text field
     * rather than losing half its name to a guess.
     */
    const parseField = (raw: string, previous: ChecklistItemField[]): ChecklistItemField => {
        const value = raw.trim();
        let label = value;
        let type: ChecklistItemField['type'] = 'text';
        let expected = false;

        const tail = value.match(fieldTailRegex);
        if (tail) {
            const tokens = tail[2]
                .split(',')
                .map((token) => token.trim().toLowerCase())
                .filter(Boolean);
            const known = tokens.every((token) => token === 'expected' || !!parseFieldType(token));
            if (tokens.length > 0 && known) {
                label = tail[1].trim();
                type = tokens.map(parseFieldType).find(Boolean) ?? 'text';
                expected = tokens.includes('expected');
            }
        }

        const field: ChecklistItemField = { id: derivedFieldId(previous, label), label, type };
        if (expected) field.expected = true;
        return field;
    };

    const flushItem = () => {
        if (currentSection && currentItem) {
            // Settle the message before the item leaves: a label or a list of
            // options with no body still describes a message worth keeping.
            if (message) currentItem.template = { ...message, body: message.body ?? '' };
            currentSection.items.push(currentItem);
        }
        currentItem = null;
        message = null;
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
                    case 'field': {
                        const fields = currentItem.fields || [];
                        currentItem.fields = [...fields, parseField(value, fields)];
                        continue;
                    }
                    case 'fieldid':
                    case 'fieldtype':
                    case 'fieldplaceholder':
                    case 'fieldexpected': {
                        // An attribute of the field the last `Field:` line opened.
                        // With no field above it there is nothing to attach to, so
                        // it is dropped like any other stray bullet.
                        const fields = currentItem.fields;
                        if (!fields?.length) continue;
                        const field = fields[fields.length - 1];
                        if (key === 'fieldid') {
                            // An empty id means "the one the label implies", which
                            // is already what parseField put there.
                            if (value) field.id = value;
                        } else if (key === 'fieldtype') {
                            field.type = parseFieldType(value) ?? field.type;
                        } else if (key === 'fieldplaceholder') {
                            if (value) field.placeholder = value;
                        } else if (/^(yes|true|1)$/i.test(value)) {
                            field.expected = true;
                        }
                        continue;
                    }
                    case 'messagelabel':
                        message = { ...(message || {}), label: value };
                        continue;
                    case 'message':
                    case 'messagebody':
                        message = { ...(message || {}), body: appendLine(message?.body, value) };
                        continue;
                    case 'option':
                    case 'options':
                        // A choice with nothing in it is not a choice to offer.
                        if (value) {
                            message = {
                                ...(message || {}),
                                options: [...(message?.options || []), value],
                            };
                        }
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
