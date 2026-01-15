import { ChangeStatus, FieldChange, ExtendedContentSnapshot, ContentSnapshot, AuditResult, SectionInfo, ContentBlock, BlockChange, TextElement, TextChange } from '@/types';
import { createTwoFilesPatch, diffLines } from 'diff';

/**
 * Create a compact version of auditResult for storing in project document.
 * Strips large fields to stay under Firestore's 1MB document limit.
 * Full data is preserved in audit_logs collection.
 */
export function compactAuditResult(result: AuditResult): AuditResult {
    // Deep clone to avoid mutating original
    const compact: AuditResult = JSON.parse(JSON.stringify(result));

    // Truncate contentSnapshot - remove large arrays, limit strings
    if (compact.contentSnapshot) {
        const snapshot = compact.contentSnapshot as ExtendedContentSnapshot;
        compact.contentSnapshot = {
            title: snapshot.title?.substring(0, 200) || '',
            h1: snapshot.h1?.substring(0, 200) || '',
            metaDescription: snapshot.metaDescription?.substring(0, 300) || '',
            wordCount: snapshot.wordCount || 0,
            headings: (snapshot.headings || []).slice(0, 10), // Max 10 headings
            // EXCLUDE large fields: bodyText, bodyTextPreview, images, links, sections
        };
    }

    // Strip rawSchemas from schema category (can be very large)
    if (compact.categories?.schema) {
        compact.categories.schema = {
            ...compact.categories.schema,
            rawSchemas: [], // Remove full schemas, keep metadata
        };
    }

    // Limit headingStructure headings
    if (compact.categories?.headingStructure?.headings) {
        compact.categories.headingStructure.headings =
            compact.categories.headingStructure.headings.slice(0, 20);
    }

    // Limit brokenLinks array
    if (compact.categories?.links?.brokenLinks) {
        compact.categories.links.brokenLinks =
            compact.categories.links.brokenLinks.slice(0, 10);
    }

    // Limit accessibility issues
    if (compact.categories?.accessibility?.issues) {
        compact.categories.accessibility.issues =
            compact.categories.accessibility.issues.slice(0, 20);
    }

    // Remove screenshots from project doc (kept in audit_logs)
    delete compact.screenshot;
    delete compact.previousScreenshot;
    delete compact.mobileScreenshot;
    delete compact.tabletScreenshot;
    delete compact.desktopScreenshot;

    // Limit fieldChanges to avoid large diffs
    if (compact.fieldChanges) {
        compact.fieldChanges = compact.fieldChanges.slice(0, 10).map(change => ({
            ...change,
            // Truncate large values in field changes
            oldValue: truncateFieldValue(change.oldValue) as FieldChange['oldValue'],
            newValue: truncateFieldValue(change.newValue) as FieldChange['newValue'],
        }));
    }

    // Truncate diffSummary and diffPatch
    if (compact.diffSummary && compact.diffSummary.length > 500) {
        compact.diffSummary = compact.diffSummary.substring(0, 500) + '...';
    }
    delete compact.diffPatch; // Remove full diff patch

    return compact;
}

/**
 * Truncate field values to prevent large data in compact result
 */
function truncateFieldValue(value: unknown): unknown {
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') {
        return value.length > 200 ? value.substring(0, 200) + '...' : value;
    }

    if (Array.isArray(value)) {
        // For arrays (images, links), just keep count
        if (value.length > 5) {
            return value.slice(0, 3); // Keep first 3 items
        }
        return value;
    }

    return value;
}

// Compute change status by comparing hashes
export function computeChangeStatus(
    newFullHash: string | undefined,
    newContentHash: string | undefined,
    prevFullHash: string | undefined,
    prevContentHash: string | undefined
): ChangeStatus {
    if (!prevFullHash || !prevContentHash) {
        return 'CONTENT_CHANGED'; // First scan
    }

    if (newFullHash === prevFullHash) {
        return 'NO_CHANGE';
    }

    // Full hash changed
    if (newContentHash === prevContentHash) {
        return 'TECH_CHANGE_ONLY';
    }

    return 'CONTENT_CHANGED';
}

// Compare snapshots and generate field changes (Intelligent Source Comparison)
export function computeFieldChanges(
    newSnapshot: ExtendedContentSnapshot | ContentSnapshot | undefined,
    prevSnapshot: ExtendedContentSnapshot | ContentSnapshot | undefined
): FieldChange[] {
    const changes: FieldChange[] = [];

    if (!newSnapshot || !prevSnapshot) return changes;

    // 1. High-Value SEO Fields (Keep these as they are critical)

    // Title
    if (newSnapshot.title !== prevSnapshot.title) {
        changes.push({
            field: 'title',
            oldValue: prevSnapshot.title || null,
            newValue: newSnapshot.title || null,
            changeType: !prevSnapshot.title ? 'added' : !newSnapshot.title ? 'removed' : 'modified'
        });
    }

    // H1
    if (newSnapshot.h1 !== prevSnapshot.h1) {
        changes.push({
            field: 'h1',
            oldValue: prevSnapshot.h1 || null,
            newValue: newSnapshot.h1 || null,
            changeType: !prevSnapshot.h1 ? 'added' : !newSnapshot.h1 ? 'removed' : 'modified'
        });
    }

    // Meta Description
    if (newSnapshot.metaDescription !== prevSnapshot.metaDescription) {
        changes.push({
            field: 'metaDescription',
            oldValue: prevSnapshot.metaDescription || null,
            newValue: newSnapshot.metaDescription || null,
            changeType: !prevSnapshot.metaDescription ? 'added' : !newSnapshot.metaDescription ? 'removed' : 'modified'
        });
    }

    // Word Count
    if (newSnapshot.wordCount !== prevSnapshot.wordCount) {
        changes.push({
            field: 'wordCount',
            oldValue: prevSnapshot.wordCount,
            newValue: newSnapshot.wordCount,
            changeType: 'modified'
        });
    }

    // 2. Intelligent Source Comparison using "Simplified Content"
    // This replaces the noisy Images/Links/Sections/Headings logic

    const prevSource = (prevSnapshot as ExtendedContentSnapshot).simplifiedContent || '';
    const newSource = (newSnapshot as ExtendedContentSnapshot).simplifiedContent || '';

    // If we have simplified source (new scan format), use it for comparison
    if (prevSource && newSource && prevSource !== newSource) {
        const diffs = diffLines(prevSource, newSource);

        // Group diffs to avoid noisy line-by-line reporting
        // We look for chunks of added/removed content

        for (const part of diffs) {
            if (!part.added && !part.removed) continue;

            // Ignore whitespace-only changes
            if (!part.value.trim()) continue;

            const cleanValue = part.value.trim();
            // If it's short structure noise (e.g. just </div>), skip
            if (cleanValue.length < 5 && /<\/?[a-z]+>/.test(cleanValue)) continue;

            // Map to 'bodyText' field which UI renders well (pencil icon ✏️)
            // Or 'sections' (box icon 📦) for HTML structure
            const isStructural = /<[a-z][\s\S]*>/i.test(cleanValue);
            const fieldName = isStructural ? 'sections' : 'bodyText';

            changes.push({
                field: fieldName,
                oldValue: part.removed ? cleanValue : null,
                newValue: part.added ? cleanValue : null,
                changeType: part.added ? 'added' : 'removed'
            });
        }
    } else {
        // Fallback checks for old format (if simplifiedContent missing)
        // Body Text Preview Check
        const prevBody = (prevSnapshot as ExtendedContentSnapshot).bodyTextPreview || '';
        const newBody = (newSnapshot as ExtendedContentSnapshot).bodyTextPreview || '';
        if (prevBody && newBody && prevBody !== newBody) {
            changes.push({
                field: 'bodyText',
                oldValue: prevBody.substring(0, 50) + '...',
                newValue: newBody.substring(0, 50) + '...',
                changeType: 'modified'
            });
        }
    }

    return changes;
}

// Helper to strip purely technical/navigation sections that add noise to diffs
function stripIgnoredContent(html: string): string {
    if (!html) return '';
    return html
        // Remove Navigation
        .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '\n<!-- [NAV IGNORED] -->\n')
        .replace(/<div\b[^>]*class="[^"]*nav[^"]*"[^>]*>[\s\S]*?<\/div>/gi, (match) => {
            // Be careful with divs, only basic heuristics or skip if risky.
            // For now, let's stick to semantic <nav> and common id/class patterns if fairly safe
            return match; // Skipping aggressive div replacement to avoid false positives
        })
        // Remove Footer
        .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, '\n<!-- [FOOTER IGNORED] -->\n')
        // Remove Scripts (Technical noise)
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '\n<!-- [SCRIPT IGNORED] -->\n')
        // Remove Styles (Technical noise)
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '\n<!-- [STYLE IGNORED] -->\n')
        // Remove SVG (often huge and noisy)
        .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '<!-- [SVG ICON] -->');
}

// Generate diff patch
export function generateDiffPatch(
    oldText: string,
    newText: string
): string | undefined {
    if (!oldText || !newText) return undefined;

    // Strip ignored content before diffing to focus on main content
    const cleanOld = stripIgnoredContent(oldText);
    const cleanNew = stripIgnoredContent(newText);

    if (cleanOld === cleanNew) return undefined;

    // Create unified diff
    return createTwoFilesPatch(
        'Previous Version',
        'Current Version',
        cleanOld,
        cleanNew,
        'Old Header',
        'New Header',
        { context: 3 }
    );
}

// Deprecated: No longer used for logic, but kept for UI compatibility
export function compareBlocks(prev: ContentBlock[] | undefined, curr: ContentBlock[] | undefined): BlockChange[] {
    return [];
}

// Deprecated: No longer used for logic, but kept for UI compatibility
export function compareTextElements(prev: TextElement[] | undefined, curr: TextElement[] | undefined): TextChange[] {
    return [];
}

// Extract clean text from HTML
function extractTextFromHtml(html: string): string {
    const noScript = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, "");
    const noStyle = noScript.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gmi, "");
    const text = noStyle.replace(/<[^>]+>/g, " ");
    return text.replace(/\s+/g, ' ').trim();
}

// Compute meaningful body text diff
export function computeBodyTextDiff(
    oldHtml: string | undefined,
    newHtml: string | undefined
): FieldChange | null {
    if (!oldHtml || !newHtml) return null;

    const oldText = extractTextFromHtml(oldHtml);
    const newText = extractTextFromHtml(newHtml);

    if (oldText === newText) return null;

    const cleanOld = oldHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gmi, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gmi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<[^>]+>/g, "");

    const cleanNew = newHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gmi, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gmi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<[^>]+>/g, "");

    // Split into non-empty lines
    const oldLines = cleanOld.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const newLines = cleanNew.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);

    // Find removed and added lines
    const removed = oldLines.filter(l => !newSet.has(l));
    const added = newLines.filter(l => !oldSet.has(l));

    if (removed.length === 0 && added.length === 0) return null;

    return {
        field: 'bodyText',
        oldValue: removed.join('\n'), // Store as newline separated string for UI
        newValue: added.join('\n'),
        changeType: 'modified'
    };
}
