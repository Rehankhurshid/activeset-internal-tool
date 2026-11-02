import { ShieldCheck } from 'lucide-react';
import { CLIENT_RULE_CATEGORY_LABELS, groupRules } from '../../domain/client-rules';
import type { PortalRuleView } from '../../domain/client-portal.types';
import { PortalSectionHeading } from './PortalSectionHeading';

/**
 * "Rules we've agreed": the do's and don'ts the client set (compliance, brand,
 * copy), pinned near the top so everyone working on the project reads them.
 * Renders nothing when there are none.
 */
export function PortalRules({ rules }: { rules?: PortalRuleView[] }) {
  if (!rules || rules.length === 0) return null;
  const groups = groupRules(rules);
  const titled = groups.some((g) => g.category);

  return (
    <section
      aria-labelledby="portal-rules-heading"
      className="space-y-4 rounded-2xl border border-border bg-card px-4 py-4 sm:px-5"
    >
      <div className="flex items-center gap-2">
        <ShieldCheck aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
        <PortalSectionHeading id="portal-rules-heading" variant="eyebrow">
          Rules we&apos;ve agreed
        </PortalSectionHeading>
      </div>
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.category ?? 'other'} className="space-y-1.5">
            {titled && (
              <h3 className="text-xs font-semibold text-foreground">
                {group.category ? CLIENT_RULE_CATEGORY_LABELS[group.category] : 'Also'}
              </h3>
            )}
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground marker:text-muted-foreground">
              {group.rules.map((rule) => (
                <li key={rule.id}>{rule.text}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
