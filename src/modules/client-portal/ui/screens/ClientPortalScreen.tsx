import type { ClientPortalView } from '../../domain/client-portal.types';
import { PortalAsks } from '../components/PortalAsks';
import { PortalDeliverables } from '../components/PortalDeliverables';
import { PortalFooter } from '../components/PortalFooter';
import { PortalHeader } from '../components/PortalHeader';
import { PortalPlan } from '../components/PortalPlan';
import { PortalStatusCard } from '../components/PortalStatusCard';
import { PortalUpdatesFeed } from '../components/PortalUpdatesFeed';
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
 * The client-facing project page. Server-safe (no hooks); only the reply form
 * and the view beacon are client components. Everything renders inside
 * `.portal-theme`, the light palette defined in globals.css, and uses token
 * utilities only.
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
        />
        <PortalStatusCard view={view} now={now} />
        <PortalUpdatesFeed updates={view.updates} now={now} />
        <PortalPlan phases={view.phases} now={now} />
        <PortalDeliverables deliverables={view.deliverables} websiteUrl={view.websiteUrl} />
        {view.asks.length > 0 && <PortalAsks asks={view.asks} now={now} />}
        <PortalFooter brandName={view.brandName} agencyContactEmail={view.agencyContactEmail} />
      </main>

      <TrackPortalView token={token} preview={preview} />
    </div>
  );
}
