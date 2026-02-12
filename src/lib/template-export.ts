import { SOPTemplate } from '@/types';
import jsPDF from 'jspdf';

/**
 * Convert an SOP template to a formatted Markdown string.
 */
export function templateToMarkdown(template: SOPTemplate): string {
    const lines: string[] = [];

    lines.push(`# ${template.icon} ${template.name}`);
    lines.push('');
    if (template.description) {
        lines.push(`> ${template.description}`);
        lines.push('');
    }
    lines.push('---');
    lines.push('');

    for (const section of template.sections) {
        lines.push(`## ${section.emoji || '📁'} ${section.title}`);
        lines.push('');
        for (const item of section.items) {
            const emoji = item.emoji ? `${item.emoji} ` : '';
            lines.push(`- [ ] ${emoji}${item.title}`);
            if (item.referenceLink) {
                lines.push(`  - 🔗 Reference: ${item.referenceLink}`);
            }
        }
        lines.push('');
    }

    return lines.join('\n');
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
