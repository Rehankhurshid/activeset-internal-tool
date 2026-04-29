'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Search, Check } from 'lucide-react';
import { toast } from 'sonner';
import { proposalService } from '@/app/modules/proposal/services/ProposalService';
import { projectLinksRepository } from '@/modules/project-links/infrastructure/project-links.repository';
import type { Proposal } from '@/app/modules/proposal/types/Proposal';

interface LinkProposalDialogProps {
  projectId: string;
  currentProposalId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: (proposalId: string | null) => void;
}

const STATUS_RANK: Record<Proposal['status'], number> = {
  approved: 0,
  sent: 1,
  draft: 2,
  rejected: 3,
  lost: 4,
};

export function LinkProposalDialog({
  projectId,
  currentProposalId,
  open,
  onOpenChange,
  onLinked,
}: LinkProposalDialogProps) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setLoading(true);
    proposalService
      .getProposals()
      .then((items) => setProposals(items))
      .catch((err) => {
        console.error(err);
        toast.error('Failed to load proposals');
      })
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...proposals].sort((a, b) => {
      const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (r !== 0) return r;
      return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
    });
    if (!q) return sorted;
    return sorted.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.clientName ?? '').toLowerCase().includes(q)
    );
  }, [proposals, search]);

  const handlePick = async (proposalId: string) => {
    setSubmitting(proposalId);
    try {
      await projectLinksRepository.updateProjectProposalId(projectId, proposalId);
      toast.success('Proposal linked');
      onLinked(proposalId);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to link');
    } finally {
      setSubmitting(null);
    }
  };

  const handleUnlink = async () => {
    setSubmitting('__unlink');
    try {
      await projectLinksRepository.updateProjectProposalId(projectId, null);
      toast.success('Proposal unlinked');
      onLinked(null);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to unlink');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Link a proposal</DialogTitle>
          <DialogDescription>
            Connect this project to a proposal so its payment template can be imported as
            invoice slots in one click.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title or client…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="max-h-[420px] overflow-y-auto space-y-2 -mx-1 px-1">
            {loading ? (
              <>
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </>
            ) : filtered.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                {search.trim() ? 'No proposals match your search.' : 'No proposals yet.'}
              </div>
            ) : (
              filtered.map((proposal) => {
                const isCurrent = proposal.id === currentProposalId;
                const hasTerms = Boolean(proposal.data?.paymentTerms);
                const submittingThis = submitting === proposal.id;
                return (
                  <div
                    key={proposal.id}
                    className={`flex items-center justify-between gap-3 p-3 rounded-md border ${
                      isCurrent ? 'border-primary bg-primary/5' : 'bg-background'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{proposal.title}</span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {proposal.status}
                        </Badge>
                        {hasTerms && (
                          <Badge variant="secondary" className="text-xs">
                            Has payment terms
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {proposal.clientName || 'No client'} · updated{' '}
                        {proposal.updatedAt
                          ? new Date(proposal.updatedAt).toLocaleDateString()
                          : '—'}
                      </div>
                    </div>
                    {isCurrent ? (
                      <Badge variant="secondary" className="gap-1">
                        <Check className="h-3 w-3" />
                        Linked
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handlePick(proposal.id)}
                        disabled={Boolean(submitting)}
                      >
                        {submittingThis ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Link
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter>
          {currentProposalId && (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive mr-auto"
              onClick={handleUnlink}
              disabled={Boolean(submitting)}
            >
              {submitting === '__unlink' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Unlink current
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
