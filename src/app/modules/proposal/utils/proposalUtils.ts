export function getStatusColor(status: string): string {
    switch (status) {
        case 'approved':
            return 'bg-green-500/10 text-green-700 dark:text-green-400';
        case 'sent':
            return 'bg-primary/10 text-primary';
        case 'rejected':
            return 'bg-destructive/10 text-destructive';
        case 'lost':
            return 'bg-gray-500/10 text-gray-500 dark:text-gray-400';
        default:
            return 'bg-muted text-muted-foreground';
    }
}

export async function copyToClipboard(text: string): Promise<void> {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            // Fallback for non-secure contexts
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            if (!successful) {
                throw new Error('Fallback copy failed');
            }
        }
    } catch (error) {
        console.error('Clipboard copy failed:', error);
        // Re-throw with a user-friendly message, or prompt user to copy manually
        throw new Error(`Failed to copy to clipboard. Link: ${text}`);
    }
}
