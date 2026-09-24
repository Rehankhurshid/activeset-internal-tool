import type {
  ChecklistItem,
  ChecklistSection,
  ClientPlan,
  ClientPlanFile,
  ClientPlanStage,
  ClientStageKind,
  ClientStatus,
  ProjectChecklist,
  ProjectLink,
  ProjectTimeline,
  StageRole,
  TimelineMilestone,
} from '@/types';

/**
 * The client dashboard's plan: the stages a client sees, what they get in each,
 * when, and where the project is right now.
 *
 * A plan is drafted from the project's own checklist, so a Webflow build and a
 * brand project each get the stages their SOP actually has, and then it is the
 * team's to edit. Progress is read back off that same checklist, the one the
 * team ticks in the Delivery tab, which is what keeps the client's tracker live
 * without anyone updating it by hand. The team can always pin the stage when the
 * checklist says otherwise.
 */

/** `clientFacing.currentStageId` meaning every stage is done. */
export const PLAN_COMPLETE = '__complete__';

/** Canonical order. A drafted plan's stages always run in this order. */
export const CLIENT_STAGE_KINDS: readonly ClientStageKind[] = [
  'kickoff',
  'discovery',
  'design',
  'build',
  'review',
  'launch',
  'handover',
];

export interface ClientStageDefaults {
  title: string;
  /** Calendar days the stage takes when nobody has said otherwise. */
  days: number;
  /** Starting wording for "what you get". The team rewrites it per project. */
  deliverables: string[];
}

export const CLIENT_STAGE_DEFAULTS: Record<ClientStageKind, ClientStageDefaults> = {
  kickoff: {
    title: 'Kickoff',
    days: 5,
    deliverables: ['A kickoff call and a shared Slack channel', 'This plan, with a date for every stage'],
  },
  discovery: { title: 'Discovery', days: 7, deliverables: ['Research and direction, written up for you'] },
  design: { title: 'Design', days: 14, deliverables: ['Designs for you to review and comment on'] },
  build: { title: 'Build', days: 21, deliverables: ['A staging site with every page, for you to review'] },
  review: { title: 'Review', days: 7, deliverables: ['Your feedback round, and every fix from it'] },
  launch: { title: 'Launch', days: 3, deliverables: ['Your site live on your domain'] },
  handover: { title: 'Handover', days: 3, deliverables: ['Walkthrough videos, documentation and final files'] },
};

/** The stages a plan gets when there is no checklist to read them from. */
export const STANDARD_STAGE_KINDS: readonly ClientStageKind[] = [
  'kickoff',
  'design',
  'build',
  'review',
  'launch',
  'handover',
];

/** The parts of a checklist section the plan reads. SOP templates and live checklists both fit. */
export interface PlanSection {
  title: string;
  role?: StageRole;
  stage?: ChecklistSection['stage'];
  items?: Pick<ChecklistItem, 'status'>[];
}

// --- Which stage a section belongs to -------------------------------------

/**
 * Title patterns, most specific first: "Pre-launch QA" is a review and
 * "Post-launch support" is handover, so both are asked before plain "launch".
 */
const TITLE_PATTERNS: ReadonlyArray<readonly [ClientStageKind, RegExp]> = [
  [
    'handover',
    /\bpost[\s-]?(?:launch|production)\b|hand[\s-]?over|hand[\s-]?off|sign[\s-]?off|\bclose\b|closing|wrap[\s-]?up|\boutputs?\b|\btraining\b|documentation|brand ?book/,
  ],
  ['review', /\bpre[\s-]?launch\b|\bqa\b|quality|\btest|review|feedback|revision|\buat\b|approval/],
  ['launch', /launch|go[\s-]?live|publish|cut[\s-]?over|\bdns\b|domain|deploy/],
  ['kickoff', /kick[\s-]?off|onboard|\bstart\b|\binput\b|\bbrief\b|requirement|intake|client setup/],
  ['discovery', /discover|research|planning|strategy|\baudit\b|analysis|competit|scope|questionnaire/],
  [
    'design',
    /design|mood ?board|stylescape|wireframe|visual|\blogo|collateral|illustration|\bui\b|\bux\b|prototype|style ?guide/,
  ],
  [
    'build',
    /build|develop|set[\s-]?up|\bcms\b|\bpages?\b|integration|custom code|migration|content|implement|webflow|framer/,
  ],
];

/** A section's role, when its title says nothing: the build grid, the sign-off, the launch. */
function kindFromRole(section: PlanSection): ClientStageKind | undefined {
  const role = section.role ?? (section.stage === 'kickoff' || section.stage === 'launch' ? section.stage : undefined);
  switch (role) {
    case 'kickoff':
      return 'kickoff';
    case 'pages':
      return 'build';
    case 'client_review':
      return 'review';
    case 'launch':
      return 'launch';
    default:
      return undefined;
  }
}

/** What a section's own title or role says it is, before its neighbours are considered. */
export function kindOfSection(section: PlanSection): ClientStageKind | undefined {
  const title = (section.title ?? '').toLowerCase();
  for (const [kind, pattern] of TITLE_PATTERNS) {
    if (pattern.test(title)) return kind;
  }
  return kindFromRole(section);
}

const rank = (kind: ClientStageKind) => CLIENT_STAGE_KINDS.indexOf(kind);
const BUILD_RANK = rank('build');

/** Whether the next section that says anything, reviews aside, is the build or earlier. */
function buildStillAhead(raw: (ClientStageKind | undefined)[], index: number): boolean {
  for (let i = index + 1; i < raw.length; i += 1) {
    const next = raw[i];
    if (!next || next === 'review') continue;
    return rank(next) <= BUILD_RANK;
  }
  return false;
}

/**
 * The stage each section belongs to, in the checklist's own order.
 *
 * Three rules keep this sensible on SOPs nobody here wrote:
 * - A section whose title says nothing belongs with the one before it.
 * - The walk never goes backwards: a late "SEO audit" is part of whatever stage
 *   the project has reached by then, not a return to discovery.
 * - A review partway through, "Design review" before the build, belongs to the
 *   stage it reviews. Only a review with no build still ahead of it is the
 *   client's Review stage.
 */
export function classifySections(sections: PlanSection[]): ClientStageKind[] {
  const raw = sections.map(kindOfSection);
  const out: ClientStageKind[] = [];
  let cursor: ClientStageKind | undefined;

  raw.forEach((kind, index) => {
    let assigned: ClientStageKind;
    if (!kind) {
      assigned = cursor ?? 'kickoff';
    } else if (cursor && rank(kind) < rank(cursor)) {
      assigned = cursor;
    } else if (kind === 'review' && (!cursor || rank(cursor) < BUILD_RANK) && buildStillAhead(raw, index)) {
      assigned = cursor ?? 'kickoff';
    } else {
      assigned = kind;
    }
    cursor = assigned;
    out.push(assigned);
  });

  return out;
}

function toMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object') {
    const v = value as { toMillis?: () => number; toDate?: () => Date; seconds?: unknown };
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.toDate === 'function') return v.toDate().getTime();
    if (typeof v.seconds === 'number') return v.seconds * 1000;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

/** Every section of every checklist, oldest checklist first, each in its own order. */
export function checklistSections(checklists: ProjectChecklist[]): ChecklistSection[] {
  return [...checklists]
    .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt) || (a.id ?? '').localeCompare(b.id ?? ''))
    .flatMap((checklist) => [...(checklist.sections ?? [])].sort((a, b) => a.order - b.order));
}

/** The newest change to any checklist, as an ISO timestamp; undefined when there is none. */
export function latestChecklistChange(checklists: ProjectChecklist[]): string | undefined {
  const latest = checklists.reduce((max, c) => Math.max(max, toMillis(c.updatedAt)), 0);
  return latest > 0 ? new Date(latest).toISOString() : undefined;
}

// --- Dates -----------------------------------------------------------------

const DAY_MS = 86_400_000;

export function isIsoDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

export function addDaysIso(iso: string, days: number): string {
  return new Date((dayNumber(iso) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** Integers summing exactly to `total`, each at least 1, shared in proportion to `weights`. */
function apportion(weights: number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const spare = total - weights.length;
  const exact = weights.map((w) => (sum > 0 ? (w / sum) * spare : spare / weights.length));
  const floors = exact.map(Math.floor);
  let left = spare - floors.reduce((a, b) => a + b, 0);
  const byRemainder = exact
    .map((x, i) => ({ i, remainder: x - floors[i] }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors.map((f) => f + 1);
}

/**
 * Back-to-back dates for stages of the given lengths, starting on `startDate`.
 * With an `endDate`, the lengths are scaled so the last stage finishes on it,
 * as long as every stage still gets at least a day.
 */
export function spreadStageDates(
  days: number[],
  startDate: string,
  endDate?: string,
): { startDate: string; dueDate: string }[] {
  if (!isIsoDay(startDate) || days.length === 0) return [];
  let lengths = days.map((d) => Math.max(1, Math.round(d)));
  if (endDate && isIsoDay(endDate)) {
    const span = dayNumber(endDate) - dayNumber(startDate) + 1;
    if (span >= lengths.length) lengths = apportion(lengths, span);
  }
  const out: { startDate: string; dueDate: string }[] = [];
  let cursor = startDate;
  for (const length of lengths) {
    const dueDate = addDaysIso(cursor, length - 1);
    out.push({ startDate: cursor, dueDate });
    cursor = addDaysIso(dueDate, 1);
  }
  return out;
}

// --- Drafting --------------------------------------------------------------

export function newPlanId(prefix: 'stg' | 'file'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** The kinds of stage a checklist has, in order; the standard set when it has none. */
export function planStageKinds(sections: PlanSection[]): ClientStageKind[] {
  const found = new Set(classifySections(sections));
  const kinds = CLIENT_STAGE_KINDS.filter((kind) => found.has(kind));
  return kinds.length > 0 ? kinds : [...STANDARD_STAGE_KINDS];
}

export interface DraftPlanOptions {
  /** YYYY-MM-DD the first stage starts. Without it the stages have no dates. */
  startDate?: string;
  /** YYYY-MM-DD the last stage should finish by; stage lengths are scaled to fit. */
  endDate?: string;
  templateId?: string;
}

/** A first plan for a project, from the sections of its checklist (or its template). */
export function draftClientPlan(sections: PlanSection[], options: DraftPlanOptions = {}): ClientPlan {
  const kinds = planStageKinds(sections);
  const dates = options.startDate
    ? spreadStageDates(kinds.map((kind) => CLIENT_STAGE_DEFAULTS[kind].days), options.startDate, options.endDate)
    : [];

  const stages: ClientPlanStage[] = kinds.map((kind, index) => {
    const stage: ClientPlanStage = {
      id: `stg_${kind}`,
      title: CLIENT_STAGE_DEFAULTS[kind].title,
      kind,
      deliverables: [...CLIENT_STAGE_DEFAULTS[kind].deliverables],
      files: [],
    };
    const range = dates[index];
    if (range) {
      stage.startDate = range.startDate;
      stage.dueDate = range.dueDate;
    }
    return stage;
  });

  const plan: ClientPlan = { stages, files: [] };
  if (options.templateId) plan.templateId = options.templateId;
  return plan;
}

// --- Keeping stored plans clean -------------------------------------------

const MAX_STAGES = 20;
const MAX_FILES = 30;
const MAX_DELIVERABLES = 20;

/**
 * The URL to publish, or null. Only http(s): a `javascript:` link typed into a
 * file row must never become a live link on a page served to clients. A bare
 * "figma.com/…" is taken to mean https.
 */
export function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return candidate;
  } catch {
    return null;
  }
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function normalizePlanFiles(files: unknown): ClientPlanFile[] {
  if (!Array.isArray(files)) return [];
  const out: ClientPlanFile[] = [];
  files.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || out.length >= MAX_FILES) return;
    const file = raw as Partial<ClientPlanFile>;
    const url = safeHttpUrl(file.url);
    if (!url) return;
    out.push({
      id: text(file.id, 64) || `file_${index}`,
      title: text(file.title, 120) || hostLabel(url),
      url,
    });
  });
  return out;
}

function normalizeStage(raw: unknown, index: number): ClientPlanStage | null {
  if (!raw || typeof raw !== 'object') return null;
  const stage = raw as Partial<ClientPlanStage>;
  const out: ClientPlanStage = {
    id: text(stage.id, 64) || `stg_${index}`,
    title: text(stage.title, 80) || 'Untitled stage',
    deliverables: (Array.isArray(stage.deliverables) ? stage.deliverables : [])
      .map((line) => text(line, 200))
      .filter(Boolean)
      .slice(0, MAX_DELIVERABLES),
    files: normalizePlanFiles(stage.files),
  };
  if (stage.kind && CLIENT_STAGE_KINDS.includes(stage.kind)) out.kind = stage.kind;
  if (isIsoDay(stage.startDate)) out.startDate = stage.startDate;
  if (isIsoDay(stage.dueDate)) out.dueDate = stage.dueDate;
  return out;
}

/**
 * A plan with every field in shape: titles trimmed, empty lines dropped, only
 * http(s) files, no `undefined` anywhere (Firestore rejects it). Applied on
 * every write and again before anything reaches the client.
 */
export function normalizeClientPlan(plan: Partial<ClientPlan> | null | undefined): ClientPlan {
  const stages = (Array.isArray(plan?.stages) ? plan.stages : [])
    .map(normalizeStage)
    .filter((s): s is ClientPlanStage => s !== null)
    .slice(0, MAX_STAGES);
  const out: ClientPlan = { stages, files: normalizePlanFiles(plan?.files) };
  const templateId = text(plan?.templateId, 120);
  if (templateId) out.templateId = templateId;
  if (typeof plan?.updatedAt === 'string' && plan.updatedAt) out.updatedAt = plan.updatedAt;
  if (typeof plan?.updatedBy === 'string' && plan.updatedBy) out.updatedBy = plan.updatedBy;
  return out;
}

// --- Where the project is ---------------------------------------------------

export type PlanStageState = 'done' | 'current' | 'upcoming';

export interface StageTracking {
  /** Checklist items ticked in the sections behind this stage. */
  done: number;
  /** Items that count: everything except those skipped as not applicable. */
  total: number;
  /** Items still to do. */
  open: number;
}

export interface ResolvedStage {
  stage: ClientPlanStage;
  state: PlanStageState;
  /** Null when no checklist section tracks this stage. */
  tracking: StageTracking | null;
  /** 0–100, when tracked and there is something to count. Never 100 until every item is settled. */
  percent?: number;
}

export interface ResolvedPlan {
  stages: ResolvedStage[];
  /** Index of the current stage; -1 when every stage is done, or there are none. */
  currentIndex: number;
  /** Who decided the current stage: the checklist, the team's pin, or a Delivered status. */
  source: 'checklist' | 'team' | 'delivered';
}

export interface ResolvePlanOptions {
  /** `clientFacing.currentStageId`: a stage id, or {@link PLAN_COMPLETE}. */
  currentStageId?: string;
  status?: ClientStatus;
}

/** For each kind, the stage whose sections it counts toward: its own, else the nearest earlier one. */
function stageForKind(stages: ClientPlanStage[], kind: ClientStageKind): number {
  const own = stages.findIndex((s) => s.kind === kind);
  if (own >= 0) return own;
  for (let r = rank(kind) - 1; r >= 0; r -= 1) {
    const earlier = stages.findIndex((s) => s.kind === CLIENT_STAGE_KINDS[r]);
    if (earlier >= 0) return earlier;
  }
  return stages.findIndex((s) => s.kind !== undefined);
}

function trackStages(stages: ClientPlanStage[], sections: PlanSection[]): (StageTracking | null)[] {
  const counts = stages.map(() => ({ done: 0, skipped: 0, all: 0 }));
  const kinds = classifySections(sections);
  const targets = new Map<ClientStageKind, number>();
  sections.forEach((section, index) => {
    const kind = kinds[index];
    if (!targets.has(kind)) targets.set(kind, stageForKind(stages, kind));
    const target = targets.get(kind)!;
    if (target < 0) return;
    for (const item of section.items ?? []) {
      counts[target].all += 1;
      if (item.status === 'completed') counts[target].done += 1;
      else if (item.status === 'skipped') counts[target].skipped += 1;
    }
  });
  return counts.map((c) =>
    c.all === 0 ? null : { done: c.done, total: c.all - c.skipped, open: c.all - c.skipped - c.done },
  );
}

/**
 * The earliest stage not finished, as the Delivery tab picks it: an unfinished
 * early stage is usually what is holding the rest up, and a leftover step shows
 * the team exactly what to tick. A stage nothing tracks cannot finish by
 * itself, so it counts as passed once a later stage has work ticked.
 */
function followChecklist(tracking: (StageTracking | null)[]): number {
  const complete = (t: StageTracking | null) => t !== null && t.open === 0;
  const started = (t: StageTracking | null) => t !== null && (t.done > 0 || t.open === 0);
  for (let i = 0; i < tracking.length; i += 1) {
    const t = tracking[i];
    if (complete(t)) continue;
    if (t === null && tracking.slice(i + 1).some(started)) continue;
    return i;
  }
  return -1;
}

/** Every stage's state and progress, and which one the project is in. */
export function resolveClientPlan(
  plan: Pick<ClientPlan, 'stages'>,
  checklists: ProjectChecklist[] = [],
  options: ResolvePlanOptions = {},
): ResolvedPlan {
  const stages = plan.stages ?? [];
  const tracking = trackStages(stages, checklistSections(checklists));

  let currentIndex: number;
  let source: ResolvedPlan['source'];
  const pinned = options.currentStageId;
  if (options.status === 'delivered') {
    currentIndex = -1;
    source = 'delivered';
  } else if (pinned === PLAN_COMPLETE) {
    currentIndex = -1;
    source = 'team';
  } else if (pinned && stages.some((s) => s.id === pinned)) {
    currentIndex = stages.findIndex((s) => s.id === pinned);
    source = 'team';
  } else {
    currentIndex = followChecklist(tracking);
    source = 'checklist';
  }

  return {
    currentIndex,
    source,
    stages: stages.map((stage, index) => {
      const t = tracking[index];
      const state: PlanStageState =
        currentIndex < 0 || index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming';
      const resolved: ResolvedStage = { stage, state, tracking: t };
      if (t && t.total > 0) resolved.percent = Math.floor((t.done / t.total) * 100);
      return resolved;
    }),
  };
}

/** Whether any stage of the plan follows the checklist at all. */
export function planTracksChecklist(resolved: ResolvedPlan): boolean {
  return resolved.stages.some((s) => s.tracking !== null);
}

// --- Portals set up before plans existed ------------------------------------

export interface LegacyPlan {
  plan: ClientPlan;
  /** Where the old portal put the project: its chosen phase, or the first unfinished one. */
  currentStageId?: string;
}

/**
 * What an old portal showed, as a plan: every timeline phase with a milestone
 * switched on for the client becomes a stage, those milestones its "what you
 * get", and the links switched on become the project's files. Used to keep an
 * already-shared page showing the same things until the team saves a plan, and
 * as the starting point when they do. Null when nothing was ever switched on.
 */
export function legacyClientPlan(input: {
  timeline?: ProjectTimeline | null;
  links?: ProjectLink[];
  currentPhaseId?: string;
}): LegacyPlan | null {
  const phases = [...(input.timeline?.phases ?? [])].sort((a, b) => a.order - b.order);
  const visible = (input.timeline?.milestones ?? []).filter((m) => m.clientVisible === true);
  const phaseIds = new Set(phases.map((p) => p.id));
  const byStart = (a: TimelineMilestone, b: TimelineMilestone) =>
    a.startDate.localeCompare(b.startDate) || a.order - b.order;

  const stages: ClientPlanStage[] = [];
  const finished = new Set<string>();
  const add = (id: string, title: string, milestones: TimelineMilestone[]) => {
    if (milestones.length === 0) return;
    const sorted = [...milestones].sort(byStart);
    const starts = sorted.map((m) => m.startDate).filter(isIsoDay).sort();
    const ends = sorted.map((m) => m.endDate).filter(isIsoDay).sort();
    const stage: ClientPlanStage = { id, title, deliverables: sorted.map((m) => m.title), files: [] };
    if (starts.length > 0) stage.startDate = starts[0];
    if (ends.length > 0) stage.dueDate = ends[ends.length - 1];
    stages.push(stage);
    if (sorted.every((m) => m.status === 'completed')) finished.add(id);
  };

  for (const phase of phases) add(`legacy_${phase.id}`, phase.title, visible.filter((m) => m.phaseId === phase.id));
  add('legacy_other', 'Other', visible.filter((m) => !m.phaseId || !phaseIds.has(m.phaseId)));

  const files = (input.links ?? [])
    .filter((l) => l.source !== 'auto' && l.clientVisible === true)
    .sort((a, b) => a.order - b.order)
    .map((l) => ({ id: `legacy_${l.id}`, title: l.title, url: l.url }));

  const plan = normalizeClientPlan({ stages, files });
  if (plan.stages.length === 0 && plan.files.length === 0) return null;

  let currentStageId: string | undefined;
  const chosen = input.currentPhaseId ? `legacy_${input.currentPhaseId}` : undefined;
  if (chosen && plan.stages.some((s) => s.id === chosen)) {
    currentStageId = chosen;
  } else if (plan.stages.length > 0) {
    currentStageId = plan.stages.find((s) => !finished.has(s.id))?.id ?? PLAN_COMPLETE;
  }

  return { plan, currentStageId };
}
