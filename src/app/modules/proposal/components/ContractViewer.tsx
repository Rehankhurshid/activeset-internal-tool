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

// Document typography. next/font emits hashed family names, so the CSS
// variables (declared in layout.tsx) are the only reliable handle.
// Instrument Serif carries the title and clause headings, Geist the body copy,
// Geist Mono the reference line and small caps labels.
const FONT_TITLE = "var(--font-instrument-serif), 'Instrument Serif', Georgia, serif";
const FONT_BODY = "var(--font-geist), 'Geist', system-ui, sans-serif";
const FONT_MONO = "var(--font-geist-mono), 'Geist Mono', ui-monospace, monospace";

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
                cls: 'bg-emerald-50/80 text-emerald-900 ring-emerald-600/15',
                dot: 'bg-emerald-500',
                icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
                title: 'Fully executed',
                sub: `Signed by both parties. This agreement is in force.`,
            };
        }
        if (clientSigned) {
            return {
                cls: 'bg-sky-50/80 text-sky-900 ring-sky-600/15',
                dot: 'bg-sky-500',
                icon: <Clock className="w-4 h-4 text-sky-600" />,
                title: 'Awaiting agency counter-signature',
                sub: `${contract.client.signatoryName || 'The client'} has signed. Pending agency signature.`,
            };
        }
        if (agencySigned) {
            return {
                cls: 'bg-amber-50/80 text-amber-900 ring-amber-600/15',
                dot: 'bg-amber-500',
                icon: <Clock className="w-4 h-4 text-amber-600" />,
                title: 'Awaiting client signature',
                sub: `Signed by the agency. Share this contract with ${contract.client.signatoryName || 'the client'} to execute it.`,
            };
        }
        return {
            cls: 'bg-stone-100/80 text-stone-700 ring-stone-500/15',
            dot: 'bg-stone-400',
            icon: <ScrollText className="w-4 h-4 text-stone-500" />,
            title: 'Draft — not yet signed',
            sub: 'Awaiting signatures from both parties.',
        };
    })();

    return (
        <div className="contract-body min-h-screen bg-[#f7f6f3] print:bg-white">
            {/* Header — light and quiet, so the document is the loudest thing */}
            <div className="sticky top-0 z-50 bg-[#f7f6f3]/85 backdrop-blur-xl border-b border-stone-200/70 px-4 sm:px-6 py-3 no-print">
                <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        {!isPublic && (
                            <Button
                                onClick={onBack}
                                className="flex items-center gap-2 bg-white hover:bg-stone-50 text-stone-700 border border-stone-200 shadow-sm h-9 w-9 p-0 rounded-full"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                <span className="sr-only">Back</span>
                            </Button>
                        )}
                        <div className="min-w-0">
                            <h1 className="text-[15px] font-medium text-stone-900 leading-tight truncate">
                                {currentProposal.title}
                            </h1>
                            <p className="contract-mono text-[10px] tracking-[0.12em] uppercase text-stone-400 truncate">
                                {contract.client.legalName || currentProposal.clientName}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {!isPublic && (
                            <>
                                <Button
                                    onClick={handleShare}
                                    className="flex items-center gap-2 bg-white hover:bg-stone-50 text-stone-700 border border-stone-200 shadow-sm h-9 px-4 rounded-full"
                                >
                                    <Share2 className="w-4 h-4" />
                                    <span className="hidden sm:inline">Share</span>
                                </Button>
                                <Button
                                    onClick={handleEmail}
                                    className="flex items-center gap-2 bg-white hover:bg-stone-50 text-stone-700 border border-stone-200 shadow-sm h-9 px-4 rounded-full"
                                >
                                    <Mail className="w-4 h-4" />
                                    <span className="hidden sm:inline">Email</span>
                                </Button>
                            </>
                        )}
                        <Button
                            onClick={handleDownloadPDF}
                            disabled={isDownloading}
                            className="flex items-center gap-2 bg-white hover:bg-stone-50 text-stone-700 border border-stone-200 shadow-sm h-9 px-4 rounded-full"
                        >
                            <FileDown
                                className={`w-4 h-4 ${isDownloading ? 'animate-bounce' : ''}`}
                            />
                            <span className="hidden sm:inline">
                                {isDownloading ? 'Generating…' : 'Download'}
                            </span>
                        </Button>
                        {isPublic && !clientSigned && (
                            <Button
                                onClick={() =>
                                    document
                                        .getElementById('signature-section')
                                        ?.scrollIntoView({ behavior: 'smooth' })
                                }
                                className="flex items-center gap-2 bg-stone-900 hover:bg-stone-800 text-white border-none h-9 px-5 rounded-full shadow-sm transition-transform hover:-translate-y-px"
                            >
                                <PenLine className="w-4 h-4" />
                                Sign
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            <style
                dangerouslySetInnerHTML={{
                    __html: `
            .contract-body {
              font-family: ${FONT_BODY};
              font-feature-settings: 'ss01', 'cv05';
              -webkit-font-smoothing: antialiased;
            }
            .contract-title, .contract-heading { font-family: ${FONT_TITLE}; letter-spacing: -0.01em; }
            .contract-mono {
              font-family: ${FONT_MONO};
              font-variant-numeric: tabular-nums;
            }
            /* Small-caps label used for every field label in the document. */
            .contract-label {
              font-family: ${FONT_MONO};
              font-size: 10px;
              letter-spacing: 0.14em;
              text-transform: uppercase;
              color: #a8a29e;
            }
            .contract-clause ul { list-style: disc; padding-left: 1.35rem; margin: 0.7rem 0; }
            .contract-clause ol { list-style: decimal; padding-left: 1.35rem; margin: 0.7rem 0; }
            .contract-clause li { margin-bottom: 0.5rem; line-height: 1.75; padding-left: 0.15rem; }
            .contract-clause li::marker { color: #d6d3d1; }
            .contract-clause p { margin-bottom: 0.85rem; line-height: 1.8; }
            .contract-clause p:last-child, .contract-clause ul:last-child, .contract-clause ol:last-child { margin-bottom: 0; }
            .contract-clause strong { font-weight: 600; color: #1c1917; }
            .contract-clause a { color: #1c1917; text-decoration: underline; text-underline-offset: 2px; }
            /* Hairline rule that reads as a ruled document line, not a border. */
            .contract-rule { height: 1px; background: linear-gradient(to right, #e7e5e4, #f5f5f4); }
            @media print {
              html, body { background: #fff !important; }
              .no-print { display: none !important; }
              .contract-paper { box-shadow: none !important; border: none !important; border-radius: 0 !important; }
              .contract-clause, .contract-sig-block { page-break-inside: avoid; }
            }
          `,
                }}
            />

            {/* Document */}
            <div className="px-4 sm:px-6 pt-6 sm:pt-10 pb-16 flex justify-center print:p-0">
                <div className="w-full max-w-3xl">
                    {/* Status — outside the paper, so the document stays clean */}
                    <div
                        className={`no-print mb-5 flex items-center gap-3 rounded-2xl px-4 py-3 ring-1 ${statusBanner.cls}`}
                    >
                        <span className="relative flex h-2 w-2 shrink-0">
                            <span
                                className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${statusBanner.dot} ${fullyExecuted ? '' : 'animate-ping'}`}
                            />
                            <span
                                className={`relative inline-flex h-2 w-2 rounded-full ${statusBanner.dot}`}
                            />
                        </span>
                        <div className="min-w-0">
                            <p className="text-[13px] font-medium leading-tight">
                                {statusBanner.title}
                            </p>
                            <p className="text-[12px] opacity-70 leading-snug">
                                {statusBanner.sub}
                            </p>
                        </div>
                    </div>

                    <div
                        id="proposal-container"
                        className="contract-paper bg-white rounded-[20px] print:rounded-none ring-1 ring-stone-900/[0.06] shadow-[0_1px_2px_rgba(28,25,23,0.04),0_12px_32px_-8px_rgba(28,25,23,0.10)] print:shadow-none px-6 py-10 sm:px-14 sm:py-16 text-[15px] text-stone-700"
                    >
                        {/* Masthead */}
                        <div className="mb-10">
                            <p className="contract-label mb-4">Retainer Agreement</p>
                            <h1 className="contract-title text-[34px] sm:text-[44px] leading-[1.08] text-stone-900 mb-5">
                                {currentProposal.title}
                            </h1>
                            <div className="contract-rule mb-4" />
                            {/* The reference line — the detail that makes it read as a
                                real instrument rather than a web page. */}
                            <div className="contract-mono flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tracking-[0.1em] uppercase text-stone-400">
                                <span>
                                    Effective {formatContractDate(contract.effectiveDate)}
                                </span>
                                <span className="text-stone-300">·</span>
                                <span>
                                    {formatMoney(
                                        contract.retainer.amount,
                                        contract.retainer.currency
                                    )}{' '}
                                    / {contract.retainer.billingCycle.replace('ly', '')}
                                </span>
                                <span className="text-stone-300">·</span>
                                <span>
                                    {contract.lockInMonths > 0
                                        ? `${contract.lockInMonths} month term`
                                        : 'Rolling term'}
                                </span>
                            </div>
                        </div>

                        {/* Parties */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-10 mb-10">
                            <div>
                                <div className="contract-rule mb-3" />
                                <p className="contract-label mb-2">Prepared for</p>
                                <p className="contract-heading text-[19px] leading-snug text-stone-900">
                                    {contract.client.legalName || '________________'}
                                </p>
                                <p className="text-[13px] leading-relaxed text-stone-500 whitespace-pre-line mt-1">
                                    {contract.client.address}
                                </p>
                                {contract.client.email && (
                                    <p className="contract-mono text-[12px] text-stone-500 mt-1.5">
                                        {contract.client.email}
                                    </p>
                                )}
                            </div>
                            <div>
                                <div className="contract-rule mb-3" />
                                <p className="contract-label mb-2">Prepared by</p>
                                <p className="contract-heading text-[19px] leading-snug text-stone-900">
                                    {contract.agency.legalName}
                                </p>
                                <p className="text-[13px] leading-relaxed text-stone-500 whitespace-pre-line mt-1">
                                    {contract.agency.address}
                                </p>
                                {contract.agency.email && (
                                    <p className="contract-mono text-[12px] text-stone-500 mt-1.5">
                                        {contract.agency.email}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Preamble */}
                        <p className="mb-4 leading-[1.8]">
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
                        <p className="mb-12 leading-[1.8]">
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

                        {/* Clauses — numbers sit in a gutter so the headings keep a
                            clean left edge with the body copy underneath. */}
                        <ol className="list-none p-0 m-0 space-y-9">
                            {contract.clauses.map((clause, i) => (
                                <li
                                    key={clause.id}
                                    className="contract-clause sm:grid sm:grid-cols-[2.75rem_1fr] sm:gap-x-2"
                                >
                                    <span
                                        aria-hidden
                                        className="contract-mono hidden sm:block text-[12px] text-stone-300 pt-[0.45rem] tabular-nums"
                                    >
                                        {String(i + 1).padStart(2, '0')}
                                    </span>
                                    <div>
                                        <h2 className="contract-heading text-[22px] leading-snug text-stone-900 mb-2.5">
                                            <span className="contract-mono sm:hidden text-[12px] text-stone-300 mr-2 align-middle">
                                                {String(i + 1).padStart(2, '0')}
                                            </span>
                                            <span
                                                dangerouslySetInnerHTML={{
                                                    __html: clause.heading,
                                                }}
                                            />
                                        </h2>
                                        <div
                                            className="text-stone-600"
                                            dangerouslySetInnerHTML={{
                                                __html: clause.body,
                                            }}
                                        />
                                    </div>
                                </li>
                            ))}
                        </ol>

                        {/* Signature block */}
                        <div className="mt-14 pt-10 contract-sig-block">
                            <div className="contract-rule mb-8" />
                            <p className="contract-label mb-3">In witness whereof</p>
                            <p className="text-[14px] leading-relaxed text-stone-500 mb-10 max-w-xl">
                                the parties have caused this Agreement to be executed by
                                their duly authorized representatives.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 sm:gap-12">
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
                                            <span className="contract-mono text-[11px] tracking-[0.1em] uppercase text-stone-300">
                                                Awaiting signature
                                            </span>
                                        )}
                                    </div>
                                    <div className="h-px bg-stone-300 mb-3" />
                                    <p className="contract-label mb-1.5">
                                        The Client
                                    </p>
                                    <p className="contract-heading text-[19px] leading-snug text-stone-900">
                                        {contract.client.signatoryName ||
                                            sig.client.name ||
                                            '________________'}
                                    </p>
                                    {contract.client.signatoryTitle && (
                                        <p className="text-[13px] text-stone-500 mt-0.5">
                                            {contract.client.signatoryTitle}
                                        </p>
                                    )}
                                    <p className="contract-mono text-[11px] tracking-[0.08em] uppercase text-stone-400 mt-2.5">
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
                                            <span className="contract-mono text-[11px] tracking-[0.1em] uppercase text-stone-300">
                                                Awaiting signature
                                            </span>
                                        )}
                                    </div>
                                    <div className="h-px bg-stone-300 mb-3" />
                                    <p className="contract-label mb-1.5">
                                        The Agency
                                    </p>
                                    <p className="contract-heading text-[19px] leading-snug text-stone-900">
                                        {contract.agency.signatoryName ||
                                            sig.agency.name ||
                                            '________________'}
                                    </p>
                                    {contract.agency.signatoryTitle && (
                                        <p className="text-[13px] text-stone-500 mt-0.5">
                                            {contract.agency.signatoryTitle}
                                        </p>
                                    )}
                                    <p className="contract-mono text-[11px] tracking-[0.08em] uppercase text-stone-400 mt-2.5">
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
                            tone="document"
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
                <div className="fixed bottom-0 left-0 right-0 p-4 pb-5 bg-gradient-to-t from-[#f7f6f3] via-[#f7f6f3] to-transparent md:hidden z-40 no-print">
                    <Button
                        onClick={() =>
                            document
                                .getElementById('signature-section')
                                ?.scrollIntoView({ behavior: 'smooth' })
                        }
                        className="w-full h-13 py-4 bg-stone-900 hover:bg-stone-800 text-white text-[15px] font-medium shadow-[0_8px_24px_-6px_rgba(28,25,23,0.45)] flex items-center justify-center gap-2.5 rounded-full"
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
