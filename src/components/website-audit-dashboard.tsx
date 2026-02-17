"use client"

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react"
import NextLink from "next/link"
import { ProjectLink, FolderPageTypes } from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  AlertTriangle,
  CheckCircle2,
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
  RefreshCw,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { projectsService } from "@/services/database"

interface WebsiteAuditDashboardProps {
  links: ProjectLink[];
  projectId: string;
  folderPageTypes?: FolderPageTypes;  // Simple folder → CMS/Static mapping
  detectedLocales?: string[];  // Canonical locales from sitemap hreflang
  pathToLocaleMap?: Record<string, string>;  // Path prefix to locale mapping
  isReadOnly?: boolean;
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
  targetLinkIds: string[];
  completedLinkIds: string[];
}

interface CompactImageItem {
  src: string;
  alt?: string;
  inMainContent?: boolean;
  label?: string;
  count?: number;
}

interface MissingAltImageIssue {
  key: string;
  pageId: string;
  pageTitle: string;
  pageUrl: string;
  imageSrc: string;
  imageFingerprint: string;
  inMainContent: boolean;
  occurrences: number;
  repeatedAcrossPages: boolean;
  repeatedPageCount: number;
  repeatedTotalOccurrences: number;
  lastScan?: string;
  lastScanRelative: string;
}

interface MissingAltPageGroup {
  pageId: string;
  pageTitle: string;
  pageUrl: string;
  lastScan?: string;
  lastScanRelative: string;
  issues: MissingAltImageIssue[];
  uniqueImageCount: number;
  totalOccurrences: number;
  repeatedImageCount: number;
  mainContentImageCount: number;
}

interface MissingAltUniqueImageGroup {
  imageFingerprint: string;
  imageSrc: string;
  inMainContent: boolean;
  totalOccurrences: number;
  pageCount: number;
  lastScan?: string;
  lastScanRelative: string;
  pages: {
    pageId: string;
    pageTitle: string;
    pageUrl: string;
    occurrences: number;
  }[];
}

interface BrokenLinkIssueRow {
  key: string;
  pageId: string;
  pageTitle: string;
  pageUrl: string;
  href: string;
  status: number;
  text: string;
  error?: string;
  checkedAt?: string;
  checkedRelative: string;
}

const ISSUE_STATUSES = new Set(['Blocked', 'Scan failed', 'Content changed', 'Tech-only change']);
type AuditTab = 'pages' | 'missing-alt' | 'broken-links'
type MissingAltAreaFilter = 'all' | 'main' | 'other'
type MissingAltRepeatFilter = 'all' | 'repeated' | 'single'
type MissingAltSortMode = 'impact' | 'recent' | 'alphabetical'
type MissingAltViewMode = 'page' | 'unique'

const toTimestamp = (value?: string): number => {
  if (!value) return 0
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? ts : 0
}

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

const compareMissingAltIssues = (
  a: MissingAltImageIssue,
  b: MissingAltImageIssue,
  sortMode: MissingAltSortMode
): number => {
  if (sortMode === "recent") {
    return toTimestamp(b.lastScan) - toTimestamp(a.lastScan)
  }

  if (sortMode === "alphabetical") {
    const titleSort = a.pageTitle.localeCompare(b.pageTitle)
    if (titleSort !== 0) return titleSort
    return a.imageSrc.localeCompare(b.imageSrc)
  }

  if (a.repeatedPageCount !== b.repeatedPageCount) return b.repeatedPageCount - a.repeatedPageCount
  if (a.inMainContent !== b.inMainContent) return a.inMainContent ? -1 : 1
  if (a.occurrences !== b.occurrences) return b.occurrences - a.occurrences
  return toTimestamp(b.lastScan) - toTimestamp(a.lastScan)
}

const getRepeatedUsageLabel = (issue: MissingAltImageIssue): string => {
  if (issue.repeatedTotalOccurrences <= issue.repeatedPageCount) {
    return `Repeated on ${issue.repeatedPageCount} pages (once each)`
  }
  return `Repeated on ${issue.repeatedPageCount} pages • ${issue.repeatedTotalOccurrences} total occurrences`
}

export function WebsiteAuditDashboard({ 
  links, 
  projectId, 
  folderPageTypes: initialFolderPageTypes = {},
  detectedLocales = [],
  pathToLocaleMap = {},
  isReadOnly = false,
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
  const [isCheckingAllBrokenLinks, setIsCheckingAllBrokenLinks] = useState(false)
  const [brokenLinkCheckProgress, setBrokenLinkCheckProgress] = useState({
    current: 0,
    total: 0,
    currentUrl: "",
  })
  const [missingAltSearch, setMissingAltSearch] = useState("")
  const [missingAltAreaFilter, setMissingAltAreaFilter] = useState<MissingAltAreaFilter>("all")
  const [missingAltRepeatFilter, setMissingAltRepeatFilter] = useState<MissingAltRepeatFilter>("all")
  const [missingAltSortMode, setMissingAltSortMode] = useState<MissingAltSortMode>("impact")
  const [missingAltViewMode, setMissingAltViewMode] = useState<MissingAltViewMode>("page")
  const [collapsedMissingAltPages, setCollapsedMissingAltPages] = useState<Set<string>>(new Set())
  const [missingAltPreviewErrors, setMissingAltPreviewErrors] = useState<Set<string>>(new Set())

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
    
    // Persist locally
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`folderPageTypes:${projectId}`, JSON.stringify(updated))
      }
    } catch {
      // ignore
    }
    
    // Reload to apply the change
    window.location.reload()
  }, [folderTypes, pendingFolderTypes, projectId])

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
    targetLinkIds: [],
    completedLinkIds: []
  })
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
        
        if (data.status === 'completed') {
          console.log('[BulkScan] Completed:', data.summary)
          // Refresh the page to show updated results
          window.location.reload()
        } else if (data.status === 'cancelled') {
          console.log('[BulkScan] Cancelled by user')
          // Refresh to show partial results
          window.location.reload()
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

  // 1. Process Links into Page Data
  const pagesData = useMemo<AuditPageRow[]>(() => {
    const targetLinkIds = bulkScanProgress.targetLinkIds
    const completedLinkIdSet = new Set(bulkScanProgress.completedLinkIds)
    const hasExplicitTargets = targetLinkIds.length > 0

    return links.map(link => {
      const audit = link.auditResult;

      // Determine display status based on both changeStatus and deployment status
      let displayStatus = "No change";
      if (!audit) displayStatus = "Pending";
      else if (audit.canDeploy === false) displayStatus = "Blocked";
      else if (audit.changeStatus === 'CONTENT_CHANGED') displayStatus = "Content changed";
      else if (audit.changeStatus === 'TECH_CHANGE_ONLY') displayStatus = "Tech-only change";
      if (audit?.changeStatus === 'SCAN_FAILED') displayStatus = "Scan failed";

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
      const findings = [];
      if ((audit?.categories?.placeholders?.issues?.length || 0) > 0) findings.push("Placeholders");
      if ((audit?.categories?.spelling?.issues?.length || 0) > 0) findings.push("Spelling");
      if ((audit?.categories?.seo?.issues?.length || 0) > 0) findings.push("SEO");
      if ((audit?.categories?.technical?.issues?.length || 0) > 0) findings.push("Technical");
      if ((audit?.score || 0) < 50) findings.push("Low Score");

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
        findings,
        rawAudit: audit
      };
    });
  }, [
    links,
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
      case 'Content changed':
        return 3
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
      // Recent (default)
      return new Date(b.lastScan).getTime() - new Date(a.lastScan).getTime();
    });
  }, [pagesData, searchQuery, statusFilter, localeFilter, pageTypeFilter, sortBy, normalizeLocale, getFolderPatternFromUrl, folderTypes, getSeverityRank]);

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
    const avgScore = total > 0 ? Math.round(pagesData.reduce((acc, p) => acc + p.score, 0) / total) : 0;
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

  const criticalIssues = pagesData.filter((page) => page.status === "Blocked")

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

    const seoIssues = audit.categories.seo?.issues || []
    seoIssues.slice(0, 6).forEach((issue) => {
      if (issue) issues.push(`SEO: ${issue}`)
    })

    const technicalIssues = audit.categories.technical?.issues || []
    technicalIssues.slice(0, 6).forEach((issue) => {
      if (issue) issues.push(`Technical: ${issue}`)
    })

    const completenessIssues = audit.categories.completeness?.issues || []
    completenessIssues.slice(0, 4).forEach((issue) => {
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

    const pushImage = (item: CompactImageItem) => {
      if (!item.src) return;
      const key = item.src;
      const existing = compactMap.get(key);
      const missingAlt = !item.alt || !item.alt.trim();

      if (existing) {
        existing.count += 1;
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
        missingAlt
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

      if (ogImage) pushImage({ src: ogImage, label: "OpenGraph" });
      if (twitterImage) pushImage({ src: twitterImage, label: "Twitter" });
      if (screenshotImage) pushImage({ src: screenshotImage, label: "Screenshot" });
      if (previousScreenshotImage) pushImage({ src: previousScreenshotImage, label: "Previous" });

      // Base64 screenshots (if present)
      if (mobileScreenshot) {
        const src = mobileScreenshot.startsWith("data:") ? mobileScreenshot : `data:image/png;base64,${mobileScreenshot}`;
        pushImage({ src, label: "Mobile shot" });
      }
      if (tabletScreenshot) {
        const src = tabletScreenshot.startsWith("data:") ? tabletScreenshot : `data:image/png;base64,${tabletScreenshot}`;
        pushImage({ src, label: "Tablet shot" });
      }
      if (desktopScreenshot) {
        const src = desktopScreenshot.startsWith("data:") ? desktopScreenshot : `data:image/png;base64,${desktopScreenshot}`;
        pushImage({ src, label: "Desktop shot" });
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
          options: { scanCollections: includeCollections }
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
        scanCollections: includeCollections
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

  const missingAltIssues = useMemo<MissingAltImageIssue[]>(() => {
    const issuesMap = new Map<string, MissingAltImageIssue>()
    const imageUsageMap = new Map<string, { pageIds: Set<string>; totalOccurrences: number }>()

    links.forEach((link) => {
      const snapshot = link.auditResult?.contentSnapshot as
        | { images?: { src: string; alt?: string; inMainContent?: boolean }[] }
        | undefined
      const images = snapshot?.images || []
      const lastScan = link.auditResult?.lastRun
      const lastScanRelative = lastScan ? getRelativeTime(lastScan) : "Never"

      images.forEach((image: { src: string; alt?: string; inMainContent?: boolean }) => {
        const imageSrc = image?.src?.trim()
        const hasAltText = !!image?.alt?.trim()
        if (!imageSrc || hasAltText) return
        const imageFingerprint = getImageFingerprint(imageSrc)

        const key = `${link.id}:${imageSrc}`
        const existing = issuesMap.get(key)
        const usage = imageUsageMap.get(imageFingerprint) || { pageIds: new Set<string>(), totalOccurrences: 0 }

        usage.pageIds.add(link.id)
        usage.totalOccurrences += 1
        imageUsageMap.set(imageFingerprint, usage)

        if (existing) {
          existing.occurrences += 1
          existing.inMainContent = existing.inMainContent || !!image.inMainContent
          return
        }

        issuesMap.set(key, {
          key,
          pageId: link.id,
          pageTitle: link.title || "Untitled",
          pageUrl: link.url,
          imageSrc,
          imageFingerprint,
          inMainContent: !!image.inMainContent,
          occurrences: 1,
          repeatedAcrossPages: false,
          repeatedPageCount: 1,
          repeatedTotalOccurrences: 1,
          lastScan,
          lastScanRelative,
        })
      })
    })

    return Array.from(issuesMap.values())
      .map((issue) => {
        const usage = imageUsageMap.get(issue.imageFingerprint)
        const repeatedPageCount = usage?.pageIds.size || 1
        const repeatedTotalOccurrences = usage?.totalOccurrences || issue.occurrences
        return {
          ...issue,
          repeatedAcrossPages: repeatedPageCount > 1,
          repeatedPageCount,
          repeatedTotalOccurrences,
        }
      })
      .sort((a, b) => compareMissingAltIssues(a, b, "impact"))
  }, [links])

  const pagesWithMissingAltCount = useMemo(
    () => new Set(missingAltIssues.map((issue) => issue.pageId)).size,
    [missingAltIssues]
  )

  const repeatedMissingAltImagesCount = useMemo(
    () => new Set(
      missingAltIssues
        .filter((issue) => issue.repeatedAcrossPages)
        .map((issue) => issue.imageFingerprint)
    ).size,
    [missingAltIssues]
  )

  const uniqueMissingAltImagesCount = useMemo(
    () => new Set(missingAltIssues.map((issue) => issue.imageFingerprint)).size,
    [missingAltIssues]
  )

  const repeatedMissingAltPagesCount = useMemo(
    () => new Set(
      missingAltIssues
        .filter((issue) => issue.repeatedAcrossPages)
        .map((issue) => issue.pageId)
    ).size,
    [missingAltIssues]
  )

  const repeatedMissingAltPagesByImage = useMemo(() => {
    const pageMap = new Map<string, { pageId: string; pageTitle: string; pageUrl: string }[]>()

    missingAltIssues.forEach((issue) => {
      const existingPages = pageMap.get(issue.imageFingerprint) || []
      if (!existingPages.some((page) => page.pageId === issue.pageId)) {
        existingPages.push({
          pageId: issue.pageId,
          pageTitle: issue.pageTitle,
          pageUrl: issue.pageUrl,
        })
        pageMap.set(issue.imageFingerprint, existingPages)
      }
    })

    return pageMap
  }, [missingAltIssues])

  const filteredMissingAltIssues = useMemo<MissingAltImageIssue[]>(() => {
    const query = missingAltSearch.trim().toLowerCase()

    return missingAltIssues
      .filter((issue) => {
        if (missingAltAreaFilter === "main" && !issue.inMainContent) return false
        if (missingAltAreaFilter === "other" && issue.inMainContent) return false
        if (missingAltRepeatFilter === "repeated" && !issue.repeatedAcrossPages) return false
        if (missingAltRepeatFilter === "single" && issue.repeatedAcrossPages) return false

        if (!query) return true

        return (
          issue.pageTitle.toLowerCase().includes(query) ||
          issue.pageUrl.toLowerCase().includes(query) ||
          issue.imageSrc.toLowerCase().includes(query)
        )
      })
      .sort((a, b) => compareMissingAltIssues(a, b, missingAltSortMode))
  }, [missingAltIssues, missingAltAreaFilter, missingAltRepeatFilter, missingAltSearch, missingAltSortMode])

  const missingAltPageGroups = useMemo<MissingAltPageGroup[]>(() => {
    const pageMap = new Map<string, MissingAltPageGroup>()

    filteredMissingAltIssues.forEach((issue) => {
      const existing = pageMap.get(issue.pageId)
      if (!existing) {
        pageMap.set(issue.pageId, {
          pageId: issue.pageId,
          pageTitle: issue.pageTitle,
          pageUrl: issue.pageUrl,
          lastScan: issue.lastScan,
          lastScanRelative: issue.lastScanRelative,
          issues: [issue],
          uniqueImageCount: 1,
          totalOccurrences: issue.occurrences,
          repeatedImageCount: issue.repeatedAcrossPages ? 1 : 0,
          mainContentImageCount: issue.inMainContent ? 1 : 0,
        })
        return
      }

      existing.issues.push(issue)
      existing.uniqueImageCount += 1
      existing.totalOccurrences += issue.occurrences
      if (issue.repeatedAcrossPages) existing.repeatedImageCount += 1
      if (issue.inMainContent) existing.mainContentImageCount += 1

      if (toTimestamp(issue.lastScan) > toTimestamp(existing.lastScan)) {
        existing.lastScan = issue.lastScan
        existing.lastScanRelative = issue.lastScanRelative
      }
    })

    return Array.from(pageMap.values())
      .map((group) => ({
        ...group,
        issues: [...group.issues].sort((a, b) => compareMissingAltIssues(a, b, missingAltSortMode)),
      }))
      .sort((a, b) => {
        if (missingAltSortMode === "recent") {
          return toTimestamp(b.lastScan) - toTimestamp(a.lastScan)
        }

        if (missingAltSortMode === "alphabetical") {
          return a.pageTitle.localeCompare(b.pageTitle)
        }

        if (a.repeatedImageCount !== b.repeatedImageCount) return b.repeatedImageCount - a.repeatedImageCount
        if (a.mainContentImageCount !== b.mainContentImageCount) return b.mainContentImageCount - a.mainContentImageCount
        if (a.totalOccurrences !== b.totalOccurrences) return b.totalOccurrences - a.totalOccurrences
        return toTimestamp(b.lastScan) - toTimestamp(a.lastScan)
      })
  }, [filteredMissingAltIssues, missingAltSortMode])

  const missingAltUniqueImageGroups = useMemo<MissingAltUniqueImageGroup[]>(() => {
    const imageMap = new Map<string, MissingAltUniqueImageGroup>()

    filteredMissingAltIssues.forEach((issue) => {
      const existing = imageMap.get(issue.imageFingerprint)
      if (!existing) {
        imageMap.set(issue.imageFingerprint, {
          imageFingerprint: issue.imageFingerprint,
          imageSrc: issue.imageSrc,
          inMainContent: issue.inMainContent,
          totalOccurrences: issue.occurrences,
          pageCount: 1,
          lastScan: issue.lastScan,
          lastScanRelative: issue.lastScanRelative,
          pages: [
            {
              pageId: issue.pageId,
              pageTitle: issue.pageTitle,
              pageUrl: issue.pageUrl,
              occurrences: issue.occurrences,
            },
          ],
        })
        return
      }

      existing.totalOccurrences += issue.occurrences
      existing.inMainContent = existing.inMainContent || issue.inMainContent

      if (toTimestamp(issue.lastScan) > toTimestamp(existing.lastScan)) {
        existing.lastScan = issue.lastScan
        existing.lastScanRelative = issue.lastScanRelative
      }

      const existingPage = existing.pages.find((page) => page.pageId === issue.pageId)
      if (existingPage) {
        existingPage.occurrences += issue.occurrences
      } else {
        existing.pages.push({
          pageId: issue.pageId,
          pageTitle: issue.pageTitle,
          pageUrl: issue.pageUrl,
          occurrences: issue.occurrences,
        })
      }
      existing.pageCount = existing.pages.length
    })

    return Array.from(imageMap.values())
      .map((group) => ({
        ...group,
        pages: [...group.pages].sort((a, b) => {
          if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences
          return a.pageTitle.localeCompare(b.pageTitle)
        }),
      }))
      .sort((a, b) => {
        if (missingAltSortMode === "recent") {
          return toTimestamp(b.lastScan) - toTimestamp(a.lastScan)
        }
        if (missingAltSortMode === "alphabetical") {
          return a.imageSrc.localeCompare(b.imageSrc)
        }
        if (a.pageCount !== b.pageCount) return b.pageCount - a.pageCount
        if (a.totalOccurrences !== b.totalOccurrences) return b.totalOccurrences - a.totalOccurrences
        if (a.inMainContent !== b.inMainContent) return a.inMainContent ? -1 : 1
        return toTimestamp(b.lastScan) - toTimestamp(a.lastScan)
      })
  }, [filteredMissingAltIssues, missingAltSortMode])

  const areAllMissingAltPagesCollapsed = useMemo(
    () =>
      missingAltPageGroups.length > 0 &&
      missingAltPageGroups.every((group) => collapsedMissingAltPages.has(group.pageId)),
    [missingAltPageGroups, collapsedMissingAltPages]
  )

  const toggleMissingAltPageCollapse = useCallback((pageId: string) => {
    setCollapsedMissingAltPages((prev) => {
      const next = new Set(prev)
      if (next.has(pageId)) next.delete(pageId)
      else next.add(pageId)
      return next
    })
  }, [])

  const collapseAllMissingAltPages = useCallback(() => {
    setCollapsedMissingAltPages(new Set(missingAltPageGroups.map((group) => group.pageId)))
  }, [missingAltPageGroups])

  const expandAllMissingAltPages = useCallback(() => {
    setCollapsedMissingAltPages(new Set())
  }, [])

  const markMissingAltPreviewError = useCallback((issueKey: string) => {
    setMissingAltPreviewErrors((prev) => {
      if (prev.has(issueKey)) return prev
      const next = new Set(prev)
      next.add(issueKey)
      return next
    })
  }, [])

  const brokenLinkIssues = useMemo<BrokenLinkIssueRow[]>(() => {
    const issues: BrokenLinkIssueRow[] = []

    links.forEach((link) => {
      const linkCategory = link.auditResult?.categories?.links
      const checkedAt = linkCategory?.checkedAt
      const checkedRelative = checkedAt ? getRelativeTime(checkedAt) : "Not checked"
      const brokenLinks = linkCategory?.brokenLinks || []

      brokenLinks.forEach((broken, index) => {
        if (!broken?.href) return
        issues.push({
          key: `${link.id}:${broken.href}:${index}`,
          pageId: link.id,
          pageTitle: link.title || "Untitled",
          pageUrl: link.url,
          href: broken.href,
          status: broken.status,
          text: broken.text || "",
          error: broken.error,
          checkedAt,
          checkedRelative,
        })
      })
    })

    return issues.sort((a, b) => {
      if (a.status !== b.status) return b.status - a.status
      return toTimestamp(b.checkedAt) - toTimestamp(a.checkedAt)
    })
  }, [links])

  const pagesWithBrokenLinksCount = useMemo(
    () => new Set(brokenLinkIssues.map((issue) => issue.pageId)).size,
    [brokenLinkIssues]
  )

  const handleCheckBrokenLinksAcrossSite = useCallback(async () => {
    if (isReadOnly) return
    if (isCheckingAllBrokenLinks) return

    const pagesToCheck = links.filter(link => !!link.auditResult && !!link.url)
    if (pagesToCheck.length === 0) return

    setIsCheckingAllBrokenLinks(true)
    setBrokenLinkCheckProgress({
      current: 0,
      total: pagesToCheck.length,
      currentUrl: "",
    })

    try {
      for (let i = 0; i < pagesToCheck.length; i += 1) {
        const page = pagesToCheck[i]

        setBrokenLinkCheckProgress({
          current: i + 1,
          total: pagesToCheck.length,
          currentUrl: page.url,
        })

        try {
          const response = await fetch('/api/check-links', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              linkId: page.id,
              url: page.url
            })
          })

          if (!response.ok) {
            console.error(`[BrokenLinks] Failed check for ${page.url}`)
            continue
          }

          const result = await response.json()
          await projectsService.saveBrokenLinkResults(projectId, page.id, {
            totalChecked: result.totalChecked || 0,
            totalLinks: result.totalLinks || 0,
            brokenLinks: result.brokenLinks || [],
            validLinks: result.validLinks || 0,
          })
        } catch (error) {
          console.error(`[BrokenLinks] Error checking ${page.url}:`, error)
        }
      }
    } finally {
      setIsCheckingAllBrokenLinks(false)
      setBrokenLinkCheckProgress(prev => ({
        ...prev,
        current: prev.total,
        currentUrl: "",
      }))
    }
  }, [isReadOnly, isCheckingAllBrokenLinks, links, projectId])

  const hasMissingAltFilters =
    !!missingAltSearch.trim() ||
    missingAltAreaFilter !== "all" ||
    missingAltRepeatFilter !== "all" ||
    missingAltSortMode !== "impact"

  return (
    <div className="space-y-4 text-foreground">
      <div className="rounded-lg border bg-card px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Audit Inbox</h3>
          <p className="text-xs text-muted-foreground">
            Default view shows pages with issues first.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          Last scan: {latestScanAt ? getRelativeTime(latestScanAt) : "Never"}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="h-7 px-2.5 font-normal">Pages {metrics.total}</Badge>
        <Badge variant="secondary" className="h-7 px-2.5 font-normal">Issues {metrics.issueCount}</Badge>
        <Badge variant="secondary" className="h-7 px-2.5 font-normal">Blocked {metrics.blocked}</Badge>
        <Badge variant="secondary" className="h-7 px-2.5 font-normal">Changed {metrics.changed}</Badge>
        <Badge variant="secondary" className="h-7 px-2.5 font-normal">Tech {metrics.techOnly}</Badge>
        <Badge variant="secondary" className="h-7 px-2.5 font-normal">Avg score {metrics.avgScore}</Badge>
      </div>

      {criticalIssues.length > 0 ? (
        <Alert className="border-red-500/40 bg-red-500/5">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
          <AlertTitle className="text-red-700 dark:text-red-400">Deployment blockers detected</AlertTitle>
          <AlertDescription className="text-xs text-red-700 dark:text-red-400">
            {criticalIssues.length} blocked page{criticalIssues.length !== 1 ? "s" : ""}. Open a row to review details.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-green-500/30 bg-green-500/5">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertTitle className="text-green-700 dark:text-green-400">No deployment blockers detected</AlertTitle>
        </Alert>
      )}

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
            <CardContent className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCollectionDialog(false)}>
                Cancel
              </Button>
              <Button variant="secondary" onClick={() => handleBulkScan(false)}>
                Static only ({staticPages})
              </Button>
              <Button onClick={() => handleBulkScan(true)}>
                Scan all ({staticPages + collectionPages})
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs
        value={activeAuditTab}
        onValueChange={(value) => {
          if (value === "pages" || value === "missing-alt" || value === "broken-links") {
            setActiveAuditTab(value)
            if (value !== "pages") {
              setSelectedPage(null)
            }
          }
        }}
        className="space-y-4"
      >
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="pages" className="gap-2 flex-1 sm:flex-none">
            <span>Pages</span>
            <span className="text-xs text-muted-foreground">{filteredPages.length}</span>
          </TabsTrigger>
          <TabsTrigger value="missing-alt" className="gap-2 flex-1 sm:flex-none">
            <ImageIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Missing ALT</span>
            <span className="sm:hidden">ALT</span>
            <span className="text-xs text-muted-foreground">{uniqueMissingAltImagesCount}</span>
          </TabsTrigger>
          <TabsTrigger value="broken-links" className="gap-2 flex-1 sm:flex-none">
            <LinkIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Broken Links</span>
            <span className="sm:hidden">Links</span>
            <span className="text-xs text-muted-foreground">{brokenLinkIssues.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pages" className="mt-0">
          {/* Pages Table */}
          <Card>
        <CardHeader className="py-3 px-4">
          <TooltipProvider delayDuration={100}>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Left: Title + Primary Actions */}
              <div className="flex items-center gap-2 mr-auto">
                <CardTitle className="text-base">Pages</CardTitle>
                <Badge variant="secondary" className="text-xs font-normal">
                  {filteredPages.length}
                </Badge>
              </div>

              {/* Search */}
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search..."
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
          <div className="px-6 pb-4 space-y-2">
            <div className="flex justify-between text-sm items-center">
              <span className="font-medium">
                Scanning {bulkScanProgress.current} of {bulkScanProgress.total} pages
              </span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {bulkScanProgress.percentage}%
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelScan}
                  disabled={isCancelling}
                  className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                >
                  {isCancelling ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Square className="h-3 w-3 mr-1" />
                  )}
                  Stop
                </Button>
              </div>
            </div>
            <Progress
              value={bulkScanProgress.percentage}
              className="h-2 w-full"
            />
            {bulkScanProgress.currentUrl && (
              <div className="text-xs text-muted-foreground truncate" title={bulkScanProgress.currentUrl}>
                Current: {bulkScanProgress.currentUrl}
              </div>
            )}
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

        <TabsContent value="missing-alt" className="mt-0">
          <Card className="overflow-hidden">
            <CardHeader className="py-4 px-4 border-b bg-gradient-to-r from-muted/45 via-background to-muted/25">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <CardTitle className="text-base">Images Missing ALT Text</CardTitle>
                  <CardDescription>
                    {uniqueMissingAltImagesCount} unique image URL{uniqueMissingAltImagesCount === 1 ? "" : "s"} missing ALT text across the scanned site.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="h-7 px-2.5 font-normal">
                    Images Missing ALT {uniqueMissingAltImagesCount}
                  </Badge>
                  <Badge variant="secondary" className="h-7 px-2.5 font-normal">
                    Occurrences {missingAltIssues.length}
                  </Badge>
                  <Badge variant="secondary" className="h-7 px-2.5 font-normal">
                    Pages {pagesWithMissingAltCount}
                  </Badge>
                  <Badge variant="secondary" className="h-7 px-2.5 font-normal">
                    Repeated Assets {repeatedMissingAltImagesCount}
                  </Badge>
                  <Badge variant="secondary" className="h-7 px-2.5 font-normal">
                    Repeated Pages {repeatedMissingAltPagesCount}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div className="relative w-full lg:max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search page or image URL..."
                      value={missingAltSearch}
                      onChange={(e) => setMissingAltSearch(e.target.value)}
                      className="h-8 pl-8 text-sm"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center rounded-md border bg-background p-0.5">
                      <Button
                        type="button"
                        variant={missingAltViewMode === "page" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => setMissingAltViewMode("page")}
                      >
                        Page view
                      </Button>
                      <Button
                        type="button"
                        variant={missingAltViewMode === "unique" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => setMissingAltViewMode("unique")}
                      >
                        Unique images
                      </Button>
                    </div>

                    <Select
                      value={missingAltAreaFilter}
                      onValueChange={(value) => setMissingAltAreaFilter(value as MissingAltAreaFilter)}
                    >
                      <SelectTrigger className="h-8 min-w-[130px] text-xs">
                        Area: {missingAltAreaFilter === "all" ? "All" : missingAltAreaFilter === "main" ? "Main" : "Other"}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All areas</SelectItem>
                        <SelectItem value="main">Main content</SelectItem>
                        <SelectItem value="other">Other areas</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={missingAltRepeatFilter}
                      onValueChange={(value) => setMissingAltRepeatFilter(value as MissingAltRepeatFilter)}
                    >
                      <SelectTrigger className="h-8 min-w-[160px] text-xs">
                        Repeat: {missingAltRepeatFilter === "all" ? "All" : missingAltRepeatFilter === "repeated" ? "Repeated only" : "Unique only"}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All images</SelectItem>
                        <SelectItem value="repeated">Repeated across pages</SelectItem>
                        <SelectItem value="single">Unique to one page</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={missingAltSortMode}
                      onValueChange={(value) => setMissingAltSortMode(value as MissingAltSortMode)}
                    >
                      <SelectTrigger className="h-8 min-w-[130px] text-xs">
                        Sort: {missingAltSortMode === "impact" ? "Impact" : missingAltSortMode === "recent" ? "Recent" : "A-Z"}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="impact">Impact</SelectItem>
                        <SelectItem value="recent">Most recent</SelectItem>
                        <SelectItem value="alphabetical">Alphabetical</SelectItem>
                      </SelectContent>
                    </Select>

                    {missingAltViewMode === "page" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={areAllMissingAltPagesCollapsed ? expandAllMissingAltPages : collapseAllMissingAltPages}
                        disabled={missingAltPageGroups.length === 0}
                      >
                        {areAllMissingAltPagesCollapsed ? (
                          <>
                            <ChevronsUpDown className="h-3.5 w-3.5 mr-1.5" />
                            Expand all
                          </>
                        ) : (
                          <>
                            <ChevronsDownUp className="h-3.5 w-3.5 mr-1.5" />
                            Collapse all
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {hasMissingAltFilters && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Filters:</span>
                    {!!missingAltSearch.trim() && (
                      <Badge variant="secondary" className="text-xs gap-1 pl-2 pr-1 py-0.5">
                        Search: &quot;{missingAltSearch.trim().length > 20 ? `${missingAltSearch.trim().slice(0, 20)}...` : missingAltSearch.trim()}&quot;
                        <button
                          onClick={() => setMissingAltSearch("")}
                          className="ml-0.5 hover:bg-muted rounded-sm"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )}
                    {missingAltAreaFilter !== "all" && (
                      <Badge variant="secondary" className="text-xs gap-1 pl-2 pr-1 py-0.5">
                        Area: {missingAltAreaFilter === "main" ? "Main" : "Other"}
                        <button
                          onClick={() => setMissingAltAreaFilter("all")}
                          className="ml-0.5 hover:bg-muted rounded-sm"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )}
                    {missingAltRepeatFilter !== "all" && (
                      <Badge variant="secondary" className="text-xs gap-1 pl-2 pr-1 py-0.5">
                        Repeat: {missingAltRepeatFilter === "repeated" ? "Repeated" : "Unique"}
                        <button
                          onClick={() => setMissingAltRepeatFilter("all")}
                          className="ml-0.5 hover:bg-muted rounded-sm"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )}
                    {missingAltSortMode !== "impact" && (
                      <Badge variant="secondary" className="text-xs gap-1 pl-2 pr-1 py-0.5">
                        Sort: {missingAltSortMode === "recent" ? "Recent" : "A-Z"}
                        <button
                          onClick={() => setMissingAltSortMode("impact")}
                          className="ml-0.5 hover:bg-muted rounded-sm"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )}
                    <button
                      onClick={() => {
                        setMissingAltSearch("")
                        setMissingAltAreaFilter("all")
                        setMissingAltRepeatFilter("all")
                        setMissingAltSortMode("impact")
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>

              {missingAltIssues.length === 0 ? (
                <div className="rounded-md border p-8 text-center text-muted-foreground">
                  No missing ALT text found in the current scans.
                </div>
              ) : filteredMissingAltIssues.length === 0 ? (
                <div className="rounded-md border p-8 text-center text-muted-foreground">
                  No results for the active filters.
                </div>
              ) : missingAltViewMode === "page" ? (
                <div className="space-y-3">
                  {missingAltPageGroups.map((group) => {
                    const isCollapsed = collapsedMissingAltPages.has(group.pageId)
                    return (
                      <div key={group.pageId} className="rounded-lg border bg-card overflow-hidden">
                        <button
                          type="button"
                          className="w-full px-4 py-3 text-left hover:bg-muted/25 transition-colors"
                          onClick={() => toggleMissingAltPageCollapse(group.pageId)}
                        >
                          <div className="flex items-start gap-3">
                            {isCollapsed ? (
                              <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="font-semibold truncate" title={group.pageTitle}>
                                {group.pageTitle}
                              </div>
                              <div className="text-xs text-muted-foreground font-mono truncate" title={group.pageUrl}>
                                {getCompactUrl(group.pageUrl)}
                              </div>
                            </div>

                            <div className="hidden md:flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                              <Badge variant="destructive" className="text-xs">
                                Missing {group.uniqueImageCount}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                Occurrences {group.totalOccurrences}
                              </Badge>
                              {group.repeatedImageCount > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  Repeated {group.repeatedImageCount}
                                </Badge>
                              )}
                              <Badge variant={group.mainContentImageCount > 0 ? "destructive" : "outline"} className="text-xs">
                                Main {group.mainContentImageCount}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {group.lastScanRelative}
                              </Badge>
                            </div>
                          </div>
                        </button>

                        {!isCollapsed && (
                          <div className="border-t overflow-x-auto">
                            <Table className="table-fixed">
                              <TableHeader>
                                <TableRow className="hover:bg-transparent bg-muted/15">
                                  <TableHead className="h-9 text-[11px] uppercase tracking-wide text-muted-foreground w-[56%]">Image URL</TableHead>
                                  <TableHead className="h-9 text-[11px] uppercase tracking-wide text-muted-foreground w-[10%] text-center">Count</TableHead>
                                  <TableHead className="h-9 text-[11px] uppercase tracking-wide text-muted-foreground w-[12%]">Area</TableHead>
                                  <TableHead className="h-9 text-[11px] uppercase tracking-wide text-muted-foreground w-[14%]">Repeat Signal</TableHead>
                                  <TableHead className="h-9 text-[11px] uppercase tracking-wide text-muted-foreground w-[8%]">Last Scan</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {group.issues.map((issue) => {
                                  const repeatedPages = repeatedMissingAltPagesByImage.get(issue.imageFingerprint) || []
                                  const repeatedPageNames = repeatedPages
                                    .filter((page) => page.pageId !== issue.pageId)
                                    .map((page) => page.pageTitle)
                                  return (
                                    <TableRow key={issue.key} className="hover:bg-muted/25">
                                      <TableCell className="max-w-[620px]">
                                        <div className="flex items-start gap-3">
                                          <a
                                            href={issue.imageSrc}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="shrink-0 h-14 w-14 rounded-md border bg-muted/20 overflow-hidden flex items-center justify-center"
                                            title="Open image in new tab"
                                          >
                                            {missingAltPreviewErrors.has(issue.key) ? (
                                              <span className="text-[9px] text-muted-foreground px-1 text-center leading-tight">
                                                No preview
                                              </span>
                                            ) : (
                                              <img
                                                src={issue.imageSrc}
                                                alt=""
                                                loading="lazy"
                                                className="h-full w-full object-cover"
                                                onError={() => markMissingAltPreviewError(issue.key)}
                                              />
                                            )}
                                          </a>

                                          <div className="min-w-0 flex-1">
                                            <a
                                              href={issue.imageSrc}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="text-sm text-primary hover:underline font-mono truncate block"
                                              title={issue.imageSrc}
                                            >
                                              {issue.imageSrc}
                                            </a>
                                            {issue.repeatedAcrossPages ? (
                                              <div className="mt-1.5 space-y-1">
                                                <Badge variant="secondary" className="text-[10px] font-medium">
                                                  {getRepeatedUsageLabel(issue)}
                                                </Badge>
                                                <div
                                                  className="text-[11px] text-muted-foreground truncate"
                                                  title={repeatedPageNames.join(", ")}
                                                >
                                                  Also on:{" "}
                                                  {repeatedPageNames.length > 0
                                                    ? `${repeatedPageNames.slice(0, 3).join(", ")}${repeatedPageNames.length > 3 ? ` +${repeatedPageNames.length - 3} more` : ""}`
                                                    : "Current page only"}
                                                </div>
                                              </div>
                                            ) : (
                                              <div className="mt-1 text-[11px] text-muted-foreground">
                                                Unique image in current scan scope.
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <Badge variant="outline" className="text-xs tabular-nums">
                                          {issue.occurrences}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        <Badge variant={issue.inMainContent ? "destructive" : "secondary"} className="text-xs">
                                          {issue.inMainContent ? "Main" : "Other"}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        {issue.repeatedAcrossPages ? (
                                          <Badge variant="secondary" className="text-xs">
                                            Shared asset
                                          </Badge>
                                        ) : (
                                          <span className="text-xs text-muted-foreground">Single page</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-xs text-muted-foreground" title={issue.lastScan || ""}>
                                        {issue.lastScanRelative}
                                      </TableCell>
                                    </TableRow>
                                  )
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-lg border bg-card overflow-x-auto">
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent bg-muted/15">
                        <TableHead className="h-9 text-[11px] uppercase tracking-wide text-muted-foreground w-[48%]">Unique Image</TableHead>
                        <TableHead className="h-9 text-[11px] uppercase tracking-wide text-muted-foreground w-[22%]">Appears On Pages</TableHead>
                        <TableHead className="h-9 text-[11px] uppercase tracking-wide text-muted-foreground w-[10%] text-center">Occurrences</TableHead>
                        <TableHead className="h-9 text-[11px] uppercase tracking-wide text-muted-foreground w-[10%]">Area</TableHead>
                        <TableHead className="h-9 text-[11px] uppercase tracking-wide text-muted-foreground w-[10%]">Last Scan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {missingAltUniqueImageGroups.map((group) => (
                        <TableRow key={group.imageFingerprint} className="hover:bg-muted/25">
                          <TableCell className="max-w-[560px]">
                            <div className="flex items-start gap-3">
                              <a
                                href={group.imageSrc}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0 h-14 w-14 rounded-md border bg-muted/20 overflow-hidden flex items-center justify-center"
                                title="Open image in new tab"
                              >
                                {missingAltPreviewErrors.has(group.imageFingerprint) ? (
                                  <span className="text-[9px] text-muted-foreground px-1 text-center leading-tight">
                                    No preview
                                  </span>
                                ) : (
                                  <img
                                    src={group.imageSrc}
                                    alt=""
                                    loading="lazy"
                                    className="h-full w-full object-cover"
                                    onError={() => markMissingAltPreviewError(group.imageFingerprint)}
                                  />
                                )}
                              </a>
                              <div className="min-w-0 flex-1">
                                <a
                                  href={group.imageSrc}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sm text-primary hover:underline font-mono truncate block"
                                  title={group.imageSrc}
                                >
                                  {group.imageSrc}
                                </a>
                                <Badge variant="secondary" className="mt-1.5 text-[10px] font-medium">
                                  Appears on {group.pageCount} page{group.pageCount === 1 ? "" : "s"}
                                </Badge>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[320px]">
                            <div className="flex flex-wrap gap-1.5">
                              {group.pages.slice(0, 4).map((page) => (
                                <a
                                  key={`${group.imageFingerprint}-${page.pageId}`}
                                  href={page.pageUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs px-2 py-1 rounded-md border hover:bg-muted/40 text-muted-foreground hover:text-foreground truncate max-w-[240px]"
                                  title={page.pageUrl}
                                >
                                  {page.pageTitle}
                                </a>
                              ))}
                              {group.pages.length > 4 && (
                                <span className="text-xs px-2 py-1 rounded-md border text-muted-foreground">
                                  +{group.pages.length - 4} more
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="text-xs tabular-nums">
                              {group.totalOccurrences}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={group.inMainContent ? "destructive" : "secondary"} className="text-xs">
                              {group.inMainContent ? "Main" : "Other"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground" title={group.lastScan || ""}>
                            {group.lastScanRelative}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="broken-links" className="mt-0">
          <Card>
            <CardHeader className="py-4 px-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">Broken Links Across Site</CardTitle>
                  <CardDescription>
                    Based on link-check results saved per scanned page.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="h-7 px-2.5 font-normal">
                    Broken {brokenLinkIssues.length}
                  </Badge>
                  <Badge variant="secondary" className="h-7 px-2.5 font-normal">
                    Pages {pagesWithBrokenLinksCount}
                  </Badge>
                  <Badge variant="secondary" className="h-7 px-2.5 font-normal">
                    Checked {linkCheckedPagesCount}/{scannedPagesCount}
                  </Badge>
                  {!isReadOnly && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={handleCheckBrokenLinksAcrossSite}
                      disabled={isCheckingAllBrokenLinks || scannedPagesCount === 0}
                    >
                      {isCheckingAllBrokenLinks ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-1.5" />
                          Check All Scanned
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isReadOnly && isCheckingAllBrokenLinks && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      Checking {brokenLinkCheckProgress.current} of {brokenLinkCheckProgress.total} pages
                    </span>
                    <span className="text-muted-foreground">
                      {brokenLinkCheckProgress.total > 0
                        ? Math.round((brokenLinkCheckProgress.current / brokenLinkCheckProgress.total) * 100)
                        : 0}
                      %
                    </span>
                  </div>
                  <Progress
                    value={
                      brokenLinkCheckProgress.total > 0
                        ? (brokenLinkCheckProgress.current / brokenLinkCheckProgress.total) * 100
                        : 0
                    }
                    className="h-2"
                  />
                  {brokenLinkCheckProgress.currentUrl && (
                    <div className="text-xs text-muted-foreground truncate" title={brokenLinkCheckProgress.currentUrl}>
                      Current: {brokenLinkCheckProgress.currentUrl}
                    </div>
                  )}
                </div>
              )}

              <div className="overflow-x-auto rounded-md border">
                {brokenLinkIssues.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    {isReadOnly
                      ? "No broken links found in this shared snapshot."
                      : "No broken links found yet. Run \"Check All Scanned\" to refresh site-wide link health."}
                  </div>
                ) : (
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
                        <TableHead className="h-10 text-[11px] uppercase tracking-wide text-muted-foreground w-[24%]">Page</TableHead>
                        <TableHead className="h-10 text-[11px] uppercase tracking-wide text-muted-foreground w-[34%]">Broken URL</TableHead>
                        <TableHead className="h-10 text-[11px] uppercase tracking-wide text-muted-foreground w-[10%]">Status</TableHead>
                        <TableHead className="h-10 text-[11px] uppercase tracking-wide text-muted-foreground w-[20%]">Anchor Text / Error</TableHead>
                        <TableHead className="h-10 text-[11px] uppercase tracking-wide text-muted-foreground w-[12%]">Checked</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {brokenLinkIssues.map((issue) => (
                        <TableRow key={issue.key} className="hover:bg-muted/35">
                          <TableCell className="font-medium max-w-[230px]">
                            <div className="font-semibold truncate" title={issue.pageTitle}>
                              {issue.pageTitle}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono truncate" title={issue.pageUrl}>
                              {getCompactUrl(issue.pageUrl)}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[360px]">
                            <a
                              href={issue.href}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-primary hover:underline font-mono truncate block"
                              title={issue.href}
                            >
                              {issue.href}
                            </a>
                          </TableCell>
                          <TableCell>
                            <Badge variant="destructive" className="text-xs tabular-nums">
                              {issue.status === 0 ? "Error" : issue.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[260px]">
                            {issue.text ? (
                              <div className="text-sm truncate" title={issue.text}>
                                {issue.text}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground">No anchor text</div>
                            )}
                            {issue.error && (
                              <div className="text-xs text-red-600 dark:text-red-400 truncate" title={issue.error}>
                                {issue.error}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground" title={issue.checkedAt || ""}>
                            {issue.checkedRelative}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </CardContent>
          </Card>
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

                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Main issues</p>
                  {getMainIssues(selectedPage).length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      No detailed issue list available for this scan.
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
                              alt={img.alt || "Page image"}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <div className="p-1.5 space-y-1">
                            <div className="flex gap-1 flex-wrap">
                              <Badge variant={img.alt ? "secondary" : "destructive"} className="text-[10px] px-1.5 py-0 h-4">
                                {img.alt ? "ALT" : "No ALT"}
                              </Badge>
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
