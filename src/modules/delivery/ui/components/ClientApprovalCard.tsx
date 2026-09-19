'use client';

import { CheckCircle2, Clock, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Project } from '@/types';

interface ClientApprovalCardProps {
  project: Project;
  /** `${checklistId}:${sectionId}` — the stage the client is asked to sign off. */
  stageKey: string;
  className?: string;
}

/**
 * Whether the client has signed this stage off, on our side of the glass.
 *
 * The approval is written by the portal route from the link the client holds, so
 * this only ever reads it. Nothing here ticks a checklist item either: their
 * approval is their statement, and the steps in this stage are ours to mark
 * done. Keeping the two apart is what makes the record mean anything.
 */
export function ClientApprovalCard({ project, stageKey, className }: ClientApprovalCardProps) {
  const approval = (project.delivery?.approvals ?? []).find((a) => a.stageKey === stageKey);
  const portalOn = project.clientPortal?.enabled === true;

  const approvedOn = approval
    ? new Date(approval.approvedAt).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <section
      className={cn(
        'space-y-2 rounded-lg border p-3',
        approval ? 'border-emerald-500/30 bg-emerald-500/5' : 'bg-card',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        {approval ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-sm font-semibold">
            {approval ? 'The client approved this stage' : 'Waiting on the client'}
          </h3>
          <p className="text-xs text-muted-foreground">
            {approval
              ? `Approved on ${approvedOn} from their portal link.`
              : portalOn
                ? 'They approve from their portal link. Nothing here is blocked by it — this is the record, not a lock.'
                : 'The client portal is off, so there is nowhere for them to approve. Turn it on in the Client tab, or record their approval however you got it.'}
          </p>
        </div>
      </div>

      {approval?.note && (
        <p className="rounded-md bg-background/60 px-2.5 py-1.5 text-xs italic text-foreground">
          &ldquo;{approval.note}&rdquo;
        </p>
      )}

      {!approval && !portalOn && (
        <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
          {/* A plain link: the Client tab is chosen from the URL on load. */}
          <a href={`/modules/project-links/${project.id}?tab=client`}>
            Open the Client tab
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </a>
        </Button>
      )}
    </section>
  );
}
