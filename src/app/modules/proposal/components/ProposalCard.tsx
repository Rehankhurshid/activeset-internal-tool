'use client';

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Pencil, Share2, Trash2, Loader2, MoreHorizontal } from "lucide-react";
import { Proposal } from "../types/Proposal";
import { getStatusColor } from "../utils/proposalUtils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ProposalCardProps {
    proposal: Proposal;
    actionLoading: string | null;
    onView: (proposal: Proposal) => void;
    onEdit: (proposal: Proposal) => void;
    onShare: (proposalId: string) => void;
    onDelete: (proposalId: string) => void;
}

export default function ProposalCard({
    proposal,
    actionLoading,
    onView,
    onEdit,
    onShare,
    onDelete
}: ProposalCardProps) {
    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    };

    return (
        <div className="group flex items-center gap-4 px-4 py-3 rounded-lg bg-card/50 hover:bg-card border border-transparent hover:border-border transition-all duration-200">
            {/* Title & Client */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h3
                        className="font-medium text-foreground truncate cursor-pointer hover:text-primary transition-colors"
                        onClick={() => onView(proposal)}
                    >
                        {proposal.title}
                    </h3>
                    <Badge variant="outline" className={`shrink-0 text-xs ${getStatusColor(proposal.status)}`}>
                        {proposal.status}
                    </Badge>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground">
                    <span className="truncate">{proposal.clientName}</span>
                    <span className="text-muted-foreground/50">•</span>
                    <span className="shrink-0">{formatDate(proposal.updatedAt)}</span>
                </div>
            </div>

            {/* Quick Actions - visible on hover */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onView(proposal)}
                    title="View"
                >
                    <Eye className="w-4 h-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onEdit(proposal)}
                    title="Edit"
                >
                    <Pencil className="w-4 h-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onShare(proposal.id)}
                    disabled={actionLoading === `share-${proposal.id}`}
                    title="Share"
                >
                    {actionLoading === `share-${proposal.id}` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Share2 className="w-4 h-4" />
                    )}
                </Button>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onView(proposal)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Proposal
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEdit(proposal)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit Proposal
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onShare(proposal.id)}>
                            <Share2 className="w-4 h-4 mr-2" />
                            Copy Share Link
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => onDelete(proposal.id)}
                            className="text-destructive focus:text-destructive"
                            disabled={actionLoading === proposal.id}
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
        </div>
    );
}
