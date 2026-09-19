'use client';

import { ArrowRight, ImageIcon, LinkIcon, ShieldQuestion } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  fileNameOf,
  isLikelyDecorative,
  SHARED_ACROSS_PAGES_AT,
  type PageFindings,
} from '../../../domain/audit-findings';
import type { FixTarget } from './AuditHeader';

/**
 * "Fixes on this page", for the row sheet. Someone reviewing one page sees the
 * same findings the other tabs show and where to go to clear them, so the page
 * can be finished without leaving the review.
 */
export function PageFixes({ findings, onOpenTab }: { findings: PageFindings; onOpenTab: (target: FixTarget) => void }) {
  const alt = findings.alt.filter((f) => !isLikelyDecorative(f));
  const total = alt.length + findings.links.length;

  if (total === 0 && findings.unverifiable.length === 0) {
    return (
      <div className="rounded-md border p-3">
        <p className="text-xs text-muted-foreground">Fixes on this page</p>
        <p className="text-sm mt-1">Nothing open. Every image is described and every link resolves.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Fixes on this page</p>
        <Badge variant="secondary" className="h-5 px-1.5 text-[11px] tabular-nums">{total}</Badge>
      </div>

      {alt.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <ImageIcon className="h-3.5 w-3.5" />
            {alt.length} image{alt.length === 1 ? '' : 's'} need alt text
          </div>
          <ul className="space-y-1">
            {alt.slice(0, 6).map((f) => (
              <li key={f.fingerprint} className="flex items-center gap-2 text-xs">
                <span className="font-mono truncate">{fileNameOf(f.src)}</span>
                {f.pages.length >= SHARED_ACROSS_PAGES_AT && (
                  <span className="text-muted-foreground shrink-0">shared · {f.pages.length} pages</span>
                )}
                {f.state === 'regressed' && <span className="text-red-600 dark:text-red-400 shrink-0">regressed</span>}
              </li>
            ))}
            {alt.length > 6 && <li className="text-xs text-muted-foreground">and {alt.length - 6} more</li>}
          </ul>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onOpenTab('alt')}>
            Fix in Alt text
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      )}

      {findings.links.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <LinkIcon className="h-3.5 w-3.5" />
            {findings.links.length} dead link{findings.links.length === 1 ? '' : 's'}
          </div>
          <ul className="space-y-1">
            {findings.links.slice(0, 6).map((f) => (
              <li key={f.fingerprint} className="flex items-center gap-2 text-xs">
                <Badge variant="destructive" className="h-4 px-1 text-[10px] tabular-nums shrink-0">{f.status || 'x'}</Badge>
                <span className="font-mono truncate">{f.href}</span>
                {f.pages.length >= SHARED_ACROSS_PAGES_AT && (
                  <span className="text-muted-foreground shrink-0">{f.pages.length} pages</span>
                )}
              </li>
            ))}
            {findings.links.length > 6 && <li className="text-xs text-muted-foreground">and {findings.links.length - 6} more</li>}
          </ul>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onOpenTab('links')}>
            Decide in Links
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      )}

      {findings.unverifiable.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <ShieldQuestion className="h-3.5 w-3.5" />
          {findings.unverifiable.length} link{findings.unverifiable.length === 1 ? '' : 's'} could not be verified
        </p>
      )}
    </div>
  );
}
