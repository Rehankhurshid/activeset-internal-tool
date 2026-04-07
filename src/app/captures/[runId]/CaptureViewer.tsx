'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FolderOpen,
  Globe,
  Grid2x2,
  Grid3x3,
  Monitor,
  Rows3,
  Smartphone,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Screenshot {
  device: string;
  fileName: string;
  url: string;
  originalUrl: string;
}

interface CaptureRunData {
  runId: string;
  projectName: string;
  createdAt: string;
  screenshotCount: number;
  screenshots: Screenshot[];
  summary: {
    totalUrls?: number;
    successfulUrls?: number;
    failedUrls?: number;
    totalDurationMs?: number;
  };
  settings: {
    devices?: string[];
    format?: string;
  };
}

/* ------------------------------------------------------------------ */
/*  Smart grouping                                                     */
/* ------------------------------------------------------------------ */

// Common language codes (ISO 639-1) used as URL path prefixes
const LANG_CODES = new Set([
  'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'ko', 'zh',
  'ar', 'hi', 'tr', 'pl', 'sv', 'da', 'no', 'fi', 'cs', 'hu', 'ro',
  'bg', 'hr', 'sk', 'sl', 'uk', 'he', 'th', 'vi', 'id', 'ms', 'tl',
  'en-us', 'en-gb', 'en-au', 'es-mx', 'es-ar', 'pt-br', 'zh-cn', 'zh-tw',
  'fr-ca', 'fr-fr', 'de-de', 'de-at', 'de-ch',
]);

interface ScreenshotGroup {
  key: string;
  label: string;
  type: 'language' | 'section' | 'root';
  screenshots: Screenshot[];
  flatIndex: number; // starting index in the flat filtered list
}

function getPathname(s: Screenshot): string {
  if (!s.originalUrl) return '/';
  try {
    return new URL(s.originalUrl).pathname || '/';
  } catch {
    return '/';
  }
}

function detectGroups(screenshots: Screenshot[]): ScreenshotGroup[] {
  // Analyze all paths to find grouping patterns
  const pathMap = new Map<string, Screenshot[]>();

  for (const s of screenshots) {
    const pathname = getPathname(s);
    const segments = pathname.split('/').filter(Boolean);

    // Check if first segment is a language code
    const firstSeg = segments[0]?.toLowerCase();
    if (firstSeg && LANG_CODES.has(firstSeg)) {
      const langKey = `lang:${firstSeg}`;
      const existing = pathMap.get(langKey) || [];
      existing.push(s);
      pathMap.set(langKey, existing);
      continue;
    }

    // Group by first path segment (section)
    if (segments.length > 1) {
      const sectionKey = `section:${segments[0]}`;
      const existing = pathMap.get(sectionKey) || [];
      existing.push(s);
      pathMap.set(sectionKey, existing);
      continue;
    }

    // Root-level pages
    const rootKey = 'root';
    const existing = pathMap.get(rootKey) || [];
    existing.push(s);
    pathMap.set(rootKey, existing);
  }

  // Only use grouping if there are multiple groups (otherwise it's noise)
  if (pathMap.size <= 1) {
    return [{
      key: 'all',
      label: 'All Pages',
      type: 'root',
      screenshots,
      flatIndex: 0,
    }];
  }

  const groups: ScreenshotGroup[] = [];
  let flatIndex = 0;

  // Sort: languages first, then sections, then root
  const sortedKeys = [...pathMap.keys()].sort((a, b) => {
    const order = (k: string) => k === 'root' ? 2 : k.startsWith('lang:') ? 0 : 1;
    return order(a) - order(b);
  });

  for (const key of sortedKeys) {
    const items = pathMap.get(key)!;

    let label: string;
    let type: 'language' | 'section' | 'root';

    if (key.startsWith('lang:')) {
      const code = key.replace('lang:', '');
      label = getLangLabel(code);
      type = 'language';
    } else if (key.startsWith('section:')) {
      label = '/' + key.replace('section:', '');
      type = 'section';
    } else {
      label = 'Home & Top-level';
      type = 'root';
    }

    groups.push({ key, label, type, screenshots: items, flatIndex });
    flatIndex += items.length;
  }

  return groups;
}

function getLangLabel(code: string): string {
  const labels: Record<string, string> = {
    en: 'English', es: 'Spanish', fr: 'French', de: 'German',
    it: 'Italian', pt: 'Portuguese', nl: 'Dutch', ru: 'Russian',
    ja: 'Japanese', ko: 'Korean', zh: 'Chinese', ar: 'Arabic',
    hi: 'Hindi', tr: 'Turkish', pl: 'Polish', sv: 'Swedish',
    'pt-br': 'Portuguese (BR)', 'zh-cn': 'Chinese (Simplified)',
    'zh-tw': 'Chinese (Traditional)', 'es-mx': 'Spanish (MX)',
    'fr-ca': 'French (CA)', 'en-us': 'English (US)', 'en-gb': 'English (UK)',
  };
  return labels[code] || code.toUpperCase();
}

/* ------------------------------------------------------------------ */
/*  Preview size                                                       */
/* ------------------------------------------------------------------ */

type PreviewSize = 'compact' | 'medium' | 'large' | 'full';

const PREVIEW_SIZES: { key: PreviewSize; label: string; icon: typeof Grid3x3; cols: string; height: string }[] = [
  { key: 'compact', label: 'Compact', icon: Grid3x3, cols: 'sm:grid-cols-3 lg:grid-cols-4', height: 'h-36' },
  { key: 'medium', label: 'Medium', icon: Grid2x2, cols: 'sm:grid-cols-2 lg:grid-cols-3', height: 'h-48' },
  { key: 'large', label: 'Large', icon: Grid2x2, cols: 'sm:grid-cols-2', height: 'h-64' },
  { key: 'full', label: 'Full width', icon: Rows3, cols: 'grid-cols-1', height: 'h-80' },
];

/* ------------------------------------------------------------------ */
/*  Lightbox                                                           */
/* ------------------------------------------------------------------ */

function Lightbox({
  screenshots,
  initialIndex,
  onClose,
}: {
  screenshots: Screenshot[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const current = screenshots[index];
  const hasPrev = index > 0;
  const hasNext = index < screenshots.length - 1;

  const resetView = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const goTo = useCallback(
    (i: number) => {
      setIndex(i);
      resetView();
    },
    [resetView]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) goTo(index - 1);
      if (e.key === 'ArrowRight' && hasNext) goTo(index + 1);
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(z + 0.5, 5));
      if (e.key === '-') setZoom((z) => Math.max(z - 0.5, 0.5));
      if (e.key === '0') resetView();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, hasPrev, hasNext, onClose, goTo, resetView]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.25 : 0.25;
    setZoom((z) => Math.min(Math.max(z + delta, 0.5), 5));
  };

  const pageLabel = current.originalUrl
    ? (() => {
        try {
          return new URL(current.originalUrl).pathname || '/';
        } catch {
          return current.fileName;
        }
      })()
    : current.fileName;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3 text-sm text-white/80">
          {current.device === 'mobile' ? (
            <Smartphone className="h-4 w-4" />
          ) : (
            <Monitor className="h-4 w-4" />
          )}
          <span className="max-w-[300px] truncate font-mono text-xs sm:max-w-none">
            {pageLabel}
          </span>
          <span className="text-white/40">
            {index + 1} / {screenshots.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-white/70 hover:bg-white/10 hover:text-white"
            onClick={() => setZoom((z) => Math.max(z - 0.5, 0.5))}
            title="Zoom out (-)"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-xs text-white/50">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-white/70 hover:bg-white/10 hover:text-white"
            onClick={() => setZoom((z) => Math.min(z + 0.5, 5))}
            title="Zoom in (+)"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="mx-2 h-4 w-px bg-white/20" />
          <a
            href={current.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
            title="Open original"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <a
            href={current.url}
            download={current.fileName}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </a>
          <div className="mx-2 h-4 w-px bg-white/20" />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-white/70 hover:bg-white/10 hover:text-white"
            onClick={onClose}
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Image area */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {hasPrev && (
          <button
            onClick={() => goTo(index - 1)}
            className="absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white/80 transition-colors hover:bg-black/70 hover:text-white sm:left-4"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {hasNext && (
          <button
            onClick={() => goTo(index + 1)}
            className="absolute right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white/80 transition-colors hover:bg-black/70 hover:text-white sm:right-4"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        <img
          src={current.url}
          alt={current.fileName}
          draggable={false}
          className="max-h-full max-w-full select-none transition-transform duration-150"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
          }}
        />
      </div>

      {/* Thumbnail strip */}
      {screenshots.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto border-t border-white/10 px-4 py-2">
          {screenshots.map((s, i) => (
            <button
              key={`${s.device}-${s.fileName}`}
              onClick={() => goTo(i)}
              className={cn(
                'relative h-12 w-16 flex-shrink-0 overflow-hidden rounded border-2 transition-all',
                i === index
                  ? 'border-white'
                  : 'border-transparent opacity-50 hover:opacity-80'
              )}
            >
              <img
                src={s.url}
                alt={s.fileName}
                className="h-full w-full object-cover object-top"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Screenshot card                                                    */
/* ------------------------------------------------------------------ */

function ScreenshotCard({
  screenshot,
  height,
  onClick,
}: {
  screenshot: Screenshot;
  height: string;
  onClick: () => void;
}) {
  const pathname = getPathname(screenshot);

  return (
    <Card
      className="group cursor-pointer overflow-hidden transition-shadow hover:shadow-lg"
      onClick={onClick}
    >
      <div className={cn('relative overflow-hidden bg-muted', height)}>
        <img
          src={screenshot.url}
          alt={screenshot.fileName}
          className="w-full object-cover object-top"
          loading="lazy"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
          <ZoomIn className="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          {screenshot.device === 'mobile' ? (
            <Smartphone className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          ) : (
            <Monitor className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-xs text-muted-foreground">
            {pathname}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Group section                                                      */
/* ------------------------------------------------------------------ */

function GroupSection({
  group,
  previewSize,
  allFiltered,
  onOpenLightbox,
  defaultOpen,
}: {
  group: ScreenshotGroup;
  previewSize: typeof PREVIEW_SIZES[number];
  allFiltered: Screenshot[];
  onOpenLightbox: (flatIndex: number) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const icon = group.type === 'language' ? (
    <Globe className="h-4 w-4 text-muted-foreground" />
  ) : (
    <FolderOpen className="h-4 w-4 text-muted-foreground" />
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="mb-3 flex w-full items-center gap-2 text-left"
      >
        {icon}
        <span className="text-sm font-medium">{group.label}</span>
        <Badge variant="secondary" className="text-xs font-normal">
          {group.screenshots.length}
        </Badge>
        <ChevronDown
          className={cn(
            'ml-auto h-4 w-4 text-muted-foreground transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>
      {open && (
        <div className={cn('grid gap-4', previewSize.cols)}>
          {group.screenshots.map((screenshot, i) => (
            <ScreenshotCard
              key={`${screenshot.device}-${screenshot.fileName}`}
              screenshot={screenshot}
              height={previewSize.height}
              onClick={() => {
                // Find the flat index of this screenshot in the full filtered list
                const flatIdx = allFiltered.indexOf(screenshot);
                onOpenLightbox(flatIdx >= 0 ? flatIdx : group.flatIndex + i);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main viewer                                                        */
/* ------------------------------------------------------------------ */

export default function CaptureViewer({ data }: { data: CaptureRunData }) {
  const [filter, setFilter] = useState<'all' | 'desktop' | 'mobile'>('all');
  const [previewSizeKey, setPreviewSizeKey] = useState<PreviewSize>('medium');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const filtered = useMemo(
    () =>
      filter === 'all'
        ? data.screenshots
        : data.screenshots.filter((s) => s.device === filter),
    [data.screenshots, filter]
  );

  const groups = useMemo(() => detectGroups(filtered), [filtered]);
  const hasMultipleGroups = groups.length > 1 || groups[0]?.key !== 'all';

  const hasDesktop = data.screenshots.some((s) => s.device === 'desktop');
  const hasMobile = data.screenshots.some((s) => s.device === 'mobile');

  const previewSize = PREVIEW_SIZES.find((p) => p.key === previewSizeKey) || PREVIEW_SIZES[1];

  const createdDate = new Date(data.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto max-w-6xl px-4 py-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            {data.projectName}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>{data.screenshotCount} screenshots</span>
            <span>&middot;</span>
            <span>{createdDate}</span>
            {data.summary.totalDurationMs && (
              <>
                <span>&middot;</span>
                <span>{(data.summary.totalDurationMs / 1000).toFixed(1)}s</span>
              </>
            )}
            {hasMultipleGroups && (
              <>
                <span>&middot;</span>
                <span>{groups.length} groups</span>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl px-4 py-6">
        {/* Toolbar: device filter + preview size */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {hasDesktop && hasMobile && (
              <>
                <Button
                  size="sm"
                  variant={filter === 'all' ? 'default' : 'outline'}
                  onClick={() => setFilter('all')}
                >
                  All
                </Button>
                <Button
                  size="sm"
                  variant={filter === 'desktop' ? 'default' : 'outline'}
                  onClick={() => setFilter('desktop')}
                >
                  <Monitor className="mr-1.5 h-3.5 w-3.5" />
                  Desktop
                </Button>
                <Button
                  size="sm"
                  variant={filter === 'mobile' ? 'default' : 'outline'}
                  onClick={() => setFilter('mobile')}
                >
                  <Smartphone className="mr-1.5 h-3.5 w-3.5" />
                  Mobile
                </Button>
              </>
            )}
          </div>

          {/* Preview size selector */}
          <div className="flex items-center gap-1 rounded-lg border p-1">
            {PREVIEW_SIZES.map((size) => {
              const Icon = size.icon;
              return (
                <button
                  key={size.key}
                  onClick={() => setPreviewSizeKey(size.key)}
                  title={size.label}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded transition-colors',
                    previewSizeKey === size.key
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Content: grouped or flat */}
        {hasMultipleGroups ? (
          <div className="space-y-8">
            {groups.map((group, gi) => (
              <GroupSection
                key={group.key}
                group={group}
                previewSize={previewSize}
                allFiltered={filtered}
                onOpenLightbox={setLightboxIndex}
                defaultOpen={gi < 3}
              />
            ))}
          </div>
        ) : (
          <div className={cn('grid gap-4', previewSize.cols)}>
            {filtered.map((screenshot, i) => (
              <ScreenshotCard
                key={`${screenshot.device}-${screenshot.fileName}`}
                screenshot={screenshot}
                height={previewSize.height}
                onClick={() => setLightboxIndex(i)}
              />
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No screenshots for this filter.
          </p>
        )}
      </main>

      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        Captured with{' '}
        <a
          href="https://www.npmjs.com/package/@activeset/capture"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          @activeset/capture
        </a>
      </footer>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          screenshots={filtered}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
