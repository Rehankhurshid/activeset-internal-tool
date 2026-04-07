'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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

const LANG_CODES = new Set([
  'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'ko', 'zh',
  'ar', 'hi', 'tr', 'pl', 'sv', 'da', 'no', 'fi', 'cs', 'hu', 'ro',
  'bg', 'hr', 'sk', 'sl', 'uk', 'he', 'th', 'vi', 'id', 'ms', 'tl',
  'en-us', 'en-gb', 'en-au', 'es-mx', 'es-ar', 'pt-br', 'zh-cn', 'zh-tw',
  'fr-ca', 'fr-fr', 'de-de', 'de-at', 'de-ch',
]);

function getPathname(s: Screenshot): string {
  if (!s.originalUrl) return '/';
  try {
    return new URL(s.originalUrl).pathname || '/';
  } catch {
    return '/';
  }
}

function getLangLabel(code: string): string {
  const labels: Record<string, string> = {
    en: 'English', es: 'Espa\u00f1ol', fr: 'Fran\u00e7ais', de: 'Deutsch',
    it: 'Italiano', pt: 'Portugu\u00eas', nl: 'Nederlands', ru: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439',
    ja: '\u65e5\u672c\u8a9e', ko: '\ud55c\uad6d\uc5b4', zh: '\u4e2d\u6587', ar: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629',
    hi: '\u0939\u093f\u0928\u094d\u0926\u0940', tr: 'T\u00fcrk\u00e7e',
    'pt-br': 'Portugu\u00eas (BR)', 'zh-cn': '\u4e2d\u6587 (CN)',
    'es-mx': 'Espa\u00f1ol (MX)', 'fr-ca': 'Fran\u00e7ais (CA)',
    'en-us': 'English (US)', 'en-gb': 'English (UK)',
  };
  return labels[code] || code.toUpperCase();
}

interface TabGroup {
  key: string;
  label: string;
  icon: 'lang' | 'section';
  screenshots: Screenshot[];
  subtabs: SubtabGroup[];
}

interface SubtabGroup {
  key: string;
  label: string;
  icon?: typeof Monitor;
  screenshots: Screenshot[];
}

const DEVICE_META: Record<string, { label: string; icon: typeof Monitor }> = {
  desktop: { label: 'Desktop', icon: Monitor },
  tablet: { label: 'Tablet', icon: Monitor },
  mobile: { label: 'Mobile', icon: Smartphone },
};

function buildDeviceSubtabs(screenshots: Screenshot[]): SubtabGroup[] {
  const deviceMap = new Map<string, Screenshot[]>();
  for (const s of screenshots) {
    const key = s.device || 'desktop';
    const bucket = deviceMap.get(key) || [];
    bucket.push(s);
    deviceMap.set(key, bucket);
  }

  const devices = [...deviceMap.keys()];
  // If only one device type, no need for subtabs
  if (devices.length <= 1) {
    return [{ key: 'all', label: 'All', screenshots }];
  }

  const subtabs: SubtabGroup[] = [
    { key: 'all', label: 'All', screenshots },
  ];

  // Order: desktop, tablet, mobile, then any others
  const order = ['desktop', 'tablet', 'mobile'];
  const sorted = devices.sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  for (const device of sorted) {
    const meta = DEVICE_META[device] || { label: device.charAt(0).toUpperCase() + device.slice(1), icon: Monitor };
    subtabs.push({
      key: device,
      label: meta.label,
      icon: meta.icon,
      screenshots: deviceMap.get(device)!,
    });
  }

  return subtabs;
}

function buildTabStructure(screenshots: Screenshot[]): TabGroup[] {
  // Step 1: Separate by language prefix
  const langBuckets = new Map<string, Screenshot[]>();
  const noLangBucket: Screenshot[] = [];

  for (const s of screenshots) {
    const pathname = getPathname(s);
    const segments = pathname.split('/').filter(Boolean);
    const first = segments[0]?.toLowerCase();

    if (first && LANG_CODES.has(first)) {
      const bucket = langBuckets.get(first) || [];
      bucket.push(s);
      langBuckets.set(first, bucket);
    } else {
      noLangBucket.push(s);
    }
  }

  const hasLangs = langBuckets.size > 0;

  // If no language structure, single tab with device subtabs
  if (!hasLangs) {
    return [{
      key: 'all',
      label: 'All Pages',
      icon: 'section',
      screenshots,
      subtabs: buildDeviceSubtabs(screenshots),
    }];
  }

  const tabs: TabGroup[] = [];

  // Add language tabs with device subtabs
  const sortedLangs = [...langBuckets.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [code, items] of sortedLangs) {
    tabs.push({
      key: `lang-${code}`,
      label: getLangLabel(code),
      icon: 'lang',
      screenshots: items,
      subtabs: buildDeviceSubtabs(items),
    });
  }

  // Add non-language pages if any
  if (noLangBucket.length > 0) {
    tabs.push({
      key: 'other',
      label: 'Other',
      icon: 'section',
      screenshots: noLangBucket,
      subtabs: buildDeviceSubtabs(noLangBucket),
    });
  }

  return tabs;
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const current = screenshots[index];
  const hasPrev = index > 0;
  const hasNext = index < screenshots.length - 1;

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

  const pageLabel = current.originalUrl
    ? (() => { try { return new URL(current.originalUrl).pathname || '/'; } catch { return current.fileName; } })()
    : current.fileName;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3 text-sm text-white/80">
          {current.device === 'mobile' ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
          <span className="max-w-[300px] truncate font-mono text-xs sm:max-w-none">{pageLabel}</span>
          <span className="text-white/40">{index + 1} / {screenshots.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setZoom((z) => Math.max(z - 0.5, 0.5))} title="Zoom out (-)">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-xs text-white/50">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setZoom((z) => Math.min(z + 0.5, 5))} title="Zoom in (+)">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="mx-2 h-4 w-px bg-white/20" />
          <a href={current.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white" title="Open original">
            <ExternalLink className="h-4 w-4" />
          </a>
          <a href={current.url} download={current.fileName} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white" title="Download">
            <Download className="h-4 w-4" />
          </a>
          <div className="mx-2 h-4 w-px bg-white/20" />
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-white/70 hover:bg-white/10 hover:text-white" onClick={onClose} title="Close (Esc)">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="relative flex flex-1 overflow-hidden">
        {hasPrev && (
          <button onClick={() => goTo(index - 1)} className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/80 transition-colors hover:bg-black/70 hover:text-white sm:left-4">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {hasNext && (
          <button onClick={() => goTo(index + 1)} className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/80 transition-colors hover:bg-black/70 hover:text-white sm:right-4">
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <img
            src={current.url} alt={current.fileName} draggable={false}
            className="w-full select-none"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
          />
        </div>
      </div>

      {screenshots.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto border-t border-white/10 px-4 py-2">
          {screenshots.map((s, i) => (
            <button
              key={`${s.device}-${s.fileName}`} onClick={() => goTo(i)}
              className={cn(
                'relative h-12 w-16 flex-shrink-0 overflow-hidden rounded border-2 transition-all',
                i === index ? 'border-white' : 'border-transparent opacity-50 hover:opacity-80'
              )}
            >
              <img src={s.url} alt={s.fileName} className="h-full w-full object-cover object-top" />
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
  screenshot, height, onClick,
}: {
  screenshot: Screenshot; height: string; onClick: () => void;
}) {
  const pathname = getPathname(screenshot);

  return (
    <Card className="group cursor-pointer overflow-hidden transition-shadow hover:shadow-lg" onClick={onClick}>
      <div className={cn('relative overflow-hidden bg-muted', height)}>
        <img src={screenshot.url} alt={screenshot.fileName} className="w-full object-cover object-top" loading="lazy" />
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
          <span className="truncate text-xs text-muted-foreground">{pathname}</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Screenshot grid                                                    */
/* ------------------------------------------------------------------ */

function ScreenshotGrid({
  screenshots,
  allScreenshots,
  previewSize,
  onOpenLightbox,
}: {
  screenshots: Screenshot[];
  allScreenshots: Screenshot[];
  previewSize: typeof PREVIEW_SIZES[number];
  onOpenLightbox: (index: number) => void;
}) {
  return (
    <div className={cn('grid gap-4', previewSize.cols)}>
      {screenshots.map((s) => {
        const flatIdx = allScreenshots.indexOf(s);
        return (
          <ScreenshotCard
            key={`${s.device}-${s.fileName}`}
            screenshot={s}
            height={previewSize.height}
            onClick={() => onOpenLightbox(flatIdx >= 0 ? flatIdx : 0)}
          />
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main viewer                                                        */
/* ------------------------------------------------------------------ */

export default function CaptureViewer({ data }: { data: CaptureRunData }) {
  const [previewSizeKey, setPreviewSizeKey] = useState<PreviewSize>('full');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const tabs = useMemo(() => buildTabStructure(data.screenshots), [data.screenshots]);
  const hasMultipleTabs = tabs.length > 1;
  const previewSize = PREVIEW_SIZES.find((p) => p.key === previewSizeKey) || PREVIEW_SIZES[3];

  const createdDate = new Date(data.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto max-w-6xl px-4 py-6">
          <h1 className="text-2xl font-semibold tracking-tight">{data.projectName}</h1>
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
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl px-4 py-6">
        {/* Toolbar */}
        <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
          {/* Preview size */}
          <div className="flex items-center gap-1 rounded-lg border p-1">
            {PREVIEW_SIZES.map((size) => {
              const Icon = size.icon;
              return (
                <button
                  key={size.key} onClick={() => setPreviewSizeKey(size.key)} title={size.label}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded transition-colors',
                    previewSizeKey === size.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        {hasMultipleTabs ? (
          <Tabs defaultValue={tabs[0].key}>
            {/* Top-level tabs (languages) */}
            <TabsList className="mb-6">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.key} value={tab.key} className="gap-1.5">
                  {tab.icon === 'lang' && <Globe className="h-3.5 w-3.5" />}
                  {tab.label}
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px] font-normal">
                    {tab.screenshots.length}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>

            {tabs.map((tab) => (
              <TabsContent key={tab.key} value={tab.key}>
                {tab.subtabs.length > 1 ? (
                  <Tabs defaultValue={tab.subtabs[0].key}>
                    {/* Subtabs (sections within language) */}
                    <TabsList className="mb-4">
                      {tab.subtabs.map((sub) => (
                        <TabsTrigger key={sub.key} value={sub.key} className="gap-1.5 text-xs">
                          {sub.icon && (() => { const Icon = sub.icon; return <Icon className="h-3.5 w-3.5" />; })()}
                          {sub.label}
                          <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px] font-normal">
                            {sub.screenshots.length}
                          </Badge>
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {tab.subtabs.map((sub) => (
                      <TabsContent key={sub.key} value={sub.key}>
                        <ScreenshotGrid
                          screenshots={sub.screenshots}
                          allScreenshots={data.screenshots}
                          previewSize={previewSize}
                          onOpenLightbox={setLightboxIndex}
                        />
                      </TabsContent>
                    ))}
                  </Tabs>
                ) : (
                  <ScreenshotGrid
                    screenshots={tab.screenshots}
                    allScreenshots={data.screenshots}
                    previewSize={previewSize}
                    onOpenLightbox={setLightboxIndex}
                  />
                )}
              </TabsContent>
            ))}
          </Tabs>
        ) : tabs[0]?.subtabs.length > 1 ? (
          /* Single language but multiple sections — show subtabs only */
          <Tabs defaultValue={tabs[0].subtabs[0].key}>
            <TabsList className="mb-4">
              {tabs[0].subtabs.map((sub) => (
                <TabsTrigger key={sub.key} value={sub.key} className="gap-1.5">
                  {sub.icon && (() => { const Icon = sub.icon; return <Icon className="h-3.5 w-3.5" />; })()}
                  {sub.label}
                  <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-[10px] font-normal">
                    {sub.screenshots.length}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>

            {tabs[0].subtabs.map((sub) => (
              <TabsContent key={sub.key} value={sub.key}>
                <ScreenshotGrid
                  screenshots={sub.screenshots}
                  allScreenshots={data.screenshots}
                  previewSize={previewSize}
                  onOpenLightbox={setLightboxIndex}
                />
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          /* Flat — no meaningful groups */
          <ScreenshotGrid
            screenshots={data.screenshots}
            allScreenshots={data.screenshots}
            previewSize={previewSize}
            onOpenLightbox={setLightboxIndex}
          />
        )}

        {data.screenshots.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No screenshots available.
          </p>
        )}
      </main>

      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        Captured with{' '}
        <a href="https://www.npmjs.com/package/@activeset/capture" target="_blank" rel="noopener noreferrer" className="underline">
          @activeset/capture
        </a>
      </footer>

      {lightboxIndex !== null && (
        <Lightbox screenshots={data.screenshots} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </div>
  );
}
