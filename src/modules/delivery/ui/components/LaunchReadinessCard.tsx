'use client';

import { CircleAlert, CircleCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { CheckProgress, LaunchReadiness } from '../../domain/delivery.progress';

/**
 * One verdict, and the reasons behind it.
 *
 * "Ready" is derived — nobody can assert it — so this card never offers a button
 * to declare it. It states what is in the way, in the words the team would use
 * in a call. The site-wide half of that is the project's own launch checklist, so
 * a project with nothing tagged for launch is reported as not set up rather than
 * as a spotless zero out of zero.
 */

interface CounterProps {
  label: string;
  value: string;
  detail?: string;
  tone?: 'default' | 'muted';
}

function Counter({ label, value, detail, tone = 'default' }: CounterProps) {
  return (
    <div className="rounded-md border bg-background/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-lg font-semibold tabular-nums', tone === 'muted' && 'text-muted-foreground')}>
        {value}
      </p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function checkDetail(progress: CheckProgress): string | undefined {
  const parts: string[] = [];
  if (progress.failed > 0) parts.push(`${progress.failed} failing`);
  if (progress.pending > 0) parts.push(`${progress.pending} unanswered`);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

export interface LaunchReadinessCardProps {
  readiness: LaunchReadiness;
  /** Shown so it is obvious which checklist this verdict came from. */
  stackName?: string;
  /** Answers are not attributed in storage yet; this at least says who is answering. */
  userEmail?: string;
  /**
   * No checklist section is tagged `launch` on this project. The counter says so
   * instead of showing 0/0, which reads as finished.
   */
  launchChecklistUntagged?: boolean;
  className?: string;
}

export function LaunchReadinessCard({
  readiness,
  stackName,
  userEmail,
  launchChecklistUntagged = false,
  className,
}: LaunchReadinessCardProps) {
  const { ready, blockers, pages, siteChecks, pageChecks } = readiness;

  return (
    <Card className={cn('gap-0 py-4', className)}>
      <CardContent className="px-4">
        <div className="flex items-start gap-2.5">
          {ready ? (
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          )}
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">
              {ready ? 'Ready to launch' : 'Not ready to launch'}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {ready
                ? 'Every page is built and every pre-launch check passes.'
                : `${blockers.length} ${blockers.length === 1 ? 'thing is' : 'things are'} in the way.`}
              {stackName ? ` ${stackName} build.` : ''}
            </p>
          </div>
        </div>

        {blockers.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {blockers.map((blocker) => (
              <li key={blocker} className="flex gap-2 text-foreground">
                <span aria-hidden className="text-muted-foreground">
                  •
                </span>
                <span>{blocker}.</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Counter
            label="Pages built"
            value={`${pages.done}/${pages.total}`}
            detail={pages.blocked > 0 ? `${pages.blocked} blocked` : undefined}
          />
          <Counter
            label="Launch checklist"
            value={launchChecklistUntagged ? '—' : `${siteChecks.passed}/${siteChecks.applicable}`}
            detail={
              launchChecklistUntagged
                ? 'No section tagged for launch yet'
                : checkDetail(siteChecks)
            }
            tone={launchChecklistUntagged ? 'muted' : 'default'}
          />
          <Counter
            label="Page checks"
            value={`${pageChecks.passed}/${pageChecks.applicable}`}
            detail={checkDetail(pageChecks)}
          />
        </div>

        {userEmail && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            You are answering as {userEmail}. Answers are shared with the whole team.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
