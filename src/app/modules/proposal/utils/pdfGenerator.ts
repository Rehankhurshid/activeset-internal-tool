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
            const error = await response.json();
            throw new Error(error.error || 'Failed to generate PDF');
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
