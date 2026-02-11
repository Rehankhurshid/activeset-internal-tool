'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { SOPTemplate, SOPTemplateSection, SOPTemplateItem } from '@/types';
import { checklistService } from '@/services/ChecklistService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Trash2, Save, Wand2, GripVertical, Link as LinkIcon, Info, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface ChecklistEditorProps {
    /** Existing template to edit. If omitted, creates a new template. */
    initialTemplate?: SOPTemplate;
    /** Called after a successful save/update. */
    onSaved?: () => void;
    /** Called when user clicks "Back". */
    onBack?: () => void;
}

export function ChecklistEditor({ initialTemplate, onSaved, onBack }: ChecklistEditorProps) {
    const { user } = useAuth();
    const isEditMode = !!initialTemplate?.id && !initialTemplate.isBuiltIn;

    const [template, setTemplate] = useState<Partial<SOPTemplate>>({
        name: '',
        description: '',
        icon: '📝',
        sections: []
    });
    const [prompt, setPrompt] = useState('');
    const [generating, setGenerating] = useState(false);
    const [saving, setSaving] = useState(false);

    // Populate editor when initialTemplate changes
    useEffect(() => {
        if (initialTemplate) {
            setTemplate({
                name: initialTemplate.name,
                description: initialTemplate.description,
                icon: initialTemplate.icon,
                sections: initialTemplate.sections ? [...initialTemplate.sections] : [],
            });
        } else {
            setTemplate({ name: '', description: '', icon: '📝', sections: [] });
        }
    }, [initialTemplate]);

    const generateChecklist = async () => {
        if (!prompt.trim()) {
            toast.error('Please enter a prompt');
            return;
        }

        setGenerating(true);
        try {
            const response = await fetch('/api/ai-checklist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate checklist');
            }

            if (data.data) {
                setTemplate({
                    ...data.data,
                    sections: data.data.sections.map((s: SOPTemplateSection) => ({
                        ...s,
                        items: s.items || []
                    }))
                });
                toast.success('Checklist generated successfully!');
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Failed to generate checklist';
            console.error('Generation error:', error);
            toast.error(msg);
        } finally {
            setGenerating(false);
        }
    };

    const saveTemplate = async () => {
        if (!template.name) {
            toast.error('Template name is required');
            return;
        }

        setSaving(true);
        try {
            if (isEditMode && initialTemplate) {
                // Update existing template
                await checklistService.updateSOPTemplate(initialTemplate.id, {
                    name: template.name,
                    description: template.description || '',
                    icon: template.icon || '📝',
                    sections: template.sections as SOPTemplateSection[] || [],
                });
                toast.success('Template updated!');
            } else {
                // Create new template
                const fullTemplate: SOPTemplate = {
                    id: '',
                    name: template.name || 'Untitled Template',
                    description: template.description || '',
                    icon: template.icon || '📝',
                    sections: template.sections as SOPTemplateSection[] || []
                };
                await checklistService.saveSOPTemplate(fullTemplate);
                toast.success('Template saved!');
            }

            onSaved?.();
        } catch (error: unknown) {
            console.error('Save error:', error);
            toast.error(isEditMode ? 'Failed to update template' : 'Failed to save template');
        } finally {
            setSaving(false);
        }
    };

    // --- Helpers for editing state ---

    const updateSection = (index: number, updates: Partial<SOPTemplateSection>) => {
        const newSections = [...(template.sections || [])];
        newSections[index] = { ...newSections[index], ...updates };
        setTemplate({ ...template, sections: newSections });
    };

    const addSection = () => {
        setTemplate({
            ...template,
            sections: [
                ...(template.sections || []),
                { title: 'New Section', emoji: '📁', order: (template.sections?.length || 0), items: [] }
            ]
        });
    };

    const removeSection = (index: number) => {
        const newSections = [...(template.sections || [])];
        newSections.splice(index, 1);
        setTemplate({ ...template, sections: newSections });
    };

    const updateItem = (sectionIndex: number, itemIndex: number, updates: Partial<SOPTemplateItem>) => {
        const newSections = [...(template.sections || [])];
        const newItems = [...newSections[sectionIndex].items];
        newItems[itemIndex] = { ...newItems[itemIndex], ...updates };
        newSections[sectionIndex] = { ...newSections[sectionIndex], items: newItems };
        setTemplate({ ...template, sections: newSections });
    };

    const addItem = (sectionIndex: number) => {
        const newSections = [...(template.sections || [])];
        const section = newSections[sectionIndex];
        const newItem: SOPTemplateItem = {
            title: 'New Item',
            emoji: '📝',
            status: 'not_started',
            order: section.items.length
        };
        newSections[sectionIndex] = { ...section, items: [...section.items, newItem] };
        setTemplate({ ...template, sections: newSections });
    };

    const removeItem = (sectionIndex: number, itemIndex: number) => {
        const newSections = [...(template.sections || [])];
        const newItems = [...newSections[sectionIndex].items];
        newItems.splice(itemIndex, 1);
        newSections[sectionIndex] = { ...newSections[sectionIndex], items: newItems };
        setTemplate({ ...template, sections: newSections });
    };

    return (
        <div className="space-y-8 max-w-4xl mx-auto pb-20">
            {/* Back button */}
            {onBack && (
                <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 -ml-2">
                    <ArrowLeft className="h-4 w-4" />
                    Back to Templates
                </Button>
            )}

            {/* Title */}
            <div>
                <h2 className="text-2xl font-bold tracking-tight">
                    {isEditMode ? 'Edit Template' : 'New Template'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                    {isEditMode
                        ? `Editing "${initialTemplate?.name}"`
                        : 'Use AI to generate or build manually. Save as a reusable template.'}
                </p>
            </div>

            {/* AI Generation Card */}
            <Card className="border-purple-500/20 bg-purple-500/5">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Wand2 className="h-5 w-5 text-purple-500" />
                        AI Generator
                    </CardTitle>
                    <CardDescription>
                        Describe the process you want to checklist (e.g., &quot;Shopify to Webflow Migration&quot;, &quot;New Employee Onboarding&quot;).
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Input
                            placeholder="Enter a prompt..."
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && generateChecklist()}
                        />
                        <Button
                            onClick={generateChecklist}
                            disabled={generating || !prompt.trim()}
                            className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                            {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
                            Generate
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Template Metadata */}
            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                    <Label>Template Name</Label>
                    <Input
                        value={template.name}
                        onChange={(e) => setTemplate({ ...template, name: e.target.value })}
                        placeholder="e.g. Website Launch Checklist"
                    />
                </div>
                <div className="space-y-2">
                    <Label>Template Icon (Emoji)</Label>
                    <Input
                        value={template.icon}
                        onChange={(e) => setTemplate({ ...template, icon: e.target.value })}
                        placeholder="e.g. 🚀"
                        className="font-emoji"
                    />
                </div>
                <div className="col-span-2 space-y-2">
                    <Label>Description</Label>
                    <Textarea
                        value={template.description}
                        onChange={(e) => setTemplate({ ...template, description: e.target.value })}
                        placeholder="Brief description of this checklist..."
                    />
                </div>
            </div>

            {/* Sections Editor */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Sections & Items</h3>
                    <Button variant="outline" size="sm" onClick={addSection}>
                        <Plus className="h-4 w-4 mr-2" /> Add Section
                    </Button>
                </div>

                {template.sections?.map((section, sIndex) => (
                    <Card key={sIndex} className="relative group">
                        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeSection(sIndex)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                        <CardContent className="pt-6 space-y-4">
                            <div className="flex gap-2 items-center">
                                <div className="w-12 flex-shrink-0">
                                    <Input
                                        value={section.emoji || ''}
                                        onChange={(e) => updateSection(sIndex, { emoji: e.target.value })}
                                        placeholder="📂"
                                        className="text-center text-lg"
                                    />
                                </div>
                                <Input
                                    value={section.title}
                                    onChange={(e) => updateSection(sIndex, { title: e.target.value })}
                                    placeholder="Section Title"
                                    className="font-medium text-lg"
                                />
                            </div>

                            <div className="pl-4 border-l-2 border-muted ml-6 space-y-3">
                                {section.items.map((item, iIndex) => (
                                    <div key={iIndex} className="bg-muted/30 p-3 rounded-lg space-y-2 group/item relative">
                                        <div className="absolute right-2 top-2 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeItem(sIndex, iIndex)}>
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>

                                        <div className="flex gap-2 items-center">
                                            <div className="w-10 flex-shrink-0">
                                                <Input
                                                    value={item.emoji || ''}
                                                    onChange={(e) => updateItem(sIndex, iIndex, { emoji: e.target.value })}
                                                    placeholder="📝"
                                                    className="text-center h-8 text-sm"
                                                />
                                            </div>
                                            <Input
                                                value={item.title}
                                                onChange={(e) => updateItem(sIndex, iIndex, { title: e.target.value })}
                                                placeholder="Checklist Item Title"
                                                className="h-8 text-sm font-medium"
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 pl-12">
                                            <div className="relative">
                                                <LinkIcon className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                                                <Input
                                                    value={item.referenceLink || ''}
                                                    onChange={(e) => updateItem(sIndex, iIndex, { referenceLink: e.target.value })}
                                                    placeholder="Reference Link (optional)"
                                                    className="pl-8 h-7 text-xs"
                                                />
                                            </div>
                                            <div className="relative">
                                                <Info className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                                                <Input
                                                    value={item.hoverImage || ''}
                                                    onChange={(e) => updateItem(sIndex, iIndex, { hoverImage: e.target.value })}
                                                    placeholder="Hover Image URL (optional)"
                                                    className="pl-8 h-7 text-xs"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <Button variant="ghost" size="sm" className="w-full text-muted-foreground dashed border" onClick={() => addItem(sIndex)}>
                                    <Plus className="h-3 w-3 mr-2" /> Add Item
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {template.sections?.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                        <p>No sections yet. Use AI to generate or add manually.</p>
                        <Button variant="outline" className="mt-4" onClick={addSection}>
                            Add First Section
                        </Button>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t flex justify-end gap-2 container mx-auto">
                {onBack && (
                    <Button variant="outline" onClick={onBack}>
                        Cancel
                    </Button>
                )}
                <Button onClick={saveTemplate} disabled={saving || !template.name} className="min-w-[150px]">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    {isEditMode ? 'Update Template' : 'Save Template'}
                </Button>
            </div>
        </div>
    );
}
