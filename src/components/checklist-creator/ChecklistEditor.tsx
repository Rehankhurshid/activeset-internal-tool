'use client';

import React, { useState, useEffect } from 'react';
import { SOPTemplate, SOPTemplateSection, SOPTemplateItem } from '@/types';
import { checklistService } from '@/services/ChecklistService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    Loader2,
    Plus,
    Trash2,
    Save,
    Wand2,
    GripVertical,
    Link as LinkIcon,
    Info,
    ArrowLeft,
    FileCode,
    Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { templateToMarkdown, parseMarkdownToTemplate } from '@/lib/template-export';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ── Internal editable types (add stable _uid for sortable) ──
type EditableItem = SOPTemplateItem & { _uid: string };
type EditableSection = Omit<SOPTemplateSection, 'items'> & { _uid: string; items: EditableItem[] };
type EditableTemplate = {
    name: string;
    description: string;
    icon: string;
    sections: EditableSection[];
};

const makeUid = () => Math.random().toString(36).slice(2, 11) + Date.now().toString(36);

const toEditable = (sections: SOPTemplateSection[] | undefined): EditableSection[] =>
    (sections || []).map((s) => ({
        ...s,
        _uid: makeUid(),
        items: (s.items || []).map((it) => ({ ...it, _uid: makeUid() })),
    }));

const stripUid = (sections: EditableSection[]): SOPTemplateSection[] =>
    sections.map((s, sIdx) => ({
        title: s.title,
        emoji: s.emoji,
        order: sIdx,
        items: s.items.map((it, iIdx) => ({
            title: it.title,
            emoji: it.emoji,
            status: it.status,
            notes: it.notes,
            referenceLink: it.referenceLink,
            hoverImage: it.hoverImage,
            assignee: it.assignee,
            completedAt: it.completedAt,
            completedBy: it.completedBy,
            order: iIdx,
        })),
    }));

interface ChecklistEditorProps {
    /** Existing template to edit. If omitted, creates a new template. */
    initialTemplate?: SOPTemplate;
    /** Called after a successful save/update. */
    onSaved?: () => void;
    /** Called when user clicks "Back". */
    onBack?: () => void;
}

export function ChecklistEditor({ initialTemplate, onSaved, onBack }: ChecklistEditorProps) {
    const isEditMode = !!initialTemplate?.id && !initialTemplate.isBuiltIn;

    const [template, setTemplate] = useState<EditableTemplate>({
        name: '',
        description: '',
        icon: '📝',
        sections: [],
    });
    const [prompt, setPrompt] = useState('');
    const [generating, setGenerating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [tab, setTab] = useState<'visual' | 'markdown'>('visual');
    const [markdown, setMarkdown] = useState('');

    // Populate editor when initialTemplate changes
    useEffect(() => {
        if (initialTemplate) {
            setTemplate({
                name: initialTemplate.name,
                description: initialTemplate.description || '',
                icon: initialTemplate.icon || '📝',
                sections: toEditable(initialTemplate.sections),
            });
        } else {
            setTemplate({ name: '', description: '', icon: '📝', sections: [] });
        }
        setTab('visual');
    }, [initialTemplate]);

    // ── Tab switching: regenerate markdown when entering, parse when leaving ──
    const handleTabChange = (next: string) => {
        if (next === tab) return;
        if (next === 'markdown') {
            const md = templateToMarkdown({
                name: template.name,
                description: template.description,
                icon: template.icon,
                sections: stripUid(template.sections),
            } as SOPTemplate);
            setMarkdown(md);
        } else {
            const parsed = parseMarkdownToTemplate(markdown);
            setTemplate({
                name: parsed.name || template.name,
                description: parsed.description ?? template.description,
                icon: parsed.icon || template.icon,
                sections: toEditable(parsed.sections),
            });
        }
        setTab(next as 'visual' | 'markdown');
    };

    // ── AI generation ──
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
                    name: data.data.name || '',
                    description: data.data.description || '',
                    icon: data.data.icon || '📝',
                    sections: toEditable(data.data.sections),
                });
                setTab('visual');
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

    // ── Save (parses markdown first if user is in markdown mode) ──
    const saveTemplate = async () => {
        let payload = template;
        if (tab === 'markdown') {
            const parsed = parseMarkdownToTemplate(markdown);
            payload = {
                name: parsed.name || template.name,
                description: parsed.description ?? template.description,
                icon: parsed.icon || template.icon,
                sections: toEditable(parsed.sections),
            };
            setTemplate(payload);
        }

        if (!payload.name) {
            toast.error('Template name is required');
            return;
        }

        setSaving(true);
        try {
            const sections = stripUid(payload.sections);
            if (isEditMode && initialTemplate) {
                await checklistService.updateSOPTemplate(initialTemplate.id, {
                    name: payload.name,
                    description: payload.description || '',
                    icon: payload.icon || '📝',
                    sections,
                });
                toast.success('Template updated!');
            } else {
                const fullTemplate: SOPTemplate = {
                    id: '',
                    name: payload.name || 'Untitled Template',
                    description: payload.description || '',
                    icon: payload.icon || '📝',
                    sections,
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

    // ── Section / item mutators ──
    const updateSection = (index: number, updates: Partial<EditableSection>) => {
        setTemplate((t) => ({
            ...t,
            sections: t.sections.map((s, i) => (i === index ? { ...s, ...updates } : s)),
        }));
    };

    const addSection = () => {
        setTemplate((t) => ({
            ...t,
            sections: [
                ...t.sections,
                {
                    _uid: makeUid(),
                    title: 'New Section',
                    emoji: '📁',
                    order: t.sections.length,
                    items: [],
                },
            ],
        }));
    };

    const removeSection = (index: number) => {
        setTemplate((t) => ({ ...t, sections: t.sections.filter((_, i) => i !== index) }));
    };

    const updateItem = (sIdx: number, iIdx: number, updates: Partial<EditableItem>) => {
        setTemplate((t) => ({
            ...t,
            sections: t.sections.map((s, i) =>
                i === sIdx
                    ? { ...s, items: s.items.map((it, j) => (j === iIdx ? { ...it, ...updates } : it)) }
                    : s,
            ),
        }));
    };

    const addItem = (sIdx: number) => {
        setTemplate((t) => ({
            ...t,
            sections: t.sections.map((s, i) =>
                i === sIdx
                    ? {
                        ...s,
                        items: [
                            ...s.items,
                            {
                                _uid: makeUid(),
                                title: 'New Item',
                                emoji: '📝',
                                status: 'not_started',
                                order: s.items.length,
                            },
                        ],
                    }
                    : s,
            ),
        }));
    };

    const removeItem = (sIdx: number, iIdx: number) => {
        setTemplate((t) => ({
            ...t,
            sections: t.sections.map((s, i) =>
                i === sIdx ? { ...s, items: s.items.filter((_, j) => j !== iIdx) } : s,
            ),
        }));
    };

    // ── Drag & drop ──
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleSectionDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        setTemplate((t) => {
            const oldIndex = t.sections.findIndex((s) => s._uid === active.id);
            const newIndex = t.sections.findIndex((s) => s._uid === over.id);
            if (oldIndex < 0 || newIndex < 0) return t;
            return { ...t, sections: arrayMove(t.sections, oldIndex, newIndex) };
        });
    };

    const handleItemDragEnd = (sIdx: number) => (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        setTemplate((t) => {
            const section = t.sections[sIdx];
            if (!section) return t;
            const oldIndex = section.items.findIndex((it) => it._uid === active.id);
            const newIndex = section.items.findIndex((it) => it._uid === over.id);
            if (oldIndex < 0 || newIndex < 0) return t;
            return {
                ...t,
                sections: t.sections.map((s, i) =>
                    i === sIdx ? { ...s, items: arrayMove(s.items, oldIndex, newIndex) } : s,
                ),
            };
        });
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

            {/* Visual / Markdown tabs */}
            <Tabs value={tab} onValueChange={handleTabChange}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold">Sections & Items</h3>
                        <TabsList>
                            <TabsTrigger value="visual" className="gap-1.5">
                                <Pencil className="h-3.5 w-3.5" />
                                Visual
                            </TabsTrigger>
                            <TabsTrigger value="markdown" className="gap-1.5">
                                <FileCode className="h-3.5 w-3.5" />
                                Markdown
                            </TabsTrigger>
                        </TabsList>
                    </div>
                    {tab === 'visual' && (
                        <Button variant="outline" size="sm" onClick={addSection}>
                            <Plus className="h-4 w-4 mr-2" /> Add Section
                        </Button>
                    )}
                </div>

                <TabsContent value="visual" className="mt-4">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleSectionDragEnd}
                    >
                        <SortableContext
                            items={template.sections.map((s) => s._uid)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-6">
                                {template.sections.map((section, sIndex) => (
                                    <SortableSectionCard
                                        key={section._uid}
                                        section={section}
                                        sIndex={sIndex}
                                        sensors={sensors}
                                        onUpdateSection={updateSection}
                                        onRemoveSection={removeSection}
                                        onUpdateItem={updateItem}
                                        onAddItem={addItem}
                                        onRemoveItem={removeItem}
                                        onItemDragEnd={handleItemDragEnd(sIndex)}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>

                    {template.sections.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                            <p>No sections yet. Use AI to generate or add manually.</p>
                            <Button variant="outline" className="mt-4" onClick={addSection}>
                                Add First Section
                            </Button>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="markdown" className="mt-4">
                    <Card>
                        <CardContent className="pt-6 space-y-3">
                            <div className="text-xs text-muted-foreground leading-relaxed">
                                Edit raw Markdown — use <code>##</code> for sections and <code>- [ ]</code> for items. Add{' '}
                                <code>  - 🔗 Reference: URL</code> on a sub-bullet for reference links and{' '}
                                <code>  - 🖼️ Image: URL</code> for hover images. Switch to <strong>Visual</strong> to preview, drag-reorder, or save.
                            </div>
                            <Textarea
                                value={markdown}
                                onChange={(e) => setMarkdown(e.target.value)}
                                placeholder={`# 📝 Template name\n> Description\n\n---\n\n## 📁 Section title\n- [ ] 📝 Item title\n  - 🔗 Reference: https://example.com`}
                                className="font-mono text-xs min-h-[480px]"
                                spellCheck={false}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Actions */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t flex justify-end gap-2 container mx-auto">
                {onBack && (
                    <Button variant="outline" onClick={onBack}>
                        Cancel
                    </Button>
                )}
                <Button onClick={saveTemplate} disabled={saving} className="min-w-[150px]">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    {isEditMode ? 'Update Template' : 'Save Template'}
                </Button>
            </div>
        </div>
    );
}

// ── Sortable section card ──
interface SortableSectionCardProps {
    section: EditableSection;
    sIndex: number;
    sensors: ReturnType<typeof useSensors>;
    onUpdateSection: (i: number, u: Partial<EditableSection>) => void;
    onRemoveSection: (i: number) => void;
    onUpdateItem: (sIdx: number, iIdx: number, u: Partial<EditableItem>) => void;
    onAddItem: (sIdx: number) => void;
    onRemoveItem: (sIdx: number, iIdx: number) => void;
    onItemDragEnd: (event: DragEndEvent) => void;
}

function SortableSectionCard({
    section,
    sIndex,
    sensors,
    onUpdateSection,
    onRemoveSection,
    onUpdateItem,
    onAddItem,
    onRemoveItem,
    onItemDragEnd,
}: SortableSectionCardProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: section._uid,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={isDragging ? 'opacity-60 z-10 relative' : 'relative'}
        >
            <Card className="relative group">
                <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => onRemoveSection(sIndex)}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
                <CardContent className="pt-6 space-y-4">
                    <div className="flex gap-2 items-center">
                        <button
                            {...attributes}
                            {...listeners}
                            type="button"
                            className="touch-none cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                            aria-label="Drag section"
                        >
                            <GripVertical className="h-5 w-5" />
                        </button>
                        <div className="w-12 flex-shrink-0">
                            <Input
                                value={section.emoji || ''}
                                onChange={(e) => onUpdateSection(sIndex, { emoji: e.target.value })}
                                placeholder="📂"
                                className="text-center text-lg"
                            />
                        </div>
                        <Input
                            value={section.title}
                            onChange={(e) => onUpdateSection(sIndex, { title: e.target.value })}
                            placeholder="Section Title"
                            className="font-medium text-lg"
                        />
                    </div>

                    <div className="pl-4 border-l-2 border-muted ml-6 space-y-3">
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={onItemDragEnd}
                        >
                            <SortableContext
                                items={section.items.map((it) => it._uid)}
                                strategy={verticalListSortingStrategy}
                            >
                                {section.items.map((item, iIndex) => (
                                    <SortableItemRow
                                        key={item._uid}
                                        item={item}
                                        sIndex={sIndex}
                                        iIndex={iIndex}
                                        onUpdateItem={onUpdateItem}
                                        onRemoveItem={onRemoveItem}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-muted-foreground dashed border"
                            onClick={() => onAddItem(sIndex)}
                        >
                            <Plus className="h-3 w-3 mr-2" /> Add Item
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// ── Sortable item row ──
interface SortableItemRowProps {
    item: EditableItem;
    sIndex: number;
    iIndex: number;
    onUpdateItem: (sIdx: number, iIdx: number, u: Partial<EditableItem>) => void;
    onRemoveItem: (sIdx: number, iIdx: number) => void;
}

function SortableItemRow({
    item,
    sIndex,
    iIndex,
    onUpdateItem,
    onRemoveItem,
}: SortableItemRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: item._uid,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`bg-muted/30 p-3 rounded-lg space-y-2 group/item relative ${isDragging ? 'opacity-60 z-10' : ''
                }`}
        >
            <div className="absolute right-2 top-2 opacity-0 group-hover/item:opacity-100 transition-opacity">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    onClick={() => onRemoveItem(sIndex, iIndex)}
                >
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>

            <div className="flex gap-2 items-center">
                <button
                    {...attributes}
                    {...listeners}
                    type="button"
                    className="touch-none cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                    aria-label="Drag item"
                >
                    <GripVertical className="h-4 w-4" />
                </button>
                <div className="w-10 flex-shrink-0">
                    <Input
                        value={item.emoji || ''}
                        onChange={(e) => onUpdateItem(sIndex, iIndex, { emoji: e.target.value })}
                        placeholder="📝"
                        className="text-center h-8 text-sm"
                    />
                </div>
                <Input
                    value={item.title}
                    onChange={(e) => onUpdateItem(sIndex, iIndex, { title: e.target.value })}
                    placeholder="Checklist Item Title"
                    className="h-8 text-sm font-medium"
                />
            </div>

            <div className="grid grid-cols-2 gap-2 pl-12">
                <div className="relative">
                    <LinkIcon className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                    <Input
                        value={item.referenceLink || ''}
                        onChange={(e) => onUpdateItem(sIndex, iIndex, { referenceLink: e.target.value })}
                        placeholder="Reference Link (optional)"
                        className="pl-8 h-7 text-xs"
                    />
                </div>
                <div className="relative">
                    <Info className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                    <Input
                        value={item.hoverImage || ''}
                        onChange={(e) => onUpdateItem(sIndex, iIndex, { hoverImage: e.target.value })}
                        placeholder="Hover Image URL (optional)"
                        className="pl-8 h-7 text-xs"
                    />
                </div>
            </div>
        </div>
    );
}
