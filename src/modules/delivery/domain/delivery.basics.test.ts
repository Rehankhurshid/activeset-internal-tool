import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { agencyBasicsFor, basicsGap, sectionsWithBasics } from './delivery.basics';
import { AGENCY_CLOSE, AGENCY_START } from '@/lib/sop-templates';
import type { ChecklistSection, ProjectChecklist } from '@/types';

function section(title: string, order: number, titles: string[]): ChecklistSection {
  return {
    id: `sec_${order}`,
    title,
    order,
    // Ids unique across the whole checklist, as Firestore's are — a fixture that
    // repeats them would hide a real collision in the code under test.
    items: titles.map((t, i) => ({
      id: `item_${order}_${i}`,
      title: t,
      status: 'not_started' as const,
      order: i,
    })),
  };
}

function checklist(sections: ChecklistSection[]): ProjectChecklist {
  return {
    id: 'c1',
    projectId: 'p1',
    templateId: 'custom_v1',
    templateName: 'Figma to Webflow',
    sections,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** What a real project made from somebody's own template looks like. */
const EXISTING = checklist([
  section('Input', 0, [
    'Collect brand assets (logo, fonts, colour codes, guidelines)',
    'Analytics: Google Tag Manager, Google Analytics & Microsoft Clarity Code',
  ]),
  section('Step 1: Project Planning', 1, ['Create Slack Channel with Client. Workflow: Setup Channel']),
]);

describe('what a project is missing', () => {
  it('offers the agency steps it does not have', () => {
    const titles = basicsGap(EXISTING).missing.map((m) => m.item.title);
    assert.ok(titles.some((t) => /welcome email/i.test(t)));
    assert.ok(titles.some((t) => /kickoff call/i.test(t)));
    assert.ok(titles.some((t) => /walkthrough videos/i.test(t)));
  });

  it('covers both ends of the project', () => {
    const placements = new Set(basicsGap(EXISTING).missing.map((m) => m.placement));
    assert.deepEqual([...placements].sort(), ['close', 'start']);
  });

  it('never offers a step the project already has word for word', () => {
    const already = checklist([
      section('Setup', 0, [AGENCY_START.items[0].title, AGENCY_CLOSE.items[0].title]),
    ]);
    const gap = basicsGap(already);
    assert.equal(gap.alreadyPresent.length, 2);
    const offered = gap.missing.map((m) => m.item.title);
    assert.ok(!offered.includes(AGENCY_START.items[0].title));
    assert.ok(!offered.includes(AGENCY_CLOSE.items[0].title));
  });

  it('flags a step the project words differently, rather than pretending it is new', () => {
    // "Create Slack Channel with Client" against "Create the shared Slack
    // channel with the client". No title match spots that; a person does.
    const slack = basicsGap(EXISTING).missing.find((m) => /slack/i.test(m.item.title));
    assert.ok(slack, 'the Slack step should still be offered');
    assert.match(slack!.resembles ?? '', /Create Slack Channel with Client/);
  });

  it('leaves genuinely unrelated steps unflagged', () => {
    const email = basicsGap(EXISTING).missing.find((m) => /welcome email/i.test(m.item.title));
    assert.equal(email?.resembles, undefined);
  });

  it('offers everything to a project with an empty checklist', () => {
    const empty = basicsGap(checklist([]));
    assert.equal(empty.missing.length, AGENCY_START.items.length + AGENCY_CLOSE.items.length);
    assert.deepEqual(empty.alreadyPresent, []);
  });

  it('does not confuse scheduling the kickoff call with running it', () => {
    // Two different steps, and scheduling it gates the whole project. Scoring
    // shared words against the *shorter* title made a 0.67 match out of these,
    // so the blocking first step of every engagement arrived unticked, blamed
    // on a step that was not it. Being flagged is fine; being unticked is not.
    const hasHold = checklist([section('Planning', 0, ['Hold the kickoff call'])]);
    const schedule = basicsGap(hasHold).missing.find((m) => /^Schedule the kickoff call/.test(m.item.title));
    assert.ok(schedule, 'scheduling the call should still be offered');
    assert.equal(schedule!.likelyDuplicate, undefined, 'and must not arrive unticked');
  });

  it('does not confuse the internal kickoff with the client call either', () => {
    const hasCall = checklist([section('Planning', 0, ['Hold the kickoff call'])]);
    const internal = basicsGap(hasCall).missing.find((m) => /internal kickoff/i.test(m.item.title));
    assert.ok(internal);
    assert.equal(internal!.likelyDuplicate, undefined);
  });

  it('still ticks a weak resemblance, because missing a step costs more than a duplicate', () => {
    // Nobody notices the welcome email that was never on the list. A duplicate
    // takes two seconds to delete.
    const slack = basicsGap(EXISTING).missing.find((m) => /slack/i.test(m.item.title));
    assert.ok(slack!.resembles, 'the resemblance should still be shown');
    assert.equal(slack!.likelyDuplicate, undefined, 'but not strong enough to untick it');
  });

  it('unticks only something almost certainly the same step', () => {
    const near = checklist([
      section('Handover', 0, ['Record the walkthrough videos for the client']),
    ]);
    const walkthrough = basicsGap(near).missing.find((m) => /walkthrough videos/i.test(m.item.title));
    assert.ok(walkthrough?.resembles);
    assert.equal(walkthrough?.likelyDuplicate, true);
  });

  it('gives every offer a distinct key', () => {
    const keys = basicsGap(EXISTING).missing.map((m) => m.key);
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe('adding them', () => {
  const gap = basicsGap(EXISTING);

  it('puts the setup steps first and the close last', () => {
    const next = sectionsWithBasics(EXISTING.sections, gap.missing);
    assert.equal(next[0].title, AGENCY_START.title);
    assert.equal(next[next.length - 1].title, AGENCY_CLOSE.title);
  });

  it('keeps the project’s own stages, in their order', () => {
    const next = sectionsWithBasics(EXISTING.sections, gap.missing);
    const own = next.filter((s) => s.title === 'Input' || s.title === 'Step 1: Project Planning');
    assert.deepEqual(own.map((s) => s.title), ['Input', 'Step 1: Project Planning']);
  });

  it('numbers the result without gaps', () => {
    const next = sectionsWithBasics(EXISTING.sections, gap.missing);
    assert.deepEqual(next.map((s) => s.order), next.map((_, i) => i));
  });

  it('adds only what was chosen', () => {
    const one = gap.missing.filter((m) => /welcome email/i.test(m.item.title));
    const next = sectionsWithBasics(EXISTING.sections, one);
    const added = next.find((s) => s.title === AGENCY_START.title);
    assert.deepEqual(added?.items.map((i) => i.title), one.map((m) => m.item.title));
  });

  it('carries the guidance across, not just the title', () => {
    const withHowTo = gap.missing.find((m) => m.item.howTo);
    assert.ok(withHowTo, 'the basics should carry how-to text');
    const next = sectionsWithBasics(EXISTING.sections, [withHowTo!]);
    const added = next.find((s) => s.title === withHowTo!.sectionTitle);
    assert.equal(added?.items[0].howTo, withHowTo!.item.howTo);
  });

  it('starts every added step unanswered, whatever the template said', () => {
    const next = sectionsWithBasics(EXISTING.sections, gap.missing);
    const added = next.filter((s) => s.title === AGENCY_START.title || s.title === AGENCY_CLOSE.title);
    for (const section of added) {
      for (const i of section.items) assert.equal(i.status, 'not_started');
    }
  });

  it('gives every added step its own id', () => {
    const next = sectionsWithBasics(EXISTING.sections, gap.missing);
    const ids = next.flatMap((s) => s.items.map((i) => i.id));
    assert.equal(new Set(ids).size, ids.length);
  });

  it('joins an existing section rather than making a second one', () => {
    // Running it twice must not leave a project with two "Start: client setup".
    const once = sectionsWithBasics(EXISTING.sections, gap.missing);
    const remaining = basicsGap(checklist(once)).missing;
    const twice = sectionsWithBasics(once, remaining);
    assert.equal(twice.filter((s) => s.title === AGENCY_START.title).length, 1);
    assert.equal(twice.filter((s) => s.title === AGENCY_CLOSE.title).length, 1);
  });

  it('is settled after one round: nothing is left to offer', () => {
    const next = sectionsWithBasics(EXISTING.sections, gap.missing);
    assert.deepEqual(basicsGap(checklist(next)).missing, []);
  });

  it('changes nothing when nothing is chosen', () => {
    assert.equal(sectionsWithBasics(EXISTING.sections, []), EXISTING.sections);
  });
});

describe('a checklist being created', () => {
  it('is wrapped with the basics, whatever template it came from', () => {
    const own = [section('Phase 1', 0, ['Do the work'])];
    const next = agencyBasicsFor(own);
    assert.deepEqual(next.map((s) => s.title), [AGENCY_START.title, 'Phase 1', AGENCY_CLOSE.title]);
  });

  it('gives the wrapper sections their roles, so Delivery knows what they are', () => {
    const next = agencyBasicsFor([section('Phase 1', 0, ['Do the work'])]);
    assert.equal(next[0].role, 'kickoff');
    assert.equal(next[next.length - 1].role, 'client_review');
  });

  it('lets a template that already says a step keep its own wording', () => {
    const own = [section('Setup', 0, [AGENCY_START.items[0].title])];
    const next = agencyBasicsFor(own);
    const titles = next.flatMap((s) => s.items.map((i) => i.title));
    assert.equal(titles.filter((t) => t === AGENCY_START.items[0].title).length, 1);
  });

  it('numbers everything and leaves nothing answered', () => {
    const next = agencyBasicsFor([section('Phase 1', 0, ['Do the work'])]);
    assert.deepEqual(next.map((s) => s.order), next.map((_, i) => i));
    for (const s of next) {
      assert.deepEqual(s.items.map((i) => i.order), s.items.map((_, i) => i));
    }
  });
});

describe('what the standard steps actually carry', () => {
  const all = [...AGENCY_START.items, ...AGENCY_CLOSE.items];
  const byTitle = (pattern: RegExp) => all.find((i) => pattern.test(i.title));

  it('records when the kickoff call happened and where the recording is', () => {
    // "It happened" is a tick. When, and where the recording is, are what
    // anyone needs three weeks later.
    const run = byTitle(/^Run the kickoff call/);
    assert.ok(run, 'there should be a step for running the call');
    const ids = run!.fields?.map((f) => f.type);
    assert.ok(ids?.includes('date'));
    assert.ok(ids?.includes('url'));
  });

  it('separates scheduling the call from running it, and says which is which', () => {
    // "Book" and "Hold" read as the same thing at a glance.
    assert.ok(byTitle(/^Schedule the kickoff call/));
    assert.ok(byTitle(/^Run the kickoff call/));
    for (const step of [byTitle(/^Schedule the kickoff call/), byTitle(/^Run the kickoff call/)]) {
      assert.ok(step?.howTo, `${step?.title} should explain itself`);
    }
  });

  it('lets the Slack step record the channel and who was invited', () => {
    const slack = byTitle(/Slack channel/);
    const types = slack?.fields?.map((f) => f.type);
    assert.ok(types?.includes('emails'), 'no way to record who was invited');
    assert.ok(slack?.links?.length, 'no way to get to Slack');
  });

  it('gives the cadence step a message with the options to offer', () => {
    const cadence = byTitle(/sync cadence/i);
    assert.ok(cadence?.template?.body, 'no message to send');
    assert.ok((cadence?.template?.options?.length ?? 0) >= 2, 'no options to choose between');
  });

  it('gives every standard step something beyond its title', () => {
    for (const step of all) {
      const hasContext =
        Boolean(step.howTo) ||
        Boolean(step.links?.length) ||
        Boolean(step.fields?.length) ||
        Boolean(step.template?.body);
      assert.ok(hasContext, `"${step.title}" is a bare checkbox`);
    }
  });

  it('never ships a recorded value on a template step', () => {
    // Values belong to a project. A template carrying one would hand the same
    // answer to every future project.
    for (const step of all) {
      assert.equal((step as { values?: unknown }).values, undefined, `${step.title} carries values`);
    }
  });

  it('gives every field a distinct id within its step', () => {
    for (const step of all) {
      const ids = (step.fields ?? []).map((f) => f.id);
      assert.equal(new Set(ids).size, ids.length, `${step.title} repeats a field id`);
    }
  });
});
