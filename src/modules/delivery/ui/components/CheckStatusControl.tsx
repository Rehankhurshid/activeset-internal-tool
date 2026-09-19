'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AUTO_CHECK_IDS, isAutoCheckId } from '../../domain/delivery.types';
import type { AutoCheckId, CheckStatus } from '../../domain/delivery.types';

/**
 * The one place a launch check is answered.
 *
 * Two things have to stay legible here. A check the scan answered still belongs
 * to whoever signs the launch off, so the scan's verdict is shown as the current
 * value and marked as such rather than quietly becoming an answer. And when a
 * person disagrees with the scan, the scan's verdict is kept on screen — a
 * "passed" that overrides a failing scan is exactly the thing someone will want
 * to ask about later.
 */

/** What the scan actually looked at, for the tooltip. Phrased as the check it performed. */
export const AUTO_CHECK_DESCRIPTIONS: Record<AutoCheckId, string> = {
  page_title: 'the page has a title tag',
  meta_description: 'the page has a meta description',
  single_h1: 'the page has an H1',
  image_alt: 'no image is missing its alt text',
  open_graph: 'Open Graph tags are present',
  links_resolve: 'no link on the page is broken',
  schema: 'structured data is present',
  spelling: 'no spelling issues were found',
  // Judgments rather than measurements: these read what the page says, not
  // whether a tag is present.
  title_describes_page: 'the title describes this page, not the company in general',
  meta_description_accurate: 'the meta description matches what the page actually says',
  alt_text_meaningful: 'every image\u2019s alt text says what the image shows',
  copy_is_final: 'no placeholder or filler copy is left on the page',
};

/**
 * The scan signal on a check, if it is one the resolver knows.
 *
 * Checks can arrive from a project document, where the signal is only a string,
 * so it is validated before being shown as automatic — the editor offers
 * {@link AUTO_CHECK_IDS} and nothing else for the same reason.
 */
export function autoCheckIdOf(
  check: { auto?: AutoCheckId } | undefined,
): AutoCheckId | undefined {
  return isAutoCheckId(check?.auto) ? check.auto : undefined;
}

export { AUTO_CHECK_IDS, isAutoCheckId };

const OPTIONS: { status: CheckStatus; label: string; hint: string }[] = [
  { status: 'pending', label: 'Pending', hint: 'Not answered yet' },
  { status: 'passed', label: 'Pass', hint: 'Checked and fine' },
  { status: 'failed', label: 'Fail', hint: 'Checked and not fine — this blocks the launch' },
  { status: 'not_required', label: 'N/R', hint: 'Not required — deliberately excluded, not done' },
];

const SELECTED_CLASSES: Record<CheckStatus, string> = {
  pending: 'bg-muted text-foreground',
  passed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  failed: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
  not_required: 'bg-muted text-muted-foreground line-through decoration-muted-foreground/50',
};

export const STATUS_LABELS: Record<CheckStatus, string> = {
  pending: 'unanswered',
  passed: 'passing',
  failed: 'failing',
  not_required: 'not required',
};

export interface CheckStatusControlProps {
  /** The resolved status — a person's answer, or the scan's verdict. */
  value: CheckStatus;
  /** Where {@link value} came from, straight from `resolveCheck`. */
  source: 'person' | 'scan' | 'none';
  /** What the scan says, when it has an opinion. Shown even when a person overrode it. */
  scanStatus?: CheckStatus;
  /** Which automatic check answered it, for the tooltip. */
  autoCheck?: AutoCheckId;
  /** The check's title, so the control is announced usefully. */
  label: string;
  onChange: (status: CheckStatus) => void;
  disabled?: boolean;
  className?: string;
}

export function CheckStatusControl({
  value,
  source,
  scanStatus,
  autoCheck,
  label,
  onChange,
  disabled,
  className,
}: CheckStatusControlProps) {
  const scanDescription = autoCheck ? AUTO_CHECK_DESCRIPTIONS[autoCheck] : undefined;
  const fromScan = source === 'scan';
  const overridesScan =
    source === 'person' && scanStatus !== undefined && scanStatus !== value;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {fromScan && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="h-5 cursor-help border-dashed px-1.5 text-[10px] font-normal text-muted-foreground"
            >
              from scan
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-[16rem]">
            The last scan checked whether {scanDescription ?? 'this passes'}, and found it{' '}
            {STATUS_LABELS[value]}. Pick a value to answer it yourself — your answer wins.
          </TooltipContent>
        </Tooltip>
      )}

      {overridesScan && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="h-5 cursor-help px-1.5 text-[10px] font-normal text-muted-foreground"
            >
              overrides scan: {STATUS_LABELS[scanStatus]}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-[16rem]">
            The last scan found this {STATUS_LABELS[scanStatus]}
            {scanDescription ? ` — it checked that ${scanDescription}` : ''}. Someone answered{' '}
            {STATUS_LABELS[value]} instead. The scan result is kept here so the call can be checked
            later.
          </TooltipContent>
        </Tooltip>
      )}

      <div
        role="group"
        aria-label={`${label} — status`}
        className="inline-flex h-7 items-center rounded-md border bg-background p-0.5"
      >
        {OPTIONS.map((option) => {
          const selected = option.status === value;
          return (
            <Tooltip key={option.status}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() => onChange(option.status)}
                  className={cn(
                    'h-6 rounded-[5px] px-1.5 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    'disabled:pointer-events-none disabled:opacity-50',
                    selected
                      ? SELECTED_CLASSES[option.status]
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    // A scan-sourced value is shown as the current answer, but drawn as
                    // something nobody has confirmed yet.
                    selected && fromScan && 'border border-dashed border-current/50',
                  )}
                >
                  {option.label}
                </button>
              </TooltipTrigger>
              <TooltipContent>{option.hint}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
