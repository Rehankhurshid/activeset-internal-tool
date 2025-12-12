'use client';

import { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '@/components/ui/button';
import { Check, RotateCcw, PenLine } from 'lucide-react';

interface SignatureSectionProps {
    clientName: string;
    existingSignature?: string;
    signedAt?: string;
    onSign: (signatureData: string) => Promise<void>;
    isPublic?: boolean;
}

export default function SignatureSection({
    clientName,
    existingSignature,
    signedAt,
    onSign,
    isPublic = false
}: SignatureSectionProps) {
    const sigCanvas = useRef<SignatureCanvas>(null);
    const [agreed, setAgreed] = useState(false);
    const [isSigning, setIsSigning] = useState(false);
    const [hasDrawn, setHasDrawn] = useState(false);

    const clearSignature = () => {
        sigCanvas.current?.clear();
        setHasDrawn(false);
    };

    const handleSign = async () => {
        if (!sigCanvas.current || !agreed || !hasDrawn) return;

        setIsSigning(true);
        try {
            const signatureData = sigCanvas.current.toDataURL('image/png');
            await onSign(signatureData);
        } catch (error) {
            console.error('Error signing:', error);
            alert('Failed to save signature. Please try again.');
        } finally {
            setIsSigning(false);
        }
    };

    // If already signed, show the signature
    if (existingSignature) {
        return (
            <div style={{
                padding: '32px 48px',
                backgroundColor: '#f0fdf4',
                borderTop: '2px solid #22c55e'
            }}>
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
                            Signed by {clientName} on {new Date(signedAt || '').toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </p>
                    </div>
                </div>

                <div style={{
                    backgroundColor: 'white',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid #bbf7d0',
                    display: 'inline-block'
                }}>
                    <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>Client Signature:</p>
                    <img
                        src={existingSignature}
                        alt="Client Signature"
                        style={{ maxHeight: '80px', maxWidth: '300px' }}
                    />
                </div>
            </div>
        );
    }

    // Only show signing UI in public view
    if (!isPublic) {
        return (
            <div style={{
                padding: '32px 48px',
                backgroundColor: '#fef3c7',
                borderTop: '2px solid #f59e0b'
            }}>
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

    // Signing UI for public view
    return (
        <div style={{
            padding: '32px 48px',
            backgroundColor: '#eff6ff',
            borderTop: '2px solid #3b82f6'
        }}>
            <h3 style={{
                fontSize: '24px',
                fontWeight: 700,
                color: '#1e40af',
                marginBottom: '8px'
            }}>
                Sign to Approve
            </h3>
            <p style={{ fontSize: '14px', color: '#3b82f6', marginBottom: '24px' }}>
                By signing below, you agree to the terms and conditions of this proposal.
            </p>

            {/* Signature Canvas */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{
                    backgroundColor: 'white',
                    border: '2px solid #cbd5e1',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    display: 'inline-block'
                }}>
                    <SignatureCanvas
                        ref={sigCanvas}
                        penColor="#1e293b"
                        canvasProps={{
                            width: 400,
                            height: 150,
                            style: { display: 'block' }
                        }}
                        onBegin={() => setHasDrawn(true)}
                    />
                </div>
                <div style={{ marginTop: '8px' }}>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={clearSignature}
                        className="text-gray-600"
                    >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Clear
                    </Button>
                </div>
            </div>

            {/* Agreement Checkbox */}
            <div style={{ marginBottom: '24px' }}>
                <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    cursor: 'pointer'
                }}>
                    <input
                        type="checkbox"
                        checked={agreed}
                        onChange={(e) => setAgreed(e.target.checked)}
                        style={{
                            width: '20px',
                            height: '20px',
                            marginTop: '2px',
                            accentColor: '#3b82f6'
                        }}
                    />
                    <span style={{ fontSize: '14px', color: '#374151', lineHeight: 1.5 }}>
                        I, <strong>{clientName}</strong>, agree to the terms and conditions outlined in this proposal
                        and authorize the work to proceed as described.
                    </span>
                </label>
            </div>

            {/* Sign Button */}
            <Button
                onClick={handleSign}
                disabled={!agreed || !hasDrawn || isSigning}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 h-auto text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isSigning ? (
                    'Signing...'
                ) : (
                    <>
                        <Check className="w-5 h-5 mr-2" />
                        Sign & Approve Proposal
                    </>
                )}
            </Button>

            {(!agreed || !hasDrawn) && (
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                    {!hasDrawn ? 'Please draw your signature above' : 'Please check the agreement box'} to continue.
                </p>
            )}
        </div>
    );
}
