import { NextRequest, NextResponse } from 'next/server';
import { AuditService } from '@/services/AuditService';
import { changeLogService } from '@/services/ChangeLogService';

/**
 * Cleanup cron job to remove old audit logs and content changes
 * 
 * This endpoint should be triggered weekly by your hosting platform's cron scheduler:
 * - Vercel: vercel.json with crons config
 * - Railway: Add a scheduled job
 * - Other: External cron service hitting this endpoint
 * 
 * Query params:
 * - maxAgeDays: Number of days to keep (default: 30)
 * - keepPerLink: Minimum logs to keep per link (default: 2)
 * 
 * Security: Requires CRON_SECRET header in production
 */
export async function GET(request: NextRequest) {
    // Check for cron secret (required for production)
    const cronSecret = request.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET;

    if (expectedSecret && cronSecret !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const maxAgeDays = parseInt(searchParams.get('maxAgeDays') || '30', 10);
    const keepPerLink = parseInt(searchParams.get('keepPerLink') || '2', 10);

    console.log(`[cleanup] Starting cleanup job at ${new Date().toISOString()}`);
    console.log(`[cleanup] Config: maxAgeDays=${maxAgeDays}, keepPerLink=${keepPerLink}`);

    try {
        // Clean up old audit logs
        const auditLogResult = await AuditService.cleanupOldAuditLogs(maxAgeDays, keepPerLink);
        console.log(`[cleanup] Audit logs: deleted ${auditLogResult.deleted}, kept ${auditLogResult.kept}`);

        // Clean up old content changes
        const contentChangesResult = await changeLogService.cleanupOldEntries(maxAgeDays, keepPerLink);
        console.log(`[cleanup] Content changes: deleted ${contentChangesResult.deleted}, kept ${contentChangesResult.kept}`);

        // Calculate estimated storage saved (rough estimate: 100KB per audit log)
        const estimatedBytesSaved = auditLogResult.deleted * 100000;
        const estimatedMBSaved = (estimatedBytesSaved / (1024 * 1024)).toFixed(2);

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            config: { maxAgeDays, keepPerLink },
            auditLogs: auditLogResult,
            contentChanges: contentChangesResult,
            estimatedStorageSaved: `${estimatedMBSaved} MB`
        });

    } catch (error) {
        console.error('[cleanup] Cleanup failed:', error);
        return NextResponse.json(
            { error: 'Cleanup failed', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
    return GET(request);
}
