import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildKickoffEmail, type KickoffEmailInput } from './kickoff.email';

function input(overrides: Partial<KickoffEmailInput> = {}): KickoffEmailInput {
  return {
    projectName: 'Muffins Website',
    clientName: 'Muffins',
    teamEmails: ['salman@activeset.co', 'aditi@activeset.co'],
    leadEmail: 'rehan@activeset.co',
    trackerUrl: 'https://docs.google.com/spreadsheets/d/abc',
    stagingUrl: 'https://muffins.webflow.io',
    portalUrl: 'https://app.activeset.co/portal/xyz',
    cadence: 'weekly',
    outstandingInputs: ['Assets folder', 'Domain registrar access'],
    ...overrides,
  };
}

/** Anything that betrays a value we failed to fill in. */
const PLACEHOLDERS = ['undefined', 'null', 'NaN', '[object Object]', '{}', '${'];

function assertNoPlaceholders(text: string, label: string): void {
  for (const needle of PLACEHOLDERS) {
    assert.ok(!text.includes(needle), `${label} leaked "${needle}": ${text}`);
  }
}

describe('buildKickoffEmail', () => {
  it('names the project in the subject and the client in the greeting', () => {
    const { subject, body } = buildKickoffEmail(input());
    assert.equal(subject, 'Kickoff — Muffins Website');
    assert.ok(body.startsWith('Hi Muffins team,'));
    assert.ok(body.includes('We have started on Muffins Website.'));
  });

  it('falls back to the project name when there is no client name', () => {
    const withoutClient = buildKickoffEmail(input({ clientName: undefined }));
    assert.ok(withoutClient.body.startsWith('Hi Muffins Website team,'));

    // A blank client name is the same as none: projects get saved with empty
    // strings in optional fields all the time.
    const blankClient = buildKickoffEmail(input({ clientName: '   ' }));
    assert.ok(blankClient.body.startsWith('Hi Muffins Website team,'));
  });

  it('lists the lead first and marks them, without repeating them', () => {
    const { body } = buildKickoffEmail(
      input({ teamEmails: ['rehan@activeset.co', 'salman@activeset.co'] }),
    );
    assert.ok(body.includes('On our side: rehan@activeset.co (lead) and salman@activeset.co.'));
    assert.equal(body.match(/rehan@activeset\.co/g)?.length, 1);
  });

  it('omits the team line when nobody is named', () => {
    const { body } = buildKickoffEmail(input({ teamEmails: [], leadEmail: undefined }));
    assert.ok(!body.includes('On our side'));
  });

  describe('outstanding inputs', () => {
    it('asks for them as a short bulleted list', () => {
      const { body } = buildKickoffEmail(input());
      assert.ok(body.includes('A few things we still need from you'));
      assert.ok(body.includes('- Assets folder'));
      assert.ok(body.includes('- Domain registrar access'));
    });

    it('omits the section entirely when nothing is outstanding', () => {
      const { body } = buildKickoffEmail(input({ outstandingInputs: [] }));
      assert.ok(!body.includes('still need from you'));
      assert.ok(!body.includes('outstanding'));
      assert.ok(!body.includes('- '));
      // It should still end properly rather than trailing a dangling heading.
      assert.ok(body.trimEnd().endsWith('ActiveSet'));
    });

    it('drops empty and duplicate asks rather than printing empty bullets', () => {
      const { body } = buildKickoffEmail(
        input({ outstandingInputs: ['Fonts', '  ', 'Fonts', ''] }),
      );
      assert.equal(body.match(/^- /gm)?.length, 1);
      assert.ok(body.includes('- Fonts'));
    });
  });

  describe('cadence', () => {
    it('proposes a weekly call', () => {
      const { body } = buildKickoffEmail(input({ cadence: 'weekly' }));
      assert.ok(body.includes('a short call every week'));
      assert.ok(!body.includes('every two weeks'));
    });

    it('proposes a fortnightly call', () => {
      const { body } = buildKickoffEmail(input({ cadence: 'biweekly' }));
      assert.ok(body.includes('a short call every two weeks'));
      assert.ok(!body.includes('every week'));
    });

    it('says there is no standing call rather than proposing one', () => {
      const { body } = buildKickoffEmail(input({ cadence: 'none' }));
      assert.ok(body.includes('not set up a standing call'));
      assert.ok(!body.includes('every week'));
      assert.ok(!body.includes('every two weeks'));
    });

    it('treats an unrecognised cadence as no standing call', () => {
      const { body } = buildKickoffEmail(
        input({ cadence: 'monthly' as KickoffEmailInput['cadence'] }),
      );
      assert.ok(body.includes('not set up a standing call'));
      assertNoPlaceholders(body, 'body');
    });
  });

  describe('links', () => {
    it('lists each link that exists', () => {
      const { body } = buildKickoffEmail(input());
      assert.ok(body.includes('Tracker: https://docs.google.com/spreadsheets/d/abc'));
      assert.ok(body.includes('Staging site: https://muffins.webflow.io'));
      assert.ok(body.includes('Project page: https://app.activeset.co/portal/xyz'));
    });

    it('omits the links that are missing', () => {
      const { body } = buildKickoffEmail(
        input({ stagingUrl: undefined, portalUrl: '' }),
      );
      assert.ok(body.includes('Tracker: https://docs.google.com/spreadsheets/d/abc'));
      assert.ok(!body.includes('Staging site'));
      assert.ok(!body.includes('Project page'));
    });

    it('omits the whole block when there are no links yet', () => {
      const { body } = buildKickoffEmail(
        input({ trackerUrl: undefined, stagingUrl: undefined, portalUrl: undefined }),
      );
      assert.ok(!body.includes('Everything lives here'));
      assert.ok(!body.includes('http'));
    });
  });

  describe('never prints a placeholder', () => {
    it('with a full input', () => {
      const { subject, body } = buildKickoffEmail(input());
      assertNoPlaceholders(subject, 'subject');
      assertNoPlaceholders(body, 'body');
    });

    it('with every optional field missing', () => {
      const { subject, body } = buildKickoffEmail({
        projectName: 'Northwind Rebuild',
        teamEmails: [],
        cadence: 'none',
        outstandingInputs: [],
      });
      assertNoPlaceholders(subject, 'subject');
      assertNoPlaceholders(body, 'body');
      assert.ok(body.includes('Northwind Rebuild'));
    });

    it('with the junk a half-filled project document actually produces', () => {
      // Firestore hands back whatever was written; optional fields come back
      // null, arrays come back with holes, and nothing here is validated on the
      // way in. None of it may reach the client's inbox.
      const junk = {
        projectName: null,
        clientName: undefined,
        teamEmails: [undefined, null, 'salman@activeset.co', 42, {}],
        leadEmail: null,
        trackerUrl: undefined,
        stagingUrl: null,
        portalUrl: {},
        cadence: undefined,
        outstandingInputs: [null, undefined, 'Fonts', {}, ['nested']],
      } as unknown as KickoffEmailInput;

      const { subject, body } = buildKickoffEmail(junk);
      assertNoPlaceholders(subject, 'subject');
      assertNoPlaceholders(body, 'body');
      assert.ok(body.includes('salman@activeset.co'));
      assert.ok(body.includes('- Fonts'));
      assert.equal(body.match(/^- /gm)?.length, 1);
    });

    it('with no input at all', () => {
      const { subject, body } = buildKickoffEmail(undefined as unknown as KickoffEmailInput);
      assertNoPlaceholders(subject, 'subject');
      assertNoPlaceholders(body, 'body');
    });
  });

  it('stays plain text — no HTML, no emoji, no markdown emphasis', () => {
    const { body } = buildKickoffEmail(input());
    assert.ok(!/[<>]/.test(body));
    assert.ok(!/\*\*|__/.test(body));
    assert.ok(!/\p{Extended_Pictographic}/u.test(body));
  });
});
