import { NextRequest, NextResponse } from "next/server";
import { auditService } from "@/services/AuditService";
import { computeHtmlDiff, wrapDiffHtml } from "@/lib/html-diff";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get("projectId");
    const linkId = searchParams.get("linkId");

    if (!projectId || !linkId) {
      return NextResponse.json(
        { error: "Missing projectId or linkId" },
        { status: 400 }
      );
    }

    // Get the two most recent audit logs for comparison
    const logs = await auditService.getRecentAuditLogs(projectId, linkId, 2);

    if (logs.length === 0) {
      return NextResponse.json(
        { error: "No audit logs found for this page" },
        { status: 404 }
      );
    }

    const currentLog = logs[0];
    const previousLog = logs.length > 1 ? logs[1] : null;

    // If there's no previous log, we can't compute a diff
    if (!previousLog) {
      return NextResponse.json({
        diffHtml: wrapDiffHtml(
          `<div class="no-diff">
            <p>This is the first scan for this page. No previous version to compare against.</p>
            <div style="margin-top: 16px; padding: 16px; background: #f5f5f5; border-radius: 8px;">
              ${currentLog.htmlSource ? extractPreview(currentLog.htmlSource) : "<p>No content available</p>"}
            </div>
          </div>`,
          currentLog.url
        ),
        stats: { additions: 0, deletions: 0 },
        baseUrl: currentLog.url,
        isFirstScan: true,
      });
    }

    // Check if both logs have HTML source
    if (!currentLog.htmlSource || !previousLog.htmlSource) {
      return NextResponse.json(
        { error: "HTML source not available for comparison" },
        { status: 400 }
      );
    }

    // Compute the diff
    const diffResult = computeHtmlDiff(
      previousLog.htmlSource,
      currentLog.htmlSource,
      currentLog.url
    );

    // Wrap in full HTML document for iframe rendering (include original stylesheets)
    const wrappedHtml = wrapDiffHtml(
      diffResult.diffHtml, 
      currentLog.url,
      diffResult.stylesheets
    );

    return NextResponse.json({
      diffHtml: wrappedHtml,
      stats: diffResult.stats,
      baseUrl: currentLog.url,
      currentTimestamp: currentLog.timestamp,
      previousTimestamp: previousLog.timestamp,
      isFirstScan: false,
    });
  } catch (error) {
    console.error("[visual-diff] Error computing diff:", error);
    return NextResponse.json(
      { error: "Failed to compute visual diff" },
      { status: 500 }
    );
  }
}

/**
 * Extract a preview of the HTML content for first-scan display
 */
function extractPreview(html: string): string {
  // Simple extraction - just get first 500 chars of text content
  const textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 500);

  return `<p style="color: #666;">${textContent}${textContent.length >= 500 ? "..." : ""}</p>`;
}
