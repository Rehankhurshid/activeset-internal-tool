'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Monitor,
  Smartphone,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

  // Prevent body scroll while lightbox is open
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
        {/* Navigation arrows */}
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

        {/* The image */}
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
/*  Main viewer                                                        */
/* ------------------------------------------------------------------ */

export default function CaptureViewer({ data }: { data: CaptureRunData }) {
  const [filter, setFilter] = useState<'all' | 'desktop' | 'mobile'>('all');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const filtered =
    filter === 'all'
      ? data.screenshots
      : data.screenshots.filter((s) => s.device === filter);

  const hasDesktop = data.screenshots.some((s) => s.device === 'desktop');
  const hasMobile = data.screenshots.some((s) => s.device === 'mobile');

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
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl px-4 py-6">
        {/* Device filter */}
        {hasDesktop && hasMobile && (
          <div className="mb-6 flex gap-2">
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
          </div>
        )}

        {/* Screenshot grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((screenshot, i) => (
            <Card
              key={`${screenshot.device}-${screenshot.fileName}`}
              className="cursor-pointer overflow-hidden transition-shadow hover:shadow-lg"
              onClick={() => setLightboxIndex(i)}
            >
              <div className="relative aspect-[4/3] bg-muted">
                <img
                  src={screenshot.url}
                  alt={screenshot.fileName}
                  className="h-full w-full object-cover object-top"
                  loading="lazy"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors hover:bg-black/20">
                  <ZoomIn className="h-8 w-8 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </div>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  {screenshot.device === 'mobile' ? (
                    <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="truncate text-xs text-muted-foreground">
                    {screenshot.originalUrl
                      ? (() => {
                          try {
                            return new URL(screenshot.originalUrl).pathname || '/';
                          } catch {
                            return screenshot.fileName;
                          }
                        })()
                      : screenshot.fileName}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

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
