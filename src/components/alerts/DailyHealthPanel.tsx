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
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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

export function DailyHealthPanel({ className }: DailyHealthPanelProps) {
  const [report, setReport] = useState<DailyHealthReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
    { label: 'ALT', count: bd.missingAltText, icon: <Image className="h-3 w-3" />, color: 'text-rose-400' },
    { label: 'Meta', count: bd.missingMetaDescription, icon: <FileText className="h-3 w-3" />, color: 'text-amber-400' },
    { label: 'Title', count: bd.missingTitle, icon: <Type className="h-3 w-3" />, color: 'text-orange-400' },
    { label: 'H1', count: bd.missingH1, icon: <Heading1 className="h-3 w-3" />, color: 'text-yellow-400' },
    { label: 'Broken', count: bd.brokenLinks, icon: <LinkIcon className="h-3 w-3" />, color: 'text-red-400' },
    { label: 'Spelling', count: bd.spellingErrors, icon: <Type className="h-3 w-3" />, color: 'text-blue-400' },
    { label: 'OG', count: bd.missingOpenGraph, icon: <Share2 className="h-3 w-3" />, color: 'text-purple-400' },
    { label: 'Schema', count: bd.missingSchema, icon: <Code className="h-3 w-3" />, color: 'text-cyan-400' },
    { label: 'Low Score', count: bd.lowScorePages, icon: <AlertTriangle className="h-3 w-3" />, color: 'text-red-400' },
  ].filter(i => i.count > 0);

  const scoreColor = report.avgScore >= 80 ? 'text-emerald-500' : report.avgScore >= 60 ? 'text-amber-500' : 'text-red-500';
  const scoreBg = report.avgScore >= 80 ? 'bg-emerald-500/10' : report.avgScore >= 60 ? 'bg-amber-500/10' : 'bg-red-500/10';

  return (
    <Card className={cn('border', className)}>
      <CardContent className="p-3 sm:p-4">
        {/* Summary line */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className={cn('flex items-center justify-center w-9 h-9 rounded-full shrink-0', scoreBg)}>
            <span className={cn('text-sm font-bold', scoreColor)}>{report.avgScore}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm flex-1 min-w-0">
            <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium whitespace-nowrap">Site Health</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-semibold tabular-nums">{visibleTotalIssues}</span>
            <span className="text-muted-foreground truncate whitespace-nowrap">
              issues · {report.projectCount} projects · {report.totalPages} pages
            </span>
          </div>
          <Badge variant="secondary" className="text-xs shrink-0">{report.date}</Badge>
        </div>

        {/* Issue chips */}
        {issues.length > 0 && (
          <div className="mt-3 flex items-center gap-x-3 gap-y-1.5 flex-wrap">
            {issues.map((item) => (
              <div key={item.label} className="flex items-center gap-1">
                <span className={item.color}>{item.icon}</span>
                <span className="text-xs text-muted-foreground">{item.label}</span>
                <span className="text-xs font-semibold tabular-nums">{item.count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Per-project breakdown */}
        {report.projects.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            {report.projects
              .sort((a, b) => a.avgScore - b.avgScore)
              .slice(0, 5)
              .map((p) => {
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
                const pColor = p.avgScore >= 80 ? 'text-emerald-500' : p.avgScore >= 60 ? 'text-amber-500' : 'text-red-500';

                return (
                  <Link
                    key={p.projectId}
                    href={`/modules/project-links/${p.projectId}`}
                    className="flex items-center gap-3 px-2 py-1 rounded hover:bg-muted/50 transition-colors text-sm"
                  >
                    <span className={cn('font-bold tabular-nums w-7 shrink-0', pColor)}>{p.avgScore}</span>
                    <span className="font-medium flex-1 truncate">{p.projectName}</span>
                    <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                      {p.totalPages} pages
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-16 text-right">
                      {totalIssues} issues
                    </span>
                  </Link>
                );
              })}
            {report.projects.length > 5 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                +{report.projects.length - 5} more projects
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
