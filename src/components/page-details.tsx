"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  ChevronRight,
  Copy,
  Play,
  GitCompare,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Hash,
  TrendingUp,
  Info,
  ExternalLink,
  Zap,
  Eye,
  Shield,
  Search,
} from "lucide-react"
import { projectsService } from "@/services/database"
import { ProjectLink, AuditResult, FieldChange, ImageInfo, LinkInfo } from "@/types"
import { ChangeLogTimeline } from "@/components/change-log-timeline"

interface PageDetailsProps {
  projectId?: string;
  linkId?: string;
}

interface DiffItem {
  type: string;
  severity: string;
  title: string;
  before?: string;
  after?: string;
  content?: string;
  detectedBy: string;
}

interface StaticIssue {
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  fix: string[];
}

interface ScanRun {
  timestamp: string;
  duration: string;
  fullHashChanged: boolean;
  contentHashChanged: boolean;
  contentScore: number;
  blockers: number;
  status: string;
}

export function PageDetails({ projectId, linkId }: PageDetailsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [currentLink, setCurrentLink] = useState<ProjectLink | null>(null)
  const [scanning, setScanning] = useState(false)

  const [compareA, setCompareA] = useState("scan-1")
  const [compareB, setCompareB] = useState("scan-2")
  const [showContentOnly, setShowContentOnly] = useState(true)

  // Handle Re-scan button click - calls server-side page scanner
  const handleRescan = async () => {
    if (!projectId || !linkId || !currentLink?.url) return;

    setScanning(true);
    try {
      const response = await fetch('/api/scan-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          linkId,
          url: currentLink.url
        })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Scan failed:', error);
        alert(`Scan failed: ${error.error || 'Unknown error'}`);
      } else {
        const result = await response.json();
        console.log('Scan complete:', result);
        // The real-time subscription will update the UI automatically
      }
    } catch (error) {
      console.error('Scan request failed:', error);
      alert('Scan request failed. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    if (!projectId || !linkId) return;

    // Subscribe to project updates to get real-time audit results
    const unsubscribe = projectsService.subscribeToProject(projectId, (project) => {
      if (project) {
        const link = project.links.find(l => l.id === linkId);
        if (link) {
          setCurrentLink(link);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [projectId, linkId]);

  if (loading) return <div className="p-8 flex justify-center text-muted-foreground">Loading audit details...</div>;
  if (!currentLink) return <div className="p-8 flex justify-center text-muted-foreground">Page not found or not audited yet.</div>;

  const audit = currentLink.auditResult;

  // Map real data to display structure
  const pageData = {
    path: new URL(currentLink.url).pathname,
    fullUrl: currentLink.url,
    status: audit?.changeStatus === 'CONTENT_CHANGED' ? "Content changed" :
      audit?.changeStatus === 'TECH_CHANGE_ONLY' ? "Tech-only change" :
        audit?.changeStatus === 'SCAN_FAILED' ? "Scan failed" :
          !audit?.canDeploy ? "Blocked" : "No change",
    contentScore: audit?.score || 0,
    lastContentChange: audit?.lastRun ? new Date(audit.lastRun).toLocaleDateString() : "-",
    lastScan: audit?.lastRun ? new Date(audit.lastRun).toLocaleString() : "-",
    scanDuration: "1.2s", // Placeholder for now
    openIssues: {
      critical: !audit?.canDeploy ? 1 : 0,
      warnings: (audit?.categories?.completeness?.issues?.length || 0) + (audit?.categories?.spelling?.issues?.length || 0),
    },
  }

  const hashData = {
    fullHash: audit?.fullHash || "N/A",
    contentHash: audit?.contentHash || "N/A",
    fullHashChanged: audit?.changeStatus !== 'NO_CHANGE',
    contentHashChanged: audit?.changeStatus === 'CONTENT_CHANGED',
  }

  // Derived arrays
  const changeHistory = [
    { date: "Today", contentChanged: audit?.changeStatus === 'CONTENT_CHANGED', techOnly: audit?.changeStatus === 'TECH_CHANGE_ONLY' }
    // No history backend yet
  ];

  // Map changed fields to diff items - now with before/after values
  const differences: DiffItem[] = [];

  if (audit?.changeStatus === 'CONTENT_CHANGED') {
    // Use fieldChanges if available (new smart change detection)
    if (audit.fieldChanges && audit.fieldChanges.length > 0) {
      audit.fieldChanges.forEach((change: FieldChange) => {
        const fieldNames: Record<string, string> = {
          'title': 'Page Title',
          'h1': 'H1 Heading',
          'metaDescription': 'Meta Description',
          'wordCount': 'Word Count',
          'headings': 'Heading Structure',
          'heading': 'Heading',
          'images': 'Images',
          'links': 'Links',
          'bodyText': 'Body Text'
        };

        const formatValue = (val: FieldChange['oldValue'], field: string): string => {
          if (val === null || val === undefined) return '(empty)';
          if (typeof val === 'number') return String(val);
          if (typeof val === 'string') return val.length > 100 ? val.substring(0, 100) + '...' : val;
          if (Array.isArray(val)) {
            if (field === 'images') return `${(val as ImageInfo[]).length} image(s)`;
            if (field === 'links') return `${(val as LinkInfo[]).length} link(s)`;
            if (field === 'headings') return (val as string[]).slice(0, 3).join(' → ');
            return val.join(', ').substring(0, 100);
          }
          return String(val);
        };

        differences.push({
          type: change.changeType === 'added' ? 'added' : change.changeType === 'removed' ? 'removed' : 'text',
          severity: change.changeType === 'modified' ? 'warning' : 'info',
          title: `${fieldNames[change.field] || change.field} ${change.changeType}`,
          before: change.oldValue !== null ? formatValue(change.oldValue, change.field) : undefined,
          after: change.newValue !== null ? formatValue(change.newValue, change.field) : undefined,
          content: change.changeType === 'added'
            ? `Added: ${formatValue(change.newValue, change.field)}`
            : change.changeType === 'removed'
              ? `Removed: ${formatValue(change.oldValue, change.field)}`
              : undefined,
          detectedBy: 'Smart Change Detection'
        });
      });
    } else if (audit.diffSummary) {
      // Fallback to summary if no fieldChanges
      differences.push({
        type: 'info',
        severity: 'info',
        title: audit.diffSummary,
        content: 'Detected changes in latest scan',
        detectedBy: 'System'
      });
    } else if (audit.changedFields && audit.changedFields.length > 0) {
      // Legacy: show individual fields without before/after
      audit.changedFields.forEach(field => {
        differences.push({
          type: 'modified',
          severity: 'warning',
          title: `${field.charAt(0).toUpperCase() + field.slice(1)} Changed`,
          content: `${field} was modified since the last scan.`,
          detectedBy: 'Content Hash'
        });
      });
    } else {
      // Fallback if no specific fields listed but content changed
      differences.push({
        type: 'modified',
        severity: 'warning',
        title: 'Content Modified',
        content: 'The page content hash has changed, but specific fields were not identified.',
        detectedBy: 'Hash Comparison'
      });
    }
  } else if (audit?.changeStatus === 'TECH_CHANGE_ONLY') {
    differences.push({
      type: 'tech',
      severity: 'info',
      title: 'Source Code Update',
      content: 'Underlying HTML source changed (scripts, styles, or markup) without visible content text changes.',
      detectedBy: 'Full Hash'
    });
  }

  const placeholders = audit?.categories?.placeholders?.issues || []
  const spellingErrors = audit?.categories?.spelling?.issues.map(i => ({
    word: i.word,
    suggestion: i.suggestion || '',
    occurrences: 1,
    firstSeen: "Today"
  })) || []

  // Word count for completeness check (readability card removed)
  const wordCount = audit?.categories?.readability?.wordCount || 0

  const completenessChecks = [
    { check: "Word count > 300", passed: wordCount > 300, count: wordCount },
    ...(audit?.categories?.completeness?.issues?.map(issue => ({ check: issue.detail, passed: false, count: 1 })) || [])
  ];

  const performanceIssues: StaticIssue[] = []
  const accessibilityIssues: StaticIssue[] = []
  const seoIssues: StaticIssue[] = audit?.categories?.seo?.issues?.map(i => ({ severity: "warning" as const, title: i, description: "", fix: [] })) || []
  const securityIssues: StaticIssue[] = []

  const scanRunHistory: ScanRun[] = audit?.lastRun ? [{
    timestamp: new Date(audit.lastRun).toLocaleString(),
    duration: "1.2s",
    fullHashChanged: audit.changeStatus !== 'NO_CHANGE',
    contentHashChanged: audit.changeStatus === 'CONTENT_CHANGED',
    contentScore: audit.score || 0,
    blockers: !audit.canDeploy ? 1 : 0,
    status: audit.changeStatus || 'Success'
  }] : [];

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

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <XCircle className="h-4 w-4 text-red-500" />
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-orange-500" />
      default:
        return <Info className="h-4 w-4 text-blue-500" />
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Page Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          {/* Breadcrumb */}
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <a href="/" className="hover:text-foreground">
              Website Audit Dashboard
            </a>
            <ChevronRight className="h-4 w-4" />
            <a href="/" className="hover:text-foreground">
              Pages
            </a>
            <ChevronRight className="h-4 w-4" />
            <span className="text-foreground">{pageData.path}</span>
          </div>

          {/* Title and Status */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-foreground">{pageData.path}</h1>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{pageData.fullUrl}</span>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(pageData.fullUrl)}>
                  <Copy className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <a href={pageData.fullUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline" className={getStatusColor(pageData.status)}>
                {pageData.status}
              </Badge>
              <Button onClick={handleRescan} disabled={scanning}>
                <Play className={`mr-2 h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
                {scanning ? 'Scanning...' : 'Re-scan now'}
              </Button>
              <Button variant="secondary">
                <GitCompare className="mr-2 h-4 w-4" />
                Compare scans
              </Button>
              <Button variant="ghost">
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Section A: Overview Cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <div className="text-sm font-medium text-muted-foreground">Content score</div>
              <div className="mt-2 text-3xl font-bold">{pageData.contentScore}</div>
              <Progress value={pageData.contentScore} className="mt-3 h-2" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="text-sm font-medium text-muted-foreground">Last content change</div>
              <div className="mt-2 text-lg font-semibold">{pageData.lastContentChange}</div>
              <div className="mt-2 text-xs text-muted-foreground">contentHash changed</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="text-sm font-medium text-muted-foreground">Last scan</div>
              <div className="mt-2 text-lg font-semibold">{pageData.lastScan}</div>
              <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {pageData.scanDuration}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="text-sm font-medium text-muted-foreground">Open issues</div>
              <div className="mt-2 flex items-center gap-4">
                <div>
                  <div className="text-2xl font-bold text-red-600">{pageData.openIssues.critical}</div>
                  <div className="text-xs text-muted-foreground">Critical</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-orange-600">{pageData.openIssues.warnings}</div>
                  <div className="text-xs text-muted-foreground">Warnings</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section: Page Screenshot */}
        {audit?.screenshot && (
          <Card className="mb-8">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-5 w-5" />
                    Page Snapshot
                  </CardTitle>
                  <CardDescription>
                    Captured {audit.screenshotCapturedAt
                      ? new Date(audit.screenshotCapturedAt).toLocaleString()
                      : 'recently'} (after scroll to trigger animations)
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = `data:image/png;base64,${audit.screenshot}`;
                    link.download = `screenshot-${new Date().toISOString()}.png`;
                    link.click();
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border bg-muted/50">
                <img
                  src={`data:image/png;base64,${audit.screenshot}`}
                  alt="Page screenshot"
                  className="w-full h-auto"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Section B: Change Detection (Condensed) */}
        {(audit?.changeStatus === 'CONTENT_CHANGED' || audit?.changeStatus === 'TECH_CHANGE_ONLY') && (
          <Card className={`mb-8 border-opacity-20 bg-opacity-5 ${audit?.changeStatus === 'CONTENT_CHANGED'
            ? 'border-orange-500 bg-orange-500'
            : 'border-blue-500 bg-blue-500'
            }`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className={`h-5 w-5 ${audit?.changeStatus === 'CONTENT_CHANGED' ? 'text-orange-600' : 'text-blue-600'
                    }`} />
                  <CardTitle className={
                    audit?.changeStatus === 'CONTENT_CHANGED' ? 'text-orange-700' : 'text-blue-700'
                  }>
                    {audit?.changeStatus === 'CONTENT_CHANGED' ? 'Content Updates Detected' : 'Source Code Updated'}
                  </CardTitle>
                </div>
                <Badge variant="outline" className={`bg-background ${audit?.changeStatus === 'CONTENT_CHANGED' ? 'text-orange-700 border-orange-200' : 'text-blue-700 border-blue-200'
                  }`}>
                  {pageData.lastContentChange}
                </Badge>
              </div>
              <CardDescription className={
                audit?.changeStatus === 'CONTENT_CHANGED' ? 'text-orange-600/80' : 'text-blue-600/80'
              }>
                {audit.diffSummary || (audit?.changeStatus === 'CONTENT_CHANGED' ? "Changes detected in page content" : "Technical or hidden changes detected")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full bg-background/50 rounded-lg border px-4">
                {differences.length === 0 ? (
                  <div className="py-4 text-center text-muted-foreground text-sm">Review content changes below.</div>
                ) : (
                  differences.map((diff, idx) => (
                    <AccordionItem key={idx} value={`item-${idx}`} className="border-b-0">
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-3">
                          {getSeverityIcon(diff.severity)}
                          <span className="font-medium text-sm">{diff.title}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pb-3 pl-7">
                          {diff.type === "text" ? (
                            <div className="grid grid-cols-2 gap-4 text-xs">
                              <div className="p-2 bg-red-500/5 rounded border border-red-500/10">
                                <span className="font-semibold text-red-600 block mb-1">Before:</span>
                                <span className="whitespace-pre-line">{diff.before}</span>
                              </div>
                              <div className="p-2 bg-green-500/5 rounded border border-green-500/10">
                                <span className="font-semibold text-green-600 block mb-1">After:</span>
                                <span className="whitespace-pre-line">{diff.after}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">{diff.content}</div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))
                )}

                {/* Exact Source Diff Viewer */}
                {audit.diffPatch && (
                  <AccordionItem value="source-diff" className="border-b-0 border-t">
                    <AccordionTrigger className="hover:no-underline py-3">
                      <div className="flex items-center gap-3">
                        <GitCompare className="h-4 w-4 text-purple-500" />
                        <span className="font-medium text-sm">View Exact Source Changes</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="font-mono text-[10px] sm:text-xs overflow-x-auto p-3 bg-muted rounded border max-h-64 overflow-y-auto whitespace-pre">
                        {audit.diffPatch.split('\n').filter(l => !l.startsWith('---') && !l.startsWith('+++')).map((line, i) => {
                          let colorClass = "text-muted-foreground";
                          if (line.startsWith('+')) colorClass = "text-green-600 bg-green-500/10 block w-full";
                          if (line.startsWith('-')) colorClass = "text-red-600 bg-red-500/10 block w-full";
                          if (line.startsWith('@@')) colorClass = "text-purple-500 block w-full mt-2 mb-1 font-bold";
                          return (
                            <div key={i} className={colorClass}>
                              {line}
                            </div>
                          )
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}
              </Accordion>
            </CardContent>
          </Card>
        )}

        {/* Section D: Content Quality */}
        <div className="mb-8 space-y-6">
          <h2 className="text-2xl font-bold">Content quality</h2>

          {/* Critical Blocker Alert */}
          {placeholders.length > 0 && (
            <Alert className="border-red-500/50 bg-red-500/10">
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              <AlertTitle className="text-red-700 dark:text-red-400">
                Deployment blocked: Placeholder content detected
              </AlertTitle>
              <AlertDescription className="text-red-600 dark:text-red-400">
                <ul className="my-3 list-inside list-disc space-y-1">
                  {placeholders.map((placeholder, idx) => (
                    <li key={idx}>
                      {placeholder.type} ({placeholder.count})
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm">
                    <Eye className="mr-2 h-4 w-4" />
                    View in page
                  </Button>
                  <Button variant="outline" size="sm">
                    Create task
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Spelling */}
            <Card>
              <CardHeader>
                <CardTitle>Spelling</CardTitle>
                <CardDescription>Spelling error rate: {(spellingErrors.length * 0.1).toFixed(1)}%</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Word</TableHead>
                      <TableHead>Suggestion</TableHead>
                      <TableHead>Count</TableHead>
                      <TableHead>First seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {spellingErrors.map((error, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-sm text-red-600">{error.word}</TableCell>
                        <TableCell className="font-mono text-sm text-green-600">{error.suggestion}</TableCell>
                        <TableCell>{error.occurrences}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{error.firstSeen}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Word Count Card (simplified from Readability) */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Word Count</CardTitle>
                <CardDescription>Content length indicator</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="text-3xl font-bold">{wordCount}</div>
                  <div className="text-sm text-muted-foreground">
                    {wordCount >= 300 ? (
                      <span className="text-green-600">✓ Good length</span>
                    ) : (
                      <span className="text-orange-600">Consider adding more content</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* SEO (Promoted from Tabs) */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>SEO</CardTitle>
                <CardDescription>MetaData and ranking signals</CardDescription>
              </CardHeader>
              <CardContent>
                {seoIssues.length > 0 ? (
                  <ul className="space-y-2">
                    {seoIssues.map((issue, idx) => (
                      <li key={idx} className="flex gap-2 text-sm text-muted-foreground p-2 rounded bg-muted/50">
                        <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                        {issue.title}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 text-green-500/50 mb-2" />
                    <p>No SEO issues detected</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Completeness */}
          <Card>
            <CardHeader>
              <CardTitle>Completeness</CardTitle>
              <CardDescription>Content quality checklist</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {completenessChecks.map((check, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      {check.passed ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <span className="text-sm font-medium">{check.check}</span>
                    </div>
                    {!check.passed && check.count !== undefined && check.count > 0 && (
                      <Badge variant="destructive">{check.count}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Content Change History Timeline */}
        {projectId && linkId && (
          <div className="mb-8">
            <ChangeLogTimeline linkId={linkId} projectId={projectId} />
          </div>
        )}
      </div>
    </div>
  )
}
