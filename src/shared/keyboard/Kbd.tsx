'use client';

import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import { formatKeys } from './shortcuts';

interface KbdProps extends React.ComponentProps<'kbd'> {
  /** Render on a violet/primary surface. */
  onPrimary?: boolean;
}

/** A single Superhuman-style keycap. */
export function Kbd({ className, onPrimary, ...props }: KbdProps) {
  return <kbd className={cn('kbd', onPrimary && 'kbd-on-primary', className)} {...props} />;
}

interface KeyComboProps {
  /** Same syntax as `useShortcut`: `'g p'`, `'mod+k'`, `'?'`. */
  keys: string;
  className?: string;
  onPrimary?: boolean;
  /** Word between chord steps. Defaults to "then". */
  joiner?: string;
}

/** Renders a shortcut string as keycaps: `g p` → [G] then [P]. */
export function KeyCombo({ keys, className, onPrimary, joiner = 'then' }: KeyComboProps) {
  const steps = formatKeys(keys);
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap', className)}>
      {steps.map((tokens, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="px-0.5 text-[10px] text-muted-foreground/70">{joiner}</span>
          )}
          {tokens.map((t, j) => (
            <Kbd key={j} onPrimary={onPrimary}>
              {t}
            </Kbd>
          ))}
        </Fragment>
      ))}
    </span>
  );
}
