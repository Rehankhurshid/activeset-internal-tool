import { NextRequest, NextResponse } from 'next/server';
import { projectsService } from '@/services/database';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
    try {
        const { projectId, url, auditResult } = await request.json();

        if (!projectId || !url || !auditResult) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400, headers: corsHeaders });
        }

        const project = await projectsService.getProject(projectId);
        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: corsHeaders });

        const normalize = (u: string) => {
            try {
                // If u doesn't start with http, assume it might be a relative path or just handle graceful fallback
                const urlStr = u.startsWith('http') ? u : `https://${u}`;
                const urlObj = new URL(urlStr);
                // Remove query params and hash
                // Normalize pathname: remove trailing slash
                const pathname = urlObj.pathname.replace(/\/$/, '');
                return `${urlObj.origin}${pathname}`.toLowerCase();
            } catch (e) {
                // Fallback for malformed URLs
                return u.split('?')[0].replace(/\/$/, '').toLowerCase();
            }
        };
        const targetUrl = normalize(url);

        const link = project.links.find(l => l.url && normalize(l.url) === targetUrl);

        if (link) {
            await projectsService.updateLink(projectId, link.id, {
                auditResult: {
                    ...auditResult,
                    lastRun: new Date().toISOString()
                }
            });
            return NextResponse.json({ success: true, linkId: link.id }, { headers: corsHeaders });
        } else {
            return NextResponse.json({ warning: 'Link not tracked in project' }, { headers: corsHeaders });
        }

    } catch (error) {
        console.error('Save Audit Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
    }
}
