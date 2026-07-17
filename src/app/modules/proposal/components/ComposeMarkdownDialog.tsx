'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileCode2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Proposal } from '../types/Proposal';
import { PROPOSAL_MARKDOWN_TEMPLATE, parseProposalMarkdown } from '../utils/markdownProposal';

interface ComposeMarkdownDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreate: (proposal: Proposal) => void;
}

// Write (or paste) one markdown document and turn it into a full proposal
// draft. Section headings map to proposal sections; the result opens in the
// regular editor for fine-tuning before saving.
const ComposeMarkdownDialog = ({ open, onOpenChange, onCreate }: ComposeMarkdownDialogProps) => {
    const [markdown, setMarkdown] = useState(PROPOSAL_MARKDOWN_TEMPLATE);

    const handleCreate = () => {
        try {
            const { proposal, warnings } = parseProposalMarkdown(markdown);
            warnings.forEach(w => toast.warning(w));
            onCreate(proposal);
            onOpenChange(false);
        } catch (error) {
            console.error('Error parsing proposal markdown:', error);
            toast.error('Could not parse the markdown document');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileCode2 className="w-5 h-5" />
                        Compose from Markdown
                    </DialogTitle>
                    <DialogDescription>
                        Write the whole proposal as one markdown document. <code>## Overview</code>,{' '}
                        <code>## About Us</code>, <code>## Pricing</code>, <code>## Timeline</code> and{' '}
                        <code>## Terms</code> become proposal sections; pricing and timeline rows use{' '}
                        <code>- Name | value | description</code>. You can fine-tune everything in the
                        editor afterwards.
                    </DialogDescription>
                </DialogHeader>

                <textarea
                    value={markdown}
                    onChange={e => setMarkdown(e.target.value)}
                    spellCheck={false}
                    aria-label="Proposal markdown"
                    className="w-full h-[420px] max-h-[55vh] rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none resize-y focus-visible:ring-1 focus-visible:ring-ring"
                />

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleCreate} className="gap-2">
                        Create Proposal
                        <ArrowRight className="w-4 h-4" />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ComposeMarkdownDialog;
