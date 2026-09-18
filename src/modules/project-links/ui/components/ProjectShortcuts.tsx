'use client';

import { useEffect } from 'react';
import { useShortcut } from '@/shared/keyboard';
import { recordRecentProject } from '@/lib/recent-projects';
import type { TabOption } from './ProjectTabs';

interface ProjectShortcutsProps {
  project: { id: string; name: string; client?: string | null };
  tabs: TabOption[];
  activeTab: string;
  onTabChange: (value: string) => void;
  /** `s` — share the client portal link (copies it, or opens the Client tab when the portal is off). */
  onShare: () => void;
  onEmbed: () => void;
  /** `c` — copy the client portal link. */
  onCopyClientLink: () => void;
}

function TabShortcut({ tab, index, onTabChange }: { tab: TabOption; index: number; onTabChange: (v: string) => void }) {
  useShortcut({
    id: `project-tab-${tab.value}`,
    keys: String(index + 1),
    label: index === 0 ? 'Jump to tab 1–9' : `Go to ${tab.label}`,
    group: 'Project',
    hidden: index > 0,
    handler: () => onTabChange(tab.value),
  });
  return null;
}

/**
 * Keyboard layer for the project detail screen. Rendered inside the page's
 * JSX (after its early returns) so it only exists once a project is loaded.
 */
export function ProjectShortcuts({ project, tabs, activeTab, onTabChange, onShare, onEmbed, onCopyClientLink }: ProjectShortcutsProps) {
  const { id, name, client } = project;
  useEffect(() => {
    recordRecentProject({ id, name, client });
  }, [id, name, client]);

  const idx = Math.max(0, tabs.findIndex((t) => t.value === activeTab));

  useShortcut({
    id: 'project-tab-next',
    keys: ']',
    label: 'Next tab',
    group: 'Project',
    hint: true,
    handler: () => onTabChange(tabs[(idx + 1) % tabs.length].value),
  });
  useShortcut({
    id: 'project-tab-prev',
    keys: '[',
    label: 'Previous tab',
    group: 'Project',
    handler: () => onTabChange(tabs[(idx - 1 + tabs.length) % tabs.length].value),
  });
  // `s` and `c` both copy the client portal link; `s` is kept for the muscle
  // memory built up while it shared the audit dashboard, but it stays out of
  // the help sheet so the same action is not advertised twice.
  useShortcut({ id: 'project-share', keys: 's', label: 'Copy client link', group: 'Project', hidden: true, handler: onShare });
  useShortcut({ id: 'project-embed', keys: 'e', label: 'Embed widget', group: 'Project', hint: true, handler: onEmbed });
  useShortcut({ id: 'project-copy-client-link', keys: 'c', label: 'Copy client link', group: 'Project', hint: true, handler: onCopyClientLink });

  return (
    <>
      {tabs.slice(0, 9).map((tab, i) => (
        <TabShortcut key={tab.value} tab={tab} index={i} onTabChange={onTabChange} />
      ))}
    </>
  );
}
