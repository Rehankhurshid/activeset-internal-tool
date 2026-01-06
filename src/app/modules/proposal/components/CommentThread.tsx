'use client';

import { useState } from 'react';
import { ProposalComment } from '../types/Proposal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    CheckCircle2,
    MessageCircle,
    CornerDownRight,
    RotateCcw,
    User
} from 'lucide-react';
import { commentService } from '../services/CommentService';

interface CommentThreadProps {
    thread: ProposalComment[];  // First item is root, rest are replies
    currentUserEmail: string;
    currentUserName: string;
    currentUserType: 'agency' | 'client';
    isLocked: boolean;
    onCommentUpdated: () => void;
}

export default function CommentThread({
    thread,
    currentUserEmail,
    currentUserName,
    currentUserType,
    isLocked,
    onCommentUpdated,
}: CommentThreadProps) {
    const [isReplying, setIsReplying] = useState(false);
    const [replyContent, setReplyContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const rootComment = thread[0];
    const replies = thread.slice(1);

    const handleReply = async () => {
        if (!replyContent.trim()) return;

        setIsSubmitting(true);
        try {
            await commentService.replyToComment(
                rootComment,
                replyContent.trim(),
                currentUserName,
                currentUserEmail,
                currentUserType
            );
            setReplyContent('');
            setIsReplying(false);
            onCommentUpdated();
        } catch (error) {
            console.error('Failed to add reply:', error);
            alert('Failed to add reply. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResolve = async () => {
        try {
            await commentService.resolveComment(rootComment.id, currentUserEmail);
            onCommentUpdated();
        } catch (error) {
            console.error('Failed to resolve comment:', error);
            alert('Failed to resolve comment. Please try again.');
        }
    };

    const handleReopen = async () => {
        try {
            await commentService.reopenComment(rootComment.id);
            onCommentUpdated();
        } catch (error) {
            console.error('Failed to reopen comment:', error);
            alert('Failed to reopen comment. Please try again.');
        }
    };

    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
    };

    const isResolved = rootComment.resolved;

    return (
        <div
            className={`rounded-lg border transition-all ${isResolved
                    ? 'bg-gray-50 border-gray-200 opacity-75'
                    : 'bg-white border-gray-200 shadow-sm hover:shadow-md'
                }`}
        >
            {/* Root Comment */}
            <div className="p-4">
                <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${rootComment.authorType === 'agency'
                                ? 'bg-blue-500'
                                : 'bg-green-500'
                            }`}
                    >
                        {rootComment.authorName.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900 text-sm">
                                {rootComment.authorName}
                            </span>
                            <span
                                className={`text-xs px-1.5 py-0.5 rounded ${rootComment.authorType === 'agency'
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-green-100 text-green-700'
                                    }`}
                            >
                                {rootComment.authorType === 'agency' ? 'Agency' : 'Client'}
                            </span>
                            <span className="text-xs text-gray-400">
                                {formatTime(rootComment.createdAt)}
                            </span>
                            {isResolved && (
                                <span className="text-xs text-green-600 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Resolved
                                </span>
                            )}
                        </div>

                        {/* Content */}
                        <p className={`mt-1 text-sm ${isResolved ? 'text-gray-500' : 'text-gray-700'}`}>
                            {rootComment.content}
                        </p>

                        {/* Actions */}
                        {!isLocked && (
                            <div className="flex items-center gap-2 mt-2">
                                {!isResolved && (
                                    <>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs text-gray-500 hover:text-gray-700"
                                            onClick={() => setIsReplying(!isReplying)}
                                        >
                                            <MessageCircle className="w-3 h-3 mr-1" />
                                            Reply
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs text-green-600 hover:text-green-700 hover:bg-green-50"
                                            onClick={handleResolve}
                                        >
                                            <CheckCircle2 className="w-3 h-3 mr-1" />
                                            Resolve
                                        </Button>
                                    </>
                                )}
                                {isResolved && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs text-gray-500 hover:text-gray-700"
                                        onClick={handleReopen}
                                    >
                                        <RotateCcw className="w-3 h-3 mr-1" />
                                        Reopen
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Replies */}
            {replies.length > 0 && (
                <div className="border-t border-gray-100 bg-gray-50/50">
                    {replies.map((reply) => (
                        <div key={reply.id} className="px-4 py-3 border-b border-gray-100 last:border-b-0">
                            <div className="flex items-start gap-3 ml-4">
                                <CornerDownRight className="w-4 h-4 text-gray-300 mt-1 flex-shrink-0" />
                                <div
                                    className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium ${reply.authorType === 'agency'
                                            ? 'bg-blue-400'
                                            : 'bg-green-400'
                                        }`}
                                >
                                    {reply.authorName.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-gray-800 text-xs">
                                            {reply.authorName}
                                        </span>
                                        <span className="text-xs text-gray-400">
                                            {formatTime(reply.createdAt)}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 text-sm text-gray-600">
                                        {reply.content}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Reply Input */}
            {isReplying && !isLocked && (
                <div className="border-t border-gray-200 p-3 bg-gray-50">
                    <div className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-medium">
                            <User className="w-3 h-3" />
                        </div>
                        <div className="flex-1">
                            <Textarea
                                placeholder="Write a reply..."
                                value={replyContent}
                                onChange={(e) => setReplyContent(e.target.value)}
                                className="min-h-[60px] text-sm resize-none"
                                autoFocus
                            />
                            <div className="flex justify-end gap-2 mt-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setIsReplying(false);
                                        setReplyContent('');
                                    }}
                                    disabled={isSubmitting}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleReply}
                                    disabled={!replyContent.trim() || isSubmitting}
                                >
                                    {isSubmitting ? 'Sending...' : 'Reply'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
