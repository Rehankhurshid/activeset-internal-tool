import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { kindFromName, languageOf, planTabs } from './project-sheet.contract';
import { readProjectSheet, workItemState } from './project-sheet.read';
import { readChangeState, readDate, readOwner, readStatus } from './project-sheet.values';
import { DIFFERENT_AI, LAUNCH_PLAN, REVPACK, TODAY, WEBFLOW_TEMPLATE, tab } from './project-sheet.fixtures';

const roles = (titles: string[]) => Object.fromEntries(planTabs(titles).map((p) => [p.title, p.role]));

describe('tab names', () => {
  it('recognises the tabs every tracker since 2024 has used', () => {
    assert.deepEqual(
      roles([
        'Overview', 'Page Tracker', 'Lottie Tracker', 'Timeline', 'Client Inputs', 'Forms & Analytics', 'SEO Tags',
        'Schema & AEO', 'Launch Checklist', 'Change Log',
      ]),
      {
        Overview: 'overview', 'Page Tracker': 'tracker', 'Lottie Tracker': 'tracker', Timeline: 'timeline',
        'Client Inputs': 'inputs', 'Forms & Analytics': 'ignored', 'SEO Tags': 'seo', 'Schema & AEO': 'ignored',
        'Launch Checklist': 'launch', 'Change Log': 'changes',
      },
    );
    assert.deepEqual(
      roles(['Project Tracker', 'SEO Tags – English [Fill this]', 'SEO Tags – Spanish [Fill this]', 'Title/ Description [Fill this]', 'REDIRECTS', '301 Redirects', 'Blog Migration', 'Project Global Checklist', 'Organisation Schema [Fill this]', 'Sheet20', 'Copy of Blogs ° EN', 'QC Master Checklist – Pagewise', 'Sitemap', 'ALT Text']),
      {
        'Project Tracker': 'tracker', 'SEO Tags – English [Fill this]': 'seo', 'SEO Tags – Spanish [Fill this]': 'seo',
        'Title/ Description [Fill this]': 'seo', REDIRECTS: 'redirects', '301 Redirects': 'redirects', 'Blog Migration': 'tracker',
        'Project Global Checklist': 'launch', 'Organisation Schema [Fill this]': 'fill', Sheet20: 'ignored',
        'Copy of Blogs ° EN': 'ignored', 'QC Master Checklist – Pagewise': 'ignored', Sitemap: 'ignored', 'ALT Text': 'ignored',
      },
    );
    assert.deepEqual(roles(['Pages', 'Launch tracker', 'Decisions', 'Budget', 'SKU costing', 'Weekly scorecard', 'Start here', 'Tasks', 'Change log', 'Pooja review']), {
      Pages: 'tracker', 'Launch tracker': 'tracker', Decisions: 'inputs', Budget: 'ignored', 'SKU costing': 'ignored',
      'Weekly scorecard': 'ignored', 'Start here': 'overview', Tasks: 'tracker', 'Change log': 'changes', 'Pooja review': 'ignored',
    });
  });

  it('lets the team map or ignore any tab', () => {
    const plan = planTabs(['Broken links', 'REDIRECTS', 'Overview'], { 'Broken links': 'tracker', REDIRECTS: 'ignored' });
    assert.deepEqual(plan.map((p) => [p.role, p.how]), [['tracker', 'team'], ['ignored', 'team'], ['overview', 'name']]);
  });

  it('reads a language off a tab name', () => {
    assert.equal(languageOf('SEO Tags – English [Fill this]'), 'English');
    assert.equal(languageOf('SEO Tags - ES'), 'ES');
    assert.equal(languageOf('SEO Tags'), undefined);
    assert.equal(kindFromName('Webflow Session Tracker'), 'tracker');
  });
});

describe('cell values', () => {
  it('reads every status word found in the trackers into one legend', () => {
    const cases: [string, string][] = [
      ['Not Started', 'not_started'], ['', 'not_started'], ['Pending', 'not_started'], ['FALSE', 'not_started'],
      ['In Progress', 'in_progress'], ['WIP', 'in_progress'], ['In Development', 'in_progress'],
      ['Ready for Review', 'in_review'], ['To Be Reviewed', 'in_review'], ['With client', 'in_review'],
      // The team's own reviews are still work in progress, never "Ready for your review".
      ['In Development Review', 'in_progress'], ['QA', 'in_progress'], ['Internal review', 'in_progress'],
      // A negation is never progress.
      ['Not received', 'not_started'], ['Not yet received', 'not_started'], ['Not done', 'not_started'],
      ['Not approved', 'not_started'], ['Not Started 🔴', 'not_started'], ['Not started yet', 'not_started'], ['Yet to start', 'not_started'],
      ['Changes Requested', 'changes'], ['Approved', 'done'], ['Completed', 'done'], ['Received', 'done'], ['TRUE', 'done'], ['Completed ✅', 'done'],
      ['Blocked', 'blocked'], ['Deferred', 'blocked'], ['N/A', 'not_needed'], ['N/R', 'not_needed'],
    ];
    for (const [word, state] of cases) assert.equal(readStatus(word).state, state, word);
    assert.deepEqual(readStatus('Pinged Arth'), { state: 'in_progress', unknown: true });
  });

  it('reads the date forms the sheets use', () => {
    assert.deepEqual(readDate('31 Aug', TODAY), { iso: '2026-08-31' });
    assert.deepEqual(readDate('Mon, 31 Aug 2026', TODAY), { iso: '2026-08-31' });
    assert.deepEqual(readDate('27/04/2026', TODAY), { iso: '2026-04-27' });
    assert.deepEqual(readDate('04/27/2026', TODAY), { iso: '2026-04-27' });
    // The sheet's locale decides an ambiguous one: 10/2/2026 is 10 Feb in India, 2 Oct in the US.
    assert.deepEqual(readDate('10/2/2026', TODAY), { iso: '2026-02-10' });
    assert.deepEqual(readDate('10/2/2026', TODAY, true), { iso: '2026-10-02' });
    assert.deepEqual(readDate('2026-10-05', TODAY), { iso: '2026-10-05' });
    assert.deepEqual(readDate('Sep 7, 2026', TODAY), { iso: '2026-09-07' });
    assert.deepEqual(readDate('Day 1', TODAY), { text: 'Day 1' });
    assert.equal(readDate('', TODAY), undefined);
    // A year-less date lands in the nearest year: "02 Jan" read in December is next January.
    assert.deepEqual(readDate('02 Jan', new Date('2026-12-20T00:00:00Z')), { iso: '2027-01-02' });
  });

  it('keeps owners as a role, never a name', () => {
    assert.equal(readOwner('Client'), 'client');
    assert.equal(readOwner('Rehan + Client'), 'both');
    assert.equal(readOwner('Both'), 'both');
    assert.equal(readOwner('ActiveSet'), 'team');
    assert.equal(readOwner('Arth'), 'team');
    assert.equal(readOwner(''), undefined);
  });

  it('reads change request states', () => {
    assert.equal(readChangeState(''), 'proposed');
    assert.equal(readChangeState('Proposed'), 'proposed');
    assert.equal(readChangeState('Approved'), 'approved');
    assert.equal(readChangeState('Declined'), 'declined');
    assert.equal(readChangeState('Done'), 'done');
    // Still a question for the client, whatever the word "approval" in it.
    assert.equal(readChangeState('Pending approval'), 'proposed');
    assert.equal(readChangeState('Awaiting client approval'), 'proposed');
    assert.equal(readChangeState('Sent for approval'), 'proposed');
    assert.equal(readChangeState('In progress'), 'approved');
    assert.equal(readChangeState('Not approved'), 'declined');
  });
});

describe('readProjectSheet: Different AI', () => {
  const { data, report } = readProjectSheet(DIFFERENT_AI, { today: TODAY });
  const byTitle = Object.fromEntries(report.tabs.map((t) => [t.title, t]));

  it('reports every tab in sheet order, with what it was read as', () => {
    assert.deepEqual(report.tabs.map((t) => [t.title, t.role]), [
      ['Overview', 'overview'], ['Page Tracker', 'tracker'], ['Lottie Tracker', 'tracker'], ['Timeline', 'timeline'],
      ['Client Inputs', 'inputs'], ['Forms & Analytics', 'ignored'], ['SEO Tags', 'seo'], ['Launch Checklist', 'launch'], ['Change Log', 'changes'],
    ]);
    assert.equal(byTitle['Page Tracker'].headerRow, 3, 'found below the merged title and description');
    assert.equal(byTitle['Forms & Analytics'].rows, 0, 'an ignored tab is never read');
    assert.deepEqual(report.unknownStatuses, []);
  });

  it('reads the Overview facts and key links, and never the money', () => {
    const o = data.overview!;
    assert.equal(o.engagement, 'Webflow build (5 to 6 pages, Client-First) + 4 to 5 Lottie animations');
    assert.deepEqual(o.kickoff, { iso: '2026-08-31' });
    assert.deepEqual(o.targetLaunch, { iso: '2026-09-27' });
    assert.deepEqual(o.links.map((l) => l.title), ['Figma / design source', 'Webflow staging', 'HubSpot portal']);
    assert.equal(o.phaseNames['1'], 'Foundation and motion direction');
    assert.equal(JSON.stringify(o).includes('4,500'), false);
  });

  it('reads trackers as workstreams, with tracks from the status columns only', () => {
    assert.deepEqual(data.workstreams.map((w) => w.title), ['Page Tracker', 'Lottie Tracker']);
    const pages = data.workstreams[0];
    assert.deepEqual(pages.tracks.map((t) => t.label), ['Copy', 'Design', 'Dev: Desktop', 'Dev: Mobile', 'Forms / Analytics']);
    assert.deepEqual(pages.items.map((i) => i.title), ['Design system', 'Navigation', 'Home', 'Product', 'Company'], 'the footnote is not a page');
    assert.deepEqual(pages.items.map((i) => i.group), ['Global components', 'Global components', 'Core pages', 'Core pages', 'Core pages']);
    const home = pages.items[2];
    assert.deepEqual(home.states, ['done', 'done', 'in_review', 'in_progress', 'not_started']);
    assert.equal(workItemState(home), 'in_review');
    assert.equal(home.phaseKey, '2');
    assert.deepEqual(home.target, { iso: '2026-09-13' });
    assert.deepEqual(home.links, [
      { title: 'Design', url: 'https://www.figma.com/design/abc?node-id=1' },
      { title: 'Staging', url: 'https://northwind.webflow.io/' },
    ]);
    assert.equal(workItemState(pages.items[0]), 'done', 'N/A tracks do not hold a row back');
    assert.equal(JSON.stringify(data.workstreams).includes('SECRET'), false, 'notes are never read');
    assert.equal(JSON.stringify(data.workstreams).includes('Arth'), false, 'assignees are never read');
  });

  it('finds Lottie tracks by their cells, skips flags, and stops at the footnote', () => {
    const lottie = data.workstreams[1];
    assert.deepEqual(lottie.tracks.map((t) => t.label), ['Concept / Storyboard', 'Illustration prep', 'Animation', 'Optimised export', 'Implementation', 'Mobile fallback']);
    assert.deepEqual(lottie.items.map((i) => i.title), ['Hero motion: Home', 'Solution / how it works'], 'the production pipeline below is not read');
  });

  it('reads the Timeline into phases named from the Overview, with whose step each is', () => {
    const phases = data.timeline!.phases;
    assert.deepEqual(phases.map((p) => [p.key, p.title, p.milestones.length]), [
      ['1', 'Foundation and motion direction', 3],
      ['2', 'Core pages and animation production', 2],
      ['3', 'Remaining pages, integrations and motion', 1],
      ['4', 'QA, review and launch', 1],
    ]);
    const [kickoff, handover] = phases[0].milestones;
    assert.equal(kickoff.owner, 'both');
    assert.equal(handover.owner, 'client');
    assert.deepEqual(handover.start, { iso: '2026-08-31' });
    assert.deepEqual(handover.end, { iso: '2026-09-01' });
    assert.equal(handover.state, 'done');
    assert.equal(phases[1].milestones[1].owner, 'client');
  });

  it('reads client inputs with their sections, and decisions as decisions', () => {
    assert.deepEqual(
      data.inputs.map((i) => [i.title.slice(0, 20), i.state, i.group, i.kind]),
      [
        ['Final approved desig', 'received', 'Design and brand', 'input'],
        ['Founder photos, pres', 'pending', 'Design and brand', 'input'],
        ['HubSpot: portal acce', 'pending', 'Access', 'input'],
        ['Pricing page: in sco', 'pending', 'Decisions', 'decision'],
        ['Careers section on C', 'not_needed', 'Decisions', 'decision'],
      ],
    );
    const hubspot = data.inputs[2];
    assert.equal(hubspot.why, 'Form integration, field mapping');
    assert.deepEqual(hubspot.neededBy, { iso: '2026-09-10' });
    assert.equal(hubspot.owner, 'Marketing lead');
    assert.equal(data.inputs[0].link, 'https://www.figma.com/design/abc');
  });

  it('reads SEO tags and the redirects table inside the same tab', () => {
    assert.deepEqual(data.seo, [{ tab: 'SEO Tags', pages: 3, filled: 1 }]);
    assert.deepEqual(data.redirects, { total: 2, mapped: 1, tested: 1 });
    assert.match(byTitle['SEO Tags'].warnings.join(' '), /2 redirects from a second table/);
  });

  it('reads the launch checklist by section, leaving N/A out', () => {
    assert.deepEqual(
      data.launch!.groups.map((g) => [g.title, g.checks.length, g.checks.filter((c) => c.done).length]),
      [['Content', 2, 1], ['Motion', 1, 0]],
    );
  });

  it('reads change requests, skipping empty CR rows and the total', () => {
    assert.deepEqual(data.changes.map((c) => [c.ref, c.title, c.state, c.estimate]), [
      ['CR-01', 'Add a Pricing page', 'proposed', '$350'],
      ['CR-02', 'Extra Lottie on the Demo hero', 'approved', '$250'],
    ]);
    assert.equal(JSON.stringify(data.changes).includes('SECRET'), false);
  });
});

describe('readProjectSheet: the 2024 template', () => {
  const { data, report } = readProjectSheet(WEBFLOW_TEMPLATE, { today: TODAY });
  const byTitle = Object.fromEntries(report.tabs.map((t) => [t.title, t]));

  it('reads a two-row header, a SET heading, and skips numbered empty rows', () => {
    const pages = data.workstreams.find((w) => w.title === 'Project Tracker')!;
    assert.deepEqual(pages.tracks.map((t) => t.label), ['Design', 'Desktop', 'Mobile']);
    assert.deepEqual(pages.items.map((i) => [i.title, i.group]), [
      ['Homepage', 'Set – 1'],
      ['⁠About Us', 'Set – 1'],
      ['Download Page', 'Set – 1'],
    ]);
    assert.deepEqual(pages.items[0].states, ['done', 'in_progress', 'not_started']);
    assert.deepEqual(pages.items[0].target, { iso: '2026-09-15' });
    assert.deepEqual(pages.items[0].links, [{ title: 'Page', url: 'https://acme-staging.webflow.io/' }]);
  });

  it('turns [Fill this] tabs into asks, counting what it can', () => {
    assert.deepEqual(data.fills, [
      { tab: 'Organisation Schema [Fill this]', label: 'Organisation Schema' },
      { tab: 'SEO Tags [Fill this]', label: 'SEO Tags', filled: 1, total: 3 },
    ]);
  });

  it('reads the headerless global checklist', () => {
    assert.deepEqual(data.launch!.groups.map((g) => [g.title, g.checks.length, g.checks.filter((c) => c.done).length]), [
      ['Content', 2, 1],
      ['Post launch', 1, 0],
    ]);
  });

  it('never reads tabs it does not know, and shows a sample of the ones it does', () => {
    assert.equal(byTitle.Sheet20.role, 'ignored');
    assert.equal(byTitle['QC Master Checklist – Pagewise'].role, 'ignored');
    assert.equal(JSON.stringify(data).includes('/why'), false);
    // The copied-in REDIRECTS rows are read, and the sample makes them easy to spot and ignore.
    assert.equal(byTitle.REDIRECTS.sample, 'https://www.oldclient.example');
    assert.deepEqual(data.redirects, { total: 2, mapped: 0 });
    assert.match(byTitle['301 Redirects'].warnings.join(' '), /No rows under the header yet/);
    assert.match(byTitle['Blog Migration'].warnings.join(' '), /No rows under the header yet/);
  });

  it('drops a tab the team ignores', () => {
    const ignored = readProjectSheet(WEBFLOW_TEMPLATE, { today: TODAY, overrides: { REDIRECTS: 'ignored' } });
    assert.equal(ignored.data.redirects, undefined);
  });
});

describe('readProjectSheet: other shapes', () => {
  it('finds a header under merged title rows and reads day-first dates', () => {
    const { data } = readProjectSheet(REVPACK, { today: TODAY });
    const [pages] = data.workstreams;
    assert.deepEqual(pages.tracks.map((t) => t.label), ['Status']);
    assert.deepEqual(pages.items.map((i) => [i.title, i.group, i.states[0]]), [
      ['Home', 'Static', 'in_progress'],
      ['Services', 'Static', 'in_progress'],
      ['Blog Post Template', 'CMS Template', 'in_progress'],
    ]);
    assert.deepEqual(pages.items[0].target, { iso: '2026-04-27' });
    assert.deepEqual(pages.items[0].links, [{ title: 'Page', url: 'https://www.acme.example/' }]);
  });

  it('reads a launch plan with stats above the header, and decisions answered in place', () => {
    const { data, report } = readProjectSheet(LAUNCH_PLAN, { today: TODAY });
    assert.equal(report.tabs[0].headerRow, 8);
    const [tasks] = data.workstreams;
    assert.deepEqual(tasks.items.map((i) => [i.title, i.group, i.states[0]]), [
      ['Choose role owners and the Day 1 date', 'P01 Agree the first collection', 'done'],
      ['Fix the launch assortment and customer occasion', 'P01 Agree the first collection', 'blocked'],
    ]);
    assert.deepEqual(data.inputs.map((i) => [i.title, i.state, i.kind, i.neededBy?.text]), [
      ['Name the Digital and Product leads', 'received', 'decision', 'Day 1'],
      ['Confirm Day 1 and calendar launch date', 'pending', 'decision', 'Day 1'],
    ]);
    assert.equal(JSON.stringify(data).includes('40,000'), false, 'the budget is never read');
    assert.equal(JSON.stringify(data).includes('Aisha'), false, 'a decision is counted, its wording stays in the sheet');
  });

  it('sends only allow-listed link columns to the client', () => {
    const { data } = readProjectSheet(
      [
        tab('Tasks', [
          ['Task', 'Status', 'Staging link', 'Internal link', 'Invoice link', 'Admin URL'],
          ['Fix the nav', 'Done', 'https://acme.webflow.io/', 'https://notion.so/internal', 'https://refrens.com/inv/1', 'https://webflow.com/dashboard'],
        ]),
      ],
      { today: TODAY },
    );
    assert.deepEqual(data.workstreams[0].items[0].links, [{ title: 'Staging', url: 'https://acme.webflow.io/' }]);
  });

  it('prefers a real Phase column over a Week column', () => {
    const { data } = readProjectSheet(
      [tab('Timeline', [['Week', 'Phase', 'Milestone', 'Status'], ['Wk 1', 'Discovery', 'Kickoff', 'Done'], ['Wk 2', 'Design', 'Wireframes', '']])],
      { today: TODAY },
    );
    assert.deepEqual(data.timeline!.phases.map((p) => p.title), ['Discovery', 'Design']);
  });

  it('keeps a page whose title reads as a sentence, and the rows after it', () => {
    const { data } = readProjectSheet(
      [
        tab('Tasks', [
          ['Task', 'Status'],
          ['Write the AEO guide', 'Done'],
          ['What is AEO? A practical guide for marketing teams'],
          ['Publish the glossary', 'In progress'],
          ['Statuses come from the weekly call. Update them before Friday, please.'],
        ]),
      ],
      { today: TODAY },
    );
    assert.deepEqual(data.workstreams[0].items.map((i) => i.title), [
      'Write the AEO guide',
      'What is AEO? A practical guide for marketing teams',
      'Publish the glossary',
    ]);
  });

  it('reports what it could not place', () => {
    const { report, data } = readProjectSheet(
      [
        tab('Timeline', [['Nothing here looks like a header'], ['a', 'b']]),
        tab('Tasks', [['Task', 'Status'], ['Write copy', 'Pinged Arth'], ['Ship it', 'Done']]),
      ],
      { today: TODAY },
    );
    assert.match(report.tabs[0].warnings.join(' '), /No header row in the first 15 rows/);
    assert.deepEqual(report.unknownStatuses, ['Pinged Arth']);
    assert.deepEqual(data.workstreams[0].items.map((i) => i.states[0]), ['in_progress', 'done']);
  });
});
