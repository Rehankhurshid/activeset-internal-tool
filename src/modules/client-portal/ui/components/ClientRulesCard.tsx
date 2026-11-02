'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ClientRule, ClientRuleCategory, Project } from '@/types';
import {
  CLIENT_RULE_CATEGORIES,
  CLIENT_RULE_CATEGORY_LABELS,
  CLIENT_RULE_MAX_LENGTH,
  CLIENT_RULES_MAX,
  newRuleId,
  normalizeClientRules,
} from '../../domain/client-rules';
import { clientPortalRepository } from '../../infrastructure/client-portal.repository';

const NO_CATEGORY = '__none__';

function sameRules(a: ClientRule[], b: ClientRule[]): boolean {
  return (
    a.length === b.length &&
    a.every((rule, i) => rule.id === b[i].id && rule.text === b[i].text && (rule.category ?? '') === (b[i].category ?? ''))
  );
}

interface ClientRulesCardProps {
  project: Pick<Project, 'id' | 'clientRules'>;
  userEmail: string;
}

/**
 * The rules agreed with the client (ACT-93: compliance, brand and copy do's
 * and don'ts), edited here by anyone on the team and pinned on the client's
 * page. A short list, each rule optionally filed under one of three kinds.
 */
export function ClientRulesCard({ project, userEmail }: ClientRulesCardProps) {
  const server = useMemo(() => normalizeClientRules(project.clientRules?.rules), [project.clientRules?.rules]);
  const [draft, setDraft] = useState<ClientRule[]>(server);
  const lastServer = useRef(server);
  // Someone else's save replaces the list, unless this person has unsaved edits.
  useEffect(() => {
    const prev = lastServer.current;
    lastServer.current = server;
    setDraft((d) => (sameRules(d, prev) ? server : d));
  }, [server]);

  const cleaned = useMemo(() => normalizeClientRules(draft), [draft]);
  const dirty = !sameRules(cleaned, server) || draft.length !== cleaned.length;
  const [saving, setSaving] = useState(false);

  const update = (id: string, patch: Partial<ClientRule>) =>
    setDraft((rules) => rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await clientPortalRepository.saveRules(project.id, cleaned, userEmail);
      setDraft(cleaned);
      toast.success(cleaned.length ? 'Rules saved' : 'Rules removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save the rules');
    } finally {
      setSaving(false);
    }
  };

  const updatedBy = project.clientRules?.updatedBy;
  const updatedAt = project.clientRules?.updatedAt;

  return (
    <div className="space-y-3">
      {draft.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No rules yet. Add what the client asked us never to do (masked figures, no calculations, a colour kept to one
          section), and everyone on the project sees it here and on their page.
        </p>
      )}
      <ul className="space-y-2">
        {draft.map((rule) => (
          <li key={rule.id} className="flex items-center gap-2">
            <Select
              value={rule.category ?? NO_CATEGORY}
              onValueChange={(value) =>
                update(rule.id, { category: value === NO_CATEGORY ? undefined : (value as ClientRuleCategory) })
              }
            >
              <SelectTrigger className="h-8 w-[118px] shrink-0 text-xs" aria-label="Kind of rule">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>No kind</SelectItem>
                {CLIENT_RULE_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {CLIENT_RULE_CATEGORY_LABELS[category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={rule.text}
              onChange={(e) => update(rule.id, { text: e.target.value })}
              placeholder="Brokerage figures are masked or random"
              maxLength={CLIENT_RULE_MAX_LENGTH}
              aria-label="Rule"
              className="h-8 text-sm"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              aria-label="Remove rule"
              onClick={() => setDraft((rules) => rules.filter((r) => r.id !== rule.id))}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs"
          disabled={draft.length >= CLIENT_RULES_MAX}
          onClick={() => setDraft((rules) => [...rules, { id: newRuleId(), text: '' }])}
        >
          <Plus className="h-3.5 w-3.5" />
          Add rule
        </Button>
        <div className="flex items-center gap-2">
          {updatedAt && !dirty && (
            <span className="text-[11px] text-muted-foreground">
              Saved {new Date(updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              {updatedBy ? ` by ${updatedBy.split('@')[0]}` : ''}
            </span>
          )}
          <Button size="sm" className="h-8 text-xs" onClick={() => void handleSave()} disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
