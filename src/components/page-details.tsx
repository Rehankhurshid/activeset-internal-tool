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
import { ProjectLink, AuditResult } from "@/types"

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

  const [compareA, setCompareA] = useState("scan-1")
  const [compareB, setCompareB] = useState("scan-2")
  const [showContentOnly, setShowContentOnly] = useState(true)

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

  const differences: DiffItem[] = []; // No diff backend yet

  const placeholders = audit?.categories?.placeholders?.issues || []
  const spellingErrors = audit?.categories?.spelling?.issues.map(i => ({
    word: i.word,
    suggestion: i.suggestion || '',
    occurrences: 1,
    firstSeen: "Today"
  })) || []

  const readabilityData = {
    fleschScore: audit?.categories?.readability?.fleschScore || 0,
    gradeLevel: audit?.categories?.readability?.label || "-",
    wordCount: audit?.categories?.readability?.wordCount || 0,
    sentenceCount: audit?.categories?.readability?.sentenceCount || 0,
    difficulty: audit?.categories?.readability?.label || "Unknown",
  }

  const completenessChecks = [
    { check: "Word count > 300", passed: (audit?.categories?.readability?.wordCount || 0) > 300, count: 0 },
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
              <Button>
                <Play className="mr-2 h-4 w-4" />
                Re-scan now
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

        {/* Section B: Change Detection */}
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          {/* Left: Hash Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hash className="h-5 w-5" />
                Hash status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Full page source hash</span>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(hashData.fullHash)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <div className="rounded-md bg-muted p-3">
                  <code className="text-xs">{hashData.fullHash}</code>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Detects any HTML/source change</p>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Content hash</span>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(hashData.contentHash)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <div className="rounded-md bg-muted p-3">
                  <code className="text-xs">{hashData.contentHash}</code>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Excludes nav & footer; tracks meaningful content</p>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <div className="mb-3 text-sm font-medium">Last comparison result</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">FullHash:</span>
                    <Badge variant={hashData.fullHashChanged ? "destructive" : "secondary"}>
                      {hashData.fullHashChanged ? "CHANGED" : "SAME"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">ContentHash:</span>
                    <Badge variant={hashData.contentHashChanged ? "destructive" : "secondary"}>
                      {hashData.contentHashChanged ? "CHANGED" : "SAME"}
                    </Badge>
                  </div>
                </div>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Nav/Footer excluded from content hash to focus on meaningful page changes
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Right: Change History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Change history
              </CardTitle>
              <CardDescription>Last 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {changeHistory.map((day, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="flex-1 text-sm font-medium">{day.date}</div>
                    <div className="flex gap-2">
                      {day.contentChanged && (
                        <Badge className="bg-orange-500/10 text-orange-700 dark:text-orange-400">Content changed</Badge>
                      )}
                      {day.techOnly && (
                        <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400">Tech-only</Badge>
                      )}
                      {!day.contentChanged && !day.techOnly && (
                        <Badge className="bg-green-500/10 text-green-700 dark:text-green-400">No change</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-center gap-6 text-xs">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span className="text-muted-foreground">No change</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-orange-500" />
                  <span className="text-muted-foreground">Content</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-blue-500" />
                  <span className="text-muted-foreground">Tech-only</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <span className="text-muted-foreground">Blocked</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section C: Differences */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>What changed?</CardTitle>
            <CardDescription>Compare scans to see differences</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Compare:</span>
                <Select value={compareA} onValueChange={setCompareA}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scan-1">Latest</SelectItem>
                    <SelectItem value="scan-2">Previous</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground">vs</span>
                <Select value={compareB} onValueChange={setCompareB}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scan-1">Latest</SelectItem>
                    <SelectItem value="scan-2">Previous</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button
                  variant={showContentOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowContentOnly(true)}
                >
                  Show content changes only
                </Button>
                <Button
                  variant={!showContentOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowContentOnly(false)}
                >
                  Include tech-only changes
                </Button>
              </div>
            </div>

            <Accordion type="single" collapsible className="w-full">
              {differences.length === 0 ? (
                <div className="py-4 text-center text-muted-foreground text-sm">No differences recorded yet.</div>
              ) : (
                differences.map((diff, idx) => (
                  <AccordionItem key={idx} value={`item-${idx}`}>
                    <AccordionTrigger>
                      <div className="flex items-center gap-3">
                        {getSeverityIcon(diff.severity)}
                        <span className="font-medium">{diff.title}</span>
                        <Badge variant="outline" className="text-xs">
                          {diff.detectedBy}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 pl-7">
                        {diff.type === "text" && (
                          <>
                            <div className="rounded-md bg-red-500/10 p-3">
                              <div className="mb-1 text-xs font-medium text-red-700 dark:text-red-400">Before:</div>
                              <div className="text-sm">{diff.before}</div>
                            </div>
                            <div className="rounded-md bg-green-500/10 p-3">
                              <div className="mb-1 text-xs font-medium text-green-700 dark:text-green-400">After:</div>
                              <div className="text-sm">{diff.after}</div>
                            </div>
                          </>
                        )}
                        {diff.type === "added" && (
                          <div className="rounded-md bg-green-500/10 p-3">
                            <div className="mb-1 text-xs font-medium text-green-700 dark:text-green-400">Added:</div>
                            <div className="text-sm">{diff.content}</div>
                          </div>
                        )}
                        {diff.type === "removed" && (
                          <div className="rounded-md bg-red-500/10 p-3">
                            <div className="mb-1 text-xs font-medium text-red-700 dark:text-red-400">Removed:</div>
                            <div className="text-sm">{diff.content}</div>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))
              )}
            </Accordion>
          </CardContent>
        </Card>

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

            {/* Readability */}
            <Card>
              <CardHeader>
                <CardTitle>Readability</CardTitle>
                <CardDescription>Content complexity analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border bg-card p-4">
                    <div className="text-2xl font-bold">{readabilityData.fleschScore}</div>
                    <div className="text-xs text-muted-foreground">Flesch score</div>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <div className="text-lg font-semibold">{readabilityData.gradeLevel}</div>
                    <div className="text-xs text-muted-foreground">Grade estimate</div>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <div className="text-2xl font-bold">{readabilityData.wordCount}</div>
                    <div className="text-xs text-muted-foreground">Word count</div>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <div className="text-2xl font-bold">{readabilityData.sentenceCount}</div>
                    <div className="text-xs text-muted-foreground">Sentence count</div>
                  </div>
                </div>
                <div className="mt-4 flex justify-center">
                  <Badge variant="outline" className="text-sm">
                    {readabilityData.difficulty}
                  </Badge>
                </div>
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

        {/* Section E: Other Audit Categories (Tabs) */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Audit categories</CardTitle>
            <CardDescription>Detailed analysis across multiple dimensions</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="performance" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="performance">
                  <Zap className="mr-2 h-4 w-4" />
                  Performance
                </TabsTrigger>
                <TabsTrigger value="accessibility">
                  <Eye className="mr-2 h-4 w-4" />
                  Accessibility
                </TabsTrigger>
                <TabsTrigger value="seo">
                  <Search className="mr-2 h-4 w-4" />
                  SEO
                </TabsTrigger>
                <TabsTrigger value="security">
                  <Shield className="mr-2 h-4 w-4" />
                  Security
                </TabsTrigger>
              </TabsList>

              <TabsContent value="performance" className="mt-6">
                <div className="mb-6 rounded-lg border bg-card p-4">
                  <div className="text-sm font-medium text-muted-foreground">Performance score</div>
                  <div className="mt-2 flex items-center gap-4">
                    <div className="text-4xl font-bold">68</div>
                    <Progress value={68} className="h-3 flex-1" />
                  </div>
                </div>

                <Accordion type="single" collapsible className="w-full">
                  {performanceIssues.map((issue, idx) => (
                    <AccordionItem key={idx} value={`perf-${idx}`}>
                      <AccordionTrigger>
                        <div className="flex items-center gap-3">
                          {getSeverityIcon(issue.severity)}
                          <div className="text-left">
                            <div className="font-medium">{issue.title}</div>
                            <div className="text-sm text-muted-foreground">{issue.description}</div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="pl-7">
                          <div className="mb-2 text-sm font-medium">How to fix:</div>
                          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                            {issue.fix.map((step, stepIdx) => (
                              <li key={stepIdx}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </TabsContent>

              <TabsContent value="accessibility" className="mt-6">
                <div className="mb-6 rounded-lg border bg-card p-4">
                  <div className="text-sm font-medium text-muted-foreground">Accessibility score</div>
                  <div className="mt-2 flex items-center gap-4">
                    <div className="text-4xl font-bold">72</div>
                    <Progress value={72} className="h-3 flex-1" />
                  </div>
                </div>

                <Accordion type="single" collapsible className="w-full">
                  {accessibilityIssues.map((issue, idx) => (
                    <AccordionItem key={idx} value={`a11y-${idx}`}>
                      <AccordionTrigger>
                        <div className="flex items-center gap-3">
                          {getSeverityIcon(issue.severity)}
                          <div className="text-left">
                            <div className="font-medium">{issue.title}</div>
                            <div className="text-sm text-muted-foreground">{issue.description}</div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="pl-7">
                          <div className="mb-2 text-sm font-medium">How to fix:</div>
                          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                            {issue.fix.map((step, stepIdx) => (
                              <li key={stepIdx}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </TabsContent>

              <TabsContent value="seo" className="mt-6">
                <div className="mb-6 rounded-lg border bg-card p-4">
                  <div className="text-sm font-medium text-muted-foreground">SEO score</div>
                  <div className="mt-2 flex items-center gap-4">
                    <div className="text-4xl font-bold">85</div>
                    <Progress value={85} className="h-3 flex-1" />
                  </div>
                </div>

                <Accordion type="single" collapsible className="w-full">
                  {seoIssues.map((issue, idx) => (
                    <AccordionItem key={idx} value={`seo-${idx}`}>
                      <AccordionTrigger>
                        <div className="flex items-center gap-3">
                          {getSeverityIcon(issue.severity)}
                          <div className="text-left">
                            <div className="font-medium">{issue.title}</div>
                            <div className="text-sm text-muted-foreground">{issue.description}</div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="pl-7">
                          <div className="mb-2 text-sm font-medium">How to fix:</div>
                          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                            {issue.fix.map((step, stepIdx) => (
                              <li key={stepIdx}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </TabsContent>

              <TabsContent value="security" className="mt-6">
                <div className="mb-6 rounded-lg border bg-card p-4">
                  <div className="text-sm font-medium text-muted-foreground">Security score</div>
                  <div className="mt-2 flex items-center gap-4">
                    <div className="text-4xl font-bold">55</div>
                    <Progress value={55} className="h-3 flex-1" />
                  </div>
                </div>

                <Accordion type="single" collapsible className="w-full">
                  {securityIssues.map((issue, idx) => (
                    <AccordionItem key={idx} value={`sec-${idx}`}>
                      <AccordionTrigger>
                        <div className="flex items-center gap-3">
                          {getSeverityIcon(issue.severity)}
                          <div className="text-left">
                            <div className="font-medium">{issue.title}</div>
                            <div className="text-sm text-muted-foreground">{issue.description}</div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="pl-7">
                          <div className="mb-2 text-sm font-medium">How to fix:</div>
                          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                            {issue.fix.map((step, stepIdx) => (
                              <li key={stepIdx}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Section F: Scan Run History */}
        <Card>
          <CardHeader>
            <CardTitle>Scan run history</CardTitle>
            <CardDescription>Historical audit runs for this page</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date/Time</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Full hash</TableHead>
                    <TableHead>Content hash</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Blockers</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scanRunHistory.map((run, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium max-w-[200px] truncate">{run.timestamp}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{run.duration}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <div className={`h-2 w-2 rounded-full ${run.fullHashChanged ? 'bg-orange-500' : 'bg-green-500'}`} />
                          <span className="text-xs">{run.fullHashChanged ? 'Changed' : 'Same'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <div className={`h-2 w-2 rounded-full ${run.contentHashChanged ? 'bg-orange-500' : 'bg-green-500'}`} />
                          <span className="text-xs">{run.contentHashChanged ? 'Changed' : 'Same'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold">{run.contentScore}</span>
                      </TableCell>
                      <TableCell>
                        {run.blockers > 0 ? (
                          <Badge variant="destructive">{run.blockers}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusColor(run.status)}>
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm">
                            View run
                          </Button>
                          <Button variant="outline" size="sm">
                            Set baseline
                          </Button>
                          <Button variant="outline" size="sm">
                            Compare
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
