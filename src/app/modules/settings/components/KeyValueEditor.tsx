import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Trash2, Plus, ChevronRight, Save } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import RichTextEditor from "../../proposal/components/RichTextEditor";

interface KeyValueEditorProps {
    title: string;
    docId: string; // 'services'
    initialItems: { [key: string]: string };
}

interface ListItemProps {
    item: { key: string; value: string; tempId: number };
    isSelected: boolean;
    onSelect: (tempId: number) => void;
}

const ListItem = ({ item, isSelected, onSelect }: ListItemProps) => {
    return (
        <div
            className={`
                group flex items-center gap-3 p-3 rounded-lg border mb-2 cursor-pointer transition-all
                ${isSelected
                    ? 'bg-primary/5 border-primary shadow-sm'
                    : 'bg-card hover:bg-accent/50 hover:border-primary/30'
                }
            `}
            onClick={() => onSelect(item.tempId)}
        >
            <div className="flex-grow min-w-0">
                <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : ''}`}>
                    {item.key || '(New Key)'}
                </p>
                <p className="text-xs text-muted-foreground truncate opacity-70">
                    {item.value ? item.value.replace(/<[^>]*>/g, '').substring(0, 30) + '...' : '(No content)'}
                </p>
            </div>
            {isSelected && <ChevronRight className="h-4 w-4 text-primary animate-in slide-in-from-left-2" />}
        </div>
    );
};

export const KeyValueEditor = ({ title, docId, initialItems }: KeyValueEditorProps) => {
    // Convert object to array for editing
    const [items, setItems] = useState(Object.entries(initialItems).map(([key, value]) => ({ key, value, tempId: Math.random() })));
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);

    // Select first item by default
    useEffect(() => {
        if (!selectedId && items.length > 0) {
            setSelectedId(items[0].tempId);
        }
    }, [items, selectedId]);

    const handleAdd = () => {
        const newId = Math.random();
        const newItem = { key: '', value: '', tempId: newId };
        setItems([...items, newItem]);
        setSelectedId(newId);
    };

    const handleRemove = (tempId: number) => {
        const newItems = items.filter(i => i.tempId !== tempId);
        setItems(newItems);
        if (selectedId === tempId) {
            setSelectedId(newItems.length > 0 ? newItems[0].tempId : null);
        }
    };

    const handleUpdate = (tempId: number, field: 'key' | 'value', val: string) => {
        setItems(items.map(i => i.tempId === tempId ? { ...i, [field]: val } : i));
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const data: { [key: string]: string } = {};
            let hasError = false;
            items.forEach(i => {
                if (!i.key.trim()) return;
                if (data[i.key]) {
                    toast.error(`Duplicate key: ${i.key}`);
                    hasError = true;
                }
                data[i.key] = i.value;
            });

            if (hasError) return;

            await updateDoc(doc(db, 'configurations', docId), { items: data });
            toast.success(`${title} saved successfully!`);
        } catch (err) {
            console.error(err);
            toast.error("Failed to save.");
        } finally {
            setLoading(false);
        }
    };

    const selectedItem = items.find(i => i.tempId === selectedId);

    return (
        <div className="flex h-full gap-6">
            {/* Left Column: Master List */}
            <div className="w-1/3 min-w-[300px] flex flex-col gap-4">
                <Card className="flex flex-col h-full border-0 shadow-none bg-transparent">
                    <div className="flex items-center justify-between mb-4 px-1">
                        <div>
                            <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
                            <p className="text-sm text-muted-foreground">{items.length} items</p>
                        </div>
                        <Button size="sm" onClick={handleSave} disabled={loading} className={loading ? "opacity-70" : ""}>
                            <Save className="w-4 h-4 mr-2" />
                            {loading ? "Saving..." : "Save"}
                        </Button>
                    </div>

                    <div className="flex-grow relative border rounded-xl bg-background/50 backdrop-blur-sm overflow-hidden flex flex-col">
                        <div className="flex-grow overflow-y-auto p-3">
                            {items.map((item) => (
                                <ListItem
                                    key={item.tempId}
                                    item={item}
                                    isSelected={selectedId === item.tempId}
                                    onSelect={setSelectedId}
                                />
                            ))}
                            <Button variant="outline" className="w-full mt-2 border-dashed h-12" onClick={handleAdd}>
                                <Plus className="h-4 w-4 mr-2" /> Add New Item
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
                                <div className="flex-grow max-w-lg space-y-1">
                                    <Label className="text-xs text-muted-foreground">Key (Must be unique)</Label>
                                    <Input
                                        placeholder="e.g., 'webflow-dev'"
                                        value={selectedItem.key}
                                        onChange={(e) => handleUpdate(selectedItem.tempId, 'key', e.target.value)}
                                        className="font-mono text-sm"
                                    />
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemove(selectedItem.tempId)}
                                    className="text-muted-foreground hover:text-destructive shrink-0"
                                >
                                    <Trash2 className="h-5 w-5" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-grow p-0 overflow-hidden bg-background/50">
                            <RichTextEditor
                                value={selectedItem.value}
                                onChange={(val) => handleUpdate(selectedItem.tempId, 'value', val)}
                                placeholder="Service description or value..."
                                className="h-full border-0 rounded-none focus-within:ring-0"
                                simple={true}
                            />
                        </CardContent>
                    </Card>
                ) : (
                    <div className="h-full flex items-center justify-center border-2 border-dashed rounded-xl m-4 text-muted-foreground bg-muted/10">
                        <div className="text-center">
                            <p className="text-lg font-medium">No item selected</p>
                            <p className="text-sm">Select an item from the list to edit</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
