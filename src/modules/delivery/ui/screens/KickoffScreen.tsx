'use client';

import { ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Project } from '@/types';
import type { StackDefinition } from '../../domain/delivery.types';
import { CallCadenceCard } from '../components/CallCadenceCard';
import { KickoffEmailDialog } from '../components/KickoffEmailDialog';
import { KickoffInputsList } from '../components/KickoffInputsList';

/**
 * Kickoff: what the client owes us, what we owe ourselves, and the two things
 * that keep a project from going quiet — a call cadence and an intro email.
 *
 * The client's side is tracked, because the build is blocked on it and the
 * client needs to see the list. Our side is a reminder: those seven items are
 * already the project's checklist, and a second place to tick them is a second
 * place to forget.
 */

/**
 * "Step 1: Project Planning & Kickoff" from the Website Migration SOP.
 *
 * Rendered, not stored. The Checklist tab owns the ticks; duplicating them here
 * would mean two answers to the same question and no way to tell which is true.
 */
const INTERNAL_SETUP: string[] = [
  'Pull the page list from the live site, including CMS collections',
  'Name the lead developer, backup developer and project lead',
  'Create the Slack channel with the client (Setup Channel — Webflow Migration)',
  'Create the ClickUp task list (One Click Setup)',
  'Create the MarkUp folder',
  'Project lead sends the intro email introducing the team',
  'Hold the internal kickoff: deadline, functionality, animations, strategy',
];

/** Full page load so the detail screen re-reads `?tab=` on mount. */
function openChecklistTab(): void {
  const url = new URL(window.location.href);
  url.searchParams.set('tab', 'checklist');
  window.location.assign(url.toString());
}

interface KickoffScreenProps {
  project: Project;
  stack: StackDefinition;
  userEmail: string;
}

export function KickoffScreen({ project, stack, userEmail }: KickoffScreenProps) {
  return (
    <div className="grid gap-3 lg:grid-cols-3 lg:items-start">
      <div className="lg:col-span-2">
        <KickoffInputsList projectId={project.id} stack={stack} delivery={project.delivery} />
      </div>

      <div className="space-y-3">
        <CallCadenceCard projectId={project.id} delivery={project.delivery} />

        <section className="space-y-2 rounded-lg border bg-card p-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold">Kickoff email</h2>
            <p className="text-xs text-muted-foreground">
              Drafted from the project. You send it yourself.
            </p>
          </div>
          <KickoffEmailDialog project={project} stack={stack} userEmail={userEmail} />
        </section>

        <section className="space-y-2 rounded-lg border bg-card p-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold">Internal setup</h2>
            <p className="text-xs text-muted-foreground">
              A reminder, not a tracker — tick these off on the Checklist tab.
            </p>
          </div>

          <ul className="space-y-1.5">
            {INTERNAL_SETUP.map((item) => (
              <li key={item} className="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
                <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <Button
            size="sm"
            variant="outline"
            className="h-7 w-full justify-start px-2 text-xs"
            onClick={openChecklistTab}
          >
            <ListChecks className="h-3.5 w-3.5" />
            Open the Checklist tab
          </Button>
        </section>
      </div>
    </div>
  );
}
