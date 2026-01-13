'use client';

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Pencil, Share2, Trash2, Loader2, MoreVertical, XCircle, RotateCcw } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Proposal } from "../types/Proposal";
import { getStatusColor } from "../utils/proposalUtils";

interface ProposalCardProps {
    proposal: Proposal;
    actionLoading: string | null;
    onView: (proposal: Proposal) => void;
    onEdit: (proposal: Proposal) => void;
    onShare: (proposalId: string) => void;
    onDelete: (proposalId: string) => void;
    onStatusChange: (proposalId: string, status: Proposal['status']) => void;
}

export default function ProposalCard({
    proposal,
    actionLoading,
    onView,
    onEdit,
    onShare,
    onDelete,
    onStatusChange
}: ProposalCardProps) {
    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    };

    return (
        <Card className="group bg-card hover:shadow-lg transition-all duration-200 border-border/50 hover:border-border overflow-hidden">
            <CardContent className="p-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                    <Badge variant="outline" className={`text-xs ${getStatusColor(proposal.status)}`}>
                        {proposal.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(proposal.updatedAt)}</span>
                </div>

                {/* Title */}
                <h3
                    className="font-semibold text-foreground mb-1 line-clamp-2 cursor-pointer hover:text-primary transition-colors"
                    onClick={() => onView(proposal)}
                >
                    {proposal.title}
                </h3>

                {/* Client */}
                <p className="text-sm text-muted-foreground truncate">
                    {proposal.clientName}
                </p>

                {/* Created By */}
                {proposal.createdBy && (
                    <p className="text-xs text-muted-foreground/70 truncate mb-4">
                        Created by {proposal.createdBy.displayName || proposal.createdBy.email}
                    </p>
                )}
                {!proposal.createdBy && <div className="mb-4" />}

                {/* Action Buttons - Always Visible */}
                <div className="flex items-center gap-1 pt-3 border-t border-border/50">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 flex-1 gap-1"
                        onClick={() => onView(proposal)}
                    >
                        <Eye className="w-3.5 h-3.5" />
                        View
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 flex-1 gap-1"
                        onClick={() => onEdit(proposal)}
                    >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 flex-1 gap-1"
                        onClick={() => onShare(proposal.id)}
                        disabled={actionLoading === `share-${proposal.id}`}
                    >
                        {actionLoading === `share-${proposal.id}` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <Share2 className="w-3.5 h-3.5" />
                        )}
                        Share
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                <MoreVertical className="w-4 h-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {proposal.status !== 'lost' && (
                                <DropdownMenuItem onClick={() => onStatusChange(proposal.id, 'lost')}>
                                    <XCircle className="w-4 h-4 mr-2" />
                                    Mark as Lost
                                </DropdownMenuItem>
                            )}
                            {proposal.status === 'lost' && (
                                <DropdownMenuItem onClick={() => onStatusChange(proposal.id, 'draft')}>
                                    <RotateCcw className="w-4 h-4 mr-2" />
                                    Restore to Draft
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => onDelete(proposal.id)}
                                disabled={actionLoading === proposal.id}
                                className="text-destructive focus:text-destructive"
                            >
                                {actionLoading === proposal.id ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <Trash2 className="w-4 h-4 mr-2" />
                                )}
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardContent>
        </Card>
    );
}
