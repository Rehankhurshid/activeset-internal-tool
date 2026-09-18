'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { resolveCheck } from '../../domain/delivery.progress';
import type { CheckStatus, StackCheck, StackDefinition } from '../../domain/delivery.types';
import { CheckStatusControl } from './CheckStatusControl';

/**
 * The site-wide half of the launch checklist: the questions asked once, not once
 * per page. Groups and order come from the stack definition, so a different
 * stack reorders this without touching the component.
 *
 * Nothing here is answered from scan data. `buildLaunchReadiness` resolves
 * site-scoped checks with no audit — a site-wide question like "text free of
 * spelling errors" is not something a single page's scan can settle — so where
 * the scan has something useful to say it is shown as a hint beside the check
 * and the answer stays with a person.
 */

interface CheckGroup {
  name: string;
  checks: StackCheck[];
}

function groupChecks(checks: StackCheck[]): CheckGroup[] {
  const groups: CheckGroup[] = [];
  for (const check of checks) {
    const existing = groups.find((g) => g.name === check.group);
    if (existing) existing.checks.push(check);
    else groups.push({ name: check.group, checks: [check] });
  }
  return groups;
}

function countGroup(
  checks: StackCheck[],
  answers: Record<string, CheckStatus>,
): { passed: number; applicable: number; failed: number } {
  let passed = 0;
  let applicable = 0;
  let failed = 0;
  for (const check of checks) {
    const { status } = resolveCheck(check, answers[check.id], undefined);
    if (status === 'not_required') continue;
    applicable += 1;
    if (status === 'passed') passed += 1;
    else if (status === 'failed') failed += 1;
  }
  return { passed, applicable, failed };
}

interface CheckRowProps {
  check: StackCheck;
  answer: CheckStatus | undefined;
  hint?: string;
  onChange: (status: CheckStatus) => void;
  disabled?: boolean;
}

function CheckRow({ check, answer, hint, onChange, disabled }: CheckRowProps) {
  const { status, source } = resolveCheck(check, answer, undefined);
  const excluded = status === 'not_required';

  return (
    <div className="flex items-start justify-between gap-3 border-t px-3 py-2 first:border-t-0">
      <div className="min-w-0 pt-1">
        <p className={cn('text-sm leading-snug', excluded && 'text-muted-foreground line-through decoration-muted-foreground/50')}>
          {check.title}
        </p>
        {check.note && <p className="mt-0.5 text-xs text-muted-foreground">{check.note}</p>}
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <CheckStatusControl
        className="shrink-0"
        label={check.title}
        value={status}
        source={source}
        autoCheck={check.auto}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

interface GroupBlockProps {
  group: CheckGroup;
  answers: Record<string, CheckStatus>;
  hints?: Record<string, string>;
  onChange: (checkId: string, status: CheckStatus) => void;
  disabled?: boolean;
}

function GroupBlock({ group, answers, hints, onChange, disabled }: GroupBlockProps) {
  const counts = countGroup(group.checks, answers);
  return (
    <section className="rounded-md border">
      <header className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {group.name}
        </h3>
        <p className="text-xs tabular-nums text-muted-foreground">
          {counts.passed} of {counts.applicable}
          {counts.failed > 0 && <span className="ml-2 text-rose-600 dark:text-rose-300">{counts.failed} failing</span>}
        </p>
      </header>
      <div>
        {group.checks.map((check) => (
          <CheckRow
            key={check.id}
            check={check}
            answer={answers[check.id]}
            hint={hints?.[check.id]}
            onChange={(status) => onChange(check.id, status)}
            disabled={disabled}
          />
        ))}
      </div>
    </section>
  );
}

export interface SiteChecklistProps {
  stack: StackDefinition;
  /** Check id → the team's answer, already merged with anything in flight. */
  answers: Record<string, CheckStatus>;
  onChange: (checkId: string, status: CheckStatus) => void;
  /** Optional muted line under a check, e.g. what the last page scans suggest. */
  hints?: Record<string, string>;
  disabled?: boolean;
  className?: string;
}

export function SiteChecklist({
  stack,
  answers,
  onChange,
  hints,
  disabled,
  className,
}: SiteChecklistProps) {
  const siteChecks = stack.checks
    .filter((check) => check.scope === 'site')
    .sort((a, b) => a.order - b.order);

  const preLaunch = groupChecks(siteChecks.filter((check) => !check.postLaunch));
  const postLaunch = groupChecks(siteChecks.filter((check) => check.postLaunch));

  const postLaunchCounts = countGroup(
    postLaunch.flatMap((group) => group.checks),
    answers,
  );

  return (
    <Card className={cn('gap-3 py-4', className)}>
      <CardHeader className="px-4">
        <CardTitle className="text-sm">Site checks</CardTitle>
        <CardDescription className="text-xs">
          Asked once for the whole site. Everything before &ldquo;After launch&rdquo; has to pass
          before the site can go live.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        {preLaunch.map((group) => (
          <GroupBlock
            key={group.name}
            group={group}
            answers={answers}
            hints={hints}
            onChange={onChange}
            disabled={disabled}
          />
        ))}

        {postLaunch.length > 0 && (
          <div className="mt-5 rounded-md border border-dashed bg-muted/20 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">After launch</h3>
              <p className="text-xs tabular-nums text-muted-foreground">
                {postLaunchCounts.passed} of {postLaunchCounts.applicable}
              </p>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              These are done once the site is live, so they do not block the launch.
            </p>
            <div className="mt-3 space-y-3">
              {/* One group of post-launch checks needs no second heading saying so. */}
              {postLaunch.length === 1 ? (
                <div className="rounded-md border bg-background">
                  {postLaunch[0].checks.map((check) => (
                    <CheckRow
                      key={check.id}
                      check={check}
                      answer={answers[check.id]}
                      hint={hints?.[check.id]}
                      onChange={(status) => onChange(check.id, status)}
                      disabled={disabled}
                    />
                  ))}
                </div>
              ) : (
                postLaunch.map((group) => (
                  <GroupBlock
                    key={group.name}
                    group={group}
                    answers={answers}
                    hints={hints}
                    onChange={onChange}
                    disabled={disabled}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
