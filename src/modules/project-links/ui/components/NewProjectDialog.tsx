'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import { CLIENT_STAGE_DEFAULTS, draftClientPlan, planStageKinds, type PlanSection } from '@/modules/client-portal';
import { checklistService } from '@/services/ChecklistService';
import { PROJECT_TAG_LABELS, type ProjectTag, type SOPTemplate } from '@/types';
import { projectLinksRepository } from '../../infrastructure/project-links.repository';

const NONE = '__none__';
const FORM_ID = 'new-project-form';
const ENGAGEMENTS: ProjectTag[] = ['one_time', 'retainer', 'subscription', 'maintenance', 'consulting'];

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
function sectionsFor(template: SOPTemplate | undefined): PlanSection[] {
  return template ? [AGENCY_START, ...template.sections, AGENCY_CLOSE] : [];
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
    setStartDate(todayIso());
    setEndDate('');
    setEngagement(NONE);
    setLead(userEmail);
    setContacts('');
    setMakePlan(true);
  }, [open, userEmail]);

  const template = templates.find((t) => t.id === templateId);
  const stagePreview = useMemo(
    () => planStageKinds(sectionsFor(template)).map((kind) => CLIENT_STAGE_DEFAULTS[kind].title),
    [template],
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
        clientPlan: makePlan
          ? draftClientPlan(sectionsFor(template), {
              startDate: startDate || undefined,
              endDate: endDate || undefined,
              templateId: template?.id,
            })
          : undefined,
      });

      if (template) {
        try {
          await checklistService.createChecklist(projectId, [template.id]);
        } catch {
          toast.warning(`“${trimmed}” was created, but its checklist was not. Add “${template.name}” from the Checklist tab.`);
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

          <div className="space-y-1.5">
            <Label htmlFor="new-project-type">Project type</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger id="new-project-type" className="w-full">
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
                : 'Pick the checklist this kind of project runs on. It drives the Delivery tab and the client’s tracker.'}
            </p>
          </div>

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
              <Label htmlFor="new-project-engagement">Engagement</Label>
              <Select value={engagement} onValueChange={setEngagement}>
                <SelectTrigger id="new-project-engagement" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {ENGAGEMENTS.map((tag) => (
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
                {stagePreview.join(' → ')}, dated from the start date
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
