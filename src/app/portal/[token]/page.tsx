import type { Metadata } from 'next';
import { cache } from 'react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { loadClientPortalByToken } from '@/lib/client-portal';
import { hasFirebaseAdminCredentials } from '@/lib/firebase-admin';
// Deliberately NOT '@/modules/client-portal': that barrel also exports the
// internal Client tab, which Next would then ship to the client's browser.
// See the eslint override for src/app/portal/**.
import { ClientPortalScreen } from '@/modules/client-portal/ui/screens/ClientPortalScreen';

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// The URL is the credential: never index, never cache in search engines.
const ROBOTS: Metadata['robots'] = { index: false, follow: false, nocache: true };
const FALLBACK_TITLE = 'Project page';

// Deduped per request so generateMetadata and the page share one Firestore
// read and one token "touch" (the loader bumps useCount on every call).
const loadPortal = cache((token: string) => loadClientPortalByToken(token));

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const base: Metadata = {
    title: FALLBACK_TITLE,
    // Overrides the root layout's internal-tool description; says nothing about status.
    description: 'A private project page prepared by ActiveSet.',
    robots: ROBOTS,
  };
  if (!hasFirebaseAdminCredentials) return base;

  try {
    const loaded = await loadPortal(token);
    if (!loaded) return base;
    return { ...base, title: `${loaded.view.brandName} · ${loaded.view.projectName}` };
  } catch {
    return base;
  }
}

function PortalNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="portal-theme flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <Card className="w-full max-w-md rounded-2xl p-2 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription className="leading-relaxed">{children}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function UnavailableNotice() {
  return (
    <PortalNotice title="This page is temporarily unavailable">
      Please try again in a few minutes. If it keeps happening, ask your ActiveSet contact.
    </PortalNotice>
  );
}

export default async function ClientPortalPage({ params, searchParams }: PageProps) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const preview = query?.preview === '1';

  if (!hasFirebaseAdminCredentials) return <UnavailableNotice />;

  let loaded: Awaited<ReturnType<typeof loadPortal>>;
  try {
    loaded = await loadPortal(token);
  } catch (error) {
    console.error('[ClientPortal] Failed to load portal page:', error);
    return <UnavailableNotice />;
  }

  if (!loaded) {
    return (
      <PortalNotice title="This link is no longer active">Ask your ActiveSet contact for a new link.</PortalNotice>
    );
  }

  return <ClientPortalScreen view={loaded.view} token={token} preview={preview} />;
}
