'use client';

import { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, Eraser } from 'lucide-react';
import { useConfigurations } from '@/hooks/useConfigurations';
import '@fontsource/dancing-script';
import '@fontsource/great-vibes';
import '@fontsource/allura';
import '@fontsource/parisienne';
import '@fontsource/sacramento';

const SIGNATURE_FONTS = ['Dancing Script', 'Great Vibes', 'Allura', 'Parisienne', 'Sacramento'];

interface AgencySignatureDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    agencyName: string;
    hasExistingSignature?: boolean;
    onSave: (signatureData: string) => Promise<void>;
}

function textToImage(text: string, font: string): string | null {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.font = `60px "${font}", cursive`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    return canvas.toDataURL('image/png');
}

export default function AgencySignatureDialog({
    open,
    onOpenChange,
    agencyName,
    hasExistingSignature = false,
    onSave,
}: AgencySignatureDialogProps) {
    const configs = useConfigurations();
    const savedSignatures = configs.agencies.filter(a => a.signatureData);

    const sigCanvas = useRef<SignatureCanvas>(null);
    const [activeTab, setActiveTab] = useState<'draw' | 'type' | 'saved'>('draw');
    const [typedSignature, setTypedSignature] = useState(agencyName || '');
    const [selectedFont, setSelectedFont] = useState(SIGNATURE_FONTS[0]);
    const [selectedSaved, setSelectedSaved] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const resolveSignatureData = (): string | null => {
        if (activeTab === 'draw') {
            if (sigCanvas.current?.isEmpty()) {
                alert('Please draw your signature before saving.');
                return null;
            }
            return sigCanvas.current?.toDataURL() || null;
        }
        if (activeTab === 'type') {
            if (!typedSignature.trim()) {
                alert('Please type your name before saving.');
                return null;
            }
            return textToImage(typedSignature, selectedFont);
        }
        // saved
        if (!selectedSaved) {
            alert('Please select a saved signature.');
            return null;
        }
        return selectedSaved;
    };

    const handleSave = async () => {
        const signatureData = resolveSignatureData();
        if (!signatureData) return;

        setIsSubmitting(true);
        try {
            await onSave(signatureData);
            onOpenChange(false);
        } catch (error) {
            console.error('Failed to save agency signature:', error);
            alert('Failed to save signature. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>
                        {hasExistingSignature ? 'Change your signature' : 'Add your signature'}
                    </DialogTitle>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'draw' | 'type' | 'saved')} className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="draw">Draw</TabsTrigger>
                        <TabsTrigger value="type">Type</TabsTrigger>
                        <TabsTrigger value="saved">Use saved</TabsTrigger>
                    </TabsList>

                    <TabsContent value="draw" className="mt-4">
                        <div className="border rounded-md bg-white overflow-hidden relative" style={{ height: '200px' }}>
                            <SignatureCanvas
                                ref={sigCanvas}
                                canvasProps={{
                                    className: 'signature-canvas w-full h-full',
                                    width: 560,
                                    height: 200,
                                }}
                            />
                            <Button
                                variant="ghost"
                                size="sm"
                                type="button"
                                className="absolute bottom-2 right-2 text-xs text-slate-500"
                                onClick={() => sigCanvas.current?.clear()}
                            >
                                <Eraser className="w-3 h-3 mr-1" />
                                Clear
                            </Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="type" className="mt-4 space-y-4">
                        <div className="space-y-1.5">
                            <Label>Type your name</Label>
                            <Input
                                placeholder="Your name"
                                value={typedSignature}
                                onChange={(e) => setTypedSignature(e.target.value)}
                                className="text-black bg-white border-slate-300"
                            />
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {SIGNATURE_FONTS.map((font) => (
                                <Button
                                    key={font}
                                    type="button"
                                    variant={selectedFont === font ? 'default' : 'outline'}
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
                            <span style={{ fontFamily: selectedFont, fontSize: '48px' }} className="text-black">
                                {typedSignature || 'Preview'}
                            </span>
                        </div>
                    </TabsContent>

                    <TabsContent value="saved" className="mt-4">
                        {savedSignatures.length === 0 ? (
                            <div className="text-sm text-muted-foreground border rounded-lg p-6 text-center">
                                No saved signatures found. Add one under{' '}
                                <span className="font-medium">Settings → Agency Representatives</span>, or use the Draw / Type tabs.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[280px] overflow-y-auto">
                                {savedSignatures.map((agency) => (
                                    <button
                                        key={agency.id}
                                        type="button"
                                        onClick={() => setSelectedSaved(agency.signatureData!)}
                                        className={`border rounded-lg p-3 bg-white text-left transition-all ${
                                            selectedSaved === agency.signatureData
                                                ? 'border-blue-500 ring-2 ring-blue-200'
                                                : 'border-slate-200 hover:border-blue-300'
                                        }`}
                                    >
                                        <div className="h-16 flex items-center justify-center mb-2">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={agency.signatureData}
                                                alt={`${agency.name} signature`}
                                                className="max-h-16 max-w-full object-contain"
                                            />
                                        </div>
                                        <p className="text-sm font-medium text-slate-900 truncate">{agency.name}</p>
                                        {agency.email && (
                                            <p className="text-xs text-slate-500 truncate">{agency.email}</p>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>

                <DialogFooter>
                    <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={handleSave} disabled={isSubmitting}>
                        {isSubmitting ? (
                            <span className="flex items-center gap-2">
                                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                Saving...
                            </span>
                        ) : (
                            <>
                                <Check className="w-4 h-4 mr-2" />
                                Save signature
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
