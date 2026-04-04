import { ChangeStatus, FieldChange, ExtendedContentSnapshot, ContentSnapshot, AuditResult, SectionInfo, ContentBlock, BlockChange, TextElement, TextChange } from '@/types';
import { createTwoFilesPatch } from 'diff';

export type AuditCompactLevel = 'standard' | 'aggressive' | 'minimal';

const AUDIT_COMPACT_LIMITS: Record<
    AuditCompactLevel,
    {
        snapshotImages: number;
        snapshotHeadings: number;
        snapshotTitle: number;
        snapshotDescription: number;
        imageAlt: number;
        placeholderIssues: number;
        spellingIssues: number;
        completenessIssues: number;
        seoIssues: number;
        technicalIssues: number;
        schemaTypes: number;
        schemaIssues: number;
        brokenLinks: number;
        headingStructureHeadings: number;
        accessibilityIssues: number;
        ariaLandmarks: number;
        fieldChanges: number;
        diffSummary: number;
        longText: number;
        urlText: number;
    }
> = {
    standard: {
        snapshotImages: 8,
        snapshotHeadings: 8,
        snapshotTitle: 180,
        snapshotDescription: 220,
        imageAlt: 120,
        placeholderIssues: 8,
        spellingIssues: 10,
        completenessIssues: 8,
        seoIssues: 8,
        technicalIssues: 8,
        schemaTypes: 8,
        schemaIssues: 8,
        brokenLinks: 8,
        headingStructureHeadings: 16,
        accessibilityIssues: 12,
        ariaLandmarks: 8,
        fieldChanges: 8,
        diffSummary: 320,
        longText: 180,
        urlText: 280,
    },
    aggressive: {
        snapshotImages: 4,
        snapshotHeadings: 6,
        snapshotTitle: 140,
        snapshotDescription: 180,
        imageAlt: 90,
        placeholderIssues: 5,
        spellingIssues: 6,
        completenessIssues: 5,
        seoIssues: 5,
        technicalIssues: 5,
        schemaTypes: 5,
        schemaIssues: 5,
        brokenLinks: 5,
        headingStructureHeadings: 10,
        accessibilityIssues: 8,
        ariaLandmarks: 6,
        fieldChanges: 5,
        diffSummary: 220,
        longText: 140,
        urlText: 220,
    },
    minimal: {
        snapshotImages: 2,
        snapshotHeadings: 4,
        snapshotTitle: 120,
        snapshotDescription: 140,
        imageAlt: 70,
        placeholderIssues: 3,
        spellingIssues: 4,
        completenessIssues: 4,
        seoIssues: 4,
        technicalIssues: 4,
        schemaTypes: 3,
        schemaIssues: 3,
        brokenLinks: 3,
        headingStructureHeadings: 6,
        accessibilityIssues: 5,
        ariaLandmarks: 4,
        fieldChanges: 4,
        diffSummary: 160,
        longText: 100,
        urlText: 180,
    },
};

/**
 * Create a compact version of auditResult for storing in project document.
 * Strips large fields to stay under Firestore's 1MB document limit.
 * Full data is preserved in audit_logs collection.
 */
export function compactAuditResult(
    result: AuditResult,
    level: AuditCompactLevel = 'standard'
): AuditResult {
    const limits = AUDIT_COMPACT_LIMITS[level];

    // Deep clone to avoid mutating original
    const compact: AuditResult = JSON.parse(JSON.stringify(result));

    // Truncate contentSnapshot - remove large arrays, limit strings
    if (compact.contentSnapshot) {
        const snapshot = compact.contentSnapshot as ExtendedContentSnapshot;

        // Keep a compact, prioritized image subset for quick issue triage in UI.
        // Missing ALT images are kept first to surface accessibility/SEO problems.
        const allImages = Array.isArray(snapshot.images) ? snapshot.images : [];
        const imagesMissingAlt = allImages.filter(img => !img.alt || !img.alt.trim());
        const imagesWithAlt = allImages.filter(img => img.alt && img.alt.trim());
        const compactImages = [...imagesMissingAlt, ...imagesWithAlt]
            .slice(0, limits.snapshotImages)
            .map(img => ({
                src: truncateString(img.src, limits.urlText),
                alt: truncateString(img.alt || '', limits.imageAlt),
                inMainContent: !!img.inMainContent,
            }));

        compact.contentSnapshot = {
            title: truncateString(snapshot.title, limits.snapshotTitle),
            h1: truncateString(snapshot.h1, limits.snapshotTitle),
            metaDescription: truncateString(snapshot.metaDescription, limits.snapshotDescription),
            wordCount: snapshot.wordCount || 0,
            headings: (snapshot.headings || [])
                .slice(0, limits.snapshotHeadings)
                .map(heading => truncateString(heading, limits.longText)),
            // Keep only a compact image set; exclude other large arrays/fields.
            images: compactImages,
            // EXCLUDE large fields: bodyText, bodyTextPreview, links, sections
        } as ContentSnapshot;
    }

    if (compact.summary) {
        compact.summary = truncateString(compact.summary, limits.diffSummary);
    }

    if (compact.categories?.placeholders?.issues) {
        compact.categories.placeholders.issues = compact.categories.placeholders.issues
            .slice(0, limits.placeholderIssues)
            .map(issue => ({
                type: truncateString(issue.type, limits.longText),
                count: issue.count,
            }));
    }

    if (compact.categories?.spelling?.issues) {
        compact.categories.spelling.issues = compact.categories.spelling.issues
            .slice(0, limits.spellingIssues)
            .map(issue => ({
                word: truncateString(issue.word, limits.longText),
                suggestion: issue.suggestion ? truncateString(issue.suggestion, limits.longText) : undefined,
            }));
    }

    if (compact.categories?.completeness?.issues) {
        compact.categories.completeness.issues = compact.categories.completeness.issues
            .slice(0, limits.completenessIssues)
            .map(issue => ({
                check: truncateString(issue.check, limits.longText),
                detail: truncateString(issue.detail, limits.longText),
            }));
    }

    if (compact.categories?.seo) {
        compact.categories.seo.issues = (compact.categories.seo.issues || [])
            .slice(0, limits.seoIssues)
            .map(issue => truncateString(issue, limits.longText));
        compact.categories.seo.title = compact.categories.seo.title
            ? truncateString(compact.categories.seo.title, limits.snapshotTitle)
            : undefined;
        compact.categories.seo.metaDescription = compact.categories.seo.metaDescription
            ? truncateString(compact.categories.seo.metaDescription, limits.snapshotDescription)
            : undefined;
    }

    if (compact.categories?.technical?.issues) {
        compact.categories.technical.issues = compact.categories.technical.issues
            .slice(0, limits.technicalIssues)
            .map(issue => truncateString(issue, limits.longText));
    }

    // Strip rawSchemas from schema category (can be very large)
    if (compact.categories?.schema) {
        compact.categories.schema = {
            ...compact.categories.schema,
            schemaTypes: compact.categories.schema.schemaTypes
                .slice(0, limits.schemaTypes)
                .map(type => truncateString(type, limits.longText)),
            issues: compact.categories.schema.issues
                .slice(0, limits.schemaIssues)
                .map(issue => ({
                    type: truncateString(issue.type, limits.longText),
                    message: truncateString(issue.message, limits.longText),
                })),
            rawSchemas: [], // Remove full schemas, keep metadata
        };
    }

    // Limit headingStructure headings
    if (compact.categories?.headingStructure?.headings) {
        compact.categories.headingStructure.headings =
            compact.categories.headingStructure.headings
                .slice(0, limits.headingStructureHeadings)
                .map(heading => ({
                    level: heading.level,
                    text: truncateString(heading.text, limits.longText),
                }));
    }

    if (compact.categories?.headingStructure?.issues) {
        compact.categories.headingStructure.issues = compact.categories.headingStructure.issues
            .slice(0, limits.technicalIssues)
            .map(issue => truncateString(issue, limits.longText));
    }

    // Limit brokenLinks array
    if (compact.categories?.links?.brokenLinks) {
        compact.categories.links.brokenLinks =
            compact.categories.links.brokenLinks
                .slice(0, limits.brokenLinks)
                .map(link => ({
                    href: truncateString(link.href, limits.urlText),
                    status: link.status,
                    text: truncateString(link.text, limits.longText),
                    error: link.error ? truncateString(link.error, limits.longText) : undefined,
                }));
    }

    if (compact.categories?.openGraph) {
        compact.categories.openGraph.issues = compact.categories.openGraph.issues
            .slice(0, limits.seoIssues)
            .map(issue => truncateString(issue, limits.longText));
        compact.categories.openGraph.title = compact.categories.openGraph.title
            ? truncateString(compact.categories.openGraph.title, limits.snapshotTitle)
            : undefined;
        compact.categories.openGraph.description = compact.categories.openGraph.description
            ? truncateString(compact.categories.openGraph.description, limits.snapshotDescription)
            : undefined;
        compact.categories.openGraph.image = compact.categories.openGraph.image
            ? truncateString(compact.categories.openGraph.image, limits.urlText)
            : undefined;
        compact.categories.openGraph.url = compact.categories.openGraph.url
            ? truncateString(compact.categories.openGraph.url, limits.urlText)
            : undefined;
        compact.categories.openGraph.type = compact.categories.openGraph.type
            ? truncateString(compact.categories.openGraph.type, limits.longText)
            : undefined;
    }

    if (compact.categories?.twitterCards) {
        compact.categories.twitterCards.issues = compact.categories.twitterCards.issues
            .slice(0, limits.seoIssues)
            .map(issue => truncateString(issue, limits.longText));
        compact.categories.twitterCards.card = compact.categories.twitterCards.card
            ? truncateString(compact.categories.twitterCards.card, limits.longText)
            : undefined;
        compact.categories.twitterCards.title = compact.categories.twitterCards.title
            ? truncateString(compact.categories.twitterCards.title, limits.snapshotTitle)
            : undefined;
        compact.categories.twitterCards.description = compact.categories.twitterCards.description
            ? truncateString(compact.categories.twitterCards.description, limits.snapshotDescription)
            : undefined;
        compact.categories.twitterCards.image = compact.categories.twitterCards.image
            ? truncateString(compact.categories.twitterCards.image, limits.urlText)
            : undefined;
    }

    if (compact.categories?.metaTags) {
        compact.categories.metaTags.issues = compact.categories.metaTags.issues
            .slice(0, limits.technicalIssues)
            .map(issue => truncateString(issue, limits.longText));
        compact.categories.metaTags.canonicalUrl = compact.categories.metaTags.canonicalUrl
            ? truncateString(compact.categories.metaTags.canonicalUrl, limits.urlText)
            : undefined;
        compact.categories.metaTags.viewport = compact.categories.metaTags.viewport
            ? truncateString(compact.categories.metaTags.viewport, limits.longText)
            : undefined;
        compact.categories.metaTags.language = compact.categories.metaTags.language
            ? truncateString(compact.categories.metaTags.language, limits.longText)
            : undefined;
        compact.categories.metaTags.robots = compact.categories.metaTags.robots
            ? truncateString(compact.categories.metaTags.robots, limits.longText)
            : undefined;
        compact.categories.metaTags.favicon = compact.categories.metaTags.favicon
            ? truncateString(compact.categories.metaTags.favicon, limits.urlText)
            : undefined;
    }

    // Limit accessibility issues
    if (compact.categories?.accessibility?.issues) {
        compact.categories.accessibility.issues =
            compact.categories.accessibility.issues
                .slice(0, limits.accessibilityIssues)
                .map(issue => ({
                    ...issue,
                    element: issue.element ? truncateString(issue.element, limits.longText) : undefined,
                    message: truncateString(issue.message, limits.longText),
                }));
    }

    if (compact.categories?.accessibility?.ariaLandmarks) {
        compact.categories.accessibility.ariaLandmarks = compact.categories.accessibility.ariaLandmarks
            .slice(0, limits.ariaLandmarks)
            .map(landmark => truncateString(landmark, limits.longText));
    }

    // Remove screenshots from project doc (kept in audit_logs)
    delete compact.screenshot;
    delete compact.previousScreenshot;
    delete compact.mobileScreenshot;
    delete compact.tabletScreenshot;
    delete compact.desktopScreenshot;

    // Limit fieldChanges to avoid large diffs
    if (compact.fieldChanges) {
        compact.fieldChanges = compact.fieldChanges.slice(0, limits.fieldChanges).map(change => ({
            ...change,
            // Truncate large values in field changes
            oldValue: truncateFieldValue(change.oldValue, level) as FieldChange['oldValue'],
            newValue: truncateFieldValue(change.newValue, level) as FieldChange['newValue'],
        }));
    }

    // Truncate diffSummary and diffPatch
    if (compact.diffSummary) {
        compact.diffSummary = truncateString(compact.diffSummary, limits.diffSummary);
    }
    delete compact.diffPatch; // Remove full diff patch

    return compact;
}

/**
 * Truncate field values to prevent large data in compact result
 */
function truncateFieldValue(value: unknown, level: AuditCompactLevel = 'standard'): unknown {
    const limits = AUDIT_COMPACT_LIMITS[level];

    if (value === null || value === undefined) return value;
    
    if (typeof value === 'string') {
        return truncateString(value, limits.longText);
    }
    
    if (Array.isArray(value)) {
        // For arrays (images, links), just keep count
        if (value.length > 3) {
            return value.slice(0, 3); // Keep first 3 items
        }
        return value;
    }
    
    return value;
}

function truncateString(value: string | undefined, maxLength: number): string {
    if (!value) return '';
    return value.length > maxLength ? `${value.substring(0, maxLength)}...` : value;
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

    // Sections (DOM summary)
    const prevSections = (prevSnapshot as ExtendedContentSnapshot).sections || [];
    const newSections = (newSnapshot as ExtendedContentSnapshot).sections || [];

    const normalizeSection = (section: SectionInfo) => ({
        key: `${section.selector}|${section.headingText || ''}|${section.textPreview || ''}`.trim(),
        label: section.headingText
            ? `${section.headingText} - ${section.textPreview}`
            : section.textPreview || section.selector
    });

    if (prevSections.length > 0 || newSections.length > 0) {
        const prevNormalized = prevSections.map(normalizeSection);
        const newNormalized = newSections.map(normalizeSection);

        const prevKeys = new Set(prevNormalized.map(s => s.key));
        const newKeys = new Set(newNormalized.map(s => s.key));

        const addedSections = newNormalized.filter(s => !prevKeys.has(s.key)).map(s => s.label);
        const removedSections = prevNormalized.filter(s => !newKeys.has(s.key)).map(s => s.label);

        if (addedSections.length > 0 || removedSections.length > 0) {
            changes.push({
                field: 'sections',
                oldValue: removedSections.length > 0 ? removedSections : null,
                newValue: addedSections.length > 0 ? addedSections : null,
                changeType: addedSections.length > 0 && removedSections.length === 0
                    ? 'added'
                    : removedSections.length > 0 && addedSections.length === 0
                        ? 'removed'
                        : 'modified'
            });
        }
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

/**
 * Calculate similarity between two strings (0-1)
 * Uses a simple approach: what % of words are shared
 */
function stringSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    if (a === b) return 1;
    
    const aLower = a.toLowerCase().trim();
    const bLower = b.toLowerCase().trim();
    
    if (aLower === bLower) return 1;
    
    // Check if one contains the other (e.g., "Decaf" vs "Decaf (Web)")
    if (aLower.includes(bLower) || bLower.includes(aLower)) {
        const longer = Math.max(aLower.length, bLower.length);
        const shorter = Math.min(aLower.length, bLower.length);
        return shorter / longer;
    }
    
    // Word-based similarity
    const aWords = new Set(aLower.split(/\s+/).filter(w => w.length > 0));
    const bWords = new Set(bLower.split(/\s+/).filter(w => w.length > 0));
    
    let sharedCount = 0;
    for (const word of aWords) {
        if (bWords.has(word)) sharedCount++;
    }
    
    const totalUnique = new Set([...aWords, ...bWords]).size;
    return totalUnique > 0 ? sharedCount / totalUnique : 0;
}

/**
 * Compare content blocks between two snapshots and identify changes.
 * Uses fuzzy heading matching to detect modified blocks (e.g., "Decaf" → "Decaf (Web)")
 */
export function compareBlocks(
    prevBlocks: ContentBlock[] | undefined,
    newBlocks: ContentBlock[] | undefined
): BlockChange[] {
    const changes: BlockChange[] = [];
    
    const prev = prevBlocks || [];
    const curr = newBlocks || [];
    
    if (prev.length === 0 && curr.length === 0) return changes;
    
    // Track which blocks have been matched
    const matchedPrev = new Set<number>();
    const matchedCurr = new Set<number>();
    
    // Similarity threshold for considering a block as "modified" vs "added/removed"
    const SIMILARITY_THRESHOLD = 0.5;
    
    // First pass: Find exact heading matches
    for (let i = 0; i < curr.length; i++) {
        for (let j = 0; j < prev.length; j++) {
            if (matchedPrev.has(j) || matchedCurr.has(i)) continue;
            
            if (curr[i].heading === prev[j].heading) {
                // Exact match - check if content changed
                if (curr[i].html !== prev[j].html || curr[i].tag !== prev[j].tag) {
                    // Content changed but heading same
                    changes.push({
                        type: 'modified',
                        before: prev[j],
                        after: curr[i],
                        changeLabel: `${prev[j].heading} (content updated)`
                    });
                }
                // Mark as matched (whether changed or not)
                matchedPrev.add(j);
                matchedCurr.add(i);
                break;
            }
        }
    }
    
    // Second pass: Find similar headings (fuzzy match)
    for (let i = 0; i < curr.length; i++) {
        if (matchedCurr.has(i)) continue;
        
        let bestMatch = -1;
        let bestSimilarity = 0;
        
        for (let j = 0; j < prev.length; j++) {
            if (matchedPrev.has(j)) continue;
            
            const similarity = stringSimilarity(curr[i].heading, prev[j].heading);
            if (similarity > bestSimilarity && similarity >= SIMILARITY_THRESHOLD) {
                bestMatch = j;
                bestSimilarity = similarity;
            }
        }
        
        if (bestMatch >= 0) {
            // Found a similar block - this is a modification
            changes.push({
                type: 'modified',
                before: prev[bestMatch],
                after: curr[i],
                changeLabel: `${prev[bestMatch].heading} → ${curr[i].heading}`
            });
            matchedPrev.add(bestMatch);
            matchedCurr.add(i);
        }
    }
    
    // Remaining unmatched prev blocks are removed
    for (let j = 0; j < prev.length; j++) {
        if (!matchedPrev.has(j)) {
            changes.push({
                type: 'removed',
                before: prev[j],
                changeLabel: prev[j].heading
            });
        }
    }
    
    // Remaining unmatched curr blocks are added
    for (let i = 0; i < curr.length; i++) {
        if (!matchedCurr.has(i)) {
            changes.push({
                type: 'added',
                after: curr[i],
                changeLabel: curr[i].heading
            });
        }
    }
    
    // Sort by type: modified first, then removed, then added
    const typeOrder = { modified: 0, removed: 1, added: 2 };
    changes.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);
    
    return changes;
}

/**
 * Compare text elements between two snapshots to detect granular DOM changes
 */
export function compareTextElements(
    prevElements: TextElement[] | undefined,
    newElements: TextElement[] | undefined
): TextChange[] {
    const changes: TextChange[] = [];
    
    const prev = prevElements || [];
    const curr = newElements || [];
    
    if (prev.length === 0 && curr.length === 0) return changes;
    
    // Create maps for matching by text content
    const prevByText = new Map<string, TextElement>();
    const currByText = new Map<string, TextElement>();
    
    // Also track by selector + approximate position
    prev.forEach(el => {
        prevByText.set(el.text, el);
    });
    
    curr.forEach(el => {
        currByText.set(el.text, el);
    });
    
    // Track matched elements
    const matchedPrev = new Set<string>();
    const matchedCurr = new Set<string>();
    
    // First pass: find exact text matches (no change or just HTML change)
    for (const [text, currEl] of currByText) {
        if (prevByText.has(text)) {
            // Exact match - no text change
            matchedPrev.add(text);
            matchedCurr.add(text);
        }
    }
    
    // Second pass: find similar texts (modified)
    for (const [currText, currEl] of currByText) {
        if (matchedCurr.has(currText)) continue;
        
        // Look for similar text in prev
        let bestMatch: { text: string; el: TextElement; similarity: number } | null = null;
        
        for (const [prevText, prevEl] of prevByText) {
            if (matchedPrev.has(prevText)) continue;
            
            // Check if texts are similar (one contains the other or high word overlap)
            const similarity = textSimilarity(prevText, currText);
            if (similarity > 0.3 && (!bestMatch || similarity > bestMatch.similarity)) {
                bestMatch = { text: prevText, el: prevEl, similarity };
            }
        }
        
        if (bestMatch) {
            // Found a match - this is a modification
            changes.push({
                type: 'modified',
                selector: currEl.selector,
                beforeText: bestMatch.el.text,
                afterText: currEl.text,
                beforeHtml: bestMatch.el.html,
                afterHtml: currEl.html
            });
            matchedPrev.add(bestMatch.text);
            matchedCurr.add(currText);
        }
    }
    
    // Remaining unmatched prev elements are removed
    for (const [text, el] of prevByText) {
        if (!matchedPrev.has(text)) {
            changes.push({
                type: 'removed',
                selector: el.selector,
                beforeText: el.text,
                beforeHtml: el.html
            });
        }
    }
    
    // Remaining unmatched curr elements are added
    for (const [text, el] of currByText) {
        if (!matchedCurr.has(text)) {
            changes.push({
                type: 'added',
                selector: el.selector,
                afterText: el.text,
                afterHtml: el.html
            });
        }
    }
    
    // Sort by type: modified first, then removed, then added
    const typeOrder = { modified: 0, removed: 1, added: 2 };
    changes.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);
    
    return changes;
}

/**
 * Calculate text similarity based on word overlap and containment
 */
function textSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    if (a === b) return 1;
    
    const aLower = a.toLowerCase().trim();
    const bLower = b.toLowerCase().trim();
    
    if (aLower === bLower) return 1;
    
    // Check containment
    if (aLower.includes(bLower) || bLower.includes(aLower)) {
        const longer = Math.max(aLower.length, bLower.length);
        const shorter = Math.min(aLower.length, bLower.length);
        return shorter / longer;
    }
    
    // Word-based overlap
    const aWords = new Set(aLower.split(/\s+/).filter(w => w.length > 1));
    const bWords = new Set(bLower.split(/\s+/).filter(w => w.length > 1));
    
    let overlap = 0;
    for (const word of aWords) {
        if (bWords.has(word)) overlap++;
    }
    
    const totalUnique = new Set([...aWords, ...bWords]).size;
    return totalUnique > 0 ? overlap / totalUnique : 0;
}
