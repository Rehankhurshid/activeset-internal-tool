/**
 * A project's metrics, month by month (Rehan, 2026-10-01: build the Metrics
 * Tracker the Dreamteam Website Plan has). One document per metric under
 * `projects/{id}/metrics`; values are keyed by month ("2026-10") and written by
 * the agent from GA4, Search Console, PageSpeed and the AI retrieval re-test,
 * each with where it came from. Pure: the sheet writer and the tests share it.
 */

export type MetricSource = 'GA4' | 'GA4 event' | 'Formula' | 'Search Console' | 'PageSpeed Insights' | 'CrUX' | 'AI retrieval test';

export interface ProjectMetric {
  key: string;
  name: string;
  source: MetricSource;
  order: number;
  /** The month the baseline is from, "YYYY-MM". */
  baselineMonth: string;
  /** Month → value. The baseline is `values[baselineMonth]`. */
  values: Record<string, number>;
  /** Where each month's value came from ("GA4, 1–30 Sep"). */
  sources?: Record<string, string>;
  /** Lower is better for load times and layout shift. */
  lowerIsBetter?: boolean;
  /** How the value reads: "%" for rates, "s" for seconds. */
  unit?: '%' | 's';
}

/** What every project tracks unless the team removes it: the Dreamteam plan's set, plus what the Peak XV audits measured. */
export const DEFAULT_METRICS: readonly Omit<ProjectMetric, 'baselineMonth' | 'values' | 'order'>[] = [
  { key: 'sessions', name: 'Sessions', source: 'GA4' },
  { key: 'users', name: 'Users', source: 'GA4' },
  { key: 'organic_sessions', name: 'Organic sessions', source: 'GA4' },
  { key: 'conversions', name: 'Form submissions (conversions)', source: 'GA4 event' },
  { key: 'conversion_rate', name: 'Conversion rate', source: 'Formula', unit: '%' },
  { key: 'indexed_pages', name: 'Indexed pages', source: 'Search Console' },
  { key: 'impressions', name: 'Search impressions', source: 'Search Console' },
  { key: 'clicks', name: 'Search clicks', source: 'Search Console' },
  { key: 'ctr', name: 'Search CTR', source: 'Search Console', unit: '%' },
  { key: 'mobile_lcp', name: 'Mobile LCP (s)', source: 'PageSpeed Insights', lowerIsBetter: true, unit: 's' },
  { key: 'mobile_cls', name: 'Mobile CLS', source: 'PageSpeed Insights', lowerIsBetter: true },
  { key: 'inp', name: 'INP, field (ms)', source: 'CrUX', lowerIsBetter: true },
  { key: 'ai_citations', name: 'AI answers citing the site (of 10 prompts)', source: 'AI retrieval test' },
];

/** "2026-09" plus `n` months. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "Sep 26", as the Dreamteam plan labels its months. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  // Spelled out: some locales write "Sept".
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[m - 1]} ${String(y).slice(2)}`;
}

export interface SheetMetrics {
  /** The baseline month, then the five after it. */
  months: string[];
  header: string[];
  rows: { metric: string; source: string; values: (number | '')[]; change: string; better?: boolean }[];
}

/**
 * The Metrics Tracker as the sheet shows it: each metric's baseline and the
 * five months after it, and the change from the baseline to the latest month
 * that has a value ("+38%"), marked better or worse for the metric.
 */
export function sheetMetrics(metrics: readonly ProjectMetric[]): SheetMetrics | null {
  if (metrics.length === 0) return null;
  const baseline = [...metrics.map((m) => m.baselineMonth)].sort()[0];
  const months = Array.from({ length: 6 }, (_, i) => addMonths(baseline, i));
  const header = ['Metric', 'Source', `Baseline ${monthLabel(baseline)}`, ...months.slice(1).map(monthLabel), 'Change vs baseline'];
  const rows = [...metrics]
    .sort((a, b) => a.order - b.order)
    .map((metric) => {
      const values = months.map((month) => (typeof metric.values?.[month] === 'number' ? metric.values[month] : ''));
      const base = metric.values?.[metric.baselineMonth];
      const latestMonth = [...months].reverse().find((m) => m > metric.baselineMonth && typeof metric.values?.[m] === 'number');
      let change = '';
      let better: boolean | undefined;
      if (typeof base === 'number' && latestMonth) {
        const latest = metric.values[latestMonth];
        const diff = latest - base;
        if (metric.unit === '%') change = `${diff >= 0 ? '+' : ''}${Math.round(diff * 10) / 10} pts`;
        else if (base !== 0) change = `${diff >= 0 ? '+' : ''}${Math.round((diff / Math.abs(base)) * 100)}%`;
        if (diff !== 0) better = metric.lowerIsBetter ? diff < 0 : diff > 0;
      }
      return { metric: metric.name, source: metric.source, values, change, ...(better === undefined ? {} : { better }) };
    });
  return { months, header, rows };
}
