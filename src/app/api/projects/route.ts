import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

/**
 * GET /api/projects
 * Get all projects (for Chrome extension dropdown)
 * Note: This is a simplified endpoint - in production you'd want auth
 */
export async function GET(req: NextRequest) {
    try {
        // For the Chrome extension, we return all projects
        // In a production app, you'd filter by authenticated user
        const projectsSnapshot = await db.collection('projects')
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();

        const projects = projectsSnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name || 'Untitled Project',
            createdAt: doc.data().createdAt,
            webflowConfig: doc.data().webflowConfig ? {
                customDomain: doc.data().webflowConfig.customDomain
            } : undefined
        }));

        return NextResponse.json({
            success: true,
            projects
        });

    } catch (error) {
        console.error('[API] /api/projects GET error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error', projects: [] },
            { status: 500 }
        );
    }
}
