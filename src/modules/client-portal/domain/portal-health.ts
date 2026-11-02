import { daysBetweenIso, todayIso } from '@/lib/review-status';
import type { ClientPortalView } from './client-portal.types';
import { daysSinceClientUpdate, PORTAL_FRESH_DAYS } from './client-status';
import type { PortalContact } from './portal-contact';

/**
 * Team-only warnings about what the client's page is showing (ACT-92,
 * 2026-11-02). Different AI's page said "Updated 4 days ago", had no target
 * launch and showed Go live in progress weeks after the site went live, and
 * nobody on the team noticed because nothing told them. These are read from
 * the very view the client gets, so they warn about what the client sees.
 *
 * Never part of the client's payload: the health route returns them to the
 * Client tab only.
 */
export type PortalWarningId = 'never_updated' | 'stale' | 'no_target_launch' | 'launch_passed' | 'no_contact' | 'contact_fallback';

export interface PortalWarning {
  id: PortalWarningId;
  /** `warn` needs doing; `info` is worth a look (a default the team never chose). */
  level: 'warn' | 'info';
  title: string;
  /** What to do about it, in the team's words. */
  fix: string;
}

export interface PortalHealthInput {
  view: Pick<ClientPortalView, 'status' | 'lastUpdateAt' | 'facts'>;
  /** Whether the link is on. An off page warns about nothing: nobody can open it. */
  enabled: boolean;
  /** Whether a hand-kept project sheet feeds the page, which is where Target launch comes from. */
  readsSheet: boolean;
  contact: PortalContact;
  today?: string;
  freshDays?: number;
}

function day(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function portalWarnings(input: PortalHealthInput): PortalWarning[] {
  const { view, enabled, readsSheet, contact, today = todayIso(), freshDays = PORTAL_FRESH_DAYS } = input;
  if (!enabled) return [];
  const warnings: PortalWarning[] = [];
  // A delivered project has nothing left to tell the client, so only who to talk to still matters.
  const live = view.status !== 'delivered';

  if (live) {
    const days = daysSinceClientUpdate({ lastUpdateAt: view.lastUpdateAt }, today);
    if (days === null) {
      warnings.push({
        id: 'never_updated',
        level: 'warn',
        title: 'The client’s page has never been updated',
        fix: 'Tick the checklist, share a call or sync the sheet, so the page has something current to show.',
      });
    } else if (days > freshDays) {
      warnings.push({
        id: 'stale',
        level: 'warn',
        title: `The client’s page was last updated ${days} days ago`,
        fix: `It no longer says when it was updated. Check that its stages and status still match the project (tick what is done, set Delivered once live), and it shows the date again.`,
      });
    }

    const launch = view.facts?.targetLaunchDate;
    if (readsSheet && !launch && !view.facts?.targetLaunchText) {
      warnings.push({
        id: 'no_target_launch',
        level: 'warn',
        title: 'Target launch is empty',
        fix: 'Fill Target launch on the project sheet’s Overview tab, then sync the sheet.',
      });
    } else if (launch && daysBetweenIso(launch, today) > 0) {
      warnings.push({
        id: 'launch_passed',
        level: 'warn',
        title: `Target launch was ${day(launch)}, and the page does not say Delivered`,
        fix: 'If the site is live, tick the launch steps and set the status to Delivered. If not, move the date in the sheet.',
      });
    }
  }

  if (contact.source === 'none') {
    warnings.push({
      id: 'no_contact',
      level: 'warn',
      title: 'The client has no one to contact',
      fix: 'Pick a client point of contact below, or add a lead to the project.',
    });
  } else if (contact.source !== 'set') {
    warnings.push({
      id: 'contact_fallback',
      level: 'info',
      title: `The client is told to contact ${contact.email}`,
      fix: `Nobody chose them: it is the project ${contact.source === 'lead' ? 'lead' : 'team’s first member'}. Pick the client point of contact below to be sure.`,
    });
  }

  return warnings;
}
