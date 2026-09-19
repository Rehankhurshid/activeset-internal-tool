"use client"

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react"
import NextLink from "next/link"
import { type ProjectLink, type FolderPageTypes } from "@/modules/site-monitoring"
import type { ImageScanJob } from "@/types"
import type { WebflowConfig } from "@/types/webflow"
import { fetchForProject } from "@/lib/api-client"
import {
  collectFindings,
  findingsForPage,
  fixListMarkdown,
  fixesRollup,
  imageFingerprint,
  READINESS_LABEL,
  readinessOf,
  type AltFinding,
  type LinkFinding,
} from "../../domain/audit-findings"
import { useAuditDecisions } from "../hooks/useAuditDecisions"
import { useAltSuggestions } from "../hooks/useAltSuggestions"
import { AuditHeader, type FixTarget } from "../components/audit/AuditHeader"
import { AltTextTab } from "../components/audit/AltTextTab"
import { LinksTab } from "../components/audit/LinksTab"
import { PageFixes } from "../components/audit/PageFixes"
import { isToday } from "../components/audit/relative-time"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Loader2,
  Search,
  Play,
  ChevronDown,
  ChevronRight,
  Globe,
  Database,
  File,
  FolderOpen,
  ChevronsUpDown,
  ChevronsDownUp,
  Pencil,
  X,
  Check,
  SlidersHorizontal,
  Square,
  ArrowUpDown,
  ImageIcon,
  LinkIcon,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { siteMonitoringRepository } from "@/modules/site-monitoring/infrastructure/site-monitoring.repository"

interface WebsiteAuditDashboardProps {
  links: ProjectLink[];
  projectId: string;
  folderPageTypes?: FolderPageTypes;  // Simple folder → CMS/Static mapping
  detectedLocales?: string[];  // Canonical locales from sitemap hreflang
  pathToLocaleMap?: Record<string, string>;  // Path prefix to locale mapping
  isReadOnly?: boolean;
  imageScanJob?: ImageScanJob;
  /** Lets the Alt text tab write alt back to Webflow when a token is configured. */
  webflowConfig?: WebflowConfig;
  /** Recorded on decisions ("marked decorative by …"). */
  userEmail?: string;
}

interface AuditPageRow {
  id: string;
  path: string;
  title: string;
  locale?: string;
  pageType?: ProjectLink["pageType"];
  status: string;
  lastContentChange: string;
  lastScan: string;
  lastScanRelative: string;
  lastScanTimestamp: string;
  score: number;
  findings: string[];
  rawAudit?: ProjectLink["auditResult"];
}

interface BulkScanProgressState {
  current: number;
  total: number;
  percentage: number;
  currentUrl: string;
  scanId: string;
  startedAt: string;
  scanCollections: boolean;
  captureScreenshots: boolean;
  targetLinkIds: string[];
  completedLinkIds: string[];
}

interface CompactImageItem {
  src: string;
  alt?: string;
  inMainContent?: boolean;
  label?: string;
  count?: number;
  altApplicable?: boolean;
}

const ISSUE_STATUSES = new Set(['Blocked', 'Scan failed', 'Fix needed', 'Template fix pending', 'Content changed', 'Tech-only change']);
type AuditTab = 'pages' | 'alt' | 'links'

const getImageFingerprint = (rawSrc: string): string => {
  const src = rawSrc.trim()
  if (!src) return ""

  // Data URIs can be very large; use only the stable head as fingerprint.
  if (src.startsWith("data:")) {
    return src.slice(0, 120)
  }

  try {
    const parsed = new URL(src)
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/"
    return `${parsed.hostname.toLowerCase()}${pathname}`
  } catch {
    const withoutHash = src.split("#")[0] || src
    const withoutQuery = withoutHash.split("?")[0] || withoutHash
    return withoutQuery.trim().toLowerCase()
  }
}

const isIgnoredAltAuditImage = (rawSrc: string, label?: string): boolean => {
  const src = rawSrc.toLowerCase();
  const sourceLabel = (label || "").toLowerCase();
  const combined = `${src} ${sourceLabel}`;

  const ignoredPatterns = [
    "opengraph",
    "open graph",
    "og:image",
    "og-image",
    "social-share",
    "social share",
    "twitter:image",
    "twitter image",
    "/screenshot",
    "screenshot",
    "mobile shot",
    "tablet shot",
    "desktop shot",
    "previous",
  ];

  return ignoredPatterns.some((pattern) => combined.includes(pattern));
}

const isNiceToHaveSeoIssue = (issue: string): boolean =>
  /^(Title too short|Title too long|Meta description too short|Meta description too long)/i.test(issue.trim());

const isNiceToHaveCompletenessIssue = (issue?: { check?: string; detail?: string }): boolean =>
  (issue?.check || "").toLowerCase() === "low word count";

const collectNonApplicableImageFingerprints = (
  audit?: ProjectLink["auditResult"]
): Set<string> => {
  const fingerprints = new Set<string>()
  if (!audit) return fingerprints

  const ogImage = audit.categories?.openGraph?.image
  const twitterImage = audit.categories?.twitterCards?.image
  const screenshotImage = audit.screenshotUrl
  const previousScreenshotImage = audit.previousScreenshotUrl

  const add = (src?: string) => {
    if (!src) return
    const fingerprint = getImageFingerprint(src)
    if (fingerprint) fingerprints.add(fingerprint)
  }

  add(ogImage)
  add(twitterImage)
  add(screenshotImage)
  add(previousScreenshotImage)

  return fingerprints
}

export function WebsiteAuditDashboard({
  links,
  projectId,
  folderPageTypes: initialFolderPageTypes = {},
  detectedLocales = [],
  pathToLocaleMap = {},
  isReadOnly = false,
  imageScanJob,
  webflowConfig,
  userEmail,
}: WebsiteAuditDashboardProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [localeFilter, setLocaleFilter] = useState("all")
  const [pageTypeFilter, setPageTypeFilter] = useState("all")
  const [sortBy, setSortBy] = useState("critical")
  const [activeAuditTab, setActiveAuditTab] = useState<AuditTab>("pages")
  const [folderTypes, setFolderTypes] = useState<FolderPageTypes>(initialFolderPageTypes)
  const [isEditingFolderTypes, setIsEditingFolderTypes] = useState(false)
  const [pendingFolderTypes, setPendingFolderTypes] = useState<FolderPageTypes>({})
  const [selectedPage, setSelectedPage] = useState<AuditPageRow | null>(null)
  const [checkAllState, setCheckAllState] = useState({
    running: false,
    current: 0,
    total: 0,
    currentUrl: "",
  })
  const checkAllAbortRef = useRef(false)
  const [recheckingPageIds, setRecheckingPageIds] = useState<Set<string>>(new Set())
  const [verifyingFingerprints, setVerifyingFingerprints] = useState<Set<string>>(new Set())
  const { decisions, record: recordDecision, clear: clearDecision } = useAuditDecisions(projectId, !isReadOnly)
  const altSuggestions = useAltSuggestions(projectId, !isReadOnly)
  const [isScanningAllImages, setIsScanningAllImages] = useState(false)
  const [imageScanProgress, setImageScanProgress] = useState({
    current: 0,
    total: 0,
    currentUrl: "",
  })

  // Tracks whether this tab is the one actively orchestrating the bulk scan.
  // Only the owning tab should update/clear the persisted job document.
  const isImageScanOwnerRef = useRef(false)

  // Tracks the last observed job snapshot so we can detect transitions
  // (start → progress → terminal) and emit the right sonner toasts.
  const lastImageScanJobRef = useRef<{ runId?: string; completed: number; resolvedCount: number } | null>(null)

  // Hydrate bulk-scan progress from the persisted job doc so the progress bar
  // survives page refresh and shows in every subscribed tab. Stale jobs (no
  // heartbeat > 2min) are ignored so a crashed orchestrator doesn't hang the UI.
  useEffect(() => {
    const toastId = `image-scan-progress-${projectId}`

    if (!imageScanJob) {
      // Workflow finished (job doc cleared). Emit a summary toast if we had one.
      if (lastImageScanJobRef.current) {
        const { resolvedCount, completed } = lastImageScanJobRef.current
        if (resolvedCount > 0) {
          toast.success(
            `Scan complete · Resolved ALT for ${resolvedCount} image${resolvedCount === 1 ? '' : 's'} across ${completed} page${completed === 1 ? '' : 's'}`,
            { id: toastId }
          )
        } else if (completed > 0) {
          toast.info(`Scan complete · No new ALT fixes detected across ${completed} page${completed === 1 ? '' : 's'}`, {
            id: toastId,
          })
        } else {
          toast.dismiss(toastId)
        }
        lastImageScanJobRef.current = null
      }
      if (!isImageScanOwnerRef.current) setIsScanningAllImages(false)
      return
    }

    const staleAfterMs = 2 * 60 * 1000
    const lastBeat = new Date(imageScanJob.lastUpdatedAt).getTime()
    const isStale =
      imageScanJob.status === 'running' &&
      Number.isFinite(lastBeat) &&
      Date.now() - lastBeat > staleAfterMs

    if (imageScanJob.status === 'running' && !isStale) {
      if (!isImageScanOwnerRef.current) setIsScanningAllImages(true)
      setImageScanProgress({
        current: imageScanJob.completed,
        total: imageScanJob.total,
        currentUrl: imageScanJob.currentUrl || "",
      })

      // Sticky progress toast, updates in place as heartbeats come in.
      const pct = imageScanJob.total > 0 ? Math.round((imageScanJob.completed / imageScanJob.total) * 100) : 0
      toast.loading(
        `Scanning images · ${imageScanJob.completed}/${imageScanJob.total} (${pct}%)${
          imageScanJob.resolvedCount > 0 ? ` · ${imageScanJob.resolvedCount} ALT fixed` : ''
        }`,
        { id: toastId }
      )

      // Emit an info toast whenever the resolvedCount ticks up so the user
      // gets immediate feedback when ALT text is actually resolved.
      const prev = lastImageScanJobRef.current
      if (prev && prev.runId === imageScanJob.runId) {
        const delta = imageScanJob.resolvedCount - prev.resolvedCount
        if (delta > 0) {
          toast.info(`Resolved ALT for ${delta} image${delta === 1 ? '' : 's'}`)
        }
      }
      lastImageScanJobRef.current = {
        runId: imageScanJob.runId,
        completed: imageScanJob.completed,
        resolvedCount: imageScanJob.resolvedCount,
      }
    } else if (imageScanJob.status === 'failed') {
      toast.error('Scan failed', { id: toastId })
      lastImageScanJobRef.current = null
      if (!isImageScanOwnerRef.current) setIsScanningAllImages(false)
    } else if (!isImageScanOwnerRef.current) {
      setIsScanningAllImages(false)
    }
  }, [imageScanJob, projectId])

  // Load persisted folder types
  useEffect(() => {
    try {
      if (typeof window === "undefined") return
      const raw = window.localStorage.getItem(`folderPageTypes:${projectId}`)
      if (!raw) return
      const parsed = JSON.parse(raw) as FolderPageTypes
      if (parsed && typeof parsed === 'object') {
        setFolderTypes(prev => ({ ...prev, ...parsed }))
      }
    } catch {
      // ignore
    }
  }, [projectId])

  // Toggle a folder's pending type (for edit mode)
  const toggleFolderType = useCallback((folder: string) => {
    setPendingFolderTypes(prev => {
      const current = prev[folder] || folderTypes[folder] || 'static'
      const newType = current === 'collection' ? 'static' : 'collection'
      return { ...prev, [folder]: newType }
    })
  }, [folderTypes])

  // Get the effective type (pending or saved)
  const getEffectiveFolderType = useCallback((folder: string): 'static' | 'collection' => {
    return pendingFolderTypes[folder] || folderTypes[folder] || 'static'
  }, [pendingFolderTypes, folderTypes])

  // Check if folder has pending changes
  const hasPendingChange = useCallback((folder: string): boolean => {
    return folder in pendingFolderTypes && pendingFolderTypes[folder] !== folderTypes[folder]
  }, [pendingFolderTypes, folderTypes])

  // Save all pending changes
  const saveAllFolderTypes = useCallback(async () => {
    const updated = { ...folderTypes, ...pendingFolderTypes }
    setFolderTypes(updated)
    setPendingFolderTypes({})
    setIsEditingFolderTypes(false)
    
    // Local copy for the read-only share view, which cannot write; the project
    // document is the source of truth so teammates see the same classification.
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`folderPageTypes:${projectId}`, JSON.stringify(updated))
      }
    } catch {
      // ignore
    }
    if (isReadOnly) return
    try {
      await siteMonitoringRepository.updateFolderPageTypes(projectId, updated)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save folder types')
    }
  }, [folderTypes, pendingFolderTypes, projectId, isReadOnly])

  // Cancel edit mode
  const cancelEditMode = useCallback(() => {
    setPendingFolderTypes({})
    setIsEditingFolderTypes(false)
  }, [])

  // Count pending changes
  const pendingChangesCount = useMemo(() => {
    return Object.keys(pendingFolderTypes).filter(folder => 
      pendingFolderTypes[folder] !== folderTypes[folder]
    ).length
  }, [pendingFolderTypes, folderTypes])

  // Bulk scan state
  const [isBulkScanning, setIsBulkScanning] = useState(false)
  const [bulkScanProgress, setBulkScanProgress] = useState<BulkScanProgressState>({
    current: 0,
    total: 0,
    percentage: 0,
    currentUrl: '',
    scanId: '',
    startedAt: '',
    scanCollections: false,
    captureScreenshots: true,
    targetLinkIds: [],
    completedLinkIds: []
  })
  const [bulkScanCaptureScreenshots, setBulkScanCaptureScreenshots] = useState(true)
  const [showCollectionDialog, setShowCollectionDialog] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Poll for scan progress
  const pollScanProgress = useCallback(async (scanId: string) => {
    try {
      const response = await fetch(`/api/scan-bulk/status?scanId=${scanId}`)
      if (!response.ok) {
        console.error('[BulkScan] Status check failed:', response.status)
        return
      }

      const data = await response.json()
      
      setBulkScanProgress(prev => ({
        ...prev,
        current: data.current,
        total: data.total,
        percentage: data.percentage,
        currentUrl: data.currentUrl || '',
        scanId: data.scanId,
        startedAt: data.startedAt || prev.startedAt,
        scanCollections: data.scanCollections ?? prev.scanCollections,
        captureScreenshots: data.captureScreenshots ?? prev.captureScreenshots,
        targetLinkIds: Array.isArray(data.targetLinkIds) ? data.targetLinkIds : prev.targetLinkIds,
        completedLinkIds: Array.isArray(data.completedLinkIds) ? data.completedLinkIds : prev.completedLinkIds
      }))

      // Check if scan is completed, failed, or cancelled
      if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
        // Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
        
        setIsBulkScanning(false)
        
        // The project subscription has already delivered the new audits; the
        // table re-derives from `links`, so nothing needs a reload — a reload
        // would throw away every filter, expanded group and open sheet.
        if (data.status === 'completed') {
          const summary = data.summary as { contentChanged?: number; failed?: number } | undefined
          const changed = summary?.contentChanged ?? 0
          const failed = summary?.failed ?? 0
          toast.success(
            `Scan complete · ${data.total} page${data.total === 1 ? '' : 's'}${changed ? ` · ${changed} changed` : ''}${failed ? ` · ${failed} failed` : ''}`
          )
        } else if (data.status === 'cancelled') {
          toast.info('Scan stopped — results so far are saved')
        } else {
          console.error('[BulkScan] Failed:', data.error)
        }
      }
    } catch (error) {
      console.error('[BulkScan] Polling error:', error)
    }
  }, [])

  // Cancel/stop a running scan
  const [isCancelling, setIsCancelling] = useState(false)
  
  const handleCancelScan = useCallback(async () => {
    if (!bulkScanProgress.scanId) return
    
    setIsCancelling(true)
    try {
      const response = await fetch('/api/scan-bulk/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId: bulkScanProgress.scanId })
      })
      
      if (response.ok) {
        console.log('[BulkScan] Cancel requested')
        // Stop polling - the scan will update its status
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
        setIsBulkScanning(false)
        setBulkScanProgress({
          current: 0,
          total: 0,
          percentage: 0,
          currentUrl: '',
          scanId: '',
          startedAt: '',
          scanCollections: false,
          captureScreenshots: true,
          targetLinkIds: [],
          completedLinkIds: []
        })
      } else {
        console.error('[BulkScan] Cancel failed')
      }
    } catch (error) {
      console.error('[BulkScan] Cancel error:', error)
    } finally {
      setIsCancelling(false)
    }
  }, [bulkScanProgress.scanId])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [])

  // Check for running scans on mount (handles page refresh during scan)
  // Use a ref to track if we've already checked to avoid duplicate checks
  const hasCheckedForRunningScans = useRef(false)
  
  useEffect(() => {
    const checkRunningScans = async () => {
      // Only check once per mount
      if (hasCheckedForRunningScans.current) return
      hasCheckedForRunningScans.current = true
      
      console.log('[BulkScan] Checking for running scans for project:', projectId)
      
      try {
        const response = await fetch(`/api/scan-bulk/running?projectId=${projectId}`)
        console.log('[BulkScan] Running scans response status:', response.status)
        
        if (!response.ok) {
          console.error('[BulkScan] Failed to fetch running scans')
          return
        }

        const data = await response.json()
        console.log('[BulkScan] Running scans data:', data)
        
        if (data.hasRunningScans && data.scans && data.scans.length > 0) {
          const activeScan = data.scans[0]
          console.log('[BulkScan] Found running scan, resuming:', activeScan.scanId)
          
          // Resume displaying scan progress
          setIsBulkScanning(true)
          setBulkScanProgress({
            scanId: activeScan.scanId,
            current: activeScan.current,
            total: activeScan.total,
            percentage: activeScan.percentage,
            currentUrl: activeScan.currentUrl || '',
            startedAt: activeScan.startedAt || new Date().toISOString(),
            scanCollections: !!activeScan.scanCollections,
            captureScreenshots: activeScan.captureScreenshots !== false,
            targetLinkIds: Array.isArray(activeScan.targetLinkIds) ? activeScan.targetLinkIds : [],
            completedLinkIds: Array.isArray(activeScan.completedLinkIds) ? activeScan.completedLinkIds : []
          })
          
          // Resume polling for progress updates
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
          }
          pollingIntervalRef.current = setInterval(
            () => pollScanProgress(activeScan.scanId),
            2000
          )
        } else {
          console.log('[BulkScan] No running scans found')
        }
      } catch (error) {
        console.error('[BulkScan] Failed to check running scans:', error)
      }
    }

    // Only check if we're not already scanning and projectId is available
    if (!isBulkScanning && projectId) {
      checkRunningScans()
    }
  }, [projectId, isBulkScanning, pollScanProgress])

  // Helper for relative time
  function getRelativeTime(timestamp: string): string {
    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  // Helper to detect locale from URL path using the project's path-to-locale mapping
  const detectLocaleFromUrl = useCallback((url: string): string | undefined => {
    try {
      const pathname = new URL(url).pathname;
      // Match patterns like /es/, /pt/, /es-mx/, /pt-br/
      const localeMatch = pathname.match(/^\/([a-z]{2}(?:-[a-z]{2,3})?)(\/|$)/i);
      if (localeMatch) {
        const pathPrefix = `/${localeMatch[1].toLowerCase()}`;
        
        // Use the path-to-locale mapping if available
        if (pathToLocaleMap && pathToLocaleMap[pathPrefix]) {
          return pathToLocaleMap[pathPrefix];
        }
        
        // Fallback to the raw path segment
        return localeMatch[1].toLowerCase();
      }
      
      // No locale prefix - check if root maps to a locale
      if (pathToLocaleMap && pathToLocaleMap['/']) {
        return pathToLocaleMap['/'];
      }
    } catch {
      // ignore
    }
    return undefined;
  }, [pathToLocaleMap]);

  // Everything the three tabs show, derived once. One finding per thing
  // someone would fix; the tabs and the per-page readiness all read from it.
  const findings = useMemo(() => collectFindings(links, decisions), [links, decisions])
  const rollup = useMemo(() => fixesRollup(findings), [findings])

  // 1. Process Links into Page Data
  const pagesData = useMemo<AuditPageRow[]>(() => {
    const targetLinkIds = bulkScanProgress.targetLinkIds
    const completedLinkIdSet = new Set(bulkScanProgress.completedLinkIds)
    const hasExplicitTargets = targetLinkIds.length > 0

    return links.map(link => {
      const audit = link.auditResult;

      // One readiness state per page, derived from the findings the other two
      // tabs work from. Change status only shows when nothing needs fixing.
      const readiness = readinessOf(link, findings)
      let displayStatus = "No change";
      if (readiness === 'unscanned') displayStatus = "Pending";
      else if (readiness === 'blocked' || readiness === 'scan_failed' || readiness === 'fix_needed' || readiness === 'template_fix_pending') {
        displayStatus = READINESS_LABEL[readiness];
      }
      else if (audit?.changeStatus === 'CONTENT_CHANGED') displayStatus = "Content changed";
      else if (audit?.changeStatus === 'TECH_CHANGE_ONLY') displayStatus = "Tech-only change";

      // Override status during bulk scan based on scan state
      if (isBulkScanning) {
        const isCurrentPage = bulkScanProgress.currentUrl === link.url
        const isTargetPage = hasExplicitTargets
          ? targetLinkIds.includes(link.id)
          : link.source === 'auto' && (bulkScanProgress.scanCollections || link.pageType !== 'collection')
        const isCompletedInCurrentRun = completedLinkIdSet.has(link.id)
        const hasFreshAuditFromCurrentRun = !!(
          bulkScanProgress.startedAt &&
          audit?.lastRun &&
          new Date(audit.lastRun).getTime() >= new Date(bulkScanProgress.startedAt).getTime()
        )

        if (isCurrentPage) {
          displayStatus = "Scanning..."
        } else if (isTargetPage && !isCompletedInCurrentRun) {
          displayStatus = "Queued"
        } else if (isTargetPage && isCompletedInCurrentRun && !hasFreshAuditFromCurrentRun) {
          // Avoid stale "Queued/Pending" while scan is still writing final data.
          displayStatus = "Scanned"
        }
      }

      // Findings aggregation
      const pageFindings = [];
      if (displayStatus !== "Content changed" && audit?.changeStatus === 'CONTENT_CHANGED') pageFindings.push("Changed");
      if ((audit?.categories?.placeholders?.issues?.length || 0) > 0) pageFindings.push("Placeholders");
      if ((audit?.categories?.spelling?.issues?.length || 0) > 0) pageFindings.push("Spelling");
      if ((audit?.categories?.seo?.issues || []).some((issue) => issue && !isNiceToHaveSeoIssue(issue))) pageFindings.push("SEO");
      if ((audit?.categories?.technical?.issues?.length || 0) > 0) pageFindings.push("Technical");
      if ((audit?.score || 0) < 50) pageFindings.push("Low Score");

      // Detect locale from URL if not already set
      const detectedLocale = link.locale || detectLocaleFromUrl(link.url);

      return {
        id: link.id,
        path: link.url, // Display full URL for now, could parse path
        title: link.title,
        locale: detectedLocale, // Include locale for filtering (detected from URL if not set)
        pageType: link.pageType, // CMS or static page type
        status: displayStatus,
        lastContentChange: audit?.lastRun ? new Date(audit.lastRun).toLocaleDateString() : "-",
        lastScan: audit?.lastRun ? new Date(audit.lastRun).toLocaleString() : "-",
        lastScanRelative: audit?.lastRun ? getRelativeTime(audit.lastRun) : "Never",
        lastScanTimestamp: audit?.lastRun || "",
        score: audit?.score || 0,
        findings: pageFindings,
        rawAudit: audit
      };
    });
  }, [
    links,
    findings,
    isBulkScanning,
    bulkScanProgress.currentUrl,
    bulkScanProgress.startedAt,
    bulkScanProgress.scanCollections,
    bulkScanProgress.targetLinkIds,
    bulkScanProgress.completedLinkIds,
    detectLocaleFromUrl
  ]);

  // Normalize locale - use project's detected locales to map short codes to canonical values
  // e.g., if project has 'es-ar' but not 'es', map 'es' → 'es-ar'
  const normalizeLocale = useCallback((locale: string | undefined): string => {
    if (!locale || locale === 'default') return 'default';
    
    const lower = locale.toLowerCase();
    
    // Treat 'en' as default (English without prefix)
    if (lower === 'en') return 'default';
    
    // If the project has detected locales, use them for normalization
    if (detectedLocales.length > 0) {
      // Check if exact match exists in detected locales
      if (detectedLocales.includes(lower)) {
        return lower;
      }
      
      // Check for regional variant (es → es-ar if es-ar exists but es doesn't)
      const regional = detectedLocales.find(l => l.startsWith(lower + '-'));
      if (regional) {
        return regional;
      }
    }
    
    return lower;
  }, [detectedLocales]);

  // Compute available locales for the filter dropdown (normalized)
  const availableLocales = useMemo(() => {
    const locales = new Set<string>();
    links.forEach(link => {
      // Detect locale from URL if not set, then normalize
      const detectedLocale = link.locale || detectLocaleFromUrl(link.url);
      locales.add(normalizeLocale(detectedLocale));
    });
    // Sort locales: default first, then alphabetically
    const sorted = Array.from(locales).sort((a, b) => {
      if (a === 'default') return -1;
      if (b === 'default') return 1;
      return a.localeCompare(b);
    });
    return sorted;
  }, [links, detectLocaleFromUrl, normalizeLocale]);

  // Helper to get folder pattern from URL (for filtering)
  const getFolderPatternFromUrl = useCallback((url: string): string => {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      
      // Remove locale segments
      const nonLocaleParts = pathParts.filter(part => 
        !/^[a-z]{2}(-[a-z]{2})?$/i.test(part)
      );
      
      if (nonLocaleParts.length <= 1) {
        return 'Root Pages';
      }
      return `/${nonLocaleParts[0]}/*`;
    } catch {
      return 'Root Pages';
    }
  }, []);

  const getSeverityRank = useCallback((status: string): number => {
    switch (status) {
      case 'Blocked':
        return 5
      case 'Scan failed':
        return 4
      case 'Fix needed':
        return 3.5
      case 'Content changed':
        return 3
      case 'Template fix pending':
        return 2.5
      case 'Tech-only change':
        return 2
      case 'Pending':
      case 'Queued':
      case 'Scanning...':
        return 1
      case 'Scanned':
        return 0
      default:
        return 0
    }
  }, [])

  // 2. Filter & Sort
  const filteredPages = useMemo(() => {
    return pagesData.filter((page) => {
      if (searchQuery && !page.path.toLowerCase().includes(searchQuery.toLowerCase()) && !page.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
      if (statusFilter === "issues" && !ISSUE_STATUSES.has(page.status)) return false
      if (statusFilter !== "all" && statusFilter !== "issues" && page.status !== statusFilter) return false
      if (localeFilter !== "all" && normalizeLocale(page.locale) !== localeFilter) return false
      if (pageTypeFilter !== "all") {
        // Get folder pattern for this page and check its classification
        const folderPattern = getFolderPatternFromUrl(page.path);
        const folderType = folderTypes[folderPattern] || 'static'; // Default to static if not classified
        if (pageTypeFilter === "static" && folderType === "collection") return false;
        if (pageTypeFilter === "collection" && folderType !== "collection") return false;
      }
      return true
    }).sort((a, b) => {
      if (sortBy === 'score') return a.score - b.score;
      if (sortBy === 'critical') {
        const severityDiff = getSeverityRank(b.status) - getSeverityRank(a.status);
        if (severityDiff !== 0) return severityDiff;
        return a.score - b.score;
      }
      // Recent (default) — ISO timestamps, not the localised display string
      return new Date(b.lastScanTimestamp || 0).getTime() - new Date(a.lastScanTimestamp || 0).getTime();
    });
  }, [pagesData, searchQuery, statusFilter, localeFilter, pageTypeFilter, sortBy, normalizeLocale, getFolderPatternFromUrl, folderTypes, getSeverityRank]);

  // Keep the open detail sheet synced to fresh row data while scanning progresses.
  useEffect(() => {
    if (!selectedPage) return

    const latest = pagesData.find((page) => page.id === selectedPage.id)
    if (!latest) return

    const hasChanged =
      latest.status !== selectedPage.status ||
      latest.score !== selectedPage.score ||
      latest.lastScanTimestamp !== selectedPage.lastScanTimestamp ||
      latest.lastScanRelative !== selectedPage.lastScanRelative ||
      latest.findings.join('|') !== selectedPage.findings.join('|')

    if (hasChanged) {
      setSelectedPage(latest)
    }
  }, [pagesData, selectedPage])

  // Helper to extract folder path from URL
  const getFolderPath = useCallback((url: string): string => {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      
      // Remove locale segments (e.g., 'en', 'es-mx')
      const nonLocaleParts = pathParts.filter(part => 
        !/^[a-z]{2}(-[a-z]{2})?$/i.test(part)
      );
      
      if (nonLocaleParts.length <= 1) {
        return '/'; // Root level pages
      }
      
      // Return the first folder segment
      return `/${nonLocaleParts[0]}`;
    } catch {
      return '/';
    }
  }, []);

  // Group pages by folder within each type
  const groupPagesByFolder = useCallback((pages: typeof filteredPages) => {
    const folderMap = new Map<string, typeof pages>();
    
    pages.forEach(page => {
      const folder = getFolderPath(page.path);
      if (!folderMap.has(folder)) {
        folderMap.set(folder, []);
      }
      folderMap.get(folder)!.push(page);
    });
    
    // Sort folders: root first, then alphabetically
    return Array.from(folderMap.entries())
      .sort(([a], [b]) => {
        if (a === '/') return -1;
        if (b === '/') return 1;
        return a.localeCompare(b);
      })
      .map(([folder, folderPages]) => ({
        folder,
        label: folder === '/' ? 'Root Pages' : `${folder}/*`,
        pages: folderPages
      }));
  }, [getFolderPath]);

  // Group filtered pages by locale first, then by folder type (CMS/Static based on folderTypes)
  const groupedByLocale = useMemo(() => {
    // Group pages by normalized locale
    const localeMap = new Map<string, typeof filteredPages>();
    
    filteredPages.forEach(page => {
      const locale = normalizeLocale(page.locale);
      if (!localeMap.has(locale)) {
        localeMap.set(locale, []);
      }
      localeMap.get(locale)!.push(page);
    });
    
    // Sort locales: default first, then alphabetically
    const sortedLocales = Array.from(localeMap.entries()).sort(([a], [b]) => {
      if (a === 'default') return -1;
      if (b === 'default') return 1;
      return a.localeCompare(b);
    });
    
    // Helper to get readable locale label
    const getLocaleLabel = (locale: string): string => {
      if (locale === 'default') return 'English';
      const localeNames: Record<string, string> = {
        'en': 'English',
        'es': 'Spanish',
        'es-mx': 'Spanish (MX)',
        'es-ar': 'Spanish (AR)',
        'pt': 'Portuguese',
        'pt-br': 'Portuguese (BR)',
        'fr': 'French',
        'de': 'German',
        'it': 'Italian',
        'ja': 'Japanese',
        'zh': 'Chinese',
        'ko': 'Korean',
        'da': 'Danish',
        'nl': 'Dutch',
        'sv': 'Swedish',
        'no': 'Norwegian',
        'fi': 'Finnish',
        'pl': 'Polish',
        'ru': 'Russian',
        'tr': 'Turkish',
        'ar': 'Arabic',
        'hi': 'Hindi',
      };
      return localeNames[locale.toLowerCase()] || locale.toUpperCase();
    };

    return sortedLocales.map(([locale, pages]) => {
      // First group all pages by folder
      const allFolders = groupPagesByFolder(pages);
      
      // Then separate folders by their classification (using folderTypes or pendingFolderTypes)
      const cmsFolders = allFolders.filter(f => {
        const effectiveType = pendingFolderTypes[f.label] || folderTypes[f.label];
        return effectiveType === 'collection';
      });
      const staticFolders = allFolders.filter(f => {
        const effectiveType = pendingFolderTypes[f.label] || folderTypes[f.label];
        return effectiveType !== 'collection'; // includes undefined (unclassified)
      });
      
      const cmsPageCount = cmsFolders.reduce((sum, f) => sum + f.pages.length, 0);
      const staticPageCount = staticFolders.reduce((sum, f) => sum + f.pages.length, 0);
      
      const typeGroups = [
        { type: 'collection', label: 'CMS Pages', icon: Database, folders: cmsFolders, totalCount: cmsPageCount },
        { type: 'static', label: 'Static Pages', icon: File, folders: staticFolders, totalCount: staticPageCount }
      ].filter(group => group.totalCount > 0);
      
      return {
        locale,
        label: getLocaleLabel(locale),
        typeGroups,
        totalCount: pages.length
      };
    }).filter(group => group.totalCount > 0);
  }, [filteredPages, groupPagesByFolder, normalizeLocale, pendingFolderTypes, folderTypes]);

  // Track collapsed state for locales, types, and folders
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  
  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  // Collapse all sections
  const collapseAll = useCallback(() => {
    const allSections = new Set<string>();
    groupedByLocale.forEach(localeGroup => {
      const localeId = `locale-${localeGroup.locale}`;
      allSections.add(localeId);
      localeGroup.typeGroups.forEach(typeGroup => {
        const typeId = `${localeId}-${typeGroup.type}`;
        allSections.add(typeId);
        typeGroup.folders.forEach(folder => {
          allSections.add(`${typeId}-${folder.folder}`);
        });
      });
    });
    setCollapsedSections(allSections);
  }, [groupedByLocale]);

  // Expand all sections
  const expandAll = useCallback(() => {
    setCollapsedSections(new Set());
  }, []);

  // Check if all are collapsed
  const isAllCollapsed = useMemo(() => {
    if (groupedByLocale.length === 0) return false;
    return groupedByLocale.every(localeGroup => 
      collapsedSections.has(`locale-${localeGroup.locale}`)
    );
  }, [groupedByLocale, collapsedSections]);

  // 3. Compute KPI Metrics
  const metrics = useMemo(() => {
    const total = pagesData.length;
    const changed = pagesData.filter(p => p.status === 'Content changed').length;
    const techOnly = pagesData.filter(p => p.status === 'Tech-only change').length;
    const blocked = pagesData.filter(p => p.status === 'Blocked').length;
    const failed = pagesData.filter(p => p.status === 'Scan failed').length;
    // Only scanned pages carry a score; a never-scanned page is not a zero.
    const scored = pagesData.filter(p => p.rawAudit);
    const avgScore = scored.length > 0 ? Math.round(scored.reduce((acc, p) => acc + p.score, 0) / scored.length) : 0;
    const issueCount = changed + techOnly + blocked + failed;

    return { total, changed, techOnly, blocked, failed, avgScore, issueCount };
  }, [pagesData]);

  const latestScanAt = useMemo(() => {
    const latest = pagesData
      .map(p => p.lastScanTimestamp)
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    return latest || null;
  }, [pagesData]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "No change":
        return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
      case "Content changed":
        return "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20"
      case "Tech-only change":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
      case "Blocked":
        return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"
      case "Fix needed":
        return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
      case "Template fix pending":
        return "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20"
      case "Scan failed":
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20"
      case "Scanning...":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20 animate-pulse"
      case "Scanned":
        return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
      case "Queued":
        return "bg-gray-500/10 text-gray-500 dark:text-gray-400 border-gray-500/20"
      default:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20"
    }
  }

  const getStatusDotColor = (status: string) => {
    switch (status) {
      case "No change":
        return "bg-emerald-500"
      case "Content changed":
        return "bg-amber-500"
      case "Tech-only change":
        return "bg-blue-500"
      case "Blocked":
        return "bg-red-500"
      case "Fix needed":
        return "bg-amber-500"
      case "Template fix pending":
        return "bg-violet-500"
      case "Scan failed":
        return "bg-slate-400"
      case "Scanning...":
        return "bg-blue-400"
      case "Scanned":
        return "bg-emerald-400"
      default:
        return "bg-slate-400"
    }
  }

  const getScoreTone = (score: number) => {
    if (score >= 85) {
      return { track: "bg-emerald-500/15", bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" }
    }
    if (score >= 60) {
      return { track: "bg-amber-500/15", bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" }
    }
    return { track: "bg-red-500/15", bar: "bg-red-500", text: "text-red-600 dark:text-red-400" }
  }

  const getCompactUrl = (rawUrl: string) => {
    try {
      const parsed = new URL(rawUrl)
      return `${parsed.hostname}${parsed.pathname || "/"}`
    } catch {
      return rawUrl
    }
  }

  const getMainIssues = (page: AuditPageRow): string[] => {
    const audit = page.rawAudit
    if (!audit?.categories) return []

    const issues: string[] = []

    const placeholderIssues = audit.categories.placeholders?.issues || []
    placeholderIssues.forEach((issue) => {
      if (issue?.type) issues.push(`Placeholder: ${issue.type} (${issue.count})`)
    })

    const spellingIssues = audit.categories.spelling?.issues || []
    spellingIssues.slice(0, 5).forEach((issue) => {
      if (issue?.word) {
        issues.push(
          issue.suggestion
            ? `Spelling: "${issue.word}" -> "${issue.suggestion}"`
            : `Spelling: "${issue.word}"`
        )
      }
    })

    const snapshot = audit.contentSnapshot as
      | { images?: { src: string; alt?: string }[] }
      | undefined
    const nonApplicableImageFingerprints = collectNonApplicableImageFingerprints(audit)
    const effectiveMissingAltFingerprintSet = new Set(
      (snapshot?.images || []).flatMap((image) => {
        const src = image?.src?.trim()
        const hasAltText = !!image?.alt?.trim()
        if (!src || hasAltText) return []
        if (isIgnoredAltAuditImage(src)) return []
        const fingerprint = getImageFingerprint(src)
        if (!fingerprint) return []
        if (nonApplicableImageFingerprints.has(fingerprint)) return []
        return [fingerprint]
      })
    )
    const effectiveMissingAltCount = effectiveMissingAltFingerprintSet.size || (snapshot?.images || []).filter((image) => {
      const src = image?.src?.trim()
      const hasAltText = !!image?.alt?.trim()
      if (!src || hasAltText) return false
      if (isIgnoredAltAuditImage(src)) return false
      const fingerprint = getImageFingerprint(src)
      return fingerprint ? !nonApplicableImageFingerprints.has(fingerprint) : true
    }).length

    const seoIssues = audit.categories.seo?.issues || []
    seoIssues.slice(0, 6).forEach((issue) => {
      if (!issue) return
      if (isNiceToHaveSeoIssue(issue)) return

      if (/image\(s\)\s+missing\s+alt\s+text/i.test(issue)) {
        if (effectiveMissingAltCount > 0) {
          issues.push(`SEO: ${effectiveMissingAltCount} image(s) missing alt text`)
        }
        return
      }

      issues.push(`SEO: ${issue}`)
    })

    const technicalIssues = audit.categories.technical?.issues || []
    technicalIssues.slice(0, 6).forEach((issue) => {
      if (issue) issues.push(`Technical: ${issue}`)
    })

    const completenessIssues = audit.categories.completeness?.issues || []
    completenessIssues.slice(0, 4).forEach((issue) => {
      if (isNiceToHaveCompletenessIssue(issue)) return
      if (issue?.detail) issues.push(`Completeness: ${issue.detail}`)
      else if (issue?.check) issues.push(`Completeness: ${issue.check}`)
    })

    return Array.from(new Set(issues)).slice(0, 10)
  }

  const getNiceToHaveIssues = (page: AuditPageRow): string[] => {
    const audit = page.rawAudit
    if (!audit?.categories) return []

    const issues: string[] = []

    const seoIssues = audit.categories.seo?.issues || []
    seoIssues.forEach((issue) => {
      if (!issue || !isNiceToHaveSeoIssue(issue)) return
      issues.push(`SEO: ${issue}`)
    })

    const completenessIssues = audit.categories.completeness?.issues || []
    completenessIssues.forEach((issue) => {
      if (!isNiceToHaveCompletenessIssue(issue)) return
      if (issue?.detail) issues.push(`Completeness: ${issue.detail}`)
      else if (issue?.check) issues.push(`Completeness: ${issue.check}`)
    })

    return Array.from(new Set(issues)).slice(0, 10)
  }

  const getCompactImages = (page: AuditPageRow): CompactImageItem[] => {
    const raw = page.rawAudit as ProjectLink["auditResult"] & {
      contentSnapshot?: { images?: { src: string; alt?: string; inMainContent?: boolean }[] };
      screenshotUrl?: string;
      previousScreenshotUrl?: string;
      mobileScreenshot?: string;
      tabletScreenshot?: string;
      desktopScreenshot?: string;
      categories?: {
        openGraph?: { image?: string };
        twitterCards?: { image?: string };
      };
    };

    const compactMap = new Map<string, CompactImageItem & { count: number; missingAlt: boolean }>();
    const nonApplicableImageFingerprints = collectNonApplicableImageFingerprints(raw);

    const pushImage = (item: CompactImageItem) => {
      if (!item.src) return;
      const key = item.src;
      const existing = compactMap.get(key);
      const fingerprint = getImageFingerprint(item.src);
      const ignoredForAltAudit = isIgnoredAltAuditImage(item.src, item.label);
      const altApplicable = typeof item.altApplicable === "boolean"
        ? item.altApplicable
        : !(ignoredForAltAudit || (!!fingerprint && nonApplicableImageFingerprints.has(fingerprint)));
      const missingAlt = altApplicable && (!item.alt || !item.alt.trim());

      if (existing) {
        existing.count += 1;
        existing.altApplicable = existing.altApplicable !== false && altApplicable;
        // Prefer the "missing alt" state if any occurrence is missing alt
        if (missingAlt) {
          existing.alt = '';
          existing.missingAlt = true;
        }
        return;
      }

      compactMap.set(key, {
        ...item,
        count: 1,
        missingAlt,
        altApplicable,
      });
    };

    const snapshotImages = [...(raw?.contentSnapshot?.images || [])]
      .sort((a, b) => {
        const aMissingAlt = !a?.alt || !a.alt.trim() ? 1 : 0;
        const bMissingAlt = !b?.alt || !b.alt.trim() ? 1 : 0;
        return bMissingAlt - aMissingAlt;
      });
    for (const img of snapshotImages) {
      if (!img?.src) continue;
      pushImage({
        src: img.src,
        alt: img.alt || "",
        inMainContent: !!img.inMainContent,
        label: "Page image",
      });
    }

    // Fallbacks when page image list is unavailable in snapshot
    if (compactMap.size < 12) {
      const ogImage = raw?.categories?.openGraph?.image;
      const twitterImage = raw?.categories?.twitterCards?.image;
      const screenshotImage = raw?.screenshotUrl;
      const previousScreenshotImage = raw?.previousScreenshotUrl;
      const mobileScreenshot = raw?.mobileScreenshot;
      const tabletScreenshot = raw?.tabletScreenshot;
      const desktopScreenshot = raw?.desktopScreenshot;

      if (ogImage) pushImage({ src: ogImage, label: "OpenGraph", altApplicable: false });
      if (twitterImage) pushImage({ src: twitterImage, label: "Twitter", altApplicable: false });
      if (screenshotImage) pushImage({ src: screenshotImage, label: "Screenshot", altApplicable: false });
      if (previousScreenshotImage) pushImage({ src: previousScreenshotImage, label: "Previous", altApplicable: false });

      // Base64 screenshots (if present)
      if (mobileScreenshot) {
        const src = mobileScreenshot.startsWith("data:") ? mobileScreenshot : `data:image/png;base64,${mobileScreenshot}`;
        pushImage({ src, label: "Mobile shot", altApplicable: false });
      }
      if (tabletScreenshot) {
        const src = tabletScreenshot.startsWith("data:") ? tabletScreenshot : `data:image/png;base64,${tabletScreenshot}`;
        pushImage({ src, label: "Tablet shot", altApplicable: false });
      }
      if (desktopScreenshot) {
        const src = desktopScreenshot.startsWith("data:") ? desktopScreenshot : `data:image/png;base64,${desktopScreenshot}`;
        pushImage({ src, label: "Desktop shot", altApplicable: false });
      }
    }

    return Array.from(compactMap.values())
      .sort((a, b) => {
        const aMissingAlt = a.missingAlt ? 1 : 0;
        const bMissingAlt = b.missingAlt ? 1 : 0;
        if (aMissingAlt !== bMissingAlt) return bMissingAlt - aMissingAlt;
        return (b.count || 1) - (a.count || 1);
      })
      .slice(0, 12)
      .map((item) => ({
        src: item.src,
        alt: item.alt,
        inMainContent: item.inMainContent,
        label: item.label,
        count: item.count,
        altApplicable: item.altApplicable,
      }));
  }

  // Count pages by type
  const staticPages = links.filter(l => l.pageType !== 'collection').length
  const collectionPages = links.filter(l => l.pageType === 'collection').length

  // Bulk scan all pages
  const handleBulkScan = async (includeCollections: boolean = false) => {
    const estimatedTotal = staticPages + (includeCollections ? collectionPages : 0)
    
    setIsBulkScanning(true)
    const scanStartTime = new Date().toISOString()
    setBulkScanProgress({
      current: 0,
      total: estimatedTotal,
      percentage: 0,
      currentUrl: 'Starting scan...',
      scanId: '',
      startedAt: scanStartTime,
      scanCollections: includeCollections,
      captureScreenshots: bulkScanCaptureScreenshots,
      targetLinkIds: [],
      completedLinkIds: []
    })
    setShowCollectionDialog(false)

    try {
      const response = await fetch('/api/scan-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          options: {
            scanCollections: includeCollections,
            captureScreenshots: bulkScanCaptureScreenshots
          }
        })
      })

      const result = await response.json()
      
      if (!response.ok) {
        // Check if scan is already running
        if (response.status === 409 && result.scanId) {
          console.log('[BulkScan] Scan already running, resuming polling:', result.scanId)
          setBulkScanProgress(prev => ({
            ...prev,
            scanId: result.scanId,
            current: result.current ?? prev.current,
            total: result.total ?? prev.total,
            percentage: result.percentage ?? prev.percentage,
            currentUrl: result.currentUrl || prev.currentUrl,
            startedAt: result.startedAt || prev.startedAt,
            scanCollections: result.scanCollections ?? prev.scanCollections,
            captureScreenshots: result.captureScreenshots ?? prev.captureScreenshots,
            targetLinkIds: Array.isArray(result.targetLinkIds) ? result.targetLinkIds : prev.targetLinkIds,
            completedLinkIds: Array.isArray(result.completedLinkIds) ? result.completedLinkIds : prev.completedLinkIds
          }))
          pollScanProgress(result.scanId)
          // Start polling the existing scan
          pollingIntervalRef.current = setInterval(() => {
            pollScanProgress(result.scanId)
          }, 2000)
          return
        }
        throw new Error(result.error || 'Failed to start scan')
      }

      console.log('[BulkScan] Started:', result)
      
      const { scanId, totalPages } = result
      
      if (!scanId) {
        // No pages to scan
        console.log('[BulkScan] No pages to scan')
        setIsBulkScanning(false)
        return
      }

      // Update state with scanId and correct total
      setBulkScanProgress(prev => ({ 
        ...prev, 
        scanId,
        total: totalPages,
        scanCollections: includeCollections,
        captureScreenshots: result.captureScreenshots ?? bulkScanCaptureScreenshots
      }))

      pollScanProgress(scanId)

      // Start polling for progress every 2 seconds
      pollingIntervalRef.current = setInterval(() => {
        pollScanProgress(scanId)
      }, 2000)

    } catch (error) {
      console.error('[BulkScan] Failed to start:', error)
      setIsBulkScanning(false)
    }
  }

  const handleScanAllClick = () => {
    if (collectionPages > 0) {
      setShowCollectionDialog(true)
    } else {
      handleBulkScan(false)
    }
  }

  const scannedPagesCount = useMemo(() => links.filter(link => !!link.auditResult).length, [links])
  const linkCheckedPagesCount = useMemo(
    () => links.filter(link => !!link.auditResult?.categories?.links?.checkedAt).length,
    [links]
  )
  const queuedCount = Math.max(0, bulkScanProgress.total - bulkScanProgress.current)
  const startedAtMs = new Date(bulkScanProgress.startedAt).getTime()
  const elapsedMinutes = Number.isFinite(startedAtMs)
    ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 60000))
    : 0

  const runImageScanForLink = useCallback(async (
    link: ProjectLink
  ): Promise<{ before: number; after: number; images: { src: string; alt?: string }[] } | null> => {
    if (!link?.id || !link?.url) return null

    const before =
      (link.auditResult?.categories?.seo as { imagesWithoutAlt?: number } | undefined)
        ?.imagesWithoutAlt ?? 0

    const response = await fetch('/api/scan-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        linkId: link.id,
        url: link.url,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((payload as { error?: string })?.error || `Failed image scan for ${link.url}`)
    }

    const after = Number((payload as { uniqueMissingAltCount?: number })?.uniqueMissingAltCount ?? 0)
    const images = ((payload as { images?: { src: string; alt?: string }[] })?.images ?? [])
    return { before, after, images }
  }, [projectId])

  const handleScanAllImagesAcrossSite = useCallback(async () => {
    if (isReadOnly || isScanningAllImages) return

    // Every page, every time. Scanning only pages that already had a finding
    // meant a newly added image could never be discovered after the first pass.
    // Pages with open findings go first so the visible list updates soonest.
    const flagged = new Set(findings.alt.flatMap((f) => f.pages.map((p) => p.pageId)))
    const pagesToScan: ProjectLink[] = [...links]
      .filter((link) => !!link.url)
      .sort((a, b) => Number(flagged.has(b.id)) - Number(flagged.has(a.id)))

    if (pagesToScan.length === 0) return

    // Optimistic UI — the Firestore subscription on `imageScanJob` will take
    // over and drive progress as the workflow heartbeats.
    setIsScanningAllImages(true)
    setImageScanProgress({
      current: 0,
      total: pagesToScan.length,
      currentUrl: "",
    })

    const payload = pagesToScan.map((link) => ({ linkId: link.id, url: link.url }))
    const startToastId = `image-scan-start-${projectId}`
    toast.loading(`Starting durable scan of ${payload.length} page${payload.length === 1 ? '' : 's'}…`, {
      id: startToastId,
    })

    try {
      const response = await fetch('/api/image-scan/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, pages: payload }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string
          alreadyRunning?: boolean
        }
        if (data.alreadyRunning) {
          toast.info('A scan is already running for this project — progress will resume below.', {
            id: startToastId,
          })
          return
        }
        throw new Error(data.error || `Failed to start scan (${response.status})`)
      }

      const data = (await response.json()) as { runId: string; total: number }
      toast.success(
        `Scan running in the background · ${data.total} page${data.total === 1 ? '' : 's'} queued`,
        { id: startToastId }
      )
    } catch (error) {
      console.error('[ImageScan] Failed to start workflow:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to start scan', { id: startToastId })
      setIsScanningAllImages(false)
    }
  }, [isReadOnly, isScanningAllImages, links, findings.alt, projectId])

  const handleCancelBulkImageScan = useCallback(async () => {
    if (!imageScanJob?.runId) return
    const toastId = `image-scan-cancel-${projectId}`
    toast.loading('Cancelling scan…', { id: toastId })
    try {
      const response = await fetch('/api/image-scan/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, runId: imageScanJob.runId }),
      })
      if (!response.ok) {
        throw new Error(`Cancel failed (${response.status})`)
      }
      toast.success('Scan cancelled', { id: toastId })
    } catch (error) {
      console.error('[ImageScan] Cancel failed:', error)
      toast.error(error instanceof Error ? error.message : 'Cancel failed', { id: toastId })
    }
  }, [imageScanJob?.runId, projectId])

  // ── Decisions and fixes ───────────────────────────────────────────────

  const by = userEmail || 'team'
  const canWriteWebflow = !isReadOnly && !!webflowConfig?.siteId && !!webflowConfig?.hasApiToken

  const handleSaveAlt = useCallback(async (finding: AltFinding, altText: string) => {
    if (!finding.webflowAssetId) return
    const response = await fetchForProject(projectId, `/api/webflow/assets/${finding.webflowAssetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ altText }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !(payload as { success?: boolean }).success) {
      const message = (payload as { error?: string }).error || `Webflow refused the update (${response.status})`
      toast.error(message)
      throw new Error(message)
    }
    await recordDecision({ kind: 'alt', fingerprint: finding.fingerprint, decision: 'fixed_unverified', altText, by })
    toast.success('Saved to Webflow — publish the site, then verify')
  }, [projectId, recordDecision, by])

  const handleMarkFixed = useCallback(async (finding: AltFinding) => {
    await recordDecision({ kind: 'alt', fingerprint: finding.fingerprint, decision: 'fixed_unverified', by })
    toast.success('Marked fixed — verify once the site is published')
  }, [recordDecision, by])

  const handleMarkDecorative = useCallback(async (finding: AltFinding) => {
    await recordDecision({ kind: 'alt', fingerprint: finding.fingerprint, decision: 'decorative', by })
  }, [recordDecision, by])

  const handleUndoAlt = useCallback(async (finding: AltFinding) => {
    await clearDecision('alt', finding.fingerprint)
  }, [clearDecision])

  const handleVerifyAlt = useCallback(async (finding: AltFinding) => {
    const page = finding.pages[0]
    const link = page ? links.find((l) => l.id === page.pageId) : undefined
    if (!link) return
    setVerifyingFingerprints((prev) => new Set(prev).add(finding.fingerprint))
    try {
      const result = await runImageScanForLink(link)
      const seen = result?.images.find((img) => imageFingerprint(img.src) === finding.fingerprint)
      if (!seen || seen.alt?.trim()) {
        await recordDecision({ kind: 'alt', fingerprint: finding.fingerprint, decision: 'verified', altText: finding.decision?.altText, by })
        toast.success(seen ? 'Verified — the alt text is live' : 'Verified — the image is no longer on the page')
      } else {
        toast.warning('Still no alt text on the live page. If you saved it in Webflow, the site needs publishing.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Verification failed')
    } finally {
      setVerifyingFingerprints((prev) => {
        const next = new Set(prev)
        next.delete(finding.fingerprint)
        return next
      })
    }
  }, [links, runImageScanForLink, recordDecision, by])

  const handlePublishSite = useCallback(async () => {
    if (!webflowConfig?.siteId) return
    const toastId = `publish-${projectId}`
    toast.loading('Publishing site…', { id: toastId })
    try {
      const response = await fetchForProject(projectId, `/api/webflow/sites/${webflowConfig.siteId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish' }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error((payload as { error?: string }).error || `Publish failed (${response.status})`)
      toast.success('Site published — give it a minute, then verify', { id: toastId })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Publish failed', { id: toastId })
    }
  }, [projectId, webflowConfig?.siteId])

  const handleIgnoreLink = useCallback(async (finding: LinkFinding, reason: string) => {
    await recordDecision({ kind: 'link', fingerprint: finding.fingerprint, decision: 'ignored', reason, by })
  }, [recordDecision, by])

  const handleUndoLink = useCallback(async (finding: LinkFinding) => {
    await clearDecision('link', finding.fingerprint)
  }, [clearDecision])

  /** Re-check every link on one page and store the result — one audit document. */
  const checkLinksOnPage = useCallback(async (link: ProjectLink) => {
    const response = await fetch('/api/check-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, linkId: link.id, url: link.url }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error((result as { error?: string }).error || `Link check failed for ${link.url}`)
    await siteMonitoringRepository.saveBrokenLinkResults(projectId, link.id, {
      totalChecked: result.totalChecked || 0,
      totalLinks: result.totalLinks || 0,
      brokenLinks: result.brokenLinks || [],
      unverifiableLinks: result.unverifiableLinks || [],
      validLinks: result.validLinks || 0,
    })
    return result as { brokenLinks?: unknown[]; unverifiableLinks?: unknown[] }
  }, [projectId])

  const handleRecheckPage = useCallback(async (pageId: string) => {
    const link = links.find((l) => l.id === pageId)
    if (!link?.url) return
    setRecheckingPageIds((prev) => new Set(prev).add(pageId))
    try {
      const result = await checkLinksOnPage(link)
      const broken = result.brokenLinks?.length ?? 0
      toast.success(broken === 0 ? `No dead links on ${getCompactUrl(link.url)}` : `${broken} dead link${broken === 1 ? '' : 's'} on ${getCompactUrl(link.url)}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Link check failed')
    } finally {
      setRecheckingPageIds((prev) => {
        const next = new Set(prev)
        next.delete(pageId)
        return next
      })
    }
  }, [links, checkLinksOnPage])

  /**
   * Check every scanned page, three at a time, from this tab. Stoppable, and it
   * says when it is done. The old loop was sequential, silent on failure, and
   * erased the "couldn't verify" list on every page it touched.
   */
  const handleCheckAllLinks = useCallback(async () => {
    if (isReadOnly || checkAllState.running) return
    const pages = links.filter((l) => !!l.auditResult && !!l.url)
    if (pages.length === 0) return

    checkAllAbortRef.current = false
    setCheckAllState({ running: true, current: 0, total: pages.length, currentUrl: '' })

    let done = 0
    let failures = 0
    let stopped = false
    const queue = [...pages]
    const worker = async () => {
      while (queue.length > 0) {
        if (checkAllAbortRef.current) { stopped = true; return }
        const page = queue.shift()!
        setCheckAllState((prev) => ({ ...prev, currentUrl: page.url }))
        try {
          await checkLinksOnPage(page)
        } catch (error) {
          failures += 1
          console.error('[Links] check failed for', page.url, error)
        } finally {
          done += 1
          setCheckAllState((prev) => ({ ...prev, current: done }))
        }
      }
    }
    await Promise.all([worker(), worker(), worker()])

    setCheckAllState({ running: false, current: 0, total: 0, currentUrl: '' })
    if (stopped) toast.info(`Stopped after ${done} of ${pages.length} pages — results so far are saved`)
    else if (failures > 0) toast.warning(`Checked ${done} pages · ${failures} could not be checked`)
    else toast.success(`Checked ${done} page${done === 1 ? '' : 's'}`)
  }, [isReadOnly, checkAllState.running, links, checkLinksOnPage])

  const handleCancelCheckAll = useCallback(() => {
    checkAllAbortRef.current = true
  }, [])

  const openTab = useCallback((target: FixTarget) => {
    setSelectedPage(null)
    setActiveAuditTab(target)
  }, [])

  const showPagesWithStatus = useCallback((status: string) => {
    setStatusFilter(status)
    setActiveAuditTab('pages')
  }, [])

  const handleCopyFixList = useCallback(async () => {
    const site = (() => { try { return links[0] ? new URL(links[0].url).hostname : undefined } catch { return undefined } })()
    await navigator.clipboard.writeText(fixListMarkdown(findings, site))
    toast.success('Fix list copied as Markdown')
  }, [findings, links])

  const totals = useMemo(() => ({
    pages: links.length,
    scanned: scannedPagesCount,
    scannedToday: links.filter((l) => isToday(l.auditResult?.lastRun)).length,
    lastScanAt: latestScanAt,
  }), [links, scannedPagesCount, latestScanAt])

  const openAltCount = findings.alt.filter((f) => f.state === 'open' || f.state === 'regressed').length
  const openLinkCount = findings.links.filter((f) => f.state === 'open').length

  return (
    <div className="space-y-3 text-foreground">
      {/* Collection Dialog */}
      {showCollectionDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <Card className="max-w-md mx-4">
            <CardHeader>
              <CardTitle>Scan All Pages?</CardTitle>
              <CardDescription>
                Found {staticPages} static page{staticPages !== 1 ? 's' : ''} and {collectionPages} collection page{collectionPages !== 1 ? 's' : ''}.
                Collection pages (CMS items) can be resource-intensive.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                <div>
                  <div className="text-sm font-medium">Capture screenshots</div>
                  <div className="text-xs text-muted-foreground">
                    Turn this off for faster bulk scans when screenshot diffs are not needed.
                  </div>
                </div>
                <Switch
                  checked={bulkScanCaptureScreenshots}
                  onCheckedChange={setBulkScanCaptureScreenshots}
                  aria-label="Capture screenshots during bulk scan"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowCollectionDialog(false)}>
                  Cancel
                </Button>
                <Button variant="secondary" onClick={() => handleBulkScan(false)}>
                  Static only ({staticPages})
                </Button>
                <Button onClick={() => handleBulkScan(true)}>
                  Scan all ({staticPages + collectionPages})
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <AuditHeader
        findings={findings}
        rollup={rollup}
        totals={totals}
        onShowBlocked={() => showPagesWithStatus('Blocked')}
        onShowFailed={() => showPagesWithStatus('Scan failed')}
        onOpenTab={openTab}
        onCopyFixList={handleCopyFixList}
      />

      <Tabs
        value={activeAuditTab}
        onValueChange={(value) => {
          if (value === "pages" || value === "alt" || value === "links") {
            setActiveAuditTab(value)
            if (value !== "pages") {
              setSelectedPage(null)
            }
          }
        }}
        className="space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="pages" className="gap-2 flex-1 sm:flex-none">
              <span>Pages</span>
              <span className="text-xs text-muted-foreground tabular-nums">{filteredPages.length}</span>
            </TabsTrigger>
            <TabsTrigger value="alt" className="gap-2 flex-1 sm:flex-none">
              <ImageIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Alt text</span>
              <span className="sm:hidden">Alt</span>
              <span className="text-xs text-muted-foreground tabular-nums">{openAltCount}</span>
            </TabsTrigger>
            <TabsTrigger value="links" className="gap-2 flex-1 sm:flex-none">
              <LinkIcon className="h-4 w-4" />
              <span>Links</span>
              <span className="text-xs text-muted-foreground tabular-nums">{openLinkCount}</span>
            </TabsTrigger>
          </TabsList>
          <p className="text-xs text-muted-foreground tabular-nums">
            avg score {metrics.avgScore} · {metrics.changed} changed · {metrics.techOnly} tech-only
          </p>
        </div>

        <TabsContent value="pages" className="mt-0">
          {/* Pages Table */}
          <Card>
        <CardHeader className="py-3 px-4">
          <TooltipProvider delayDuration={100}>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search (title lives on the tab above; no need to repeat it) */}
              <div className="relative w-full sm:w-56 mr-auto">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search pages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-sm"
                />
              </div>

              {/* Filters + View Controls */}
              <div className="flex items-center border rounded-md bg-muted/30">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SelectTrigger className="h-8 w-8 border-0 bg-transparent justify-center [&>svg:last-child]:hidden">
                        <SlidersHorizontal className={`h-4 w-4 ${statusFilter !== 'all' ? 'text-primary' : ''}`} />
                      </SelectTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Status filter</TooltipContent>
                  </Tooltip>
                  <SelectContent>
                    <SelectItem value="issues">Issues only</SelectItem>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="No change">No change</SelectItem>
                    <SelectItem value="Content changed">Changed</SelectItem>
                    <SelectItem value="Tech-only change">Tech-only</SelectItem>
                    <SelectItem value="Blocked">Blocked</SelectItem>
                    <SelectItem value="Fix needed">Fix needed</SelectItem>
                    <SelectItem value="Template fix pending">Template fix pending</SelectItem>
                    <SelectItem value="Scan failed">Failed</SelectItem>
                  </SelectContent>
                </Select>

                {availableLocales.length > 1 && (
                  <Select value={localeFilter} onValueChange={setLocaleFilter}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SelectTrigger className="h-8 w-8 border-0 bg-transparent justify-center [&>svg:last-child]:hidden">
                          <Globe className={`h-4 w-4 ${localeFilter !== 'all' ? 'text-primary' : ''}`} />
                        </SelectTrigger>
                      </TooltipTrigger>
                      <TooltipContent>Locale filter</TooltipContent>
                    </Tooltip>
                    <SelectContent>
                      <SelectItem value="all">All locales</SelectItem>
                      {availableLocales.map(locale => {
                        const localeNames: Record<string, string> = {
                          'default': 'English', 'en': 'English', 'es': 'Spanish',
                          'es-mx': 'Spanish (MX)', 'pt': 'Portuguese', 'pt-br': 'Portuguese (BR)', 'da': 'Danish',
                        };
                        return (
                          <SelectItem key={locale} value={locale}>
                            {localeNames[locale.toLowerCase()] || locale.toUpperCase()}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}

                <Select value={pageTypeFilter} onValueChange={setPageTypeFilter}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SelectTrigger className="h-8 w-8 border-0 bg-transparent justify-center [&>svg:last-child]:hidden">
                        <Database className={`h-4 w-4 ${pageTypeFilter !== 'all' ? 'text-primary' : ''}`} />
                      </SelectTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Type filter</TooltipContent>
                  </Tooltip>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="static">Static</SelectItem>
                    <SelectItem value="collection">CMS</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={setSortBy}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SelectTrigger className="h-8 w-8 border-0 bg-transparent justify-center [&>svg:last-child]:hidden">
                        <ArrowUpDown className={`h-4 w-4 ${sortBy !== 'critical' ? 'text-primary' : ''}`} />
                      </SelectTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Sort order</TooltipContent>
                  </Tooltip>
                  <SelectContent>
                    <SelectItem value="critical">Severity</SelectItem>
                    <SelectItem value="recent">Recently scanned</SelectItem>
                    <SelectItem value="score">Lowest score first</SelectItem>
                  </SelectContent>
                </Select>

                <div className="w-px h-5 bg-border" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={isAllCollapsed ? expandAll : collapseAll}
                    >
                      {isAllCollapsed ? (
                        <ChevronsUpDown className="h-4 w-4" />
                      ) : (
                        <ChevronsDownUp className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isAllCollapsed ? 'Expand all' : 'Collapse all'}</TooltipContent>
                </Tooltip>
              </div>

              {/* Actions */}
              {!isReadOnly && (
                <div className="flex items-center gap-1">
                  {isEditingFolderTypes ? (
                    <div className="flex items-center border rounded-md bg-muted/30">
                      {pendingChangesCount > 0 && (
                        <Badge variant="secondary" className="text-xs mx-2">
                          {pendingChangesCount}
                        </Badge>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={cancelEditMode}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Cancel</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            className="h-8 w-8 rounded-l-none"
                            onClick={saveAllFolderTypes}
                            disabled={pendingChangesCount === 0}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Save changes</TooltipContent>
                      </Tooltip>
                    </div>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setIsEditingFolderTypes(true)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit folder types</TooltipContent>
                    </Tooltip>
                  )}

                  <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 h-8">
                    <label
                      htmlFor="bulk-scan-screenshots"
                      className="text-[11px] font-medium text-muted-foreground whitespace-nowrap"
                    >
                      Screenshots
                    </label>
                    <Switch
                      id="bulk-scan-screenshots"
                      checked={bulkScanCaptureScreenshots}
                      onCheckedChange={setBulkScanCaptureScreenshots}
                      disabled={isBulkScanning}
                      aria-label="Capture screenshots during bulk scan"
                    />
                  </div>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        className="h-8 w-8"
                        onClick={handleScanAllClick}
                        disabled={isBulkScanning || links.length === 0}
                      >
                        {isBulkScanning ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Scan all pages</TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>

            {/* Active Filters Display */}
            {(searchQuery || statusFilter !== 'all' || localeFilter !== 'all' || pageTypeFilter !== 'all' || sortBy !== 'critical') && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Filters:</span>
                
                {searchQuery && (
                  <Badge variant="secondary" className="text-xs gap-1 pl-2 pr-1 py-0.5">
                    Search: &quot;{searchQuery.length > 15 ? searchQuery.slice(0, 15) + '...' : searchQuery}&quot;
                    <button
                      onClick={() => setSearchQuery('')}
                      className="ml-0.5 hover:bg-muted rounded-sm"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                
                {statusFilter !== 'all' && (
                  <Badge variant="secondary" className="text-xs gap-1 pl-2 pr-1 py-0.5">
                    Status: {statusFilter}
                    <button
                      onClick={() => setStatusFilter('all')}
                      className="ml-0.5 hover:bg-muted rounded-sm"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                
                {localeFilter !== 'all' && (
                  <Badge variant="secondary" className="text-xs gap-1 pl-2 pr-1 py-0.5">
                    Locale: {localeFilter.toUpperCase()}
                    <button
                      onClick={() => setLocaleFilter('all')}
                      className="ml-0.5 hover:bg-muted rounded-sm"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                
                {pageTypeFilter !== 'all' && (
                  <Badge variant="secondary" className="text-xs gap-1 pl-2 pr-1 py-0.5">
                    Type: {pageTypeFilter === 'collection' ? 'CMS' : 'Static'}
                    <button
                      onClick={() => setPageTypeFilter('all')}
                      className="ml-0.5 hover:bg-muted rounded-sm"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}

                {sortBy !== 'critical' && (
                  <Badge variant="secondary" className="text-xs gap-1 pl-2 pr-1 py-0.5">
                    Sort: {sortBy === 'recent' ? 'Recent' : 'Score'}
                    <button
                      onClick={() => setSortBy('critical')}
                      className="ml-0.5 hover:bg-muted rounded-sm"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}

                {/* Clear All */}
                {(searchQuery || statusFilter !== 'all' || localeFilter !== 'all' || pageTypeFilter !== 'all' || sortBy !== 'critical') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                      setLocaleFilter('all');
                      setPageTypeFilter('all');
                      setSortBy('critical');
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}
          </TooltipProvider>
        </CardHeader>
        {isBulkScanning && (
          <div className="px-6 pb-5">
            <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 shadow-sm space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
                    <p className="text-sm font-semibold">
                      Live Scan in Progress
                    </p>
                    <Badge variant="secondary" className="text-[10px]">
                      {bulkScanProgress.scanCollections ? 'All pages' : 'Static only'}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {bulkScanProgress.captureScreenshots ? 'Screenshots on' : 'Screenshots off'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Scanning {bulkScanProgress.current} of {bulkScanProgress.total} pages ({bulkScanProgress.percentage}%)
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
                    <Badge variant="outline" className="h-6 px-2 font-normal">
                      Completed {bulkScanProgress.current}
                    </Badge>
                    <Badge variant="outline" className="h-6 px-2 font-normal">
                      Queued {queuedCount}
                    </Badge>
                    <Badge variant="outline" className="h-6 px-2 font-normal">
                      Elapsed {elapsedMinutes}m
                    </Badge>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelScan}
                  disabled={isCancelling}
                  className="h-8 px-3 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                >
                  {isCancelling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Square className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Stop scan
                </Button>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Overall progress</span>
                  <span className="tabular-nums">{bulkScanProgress.percentage}%</span>
                </div>
                <Progress value={bulkScanProgress.percentage} className="h-2.5 w-full" />
              </div>

              <div className="rounded-md border bg-background/70 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Current URL</div>
                <div className="text-xs sm:text-sm truncate" title={bulkScanProgress.currentUrl || 'Preparing scan queue...'}>
                  {bulkScanProgress.currentUrl || 'Preparing scan queue...'}
                </div>
              </div>
            </div>
          </div>
        )}
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            {filteredPages.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No pages match your filter.</div>
            ) : (
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow className="hover:bg-transparent sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
                    <TableHead className="h-10 text-[11px] uppercase tracking-wide text-muted-foreground w-[40%]">Page Title / URL</TableHead>
                    <TableHead className="h-10 text-[11px] uppercase tracking-wide text-muted-foreground w-[16%]">Status</TableHead>
                    <TableHead className="h-10 text-[11px] uppercase tracking-wide text-muted-foreground w-[12%]">Last Scan</TableHead>
                    <TableHead className="h-10 text-[11px] uppercase tracking-wide text-muted-foreground w-[15%]">Score</TableHead>
                    <TableHead className="h-10 text-[11px] uppercase tracking-wide text-muted-foreground w-[11%]">Findings</TableHead>
                    <TableHead className="h-10 text-[11px] uppercase tracking-wide text-muted-foreground text-right w-[6%]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedByLocale.map((localeGroup) => {
                    const localeId = `locale-${localeGroup.locale}`;
                    const isLocaleCollapsed = collapsedSections.has(localeId);
                    
                    // Only show locale header if there are multiple locales
                    const showLocaleHeader = groupedByLocale.length > 1;
                    
                    return (
                      <React.Fragment key={localeId}>
                        {/* Locale Header - Only show if multiple locales */}
                        {showLocaleHeader && (
                          <TableRow 
                            key={`${localeId}-header`}
                            className="bg-muted/20 hover:bg-muted/35 cursor-pointer"
                            onClick={() => toggleSection(localeId)}
                          >
                            <TableCell colSpan={6} className="py-2">
                              <div className="flex items-center gap-2 font-bold">
                                {isLocaleCollapsed ? (
                                  <ChevronRight className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                                <Globe className="h-4 w-4" />
                                <span>{localeGroup.label}</span>
                                <Badge variant="secondary" className="text-xs">
                                  {localeGroup.totalCount}
                                </Badge>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                        
                        {/* Type Groups within Locale */}
                        {!isLocaleCollapsed && localeGroup.typeGroups.map((typeGroup) => {
                          const TypeIcon = typeGroup.icon;
                          const typeId = `${localeId}-${typeGroup.type}`;
                          const isTypeCollapsed = collapsedSections.has(typeId);
                          
                          return (
                            <React.Fragment key={typeId}>
                              {/* Type Header (CMS/Static) */}
                              <TableRow 
                                key={`${typeId}-header`}
                                className="bg-muted/70 hover:bg-muted/60 cursor-pointer"
                                onClick={() => toggleSection(typeId)}
                              >
                                <TableCell colSpan={6} className={`py-2 ${showLocaleHeader ? 'pl-8' : ''}`}>
                                  <div className="flex items-center gap-2 font-semibold">
                                    {isTypeCollapsed ? (
                                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    <TypeIcon className="h-4 w-4" />
                                    <span>{typeGroup.label}</span>
                                    <Badge variant="secondary" className="text-xs">
                                      {typeGroup.totalCount}
                                    </Badge>
                                  </div>
                                </TableCell>
                              </TableRow>
                              
                              {/* Folder Groups within Type */}
                              {!isTypeCollapsed && typeGroup.folders.map((folder) => {
                                const folderId = `${typeId}-${folder.folder}`;
                                const isFolderCollapsed = collapsedSections.has(folderId);
                                const folderPattern = folder.label; // e.g., "/blog/*" or "Root Pages"
                                const isRootFolder = folder.folder === '/';
                                const effectiveType = getEffectiveFolderType(folderPattern);
                                const isPending = hasPendingChange(folderPattern);
                                
                                return (
                                  <React.Fragment key={folderId}>
                                    {/* Folder Header - Collapsible */}
                                    <TableRow 
                                      key={`${folderId}-header`}
                                      className={`bg-muted/30 hover:bg-muted/40 cursor-pointer ${isPending ? 'ring-2 ring-blue-500/50' : ''}`}
                                      onClick={() => toggleSection(folderId)}
                                    >
                                      <TableCell colSpan={6} className={`py-1.5 ${showLocaleHeader ? 'pl-14' : 'pl-8'}`}>
                                        <div className="flex items-center gap-2 text-sm">
                                          {isFolderCollapsed ? (
                                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                          ) : (
                                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                          )}
                                          <FolderOpen className="h-4 w-4 text-muted-foreground" />
                                          <span className="font-medium font-mono text-muted-foreground">{folder.label}</span>
                                          <Badge variant="outline" className="text-xs">
                                            {folder.pages.length}
                                          </Badge>
                                          {/* Show current type badge */}
                                          {!isRootFolder && (
                                            <Badge 
                                              variant={effectiveType === 'collection' ? 'default' : 'secondary'} 
                                              className={`text-xs ${isPending ? 'ring-1 ring-blue-500' : ''}`}
                                            >
                                              {effectiveType === 'collection' ? 'CMS' : 'Static'}
                                            </Badge>
                                          )}
                                          {/* Toggle button - only show in edit mode for non-root folders */}
                                          {isEditingFolderTypes && !isRootFolder && (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="ml-auto h-6 px-2 text-xs"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleFolderType(folderPattern);
                                              }}
                                            >
                                              {effectiveType === 'collection' ? (
                                                <>
                                                  <File className="h-3 w-3 mr-1" />
                                                  Switch to Static
                                                </>
                                              ) : (
                                                <>
                                                  <Database className="h-3 w-3 mr-1" />
                                                  Switch to CMS
                                                </>
                                              )}
                                            </Button>
                                          )}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                    
                                    {/* Folder Pages */}
                                    {!isFolderCollapsed && folder.pages.map((page, pageIndex) => (
                                      <TableRow
                                        key={page.id}
                                        className={cn(
                                          "cursor-pointer border-l-2 border-l-transparent hover:bg-muted/35",
                                          pageIndex % 2 === 0 ? "bg-background" : "bg-muted/[0.08]",
                                          page.status === "Blocked" && "border-l-red-500/70",
                                          page.status === "Content changed" && "border-l-orange-500/70",
                                          page.status === "Tech-only change" && "border-l-blue-500/70",
                                          selectedPage?.id === page.id && "bg-muted/45"
                                        )}
                                        onClick={() => setSelectedPage(page)}
                                      >
                                        <TableCell className={`font-medium max-w-[300px] ${showLocaleHeader ? 'pl-20' : 'pl-14'}`}>
                                          <div className="flex items-center gap-2 min-w-0">
                                            <div className="font-semibold block truncate flex-1 leading-5" title={page.title}>{page.title || 'Untitled'}</div>
                                          </div>
                                          <span className="text-xs text-muted-foreground/90 block truncate font-mono" title={page.path}>
                                            {getCompactUrl(page.path)}
                                          </span>
                                        </TableCell>
                                        <TableCell>
                                          <Badge variant="outline" className={cn("h-6 px-2.5 gap-1.5", getStatusColor(page.status))}>
                                            <span className={cn("h-1.5 w-1.5 rounded-full", getStatusDotColor(page.status))} />
                                            {page.status}
                                          </Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground tabular-nums" title={page.lastScan}>
                                          {page.lastScanRelative}
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex items-center gap-2.5">
                                            <div className={cn("relative h-2.5 w-20 rounded-full overflow-hidden", getScoreTone(page.score).track)}>
                                              <div
                                                className={cn("absolute left-0 top-0 h-full rounded-full transition-all", getScoreTone(page.score).bar)}
                                                style={{ width: `${Math.max(0, Math.min(100, page.score))}%` }}
                                              />
                                            </div>
                                            <span className={cn("text-sm font-semibold tabular-nums", getScoreTone(page.score).text)}>{page.score}</span>
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex flex-wrap gap-1.5 items-center">
                                            {page.findings.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                                            {page.findings.slice(0, 2).map((finding, idx) => (
                                              <Badge key={idx} variant="secondary" className="text-xs">
                                                {finding}
                                              </Badge>
                                            ))}
                                            {page.findings.length > 2 && (
                                              <Badge variant="outline" className="text-xs">
                                                +{page.findings.length - 2}
                                              </Badge>
                                            )}
                                          </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <div className="flex justify-end gap-2">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-8 px-3 text-xs"
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                setSelectedPage(page)
                                              }}
                                            >
                                              Open
                                            </Button>
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </React.Fragment>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="alt" className="mt-0">
          <AltTextTab
            findings={findings.alt}
            isReadOnly={isReadOnly}
            canWriteWebflow={canWriteWebflow}
            onSaveAlt={handleSaveAlt}
            onMarkFixed={handleMarkFixed}
            onMarkDecorative={handleMarkDecorative}
            onUndo={handleUndoAlt}
            onVerify={handleVerifyAlt}
            verifyingFingerprints={verifyingFingerprints}
            suggestions={altSuggestions}
            onPublishSite={canWriteWebflow ? handlePublishSite : undefined}
            scanAll={{
              running: isScanningAllImages,
              current: imageScanProgress.current,
              total: imageScanProgress.total,
              currentUrl: imageScanProgress.currentUrl,
              start: handleScanAllImagesAcrossSite,
              cancel: handleCancelBulkImageScan,
              disabled: links.length === 0,
            }}
          />
        </TabsContent>

        <TabsContent value="links" className="mt-0">
          <LinksTab
            broken={findings.links}
            unverifiable={findings.unverifiable}
            isReadOnly={isReadOnly}
            onIgnore={handleIgnoreLink}
            onUndo={handleUndoLink}
            onRecheckPage={handleRecheckPage}
            recheckingPageIds={recheckingPageIds}
            checkAll={{
              running: checkAllState.running,
              current: checkAllState.current,
              total: checkAllState.total,
              currentUrl: checkAllState.currentUrl,
              start: handleCheckAllLinks,
              cancel: handleCancelCheckAll,
              disabled: scannedPagesCount === 0,
            }}
            checkedPages={linkCheckedPagesCount}
            scannedPages={scannedPagesCount}
          />
        </TabsContent>
      </Tabs>

      <Sheet open={!!selectedPage} onOpenChange={(open) => !open && setSelectedPage(null)}>
        <SheetContent side="right" className="sm:max-w-md w-[92vw] p-0">
          {selectedPage && (
            <>
              <SheetHeader className="border-b">
                <SheetTitle className="pr-10">{selectedPage.title || "Untitled page"}</SheetTitle>
                <SheetDescription className="text-xs break-all">
                  {selectedPage.path}
                </SheetDescription>
              </SheetHeader>

              <div className="p-4 space-y-4 overflow-y-auto">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={getStatusColor(selectedPage.status)}>
                    {selectedPage.status}
                  </Badge>
                  <Badge variant="secondary">{selectedPage.pageType === "collection" ? "CMS" : "Static"}</Badge>
                  {selectedPage.locale && (
                    <Badge variant="secondary">{normalizeLocale(selectedPage.locale).toUpperCase()}</Badge>
                  )}
                </div>

                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground mb-2">Quality score</p>
                  <div className="flex items-center gap-2">
                    <Progress value={selectedPage.score} className="h-2" />
                    <span className="text-sm font-semibold tabular-nums">{selectedPage.score}</span>
                  </div>
                </div>

                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Last scan</p>
                  <p className="text-sm font-medium">{selectedPage.lastScanRelative}</p>
                  <p className="text-xs text-muted-foreground">{selectedPage.lastScan}</p>
                </div>

                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Findings</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedPage.findings.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No major findings</span>
                    ) : (
                      selectedPage.findings.map((finding, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {finding}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>

                <PageFixes findings={findingsForPage(findings, selectedPage.id)} onOpenTab={openTab} />

                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Main issues</p>
                  {getMainIssues(selectedPage).length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      No major issues found in this scan.
                    </span>
                  ) : (
                    <ul className="space-y-1.5">
                      {getMainIssues(selectedPage).map((issue, idx) => (
                        <li key={`${issue}-${idx}`} className="text-sm leading-5 text-foreground/90">
                          • {issue}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {getNiceToHaveIssues(selectedPage).length > 0 && (
                  <div className="rounded-md border p-3">
                    <details className="group">
                      <summary className="cursor-pointer list-none text-xs text-muted-foreground flex items-center justify-between">
                        <span>Good to have</span>
                        <span className="text-[10px] text-muted-foreground/80">{getNiceToHaveIssues(selectedPage).length}</span>
                      </summary>
                      <ul className="mt-2 space-y-1.5">
                        {getNiceToHaveIssues(selectedPage).map((issue, idx) => (
                          <li key={`${issue}-${idx}`} className="text-sm leading-5 text-foreground/80">
                            • {issue}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                )}

                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Images</p>
                  {getCompactImages(selectedPage).length === 0 ? (
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>No image thumbnails available in this scan snapshot.</p>
                      {typeof selectedPage.rawAudit?.categories?.seo?.imagesWithoutAlt === "number" && (
                        <p>
                          Missing alt text:{" "}
                          <span className="font-medium">
                            {selectedPage.rawAudit.categories.seo.imagesWithoutAlt}
                          </span>
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {getCompactImages(selectedPage).map((img, idx) => (
                        <a
                          key={`${img.src}-${idx}`}
                          href={img.src}
                          target="_blank"
                          rel="noreferrer"
                          className="group block rounded-md border overflow-hidden bg-muted/20"
                          title={img.alt || img.src}
                        >
                          <div className="aspect-square relative">
                            <img
                              src={img.src}
                              alt={img.alt || (img.altApplicable === false ? "Social image preview" : "Page image")}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <div className="p-1.5 space-y-1">
                            <div className="flex gap-1 flex-wrap">
                              {img.altApplicable === false ? (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                  ALT N/A
                                </Badge>
                              ) : (
                                <Badge variant={img.alt ? "secondary" : "destructive"} className="text-[10px] px-1.5 py-0 h-4">
                                  {img.alt ? "ALT" : "No ALT"}
                                </Badge>
                              )}
                              {(img.count || 1) > 1 && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                  x{img.count}
                                </Badge>
                              )}
                              {img.inMainContent && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                  Main
                                </Badge>
                              )}
                              {img.label && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                  {img.label}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  {!isReadOnly && (
                    <Button asChild>
                      <NextLink href={`/modules/project-links/${projectId}/audit/${selectedPage.id}`}>
                        View full details
                      </NextLink>
                    </Button>
                  )}
                  <Button variant="outline" asChild>
                    <a href={selectedPage.path} target="_blank" rel="noreferrer">
                      Open page URL
                    </a>
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
