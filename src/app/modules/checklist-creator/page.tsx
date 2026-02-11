'use client';

import { useState } from 'react';
import { SOPTemplate } from '@/types';
import { TemplateList } from '@/components/checklist-creator/TemplateList';
import { ChecklistEditor } from '@/components/checklist-creator/ChecklistEditor';

type View = 'list' | 'editor';

export default function ChecklistCreatorPage() {
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
        <div className="container mx-auto py-8 px-4">
            <div className="mb-8 space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Checklist Creator & Template Manager</h1>
                <p className="text-muted-foreground">
                    {view === 'list'
                        ? 'Browse, edit, and manage your SOP templates. Create new ones with AI or manually.'
                        : 'Use AI to generate standard operating procedures (SOPs) or build them manually.'}
                </p>
            </div>

            {view === 'list' ? (
                <TemplateList onEdit={handleEdit} onNew={handleNew} />
            ) : (
                <ChecklistEditor
                    initialTemplate={editingTemplate}
                    onSaved={handleSaved}
                    onBack={handleBack}
                />
            )}
        </div>
    );
}
