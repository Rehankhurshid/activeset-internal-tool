'use client';

import Link from 'next/link';
import { AlertCircle, AlertTriangle, Bell, Check, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAlerts } from '@/hooks/useAlerts';
import { SiteAlert, AlertSeverity, ALERT_TYPE_LABELS } from '@/types/alerts';
import { cn } from '@/lib/utils';

function SeverityIcon({ severity, className }: { severity: AlertSeverity; className?: string }) {
  switch (severity) {
    case 'critical':
      return <AlertCircle className={cn('h-3.5 w-3.5 text-red-500', className)} />;
    case 'warning':
      return <AlertTriangle className={cn('h-3.5 w-3.5 text-amber-500', className)} />;
    case 'info':
      return <Info className={cn('h-3.5 w-3.5 text-blue-500', className)} />;
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

function AlertItem({ alert, onMarkRead }: { alert: SiteAlert; onMarkRead: (id: string) => void }) {
  return (
    <Link
      href={`/modules/project-links/${alert.projectId}`}
      className={cn(
        'block px-4 py-3 hover:bg-muted/50 transition-colors',
        !alert.read && 'bg-primary/5'
      )}
      onClick={() => {
        if (!alert.read) onMarkRead(alert.id);
      }}
    >
      <div className="flex items-start gap-2.5">
        <SeverityIcon severity={alert.severity} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className={cn(
              'text-sm truncate',
              !alert.read ? 'font-semibold' : 'font-medium text-muted-foreground'
            )}>
              {alert.title}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="truncate">{alert.projectName}</span>
            <span>·</span>
            <span className="shrink-0">{timeAgo(alert.createdAt)}</span>
          </div>
        </div>
        {!alert.read && (
          <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
        )}
      </div>
    </Link>
  );
}

export function AlertIndicator() {
  const { alerts, unreadCount, isLoading, markAsRead, markAllAsRead } = useAlerts();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={unreadCount > 0 ? 'secondary' : 'ghost'}
          size="sm"
          className="relative h-9 gap-2 px-2.5"
          aria-label="Site alerts"
        >
          <Bell className={cn('h-4 w-4', unreadCount > 0 && 'text-primary')} />
          <span className="hidden lg:inline text-xs">Alerts</span>
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="h-5 min-w-5 px-1 text-[10px] tabular-nums"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[380px] p-0">
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <DropdownMenuLabel className="p-0 text-sm font-semibold">
            Site Alerts
          </DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.preventDefault();
                markAllAsRead();
              }}
            >
              <Check className="h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>

        {/* Alert list */}
        {isLoading && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Loading alerts...
          </div>
        )}

        {!isLoading && alerts.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            <Check className="h-5 w-5 mx-auto mb-2 text-emerald-500" />
            No alerts — all clear
          </div>
        )}

        {!isLoading && alerts.length > 0 && (
          <div className="max-h-[400px] overflow-y-auto">
            {alerts.map((alert, index) => (
              <div key={alert.id}>
                <AlertItem alert={alert} onMarkRead={markAsRead} />
                {index < alerts.length - 1 && <DropdownMenuSeparator className="my-0" />}
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
