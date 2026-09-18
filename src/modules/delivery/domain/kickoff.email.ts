import type { ProjectDeliveryState } from './delivery.types';

/**
 * The kickoff email, as a draft.
 *
 * The SOP has the project lead send an intro email the moment a project starts:
 * who is on it, where the tracker lives, how often we will talk, and what we are
 * still waiting on. It is the same email every time, retyped every time, which
 * is why half of them go out missing the ask list.
 *
 * This builds the draft and nothing else. A person reads it, edits it and sends
 * it from their own mailbox — the agency's relationship with a client is not
 * something to automate away, and an email that arrives from an app reads like
 * one. Pure strings in, pure strings out, so the wording can be tested.
 */

export type SyncCadence = NonNullable<ProjectDeliveryState['callCadence']>;

export interface KickoffEmailInput {
  /** The project as the team names it. Always present in the subject line. */
  projectName: string;
  /** The client's own name, when the project is not already named after them. */
  clientName?: string;
  /** Everyone from our side who the client should recognise. */
  teamEmails: string[];
  /** The one person the client should reply to. Listed first, marked as lead. */
  leadEmail?: string;
  trackerUrl?: string;
  stagingUrl?: string;
  portalUrl?: string;
  cadence: SyncCadence;
  /** Titles of the kickoff inputs the client still owes us. */
  outstandingInputs: string[];
}

export interface KickoffEmail {
  subject: string;
  body: string;
}

/**
 * A string we are willing to put in front of a client, or nothing.
 *
 * Every value in here is threaded through this: the draft is assembled from a
 * project document that is half optional fields, and a missing one has to drop
 * its whole line rather than print `undefined` at a client.
 */
function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = clean(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/** "a, b and c" — an agency writes a sentence, not a comma-separated dump. */
function sentenceList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const CADENCE_SENTENCES: Record<SyncCadence, string> = {
  weekly:
    'We would like a short call every week to go through progress and anything that needs a decision. Tell us a day and time that suits you and we will send the invite.',
  biweekly:
    'We would like a short call every two weeks to go through progress and anything that needs a decision. Tell us a day and time that suits you and we will send the invite.',
  none:
    'We have not set up a standing call. We will keep you posted in writing, and we can put a regular call in whenever you would find it useful.',
};

function cadenceSentence(cadence: unknown): string {
  return CADENCE_SENTENCES[cadence as SyncCadence] ?? CADENCE_SENTENCES.none;
}

/**
 * Builds the subject and body. Sections with nothing in them are left out
 * entirely: an email that says "nothing outstanding" is an email that spends a
 * paragraph saying nothing.
 */
export function buildKickoffEmail(input: KickoffEmailInput): KickoffEmail {
  const projectName = clean(input?.projectName) ?? 'the project';
  // The client's own name when we have it, the project name when we do not —
  // most projects here are named after the client anyway.
  const addressee = clean(input?.clientName) ?? projectName;

  const lead = clean(input?.leadEmail);
  const team = cleanList(input?.teamEmails).filter((email) => email !== lead);
  const roster = lead ? [`${lead} (lead)`, ...team] : team;

  const links: string[] = [];
  const tracker = clean(input?.trackerUrl);
  const staging = clean(input?.stagingUrl);
  const portal = clean(input?.portalUrl);
  if (tracker) links.push(`Tracker: ${tracker}`);
  if (staging) links.push(`Staging site: ${staging}`);
  if (portal) links.push(`Project page: ${portal}`);

  const outstanding = cleanList(input?.outstandingInputs);

  const lines: string[] = [`Hi ${addressee} team,`, ''];

  lines.push(`We have started on ${projectName}. Here is who is on it and how we plan to work.`);
  lines.push('');

  if (roster.length > 0) {
    lines.push(`On our side: ${sentenceList(roster)}.`);
    lines.push('');
  }

  if (links.length > 0) {
    lines.push('Everything lives here as we go:');
    lines.push(...links);
    lines.push('');
  }

  lines.push(cadenceSentence(input?.cadence));
  lines.push('');

  if (outstanding.length > 0) {
    lines.push('A few things we still need from you before we can get properly moving:');
    lines.push(...outstanding.map((item) => `- ${item}`));
    lines.push('');
    lines.push('Send them over whenever you have them and we will take it from there.');
    lines.push('');
  }

  // Signed by the agency rather than by whoever the lead field happens to hold:
  // the sender puts their own name here before sending, and an email address as
  // a sign-off reads like it came from a machine.
  lines.push('Thanks,');
  lines.push('ActiveSet');

  return {
    subject: `Kickoff — ${projectName}`,
    body: lines.join('\n'),
  };
}
