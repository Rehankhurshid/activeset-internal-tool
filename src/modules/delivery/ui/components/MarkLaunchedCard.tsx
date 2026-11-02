'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Globe, Loader2, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Project } from '@/types';
import { isStagingHost, launchPlan, liveOriginOf, suggestLiveOrigin, type LaunchChange } from '../../domain/delivery.launch';
import type { ProjectPage } from '../../domain/delivery.types';
import { deliveryRepository } from '../../infrastructure/delivery.repository';

/**
 * "Mark launched" (Linear ACT-94). On launch day every page link on the
 * tracker, which is also what the client's "Your pages" opens, still points at
 * staging. This moves them all to the live domain in one write, after showing
 * exactly which links change, and records the launch so it is not run twice
 * by accident: once recorded, the card says when and by whom, and running it
 * again is a deliberate second step.
 */
export function MarkLaunchedCard({
  project,
  pages,
  userEmail,
}: {
  project: Project;
  pages: ProjectPage[];
  userEmail?: string;
}) {
  const launch = project.delivery?.launch;
  const [open, setOpen] = useState(false);
  const [domain, setDomain] = useState('');
  const [includeUnlinked, setIncludeUnlinked] = useState(true);
  const [saving, setSaving] = useState(false);
  // Whether this dialog was opened as "Move links again…", fixed when it opens.
  // Read from the live project instead, a launch someone else finishes while
  // this dialog is open would turn a first launch into an overwrite of theirs;
  // captured here, it hits the repository's already-launched guard instead.
  const [relaunch, setRelaunch] = useState(false);

  const origin = liveOriginOf(domain);
  const plan = useMemo(() => (origin ? launchPlan(pages, origin) : null), [origin, pages]);
  const stagingWarning = origin && isStagingHost(new URL(origin).hostname);
  const changes = plan ? plan.rewrites.length + (includeUnlinked ? plan.unlinked.length : 0) : 0;

  const start = () => {
    setDomain(suggestLiveOrigin(project) ?? '');
    setIncludeUnlinked(true);
    setRelaunch(Boolean(launch));
    setOpen(true);
  };

  const confirm = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const record = await deliveryRepository.markLaunched({
        projectId: project.id,
        plan,
        includeUnlinked,
        keepPrelaunch: new Set(pages.filter((p) => p.prelaunchLink).map((p) => p.id)),
        by: userEmail,
        again: relaunch,
      });
      toast.success(`Marked launched on ${new URL(record.liveOrigin).host}`, {
        description: `${record.rewritten + record.linked} page ${record.rewritten + record.linked === 1 ? 'link' : 'links'} now open the live site.`,
      });
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not mark the site launched');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Go live</CardTitle>
        {launch ? (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={start}>
            Move links again…
          </Button>
        ) : (
          <Button size="sm" className="h-8 text-xs" onClick={start} disabled={pages.length === 0}>
            <Rocket className="h-3.5 w-3.5" />
            Mark launched
          </Button>
        )}
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {launch ? (
          <p>
            <Globe className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
            Launched on <span className="font-medium text-foreground">{new URL(launch.liveOrigin).host}</span>,{' '}
            {launch.launchedAt.slice(0, 10)}
            {launch.launchedBy && ` by ${launch.launchedBy}`}. {launch.rewritten + launch.linked} page{' '}
            {launch.rewritten + launch.linked === 1 ? 'link was' : 'links were'} moved
            {launch.fromHosts.length > 0 && ` off ${launch.fromHosts.join(', ')}`}; the client&apos;s page links open the
            live site.
          </p>
        ) : (
          <p>
            When the site is live, move every page link from staging to the live domain, keeping each path. The
            client&apos;s &ldquo;Your pages&rdquo; opens these links. You see the change before it is made.
          </p>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{relaunch ? 'Move page links to the live site again' : 'Mark the site launched'}</DialogTitle>
            <DialogDescription>
              {relaunch && launch
                ? `Already marked launched on ${launch.launchedAt.slice(0, 10)}. Run this again only to move links added since, or to a different domain.`
                : 'Every page link not on the live domain moves to it with the same path. Nothing else on the pages changes, and the old link is kept.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="live-domain" className="text-xs">
                Live domain
              </Label>
              <Input
                id="live-domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="https://www.example.com"
                autoFocus
              />
              {domain.trim() && !origin && <p className="text-xs text-destructive">That is not a web address.</p>}
              {stagingWarning && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  That looks like a staging address, not the client&apos;s live site.
                </p>
              )}
            </div>

            {plan && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {plan.rewrites.length} {plan.rewrites.length === 1 ? 'link moves' : 'links move'}
                  {plan.fromHosts.length > 0 && ` off ${plan.fromHosts.join(', ')}`}
                  {plan.alreadyLive > 0 && ` · ${plan.alreadyLive} already on the live site`}
                </p>
                <ChangeList changes={plan.rewrites} />

                {plan.unlinked.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox checked={includeUnlinked} onCheckedChange={(v) => setIncludeUnlinked(v === true)} />
                      Also give the {plan.unlinked.length} {plan.unlinked.length === 1 ? 'page' : 'pages'} with no link
                      their live address
                    </label>
                    {includeUnlinked && <ChangeList changes={plan.unlinked} />}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={confirm} disabled={!plan || saving || (relaunch && changes === 0)}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {relaunch
                ? `Move ${changes} ${changes === 1 ? 'link' : 'links'}`
                : changes > 0
                  ? `Move ${changes} ${changes === 1 ? 'link' : 'links'} and mark launched`
                  : 'Mark launched'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ChangeList({ changes }: { changes: LaunchChange[] }) {
  if (changes.length === 0) return null;
  return (
    <ul className="max-h-60 divide-y divide-border overflow-y-auto rounded-md border text-xs">
      {changes.map((change) => (
        <li key={change.pageId} className="grid gap-0.5 px-3 py-1.5">
          <span className="font-medium text-foreground">{change.title}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            {change.from && (
              <>
                <span className="truncate">{change.from}</span>
                <ArrowRight className="h-3 w-3 shrink-0" />
              </>
            )}
            <span className="truncate text-foreground">{change.to}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
