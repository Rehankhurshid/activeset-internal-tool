import { listCollections } from '@/lib/cms/webflow-client';
import { getWebflowTokenAdmin, loadProjectDocAdmin } from '@/lib/project-admin';
import type { CurrentImage } from '@/lib/worker/queue';
import { runLibraryGroup, type LibraryGroup, type LibraryGroupResult } from './library-group';

/**
 * The hourly look for new images, for a project that has "Auto-optimise new
 * images" switched on.
 *
 * It is "Optimise everything" limited to what the project has never seen:
 * general assets first, then every collection, each through the same
 * `runLibraryGroup` a click uses, with `newOnly` set. Confident ALT is
 * written and unsure drafts wait on the Images screen, as with a click.
 * Nothing is published — Webflow shows the changes as staged, and they go
 * live with the team's next publish. A group that fails is reported and the
 * sweep moves on to the next one.
 */

export interface LibrarySweepPayload {
  by?: string;
}

export interface LibrarySweepResult {
  groups: {
    name: string;
    images: number;
    altAdded: number;
    altHeld: number;
    optimised: number;
    errors: string[];
  }[];
  /** Images across every group that had ALT written or were optimised. */
  changed: number;
}

export async function runLibrarySweep(
  projectId: string,
  payload: LibrarySweepPayload,
  onProgress: (message: string, fraction?: number, current?: CurrentImage | null) => Promise<void> | void,
): Promise<LibrarySweepResult> {
  const project = await loadProjectDocAdmin(projectId);
  const siteId = project?.webflowConfig?.siteId;
  if (!siteId) throw new Error('This project has no Webflow site configured');
  const token = await getWebflowTokenAdmin(projectId);
  if (!token) throw new Error('This project has no Webflow API token configured');
  // Switched off since this run was queued: do nothing.
  if (!project.autoOptimiseImages?.enabled) return { groups: [], changed: 0 };

  const groups: { group: LibraryGroup; name: string }[] = [
    { group: { kind: 'assets' }, name: 'General assets' },
    ...(await listCollections(siteId, token)).map((collection) => ({
      group: { kind: 'collection' as const, collectionId: collection.id, name: collection.displayName },
      name: collection.displayName,
    })),
  ];

  const result: LibrarySweepResult = { groups: [], changed: 0 };
  for (const [i, { group, name }] of groups.entries()) {
    const share = (fraction?: number) => (i + (fraction ?? 0)) / groups.length;
    let outcome: LibraryGroupResult | undefined;
    const errors: string[] = [];
    try {
      outcome = await runLibraryGroup(
        projectId,
        { group, newOnly: true, publish: false, by: payload.by ?? 'auto-optimise' },
        // The group goes in front of the item, so the navigation bar says
        // "Companies — Ringg AI · Logo" rather than just the item.
        (message, fraction, current) =>
          onProgress(
            `${name} · ${message}`,
            share(fraction),
            current ? { ...current, label: current.label ? `${name} — ${current.label}` : name } : current,
          ),
      );
      errors.push(...outcome.errors);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    const altAdded = outcome?.alt.added ?? 0;
    const optimised = outcome?.optimise?.optimised ?? 0;
    result.changed += altAdded + optimised;
    result.groups.push({
      name,
      images: outcome?.images ?? 0,
      altAdded,
      altHeld: outcome?.alt.held ?? 0,
      optimised,
      errors,
    });
  }
  return result;
}
