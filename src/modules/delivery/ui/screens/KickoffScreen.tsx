'use client';

import { useRef } from 'react';
import type { Project } from '@/types';
import type { StackDefinition, StackKickoffStep } from '../../domain/delivery.types';
import type { KickoffContext } from '../../domain/delivery.progress';
import { CallCadenceCard } from '../components/CallCadenceCard';
import { KickoffEmailDialog, type KickoffEmailDialogHandle } from '../components/KickoffEmailDialog';
import { KickoffInputsList } from '../components/KickoffInputsList';
import { KickoffStepsList } from '../components/KickoffStepsList';

/**
 * Kickoff has two sides and they are not the same job.
 *
 * What the client owes us blocks the build, and they need to see that list.
 * What we do — book the call, hold it, open the Slack channel, send the welcome
 * email, set the project up — is ours, and it is tracked here rather than only
 * in the SOP checklist: that checklist covers the whole build, and its kickoff
 * section is easy to lose inside sixty-odd items.
 */

interface KickoffScreenProps {
  project: Project;
  stack: StackDefinition;
  userEmail: string;
  context: KickoffContext;
  /** Sends the team to the Pages stage, for the step about pulling the page list. */
  onGoToPages?: () => void;
}

export function KickoffScreen({ project, stack, userEmail, context, onGoToPages }: KickoffScreenProps) {
  const emailRef = useRef<KickoffEmailDialogHandle>(null);
  const cadenceRef = useRef<HTMLDivElement>(null);

  // Each step that can be performed on this screen points at the control that
  // performs it, so "send the welcome email" opens the draft rather than being
  // a line of text next to a button someone has to notice.
  const handleAction = (action: NonNullable<StackKickoffStep['action']>) => {
    if (action === 'welcome-email') {
      emailRef.current?.open();
      return;
    }
    if (action === 'cadence') {
      cadenceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    // Both the page list and the tracker sheet live on the Pages stage.
    onGoToPages?.();
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
      <div className="space-y-3">
        <KickoffStepsList
          projectId={project.id}
          stack={stack}
          delivery={project.delivery}
          context={context}
          onAction={handleAction}
        />

        <div ref={cadenceRef}>
          <CallCadenceCard projectId={project.id} delivery={project.delivery} />
        </div>

        <section className="space-y-2 rounded-lg border bg-card p-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold">Welcome email</h2>
            <p className="text-xs text-muted-foreground">
              Drafted from the project. You send it yourself.
            </p>
          </div>
          <KickoffEmailDialog ref={emailRef} project={project} stack={stack} userEmail={userEmail} />
        </section>
      </div>

      <KickoffInputsList projectId={project.id} stack={stack} delivery={project.delivery} />
    </div>
  );
}
