import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WebsiteAuditDashboard } from '@/components/website-audit-dashboard';
import { db } from '@/lib/firebase-admin';
import { FolderPageTypes, ProjectLink } from '@/types';
import { Globe } from 'lucide-react';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ token: string }>;
}

interface SharedAuditProject {
  id: string;
  name: string;
  links: ProjectLink[];
  folderPageTypes?: FolderPageTypes;
  detectedLocales?: string[];
  pathToLocaleMap?: Record<string, string>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const getSharedAuditProject = async (token: string): Promise<SharedAuditProject | null> => {
  if (!token) return null;

  try {
    const querySnapshot = await db
      .collection('projects')
      .where('publicAuditShareToken', '==', token)
      .get();

    if (querySnapshot.empty) return null;

    const projectDoc = querySnapshot.docs[0];
    const data = projectDoc.data() as {
      name?: string;
      links?: ProjectLink[];
      folderPageTypes?: FolderPageTypes;
      detectedLocales?: string[];
      pathToLocaleMap?: Record<string, string>;
      publicAuditShareEnabled?: boolean;
    };

    if (data.publicAuditShareEnabled === false) return null;

    return {
      id: projectDoc.id,
      name: data.name || 'Shared Audit',
      links: Array.isArray(data.links) ? data.links : [],
      folderPageTypes: data.folderPageTypes,
      detectedLocales: Array.isArray(data.detectedLocales) ? data.detectedLocales : [],
      pathToLocaleMap: data.pathToLocaleMap || {},
    };
  } catch (error) {
    console.error('[PublicAuditShare] Failed to fetch shared project:', error);
    return null;
  }
};

export default async function SharedProjectAuditPage({ params }: PageProps) {
  const { token } = await params;
  const project = await getSharedAuditProject(token);

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <CardTitle>Share link unavailable</CardTitle>
            <CardDescription>
              This link is invalid, expired, or has been disabled by the owner.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const sharedLinks = project.links.filter(link => link.source === 'auto');
  const scannedCount = sharedLinks.filter(link => !!link.auditResult).length;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-4">
        <div className="rounded-lg border bg-card px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Public Share</Badge>
              <Badge variant="outline" className="gap-1.5">
                <Globe className="h-3.5 w-3.5" />
                Read only
              </Badge>
            </div>
            <h1 className="text-lg sm:text-xl font-semibold mt-2">{project.name} Audit Dashboard</h1>
            <p className="text-xs text-muted-foreground mt-1">
              This is a shared snapshot of audit results. Editing and scanning actions are disabled.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="h-7 px-2.5 font-normal">
              Pages {sharedLinks.length}
            </Badge>
            <Badge variant="secondary" className="h-7 px-2.5 font-normal">
              Scanned {scannedCount}
            </Badge>
            <Button variant="outline" size="sm" asChild>
              <Link href={sharedLinks[0]?.url || '/'} target="_blank">
                Open site
              </Link>
            </Button>
          </div>
        </div>

        <WebsiteAuditDashboard
          links={sharedLinks}
          projectId={project.id}
          folderPageTypes={project.folderPageTypes}
          detectedLocales={project.detectedLocales}
          pathToLocaleMap={project.pathToLocaleMap}
          isReadOnly
        />
      </main>
    </div>
  );
}
