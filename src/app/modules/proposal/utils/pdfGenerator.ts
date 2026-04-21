/**
 * Downloads a proposal as a PDF file from the server.
 * 
 * @param proposalId The ID of the proposal.
 * @param filename The name of the downloaded PDF file.
 */
export async function downloadProposalPDF(proposalId: string, filename: string = 'proposal.pdf'): Promise<void> {
    try {
        const response = await fetch(`/api/generate-pdf?proposalId=${proposalId}`);

        if (!response.ok) {
            // Read as text first — the response may be an HTML error page
            // (e.g. Vercel 500) rather than JSON, which would make .json() throw
            // a misleading "Unexpected token '<'" error.
            const text = await response.text();
            let message = `PDF generation failed (HTTP ${response.status})`;
            try {
                const parsed = JSON.parse(text);
                message = parsed.error || parsed.details || message;
                if (parsed.details && parsed.error) message = `${parsed.error}: ${parsed.details}`;
            } catch {
                const snippet = text.replace(/<[^>]*>/g, ' ').trim().slice(0, 200);
                if (snippet) message = `${message} — ${snippet}`;
            }
            throw new Error(message);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();

        // Cleanup
        link.parentNode?.removeChild(link);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error downloading PDF:', error);
        throw error;
    }
}
