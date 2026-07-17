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

// Convert plain text bullets (•) to proper HTML lists
export const convertBulletsToHtmlLists = (html: string): string => {
  if (!html || !html.includes('•')) {
    return html;
  }

  // Pass 1 — plain-text bullet lines ("• Item\n• Item"), produced when the
  // overview is composed from clientDescription + services + finalDeliverable.
  // Newlines collapse when rendered as HTML, so without this the items run
  // together inline ("• a • b • c"). Lines whose bullet is followed by a <p>
  // tag are left for pass 2 below.
  html = html.replace(/(?:^[ \t]*•[ \t]*(?!\s*<p)[^\n]*\n?)+/gm, (block) => {
    const items = block
      .split('\n')
      .map(line => line.replace(/^[ \t]*•[ \t]*/, '').trim())
      .filter(Boolean);
    if (items.length === 0) return block;
    return '<ul>' + items.map(item => `<li>${item}</li>`).join('') + '</ul>\n';
  });

  if (!html.includes('•')) {
    return html;
  }

  // Pass 2 — bullet followed by any whitespace (including newlines) and then a <p> tag
  // This handles cases like:
  // "• <p>", "•\n<p>", "• \n<p>", "•\n\n<p>", etc.
  const bulletItemPattern = /•[\s\n\r]*(<p[^>]*>[\s\S]*?<\/p>)/gi;

  const matches: Array<{ full: string; pTag: string; index: number }> = [];
  let match;

  // Reset regex lastIndex
  bulletItemPattern.lastIndex = 0;

  // Collect all matches
  while ((match = bulletItemPattern.exec(html)) !== null) {
    matches.push({
      full: match[0],
      pTag: match[1],
      index: match.index
    });
  }

  if (matches.length === 0) {
    return html;
  }

  // Build result by grouping consecutive bullets
  let result = '';
  let lastIndex = 0;
  let currentGroup: string[] = [];
  let groupStart = -1;

  for (let i = 0; i < matches.length; i++) {
    const curr = matches[i];
    const prev = i > 0 ? matches[i - 1] : null;

    // Calculate distance from previous match
    const distance = prev
      ? curr.index - (prev.index + prev.full.length)
      : Infinity;

    // Consider consecutive if within 300 chars (to handle whitespace/newlines)
    const isConsecutive = distance < 300;

    if (!isConsecutive && currentGroup.length > 0) {
      // Close previous group
      const prevMatch = matches[i - 1];
      result += html.substring(lastIndex, groupStart);
      result += '<ul>' + currentGroup.map(p => `<li>${p}</li>`).join('') + '</ul>';
      lastIndex = prevMatch.index + prevMatch.full.length;
      currentGroup = [];
      groupStart = -1;
    }

    if (currentGroup.length === 0) {
      groupStart = curr.index;
    }

    currentGroup.push(curr.pTag);
  }

  // Handle the last group
  if (currentGroup.length > 0) {
    result += html.substring(lastIndex, groupStart);
    result += '<ul>' + currentGroup.map(p => `<li>${p}</li>`).join('') + '</ul>';
    lastIndex = matches[matches.length - 1].index + matches[matches.length - 1].full.length;
  }

  // Add remaining content
  result += html.substring(lastIndex);

  return result;
};
