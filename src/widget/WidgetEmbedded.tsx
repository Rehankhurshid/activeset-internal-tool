'use client';

import React from 'react';
import { WidgetConfig } from '@/types';
import { QAWidget } from '@/components/qa/QAWidget';
import { ChecklistWidget } from '@/components/checklist/ChecklistWidget';
import { useAuth } from '@/hooks/useAuth';

interface WidgetEmbeddedProps {
  config?: WidgetConfig & { stagingUrl?: string; projectId?: string };
}

export function WidgetEmbedded({ config }: WidgetEmbeddedProps) {
  const [activeTab, setActiveTab] = React.useState<'links' | 'qa' | 'checklist'>(config?.mode || 'qa');
  const { user, signInWithGoogle } = useAuth();

  const allTabs = [
    { id: 'qa' as const, label: 'QA Checker' },
    { id: 'links' as const, label: 'Project Links' },
    { id: 'checklist' as const, label: 'Checklist' },
  ];

  const tabs = config?.mode === 'checklist'
    ? allTabs.filter(t => t.id === 'checklist')
    : allTabs;

  return (
    <div className="flex flex-col h-full bg-background text-foreground min-h-[400px]">
      {tabs.length > 1 && (
        <div className="flex items-center border-b px-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto bg-gray-50/50 dark:bg-black/20">
        {activeTab === 'qa' ? (
          <QAWidget stagingUrl={config?.stagingUrl} />
        ) : activeTab === 'checklist' && config?.projectId ? (
          <ChecklistWidget
            projectId={config.projectId}
            userEmail={user?.email ?? undefined}
            isAuthenticated={!!user}
            onSignIn={signInWithGoogle}
          />
        ) : activeTab === 'checklist' ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No project ID configured for this embed.
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            Project Links Widget (Coming Soon)
          </div>
        )}
      </div>
    </div>
  );
}