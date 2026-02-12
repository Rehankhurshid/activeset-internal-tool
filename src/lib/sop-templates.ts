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
    {
        id: 'branding_v1',
        name: 'Site Branding',
        description: 'Complete SOP for branding a site — from kickoff discovery through to a polished brand book.',
        icon: '🎨',
        sections: [
            {
                title: 'Input & Requirements',
                emoji: '📥',
                order: 0,
                items: makeItems([
                    { title: 'Client brief / project scope document', emoji: '📄' },
                    { title: 'Existing brand assets (logo, colors, fonts, guidelines) if any', emoji: '🖼️' },
                    { title: 'Competitor / inspiration links from client', emoji: '🔗' },
                    { title: 'Target audience details and positioning notes', emoji: '🎯' },
                    { title: 'Access to any existing website or social channels', emoji: '🌐' },
                    { title: 'Client brand questionnaire sent and completed', emoji: '📝' },
                    { title: 'Internal brand perception questionnaire (team/stakeholders)', emoji: '📝' },
                ]),
            },
            {
                title: 'Phase 1: Brand Discovery (1–1.5 Hours)',
                emoji: '🔍',
                order: 1,
                items: makeItems([
                    { title: 'Schedule kickoff call with client and key stakeholders', emoji: '📅' },
                    { title: 'Review completed brand questionnaire responses before call', emoji: '📋' },
                    { title: 'Workshop: Uncover brand DNA — values, vision, mission', emoji: '💡' },
                    { title: 'Workshop: Identify what sets client apart from competitors', emoji: '⭐' },
                    { title: 'Workshop: Discuss brand personality and tone of voice', emoji: '🗣️' },
                    { title: 'Workshop: Define target audience personas', emoji: '👥' },
                    { title: 'Workshop: Explore emotional associations and keywords', emoji: '❤️' },
                    { title: 'Document discovery notes and circulate to team', emoji: '📝' },
                ]),
            },
            {
                title: 'Phase 2: Analysis + Moodboard (1–2 Days)',
                emoji: '📊',
                order: 2,
                items: makeItems([
                    { title: 'Define the brand archetype from discovery insights', emoji: '🏛️' },
                    { title: 'Identify the core essence of the brand', emoji: '💎' },
                    { title: 'Competitive landscape analysis — map competitor positioning', emoji: '🗺️' },
                    { title: 'Visual research: collect reference imagery, textures, palettes', emoji: '🎨' },
                    { title: 'Create visual moodboard(s) that set the tone and direction', emoji: '🖼️' },
                    { title: 'Typography research and initial font pairings', emoji: '✒️' },
                    { title: 'Color palette exploration (primary, secondary, accent)', emoji: '🌈' },
                    { title: 'Present moodboard to client for feedback', emoji: '📢' },
                ]),
            },
            {
                title: 'Phase 3: Locking In The Direction (1–2 Days)',
                emoji: '🔒',
                order: 3,
                items: makeItems([
                    { title: 'Select and refine the approved moodboard direction', emoji: '✅' },
                    { title: 'Define the brand\'s visual skeleton (layout principles, grid, spatial rules)', emoji: '📐' },
                    { title: 'Lock final color palette with hex/HSL values', emoji: '🎨' },
                    { title: 'Lock typography system (headings, body, accents)', emoji: '✒️' },
                    { title: 'Define photography / imagery style guidelines', emoji: '📸' },
                    { title: 'Align on iconography style (line, fill, custom)', emoji: '🔣' },
                    { title: 'Client sign-off on the chosen direction', emoji: '🤝' },
                ]),
            },
            {
                title: 'Phase 4: Branding & Iterating (2–4 Days)',
                emoji: '🖌️',
                order: 4,
                items: makeItems([
                    { title: 'Develop unique logo concepts inspired by the locked direction', emoji: '✏️' },
                    { title: 'Explore logo variations (wordmark, icon, combined, monogram)', emoji: '🔄' },
                    { title: 'Design brand pattern, textures, or graphic elements', emoji: '🔲' },
                    { title: 'Create initial business card / stationery mockups', emoji: '💼' },
                    { title: 'Test variations across contexts (web, print, social, favicon)', emoji: '🧪' },
                    { title: 'Internal review and refinement round', emoji: '🔁' },
                    { title: 'Present to client — gather feedback', emoji: '📢' },
                    { title: 'Iterate based on client feedback (round 2)', emoji: '🔁' },
                    { title: 'Final client approval on brand identity', emoji: '✅' },
                ]),
            },
            {
                title: 'Phase 5: Review & Finalisation (3–4 Days)',
                emoji: '📦',
                order: 5,
                items: makeItems([
                    { title: 'Polish all brand elements to final quality', emoji: '✨' },
                    { title: 'Compile brand book / style guide (logo usage, colors, typography, do/don\'t)', emoji: '📖' },
                    { title: 'Export all logo formats (SVG, PNG, EPS — light/dark/color variations)', emoji: '📤' },
                    { title: 'Export brand assets package (icons, patterns, imagery)', emoji: '📂' },
                    { title: 'Define tone of voice guidelines and copywriting notes', emoji: '🗣️' },
                    { title: 'Social media profile and cover templates', emoji: '📱' },
                    { title: 'Final brand book review with client', emoji: '🤝' },
                    { title: 'Deliver final brand kit (Google Drive / package)', emoji: '🚀' },
                ]),
            },
            {
                title: 'Outputs',
                emoji: '🎁',
                order: 6,
                items: makeItems([
                    { title: 'Complete brand book / style guide', emoji: '📖' },
                    { title: 'Logo package (all formats and variations)', emoji: '🏷️' },
                    { title: 'Color palette with codes (hex, RGB, HSL)', emoji: '🎨' },
                    { title: 'Typography system documentation', emoji: '✒️' },
                    { title: 'Brand asset package (patterns, icons, imagery)', emoji: '📂' },
                    { title: 'Tone of voice and messaging guidelines', emoji: '🗣️' },
                ]),
            },
        ],
    },
];

export const getTemplateById = (id: string): SOPTemplate | undefined =>
    SOP_TEMPLATES.find(t => t.id === id);

export const getDefaultTemplate = (): SOPTemplate => SOP_TEMPLATES[0];
