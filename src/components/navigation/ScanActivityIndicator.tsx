'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bell, Loader2, Radio, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface RunningScanItem {
  scanId: string;
  projectId: string;
  projectName: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  current: number;
  total: number;
  percentage: number;
  currentUrl: string;
  startedAt: string;
  scanCollections: boolean;
}

interface RunningScansResponse {
  scans: RunningScanItem[];
  hasRunningScans: boolean;
}

export function ScanActivityIndicator() {
  const [scans, setScans] = useState<RunningScanItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      let hasActiveScans = false;
      try {
        const response = await fetch('/api/scan-bulk/running-all', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to load running scans: ${response.status}`);
        }

        const data = (await response.json()) as RunningScansResponse;
        hasActiveScans = Array.isArray(data.scans) && data.scans.length > 0;
        if (!disposed) {
          setScans(Array.isArray(data.scans) ? data.scans : []);
          setIsLoading(false);
        }
      } catch {
        if (!disposed) {
          setIsLoading(false);
        }
      } finally {
        if (!disposed) {
          timer = setTimeout(poll, hasActiveScans ? 3000 : 8000);
        }
      }
    };

    poll();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const aggregate = useMemo(() => {
    const totalPages = scans.reduce((acc, scan) => acc + scan.total, 0);
    const completedPages = scans.reduce((acc, scan) => acc + scan.current, 0);
    const percentage = totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0;

    return {
      totalScans: scans.length,
      totalPages,
      completedPages,
      percentage,
    };
  }, [scans]);

  const hasActiveScans = scans.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={hasActiveScans ? 'secondary' : 'ghost'}
          size="sm"
          className="relative h-9 gap-2 px-2.5"
          aria-label="Scan activity"
        >
          {hasActiveScans ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          <span className="hidden lg:inline text-xs">
            {hasActiveScans ? 'Scanning' : 'Scans'}
          </span>
          {hasActiveScans && (
            <Badge variant="default" className="h-5 min-w-5 px-1 text-[10px] tabular-nums">
              {aggregate.totalScans}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[360px] p-0">
        <div className="px-4 py-3 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b">
          <DropdownMenuLabel className="p-0 flex items-center justify-between text-sm">
            <span className="font-semibold">Scan Activity</span>
            {hasActiveScans ? (
              <Badge variant="secondary" className="text-[10px]">
                {aggregate.totalScans} active
              </Badge>
            ) : null}
          </DropdownMenuLabel>

          {hasActiveScans && (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {aggregate.completedPages}/{aggregate.totalPages} pages
                </span>
                <span>{aggregate.percentage}%</span>
              </div>
              <Progress value={aggregate.percentage} className="h-1.5" />
            </div>
          )}
        </div>

        {!hasActiveScans && !isLoading && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No scans are running.
          </div>
        )}

        {isLoading && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Checking scan status...
          </div>
        )}

        {hasActiveScans && (
          <div className="max-h-[360px] overflow-y-auto">
            {scans.map((scan, index) => (
              <div key={scan.scanId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Radio className="h-3.5 w-3.5 text-primary" />
                      <p className="font-medium text-sm truncate">{scan.projectName}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {scan.current}/{scan.total} pages • {scan.percentage}% • {scan.scanCollections ? 'All pages' : 'Static pages'}
                    </p>
                  </div>

                  <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
                    <Link href={`/modules/project-links/${scan.projectId}`}>Open</Link>
                  </Button>
                </div>

                <div className="mt-2.5 space-y-1.5">
                  <Progress value={scan.percentage} className="h-1.5" />
                  <p className="text-[11px] text-muted-foreground truncate" title={scan.currentUrl || 'Preparing scan...'}>
                    <Square className="inline-block h-2.5 w-2.5 mr-1 text-primary/70" />
                    {scan.currentUrl || 'Preparing scan...'}
                  </p>
                </div>

                {index < scans.length - 1 && <DropdownMenuSeparator className="mt-3" />}
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
