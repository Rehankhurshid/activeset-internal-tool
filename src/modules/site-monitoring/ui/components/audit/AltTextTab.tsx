'use client';

import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  fileNameOf,
  isLikelyDecorative,
  LIKELY_DECORATIVE_AT,
  type AltFinding,
} from '../../../domain/audit-findings';
import { FindingPages } from './FindingPages';
import { relativeTime } from './relative-time';
import type { AltSuggestionDoc } from '../../../infrastructure/alt-suggestions.repository';

/**
 * Alt text, by image. The unit Webflow edits in is the asset, so that is the
 * unit shown: one row per image however many pages carry it, with the fix in
 * the row. The loop is find → write alt → publish → verify, and every state of
 * that loop is visible so nobody wonders whether something took.
 */

export interface AltTextTabProps {
  findings: AltFinding[];
  isReadOnly: boolean;
  /** The project has a Webflow token and the image is a Webflow asset. */
  canWriteWebflow: boolean;
  onSaveAlt: (finding: AltFinding, altText: string) => Promise<void>;
  onMarkFixed: (finding: AltFinding) => Promise<void>;
  onMarkDecorative: (finding: AltFinding) => Promise<void>;
  onUndo: (finding: AltFinding) => Promise<void>;
  /** Re-scan one page's images; the finding clears if the alt landed. */
  onVerify: (finding: AltFinding) => Promise<void>;
  verifyingFingerprints: Set<string>;
  onPublishSite?: () => Promise<void>;
  /** Drafts from the local classifier, by image fingerprint. Never applied on their own. */
  suggestions?: Map<string, AltSuggestionDoc>;
  /** Needed only to print the command that generates the drafts. */
  projectId?: string;
  scanAll: {
    running: boolean;
    current: number;
    total: number;
    currentUrl?: string;
    start: () => void;
    cancel: () => void;
    disabled: boolean;
  };
}

function jevLine(finding: AltFinding): { text: string; tone: 'red' | 'amber' | 'green' } | null {
  const p = finding.decorative;
  if (p === undefined) return null;
  if (p >= LIKELY_DECORATIVE_AT) return { text: `Jev: probably decorative (${Math.round(p * 100)}%)`, tone: 'green' };
  if (p <= 1 - LIKELY_DECORATIVE_AT) return { text: `Jev: needs alt text (${Math.round((1 - p) * 100)}%)`, tone: 'red' };
  return { text: `Jev unsure (${Math.round(p * 100)}% decorative) — your call`, tone: 'amber' };
}

const TONE = {
  red: 'text-red-600 dark:text-red-400',
  amber: 'text-amber-600 dark:text-amber-400',
  green: 'text-green-600 dark:text-green-400',
};

const KIND_LABEL: Record<string, string> = {
  decorative: 'Decorative',
  informative: 'Informative',
  functional: 'Link',
  logo: 'Logo',
  text_image: 'Text',
  portrait: 'Person',
  product: 'Product',
  chart: 'Chart',
  screenshot: 'Screenshot',
  icon: 'Icon',
};

/**
 * What the local classifier made of this image.
 *
 * It fills the box and says what it thought; it never saves anything. The
 * model runs on a laptop and can be wrong in ways only a person looking at
 * the page will catch, so the shape of this is "here is a draft", not "here
 * is the answer".
 */
function SuggestionStrip({
  suggestion,
  onUse,
  applied,
}: {
  suggestion: AltSuggestionDoc;
  onUse: () => void;
  applied: boolean;
}) {
  const decorative = suggestion.kind === 'decorative';
  return (
    <div className="rounded-md border border-dashed bg-muted/30 px-2.5 py-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
          {KIND_LABEL[suggestion.kind] ?? suggestion.kind}
        </Badge>
        {suggestion.needsReview && (
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-500/40 text-amber-700 dark:text-amber-400">
            check this one
          </Badge>
        )}
        {suggestion.verified === true && (
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">self-checked</Badge>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {suggestion.model} · {relativeTime(suggestion.generatedAt)}
        </span>
      </div>

      <p className="text-xs">
        {decorative ? (
          <span className="text-muted-foreground">
            Reads as decorative — an empty alt is probably right here.
          </span>
        ) : (
          <span>{suggestion.alt || <span className="text-muted-foreground">no text drafted</span>}</span>
        )}
      </p>

      {suggestion.observation && (
        <p className="text-[11px] text-muted-foreground">Saw: {suggestion.observation}</p>
      )}
      {suggestion.notes.map((note, index) => (
        <p key={index} className="text-[11px] text-muted-foreground">↳ {note}</p>
      ))}

      {!decorative && suggestion.alt && (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onUse} disabled={applied}>
          {applied ? <Check className="h-3 w-3 mr-1" /> : null}
          {applied ? 'In the box' : 'Use this'}
        </Button>
      )}
    </div>
  );
}

/**
 * How you get drafts in the first place.
 *
 * The classifier runs on a laptop against Ollama, not in the browser, so
 * without this the tab gives no hint the option exists — the rows simply look
 * the way they always did. It shows the exact command with the real project
 * id already in it, and gets out of the way once drafts start arriving.
 */
function DraftPrompt({ projectId, drafted, total }: { projectId?: string; drafted: number; total: number }) {
  // Nothing to offer once every open finding already has a draft.
  if (drafted >= total) return null;

  const command = `npm run alt project ${projectId ?? '<projectId>'}`;
  const partial = drafted > 0;

  return (
    <div className="mx-3 sm:mx-4 my-3 rounded-md border border-dashed px-3 py-2.5 space-y-2">
      <div className="flex items-start gap-2">
        <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium">
            {partial ? `Draft the remaining ${total - drafted}` : 'Draft these with the local classifier'}
          </p>
          <p className="text-xs text-muted-foreground">
            {partial
              ? `${drafted} of ${total} already have a draft. Run it again to pick up the rest.`
              : 'A vision model on your own Mac reads each image and writes a first draft into these boxes. Nothing is saved without you.'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate rounded bg-muted px-2 py-1 font-mono text-[11px]">{command}</code>
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0"
          onClick={async () => {
            await navigator.clipboard.writeText(command);
            toast.success('Command copied — run it in the project folder');
          }}
        >
          <Copy className="h-3.5 w-3.5 mr-1.5" />
          Copy
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Needs Ollama running locally. <code className="font-mono">npm run alt doctor</code> checks the setup.
      </p>
    </div>
  );
}

function Thumb({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="h-14 w-14 shrink-0 rounded-md border bg-muted/30 overflow-hidden flex items-center justify-center"
      title={src}
    >
      {failed ? (
        <ImageIcon className="h-5 w-5 text-muted-foreground" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      )}
    </a>
  );
}

function AltRow({
  finding,
  suggestion,
  isReadOnly,
  canWriteWebflow,
  onSaveAlt,
  onMarkFixed,
  onMarkDecorative,
  onUndo,
  onVerify,
  verifying,
}: {
  finding: AltFinding;
  suggestion?: AltSuggestionDoc;
  isReadOnly: boolean;
  canWriteWebflow: boolean;
  onSaveAlt: AltTextTabProps['onSaveAlt'];
  onMarkFixed: AltTextTabProps['onMarkFixed'];
  onMarkDecorative: AltTextTabProps['onMarkDecorative'];
  onUndo: AltTextTabProps['onUndo'];
  onVerify: AltTextTabProps['onVerify'];
  verifying: boolean;
}) {
  // A decision someone already made wins over a fresh draft.
  const [draft, setDraft] = useState(finding.decision?.altText ?? suggestion?.alt ?? '');
  const [busy, setBusy] = useState<'save' | 'decorative' | 'fixed' | 'undo' | null>(null);
  const name = fileNameOf(finding.src);
  const jev = jevLine(finding);
  const writable = canWriteWebflow && !!finding.webflowAssetId;
  const open = finding.state === 'open' || finding.state === 'regressed';

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const latestCheck = finding.pages
    .map((p) => p.checkedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <li className="px-3 py-3 sm:px-4">
      <div className="flex gap-3">
        <Thumb src={finding.src} alt={name} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <span className="font-mono text-xs truncate max-w-[60vw] sm:max-w-sm" title={finding.src}>
              {name}
            </span>
            {finding.webflowAssetId ? (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">Webflow asset</Badge>
            ) : null}
            {finding.state === 'regressed' && (
              <Badge variant="destructive" className="text-[10px] h-4 px-1.5">Still missing after fix</Badge>
            )}
            {finding.state === 'fixed_unverified' && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Saved · not verified</Badge>
            )}
            {finding.state === 'resolved' && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {finding.decision?.decision === 'decorative' ? 'Decorative' : 'Verified'}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{finding.inMainContent ? 'in page body' : 'outside main content'}</span>
            <FindingPages pages={finding.pages} />
            {latestCheck && <span>checked {relativeTime(latestCheck)}</span>}
          </div>

          {jev && <p className={cn('text-xs', TONE[jev.tone])}>{jev.text}</p>}

          {finding.state === 'regressed' && (
            <p className="text-xs text-red-600 dark:text-red-400">
              A scan after the fix still found no alt on this image.
              {finding.decision?.altText ? ` "${finding.decision.altText}" was saved — was the site published?` : ''}
            </p>
          )}

          {!isReadOnly && open && suggestion && (
            <SuggestionStrip
              suggestion={suggestion}
              applied={draft.trim() === suggestion.alt.trim() && !!suggestion.alt}
              onUse={() => setDraft(suggestion.alt)}
            />
          )}

          {!isReadOnly && open && (
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={writable ? 'Describe what the image shows…' : 'Alt text to use (copy into Designer)'}
                className="h-8 text-sm sm:max-w-md"
                maxLength={250}
              />
              <div className="flex flex-wrap gap-1.5">
                {writable ? (
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={!draft.trim() || busy !== null}
                    onClick={() => run('save', () => onSaveAlt(finding, draft.trim()))}
                  >
                    {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                    Save to Webflow
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={async () => {
                        await navigator.clipboard.writeText(draft.trim() ? `${name}\n${draft.trim()}` : name);
                        toast.success('Copied');
                      }}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={busy !== null}
                      onClick={() => run('fixed', () => onMarkFixed(finding))}
                      title="I added the alt text in Designer"
                    >
                      {busy === 'fixed' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                      Fixed it
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  disabled={busy !== null}
                  onClick={() => run('decorative', () => onMarkDecorative(finding))}
                  title="Purely visual; an empty alt is correct"
                >
                  {busy === 'decorative' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <X className="h-3.5 w-3.5 mr-1.5" />}
                  Decorative
                </Button>
                {finding.state === 'regressed' && (
                  <Button size="sm" variant="ghost" className="h-8" disabled={verifying} onClick={() => onVerify(finding)}>
                    {verifying ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                    Verify again
                  </Button>
                )}
              </div>
            </div>
          )}

          {!isReadOnly && finding.state === 'fixed_unverified' && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {finding.decision?.altText && (
                <span className="text-xs text-muted-foreground mr-1">alt=&quot;{finding.decision.altText}&quot;</span>
              )}
              <Button size="sm" className="h-8" disabled={verifying} onClick={() => onVerify(finding)}>
                {verifying ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Verify
              </Button>
              <Button size="sm" variant="ghost" className="h-8" disabled={busy !== null} onClick={() => run('undo', () => onUndo(finding))}>
                <Undo2 className="h-3.5 w-3.5 mr-1.5" />
                Undo
              </Button>
            </div>
          )}

          {!isReadOnly && finding.state === 'resolved' && (
            <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
              <span>
                {finding.decision?.decision === 'decorative' ? 'Marked decorative' : 'Verified'} by {finding.decision?.by}{' '}
                {relativeTime(finding.decision?.at)}
              </span>
              <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy !== null} onClick={() => run('undo', () => onUndo(finding))}>
                <Undo2 className="h-3 w-3 mr-1" />
                Undo
              </Button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Section({
  title,
  count,
  hint,
  defaultOpen,
  children,
  action,
}: {
  title: string;
  count: number;
  hint?: string;
  defaultOpen: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <section className="border-t first:border-t-0">
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-muted/30">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-left min-w-0 flex-1">
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="text-sm font-medium">{title}</span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[11px] tabular-nums">{count}</Badge>
          {hint && <span className="text-xs text-muted-foreground hidden sm:inline truncate">{hint}</span>}
        </button>
        {action}
      </div>
      {open && <ul className="divide-y">{children}</ul>}
    </section>
  );
}

export function AltTextTab(props: AltTextTabProps) {
  const { findings, isReadOnly, scanAll, onPublishSite, suggestions, projectId } = props;
  const [query, setQuery] = useState('');
  const [publishing, setPublishing] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return findings;
    return findings.filter(
      (f) => f.src.toLowerCase().includes(q) || f.pages.some((p) => p.url.toLowerCase().includes(q) || p.title.toLowerCase().includes(q)),
    );
  }, [findings, query]);

  const groups = useMemo(() => {
    const open = filtered.filter((f) => (f.state === 'open' || f.state === 'regressed') && !isLikelyDecorative(f));
    return {
      open,
      regressed: open.filter((f) => f.state === 'regressed').length,
      decorativeLikely: filtered.filter((f) => f.state === 'open' && isLikelyDecorative(f)),
      awaiting: filtered.filter((f) => f.state === 'fixed_unverified'),
      resolved: filtered.filter((f) => f.state === 'resolved'),
    };
  }, [filtered]);

  const pagesTouched = useMemo(() => new Set(groups.open.flatMap((f) => f.pages.map((p) => p.pageId))).size, [groups.open]);

  const rowProps = {
    isReadOnly,
    canWriteWebflow: props.canWriteWebflow,
    onSaveAlt: props.onSaveAlt,
    onMarkFixed: props.onMarkFixed,
    onMarkDecorative: props.onMarkDecorative,
    onUndo: props.onUndo,
    onVerify: props.onVerify,
  };
  const row = (f: AltFinding) => (
    <AltRow
      key={f.fingerprint}
      finding={f}
      suggestion={props.suggestions?.get(f.fingerprint)}
      verifying={props.verifyingFingerprints.has(f.fingerprint)}
      {...rowProps}
    />
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3 px-3 sm:px-4 border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Alt text</CardTitle>
            <CardDescription>
              {groups.open.length === 0
                ? 'Every image is described or deliberately empty.'
                : `${groups.open.length} image${groups.open.length === 1 ? '' : 's'} to describe · clears ${pagesTouched} page${pagesTouched === 1 ? '' : 's'}`}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by file or page" className="h-8 pl-7 text-sm w-full sm:w-56" />
            </div>
            {!isReadOnly &&
              (scanAll.running ? (
                <Button size="sm" variant="outline" className="h-8" onClick={scanAll.cancel}>
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Stop
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="h-8" onClick={scanAll.start} disabled={scanAll.disabled}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Rescan all images
                </Button>
              ))}
          </div>
        </div>
        {scanAll.running && (
          <div className="mt-3 space-y-1">
            <Progress value={scanAll.total > 0 ? Math.round((scanAll.current / scanAll.total) * 100) : 0} className="h-1.5" />
            <p className="text-xs text-muted-foreground tabular-nums truncate">
              {scanAll.current}/{scanAll.total} pages · runs on the server, safe to close this tab
              {scanAll.currentUrl ? ` · ${scanAll.currentUrl}` : ''}
            </p>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {findings.length === 0 ? 'No images without alt text on any scanned page.' : 'Nothing matches that filter.'}
          </div>
        ) : (
          <>
            {!isReadOnly && groups.open.length > 0 && (
              <DraftPrompt
                projectId={projectId}
                drafted={groups.open.filter((f) => suggestions?.has(f.fingerprint)).length}
                total={groups.open.length}
              />
            )}
            <Section
              title="Needs alt text"
              count={groups.open.length}
              hint={groups.regressed > 0 ? `${groups.regressed} came back after a fix` : 'Most pages cleared per fix first'}
              defaultOpen
            >
              {groups.open.map(row)}
            </Section>
            <Section
              title="Waiting on publish and verify"
              count={groups.awaiting.length}
              hint="Alt saved; publish the site, then verify"
              defaultOpen
              action={
                !isReadOnly && onPublishSite ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    disabled={publishing}
                    onClick={async () => {
                      setPublishing(true);
                      try {
                        await onPublishSite();
                      } finally {
                        setPublishing(false);
                      }
                    }}
                  >
                    {publishing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                    Publish site
                  </Button>
                ) : null
              }
            >
              {groups.awaiting.map(row)}
            </Section>
            <Section
              title="Probably decorative — confirm"
              count={groups.decorativeLikely.length}
              hint="Jev is confident an empty alt is right; a person still decides"
              defaultOpen={false}
            >
              {groups.decorativeLikely.map(row)}
            </Section>
            <Section title="Resolved" count={groups.resolved.length} defaultOpen={false}>
              {groups.resolved.map(row)}
            </Section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
