import { AutoCheckId, SOPTemplate, SOPTemplateItem } from '@/types';

/**
 * SOP Templates — each defines a reusable checklist structure.
 * Items have no `id` here; IDs are generated at instantiation time.
 */

const makeItems = (
    items: { title: string; emoji?: string; autoCheck?: AutoCheckId }[],
): SOPTemplateItem[] =>
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
                // Surfaces on Delivery → Kickoff. The build is blocked on these.
                stage: 'kickoff',
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
                stage: 'kickoff',
                items: makeItems([
                    { title: 'Book the kickoff call as soon as the deal closes', emoji: '📅' },
                    { title: 'Hold the kickoff call: scope, deadline, who does what, how we will talk', emoji: '📞' },
                    { title: 'Agree the sync cadence — weekly or every two weeks', emoji: '🔁' },
                    { title: 'List all the pages from the live website that include the CMS collection', emoji: '📑' },
                    { title: 'Define the Lead Developer, Backup Developer, Project Lead', emoji: '👥' },
                    { title: 'Create Slack Channel with Client. Workflow: Setup Channel – Webflow Migration', emoji: '💬' },
                    { title: 'Create the ClickUp Task List: ⚙️ One Click Setup', emoji: '☑️' },
                    { title: 'Project Lead sends the welcome email introducing the team', emoji: '💌' },
                    { title: 'Share the project tracker with the client', emoji: '📊' },
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
                stage: 'launch',
                order: 7,
                items: makeItems([
                    { title: 'Test all pages on all breakpoints', emoji: '🏁' },
                    { title: 'Verify all animations are smooth and device-optimized', emoji: '🏁' },
                    { title: 'Check all links, buttons, and navigation', emoji: '🏁', autoCheck: 'links_resolve' },
                    { title: 'Test all CMS data fetching properly on templates', emoji: '🏁' },
                    { title: 'Test all forms (submit, error state, integration)', emoji: '🏁' },
                    { title: 'Check website loading speed and optimize assets', emoji: '🏁' },
                    { title: 'Validate SEO settings for all pages', emoji: '🏁', autoCheck: 'page_title' },
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
                stage: 'launch',
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
        name: 'Brand Evolution',
        description: 'Complete SOP for brand evolution — from kickoff questionnaire through research, moodboards, stylescapes, logo, collateral to brand book handover.',
        icon: '🎨',
        sections: [
            {
                title: 'Input & Requirements',
                emoji: '📥',
                order: 0,
                items: makeItems([
                    { title: 'Client brief / project scope document', emoji: '📄' },
                    { title: 'Existing brand assets (logo, colors, fonts, guidelines) if any', emoji: '🖼️' },
                    { title: 'Send brand questionnaire to client (allow 30–60 min to fill)', emoji: '📝' },
                    { title: 'Receive completed brand questionnaire', emoji: '✅' },
                    { title: 'Competitor / inspiration links from client', emoji: '🔗' },
                    { title: 'Target audience details and market positioning notes', emoji: '🎯' },
                    { title: 'Access to existing website and social channels', emoji: '🌐' },
                    { title: 'List of required collaterals from client (stationery, presentations, pharma-specific, etc.)', emoji: '📋' },
                    { title: 'Imagery / photography list — what exists, what needs to be shot or sourced', emoji: '📸' },
                ]),
            },
            {
                title: 'Phase 1: Pre-Production — Discovery & Research',
                emoji: '🔍',
                order: 1,
                items: makeItems([
                    { title: 'Kickoff call with client and key stakeholders', emoji: '📅' },
                    { title: 'Review completed brand questionnaire before call (what are we selling? market category? why does the world need us?)', emoji: '📋' },
                    { title: 'Create Personality Slider — rate brand on scales: playful↔serious, friendly↔authoritarian, etc.', emoji: '🎚️' },
                    { title: 'Brand Archetyping — select 1–2 archetypes (e.g., Creator, Caregiver, Sage) with reasoning', emoji: '🏛️' },
                    { title: 'Document archetype traits the brand should adopt', emoji: '📝' },
                    { title: 'Brand Emotions — ask client: what emotions should people feel? (e.g., trust, comfort, joy, delight)', emoji: '❤️' },
                    { title: 'Map each emotion → how to express through color, typography, imagery, motion design', emoji: '🎨' },
                ]),
            },
            {
                title: 'Phase 2: Pre-Production — Competitive Analysis',
                emoji: '📊',
                order: 2,
                items: makeItems([
                    { title: 'Get list of competitors from client', emoji: '📋' },
                    { title: 'Break down each competitor\'s visual identity: logo type, typeface, colors, imagery, core visual element', emoji: '🔍' },
                    { title: 'Rate overall feeling from each competitor (e.g., energetic & playful, modern & functional, bold & theatrical)', emoji: '💭' },
                    { title: 'Rate competitors on formal↔casual, serious↔friendly scale (0–10)', emoji: '📏' },
                    { title: 'Create Competitive Quadrant — map competitors to find the blank space for positioning', emoji: '📐' },
                    { title: 'Collect all competitor colors into a Color Wheel — identify unused color territory', emoji: '🌈' },
                    { title: 'Document key takeaways (e.g., "competitors all use blue — avoid blue")', emoji: '📝' },
                ]),
            },
            {
                title: 'Phase 3: Production — Moodboarding',
                emoji: '🖼️',
                order: 3,
                items: makeItems([
                    { title: 'Collect visual references from the internet based on research findings', emoji: '🌐' },
                    { title: 'Create 2–3 moodboard directions — each reflecting a different brand positioning', emoji: '🎨' },
                    { title: 'Ensure moodboards reflect the design decisions from research phase (archetype, emotions, blank space)', emoji: '✅' },
                    { title: 'Include proposed color palettes per direction', emoji: '🌈' },
                    { title: 'Include suggested primary and secondary typefaces per direction', emoji: '✒️' },
                    { title: 'Include example use cases relevant to the client (web, product, collateral)', emoji: '📱' },
                    { title: 'Present moodboard directions to client — get sign-off on chosen direction', emoji: '🤝' },
                ]),
            },
            {
                title: 'Phase 4: Production — Stylescape',
                emoji: '🖌️',
                order: 4,
                items: makeItems([
                    { title: 'Create custom-made stylescape based on approved moodboard direction', emoji: '🎨' },
                    { title: 'Design custom illustrations, patterns, and graphic elements aligned to brand identity', emoji: '✏️' },
                    { title: 'Show example layouts: hero sections, testimonials, impact numbers, team sections', emoji: '📐' },
                    { title: 'Define primary typeface, secondary typeface, and all color shades (5–10 per color)', emoji: '✒️' },
                    { title: 'Design brand pattern system that internal team can scale (swap colors, create new variations easily)', emoji: '🔲' },
                    { title: 'Create icon set aligned to brand style', emoji: '🔣' },
                    { title: 'Show social media templates and marketing collateral examples', emoji: '📱' },
                    { title: 'Present stylescape to client — gather feedback and iterate', emoji: '📢' },
                ]),
            },
            {
                title: 'Phase 5: Production — Logo & Collateral Design',
                emoji: '✏️',
                order: 5,
                items: makeItems([
                    { title: 'Design multiple logo concepts (wordmark, icon, combined, monogram)', emoji: '🔄' },
                    { title: 'Present logo options to client — get sign-off', emoji: '🤝' },
                    { title: 'Design stationery kit: letterhead, business card, envelope', emoji: '💼' },
                    { title: 'Design PowerPoint / presentation template', emoji: '📊' },
                    { title: 'Design any industry-specific collaterals (e.g., pharma rep materials, quotation templates)', emoji: '🏥' },
                    { title: 'Test logo and collateral across contexts (web, print, social, favicon)', emoji: '🧪' },
                    { title: 'Start website design with placeholder images — mark image needs in Figma for client', emoji: '🌐' },
                ]),
            },
            {
                title: 'Phase 6: Post-Production — Brand Book & Handover',
                emoji: '📦',
                order: 6,
                items: makeItems([
                    { title: 'Document the entire branding journey into a single brand book', emoji: '📖' },
                    { title: 'Include: logo usage guidelines, clear space grid, all logo variations', emoji: '🏷️' },
                    { title: 'Include: primary and secondary colors with all shades + foreground/background rules', emoji: '🎨' },
                    { title: 'Include: typeface usage guidelines (correct and incorrect examples)', emoji: '✒️' },
                    { title: 'Include: pattern usage — how to use, how to extend', emoji: '🔲' },
                    { title: 'Include: imagery and photography style guidelines', emoji: '📸' },
                    { title: 'Include: tone of voice and messaging direction', emoji: '🗣️' },
                    { title: 'Export all logo formats (SVG, PNG, EPS — light/dark/color variations)', emoji: '📤' },
                    { title: 'Export scalable design system files so internal team can create new assets independently', emoji: '📂' },
                    { title: 'Final brand book review with client', emoji: '🤝' },
                    { title: 'Deliver complete brand kit (Google Drive package)', emoji: '🚀' },
                ]),
            },
            {
                title: 'Outputs',
                emoji: '🎁',
                order: 7,
                items: makeItems([
                    { title: 'Complete brand book / style guide', emoji: '📖' },
                    { title: 'Logo package (all formats and variations)', emoji: '🏷️' },
                    { title: 'Color system with primary, secondary, and 5–10 shades each', emoji: '🎨' },
                    { title: 'Typography system documentation', emoji: '✒️' },
                    { title: 'Brand pattern + icon system (scalable for internal team)', emoji: '🔲' },
                    { title: 'Stationery kit (letterhead, business card, envelope)', emoji: '💼' },
                    { title: 'Presentation template', emoji: '📊' },
                    { title: 'Social media templates', emoji: '📱' },
                    { title: 'Tone of voice and messaging guidelines', emoji: '🗣️' },
                ]),
            },
        ],
    },
];

export const getTemplateById = (id: string): SOPTemplate | undefined =>
    SOP_TEMPLATES.find(t => t.id === id);

export const getDefaultTemplate = (): SOPTemplate => SOP_TEMPLATES[0];
