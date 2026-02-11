import { SOPTemplate, SOPTemplateItem } from '@/types';

/**
 * SOP Templates — each defines a reusable checklist structure.
 * Items have no `id` here; IDs are generated at instantiation time.
 */

const makeItems = (items: { title: string; emoji?: string }[]): SOPTemplateItem[] =>
    items.map((item, i) => ({
        ...item,
        status: 'not_started' as const,
        order: i,
    }));

export const SOP_TEMPLATES: SOPTemplate[] = [
    {
        id: 'webflow_migration_v1',
        name: 'Website Migration to Webflow',
        description: 'Complete SOP for migrating a website to Webflow — from input gathering to launch.',
        icon: '📄',
        sections: [
            {
                title: 'Input',
                emoji: '📥',
                order: 0,
                items: makeItems([
                    { title: 'Run ScreamingFrog tool and scan the site entirely & use the Sitemap.xml to download all the pages in the sitemap', emoji: '🐸' },
                    { title: 'Access to the Original Project (Optional)', emoji: '✍️' },
                    { title: 'Check with client if Copy and Structure remains the same (if not, it\'s a redesign project)', emoji: '📝' },
                    { title: 'Folder for the Assets (Drive). If not, scrape using https://extract.pics/ for Images.', emoji: '📂' },
                    { title: 'If they have Video with Sound (if required) — Vimeo (Paid), Netlify (100GB Free)', emoji: '📺' },
                    { title: 'Client Webflow account with a Paid Plan (Post Website is ready on ActiveSet Account)', emoji: '🔒' },
                    { title: 'Domain Registrar Access – share credentials or client handles themselves', emoji: '🌐' },
                    { title: 'HubSpot Form: For HubSpot Form Integration, need the code from Client (Paid if customization needed)', emoji: '📄' },
                    { title: 'Analytics: Google Tag Manager, Google Analytics & Microsoft Clarity Code', emoji: '📊' },
                    { title: 'Font File from Client (If not, download from Google)', emoji: '⌨️' },
                    { title: 'Map API key from client (If required)', emoji: '📍' },
                    { title: 'Cookie Consent Banner: https://gr3f.co/c/60899/tFmEJ — Send this to client', emoji: '🍪' },
                ]),
            },
            {
                title: 'Step 1: Project Planning & Kickoff',
                emoji: '📁',
                order: 1,
                items: makeItems([
                    { title: 'List all the pages from the live website that include the CMS collection', emoji: '📑' },
                    { title: 'Define the Lead Developer, Backup Developer, Project Lead', emoji: '👥' },
                    { title: 'Create Slack Channel with Client. Workflow: Setup Channel – Webflow Migration', emoji: '💬' },
                    { title: 'Create the ClickUp Task List: ⚙️ One Click Setup', emoji: '☑️' },
                    { title: 'Project Lead sends a Email intro for the project introducing team member', emoji: '💌' },
                    { title: 'Create the MarkUp Folder [MarkUp]', emoji: '📝' },
                    { title: 'Internal kickoff: deadline, functionality, animations, strategy', emoji: '👥' },
                ]),
            },
            {
                title: 'Step 2: Design Preparation (Developer)',
                emoji: '🎨',
                order: 2,
                items: makeItems([
                    { title: 'Ensure styleguide consistency: spacing, typography, colors', emoji: '✒️' },
                    { title: 'Component planning with designer', emoji: '💟' },
                    { title: 'Responsive pre-check for tablet and mobile; flag issues early', emoji: '🗯️' },
                ]),
            },
            {
                title: 'Step 3: Webflow Project Setup',
                emoji: '🧱',
                order: 3,
                items: makeItems([
                    { title: 'Add to Links Widget: Project Tracker (Google Sheet)', emoji: '📟' },
                    { title: 'Add to Links Widget: MarkUp Folder', emoji: '📄' },
                    { title: 'Add to Links Widget: ClickUp Tracker', emoji: '📄' },
                    { title: 'Add to Links Widget: Figma Link', emoji: '📄' },
                    { title: 'Duplicate Webflow Starter Project ↗ activeset-style-guide', emoji: '🍽️' },
                    { title: 'Upload fonts from client if not on Google Fonts', emoji: '✒️' },
                    { title: 'Fill Variables: Font, Colors, Typography', emoji: '✒️' },
                    { title: 'Update Project Settings', emoji: '⚙️' },
                    { title: 'Add Project Links Widget [Links Widget] https://app.activeset.co/', emoji: '⛴️' },
                ]),
            },
            {
                title: 'Step 4: CMS Configuration',
                emoji: '🗃️',
                order: 4,
                items: makeItems([
                    { title: 'Check what content in Figma should become CMS', emoji: '🧑‍✈️' },
                    { title: 'Create CMS collections with all required fields and proper field names', emoji: '🏑' },
                    { title: 'Set up reference and multi-reference fields and connect them to related CMS collections', emoji: '📐' },
                    { title: 'Build CMS Template Pages (Blog Template, Case Study Template)', emoji: '⛩️' },
                    { title: 'Use Finsweet for filters, load-more, social, etc. https://finsweet.com/attributes', emoji: '🏁' },
                ]),
            },
            {
                title: 'Step 5: Page Development & Layout',
                emoji: '🧩',
                order: 5,
                items: makeItems([
                    { title: 'Build a proper structure with correct class names', emoji: '🏗️' },
                    { title: 'Build global components (Navbar, Footer, Buttons, Containers)', emoji: '🏗️' },
                    { title: 'Add animations and interactions (scroll, hover, page load, GSAP if needed)', emoji: '🌀' },
                    { title: 'Make the page responsive for Tablet, Mobile Landscape, Mobile Portrait', emoji: '📲' },
                    { title: 'Ensure all images are WebP and compressed with good quality', emoji: '🖼️' },
                    { title: 'Develop a 404 page and a form success state', emoji: '🙅‍♂️' },
                ]),
            },
            {
                title: 'Step 6: Integrations & Custom Code',
                emoji: '🔧',
                order: 6,
                items: makeItems([
                    { title: 'Add SEO meta titles, descriptions, and Open Graph fields', emoji: '⚓' },
                    { title: 'If form automation is required, use Zapier or Make', emoji: '⚓' },
                    { title: 'Add custom JS/CSS code where required (GSAP, SplitType, smooth scroll)', emoji: '⚓' },
                    { title: 'Configure Webflow forms (success message, required fields, validations)', emoji: '⚓' },
                    { title: 'Add website favicon and webclip', emoji: '⚓' },
                ]),
            },
            {
                title: 'Step 7: QA & Pre-Launch Checklist',
                emoji: '🧪',
                order: 7,
                items: makeItems([
                    { title: 'Test all pages on all breakpoints', emoji: '🏁' },
                    { title: 'Verify all animations are smooth and device-optimized', emoji: '🏁' },
                    { title: 'Check all links, buttons, and navigation', emoji: '🏁' },
                    { title: 'Test all CMS data fetching properly on templates', emoji: '🏁' },
                    { title: 'Test all forms (submit, error state, integration)', emoji: '🏁' },
                    { title: 'Check website loading speed and optimize assets', emoji: '🏁' },
                    { title: 'Validate SEO settings for all pages', emoji: '🏁' },
                ]),
            },
            {
                title: 'Step 8: Client Review & Handover',
                emoji: '🤝',
                order: 8,
                items: makeItems([
                    { title: 'Share the staging and markup links for feedback' },
                    { title: 'Fix the markup comments' },
                    { title: 'Walkthrough Videos for Client' },
                ]),
            },
            {
                title: 'Step 9: Launch',
                emoji: '🚀',
                order: 9,
                items: makeItems([
                    { title: 'Connect domain and hosting settings' },
                    { title: 'Publish and run final live checks' },
                ]),
            },
            {
                title: 'Outputs',
                emoji: '📦',
                order: 10,
                items: makeItems([
                    { title: 'Fully functional, responsive, and optimized Webflow website' },
                    { title: 'All client requirements met and approved' },
                    { title: 'Handover documentation delivered' },
                ]),
            },
        ],
    },
];

export const getTemplateById = (id: string): SOPTemplate | undefined =>
    SOP_TEMPLATES.find(t => t.id === id);

export const getDefaultTemplate = (): SOPTemplate => SOP_TEMPLATES[0];
