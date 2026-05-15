'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import {
    ArrowLeft,
    Share2,
    Mail,
    FileDown,
    PenLine,
    CheckCircle2,
    Clock,
    ScrollText,
} from 'lucide-react';
import { Proposal, ContractData } from '../types/Proposal';
import { proposalService } from '../services/ProposalService';
import { downloadProposalPDF } from '../utils/pdfGenerator';
import { formatContractDate, formatMoney, computeLockInEnd } from '../lib/contractTemplate';
import { toast } from 'sonner';

const SignatureSection = dynamic(() => import('./SignatureSection'), { ssr: false });
const AgencySignatureDialog = dynamic(() => import('./AgencySignatureDialog'), { ssr: false });

interface ContractViewerProps {
    proposal: Proposal;
    onBack?: () => void;
    isPublic?: boolean;
}

function formatSignedDate(iso?: string): string {
    if (!iso) return '____________';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

export default function ContractViewer({
    proposal,
    onBack = () => {},
    isPublic = false,
}: ContractViewerProps) {
    const [currentProposal, setCurrentProposal] = useState<Proposal>(proposal);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showAgencySignDialog, setShowAgencySignDialog] = useState(false);

    const contract = currentProposal.data.contract as ContractData | undefined;

    if (!contract) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="text-center max-w-md">
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">
                        Contract data missing
                    </h1>
                    <p className="text-gray-600">
                        This record is marked as a contract but has no contract content.
                    </p>
                </div>
            </div>
        );
    }

    const sig = currentProposal.data.signatures;
    const clientSigned = !!sig.client.signedAt;
    const agencySigned = !!sig.agency.signatureData;
    const fullyExecuted = clientSigned && agencySigned;
    const lockInEnd = computeLockInEnd(contract.effectiveDate, contract.lockInMonths);

    const shareUrl =
        typeof window !== 'undefined'
            ? `${window.location.origin}/view/${currentProposal.id}`
            : '';

    const handleShare = () => {
        navigator.clipboard.writeText(shareUrl).then(
            () => toast.success('Share link copied to clipboard'),
            () => toast.info(shareUrl)
        );
    };

    const handleEmail = () => {
        const subject = encodeURIComponent(
            `${currentProposal.title} — for signature`
        );
        const body = encodeURIComponent(
            `Hi ${contract.client.signatoryName || contract.client.legalName},\n\n` +
                `Please review and sign the retainer agreement at the link below:\n${shareUrl}\n\n` +
                `Best regards,\n${contract.agency.signatoryName || currentProposal.agencyName}`
        );
        window.open(
            `mailto:${contract.client.email}?subject=${subject}&body=${body}`,
            '_self'
        );
    };

    const handleDownloadPDF = async () => {
        if (isDownloading) return;
        setIsDownloading(true);
        const toastId = toast.loading('Generating contract PDF…', {
            description: 'Matching layout — about 20 seconds.',
        });
        try {
            const filename = `contract-${(contract.client.legalName || currentProposal.clientName || 'client')
                .replace(/\s+/g, '-')
                .toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`;
            await downloadProposalPDF(currentProposal.id, filename);
            toast.success('Downloaded', { id: toastId, description: filename });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Failed to download PDF.';
            toast.error('PDF download failed', { id: toastId, description: message });
        } finally {
            setIsDownloading(false);
        }
    };

    const statusBanner = (() => {
        if (fullyExecuted) {
            return {
                cls: 'bg-green-50 border-green-500 text-green-800',
                icon: <CheckCircle2 className="w-5 h-5 text-green-600" />,
                title: 'Fully executed',
                sub: `Signed by both parties. This agreement is in force.`,
            };
        }
        if (clientSigned) {
            return {
                cls: 'bg-blue-50 border-blue-500 text-blue-800',
                icon: <Clock className="w-5 h-5 text-blue-600" />,
                title: 'Awaiting agency counter-signature',
                sub: `${contract.client.signatoryName || 'The client'} has signed. Pending agency signature.`,
            };
        }
        if (agencySigned) {
            return {
                cls: 'bg-amber-50 border-amber-500 text-amber-900',
                icon: <Clock className="w-5 h-5 text-amber-600" />,
                title: 'Awaiting client signature',
                sub: `Signed by the agency. Share this contract with ${contract.client.signatoryName || 'the client'} to execute it.`,
            };
        }
        return {
            cls: 'bg-gray-50 border-gray-400 text-gray-700',
            icon: <ScrollText className="w-5 h-5 text-gray-500" />,
            title: 'Draft — not yet signed',
            sub: 'Awaiting signatures from both parties.',
        };
    })();

    return (
        <div className="min-h-screen bg-gray-200 print:bg-white">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-[#1A1A1A] border-b border-[#333] px-6 py-4 text-white shadow-md no-print">
                <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                        {!isPublic && (
                            <Button
                                onClick={onBack}
                                className="flex items-center gap-2 bg-[#333] hover:bg-[#444] text-white border-none h-9 px-4"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back
                            </Button>
                        )}
                        <div className="min-w-0">
                            <h1 className="text-lg font-semibold text-white leading-tight truncate">
                                {currentProposal.title}
                            </h1>
                            <p className="text-xs text-gray-400 truncate">
                                {contract.client.legalName || currentProposal.clientName}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {!isPublic && (
                            <>
                                <Button
                                    onClick={handleShare}
                                    className="flex items-center gap-2 bg-[#333] hover:bg-[#444] text-white border-none h-9 px-4"
                                >
                                    <Share2 className="w-4 h-4" />
                                    <span className="hidden sm:inline">Share</span>
                                </Button>
                                <Button
                                    onClick={handleEmail}
                                    className="flex items-center gap-2 bg-[#333] hover:bg-[#444] text-white border-none h-9 px-4"
                                >
                                    <Mail className="w-4 h-4" />
                                    <span className="hidden sm:inline">Email</span>
                                </Button>
                            </>
                        )}
                        <Button
                            onClick={handleDownloadPDF}
                            disabled={isDownloading}
                            className="flex items-center gap-2 bg-[#333] hover:bg-[#444] text-white border-none h-9 px-4"
                        >
                            <FileDown
                                className={`w-4 h-4 ${isDownloading ? 'animate-bounce' : ''}`}
                            />
                            {isDownloading ? 'Generating...' : 'Download'}
                        </Button>
                        {isPublic && !clientSigned && (
                            <Button
                                onClick={() =>
                                    document
                                        .getElementById('signature-section')
                                        ?.scrollIntoView({ behavior: 'smooth' })
                                }
                                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white border-none h-9 px-4 shadow-sm animate-pulse"
                            >
                                <PenLine className="w-4 h-4" />
                                Sign Contract
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            <style
                dangerouslySetInnerHTML={{
                    __html: `
            .contract-body { font-family: Georgia, 'Times New Roman', serif; }
            .contract-clause ul { list-style: disc; padding-left: 1.5rem; margin: 0.5rem 0; }
            .contract-clause ol { list-style: decimal; padding-left: 1.5rem; margin: 0.5rem 0; }
            .contract-clause li { margin-bottom: 0.4rem; line-height: 1.7; }
            .contract-clause p { margin-bottom: 0.6rem; line-height: 1.75; }
            @media print {
              html, body { background: #fff !important; }
              .no-print { display: none !important; }
              .contract-clause, .contract-sig-block { page-break-inside: avoid; }
            }
          `,
                }}
            />

            {/* Document */}
            <div className="p-4 sm:p-6 flex justify-center min-h-[calc(100vh-80px)] print:p-0">
                <div className="w-full max-w-4xl">
                    <div
                        id="proposal-container"
                        className="contract-body bg-white shadow-xl print:shadow-none px-6 py-8 sm:px-12 sm:py-14 text-[15px] text-gray-800"
                    >
                        {/* Title */}
                        <h1 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-2">
                            {currentProposal.title}
                        </h1>
                        <p className="text-center text-sm text-gray-500 mb-8">
                            Effective {formatContractDate(contract.effectiveDate)}
                        </p>

                        {/* Status banner */}
                        <div
                            className={`no-print flex items-start gap-3 rounded-lg border-l-4 px-4 py-3 mb-8 ${statusBanner.cls}`}
                        >
                            {statusBanner.icon}
                            <div>
                                <p className="font-semibold text-sm">
                                    {statusBanner.title}
                                </p>
                                <p className="text-xs opacity-80">{statusBanner.sub}</p>
                            </div>
                        </div>

                        {/* Prepared for */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8 pb-6 border-b border-gray-200">
                            <div>
                                <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">
                                    Prepared for
                                </p>
                                <p className="font-semibold text-gray-900">
                                    {contract.client.legalName || '________________'}
                                </p>
                                <p className="text-sm text-gray-600 whitespace-pre-line">
                                    {contract.client.address}
                                </p>
                                {contract.client.email && (
                                    <p className="text-sm text-gray-600 mt-1">
                                        {contract.client.email}
                                    </p>
                                )}
                            </div>
                            <div>
                                <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">
                                    Prepared by
                                </p>
                                <p className="font-semibold text-gray-900">
                                    {contract.agency.legalName}
                                </p>
                                <p className="text-sm text-gray-600 whitespace-pre-line">
                                    {contract.agency.address}
                                </p>
                                {contract.agency.email && (
                                    <p className="text-sm text-gray-600 mt-1">
                                        {contract.agency.email}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Preamble */}
                        <p className="mb-4 leading-relaxed">
                            This <strong>{currentProposal.title}</strong> (this
                            &ldquo;Agreement&rdquo;), effective as of{' '}
                            <strong>{formatContractDate(contract.effectiveDate)}</strong>{' '}
                            (the &ldquo;Effective Date&rdquo;), is made by and between{' '}
                            <strong>
                                {contract.client.legalName || 'the Company'}
                            </strong>
                            {contract.client.address
                                ? `, of ${contract.client.address.replace(/\n/g, ', ')}`
                                : ''}{' '}
                            (the &ldquo;Company&rdquo;) and{' '}
                            <strong>{contract.agency.legalName}</strong>
                            {contract.agency.address
                                ? `, of ${contract.agency.address.replace(/\n/g, ', ')}`
                                : ''}{' '}
                            (the &ldquo;Consultant&rdquo; or &ldquo;Agency&rdquo;).
                        </p>
                        <p className="mb-8 leading-relaxed">
                            The Company desires to retain the Consultant to perform the
                            Services described herein, and the Consultant desires to perform
                            such Services, subject to the terms and conditions of this
                            Agreement. The retainer fee is{' '}
                            <strong>
                                {formatMoney(
                                    contract.retainer.amount,
                                    contract.retainer.currency
                                )}
                            </strong>{' '}
                            per {contract.retainer.billingCycle.replace('ly', '')}
                            {contract.lockInMonths > 0 && (
                                <>
                                    , with a minimum committed term of{' '}
                                    <strong>{contract.lockInMonths} months</strong>
                                    {lockInEnd && (
                                        <>
                                            {' '}
                                            (through{' '}
                                            {formatContractDate(lockInEnd)})
                                        </>
                                    )}
                                </>
                            )}
                            .
                        </p>

                        {/* Clauses */}
                        <ol className="space-y-7 list-none p-0 m-0">
                            {contract.clauses.map((clause, i) => (
                                <li key={clause.id} className="contract-clause">
                                    <h2 className="text-lg font-bold text-gray-900 mb-2">
                                        {i + 1}.{' '}
                                        <span
                                            dangerouslySetInnerHTML={{
                                                __html: clause.heading,
                                            }}
                                        />
                                    </h2>
                                    <div
                                        className="text-gray-700"
                                        dangerouslySetInnerHTML={{ __html: clause.body }}
                                    />
                                </li>
                            ))}
                        </ol>

                        {/* Signature block */}
                        <div className="mt-12 pt-8 border-t-2 border-gray-300 contract-sig-block">
                            <p className="font-bold text-gray-900 mb-1">
                                IN WITNESS WHEREOF
                            </p>
                            <p className="text-sm text-gray-600 mb-8">
                                the parties have caused this Agreement to be executed by
                                their duly authorized representatives.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
                                {/* Client */}
                                <div>
                                    <div className="h-20 flex items-end mb-2">
                                        {sig.client.signatureData ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={sig.client.signatureData}
                                                alt="Client signature"
                                                className="max-h-20 max-w-full object-contain"
                                            />
                                        ) : (
                                            <span className="text-gray-300 italic text-sm">
                                                Awaiting signature
                                            </span>
                                        )}
                                    </div>
                                    <div className="border-b border-gray-400 mb-2" />
                                    <p className="text-[11px] uppercase tracking-wide text-gray-400">
                                        The Client
                                    </p>
                                    <p className="font-semibold text-gray-900">
                                        {contract.client.signatoryName ||
                                            sig.client.name ||
                                            '________________'}
                                    </p>
                                    {contract.client.signatoryTitle && (
                                        <p className="text-sm text-gray-600">
                                            {contract.client.signatoryTitle}
                                        </p>
                                    )}
                                    <p className="text-sm text-gray-500 mt-1">
                                        Date: {formatSignedDate(sig.client.signedAt)}
                                    </p>
                                </div>
                                {/* Agency */}
                                <div>
                                    <div className="h-20 flex items-end mb-2 relative group">
                                        {sig.agency.signatureData ? (
                                            <>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={sig.agency.signatureData}
                                                    alt="Agency signature"
                                                    className="max-h-20 max-w-full object-contain"
                                                />
                                                {!isPublic && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setShowAgencySignDialog(true)
                                                        }
                                                        className="no-print absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 hover:text-blue-600 shadow-sm flex items-center gap-1"
                                                    >
                                                        <PenLine className="w-3 h-3" /> Change
                                                    </button>
                                                )}
                                            </>
                                        ) : !isPublic ? (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setShowAgencySignDialog(true)
                                                }
                                                className="no-print w-full h-full border-2 border-dashed border-slate-300 rounded-md flex items-center justify-center gap-2 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                                            >
                                                <PenLine className="w-4 h-4" /> Add your
                                                signature
                                            </button>
                                        ) : (
                                            <span className="text-gray-300 italic text-sm">
                                                Awaiting signature
                                            </span>
                                        )}
                                    </div>
                                    <div className="border-b border-gray-400 mb-2" />
                                    <p className="text-[11px] uppercase tracking-wide text-gray-400">
                                        The Agency
                                    </p>
                                    <p className="font-semibold text-gray-900">
                                        {contract.agency.signatoryName ||
                                            sig.agency.name ||
                                            '________________'}
                                    </p>
                                    {contract.agency.signatoryTitle && (
                                        <p className="text-sm text-gray-600">
                                            {contract.agency.signatoryTitle}
                                        </p>
                                    )}
                                    <p className="text-sm text-gray-500 mt-1">
                                        Date: {formatSignedDate(sig.agency.signedAt)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Client signing UI */}
                    <div className={!clientSigned ? 'no-print' : ''}>
                        <SignatureSection
                            clientName={
                                contract.client.signatoryName || sig.client.name
                            }
                            documentNoun="Contract"
                            existingSignature={sig.client.signatureData}
                            signedAt={sig.client.signedAt}
                            signatureAudit={sig.client.signatureAudit}
                            isPublic={isPublic}
                            onSign={async (signatureData, method) => {
                                try {
                                    if (isPublic) {
                                        const res = await fetch(
                                            `/api/proposals/${currentProposal.id}/sign`,
                                            {
                                                method: 'POST',
                                                headers: {
                                                    'Content-Type': 'application/json',
                                                },
                                                body: JSON.stringify({
                                                    signatureData,
                                                    method,
                                                }),
                                            }
                                        );
                                        if (!res.ok) {
                                            const { error } = await res
                                                .json()
                                                .catch(() => ({
                                                    error: 'Failed to save signature',
                                                }));
                                            throw new Error(
                                                error || 'Failed to save signature'
                                            );
                                        }
                                    } else {
                                        await proposalService.signProposal(
                                            currentProposal.id,
                                            signatureData
                                        );
                                    }
                                    const updated = isPublic
                                        ? await proposalService.getSharedProposal(
                                              currentProposal.id
                                          )
                                        : await proposalService.getProposalById(
                                              currentProposal.id
                                          );
                                    if (updated) setCurrentProposal(updated);
                                    toast.success('Contract signed successfully');
                                } catch (error) {
                                    console.error('Error signing contract:', error);
                                    toast.error(
                                        error instanceof Error
                                            ? error.message
                                            : 'Failed to save signature'
                                    );
                                }
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Mobile sign CTA */}
            {isPublic && !clientSigned && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent md:hidden z-40 no-print">
                    <Button
                        onClick={() =>
                            document
                                .getElementById('signature-section')
                                ?.scrollIntoView({ behavior: 'smooth' })
                        }
                        className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold shadow-2xl flex items-center justify-center gap-3 rounded-xl"
                    >
                        <PenLine className="w-5 h-5" />
                        Sign Contract Now
                    </Button>
                </div>
            )}

            {/* Agency counter-signature (portal only) */}
            {!isPublic && (
                <AgencySignatureDialog
                    open={showAgencySignDialog}
                    onOpenChange={setShowAgencySignDialog}
                    agencyName={
                        contract.agency.signatoryName || sig.agency.name
                    }
                    hasExistingSignature={!!sig.agency.signatureData}
                    onSave={async (signatureData) => {
                        const updated = await proposalService.signAsAgency(
                            currentProposal.id,
                            signatureData
                        );
                        setCurrentProposal(updated);
                        toast.success('Your signature has been added to this contract.');
                    }}
                />
            )}
        </div>
    );
}
