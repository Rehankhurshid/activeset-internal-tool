'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Radar, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ProjectLink } from '@/types';

interface RunningScan {
  scanId: string;
  projectId: string;
  status: string;
  current: number;
  total: number;
  percentage: number;
}

interface ProjectScanBadgeProps {
  projectId: string;
  links: ProjectLink[];
  className?: string;
}

function formatRelativeDate(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '';
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ProjectScanBadge({ projectId, links, className }: ProjectScanBadgeProps) {
  const [runningScan, setRunningScan] = useState<RunningScan | null>(null);

  // Compute scan stats from auto links
  const scanStats = useMemo(() => {
    const autoLinks = links?.filter(l => l.source === 'auto') || [];
    const scannedLinks = autoLinks.filter(l => l.auditResult?.lastRun);
    const totalPages = autoLinks.length;
    const scannedPages = scannedLinks.length;

    // Find the most recent scan date
    let latestScan: string | null = null;
    for (const link of scannedLinks) {
      const lastRun = link.auditResult?.lastRun;
      if (lastRun && (!latestScan || lastRun > latestScan)) {
        latestScan = lastRun;
      }
    }

    return { totalPages, scannedPages, latestScan };
  }, [links]);

  // Poll for active scans on this project
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await fetch('/api/scan-bulk/running-all', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const scan = data.scans?.find((s: RunningScan) => s.projectId === projectId);
        if (!disposed) setRunningScan(scan || null);
      } catch {
        // ignore
      } finally {
        if (!disposed) {
          timer = setTimeout(poll, runningScan ? 3000 : 15000);
        }
      }
    };

    poll();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [projectId, runningScan]);

  const isScanning = !!runningScan;

  if (isScanning) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] px-1.5 py-0 h-[18px] font-medium border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 animate-pulse",
          className
        )}
        title={`Scanning: ${runningScan.current}/${runningScan.total} pages (${runningScan.percentage}%)`}
      >
        <Loader2 className="w-2.5 h-2.5 mr-0.5 animate-spin" />
        {runningScan.current}/{runningScan.total}
      </Badge>
    );
  }

  // Static badge with last scan info
  const { totalPages, scannedPages, latestScan } = scanStats;
  const allScanned = scannedPages === totalPages && totalPages > 0;
  const scanLabel = latestScan
    ? `${scannedPages}/${totalPages} · ${formatRelativeDate(latestScan)}`
    : `${scannedPages}/${totalPages}`;

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] px-1.5 py-0 h-[18px] font-medium border",
        allScanned
          ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
          : "border-amber-500/30 bg-amber-500/5 text-amber-400",
        className
      )}
      title={`${scannedPages} of ${totalPages} pages scanned${latestScan ? ` · Last: ${new Date(latestScan).toLocaleString()}` : ''}`}
    >
      <Radar className="w-2.5 h-2.5 mr-0.5" />
      {scanLabel}
    </Badge>
  );
}
