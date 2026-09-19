import { AutoCheckId, ChecklistItemLink, SOPTemplate, SOPTemplateItem, SOPTemplateSection } from '@/types';

/**
 * SOP Templates — each defines a reusable checklist structure.
 * Items have no `id` here; IDs are generated at instantiation time.
 *
 * Two things are worth knowing before editing these.
 *
 * A section's `role` is what the Delivery tab does there beyond listing items.
 * Every section is a stage in the arc whether or not it has a role, so there is
 * no longer any such thing as a section Delivery cannot see.
 *
 * `howTo` and `links` exist because this helper used to accept only a title, and
 * authors worked around it by writing URLs inside titles, where they render as
 * unclickable text. Put the URL in `links` and the judgement call in `howTo`.
 */

type ItemSpec = {
    title: string;
    emoji?: string;
    autoCheck?: AutoCheckId;
    howTo?: string;
    links?: ChecklistItemLink[];
    /** Gates the stages after this one. Used sparingly: a gate on everything is a gate on nothing. */
    blocking?: boolean;
};

const makeItems = (items: ItemSpec[]): SOPTemplateItem[] =>
    items.map((item, i) => ({
        ...item,
        status: 'not_started' as const,
        order: i,
    }));

/**
 * How ActiveSet runs any engagement, whatever is being built.
 *
 * Getting the client into Slack, the welcome email, the sync cadence, the
 * walkthrough at the end: none of that is specific to Webflow or to branding,
 * and it was previously written into the Webflow SOP only — so a brand project
 * got no Slack channel, no welcome email and no kickoff call from its checklist.
 * Defined once here and wrapped around every template by
 * {@link withAgencyBasics}, so adding a step to how the agency works adds it to
 * every project type at once.
 */
export const AGENCY_START: Omit<SOPTemplateSection, 'order'> = {
    title: 'Start: client setup',
    emoji: '\u{1F91D}',
    role: 'kickoff',
    items: makeItems([
        { title: 'Book the kickoff call as soon as the deal closes', emoji: '\u{1F4C5}', blocking: true },
        {
            title: 'Hold the kickoff call',
            emoji: '\u{1F4DE}',
            blocking: true,
            howTo: 'Cover four things and nothing else: what is in scope, the deadline, who does what on both sides, and where we will talk day to day.',
        },
        {
            title: 'Create the shared Slack channel with the client',
            emoji: '\u{1F4AC}',
            howTo: 'Run the channel setup workflow so it is named and stocked the same way every time. Slack is where we talk; email is for things that need a record.',
        },
        { title: 'Agree the sync cadence \u2014 weekly or every two weeks', emoji: '\u{1F501}' },
        { title: 'Name the leads on both sides, ours and theirs', emoji: '\u{1F465}' },
        { title: 'Project Lead sends the welcome email introducing the team', emoji: '\u{1F48C}' },
        {
            title: 'Create the ClickUp task list',
            emoji: '\u2611\uFE0F',
            howTo: 'Use the \u2699\uFE0F One Click Setup so the list matches this SOP.',
        },
        { title: 'Share the project tracker with the client', emoji: '\u{1F4CA}' },
        { title: 'Create the MarkUp folder', emoji: '\u{1F4DD}', links: [{ label: 'MarkUp', url: 'https://www.markup.io/' }] },
        {
            title: 'Hold the internal kickoff',
            emoji: '\u{1F465}',
            howTo: 'The team without the client: deadline, what is going to be awkward to build, and anything in the brief nobody understands yet.',
        },
    ]),
};

export const AGENCY_CLOSE: Omit<SOPTemplateSection, 'order'> = {
    title: 'Close: handover & sign-off',
    emoji: '\u2705',
    role: 'client_review',
    items: makeItems([
        {
            title: 'Record the walkthrough videos',
            emoji: '\u{1F3AC}',
            howTo: 'How to edit it, how to publish it, and anything custom. This is what stops the support questions six months from now.',
        },
        { title: 'Hand over the documentation and the video links', emoji: '\u{1F4E6}' },
        {
            title: 'Get written approval',
            emoji: '\u2705',
            blocking: true,
            howTo: 'In writing, from whoever can actually sign it off. Verbal approval on a call is not what you want to be relying on if this goes sideways.',
        },
        {
            title: 'Agree what happens next',
            emoji: '\u{1F501}',
            howTo: 'Retainer, ad-hoc support, or nothing. Saying it out loud at handover is much easier than raising it three weeks later.',
        },
        { title: 'Archive the project files and close the ClickUp list', emoji: '\u{1F5C4}\uFE0F' },
    ]),
};

/**
 * Numbers a template's stages.
 *
 * Sections are written without an `order` and numbered here, so inserting a
 * stage is a one-line edit rather than a renumbering exercise.
 *
 * The agency basics are deliberately NOT added here any more. Wrapping them
 * around the built-in templates only reached projects made from those two, and
 * every real project here runs from a template somebody wrote in the Checklist
 * Creator — so the steps that are supposed to be common reached almost nothing.
 * They are applied when a checklist is created instead, whatever template it
 * came from. See `agencyBasicsFor` and `ChecklistService.createChecklist`.
 */
function numbered(sections: Omit<SOPTemplateSection, 'order'>[]): SOPTemplateSection[] {
    return sections.map((section, order) => ({ ...section, order }));
}

export const SOP_TEMPLATES: SOPTemplate[] = [
    {
        id: 'webflow_migration_v1',
        name: 'Website Migration to Webflow',
        description: 'Complete SOP for migrating a website to Webflow — from input gathering to launch.',
        icon: '📄',
        sections: numbered([
            {
                title: 'Input',
                emoji: '📥',
                // The build cannot start without these, which is what `blocking` says.
                role: 'kickoff',
                items: makeItems([
                    {
                        title: 'Scan the live site and get the full page list',
                        emoji: '🐸',
                        blocking: true,
                        howTo: 'Crawl the whole site in Screaming Frog, then cross-check against sitemap.xml — a crawl misses orphan pages and a sitemap misses what is not in it. The combined list is what goes on the tracker.',
                        links: [
                            { label: 'Screaming Frog', url: 'https://www.screamingfrog.co.uk/seo-spider/' },
                        ],
                    },
                    {
                        title: 'Confirm with the client whether copy and structure stay the same',
                        emoji: '📝',
                        blocking: true,
                        howTo: 'Ask plainly and get it in writing. If either changes it is a redesign, not a migration, and the scope and price are different. Settle this before anyone opens Webflow.',
                    },
                    {
                        title: 'Get the assets folder',
                        emoji: '📂',
                        blocking: true,
                        howTo: 'A Drive folder from the client is the good case. If they have nothing, scrape the images off the live site and flag that quality is whatever the old site had.',
                        links: [{ label: 'extract.pics — scrape images', url: 'https://extract.pics/' }],
                    },
                    {
                        title: 'Get the font files',
                        emoji: '⌨️',
                        blocking: true,
                        howTo: 'Licensed fonts have to come from the client. If the face is on Google Fonts, download it there instead of asking.',
                        links: [{ label: 'Google Fonts', url: 'https://fonts.google.com/' }],
                    },
                    { title: 'Access to the original project, if there is one', emoji: '✍️' },
                    {
                        title: 'Decide where video will be hosted, if the site has any',
                        emoji: '📺',
                        howTo: 'Webflow will not host video with sound at any useful size. Vimeo is the paid option and Netlify gives 100GB free. Decide before the build, because it changes how the section is built.',
                    },
                    {
                        title: 'Client Webflow account on a paid plan',
                        emoji: '🔒',
                        howTo: 'Needed to transfer the finished site. The build happens on the ActiveSet account, so this only blocks launch, not development.',
                    },
                    {
                        title: 'Domain registrar access, or the client does the DNS themselves',
                        emoji: '🌐',
                        howTo: 'Either works. What matters is knowing which one, before launch day rather than on it.',
                    },
                    {
                        title: 'HubSpot form code, if they use HubSpot',
                        emoji: '📄',
                        howTo: 'The embed code comes from the client. Styling it to match the design is customisation and is billed.',
                    },
                    { title: 'Analytics: Google Tag Manager, Google Analytics and Microsoft Clarity codes', emoji: '📊' },
                    { title: 'Map API key, if the site has a map', emoji: '📍' },
                    {
                        title: 'Send the client the cookie consent banner',
                        emoji: '🍪',
                        links: [{ label: 'Cookie banner signup', url: 'https://gr3f.co/c/60899/tFmEJ' }],
                    },
                ]),
            },
            {
                title: 'Step 1: Project Planning',
                emoji: '\u{1F4C1}',
                items: makeItems([
                    {
                        title: 'List every page on the live site, including CMS collections',
                        emoji: '\u{1F4D1}',
                        howTo: 'The crawl gives you the pages. The CMS collections behind them are what the crawl will not tell you, and they decide how much of the build is templates.',
                    },
                ]),
            },
            {
                title: 'Step 2: Design Preparation (Developer)',
                emoji: '🎨',
                items: makeItems([
                    { title: 'Check the styleguide is consistent: spacing, typography, colours', emoji: '✒️' },
                    { title: 'Plan the components with the designer', emoji: '💟' },
                    {
                        title: 'Pre-check tablet and mobile, and flag problems now',
                        emoji: '🗯️',
                        howTo: 'Anything that only works at desktop width is cheaper to raise with the designer today than to rebuild in Webflow next week.',
                    },
                ]),
            },
            {
                title: 'Step 3: Webflow Project Setup',
                emoji: '🧱',
                items: makeItems([
                    {
                        title: 'Add the project links to the widget',
                        emoji: '📟',
                        howTo: 'Tracker sheet, MarkUp folder, ClickUp list and Figma, so everyone finds them in one place instead of scrolling Slack.',
                        links: [{ label: 'Links Widget', url: 'https://app.activeset.co/' }],
                    },
                    { title: 'Duplicate the Webflow starter project (activeset-style-guide)', emoji: '🍽️' },
                    { title: 'Upload the client fonts, if they are not on Google Fonts', emoji: '✒️' },
                    { title: 'Fill the variables: fonts, colours, typography', emoji: '✒️' },
                    { title: 'Update the project settings', emoji: '⚙️' },
                ]),
            },
            {
                title: 'Step 4: CMS Configuration',
                emoji: '🗃️',
                items: makeItems([
                    {
                        title: 'Decide what in the design should be CMS',
                        emoji: '🧑‍✈️',
                        howTo: 'Anything the client will add to after launch. Getting this wrong means rebuilding pages later, so decide before building any of them.',
                    },
                    { title: 'Create the collections with proper field names', emoji: '🏑' },
                    { title: 'Set up reference and multi-reference fields between collections', emoji: '📐' },
                    { title: 'Build the CMS template pages (blog, case study)', emoji: '⛩️' },
                    {
                        title: 'Add filtering, load-more and sharing where needed',
                        emoji: '🏁',
                        links: [{ label: 'Finsweet Attributes', url: 'https://finsweet.com/attributes' }],
                    },
                ]),
            },
            {
                title: 'Step 5: Page Development & Layout',
                emoji: '🧩',
                // The build itself: the page grid renders in this stage.
                role: 'pages',
                items: makeItems([
                    { title: 'Build a proper structure with correct class names', emoji: '🏗️' },
                    { title: 'Build the global components: navbar, footer, buttons, containers', emoji: '🏗️' },
                    { title: 'Add animations and interactions (scroll, hover, page load, GSAP if needed)', emoji: '🌀' },
                    { title: 'Make every page responsive: tablet, mobile landscape, mobile portrait', emoji: '📲' },
                    {
                        title: 'Compress every image and serve WebP',
                        emoji: '🖼️',
                        howTo: 'This is the single biggest lever on the speed score, and it is much slower to fix after every page is built.',
                    },
                    { title: 'Build the 404 page and the form success state', emoji: '🙅‍♂️' },
                ]),
            },
            {
                title: 'Step 6: Integrations & Custom Code',
                emoji: '🔧',
                items: makeItems([
                    { title: 'Add SEO titles, descriptions and Open Graph fields', emoji: '⚓', autoCheck: 'meta_description' },
                    { title: 'Set up form automation, if it is needed (Zapier or Make)', emoji: '⚓' },
                    { title: 'Add the custom JS and CSS (GSAP, SplitType, smooth scroll)', emoji: '⚓' },
                    { title: 'Configure the forms: success message, required fields, validation', emoji: '⚓' },
                    { title: 'Add the favicon and webclip', emoji: '⚓' },
                    { title: 'Install the analytics the client sent in Input', emoji: '⚓' },
                ]),
            },
            {
                title: 'Step 7: QA & Pre-Launch Checklist',
                emoji: '🧪',
                role: 'launch',
                items: makeItems([
                    { title: 'Test every page at every breakpoint', emoji: '🏁' },
                    { title: 'Check the animations are smooth on a real device, not just the desktop preview', emoji: '🏁' },
                    { title: 'Check every link, button and nav item', emoji: '🏁', autoCheck: 'links_resolve' },
                    { title: 'Check the CMS data renders properly on the templates', emoji: '🏁' },
                    { title: 'Test every form: submit, error state, and where the data lands', emoji: '🏁' },
                    { title: 'Check the loading speed and optimise whatever is slow', emoji: '🏁' },
                    { title: 'Check every page has a title and meta description', emoji: '🏁', autoCheck: 'page_title' },
                    { title: 'Check every image has alt text', emoji: '🏁', autoCheck: 'image_alt' },
                    { title: 'Proofread the copy', emoji: '🏁', autoCheck: 'spelling' },
                ]),
            },
            {
                title: 'Step 8: Client Review',
                emoji: '\u{1F91D}',
                role: 'client_review',
                items: makeItems([
                    { title: 'Share the staging and MarkUp links for feedback', emoji: '\u{1F517}' },
                    { title: 'Work through the MarkUp comments', emoji: '\u{1F4AC}' },
                ]),
            },
            {
                title: 'Step 9: Launch',
                emoji: '🚀',
                role: 'launch',
                items: makeItems([
                    {
                        title: 'Set up the redirects from the old URLs',
                        emoji: '↪️',
                        blocking: true,
                        howTo: 'Every old URL that is not carried over needs a 301, or the rankings that came with it are gone. The crawl from Input is the list to work from.',
                    },
                    { title: 'Transfer the project to the client Webflow account', emoji: '🔑' },
                    { title: 'Connect the domain and the hosting settings', emoji: '🌐' },
                    {
                        title: 'Remove the staging noindex before publishing',
                        emoji: '🔍',
                        blocking: true,
                        howTo: 'A site that launches with noindex still on is invisible to Google and nobody notices for weeks.',
                    },
                    { title: 'Publish', emoji: '🚀' },
                    { title: 'Run the live checks: forms, links, analytics firing', emoji: '🧪' },
                    { title: 'Submit the sitemap in Google Search Console', emoji: '🗺️' },
                ]),
            },
            {
                title: 'Outputs',
                emoji: '📦',
                items: makeItems([
                    { title: 'A responsive, optimised Webflow site the client owns', emoji: '🌐' },
                    { title: 'Every requirement met and approved', emoji: '✅' },
                    { title: 'Documentation and walkthrough videos handed over', emoji: '📚' },
                    { title: 'Redirects in place and the sitemap submitted', emoji: '↪️' },
                ]),
            },
        ]),
    },
    {
        id: 'branding_v1',
        name: 'Brand Evolution',
        description: 'Complete SOP for brand evolution — from kickoff questionnaire through research, moodboards, stylescapes, logo, collateral to brand book handover.',
        icon: '🎨',
        sections: numbered([
            {
                title: 'Input & Requirements',
                emoji: '📥',
                role: 'kickoff',
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
                role: 'client_review',
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
        ]),
    },
];

export const getTemplateById = (id: string): SOPTemplate | undefined =>
    SOP_TEMPLATES.find(t => t.id === id);

export const getDefaultTemplate = (): SOPTemplate => SOP_TEMPLATES[0];
