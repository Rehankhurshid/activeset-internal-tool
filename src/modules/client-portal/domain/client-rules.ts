import type { ClientRule, ClientRuleCategory } from '@/types';

/** The kinds a rule can be filed under, in the order the page shows them. */
export const CLIENT_RULE_CATEGORIES: readonly ClientRuleCategory[] = ['compliance', 'brand', 'copy'];

export const CLIENT_RULE_CATEGORY_LABELS: Record<ClientRuleCategory, string> = {
  compliance: 'Compliance',
  brand: 'Brand',
  copy: 'Copy',
};

export const CLIENT_RULE_MAX_LENGTH = 280;
export const CLIENT_RULES_MAX = 40;

/** A rule as the client sees it: what it says and what it is about. Nothing else. */
export interface PortalRuleView {
  id: string;
  text: string;
  category?: ClientRuleCategory;
}

function isCategory(value: unknown): value is ClientRuleCategory {
  return typeof value === 'string' && (CLIENT_RULE_CATEGORIES as readonly string[]).includes(value);
}

export function newRuleId(): string {
  return `rule_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/**
 * Rules as they may be stored: text trimmed to one line of at most 280
 * characters, empty ones dropped, an unknown category dropped, ids unique,
 * at most 40. Run on every write and again before the client's page.
 */
export function normalizeClientRules(raw: unknown): ClientRule[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const rules: ClientRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Partial<ClientRule>;
    const text = typeof candidate.text === 'string' ? candidate.text.replace(/\s+/g, ' ').trim().slice(0, CLIENT_RULE_MAX_LENGTH) : '';
    if (!text) continue;
    let id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim().slice(0, 64) : newRuleId();
    while (seen.has(id)) id = newRuleId();
    seen.add(id);
    const rule: ClientRule = { id, text };
    if (isCategory(candidate.category)) rule.category = candidate.category;
    rules.push(rule);
    if (rules.length >= CLIENT_RULES_MAX) break;
  }
  return rules;
}

/** For the client's page: the rules in the team's order, text and category only. */
export function portalRules(raw: unknown): PortalRuleView[] {
  return normalizeClientRules(raw).map((rule) =>
    rule.category ? { id: rule.id, text: rule.text, category: rule.category } : { id: rule.id, text: rule.text },
  );
}

/**
 * Rules grouped for display: by category in the standard order, uncategorised
 * last. A list with no categories at all is one untitled group.
 */
export function groupRules<T extends { category?: ClientRuleCategory }>(
  rules: readonly T[],
): { category?: ClientRuleCategory; rules: T[] }[] {
  const groups: { category?: ClientRuleCategory; rules: T[] }[] = [];
  for (const category of CLIENT_RULE_CATEGORIES) {
    const inCategory = rules.filter((r) => r.category === category);
    if (inCategory.length) groups.push({ category, rules: inCategory });
  }
  const rest = rules.filter((r) => !r.category);
  if (rest.length) groups.push({ rules: rest });
  return groups;
}
