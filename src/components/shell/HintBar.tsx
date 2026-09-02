'use client';

import { KeyCombo, usePendingChord, useShortcuts } from '@/shared/keyboard';

/**
 * The strip along the bottom that teaches shortcuts in context, like
 * Superhuman's "Hit E to Mark Done · H to set a reminder". Pages contribute by
 * registering shortcuts with `hint: true`; the last three registered win.
 */
export function HintBar() {
  const shortcuts = useShortcuts();
  const pending = usePendingChord();

  const seen = new Set<string>();
  const hints = shortcuts
    .filter((s) => s.hint && s.enabled !== false && !s.hidden)
    .reverse()
    .filter((s) => {
      const k = s.keys[0];
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 3)
    .reverse();

  return (
    <footer
      className="fixed inset-x-0 bottom-0 z-30 hidden h-[var(--shell-hintbar)] items-center justify-center gap-1.5 border-t border-border/60 bg-background/85 px-4 text-xs text-muted-foreground backdrop-blur md:left-[var(--shell-rail)] md:flex"
      aria-live="polite"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <KeyCombo keys={pending.toLowerCase()} />
          <span>then…</span>
          <span className="text-muted-foreground/60">(press the second key)</span>
        </span>
      ) : (
        <>
          <span className="mr-1">Hit</span>
          {hints.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5">
              <KeyCombo keys={s.keys[0]} />
              <span>{s.label}</span>
              <span className="mx-1 text-muted-foreground/40">·</span>
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <KeyCombo keys="mod+k" />
            <span>for Command</span>
          </span>
          <span className="mx-1 text-muted-foreground/40">·</span>
          <span className="flex items-center gap-1.5">
            <KeyCombo keys="?" />
            <span>for shortcuts</span>
          </span>
        </>
      )}
    </footer>
  );
}
