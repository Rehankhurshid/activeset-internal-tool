'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProposalComment, ProposalSectionId } from '../types/Proposal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    MessageSquare,
    X,
    Plus,
    Filter,
    ChevronDown,
    Lock
} from 'lucide-react';
import { commentService } from '../services/CommentService';
import CommentThread from './CommentThread';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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

interface CommentSidebarProps {
    proposalId: string;
    isOpen: boolean;
    onClose: () => void;
    isPublic: boolean;
    isLocked: boolean;
    currentUserName: string;
    currentUserEmail: string;
    currentUserType: 'agency' | 'client';
    activeSection?: ProposalSectionId;  // Highlight/scroll to this section
}

type FilterType = 'all' | 'open' | 'resolved';

export default function CommentSidebar({
    proposalId,
    isOpen,
    onClose,
    isPublic,
    isLocked,
    currentUserName,
    currentUserEmail,
    currentUserType,
    activeSection,
}: CommentSidebarProps) {
    const [comments, setComments] = useState<ProposalComment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<FilterType>('all');
    const [isAddingComment, setIsAddingComment] = useState(false);
    const [newCommentContent, setNewCommentContent] = useState('');
    const [newCommentSection, setNewCommentSection] = useState<ProposalSectionId>(activeSection || 'general');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Load comments and subscribe to real-time updates
    useEffect(() => {
        if (!proposalId) return;

        setIsLoading(true);

        // Subscribe to real-time updates
        const unsubscribe = commentService.subscribeToComments(proposalId, (updatedComments) => {
            setComments(updatedComments);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [proposalId]);

    // Update section when activeSection changes
    useEffect(() => {
        if (activeSection) {
            setNewCommentSection(activeSection);
        }
    }, [activeSection]);

    const refreshComments = useCallback(async () => {
        try {
            const fetchedComments = await commentService.getComments(proposalId);
            setComments(fetchedComments);
        } catch (error) {
            console.error('Failed to refresh comments:', error);
        }
    }, [proposalId]);

    const handleAddComment = async () => {
        if (!newCommentContent.trim()) return;

        setIsSubmitting(true);
        try {
            await commentService.addComment({
                proposalId,
                sectionId: newCommentSection,
                authorName: currentUserName,
                authorEmail: currentUserEmail,
                authorType: currentUserType,
                content: newCommentContent.trim(),
            });
            setNewCommentContent('');
            setIsAddingComment(false);
            await refreshComments();
        } catch (error) {
            console.error('Failed to add comment:', error);
            alert('Failed to add comment. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Filter comments
    const filteredComments = comments.filter(comment => {
        if (filter === 'open') return !comment.resolved && !comment.parentId;
        if (filter === 'resolved') return comment.resolved && !comment.parentId;
        return !comment.parentId; // 'all' - show only root comments
    });

    // Build threads
    const threads = commentService.buildCommentThreads(
        filter === 'all'
            ? comments
            : comments.filter(c => {
                if (filter === 'open') return !c.resolved || c.parentId;
                if (filter === 'resolved') return c.resolved || c.parentId;
                return true;
            })
    ).filter(thread => {
        if (filter === 'open') return !thread[0].resolved;
        if (filter === 'resolved') return thread[0].resolved;
        return true;
    });

    // Group threads by section
    const threadsBySection = threads.reduce((acc, thread) => {
        const section = thread[0].sectionId;
        if (!acc[section]) acc[section] = [];
        acc[section].push(thread);
        return acc;
    }, {} as Record<ProposalSectionId, ProposalComment[][]>);

    // Count stats
    const openCount = comments.filter(c => !c.resolved && !c.parentId).length;
    const resolvedCount = comments.filter(c => c.resolved && !c.parentId).length;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-full sm:w-96 bg-white shadow-2xl z-[60] flex flex-col border-l border-gray-200">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-gray-600" />
                    <h2 className="font-semibold text-gray-900">Comments</h2>
                    {openCount > 0 && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                            {openCount} open
                        </Badge>
                    )}
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

            {/* Locked Banner */}
            {isLocked && (
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-sm text-amber-700">
                    <Lock className="w-4 h-4" />
                    <span>This proposal is signed. Comments are read-only.</span>
                </div>
            )}

            {/* Filter Tabs */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
                <div className="flex gap-1">
                    {(['all', 'open', 'resolved'] as FilterType[]).map((f) => (
                        <Button
                            key={f}
                            variant={filter === f ? 'default' : 'ghost'}
                            size="sm"
                            className={`h-7 text-xs capitalize ${filter === f ? '' : 'text-gray-500'
                                }`}
                            onClick={() => setFilter(f)}
                        >
                            {f}
                            {f === 'open' && openCount > 0 && ` (${openCount})`}
                            {f === 'resolved' && resolvedCount > 0 && ` (${resolvedCount})`}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Add Comment Button */}
            {!isLocked && !isAddingComment && (
                <div className="px-4 py-3 border-b border-gray-100">
                    <Button
                        variant="outline"
                        className="w-full justify-start text-gray-500 hover:text-gray-700"
                        onClick={() => setIsAddingComment(true)}
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add a comment...
                    </Button>
                </div>
            )}

            {/* New Comment Form */}
            {!isLocked && isAddingComment && (
                <div className="px-4 py-3 border-b border-gray-200 bg-blue-50/50">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">Section:</span>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-7 text-xs bg-white text-gray-800 border-blue-300">
                                        {SECTION_LABELS[newCommentSection]}
                                        <ChevronDown className="w-3 h-3 ml-1" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="bg-white">
                                    {Object.entries(SECTION_LABELS).map(([id, label]) => (
                                        <DropdownMenuItem
                                            key={id}
                                            onClick={() => setNewCommentSection(id as ProposalSectionId)}
                                            className="text-gray-800"
                                        >
                                            {label}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            {activeSection && (
                                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-md">
                                    Commenting on: {SECTION_LABELS[activeSection]}
                                </span>
                            )}
                        </div>
                        <Textarea
                            placeholder="Write your comment..."
                            value={newCommentContent}
                            onChange={(e) => setNewCommentContent(e.target.value)}
                            className="min-h-[80px] resize-none bg-white text-gray-900 border-gray-300 placeholder:text-gray-400"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setIsAddingComment(false);
                                    setNewCommentContent('');
                                }}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleAddComment}
                                disabled={!newCommentContent.trim() || isSubmitting}
                            >
                                {isSubmitting ? 'Adding...' : 'Add Comment'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Comments List */}
            <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                    <div className="flex items-center justify-center h-32 text-gray-400">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400" />
                    </div>
                ) : threads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-gray-400 px-4 text-center">
                        <MessageSquare className="w-12 h-12 mb-3 text-gray-300" />
                        <p className="text-sm">
                            {filter === 'all'
                                ? 'No comments yet'
                                : `No ${filter} comments`}
                        </p>
                        {filter === 'all' && !isLocked && (
                            <p className="text-xs mt-1">
                                Click &quot;Add a comment&quot; to start a discussion
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="p-4 space-y-6">
                        {Object.entries(threadsBySection).map(([sectionId, sectionThreads]) => (
                            <div key={sectionId}>
                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                                    {SECTION_LABELS[sectionId as ProposalSectionId]}
                                </h3>
                                <div className="space-y-3">
                                    {sectionThreads.map((thread) => (
                                        <CommentThread
                                            key={thread[0].id}
                                            thread={thread}
                                            currentUserEmail={currentUserEmail}
                                            currentUserName={currentUserName}
                                            currentUserType={currentUserType}
                                            isLocked={isLocked}
                                            onCommentUpdated={refreshComments}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
