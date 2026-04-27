import type {
    ProjectTimeline,
    TimelineColor,
    TimelineItemStatus,
    TimelineMilestone,
    TimelinePhase,
    TimelineTemplateMilestone,
    TimelineTemplatePhase,
} from '@/types';

export interface ParsedTimelineMarkdown {
    phases: TimelineTemplatePhase[];
    milestones: TimelineTemplateMilestone[];
    warnings: string[];
    referenceStart: string;
}

/**
 * The markdown format is intentionally forgiving:
 *
 *   ## Phase name [color]
 *   - Milestone title: 2026-04-15 → 2026-04-17 [in_progress]
 *   - Single-day task: 2026-04-18
 *
 * Headings starting with `##` open a new phase. The color suffix
 * `[color]` is optional and accepts one of the timeline palette values.
 *
 * Milestone lines start with `-` or `*`. The title is followed by a
 * `:` or `|` separator, then a start date, optionally a `→`/`->`/`-`/`to`
 * separator and an end date. A trailing `[status]` tag is optional.
 * Status values: not_started, in_progress, completed, blocked (or their
 * human-readable equivalents "in progress", "done", "blocked", "todo").
 *
 * Milestones before the first `##` heading become ungrouped.
 */

const COLOR_VALUES: TimelineColor[] = [
    'blue',
    'emerald',
    'amber',
    'rose',
    'violet',
    'slate',
];

const STATUS_ALIASES: Record<string, TimelineItemStatus> = {
    not_started: 'not_started',
    'not started': 'not_started',
    todo: 'not_started',
    pending: 'not_started',
    in_progress: 'in_progress',
    'in progress': 'in_progress',
    doing: 'in_progress',
    wip: 'in_progress',
    completed: 'completed',
    complete: 'completed',
    done: 'completed',
    finished: 'completed',
    blocked: 'blocked',
    stuck: 'blocked',
};

const ISO_DATE = /\d{4}-\d{2}-\d{2}/;

function parseStatus(raw: string | undefined): TimelineItemStatus {
    if (!raw) return 'not_started';
    const key = raw.trim().toLowerCase();
    return STATUS_ALIASES[key] ?? 'not_started';
}

function daysBetweenISO(startISO: string, endISO: string): number {
    const s = new Date(`${startISO}T00:00:00`);
    const e = new Date(`${endISO}T00:00:00`);
    return Math.round((e.getTime() - s.getTime()) / 86400000);
}

/**
 * Parse a markdown string into phases + milestones aligned to
 * `referenceStart` (the ISO date that day-offset 0 represents).
 *
 * The result shape matches TimelineTemplate so callers can reuse the
 * existing applyTemplate machinery.
 */
export function parseTimelineMarkdown(
    markdown: string,
    referenceStart: string
): ParsedTimelineMarkdown {
    const warnings: string[] = [];
    const phases: TimelineTemplatePhase[] = [];
    const milestones: TimelineTemplateMilestone[] = [];

    let currentPhaseIndex: number | undefined = undefined;
    let milestoneOrder = 0;

    const lines = markdown.split(/\r?\n/);

    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
        const rawLine = lines[lineNumber];
        const line = rawLine.trim();
        if (!line) continue;

        // Phase heading — `## Title [color]` (or deeper)
        const phaseMatch = /^#{2,6}\s+(.+?)\s*$/.exec(line);
        if (phaseMatch) {
            const full = phaseMatch[1];
            // Optional `[color]` suffix
            const colorMatch = /\[([a-z]+)\]\s*$/i.exec(full);
            let title = full;
            let color: TimelineColor | undefined;
            if (colorMatch) {
                const candidate = colorMatch[1].toLowerCase() as TimelineColor;
                if (COLOR_VALUES.includes(candidate)) {
                    color = candidate;
                    title = full.slice(0, colorMatch.index).trim();
                } else {
                    warnings.push(
                        `Line ${lineNumber + 1}: unknown color "${candidate}" — ignored.`
                    );
                    title = full.slice(0, colorMatch.index).trim();
                }
            }
            if (!title) {
                warnings.push(`Line ${lineNumber + 1}: phase heading has no title.`);
                continue;
            }
            phases.push({ title, color, order: phases.length });
            currentPhaseIndex = phases.length - 1;
            continue;
        }

        // Milestone line — `- Title: <start> [→ <end>] [status]`
        const itemMatch = /^[-*+]\s+(.+)$/.exec(line);
        if (!itemMatch) {
            // Allow # headings to be skipped elsewhere; ignore other content.
            if (!line.startsWith('#')) {
                warnings.push(
                    `Line ${lineNumber + 1}: ignored (not a heading or list item).`
                );
            }
            continue;
        }

        const body = itemMatch[1];

        // Extract optional trailing status tag `[in_progress]`
        let working = body;
        let status: TimelineItemStatus = 'not_started';
        const trailingStatus = /\[([^\]]+)\]\s*$/.exec(working);
        if (trailingStatus) {
            status = parseStatus(trailingStatus[1]);
            working = working.slice(0, trailingStatus.index).trim();
        }

        // Title separator is `:` or `|`
        const separatorMatch = /[:|]/.exec(working);
        if (!separatorMatch) {
            warnings.push(
                `Line ${lineNumber + 1}: missing ":" or "|" separator between title and date.`
            );
            continue;
        }
        const title = working.slice(0, separatorMatch.index).trim();
        const dateSection = working.slice(separatorMatch.index + 1).trim();
        if (!title) {
            warnings.push(`Line ${lineNumber + 1}: missing milestone title.`);
            continue;
        }

        // Find ISO dates in the date section. Accept 1 or 2.
        const isoMatches = dateSection.match(/\d{4}-\d{2}-\d{2}/g);
        if (!isoMatches || isoMatches.length === 0) {
            warnings.push(
                `Line ${lineNumber + 1}: no ISO date (YYYY-MM-DD) found in "${dateSection}".`
            );
            continue;
        }
        const startISO = isoMatches[0];
        const endISO = isoMatches[1] ?? isoMatches[0];

        if (!ISO_DATE.test(startISO) || !ISO_DATE.test(endISO)) {
            warnings.push(`Line ${lineNumber + 1}: invalid date format.`);
            continue;
        }

        const startOffsetDays = daysBetweenISO(referenceStart, startISO);
        const endOffsetDays = daysBetweenISO(referenceStart, endISO);
        const durationDays = Math.max(endOffsetDays - startOffsetDays + 1, 1);

        milestones.push({
            title,
            status,
            phaseIndex: currentPhaseIndex,
            startDate: '',
            endDate: '',
            startOffsetDays,
            durationDays,
            order: milestoneOrder++,
        });
    }

    return { phases, milestones, warnings, referenceStart };
}

/**
 * Compute the earliest ISO date present in the markdown so the import
 * can be anchored without the user picking one. Falls back to today.
 */
export function detectEarliestDate(markdown: string): string {
    const matches = markdown.match(/\d{4}-\d{2}-\d{2}/g);
    if (!matches || matches.length === 0) {
        return new Date().toISOString().slice(0, 10);
    }
    return matches.slice().sort()[0];
}

/**
 * Serialize a live ProjectTimeline back to the canonical markdown format.
 * Milestones are grouped by phase; ungrouped milestones appear first.
 */
export function serializeTimelineToMarkdown(timeline: ProjectTimeline): string {
    const phaseMap = new Map<string, TimelinePhase>();
    const sortedPhases = [...timeline.phases].sort((a, b) => a.order - b.order);
    for (const p of sortedPhases) phaseMap.set(p.id, p);

    const milestonesByPhase = new Map<string | undefined, TimelineMilestone[]>();
    const sorted = [...timeline.milestones].sort((a, b) => a.order - b.order);
    for (const m of sorted) {
        const key = m.phaseId;
        if (!milestonesByPhase.has(key)) milestonesByPhase.set(key, []);
        milestonesByPhase.get(key)!.push(m);
    }

    const lines: string[] = [];

    // Ungrouped milestones first
    const ungrouped = milestonesByPhase.get(undefined) ?? [];
    for (const m of ungrouped) {
        lines.push(formatMilestoneLine(m));
    }
    if (ungrouped.length > 0 && sortedPhases.length > 0) {
        lines.push('');
    }

    for (let i = 0; i < sortedPhases.length; i++) {
        const phase = sortedPhases[i];
        const colorSuffix = phase.color ? ` [${phase.color}]` : '';
        lines.push(`## ${phase.title}${colorSuffix}`);
        const phaseMilestones = milestonesByPhase.get(phase.id) ?? [];
        for (const m of phaseMilestones) {
            lines.push(formatMilestoneLine(m));
        }
        if (i < sortedPhases.length - 1) {
            lines.push('');
        }
    }

    return lines.join('\n');
}

function formatMilestoneLine(m: TimelineMilestone): string {
    const datePart =
        m.startDate === m.endDate
            ? m.startDate
            : `${m.startDate} → ${m.endDate}`;
    const statusSuffix =
        m.status !== 'not_started' ? ` [${m.status}]` : '';
    return `- ${m.title}: ${datePart}${statusSuffix}`;
}
