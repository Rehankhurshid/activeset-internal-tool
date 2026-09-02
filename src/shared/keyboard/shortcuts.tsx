'use client';

/**
 * App-wide keyboard shortcut registry.
 *
 * Any client component can call `useShortcut({...})` and the binding is live
 * for as long as the component is mounted. Supports single keys (`j`),
 * modifier combos (`mod+k`) and two-step chords (`g p`) the way Superhuman,
 * Linear and Gmail do. The registry is also what feeds the `?` help dialog and
 * the bottom hint bar, so every shortcut is discoverable by construction.
 *
 * Rules of engagement:
 *  - Shortcuts never fire while the user is typing in an input, textarea or
 *    contenteditable, unless they carry a modifier or opt in via
 *    `allowInInput`.
 *  - When two live shortcuts share the same keys, the most recently
 *    registered one wins. Pages therefore override global bindings simply by
 *    registering after the shell has mounted.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

export type ShortcutGroup =
  | 'General'
  | 'Navigation'
  | 'Lists'
  | 'Projects'
  | 'Project'
  | 'Actions';

export interface ShortcutOptions {
  /** Stable id. Defaults to a React-generated id when omitted. */
  id?: string;
  /** `'j'`, `'mod+k'`, `'g p'`, `'shift+?'`. Pass an array for aliases (`['j', 'down']`). */
  keys: string | string[];
  label: string;
  group?: ShortcutGroup;
  /** Surface this binding in the bottom hint bar. */
  hint?: boolean;
  /** Fire even when focus is inside a text field. */
  allowInInput?: boolean;
  /** Temporarily disable without unmounting. */
  enabled?: boolean;
  /** Hide from the `?` help dialog (for aliases or purely internal bindings). */
  hidden?: boolean;
  handler: (event: KeyboardEvent) => void;
}

export interface Shortcut extends Omit<ShortcutOptions, 'handler' | 'keys' | 'id'> {
  id: string;
  keys: string[];
  order: number;
  handler: (event: KeyboardEvent) => void;
}

interface Step {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

const CHORD_TIMEOUT_MS = 1000;

export const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent);

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  return: 'enter',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  space: ' ',
  plus: '+',
};

function parseStep(raw: string): Step {
  const parts = raw.split('+').filter(Boolean);
  const key = parts.pop() ?? '';
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  const lowered = key.toLowerCase();
  return {
    key: KEY_ALIASES[lowered] ?? lowered,
    mod: mods.has('mod') || mods.has('meta') || mods.has('cmd') || mods.has('ctrl'),
    shift: mods.has('shift'),
    alt: mods.has('alt') || mods.has('option'),
  };
}

export function parseKeys(keys: string): Step[] {
  return keys.trim().split(/\s+/).map(parseStep);
}

function eventToStep(e: KeyboardEvent): Step {
  const raw = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  return {
    key: raw,
    mod: isMac ? e.metaKey : e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
  };
}

function stepMatches(want: Step, got: Step): boolean {
  if (want.key !== got.key) return false;
  if (want.mod !== got.mod) return false;
  if (want.alt !== got.alt) return false;
  // Shift is significant for letters/digits (so `n` and `shift+n` differ) but
  // not for symbols such as `?` or `/`, whose key value already encodes it.
  const isAlnum = /^[a-z0-9]$/.test(want.key);
  if (isAlnum && want.shift !== got.shift) return false;
  return true;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return !!target.closest('[contenteditable="true"], [role="textbox"]');
}

/* -------------------------------------------------------------------------- */
/* Store                                                                       */
/* -------------------------------------------------------------------------- */

class ShortcutStore {
  private map = new Map<string, Shortcut>();
  private listeners = new Set<() => void>();
  private snapshot: Shortcut[] = [];
  private order = 0;
  private pendingSteps: Step[] = [];
  private pendingLabel = '';
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;

  register(shortcut: Omit<Shortcut, 'order'>) {
    const existing = this.map.get(shortcut.id);
    this.map.set(shortcut.id, { ...shortcut, order: existing?.order ?? this.order++ });
    this.emit();
  }

  unregister(id: string) {
    if (this.map.delete(id)) this.emit();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snapshot;

  getPending = () => this.pendingLabel;

  private emit() {
    this.snapshot = Array.from(this.map.values()).sort((a, b) => a.order - b.order);
    this.listeners.forEach((fn) => fn());
  }

  private setPending(steps: Step[]) {
    this.pendingSteps = steps;
    this.pendingLabel = steps.map((s) => formatStep(s).join('')).join(' ');
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    if (steps.length) {
      this.pendingTimer = setTimeout(() => this.setPending([]), CHORD_TIMEOUT_MS);
    }
    this.listeners.forEach((fn) => fn());
  }

  handleKeydown = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    if (e.isComposing) return;
    // Pure modifier presses never form part of a chord.
    if (['Shift', 'Meta', 'Control', 'Alt'].includes(e.key)) return;

    const typing = isTypingTarget(e.target);
    const got = eventToStep(e);
    const candidate = [...this.pendingSteps, got];

    let exact: Shortcut | null = null;
    let hasLongerPrefix = false;

    for (const s of this.snapshot) {
      if (s.enabled === false) continue;
      if (typing && !s.allowInInput && !got.mod && got.key !== 'escape') continue;
      for (const keys of s.keys) {
        const steps = parseKeys(keys);
        if (steps.length < candidate.length) continue;
        let ok = true;
        for (let i = 0; i < candidate.length; i++) {
          if (!stepMatches(steps[i], candidate[i])) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        if (steps.length === candidate.length) {
          // Last registered wins — pages override the shell.
          if (!exact || s.order > exact.order) exact = s;
        } else {
          hasLongerPrefix = true;
        }
      }
    }

    if (exact) {
      e.preventDefault();
      this.setPending([]);
      exact.handler(e);
      return;
    }

    if (hasLongerPrefix && !typing) {
      e.preventDefault();
      this.setPending(candidate);
      return;
    }

    if (this.pendingSteps.length) this.setPending([]);
  };
}

const ShortcutContext = createContext<ShortcutStore | null>(null);

export function ShortcutProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<ShortcutStore | null>(null);
  if (!storeRef.current) storeRef.current = new ShortcutStore();
  const store = storeRef.current;

  useEffect(() => {
    window.addEventListener('keydown', store.handleKeydown);
    return () => window.removeEventListener('keydown', store.handleKeydown);
  }, [store]);

  return <ShortcutContext.Provider value={store}>{children}</ShortcutContext.Provider>;
}

function useStore(): ShortcutStore {
  const store = useContext(ShortcutContext);
  if (!store) throw new Error('useShortcut must be used inside <ShortcutProvider>');
  return store;
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                       */
/* -------------------------------------------------------------------------- */

export function useShortcut(options: ShortcutOptions) {
  const store = useStore();
  const autoId = useId();
  const id = options.id ?? autoId;
  const handlerRef = useRef(options.handler);
  handlerRef.current = options.handler;

  const keys = Array.isArray(options.keys) ? options.keys : [options.keys];
  const keysKey = keys.join('|');
  const { label, group = 'General', hint = false, allowInInput = false, enabled = true, hidden = false } = options;

  useEffect(() => {
    store.register({
      id,
      keys: keysKey.split('|'),
      label,
      group,
      hint,
      allowInInput,
      enabled,
      hidden,
      handler: (e) => handlerRef.current(e),
    });
    return () => store.unregister(id);
  }, [store, id, keysKey, label, group, hint, allowInInput, enabled, hidden]);
}

/** Every live shortcut, in registration order. */
export function useShortcuts(): Shortcut[] {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** The partially typed chord (e.g. "G") or an empty string. */
export function usePendingChord(): string {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getPending, () => '');
}

/** Imperative helper for components that want to trigger a registered shortcut's UI. */
export function useOpenShortcutHelp() {
  return useCallback(() => window.dispatchEvent(new Event('shortcuts:help')), []);
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

const KEY_GLYPHS: Record<string, string> = {
  escape: 'Esc',
  enter: '↵',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  backspace: '⌫',
  ' ': 'Space',
  tab: 'Tab',
};

function formatStep(step: Step): string[] {
  const out: string[] = [];
  if (step.mod) out.push(isMac ? '⌘' : 'Ctrl');
  if (step.alt) out.push(isMac ? '⌥' : 'Alt');
  if (step.shift) out.push('⇧');
  out.push(KEY_GLYPHS[step.key] ?? step.key.toUpperCase());
  return out;
}

/** `'g p'` → `[['G'], ['P']]`, `'mod+k'` → `[['⌘', 'K']]`. */
export function formatKeys(keys: string): string[][] {
  return parseKeys(keys).map(formatStep);
}
