import { NextRequest, NextResponse } from 'next/server';
import { projectsService } from '@/services/database';
import type { ChangeStatus, AuditResult } from '@/types';

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

        // Build final audit result with changeStatus
        const finalAuditResult: AuditResult = {
            ...auditResult,
            score: auditResult.overallScore || auditResult.score || 0,
            changeStatus,
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
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
    }
}
