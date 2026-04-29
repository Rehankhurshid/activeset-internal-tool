'use client';

import Link from 'next/link';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAlerts } from '@/hooks/useAlerts';
import { AlertSeverity } from '@/types/alerts';
import { cn } from '@/lib/utils';

function SeverityIcon({ severity, className }: { severity: AlertSeverity; className?: string }) {
  switch (severity) {
    case 'critical':
      return <AlertCircle className={cn('h-4 w-4 text-red-500', className)} />;
    case 'warning':
      return <AlertTriangle className={cn('h-4 w-4 text-amber-500', className)} />;
    case 'info':
      return <Info className={cn('h-4 w-4 text-blue-500', className)} />;
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

interface DashboardAlertPanelProps {
  className?: string;
}

export function DashboardAlertPanel({ className }: DashboardAlertPanelProps) {
  const { alerts, isLoading, markAsRead, dismissAlert } = useAlerts();

  if (isLoading || alerts.length === 0) return null;

  const sortedAlerts = [...alerts].sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    if (a.severity !== b.severity) return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className={cn('space-y-1.5', className)}>
      {sortedAlerts.slice(0, 5).map((alert) => (
        <div
          key={alert.id}
          className={cn(
            'flex items-center gap-2 pl-3 pr-1 py-1.5 rounded-md border text-sm',
            alert.severity === 'critical'
              ? 'border-red-500/30 bg-red-500/5'
              : alert.severity === 'warning'
                ? 'border-amber-500/30 bg-amber-500/5'
                : 'border-border bg-muted/20'
          )}
        >
          <SeverityIcon severity={alert.severity} className="shrink-0" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className={cn('truncate', !alert.read ? 'font-medium' : 'text-muted-foreground')}>
              {alert.title}
            </span>
            <span className="text-muted-foreground shrink-0">·</span>
            <Link
              href={`/modules/project-links/${alert.projectId}`}
              className="text-muted-foreground hover:text-primary truncate"
              onClick={() => { if (!alert.read) markAsRead(alert.id); }}
            >
              {alert.projectName}
            </Link>
            <span className="text-muted-foreground shrink-0 hidden sm:inline">·</span>
            <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
              {timeAgo(alert.createdAt)}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => dismissAlert(alert.id)}
            title="Dismiss"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}

      {sortedAlerts.length > 5 && (
        <p className="text-xs text-muted-foreground text-center pt-0.5">
          +{sortedAlerts.length - 5} more alerts
        </p>
      )}
    </div>
  );
}
