import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, GripVertical } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SimpleListEditorProps {
    title: string;
    docId: string; // 'titles' or 'agencies'
    initialItems: string[];
}

interface SortableItemProps {
    id: string;
    text: string;
    onRemove: (id: string) => void;
    onUpdate: (id: string, newVal: string) => void;
}

const SortableItem = ({ id, text, onRemove, onUpdate }: SortableItemProps) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} className="flex gap-2 items-center mb-2 bg-white p-2 rounded border shadow-sm dark:bg-zinc-800">
            <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground">
                <GripVertical className="h-4 w-4" />
            </div>
            <Input
                value={text}
                onChange={(e) => onUpdate(id, e.target.value)}
                className="flex-grow border-none shadow-none focus-visible:ring-0 px-0 h-auto"
            />
            <Button variant="ghost" size="icon" onClick={() => onRemove(id)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
            </Button>
        </div>
    );
};


export const SimpleListEditor = ({ title, docId, initialItems }: SimpleListEditorProps) => {
    // We effectively treat the string itself as ID if unique, or use index.
    // Using index for sortable is tricky. Better to wrap them in objects?
    // But firestore expects string[].
    // Let's wrap in local state: { id: random, text: string }
    const [items, setItems] = useState(initialItems.map(text => ({ id: Math.random().toString(36).substr(2, 9), text })));
    const [loading, setLoading] = useState(false);

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
        setItems([...items, { id: Math.random().toString(), text: '' }]);
    };

    const handleRemove = (id: string) => {
        setItems(items.filter(i => i.id !== id));
    };

    const handleUpdate = (id: string, val: string) => {
        setItems(items.map(i => i.id === id ? { ...i, text: val } : i));
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const cleanItems = items.map(i => i.text).filter(t => t.trim() !== '');
            await updateDoc(doc(db, 'configurations', docId), { items: cleanItems });
            toast.success(`${title} saved successfully!`);
        } catch (err) {
            console.error(err);
            toast.error("Failed to save.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-medium">{title}</CardTitle>
                <Button size="sm" onClick={handleSave} disabled={loading}>
                    {loading ? "Saving..." : "Save Changes"}
                </Button>
            </CardHeader>
            <CardContent className="flex-grow overflow-hidden flex flex-col">
                <div className="overflow-y-auto flex-grow pr-2">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={items} strategy={verticalListSortingStrategy}>
                            {items.map((item) => (
                                <SortableItem
                                    key={item.id}
                                    id={item.id}
                                    text={item.text}
                                    onRemove={handleRemove}
                                    onUpdate={handleUpdate}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                    <Button variant="outline" className="w-full mt-2 border-dashed" onClick={handleAdd}>
                        <Plus className="h-4 w-4 mr-2" /> Add Item
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};
