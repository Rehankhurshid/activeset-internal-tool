import type { StackDefinition, StackId } from '../delivery.types';
import { WEBFLOW_STACK } from './webflow.stack';

/**
 * The stack registry.
 *
 * Supporting Astro + Sanity or Next + Storyblok means adding a definition file
 * here and nothing else: the page grid, the launch checklist, the kickoff list
 * and the client-facing progress all read from whatever definition a project
 * points at. Nothing outside this folder should mention a specific technology.
 */
export const STACKS: Record<StackId, StackDefinition | null> = {
  webflow: WEBFLOW_STACK,
  // Defined when the agency takes on its first project on these.
  'astro-sanity': null,
  'next-storyblok': null,
};

export const DEFAULT_STACK_ID: StackId = 'webflow';

export const AVAILABLE_STACKS: StackDefinition[] = Object.values(STACKS).filter(
  (s): s is StackDefinition => s !== null,
);

/** Falls back to the default so a project with no stack set still works. */
export function getStack(stackId: StackId | undefined): StackDefinition {
  const stack = stackId ? STACKS[stackId] : null;
  return stack ?? (STACKS[DEFAULT_STACK_ID] as StackDefinition);
}

export function isStackSupported(stackId: StackId | undefined): boolean {
  return Boolean(stackId && STACKS[stackId]);
}

export { WEBFLOW_STACK };
