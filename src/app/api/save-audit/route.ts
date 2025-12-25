import { NextRequest, NextResponse } from 'next/server';
import { projectsService } from '@/services/database';

export async function POST(request: NextRequest) {
    try {
        const { projectId, url, auditResult } = await request.json();

        if (!projectId || !url || !auditResult) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }

        const project = await projectsService.getProject(projectId);
        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        // Find link by URL (flexible match logic if needed, exact for now)
        // Ensure normalization (trailing slash, query params?)
        // Standardize: strip trailing slash
        const normalize = (u: string) => u.replace(/\/$/, '').toLowerCase();
        const targetUrl = normalize(url);

        const link = project.links.find(l => l.url && normalize(l.url) === targetUrl);

        if (link) {
            await projectsService.updateLink(projectId, link.id, {
                auditResult: {
                    ...auditResult,
                    lastRun: new Date().toISOString()
                }
            });
            return NextResponse.json({ success: true, linkId: link.id });
        } else {
            // Link not found in project. Should we create it?
            // User said "We scan all... or it updates based on visit".
            // If visit, maybe we should auto-add the page to the project?
            // "Some website has 1000+ pages...". If we auto-add, we fill the DB.
            // But if we don't save, we don't "sync".
            // Let's assume ONLY valid Project Links are tracked for now, or just return skipped.
            // "or it updates based on the visit".
            // If I visit a page NOT in the list, I can't update a link.
            // I'll return "Link not tracked" for now, to avoid polluting DB with random 404s/test pages.
            return NextResponse.json({ warning: 'Link not tracked in project' });
        }

    } catch (error) {
        console.error('Save Audit Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
