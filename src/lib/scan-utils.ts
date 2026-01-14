import { ChangeStatus, FieldChange, ExtendedContentSnapshot, ContentSnapshot, AuditResult } from '@/types';
import { createTwoFilesPatch } from 'diff';

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

// Compare snapshots and generate field changes
export function computeFieldChanges(
    newSnapshot: ExtendedContentSnapshot | ContentSnapshot | undefined,
    prevSnapshot: ExtendedContentSnapshot | ContentSnapshot | undefined
): FieldChange[] {
    const changes: FieldChange[] = [];

    if (!newSnapshot || !prevSnapshot) return changes;

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

    // Images
    const prevImages = (prevSnapshot as ExtendedContentSnapshot).images || [];
    const newImages = (newSnapshot as ExtendedContentSnapshot).images || [];

    // Check if content changed (src based)
    const prevImgSrcs = new Set(prevImages.map(img => img.src));
    const newImgSrcs = new Set(newImages.map(img => img.src));

    // We treat it as changed if sets differ OR arrays look different (backup check)
    // Actually hashing is better but expensive. Src check is good enough.
    // Also check for alt changes? 
    // Let's just strict compare JSON stringification of arrays if needed, but src set is primary for "Added/Removed"

    let imagesChanged = false;
    if (prevImages.length !== newImages.length) imagesChanged = true;
    else {
        // Same length, check if all new srcs are in old (and thus old in new)
        for (const src of newImgSrcs) {
            if (!prevImgSrcs.has(src)) {
                imagesChanged = true;
                break;
            }
        }
    }

    if (imagesChanged) {
        changes.push({
            field: 'images',
            oldValue: prevImages,
            newValue: newImages,
            changeType: newImages.length > prevImages.length ? 'added' : newImages.length < prevImages.length ? 'removed' : 'modified'
        });
    }

    // Links
    const prevLinks = (prevSnapshot as ExtendedContentSnapshot).links || [];
    const newLinks = (newSnapshot as ExtendedContentSnapshot).links || [];

    // Check hrefs
    const prevLinkHrefs = new Set(prevLinks.map(l => l.href));
    const newLinkHrefs = new Set(newLinks.map(l => l.href));

    let linksChanged = false;
    if (prevLinks.length !== newLinks.length) linksChanged = true;
    else {
        for (const href of newLinkHrefs) {
            if (!prevLinkHrefs.has(href)) {
                linksChanged = true;
                break;
            }
        }
    }

    if (linksChanged) {
        changes.push({
            field: 'links',
            oldValue: prevLinks,
            newValue: newLinks,
            changeType: newLinks.length > prevLinks.length ? 'added' : newLinks.length < prevLinks.length ? 'removed' : 'modified'
        });
    }

    // Headings (H1-H3)
    const prevHeadings = (prevSnapshot as ExtendedContentSnapshot).headingsWithTags ||
        ((prevSnapshot as ExtendedContentSnapshot).headings || []).map(h => ({ tag: 'H?', text: h }));
    const newHeadings = (newSnapshot as ExtendedContentSnapshot).headingsWithTags ||
        ((newSnapshot as ExtendedContentSnapshot).headings || []).map(h => ({ tag: 'H?', text: h }));

    // Compare headings array
    const prevHeadingTexts = prevHeadings.map(h => `[${h.tag}] ${h.text}`).join('\n');
    const newHeadingTexts = newHeadings.map(h => `[${h.tag}] ${h.text}`).join('\n');

    if (prevHeadingTexts !== newHeadingTexts) {
        // Smart Diff: Find differences
        // Only show added/removed lines to avoid giant lists of identical headings
        const oldLines = prevHeadings.map(h => `[${h.tag}] ${h.text}`);
        const newLines = newHeadings.map(h => `[${h.tag}] ${h.text}`);

        const oldSet = new Set(oldLines);
        const newSet = new Set(newLines);

        const removed = oldLines.filter(l => !newSet.has(l));
        const added = newLines.filter(l => !oldSet.has(l));

        if (removed.length > 0 || added.length > 0) {
            changes.push({
                field: 'headings',
                oldValue: removed.join('\n'),
                newValue: added.join('\n'),
                changeType: 'modified'
            });
        }
    }

    // Body Text Preview (check hash if available, or text)
    const prevBody = (prevSnapshot as ExtendedContentSnapshot).bodyTextPreview || '';
    const newBody = (newSnapshot as ExtendedContentSnapshot).bodyTextPreview || '';
    if (prevBody !== newBody) {
        // We only store a snippet, so comparison is limited, but useful for "Body Text" change alert
        changes.push({
            field: 'bodyText',
            oldValue: prevBody.substring(0, 50) + '...',
            newValue: newBody.substring(0, 50) + '...',
            changeType: 'modified'
        });
    }

    return changes;
}

// Generate diff patch
export function generateDiffPatch(
    oldText: string,
    newText: string
): string | undefined {
    if (!oldText || !newText || oldText === newText) return undefined;

    // Create unified diff
    return createTwoFilesPatch(
        'Previous Version',
        'Current Version',
        oldText,
        newText,
        'Old Header',
        'New Header',
        { context: 3 }
    );
}

// Extract clean text from HTML
function extractTextFromHtml(html: string): string {
    // Basic text extraction to avoid heavy cheerio dependency if possible, 
    // but we likely need cheerio for quality. 
    // Since this runs in Next.js API route, we can dynamic import or ensure cheerio is available.
    // However, simplicity: Remove script/style, then strip tags.

    // Simple regex-based stripper for speed (approximate)
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

    // Find the changed segments
    // We can use the 'diff' package's diffWords or diffSentences ideally, 
    // but createTwoFilesPatch is line based.
    // Let's manually find the first diff point and context?
    // Or just return the texts if short?
    // User wants "See What We Did..." vs "Nyuway..." lines.

    // If we return the whole text, it's too long.
    // We should return the *changed sentences* or *lines*.
    // Since we flattened text, we effectively have one long line or paragraphs.
    // Let's try to preserve some structure in extractText?

    // Better extraction:
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
