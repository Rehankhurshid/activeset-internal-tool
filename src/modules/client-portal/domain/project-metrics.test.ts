import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, monthLabel, sheetMetrics, type ProjectMetric } from './project-metrics';

const metric = (extra: Partial<ProjectMetric>): ProjectMetric => ({ key: 'k', name: 'Sessions', source: 'GA4', order: 0, baselineMonth: '2026-09', values: {}, ...extra });

describe('the Metrics Tracker', () => {
  it('counts months across a year', () => {
    assert.equal(addMonths('2026-11', 3), '2027-02');
    assert.equal(monthLabel('2026-09'), 'Sep 26');
  });

  it('shows the baseline and five months, and the change to the latest value', () => {
    const table = sheetMetrics([metric({ values: { '2026-09': 1200, '2026-10': 1500, '2026-11': 1656 } })])!;
    assert.deepEqual(table.header, ['Metric', 'Source', 'Baseline Sep 26', 'Oct 26', 'Nov 26', 'Dec 26', 'Jan 27', 'Feb 27', 'Change vs baseline']);
    assert.deepEqual(table.rows[0], { metric: 'Sessions', source: 'GA4', values: [1200, 1500, 1656, '', '', ''], change: '+38%', better: true });
  });

  it('knows lower is better for load times, and rates change in points', () => {
    const table = sheetMetrics([
      metric({ key: 'lcp', name: 'Mobile LCP (s)', order: 1, lowerIsBetter: true, values: { '2026-09': 3.4, '2026-10': 2.5 } }),
      metric({ key: 'ctr', name: 'CTR', order: 2, unit: '%', values: { '2026-09': 2.1, '2026-10': 2.6 } }),
    ])!;
    assert.deepEqual(table.rows.map((r) => [r.change, r.better]), [['-26%', true], ['+0.5 pts', true]]);
  });

  it('leaves change blank until there is a baseline and a later month', () => {
    assert.equal(sheetMetrics([metric({ values: { '2026-10': 5 } })])!.rows[0].change, '');
    assert.equal(sheetMetrics([]), null);
  });
});
