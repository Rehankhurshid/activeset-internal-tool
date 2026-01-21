import { ChangeStatus, FieldChange, ExtendedContentSnapshot, ContentSnapshot, AuditResult, SectionInfo, ContentBlock, BlockChange, TextElement, TextChange } from '@/types';
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
