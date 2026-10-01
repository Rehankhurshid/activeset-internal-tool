import type { SheetCell, SheetGrid, SheetTabInput } from './project-sheet.types';
import { INPUTS_HEADER, INPUT_ROWS, OVERVIEW_LINKS, PAGES_HEADER, processRows } from './project-sheet.template';

/**
 * Grids transcribed from real ActiveSet trackers (layout, headers, section
 * rows, footnotes and status words kept; client names and URLs replaced).
 * A cell is a string, or [text, link] for a hyperlinked cell.
 */

type Cell = string | [string, string];

export function grid(rows: Cell[][]): SheetGrid {
  return rows.map((row) => row.map((cell): SheetCell => (Array.isArray(cell) ? { v: cell[0], link: cell[1] } : { v: cell })));
}

export function tab(title: string, rows: Cell[][]): SheetTabInput {
  return { title, grid: grid(rows) };
}

/** "Today" for every fixture: the sync runs mid-project. */
export const TODAY = new Date('2026-09-10T09:00:00.000Z');

// --- Different AI (Aug 2026): the richest sheet, a client dashboard by hand ---------

export const DIFFERENT_AI: SheetTabInput[] = [
  tab('Overview', [
    ['Northwind  |  Website Project Tracker'],
    ['ActiveSet Technologies x Northwind  |  Webflow build + Lottie animation production'],
    ['PROJECT', '', 'PROGRESS AT A GLANCE', '', 'Overall', '0%'],
    ['Client', 'Northwind (northwind.example)', 'Track', 'Items', 'Approved', '% Done'],
    ['Client contact', 'Sam  |  sam@northwind.example', 'Pages: Copy', '13', '0', '0%'],
    ['Agency lead', 'Rehan Khurshid  |  rehan@activeset.co', 'Pages: Design', '15', '0', '0%'],
    ['Engagement', 'Webflow build (5 to 6 pages, Client-First) + 4 to 5 Lottie animations', 'Pages: Dev (Desktop)', '15', '0', '0%'],
    ['Contract value', '$4,500', 'Lottie: Storyboards', '5', '0', '0%'],
    ['Payment terms', '50% to commence, 50% on completion', 'Lottie: Production', '15', '0', '0%'],
    ['Kickoff date (edit me)', 'Mon, 31 Aug 2026', 'Forms & Analytics', '30', '0', '0%'],
    ['Target launch', 'Sun, 27 Sep 2026', 'Client inputs received', '21', '0', '0%'],
    ['Today', 'Thu, 10 Sep 2026'],
    ['Kickoff = day final approved designs + brand assets are handed over. All phase dates on the Timeline tab shift automatically from this cell.'],
    ['', 'PHASES'],
    ['KEY LINKS', 'Phase', 'Starts', 'Ends', 'Status'],
    [['Figma / design source', 'https://www.figma.com/design/abc/Northwind'], '1  Foundation and motion direction', '31 Aug', '06 Sep', 'Done'],
    [['Webflow staging', 'https://northwind.webflow.io/'], '2  Core pages and animation production', '07 Sep', '13 Sep', 'In Progress'],
    ['Brand assets folder', '3  Remaining pages, integrations and motion', '14 Sep', '20 Sep', 'Not Started'],
    [['HubSpot portal', 'https://app.hubspot.com/'], '4  QA, review and launch', '21 Sep', '27 Sep', 'Not Started'],
    ['Signed proposal', 'OPEN ITEMS'],
    [],
    ['STATUS LEGEND'],
    ['Not Started', 'Queued, no work yet'],
  ]),
  tab('Page Tracker', [
    ['Page Tracker'],
    ['One row per page and global component. Sections come from the approved sitemap. Statuses drive the Overview dashboard.'],
    ['No.', 'Page / Component', 'Sections (from sitemap)', 'Priority', 'Copy', 'Design', 'Dev: Desktop', 'Dev: Mobile', 'Forms / Analytics', 'Lottie on page', 'Design link', 'Staging link', 'Assignee', 'Phase', 'Target date', 'Notes / Blockers'],
    ['GLOBAL COMPONENTS (built once in Phase 1, reused everywhere)'],
    ['1', 'Design system', 'Typography scale, spacing scale, colour variables', 'P1', 'N/A', 'Approved', 'Approved', 'Approved', 'N/A', 'None', '', '', 'Arth', '1', '06 Sep', 'SECRET-NOTE'],
    ['2', 'Navigation', 'Logo, Product, Company, Resources, Pricing', 'P1', 'Approved', 'Approved', 'Approved', 'In Progress', 'Not Started', 'None', '', '', 'Arth', '1', '06 Sep', ''],
    ['CORE PAGES'],
    ['5', 'Home', 'Hero, Problem, Why, Solution, Proof, CTA', 'P1', 'Approved', 'Approved', 'Ready for Review', 'In Progress', 'Not Started', 'See Lottie tab', ['Figma', 'https://www.figma.com/design/abc?node-id=1'], 'https://northwind.webflow.io/', 'Arth', '2', '13 Sep', ''],
    ['6', 'Product', 'Hero, Benefits, Product areas, CTA', 'P1', 'Approved', 'Changes Requested', 'Not Started', 'Not Started', 'Not Started', 'See Lottie tab', '', '', 'Arth', '2', '13 Sep', ''],
    ['7', 'Company', 'Why, Founder, Values, Press', 'P1', 'Not Started', 'Not Started', 'Not Started', 'Not Started', 'Not Started', 'None', '', '', '', '3', '20 Sep', ''],
    ['Copy = client-supplied copy approved in the design file. Design = final approved design received. Dev Desktop/Mobile = built on staging.'],
  ]),
  tab('Lottie Tracker', [
    ['Lottie Animation Tracker'],
    ['Separate production track for 4 to 5 animations. Runs in parallel with the build.'],
    ['ID', 'Animation', 'Proposed placement', 'Concept (one line)', 'Trigger', 'Loop', 'Concept / Storyboard', 'Storyboard approved on', 'Illustration prep', 'Animation', 'Optimised export', 'Size (KB)', 'Implementation', 'Mobile fallback', 'Revisions used (max 2)', 'Assignee', 'Storyboard link', 'Source file link', 'Notes'],
    ['L1', 'Hero motion: Home', 'Home > Hero', 'Goal expands into touchpoints', 'On load', 'Yes', 'Approved', '03 Sep', 'In Progress', 'Not Started', 'Not Started', '', 'Not Started', 'Not Started', '0', 'Tejas', '', '', ''],
    ['L2', 'Solution / how it works', 'Home > Solution', 'Step-through of planning', 'On scroll', 'No', 'Ready for Review', '', 'Not Started', 'Not Started', 'Not Started', '', 'Not Started', 'Not Started', '0', 'Tejas', '', '', ''],
    [],
    // As in the real sheet: the footnote sits in the Animation column, then a blank row, then another block.
    ['', 'Placements are proposals from the sitemap for the kickoff call. Confirm or swap them with the client, then lock at storyboard stage.'],
    [],
    ['', 'PRODUCTION PIPELINE (per animation)'],
    ['', 'Stage', 'What happens', 'Output', 'Who approves', 'Target phase'],
    ['', 'Concept', 'Animation idea tied to a page section', '1-line concept + reference', 'Client', 'Phase 1'],
    ['', 'Storyboard', 'Key frames sketched, timing and trigger defined', 'Storyboard PDF / Figma', 'Client (sign-off gate)', 'Phase 1'],
  ]),
  tab('Timeline', [
    ['Timeline'],
    ['4-week plan from the proposal. Dates recalculate from the Kickoff date on the Overview tab.'],
    ['Phase', 'Milestone / deliverable', 'Owner', 'Starts', 'Ends', 'Status', 'Wk 1\n31 Aug', 'Wk 2\n07 Sep', 'Notes'],
    ['1', 'Kickoff call: confirm scope, sitemap, Lottie placements', 'Rehan + Client', '31 Aug', '31 Aug', 'Done', '', '', ''],
    ['1', 'Client handover: final designs, brand assets, HubSpot access', 'Client', '31 Aug', '01 Sep', 'Done', '', '', 'SECRET-NOTE'],
    ['1', 'Project setup: Webflow site, Client-First structure', 'ActiveSet', '01 Sep', '03 Sep', 'Done', '', '', ''],
    ['2', 'Build: Home, Product', 'ActiveSet', '07 Sep', '11 Sep', 'In Progress', '', '', ''],
    ['2', 'Client review round 1 (Home, Product)', 'Client', '12 Sep', '13 Sep', 'Not Started', '', '', ''],
    ['3', 'Build: Company, Demo, Resources detail template', 'ActiveSet', '14 Sep', '18 Sep', 'Not Started', '', '', ''],
    ['4', 'Site transfer to client Webflow account, DNS, go-live', 'ActiveSet', '25 Sep', '27 Sep', 'Not Started', '', '', ''],
    ['Rows turn red when the end date has passed and the status is not Approved. Extend a phase by changing the kickoff date.'],
  ]),
  tab('Client Inputs', [
    ['Client Inputs and Dependencies'],
    ['Everything the build is waiting on from the client side. Timeline starts on handover of designs, brand assets and third-party access.'],
    ['No.', 'Input needed from Northwind', 'Why it matters', 'Needed by', 'Status', 'Received on', 'Client owner', 'Link / location', 'Notes'],
    ['DESIGN AND BRAND'],
    ['1', 'Final approved designs: Home, Product', 'Dev starts on receipt. Batches welcome.', '31 Aug', 'Received', '30 Aug', 'Sam', ['Figma', 'https://www.figma.com/design/abc'], ''],
    ['6', 'Founder photos, press logos, quotes / video for Home', 'Company page, Home proof points', '07 Sep', 'Pending', '', '', '', 'SECRET-NOTE'],
    ['ACCESS'],
    ['9', 'HubSpot: portal access or form embed IDs (up to 3 forms)', 'Form integration, field mapping', '10 Sep', 'Pending', '', 'Marketing lead', '', ''],
    ['DECISIONS'],
    ['16', 'Pricing page: in scope, link out, or later?', 'Sitemap shows it in nav; not in scope', '31 Aug', 'Pending', '', '', '', ''],
    ['19', 'Careers section on Company: include or drop', 'Company page scope', '03 Sep', 'N/A', '', '', '', ''],
  ]),
  tab('Forms & Analytics', [
    ['Forms and Analytics'],
    ['No.', 'Form', 'Page(s)', 'Destination', 'Tested end-to-end'],
    ['1', 'Demo request', 'Demo', 'HubSpot', 'Not Started'],
  ]),
  tab('SEO Tags', [
    ['SEO Tags'],
    ['Fill before launch. Length columns count characters automatically and flag when out of range.'],
    ['Page', 'URL slug', 'Meta title (50 to 60 chars)', 'Title len', 'Meta description (140 to 160 chars)', 'Desc len', 'OG image', 'H1', 'Indexable', 'Status'],
    ['Home', '/', 'Northwind | Marketing that plans from goals', '44', 'Northwind plans campaigns from business goals, not tasks.', '58', '', '', 'Yes', 'In Progress'],
    ['Product', '/product', '', '0', '', '0', '', '', 'Yes', 'Not Started'],
    ['Thank you', '/thank-you', '', '0', '', '0', '', '', 'No', 'Not Started'],
    ['301 REDIRECTS (only if replacing a live site)'],
    ['Old path', 'New path', 'Type', 'Added in Webflow', 'Tested', 'Notes'],
    ['/old-home', '/', '301', 'Yes', 'Yes', ''],
    ['/about-us', '', '301', 'No', 'No', ''],
  ]),
  tab('Launch Checklist', [
    ['QA and Launch Checklist'],
    ['Phase 4 sign-off. Every item must be Yes or N/A before DNS is switched.'],
    ['No.', 'Check', 'Done', 'Owner', 'Notes'],
    ['CONTENT'],
    ['1', 'All pages have final copy, no lorem ipsum or placeholder images', 'Yes', 'Arth', ''],
    ['2', 'Spelling and grammar pass', 'No', '', ''],
    ['MOTION (LOTTIE)'],
    ['12', 'All animations load lazily and do not block LCP', 'No', '', ''],
    ['13', 'Cookie consent implemented', 'N/A', '', ''],
  ]),
  tab('Change Log', [
    ['Change Log'],
    ['Anything outside the signed scope: extra pages, extra Lottie, design revisions after a page is built.'],
    ['ID', 'Date raised', 'Raised by', 'Type', 'Description', 'Affects', 'Estimate (USD)', 'Est. days', 'Status', 'Approved on', 'Notes'],
    ['CR-01', '04 Sep', 'Client', 'New page', 'Add a Pricing page', 'Sitemap, Phase 3', '$350', '2', 'Proposed', '', 'SECRET-NOTE'],
    ['CR-02', '05 Sep', 'Client', 'Lottie', 'Extra Lottie on the Demo hero', 'Demo', '$250', '2', 'Approved', '06 Sep', ''],
    ['CR-03'],
    ['CR-04'],
    // As in the real sheet: the total sits in the Description column.
    ['', '', '', '', 'Total approved', '', '$250', '2.0'],
  ]),
];

// --- The 2024 Webflow Development template, as copied into most 2025 projects ------

export const WEBFLOW_TEMPLATE: SheetTabInput[] = [
  tab('Project Tracker', [
    ['', 'Planned', 'Page Link [Paste Staging URL]', 'Status – Design', 'Status – Desktop', 'Status – Mobile', 'Expected Date'],
    ['No.', 'Page', '', '', '', '', ''],
    ['', 'SET – 1', '', '', '', '', ''],
    ['1', 'Homepage', 'https://acme-staging.webflow.io/', 'Completed', 'WIP', '', '15/09/2026'],
    ['2', '⁠About Us', '', 'To Be Reviewed', '', '', ''],
    ['3', 'Download Page', '', '', '', '', ''],
    ['4'],
    ['5'],
  ]),
  tab('Analytics Tools – Code', [
    ['Analytics Tools', 'Paste Script [For Client]', 'How to get the Code'],
    ['Google Tag Manager', '', ''],
  ]),
  tab('SEO Tags [Fill this]', [
    ['Page Name', 'URL', 'Title', 'Meta Description', 'Meta Title & DescriptionStatus', 'OG Status'],
    ['Homepage', '/', 'Acme | Home', 'Acme helps teams ship.', 'FALSE', 'FALSE'],
    ['⁠About Us', '/about', '', '', 'FALSE', 'FALSE'],
    ['Download Page', '/download', '', '', 'FALSE', 'FALSE'],
  ]),
  tab('Organisation Schema [Fill this]', [['<script type="application/ld+json">{ "@context": "https://schema.org" }</script>']]),
  tab('QC Master Checklist – Pagewise', [
    ['Pages', 'Homepage', '⁠About Us'],
    ['SEO & ANALYTICS', '', ''],
    ['Page titles are descriptive and SEO friendly', '', ''],
  ]),
  tab('Project Global Checklist', [
    ['CONTENT', '', ''],
    ['All text free from spelling errors', 'TRUE', 'Scan via ScreamingFrog'],
    ['Privacy Policy included', 'FALSE', ''],
    ['POST LAUNCH', '', ''],
    ['Non WWW to WWW redirect', 'FALSE', ''],
  ]),
  tab('Sheet20', [
    ['https://www.oldclient.example', 'Homepage', '1'],
    ['https://www.oldclient.example/why', 'Why', '2'],
  ]),
  tab('REDIRECTS', [
    ['OLD PATH', 'NEW PATH'],
    ['https://www.oldclient.example', ''],
    ['https://www.oldclient.example/about', ''],
  ]),
  tab('301 Redirects', [['OLD URL (Ex. /meditationweeklyblog/*)', 'NEW URL (Ex. /blog/*)']]),
  tab('Blog Migration', [
    ['', 'Planned', 'Doc Link', 'Test Link', 'Status', 'Review Comment'],
    ['No.', 'Blog Articles', '', '', '', ''],
  ]),
];

// --- RevPack (Apr 2026): merged title rows, day-first dates, one Status column ------

export const REVPACK: SheetTabInput[] = [
  tab('Pages', [
    ['Acme — Webflow Rebuild Project Tracker'],
    ['Source: acme.example  |  Prepared by ActiveSet Technologies'],
    [],
    ['#', 'Page Name', 'URL Path', 'Type', 'Priority', 'Status', 'Assignee', 'Design - Due Date', 'Dev - Due Date', 'Notes'],
    ['1', 'Home', 'https://www.acme.example/', 'Static', 'Medium', 'In Development', 'Melody (Designer)', '27/04/2026', '', ''],
    ['2', 'Services', 'https://www.acme.example/services/', 'Static', 'Medium', 'In Development Review', 'Arth (Developer)', '27/04/2026', '', ''],
    ['12', 'Blog Post Template', 'https://www.acme.example/blog/{slug}/', 'CMS Template', 'Medium', 'In Development Review', 'Arth (Developer)', '29/04/2026', '', ''],
  ]),
];

// --- House of Haseena (Sep 2026): a launch plan, stats above the header -------------

export const LAUNCH_PLAN: SheetTabInput[] = [
  tab('Launch tracker', [
    [],
    ['House launch tracker'],
    [],
    ['Tasks', '49', 'Done', '0', 'In progress', '0', 'Blocked', '0', 'Deferred', '0'],
    ['Planned hours', '180.0', 'Done share', '0%', 'Capacity hours', '214.3'],
    ['Owners are provisional. Complete dependencies and save evidence before marking Done. Yellow cells are editable.'],
    ['Day 1 is your chosen start date. Person-hours are combined effort; Both is not counted twice.'],
    ['Package', 'Task ID', 'Task', 'Owner', 'Person-hours', 'Depends on', 'Status', 'Day window', 'Target date', 'Done when', 'Evidence / blocker'],
    ['P01 Agree the first collection', '01.1', 'Choose role owners and the Day 1 date', 'Both', '1.0', '', 'Done', 'Day 1', '', 'One named owner', ''],
    ['P01 Agree the first collection', '01.2', 'Fix the launch assortment and customer occasion', 'Both', '2.0', '01.1', 'Deferred', 'Day 1', '', 'Choose 2–3 categories', ''],
  ]),
  tab('Budget', [
    ['Category', 'Planned ₹'],
    ['Samples and initial inventory', '₹40,000'],
  ]),
  tab('Decisions', [
    [],
    ['Decisions to make together'],
    [],
    ['Record your decision in the yellow column. Proposals remain open until both founders agree.'],
    [],
    ['Decision ID', 'Decision', 'Starting point / constraint', 'Your decision', 'Owner', 'Needed by day', 'Evidence / notes'],
    ['D01', 'Name the Digital and Product leads', 'Assign by strengths', 'Aisha leads Digital', 'Both', 'Day 1', ''],
    ['D02', 'Confirm Day 1 and calendar launch date', 'Use relative Day 15 until chosen', '', 'Both', 'Day 1', ''],
  ]),
  tab('Pooja review', [['ACTIVESET', 'POOJA · COPY REVIEW'], ['x', 'y']]),
];

// --- The ActiveSet project sheet (Oct 2026): the four-tab format, mid brand stage ------

/** Statuses and dates as a team would fill them, keyed by step title. */
const PROGRESS: Record<string, [string, string, string?, string?]> = {
  'Kickoff call': ['Done', '3 Sep 2026'],
  'Slack channel & project setup': ['Done', '4 Sep 2026'],
  'Brand questionnaire & assets': ['Done', '6 Sep 2026'],
  'Brand discovery workshop': ['Done', '8 Sep 2026'],
  Moodboarding: ['Done', '10 Sep 2026', 'https://www.figma.com/board/moodboard'],
  'Feedback on moodboard': ['Waiting on client', '12 Sep 2026', 'https://www.figma.com/board/moodboard', 'Two directions: pick one, or mix them'],
  'Colours, type & visual direction': ['Not started', '15 Sep 2026'],
};

export const ACTIVESET_SHEET: SheetTabInput[] = [
  tab('Overview', [
    ['Client', 'Northwind'],
    ['Project', 'Brand and website'],
    ['Services', 'Brand Design, Web Design, Development'],
    ['Kickoff date', '3 Sep 2026'],
    ['Target launch', '30 Oct 2026'],
    ['Project lead', 'Rehan'],
    [],
    ['KEY LINKS'],
    ...OVERVIEW_LINKS.map((name): Cell[] => (name === 'Figma' ? [name, 'https://www.figma.com/design/northwind'] : [name, ''])),
  ]),
  tab(
    'Process',
    processRows()
      // This project does not include copy.
      .filter((row) => row[1] !== 'Copy')
      .map((row, i): Cell[] => {
        if (i === 0) return row;
        const [status, when, link, note] = PROGRESS[row[2]] ?? ['Not started', ''];
        return [row[0], row[1], row[2], row[3], status, when, link ?? '', note ?? ''];
      })
      // A step the team dropped for this client.
      .map((row): Cell[] => (row[2] === 'Logo & identity revisions' ? [...row.slice(0, 4), 'Skipped', ...row.slice(5)] : row)),
  ),
  tab('Pages', [
    [...PAGES_HEADER],
    ['Home', 'Done', 'In progress', 'Not started', '', 'SECRET-NOTE'],
    ['About', 'Done', 'Not started', 'Not started', '', ''],
  ]),
  tab('What we need', [
    [...INPUTS_HEADER],
    ...INPUT_ROWS.map((r, i): Cell[] => [r.item, r.why, i < 2 ? '6 Sep 2026' : '20 Sep 2026', i < 2 ? 'Received' : 'Waiting', '']),
  ]),
  tab('Team scratch', [['anything', 'the team likes']]),
];
