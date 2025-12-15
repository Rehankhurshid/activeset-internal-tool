'use client';

import { useRef, useState, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '@/components/ui/button';
import { Check, PenLine, Keyboard, Eraser } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import '@fontsource/dancing-script';
import '@fontsource/great-vibes';
import '@fontsource/allura';
import '@fontsource/parisienne';
import '@fontsource/sacramento';

interface SignatureSectionProps {
    clientName: string;
    existingSignature?: string;
    signedDocUrl?: string; // New prop for signed PDF link
    signedAt?: string;
    isPublic?: boolean;

    // DocuSeal Props
    onSign?: (signatureData: string) => Promise<void>;
}

const SIGNATURE_FONTS = [
    { name: 'Dancing Script', value: '"Dancing Script", cursive' },
    { name: 'Great Vibes', value: '"Great Vibes", cursive' },
    { name: 'Allura', value: '"Allura", cursive' },
    { name: 'Parisienne', value: '"Parisienne", cursive' },
    { name: 'Sacramento', value: '"Sacramento", cursive' },
];

export default function SignatureSection({
    clientName,
    existingSignature,
    signedDocUrl,
    signedAt,
    isPublic = false,
    onSign
}: SignatureSectionProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const defaultSign = useRef<SignatureCanvas>(null);
    const [canvasSize, setCanvasSize] = useState({ width: 500, height: 200 });
    const [activeTab, setActiveTab] = useState('draw');
    const [typedSignature, setTypedSignature] = useState(clientName || '');
    const [selectedFont, setSelectedFont] = useState(SIGNATURE_FONTS[0].value);
    const [isSigned, setIsSigned] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Handle Resize for Responsive Canvas
    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                const width = containerRef.current.offsetWidth;
                // Maintain aspect ratio or fixed height? 
                // Let's keep height fixed at 200px or adjust slightly if very small screen
                setCanvasSize({ width, height: 200 });
            }
        };

        window.addEventListener('resize', updateSize);
        updateSize(); // Initial call

        // Use a small timeout to ensure container is rendered and has width
        const timer = setTimeout(updateSize, 100);

        return () => {
            window.removeEventListener('resize', updateSize);
            clearTimeout(timer);
        };
    }, []);

    // Update isSigned based on active tab state
    useEffect(() => {
        if (activeTab === 'type') {
            setIsSigned(typedSignature.trim().length > 0);
        }
        // For draw, it's handled by onEnd callback
    }, [activeTab, typedSignature]);

    const handleClear = () => {
        if (activeTab === 'draw') {
            defaultSign.current?.clear();
            setIsSigned(false);
        } else {
            setTypedSignature('');
            setIsSigned(false);
        }
    };

    const convertTextToImage = (text: string, font: string) => {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // Background - Transparent or White? 
        // SignatureCanvas defaults to transparent, but usually we want signature on white or transparent.
        // Let's use transparent for consistency with draw
        // ctx.fillStyle = '#ffffff';
        // ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Text
        ctx.font = `60px ${font}`;
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        return canvas.toDataURL('image/png');
    };

    const handleSave = async () => {
        setIsSubmitting(true);
        try {
            let signatureData = '';

            if (activeTab === 'draw') {
                if (defaultSign.current?.isEmpty()) {
                    alert('Please sign before saving');
                    setIsSubmitting(false);
                    return;
                }
                signatureData = defaultSign.current?.toDataURL() || '';
            } else {
                if (!typedSignature.trim()) {
                    alert('Please type your name');
                    setIsSubmitting(false);
                    return;
                }
                const dataUrl = convertTextToImage(typedSignature, selectedFont);
                if (dataUrl) signatureData = dataUrl;
            }

            if (onSign && signatureData) {
                await onSign(signatureData);
            }
        } catch (error) {
            console.error(error);
            alert('Failed to save signature');
        } finally {
            setIsSubmitting(false);
        }
    };

    // If already signed, show the signature or document link
    if (signedAt && (existingSignature || signedDocUrl)) {
        return (
            <div id="signature-section" style={{
                padding: '32px 48px',
                backgroundColor: '#f0fdf4',
                borderTop: '2px solid #22c55e'
            }} className="md:p-12 p-6">
                {/* Added responsive padding class as inline styles override basic classes unless !important */}
                {/* We'll stick to style prop for main layout but add classes for responsiveness where style prop might correspond to desktop */}

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: '#22c55e',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <Check style={{ width: '18px', height: '18px', color: 'white' }} />
                    </div>
                    <div>
                        <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#166534', margin: 0 }}>
                            Proposal Approved
                        </h3>
                        <p style={{ fontSize: '14px', color: '#15803d', margin: 0 }}>
                            Signed by {clientName} on {new Date(signedAt).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </p>
                    </div>
                </div>

                {existingSignature && (
                    <div style={{
                        backgroundColor: 'white',
                        padding: '16px',
                        borderRadius: '8px',
                        border: '1px solid #bbf7d0',
                        display: 'inline-block',
                        marginBottom: signedDocUrl ? '16px' : '0'
                    }}>
                        <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>Client Signature:</p>
                        <img
                            src={existingSignature}
                            alt="Client Signature"
                            style={{ maxHeight: '80px', maxWidth: '300px' }}
                        />
                    </div>
                )}
            </div>
        );
    }

    // Only show signing UI in public view
    if (!isPublic) {
        return (
            <div id="signature-section" style={{
                padding: '32px 48px',
                backgroundColor: '#fef3c7',
                borderTop: '2px solid #f59e0b'
            }} className="md:p-12 p-6">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <PenLine style={{ width: '24px', height: '24px', color: '#d97706' }} />
                    <div>
                        <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#92400e', margin: 0 }}>
                            Awaiting Client Signature
                        </h3>
                        <p style={{ fontSize: '14px', color: '#a16207', margin: 0 }}>
                            Share this proposal with {clientName} to get their approval.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div id="signature-section" className="bg-blue-50 border-t-2 border-blue-500 md:p-12 p-6 scroll-mt-24">
            <h3 className="text-2xl font-bold text-blue-900 mb-2">
                Sign to Approve
            </h3>
            <p className="text-sm text-blue-600 mb-6">
                Please review the proposal above. When you are ready, choose your preferred signing method below.
            </p>

            <Tabs defaultValue="draw" className="w-full" onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="draw" className="flex items-center gap-2">
                        <PenLine className="w-4 h-4" />
                        Draw Signature
                    </TabsTrigger>
                    <TabsTrigger value="type" className="flex items-center gap-2">
                        <Keyboard className="w-4 h-4" />
                        Type Signature
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="draw" className="mt-0">
                    <div
                        ref={containerRef}
                        className="border border-slate-300 rounded-lg bg-white overflow-hidden mb-4 relative shadow-sm"
                        style={{ height: '200px' }}
                    >
                        <SignatureCanvas
                            ref={defaultSign}
                            canvasProps={{
                                width: canvasSize.width,
                                height: canvasSize.height,
                                className: 'signature-canvas',
                                style: { width: '100%', height: '100%' }
                            }}
                            onEnd={() => setIsSigned(true)}
                        />
                        <div className="absolute bottom-2 right-2 text-xs text-slate-400 pointer-events-none">
                            Draw above
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="type" className="mt-0">
                    <div className="space-y-4 mb-4">
                        <div className="space-y-2">
                            <Label htmlFor="signature-name" className="text-slate-700">Type your full name</Label>
                            <Input
                                id="signature-name"
                                placeholder="John Doe"
                                value={typedSignature}
                                onChange={(e) => setTypedSignature(e.target.value)}
                                className="h-11 text-lg bg-white border-slate-300 text-black placeholders:text-slate-400"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-slate-700">Select Style</Label>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {SIGNATURE_FONTS.map(font => (
                                    <button
                                        key={font.name}
                                        onClick={() => setSelectedFont(font.value)}
                                        className={`p-3 border rounded-md text-center transition-all ${selectedFont === font.value
                                                ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                                                : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50 text-slate-700'
                                            }`}
                                    >
                                        <div className="text-xl overflow-hidden text-ellipsis whitespace-nowrap" style={{ fontFamily: font.value }}>
                                            {typedSignature || 'Signature'}
                                        </div>
                                        <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">{font.name}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="border border-slate-300 rounded-lg bg-white h-[120px] flex items-center justify-center overflow-hidden shadow-sm relative mt-4">
                            {typedSignature ? (
                                <div
                                    className="text-4xl sm:text-5xl text-center px-4 break-all text-black"
                                    style={{ fontFamily: selectedFont }}
                                >
                                    {typedSignature}
                                </div>
                            ) : (
                                <span className="text-slate-300 italic">Preview will appear here</span>
                            )}
                        </div>
                    </div>
                </TabsContent>

                <div className="flex gap-3 mt-6">
                    <Button
                        onClick={handleClear}
                        variant="outline"
                        className="flex-1 border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                    >
                        <Eraser className="w-4 h-4 mr-2" />
                        Clear
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!isSigned || isSubmitting}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg transition-all"
                    >
                        {isSubmitting ? (
                            <span className="flex items-center gap-2">
                                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                                Signing...
                            </span>
                        ) : (
                            <>
                                <Check className="w-4 h-4 mr-2" />
                                Approve Proposal
                            </>
                        )}
                    </Button>
                </div>
            </Tabs>
        </div>
    );
}
