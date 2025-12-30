"use client"

import { useState, useMemo } from "react"
import NextLink from "next/link"
import { ProjectLink, AuditResult } from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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
  Clock,
  MoreVertical,
  Search,
  Filter,
  Play,
  XCircle,
  FileX,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

interface WebsiteAuditDashboardProps {
  links: ProjectLink[];
  projectId: string;
}

export function WebsiteAuditDashboard({ links, projectId }: WebsiteAuditDashboardProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [showOnlyChanged, setShowOnlyChanged] = useState(false)
  const [sortBy, setSortBy] = useState("recent")
  const [showHistory, setShowHistory] = useState(false)

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
      else if (audit.changeStatus === 'SCAN_FAILED') displayStatus = "Scan failed";

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
        status: displayStatus,
        lastContentChange: audit?.lastRun ? new Date(audit.lastRun).toLocaleDateString() : "-",
        lastScan: audit?.lastRun ? new Date(audit.lastRun).toLocaleString() : "-",
        score: audit?.score || 0,
        findings,
        rawAudit: audit
      };
    });
  }, [links]);

  // 2. Filter & Sort
  const filteredPages = useMemo(() => {
    return pagesData.filter((page) => {
      if (searchQuery && !page.path.toLowerCase().includes(searchQuery.toLowerCase()) && !page.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
      if (statusFilter !== "all" && page.status !== statusFilter) return false
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
  }, [pagesData, searchQuery, statusFilter, showOnlyChanged, sortBy]);

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
      default:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20"
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

      {/* Pages Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <CardTitle>Pages</CardTitle>
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
                  {filteredPages.map((page) => (
                    <TableRow key={page.id}>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        <div className="font-semibold block truncate" title={page.title}>{page.title || 'Untitled'}</div>
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
                      <TableCell className="text-sm text-muted-foreground">{page.lastScan}</TableCell>
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
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
