import { NextRequest, NextResponse } from 'next/server';
import { projectsService } from '@/services/database';

export async function POST(request: NextRequest) {
    try {
        const { projectId, url } = await request.json();
        if (!projectId || !url) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

        const project = await projectsService.getProject(projectId);
        if (!project) return NextResponse.json({ enableSpellcheck: false });

        try {
            const parsedUrl = new URL(url);
            const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);

            // Always enable for root or unknown structure
            if (pathSegments.length < 1) {
                return NextResponse.json({ enableSpellcheck: true });
            }

            const section = pathSegments[0]; // e.g., "blogs"

            // Count links in this section
            const sectionCount = project.links.filter(l => {
                if (!l.url) return false;
                try {
                    const u = new URL(l.url);
                    const segments = u.pathname.split('/').filter(Boolean);
                    return segments.length > 0 && segments[0] === section;
                } catch { return false; }
            }).length;

            // Threshold from user request
            const THRESHOLD = 20;

            if (sectionCount > THRESHOLD) {
                return NextResponse.json({
                    enableSpellcheck: false,
                    reason: `High volume folder: /${section} (${sectionCount} pages)`
                });
            }

            return NextResponse.json({ enableSpellcheck: true });

        } catch (e) {
            return NextResponse.json({ enableSpellcheck: true });
        }
    } catch (e) {
        // Fail open (allow audit) on error, or fail closed? 
        // Fail closed to save money? 
        // User priority is "avoid unnecessary cost". So maybe default false?
        // But "Sync data" is also priority.
        // Let's default true but log error.
        console.error('Audit Config Error:', e);
        return NextResponse.json({ enableSpellcheck: true });
    }
}
