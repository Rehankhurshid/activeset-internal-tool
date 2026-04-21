/**
 * Download a proposal as a PDF, server-rendered via Puppeteer + Chromium.
 * The server navigates to the public /view/:id page, waits for fonts and
 * images to fully load, then emits a PDF — so the download looks exactly
 * like the live page (Funnel Sans / Funnel Display preserved).
 */
export async function downloadProposalPDF(
    proposalId: string,
    filename: string = 'proposal.pdf'
): Promise<void> {
    const response = await fetch(`/api/generate-pdf?proposalId=${encodeURIComponent(proposalId)}`);

    if (!response.ok) {
        // Server may return HTML (Vercel error page) on 500. Read as text
        // first and attempt JSON parse so the real error surfaces.
        const text = await response.text();
        let message = `PDF generation failed (HTTP ${response.status})`;
        try {
            const parsed = JSON.parse(text);
            message = parsed.details ? `${parsed.error}: ${parsed.details}` : parsed.error || message;
        } catch {
            const snippet = text.replace(/<[^>]*>/g, ' ').trim().slice(0, 200);
            if (snippet) message = `${message} — ${snippet}`;
        }
        throw new Error(message);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
