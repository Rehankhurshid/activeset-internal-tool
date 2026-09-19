'use client';

import React, { useState, useEffect } from 'react';
import { SOPTemplate, SOPTemplateSection, SOPTemplateItem, ChecklistItemLink, StageRole } from '@/types';
import { checklistService } from '@/services/ChecklistService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
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
    ChevronDown,
    ChevronRight,
    FileCode,
    Pencil,
    X,
} from 'lucide-react';
import { toast } from 'sonner';
import { templateToMarkdown, parseMarkdownToTemplate } from '@/lib/template-export';
// The scan signals come from the delivery domain, not from the component that
// renders them, so the Creator does not depend on another screen's UI.
import { AUTO_CHECK_IDS } from '@/modules/delivery/domain/delivery.types';
import { AUTO_CHECK_DESCRIPTIONS } from '@/modules/delivery/ui/components/CheckStatusControl';
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

/** A Select cannot hold an empty value, so "no role" and "no signal" need sentinels. */
const NO_ROLE = 'none';
const NO_CHECK = 'none';

/**
 * What a section's role is called on screen.
 *
 * Every section is a stage in the delivery arc now, so there is no such thing as
 * a section Delivery cannot see — a role only says what the tab does there
 * *beyond* listing the items. Hence "Ordinary stage" rather than the old "Not in
 * Delivery", which described a behaviour that no longer exists.
 */
const ROLE_OPTIONS: { value: StageRole | typeof NO_ROLE; label: string; hint: string }[] = [
    { value: NO_ROLE, label: 'Ordinary stage', hint: 'A step in Delivery like any other' },
    { value: 'kickoff', label: 'Kickoff stage', hint: 'Also shows the cadence and welcome email' },
    { value: 'pages', label: 'Page build stage', hint: 'Also shows the page grid' },
    { value: 'client_review', label: 'Client review stage', hint: 'Ends with the client approving' },
    { value: 'launch', label: 'Launch stage', hint: 'Readiness gate before going live' },
];

/**
 * The role to show for a section authored before roles existed.
 *
 * `stage: 'kickoff' | 'launch'` means the role of the same name, so an old
 * template reads correctly here and is saved as a role.
 */
const roleOf = (section: EditableSection): StageRole | undefined => {
    if (section.role) return section.role;
    if (section.stage === 'kickoff' || section.stage === 'launch') return section.stage;
    return undefined;
};

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
        // The role is written and the deprecated `stage` is not, so saving is
        // also the migration: an old tag comes in through `roleOf` and goes out
        // as the role of the same name.
        role: roleOf(s),
        items: s.items.map((it, iIdx) => ({
            title: it.title,
            emoji: it.emoji,
            status: it.status,
            autoCheck: it.autoCheck,
            // Carried deliberately: a saved template that dropped any of these
            // would quietly erase the guidance an author just wrote.
            howTo: it.howTo,
            links: it.links,
            blocking: it.blocking,
            dueDate: it.dueDate,
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
                            <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
                                <p>
                                    Edit raw Markdown — <code>##</code> for a section, <code>- [ ]</code> for an item.
                                    Under a section heading, <code>&gt; Role: kickoff | pages | client_review | launch</code>{' '}
                                    says what Delivery does at that stage; leave it out for an ordinary one.
                                </p>
                                <p>
                                    Everything on an item is a <code>Key: value</code> sub-bullet:{' '}
                                    <code>📋 How-to:</code> (repeat the line for a second line of prose),{' '}
                                    <code>🔗 Link: [Label](URL)</code>, <code>🖼️ Image: URL</code>,{' '}
                                    <code>🔍 Check: page_title</code>, <code>🗒️ Notes:</code>,{' '}
                                    <code>👤 Assignee: name@activeset.co</code>, <code>⛔ Blocking: yes</code>,{' '}
                                    <code>📅 Due: 2026-01-31</code>. Anything else is ignored.
                                </p>
                                <p>Switch to <strong>Visual</strong> to preview, drag-reorder, or save.</p>
                            </div>
                            <Textarea
                                value={markdown}
                                onChange={(e) => setMarkdown(e.target.value)}
                                placeholder={`# 📝 Template name\n> Description\n\n---\n\n## 📁 Section title\n\n> Role: kickoff\n\n- [ ] 📝 Item title\n  - 📋 How-to: What to actually do.\n  - 📋 How-to: A second line, if it needs one.\n  - 🔗 Link: [Screaming Frog](https://example.com)\n  - ⛔ Blocking: yes`}
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
                        {/*
                          Every section is a stage in Delivery, in this order. The
                          role says what Delivery does there on top of listing the
                          items, which is the only thing the app hardcodes — so
                          most sections stay ordinary, and a project can change the
                          role on its own copy afterwards.
                        */}
                        <Select
                            value={roleOf(section) ?? NO_ROLE}
                            onValueChange={(value) =>
                                onUpdateSection(sIndex, {
                                    role: value === NO_ROLE ? undefined : (value as StageRole),
                                    // Drop the tag roles replaced, so the two cannot disagree.
                                    stage: undefined,
                                })
                            }
                        >
                            <SelectTrigger
                                className="w-[11rem] flex-shrink-0"
                                aria-label="Stage role"
                                title="Every section is a stage in Delivery. The role says what Delivery does there beyond listing the items."
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {ROLE_OPTIONS.map((option) => (
                                    // The label is all the trigger can show — Radix
                                    // renders the chosen item's own text there — so
                                    // the hint rides along as a tooltip instead.
                                    <SelectItem key={option.value} value={option.value} title={option.hint}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
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
    // A template runs to 70-odd items, so everything but the title is folded
    // away. Open by default would make the page unreadable and unscrollable.
    const [expanded, setExpanded] = useState(false);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    /**
     * The links to show, legacy single link included.
     *
     * `referenceLink` came before labelled links and is still read. Any edit here
     * writes the whole list and clears it, so the first time an author touches
     * the links of an old item it folds in and there is only one field again.
     */
    const links: ChecklistItemLink[] = [
        ...(item.links || []),
        ...(item.referenceLink ? [{ label: '', url: item.referenceLink }] : []),
    ];
    const writeLinks = (next: ChecklistItemLink[]) =>
        onUpdateItem(sIndex, iIndex, { links: next, referenceLink: undefined });

    // What the collapsed row admits to carrying, so nobody has to open 70 rows
    // to find the one with the how-to on it.
    const carried = [
        item.howTo ? 'how-to' : null,
        links.length ? `${links.length} link${links.length > 1 ? 's' : ''}` : null,
        item.notes ? 'notes' : null,
        item.assignee ? item.assignee : null,
        item.dueDate ? `due ${item.dueDate}` : null,
        item.autoCheck ? 'scan' : null,
        item.blocking ? 'blocking' : null,
    ].filter(Boolean) as string[];

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
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2 text-xs text-muted-foreground flex-shrink-0 mr-7"
                    onClick={() => setExpanded((open) => !open)}
                    aria-expanded={expanded}
                >
                    {expanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    Details
                </Button>
            </div>

            {!expanded && carried.length > 0 && (
                <p className="pl-12 text-[11px] text-muted-foreground truncate">{carried.join(' · ')}</p>
            )}

            {expanded && (
                <div className="pl-12 space-y-3">
                    {/*
                      The how-to is the point of all this: the SOP's judgement
                      calls used to be crammed into item titles and parentheses
                      because there was nowhere else to put them.
                    */}
                    <div className="space-y-1">
                        <Label className="text-xs">How to do this</Label>
                        <Textarea
                            value={item.howTo || ''}
                            onChange={(e) => onUpdateItem(sIndex, iIndex, { howTo: e.target.value })}
                            placeholder="A few lines on what to actually do — the decision, not the theory."
                            className="text-xs min-h-[72px]"
                        />
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs">Links</Label>
                        {links.map((link, lIdx) => (
                            <div key={lIdx} className="flex gap-2 items-center">
                                <Input
                                    value={link.label}
                                    onChange={(e) =>
                                        writeLinks(
                                            links.map((l, i) =>
                                                i === lIdx ? { ...l, label: e.target.value } : l,
                                            ),
                                        )
                                    }
                                    placeholder="Label"
                                    className="h-7 text-xs w-1/3"
                                />
                                <div className="relative flex-1">
                                    <LinkIcon className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                                    <Input
                                        value={link.url}
                                        onChange={(e) =>
                                            writeLinks(
                                                links.map((l, i) =>
                                                    i === lIdx ? { ...l, url: e.target.value } : l,
                                                ),
                                            )
                                        }
                                        placeholder="https://…"
                                        className="pl-8 h-7 text-xs"
                                    />
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground flex-shrink-0"
                                    onClick={() => writeLinks(links.filter((_, i) => i !== lIdx))}
                                    aria-label="Remove link"
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            </div>
                        ))}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground"
                            onClick={() => writeLinks([...links, { label: '', url: '' }])}
                        >
                            <Plus className="h-3 w-3 mr-1" /> Add link
                        </Button>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs">Notes</Label>
                        <Textarea
                            value={item.notes || ''}
                            onChange={(e) => onUpdateItem(sIndex, iIndex, { notes: e.target.value })}
                            placeholder="Anything worth knowing next time."
                            className="text-xs min-h-[48px]"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <Label className="text-xs">Assignee</Label>
                            <Input
                                value={item.assignee || ''}
                                onChange={(e) => onUpdateItem(sIndex, iIndex, { assignee: e.target.value })}
                                placeholder="name@activeset.co"
                                className="h-7 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Due date</Label>
                            <Input
                                type="date"
                                value={item.dueDate || ''}
                                onChange={(e) => onUpdateItem(sIndex, iIndex, { dueDate: e.target.value || undefined })}
                                className="h-7 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Hover image</Label>
                            <div className="relative">
                                <Info className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                                <Input
                                    value={item.hoverImage || ''}
                                    onChange={(e) => onUpdateItem(sIndex, iIndex, { hoverImage: e.target.value })}
                                    placeholder="Image URL (optional)"
                                    className="pl-8 h-7 text-xs"
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Answered by a scan</Label>
                            {/*
                              Only the signals the audit actually computes are
                              offered: anything else would make an item look
                              automatic and leave it unanswered forever.
                            */}
                            <Select
                                value={item.autoCheck ?? NO_CHECK}
                                onValueChange={(value) =>
                                    onUpdateItem(sIndex, iIndex, {
                                        autoCheck:
                                            value === NO_CHECK
                                                ? undefined
                                                : (value as SOPTemplateItem['autoCheck']),
                                    })
                                }
                            >
                                <SelectTrigger className="h-7 text-xs" aria-label="Scan signal">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NO_CHECK}>A person answers this</SelectItem>
                                    {AUTO_CHECK_IDS.map((id) => (
                                        <SelectItem key={id} value={id}>
                                            Scan: {AUTO_CHECK_DESCRIPTIONS[id]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                            checked={!!item.blocking}
                            onCheckedChange={(checked) =>
                                onUpdateItem(sIndex, iIndex, { blocking: checked === true ? true : undefined })
                            }
                        />
                        Blocking — this stage cannot close until it is settled
                    </label>
                </div>
            )}
        </div>
    );
}
