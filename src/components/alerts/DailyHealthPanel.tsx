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
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? 'text-emerald-500' : score >= 60 ? 'text-amber-500' : 'text-red-500';
  const bgColor = score >= 80 ? 'bg-emerald-500/10' : score >= 60 ? 'bg-amber-500/10' : 'bg-red-500/10';

  return (
    <div className={cn('flex items-center justify-center w-14 h-14 rounded-full', bgColor)}>
      <span className={cn('text-xl font-bold', color)}>{score}</span>
    </div>
  );
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

  return (
    <Card className={cn('border', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Site Health Report</CardTitle>
            <Badge variant="secondary" className="text-xs">
              {report.date}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {report.projectCount} projects · {report.totalPages} pages
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex gap-6">
          {/* Score + summary */}
          <div className="flex items-center gap-4">
            <ScoreRing score={report.avgScore} />
            <div>
              <p className="text-sm font-medium">
                {report.totalIssues} issues found
              </p>
              <p className="text-xs text-muted-foreground">
                Avg score across all sites
              </p>
            </div>
          </div>

          {/* Issue grid */}
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-1.5">
            {issues.map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <span className={item.color}>{item.icon}</span>
                <span className="text-xs text-muted-foreground truncate">{item.label}</span>
                <span className="text-xs font-semibold ml-auto">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Per-project breakdown */}
        {report.projects.length > 0 && (
          <div className="mt-4 pt-3 border-t space-y-1.5">
            {report.projects
              .sort((a, b) => a.avgScore - b.avgScore)
              .slice(0, 5)
              .map((p) => {
                const totalIssues = Object.values(p.issues).reduce((a, b) => a + b, 0);
                const scoreColor = p.avgScore >= 80 ? 'text-emerald-500' : p.avgScore >= 60 ? 'text-amber-500' : 'text-red-500';

                return (
                  <Link
                    key={p.projectId}
                    href={`/modules/project-links/${p.projectId}`}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <span className={cn('text-sm font-bold tabular-nums w-8', scoreColor)}>
                      {p.avgScore}
                    </span>
                    <span className="text-sm font-medium flex-1 truncate">{p.projectName}</span>
                    <span className="text-xs text-muted-foreground">{p.totalPages} pages</span>
                    <Badge variant="outline" className="text-[10px] h-5">
                      {totalIssues} issues
                    </Badge>
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
