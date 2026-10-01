/**
 * Tags the Checklist Creator's SOPs with the service each delivers and what the
 * client sees of it, and adds first drafts of the two services that had no SOP.
 *
 *   npx tsx --tsconfig scripts/tsconfig.server-scripts.json scripts/seed-service-sops.ts           # dry run
 *   npx tsx --tsconfig scripts/tsconfig.server-scripts.json scripts/seed-service-sops.ts --write   # apply
 *
 * Rehan, 2026-10-01: the team ticks the Checklist, and the client's page
 * follows it; a new project picks its engagement and gets the SOPs for the
 * services it bought. That needs every service to have an SOP tagged with it,
 * and every SOP to say which of its sections and items the client sees.
 *
 * - "Site Branding" → Brand Design, "Figma to Webflow" → Development: the
 *   team's own SOPs. Only labels are added; no item is reworded, added or moved.
 * - "Web Design" and "Copy" did not exist. These are drafts, built from the
 *   steps eight live projects' timelines share, for Rehan to review and edit in
 *   the Checklist Creator. Created only if no SOP of that name exists yet.
 *
 * Idempotent: sections and items are matched by title, and running it again
 * sets the same labels. After this the SOPs in Firestore are the source of
 * truth; this file is the record of what was seeded.
 */
import '@/lib/load-env';
import { db } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/lib/constants';
import type { ClientStepWho, SOPTemplate, SOPTemplateItem, SOPTemplateSection, ServiceId } from '@/types';

const WRITE = process.argv.includes('--write');

interface ItemLabel {
  /** Start of the item's title, as written in the SOP. */
  match: string;
  step?: string;
  who?: ClientStepWho;
  hidden?: boolean;
}

interface SectionLabel {
  /** Start of the section's title, as written in the SOP. */
  match: string;
  step?: string;
  who?: ClientStepWho;
  stage?: string;
  items?: ItemLabel[];
}

interface Tagging {
  name: string;
  service: ServiceId;
  sections: SectionLabel[];
}

const TAGGINGS: Tagging[] = [
  {
    name: 'Site Branding',
    service: 'brand',
    sections: [
      { match: 'Input & Requirements', step: 'Brand questionnaire & assets', who: 'client' },
      { match: 'Phase 1', step: 'Brand discovery workshop', who: 'together' },
      {
        match: 'Phase 2',
        step: 'Moodboarding',
        items: [{ match: 'Present moodboard to client', step: 'Feedback on moodboard', who: 'client' }],
      },
      {
        match: 'Phase 3',
        step: 'Colours, type & visual direction',
        items: [{ match: 'Client sign-off on the chosen direction', step: 'Direction approved', who: 'client' }],
      },
      {
        match: 'Phase 4',
        step: 'Logo & identity concepts',
        items: [
          { match: 'Present to client', step: 'Feedback on logo & identity', who: 'client' },
          { match: 'Iterate based on client feedback', step: 'Logo & identity revisions' },
          { match: 'Final client approval on brand identity', step: 'Brand identity approved', who: 'client' },
        ],
      },
      {
        match: 'Phase 5',
        step: 'Brand book & files',
        items: [{ match: 'Final brand book review with client', step: 'Brand book review', who: 'together' }],
      },
      // "Outputs" lists what the client receives, not work: it stays internal.
    ],
  },
  {
    name: 'Figma to Webflow',
    service: 'development',
    sections: [
      { match: 'Input', step: 'Fonts, logins & tracking codes', who: 'client' },
      // The team's own setup (Slack, ClickUp, MarkUp): internal, under Kickoff.
      { match: 'Step 1', stage: 'Kickoff' },
      { match: 'Step 2', step: 'Webflow setup & style guide' },
      {
        match: 'Step 3',
        step: 'Pages built for desktop & mobile',
        items: [{ match: 'Update Styleguide as per figma', step: 'Webflow setup & style guide' }],
      },
      { match: 'Step 4', step: 'CMS, forms & integrations' },
      { match: 'Step 5', step: 'CMS, forms & integrations' },
      { match: 'Step 6', step: 'QA on every device' },
      {
        match: 'Step 7',
        step: 'Fixes from your review',
        items: [{ match: 'Share the staging and markup links', step: 'Review on staging', who: 'client' }],
      },
      {
        match: 'Step 8',
        stage: 'Launch',
        step: 'Go live',
        // The walkthrough is the handover's step, in the agency close.
        items: [{ match: 'Record Video for Client', hidden: true }],
      },
    ],
  },
];

// --- The two drafts ----------------------------------------------------------

const WHEN_SENT =
  'Mark this In progress when you send it: the client’s page then reads “Waiting on you”. Tick it when their feedback is in.';

type DraftItem = Omit<SOPTemplateItem, 'status' | 'order'>;
type DraftSection = Omit<SOPTemplateSection, 'order' | 'items'> & { items: DraftItem[] };

function draft(name: string, icon: string, description: string, service: ServiceId, sections: DraftSection[]): Omit<SOPTemplate, 'id'> {
  return {
    name,
    icon,
    description,
    service,
    sections: sections.map((section, order) => ({
      ...section,
      order,
      items: section.items.map((item, i) => ({ ...item, status: 'not_started' as const, order: i })),
    })),
  };
}

const WEB_DESIGN = draft(
  'Web Design',
  '🖥️',
  'Website design in Figma, from references to approved designs for every page. Draft for review: edit freely.',
  'web_design',
  [
    {
      title: 'Input & references',
      emoji: '📥',
      clientStep: 'References, assets & sitemap',
      clientWho: 'client',
      items: [
        { title: 'Agree the sitemap: every page, and what each one is for', emoji: '🗺️' },
        { title: 'Collect sites the client likes, and what they like about each', emoji: '✨' },
        { title: 'Collect brand assets: logo, fonts, colours, guidelines', emoji: '🎨' },
        { title: 'Confirm who writes the copy, and when it lands', emoji: '✍️', howTo: 'Design works best from real copy. If it is late, agree which pages get placeholder copy and when the real copy replaces it.' },
        { title: 'Collect photography and illustration, or agree the image direction', emoji: '📸' },
      ],
    },
    {
      title: 'Wireframes',
      emoji: '🧭',
      clientStep: 'Wireframes',
      items: [
        { title: 'Plan each page’s sections from the sitemap and the copy', emoji: '🧩' },
        { title: 'Wireframe the homepage and the key inner pages', emoji: '📐' },
        { title: 'Internal review of the wireframes', emoji: '👀' },
        { title: 'Share the wireframes for feedback', emoji: '📤', clientStep: 'Feedback on wireframes', clientWho: 'client', howTo: WHEN_SENT },
        { title: 'Update the wireframes from the feedback', emoji: '🔁' },
      ],
    },
    {
      title: 'Homepage design',
      emoji: '🎨',
      clientStep: 'Homepage design',
      items: [
        { title: 'Set up the Figma file: grid, colour and type styles, base components', emoji: '🧱' },
        { title: 'Design the homepage for desktop', emoji: '🖥️' },
        { title: 'Internal design review', emoji: '👀' },
        { title: 'Present the homepage design for feedback', emoji: '📤', clientStep: 'Feedback on homepage', clientWho: 'client', howTo: WHEN_SENT },
        { title: 'Revise the homepage from the feedback', emoji: '🔁' },
      ],
    },
    {
      title: 'Inner pages',
      emoji: '📄',
      clientStep: 'Inner pages design',
      items: [
        { title: 'Design every inner page in the sitemap for desktop', emoji: '🖥️' },
        { title: 'Design the CMS templates and their list pages (blog, case studies)', emoji: '🗃️' },
        { title: 'Design the 404 page, form states and empty states', emoji: '🚧' },
        { title: 'Present the inner pages for feedback', emoji: '📤', clientStep: 'Feedback on inner pages', clientWho: 'client', howTo: WHEN_SENT },
        { title: 'Revise the inner pages from the feedback', emoji: '🔁' },
      ],
    },
    {
      title: 'Mobile & hand-off',
      emoji: '📱',
      clientStep: 'Mobile designs & hand-off',
      items: [
        { title: 'Design tablet and mobile for every page', emoji: '📱' },
        { title: 'Note hover, focus, menu and animation behaviour for development', emoji: '🌀' },
        { title: 'Clean the Figma file: named layers, components and styles, nothing detached', emoji: '🧹' },
        { title: 'Mark what is CMS content, and which images the client still owes', emoji: '🏷️' },
        {
          title: 'Get the designs approved in writing',
          emoji: '✅',
          blocking: true,
          clientStep: 'Designs approved',
          clientWho: 'client',
          howTo: 'In writing, from whoever signs off. Mark it In progress when you ask, so their page shows it is waiting on them.',
          fields: [{ id: 'approved_on', label: 'Approved on', type: 'date', expected: true }],
        },
        { title: 'Hand over the Figma file, or brief the developers', emoji: '🤝' },
      ],
    },
  ],
);

const COPY = draft(
  'Copy',
  '✍️',
  'Website copy, from messaging to approved words on every page. Draft for review: edit freely.',
  'copy',
  [
    {
      title: 'Messaging & sitemap',
      emoji: '🧭',
      clientStep: 'Sitemap & messaging',
      items: [
        { title: 'Interview the client: audience, offer, proof, objections', emoji: '🎙️' },
        { title: 'Review how competitors talk about the same thing', emoji: '🔍' },
        { title: 'Write the messaging: value proposition, key messages, tone of voice', emoji: '💬' },
        { title: 'Agree the sitemap and what each page has to do', emoji: '🗺️' },
        { title: 'Share the messaging for sign-off', emoji: '📤', clientStep: 'Messaging approved', clientWho: 'client', howTo: WHEN_SENT },
      ],
    },
    {
      title: 'Copy draft',
      emoji: '✍️',
      clientStep: 'Copy draft',
      items: [
        { title: 'Write the homepage copy', emoji: '🏠' },
        { title: 'Write the inner pages', emoji: '📄' },
        { title: 'Write page titles, meta descriptions and headings for search', emoji: '🔎' },
        { title: 'Internal edit and proofread', emoji: '👀' },
        { title: 'Share the copy for feedback', emoji: '📤', clientStep: 'Feedback on copy', clientWho: 'client', howTo: WHEN_SENT },
      ],
    },
    {
      title: 'Revisions',
      emoji: '🔁',
      clientStep: 'Copy revisions',
      items: [
        { title: 'Revise from the client’s feedback', emoji: '🔁' },
        { title: 'Final proofread', emoji: '🧐' },
        {
          title: 'Get the copy approved',
          emoji: '✅',
          blocking: true,
          clientStep: 'Copy approved',
          clientWho: 'client',
          howTo: 'Mark it In progress when you ask, so their page shows it is waiting on them.',
        },
      ],
    },
  ],
);

// --- Applying it ---------------------------------------------------------------

const starts = (title: string | undefined, match: string) =>
  (title ?? '').trim().toLowerCase().startsWith(match.toLowerCase());

function strip<T extends object>(obj: T): T {
  for (const key of Object.keys(obj) as (keyof T)[]) if (obj[key] === undefined) delete obj[key];
  return obj;
}

function tag(template: SOPTemplate, tagging: Tagging): { sections: SOPTemplateSection[]; notes: string[] } {
  const notes: string[] = [];
  const used = new Set<SectionLabel>();
  const sections = (template.sections ?? []).map((section) => {
    const label = tagging.sections.find((l) => !used.has(l) && starts(section.title, l.match));
    if (!label) {
      notes.push(`  · ${section.title}: internal`);
      return section;
    }
    used.add(label);
    const next: SOPTemplateSection = strip({
      ...section,
      clientStep: label.step,
      clientWho: label.step ? label.who : undefined,
      clientStage: label.stage,
    });
    notes.push(`  · ${section.title} → ${label.stage ? `[${label.stage}] ` : ''}${label.step ?? '(internal)'}${label.who ? ` (${label.who})` : ''}`);
    next.items = (section.items ?? []).map((item) => {
      const itemLabel = label.items?.find((l) => starts(item.title, l.match));
      if (!itemLabel) return item;
      notes.push(`      - ${item.title} → ${itemLabel.hidden ? '(hidden)' : `${itemLabel.step}${itemLabel.who ? ` (${itemLabel.who})` : ''}`}`);
      return strip({
        ...item,
        clientStep: itemLabel.step,
        clientWho: itemLabel.step ? itemLabel.who : undefined,
        clientHidden: itemLabel.hidden || undefined,
      });
    });
    const missed = (label.items ?? []).filter((l) => !(section.items ?? []).some((item) => starts(item.title, l.match)));
    for (const m of missed) notes.push(`      ! no item starting “${m.match}”`);
    return next;
  });
  for (const label of tagging.sections) if (!used.has(label)) notes.push(`  ! no section starting “${label.match}”`);
  return { sections, notes };
}

async function main() {
  const snap = await db.collection(COLLECTIONS.SOP_TEMPLATES).get();
  const all = snap.docs.map((d) => ({ ...(d.data() as SOPTemplate), id: d.id }));

  for (const tagging of TAGGINGS) {
    const found = all.filter((t) => t.name?.trim().toLowerCase() === tagging.name.toLowerCase());
    if (found.length !== 1) {
      console.log(`\n✗ ${tagging.name}: expected one SOP of that name, found ${found.length}. Skipped.`);
      continue;
    }
    const template = found[0];
    const { sections, notes } = tag(template, tagging);
    console.log(`\n${WRITE ? '✓' : '·'} ${tagging.name} (${template.id}) → service ${tagging.service}`);
    console.log(notes.join('\n'));
    if (WRITE) {
      await db.collection(COLLECTIONS.SOP_TEMPLATES).doc(template.id).update({
        service: tagging.service,
        sections,
        updatedAt: Timestamp.now(),
      });
    }
  }

  for (const sop of [WEB_DESIGN, COPY]) {
    const exists = all.some((t) => t.name?.trim().toLowerCase() === sop.name.toLowerCase());
    if (exists) {
      console.log(`\n· ${sop.name}: already exists, left as it is.`);
      continue;
    }
    const items = sop.sections.reduce((n, s) => n + s.items.length, 0);
    console.log(`\n${WRITE ? '✓ Created' : '· Would create'} ${sop.name}: ${sop.sections.length} sections, ${items} items`);
    for (const s of sop.sections) {
      console.log(`  · ${s.title} → ${s.clientStep}${s.clientWho ? ` (${s.clientWho})` : ''}`);
      for (const i of s.items.filter((i) => i.clientStep)) console.log(`      - ${i.title} → ${i.clientStep} (${i.clientWho ?? 'activeset'})`);
    }
    if (WRITE) {
      // Through JSON so no undefined reaches Firestore, which refuses it.
      await db.collection(COLLECTIONS.SOP_TEMPLATES).add({ ...JSON.parse(JSON.stringify(sop)), createdAt: Timestamp.now() });
    }
  }
  if (!WRITE) console.log('\nDry run. Pass --write to apply.');
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
