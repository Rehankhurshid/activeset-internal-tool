/**
 * The ActiveSet project sheet: the one format every project starts from.
 *
 * Rehan, 2026-10-01: "Our whole stuff is Copy, Brand Design, Web Design,
 * Development … the client should be able to understand which part of the
 * process we are in." So the sheet is four tabs, and its heart is Process: one
 * numbered list of steps from kickoff to launch, each with who does it, where
 * it stands and when. A project that does not buy a service deletes that
 * stage's rows. Our own steps alternate with the client's ("Moodboarding",
 * then "Feedback on moodboard"), which is what lets the client see when the
 * project is waiting on them.
 *
 * The steps come from the team's own processes: the "Site Branding" and
 * "Figma to Webflow" SOPs in the Checklist Creator and the timelines of eight
 * live projects. `scripts/build-project-sheet-template.ts` writes this into
 * the master sheet in Drive; after that the master is the source of truth
 * (decision 3 in docs/plans/project-sheet-contract.md), and teams copy it.
 * The reader does not depend on this file: it reads whatever the copy says.
 */

/**
 * The master in Rehan's Drive, built by `npm run sheet:template` on 2026-10-01.
 * `/copy` opens Google's "Make a copy" page for it.
 */
export const MASTER_TEMPLATE_ID = '1y8FEHRfGVYhPraBx0mP-0NN9aCLvVpM-yKFJsms8ZYc';
export const MASTER_TEMPLATE_COPY_URL = `https://docs.google.com/spreadsheets/d/${MASTER_TEMPLATE_ID}/copy`;

export const TEMPLATE_TABS = {
  overview: 'Overview',
  process: 'Process',
  pages: 'Pages',
  inputs: 'What we need',
} as const;

export const STAGES = ['Kickoff', 'Copy', 'Brand Design', 'Web Design', 'Development', 'Launch'] as const;
export type TemplateStage = (typeof STAGES)[number];

export const WHO = ['ActiveSet', 'Client', 'Together'] as const;
export type TemplateWho = (typeof WHO)[number];

/** Dropdown values. Every word is one the reader already understands. */
export const PROCESS_STATUSES = ['Not started', 'In progress', 'Waiting on client', 'Done', 'Skipped'] as const;
export const PAGE_STATUSES = ['Not started', 'In progress', 'Waiting on client', 'Done', 'Not needed'] as const;
export const INPUT_STATUSES = ['Waiting', 'Received', 'Not needed'] as const;

export const PROCESS_HEADER = ['#', 'Stage', 'Step', 'Who', 'Status', 'Date', 'Link', 'Note for client'] as const;
export const PAGES_HEADER = ['Page', 'Copy', 'Design', 'Development', 'Link', 'Team notes'] as const;
export const INPUTS_HEADER = ['Item', 'Why we need it', 'Needed by', 'Status', 'Link'] as const;

export interface TemplateStep {
  stage: TemplateStage;
  step: string;
  who: TemplateWho;
}

export const PROCESS_STEPS: TemplateStep[] = [
  { stage: 'Kickoff', step: 'Kickoff call', who: 'Together' },
  { stage: 'Kickoff', step: 'Brief & questionnaire', who: 'Client' },
  { stage: 'Kickoff', step: 'Brand assets, logins & access', who: 'Client' },

  { stage: 'Copy', step: 'Sitemap & messaging', who: 'ActiveSet' },
  { stage: 'Copy', step: 'Copy draft', who: 'ActiveSet' },
  { stage: 'Copy', step: 'Feedback on copy', who: 'Client' },
  { stage: 'Copy', step: 'Copy revisions', who: 'ActiveSet' },
  { stage: 'Copy', step: 'Copy approved', who: 'Client' },

  { stage: 'Brand Design', step: 'Brand discovery workshop', who: 'Together' },
  { stage: 'Brand Design', step: 'Moodboarding', who: 'ActiveSet' },
  { stage: 'Brand Design', step: 'Feedback on moodboard', who: 'Client' },
  { stage: 'Brand Design', step: 'Colours & typography locked', who: 'ActiveSet' },
  { stage: 'Brand Design', step: 'Logo concepts', who: 'ActiveSet' },
  { stage: 'Brand Design', step: 'Feedback on logo', who: 'Client' },
  { stage: 'Brand Design', step: 'Brand book & files', who: 'ActiveSet' },
  { stage: 'Brand Design', step: 'Brand approved', who: 'Client' },

  { stage: 'Web Design', step: 'Wireframes', who: 'ActiveSet' },
  { stage: 'Web Design', step: 'Feedback on wireframes', who: 'Client' },
  { stage: 'Web Design', step: 'Homepage design', who: 'ActiveSet' },
  { stage: 'Web Design', step: 'Feedback on homepage', who: 'Client' },
  { stage: 'Web Design', step: 'Inner pages design', who: 'ActiveSet' },
  { stage: 'Web Design', step: 'Feedback on inner pages', who: 'Client' },
  { stage: 'Web Design', step: 'Designs approved', who: 'Client' },

  { stage: 'Development', step: 'Webflow setup & style guide', who: 'ActiveSet' },
  { stage: 'Development', step: 'Pages built for desktop & mobile', who: 'ActiveSet' },
  { stage: 'Development', step: 'CMS, forms & integrations', who: 'ActiveSet' },
  { stage: 'Development', step: 'QA on every device', who: 'ActiveSet' },
  { stage: 'Development', step: 'Review on staging', who: 'Client' },
  { stage: 'Development', step: 'Fixes from your review', who: 'ActiveSet' },

  { stage: 'Launch', step: 'Domain & DNS access', who: 'Client' },
  { stage: 'Launch', step: 'Go live', who: 'ActiveSet' },
  { stage: 'Launch', step: 'Handover & walkthrough videos', who: 'ActiveSet' },
  { stage: 'Launch', step: 'Final sign-off', who: 'Client' },
];

/** Overview: label in column A, value in column B. The reader looks for these labels. */
export const OVERVIEW_FIELDS = ['Client', 'Project', 'Services', 'Kickoff date', 'Target launch', 'Project lead'] as const;

/** KEY LINKS: a name in column A, the link in column B. */
export const OVERVIEW_LINKS = ['Figma', 'Staging site', 'Shared folder', 'Slack channel'] as const;

/** How the sheet works, on the Overview tab, for whoever opens it first. */
export const OVERVIEW_HELP = [
  'How this sheet works',
  '1. Process is the client’s view of the project: one row per step, in order. Delete the stages this project does not include.',
  '2. Keep Status and Date current. Done + the date it was done; otherwise the date it is planned for.',
  '3. When you send something for review, mark your step Done and set the client’s next step to “Waiting on client”.',
  '4. Pages is for website projects: one row per page. Delete the tab for a brand-only project.',
  '5. What we need lists everything we are waiting on from the client. Mark each one Received when it arrives.',
  '6. Add any tabs you need for your own work. The client portal only reads the four tabs here.',
] as const;

export const PAGE_ROWS = ['Home', 'About', 'Services', 'Contact', '404 page'] as const;

export const INPUT_ROWS: { item: string; why: string }[] = [
  { item: 'Logo files (SVG)', why: 'Used across the website and brand files' },
  { item: 'Brand fonts and colours', why: 'Sets up the design system' },
  { item: 'Website copy', why: 'Needed before pages are designed' },
  { item: 'Photos and images', why: 'Needed before pages are built' },
  { item: 'Webflow, domain and DNS access', why: 'Needed to launch the site' },
  { item: 'Analytics access (GA4, GTM)', why: 'Tracking from the first day live' },
];

/** The Process tab as rows, header first, statuses blank: what a fresh copy holds. */
export function processRows(): string[][] {
  return [
    [...PROCESS_HEADER],
    ...PROCESS_STEPS.map((s, i) => [String(i + 1), s.stage, s.step, s.who, 'Not started', '', '', '']),
  ];
}
