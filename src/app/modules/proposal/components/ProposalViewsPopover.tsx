'use client';

import { useState, ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Laptop, Smartphone, Tablet, Globe, Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';

interface ProposalViewRow {
    id: string;
    viewedAt: string;
    country?: string;
    city?: string;
    userAgent?: string;
    referrer?: string;
}

interface ProposalViewsPopoverProps {
    proposalId: string;
    viewCount: number;
    children: ReactNode;
}

type DeviceKind = 'phone' | 'tablet' | 'desktop' | 'unknown';

function deviceFromUA(ua: string | undefined): DeviceKind {
    if (!ua) return 'unknown';
    if (/iPad|Tablet/i.test(ua)) return 'tablet';
    if (/iPhone|Android.*Mobile|Mobile Safari|webOS/i.test(ua)) return 'phone';
    if (/Macintosh|Windows|Linux|CrOS/i.test(ua)) return 'desktop';
    return 'unknown';
}

function deviceLabel(ua: string | undefined): string {
    if (!ua) return 'Unknown device';
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/Android/i.test(ua)) return 'Android';
    if (/Macintosh/i.test(ua)) return 'Mac';
    if (/Windows NT/i.test(ua)) return 'Windows';
    if (/CrOS/i.test(ua)) return 'ChromeOS';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Browser';
}

function DeviceIcon({ ua }: { ua: string | undefined }) {
    const kind = deviceFromUA(ua);
    const className = 'w-4 h-4 text-muted-foreground shrink-0';
    if (kind === 'phone') return <Smartphone className={className} />;
    if (kind === 'tablet') return <Tablet className={className} />;
    if (kind === 'desktop') return <Laptop className={className} />;
    return <Globe className={className} />;
}

function formatAbsolute(dateStr: string): string {
    const d = new Date(dateStr);
    const sameDay = new Date().toDateString() === d.toDateString();
    if (sameDay) {
        return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function formatRelative(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    return new Date(dateStr).toLocaleDateString();
}

async function fetchViews(proposalId: string): Promise<ProposalViewRow[]> {
    const idToken = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
    if (!idToken) throw new Error('Not signed in');
    const res = await fetch(`/api/proposals/${encodeURIComponent(proposalId)}/views?limit=50`, {
        headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) throw new Error('Failed to load views');
    const json = (await res.json()) as { views: ProposalViewRow[] };
    return json.views || [];
}

export default function ProposalViewsPopover({ proposalId, viewCount, children }: ProposalViewsPopoverProps) {
    const [open, setOpen] = useState(false);
    const [views, setViews] = useState<ProposalViewRow[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleOpenChange = (nextOpen: boolean) => {
        setOpen(nextOpen);
        if (!nextOpen) return;
        if (views || loading) return;
        setLoading(true);
        setError(null);
        fetchViews(proposalId)
            .then((rows) => setViews(rows))
            .catch((err: Error) => setError(err.message))
            .finally(() => setLoading(false));
    };

    if (viewCount === 0) {
        return <>{children}</>;
    }

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="text-left hover:text-foreground transition-colors cursor-pointer"
                >
                    {children}
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-0">
                <div className="px-4 py-3 border-b border-border">
                    <p className="text-sm font-medium">
                        Opened {viewCount} {viewCount === 1 ? 'time' : 'times'}
                    </p>
                    <p className="text-xs text-muted-foreground">Public share link · viewer identity not captured</p>
                </div>
                <div className="max-h-80 overflow-y-auto">
                    {loading && (
                        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading
                        </div>
                    )}
                    {error && !loading && (
                        <div className="px-4 py-4 text-sm text-destructive">
                            {error}
                        </div>
                    )}
                    {!loading && !error && views && views.length === 0 && (
                        <div className="px-4 py-4 text-sm text-muted-foreground">
                            No view details recorded yet.
                        </div>
                    )}
                    {!loading && !error && views && views.length > 0 && (
                        <ul className="divide-y divide-border">
                            {views.map((v) => {
                                const location = [v.city, v.country].filter(Boolean).join(', ');
                                const where = location || deviceLabel(v.userAgent);
                                return (
                                    <li key={v.id} className="px-4 py-2.5 flex items-start gap-3">
                                        <DeviceIcon ua={v.userAgent} />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm truncate" title={v.userAgent || undefined}>
                                                {where}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatAbsolute(v.viewedAt)} · {formatRelative(v.viewedAt)}
                                            </p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
