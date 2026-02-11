import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

/**
 * POST /api/webflow-settings
 * Save Webflow settings audit results for a project
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const {
            projectId,
            siteSlug,
            auditDate,
            results,
            score,
            passedCount,
            totalCount
        } = body;

        if (!projectId) {
            return NextResponse.json(
                { success: false, error: 'Project ID is required' },
                { status: 400 }
            );
        }

        // Update project with audit results
        const projectRef = db.collection('projects').doc(projectId);
        const projectDoc = await projectRef.get();

        if (!projectDoc.exists) {
            return NextResponse.json(
                { success: false, error: 'Project not found' },
                { status: 404 }
            );
        }

        // Store the audit results
        const auditData = {
            webflowSettingsAudit: {
                lastAuditDate: auditDate || new Date().toISOString(),
                siteSlug: siteSlug || '',
                score: score || 0,
                passedCount: passedCount || 0,
                totalCount: totalCount || 17,
                results: {
                    general: results?.general || null,
                    publishing: results?.publishing || null,
                    seo: results?.seo || null
                }
            }
        };

        await projectRef.update(auditData);

        return NextResponse.json({
            success: true,
            message: 'Audit results saved successfully',
            data: auditData
        });

    } catch (error) {
        console.error('[API] /api/webflow-settings POST error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/webflow-settings?projectId=xxx
 * Get Webflow settings audit results for a project
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const projectId = searchParams.get('projectId');

        if (!projectId) {
            return NextResponse.json(
                { success: false, error: 'Project ID is required' },
                { status: 400 }
            );
        }

        const projectRef = db.collection('projects').doc(projectId);
        const projectDoc = await projectRef.get();

        if (!projectDoc.exists) {
            return NextResponse.json(
                { success: false, error: 'Project not found' },
                { status: 404 }
            );
        }

        const data = projectDoc.data();
        const audit = data?.webflowSettingsAudit || null;

        return NextResponse.json({
            success: true,
            audit
        });

    } catch (error) {
        console.error('[API] /api/webflow-settings GET error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
