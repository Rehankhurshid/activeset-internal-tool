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
        const { projectId, url } = await request.json();
        if (!projectId || !url) return NextResponse.json({ error: 'Missing params' }, { status: 400, headers: corsHeaders });

        const project = await projectsService.getProject(projectId);
        if (!project) return NextResponse.json({ enableSpellcheck: false }, { headers: corsHeaders });

        try {
            const parsedUrl = new URL(url);
            const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);

            if (pathSegments.length < 1) {
                return NextResponse.json({ enableSpellcheck: true }, { headers: corsHeaders });
            }

            const section = pathSegments[0];

            // Count links in this section
            const sectionCount = project.links.filter(l => {
                if (!l.url) return false;
                try {
                    const u = new URL(l.url);
                    const segments = u.pathname.split('/').filter(Boolean);
                    return segments.length > 0 && segments[0] === section;
                } catch { return false; }
            }).length;

            const THRESHOLD = 20;

            if (sectionCount > THRESHOLD) {
                return NextResponse.json({
                    enableSpellcheck: false,
                    reason: `High volume folder: /${section} (${sectionCount} pages)`
                }, { headers: corsHeaders });
            }

            return NextResponse.json({ enableSpellcheck: true }, { headers: corsHeaders });

        } catch (e) {
            return NextResponse.json({ enableSpellcheck: true }, { headers: corsHeaders });
        }
    } catch (e) {
        console.error('Audit Config Error:', e);
        return NextResponse.json({ enableSpellcheck: true }, { headers: corsHeaders });
    }
}
