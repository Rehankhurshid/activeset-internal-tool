'use client';

import { useMemo, useState } from 'react';
import { EyeOff, Loader2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Project } from '@/types';
import {
  gapFolders,
  liveOriginOf,
  openSitemapGap,
  suggestLiveOrigin,
  titleForSitemapPath,
} from '../../domain/delivery.launch';
import type { ProjectPage } from '../../domain/delivery.types';
import { deliveryRepository } from '../../infrastructure/delivery.repository';

const NONE: string[] = [];

/**
 * Pages on the live sitemap that are not on the tracker (Linear ACT-94). Pages
 * built late, Careers or Contact, never reached the list and so never reached
 * the client. The check reads `<live site>/sitemap.xml` on the server, leaves
 * out CMS items, and is also re-run every night for launched projects by the
 * Webflow sitemap drift cron. Each missing page is one click to add, or to
 * ignore (a folder at once, when several share one).
 */
export function SitemapGapCard({ project, pages }: { project: Project; pages: ProjectPage[] }) {
  const delivery = project.delivery;
  const gap = delivery?.sitemapGap;
  const ignored = delivery?.sitemapIgnore ?? NONE;
  const suggested = suggestLiveOrigin(project);
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // What is still missing now: pages added or ignored since the check drop out.
  const missing = useMemo(() => openSitemapGap(gap, pages, ignored), [gap, pages, ignored]);
  const folders = useMemo(() => gapFolders(missing), [missing]);
  const withLink = Boolean(delivery?.launch);

  const check = async () => {
    const origin = suggested ?? liveOriginOf(domain) ?? undefined;
    if (!origin) return;
    setBusy('check');
    try {
      const next = await deliveryRepository.checkSitemapGap(project.id, suggested ? undefined : origin);
      if (next.error) toast.error(next.error);
      else toast.success(next.missing.length ? `${next.missing.length} not on the tracker` : 'Every page is on the tracker');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The sitemap could not be checked');
    } finally {
      setBusy(null);
    }
  };

  const add = async (entries: { path: string; url: string }[], key: string) => {
    setBusy(key);
    try {
      const { added } = await deliveryRepository.addPagesFromSitemap(
        project.id,
        entries.map((e) => ({ ...e, title: titleForSitemapPath(e.path) })),
        withLink,
      );
      toast.success(`Added ${added} ${added === 1 ? 'page' : 'pages'} to the tracker`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add the pages');
    } finally {
      setBusy(null);
    }
  };

  const ignore = async (patterns: string[], key: string, undo = false) => {
    setBusy(key);
    try {
      await deliveryRepository.setSitemapIgnored(project.id, patterns, !undo);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save that');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Pages on the live sitemap
        </CardTitle>
        <div className="flex items-center gap-2">
          {!suggested && (
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="Live site, e.g. www.example.com"
              className="h-8 w-56 text-xs"
            />
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={check}
            disabled={busy !== null || (!suggested && !liveOriginOf(domain))}
          >
            {busy === 'check' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Check now
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-muted-foreground">
        {!gap ? (
          <p>
            Compare the tracker with {suggested ? new URL(suggested).host : 'the live site'}&apos;s sitemap.xml to find
            pages built late that never made it onto the list.
          </p>
        ) : (
          <p>
            Checked {gap.checkedAt.slice(0, 10)}
            {gap.sitemapUrl && ` against ${gap.sitemapUrl}`}
            {!gap.error && ` · ${gap.sitemapCount} URLs`}
            {gap.cmsSkipped > 0 && ` · ${gap.cmsSkipped} CMS items left out`}
            {ignored.length > 0 && (
              <>
                {' · '}
                {ignored.length} ignored{' '}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => ignore(ignored, 'unignore', true)}
                  disabled={busy !== null}
                >
                  show again
                </button>
              </>
            )}
          </p>
        )}
        {gap?.error && <p className="text-destructive">{gap.error}</p>}

        {gap && !gap.error && missing.length === 0 && <p className="text-foreground">Every page on the sitemap is on the tracker.</p>}

        {missing.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-foreground">
                {missing.length} {missing.length === 1 ? 'page is' : 'pages are'} on the sitemap but not on the tracker
                {withLink && '; added pages get their live link'}.
              </p>
              <Button size="sm" className="h-7 text-xs" onClick={() => add(missing, 'all')} disabled={busy !== null}>
                {busy === 'all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add all {missing.length}
              </Button>
            </div>
            {folders.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {folders.map((folder) => (
                  <Button
                    key={folder.pattern}
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => ignore([folder.pattern], folder.pattern)}
                    disabled={busy !== null}
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                    Ignore {folder.pattern} ({folder.count})
                  </Button>
                ))}
              </div>
            )}
            <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border">
              {missing.map((entry) => (
                <li key={entry.path} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate text-foreground underline-offset-2 hover:underline"
                  >
                    {entry.path}
                  </a>
                  <span className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => add([entry], entry.path)}
                      disabled={busy !== null}
                    >
                      {busy === entry.path ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Add
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground"
                      onClick={() => ignore([entry.path], `ignore:${entry.path}`)}
                      disabled={busy !== null}
                    >
                      Ignore
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
