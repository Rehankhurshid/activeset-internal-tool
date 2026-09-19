'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { compactUrl, type FindingPage } from '../../../domain/audit-findings';

/**
 * "On 294 pages" that opens to the list. Shared by the alt and link rows so a
 * template finding reads the same everywhere.
 */
export function FindingPages({ pages, noun = 'page' }: { pages: FindingPage[]; noun?: string }) {
  const [open, setOpen] = useState(false);
  if (pages.length === 0) return null;

  if (pages.length === 1) {
    const page = pages[0];
    return (
      <a
        href={page.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground truncate max-w-full"
        title={page.url}
      >
        <span className="truncate">{compactUrl(page.url)}</span>
        <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
    );
  }

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        on {pages.length} {noun}s
      </button>
      {open && (
        <ul className="mt-1.5 max-h-48 overflow-y-auto space-y-0.5 pl-4 border-l">
          {pages.map((page) => (
            <li key={page.pageId} className="text-xs">
              <a
                href={page.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                title={page.url}
              >
                <span className="truncate max-w-[70vw] sm:max-w-md">{compactUrl(page.url)}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
