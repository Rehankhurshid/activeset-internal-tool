'use client';

import { useEffect, useState, type ReactNode } from 'react';
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
import {
    CONTRACT_MARKDOWN_TEMPLATE,
    CONTRACT_AI_FORMAT_INSTRUCTIONS,
    parseContractMarkdown,
    type ParsedContractMarkdown,
} from '../utils/markdownContract';

/**
 * What a document type contributes to the compose flow. The dialog itself is
 * document-agnostic — it only knows how to edit text, parse it and hand the
 * result back.
 */
export interface MarkdownComposeSpec<TDeclared> {
    template: string;
    aiInstructions: string;
    parse: (md: string) => { proposal: Proposal; warnings: string[]; declared: TDeclared };
    description: ReactNode;
    /** Accessible name for the textarea. */
    label: string;
    /** Copy on the toast shown after "Copy AI Instructions". */
    aiToast: string;
    parseErrorToast: string;
}

export const PROPOSAL_COMPOSE_SPEC: MarkdownComposeSpec<ParsedProposalMarkdown['declared']> = {
    template: PROPOSAL_MARKDOWN_TEMPLATE,
    aiInstructions: AI_FORMAT_INSTRUCTIONS,
    parse: parseProposalMarkdown,
    label: 'Proposal markdown',
    aiToast: 'AI instructions copied — paste them into any AI along with your notes',
    parseErrorToast: 'Could not parse the markdown document',
    description: (
        <>
            Write the whole proposal as one markdown document — every field is supported:
            overview, about us, pricing (incl. hourly items), payment terms, timeline
            (incl. dates and dependencies), terms, signatures, status and hero image.
            Pricing and timeline rows use <code>- Name | value | description</code>. Use{' '}
            <em>Copy AI Instructions</em> to get a prompt you can paste into any AI with
            your meeting notes — it returns the document in this exact format.
        </>
    ),
};

export const CONTRACT_COMPOSE_SPEC: MarkdownComposeSpec<ParsedContractMarkdown['declared']> = {
    template: CONTRACT_MARKDOWN_TEMPLATE,
    aiInstructions: CONTRACT_AI_FORMAT_INSTRUCTIONS,
    parse: parseContractMarkdown,
    label: 'Agreement markdown',
    aiToast: 'AI instructions copied — paste them into any AI along with your call notes',
    parseErrorToast: 'Could not parse the markdown agreement',
    description: (
        <>
            Write the whole retainer agreement as one markdown document. Everything is
            optional — anything you leave out falls back to the standard ActiveSet
            template, so the commercial terms alone are enough to get a full draft.
            Preamble keys cover <code>Effective</code>, <code>Retainer</code>,{' '}
            <code>Lock-in</code>, <code>Governing Law</code> and <code>Jurisdiction</code>;{' '}
            <code>## Client</code> / <code>## Agency</code> hold the parties. Under{' '}
            <code>## Clauses</code>, a <code>### Heading</code> matching a standard clause
            replaces its wording, anything else is added, and <code>[remove]</code> drops
            one.
        </>
    ),
};

interface ComposeMarkdownDialogProps<TDeclared> {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreate: (proposal: Proposal, declared: TDeclared) => void;
    /** Which document type this dialog composes. */
    spec: MarkdownComposeSpec<TDeclared>;
    /** Pre-fill with an existing document's markdown (re-edit mode). */
    initialMarkdown?: string;
    dialogTitle?: string;
    submitLabel?: string;
}

// Write (or paste) one markdown document and turn it into a full draft.
// Section headings map to the document's sections; the result opens in the
// regular editor for fine-tuning before saving. With initialMarkdown set it
// doubles as a re-edit surface for an existing record.
function ComposeMarkdownDialog<TDeclared>({
    open,
    onOpenChange,
    onCreate,
    spec,
    initialMarkdown,
    dialogTitle = 'Compose from Markdown',
    submitLabel = 'Create Proposal',
}: ComposeMarkdownDialogProps<TDeclared>) {
    const [markdown, setMarkdown] = useState(spec.template);

    // Refresh the document each time the dialog opens so re-edit mode always
    // reflects the record's latest state.
    useEffect(() => {
        if (open) setMarkdown(initialMarkdown ?? spec.template);
    }, [open, initialMarkdown, spec.template]);

    const handleCreate = () => {
        try {
            const { proposal, warnings, declared } = spec.parse(markdown);
            warnings.forEach(w => toast.warning(w));
            onCreate(proposal, declared);
            onOpenChange(false);
        } catch (error) {
            console.error('Error parsing markdown document:', error);
            toast.error(spec.parseErrorToast);
        }
    };

    // The full format spec as a prompt for an external AI: paste it into
    // ChatGPT/Claude together with meeting notes, paste the result back here.
    const handleCopyAiInstructions = async () => {
        try {
            await navigator.clipboard.writeText(spec.aiInstructions);
            toast.success(spec.aiToast);
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
                    <DialogDescription>{spec.description}</DialogDescription>
                </DialogHeader>

                <textarea
                    value={markdown}
                    onChange={e => setMarkdown(e.target.value)}
                    spellCheck={false}
                    aria-label={spec.label}
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
}

export default ComposeMarkdownDialog;
