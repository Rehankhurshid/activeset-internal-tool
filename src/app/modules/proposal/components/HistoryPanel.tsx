'use client';

import { useState, useEffect } from 'react';
import { ProposalEdit, ProposalSectionId } from '../types/Proposal';
import { Button } from '@/components/ui/button';
import {
    History,
    X,
    FileEdit,
    FilePlus,
    RefreshCw,
    PenLine,
    User
} from 'lucide-react';
import { historyService } from '../services/HistoryService';

// Section labels for display
const SECTION_LABELS: Record<ProposalSectionId, string> = {
    overview: 'Overview',
    aboutUs: 'About Us',
    pricing: 'Pricing',
    timeline: 'Timeline',
    terms: 'Terms & Conditions',
    signatures: 'Signatures',
    general: 'General',
};

// Icons for change types
const CHANGE_ICONS: Record<ProposalEdit['changeType'], React.ReactNode> = {
    create: <FilePlus className="w-4 h-4 text-green-500" />,
    update: <FileEdit className="w-4 h-4 text-blue-500" />,
    status_change: <RefreshCw className="w-4 h-4 text-amber-500" />,
    signed: <PenLine className="w-4 h-4 text-purple-500" />,
};

interface HistoryPanelProps {
    proposalId: string;
    isOpen: boolean;
    onClose: () => void;
}

export default function HistoryPanel({
    proposalId,
    isOpen,
    onClose,
}: HistoryPanelProps) {
    const [history, setHistory] = useState<ProposalEdit[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!proposalId || !isOpen) return;

        const loadHistory = async () => {
            setIsLoading(true);
            try {
                const fetchedHistory = await historyService.getHistory(proposalId, 50);
                setHistory(fetchedHistory);
            } catch (error) {
                console.error('Failed to load history:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadHistory();
    }, [proposalId, isOpen]);

    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        let relativeTime: string;
        if (diffMins < 1) relativeTime = 'Just now';
        else if (diffMins < 60) relativeTime = `${diffMins}m ago`;
        else if (diffHours < 24) relativeTime = `${diffHours}h ago`;
        else if (diffDays < 7) relativeTime = `${diffDays}d ago`;
        else relativeTime = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        const fullDate = date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });

        return { relativeTime, fullDate };
    };

    // Group history by date
    const groupedHistory = history.reduce((acc, edit) => {
        const date = new Date(edit.timestamp).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        });
        if (!acc[date]) acc[date] = [];
        acc[date].push(edit);
        return acc;
    }, {} as Record<string, ProposalEdit[]>);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-full sm:w-96 bg-white shadow-2xl z-[60] flex flex-col border-l border-gray-200">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-gray-600" />
                    <h2 className="font-semibold text-gray-900">Edit History</h2>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="h-8 w-8 bg-gray-200 hover:bg-gray-300 text-gray-700"
                >
                    <X className="w-4 h-4" />
                </Button>
            </div>

            {/* History List */}
            <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                    <div className="flex items-center justify-center h-32 text-gray-400">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400" />
                    </div>
                ) : history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-400 px-4 text-center">
                        <History className="w-12 h-12 mb-3 text-gray-300" />
                        <p className="text-sm">No edit history yet</p>
                        <p className="text-xs mt-1">
                            Changes to this proposal will be tracked here
                        </p>
                    </div>
                ) : (
                    <div className="py-4">
                        {Object.entries(groupedHistory).map(([date, edits]) => (
                            <div key={date} className="mb-6">
                                {/* Date Header */}
                                <div className="px-4 mb-3">
                                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                        {date}
                                    </h3>
                                </div>

                                {/* Edits for this date */}
                                <div className="space-y-0">
                                    {edits.map((edit, index) => {
                                        const { relativeTime, fullDate } = formatTime(edit.timestamp);
                                        const isLast = index === edits.length - 1;

                                        return (
                                            <div
                                                key={edit.id}
                                                className="relative px-4 py-3 hover:bg-gray-50 transition-colors"
                                            >
                                                {/* Timeline line */}
                                                {!isLast && (
                                                    <div className="absolute left-[30px] top-[44px] bottom-0 w-px bg-gray-200" />
                                                )}

                                                <div className="flex items-start gap-3">
                                                    {/* Icon */}
                                                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                                                        {CHANGE_ICONS[edit.changeType]}
                                                    </div>

                                                    {/* Content */}
                                                    <div className="flex-1 min-w-0">
                                                        {/* Summary */}
                                                        <p className="text-sm text-gray-900 font-medium">
                                                            {edit.summary}
                                                        </p>

                                                        {/* Detailed Changes */}
                                                        {edit.changes && edit.changes.length > 0 && (
                                                            <div className="mt-2 space-y-1.5 bg-gray-50 rounded-md p-2 border border-gray-100">
                                                                {edit.changes.map((change, changeIdx) => (
                                                                    <div key={changeIdx} className="text-xs">
                                                                        <span className="font-medium text-gray-700">{change.field}:</span>
                                                                        <div className="ml-2 flex flex-col gap-0.5">
                                                                            {change.oldValue && (
                                                                                <span className="text-red-600 line-through">
                                                                                    {change.oldValue}
                                                                                </span>
                                                                            )}
                                                                            {change.newValue && (
                                                                                <span className="text-green-600">
                                                                                    {change.newValue}
                                                                                </span>
                                                                            )}
                                                                            {!change.oldValue && !change.newValue && (
                                                                                <span className="text-gray-400 italic">(cleared)</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Meta */}
                                                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                            <div className="flex items-center gap-1 text-xs text-gray-500">
                                                                <User className="w-3 h-3" />
                                                                <span>{edit.editorName}</span>
                                                            </div>
                                                            <span className="text-gray-300">•</span>
                                                            <span
                                                                className="text-xs text-gray-400"
                                                                title={fullDate}
                                                            >
                                                                {relativeTime}
                                                            </span>
                                                            {edit.sectionChanged !== 'general' && (
                                                                <>
                                                                    <span className="text-gray-300">•</span>
                                                                    <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                                                                        {SECTION_LABELS[edit.sectionChanged]}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                <p className="text-xs text-gray-400 text-center">
                    Showing last {Math.min(history.length, 50)} changes
                </p>
            </div>
        </div>
    );
}
