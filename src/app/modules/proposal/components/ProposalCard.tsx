'use client';

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Edit3, Share2, Trash2, Loader2 } from "lucide-react";
import { Proposal } from "../types/Proposal";
import { getStatusColor } from "../utils/proposalUtils";

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
    return (
        <Card className="hover:shadow-md transition-shadow bg-card border-border text-card-foreground">
            <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex-1">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold text-card-foreground">{proposal.title}</h3>
                            <Badge className={getStatusColor(proposal.status)}>
                                {proposal.status}
                            </Badge>
                        </div>
                        <p className="text-muted-foreground mb-2">Client: {proposal.clientName}</p>
                        <p className="text-sm text-muted-foreground">
                            Created: {new Date(proposal.createdAt).toLocaleDateString()} •
                            Updated: {new Date(proposal.updatedAt).toLocaleDateString()}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onView(proposal)}
                            className="flex items-center gap-1"
                        >
                            <FileText className="w-4 h-4" />
                            View
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onEdit(proposal)}
                            className="flex items-center gap-1"
                        >
                            <Edit3 className="w-4 h-4" />
                            Edit
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onShare(proposal.id)}
                            disabled={actionLoading === `share-${proposal.id}`}
                            className="flex items-center gap-1"
                        >
                            {actionLoading === `share-${proposal.id}` ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Share2 className="w-4 h-4" />
                            )}
                            Share
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onDelete(proposal.id)}
                            disabled={actionLoading === proposal.id}
                            className="flex items-center gap-1 text-destructive hover:text-destructive/80"
                        >
                            {actionLoading === proposal.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Trash2 className="w-4 h-4" />
                            )}
                            Delete
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
