'use client';

import { Proposal } from "../types/Proposal";

interface LivePreviewProps {
    proposal: Proposal;
}

const DEFAULT_HERO = '/default-hero.png';

export default function LivePreview({ proposal }: LivePreviewProps) {
    const heroImage = proposal.heroImage || DEFAULT_HERO;

    return (
        <div
            style={{
                backgroundColor: '#ffffff',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                color: '#111827',
                fontSize: '10px',
                transform: 'scale(0.5)',
                transformOrigin: 'top left',
                width: '200%',
                minHeight: '100%'
            }}
        >
            {/* Header Section with Hero Image */}
            <div style={{
                position: 'relative',
                height: '396px',
                width: '100%',
                overflow: 'hidden',
                backgroundImage: `url(${heroImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat'
            }}>


                {/* Header Content */}
                <div style={{
                    position: 'relative',
                    padding: '24px',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ color: '#ffffff' }}>
                        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', color: '#ffffff' }}>
                            {proposal.title || 'Proposal Title'}
                        </h1>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', color: '#ffffff' }}>
                        <div>
                            <p style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', color: '#bfdbfe' }}>Agency</p>
                            <h3 style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff' }}>{proposal.agencyName || 'ActiveSet'}</h3>
                        </div>
                        <div>
                            <p style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', color: '#bfdbfe' }}>Client</p>
                            <h3 style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff' }}>{proposal.clientName || 'Client Name'}</h3>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Sections */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
                {/* Overview */}
                {proposal.data.overview && (
                    <section>
                        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>Overview</h2>
                        <p style={{ color: '#374151', lineHeight: 1.5, whiteSpace: 'pre-wrap', fontSize: '10px' }}>
                            {proposal.data.overview.substring(0, 200)}{proposal.data.overview.length > 200 ? '...' : ''}
                        </p>
                    </section>
                )}

                {/* About Us */}
                {proposal.data.aboutUs && (
                    <section>
                        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>About Us</h2>
                        <div
                            style={{ color: '#374151', lineHeight: 1.5, fontSize: '10px' }}
                            dangerouslySetInnerHTML={{ __html: proposal.data.aboutUs }}
                            className="[&>p]:mb-2 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4 [&>li]:mb-0.5 [&>h2]:text-sm [&>h2]:font-bold [&>h2]:mb-1 [&>h2]:mt-2"
                        />
                    </section>
                )}

                {/* Pricing Preview */}
                {proposal.data.pricing.items.some(item => item.name) && (
                    <section>
                        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>Pricing</h2>
                        <div style={{ border: '1px solid #e5e7eb', borderRadius: '4px', padding: '12px' }}>
                            <div className="space-y-3">
                                {proposal.data.pricing.items.map((item, index) => (
                                    <div key={index} className="border-b last:border-0 pb-3 last:pb-0 border-gray-100">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-medium text-gray-800">{item.name}</span>
                                            <span className="font-semibold text-blue-600 ml-4 whitespace-nowrap">{item.price}</span>
                                        </div>
                                        {item.description && (
                                            <div
                                                className="text-xs text-gray-500 whitespace-pre-wrap"
                                                dangerouslySetInnerHTML={{ __html: item.description }}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Total */}
                            {proposal.data.pricing.total && (
                                <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between items-center">
                                    <span className="font-bold text-gray-900">Total Investment</span>
                                    <span className="text-xl font-bold text-blue-700">{proposal.data.pricing.total}</span>
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {/* Timeline Section */}
                {proposal.data.timeline.phases.some(p => p.title) && (
                    <section className="mb-8 break-inside-avoid">
                        <h2 className="text-lg font-bold text-gray-800 border-b-2 border-blue-500 pb-2 mb-4">Project Timeline</h2>
                        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
                            {/* Standard List View */}
                            <div className="space-y-4 mb-6">
                                {proposal.data.timeline.phases.map((phase, index) => (
                                    <div key={index} className="flex gap-3">
                                        <div className="flex flex-col items-center">
                                            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold border border-blue-200">
                                                {index + 1}
                                            </div>
                                            {index < proposal.data.timeline.phases.length - 1 && (
                                                <div className="w-px h-full bg-gray-200 my-1"></div>
                                            )}
                                        </div>
                                        <div className="flex-1 pb-1">
                                            <div className="flex justify-between items-start">
                                                <h3 className="font-semibold text-gray-800 text-sm">{phase.title}</h3>
                                                <span className="text-xs font-medium px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100 whitespace-nowrap">
                                                    {phase.duration}
                                                </span>
                                            </div>
                                            <div
                                                className="text-xs text-gray-600 mt-1"
                                                dangerouslySetInnerHTML={{ __html: phase.description }}
                                            />
                                            {phase.startDate && (
                                                <p className="text-[10px] text-gray-400 mt-1">Starts: {phase.startDate}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Notion-style Gantt Chart */}
                            {proposal.data.timeline.phases.some(p => p.startDate && p.endDate) && (() => {
                                const phases = proposal.data.timeline.phases.filter(p => p.startDate && p.endDate);
                                if (phases.length === 0) return null;

                                // Get phase indices for dependency mapping
                                const phaseIndices = proposal.data.timeline.phases
                                    .map((p, i) => ({ phase: p, originalIndex: i }))
                                    .filter(item => item.phase.startDate && item.phase.endDate);

                                const dates = phases.flatMap(p => [new Date(p.startDate!).getTime(), new Date(p.endDate!).getTime()]);
                                const minDate = Math.min(...dates);
                                const maxDate = Math.max(...dates);
                                const padding = 7 * 24 * 60 * 60 * 1000;
                                const start = minDate - padding;
                                const end = maxDate + padding;
                                const totalDuration = end - start;

                                const getPosition = (dateStr: string) => {
                                    const date = new Date(dateStr).getTime();
                                    return ((date - start) / totalDuration) * 100;
                                };

                                const getWidth = (startStr: string, endStr: string) => {
                                    const s = new Date(startStr).getTime();
                                    const e = new Date(endStr).getTime();
                                    return ((e - s) / totalDuration) * 100;
                                };

                                const formatDate = (dateStr: string) => {
                                    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                };

                                const colors = [
                                    { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
                                    { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
                                    { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' },
                                    { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
                                    { bg: '#f3e8ff', text: '#6b21a8', border: '#e9d5ff' },
                                    { bg: '#fce7f3', text: '#be185d', border: '#fbcfe8' },
                                ];

                                // Generate date markers
                                const totalDays = totalDuration / (24 * 60 * 60 * 1000);
                                const markerInterval = totalDays > 60 ? 30 : totalDays > 30 ? 7 : 1;
                                const markers: Date[] = [];
                                const current = new Date(start);
                                current.setHours(0, 0, 0, 0);
                                while (current.getTime() <= end) {
                                    markers.push(new Date(current));
                                    current.setDate(current.getDate() + markerInterval);
                                }

                                const today = new Date();
                                const todayPosition = ((today.getTime() - start) / totalDuration) * 100;
                                const showTodayMarker = today.getTime() >= start && today.getTime() <= end;

                                return (
                                    <div className="mt-8 pt-6 border-t border-gray-100">
                                        <h3 className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wider">Project Schedule</h3>

                                        <div className="flex w-full bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm" style={{ minHeight: '200px' }}>
                                            {/* Sidebar: Task Names */}
                                            <div className="w-1/4 border-r border-gray-200 bg-gray-50/50 flex flex-col">
                                                <div className="h-10 border-b border-gray-200 bg-gray-50 flex items-center px-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                                                    Tasks
                                                </div>
                                                <div className="flex-1">
                                                    {phases.map((phase, index) => (
                                                        <div key={index} className="h-12 flex items-center px-3 border-b border-gray-100">
                                                            <span className="text-[11px] font-medium text-gray-700 truncate" title={phase.title}>
                                                                {phase.title}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Timeline: Bars */}
                                            <div className="flex-1 relative overflow-hidden flex flex-col">
                                                {/* Date Header */}
                                                <div className="h-10 border-b border-gray-200 bg-gray-50 relative">
                                                    {markers.filter((_, i) => i % (markerInterval === 1 ? 7 : 1) === 0).map((date, i) => {
                                                        const left = ((date.getTime() - start) / totalDuration) * 100;
                                                        return (
                                                            <div key={i} className="absolute top-0 bottom-0 pl-2 flex items-center text-[9px] text-gray-500 font-medium" style={{ left: `${left}%` }}>
                                                                {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Grid Lines */}
                                                <div className="absolute inset-x-0 bottom-0 top-10 pointer-events-none">
                                                    {markers.map((date, i) => {
                                                        const left = ((date.getTime() - start) / totalDuration) * 100;
                                                        return (
                                                            <div key={i} className="absolute top-0 bottom-0 border-l border-gray-100" style={{ left: `${left}%` }} />
                                                        );
                                                    })}
                                                </div>

                                                {/* Today Marker */}
                                                {showTodayMarker && (
                                                    <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20" style={{ left: `${todayPosition}%` }}>
                                                        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-red-500" />
                                                    </div>
                                                )}

                                                {/* Dependency Lines (SVG) */}
                                                <svg className="absolute top-10 left-0 w-full pointer-events-none z-5" style={{ height: `${phases.length * 48}px` }}>
                                                    {phaseIndices.map((item, displayIndex) => {
                                                        const phase = item.phase;
                                                        if (phase.dependsOn === undefined) return null;

                                                        const depPhaseItem = phaseIndices.find(p => p.originalIndex === phase.dependsOn);
                                                        if (!depPhaseItem) return null;

                                                        const depDisplayIndex = phaseIndices.indexOf(depPhaseItem);
                                                        const depPhase = depPhaseItem.phase;

                                                        const fromX = getPosition(depPhase.endDate!);
                                                        const fromY = depDisplayIndex * 48 + 24;
                                                        const toX = getPosition(phase.startDate!);
                                                        const toY = displayIndex * 48 + 24;
                                                        const midX = (fromX + toX) / 2;

                                                        return (
                                                            <g key={displayIndex}>
                                                                <path
                                                                    d={`M ${fromX}% ${fromY} C ${midX}% ${fromY}, ${midX}% ${toY}, ${toX}% ${toY}`}
                                                                    fill="none"
                                                                    stroke="#9ca3af"
                                                                    strokeWidth="1.5"
                                                                    strokeDasharray="4,2"
                                                                />
                                                                <polygon
                                                                    points={`${toX}%,${toY} ${toX}%,${toY - 4} ${toX}%,${toY + 4}`}
                                                                    fill="#9ca3af"
                                                                    transform={`translate(-6, 0)`}
                                                                />
                                                            </g>
                                                        );
                                                    })}
                                                </svg>

                                                {/* Bars Container */}
                                                <div className="flex-1 relative z-10">
                                                    {phases.map((phase, index) => {
                                                        const left = getPosition(phase.startDate!);
                                                        const width = getWidth(phase.startDate!, phase.endDate!);
                                                        const color = colors[index % colors.length];

                                                        return (
                                                            <div key={index} className="h-12 relative flex items-center border-b border-gray-100">
                                                                <div
                                                                    className="absolute h-7 rounded-md flex items-center justify-center px-2 overflow-hidden"
                                                                    style={{
                                                                        left: `${left}%`,
                                                                        width: `${Math.max(width, 5)}%`,
                                                                        backgroundColor: color.bg,
                                                                        border: `1px solid ${color.border}`,
                                                                        minWidth: '40px'
                                                                    }}
                                                                >
                                                                    <span className="text-[9px] font-semibold truncate" style={{ color: color.text }}>
                                                                        {formatDate(phase.startDate!)} – {formatDate(phase.endDate!)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </section>
                )}

                {/* Terms & Conditions */}
                {proposal.data.terms && (
                    <section>
                        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>Terms & Conditions</h2>
                        <div
                            style={{ color: '#374151', lineHeight: 1.5, fontSize: '10px' }}
                            dangerouslySetInnerHTML={{ __html: proposal.data.terms }}
                            className="[&>p]:mb-2 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4 [&>li]:mb-0.5 [&>h2]:text-sm [&>h2]:font-bold [&>h2]:mb-1 [&>h2]:mt-2 [&>h3]:text-xs [&>h3]:font-semibold [&>h3]:mb-1 [&>h3]:mt-2"
                        />
                    </section>
                )}
            </div>
        </div>
    );
}
