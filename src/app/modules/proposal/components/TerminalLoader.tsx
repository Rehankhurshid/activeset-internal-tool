'use client';

import { useEffect, useRef, useState } from 'react';

export type LineKind = 'cmd' | 'info' | 'task' | 'warn';
export type LineState = 'done' | 'active' | 'failed';

export interface TerminalLine {
  kind: LineKind;
  text: string;
  state: LineState;
}

interface TerminalLoaderProps {
  title?: string;
  lines: TerminalLine[];
  active: boolean;
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * A small terminal-window component driven entirely by the parent's
 * state — no fake timers, no scheduling. Pass in a list of lines, each
 * marked done/active/failed, and the caller updates the list as real
 * work progresses.
 */
export default function TerminalLoader({ title = 'activeset.ai', lines, active }: TerminalLoaderProps) {
  const [spinner, setSpinner] = useState(0);
  const [caret, setCaret] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const spin = setInterval(() => setSpinner((s) => (s + 1) % SPINNER_FRAMES.length), 80);
    const caretTimer = setInterval(() => setCaret((c) => !c), 500);
    return () => {
      clearInterval(spin);
      clearInterval(caretTimer);
    };
  }, [active]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines.length]);

  return (
    <div
      className="rounded-lg border border-[#2a2a2a] bg-[#0c0c0d] shadow-xl overflow-hidden"
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace',
      }}
    >
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

      <div
        ref={scrollRef}
        className="px-4 py-3 text-[13px] leading-relaxed h-[300px] overflow-y-auto"
        style={{
          background:
            'radial-gradient(ellipse at top left, rgba(16,185,129,0.04) 0%, transparent 60%), #0c0c0d',
        }}
      >
        {lines.map((line, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="select-none" style={{ color: prefixColor(line), minWidth: '14px' }}>
              {prefixFor(line, spinner)}
            </span>
            <span style={{ color: textColor(line) }}>
              {line.text}
              {line.state === 'active' && active && (
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
        ))}
      </div>
    </div>
  );
}

function prefixFor(line: TerminalLine, spinnerIdx: number): string {
  if (line.kind === 'cmd') return '$';
  if (line.kind === 'info') return '»';
  if (line.kind === 'warn') return '!';
  // task
  if (line.state === 'active') return SPINNER_FRAMES[spinnerIdx];
  if (line.state === 'failed') return '✗';
  return '✓';
}

function prefixColor(line: TerminalLine): string {
  if (line.kind === 'cmd') return '#10b981';
  if (line.kind === 'warn') return '#f59e0b';
  if (line.state === 'failed') return '#ef4444';
  if (line.state === 'active') return '#10b981';
  return '#10b981';
}

function textColor(line: TerminalLine): string {
  if (line.kind === 'cmd') return '#e4e4e7';
  if (line.state === 'failed') return '#fca5a5';
  if (line.state === 'active') return '#e4e4e7';
  return '#a1a1aa';
}
