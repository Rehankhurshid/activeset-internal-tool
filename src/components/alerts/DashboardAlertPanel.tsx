'use client';

import Link from 'next/link';
import { AlertCircle, AlertTriangle, Bell, Check, Info, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAlerts } from '@/hooks/useAlerts';
import { SiteAlert, AlertSeverity, ALERT_TYPE_LABELS } from '@/types/alerts';
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
  const { alerts, unreadCount, isLoading, markAsRead, markAllAsRead, dismissAlert } = useAlerts();

  // Only show if there are alerts
  if (isLoading || alerts.length === 0) return null;

  // Sort: unread first, then by severity, then by time
  const sortedAlerts = [...alerts].sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    if (a.severity !== b.severity) return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const criticalCount = alerts.filter((a) => a.severity === 'critical' && !a.read).length;
  const warningCount = alerts.filter((a) => a.severity === 'warning' && !a.read).length;

  return (
    <Card className={cn(
      'border transition-colors',
      criticalCount > 0
        ? 'border-red-500/30 bg-red-500/5'
        : warningCount > 0
          ? 'border-amber-500/30 bg-amber-500/5'
          : 'border-border',
      className
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className={cn(
              'h-4 w-4',
              criticalCount > 0 ? 'text-red-500' : warningCount > 0 ? 'text-amber-500' : 'text-muted-foreground'
            )} />
            <CardTitle className="text-base">Site Alerts</CardTitle>
            {unreadCount > 0 && (
              <Badge
                variant={criticalCount > 0 ? 'destructive' : 'secondary'}
                className="text-xs"
              >
                {unreadCount} unread
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-muted-foreground"
              onClick={markAllAsRead}
            >
              <Check className="h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-2">
          {sortedAlerts.slice(0, 5).map((alert) => (
            <div
              key={alert.id}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border transition-colors',
                !alert.read
                  ? 'bg-background border-border'
                  : 'bg-muted/30 border-transparent'
              )}
            >
              <SeverityIcon severity={alert.severity} className="mt-0.5 shrink-0" />

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={cn(
                      'text-sm leading-tight',
                      !alert.read ? 'font-semibold' : 'font-medium text-muted-foreground'
                    )}>
                      {alert.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <Link
                        href={`/modules/project-links/${alert.projectId}`}
                        className="hover:text-primary transition-colors truncate"
                        onClick={() => { if (!alert.read) markAsRead(alert.id); }}
                      >
                        {alert.projectName}
                      </Link>
                      <span>·</span>
                      <span className="shrink-0">{timeAgo(alert.createdAt)}</span>
                      <span>·</span>
                      <span className="shrink-0">{alert.affectedPages.length} page(s)</span>
                    </div>
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
              </div>
            </div>
          ))}

          {sortedAlerts.length > 5 && (
            <p className="text-xs text-muted-foreground text-center pt-1">
              +{sortedAlerts.length - 5} more alerts
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
