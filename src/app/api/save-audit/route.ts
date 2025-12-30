import { NextRequest, NextResponse } from 'next/server';
import { projectsService } from '@/services/database';
import type { ChangeStatus, AuditResult, ContentSnapshot } from '@/types';

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
 * Compare snapshots to find specific changed fields.
 */
function computeDetailedChanges(
    newSnapshot: ContentSnapshot | undefined,
    prevSnapshot: ContentSnapshot | undefined
): { changedFields: string[], diffSummary: string } {
    if (!newSnapshot || !prevSnapshot) {
        return { changedFields: [], diffSummary: '' };
    }

    const changes: string[] = [];
    const summaryParts: string[] = [];

    if (newSnapshot.title !== prevSnapshot.title) {
        changes.push('title');
        summaryParts.push('Page Title updated');
    }

    if (newSnapshot.h1 !== prevSnapshot.h1) {
        changes.push('h1');
        summaryParts.push('H1 Heading updated');
    }

    if (newSnapshot.metaDescription !== prevSnapshot.metaDescription) {
        changes.push('metaDescription');
        summaryParts.push('Meta Description updated');
    }

    const wcDiff = newSnapshot.wordCount - prevSnapshot.wordCount;
    if (Math.abs(wcDiff) > 5) { // Ignore minor fluctuations
        changes.push('wordCount');
        summaryParts.push(`Word count ${wcDiff > 0 ? '+' : ''}${wcDiff}`);
    }

    // Naive heading structure check
    if (JSON.stringify(newSnapshot.headings) !== JSON.stringify(prevSnapshot.headings)) {
        changes.push('headings');
        summaryParts.push('Heading structure modified');
    }

    return {
        changedFields: changes,
        diffSummary: summaryParts.join(', ')
    };
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

        // Compute change status
        const changeStatus = computeChangeStatus(
            auditResult.fullHash,
            auditResult.contentHash,
            prevAudit?.fullHash,
            prevAudit?.contentHash
        );

        // Compute detailed changes if content changed
        let changedFields: string[] = [];
        let diffSummary = '';

        if (changeStatus === 'CONTENT_CHANGED' && prevAudit?.contentSnapshot && auditResult.contentSnapshot) {
            const details = computeDetailedChanges(auditResult.contentSnapshot, prevAudit.contentSnapshot);
            changedFields = details.changedFields;
            diffSummary = details.diffSummary;

            // If hash changed but no specific metadata changed, assume body text changed
            if (changedFields.length === 0) {
                changedFields.push('body');
                diffSummary = 'Main content text modified';
            }
        }

        // Build final audit result with changeStatus
        const finalAuditResult: AuditResult = {
            ...auditResult,
            score: auditResult.overallScore || auditResult.score || 0,
            changeStatus,
            changedFields,
            diffSummary,
            lastRun: new Date().toISOString()
        };

        if (link) {
            await projectsService.updateLink(projectId, link.id, {
                auditResult: finalAuditResult
            });

            return NextResponse.json({
                success: true,
                linkId: link.id,
                changeStatus
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
