'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAssignees } from '@/hooks/useAssignees';
import { todayIso } from '@/lib/review-status';
import { AGENCY_CLOSE, AGENCY_START, SOP_TEMPLATES } from '@/lib/sop-templates';
import { ENGAGEMENTS, SERVICE_LABELS, orderServices, pickServiceTemplates } from '@/lib/engagements';
import {
  CLIENT_STAGE_DEFAULTS,
  MASTER_TEMPLATE_COPY_URL,
  checklistProcess,
  draftClientPlan,
  planStageKinds,
  type PlanSection,
} from '@/modules/client-portal';
import { checklistService } from '@/services/ChecklistService';
import { cn } from '@/lib/utils';
import {
  PROJECT_TAG_LABELS,
  type ChecklistSection,
  type ProjectTag,
  type SOPTemplate,
  type SOPTemplateSection,
  type ServiceId,
} from '@/types';
import { projectLinksRepository } from '../../infrastructure/project-links.repository';

const NONE = '__none__';
/** The engagement picker's "something else": the old one-checklist picker. */
const OTHER = '__other__';
const FORM_ID = 'new-project-form';
/** How the work is contracted. Not what is being made: that is the engagement picker above it. */
const CONTRACT_TAGS: ProjectTag[] = ['one_time', 'retainer', 'subscription', 'maintenance', 'consulting'];

/** Accepts commas, semicolons, spaces or newlines between addresses. */
function splitEmails(raw: string): string[] {
  return Array.from(new Set(raw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)));
}

/**
 * The sections a new checklist from this template will have: the agency's own
 * start and close around the template, as `createChecklist` wraps them. The
 * plan is drafted from these so the client's stages match the checklist that
 * will track them.
 */
function sectionsFor(templates: SOPTemplate[]): PlanSection[] {
  return templates.length ? [AGENCY_START, ...templates.flatMap((t) => t.sections), AGENCY_CLOSE] : [];
}

/**
 * The process the client will see, as the checklist these SOPs make will give
 * it: each stage and how many steps are in it. Built the way `createChecklist`
 * builds the checklist, so the preview cannot promise what the project lacks.
 */
function processPreview(templates: SOPTemplate[]): { title: string; steps: number }[] {
  if (templates.length === 0) return [];
  const stamped = (t: SOPTemplate): Omit<SOPTemplateSection, 'order'>[] =>
    t.sections.map((s) => ({ ...s, clientStage: s.clientStage || (t.service ? SERVICE_LABELS[t.service] : undefined) }));
  const sections = [AGENCY_START, ...templates.flatMap(stamped), AGENCY_CLOSE].map(
    (s, i): ChecklistSection => ({ ...s, id: `p${i}`, order: i, items: s.items.map((it, j) => ({ ...it, id: `p${i}_${j}` })) }),
  );
  return checklistProcess([{ sections, templateId: '', templateIds: [], createdAt: new Date(0) }]).map((stage) => ({
    title: stage.stage.title,
    steps: stage.steps.length,
  }));
}

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userEmail: string;
  /** Client names already in use, offered as suggestions so projects group together. */
  clients: string[];
  onCreated: (projectId: string, name: string) => void;
}

/**
 * A new project, set up once: who it is for, what kind of project it is (which
 * picks the checklist), when it runs, who leads it, and the plan the client
 * will see. Only the name is required; everything else can be filled in later.
 */
export function NewProjectDialog({ open, onOpenChange, userId, userEmail, clients, onCreated }: NewProjectDialogProps) {
  const { assignees } = useAssignees();
  const [templates, setTemplates] = useState<SOPTemplate[]>(() => SOP_TEMPLATES.map((t) => ({ ...t, isBuiltIn: true })));

  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [templateId, setTemplateId] = useState<string>(NONE);
  /** One of ENGAGEMENTS, OTHER for a single checklist of the team's choosing, or NONE. */
  const [engagementId, setEngagementId] = useState<string>(NONE);
  const [withCopy, setWithCopy] = useState(false);
  /** Which SOP a service uses, where more than one is tagged with it. */
  const [chosen, setChosen] = useState<Partial<Record<ServiceId, string>>>({});
  const [startDate, setStartDate] = useState(() => todayIso());
  const [endDate, setEndDate] = useState('');
  const [engagement, setEngagement] = useState<string>(NONE);
  const [lead, setLead] = useState(userEmail);
  const [contacts, setContacts] = useState('');
  const [makePlan, setMakePlan] = useState(true);
  const [creating, setCreating] = useState(false);

  // Custom templates live in Firestore; the built-ins are there from the start
  // so the dialog works even when that read is slow or fails.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    checklistService
      .getSOPTemplates()
      .then((all) => {
        if (!cancelled && all.length > 0) setTemplates(all);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    setName('');
    setClient('');
    setTemplateId(NONE);
    setEngagementId(NONE);
    setWithCopy(false);
    setChosen({});
    setStartDate(todayIso());
    setEndDate('');
    setEngagement(NONE);
    setLead(userEmail);
    setContacts('');
    setMakePlan(true);
  }, [open, userEmail]);

  const engagementPicked = ENGAGEMENTS.find((e) => e.id === engagementId);
  const services = useMemo(
    () => (engagementPicked ? orderServices([...engagementPicked.services, ...(withCopy ? ['copy'] : [])]) : []),
    [engagementPicked, withCopy],
  );
  const picks = useMemo(() => pickServiceTemplates(services, templates, chosen), [services, templates, chosen]);
  const template = engagementId === OTHER ? templates.find((t) => t.id === templateId) : undefined;
  // The checklist this project will run on: one SOP per service bought, in working order.
  const chosenTemplates = useMemo(
    () =>
      engagementPicked
        ? picks.map((p) => p.template).filter((t): t is SOPTemplate => !!t)
        : template
          ? [template]
          : [],
    [engagementPicked, picks, template],
  );
  const process = useMemo(() => (engagementPicked ? processPreview(chosenTemplates) : []), [engagementPicked, chosenTemplates]);
  const stagePreview = useMemo(
    () => planStageKinds(sectionsFor(chosenTemplates)).map((kind) => CLIENT_STAGE_DEFAULTS[kind].title),
    [chosenTemplates],
  );
  const leads = useMemo(
    () => Array.from(new Set([userEmail, ...assignees].map((e) => e.trim().toLowerCase()).filter(Boolean))).sort(),
    [assignees, userEmail],
  );
  const backwards = Boolean(startDate && endDate && endDate < startDate);
  const canCreate = name.trim().length > 0 && !backwards && !creating;

  const create = async () => {
    if (!canCreate) return;
    setCreating(true);
    const trimmed = name.trim();
    try {
      const projectId = await projectLinksRepository.createProject(userId, trimmed, {
        client,
        tags: engagement !== NONE ? [engagement as ProjectTag] : [],
        reviewOwnerEmail: lead,
        contactEmails: splitEmails(contacts),
        services: services.length ? services : undefined,
        clientPlan: makePlan
          ? draftClientPlan(sectionsFor(chosenTemplates), {
              startDate: startDate || undefined,
              endDate: endDate || undefined,
              templateId: chosenTemplates[0]?.id,
            })
          : undefined,
      });

      if (chosenTemplates.length) {
        try {
          await checklistService.createChecklist(
            projectId,
            chosenTemplates.map((t) => t.id),
          );
        } catch {
          const names = chosenTemplates.map((t) => `“${t.name}”`).join(' and ');
          toast.warning(`“${trimmed}” was created, but its checklist was not. Add ${names} from the Checklist tab.`);
        }
      }

      onCreated(projectId, trimmed);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create the project');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !creating && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Set it up once: the checklist, the plan the client sees, and who leads it. Only the name is required.
          </DialogDescription>
        </DialogHeader>

        <form
          id={FORM_ID}
          className="space-y-4 px-0.5 pb-0.5"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-project-name">Project name</Label>
              <Input
                id="new-project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Website redesign"
                autoFocus
                required
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-project-client">Client</Label>
              <Input
                id="new-project-client"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="Company name"
                list="new-project-clients"
                maxLength={120}
              />
              <datalist id="new-project-clients">
                {clients.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">What are we doing?</legend>
            <div role="group" aria-label="Engagement" className="grid gap-2 sm:grid-cols-2">
              {ENGAGEMENTS.map((e) => {
                const active = engagementId === e.id;
                return (
                  <button
                    key={e.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setEngagementId(active ? NONE : e.id)}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                    )}
                  >
                    <span className="block text-sm font-medium">{e.label}</span>
                    <span className="block text-xs text-muted-foreground">{e.hint}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className={cn('flex items-center gap-2 text-sm', !engagementPicked && 'opacity-50')}>
                <Checkbox
                  checked={withCopy}
                  onCheckedChange={(v) => setWithCopy(v === true)}
                  disabled={!engagementPicked}
                />
                We&apos;re writing the copy too
              </label>
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setEngagementId(engagementId === OTHER ? NONE : OTHER)}
              >
                {engagementId === OTHER ? 'Back to our services' : 'Something else? Pick a checklist'}
              </button>
            </div>

            {engagementPicked && (
              <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-xs">
                <p className="font-medium text-foreground">The checklist, from these SOPs</p>
                <ul className="space-y-1">
                  {picks.map((p) => (
                    <li key={p.service} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="w-24 shrink-0 text-muted-foreground">{SERVICE_LABELS[p.service]}</span>
                      {p.options.length > 1 ? (
                        <Select
                          value={p.template?.id}
                          onValueChange={(id) => setChosen((c) => ({ ...c, [p.service]: id }))}
                        >
                          <SelectTrigger className="h-7 w-56 text-xs" aria-label={`SOP for ${SERVICE_LABELS[p.service]}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {p.options.map((t) => (
                              <SelectItem key={t.id} value={t.id} className="text-xs">
                                {t.icon} {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : p.template ? (
                        <span>
                          {p.template.icon} {p.template.name}
                        </span>
                      ) : (
                        <span className="text-destructive">
                          No SOP is tagged {SERVICE_LABELS[p.service]} yet. Tag one in the Checklist Creator.
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {process.length > 0 && (
                  <p className="text-muted-foreground">
                    The client sees{' '}
                    {process.map((stage, i) => (
                      <span key={stage.title}>
                        {i > 0 && ' → '}
                        <span className="text-foreground">{stage.title}</span> ({stage.steps})
                      </span>
                    ))}
                    , each step moving as you tick the checklist.
                  </p>
                )}
                <a
                  href={MASTER_TEMPLATE_COPY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Project sheet: copy the master and keep these stages
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
            )}

            {engagementId === OTHER && (
              <div className="space-y-1.5">
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger id="new-project-type" className="w-full" aria-label="Checklist">
                    <SelectValue placeholder="Choose the checklist" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span aria-hidden="true">{t.icon}</span>
                        <span>{t.name}</span>
                      </SelectItem>
                    ))}
                    <SelectItem value={NONE}>No checklist for now</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {template
                    ? template.description || 'Adds this checklist to the project.'
                    : 'A migration, a retainer, anything that is not one of the four.'}
                </p>
              </div>
            )}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-project-start">Start date</Label>
              <Input id="new-project-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-project-end">Target end date</Label>
              <Input id="new-project-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          {backwards && <p className="-mt-2 text-xs text-destructive">The end date is before the start.</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-project-engagement">Contract</Label>
              <Select value={engagement} onValueChange={setEngagement}>
                <SelectTrigger id="new-project-engagement" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {CONTRACT_TAGS.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {PROJECT_TAG_LABELS[tag]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-project-lead">Lead</Label>
              <Select value={lead || NONE} onValueChange={(v) => setLead(v === NONE ? '' : v)}>
                <SelectTrigger id="new-project-lead" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No lead yet</SelectItem>
                  {leads.map((email) => (
                    <SelectItem key={email} value={email}>
                      {email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-project-contacts">Client contacts</Label>
            <Input
              id="new-project-contacts"
              value={contacts}
              onChange={(e) => setContacts(e.target.value)}
              placeholder="name@client.com, second@client.com"
            />
            <p className="text-xs text-muted-foreground">Who the client dashboard is for. Nothing is sent.</p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
            <Checkbox checked={makePlan} onCheckedChange={(v) => setMakePlan(v === true)} className="mt-0.5" />
            <span className="space-y-1">
              <span className="block text-sm font-medium">Set up the client dashboard</span>
              <span className="block text-xs text-muted-foreground">
                {engagementPicked && process.length > 0
                  ? 'The process above, from the checklist, with a dated plan behind it'
                  : stagePreview.join(' → ') + ', dated from the start date'}
                {endDate ? ' to the target end date' : ''}. Edit it any time in the Client tab.
              </span>
            </span>
          </label>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} disabled={!canCreate}>
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            {creating ? 'Creating…' : 'Create project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
