/**
 * The catalogue behind /modules/internal-tools.
 *
 * Kept as data rather than JSX so adding a tool is a single object, and so the
 * list of extensions stays checkable against `scripts/pack-extension.mjs` — the
 * `download` paths here are exactly what that script writes into public/downloads.
 *
 * When you add an extension: add it to EXTENSIONS in the pack script, run
 * `npm run extension:pack:all`, and add an entry here with the matching filename.
 */

export type ToolKind = 'module' | 'extension';

export interface Tool {
  id: string;
  name: string;
  /** One line. What it does, for someone who has never heard of it. */
  summary: string;
  kind: ToolKind;
  /** In-app route, for kind: 'module'. */
  href?: string;
  /** Path under public/, for kind: 'extension'. */
  download?: string;
  version?: string;
  /** Where the source lives, relative to the repo root. */
  source: string;
  /** Numbered setup steps. Keep them literal — these get followed, not read. */
  steps: string[];
  /** Things that will otherwise surprise people: permissions, prerequisites, bugs. */
  notes?: string[];
  /** Shown as a warning rather than a note. Use sparingly. */
  warning?: string;
}

const LOAD_UNPACKED: string[] = [
  'Unzip it somewhere permanent — Chrome re-reads the folder on every startup, so Downloads or Desktop is a bad home.',
  'Open chrome://extensions and turn on Developer mode (top right).',
  'Click Load unpacked and choose the unzipped folder.',
  'Pin the extension from the puzzle-piece icon so you can see its status.',
];

export const TOOLS: Tool[] = [
  {
    id: 'screenshot-runner',
    name: 'Screenshot Runner',
    summary:
      'Capture full-page screenshots of a list of URLs in one run, then download them as a set.',
    kind: 'module',
    href: '/modules/screenshot-runner',
    source: 'src/modules/screenshot-runner/',
    steps: [
      'Open Screenshot Runner and give the run a project name.',
      'Paste your URLs — one per line, or comma-separated. Duplicates and invalid URLs are dropped for you.',
      'Set viewport and capture options if the defaults do not suit.',
      'Start the run and download the captures when it finishes.',
    ],
    notes: ['Runs in the browser against live URLs, so pages behind a login will capture as the logged-out view.'],
  },
  {
    id: 'refrens-skydo-bridge',
    name: 'Refrens → Skydo Invoice Bridge',
    summary:
      'On a Skydo unmapped payment, finds the matching Refrens invoice and attaches the real Refrens PDF — no downloading and re-uploading.',
    kind: 'extension',
    download: '/downloads/refrens-skydo-invoice-bridge-2.1.0.zip',
    version: '2.1.0',
    source: 'extensions/refrens-skydo-bridge/',
    steps: [
      ...LOAD_UNPACKED,
      'Click the extension icon → Settings, and add your own Refrens API keys (Refrens → Settings → Integrations → Generate API Keys).',
      'Set Business URL key to the slug in your Refrens URL — for refrens.com/app/acme/invoices that is "acme".',
      'Open any Skydo unmapped payment. The panel appears top-right and starts matching on its own.',
    ],
    notes: [
      'Chrome will warn that it can debug your browser. That permission exists only to turn Refrens’ rendered invoice into a real PDF; you will see a debugging banner on a hidden tab for a few seconds each time.',
      'Credentials are per-person and stored in your own browser. Nothing ships with the download.',
      'It stops at "file attached" on purpose — mapping a payment moves money, so the final confirm stays in Skydo.',
    ],
    warning:
      'Known issue: "Get invoice PDF" is not working yet. Matching, browsing and search all work.',
  },
  {
    id: 'webflow-settings-auditor',
    name: 'Webflow Settings Auditor',
    summary:
      'Audits a Webflow project’s settings against our best-practice checklist — favicon, branding, SEO, publishing.',
    kind: 'extension',
    download: '/downloads/webflow-settings-auditor-2.0.0.zip',
    version: '2.0.0',
    source: 'chrome-extension/',
    steps: [
      ...LOAD_UNPACKED,
      'Open a Webflow project, then open the extension from the side panel to run the audit.',
    ],
    notes: ['Reads Webflow project settings in the page you have open; it does not need an API token.'],
  },
  {
    id: 'webflow-team-tracker',
    name: 'Webflow Team Tracker',
    summary: 'Shows who is currently in a shared Webflow account, so two people do not edit at once.',
    kind: 'extension',
    download: '/downloads/webflow-team-tracker-1.0.6.zip',
    version: '1.0.6',
    source: 'webflow-team-tracker-1.0.6/',
    steps: [...LOAD_UNPACKED, 'Open Webflow. The extension reports your presence and shows who else is active.'],
    notes: ['Everyone sharing the account needs it installed, otherwise their session will not show up.'],
  },
];

export const MODULES = TOOLS.filter((t) => t.kind === 'module');
export const EXTENSIONS = TOOLS.filter((t) => t.kind === 'extension');
