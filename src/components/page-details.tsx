"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
  Shield,
  Zap,
  ArrowLeft,
  Camera,
  LinkIcon,
  History,
  BarChart3,
  Activity,
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

// --- Animated Score Ring ---
function ScoreRing({ score, size = 120, strokeWidth = 10 }: { score: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  const getColor = (s: number) => {
    if (s >= 90) return { stroke: '#22c55e', bg: 'rgba(34,197,94,0.08)', text: 'text-green-500' }
    if (s >= 70) return { stroke: '#eab308', bg: 'rgba(234,179,8,0.08)', text: 'text-yellow-500' }
    if (s >= 50) return { stroke: '#f97316', bg: 'rgba(249,115,22,0.08)', text: 'text-orange-500' }
    return { stroke: '#ef4444', bg: 'rgba(239,68,68,0.08)', text: 'text-red-500' }
  }

  const colors = getColor(score)

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-neutral-200 dark:text-neutral-800"
        />
        {/* Score arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold tabular-nums ${colors.text}`}>{score}</span>
        <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-medium">/ 100</span>
      </div>
    </div>
  )
}

// --- Health Dot ---
function HealthDot({ status }: { status: 'good' | 'warning' | 'error' | 'neutral' }) {
  const colors = {
    good: 'bg-green-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
    neutral: 'bg-neutral-400',
  }
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${colors[status]}`} />
  )
}

// --- Stat Pill ---
function StatPill({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800">
      <Icon className="h-4 w-4 text-neutral-400 shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] text-neutral-400 uppercase tracking-wider font-medium">{label}</div>
        <div className="text-sm font-semibold text-neutral-900 dark:text-white tabular-nums">{value}</div>
        {sub && <div className="text-[10px] text-neutral-400">{sub}</div>}
      </div>
    </div>
  )
}

// --- Panel Card ---
function PanelCard({
  icon: Icon,
  title,
  health,
  badge,
  action,
  children,
  className = ''
}: {
  icon: React.ElementType;
  title: string;
  health?: 'good' | 'warning' | 'error' | 'neutral';
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm hover:shadow-md transition-shadow ${className}`}>
      <div className="px-5 py-3.5 border-b border-neutral-100 dark:border-neutral-800 flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-neutral-500" />
        <span className="font-semibold text-sm text-neutral-900 dark:text-white">{title}</span>
        {health && <HealthDot status={health} />}
        {badge && <div className="ml-auto">{badge}</div>}
        {action && !badge && <div className="ml-auto">{action}</div>}
      </div>
      <div className="p-5">
        {children}
      </div>
    </div>
  )
}

// --- StatusIndicator ---
function StatusIndicator({ ok }: { ok: boolean }) {
  return ok ? <Check className="h-3.5 w-3.5 text-green-500" /> : <X className="h-3.5 w-3.5 text-red-400" />
}

// --- Relative time helper ---
function getRelativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

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
  const [activeSection, setActiveSection] = useState<'content' | 'history'>('content')
  const [visualTab, setVisualTab] = useState<'visual-diff' | 'changes' | 'preview' | 'screenshot'>('visual-diff')
  const [auditLogData, setAuditLogData] = useState<{
    screenshotUrl?: string;
    previousScreenshotUrl?: string;
    fieldChanges?: FieldChange[];
    blockChanges?: BlockChange[];
    textChanges?: TextChange[];
  } | null>(null)

  const handleRescan = useCallback(async () => {
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
  }, [projectId, linkId, currentLink?.url]);

  const handleCheckLinks = useCallback(async () => {
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
        // Persist results to Firestore
        try {
          await projectsService.saveBrokenLinkResults(projectId, linkId, {
            totalChecked: result.totalChecked,
            totalLinks: result.totalLinks,
            brokenLinks: result.brokenLinks || [],
            validLinks: result.validLinks,
          });
        } catch {
          console.error('Failed to persist broken link results');
        }
      }
    } catch {
      // Silent fail
    } finally {
      setCheckingLinks(false);
    }
  }, [projectId, linkId, currentLink?.url]);

  const handleCaptureScreenshot = useCallback(async () => {
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
  }, [projectId, linkId, currentLink?.url]);

  // Subscribe to link data
  useEffect(() => {
    if (!projectId || !linkId) return;
    const unsubscribe = projectsService.subscribeToProject(projectId, (project) => {
      if (project) {
        const link = project.links.find(l => l.id === linkId);
        if (link) {
          setCurrentLink(link);
          // Load persisted broken link data
          if (link.auditResult?.categories?.links?.brokenLinks) {
            setBrokenLinks(link.auditResult.categories.links.brokenLinks);
            setLinksCheckedAt(link.auditResult.categories.links.checkedAt || null);
          }
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [projectId, linkId]);

  // Fetch audit log data (screenshots, field changes)
  useEffect(() => {
    if (!projectId || !linkId) return;

    const fetchAuditLogData = async () => {
      try {
        const response = await fetch(`/api/audit-logs/previous?projectId=${projectId}&linkId=${linkId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.current) {
            const currentBlocks = data.current.blocks as ContentBlock[] | undefined;
            const previousBlocks = data.previous?.blocks as ContentBlock[] | undefined;
            const blockChanges = compareBlocks(previousBlocks, currentBlocks);

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
  }, [projectId, linkId, currentLink?.auditResult?.lastRun]);

  // Computed audit values
  const audit = currentLink?.auditResult;
  const path = currentLink ? new URL(currentLink.url).pathname : '/';
  const score = audit?.score || 0;
  const wordCount = audit?.categories?.readability?.wordCount || 0;
  const lastScan = audit?.lastRun ? new Date(audit.lastRun) : null;
  const placeholders = audit?.categories?.placeholders?.issues || [];
  const spellingErrors = audit?.categories?.spelling?.issues || [];
  const hasSectionChanges = (auditLogData?.fieldChanges || audit?.fieldChanges || []).some(change => change.field === 'sections');

  // Overall health status
  const overallHealth = useMemo(() => {
    if (!audit) return 'neutral' as const;
    if (score >= 90 && audit.canDeploy) return 'good' as const;
    if (score >= 60) return 'warning' as const;
    return 'error' as const;
  }, [audit, score]);

  // Issue counts per category
  const issueCounts = useMemo(() => ({
    seo: (audit?.categories?.seo?.issues?.length || 0) + ((audit?.categories?.seo?.imagesWithoutAlt || 0) > 0 ? 1 : 0),
    links: brokenLinks.length,
    spelling: spellingErrors.length,
    placeholders: placeholders.length,
    headings: audit?.categories?.headingStructure?.issues?.length || 0,
    schema: audit?.categories?.schema?.issues?.length || 0,
    accessibility: audit?.categories?.accessibility?.issues?.length || 0,
  }), [audit, brokenLinks, spellingErrors, placeholders]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-6 w-6 animate-spin text-neutral-400" />
          <span className="text-sm text-neutral-500">Loading audit data…</span>
        </div>
      </div>
    );
  }

  if (!currentLink) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-neutral-500">Page not found</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a]">
        {/* ═══════════════════════════════════════════════════════ */}
        {/* HEADER — Sticky with glassmorphism                     */}
        {/* ═══════════════════════════════════════════════════════ */}
        <header className="sticky top-0 z-20 border-b border-neutral-200/80 dark:border-neutral-800/80 bg-white/70 dark:bg-black/70 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-6 py-3">
            <div className="flex items-center justify-between gap-4">
              {/* Left: Breadcrumb + Title */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs text-neutral-400 mb-0.5">
                  <button
                    onClick={() => window.history.back()}
                    className="flex items-center gap-1 hover:text-neutral-700 dark:hover:text-white transition-colors"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    <span>Back</span>
                  </button>
                  <ChevronRight className="h-3 w-3" />
                  <span className="font-mono truncate">{path}</span>
                </div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-semibold text-neutral-900 dark:text-white truncate">
                    {audit?.contentSnapshot?.title || path}
                  </h1>
                  {/* Status badges */}
                  {audit?.changeStatus === 'CONTENT_CHANGED' && (
                    <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 text-[10px] px-1.5 py-0">Changed</Badge>
                  )}
                  {!audit?.canDeploy && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Blocked</Badge>
                  )}
                  {audit?.canDeploy && score >= 90 && (
                    <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 text-[10px] px-1.5 py-0">Healthy</Badge>
                  )}
                </div>
              </div>

              {/* Right: Command Bar */}
              <div className="flex items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigator.clipboard.writeText(currentLink.url)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy URL</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                      <a href={currentLink.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open page</TooltipContent>
                </Tooltip>
                <div className="h-5 w-px bg-neutral-200 dark:bg-neutral-700 mx-1" />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs font-medium gap-1.5"
                  onClick={handleCheckLinks}
                  disabled={checkingLinks}
                >
                  <LinkIcon className={`h-3 w-3 ${checkingLinks ? 'animate-spin' : ''}`} />
                  {checkingLinks ? 'Checking…' : 'Check Links'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs font-medium gap-1.5"
                  onClick={handleCaptureScreenshot}
                  disabled={capturingScreenshot}
                >
                  <Camera className={`h-3 w-3 ${capturingScreenshot ? 'animate-spin' : ''}`} />
                  {capturingScreenshot ? 'Capturing…' : 'Screenshot'}
                </Button>
                <Button
                  size="sm"
                  className="h-8 px-3 text-xs font-medium gap-1.5 bg-neutral-900 dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100"
                  onClick={handleRescan}
                  disabled={scanning}
                >
                  <Play className={`h-3 w-3 ${scanning ? 'animate-spin' : ''}`} />
                  {scanning ? 'Scanning…' : 'Re-scan'}
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
          {/* ═══════════════════════════════════════════════════════ */}
          {/* SCORE OVERVIEW — Ring + Quick Stats                    */}
          {/* ═══════════════════════════════════════════════════════ */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm p-6">
            <div className="flex items-center gap-8">
              {/* Score Ring */}
              <div className="shrink-0">
                <ScoreRing score={score} size={110} strokeWidth={9} />
              </div>

              {/* Stats Grid */}
              <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatPill
                  icon={FileText}
                  label="Word Count"
                  value={wordCount.toLocaleString()}
                  sub={wordCount >= 300 ? 'Good length' : 'Needs content'}
                />
                <StatPill
                  icon={Clock}
                  label="Last Scan"
                  value={lastScan ? getRelativeTime(lastScan.toISOString()) : '—'}
                  sub={lastScan ? lastScan.toLocaleDateString() : undefined}
                />
                <StatPill
                  icon={AlertTriangle}
                  label="Issues"
                  value={issueCounts.spelling + issueCounts.placeholders + issueCounts.headings + issueCounts.schema + issueCounts.accessibility}
                  sub={`${issueCounts.placeholders > 0 ? issueCounts.placeholders + ' critical' : 'No critical'}`}
                />
                <StatPill
                  icon={LinkIcon}
                  label="Broken Links"
                  value={linksCheckedAt ? brokenLinks.length : '—'}
                  sub={linksCheckedAt ? getRelativeTime(linksCheckedAt) : 'Not checked'}
                />
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════ */}
          {/* PLACEHOLDER ALERT — Full-width critical banner         */}
          {/* ═══════════════════════════════════════════════════════ */}
          {placeholders.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-xl p-4 flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-900/50 flex items-center justify-center shrink-0">
                <XCircle className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-red-900 dark:text-red-200 text-sm">Deployment Blocked</h3>
                <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">
                  Placeholder content detected: {placeholders.map(p => `${p.type} (${p.count})`).join(', ')}
                </p>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════ */}
          {/* SECTION TOGGLE — Content Intelligence vs History       */}
          {/* ═══════════════════════════════════════════════════════ */}
          <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg w-fit">
            <button
              onClick={() => setActiveSection('content')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeSection === 'content'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Content Intelligence
            </button>
            <button
              onClick={() => setActiveSection('history')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeSection === 'history'
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                }`}
            >
              <History className="h-3.5 w-3.5" />
              Change History
            </button>
          </div>

          {activeSection === 'content' && (
            <>
              {/* ═══════════════════════════════════════════════════════ */}
              {/* CONTENT CHANGES — Visual Diff / Source Changes tabs    */}
              {/* ═══════════════════════════════════════════════════════ */}
              <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-neutral-100 dark:border-neutral-800">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <Eye className="h-4 w-4 text-neutral-500" />
                      <span className="font-semibold text-sm text-neutral-900 dark:text-white">Content Changes</span>
                      <ChangeSummaryBadge
                        fieldChanges={auditLogData?.fieldChanges || audit?.fieldChanges || []}
                        changeStatus={audit?.changeStatus}
                      />
                      {hasSectionChanges && (
                        <Badge variant="secondary" className="text-xs">DOM Summary</Badge>
                      )}
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg w-fit">
                    {([
                      { id: 'visual-diff' as const, label: 'Visual Diff', icon: Eye, disabled: false },
                      { id: 'changes' as const, label: 'Source Changes', icon: FileText, disabled: false },
                      { id: 'preview' as const, label: 'HTML Preview', icon: Globe, disabled: false },
                      { id: 'screenshot' as const, label: 'Screenshot', icon: Image, disabled: !auditLogData?.screenshotUrl },
                    ]).map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setVisualTab(tab.id)}
                        disabled={tab.disabled}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${visualTab === tab.id
                          ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                          : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                          } ${tab.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <tab.icon className="h-3.5 w-3.5" />
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab Content */}
                <div className="p-5">
                  {visualTab === 'visual-diff' && projectId && linkId && (
                    <VisualDiffViewer projectId={projectId} linkId={linkId} />
                  )}

                  {visualTab === 'changes' && (
                    <ChangeDiffViewer
                      fieldChanges={auditLogData?.fieldChanges || audit?.fieldChanges || []}
                      blockChanges={auditLogData?.blockChanges}
                      textChanges={auditLogData?.textChanges}
                      summary={audit?.diffSummary}
                    />
                  )}

                  {visualTab === 'preview' && projectId && linkId && (
                    <HtmlPreview projectId={projectId} linkId={linkId} url={currentLink.url} />
                  )}

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
                          <img src={auditLogData.screenshotUrl} alt="Page" className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700" />
                        </div>
                      )}
                    </div>
                  )}

                  {visualTab === 'screenshot' && !auditLogData?.screenshotUrl && (
                    <div className="flex flex-col items-center justify-center py-12 text-neutral-500">
                      <Camera className="h-12 w-12 mb-3 text-neutral-300 dark:text-neutral-600" />
                      <p className="text-sm mb-2">No screenshot available</p>
                      <p className="text-xs text-neutral-400 mb-4">Screenshots are captured on first scan or when significant changes occur</p>
                      <Button variant="outline" size="sm" onClick={handleCaptureScreenshot} disabled={capturingScreenshot}>
                        {capturingScreenshot ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Camera className="h-3 w-3 mr-1" />}
                        {capturingScreenshot ? 'Capturing…' : 'Capture Now'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* ═══════════════════════════════════════════════════════ */}
              {/* AUDIT PANELS — 2-column premium grid                  */}
              {/* ═══════════════════════════════════════════════════════ */}
              <div className="grid lg:grid-cols-2 gap-4">
                {/* SEO Health Panel */}
                <PanelCard
                  icon={Search}
                  title="SEO Health"
                  health={issueCounts.seo === 0 ? 'good' : issueCounts.seo <= 2 ? 'warning' : 'error'}
                  badge={
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {audit?.categories?.seo?.score || 0}/100
                    </Badge>
                  }
                >
                  <div className="space-y-4">
                    {/* Title */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 text-xs text-neutral-500">
                          <Type className="h-3.5 w-3.5" />
                          Title
                        </div>
                        <span className={`text-[10px] font-mono ${(audit?.categories?.seo?.titleLength || 0) >= 30 && (audit?.categories?.seo?.titleLength || 0) <= 60 ? 'text-green-600' : 'text-amber-600'
                          }`}>
                          {audit?.categories?.seo?.titleLength || 0}/60
                        </span>
                      </div>
                      <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg px-3 py-2 text-sm font-mono text-neutral-900 dark:text-white">
                        {audit?.categories?.seo?.title || audit?.contentSnapshot?.title || '(empty)'}
                      </div>
                    </div>
                    {/* Description */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 text-xs text-neutral-500">
                          <AlignLeft className="h-3.5 w-3.5" />
                          Meta Description
                        </div>
                        <span className={`text-[10px] font-mono ${(audit?.categories?.seo?.metaDescriptionLength || 0) >= 50 && (audit?.categories?.seo?.metaDescriptionLength || 0) <= 160 ? 'text-green-600' : 'text-amber-600'
                          }`}>
                          {audit?.categories?.seo?.metaDescriptionLength || 0}/160
                        </span>
                      </div>
                      <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg px-3 py-2 text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
                        {audit?.categories?.seo?.metaDescription || audit?.contentSnapshot?.metaDescription || '(empty)'}
                      </div>
                    </div>
                    {/* Images without alt */}
                    {(audit?.categories?.seo?.imagesWithoutAlt || 0) > 0 && (
                      <div className="flex items-center gap-2 text-xs text-amber-600">
                        <Image className="h-3.5 w-3.5" />
                        <span>{audit?.categories?.seo?.imagesWithoutAlt} images missing alt text</span>
                      </div>
                    )}
                  </div>
                </PanelCard>

                {/* Links & Broken Links Panel */}
                <PanelCard
                  icon={Link2}
                  title="Links"
                  health={brokenLinks.length > 0 ? 'error' : linksCheckedAt ? 'good' : 'neutral'}
                  action={
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCheckLinks} disabled={checkingLinks}>
                      <RefreshCw className={`h-3.5 w-3.5 ${checkingLinks ? 'animate-spin' : ''}`} />
                    </Button>
                  }
                >
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
                        <div className="text-xl font-bold tabular-nums text-neutral-900 dark:text-white">{audit?.categories?.links?.totalLinks || 0}</div>
                        <div className="text-[10px] text-neutral-400 uppercase tracking-wider">Total</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
                        <div className="text-xl font-bold tabular-nums text-blue-600">{audit?.categories?.links?.internalLinks || 0}</div>
                        <div className="text-[10px] text-neutral-400 uppercase tracking-wider">Internal</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
                        <div className="text-xl font-bold tabular-nums text-purple-600">{audit?.categories?.links?.externalLinks || 0}</div>
                        <div className="text-[10px] text-neutral-400 uppercase tracking-wider">External</div>
                      </div>
                    </div>
                    {brokenLinks.length > 0 ? (
                      <div className="space-y-1.5 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                        <div className="flex items-center gap-2 text-xs font-medium text-red-600 mb-2">
                          <XCircle className="h-3.5 w-3.5" />
                          {brokenLinks.length} broken {brokenLinks.length === 1 ? 'link' : 'links'}
                        </div>
                        {brokenLinks.slice(0, 5).map((link, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-red-50 dark:bg-red-950/30">
                            <span className="font-mono text-red-500 font-medium shrink-0">{link.status}</span>
                            <span className="truncate text-neutral-600 dark:text-neutral-400">{link.href}</span>
                          </div>
                        ))}
                        {brokenLinks.length > 5 && (
                          <p className="text-[10px] text-neutral-400 pl-2">and {brokenLinks.length - 5} more…</p>
                        )}
                      </div>
                    ) : linksCheckedAt ? (
                      <div className="flex items-center gap-2 text-xs text-green-600 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        All links valid
                        <span className="text-neutral-400 ml-auto">{getRelativeTime(linksCheckedAt)}</span>
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500 pt-3 border-t border-neutral-100 dark:border-neutral-800">Click refresh to check for broken links</p>
                    )}
                  </div>
                </PanelCard>

                {/* Content Quality Panel (Spelling + Placeholders) */}
                <PanelCard
                  icon={FileText}
                  title="Content Quality"
                  health={issueCounts.spelling + issueCounts.placeholders === 0 ? 'good' : issueCounts.placeholders > 0 ? 'error' : 'warning'}
                  badge={
                    <Badge variant={spellingErrors.length === 0 ? 'secondary' : 'destructive'} className="text-[10px]">
                      {spellingErrors.length} errors
                    </Badge>
                  }
                >
                  <div className="space-y-4">
                    {/* Readability */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
                      <div>
                        <div className="text-xs text-neutral-500">Readability</div>
                        <div className="text-sm font-medium text-neutral-900 dark:text-white">{audit?.categories?.readability?.label || 'N/A'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-neutral-500">Flesch Score</div>
                        <div className="text-sm font-medium text-neutral-900 dark:text-white tabular-nums">{audit?.categories?.readability?.fleschScore || 0}</div>
                      </div>
                    </div>
                    {/* Spelling Errors */}
                    {spellingErrors.length > 0 ? (
                      <div className="space-y-1.5">
                        <div className="text-xs text-neutral-500 font-medium">Spelling Issues</div>
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {spellingErrors.map((error, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs font-mono py-1 px-2 rounded bg-neutral-50 dark:bg-neutral-800/50">
                              <span className="text-red-600 line-through">{error.word}</span>
                              <span className="text-neutral-400">→</span>
                              <span className="text-green-600">{error.suggestion || '?'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        No spelling errors
                      </div>
                    )}
                  </div>
                </PanelCard>

                {/* Heading Structure Panel */}
                <PanelCard
                  icon={Heading}
                  title="Heading Structure"
                  health={issueCounts.headings === 0 ? 'good' : 'warning'}
                  badge={
                    <span className="text-[10px] text-neutral-400 font-mono">{audit?.categories?.headingStructure?.h1Count || 0} H1</span>
                  }
                >
                  <div className="space-y-3">
                    {(audit?.categories?.headingStructure?.headings?.length ?? 0) > 0 ? (
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {audit?.categories?.headingStructure?.headings?.map((h, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs py-1">
                            <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${h.level === 1 ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                              h.level === 2 ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' :
                                'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                              }`}>
                              H{h.level}
                            </span>
                            <span className="text-neutral-700 dark:text-neutral-300 truncate">{h.text}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500">No headings found</p>
                    )}
                    {(audit?.categories?.headingStructure?.issues?.length ?? 0) > 0 && (
                      <div className="space-y-1 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                        {audit?.categories?.headingStructure?.issues?.map((issue, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs text-amber-600">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            {issue}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </PanelCard>

                {/* Schema Markup Panel */}
                <PanelCard
                  icon={Code}
                  title="Schema Markup"
                  health={audit?.categories?.schema?.hasSchema ? 'good' : 'neutral'}
                  badge={
                    audit?.categories?.schema?.hasSchema ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <span className="text-[10px] text-neutral-400">Not found</span>
                    )
                  }
                >
                  {audit?.categories?.schema?.hasSchema ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-1.5">
                        {audit.categories.schema.schemaTypes?.map((type, idx) => (
                          <Badge key={idx} variant="secondary" className="text-[10px] font-mono bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">{type}</Badge>
                        ))}
                      </div>
                      {audit.categories.schema.issues?.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                          {audit.categories.schema.issues.map((issue, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-xs text-amber-600">
                              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                              <span><span className="font-medium">{issue.type}:</span> {issue.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
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
                            <div className="mt-2 bg-neutral-50 dark:bg-neutral-800 rounded-lg p-3 max-h-64 overflow-auto">
                              <pre className="text-[10px] font-mono text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
                                {JSON.stringify(audit.categories.schema.rawSchemas, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                      <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
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
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-neutral-500">No JSON-LD structured data found</p>
                      <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
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
                </PanelCard>

                {/* Accessibility Panel */}
                <PanelCard
                  icon={Accessibility}
                  title="Accessibility"
                  health={
                    !audit?.categories?.accessibility ? 'neutral' :
                      audit.categories.accessibility.score >= 80 ? 'good' :
                        audit.categories.accessibility.score >= 50 ? 'warning' : 'error'
                  }
                  badge={
                    audit?.categories?.accessibility ? (
                      <Badge variant={audit.categories.accessibility.score >= 80 ? 'secondary' : 'destructive'} className="text-[10px] font-mono">
                        {audit.categories.accessibility.score}/100
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-neutral-400">Not checked</span>
                    )
                  }
                >
                  {audit?.categories?.accessibility ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: 'Skip Link', ok: audit.categories.accessibility.hasSkipLink },
                          { label: 'Main Landmark', ok: audit.categories.accessibility.ariaLandmarks.includes('main') },
                          { label: 'Form Labels', ok: audit.categories.accessibility.formInputsWithoutLabels === 0 },
                          { label: 'Link Text', ok: audit.categories.accessibility.linksWithGenericText === 0 },
                        ].map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs py-1">
                            <StatusIndicator ok={item.ok} />
                            <span className="text-neutral-700 dark:text-neutral-300">{item.label}</span>
                          </div>
                        ))}
                      </div>
                      {audit.categories.accessibility.ariaLandmarks.length > 0 && (
                        <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
                          <span className="text-[10px] text-neutral-400 uppercase tracking-wider">ARIA Landmarks</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {audit.categories.accessibility.ariaLandmarks.map((l, idx) => (
                              <Badge key={idx} variant="secondary" className="text-[10px] font-mono bg-neutral-100 dark:bg-neutral-800">{l}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {audit.categories.accessibility.issues?.length > 0 && (
                        <div className="space-y-1 pt-2 border-t border-neutral-100 dark:border-neutral-800 max-h-32 overflow-y-auto">
                          {audit.categories.accessibility.issues.map((issue, idx) => (
                            <div key={idx} className={`flex items-start gap-2 text-xs ${issue.severity === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                              {issue.severity === 'error' ? <XCircle className="h-3 w-3 mt-0.5 shrink-0" /> : <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />}
                              <span>{issue.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {audit.categories.accessibility.issues?.length === 0 && (
                        <div className="flex items-center gap-2 text-xs text-green-600 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          No accessibility issues
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-500">Accessibility checks available after next scan</p>
                  )}
                </PanelCard>

                {/* Social Card Previews — full width */}
                <PanelCard
                  icon={Share2}
                  title="Social Card Previews"
                  health={audit?.categories?.openGraph?.hasOpenGraph ? 'good' : 'neutral'}
                  className="lg:col-span-2"
                >
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
                      <p className="text-xs text-neutral-500 mb-1">No OG / Twitter Card tags configured</p>
                      <p className="text-[10px] text-neutral-400">Add these tags to control how your page appears on social media</p>
                    </div>
                  )}
                </PanelCard>

                {/* Technical Meta Panel */}
                <PanelCard
                  icon={Globe}
                  title="Technical"
                  health={
                    audit?.categories?.metaTags?.canonicalUrl && audit?.categories?.metaTags?.hasViewport ? 'good' :
                      audit?.categories?.metaTags?.canonicalUrl || audit?.categories?.metaTags?.hasViewport ? 'warning' : 'neutral'
                  }
                  className="lg:col-span-2"
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Canonical URL', ok: !!audit?.categories?.metaTags?.canonicalUrl },
                      { label: 'Viewport', ok: !!audit?.categories?.metaTags?.hasViewport },
                      { label: 'Language', ok: !!audit?.categories?.metaTags?.language },
                      { label: 'Favicon', ok: !!audit?.categories?.metaTags?.favicon },
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
                        <StatusIndicator ok={item.ok} />
                        <span className="text-neutral-700 dark:text-neutral-300 text-xs">{item.label}</span>
                      </div>
                    ))}
                  </div>
                  {audit?.categories?.metaTags?.canonicalUrl && (
                    <div className="mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                      <span className="text-[10px] text-neutral-400 uppercase tracking-wider">Canonical</span>
                      <p className="text-xs font-mono text-neutral-600 dark:text-neutral-400 truncate mt-0.5">{audit.categories.metaTags.canonicalUrl}</p>
                    </div>
                  )}
                  {audit?.categories?.metaTags?.robots && (
                    <div className="mt-2">
                      <span className="text-[10px] text-neutral-400 uppercase tracking-wider">Robots</span>
                      <p className="text-xs font-mono text-neutral-600 dark:text-neutral-400 mt-0.5">{audit.categories.metaTags.robots}</p>
                    </div>
                  )}
                </PanelCard>
              </div>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════ */}
          {/* CHANGE HISTORY — Full dedicated section                */}
          {/* ═══════════════════════════════════════════════════════ */}
          {activeSection === 'history' && projectId && linkId && (
            <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
              <div className="px-5 py-3.5 border-b border-neutral-100 dark:border-neutral-800 flex items-center gap-2.5">
                <History className="h-4 w-4 text-neutral-500" />
                <span className="font-semibold text-sm text-neutral-900 dark:text-white">Change History</span>
              </div>
              <div className="p-5">
                <ChangeLogTimeline linkId={linkId} projectId={projectId} />
              </div>
            </div>
          )}
        </main>
      </div>
    </TooltipProvider>
  )
}
