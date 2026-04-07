'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Monitor, Smartphone } from 'lucide-react';
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

export default function CaptureViewer({ data }: { data: CaptureRunData }) {
  const [filter, setFilter] = useState<'all' | 'desktop' | 'mobile'>('all');

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

  // Group screenshots by original URL for side-by-side display
  const grouped = new Map<string, Screenshot[]>();
  for (const screenshot of filtered) {
    const key = screenshot.originalUrl || screenshot.fileName;
    const existing = grouped.get(key) || [];
    existing.push(screenshot);
    grouped.set(key, existing);
  }

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
          {filtered.map((screenshot) => (
            <Card key={`${screenshot.device}-${screenshot.fileName}`} className="overflow-hidden">
              <a
                href={screenshot.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <div className="relative aspect-[4/3] bg-muted">
                  <Image
                    src={screenshot.url}
                    alt={screenshot.fileName}
                    fill
                    className="object-cover object-top"
                    unoptimized
                  />
                </div>
              </a>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  {screenshot.device === 'mobile' ? (
                    <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="truncate text-xs text-muted-foreground">
                    {screenshot.originalUrl
                      ? new URL(screenshot.originalUrl).pathname || '/'
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
    </div>
  );
}
