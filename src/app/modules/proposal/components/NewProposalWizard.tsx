'use client';

import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Sparkles, ArrowLeft, ArrowRight, RotateCw, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useConfigurations } from '@/hooks/useConfigurations';
import { Proposal } from '../types/Proposal';
import LivePreview from './LivePreview';
import { generateProposalDraft, type DraftProgressEvent } from '../services/aiClient';
import TerminalLoader, { type TerminalLine } from './TerminalLoader';

interface NewProposalWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (proposal: Proposal) => void;
}

type Step = 1 | 2 | 3;

// Build the terminal log from a list of real progress events. Each event
// either appends a new line or flips the previous 'active' line to
// 'done' or 'failed'. No fake timers — what you see is what's happening.
function linesFromEvents(
  events: DraftProgressEvent[],
  args: { clientName: string; website?: string; budget?: string; deadline?: string }
): TerminalLine[] {
  const host = (args.website || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const lines: TerminalLine[] = [
    {
      kind: 'cmd',
      state: 'done',
      text: `activeset-ai draft --client "${args.clientName}"${args.website ? ` --site ${host}` : ''}${args.budget ? ` --budget "${args.budget}"` : ''}${args.deadline ? ` --deadline ${args.deadline}` : ''}`,
    },
    { kind: 'info', state: 'done', text: `routing through vercel ai gateway` },
  ];

  for (const ev of events) {
    switch (ev.stage) {
      case 'gateway-start':
        lines.push({
          kind: 'task',
          state: 'active',
          text: `drafting proposal · scraping site · reasoning · schema-validating ...`,
        });
        break;
      case 'gateway-done':
        markLast(lines, 'done');
        lines.push({
          kind: 'info',
          state: 'done',
          text:
            ev.detail === 'site-context'
              ? `site context used · output validated against zod schema`
              : `no site context · output validated against zod schema`,
        });
        break;
      case 'gateway-failed':
        markLast(lines, 'failed');
        lines.push({ kind: 'warn', state: 'failed', text: ev.detail || 'gateway request failed' });
        break;
      // Ollama fallback stages
      case 'fetch-site':
        lines.push({ kind: 'task', state: 'active', text: `fetching ${host} for context ...` });
        break;
      case 'site-fetched':
        markLast(lines, ev.detail === 'ok' ? 'done' : 'failed');
        break;
      case 'site-skipped':
        lines.push({ kind: 'info', state: 'done', text: `no website provided` });
        break;
      case 'basics-start':
        lines.push({ kind: 'task', state: 'active', text: `local ollama · generating draft ...` });
        break;
      case 'basics-done':
        markLast(lines, 'done');
        break;
      case 'basics-failed':
        markLast(lines, 'failed');
        lines.push({ kind: 'warn', state: 'failed', text: ev.detail || 'basics failed' });
        break;
      case 'pricing-start':
      case 'pricing-done':
      case 'pricing-failed':
      case 'timeline-start':
      case 'timeline-done':
      case 'timeline-failed':
        // no-op in gateway mode; single call covers everything
        break;
    }
  }

  return lines;
}

function markLast(lines: TerminalLine[], state: 'done' | 'failed') {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].state === 'active') {
      lines[i] = { ...lines[i], state };
      return;
    }
  }
}

const BLANK_PROPOSAL = (): Proposal => ({
  id: '',
  title: '',
  clientName: '',
  agencyName: 'ActiveSet',
  status: 'draft',
  createdAt: new Date().toISOString().split('T')[0],
  updatedAt: new Date().toISOString().split('T')[0],
  data: {
    overview: '',
    overviewDetails: { clientDescription: '', services: [], finalDeliverable: '' },
    aboutUs: '',
    pricing: { items: [], total: '' },
    timeline: { phases: [] },
    terms: '',
    signatures: { agency: { name: '', email: '' }, client: { name: '', email: '' } },
  },
});

export default function NewProposalWizard({ open, onOpenChange, onCreate }: NewProposalWizardProps) {
  const { agencies, serviceSnippets, aboutUs, terms } = useConfigurations();

  const [step, setStep] = useState<Step>(1);

  const [clientName, setClientName] = useState('');
  const [agencyId, setAgencyId] = useState<string>('');
  const [clientWebsite, setClientWebsite] = useState('');

  const [meetingNotes, setMeetingNotes] = useState('');
  const [projectBudget, setProjectBudget] = useState('');
  const [projectDeadline, setProjectDeadline] = useState('');

  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<Proposal | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [progressEvents, setProgressEvents] = useState<DraftProgressEvent[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const selectedAgency = agencies.find((a) => a.id === agencyId) || agencies[0];
  const agencyName = selectedAgency?.name || 'ActiveSet';

  const reset = () => {
    setStep(1);
    setClientName('');
    setAgencyId('');
    setClientWebsite('');
    setMeetingNotes('');
    setProjectBudget('');
    setProjectDeadline('');
    setDraft(null);
    setAiError(null);
    setGenerating(false);
  };

  const close = () => {
    onOpenChange(false);
    setTimeout(reset, 200);
  };

  const generate = async () => {
    setGenerating(true);
    setAiError(null);
    setProgressEvents([]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const data = await generateProposalDraft(
        {
          meetingNotes,
          clientName,
          agencyName,
          clientWebsite,
          projectDeadline,
          projectBudget,
        },
        {
          signal: controller.signal,
          onProgress: (event) => setProgressEvents((prev) => [...prev, event]),
        }
      );
      setDraft(
        buildProposalFromAI(data as Record<string, unknown>, {
          clientName,
          agencyName,
          agencyEmail: selectedAgency?.email || '',
          serviceSnippets,
          aboutUs: aboutUs.map((a) => ({ id: a.id, text: a.text })),
          terms: terms.map((t) => ({ id: t.id, text: t.text })),
        })
      );
    } catch (err) {
      if (controller.signal.aborted) {
        setAiError('Cancelled');
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to generate proposal';
        setAiError(msg);
        toast.error(msg);
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  };

  const cancelGeneration = () => {
    abortRef.current?.abort(new DOMException('Cancelled by user', 'AbortError'));
  };

  const handleNext = async () => {
    if (step === 1) {
      if (!clientName.trim()) {
        toast.error('Client name is required');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!meetingNotes.trim()) {
        toast.error('Add some meeting notes so AI has something to work with');
        return;
      }
      setStep(3);
      await generate();
    }
  };

  const handleBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) {
      setStep(2);
      setDraft(null);
    }
  };

  const handleAccept = () => {
    if (!draft) return;
    onCreate(draft);
    close();
  };

  const handleSkipAI = () => {
    const blank = BLANK_PROPOSAL();
    blank.clientName = clientName;
    blank.agencyName = agencyName;
    blank.data.signatures.agency.name = agencyName;
    blank.data.signatures.agency.email = selectedAgency?.email || '';
    onCreate(blank);
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            New Proposal · Step {step} of 3
          </DialogTitle>
          <DialogDescription>
            {step === 1 && 'Who is this proposal for?'}
            {step === 2 && 'Paste your notes — AI will draft the proposal.'}
            {step === 3 && 'Review the draft. Accept to continue editing, or regenerate.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2">
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clientName">Client name *</Label>
                <Input
                  id="clientName"
                  autoFocus
                  placeholder="e.g. Acme Inc."
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="agency">Agency</Label>
                <Select value={agencyId} onValueChange={setAgencyId}>
                  <SelectTrigger id="agency">
                    <SelectValue placeholder={agencies[0]?.name || 'Select agency'} />
                  </SelectTrigger>
                  <SelectContent>
                    {agencies.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientWebsite">Client website (optional)</Label>
                <Input
                  id="clientWebsite"
                  placeholder="https://acme.com"
                  value={clientWebsite}
                  onChange={(e) => setClientWebsite(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">AI uses this to infer industry and tone.</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="notes">Meeting notes / brief *</Label>
                <Textarea
                  id="notes"
                  autoFocus
                  rows={10}
                  placeholder="Paste meeting notes, client brief, or a rough description of the project..."
                  value={meetingNotes}
                  onChange={(e) => setMeetingNotes(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="budget">Budget (optional)</Label>
                  <Input
                    id="budget"
                    placeholder="e.g. $8,000"
                    value={projectBudget}
                    onChange={(e) => setProjectBudget(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deadline">Deadline (optional)</Label>
                  <DatePicker value={projectDeadline} onChange={setProjectDeadline} />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              {generating && (
                <div className="space-y-2">
                  <TerminalLoader
                    active={generating}
                    title={`activeset.ai — draft · ${clientName || 'proposal'}`}
                    lines={linesFromEvents(progressEvents, {
                      clientName: clientName || 'client',
                      website: clientWebsite,
                      budget: projectBudget,
                      deadline: projectDeadline,
                    })}
                  />
                  <div className="flex justify-end">
                    <Button size="sm" variant="ghost" onClick={cancelGeneration}>
                      <X className="w-3 h-3 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              )}

              {!generating && aiError && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-md p-4">
                  <p className="text-sm font-medium text-destructive mb-1">AI generation failed</p>
                  <p className="text-xs text-muted-foreground">{aiError}</p>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={generate}>
                      <RotateCw className="w-3 h-3 mr-1" /> Try again
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleSkipAI}>
                      Skip AI, start blank
                    </Button>
                  </div>
                </div>
              )}

              {!generating && draft && (
                <div className="space-y-2">
                  <div className="rounded-md border overflow-hidden bg-gray-100 max-h-[50vh] overflow-y-auto">
                    <LivePreview proposal={draft} />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    This is a preview. You&apos;ll be able to edit everything in the next step.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row sm:justify-between gap-2 border-t pt-3">
          <div>
            {step > 1 && (
              <Button variant="ghost" onClick={handleBack} disabled={generating}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>

            {step === 1 && (
              <Button onClick={handleNext}>
                Next <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}
            {step === 2 && (
              <Button onClick={handleNext}>
                <Sparkles className="w-4 h-4 mr-1" /> Generate draft
              </Button>
            )}
            {step === 3 && draft && !generating && (
              <>
                <Button variant="outline" onClick={generate}>
                  <RotateCw className="w-4 h-4 mr-1" /> Regenerate
                </Button>
                <Button onClick={handleAccept}>
                  <Check className="w-4 h-4 mr-1" /> Looks good, edit
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Map the /api/ai-gen response shape into a full Proposal object.
function buildProposalFromAI(
  ai: Record<string, unknown>,
  ctx: {
    clientName: string;
    agencyName: string;
    agencyEmail: string;
    serviceSnippets: { [key: string]: string };
    aboutUs: { id: string; text: string }[];
    terms: { id: string; text: string }[];
  }
): Proposal {
  const p = BLANK_PROPOSAL();
  const data = p.data;

  p.title = (ai.title as string) || 'Website Proposal';
  p.clientName = (ai.clientName as string) || ctx.clientName;
  p.agencyName = ctx.agencyName;

  const clientDescription = (ai.clientDescription as string) || '';
  const finalDeliverable = (ai.finalDeliverable as string) || '';
  const serviceKeys = Array.isArray(ai.serviceKeys) ? (ai.serviceKeys as string[]) : [];
  const services = serviceKeys.map((k) => ctx.serviceSnippets[k] || k);

  data.overviewDetails = { clientDescription, services, finalDeliverable };

  const parts: string[] = [];
  if (clientDescription) parts.push(clientDescription);
  if (services.length) parts.push(services.map((s) => `• ${s}`).join('\n'));
  if (finalDeliverable) parts.push(finalDeliverable);
  data.overview = parts.join('\n\n') || (ai.overview as string) || '';

  const aboutId = ai.aboutUsTemplateId as string | undefined;
  const aboutMatch = aboutId ? ctx.aboutUs.find((a) => a.id === aboutId) : null;
  data.aboutUs = aboutMatch?.text || ctx.aboutUs[0]?.text || '';
  data.terms = ctx.terms[0]?.text || '';

  const pricingItems = Array.isArray(ai.pricingItems) ? (ai.pricingItems as Array<Record<string, unknown>>) : [];
  data.pricing.items = pricingItems.map((it) => ({
    name: String(it.name || ''),
    description: String(it.description || ''),
    price: String(it.price || ''),
  }));
  data.pricing.total = (ai.pricingTotal as string) || '';

  const phases = Array.isArray(ai.timelinePhases) ? (ai.timelinePhases as Array<Record<string, unknown>>) : [];
  data.timeline.phases = phases.map((ph) => ({
    title: String(ph.title || ''),
    description: String(ph.description || ''),
    duration: String(ph.duration || ''),
    startDate: ph.startDate ? String(ph.startDate) : undefined,
    endDate: ph.endDate ? String(ph.endDate) : undefined,
  }));

  data.signatures.agency.name = ctx.agencyName;
  data.signatures.agency.email = ctx.agencyEmail;
  data.signatures.client.name = p.clientName;

  return p;
}
