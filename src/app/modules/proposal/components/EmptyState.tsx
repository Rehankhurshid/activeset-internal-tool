'use client';

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Plus } from "lucide-react";

interface EmptyStateProps {
    onCreateProposal: () => void;
}

export default function EmptyState({ onCreateProposal }: EmptyStateProps) {
    return (
        <Card className="text-center py-12 bg-card border-border text-card-foreground">
            <CardContent>
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-card-foreground mb-2">No proposals yet</h3>
                <p className="text-muted-foreground mb-4">Get started by creating your first proposal</p>
                <Button onClick={onCreateProposal}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Proposal
                </Button>
            </CardContent>
        </Card>
    );
}
