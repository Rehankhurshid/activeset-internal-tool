"use client"

import { AlertCircle, Check, CircleDashed, HelpCircle, Image as ImageIcon, SpellCheck, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  JUDGMENT_FAIL_AT,
  JUDGMENT_PASS_AT,
  readJudgment,
  type JudgmentVerdict,
} from "@/lib/page-judgment"
import type { PageJudgment } from "@/types"

/**
 * The Jev judgment, shown as a judgment.
 *
 * Every other panel on this screen reports a fact — the title is 54 characters,
 * three links 404. These are probabilities, and the difference has to survive
 * contact with the UI: a 0.6 rendered as a green tick is a lie that costs
 * someone a client call. So the middle band is drawn as its own state, the
 * number is always on screen next to the words, and the only two outcomes that
 * read as settled are the ones past the thresholds.
 */

const VERDICT_STYLES: Record<JudgmentVerdict, { label: string; className: string; icon: React.ElementType }> = {
  pass: {
    label: 'Reads well',
    className: 'text-green-600 dark:text-green-400',
    icon: Check,
  },
  fail: {
    label: 'Needs work',
    className: 'text-red-600 dark:text-red-400',
    icon: X,
  },
  uncertain: {
    label: 'Not sure — worth a look',
    className: 'text-amber-600 dark:text-amber-400',
    icon: HelpCircle,
  },
  unchecked: {
    label: 'Not checked',
    className: 'text-neutral-400',
    icon: CircleDashed,
  },
}

function percent(probability: number): string {
  return `${Math.round(probability * 100)}%`
}

/**
 * Where the probability fell, with the uncertain band drawn in.
 *
 * The bands are the point of the picture: seeing the marker sitting inside the
 * wide amber middle says "this could go either way" in a way a number does not.
 */
function ProbabilityBar({ probability }: { probability: number }) {
  const clamped = Math.min(1, Math.max(0, probability))
  return (
    <div className="relative h-1.5 w-full rounded-full overflow-hidden flex" aria-hidden="true">
      <div className="bg-red-200 dark:bg-red-900/50" style={{ width: `${JUDGMENT_FAIL_AT * 100}%` }} />
      <div className="bg-amber-200 dark:bg-amber-900/50" style={{ width: `${(JUDGMENT_PASS_AT - JUDGMENT_FAIL_AT) * 100}%` }} />
      <div className="bg-green-200 dark:bg-green-900/50" style={{ width: `${(1 - JUDGMENT_PASS_AT) * 100}%` }} />
      <span
        className="absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-800 dark:bg-white"
        style={{ left: `${clamped * 100}%` }}
      />
    </div>
  )
}

function JudgmentRow({ label, probability }: { label: string; probability?: number }) {
  const verdict = readJudgment(probability)
  const style = VERDICT_STYLES[verdict]
  const Icon = style.icon

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${style.className}`} />
        <span className="text-xs text-neutral-700 dark:text-neutral-300">{label}</span>
        <span className={`ml-auto text-[10px] font-medium ${style.className}`}>{style.label}</span>
        {typeof probability === 'number' && (
          <span className="text-[10px] font-mono tabular-nums text-neutral-400 w-8 text-right">
            {percent(probability)}
          </span>
        )}
      </div>
      {typeof probability === 'number' && <ProbabilityBar probability={probability} />}
    </div>
  )
}

function imageLabel(src: string): string {
  try {
    const path = new URL(src, 'https://example.invalid').pathname
    return path.split('/').filter(Boolean).pop() || src
  } catch {
    return src
  }
}

export interface PageJudgmentContentProps {
  judgment?: PageJudgment
  /** Raw spell-checker flags, so "Jev agreed" can be read against "flagged". */
  rawSpellingIssues?: { word: string; suggestion?: string }[]
  /** Pre-formatted by the caller, which already has the screen's time helper. */
  checkedAtLabel?: string
}

/**
 * The body of the judgment panel. The caller supplies the card around it so
 * this matches the mechanical panels it sits beside.
 */
export function PageJudgmentContent({ judgment, rawSpellingIssues, checkedAtLabel }: PageJudgmentContentProps) {
  if (!judgment) {
    return (
      <div className="flex items-start gap-2.5 text-xs text-neutral-500">
        <CircleDashed className="h-3.5 w-3.5 mt-0.5 shrink-0 text-neutral-400" />
        <div>
          <p className="text-neutral-600 dark:text-neutral-400">No judgment on this scan.</p>
          <p className="text-[11px] text-neutral-400 mt-1">
            Jev runs when TypeSafe is configured, and re-runs when a page&apos;s content changes. Nothing
            here has been marked as passing or failing.
          </p>
        </div>
      </div>
    )
  }

  // Each image is read on the question that was actually asked of it. An image
  // with alt text was judged on whether the text is useful; one without was
  // judged on whether it is decorative, because an empty alt is correct on a
  // divider and wrong on a product photo.
  //
  // Only the images worth a person's time are listed: a pass is the expected
  // outcome and showing thirty of them buries the two that are wrong.
  const weakAlts = (judgment.altText ?? [])
    .map((image) => {
      const empty = !image.alt.trim()
      const probability = empty ? image.decorative : image.meaningful
      return { ...image, empty, probability, verdict: readJudgment(probability) }
    })
    .filter((image) => image.verdict === 'fail' || image.verdict === 'uncertain')
    .sort((a, b) => (a.probability ?? 1) - (b.probability ?? 1))

  const altsChecked = judgment.altText?.length ?? 0
  const realSpelling = judgment.realSpellingIssues ?? []
  const flaggedCount = rawSpellingIssues?.length ?? judgment.spellingCandidatesChecked ?? 0

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <JudgmentRow label="Title describes this page" probability={judgment.titleDescribesPage} />
        <JudgmentRow label="Meta description matches the copy" probability={judgment.metaDescriptionAccurate} />
        <JudgmentRow label="Copy is finished, not filler" probability={judgment.copyIsFinal} />
      </div>

      {/* Alt text */}
      {altsChecked > 0 && (
        <div className="space-y-2 pt-4 border-t border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-3.5 w-3.5 text-neutral-400" />
            <span className="text-xs text-neutral-500 font-medium">Alt text</span>
            <Badge variant={weakAlts.length === 0 ? 'secondary' : 'outline'} className="ml-auto text-[10px]">
              {altsChecked - weakAlts.length} of {altsChecked} read well
            </Badge>
          </div>
          {weakAlts.length === 0 ? (
            <p className="text-[11px] text-neutral-400">
              Every image is either described usefully, or deliberately empty because it
              is decorative.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {weakAlts.map((image, idx) => {
                const style = VERDICT_STYLES[image.verdict]
                return (
                  <div
                    key={`${image.src}-${idx}`}
                    className="flex items-start gap-2 text-[11px] py-1.5 px-2 rounded bg-neutral-50 dark:bg-neutral-800/50"
                  >
                    <span className={`font-mono tabular-nums shrink-0 ${style.className}`}>
                      {image.probability === undefined ? '—' : percent(image.probability)}
                    </span>
                    <div className="min-w-0">
                      <div className="font-mono text-neutral-600 dark:text-neutral-400 truncate">
                        {imageLabel(image.src)}
                      </div>
                      <div className="text-neutral-500 truncate">
                        {image.alt ? `alt="${image.alt}"` : 'no alt text'}
                      </div>
                    </div>
                    <span className={`ml-auto shrink-0 ${style.className}`}>
                      {image.verdict === 'fail' ? 'weak' : 'unsure'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Spelling — the filtered list beside the raw one it came from */}
      {flaggedCount > 0 && (
        <div className="space-y-2 pt-4 border-t border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <SpellCheck className="h-3.5 w-3.5 text-neutral-400" />
            <span className="text-xs text-neutral-500 font-medium">Spelling</span>
            <Badge variant={realSpelling.length === 0 ? 'secondary' : 'destructive'} className="ml-auto text-[10px]">
              {realSpelling.length} of {flaggedCount} flags real
            </Badge>
          </div>
          {realSpelling.length === 0 ? (
            <p className="text-[11px] text-neutral-400">
              The spell checker flagged {flaggedCount}{' '}
              {flaggedCount === 1 ? 'word' : 'words'}; Jev read {flaggedCount === 1 ? 'it' : 'them'} as
              brand names or jargon rather than mistakes.
            </p>
          ) : (
            <>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {realSpelling.map((issue, idx) => (
                  <div
                    key={`${issue.word}-${idx}`}
                    className="flex items-center gap-2 text-xs font-mono py-1 px-2 rounded bg-neutral-50 dark:bg-neutral-800/50"
                  >
                    <span className="text-red-600 line-through">{issue.word}</span>
                    <span className="text-neutral-400">→</span>
                    <span className="text-green-600">{issue.suggestion || '?'}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-neutral-400">
                The other {flaggedCount - realSpelling.length} flagged{' '}
                {flaggedCount - realSpelling.length === 1 ? 'word was' : 'words were'} read as names or
                jargon. The full list is in Content Quality.
              </p>
            </>
          )}
        </div>
      )}

      <div className="flex items-start gap-2 pt-4 border-t border-neutral-100 dark:border-neutral-800 text-[11px] text-neutral-400">
        <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
        <p>
          These are probabilities, not checks. Anything in the amber band is a call Jev could not make
          — decide it yourself.
          {checkedAtLabel ? ` Judged ${checkedAtLabel}.` : ''}
        </p>
      </div>
    </div>
  )
}

/** The panel's health dot: only a confident fail earns red. */
export function pageJudgmentHealth(judgment?: PageJudgment): 'good' | 'warning' | 'error' | 'neutral' {
  if (!judgment) return 'neutral'

  const verdicts: JudgmentVerdict[] = [
    readJudgment(judgment.titleDescribesPage),
    readJudgment(judgment.metaDescriptionAccurate),
    readJudgment(judgment.copyIsFinal),
    ...(judgment.altText ?? []).map((image) => readJudgment(image.meaningful)),
  ]

  if (verdicts.includes('fail') || (judgment.realSpellingIssues?.length ?? 0) > 0) return 'error'
  if (verdicts.includes('uncertain')) return 'warning'
  if (verdicts.includes('pass')) return 'good'
  return 'neutral'
}
