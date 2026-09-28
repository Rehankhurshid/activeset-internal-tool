import type { PortalStageView } from '../../domain/client-portal.types';
import { PortalFileList } from './PortalFileList';
import { PortalMeeting } from './PortalMeeting';
import { PortalSteps } from './PortalSteps';

const EYEBROW = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground';

/**
 * Everything about one stage, in one place: its milestones, the calls held
 * during it, and its files. The same block sits under "Where we are" for the
 * current stage and inside each stage further down, so a question about
 * Design is answered where Design is.
 */
export function PortalStageDetail({
  stage,
  now,
  showFiles = true,
}: {
  stage: PortalStageView;
  now: Date;
  showFiles?: boolean;
}) {
  const steps = stage.steps ?? [];
  const meetings = stage.meetings ?? [];
  const files = showFiles ? stage.files : [];
  if (steps.length === 0 && meetings.length === 0 && files.length === 0) return null;

  return (
    <div className="space-y-6">
      {steps.length > 0 && (
        <section className="space-y-2.5">
          <h3 className={EYEBROW}>Milestones</h3>
          <PortalSteps steps={steps} now={now} />
        </section>
      )}
      {meetings.length > 0 && (
        <section className="space-y-2.5">
          <h3 className={EYEBROW}>
            Meetings <span className="font-normal normal-case tracking-normal">· {meetings.length}</span>
          </h3>
          <div className="space-y-2">
            {meetings.map((meeting) => (
              <PortalMeeting key={meeting.id} meeting={meeting} now={now} />
            ))}
          </div>
        </section>
      )}
      {files.length > 0 && (
        <section className="space-y-2.5">
          <h3 className={EYEBROW}>Files</h3>
          <PortalFileList files={files} compact />
        </section>
      )}
    </div>
  );
}

/** "5 milestones · 2 meetings · 3 files", for a closed stage row. */
export function stageContentsLabel(stage: PortalStageView): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return [
    stage.steps?.length ? plural(stage.steps.length, 'milestone') : '',
    stage.meetings?.length ? plural(stage.meetings.length, 'meeting') : '',
    stage.files.length ? plural(stage.files.length, 'file') : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
