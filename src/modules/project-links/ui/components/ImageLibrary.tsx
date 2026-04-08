'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { ProjectLink } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  Copy,
  Download,
  ExternalLink,
  Folder,
  FolderOpen,
  Globe,
  Grid2x2,
  Grid3x3,
  ImageIcon,
  Loader2,
  Monitor,
  RefreshCw,
  Rows3,
  Search,
  Smartphone,
  Tablet,
  Terminal,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ImageEntry {
  url: string;
  pageUrl: string;
  pageTitle: string;
  pathname: string;
  device: 'desktop' | 'tablet' | 'mobile';
  lang: string;
  capturedAt?: string;
  source: 'capture' | 'audit';
}

/** Known language path prefixes */
const LANG_PREFIXES = new Set([
  'en', 'es', 'es-mx', 'es-es', 'fr', 'de', 'pt', 'pt-br', 'it', 'nl', 'ja', 'ko', 'zh',
  'zh-cn', 'zh-tw', 'ru', 'ar', 'hi', 'sv', 'da', 'no', 'fi', 'pl', 'tr', 'cs', 'th', 'vi',
  'id', 'ms', 'he', 'uk', 'ro', 'hu', 'el', 'bg', 'sk', 'hr', 'sr', 'sl', 'lt', 'lv', 'et',
]);

function detectLangFromPath(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return 'en';
  const first = segments[0].toLowerCase();
  if (LANG_PREFIXES.has(first)) return first;
  return 'en';
}

function formatTimestamp(ts?: string): string | null {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return null;
  }
}

interface CaptureScreenshot {
  device: string;
  fileName: string;
  url: string;
  originalUrl: string;
}

interface CaptureRun {
  runId: string;
  projectName: string;
  createdAt: string;
  screenshotCount: number;
  screenshots: CaptureScreenshot[];
}

/* ------------------------------------------------------------------ */
/*  Display width presets (per device type)                            */
/* ------------------------------------------------------------------ */

interface DisplayWidth {
  key: string;
  label: string;
  /** Max width in px for each card, or 'full' for no constraint */
  maxWidth: number | 'full';
  /** CSS columns value for masonry layout */
  columns: string;
}

const DESKTOP_WIDTHS: DisplayWidth[] = [
  { key: '1440', label: '1440px', maxWidth: 1440, columns: '1' },
  { key: '1280', label: '1280px', maxWidth: 1280, columns: '1' },
  { key: '1024', label: '1024px', maxWidth: 1024, columns: '2' },
  { key: '768', label: '768px',  maxWidth: 768,  columns: '2' },
  { key: '480', label: '480px',  maxWidth: 480,  columns: '3' },
  { key: 'full', label: 'Full',  maxWidth: 'full', columns: '1' },
];

const TABLET_WIDTHS: DisplayWidth[] = [
  { key: '1024', label: '1024px', maxWidth: 1024, columns: '2' },
  { key: '768', label: '768px',  maxWidth: 768,  columns: '2' },
  { key: '480', label: '480px',  maxWidth: 480,  columns: '3' },
  { key: 'full', label: 'Full',  maxWidth: 'full', columns: '1' },
];

const MOBILE_WIDTHS: DisplayWidth[] = [
  { key: '430', label: '430px',  maxWidth: 430,  columns: '3' },
  { key: '390', label: '390px',  maxWidth: 390,  columns: '4' },
  { key: '360', label: '360px',  maxWidth: 360,  columns: '4' },
  { key: 'full', label: 'Full',  maxWidth: 'full', columns: '1' },
];

const DEVICE_WIDTHS: Record<string, DisplayWidth[]> = {
  desktop: DESKTOP_WIDTHS,
  tablet: TABLET_WIDTHS,
  mobile: MOBILE_WIDTHS,
};

const DEVICE_DEFAULT_WIDTH: Record<string, string> = {
  desktop: '1024',
  tablet: '768',
  mobile: '390',
};

const DEVICE_ICON: Record<string, typeof Monitor> = {
  desktop: Monitor,
  tablet: Tablet,
  mobile: Smartphone,
};

/* ------------------------------------------------------------------ */
/*  Extract images from capture runs                                   */
/* ------------------------------------------------------------------ */

function extractCaptureImages(runs: CaptureRun[]): ImageEntry[] {
  const images: ImageEntry[] = [];

  for (const run of runs) {
    for (const s of run.screenshots) {
      let pathname: string;
      try {
        pathname = new URL(s.originalUrl).pathname || '/';
      } catch {
        pathname = '/';
      }

      let pageTitle = pathname;
      if (pathname === '/') pageTitle = 'Home';
      else pageTitle = pathname.split('/').filter(Boolean).pop() || pathname;

      images.push({
        url: s.url,
        pageUrl: s.originalUrl,
        pageTitle,
        pathname,
        device: (s.device as ImageEntry['device']) || 'desktop',
        lang: detectLangFromPath(pathname),
        capturedAt: run.createdAt,
        source: 'capture',
      });
    }
  }

  return images;
}

function extractAuditImages(links: ProjectLink[]): ImageEntry[] {
  const images: ImageEntry[] = [];

  for (const link of links) {
    const audit = link.auditResult;
    if (!audit) continue;

    let pathname: string;
    try {
      pathname = new URL(link.url).pathname || '/';
    } catch {
      pathname = '/';
    }

    if (audit.screenshotUrl) {
      images.push({
        url: audit.screenshotUrl,
        pageUrl: link.url,
        pageTitle: link.title || pathname,
        pathname,
        device: 'desktop',
        lang: detectLangFromPath(pathname),
        capturedAt: audit.screenshotCapturedAt,
        source: 'audit',
      });
    }
  }

  return images;
}

/* ------------------------------------------------------------------ */
/*  Lightbox (full-width scrollable)                                   */
/* ------------------------------------------------------------------ */

/** All lightbox width presets (superset) */
const LIGHTBOX_WIDTHS = [
  { key: 'full', label: 'Full', px: 0 },
  { key: '1440', label: '1440', px: 1440 },
  { key: '1280', label: '1280', px: 1280 },
  { key: '1024', label: '1024', px: 1024 },
  { key: '768', label: '768', px: 768 },
  { key: '430', label: '430', px: 430 },
  { key: '390', label: '390', px: 390 },
  { key: '360', label: '360', px: 360 },
];

/** Return sensible width presets based on device */
function getLightboxWidths(device: string) {
  switch (device) {
    case 'mobile':
      return LIGHTBOX_WIDTHS.filter((w) => w.key === 'full' || (w.px > 0 && w.px <= 480));
    case 'tablet':
      return LIGHTBOX_WIDTHS.filter((w) => w.key === 'full' || (w.px >= 768 && w.px <= 1024));
    default:
      return LIGHTBOX_WIDTHS.filter((w) => w.key === 'full' || w.px >= 768);
  }
}

function getDefaultLightboxWidth(device: string) {
  switch (device) {
    case 'mobile': return '390';
    case 'tablet': return '768';
    default: return '1280';
  }
}

function Lightbox({
  images,
  initialIndex,
  widthKey,
  onWidthChange,
  onClose,
}: {
  images: ImageEntry[];
  initialIndex: number;
  widthKey: string;
  onWidthChange: (key: string) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  const current = images[index];
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  const widthPresets = getLightboxWidths(current.device);
  const activeWidth = LIGHTBOX_WIDTHS.find((w) => w.key === widthKey);
  const maxWidthPx = activeWidth && activeWidth.px > 0 ? activeWidth.px : 0;

  const goTo = useCallback(
    (i: number) => {
      setIndex(i);
      setZoom(1);
      scrollRef.current?.scrollTo({ top: 0 });
    },
    []
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) goTo(index - 1);
      if (e.key === 'ArrowRight' && hasNext) goTo(index + 1);
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(z + 0.5, 5));
      if (e.key === '-') setZoom((z) => Math.max(z - 0.5, 0.5));
      if (e.key === '0') setZoom(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, hasPrev, hasNext, onClose, goTo]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const DeviceIcon = DEVICE_ICON[current.device] || Monitor;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <div className="flex items-center gap-3 text-sm text-white/80">
          <DeviceIcon className="h-4 w-4" />
          <span className="max-w-[200px] truncate text-xs sm:max-w-none">{current.pageTitle}</span>
          <span className="font-mono text-xs text-white/40">{current.pathname}</span>
          <span className="text-white/40">{index + 1} / {images.length}</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Width presets */}
          <div className="flex items-center gap-0.5 rounded-md border border-white/10 p-0.5">
            {widthPresets.map((w) => (
              <button
                key={w.key}
                onClick={() => onWidthChange(w.key)}
                className={cn(
                  'h-6 rounded px-2 text-[11px] font-medium transition-colors',
                  widthKey === w.key
                    ? 'bg-white text-black'
                    : 'text-white/50 hover:bg-white/10 hover:text-white/80'
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
          <div className="mx-1.5 h-4 w-px bg-white/20" />
          {/* Zoom */}
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setZoom((z) => Math.max(z - 0.5, 0.5))}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="w-10 text-center text-[11px] text-white/50">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setZoom((z) => Math.min(z + 0.5, 5))}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <div className="mx-1.5 h-4 w-px bg-white/20" />
          <a href={current.pageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {!current.url.startsWith('data:') && (
            <a href={current.url} download className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white">
              <Download className="h-3.5 w-3.5" />
            </a>
          )}
          <div className="mx-1.5 h-4 w-px bg-white/20" />
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white/70 hover:bg-white/10 hover:text-white" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Image area */}
      <div className="relative flex flex-1 overflow-hidden">
        {hasPrev && (
          <button onClick={() => goTo(index - 1)} className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/80 hover:bg-black/70 hover:text-white sm:left-4">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {hasNext && (
          <button onClick={() => goTo(index + 1)} className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/80 hover:bg-black/70 hover:text-white sm:right-4">
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div
            className="mx-auto"
            style={maxWidthPx > 0 ? { maxWidth: `${maxWidthPx}px` } : undefined}
          >
            <img
              src={current.url} alt={current.pageTitle} draggable={false}
              className="w-full select-none"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
            />
          </div>
        </div>
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto border-t border-white/10 px-4 py-2">
          {images.map((img, i) => (
            <button
              key={`${img.device}-${img.pathname}-${i}`} onClick={() => goTo(i)}
              className={cn(
                'relative h-12 w-16 flex-shrink-0 overflow-hidden rounded border-2 transition-all',
                i === index ? 'border-white' : 'border-transparent opacity-50 hover:opacity-80'
              )}
            >
              <img src={img.url} alt={img.pageTitle} className="h-full w-full object-cover object-top" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Recapture helper                                                   */
/* ------------------------------------------------------------------ */

function escapeCliValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getProjectCaptureUrls(links: ProjectLink[]): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const link of links) {
    const rawUrl = (link.url || '').trim();
    if (!rawUrl) continue;

    let normalizedKey = rawUrl;
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;

      // Canonicalize key to avoid duplicates from trailing slashes/hash/query variations.
      parsed.hash = '';
      parsed.search = '';
      const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/';
      parsed.pathname = normalizedPath;
      normalizedKey = parsed.toString();
    } catch {
      continue;
    }

    if (!seen.has(normalizedKey)) {
      seen.add(normalizedKey);
      urls.push(rawUrl);
    }
  }

  return urls;
}

function buildCaptureCommand(projectName: string, urls: string[]) {
  const uploadUrl = typeof window !== 'undefined' ? window.location.origin : 'https://app.activeset.co';
  return `npx @activeset/capture --project "${escapeCliValue(projectName)}" --urls "${urls.join(',')}" --upload ${uploadUrl}`;
}

function RecaptureButton({
  urls,
  projectName,
  label,
  variant = 'ghost',
  className,
}: {
  urls: string[];
  projectName: string;
  label?: string;
  variant?: 'ghost' | 'outline';
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const cmd = buildCaptureCommand(projectName, urls);
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    toast.success(`Copied recapture command for ${urls.length} URL${urls.length > 1 ? 's' : ''}`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant={variant}
      size="sm"
      className={cn('h-7 gap-1.5 text-xs', className)}
      onClick={handleCopy}
      title={`Copy CLI command to recapture ${urls.length} page${urls.length > 1 ? 's' : ''}`}
    >
      {copied ? <Check className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
      {label ?? (copied ? 'Copied' : 'Recapture')}
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/*  Image card                                                         */
/* ------------------------------------------------------------------ */

function ImageCard({
  image,
  maxWidth,
  projectName,
  onClick,
}: {
  image: ImageEntry;
  maxWidth: number | 'full';
  projectName: string;
  onClick: () => void;
}) {
  const DeviceIcon = DEVICE_ICON[image.device] || Monitor;
  const cardStyle = maxWidth !== 'full' ? { maxWidth: `${maxWidth}px` } : undefined;

  return (
    <Card
      className={cn(
        'group cursor-pointer overflow-hidden transition-shadow hover:shadow-lg',
        maxWidth !== 'full' && 'mx-auto w-full'
      )}
      style={cardStyle}
      onClick={onClick}
    >
      <div className="relative overflow-hidden bg-muted">
        <img src={image.url} alt={image.pageTitle} className="w-full object-cover object-top" loading="lazy" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
          <ZoomIn className="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <a
            href={image.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white border border-white/20 hover:bg-black/80"
            title="Open page"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
          <RecaptureButton urls={[image.pageUrl]} projectName={projectName} variant="outline" className="bg-black/60 text-white border-white/20 hover:bg-black/80 hover:text-white" />
        </div>
      </div>
      <CardContent className="p-3">
        <p className="truncate text-sm font-medium">{image.pageTitle}</p>
        <div className="mt-1 flex items-center gap-2">
          <DeviceIcon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          <span className="truncate text-xs text-muted-foreground">{image.pathname}</span>
          {image.capturedAt && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="shrink-0 text-[10px] text-muted-foreground/60">{formatTimestamp(image.capturedAt)}</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Sitemap Browser types                                              */
/* ------------------------------------------------------------------ */

interface SitemapEntry {
  url: string;
  pathname: string;
  lang?: string;
}

interface ParsedSitemap {
  domain: string;
  totalUrls: number;
  languages: Record<string, number>;
  folders: Record<string, SitemapEntry[]>;
}

/* ------------------------------------------------------------------ */
/*  Sitemap Browser                                                    */
/* ------------------------------------------------------------------ */

function SitemapBrowser({
  sitemapUrl,
  projectName,
}: {
  sitemapUrl: string;
  projectName: string;
}) {
  const [sitemap, setSitemap] = useState<ParsedSitemap | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch and parse sitemap on mount
  useEffect(() => {
    const fetchSitemap = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/parse-sitemap?url=${encodeURIComponent(sitemapUrl)}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to parse sitemap');
        }
        const data: ParsedSitemap = await res.json();
        setSitemap(data);
        // Select all URLs by default
        const allUrls = new Set<string>();
        for (const entries of Object.values(data.folders)) {
          for (const entry of entries) {
            allUrls.add(entry.url);
          }
        }
        setSelectedUrls(allUrls);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse sitemap');
      } finally {
        setLoading(false);
      }
    };
    fetchSitemap();
  }, [sitemapUrl]);

  const toggleFolder = (folder: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  const toggleFolderSelection = (folder: string) => {
    if (!sitemap) return;
    const entries = sitemap.folders[folder] || [];
    const folderUrls = entries.map((e) => e.url);
    const allSelected = folderUrls.every((u) => selectedUrls.has(u));

    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        folderUrls.forEach((u) => next.delete(u));
      } else {
        folderUrls.forEach((u) => next.add(u));
      }
      return next;
    });
  };

  const toggleUrl = (url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const selectAll = () => {
    if (!sitemap) return;
    const allUrls = new Set<string>();
    for (const entries of Object.values(sitemap.folders)) {
      for (const entry of entries) allUrls.add(entry.url);
    }
    setSelectedUrls(allUrls);
  };

  const deselectAll = () => {
    setSelectedUrls(new Set());
  };

  // Filter folders/entries by search
  const filteredFolders = useMemo(() => {
    if (!sitemap) return {};
    if (!searchQuery.trim()) return sitemap.folders;
    const q = searchQuery.toLowerCase();
    const result: Record<string, SitemapEntry[]> = {};
    for (const [folder, entries] of Object.entries(sitemap.folders)) {
      const matched = entries.filter(
        (e) => e.pathname.toLowerCase().includes(q) || e.url.toLowerCase().includes(q)
      );
      if (matched.length > 0 || folder.toLowerCase().includes(q)) {
        result[folder] = matched.length > 0 ? matched : entries;
      }
    }
    return result;
  }, [sitemap, searchQuery]);

  const sortedFolders = useMemo(() => {
    return Object.keys(filteredFolders).sort((a, b) => {
      if (a === '/') return -1;
      if (b === '/') return 1;
      return a.localeCompare(b);
    });
  }, [filteredFolders]);

  // Build CLI command from selected URLs (with --upload since this is from the project context)
  const uploadUrl = typeof window !== 'undefined' ? window.location.origin : 'https://app.activeset.co';
  const captureCommand = useMemo(() => {
    if (selectedUrls.size === 0) return '';
    if (!sitemap) return '';

    const upload = `--upload ${uploadUrl}`;

    // If all URLs are selected, use --sitemap flag
    const totalUrls = Object.values(sitemap.folders).reduce((sum, entries) => sum + entries.length, 0);
    if (selectedUrls.size === totalUrls) {
      return `npx @activeset/capture --sitemap ${sitemapUrl} --project "${escapeCliValue(projectName)}" ${upload}`;
    }

    // Otherwise, list selected URLs
    const urls = [...selectedUrls].sort();
    return `npx @activeset/capture --project "${escapeCliValue(projectName)}" --urls "${urls.join(',')}" ${upload}`;
  }, [selectedUrls, sitemap, sitemapUrl, projectName, uploadUrl]);

  const handleCopy = () => {
    if (!captureCommand) return;
    navigator.clipboard.writeText(captureCommand);
    setCopied(true);
    toast.success(`Copied command with ${selectedUrls.size} URLs`);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="mt-6 rounded-lg border p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <div>
            <p className="text-sm font-medium">Parsing sitemap...</p>
            <p className="text-xs text-muted-foreground">{sitemapUrl}</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!sitemap) return null;

  const totalUrls = Object.values(sitemap.folders).reduce((sum, entries) => sum + entries.length, 0);
  const langEntries = Object.entries(sitemap.languages);

  return (
    <div className="mt-6 space-y-4">
      {/* Summary header */}
      <div className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Globe className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">{sitemap.domain}</p>
              <p className="text-xs text-muted-foreground">
                {totalUrls} pages in {Object.keys(sitemap.folders).length} folders
                {langEntries.length > 0 && (
                  <> &middot; {langEntries.map(([lang]) => lang).join(', ')}</>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {selectedUrls.size} / {totalUrls} selected
            </Badge>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>
              All
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={deselectAll}>
              None
            </Button>
          </div>
        </div>
      </div>

      {/* Search within sitemap */}
      {totalUrls > 10 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter pages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      )}

      {/* Folder tree */}
      <div className="max-h-[400px] overflow-y-auto rounded-lg border">
        {sortedFolders.map((folder) => {
          const entries = filteredFolders[folder] || [];
          const isExpanded = expandedFolders.has(folder);
          const folderUrls = entries.map((e) => e.url);
          const selectedCount = folderUrls.filter((u) => selectedUrls.has(u)).length;
          const allSelected = selectedCount === entries.length;
          const someSelected = selectedCount > 0 && !allSelected;
          const FolderIcon = isExpanded ? FolderOpen : Folder;

          return (
            <div key={folder} className="border-b last:border-b-0">
              <div
                className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                onClick={() => toggleFolder(folder)}
              >
                <Checkbox
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={() => toggleFolderSelection(folder)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-4 w-4"
                />
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <FolderIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{folder === '/' ? 'Root' : folder}</span>
                <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px] font-normal">
                  {selectedCount}/{entries.length}
                </Badge>
              </div>

              {isExpanded && (
                <div className="border-t bg-muted/20">
                  {entries.map((entry) => (
                    <label
                      key={entry.url}
                      className="flex items-center gap-2 px-3 py-1.5 pl-12 hover:bg-muted/30 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedUrls.has(entry.url)}
                        onCheckedChange={() => toggleUrl(entry.url)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="truncate text-xs text-muted-foreground font-mono">
                        {entry.pathname}
                      </span>
                      {entry.lang && (
                        <Badge variant="outline" className="ml-auto h-4 px-1 text-[9px] font-normal shrink-0">
                          {entry.lang}
                        </Badge>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* CLI command output */}
      {selectedUrls.size > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium">CLI Command</span>
            </div>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleCopy}>
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <code className="block overflow-x-auto whitespace-pre-wrap break-all rounded bg-background px-3 py-2 font-mono text-[11px]">
            {captureCommand}
          </code>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty state                                                        */
/* ------------------------------------------------------------------ */

function EmptyState({
  projectName,
  projectId,
  sitemapUrl,
  links,
}: {
  projectName: string;
  projectId: string;
  sitemapUrl?: string;
  links: ProjectLink[];
}) {
  const [scanning, setScanning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSitemapBrowser, setShowSitemapBrowser] = useState(false);
  const projectUrls = useMemo(() => getProjectCaptureUrls(links), [links]);

  const uploadUrl = typeof window !== 'undefined' ? window.location.origin : 'https://app.activeset.co';
  const captureCommand = sitemapUrl
    ? `npx @activeset/capture --sitemap ${sitemapUrl} --project "${escapeCliValue(projectName)}" --upload ${uploadUrl}`
    : projectUrls.length > 0
      ? buildCaptureCommand(projectName, projectUrls)
      : `npx @activeset/capture --project "${escapeCliValue(projectName)}" --file urls.txt --upload ${uploadUrl}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(captureCommand);
    setCopied(true);
    toast.success('Command copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleScanWithScreenshots = async () => {
    if (!sitemapUrl) return;
    setScanning(true);
    try {
      const res = await fetch('/api/scan-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          options: {
            scanCollections: true,
            captureScreenshots: true,
          },
        }),
      });
      if (res.ok) {
        toast.success('Scan started with screenshots enabled. Check the Audit Dashboard for progress.');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to start scan');
      }
    } catch {
      toast.error('Failed to start scan');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="rounded-lg border border-dashed p-8">
      <div className="flex flex-col items-center text-center">
        <ImageIcon className="h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-medium">No screenshots yet</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Capture screenshots of your pages to build a visual library. Choose an option below to get started.
        </p>
      </div>

      <div className="mx-auto mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
        {/* Option 1: Scan with screenshots */}
        {sitemapUrl && (
          <Card className="relative overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Camera className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Scan with Screenshots</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Run a full scan using your sitemap with screenshots enabled.
                  </p>
                </div>
              </div>
              <Button
                className="mt-4 w-full"
                size="sm"
                onClick={handleScanWithScreenshots}
                disabled={scanning}
              >
                {scanning ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Starting scan...
                  </>
                ) : (
                  <>
                    <Camera className="mr-1.5 h-3.5 w-3.5" />
                    Scan &amp; Capture
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Option 2: CLI capture command */}
        <Card className="relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Terminal className="h-4.5 w-4.5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Capture via CLI</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Run in terminal. Or use <code className="text-[10px]">npx @activeset/capture</code> for the interactive wizard.
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-muted px-2.5 py-1.5 font-mono text-[11px]">
                {captureCommand}
              </code>
              <Button variant="outline" size="sm" className="shrink-0" onClick={handleCopy}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sitemap Browser: select pages for CLI capture */}
      {sitemapUrl && !showSitemapBrowser && (
        <div className="mx-auto mt-6 max-w-2xl text-center">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowSitemapBrowser(true)}
          >
            <Globe className="h-3.5 w-3.5" />
            Browse Sitemap &amp; Select Pages
          </Button>
        </div>
      )}

      {sitemapUrl && showSitemapBrowser && (
        <div className="mx-auto max-w-2xl">
          <SitemapBrowser sitemapUrl={sitemapUrl} projectName={projectName} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Folder group (collapsible)                                         */
/* ------------------------------------------------------------------ */

function FolderGroup({
  folder,
  images,
  allImages,
  columns,
  maxWidth,
  projectName,
  onImageClick,
}: {
  folder: string;
  images: ImageEntry[];
  allImages: ImageEntry[];
  columns: string;
  maxWidth: number | 'full';
  projectName: string;
  onImageClick: (image: ImageEntry) => void;
}) {
  const [open, setOpen] = useState(true);
  const folderUrls = useMemo(() => [...new Set(images.map((img) => img.pageUrl))], [images]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-1">
        <CollapsibleTrigger asChild>
          <button className="flex flex-1 items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/50">
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
            )}
            {open ? (
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Folder className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">
              {folder === '/' ? 'Root' : folder}
            </span>
            <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px] font-normal">
              {images.length}
            </Badge>
          </button>
        </CollapsibleTrigger>
        <RecaptureButton
          urls={folderUrls}
          projectName={projectName}
          label={`Recapture ${folderUrls.length}`}
          variant="outline"
          className="shrink-0"
        />
      </div>
      <CollapsibleContent>
        <div className="mt-2 pb-2" style={{ columns: columns, columnGap: '1rem' }}>
          {images.map((img, i) => (
            <div key={`${img.device}-${img.pathname}-${i}`} className="mb-4 break-inside-avoid">
              <ImageCard
                image={img}
                maxWidth={maxWidth}
                projectName={projectName}
                onClick={() => onImageClick(img)}
              />
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

interface ImageLibraryProps {
  links: ProjectLink[];
  projectName: string;
  projectId: string;
  sitemapUrl?: string;
}

export function ImageLibrary({ links, projectName, projectId, sitemapUrl }: ImageLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [lightboxImages, setLightboxImages] = useState<ImageEntry[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxWidthKey, setLightboxWidthKey] = useState('1280');
  const [captureRuns, setCaptureRuns] = useState<CaptureRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLang, setActiveLang] = useState('en');
  const [activeDevice, setActiveDevice] = useState('desktop');
  const [widthByDevice, setWidthByDevice] = useState<Record<string, string>>(DEVICE_DEFAULT_WIDTH);
  const [copiedAll, setCopiedAll] = useState(false);
  const projectUrls = useMemo(() => getProjectCaptureUrls(links), [links]);

  // Fetch capture runs for this project
  useEffect(() => {
    if (!projectName) {
      setLoading(false);
      return;
    }

    const fetchCaptures = async () => {
      try {
        const res = await fetch(`/api/capture-runs?projectName=${encodeURIComponent(projectName)}`);
        if (res.ok) {
          const data = await res.json();
          setCaptureRuns(data.runs || []);
        }
      } catch (error) {
        console.error('[ImageLibrary] Failed to fetch captures:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCaptures();
  }, [projectName]);

  // Combine both sources: capture runs + audit screenshots
  const allImages = useMemo(() => {
    const captureImages = extractCaptureImages(captureRuns);
    const auditImages = extractAuditImages(links);

    const seen = new Set<string>();
    const combined: ImageEntry[] = [];

    for (const img of captureImages) {
      const key = `${img.pageUrl}::${img.device}`;
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(img);
      }
    }
    for (const img of auditImages) {
      const key = `${img.pageUrl}::${img.device}`;
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(img);
      }
    }

    return combined;
  }, [captureRuns, links]);
  const fallbackImageUrls = useMemo(() => [...new Set(allImages.map((i) => i.pageUrl))], [allImages]);

  // Group by language
  const langGroups = useMemo(() => {
    const groups = new Map<string, ImageEntry[]>();
    for (const img of allImages) {
      const bucket = groups.get(img.lang) || [];
      bucket.push(img);
      groups.set(img.lang, bucket);
    }
    return groups;
  }, [allImages]);

  const languages = useMemo(() => {
    const langs = [...langGroups.keys()].sort((a, b) => {
      if (a === 'en') return -1;
      if (b === 'en') return 1;
      return a.localeCompare(b);
    });
    return langs;
  }, [langGroups]);

  const hasMultipleLangs = languages.length > 1;

  // Set initial active language
  useEffect(() => {
    if (languages.length > 0 && !languages.includes(activeLang)) {
      setActiveLang(languages[0]);
    }
  }, [languages, activeLang]);

  // Images for the active language
  const langImages = useMemo(() => {
    if (!hasMultipleLangs) return allImages;
    return langGroups.get(activeLang) || [];
  }, [hasMultipleLangs, langGroups, activeLang, allImages]);

  // Group by device within the active language
  const deviceGroups = useMemo(() => {
    const groups = new Map<string, ImageEntry[]>();
    for (const img of langImages) {
      const bucket = groups.get(img.device) || [];
      bucket.push(img);
      groups.set(img.device, bucket);
    }
    return groups;
  }, [langImages]);

  const devices = useMemo(() => {
    const order = ['desktop', 'tablet', 'mobile'];
    return [...deviceGroups.keys()].sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [deviceGroups]);

  const hasMultipleDevices = devices.length > 1;

  // Filter by search
  const filterImages = useCallback(
    (images: ImageEntry[]) => {
      if (!searchQuery.trim()) return images;
      const q = searchQuery.toLowerCase();
      return images.filter(
        (img) =>
          img.pageTitle.toLowerCase().includes(q) ||
          img.pathname.toLowerCase().includes(q) ||
          img.pageUrl.toLowerCase().includes(q)
      );
    },
    [searchQuery]
  );

  const currentWidthKey = widthByDevice[activeDevice] || DEVICE_DEFAULT_WIDTH[activeDevice] || '1024';
  const widthOptions = DEVICE_WIDTHS[activeDevice] || DESKTOP_WIDTHS;

  const setDeviceWidth = useCallback((key: string) => {
    setWidthByDevice((prev) => ({ ...prev, [activeDevice]: key }));
  }, [activeDevice]);

  // Open lightbox with the filtered list (not allImages)
  const openLightbox = useCallback((filteredList: ImageEntry[], indexInList: number) => {
    setLightboxImages(filteredList);
    setLightboxIndex(indexInList);
  }, []);

  // Recapture all (whole sitemap)
  const handleCopyAllCapture = useCallback(() => {
    const uploadUrl = typeof window !== 'undefined' ? window.location.origin : 'https://app.activeset.co';
    const urlsForCopy = projectUrls.length > 0 ? projectUrls : fallbackImageUrls;
    const cmd = sitemapUrl
      ? `npx @activeset/capture --sitemap ${sitemapUrl} --project "${escapeCliValue(projectName)}" --upload ${uploadUrl}`
      : buildCaptureCommand(projectName, urlsForCopy);
    navigator.clipboard.writeText(cmd);
    setCopiedAll(true);
    toast.success(
      sitemapUrl
        ? 'Copied full sitemap capture command'
        : `Copied capture command for ${urlsForCopy.length} project URL${urlsForCopy.length === 1 ? '' : 's'}`
    );
    setTimeout(() => setCopiedAll(false), 2000);
  }, [sitemapUrl, projectName, projectUrls, fallbackImageUrls]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading screenshots...
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (allImages.length === 0) {
    return <EmptyState projectName={projectName} projectId={projectId} sitemapUrl={sitemapUrl} links={links} />;
  }

  const renderGrid = (images: ImageEntry[], deviceOverride?: string) => {
    const filtered = filterImages(images);
    if (filtered.length === 0) {
      return (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No screenshots match your search.
        </p>
      );
    }
    const device = deviceOverride || activeDevice;
    const wKey = widthByDevice[device] || DEVICE_DEFAULT_WIDTH[device] || '1024';
    const wOptions = DEVICE_WIDTHS[device] || DESKTOP_WIDTHS;
    const w = wOptions.find((o) => o.key === wKey) || wOptions[0];

    // Group images by folder (first path segment, excluding lang prefix)
    const folderMap = new Map<string, ImageEntry[]>();
    for (const img of filtered) {
      const segments = img.pathname.split('/').filter(Boolean);
      // Skip the language prefix if present
      const startIdx = LANG_PREFIXES.has(segments[0]?.toLowerCase()) ? 1 : 0;
      const remaining = segments.slice(startIdx);
      const folder = remaining.length > 1 ? '/' + remaining[0] : '/';
      const bucket = folderMap.get(folder) || [];
      bucket.push(img);
      folderMap.set(folder, bucket);
    }

    const sortedFolders = [...folderMap.keys()].sort((a, b) => {
      if (a === '/') return -1;
      if (b === '/') return 1;
      return a.localeCompare(b);
    });

    if (sortedFolders.length <= 1) {
      return (
        <div style={{ columns: w.columns, columnGap: '1rem' }}>
          {filtered.map((img, i) => (
            <div key={`${img.device}-${img.pathname}-${i}`} className="mb-4 break-inside-avoid">
              <ImageCard
                image={img}
                maxWidth={w.maxWidth}
                projectName={projectName}
                onClick={() => openLightbox(filtered, i)}
              />
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {sortedFolders.map((folder) => {
          const folderImages = folderMap.get(folder) || [];
          return (
              <FolderGroup
                key={folder}
                folder={folder}
                images={folderImages}
                allImages={filtered}
                columns={w.columns}
                maxWidth={w.maxWidth}
                projectName={projectName}
                onImageClick={(img) => openLightbox(filtered, filtered.indexOf(img))}
              />
          );
        })}
      </div>
    );
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search pages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 text-xs"
            onClick={handleCopyAllCapture}
          >
            {copiedAll ? <Check className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
            {copiedAll ? 'Copied' : 'Recapture All'}
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="secondary">{allImages.length} screenshots</Badge>
          <div className="flex items-center gap-0.5 rounded-lg border p-1">
            <Monitor className="mx-1 h-3.5 w-3.5 text-muted-foreground" />
            {widthOptions.map((w) => (
              <button
                key={w.key}
                onClick={() => setDeviceWidth(w.key)}
                title={w.label}
                className={cn(
                  'h-7 rounded px-2 text-xs font-medium transition-colors',
                  currentWidthKey === w.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Language tabs (main) → Device subtabs */}
      {hasMultipleLangs ? (
        <Tabs value={activeLang} onValueChange={setActiveLang}>
          <TabsList className="mb-4">
            {languages.map((lang) => {
              const count = langGroups.get(lang)?.length || 0;
              return (
                <TabsTrigger key={lang} value={lang} className="gap-1.5">
                  <Globe className="h-3.5 w-3.5" />
                  {lang.toUpperCase()}
                  <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px] font-normal">
                    {count}
                  </Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {languages.map((lang) => (
            <TabsContent key={lang} value={lang}>
              {hasMultipleDevices ? (
                <Tabs defaultValue={devices[0]} onValueChange={setActiveDevice}>
                  <TabsList className="mb-4">
                    {devices.map((device) => {
                      const Icon = DEVICE_ICON[device] || Monitor;
                      const count = deviceGroups.get(device)?.length || 0;
                      return (
                        <TabsTrigger key={device} value={device} className="gap-1.5">
                          <Icon className="h-3.5 w-3.5" />
                          {device.charAt(0).toUpperCase() + device.slice(1)}
                          <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px] font-normal">
                            {count}
                          </Badge>
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>

                  {devices.map((device) => (
                    <TabsContent key={device} value={device}>
                      {renderGrid(deviceGroups.get(device) || [], device)}
                    </TabsContent>
                  ))}
                </Tabs>
              ) : (
                renderGrid(langImages)
              )}
            </TabsContent>
          ))}
        </Tabs>
      ) : hasMultipleDevices ? (
        <Tabs defaultValue={devices[0]} onValueChange={setActiveDevice}>
          <TabsList className="mb-4">
            {devices.map((device) => {
              const Icon = DEVICE_ICON[device] || Monitor;
              const count = deviceGroups.get(device)?.length || 0;
              return (
                <TabsTrigger key={device} value={device} className="gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  {device.charAt(0).toUpperCase() + device.slice(1)}
                  <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px] font-normal">
                    {count}
                  </Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {devices.map((device) => (
            <TabsContent key={device} value={device}>
              {renderGrid(deviceGroups.get(device) || [], device)}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        renderGrid(allImages)
      )}

      {/* Lightbox — uses the filtered list, not allImages */}
      {lightboxIndex !== null && lightboxImages.length > 0 && (
        <Lightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          widthKey={lightboxWidthKey}
          onWidthChange={setLightboxWidthKey}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
