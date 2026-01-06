'use client';

import { Proposal } from "../types/Proposal";

interface LivePreviewProps {
    proposal: Proposal;
}

const DEFAULT_HERO = '/default-hero.png';
const FONT_TITLE = "'Funnel Display', system-ui, sans-serif";

export default function LivePreview({ proposal }: LivePreviewProps) {
    const heroImage = proposal.heroImage || DEFAULT_HERO;

    return (
        <div className="w-full bg-gray-100 p-3">
            {/* Scaled Container */}
            <div
                style={{
                    // @ts-ignore - zoom is non-standard but widely supported
                    zoom: '45%',
                }}
            >
                {/* Proposal Preview - mirrors ProposalViewer */}
                <div className="bg-white shadow-xl" style={{ maxWidth: '794px', margin: '0 auto' }}>

                    {/* Header Section with Hero Image */}
                    <div
                        className="relative w-full overflow-hidden"
                        style={{
                            height: '250px',
                            backgroundImage: `url(${heroImage})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                        }}
                    >
                        {/* Gradient Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

                        {/* Header Content */}
                        <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                            <h1
                                className="text-white mb-4"
                                style={{
                                    fontSize: '32px',
                                    fontWeight: 700,
                                    fontFamily: FONT_TITLE,
                                    lineHeight: 1.1
                                }}
                            >
                                {proposal.title || 'Proposal Title'}
                            </h1>

                            <div className="grid grid-cols-2 gap-8 mt-6">
                                <div>
                                    <p className="text-xs uppercase tracking-wider text-blue-200 mb-1">Prepared by</p>
                                    <h3 className="text-xl font-semibold text-white">{proposal.agencyName || 'Agency'}</h3>
                                </div>
                                <div>
                                    <p className="text-xs uppercase tracking-wider text-blue-200 mb-1">Prepared for</p>
                                    <h3 className="text-xl font-semibold text-white">{proposal.clientName || 'Client'}</h3>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content Sections */}
                    <div className="p-6 space-y-8">

                        {/* Overview */}
                        {proposal.data.overview && (
                            <section className="grid grid-cols-[1fr_3fr] gap-4">
                                <div>
                                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', fontFamily: FONT_TITLE }}>
                                        Overview
                                    </h2>
                                </div>
                                <div>
                                    <div
                                        className="text-gray-600 leading-relaxed whitespace-pre-wrap"
                                        dangerouslySetInnerHTML={{ __html: proposal.data.overview }}
                                    />
                                </div>
                            </section>
                        )}

                        {/* About Us */}
                        {proposal.data.aboutUs && (
                            <section className="grid grid-cols-[1fr_3fr] gap-4">
                                <div>
                                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', fontFamily: FONT_TITLE }}>
                                        About Us
                                    </h2>
                                </div>
                                <div>
                                    <div
                                        className="text-gray-600 leading-relaxed prose prose-sm"
                                        dangerouslySetInnerHTML={{ __html: proposal.data.aboutUs }}
                                    />
                                </div>
                            </section>
                        )}

                        {/* Pricing */}
                        {proposal.data.pricing.items.some(item => item.name) && (
                            <section className="grid grid-cols-[1fr_3fr] gap-4">
                                <div>
                                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', fontFamily: FONT_TITLE }}>
                                        Pricing
                                    </h2>
                                </div>
                                <div>
                                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                                        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                                            <div className="flex justify-between text-xs font-medium uppercase tracking-wider text-gray-500">
                                                <span>Item</span>
                                                <span>Price</span>
                                            </div>
                                        </div>
                                        <div className="p-6 space-y-4">
                                            {proposal.data.pricing.items.filter(i => i.name).map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <h4 className="text-lg font-semibold text-gray-900">{item.name}</h4>
                                                        {item.description && (
                                                            <div
                                                                className="text-sm text-gray-500 mt-1"
                                                                dangerouslySetInnerHTML={{ __html: item.description }}
                                                            />
                                                        )}
                                                    </div>
                                                    <div className="text-lg font-semibold text-gray-900 ml-8">{item.price}</div>
                                                </div>
                                            ))}
                                        </div>
                                        {proposal.data.pricing.total && (
                                            <div className="bg-blue-600 px-6 py-4 flex justify-between items-center">
                                                <span className="text-lg font-semibold text-white">Total Investment</span>
                                                <span className="text-2xl font-bold text-white">{proposal.data.pricing.total}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </section>
                        )}

                        {/* Timeline */}
                        {proposal.data.timeline.phases.some(p => p.title) && (
                            <section>
                                <h2
                                    className="border-b-2 border-blue-500 pb-2 mb-6"
                                    style={{ fontSize: '24px', fontWeight: 700, color: '#111827', fontFamily: FONT_TITLE }}
                                >
                                    Project Timeline
                                </h2>
                                <div className="space-y-6">
                                    {proposal.data.timeline.phases.filter(p => p.title).map((phase, idx) => (
                                        <div key={idx} className="flex gap-4">
                                            <div className="flex flex-col items-center">
                                                <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                                                    {idx + 1}
                                                </div>
                                                {idx < proposal.data.timeline.phases.filter(p => p.title).length - 1 && (
                                                    <div className="w-0.5 flex-1 bg-blue-200 my-2" />
                                                )}
                                            </div>
                                            <div className="flex-1 pb-4">
                                                <div className="flex justify-between items-start">
                                                    <h3 className="text-lg font-semibold text-gray-900">{phase.title}</h3>
                                                    {phase.duration && (
                                                        <span className="text-sm font-medium bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
                                                            {phase.duration}
                                                        </span>
                                                    )}
                                                </div>
                                                {phase.description && (
                                                    <div
                                                        className="text-gray-600 mt-2"
                                                        dangerouslySetInnerHTML={{ __html: phase.description }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Terms */}
                        {proposal.data.terms && (
                            <section className="grid grid-cols-[1fr_3fr] gap-4">
                                <div>
                                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', fontFamily: FONT_TITLE }}>
                                        Terms
                                    </h2>
                                </div>
                                <div>
                                    <div
                                        className="text-gray-600 leading-relaxed prose prose-sm"
                                        dangerouslySetInnerHTML={{ __html: proposal.data.terms }}
                                    />
                                </div>
                            </section>
                        )}

                        {/* Signature Section */}
                        <section className="grid grid-cols-[1fr_3fr] gap-4">
                            <div>
                                <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', fontFamily: FONT_TITLE }}>
                                    Signature
                                </h2>
                            </div>
                            <div className="grid grid-cols-2 gap-12 pt-8">
                                {/* Agency Signature */}
                                <div className="border-t-2 border-gray-300 pt-4">
                                    <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">Agency Representative</p>
                                    <p className="text-lg font-semibold text-gray-900">
                                        {proposal.data.signatures.agency.name || 'Agency Name'}
                                    </p>
                                    {proposal.data.signatures.agency.signatureData && (
                                        <img
                                            src={proposal.data.signatures.agency.signatureData}
                                            alt="Agency signature"
                                            className="h-12 mt-2"
                                        />
                                    )}
                                </div>

                                {/* Client Signature */}
                                <div className="border-t-2 border-gray-300 pt-4">
                                    <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">Client</p>
                                    <p className="text-lg font-semibold text-gray-900">
                                        {proposal.data.signatures.client.name || 'Client Name'}
                                    </p>
                                    {proposal.data.signatures.client.signedAt ? (
                                        <div className="mt-2">
                                            {proposal.data.signatures.client.signatureData && (
                                                <img
                                                    src={proposal.data.signatures.client.signatureData}
                                                    alt="Client signature"
                                                    className="h-12"
                                                />
                                            )}
                                            <p className="text-xs text-green-600 mt-1">
                                                ✓ Signed on {new Date(proposal.data.signatures.client.signedAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="h-16 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center mt-2">
                                            <span className="text-sm text-gray-400">Awaiting signature</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}
