import 'server-only';
import { db as adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { fetchSitemapUrls } from '@/lib/webflow-sitemap-io';
import {
  cmsFoldersOf,
  liveOriginOf,
  sitemapGap,
  suggestLiveOrigin,
} from '@/modules/delivery/domain/delivery.launch';
import { recordableUrlProblem } from '@/modules/delivery/domain/delivery.recording';
import type { ProjectPage } from '@/modules/delivery/domain/delivery.types';
import type { DeliverySitemapGap, Project } from '@/types';

/**
 * The live sitemap against the page tracker (Linear ACT-94).
 *
 * Reads `<live site>/sitemap.xml` with the parser the Webflow drift check
 * already uses, compares it with `projects/{id}/pages`, and keeps the result on
 * the project as `delivery.sitemapGap`. Run on demand from the Delivery tab and
 * nightly, for launched projects, by the Webflow sitemap drift cron: neither
 * calls the app over HTTP, so no base URL is involved.
 *
 * Never throws for a site that cannot be read: the snapshot carries `error`,
 * so the card can say what went wrong.
 */
export async function refreshSitemapGap(
  projectId: string,
  originOverride?: string,
): Promise<DeliverySitemapGap> {
  const projectRef = adminDb.collection(COLLECTIONS.PROJECTS).doc(projectId);
  const snap = await projectRef.get();
  if (!snap.exists) throw new Error('Project not found');
  const project = { id: snap.id, ...(snap.data() as Omit<Project, 'id'>) } as Project;

  const origin = liveOriginOf(originOverride) ?? suggestLiveOrigin(project);
  const checkedAt = new Date().toISOString();
  const empty = { checkedAt, missing: [], cmsSkipped: 0, sitemapCount: 0 };

  let gap: DeliverySitemapGap;
  if (!origin) {
    gap = { ...empty, sitemapUrl: '', error: 'No live site yet. Mark the site launched, or type its address.' };
  } else {
    const sitemapUrl = `${origin}/sitemap.xml`;
    // The server fetches what the team typed; keep it off private networks.
    const problem = recordableUrlProblem(sitemapUrl);
    if (problem) {
      gap = { ...empty, sitemapUrl, error: problem };
    } else {
      try {
        const [urls, pagesSnap] = await Promise.all([
          fetchSitemapUrls(sitemapUrl),
          projectRef.collection(COLLECTIONS.PROJECT_PAGES).limit(1000).get(),
        ]);
        const pages = pagesSnap.docs.map((d) => d.data() as Pick<ProjectPage, 'path' | 'stagingLink'>);
        const result = sitemapGap(urls, pages, {
          cmsFolders: cmsFoldersOf(project),
          ignore: project.delivery?.sitemapIgnore ?? [],
        });
        gap = urls.length === 0 ? { ...empty, sitemapUrl, error: 'The sitemap lists no pages' } : { checkedAt, sitemapUrl, ...result };
      } catch (error) {
        gap = { ...empty, sitemapUrl, error: error instanceof Error ? error.message : 'Could not read the sitemap' };
      }
    }
  }

  // A dotted path, so nothing else on `delivery` is touched, and no `updatedAt`:
  // a nightly check is not an edit to the project.
  await projectRef.update({ 'delivery.sitemapGap': gap });
  return gap;
}
