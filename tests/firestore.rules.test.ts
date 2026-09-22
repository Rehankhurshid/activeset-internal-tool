/**
 * Firestore security-rules suite for firestore.rules.
 *
 * Runs against the Firestore emulator, never against production:
 *
 *   npm run test:rules
 *
 * That script wraps this file in `firebase emulators:exec --only firestore
 * --project demo-activeset`, which boots the emulator on the port declared in
 * firebase.json, exports FIRESTORE_EMULATOR_HOST to this process, runs the
 * suite, then shuts the emulator down. The emulator itself needs Java 11+ on
 * PATH. See tests/README.md.
 *
 * Every `it` below is one rule assertion: who (signed-out, @gmail.com,
 * @activeset.co, admin, admin-by-claim) may do what (read / write / a
 * specifically shaped write) on which collection.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
  type TokenOptions,
} from '@firebase/rules-unit-testing';

/** Must match `--project` in the `test:rules` npm script. demo-* never touches prod. */
const PROJECT_ID = 'demo-activeset';
const RULES_FILE = path.resolve(__dirname, '..', 'firestore.rules');

const ADMIN_EMAIL = 'rehan@activeset.co'; // hardcoded in isAdmin()
const TEAM_EMAIL = 'someone@activeset.co'; // @activeset.co, not an admin
const OUTSIDER_EMAIL = 'someone@gmail.com'; // signed in, not the team
const LOOKALIKE_EMAIL = 'someone@activeset.com'; // wrong TLD; must not match /@activeset\.co$/

type Db = ReturnType<RulesTestContext['firestore']>;

let testEnv: RulesTestEnvironment;

function signedInAs(uid: string, token: TokenOptions): Db {
  return testEnv.authenticatedContext(uid, token).firestore();
}
const signedOut = (): Db => testEnv.unauthenticatedContext().firestore();
const outsider = (): Db => signedInAs('outsider-uid', { email: OUTSIDER_EMAIL });
const lookalike = (): Db => signedInAs('lookalike-uid', { email: LOOKALIKE_EMAIL });
const team = (): Db => signedInAs('team-uid', { email: TEAM_EMAIL });
const admin = (): Db => signedInAs('admin-uid', { email: ADMIN_EMAIL });
/**
 * Deliberately NOT an @activeset.co address: only the `admin` custom claim
 * (stamped by the local-dev token endpoint) should be granting access here.
 */
const claimAdmin = (): Db =>
  signedInAs('claim-admin-uid', { email: 'local-dev@example.com', admin: true });

/** Write a document with rules disabled so each test starts from known data. */
async function seed(
  collection: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection(collection).doc(id).set(data);
  });
}

const docRef = (db: Db, collection: string, id: string) =>
  db.collection(collection).doc(id);

describe('firestore.rules', { timeout: 30_000 }, () => {
  before(async () => {
    // firebase emulators:exec exports FIRESTORE_EMULATOR_HOST and the library
    // parses it. Only when that is absent (emulator started by hand) fall back
    // to the port firebase.json declares.
    const hostAndPort = process.env.FIRESTORE_EMULATOR_HOST
      ? undefined
      : { host: '127.0.0.1', port: 8080 };

    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync(RULES_FILE, 'utf8'),
        ...hostAndPort,
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  after(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  // ────────────────────────────────────────────────────────────────────────
  // projects — never public; team/admin only; apiToken can never be written
  // ────────────────────────────────────────────────────────────────────────
  describe('projects', () => {
    const project = {
      name: 'Acme',
      userId: 'owner-uid',
      webflowConfig: { siteId: 'site_1' },
    };

    beforeEach(() => seed('projects', 'p1', project));

    it('denies a signed-out read', async () => {
      await assertFails(docRef(signedOut(), 'projects', 'p1').get());
    });

    it('allows an @activeset.co user to read', async () => {
      await assertSucceeds(docRef(team(), 'projects', 'p1').get());
    });

    it('denies a signed-in @gmail.com user reading', async () => {
      await assertFails(docRef(outsider(), 'projects', 'p1').get());
    });

    it('denies an @activeset.com lookalike domain reading', async () => {
      await assertFails(docRef(lookalike(), 'projects', 'p1').get());
    });

    it('allows the admin (rehan@activeset.co) to read', async () => {
      await assertSucceeds(docRef(admin(), 'projects', 'p1').get());
    });

    it('allows a user carrying the admin:true custom claim to read', async () => {
      await assertSucceeds(docRef(claimAdmin(), 'projects', 'p1').get());
    });

    it('denies an @activeset.co update that adds webflowConfig.apiToken', async () => {
      await assertFails(
        docRef(team(), 'projects', 'p1').update({
          webflowConfig: { siteId: 'site_1', apiToken: 'wf_secret' },
        }),
      );
    });

    it('denies an @activeset.co update that sets webflowConfig.apiToken by dotted path', async () => {
      await assertFails(
        docRef(team(), 'projects', 'p1').update({
          'webflowConfig.apiToken': 'wf_secret',
        }),
      );
    });

    it('allows an @activeset.co update that leaves apiToken out (control)', async () => {
      await assertSucceeds(
        docRef(team(), 'projects', 'p1').update({ name: 'Acme (renamed)' }),
      );
    });

    it('denies an @activeset.co create that includes webflowConfig.apiToken', async () => {
      await assertFails(
        team()
          .collection('projects')
          .add({ name: 'New', userId: 'team-uid', webflowConfig: { apiToken: 'wf_secret' } }),
      );
    });

    it('allows an @activeset.co create without apiToken (control)', async () => {
      await assertSucceeds(
        team()
          .collection('projects')
          .add({ name: 'New', userId: 'team-uid', webflowConfig: { siteId: 'site_2' } }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // project_secrets — server-only (firebase-admin); nobody via the client SDK
  // ────────────────────────────────────────────────────────────────────────
  describe('project_secrets', () => {
    beforeEach(() => seed('project_secrets', 'p1', { webflowApiToken: 'wf_secret' }));

    it('denies the admin reading', async () => {
      await assertFails(docRef(admin(), 'project_secrets', 'p1').get());
    });

    it('denies the admin writing', async () => {
      await assertFails(
        docRef(admin(), 'project_secrets', 'p1').set({ webflowApiToken: 'changed' }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Per-project work data — public read (audit share page), team-only write
  // ────────────────────────────────────────────────────────────────────────
  for (const collection of ['tasks', 'project_timelines', 'project_checklists', 'requests']) {
    describe(collection, () => {
      beforeEach(() => seed(collection, 'd1', { projectId: 'p1', title: 'Existing' }));

      it('allows a signed-out read', async () => {
        await assertSucceeds(docRef(signedOut(), collection, 'd1').get());
      });

      it('denies a signed-out write', async () => {
        await assertFails(docRef(signedOut(), collection, 'new').set({ title: 'x' }));
      });

      it('denies a signed-in @gmail.com write', async () => {
        await assertFails(docRef(outsider(), collection, 'new').set({ title: 'x' }));
      });

      it('allows an @activeset.co write', async () => {
        await assertSucceeds(docRef(team(), collection, 'new').set({ title: 'x' }));
      });
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // access_control — anyone reads (nav resolves grants), only admins write
  // ────────────────────────────────────────────────────────────────────────
  describe('access_control', () => {
    beforeEach(() => seed('access_control', 'grants', { modules: {} }));

    it('allows a signed-out read', async () => {
      await assertSucceeds(docRef(signedOut(), 'access_control', 'grants').get());
    });

    it('denies an @activeset.co non-admin writing', async () => {
      await assertFails(
        docRef(team(), 'access_control', 'grants').set({ modules: { tasks: ['team-uid'] } }),
      );
    });

    it('allows the admin writing', async () => {
      await assertSucceeds(
        docRef(admin(), 'access_control', 'grants').set({ modules: { tasks: ['team-uid'] } }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // proposals / templates — team only (pricing, internal notes)
  // ────────────────────────────────────────────────────────────────────────
  for (const collection of ['proposals', 'templates']) {
    describe(collection, () => {
      beforeEach(() => seed(collection, 'd1', { title: 'Internal', price: 1000 }));

      it('denies a signed-out read', async () => {
        await assertFails(docRef(signedOut(), collection, 'd1').get());
      });

      it('denies a signed-in @gmail.com read', async () => {
        await assertFails(docRef(outsider(), collection, 'd1').get());
      });

      it('allows an @activeset.co read', async () => {
        await assertSucceeds(docRef(team(), collection, 'd1').get());
      });

      it('allows an @activeset.co write', async () => {
        await assertSucceeds(docRef(team(), collection, 'd1').update({ price: 2000 }));
      });
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // shared_proposals — public read (client share URL), team-only write
  // ────────────────────────────────────────────────────────────────────────
  describe('shared_proposals', () => {
    beforeEach(() => seed('shared_proposals', 'sp1', { proposalId: 'd1', status: 'sent' }));

    it('allows a signed-out read', async () => {
      await assertSucceeds(docRef(signedOut(), 'shared_proposals', 'sp1').get());
    });

    it('denies a signed-out write', async () => {
      await assertFails(
        docRef(signedOut(), 'shared_proposals', 'sp1').update({ status: 'signed' }),
      );
    });

    it('allows an @activeset.co write', async () => {
      await assertSucceeds(
        docRef(team(), 'shared_proposals', 'sp1').update({ status: 'revised' }),
      );
    });

    // The rule moved from `request.auth != null` to isActiveSetUser(): any
    // Firebase identity used to be enough. Without this the tightening could
    // silently regress.
    it('denies a signed-in @gmail.com write', async () => {
      await assertFails(
        docRef(outsider(), 'shared_proposals', 'sp1').update({ status: 'revised' }),
      );
    });

    it('denies an @activeset.com (wrong TLD) write', async () => {
      await assertFails(
        docRef(lookalike(), 'shared_proposals', 'sp1').update({ status: 'revised' }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // proposal_comments — public read; clients may create authorType 'client'
  // from the public view; only the team may create as 'agency' or edit/delete
  // ────────────────────────────────────────────────────────────────────────
  describe('proposal_comments', () => {
    it('allows a signed-out read', async () => {
      await seed('proposal_comments', 'c1', { proposalId: 'sp1', authorType: 'agency', body: 'Hi' });
      await assertSucceeds(docRef(signedOut(), 'proposal_comments', 'c1').get());
    });

    it("allows a signed-out create with authorType 'client'", async () => {
      await assertSucceeds(
        signedOut()
          .collection('proposal_comments')
          .add({ proposalId: 'sp1', authorType: 'client', body: 'Looks good' }),
      );
    });

    it("denies a signed-out create with authorType 'agency'", async () => {
      await assertFails(
        signedOut()
          .collection('proposal_comments')
          .add({ proposalId: 'sp1', authorType: 'agency', body: 'Spoofed' }),
      );
    });

    it('denies a signed-out update', async () => {
      await seed('proposal_comments', 'c1', { proposalId: 'sp1', authorType: 'client', body: 'Hi' });
      await assertFails(
        docRef(signedOut(), 'proposal_comments', 'c1').update({ body: 'Edited' }),
      );
    });

    it('allows an @activeset.co update', async () => {
      await seed('proposal_comments', 'c1', { proposalId: 'sp1', authorType: 'client', body: 'Hi' });
      await assertSucceeds(
        docRef(team(), 'proposal_comments', 'c1').update({ body: 'Edited' }),
      );
    });

    it("denies a signed-in @gmail.com create as 'agency'", async () => {
      await assertFails(
        outsider()
          .collection('proposal_comments')
          .add({ proposalId: 'sp1', authorType: 'agency', body: 'Spoofed' }),
      );
    });

    it('denies a signed-in @gmail.com update', async () => {
      await seed('proposal_comments', 'c1', { proposalId: 'sp1', authorType: 'client', body: 'Hi' });
      await assertFails(
        docRef(outsider(), 'proposal_comments', 'c1').update({ body: 'Edited' }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // proposal_history — team only, except the public e-sign flow may append
  // a 'signed' event
  // ────────────────────────────────────────────────────────────────────────
  describe('proposal_history', () => {
    it("allows a signed-out create with changeType 'signed'", async () => {
      await assertSucceeds(
        signedOut()
          .collection('proposal_history')
          .add({ proposalId: 'sp1', changeType: 'signed', signer: 'client@example.com' }),
      );
    });

    it("denies a signed-out create with changeType 'edited'", async () => {
      await assertFails(
        signedOut()
          .collection('proposal_history')
          .add({ proposalId: 'sp1', changeType: 'edited' }),
      );
    });

    it('denies a signed-out read', async () => {
      await seed('proposal_history', 'h1', { proposalId: 'sp1', changeType: 'edited' });
      await assertFails(docRef(signedOut(), 'proposal_history', 'h1').get());
    });

    it('allows an @activeset.co read', async () => {
      await seed('proposal_history', 'h1', { proposalId: 'sp1', changeType: 'edited' });
      await assertSucceeds(docRef(team(), 'proposal_history', 'h1').get());
    });

    it('denies a signed-in @gmail.com read', async () => {
      await seed('proposal_history', 'h1', { proposalId: 'sp1', changeType: 'edited' });
      await assertFails(docRef(outsider(), 'proposal_history', 'h1').get());
    });

    it("denies a signed-in @gmail.com create with changeType 'edited'", async () => {
      await assertFails(
        outsider()
          .collection('proposal_history')
          .add({ proposalId: 'sp1', changeType: 'edited' }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // proposal_views — server-only
  // ────────────────────────────────────────────────────────────────────────
  describe('proposal_views', () => {
    beforeEach(() => seed('proposal_views', 'v1', { proposalId: 'sp1', ip: '203.0.113.1' }));

    it('denies the admin reading', async () => {
      await assertFails(docRef(admin(), 'proposal_views', 'v1').get());
    });

    it('denies the admin writing', async () => {
      await assertFails(docRef(admin(), 'proposal_views', 'v2').set({ proposalId: 'sp1' }));
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Collections the rules never mention rely on default deny. These hold
  // client-portal tokens / view logs and must stay unreachable from the client.
  // ────────────────────────────────────────────────────────────────────────
  describe('client_portal_tokens (not in rules, default deny)', () => {
    beforeEach(() =>
      seed('client_portal_tokens', 'd1', { projectId: 'p1', active: true, tokenCiphertext: 'x' }),
    );

    it('denies the admin reading', async () => {
      await assertFails(docRef(admin(), 'client_portal_tokens', 'd1').get());
    });

    it('denies a signed-out read', async () => {
      await assertFails(docRef(signedOut(), 'client_portal_tokens', 'd1').get());
    });

    it('denies an @activeset.co read', async () => {
      await assertFails(docRef(team(), 'client_portal_tokens', 'd1').get());
    });
  });

  // Portal opens live under projects/{id}/portal_views so the Client tab can
  // order by viewedAt without a composite index. Rules do not cascade into
  // subcollections, and this path is not matched anywhere, so it is deny-by-
  // default even though the parent `projects` doc is team-readable.
  describe('projects/{id}/portal_views (subcollection, default deny)', () => {
    const viewPath = (db: Db) =>
      db.collection('projects').doc('p1').collection('portal_views').doc('v1');

    beforeEach(async () => {
      await seed('projects', 'p1', { name: 'Redesign', userId: 'team-uid' });
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx
          .firestore()
          .collection('projects')
          .doc('p1')
          .collection('portal_views')
          .doc('v1')
          .set({ projectId: 'p1', viewedAt: '2026-09-18T10:00:00.000Z', ipHash: 'abcd' });
      });
    });

    it('denies the admin reading', async () => {
      await assertFails(viewPath(admin()).get());
    });

    it('denies a signed-out read', async () => {
      await assertFails(viewPath(signedOut()).get());
    });

    it('denies an @activeset.co read even though the parent project is readable', async () => {
      await assertSucceeds(docRef(team(), 'projects', 'p1').get());
      await assertFails(viewPath(team()).get());
    });

    it('denies an @activeset.co write', async () => {
      await assertFails(viewPath(team()).set({ projectId: 'p1', viewedAt: 'now' }));
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Updates the team posts to the client's portal: team-only from the browser.
  // ────────────────────────────────────────────────────────────────────────
  describe('projects/{id}/pages (delivery tracker)', () => {
    const pageRef = (db: Db) => db.collection('projects').doc('p1').collection('pages').doc('pg1');

    beforeEach(async () => {
      await seed('projects', 'p1', { name: 'Redesign', userId: 'team-uid' });
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx
          .firestore()
          .collection('projects')
          .doc('p1')
          .collection('pages')
          .doc('pg1')
          .set({ path: '/pricing', title: 'Pricing', order: 0, work: { copy: 'completed' } });
      });
    });

    it('allows an @activeset.co read', async () => {
      await assertSucceeds(pageRef(team()).get());
    });

    it('allows an @activeset.co write', async () => {
      await assertSucceeds(pageRef(team()).update({ 'work.design': 'in_progress' }));
    });

    it('denies a signed-out read', async () => {
      await assertFails(pageRef(signedOut()).get());
    });

    it('denies a signed-in @gmail.com write', async () => {
      await assertFails(pageRef(outsider()).update({ 'work.design': 'completed' }));
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // webflow_sessions — deliberately open: the Webflow extension talks to it
  // without Firebase Auth. This test documents that exception; if it starts
  // failing, someone tightened the rule and the extension needs a new path.
  // ────────────────────────────────────────────────────────────────────────
  describe('webflow_sessions (deliberate public exception)', () => {
    beforeEach(() => seed('webflow_sessions', 's1', { siteId: 'site_1', user: 'x' }));

    it('allows a signed-out read', async () => {
      await assertSucceeds(docRef(signedOut(), 'webflow_sessions', 's1').get());
    });

    it('allows a signed-out write', async () => {
      await assertSucceeds(
        docRef(signedOut(), 'webflow_sessions', 's2').set({ siteId: 'site_1', user: 'y' }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // projects/{id}/image_index — the team reads it; only the worker writes it
  // ────────────────────────────────────────────────────────────────────────
  describe('image_index', () => {
    const INDEX = 'projects/p1/image_index';
    const entry = {
      fingerprint: 'cdn.test/site/a.webp',
      src: 'https://cdn.test/site/a.webp',
      optimise: { state: 'optimised', at: '2026-09-23T00:00:00Z', width: null },
    };

    beforeEach(async () => {
      await seed('projects', 'p1', { name: 'Acme', userId: 'owner-uid' });
      await seed(INDEX, 'img_1', entry);
    });

    it('lets the team read what has been done to each image', async () => {
      await assertSucceeds(docRef(team(), INDEX, 'img_1').get());
    });

    it('refuses a write from the browser, even from the team', async () => {
      // A row saying "optimised" that the worker never wrote would make runs
      // skip real work, so only the admin SDK writes here.
      await assertFails(docRef(team(), INDEX, 'img_2').set(entry));
      await assertFails(docRef(team(), INDEX, 'img_1').update({ 'optimise.state': 'failed' }));
    });

    it('refuses the admin writing from the browser too', async () => {
      await assertFails(docRef(admin(), INDEX, 'img_2').set(entry));
    });

    it('denies anyone outside the team reading it', async () => {
      await assertFails(docRef(outsider(), INDEX, 'img_1').get());
      await assertFails(docRef(signedOut(), INDEX, 'img_1').get());
    });
  });
});
