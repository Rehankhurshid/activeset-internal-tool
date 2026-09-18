import type { StackCheck, StackDefinition, StackDiscipline } from '../delivery.types';

/**
 * Webflow, the stack this agency currently builds on.
 *
 * Only what is structural: the columns of the page grid, and a starting set of
 * per-page QC questions.
 *
 * Kickoff and the site-wide launch checklist are NOT here. They are sections of
 * the project's own checklist, seeded from an editable SOP template, because no
 * two projects run exactly the same way and a list in code cannot be changed
 * without a deploy.
 *
 * The per-page QC is seeded from the Keatech QC sheet, with one difference:
 * where that sheet asked the same question of thirteen browsers, this asks it
 * once. The team already tracks desktop and mobile as disciplines, and a
 * checklist nobody completes honestly is worse than a shorter one they do.
 */

const disciplines: StackDiscipline[] = [
  { id: 'copy', label: 'Copy', shortLabel: 'Copy', order: 0 },
  { id: 'design', label: 'Design', shortLabel: 'Design', order: 1 },
  { id: 'dev_desktop', label: 'Dev — desktop', shortLabel: 'Desktop', order: 2 },
  { id: 'dev_mobile', label: 'Dev — mobile', shortLabel: 'Mobile', order: 3 },
];

/** Asked of every page. Kept short on purpose: only things that genuinely vary page to page. */
const pageChecks: Omit<StackCheck, 'order'>[] = [
  { id: 'page_title', title: 'Title is descriptive and unique', group: 'SEO', auto: 'page_title' },
  { id: 'meta_description', title: 'Meta description written', group: 'SEO', auto: 'meta_description' },
  { id: 'single_h1', title: 'Exactly one H1, used for the page title', group: 'SEO', auto: 'single_h1' },
  { id: 'headings', title: 'H2s and H3s used sensibly', group: 'SEO' },
  { id: 'image_alt', title: 'Images have alt text', group: 'SEO', auto: 'image_alt' },
  { id: 'open_graph', title: 'Open Graph tags, including an image', group: 'Social', auto: 'open_graph' },
  { id: 'links_resolve', title: 'Links resolve', group: 'Markup', auto: 'links_resolve' },
  { id: 'js_errors', title: 'No JavaScript errors', group: 'Markup' },
  { id: 'responsive', title: 'Renders correctly at every breakpoint', group: 'Rendering', note: 'Tablet, mobile landscape, mobile portrait.' },
  { id: 'animations', title: 'Animations smooth and device-appropriate', group: 'Rendering' },
  { id: 'forms', title: 'Forms submit, validate and reach the right recipient', group: 'Functionality', note: 'Only for pages with a form.' },
  { id: 'images_optimised', title: 'Images are WebP and compressed', group: 'Optimisation' },
];

function withOrder<T>(items: T[]): (T & { order: number })[] {
  return items.map((item, order) => ({ ...item, order }));
}

export const WEBFLOW_STACK: StackDefinition = {
  id: 'webflow',
  name: 'Webflow',
  description: 'Webflow build or migration — the agency default.',
  disciplines,
  defaultPageChecks: withOrder(pageChecks),
};
