import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import {
  ExtensionAuthError,
  extensionAuthErrorResponse,
  requireCallerOrExtensionToken,
} from '@/lib/extension-tokens';

const EXTENSION_SLUG = 'webflow-settings-auditor';

/**
 * GET /api/projects
 *
 * The project list for the Webflow Settings Auditor's "save to project"
 * dropdown. Accepts a signed-in @activeset.co session or the auditor's paired
 * extension token — see requireCallerOrExtensionToken.
 */
export async function GET(req: NextRequest) {
    try {
        await requireCallerOrExtensionToken(req, EXTENSION_SLUG);

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
        if (error instanceof ExtensionAuthError) return extensionAuthErrorResponse(error);
        console.error('[API] /api/projects GET error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error', projects: [] },
            { status: 500 }
        );
    }
}
