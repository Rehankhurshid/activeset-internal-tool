'use client';

import type { Project } from '@/types';
import { CallCadenceCard } from './CallCadenceCard';
import { KickoffEmailDialog } from './KickoffEmailDialog';

/**
 * The two things a kickoff stage has that are not checklist items.
 *
 * Neither is a task: the cadence is a standing arrangement, and the welcome
 * email is a draft of whatever kickoff is still waiting on. They sit beside the
 * stage's items rather than replacing them.
 */

export interface KickoffExtrasProps {
  project: Project;
  userEmail: string;
  /** Titles of what kickoff is still waiting on; the draft chases exactly these. */
  outstanding: string[];
}

export function KickoffExtras({ project, userEmail, outstanding }: KickoffExtrasProps) {
  return (
    <div className="space-y-3">
      <CallCadenceCard projectId={project.id} delivery={project.delivery} />

      <section className="space-y-2 rounded-lg border bg-card p-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold">Welcome email</h3>
          <p className="text-xs text-muted-foreground">
            Drafted from the project, including whatever kickoff is still waiting on. You send it
            yourself.
          </p>
        </div>
        <KickoffEmailDialog project={project} userEmail={userEmail} outstanding={outstanding} />
      </section>
    </div>
  );
}
