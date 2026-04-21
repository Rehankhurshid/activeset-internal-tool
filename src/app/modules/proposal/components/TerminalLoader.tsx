'use client';

import { useEffect, useRef, useState } from 'react';

export interface TerminalStep {
  /** Rendered prefix. `$` for commands, `>` for in-progress, `✓` for done. */
  kind: 'cmd' | 'task' | 'ok' | 'info';
  /** Line text. */
  text: string;
  /** How long this step shows before the next one arrives (ms). */
  delay: number;
}

interface TerminalLoaderProps {
  title?: string;
  steps: TerminalStep[];
  /** Text used for the looping last-step spinner once all steps are consumed. */
  loopLabel?: string;
  /** Whether the animation is active. When false, everything stops and the cursor hides. */
  active: boolean;
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * A small terminal-window component with a progressive log animation.
 * Used during the AI draft step to make the wait feel alive instead of
 * a blank spinner. Timings are purely cosmetic — the component has no
 * knowledge of the real AI progress; it just loops the final step until
 * the parent flips `active=false`.
 */
export default function TerminalLoader({
  title = 'activeset.ai',
  steps,
  loopLabel = 'Finalizing draft',
  active,
}: TerminalLoaderProps) {
  const [visible, setVisible] = useState<TerminalStep[]>([]);
  const [spinner, setSpinner] = useState(0);
  const [caret, setCaret] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Schedule step-by-step reveal.
  useEffect(() => {
    if (!active) return;
    setVisible([]);
    let cancelled = false;
    let elapsed = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    steps.forEach((step, i) => {
      elapsed += step.delay;
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setVisible((prev) => [...prev, step]);
          // Mark the previous task as done by mutating the latest list.
          setVisible((prev) => {
            if (prev.length < 2) return prev;
            const copy = [...prev];
            const lastIdx = copy.length - 2;
            if (copy[lastIdx].kind === 'task') {
              copy[lastIdx] = { ...copy[lastIdx], kind: 'ok' };
            }
            return copy;
          });
          void i;
        }, elapsed)
      );
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [steps, active]);

  // Spinner + caret tickers.
  useEffect(() => {
    if (!active) return;
    const spin = setInterval(() => setSpinner((s) => (s + 1) % SPINNER_FRAMES.length), 80);
    const caretTimer = setInterval(() => setCaret((c) => !c), 500);
    return () => {
      clearInterval(spin);
      clearInterval(caretTimer);
    };
  }, [active]);

  // Auto-scroll to bottom as new lines appear.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visible.length]);

  // Once all scheduled steps are shown, append a looping spinner line.
  const displayed = [...visible];
  const allScheduled = visible.length >= steps.length;
  if (allScheduled && active) {
    displayed.push({
      kind: 'task',
      text: loopLabel,
      delay: 0,
    });
  }

  return (
    <div
      className="rounded-lg border border-[#2a2a2a] bg-[#0c0c0d] shadow-xl overflow-hidden"
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace',
      }}
    >
      {/* Chrome */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1f1f1f] bg-[#141416]">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <span className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 text-center text-[11px] text-[#7a7a7a] tracking-wide select-none">
          {title}
        </div>
        <div className="w-12" />
      </div>

      {/* Body */}
      <div
        ref={scrollRef}
        className="px-4 py-3 text-[13px] leading-relaxed h-[280px] overflow-y-auto"
        style={{
          background:
            'radial-gradient(ellipse at top left, rgba(16,185,129,0.04) 0%, transparent 60%), #0c0c0d',
        }}
      >
        {displayed.map((line, i) => {
          const isLastActive = i === displayed.length - 1 && active && line.kind === 'task';
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="select-none" style={{ color: prefixColor(line.kind, isLastActive) }}>
                {prefixFor(line.kind, isLastActive, spinner)}
              </span>
              <span style={{ color: textColor(line.kind, isLastActive) }}>
                {line.text}
                {isLastActive && (
                  <span
                    className="ml-1 inline-block w-[7px] h-[14px] align-[-2px]"
                    style={{
                      background: '#10b981',
                      opacity: caret ? 1 : 0,
                      transition: 'opacity 80ms',
                    }}
                  />
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function prefixFor(kind: TerminalStep['kind'], active: boolean, spinnerIdx: number): string {
  if (kind === 'cmd') return '$';
  if (kind === 'info') return '»';
  if (kind === 'ok') return '✓';
  // task
  return active ? SPINNER_FRAMES[spinnerIdx] : '✓';
}

function prefixColor(kind: TerminalStep['kind'], active: boolean): string {
  if (kind === 'cmd') return '#10b981';
  if (kind === 'info') return '#7a7a7a';
  if (kind === 'ok') return '#10b981';
  return active ? '#10b981' : '#10b981';
}

function textColor(kind: TerminalStep['kind'], active: boolean): string {
  if (kind === 'cmd') return '#e4e4e7';
  if (kind === 'info') return '#a1a1aa';
  if (kind === 'ok') return '#a1a1aa';
  return active ? '#e4e4e7' : '#a1a1aa';
}
