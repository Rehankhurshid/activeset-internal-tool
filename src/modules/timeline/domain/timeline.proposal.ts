import type { Proposal, TimelinePhase as ProposalPhase } from '@/app/modules/proposal/types/Proposal';
import type { TimelineColor } from '@/types';
import { TIMELINE_COLORS } from '@/types';
import type { ParsedTimelineMarkdown } from './timeline.markdown';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isISO(value: string | undefined): value is string {
    return !!value && ISO_DATE.test(value);
}

function todayISO(): string {
    return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

function daysBetween(startISO: string, endISO: string): number {
    const s = new Date(`${startISO}T00:00:00`);
    const e = new Date(`${endISO}T00:00:00`);
    return Math.round((e.getTime() - s.getTime()) / 86400000);
}

/**
 * Parse a free-form duration string like "2 weeks", "3 days", "1 month" into
 * a positive whole number of days. Falls back to 7 days when nothing parseable
 * is found so the milestone gets a visible bar instead of collapsing to zero.
 */
export function parseDurationToDays(raw: string | undefined): number {
    if (!raw) return 7;
    const match = /(\d+(?:\.\d+)?)\s*(day|wk|week|month|mo|quarter|qtr|year|yr)s?/i.exec(raw);
    if (!match) return 7;
    const value = parseFloat(match[1]);
    if (!Number.isFinite(value) || value <= 0) return 7;
    const unit = match[2].toLowerCase();
    const perUnit =
        unit.startsWith('day') ? 1
        : unit.startsWith('wk') || unit.startsWith('week') ? 7
        : unit.startsWith('mo') || unit.startsWith('month') ? 30
        : unit.startsWith('qtr') || unit.startsWith('quarter') ? 90
        : unit.startsWith('yr') || unit.startsWith('year') ? 365
        : 1;
    return Math.max(1, Math.round(value * perUnit));
}

interface ResolvedPhase {
    title: string;
    description: string;
    startISO: string;
    durationDays: number;
}

/**
 * Walk proposal phases in declared order and resolve every phase to an
 * absolute startDate + durationDays, filling in gaps where the proposal
 * only set partial information.
 *
 * Resolution rules per phase:
 *  - If both startDate and endDate are valid ISO, use them (duration derived).
 *  - Else if startDate is valid, use it + parsed duration.
 *  - Else, chain off the previous resolved phase's end (or today for the first).
 */
function resolveProposalPhases(phases: ProposalPhase[]): ResolvedPhase[] {
    const out: ResolvedPhase[] = [];
    let cursor = todayISO();

    for (const p of phases) {
        const parsedDuration = parseDurationToDays(p.duration);

        let startISO: string;
        let durationDays: number;

        if (isISO(p.startDate) && isISO(p.endDate)) {
            startISO = p.startDate;
            durationDays = Math.max(1, daysBetween(p.startDate, p.endDate) + 1);
        } else if (isISO(p.startDate)) {
            startISO = p.startDate;
            durationDays = parsedDuration;
        } else {
            startISO = cursor;
            durationDays = parsedDuration;
        }

        out.push({
            title: p.title,
            description: p.description,
            startISO,
            durationDays,
        });

        cursor = addDays(startISO, durationDays);
    }

    return out;
}

/**
 * Convert a Proposal into the same parsed shape produced by the markdown
 * importer so the existing `importParsed` plumbing handles persistence.
 *
 * Each proposal phase becomes one Timeline phase containing a single
 * milestone with the same title and dates. Users can then split a phase
 * into finer-grained milestones from the Timeline UI.
 */
export function proposalToParsedTimeline(proposal: Proposal): ParsedTimelineMarkdown {
    const proposalPhases = proposal.data?.timeline?.phases ?? [];
    const warnings: string[] = [];

    if (proposalPhases.length === 0) {
        return {
            phases: [],
            milestones: [],
            warnings: ['Proposal has no timeline phases.'],
            referenceStart: todayISO(),
        };
    }

    const resolved = resolveProposalPhases(proposalPhases);
    const referenceStart = resolved[0].startISO;

    for (let i = 0; i < proposalPhases.length; i++) {
        const p = proposalPhases[i];
        if (!isISO(p.startDate) && !isISO(p.endDate)) {
            warnings.push(
                `Phase "${p.title}" had no dates — anchored to ${resolved[i].startISO} from duration "${p.duration || '7d default'}".`
            );
        } else if (!isISO(p.endDate)) {
            warnings.push(
                `Phase "${p.title}" missing end date — derived from duration "${p.duration || '7d default'}".`
            );
        } else if (!isISO(p.startDate)) {
            warnings.push(`Phase "${p.title}" missing start date — chained from previous phase.`);
        }
    }

    const phases = resolved.map((r, i) => ({
        title: r.title,
        color: TIMELINE_COLORS[i % TIMELINE_COLORS.length] as TimelineColor,
        order: i,
    }));

    const milestones = resolved.map((r, i) => ({
        title: r.title,
        status: 'not_started' as const,
        phaseIndex: i,
        startDate: '',
        endDate: '',
        startOffsetDays: daysBetween(referenceStart, r.startISO),
        durationDays: r.durationDays,
        order: i,
    }));

    return { phases, milestones, warnings, referenceStart };
}
