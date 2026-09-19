/**
 * Who counts as one of ours.
 *
 * Used by anything that reaches out to a person unprompted — the Slack nudge,
 * the daily delivery mail — because the one mistake that really costs is
 * chasing a client as though they were staff. Kept in one place so two nudges
 * can never disagree about who is internal.
 *
 * Same convention as `requireCaller` in `src/lib/api-auth.ts` and the
 * access-control rule.
 */

const TEAM_DOMAIN = '@activeset.co';

/**
 * Comma-separated extra addresses, for contractors on another domain. Anything
 * outside this set and the team domain is treated as a client and skipped in
 * silence.
 */
const TEAM_ALLOWLIST: ReadonlySet<string> = new Set(
  (process.env.NAG_TEAM_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export function isTeamMember(email: string | undefined | null): boolean {
  const e = email?.toLowerCase().trim();
  if (!e) return false;
  if (e.endsWith(TEAM_DOMAIN)) return true;
  return TEAM_ALLOWLIST.has(e);
}

/** The local part, for addressing somebody without shouting their whole address. */
export function firstNameOf(email: string): string {
  const local = email.split('@')[0] ?? email;
  const first = local.split(/[._-]/)[0] ?? local;
  return first.charAt(0).toUpperCase() + first.slice(1);
}
