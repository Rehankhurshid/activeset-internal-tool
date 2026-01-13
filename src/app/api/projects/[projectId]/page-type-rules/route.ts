import { NextRequest, NextResponse } from 'next/server';
import { projectsService } from '@/services/database';
import { PageTypeRule } from '@/types';

/**
 * GET /api/projects/[projectId]/page-type-rules
 * Get all page type rules for a project
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params;

        const project = await projectsService.getProject(projectId);
        if (!project) {
            return NextResponse.json(
                { error: 'Project not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            rules: project.pageTypeRules || []
        });

    } catch (error) {
        console.error('Failed to get page type rules:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/projects/[projectId]/page-type-rules
 * Add a new page type rule
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params;
        const body = await request.json();
        const { pattern, pageType } = body;

        if (!pattern || !pageType) {
            return NextResponse.json(
                { error: 'Missing pattern or pageType' },
                { status: 400 }
            );
        }

        if (!['static', 'collection'].includes(pageType)) {
            return NextResponse.json(
                { error: 'Invalid pageType. Must be "static" or "collection"' },
                { status: 400 }
            );
        }

        const project = await projectsService.getProject(projectId);
        if (!project) {
            return NextResponse.json(
                { error: 'Project not found' },
                { status: 404 }
            );
        }

        const existingRules = project.pageTypeRules || [];

        // Check for duplicate pattern
        if (existingRules.some(r => r.pattern.toLowerCase() === pattern.toLowerCase())) {
            return NextResponse.json(
                { error: 'A rule with this pattern already exists' },
                { status: 400 }
            );
        }

        const newRule: PageTypeRule = {
            id: crypto.randomUUID(),
            pattern: pattern.startsWith('/') ? pattern : `/${pattern}`,
            pageType,
            priority: existingRules.length // New rules get lowest priority
        };

        const updatedRules = [...existingRules, newRule];
        await projectsService.updateProjectPageTypeRules(projectId, updatedRules);

        return NextResponse.json({
            success: true,
            rule: newRule,
            rules: updatedRules
        });

    } catch (error) {
        console.error('Failed to add page type rule:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/projects/[projectId]/page-type-rules
 * Update all rules (for reordering or bulk updates)
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params;
        const body = await request.json();
        const { rules } = body;

        if (!Array.isArray(rules)) {
            return NextResponse.json(
                { error: 'Rules must be an array' },
                { status: 400 }
            );
        }

        const project = await projectsService.getProject(projectId);
        if (!project) {
            return NextResponse.json(
                { error: 'Project not found' },
                { status: 404 }
            );
        }

        await projectsService.updateProjectPageTypeRules(projectId, rules);

        return NextResponse.json({
            success: true,
            rules
        });

    } catch (error) {
        console.error('Failed to update page type rules:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
