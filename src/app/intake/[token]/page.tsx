import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { db, hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { isValidIntakeTokenShape } from '@/lib/intake-token';
import type { Project } from '@/types';
import { Inbox, Sparkles } from 'lucide-react';
import { IntakeForm } from '@/components/intake/IntakeForm';

interface PageProps {
  params: Promise<{ token: string }>;
}

interface ResolvedIntake {
  projectId: string;
  projectName: string;
  client?: string;
  welcomeMessage?: string;
  autoCreate: boolean;
  hasClickUpList: boolean;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function resolveToken(token: string): Promise<ResolvedIntake | null> {
  if (!isValidIntakeTokenShape(token)) return null;
  try {
    const snap = await db
      .collection(COLLECTIONS.PROJECTS)
      .where('intakeToken', '==', token)
      .limit(1)
      .get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    const data = doc.data() as Project;
    if (data.intakeEnabled === false) return null;
    return {
      projectId: doc.id,
      projectName: data.name || 'Project',
      client: data.client,
      welcomeMessage: data.intakeWelcomeMessage,
      autoCreate: data.intakeAutoCreate === true,
      hasClickUpList: Boolean(data.clickupListId),
    };
  } catch (err) {
    console.error('[intake] token resolution failed:', err);
    return null;
  }
}

function NotFoundCard({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>Intake link unavailable</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

export default async function IntakePage({ params }: PageProps) {
  const { token } = await params;

  if (!hasFirebaseAdminCredentials) {
    return (
      <NotFoundCard message="Public intake is misconfigured on this deployment. Please contact the team directly." />
    );
  }

  const resolved = await resolveToken(token);
  if (!resolved) {
    return (
      <NotFoundCard message="This intake link is invalid, expired, or has been disabled by the project owner." />
    );
  }

  const projectLabel = resolved.client
    ? `${resolved.client} — ${resolved.projectName}`
    : resolved.projectName;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 max-w-2xl">
        <div className="mb-8 space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1.5">
              <Inbox className="h-3.5 w-3.5" />
              Project Intake
            </Badge>
            {resolved.autoCreate && resolved.hasClickUpList && (
              <Badge variant="outline" className="gap-1.5">
                <Sparkles className="h-3 w-3 text-purple-500" />
                Auto-routed
              </Badge>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Submit a request — {projectLabel}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {resolved.welcomeMessage ||
              'Drop your change request below. One ask or a list — both work. We will triage and confirm timing.'}
          </p>
        </div>

        <IntakeForm token={token} autoCreate={resolved.autoCreate && resolved.hasClickUpList} />

        <p className="text-xs text-muted-foreground mt-6">
          Submissions are received by the Active Set team. Sensitive credentials should not be
          shared here — use a private channel instead.
        </p>
      </main>
    </div>
  );
}
