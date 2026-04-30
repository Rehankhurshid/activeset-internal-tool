import { SOPTemplate, SOPTemplateSection, SOPTemplateItem } from '@/types';
import jsPDF from 'jspdf';

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
        for (const item of section.items || []) {
            const emoji = item.emoji ? `${item.emoji} ` : '';
            lines.push(`- [ ] ${emoji}${item.title}`);
            if (item.referenceLink) {
                lines.push(`  - 🔗 Reference: ${item.referenceLink}`);
            }
            if (item.hoverImage) {
                lines.push(`  - 🖼️ Image: ${item.hoverImage}`);
            }
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
    // Sub-bullet "  - 🔗 Reference: …" / "  - 🖼️ Image: …"
    const subRefRegex = /^\s+-\s*(?:🔗|Reference|🌐)[^a-zA-Z0-9]*(?:Reference\s*:?\s*)?(.+)$/i;
    const subImgRegex = /^\s+-\s*(?:🖼️?|Image)[^a-zA-Z0-9]*(?:Image\s*:?\s*)?(.+)$/i;
    const blockquoteRegex = /^>\s*(.+)$/;
    const dividerRegex = /^---+\s*$/;

    const splitEmoji = (text: string): { emoji?: string; title: string } => {
        const trimmed = text.trim();
        // Leading emoji cluster: base pictograph + optional modifier / VS-16 / ZWJ-joined sequences.
        const m = trimmed.match(/^(\p{Extended_Pictographic}(?:️|⃣|\p{Emoji_Modifier}|‍\p{Extended_Pictographic})*)\s+(.+)$/u);
        if (m) return { emoji: m[1], title: m[2].trim() };
        return { title: trimmed };
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

        // Sub-bullet for current item (reference link)
        if (currentItem) {
            const refMatch = line.match(subRefRegex);
            if (refMatch) {
                currentItem.referenceLink = refMatch[1].trim();
                continue;
            }
            const imgMatch = line.match(subImgRegex);
            if (imgMatch) {
                currentItem.hoverImage = imgMatch[1].trim();
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
