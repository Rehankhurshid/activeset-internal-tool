import type { StackCheck, StackDefinition, StackDiscipline, StackKickoffInput } from '../delivery.types';

/**
 * Webflow, the stack this agency currently builds on.
 *
 * Seeded from two real artefacts rather than invented: the "Website Migration to
 * Webflow" SOP in src/lib/sop-templates.ts, and the launch and QC sheets used on
 * the Muffins and Keatech projects. Where the QC sheet asked the same question
 * of thirteen browsers, it is one question here — the team tracks desktop and
 * mobile as disciplines already, and a checklist nobody completes honestly is
 * worse than a shorter one they do.
 */

const disciplines: StackDiscipline[] = [
  { id: 'copy', label: 'Copy', shortLabel: 'Copy', order: 0 },
  { id: 'design', label: 'Design', shortLabel: 'Design', order: 1 },
  { id: 'dev_desktop', label: 'Dev — desktop', shortLabel: 'Desktop', order: 2 },
  { id: 'dev_mobile', label: 'Dev — mobile', shortLabel: 'Mobile', order: 3 },
];

/** Asked of every page. Kept short on purpose: only things that genuinely vary page to page. */
const pageChecks: Omit<StackCheck, 'scope' | 'order'>[] = [
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

/** Asked once for the whole site. */
const siteChecks: Omit<StackCheck, 'scope' | 'order'>[] = [
  // Content
  { id: 'spelling', title: 'Text free of spelling errors', group: 'Content', auto: 'spelling' },
  { id: 'all_pages_have_content', title: 'Every page has its content', group: 'Content' },
  { id: 'formatting', title: 'Formatting consistent across pages', group: 'Content' },
  { id: 'contact_details', title: 'Contact details consistent everywhere they appear', group: 'Content', note: 'Footer and contact page commonly disagree.' },
  { id: 'authors', title: 'Correct author attributed to pages and posts', group: 'Content' },
  { id: 'privacy_policy', title: 'Privacy policy present', group: 'Content' },
  { id: 'gdpr', title: 'GDPR covered — terms, cookie notice', group: 'Content' },
  { id: 'favicon', title: 'Favicon and webclip display correctly, retina included', group: 'Content' },
  { id: 'footer_copyright', title: 'Footer carries a copyright line', group: 'Content' },
  { id: 'unique_titles', title: 'All page titles are unique', group: 'Content' },
  { id: 'page_404', title: '404 page exists and is useful', group: 'Content' },
  { id: 'schema', title: 'Schema markup in place', group: 'SEO', auto: 'schema' },

  // Functionality
  { id: 'forms_tested', title: 'Forms tested end to end', group: 'Functionality' },
  { id: 'forms_required_fields', title: 'Required fields behave', group: 'Functionality' },
  { id: 'forms_validation', title: 'Input validation reviewed', group: 'Functionality', note: 'Lengths, character limits, country-specific rules.' },
  { id: 'forms_attachments', title: 'Attachment formats and size limits work', group: 'Functionality' },
  { id: 'forms_recipient', title: 'Forms reach the right recipient', group: 'Functionality' },
  { id: 'forms_tracking', title: 'Submissions are trackable — confirmation URL or event', group: 'Functionality' },

  // Launch
  { id: 'domain_connected', title: 'Domain and hosting connected', group: 'Launch' },
  { id: 'ssl', title: 'SSL certificate installed', group: 'Launch' },
  { id: 'redirects', title: '301 redirects in place and working', group: 'Launch' },
  { id: 'www_redirect', title: 'Non-www redirects to www', group: 'Launch' },
  { id: 'live_urls', title: 'Images, media and links point at live URLs', group: 'Launch' },
  { id: 'webfonts_live', title: 'Webfonts working on the live domain and set to production', group: 'Launch' },
  { id: 'disable_webflow_subdomain', title: 'Indexing of the webflow.io subdomain disabled', group: 'Launch' },

  // Post-launch
  { id: 'indexable', title: 'Site visible to search engines', group: 'Post-launch', postLaunch: true },
  { id: 'sitemap', title: 'Sitemap created and submitted', group: 'Post-launch', postLaunch: true },
  { id: 'robots', title: 'robots.txt set up', group: 'Post-launch', postLaunch: true },
  { id: 'submitted_to_google', title: 'URL submitted to Google', group: 'Post-launch', postLaunch: true },
  { id: 'search_console', title: 'Site added to Google Search Console', group: 'Post-launch', postLaunch: true },
  { id: 'bing_webmaster', title: 'Site added to Bing Webmaster Tools', group: 'Post-launch', postLaunch: true },
  { id: 'analytics', title: 'Analytics installed and receiving data', group: 'Post-launch', postLaunch: true },
  { id: 'event_tracking', title: 'Event and conversion tracking arriving in the tracker', group: 'Post-launch', postLaunch: true },
];

/** What the client owes us before a build can start. From the SOP's "Input" section. */
const kickoffInputs: Omit<StackKickoffInput, 'order'>[] = [
  { id: 'crawl', title: 'Full crawl of the current site and its sitemap', note: 'ScreamingFrog, plus sitemap.xml for the page list.' },
  { id: 'copy_unchanged', title: 'Confirmation that copy and structure stay the same', note: 'If not, this is a redesign, not a migration — reprice it.' },
  { id: 'assets', title: 'Assets folder', note: 'A Drive folder, or we scrape images with extract.pics.' },
  { id: 'video_hosting', title: 'Video hosting if sound is needed', optional: true, note: 'Vimeo (paid) or Netlify (100GB free).' },
  { id: 'webflow_account', title: 'Webflow account on a paid plan', note: 'Transferred once the site is ready on the ActiveSet account.' },
  { id: 'domain_access', title: 'Domain registrar access', note: 'Credentials shared, or the client makes the DNS change themselves.' },
  { id: 'forms_code', title: 'Form embed code', optional: true, note: 'HubSpot or similar. Customisation is billable.' },
  { id: 'analytics_codes', title: 'Analytics codes', note: 'Google Tag Manager, Google Analytics, Microsoft Clarity.' },
  { id: 'fonts', title: 'Font files', note: 'Unless the fonts are on Google Fonts.' },
  { id: 'maps_key', title: 'Maps API key', optional: true },
  { id: 'cookie_banner', title: 'Cookie consent banner set up', note: 'Send the client the signup link.' },
  { id: 'original_project', title: 'Access to the original project file', optional: true },
];

function withOrder<T>(items: T[]): (T & { order: number })[] {
  return items.map((item, order) => ({ ...item, order }));
}

export const WEBFLOW_STACK: StackDefinition = {
  id: 'webflow',
  name: 'Webflow',
  description: 'Webflow build or migration — the agency default.',
  disciplines,
  checks: [
    ...withOrder(pageChecks).map((c) => ({ ...c, scope: 'page' as const })),
    ...withOrder(siteChecks).map((c, i) => ({ ...c, scope: 'site' as const, order: pageChecks.length + i })),
  ],
  kickoffInputs: withOrder(kickoffInputs),
};
