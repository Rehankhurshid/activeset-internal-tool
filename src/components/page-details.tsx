"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  ChevronRight,
  Copy,
  Play,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Eye,
  Search,
  Code,
  Link2,
  Share2,
  Globe,
  FileText,
  Heading,
  Image,
  RefreshCw,
  Clock,
  Hash,
  Type,
  AlignLeft,
  Check,
  X,
  Accessibility,
  ChevronDown,
  ChevronUp,
  Smartphone,
} from "lucide-react"
import { projectsService } from "@/services/database"
import { ProjectLink, FieldChange, ImageInfo, LinkInfo, ContentBlock, BlockChange, TextElement, TextChange } from "@/types"
import { compareBlocks, compareTextElements } from "@/lib/scan-utils"
import { ChangeLogTimeline } from "@/components/change-log-timeline"
import { SocialPreviewTabs } from "@/components/social-card-preview"
import { ResponsivePreview, ScreenshotDiff } from "@/components/screenshot-diff"
import { ChangeDiffViewer, ChangeSummaryBadge } from "@/components/change-diff-viewer"
import { HtmlPreview } from "@/components/html-preview"
import { VisualDiffViewer } from "@/components/visual-diff-viewer"

interface PageDetailsProps {
  projectId?: string;
  linkId?: string;
}

export function PageDetails({ projectId, linkId }: PageDetailsProps) {
  const [loading, setLoading] = useState(true)
  const [currentLink, setCurrentLink] = useState<ProjectLink | null>(null)
  const [scanning, setScanning] = useState(false)
  const [checkingLinks, setCheckingLinks] = useState(false)
  const [brokenLinks, setBrokenLinks] = useState<{ href: string; status: number; text: string; error?: string }[]>([])
  const [linksCheckedAt, setLinksCheckedAt] = useState<string | null>(null)
  const [schemaExpanded, setSchemaExpanded] = useState(false)
  const [capturingScreenshot, setCapturingScreenshot] = useState(false)
  const [visualTab, setVisualTab] = useState<'visual-diff' | 'changes' | 'preview' | 'screenshot'>('visual-diff')
  // Audit log data (screenshots and full fieldChanges are stored in audit_logs, not project doc)
  const [auditLogData, setAuditLogData] = useState<{
    screenshotUrl?: string;
    previousScreenshotUrl?: string;
    fieldChanges?: FieldChange[];
    blockChanges?: BlockChange[];
    textChanges?: TextChange[];
  } | null>(null)

  const handleRescan = async () => {
    if (!projectId || !linkId || !currentLink?.url) return;
    setScanning(true);
    try {
      const response = await fetch('/api/scan-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, linkId, url: currentLink.url })
      });
      if (!response.ok) {
        const error = await response.json();
        alert(`Scan failed: ${error.error || 'Unknown error'}`);
      }
    } catch {
      alert('Scan request failed. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  const handleCheckLinks = async () => {
    if (!projectId || !linkId || !currentLink?.url) return;
    setCheckingLinks(true);
    try {
      const response = await fetch('/api/check-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, linkId, url: currentLink.url })
      });
      if (response.ok) {
        const result = await response.json();
        setBrokenLinks(result.brokenLinks || []);
        setLinksCheckedAt(new Date().toISOString());
      }
    } catch {
      // Silent fail
    } finally {
      setCheckingLinks(false);
    }
  };

  const handleCaptureScreenshot = async () => {
    if (!projectId || !linkId || !currentLink?.url) return;
    setCapturingScreenshot(true);
    try {
      const response = await fetch('/api/capture-screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, linkId, url: currentLink.url })
      });
      if (!response.ok) {
        const error = await response.json();
        alert(`Screenshot capture failed: ${error.error || 'Unknown error'}`);
      }
    } catch {
      alert('Screenshot capture failed. Please try again.');
    } finally {
      setCapturingScreenshot(false);
    }
  };

  useEffect(() => {
    if (!projectId || !linkId) return;
    const unsubscribe = projectsService.subscribeToProject(projectId, (project) => {
      if (project) {
        const link = project.links.find(l => l.id === linkId);
        if (link) setCurrentLink(link);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [projectId, linkId]);

  // Fetch full audit data from audit_logs (screenshots and complete fieldChanges)
  useEffect(() => {
    if (!projectId || !linkId) return;
    
    const fetchAuditLogData = async () => {
      try {
        const response = await fetch(`/api/audit-logs/previous?projectId=${projectId}&linkId=${linkId}`);
        if (response.ok) {
          const data = await response.json();
          // The API returns { current, previous } with full audit log data
          // screenshotUrl is either a Storage URL or a data:image/png;base64,... URL for backward compat
          if (data.current) {
            // Compute block changes if blocks are available
            const currentBlocks = data.current.blocks as ContentBlock[] | undefined;
            const previousBlocks = data.previous?.blocks as ContentBlock[] | undefined;
            const blockChanges = compareBlocks(previousBlocks, currentBlocks);
            
            // Compute text element changes for granular DOM diff
            const currentTextElements = data.current.textElements as TextElement[] | undefined;
            const previousTextElements = data.previous?.textElements as TextElement[] | undefined;
            const textChanges = compareTextElements(previousTextElements, currentTextElements);
            
            setAuditLogData({
              screenshotUrl: data.current.screenshotUrl,
              previousScreenshotUrl: data.previous?.screenshotUrl,
              fieldChanges: data.current.fieldChanges,
              blockChanges: blockChanges.length > 0 ? blockChanges : undefined,
              textChanges: textChanges.length > 0 ? textChanges : undefined,
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch audit log data:', error);
      }
    };
    
    fetchAuditLogData();
  }, [projectId, linkId, currentLink?.auditResult?.lastRun]); // Re-fetch when lastRun changes (after rescan)

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading...</div>;
  if (!currentLink) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Page not found</div>;

  const audit = currentLink.auditResult;
  const path = new URL(currentLink.url).pathname;
  const score = audit?.score || 0;
  const wordCount = audit?.categories?.readability?.wordCount || 0;
  const lastScan = audit?.lastRun ? new Date(audit.lastRun) : null;
  const placeholders = audit?.categories?.placeholders?.issues || [];
  const spellingErrors = audit?.categories?.spelling?.issues || [];
  const hasSectionChanges = (auditLogData?.fieldChanges || audit?.fieldChanges || []).some(change => change.field === 'sections');
  
  const getScoreColor = (s: number) => {
    if (s >= 80) return 'text-green-600';
    if (s >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const StatusIndicator = ({ ok }: { ok: boolean }) => (
    ok ? <Check className="h-3.5 w-3.5 text-green-500" /> : <X className="h-3.5 w-3.5 text-red-400" />
  );

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-black/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs text-neutral-500 mb-1">
                <a href="/" className="hover:text-neutral-900 dark:hover:text-white transition-colors">Audit</a>
                <ChevronRight className="h-3 w-3" />
                <span className="truncate font-mono">{path}</span>
              </div>
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold text-neutral-900 dark:text-white truncate">{audit?.contentSnapshot?.title || path}</h1>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-neutral-400 hover:text-neutral-900" onClick={() => navigator.clipboard.writeText(currentLink.url)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-neutral-400 hover:text-neutral-900" asChild>
                    <a href={currentLink.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {audit?.changeStatus === 'CONTENT_CHANGED' && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800">Changed</Badge>
              )}
              {!audit?.canDeploy && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800">Blocked</Badge>
              )}
              <Button size="sm" variant="outline" onClick={handleRescan} disabled={scanning} className="h-8 px-3 text-xs font-medium">
                <Play className={`h-3 w-3 mr-1.5 ${scanning ? 'animate-spin' : ''}`} />
                {scanning ? 'Scanning...' : 'Re-scan'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
            <div className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Score</div>
            <div className="flex items-end gap-2">
              <span className={`text-3xl font-bold tabular-nums ${getScoreColor(score)}`}>{score}</span>
              <span className="text-sm text-neutral-400 mb-1">/100</span>
            </div>
            <Progress value={score} className="h-1 mt-3" />
          </div>
          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
            <div className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Word Count</div>
            <div className="text-3xl font-bold tabular-nums text-neutral-900 dark:text-white">{wordCount.toLocaleString()}</div>
            <div className="text-xs text-neutral-400 mt-1">{wordCount >= 300 ? 'Good length' : 'Consider adding content'}</div>
          </div>
          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
            <div className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Last Scan</div>
            <div className="text-lg font-medium text-neutral-900 dark:text-white">{lastScan ? lastScan.toLocaleDateString() : '—'}</div>
            <div className="text-xs text-neutral-400 mt-1 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {lastScan ? lastScan.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
            </div>
          </div>
          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
            <div className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Issues</div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold tabular-nums text-red-600">{placeholders.length > 0 ? 1 : 0}</div>
                <div className="text-xs text-neutral-400">Critical</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold tabular-nums text-amber-600">{spellingErrors.length}</div>
                <div className="text-xs text-neutral-400">Spelling</div>
              </div>
            </div>
          </div>
        </div>

        {/* Placeholder Alert */}
        {placeholders.length > 0 && (
          <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <h3 className="font-semibold text-red-900 dark:text-red-200">Deployment Blocked</h3>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  Placeholder content detected: {placeholders.map(p => `${p.type} (${p.count})`).join(', ')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Content Changes & Visual QA Section */}
        <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          {/* Header with tabs */}
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-neutral-500" />
                <span className="font-medium text-neutral-900 dark:text-white">Content Changes</span>
                <ChangeSummaryBadge 
                  fieldChanges={auditLogData?.fieldChanges || audit?.fieldChanges || []} 
                  changeStatus={audit?.changeStatus} 
                />
                {hasSectionChanges && (
                  <Badge variant="secondary" className="text-xs">DOM Summary</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7 text-xs"
                  onClick={handleCaptureScreenshot}
                  disabled={capturingScreenshot}
                >
                  {capturingScreenshot ? (
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Eye className="h-3 w-3 mr-1" />
                  )}
                  {capturingScreenshot ? 'Capturing...' : 'Capture Screenshot'}
                </Button>
              </div>
            </div>
            
            {/* Tab buttons */}
            <div className="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg w-fit">
              <button
                onClick={() => setVisualTab('visual-diff')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  visualTab === 'visual-diff' 
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm' 
                    : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                Visual Diff
              </button>
              <button
                onClick={() => setVisualTab('changes')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  visualTab === 'changes' 
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm' 
                    : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                Field Changes
              </button>
              <button
                onClick={() => setVisualTab('preview')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  visualTab === 'preview' 
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm' 
                    : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                HTML Preview
              </button>
              <button
                onClick={() => setVisualTab('screenshot')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  visualTab === 'screenshot' 
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm' 
                    : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                }`}
                disabled={!auditLogData?.screenshotUrl}
              >
                <Image className="h-3.5 w-3.5" />
                Screenshot
                {!auditLogData?.screenshotUrl && <span className="text-xs text-neutral-400 ml-1">(none)</span>}
              </button>
            </div>
          </div>
          
          {/* Tab content */}
          <div className="p-4">
            {/* Visual Diff Tab */}
            {visualTab === 'visual-diff' && projectId && linkId && (
              <VisualDiffViewer 
                projectId={projectId}
                linkId={linkId}
              />
            )}
            
            {/* Field Changes Tab */}
            {visualTab === 'changes' && (
              <ChangeDiffViewer 
                fieldChanges={auditLogData?.fieldChanges || audit?.fieldChanges || []} 
                blockChanges={auditLogData?.blockChanges}
                textChanges={auditLogData?.textChanges}
                summary={audit?.diffSummary}
              />
            )}
            
            {/* HTML Preview Tab */}
            {visualTab === 'preview' && projectId && linkId && (
              <HtmlPreview 
                projectId={projectId}
                linkId={linkId}
                url={currentLink.url}
              />
            )}
            
            {/* Screenshot Tab */}
            {visualTab === 'screenshot' && auditLogData?.screenshotUrl && (
              <div className="space-y-4">
                {auditLogData.previousScreenshotUrl ? (
                  <ScreenshotDiff
                    before={auditLogData.previousScreenshotUrl}
                    after={auditLogData.screenshotUrl}
                    beforeLabel="Previous"
                    afterLabel="Current"
                    onGenerateDiff={async () => {
                      if (!auditLogData.previousScreenshotUrl || !auditLogData.screenshotUrl) return null;
                      try {
                        const response = await fetch('/api/compare-screenshots', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ before: auditLogData.previousScreenshotUrl, after: auditLogData.screenshotUrl })
                        });
                        if (!response.ok) return null;
                        const result = await response.json();
                        return { diffImage: result.diffImage, diffPercentage: result.diffPercentage };
                      } catch {
                        return null;
                      }
                    }}
                  />
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-neutral-500">Current snapshot</span>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                        // Download works with both Storage URLs and data URLs
                        const link = document.createElement('a');
                        link.href = auditLogData.screenshotUrl!;
                        link.download = 'screenshot.png';
                        link.target = '_blank';
                        link.click();
                      }}>
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </Button>
                    </div>
                    <img src={auditLogData.screenshotUrl} alt="Page" className="w-full rounded border border-neutral-200 dark:border-neutral-700" />
                  </div>
                )}
              </div>
            )}
            
            {visualTab === 'screenshot' && !auditLogData?.screenshotUrl && (
              <div className="flex flex-col items-center justify-center py-12 text-neutral-500">
                <Eye className="h-12 w-12 mb-3 text-neutral-300 dark:text-neutral-600" />
                <p className="text-sm mb-2">No screenshot available</p>
                <p className="text-xs text-neutral-400 mb-4">Screenshots are captured on first scan or when significant changes occur</p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleCaptureScreenshot}
                  disabled={capturingScreenshot}
                >
                  {capturingScreenshot ? (
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Eye className="h-3 w-3 mr-1" />
                  )}
                  {capturingScreenshot ? 'Capturing...' : 'Capture Now'}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-2 gap-4">
          {/* SEO Metadata */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
              <Search className="h-4 w-4 text-neutral-500" />
              <span className="font-medium text-neutral-900 dark:text-white">SEO Metadata</span>
            </div>
            <div className="p-4 space-y-4">
              {/* Title */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                    <Type className="h-3.5 w-3.5" />
                    Title
                  </div>
                  <span className={`text-xs font-mono ${(audit?.categories?.seo?.titleLength || 0) >= 30 && (audit?.categories?.seo?.titleLength || 0) <= 60 ? 'text-green-600' : 'text-amber-600'}`}>
                    {audit?.categories?.seo?.titleLength || 0}/60
                  </span>
                </div>
                <div className="bg-neutral-50 dark:bg-neutral-800 rounded px-3 py-2 text-sm font-mono text-neutral-900 dark:text-white">
                  {audit?.categories?.seo?.title || audit?.contentSnapshot?.title || '(empty)'}
                </div>
              </div>
              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                    <AlignLeft className="h-3.5 w-3.5" />
                    Meta Description
                  </div>
                  <span className={`text-xs font-mono ${(audit?.categories?.seo?.metaDescriptionLength || 0) >= 50 && (audit?.categories?.seo?.metaDescriptionLength || 0) <= 160 ? 'text-green-600' : 'text-amber-600'}`}>
                    {audit?.categories?.seo?.metaDescriptionLength || 0}/160
                  </span>
                </div>
                <div className="bg-neutral-50 dark:bg-neutral-800 rounded px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
                  {audit?.categories?.seo?.metaDescription || audit?.contentSnapshot?.metaDescription || '(empty)'}
                </div>
              </div>
              {/* Images */}
              {(audit?.categories?.seo?.imagesWithoutAlt || 0) > 0 && (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <Image className="h-4 w-4" />
                  <span>{audit?.categories?.seo?.imagesWithoutAlt} images missing alt text</span>
                </div>
              )}
            </div>
          </div>

          {/* Schema Markup - Enhanced with JSON viewer */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
              <Code className="h-4 w-4 text-neutral-500" />
              <span className="font-medium text-neutral-900 dark:text-white">Schema Markup</span>
              {audit?.categories?.schema?.hasSchema ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto" />
              ) : (
                <span className="text-xs text-neutral-400 ml-auto">Not found</span>
              )}
            </div>
            <div className="p-4">
              {audit?.categories?.schema?.hasSchema ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {audit.categories.schema.schemaTypes?.map((type, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs font-mono bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">{type}</Badge>
                    ))}
                  </div>
                  {audit.categories.schema.issues?.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                      {audit.categories.schema.issues.map((issue, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs text-amber-600">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span><span className="font-medium">{issue.type}:</span> {issue.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* JSON-LD Viewer */}
                  {audit.categories.schema.rawSchemas && audit.categories.schema.rawSchemas.length > 0 && (
                    <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
                      <button 
                        onClick={() => setSchemaExpanded(!schemaExpanded)}
                        className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                      >
                        {schemaExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {schemaExpanded ? 'Hide' : 'View'} JSON-LD
                      </button>
                      {schemaExpanded && (
                        <div className="mt-2 bg-neutral-50 dark:bg-neutral-800 rounded p-3 max-h-64 overflow-auto">
                          <pre className="text-xs font-mono text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
                            {JSON.stringify(audit.categories.schema.rawSchemas, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Google Rich Results Test Link */}
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      asChild
                    >
                      <a 
                        href={`https://search.google.com/test/rich-results?url=${encodeURIComponent(currentLink.url)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-3 w-3 mr-1.5" />
                        Test on Google
                      </a>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-neutral-500">No JSON-LD structured data found. Consider adding schema for better search visibility.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    asChild
                  >
                    <a 
                      href={`https://search.google.com/test/rich-results?url=${encodeURIComponent(currentLink.url)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3 w-3 mr-1.5" />
                      Test on Google
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Spelling */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
              <FileText className="h-4 w-4 text-neutral-500" />
              <span className="font-medium text-neutral-900 dark:text-white">Spelling</span>
              {spellingErrors.length === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto" />
              ) : (
                <Badge variant="destructive" className="ml-auto text-xs">{spellingErrors.length}</Badge>
              )}
            </div>
            <div className="p-4">
              {spellingErrors.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {spellingErrors.map((error, idx) => (
                    <div key={idx} className="flex items-center gap-3 text-sm font-mono">
                      <span className="text-red-600 line-through">{error.word}</span>
                      <span className="text-neutral-400">→</span>
                      <span className="text-green-600">{error.suggestion || '?'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-500">No spelling errors detected</p>
              )}
            </div>
          </div>

          {/* Links */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-neutral-500" />
              <span className="font-medium text-neutral-900 dark:text-white">Links</span>
              <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={handleCheckLinks} disabled={checkingLinks}>
                <RefreshCw className={`h-3.5 w-3.5 ${checkingLinks ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-white">{audit?.categories?.links?.totalLinks || 0}</div>
                  <div className="text-xs text-neutral-500">Total</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold tabular-nums text-blue-600">{audit?.categories?.links?.internalLinks || 0}</div>
                  <div className="text-xs text-neutral-500">Internal</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold tabular-nums text-purple-600">{audit?.categories?.links?.externalLinks || 0}</div>
                  <div className="text-xs text-neutral-500">External</div>
                </div>
              </div>
              {brokenLinks.length > 0 ? (
                <div className="space-y-1.5 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                  <div className="flex items-center gap-2 text-sm font-medium text-red-600 mb-2">
                    <XCircle className="h-4 w-4" />
                    {brokenLinks.length} broken links
                  </div>
                  {brokenLinks.slice(0, 5).map((link, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-red-500">{link.status}</span>
                      <span className="truncate text-neutral-600 dark:text-neutral-400">{link.href}</span>
                    </div>
                  ))}
                </div>
              ) : linksCheckedAt ? (
                <div className="flex items-center gap-2 text-sm text-green-600 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                  <CheckCircle2 className="h-4 w-4" />
                  All links valid
                </div>
              ) : (
                <p className="text-sm text-neutral-500 pt-3 border-t border-neutral-100 dark:border-neutral-800">Click refresh to check for broken links</p>
              )}
            </div>
          </div>

          {/* Headings */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
              <Heading className="h-4 w-4 text-neutral-500" />
              <span className="font-medium text-neutral-900 dark:text-white">Heading Structure</span>
              <span className="text-xs text-neutral-400 ml-auto">{audit?.categories?.headingStructure?.h1Count || 0} H1</span>
            </div>
            <div className="p-4">
              {(audit?.categories?.headingStructure?.headings?.length ?? 0) > 0 ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {audit?.categories?.headingStructure?.headings?.map((h, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-xs text-neutral-400 w-6">H{h.level}</span>
                      <span className="text-neutral-700 dark:text-neutral-300 truncate">{h.text}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-500">No headings found</p>
              )}
              {(audit?.categories?.headingStructure?.issues?.length ?? 0) > 0 && (
                <div className="space-y-1 mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                  {audit?.categories?.headingStructure?.issues?.map((issue, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {issue}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Social Card Previews - Enhanced Open Graph */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 lg:col-span-2">
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
              <Share2 className="h-4 w-4 text-neutral-500" />
              <span className="font-medium text-neutral-900 dark:text-white">Social Card Previews</span>
              {audit?.categories?.openGraph?.hasOpenGraph ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto" />
              ) : (
                <span className="text-xs text-neutral-400 ml-auto">Not configured</span>
              )}
            </div>
            <div className="p-4">
              {audit?.categories?.openGraph?.hasOpenGraph || audit?.categories?.twitterCards?.hasTwitterCards ? (
                <SocialPreviewTabs
                  title={audit?.categories?.openGraph?.title}
                  description={audit?.categories?.openGraph?.description}
                  image={audit?.categories?.openGraph?.image}
                  url={currentLink.url}
                  twitterTitle={audit?.categories?.twitterCards?.title}
                  twitterDescription={audit?.categories?.twitterCards?.description}
                  twitterImage={audit?.categories?.twitterCards?.image}
                />
              ) : (
                <div className="text-center py-8">
                  <Share2 className="h-8 w-8 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
                  <p className="text-sm text-neutral-500 mb-2">No Open Graph or Twitter Card tags configured</p>
                  <p className="text-xs text-neutral-400">Add these tags to control how your page appears when shared on social media</p>
                </div>
              )}
            </div>
          </div>

          {/* Technical Meta */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
              <Globe className="h-4 w-4 text-neutral-500" />
              <span className="font-medium text-neutral-900 dark:text-white">Technical</span>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <StatusIndicator ok={!!audit?.categories?.metaTags?.canonicalUrl} />
                  <span className="text-neutral-700 dark:text-neutral-300">Canonical URL</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <StatusIndicator ok={!!audit?.categories?.metaTags?.hasViewport} />
                  <span className="text-neutral-700 dark:text-neutral-300">Viewport</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <StatusIndicator ok={!!audit?.categories?.metaTags?.language} />
                  <span className="text-neutral-700 dark:text-neutral-300">Language</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <StatusIndicator ok={!!audit?.categories?.metaTags?.favicon} />
                  <span className="text-neutral-700 dark:text-neutral-300">Favicon</span>
                </div>
              </div>
              {audit?.categories?.metaTags?.canonicalUrl && (
                <div className="mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                  <span className="text-xs text-neutral-500">Canonical</span>
                  <p className="text-xs font-mono text-neutral-600 dark:text-neutral-400 truncate">{audit.categories.metaTags.canonicalUrl}</p>
                </div>
              )}
              {audit?.categories?.metaTags?.robots && (
                <div className="mt-2">
                  <span className="text-xs text-neutral-500">Robots</span>
                  <p className="text-xs font-mono text-neutral-600 dark:text-neutral-400">{audit.categories.metaTags.robots}</p>
                </div>
              )}
            </div>
          </div>

          {/* Accessibility */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
              <Accessibility className="h-4 w-4 text-neutral-500" />
              <span className="font-medium text-neutral-900 dark:text-white">Accessibility</span>
              {audit?.categories?.accessibility ? (
                <Badge 
                  variant={audit.categories.accessibility.score >= 80 ? 'secondary' : 'destructive'} 
                  className="ml-auto text-xs"
                >
                  {audit.categories.accessibility.score}/100
                </Badge>
              ) : (
                <span className="text-xs text-neutral-400 ml-auto">Not checked</span>
              )}
            </div>
            <div className="p-4">
              {audit?.categories?.accessibility ? (
                <div className="space-y-4">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <StatusIndicator ok={audit.categories.accessibility.hasSkipLink} />
                      <span className="text-neutral-700 dark:text-neutral-300">Skip Link</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <StatusIndicator ok={audit.categories.accessibility.ariaLandmarks.includes('main')} />
                      <span className="text-neutral-700 dark:text-neutral-300">Main Landmark</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <StatusIndicator ok={audit.categories.accessibility.formInputsWithoutLabels === 0} />
                      <span className="text-neutral-700 dark:text-neutral-300">Form Labels</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <StatusIndicator ok={audit.categories.accessibility.linksWithGenericText === 0} />
                      <span className="text-neutral-700 dark:text-neutral-300">Link Text</span>
                    </div>
                  </div>

                  {/* ARIA Landmarks */}
                  {audit.categories.accessibility.ariaLandmarks.length > 0 && (
                    <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800">
                      <span className="text-xs text-neutral-500">ARIA Landmarks</span>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {audit.categories.accessibility.ariaLandmarks.map((landmark, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs font-mono bg-neutral-100 dark:bg-neutral-800">{landmark}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Issues */}
                  {audit.categories.accessibility.issues?.length > 0 && (
                    <div className="space-y-1.5 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                      <div className="text-xs text-neutral-500 mb-2">Issues ({audit.categories.accessibility.issues.length})</div>
                      <div className="max-h-32 overflow-y-auto space-y-1.5">
                        {audit.categories.accessibility.issues.map((issue, idx) => (
                          <div key={idx} className={`flex items-start gap-2 text-xs ${issue.severity === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                            {issue.severity === 'error' ? (
                              <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            )}
                            <span>{issue.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {audit.categories.accessibility.issues?.length === 0 && (
                    <div className="flex items-center gap-2 text-sm text-green-600 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                      <CheckCircle2 className="h-4 w-4" />
                      No accessibility issues detected
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-neutral-500">Accessibility checks will be available after the next scan</p>
              )}
            </div>
          </div>
        </div>

        {/* Change History */}
        {projectId && linkId && (
          <div className="mt-8">
            <ChangeLogTimeline linkId={linkId} projectId={projectId} />
          </div>
        )}
      </main>
    </div>
  )
}
