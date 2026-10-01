import type { ClientPortalView } from '../../domain/client-portal.types';
import { PortalAsks } from '../components/PortalAsks';
import { PortalChanges } from '../components/PortalChanges';
import { PortalReadiness } from '../components/PortalReadiness';
import { PortalWork } from '../components/PortalWork';
import { PortalYourTurn } from '../components/PortalYourTurn';
import { PortalFiles } from '../components/PortalFiles';
import { PortalFooter } from '../components/PortalFooter';
import { PortalHeader } from '../components/PortalHeader';
import { PortalNowCard } from '../components/PortalNowCard';
import { PortalProcess } from '../components/PortalProcess';
import { PortalReview } from '../components/PortalReview';
import { PortalStages } from '../components/PortalStages';
import { TrackPortalView } from '../components/TrackPortalView';

interface ClientPortalScreenProps {
  view: ClientPortalView;
  token: string;
  /** `?preview=1`: show the banner and never send the view beacon. */
  preview?: boolean;
}

function resolveNow(generatedAt: string): Date {
  const parsed = new Date(generatedAt);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * The client's dashboard. Server-safe (no hooks); only the approval card and
 * the view beacon are client components. Everything renders inside
 * `.portal-theme`, the light palette defined in globals.css, and uses token
 * utilities only.
 *
 * In reading order: where the project is, whether anything is waiting on them
 * and what, the work itself, what they get and when, how ready launch is, any
 * change outside scope, the files, and the one thing they can sign. Sections
 * fed by the project sheet render nothing when no sheet is bound.
 */
export function ClientPortalScreen({ view, token, preview = false }: ClientPortalScreenProps) {
  const now = resolveNow(view.generatedAt);

  return (
    <div className="portal-theme min-h-screen bg-background text-foreground">
      {preview && (
        <div role="status" className="bg-foreground px-4 py-2 text-center text-xs font-medium text-background">
          Preview — you&apos;re seeing this as the client. Views aren&apos;t counted.
        </div>
      )}

      <main className="mx-auto w-full max-w-[760px] space-y-8 px-4 py-8 sm:space-y-10 sm:px-6 sm:py-12">
        <PortalHeader
          brandName={view.brandName}
          brandLogoUrl={view.brandLogoUrl}
          projectName={view.projectName}
          welcome={view.welcome}
          facts={view.facts}
          now={now}
        />
        <PortalNowCard view={view} now={now} />
        <PortalYourTurn view={view} now={now} />
        {/* From the project sheet, the whole process as one numbered list, right under where we are. */}
        {view.planSource === 'sheet' && <PortalProcess stages={view.stages} now={now} />}
        {view.asks.length > 0 && <PortalAsks asks={view.asks} received={view.asksReceived} now={now} />}
        {view.work && <PortalWork work={view.work} generatedAt={view.generatedAt} />}
        {view.planSource !== 'sheet' && <PortalStages stages={view.stages} now={now} planSource={view.planSource} />}
        <PortalReadiness readiness={view.readiness} />
        <PortalChanges changes={view.changes} now={now} />
        <PortalFiles files={view.files} websiteUrl={view.websiteUrl} />
        {/* Below the stages and files deliberately: there is no approving
            something you have not been shown. */}
        <PortalReview review={view.review} token={token} now={now} preview={preview} />
        <PortalFooter brandName={view.brandName} agencyContactEmail={view.agencyContactEmail} />
      </main>

      <TrackPortalView token={token} preview={preview} />
    </div>
  );
}
