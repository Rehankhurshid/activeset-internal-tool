import { NextRequest, NextResponse } from 'next/server';
import { projectsService } from '@/services/database';
import type { ChangeStatus, AuditResult, ContentSnapshot, FieldChange, ExtendedContentSnapshot, ChangeLogEntry, ImageInfo, LinkInfo, SectionInfo } from '@/types';
import { auditService } from '@/services/AuditService';
import { changeLogService } from '@/services/ChangeLogService';
import { createTwoFilesPatch } from 'diff';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * Compute change status by comparing new hashes against previous scan.
 */
function computeChangeStatus(
    newFullHash: string | undefined,
    newContentHash: string | undefined,
    prevFullHash: string | undefined,
    prevContentHash: string | undefined
): ChangeStatus {
    // If we don't have hashes, treat as content changed (first scan or error)
    if (!newFullHash || !newContentHash) {
        return 'SCAN_FAILED';
    }

    // First scan - no previous hashes
    if (!prevFullHash || !prevContentHash) {
        return 'CONTENT_CHANGED';
    }

    // Compare hashes
    const fullHashSame = newFullHash === prevFullHash;
    const contentHashSame = newContentHash === prevContentHash;

    if (fullHashSame && contentHashSame) {
        return 'NO_CHANGE';
    } else if (!contentHashSame) {
        // Content changed (main content text changed)
        return 'CONTENT_CHANGED';
    } else {
        // fullHash changed but contentHash same = tech-only change
        return 'TECH_CHANGE_ONLY';
    }
}

/**
 * Compare snapshots and generate detailed field changes with before/after values.
 * This is the smart change detection that powers the change log.
 */
function computeFieldChanges(
    newSnapshot: ExtendedContentSnapshot | ContentSnapshot | undefined,
    prevSnapshot: ExtendedContentSnapshot | ContentSnapshot | undefined
): FieldChange[] {
    if (!newSnapshot || !prevSnapshot) {
        return [];
    }

    const changes: FieldChange[] = [];

    // Title change
    if (newSnapshot.title !== prevSnapshot.title) {
        changes.push({
            field: 'title',
            oldValue: prevSnapshot.title || null,
            newValue: newSnapshot.title || null,
            changeType: !prevSnapshot.title ? 'added' : !newSnapshot.title ? 'removed' : 'modified'
        });
    }

    // H1 change
    if (newSnapshot.h1 !== prevSnapshot.h1) {
        changes.push({
            field: 'h1',
            oldValue: prevSnapshot.h1 || null,
            newValue: newSnapshot.h1 || null,
            changeType: !prevSnapshot.h1 ? 'added' : !newSnapshot.h1 ? 'removed' : 'modified'
        });
    }

    // Meta Description change
    if (newSnapshot.metaDescription !== prevSnapshot.metaDescription) {
        changes.push({
            field: 'metaDescription',
            oldValue: prevSnapshot.metaDescription || null,
            newValue: newSnapshot.metaDescription || null,
            changeType: !prevSnapshot.metaDescription ? 'added' : !newSnapshot.metaDescription ? 'removed' : 'modified'
        });
    }

    // Word Count change (only if significant: > 5% or > 50 words)
    const wcDiff = newSnapshot.wordCount - prevSnapshot.wordCount;
    const wcPercent = prevSnapshot.wordCount > 0 ? Math.abs(wcDiff / prevSnapshot.wordCount) * 100 : 100;
    if (wcPercent > 5 || Math.abs(wcDiff) > 50) {
        changes.push({
            field: 'wordCount',
            oldValue: prevSnapshot.wordCount,
            newValue: newSnapshot.wordCount,
            changeType: 'modified'
        });
    }

    // Headings structure change
    if (JSON.stringify(newSnapshot.headings) !== JSON.stringify(prevSnapshot.headings)) {
        changes.push({
            field: 'headings',
            oldValue: prevSnapshot.headings,
            newValue: newSnapshot.headings,
            changeType: 'modified'
        });
    }

    // Extended fields (images, links) - only if available
    const extNew = newSnapshot as ExtendedContentSnapshot;
    const extPrev = prevSnapshot as ExtendedContentSnapshot;

    // Images: detect added/removed
    if (extNew.images && extPrev.images) {
        const prevImageSrcs = new Set(extPrev.images.map((i: ImageInfo) => i.src));
        const newImageSrcs = new Set(extNew.images.map((i: ImageInfo) => i.src));

        const addedImages = extNew.images.filter((i: ImageInfo) => !prevImageSrcs.has(i.src));
        const removedImages = extPrev.images.filter((i: ImageInfo) => !newImageSrcs.has(i.src));

        if (addedImages.length > 0) {
            changes.push({
                field: 'images',
                oldValue: null,
                newValue: addedImages,
                changeType: 'added'
            });
        }
        if (removedImages.length > 0) {
            changes.push({
                field: 'images',
                oldValue: removedImages,
                newValue: null,
                changeType: 'removed'
            });
        }
    }

    // Links: detect added/removed
    if (extNew.links && extPrev.links) {
        const prevLinkHrefs = new Set(extPrev.links.map((l: LinkInfo) => l.href));
        const newLinkHrefs = new Set(extNew.links.map((l: LinkInfo) => l.href));

        const addedLinks = extNew.links.filter((l: LinkInfo) => !prevLinkHrefs.has(l.href));
        const removedLinks = extPrev.links.filter((l: LinkInfo) => !newLinkHrefs.has(l.href));

        if (addedLinks.length > 0) {
            changes.push({
                field: 'links',
                oldValue: null,
                newValue: addedLinks,
                changeType: 'added'
            });
        }
        if (removedLinks.length > 0) {
            changes.push({
                field: 'links',
                oldValue: removedLinks,
                newValue: null,
                changeType: 'removed'
            });
        }
    }

    // Sections: detect added/removed blocks for DOM summary
    if (extNew.sections && extPrev.sections) {
        const normalizeSection = (section: SectionInfo) => ({
            key: `${section.selector}|${section.headingText || ''}|${section.textPreview || ''}`.trim(),
            label: section.headingText
                ? `${section.headingText} - ${section.textPreview}`
                : section.textPreview || section.selector
        });

        const prevNormalized = extPrev.sections.map(normalizeSection);
        const newNormalized = extNew.sections.map(normalizeSection);

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

    // Body text hash change (catch-all for text changes not caught by specific fields)
    if (extNew.bodyTextHash && extPrev.bodyTextHash && extNew.bodyTextHash !== extPrev.bodyTextHash) {
        // Only add if no other specific text changes detected
        const hasTextChanges = changes.some(c =>
            ['title', 'h1', 'metaDescription', 'wordCount', 'headings'].includes(c.field)
        );
        if (!hasTextChanges) {
            changes.push({
                field: 'bodyText',
                oldValue: '[content changed]',
                newValue: '[see page for details]',
                changeType: 'modified'
            });
        }
    }

    return changes;
}

/**
 * Generate human-readable summary from field changes
 */
function generateChangeSummary(changes: FieldChange[]): string {
    if (changes.length === 0) return '';

    const summaryParts: string[] = [];

    changes.forEach(change => {
        switch (change.field) {
            case 'title':
                summaryParts.push(`Title ${change.changeType}`);
                break;
            case 'h1':
                summaryParts.push(`H1 ${change.changeType}`);
                break;
            case 'metaDescription':
                summaryParts.push(`Meta description ${change.changeType}`);
                break;
            case 'wordCount':
                const diff = (change.newValue as number) - (change.oldValue as number);
                summaryParts.push(`Word count ${diff > 0 ? '+' : ''}${diff}`);
                break;
            case 'headings':
                summaryParts.push('Heading structure changed');
                break;
            case 'images':
                if (change.changeType === 'added') {
                    summaryParts.push(`${(change.newValue as ImageInfo[]).length} image(s) added`);
                } else if (change.changeType === 'removed') {
                    summaryParts.push(`${(change.oldValue as ImageInfo[]).length} image(s) removed`);
                }
                break;
            case 'links':
                if (change.changeType === 'added') {
                    summaryParts.push(`${(change.newValue as LinkInfo[]).length} link(s) added`);
                } else if (change.changeType === 'removed') {
                    summaryParts.push(`${(change.oldValue as LinkInfo[]).length} link(s) removed`);
                }
                break;
            case 'bodyText':
                summaryParts.push('Body text modified');
                break;
        }
    });

    return summaryParts.join(', ');
}

export async function POST(request: NextRequest) {
    try {
        const { projectId, url, auditResult, title } = await request.json();

        if (!projectId || !url || !auditResult) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400, headers: corsHeaders });
        }

        const project = await projectsService.getProject(projectId);
        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders });

        const normalize = (u: string) => {
            try {
                const urlStr = u.startsWith('http') ? u : `https://${u}`;
                const urlObj = new URL(urlStr);
                const pathname = urlObj.pathname.replace(/\/$/, '');
                return `${urlObj.origin}${pathname}`.toLowerCase();
            } catch (e) {
                return u.split('?')[0].replace(/\/$/, '').toLowerCase();
            }
        };
        const targetUrl = normalize(url);

        const link = project.links.find(l => l.url && normalize(l.url) === targetUrl);

        // Get previous audit result if link exists
        const prevAudit = link?.auditResult as AuditResult | undefined;

        // --- Source Diffing Logic ---
        let diffPatch: string | undefined;
        let diffSummary = '';
        let changedFields: string[] = [];

        // Try to fetch previous source for true diff
        const linkId = link?.id || 'temp_link_id';
        const prevLog = await auditService.getLatestAuditLog(projectId, linkId);

        if (prevLog && auditResult.htmlSource && prevLog.htmlSource) {
            // Compute unified diff if source changed
            if (auditResult.fullHash !== prevLog.fullHash) {
                // Generate a patch
                try {
                    diffPatch = createTwoFilesPatch(
                        'Previous Version',
                        'Current Version',
                        prevLog.htmlSource,
                        auditResult.htmlSource,
                        'Old Source',
                        'New Source',
                        { context: 3 }
                    );
                } catch (e) {
                    console.error('Diff generation failed:', e);
                }
            }
        }

        // Compute change status
        const changeStatus = computeChangeStatus(
            auditResult.fullHash,
            auditResult.contentHash,
            prevAudit?.fullHash,
            prevAudit?.contentHash
        );

        // Compute detailed field changes with before/after values
        let fieldChanges: FieldChange[] = [];

        // Get previous change log entry for comparison (has extended snapshot)
        const prevChangeLogEntry = link ? await changeLogService.getLatestEntry(link.id) : null;
        const prevSnapshot = prevChangeLogEntry?.contentSnapshot || prevAudit?.contentSnapshot;

        if (changeStatus === 'CONTENT_CHANGED' && prevSnapshot && auditResult.contentSnapshot) {
            fieldChanges = computeFieldChanges(auditResult.contentSnapshot, prevSnapshot);
            diffSummary = generateChangeSummary(fieldChanges);
            changedFields = fieldChanges.map(c => c.field);

            // If hash changed but no specific fields changed, assume body text changed
            if (fieldChanges.length === 0) {
                fieldChanges.push({
                    field: 'bodyText',
                    oldValue: '[content changed]',
                    newValue: '[see page for details]',
                    changeType: 'modified'
                });
                changedFields.push('bodyText');
                diffSummary = 'Main content text modified';
            }
        } else if (changeStatus === 'TECH_CHANGE_ONLY') {
            diffSummary = 'Structure/Code changed (no text impact)';
        }

        // Save full source to Audit Logs (separate collection)
        if (auditResult.htmlSource && link) {
            await auditService.saveAuditLog({
                projectId,
                linkId: link.id,
                url,
                fullHash: auditResult.fullHash,
                contentHash: auditResult.contentHash,
                htmlSource: auditResult.htmlSource,
                diffPatch: diffPatch || null
            });
        }

        // Save to Change Log (content_changes collection) for history timeline
        // Only save if there are actual changes (skip NO_CHANGE to save storage)
        const isFirstScan = !prevAudit && !prevChangeLogEntry;
        if (link && (changeStatus === 'CONTENT_CHANGED' || changeStatus === 'TECH_CHANGE_ONLY' || isFirstScan)) {
            const changeLogEntry: Omit<ChangeLogEntry, 'id'> = {
                projectId,
                linkId: link.id,
                url,
                timestamp: new Date().toISOString(),
                changeType: isFirstScan ? 'FIRST_SCAN' : changeStatus as 'CONTENT_CHANGED' | 'TECH_CHANGE_ONLY',
                fieldChanges: fieldChanges,
                summary: isFirstScan ? 'Initial scan' : diffSummary,
                contentSnapshot: auditResult.contentSnapshot,
                fullHash: auditResult.fullHash,
                contentHash: auditResult.contentHash,
                auditScore: auditResult.overallScore || auditResult.score || 0
            };

            await changeLogService.saveEntry(changeLogEntry);
        }

        // Remove massive fields before saving to Project document
        const { htmlSource, ...cleanAuditResult } = auditResult;

        // Build final audit result with changeStatus (ensure no undefined values for Firestore)
        const finalAuditResult: AuditResult = {
            ...cleanAuditResult,
            score: auditResult.overallScore || auditResult.score || 0,
            changeStatus,
            changedFields,
            fieldChanges: fieldChanges.length > 0 ? fieldChanges : undefined, // Include before/after values
            diffSummary,
            lastRun: new Date().toISOString()
        };

        // Conditionally add diffPatch if it exists (Firestore throws on undefined)
        if (diffPatch) {
            finalAuditResult.diffPatch = diffPatch;
        }



        if (link) {
            await projectsService.updateLink(projectId, link.id, {
                auditResult: finalAuditResult
            });

            return NextResponse.json({
                success: true,
                linkId: link.id,
                changeStatus,
                diffSummary
            }, { headers: corsHeaders });
        } else {
            // Auto-create new link for discovered page
            await projectsService.addLinkToProject(projectId, {
                title: title || new URL(url).pathname || 'Untitled Page',
                url: url, // Use original URL
                order: project.links.length,
                isDefault: false,
                source: 'auto',
                auditResult: finalAuditResult
            });

            return NextResponse.json({
                success: true,
                created: true,
                changeStatus
            }, { headers: corsHeaders });
        }

    } catch (error) {
        console.error('Save Audit Error:', error);
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('Error details:', errMsg);
        return NextResponse.json({ error: 'Internal Server Error', details: errMsg }, { status: 500, headers: corsHeaders });
    }
}
