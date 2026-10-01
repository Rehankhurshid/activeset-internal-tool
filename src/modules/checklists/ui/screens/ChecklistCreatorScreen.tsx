'use client';

import { useState } from 'react';
import type { SOPTemplate } from '@/modules/checklists';
import { ChecklistEditor, TemplateList } from '@/modules/checklists';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
        <div className="mb-6 sm:mb-8 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{view === 'list' ? 'SOPs' : 'Checklist Creator'}</h1>
            <p className="max-w-2xl text-muted-foreground text-sm sm:text-base">
              {view === 'list'
                ? 'One SOP per service, in the order the work happens. A new project’s checklist is the SOPs for the services it bought.'
                : 'Use AI to generate standard operating procedures (SOPs) or build them manually.'}
            </p>
          </div>
          {view === 'list' && (
            <Button onClick={handleNew} className="gap-1.5">
              <Plus className="h-4 w-4" />
              New template
            </Button>
          )}
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

