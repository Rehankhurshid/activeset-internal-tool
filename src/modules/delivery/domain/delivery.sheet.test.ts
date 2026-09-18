import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACKER_TAB_TITLE,
  buildTrackerHeader,
  buildTrackerRows,
  parseTrackerRows,
  statusFromSheet,
  statusToSheet,
} from './delivery.sheet';
import { WEBFLOW_STACK } from './stacks/webflow.stack';
import type { ProjectPage, StackDefinition } from './delivery.types';

const stack = WEBFLOW_STACK;

function page(partial: Partial<ProjectPage> & { title: string }): ProjectPage {
  return {
    id: partial.title.toLowerCase(),
    path: `/${partial.title.toLowerCase()}`,
    order: 0,
    work: {},
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...partial,
  };
}

describe('statusFromSheet', () => {
  it('reads the words the team actually types', () => {
    assert.equal(statusFromSheet('Completed'), 'completed');
    assert.equal(statusFromSheet('completed ✅'), 'completed');
    assert.equal(statusFromSheet('DONE'), 'completed');
    assert.equal(statusFromSheet('WIP'), 'in_progress');
    assert.equal(statusFromSheet('In Progress'), 'in_progress');
    assert.equal(statusFromSheet('N/R'), 'not_required');
    assert.equal(statusFromSheet('n/a'), 'not_required');
    assert.equal(statusFromSheet(''), 'not_started');
    assert.equal(statusFromSheet(undefined), 'not_started');
  });

  it('treats an unrecognised note as in progress rather than losing it', () => {
    // Real values from the Muffins sheet. Calling these "not started" would
    // erase work that has plainly happened.
    assert.equal(statusFromSheet('Assets Pending / Layout Ready'), 'in_progress');
    assert.equal(statusFromSheet('Wireframe Ready'), 'in_progress');
  });

  it('round-trips every status except the empty one', () => {
    for (const status of ['in_progress', 'blocked', 'in_review', 'completed', 'not_required'] as const) {
      assert.equal(statusFromSheet(statusToSheet(status)), status, status);
    }
    assert.equal(statusToSheet('not_started'), '');
  });
});

describe('buildTrackerRows', () => {
  it('matches the column order of the sheets the agency already sends', () => {
    assert.deepEqual(buildTrackerHeader(stack), [
      'No.',
      'Page',
      'Docs',
      'Staging Link',
      'Status – Copy',
      'Status – Design',
      'Status – Dev — desktop',
      'Status – Dev — mobile',
      'Assignee',
      'Expected Date',
      'Review Comment',
    ]);
  });

  it('writes a spanning row where a group starts and numbers only real pages', () => {
    const rows = buildTrackerRows(stack, [
      page({ title: 'Homepage' }),
      page({ title: 'Test Design', group: 'Features [P1]' }),
      page({ title: 'Test Execution', group: 'Features [P1]' }),
    ]);
    assert.deepEqual(rows[1][0], '1.0');
    // A group heading sits in the Page column, as it does in the real sheets.
    assert.deepEqual(rows[2], ['', 'Features [P1]']);
    assert.equal(rows[3][0], '2.0');
    assert.equal(rows[4][0], '3.0');
  });

  it('writes statuses in the words the client is used to', () => {
    const rows = buildTrackerRows(stack, [
      page({ title: 'Pricing', work: { copy: 'completed', design: 'in_progress', dev_desktop: 'not_required' } }),
    ]);
    const [, row] = rows;
    assert.equal(row[4], 'Completed');
    assert.equal(row[5], 'WIP');
    assert.equal(row[6], 'N/R');
    assert.equal(row[7], '', 'an unset discipline stays blank rather than reading as not started');
  });

  it('never emits undefined into a cell', () => {
    const rows = buildTrackerRows(stack, [page({ title: 'Bare' })]);
    for (const row of rows) {
      for (const cell of row) {
        assert.equal(typeof cell, 'string');
        assert.ok(!cell.includes('undefined'), `cell contained undefined: ${cell}`);
      }
    }
  });
});

describe('parseTrackerRows', () => {
  const muffins = [
    ['', 'Planned', 'Docs', 'Staging Link', 'Status – Copy', 'Status – Design', 'Status – Dev / Desktop', 'Status – Dev / Mobile', 'Assignee', 'Expected Date'],
    ['No.', 'Page', '', '', '', '', '', '', '', ''],
    ['1.0', 'Homepage [P1]', 'Muffins: Homepage', 'https://staging.example.com/', 'Completed', 'Assets Pending / Layout Ready', 'Completed', '', 'sam@activeset.co', '2025-12-04'],
    ['', 'Features [P1]', '', '', '', '', '', '', '', ''],
    ['2.0', 'Test Design Creation', '', 'https://staging.example.com/test', 'Completed', 'Completed', 'Completed', 'N/R', '', ''],
  ];

  it('finds the header even when a title row sits above it', () => {
    const parsed = parseTrackerRows(stack, muffins);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].title, 'Homepage [P1]');
  });

  it('treats a lone cell as a group heading and carries it down', () => {
    const parsed = parseTrackerRows(stack, muffins);
    assert.equal(parsed[0].group, undefined);
    assert.equal(parsed[1].group, 'Features [P1]');
  });

  it('maps each discipline column by its header, not its position', () => {
    const parsed = parseTrackerRows(stack, muffins);
    assert.equal(parsed[0].work.copy, 'completed');
    assert.equal(parsed[0].work.design, 'in_progress');
    assert.equal(parsed[0].work.dev_desktop, 'completed');
    assert.equal(parsed[0].work.dev_mobile, undefined, 'a blank cell sets nothing');
    assert.equal(parsed[1].work.dev_mobile, 'not_required');
  });

  it('reads the other sheet shape, where disciplines are named differently', () => {
    // Keatech: Content / Desktop / Mobile rather than Copy / Design / Dev.
    const keatech: StackDefinition = {
      ...stack,
      disciplines: [
        { id: 'content', label: 'Content', shortLabel: 'Content', order: 0 },
        { id: 'desktop', label: 'Desktop', shortLabel: 'Desktop', order: 1 },
        { id: 'mobile', label: 'Mobile', shortLabel: 'Mobile', order: 2 },
      ],
    };
    const grid = [
      ['Planned', 'Status – Content', 'Status – Desktop', 'Status – Mobile', 'Design Link', 'Test Link', 'Review Comment'],
      ['Page', '', '', '', '', '', ''],
      ['Homepage', 'Completed', 'Completed', 'WIP', 'https://figma.com/x', 'https://test.example.com', 'Needs hero copy'],
    ];
    const parsed = parseTrackerRows(keatech, grid);
    assert.equal(parsed.length, 1);
    assert.deepEqual(parsed[0].work, { content: 'completed', desktop: 'completed', mobile: 'in_progress' });
    assert.equal(parsed[0].reviewComment, 'Needs hero copy');
  });

  it('keeps only dates it can actually read', () => {
    const parsed = parseTrackerRows(stack, muffins);
    assert.equal(parsed[0].expectedDate, '2025-12-04');
    assert.equal(parsed[1].expectedDate, undefined);
  });

  it('returns nothing rather than guessing when there is no page column', () => {
    assert.deepEqual(parseTrackerRows(stack, [['Foo', 'Bar'], ['1', '2']]), []);
    assert.deepEqual(parseTrackerRows(stack, []), []);
  });

  it('survives ragged rows, which every real sheet has', () => {
    const ragged = [
      ['Page', 'Status – Copy', 'Assignee'],
      ['Homepage', 'Completed'],
      ['About'],
    ];
    const parsed = parseTrackerRows(stack, ragged);
    assert.equal(parsed.length, 1, 'the lone "About" cell reads as a group heading');
    assert.equal(parsed[0].title, 'Homepage');
    assert.equal(parsed[0].assignee, undefined);
  });
});

describe('round trip', () => {
  it('survives write then read', () => {
    const pages = [
      page({ title: 'Homepage', work: { copy: 'completed', design: 'completed', dev_desktop: 'in_review' }, assignee: 'sam@activeset.co', expectedDate: '2026-10-01' }),
      page({ title: 'Pricing', group: 'Marketing', work: { copy: 'blocked' }, reviewComment: 'Waiting on legal' }),
    ];
    const parsed = parseTrackerRows(stack, buildTrackerRows(stack, pages));
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].work.copy, 'completed');
    assert.equal(parsed[0].work.dev_desktop, 'in_review');
    assert.equal(parsed[0].assignee, 'sam@activeset.co');
    assert.equal(parsed[0].expectedDate, '2026-10-01');
    assert.equal(parsed[1].group, 'Marketing');
    assert.equal(parsed[1].work.copy, 'blocked');
    assert.equal(parsed[1].reviewComment, 'Waiting on legal');
  });

  it('names the tab the clients already know', () => {
    assert.equal(TRACKER_TAB_TITLE, 'Project Tracker');
  });
});
