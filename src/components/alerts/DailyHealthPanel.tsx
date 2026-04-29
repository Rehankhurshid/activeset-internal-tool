'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Image,
  FileText,
  Heading1,
  LinkIcon,
  Type,
  Share2,
  Code,
  AlertTriangle,
  Activity,
  ChevronRight,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { healthReportService } from '@/services/HealthReportService';
import { DailyHealthReport } from '@/types/health-report';
import { cn } from '@/lib/utils';

interface IssueItem {
  label: string;
  count: number;
  icon: React.ReactNode;
  color: string;
}

interface DailyHealthPanelProps {
  className?: string;
}

function scoreColors(score: number) {
  return {
    text: score >= 80 ? 'text-emerald-500' : score >= 60 ? 'text-amber-500' : 'text-red-500',
    bg: score >= 80 ? 'bg-emerald-500/10' : score >= 60 ? 'bg-amber-500/10' : 'bg-red-500/10',
  };
}

export function DailyHealthPanel({ className }: DailyHealthPanelProps) {
  const [report, setReport] = useState<DailyHealthReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = healthReportService.subscribeToLatestReport((r) => {
      setReport(r);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (isLoading || !report) return null;

  const bd = report.issueBreakdown;
  const visibleTotalIssues =
    bd.missingAltText +
    bd.missingMetaDescription +
    bd.missingTitle +
    bd.missingH1 +
    bd.brokenLinks +
    bd.spellingErrors +
    bd.missingOpenGraph +
    bd.missingSchema +
    bd.lowScorePages;

  const issues: IssueItem[] = [
    { label: 'Missing ALT', count: bd.missingAltText, icon: <Image className="h-3.5 w-3.5" />, color: 'text-rose-400' },
    { label: 'Missing Meta Desc', count: bd.missingMetaDescription, icon: <FileText className="h-3.5 w-3.5" />, color: 'text-amber-400' },
    { label: 'Missing Title', count: bd.missingTitle, icon: <Type className="h-3.5 w-3.5" />, color: 'text-orange-400' },
    { label: 'Missing H1', count: bd.missingH1, icon: <Heading1 className="h-3.5 w-3.5" />, color: 'text-yellow-400' },
    { label: 'Broken Links', count: bd.brokenLinks, icon: <LinkIcon className="h-3.5 w-3.5" />, color: 'text-red-400' },
    { label: 'Spelling', count: bd.spellingErrors, icon: <Type className="h-3.5 w-3.5" />, color: 'text-blue-400' },
    { label: 'Missing OG', count: bd.missingOpenGraph, icon: <Share2 className="h-3.5 w-3.5" />, color: 'text-purple-400' },
    { label: 'Missing Schema', count: bd.missingSchema, icon: <Code className="h-3.5 w-3.5" />, color: 'text-cyan-400' },
    { label: 'Low Score', count: bd.lowScorePages, icon: <AlertTriangle className="h-3.5 w-3.5" />, color: 'text-red-400' },
  ].filter(i => i.count > 0);

  const sc = scoreColors(report.avgScore);
  const sortedProjects = [...report.projects].sort((a, b) => a.avgScore - b.avgScore);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'w-full flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-md border bg-muted/20 hover:bg-muted/40 text-sm text-left transition-colors',
          className
        )}
      >
        <div className={cn('flex items-center justify-center w-7 h-7 rounded-full shrink-0', sc.bg)}>
          <span className={cn('text-xs font-bold', sc.text)}>{report.avgScore}</span>
        </div>
        <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-medium whitespace-nowrap">Site Health</span>
        <span className="text-muted-foreground">·</span>
        <span className="font-semibold tabular-nums">{visibleTotalIssues}</span>
        <span className="text-muted-foreground truncate whitespace-nowrap hidden sm:inline">
          issues · {report.projectCount} projects · {report.totalPages} pages
        </span>
        <span className="text-muted-foreground truncate whitespace-nowrap sm:hidden">issues</span>
        <Badge variant="secondary" className="text-xs ml-auto shrink-0">{report.date}</Badge>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Site Health Report</SheetTitle>
            <SheetDescription>
              {report.date} · {report.projectCount} projects · {report.totalPages} pages
            </SheetDescription>
          </SheetHeader>

          <div className="p-4 space-y-5">
            {/* Score + summary */}
            <div className="flex items-center gap-4">
              <div className={cn('flex items-center justify-center w-14 h-14 rounded-full', sc.bg)}>
                <span className={cn('text-xl font-bold', sc.text)}>{report.avgScore}</span>
              </div>
              <div>
                <p className="text-sm font-medium">{visibleTotalIssues} issues found</p>
                <p className="text-xs text-muted-foreground">Avg score across all sites</p>
              </div>
            </div>

            {/* Issue breakdown */}
            {issues.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Issue breakdown</p>
                <div className="grid grid-cols-2 gap-2">
                  {issues.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/20"
                    >
                      <span className={item.color}>{item.icon}</span>
                      <span className="text-xs text-muted-foreground flex-1 truncate">{item.label}</span>
                      <span className="text-sm font-semibold tabular-nums">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per-project list */}
            {sortedProjects.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Projects · {sortedProjects.length}
                </p>
                <div className="space-y-0.5">
                  {sortedProjects.map((p) => {
                    const totalIssues =
                      p.issues.missingAltText +
                      p.issues.missingMetaDescription +
                      p.issues.missingTitle +
                      p.issues.missingH1 +
                      p.issues.brokenLinks +
                      p.issues.spellingErrors +
                      p.issues.missingOpenGraph +
                      p.issues.missingSchema +
                      p.issues.lowScorePages;
                    const pc = scoreColors(p.avgScore);

                    return (
                      <Link
                        key={p.projectId}
                        href={`/modules/project-links/${p.projectId}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors text-sm"
                      >
                        <span className={cn('font-bold tabular-nums w-7 shrink-0', pc.text)}>
                          {p.avgScore}
                        </span>
                        <span className="font-medium flex-1 truncate">{p.projectName}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{p.totalPages} pages</span>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-16 text-right">
                          {totalIssues} issues
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
