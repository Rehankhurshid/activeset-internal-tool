import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildSlackDedupeKey,
  classifyOperationalText,
  collectQaResults,
  deriveSnapshotStatus,
  getDailyControlDateKey,
  redactClientDraftText,
  slackRequestDocId,
} from './daily-control-utils';
import type { ProjectLink } from '@/types';

describe('daily-control utilities', () => {
  it('classifies actionable Slack requests and flags blockers/client input', () => {
    const result = classifyOperationalText(
      'Can we please fix the broken mobile hero ASAP? Waiting on client assets. https://example.com/home',
    );

    assert.equal(result.isActionable, true);
    assert.equal(result.isBlocker, true);
    assert.equal(result.needsClientInput, true);
    assert.equal(result.pageUrl, 'https://example.com/home');
    assert.ok(result.confidence >= 0.7);
  });

  it('ignores short conversational filler', () => {
    const result = classifyOperationalText('Thanks!');
    assert.equal(result.isActionable, false);
  });

  it('builds stable Slack dedupe keys and document ids', () => {
    const key = buildSlackDedupeKey('C123', '1777147401.036');
    assert.equal(key, 'C123:1777147401.036');
    assert.equal(slackRequestDocId('project-1', key), 'slack_project-1_C123_1777147401_036');
  });

  it('derives snapshot status by highest operational risk', () => {
    assert.equal(
      deriveSnapshotStatus({
        signalCount: 1,
        openTaskCount: 4,
        blockerCount: 0,
        overdueTaskCount: 0,
        timelineRiskCount: 0,
        qaFailedCount: 1,
      }),
      'qa_failed',
    );

    assert.equal(
      deriveSnapshotStatus({
        signalCount: 0,
        openTaskCount: 0,
        blockerCount: 0,
        overdueTaskCount: 0,
        timelineRiskCount: 0,
        qaFailedCount: 0,
      }),
      'empty',
    );
  });

  it('uses named timezones for daily date keys', () => {
    const date = new Date('2026-05-25T20:00:00.000Z');
    assert.equal(getDailyControlDateKey(date, 'Asia/Kolkata'), '2026-05-26');
    assert.equal(getDailyControlDateKey(date, 'America/New_York'), '2026-05-25');
  });

  it('redacts internal client draft details', () => {
    const result = redactClientDraftText(
      'Follow up with rehan@activeset.co on https://app.clickup.com/t/123 before client update.',
    );

    assert.equal(result.text.includes('@activeset.co'), false);
    assert.equal(result.text.includes('app.clickup.com'), false);
    assert.ok(result.redactions.includes('Internal ActiveSet email addresses removed.'));
    assert.ok(result.redactions.includes('Internal ClickUp links removed.'));
  });

  it('selects failed QA signals from audit data', () => {
    const links: ProjectLink[] = [
      {
        id: 'home',
        title: 'Home',
        url: 'https://example.com',
        order: 0,
        isDefault: false,
        source: 'auto',
        auditResult: {
          score: 42,
          canDeploy: false,
          lastRun: '2026-05-26T09:00:00.000Z',
          categories: {} as NonNullable<ProjectLink['auditResult']>['categories'],
        } as ProjectLink['auditResult'],
      },
    ];

    const results = collectQaResults(links);
    assert.ok(results.some((item) => item.id === 'deploy-blocked:home'));
    assert.ok(results.some((item) => item.id === 'low-score:home'));
  });
});
