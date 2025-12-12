import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Trash2, Plus, GripVertical, ChevronRight, Save } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Label } from "@/components/ui/label";
import { ConfigurationItem } from "@/hooks/useConfigurations";
import RichTextEditor from "../../proposal/components/RichTextEditor";

interface RichItemEditorProps {
    title: string;
    docId: string; // 'about_us' or 'terms' or 'deliverables'
    initialItems: ConfigurationItem[];
}

interface SortableListItemProps {
    item: ConfigurationItem;
    isSelected: boolean;
    onSelect: (id: string) => void;
}

const SortableListItem = ({ item, isSelected, onSelect }: SortableListItemProps) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`
                group flex items-center gap-3 p-3 rounded-lg border mb-2 cursor-pointer transition-all
                ${isSelected
                    ? 'bg-primary/5 border-primary shadow-sm'
                    : 'bg-card hover:bg-accent/50 hover:border-primary/30'
                }
            `}
            onClick={() => onSelect(item.id)}
        >
            <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground/50 hover:text-foreground p-1 rounded hover:bg-muted">
                <GripVertical className="h-4 w-4" />
            </div>
            <div className="flex-grow min-w-0">
                <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : ''}`}>
                    {item.label || '(Untitled)'}
                </p>
                <p className="text-xs text-muted-foreground truncate font-mono opacity-70">
                    {item.id}
                </p>
            </div>
            {isSelected && <ChevronRight className="h-4 w-4 text-primary animate-in slide-in-from-left-2" />}
        </div>
    );
};

export const RichItemEditor = ({ title, docId, initialItems }: RichItemEditorProps) => {
    const [items, setItems] = useState<ConfigurationItem[]>(initialItems);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Select first item by default if available
    useEffect(() => {
        if (!selectedId && items.length > 0) {
            setSelectedId(items[0].id);
        }
    }, [items, selectedId]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            setItems((items) => {
                const oldIndex = items.findIndex((i) => i.id === active.id);
                const newIndex = items.findIndex((i) => i.id === over?.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const handleAdd = () => {
        const newId = `new-${Math.random().toString(36).substr(2, 5)}`;
        const newItem = { id: newId, label: 'New Item', text: '<p>Content here...</p>' };
        setItems([...items, newItem]);
        setSelectedId(newId);
    };

    const handleRemove = (id: string) => {
        const newItems = items.filter(i => i.id !== id);
        setItems(newItems);
        if (selectedId === id) {
            setSelectedId(newItems.length > 0 ? newItems[0].id : null);
        }
    };

    const handleUpdate = (id: string, field: keyof ConfigurationItem, val: string) => {
        setItems(items.map(i => i.id === id ? { ...i, [field]: val } : i));
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await updateDoc(doc(db, 'configurations', docId), { items: items });
            toast.success(`${title} saved successfully!`);
        } catch (err) {
            console.error(err);
            toast.error("Failed to save.");
        } finally {
            setLoading(false);
        }
    };

    const selectedItem = items.find(i => i.id === selectedId);

    return (
        <div className="flex h-full gap-6">
            {/* Left Column: Master List */}
            <div className="w-1/3 min-w-[300px] flex flex-col gap-4">
                <Card className="flex flex-col h-full border-0 shadow-none bg-transparent">
                    <div className="flex items-center justify-between mb-4 px-1">
                        <div>
                            <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
                            <p className="text-sm text-muted-foreground">{items.length} templates</p>
                        </div>
                        <Button size="sm" onClick={handleSave} disabled={loading} className={loading ? "opacity-70" : ""}>
                            <Save className="w-4 h-4 mr-2" />
                            {loading ? "Saving..." : "Save"}
                        </Button>
                    </div>

                    <div className="flex-grow relative border rounded-xl bg-background/50 backdrop-blur-sm overflow-hidden flex flex-col">
                        <div className="flex-grow overflow-y-auto p-3">
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                                    {items.map((item) => (
                                        <SortableListItem
                                            key={item.id}
                                            item={item}
                                            isSelected={selectedId === item.id}
                                            onSelect={setSelectedId}
                                        />
                                    ))}
                                </SortableContext>
                            </DndContext>
                            <Button variant="outline" className="w-full mt-2 border-dashed h-12" onClick={handleAdd}>
                                <Plus className="h-4 w-4 mr-2" /> Add New Template
                            </Button>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Right Column: Detail Editor */}
            <div className="flex-grow flex flex-col h-full overflow-hidden">
                {selectedItem ? (
                    <Card className="h-full flex flex-col border-0 shadow-lg bg-card/80 backdrop-blur-xl">
                        <CardHeader className="pb-4 border-b">
                            <div className="flex justify-between items-start gap-4">
                                <div className="grid grid-cols-2 gap-4 flex-grow max-w-2xl">
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Label (Displayed in dropdown)</Label>
                                        <Input
                                            value={selectedItem.label}
                                            onChange={(e) => handleUpdate(selectedItem.id, 'label', e.target.value)}
                                            className="font-medium"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">ID (Unique identifier)</Label>
                                        <Input
                                            value={selectedItem.id}
                                            onChange={(e) => handleUpdate(selectedItem.id, 'id', e.target.value)}
                                            className="font-mono text-xs"
                                        />
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemove(selectedItem.id)}
                                    className="text-muted-foreground hover:text-destructive shrink-0"
                                >
                                    <Trash2 className="h-5 w-5" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-grow p-0 overflow-hidden bg-background/50">
                            <RichTextEditor
                                value={selectedItem.text}
                                onChange={(val) => handleUpdate(selectedItem.id, 'text', val)}
                                placeholder="Write your template content here..."
                                className="h-full border-0 rounded-none focus-within:ring-0"
                            />
                        </CardContent>
                    </Card>
                ) : (
                    <div className="h-full flex items-center justify-center border-2 border-dashed rounded-xl m-4 text-muted-foreground bg-muted/10">
                        <div className="text-center">
                            <p className="text-lg font-medium">No template selected</p>
                            <p className="text-sm">Select an item from the list to edit</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
