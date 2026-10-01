/**
 * A project's checklist, for an agent to read and fill in.
 *
 *   npm run checklist -- context <project>     what the app knows: links, contacts, synced Fathom calls, sheet
 *   npm run checklist -- show <project id or name>
 *   npm run checklist -- create <project> <SOP id> [<SOP id>…] [--write]
 *   npm run checklist -- apply <plan.json> [--write]
 *   npm run checklist -- client <project>      the client's page, as the checklist now makes it
 *
 * Rehan, 2026-10-01: "I want an agent to also fill in the data. I don't want
 * API usage." So nothing here thinks: an agent (Claude Code, with the team's
 * Fathom, Slack, Gmail, Calendar and Drive connectors) reads the evidence,
 * writes a plan of what it found, and this script checks the plan against the
 * checklist and applies it. The playbook is .claude/skills/update-checklist.
 *
 * A plan is JSON:
 *   { "project": "<id or name>", "by": "rehan@activeset.co", "updates": [
 *       { "item": "<item id, or the start of its title>", "status": "completed",
 *         "on": "2026-09-22", "values": { "held_on": "2026-09-22" },
 *         "source": "Fathom: DreamTeam KickOff Call, 22 Sep", "overwrite": false } ] }
 *
 * The rules the script holds an agent to:
 * - Every update names its source; it is stored on the item (`filledFrom`).
 * - A ticked item is never unticked, and a value someone typed is never
 *   replaced, unless the update says `"overwrite": true`.
 * - Values go only into fields the item defines.
 * - `on` is the day it actually happened, so the client's page shows the
 *   real date rather than the day the agent ran.
 * Dry run unless --write. Writes stamp the client page's "updated" time.
 */
import '@/lib/load-env';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { SERVICE_LABELS, isServiceId } from '@/lib/engagements';
import { AGENCY_CLOSE, AGENCY_START, getTemplateById } from '@/lib/sop-templates';
import { buildClientPortalView } from '@/modules/client-portal/domain/client-portal.projection';
import type { ProjectSheetRecord } from '@/modules/client-portal/domain/project-sheet.types';
import { snapshotOf } from '@/lib/project-sheet';
import { agencyBasicsFor } from '@/modules/delivery/domain/delivery.basics';
import type { ChecklistItem, ChecklistItemStatus, ChecklistSection, Project, ProjectChecklist, ProjectMeeting, SOPTemplate } from '@/types';

const WRITE = process.argv.includes('--write');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const STATUSES: ChecklistItemStatus[] = ['not_started', 'in_progress', 'completed', 'skipped'];

type Loaded = ProjectChecklist & { ref: FirebaseFirestore.DocumentReference };

function strip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function findProject(ref: string): Promise<{ id: string; name: string }> {
  const direct = await db.collection(COLLECTIONS.PROJECTS).doc(ref).get();
  if (direct.exists) return { id: direct.id, name: String(direct.get('name')) };
  const all = await db.collection(COLLECTIONS.PROJECTS).select('name', 'client').get();
  const wanted = ref.trim().toLowerCase();
  const hits = all.docs.filter(
    (d) => String(d.get('name') ?? '').toLowerCase() === wanted || String(d.get('client') ?? '').toLowerCase() === wanted,
  );
  if (hits.length !== 1) {
    const close = all.docs.filter((d) => String(d.get('name') ?? '').toLowerCase().includes(wanted)).map((d) => `${d.get('name')} (${d.id})`);
    throw new Error(`No single project "${ref}". ${close.length ? `Did you mean: ${close.join(', ')}` : ''}`);
  }
  return { id: hits[0].id, name: String(hits[0].get('name')) };
}

async function loadChecklists(projectId: string): Promise<Loaded[]> {
  const snap = await db.collection(COLLECTIONS.PROJECT_CHECKLISTS).where('projectId', '==', projectId).get();
  return snap.docs
    .map((d) => ({ ...(d.data() as ProjectChecklist), id: d.id, ref: d.ref }))
    .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
}

function toMillis(value: unknown): number {
  const v = value as { toMillis?: () => number } | undefined;
  return typeof v?.toMillis === 'function' ? v.toMillis() : new Date(String(value ?? 0)).getTime() || 0;
}

const day = (iso?: string) => (iso ? iso.slice(0, 10) : '');

async function show(ref: string) {
  const project = await findProject(ref);
  const checklists = await loadChecklists(project.id);
  console.log(`${project.name} (${project.id}): ${checklists.length} checklist(s)`);
  for (const checklist of checklists) {
    console.log(`\nCHECKLIST ${checklist.id} · ${checklist.templateName}`);
    for (const section of [...checklist.sections].sort((a, b) => a.order - b.order)) {
      const client = section.clientStep ? ` → client: "${section.clientStep}"${section.clientWho ? ` (${section.clientWho})` : ''}` : '';
      console.log(`\n## ${section.title}${client}`);
      for (const item of [...section.items].sort((a, b) => a.order - b.order)) {
        const when = item.completedAt ? ` ${day(item.completedAt)}` : '';
        const fields = (item.fields ?? []).map((f) => `${f.id}(${f.type})=${JSON.stringify(item.values?.[f.id] ?? '')}`).join(', ');
        const own = item.clientStep ? ` → client: "${item.clientStep}"${item.clientWho ? ` (${item.clientWho})` : ''}` : '';
        console.log(`  ${item.id} [${item.status}${when}] ${item.title}${own}`);
        if (fields) console.log(`      fields: ${fields}`);
        if (item.filledFrom) console.log(`      filled from: ${item.filledFrom}`);
      }
    }
  }
}

/** Everything the app already holds about a project that a checklist item might need. */
async function context(ref: string) {
  const project = await findProject(ref);
  const doc = (await db.collection(COLLECTIONS.PROJECTS).doc(project.id).get()).data() as Project;
  console.log(`${project.name} (${project.id}) · client ${doc.client ?? '-'} · status ${doc.status} · services ${(doc.services ?? []).join(', ') || '-'}`);
  console.log(`lead ${doc.reviewOwnerEmail ?? '-'} · team ${(doc.assigneeEmails ?? []).join(', ') || '-'}`);
  console.log(`client contacts ${(doc.clientPortal?.contactEmails ?? []).join(', ') || '-'} · meeting domains ${(doc.clientTimeline?.meetingDomains ?? []).join(', ') || '-'} · portal ${doc.clientPortal?.enabled ? 'on' : 'off'}`);
  if (doc.webflowConfig?.customDomain) console.log(`webflow custom domain ${doc.webflowConfig.customDomain}`);
  console.log('\nLINKS');
  for (const link of doc.links ?? []) if (link.url) console.log(`  ${link.title}: ${link.url}`);
  const sheet = await db.collection(COLLECTIONS.PROJECT_SHEETS).doc(project.id).get();
  console.log(`\nPROJECT SHEET ${sheet.exists ? `${sheet.get('title')} · ${sheet.get('url')} · read ${sheet.get('syncedAt')}` : 'none bound'}`);
  const meetings = await db.collection(COLLECTIONS.PROJECTS).doc(project.id).collection(COLLECTIONS.PROJECT_MEETINGS).get();
  const calls = meetings.docs.map((d) => ({ ...(d.data() as ProjectMeeting), id: d.id })).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  console.log(`\nFATHOM CALLS synced to the project (${calls.length})`);
  for (const call of calls) {
    const minutes = call.endedAt ? Math.round((Date.parse(call.endedAt) - Date.parse(call.startedAt)) / 60000) : undefined;
    const summary = (call.summary ?? '').replace(/\]\([^)]*\)/g, ']').replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim();
    console.log(`\n- ${call.startedAt.slice(0, 10)} · ${call.title}${minutes ? ` · ${minutes} min` : ''} · ${call.status}`);
    console.log(`  recording ${call.shareUrl ?? call.fathomUrl ?? '-'} · fathom id ${call.id}`);
    console.log(`  with ${(call.attendees ?? []).map((a) => a.email ?? a.name).join(', ')}`);
    if (summary) console.log(`  ${summary.slice(0, 1500)}${summary.length > 1500 ? '…' : ''}`);
  }
}

/** The client's page, built the way the portal builds it. */
async function client(ref: string) {
  const project = await findProject(ref);
  const doc = (await db.collection(COLLECTIONS.PROJECTS).doc(project.id).get()).data() as Project;
  const checklists = await loadChecklists(project.id);
  const ids = [...new Set(checklists.flatMap((c) => c.templateIds ?? [c.templateId]))];
  const templates = (await Promise.all(ids.map((id) => loadTemplate(id).catch(() => null)))).filter((t): t is SOPTemplate => t !== null);
  const sheetDoc = await db.collection(COLLECTIONS.PROJECT_SHEETS).doc(project.id).get();
  const sheet = snapshotOf(sheetDoc.exists ? (sheetDoc.data() as ProjectSheetRecord) : null);
  const view = buildClientPortalView({
    sheet,
    project: { ...doc, id: project.id, links: [], createdAt: new Date(), updatedAt: new Date() },
    timeline: null,
    checklists,
    templates,
    agency: [AGENCY_START, AGENCY_CLOSE],
  });
  const current = view.currentStageIndex !== undefined ? view.stages[view.currentStageIndex]?.title : 'every stage done';
  console.log(`${project.name}: from the ${view.planSource} · now in ${current} · updated ${view.lastUpdateAt ?? '-'}`);
  for (const stage of view.stages) {
    console.log(`\n${stage.title} (${stage.state})`);
    for (const step of stage.steps ?? []) {
      const mark = step.state === 'done' ? '✓' : step.waiting ? '⏳' : step.state === 'current' ? '●' : '○';
      console.log(`  ${mark} ${step.title}${step.endDate ? ` · ${step.endDate}` : ''}${step.waiting ? ' · waiting on them' : ''}`);
    }
  }
}

async function loadTemplate(id: string): Promise<SOPTemplate> {
  const builtIn = getTemplateById(id);
  if (builtIn) return builtIn;
  const snap = await db.collection(COLLECTIONS.SOP_TEMPLATES).doc(id).get();
  if (!snap.exists) throw new Error(`No SOP ${id}`);
  return { ...(snap.data() as SOPTemplate), id: snap.id };
}

/** The same checklist the app's `createChecklist` makes: the SOPs in order, the agency's start and close around them. */
async function create(ref: string, templateIds: string[]) {
  if (templateIds.length === 0) throw new Error('Name at least one SOP id.');
  const project = await findProject(ref);
  const existing = await loadChecklists(project.id);
  const templates = await Promise.all(templateIds.map(loadTemplate));
  const merged: ChecklistSection[] = [];
  for (const template of templates) {
    const stage = isServiceId(template.service) ? SERVICE_LABELS[template.service] : undefined;
    for (const section of template.sections) {
      merged.push(
        strip({
          ...section,
          clientStage: section.clientStage || stage,
          id: `sec_${randomUUID().slice(0, 12)}`,
          order: merged.length,
          items: section.items.map((item) => ({ ...item, id: `item_${randomUUID().slice(0, 12)}` })),
        }) as ChecklistSection,
      );
    }
  }
  const sections = strip(agencyBasicsFor(merged));
  const name = templates.map((t) => t.name).join(' + ');
  console.log(`${project.name}: ${WRITE ? 'creating' : 'would create'} "${name}" (${sections.length} sections)`);
  if (existing.length) console.log(`  note: it already has ${existing.map((c) => `"${c.templateName}"`).join(', ')}`);
  if (!WRITE) return;
  const doc = await db.collection(COLLECTIONS.PROJECT_CHECKLISTS).add({
    projectId: project.id,
    templateId: templates[0].id,
    templateIds: templates.map((t) => t.id),
    templateName: name,
    sections,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  console.log(`  created ${doc.id}`);
}

interface PlanUpdate {
  item: string;
  status?: ChecklistItemStatus;
  on?: string;
  values?: Record<string, string>;
  source: string;
  overwrite?: boolean;
  /** Who did it, when it was not the plan's `by`. */
  by?: string;
}

interface Plan {
  project: string;
  by: string;
  updates: PlanUpdate[];
}

function findItem(checklists: Loaded[], ref: string): { checklist: Loaded; section: ChecklistSection; item: ChecklistItem } {
  const hits: { checklist: Loaded; section: ChecklistSection; item: ChecklistItem }[] = [];
  const wanted = ref.trim().toLowerCase();
  for (const checklist of checklists) {
    for (const section of checklist.sections) {
      for (const item of section.items) {
        if (item.id === ref || item.title.trim().toLowerCase().startsWith(wanted)) hits.push({ checklist, section, item });
      }
    }
  }
  const exact = hits.filter((h) => h.item.id === ref);
  if (exact.length === 1) return exact[0];
  if (hits.length !== 1) throw new Error(`"${ref}" matches ${hits.length} items${hits.length ? `: ${hits.map((h) => h.item.id).join(', ')}` : ''}. Use the item id.`);
  return hits[0];
}

async function apply(file: string) {
  const plan = JSON.parse(readFileSync(file, 'utf8')) as Plan;
  if (!plan.by || !/@activeset\.co$/i.test(plan.by)) throw new Error('"by" must be an @activeset.co address: who the work is recorded against.');
  const project = await findProject(plan.project);
  const checklists = await loadChecklists(project.id);
  const touched = new Set<Loaded>();
  let changes = 0;

  for (const update of plan.updates) {
    if (!update.source?.trim()) throw new Error(`"${update.item}": every update needs a source.`);
    if (update.status && !STATUSES.includes(update.status)) throw new Error(`"${update.item}": unknown status ${update.status}`);
    if (update.on && !/^\d{4}-\d{2}-\d{2}$/.test(update.on)) throw new Error(`"${update.item}": "on" must be YYYY-MM-DD`);
    const { checklist, section, item } = findItem(checklists, update.item);
    const lines: string[] = [];

    if (update.status && update.status !== item.status) {
      if (item.status === 'completed' && !update.overwrite) {
        lines.push(`status stays completed (asked ${update.status}; pass "overwrite" to change a tick)`);
      } else {
        lines.push(`status ${item.status} → ${update.status}`);
        item.status = update.status;
        if (update.status === 'completed') {
          item.completedAt = update.on ? `${update.on}T12:00:00.000Z` : new Date().toISOString();
          item.completedBy = (update.by ?? plan.by).toLowerCase();
        }
      }
    } else if (update.status === 'completed' && update.on && day(item.completedAt) !== update.on && update.overwrite) {
      lines.push(`completed on ${day(item.completedAt)} → ${update.on}`);
      item.completedAt = `${update.on}T12:00:00.000Z`;
    }

    for (const [field, value] of Object.entries(update.values ?? {})) {
      if (!(item.fields ?? []).some((f) => f.id === field)) throw new Error(`"${item.title}" has no field "${field}" (it has: ${(item.fields ?? []).map((f) => f.id).join(', ') || 'none'})`);
      const current = item.values?.[field] ?? '';
      if (current === value) continue;
      if (current && !update.overwrite) {
        lines.push(`${field} kept as ${JSON.stringify(current)} (found ${JSON.stringify(value)}; pass "overwrite" to replace)`);
        continue;
      }
      lines.push(`${field}: ${JSON.stringify(current)} → ${JSON.stringify(value)}`);
      item.values = { ...(item.values ?? {}), [field]: value };
    }

    const applied = lines.filter((l) => !l.includes('kept as') && !l.startsWith('status stays'));
    if (applied.length) {
      item.filledFrom = update.source.trim();
      touched.add(checklist);
      changes += applied.length;
    }
    console.log(`${applied.length ? '✓' : '·'} ${section.title} › ${item.title}`);
    for (const line of lines) console.log(`    ${line}`);
    if (!lines.length) console.log('    nothing to change');
  }

  console.log(`\n${changes} change(s) in ${touched.size} checklist(s). ${WRITE ? 'Written.' : 'Dry run: pass --write to apply.'}`);
  if (!WRITE || touched.size === 0) return;
  for (const checklist of touched) {
    await checklist.ref.update({ sections: strip(checklist.sections), updatedAt: Timestamp.now() });
  }
  // What a tick in the app does: the client's page counts as updated.
  await db.collection(COLLECTIONS.PROJECTS).doc(project.id).update({
    'clientFacing.lastUpdateAt': new Date().toISOString(),
    'clientFacing.lastUpdateBy': plan.by.toLowerCase(),
  });
}

async function main() {
  const [command, ...rest] = args;
  if (command === 'context' && rest[0]) return context(rest.join(' '));
  if (command === 'client' && rest[0]) return client(rest.join(' '));
  if (command === 'show' && rest[0]) return show(rest.join(' '));
  if (command === 'create' && rest.length >= 2) return create(rest[0], rest.slice(1));
  if (command === 'apply' && rest[0]) return apply(rest[0]);
  console.log('Usage: npm run checklist -- context|show|client <project> | create <project> <SOP id>… [--write] | apply <plan.json> [--write]');
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
