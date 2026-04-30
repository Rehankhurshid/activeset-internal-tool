'use client';

import { useState } from 'react';
import type { SOPTemplate } from '@/modules/checklists';
import { ChecklistEditor, TemplateList } from '@/modules/checklists';
import { AppNavigation } from '@/shared/ui';

type View = 'list' | 'editor';

export function ChecklistCreatorScreen() {
  const [view, setView] = useState<View>('list');
  const [editingTemplate, setEditingTemplate] = useState<SOPTemplate | undefined>();

  const handleNew = () => {
    setEditingTemplate(undefined);
    setView('editor');
  };

  const handleEdit = (template: SOPTemplate) => {
    setEditingTemplate(template);
    setView('editor');
  };

  const handleBack = () => {
    setEditingTemplate(undefined);
    setView('list');
  };

  const handleSaved = () => {
    setEditingTemplate(undefined);
    setView('list');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppNavigation title="Checklist Creator" showBackButton backHref="/" />
      <main className="flex-1 container mx-auto py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-6 sm:mb-8 space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Checklist Creator &amp; Template Manager</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {view === 'list'
              ? 'Browse, edit, and manage your SOP templates. Create new ones with AI or manually.'
              : 'Use AI to generate standard operating procedures (SOPs) or build them manually.'}
          </p>
        </div>

        {view === 'list' ? (
          <TemplateList onEdit={handleEdit} onNew={handleNew} />
        ) : (
          <ChecklistEditor initialTemplate={editingTemplate} onSaved={handleSaved} onBack={handleBack} />
        )}
      </main>
    </div>
  );
}

