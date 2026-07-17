'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileCode2, ArrowRight, Clipboard } from 'lucide-react';
import { toast } from 'sonner';
import { Proposal } from '../types/Proposal';
import {
    PROPOSAL_MARKDOWN_TEMPLATE,
    AI_FORMAT_INSTRUCTIONS,
    parseProposalMarkdown,
    type ParsedProposalMarkdown,
} from '../utils/markdownProposal';

interface ComposeMarkdownDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreate: (proposal: Proposal, declared: ParsedProposalMarkdown['declared']) => void;
    /** Pre-fill with an existing proposal's markdown (re-edit mode). */
    initialMarkdown?: string;
    dialogTitle?: string;
    submitLabel?: string;
}

// Write (or paste) one markdown document and turn it into a full proposal
// draft. Section headings map to proposal sections; the result opens in the
// regular editor for fine-tuning before saving. With initialMarkdown set it
// doubles as a re-edit surface for an existing proposal.
const ComposeMarkdownDialog = ({
    open,
    onOpenChange,
    onCreate,
    initialMarkdown,
    dialogTitle = 'Compose from Markdown',
    submitLabel = 'Create Proposal',
}: ComposeMarkdownDialogProps) => {
    const [markdown, setMarkdown] = useState(PROPOSAL_MARKDOWN_TEMPLATE);

    // Refresh the document each time the dialog opens so re-edit mode always
    // reflects the proposal's latest state.
    useEffect(() => {
        if (open) setMarkdown(initialMarkdown ?? PROPOSAL_MARKDOWN_TEMPLATE);
    }, [open, initialMarkdown]);

    const handleCreate = () => {
        try {
            const { proposal, warnings, declared } = parseProposalMarkdown(markdown);
            warnings.forEach(w => toast.warning(w));
            onCreate(proposal, declared);
            onOpenChange(false);
        } catch (error) {
            console.error('Error parsing proposal markdown:', error);
            toast.error('Could not parse the markdown document');
        }
    };

    // The full format spec as a prompt for an external AI: paste it into
    // ChatGPT/Claude together with meeting notes, paste the result back here.
    const handleCopyAiInstructions = async () => {
        try {
            await navigator.clipboard.writeText(AI_FORMAT_INSTRUCTIONS);
            toast.success('AI instructions copied — paste them into any AI along with your notes');
        } catch (error) {
            console.error('Clipboard write failed:', error);
            toast.error('Could not copy to clipboard');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileCode2 className="w-5 h-5" />
                        {dialogTitle}
                    </DialogTitle>
                    <DialogDescription>
                        Write the whole proposal as one markdown document — every field is supported:
                        overview, about us, pricing (incl. hourly items), payment terms, timeline
                        (incl. dates and dependencies), terms, signatures, status and hero image.
                        Pricing and timeline rows use <code>- Name | value | description</code>. Use{' '}
                        <em>Copy AI Instructions</em> to get a prompt you can paste into any AI with
                        your meeting notes — it returns the document in this exact format.
                    </DialogDescription>
                </DialogHeader>

                <textarea
                    value={markdown}
                    onChange={e => setMarkdown(e.target.value)}
                    spellCheck={false}
                    aria-label="Proposal markdown"
                    className="w-full h-[420px] max-h-[55vh] rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none resize-y focus-visible:ring-1 focus-visible:ring-ring"
                />

                <DialogFooter className="sm:justify-between">
                    <Button variant="ghost" onClick={handleCopyAiInstructions} className="gap-2">
                        <Clipboard className="w-4 h-4" />
                        Copy AI Instructions
                    </Button>
                    <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreate} className="gap-2">
                            {submitLabel}
                            <ArrowRight className="w-4 h-4" />
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ComposeMarkdownDialog;
