"use client"

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react"
import NextLink from "next/link"
import { ProjectLink, AuditResult, PageTypeRule } from "@/types"
import { PageTypeRulesDialog } from "@/components/PageTypeRulesEditor"
import { PageTypeReviewDialog, detectPatterns } from "@/components/PageTypeReviewDialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import {
  FileText,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Loader2,
  Clock,
  MoreVertical,
  Search,
  Filter,
  Play,
  XCircle,
  FileX,
  ChevronDown,
  ChevronUp,
  Globe,
  Database,
  File,
  Settings2,
} from "lucide-react"

interface WebsiteAuditDashboardProps {
  links: ProjectLink[];
  projectId: string;
  pageTypeRules?: PageTypeRule[];
}

export function WebsiteAuditDashboard({ links, projectId, pageTypeRules = [] }: WebsiteAuditDashboardProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [localeFilter, setLocaleFilter] = useState("all")
  const [pageTypeFilter, setPageTypeFilter] = useState("all")
  const [showOnlyChanged, setShowOnlyChanged] = useState(false)
  const [sortBy, setSortBy] = useState("recent")
  const [showHistory, setShowHistory] = useState(false)
  const [localRules, setLocalRules] = useState<PageTypeRule[]>(pageTypeRules)

  // Load persisted rules (no backend API yet)
  useEffect(() => {
    try {
      if (typeof window === "undefined") return
      const raw = window.localStorage.getItem(`pageTypeRules:${projectId}`)
      if (!raw) return
      const parsed = JSON.parse(raw) as PageTypeRule[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        setLocalRules(parsed)
      }
    } catch {
      // ignore
    }
  }, [projectId])

  const persistRules = useCallback(
    (rules: PageTypeRule[]) => {
      setLocalRules(rules)
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(`pageTypeRules:${projectId}`, JSON.stringify(rules))
        }
      } catch {
        // ignore
      }
    },
    [projectId],
  )

  // Bulk scan state
  const [isBulkScanning, setIsBulkScanning] = useState(false)
  const [bulkScanProgress, setBulkScanProgress] = useState({ 
    current: 0, 
    total: 0, 
    percentage: 0,
    currentUrl: '',
    scanId: '' 
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
      
      setBulkScanProgress({
        current: data.current,
        total: data.total,
        percentage: data.percentage,
        currentUrl: data.currentUrl || '',
        scanId: data.scanId
      })

      // Check if scan is completed or failed
      if (data.status === 'completed' || data.status === 'failed') {
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
        } else {
          console.error('[BulkScan] Failed:', data.error)
        }
      }
    } catch (error) {
      console.error('[BulkScan] Polling error:', error)
    }
  }, [])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [])

  // Review page types dialog state
  const [showReviewDialog, setShowReviewDialog] = useState(false)
  const [showRulesDialog, setShowRulesDialog] = useState(false)
  const detectedPatternsFromLinks = useMemo(() => {
    const urls = links.map(l => l.url)
    return detectPatterns(urls)
  }, [links])

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

  // 1. Process Links into Page Data
  const pagesData = useMemo(() => {
    return links.map(link => {
      const audit = link.auditResult;

      // Determine display status based on both changeStatus and deployment status
      let displayStatus = "No change";
      if (!audit) displayStatus = "Pending";
      else if (audit.canDeploy === false) displayStatus = "Blocked";
      else if (audit.changeStatus === 'CONTENT_CHANGED') displayStatus = "Content changed";
      else if (audit.changeStatus === 'TECH_CHANGE_ONLY') displayStatus = "Tech-only change";
      if (audit?.changeStatus === 'SCAN_FAILED') displayStatus = "Scan failed";

      // Override status during bulk scan to provide immediate feedback
      // This solves the "Pending" confusion while the server is crushing through the list
      if (isBulkScanning) {
        displayStatus = "Scanning...";
      }

      // Findings aggregation
      const findings = [];
      if ((audit?.categories?.placeholders?.issues?.length || 0) > 0) findings.push("Placeholders");
      if ((audit?.categories?.spelling?.issues?.length || 0) > 0) findings.push("Spelling");
      if ((audit?.categories?.seo?.issues?.length || 0) > 0) findings.push("SEO");
      if ((audit?.categories?.technical?.issues?.length || 0) > 0) findings.push("Technical");
      if ((audit?.score || 0) < 50) findings.push("Low Score");

      return {
        id: link.id,
        path: link.url, // Display full URL for now, could parse path
        title: link.title,
        locale: link.locale, // Include locale for filtering
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
  }, [links]);

  // Compute available locales for the filter dropdown
  const availableLocales = useMemo(() => {
    const locales = new Set<string>();
    links.forEach(link => {
      if (link.locale) {
        locales.add(link.locale);
      }
    });
    // Sort locales alphabetically, but put 'en' first if present
    return Array.from(locales).sort((a, b) => {
      if (a === 'en') return -1;
      if (b === 'en') return 1;
      return a.localeCompare(b);
    });
  }, [links]);

  // 2. Filter & Sort
  const filteredPages = useMemo(() => {
    return pagesData.filter((page) => {
      if (searchQuery && !page.path.toLowerCase().includes(searchQuery.toLowerCase()) && !page.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
      if (statusFilter !== "all" && page.status !== statusFilter) return false
      if (localeFilter !== "all") {
        if (localeFilter === "none" && page.locale) return false;
        if (localeFilter !== "none" && page.locale !== localeFilter) return false;
      }
      if (pageTypeFilter !== "all") {
        if (pageTypeFilter === "static" && page.pageType === "collection") return false;
        if (pageTypeFilter === "collection" && page.pageType !== "collection") return false;
      }
      if (showOnlyChanged && page.status === "No change") return false
      return true
    }).sort((a, b) => {
      if (sortBy === 'score') return a.score - b.score;
      if (sortBy === 'critical') {
        const aCrit = a.status === 'Blocked' ? 1 : 0;
        const bCrit = b.status === 'Blocked' ? 1 : 0;
        return bCrit - aCrit;
      }
      // Recent (default)
      return new Date(b.lastScan).getTime() - new Date(a.lastScan).getTime();
    });
  }, [pagesData, searchQuery, statusFilter, localeFilter, pageTypeFilter, showOnlyChanged, sortBy]);

  // Group filtered pages by type (CMS first, then Static)
  const groupedPages = useMemo(() => {
    const cmsPages = filteredPages.filter(p => p.pageType === 'collection');
    const staticPages = filteredPages.filter(p => p.pageType !== 'collection');
    
    return [
      { type: 'collection', label: 'CMS Pages', icon: Database, pages: cmsPages },
      { type: 'static', label: 'Static Pages', icon: File, pages: staticPages }
    ].filter(group => group.pages.length > 0);
  }, [filteredPages]);

  // 3. Compute KPI Metrics
  const metrics = useMemo(() => {
    const total = pagesData.length;
    const changed = pagesData.filter(p => p.status === 'Content changed').length;
    const techOnly = pagesData.filter(p => p.status === 'Tech-only change').length;
    const blocked = pagesData.filter(p => p.status === 'Blocked').length;
    const failed = pagesData.filter(p => p.status === 'Scan failed').length;
    const ready = pagesData.filter(p => p.score >= 90 && p.status !== 'Blocked').length;
    const avgScore = total > 0 ? Math.round(pagesData.reduce((acc, p) => acc + p.score, 0) / total) : 0;

    return { total, changed, techOnly, blocked, failed, ready, avgScore };
  }, [pagesData]);

  const kpiData = [
    { id: 1, label: "Total Pages", value: metrics.total, delta: null, deltaType: "neutral", icon: FileText },
    { id: 2, label: "Pages Changed", value: metrics.changed, delta: null, deltaType: "neutral", icon: TrendingUp },
    { id: 3, label: "Tech-Only Changes", value: metrics.techOnly, delta: null, deltaType: "neutral", icon: Activity },
    { id: 5, label: "Deployment Blocked", value: metrics.blocked, delta: null, deltaType: "neutral", icon: XCircle },
    { id: 6, label: "Avg Content Score", value: metrics.avgScore, delta: null, deltaType: "neutral", icon: CheckCircle2 },
  ];

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
      default:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20"
    }
  }

  // Count pages by type
  const staticPages = links.filter(l => l.pageType !== 'collection').length
  const collectionPages = links.filter(l => l.pageType === 'collection').length

  // Bulk scan all pages
  const handleBulkScan = async (includeCollections: boolean = false) => {
    const estimatedTotal = staticPages + (includeCollections ? collectionPages : 0)
    
    setIsBulkScanning(true)
    setBulkScanProgress({ 
      current: 0, 
      total: estimatedTotal,
      percentage: 0,
      currentUrl: 'Starting scan...',
      scanId: ''
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
          setBulkScanProgress(prev => ({ ...prev, scanId: result.scanId }))
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
        total: totalPages
      }))

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* KPIs */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {kpiData.map((kpi) => {
          const Icon = kpi.icon
          return (
            <Card key={kpi.id}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold">{kpi.value}</div>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Alerts */}
      {criticalIssues.length > 0 ? (
        <Alert className="mb-8 border-red-500/50 bg-red-500/10">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          <AlertTitle className="text-red-700 dark:text-red-400">Deployment blockers detected</AlertTitle>
          <AlertDescription className="text-red-600 dark:text-red-400">
            <ul className="mb-4 mt-2 list-inside list-disc space-y-1">
              {criticalIssues.slice(0, 5).map((page) => (
                <li key={page.id}>
                  {page.findings.includes("Placeholders") && "Placeholders found on "}
                  <span className="font-mono">{page.title || page.path}</span>
                </li>
              ))}
              {criticalIssues.length > 5 && <li>...and {criticalIssues.length - 5} more</li>}
            </ul>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="mb-8 border-green-500/50 bg-green-500/10">
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          <AlertTitle className="text-green-700 dark:text-green-400">
            No deployment blockers detected today
          </AlertTitle>
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

      {/* Pages Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <CardTitle>Pages</CardTitle>
              <Button
                size="sm"
                onClick={handleScanAllClick}
                disabled={isBulkScanning || links.length === 0}
              >
                {isBulkScanning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Scan All Pages
                  </>
                )}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Settings2 className="h-4 w-4" />
                    Page Types
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowRulesDialog(true)}>
                    <Settings2 className="mr-2 h-4 w-4" />
                    Manage Rules
                    {localRules.length > 0 && <span className="ml-2 text-muted-foreground">({localRules.length})</span>}
                  </DropdownMenuItem>
                  {links.length > 0 && (
                    <DropdownMenuItem onClick={() => setShowReviewDialog(true)}>
                      <Database className="mr-2 h-4 w-4" />
                      Review Detected Patterns
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by URL or Title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="No change">No change</SelectItem>
                  <SelectItem value="Content changed">Content changed</SelectItem>
                  <SelectItem value="Tech-only change">Tech-only</SelectItem>
                  <SelectItem value="Blocked">Blocked</SelectItem>
                  <SelectItem value="Scan failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              {availableLocales.length > 0 && (
                <Select value={localeFilter} onValueChange={setLocaleFilter}>
                  <SelectTrigger className="w-36">
                    <Globe className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Locale" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locales</SelectItem>
                    <SelectItem value="none">No locale</SelectItem>
                    {availableLocales.map(locale => (
                      <SelectItem key={locale} value={locale}>
                        {locale.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={pageTypeFilter} onValueChange={setPageTypeFilter}>
                <SelectTrigger className="w-32">
                  <Database className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="static">Static</SelectItem>
                  <SelectItem value="collection">CMS</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Most recently scanned</SelectItem>
                  <SelectItem value="score">Lowest score</SelectItem>
                  <SelectItem value="critical">Critical issues first</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant={showOnlyChanged ? "default" : "outline"}
                size="sm"
                onClick={() => setShowOnlyChanged(!showOnlyChanged)}
              >
                Show only changed
              </Button>
            </div>
          </div>
        </CardHeader>
        {isBulkScanning && (
          <div className="px-6 pb-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">
                Scanning {bulkScanProgress.current} of {bulkScanProgress.total} pages
              </span>
              <span className="text-muted-foreground">
                {bulkScanProgress.percentage}%
              </span>
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
          <div className="overflow-x-auto">
            {filteredPages.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No pages match your filter.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Page Title / URL</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Scan</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Findings</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedPages.map((group) => {
                    const GroupIcon = group.icon;
                    return (
                      <React.Fragment key={`group-${group.type}`}>
                        {/* Group Header */}
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableCell colSpan={6} className="py-2">
                            <div className="flex items-center gap-2 font-medium">
                              <GroupIcon className="h-4 w-4" />
                              <span>{group.label}</span>
                              <Badge variant="secondary" className="text-xs">
                                {group.pages.length}
                              </Badge>
                            </div>
                          </TableCell>
                        </TableRow>
                        {/* Group Pages */}
                        {group.pages.map((page) => (
                          <TableRow key={page.id}>
                            <TableCell className="font-medium max-w-[300px]">
                              <div className="flex items-center gap-2">
                                <div className="font-semibold block truncate flex-1" title={page.title}>{page.title || 'Untitled'}</div>
                                {page.locale && (
                                  <Badge variant="secondary" className="text-xs shrink-0 bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20">
                                    {page.locale.toUpperCase()}
                                  </Badge>
                                )}
                              </div>
                              <NextLink
                                href={`/modules/project-links/${projectId}/audit/${page.id}`}
                                className="hover:underline text-xs text-blue-600 dark:text-blue-400 block truncate"
                                title={page.path}
                              >
                                {page.path}
                              </NextLink>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={getStatusColor(page.status)}>
                                {page.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground" title={page.lastScan}>
                              {page.lastScanRelative}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={page.score} className="h-2 w-16" />
                                <span className="text-sm font-medium">{page.score}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {page.findings.length === 0 && <span className="text-xs text-muted-foreground">-</span>}
                                {page.findings.map((finding, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">
                                    {finding}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" asChild>
                                  <NextLink href={`/modules/project-links/${projectId}/audit/${page.id}`}>View details</NextLink>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Page Type Rules Dialog */}
      <PageTypeRulesDialog
        projectId={projectId}
        rules={localRules}
        onRulesChange={persistRules}
        open={showRulesDialog}
        onOpenChange={setShowRulesDialog}
      />

      {/* Review Page Types Dialog for existing pages */}
      <PageTypeReviewDialog
        isOpen={showReviewDialog}
        onClose={() => setShowReviewDialog(false)}
        projectId={projectId}
        detectedPatterns={detectedPatternsFromLinks}
        existingRules={localRules}
        onSaveRules={(rules) => {
          persistRules(rules)
          setShowReviewDialog(false)
          // Reload to apply new rules
          window.location.reload()
        }}
      />
    </div>
  )
}
