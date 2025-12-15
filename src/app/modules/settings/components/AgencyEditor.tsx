import { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, GripVertical, PenTool } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SignatureCanvas from 'react-signature-canvas';
import { AgencyProfile } from '@/hooks/useConfigurations';

// Fonts for signature
import "@fontsource/dancing-script";
import "@fontsource/great-vibes";
import "@fontsource/allura";
import "@fontsource/parisienne";
import "@fontsource/sacramento";

interface AgencyEditorProps {
    initialItems: AgencyProfile[];
}

interface SortableAgencyItemProps {
    item: AgencyProfile;
    onRemove: (id: string) => void;
    onUpdate: (id: string, field: keyof AgencyProfile, val: string) => void;
    onUpdateSignature: (id: string, dataUrl: string) => void;
}

const SortableAgencyItem = ({ item, onRemove, onUpdate, onUpdateSignature }: SortableAgencyItemProps) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
    const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);

    // Signature Capture State
    const [activeTab, setActiveTab] = useState<'draw' | 'type'>('draw');
    const [typedSignature, setTypedSignature] = useState(item.name || '');
    const [selectedFont, setSelectedFont] = useState('Dancing Script');
    const sigCanvas = useRef<SignatureCanvas>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const convertTextToImage = (text: string, font: string) => {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.fillStyle = '#ffffff'; // White background
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.font = `60px "${font}", cursive`;
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        return canvas.toDataURL('image/png');
    };

    const handleSaveSignature = () => {
        let signatureData = '';
        if (activeTab === 'draw') {
            if (sigCanvas.current?.isEmpty()) {
                alert("Please sign before saving");
                return;
            }
            signatureData = sigCanvas.current?.toDataURL() || '';
        } else {
            if (!typedSignature.trim()) {
                alert("Please type a name");
                return;
            }
            const dataUrl = convertTextToImage(typedSignature, selectedFont);
            if (dataUrl) signatureData = dataUrl;
        }

        if (signatureData) {
            onUpdateSignature(item.id, signatureData);
            setSignatureDialogOpen(false);
        }
    };

    return (
        <div ref={setNodeRef} style={style} className="flex flex-col gap-4 p-4 mb-4 bg-white rounded border shadow-sm dark:bg-zinc-800">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground">
                        <GripVertical className="h-4 w-4" />
                    </div>
                    <span className="font-semibold text-sm">Agency Representative</span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => onRemove(item.id)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                        value={item.name}
                        onChange={(e) => onUpdate(item.id, 'name', e.target.value)}
                        placeholder="Representative Name"
                    />
                </div>
                <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                        value={item.email}
                        onChange={(e) => onUpdate(item.id, 'email', e.target.value)}
                        placeholder="email@agency.com"
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label>Signature</Label>
                <div className="flex items-center gap-4">
                    <div className="h-20 w-48 border border-dashed rounded flex items-center justify-center bg-muted/20 overflow-hidden">
                        {item.signatureData ? (
                            <img src={item.signatureData} alt="Signature" className="max-h-full max-w-full object-contain" />
                        ) : (
                            <span className="text-xs text-muted-foreground">No signature set</span>
                        )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setSignatureDialogOpen(true)}>
                        <PenTool className="w-4 h-4 mr-2" />
                        {item.signatureData ? 'Update Signature' : 'Set Signature'}
                    </Button>
                </div>
            </div>

            {/* Signature Dialog */}
            <Dialog open={signatureDialogOpen} onOpenChange={setSignatureDialogOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Create Signature</DialogTitle>
                    </DialogHeader>

                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'draw' | 'type')} className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="draw">Draw</TabsTrigger>
                            <TabsTrigger value="type">Type</TabsTrigger>
                        </TabsList>

                        <TabsContent value="draw" className="mt-4">
                            <div className="border rounded-md bg-white overflow-hidden relative" style={{ height: '200px' }} ref={containerRef}>
                                <SignatureCanvas
                                    ref={sigCanvas}
                                    canvasProps={{
                                        className: 'signature-canvas w-full h-full',
                                        width: 500, // Fixed fallback, but should ideally be responsive handled by CSS/Layout
                                        height: 200
                                    }}
                                />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="absolute bottom-2 right-2 text-xs"
                                    onClick={() => sigCanvas.current?.clear()}
                                >
                                    Clear
                                </Button>
                            </div>
                        </TabsContent>

                        <TabsContent value="type" className="mt-4 space-y-4">
                            <div>
                                <Label className="text-slate-700">Type Name</Label>
                                <Input
                                    placeholder="Your Name"
                                    value={typedSignature}
                                    onChange={(e) => setTypedSignature(e.target.value)}
                                    className="mt-1.5 text-black bg-white border-slate-300"
                                />
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {['Dancing Script', 'Great Vibes', 'Allura', 'Parisienne', 'Sacramento'].map((font) => (
                                    <Button
                                        key={font}
                                        variant={selectedFont === font ? "default" : "outline"}
                                        className="h-auto py-2 px-1 flex flex-col gap-1 overflow-hidden"
                                        onClick={() => setSelectedFont(font)}
                                    >
                                        <span className="text-[10px] opacity-70 truncate w-full">{font}</span>
                                        <span
                                            style={{ fontFamily: font }}
                                            className="text-lg truncate w-full block text-center"
                                        >
                                            {typedSignature || 'Sign'}
                                        </span>
                                    </Button>
                                ))}
                            </div>

                            <div className="p-4 bg-white border rounded-lg flex items-center justify-center h-[120px] overflow-hidden">
                                <span style={{ fontFamily: selectedFont, fontSize: '48px' }}>
                                    {typedSignature || 'Preview'}
                                </span>
                            </div>
                        </TabsContent>
                    </Tabs>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSignatureDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveSignature}>Save Signature</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export const AgencyEditor = ({ initialItems }: AgencyEditorProps) => {
    // Ensure initialItems are mapped correctly to objects if not already (though migration logic already does this in hook)
    const [items, setItems] = useState<AgencyProfile[]>(initialItems);
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
        setItems([...items, { id: Math.random().toString(36).substr(2, 9), name: '', email: '', signatureData: '' }]);
    };

    const handleRemove = (id: string) => {
        setItems(items.filter(i => i.id !== id));
    };

    const handleUpdate = (id: string, field: keyof AgencyProfile, val: string) => {
        setItems(items.map(i => i.id === id ? { ...i, [field]: val } : i));
    };

    const handleUpdateSignature = (id: string, dataUrl: string) => {
        setItems(items.map(i => i.id === id ? { ...i, signatureData: dataUrl } : i));
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await updateDoc(doc(db, 'configurations', 'agencies'), { items: items });
            toast.success("Agency profiles saved successfully!");
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
                <CardTitle className="text-lg font-medium">Agency Representatives</CardTitle>
                <Button size="sm" onClick={handleSave} disabled={loading}>
                    {loading ? "Saving..." : "Save Changes"}
                </Button>
            </CardHeader>
            <CardContent className="flex-grow overflow-hidden flex flex-col">
                <div className="overflow-y-auto flex-grow pr-2">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={items} strategy={verticalListSortingStrategy}>
                            {items.map((item) => (
                                <SortableAgencyItem
                                    key={item.id}
                                    item={item}
                                    onRemove={handleRemove}
                                    onUpdate={handleUpdate}
                                    onUpdateSignature={handleUpdateSignature}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                    <Button variant="outline" className="w-full mt-2 border-dashed" onClick={handleAdd}>
                        <Plus className="h-4 w-4 mr-2" /> Add Agency Representative
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};
