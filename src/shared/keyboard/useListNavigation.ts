'use client';

import { useCallback, useEffect, useState } from 'react';
import { useShortcut, type ShortcutGroup } from './shortcuts';

interface ListNavigationOptions {
  count: number;
  onSelect: (index: number) => void;
  enabled?: boolean;
  group?: ShortcutGroup;
  /** What Enter does, for the help dialog. */
  selectLabel?: string;
  /** Extra action on `x` / Space, e.g. toggle selection. */
  onToggle?: (index: number) => void;
  /** Surface next/open in the bottom hint bar. */
  hint?: boolean;
}

/**
 * j / k / ↑ / ↓ to move a cursor through a list, Enter to open the item.
 * Attach `itemProps(i)` to each row: it sets `data-nav-index` (used to scroll
 * the cursor into view) and `data-selected` (styled by `.sh-row`).
 */
export function useListNavigation({
  count,
  onSelect,
  enabled = true,
  group = 'Lists',
  selectLabel = 'Open selected',
  onToggle,
  hint = false,
}: ListNavigationOptions) {
  const [index, setIndex] = useState(-1);

  useEffect(() => {
    if (index >= count) setIndex(count - 1);
  }, [count, index]);

  useEffect(() => {
    if (index < 0) return;
    const el = document.querySelector<HTMLElement>(`[data-nav-index="${index}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const move = useCallback(
    (delta: number) => {
      if (count === 0) return;
      setIndex((i) => {
        const next = i < 0 ? (delta > 0 ? 0 : count - 1) : i + delta;
        return Math.max(0, Math.min(count - 1, next));
      });
    },
    [count],
  );

  useShortcut({
    id: 'list-next',
    keys: ['j', 'down'],
    label: 'Next item',
    group,
    hint,
    enabled: enabled && count > 0,
    handler: () => move(1),
  });
  useShortcut({
    id: 'list-prev',
    keys: ['k', 'up'],
    label: 'Previous item',
    group,
    enabled: enabled && count > 0,
    handler: () => move(-1),
  });
  useShortcut({
    id: 'list-first',
    keys: 'g g',
    label: 'First item',
    group,
    enabled: enabled && count > 0,
    hidden: true,
    handler: () => setIndex(0),
  });
  useShortcut({
    id: 'list-open',
    keys: 'enter',
    label: selectLabel,
    group,
    hint,
    enabled: enabled && index >= 0 && index < count,
    handler: () => onSelect(index),
  });
  useShortcut({
    id: 'list-toggle',
    keys: 'x',
    label: 'Toggle selected item',
    group,
    enabled: enabled && !!onToggle && index >= 0,
    hidden: !onToggle,
    handler: () => onToggle?.(index),
  });

  const itemProps = useCallback(
    (i: number) => ({
      'data-nav-index': i,
      'data-selected': i === index ? 'true' : undefined,
      onMouseEnter: () => setIndex(i),
    }),
    [index],
  );

  return { index, setIndex, itemProps };
}
