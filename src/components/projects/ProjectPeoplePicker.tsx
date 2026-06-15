'use client';

import * as React from 'react';
import { Check, Loader2, UserPlus, Users, X } from 'lucide-react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAssignees } from '@/hooks/useAssignees';
import { cn } from '@/lib/utils';
import { projectLinksRepository } from '@/modules/project-links/infrastructure/project-links.repository';

interface ProjectPeoplePickerProps {
  projectId: string;
  projectName: string;
  assigneeEmails?: string[];
  reviewOwnerEmail?: string;
  variant?: 'compact' | 'hero';
  className?: string;
}

interface PeopleAvatarStackProps {
  emails: string[];
  max?: number;
  className?: string;
}

const AVATAR_TONES = [
  'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 ring-cyan-500/20',
  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 ring-emerald-500/20',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/20',
  'bg-rose-500/15 text-rose-600 dark:text-rose-300 ring-rose-500/20',
  'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 ring-indigo-500/20',
];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function uniqueEmails(emails: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  for (const email of emails) {
    const normalized = normalizeEmail(email ?? '');
    if (normalized) seen.add(normalized);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

function emailLabel(email: string): string {
  const local = email.split('@')[0] || email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function initials(email: string): string {
  const parts = emailLabel(email).split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase();
}

function toneForEmail(email: string): string {
  const sum = Array.from(email).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return AVATAR_TONES[sum % AVATAR_TONES.length];
}

export function PeopleAvatarStack({ emails, max = 3, className }: PeopleAvatarStackProps) {
  const visible = emails.slice(0, max);
  const overflow = Math.max(0, emails.length - max);

  if (emails.length === 0) {
    return (
      <div className={cn('flex -space-x-1.5', className)} aria-hidden="true">
        <Avatar className="size-7 ring-2 ring-background">
          <AvatarFallback className="bg-muted text-muted-foreground">
            <UserPlus className="size-3.5" />
          </AvatarFallback>
        </Avatar>
      </div>
    );
  }

  return (
    <div className={cn('flex -space-x-1.5', className)}>
      {visible.map(email => (
        <Avatar key={email} className="size-7 ring-2 ring-background">
          <AvatarFallback className={cn('text-[10px] font-semibold ring-1', toneForEmail(email))}>
            {initials(email)}
          </AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <Avatar className="size-7 ring-2 ring-background">
          <AvatarFallback className="bg-muted text-[10px] font-semibold text-muted-foreground">
            +{overflow}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

export function ProjectPeoplePicker({
  projectId,
  projectName,
  assigneeEmails,
  reviewOwnerEmail,
  variant = 'compact',
  className,
}: ProjectPeoplePickerProps) {
  const { assignees, loading } = useAssignees();
  const [open, setOpen] = React.useState(false);
  const [draftEmails, setDraftEmails] = React.useState(() => uniqueEmails(assigneeEmails ?? []));
  const [customEmail, setCustomEmail] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    setDraftEmails(uniqueEmails(assigneeEmails ?? []));
  }, [assigneeEmails]);

  const ownerEmail = normalizeEmail(reviewOwnerEmail ?? '');
  const candidates = React.useMemo(
    () => uniqueEmails([...assignees, ...draftEmails, ownerEmail]),
    [assignees, draftEmails, ownerEmail],
  );
  const customEmailNormalized = normalizeEmail(customEmail);
  const canAddCustom = customEmailNormalized.includes('@') && !draftEmails.includes(customEmailNormalized);

  const saveAssignees = async (nextEmails: string[]) => {
    const next = uniqueEmails(nextEmails);
    const previous = draftEmails;
    setDraftEmails(next);
    setIsSaving(true);

    try {
      await projectLinksRepository.updateProjectAssignees(projectId, next);
    } catch (error) {
      setDraftEmails(previous);
      console.error('[ProjectPeoplePicker] failed to update assignees', error);
      toast.error('Failed to update project people');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleEmail = (email: string) => {
    if (isSaving) return;
    const normalized = normalizeEmail(email);
    const next = draftEmails.includes(normalized)
      ? draftEmails.filter(item => item !== normalized)
      : [...draftEmails, normalized];
    void saveAssignees(next);
  };

  const addCustomEmail = () => {
    if (!canAddCustom || isSaving) return;
    void saveAssignees([...draftEmails, customEmailNormalized]);
    setCustomEmail('');
  };

  const clearPeople = () => {
    if (isSaving || draftEmails.length === 0) return;
    void saveAssignees([]);
  };

  const label = draftEmails.length > 0
    ? `${draftEmails.length} ${draftEmails.length === 1 ? 'person' : 'people'}`
    : 'Attach people';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={draftEmails.length > 0 ? 'secondary' : 'outline'}
          size={variant === 'hero' ? 'default' : 'sm'}
          className={cn(
            'group min-h-9 justify-start gap-2 overflow-hidden transition-[background-color,border-color,box-shadow,transform] duration-200',
            variant === 'hero' && 'h-11 px-3',
            variant === 'compact' && 'h-8 px-2.5',
            draftEmails.length > 0 && 'border border-border/60 bg-card hover:bg-accent',
            className,
          )}
          aria-label={`Attach people to ${projectName}`}
        >
          <PeopleAvatarStack emails={draftEmails} />
          <span className={cn('min-w-0 truncate', variant === 'compact' && 'text-xs')}>
            {label}
          </span>
          {isSaving && <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[calc(100vw-2rem)] max-w-sm p-0 sm:w-80"
      >
        <div className="border-b p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Users className="size-4 text-muted-foreground" />
                Project crew
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{projectName}</p>
            </div>
            {draftEmails.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={clearPeople}
                disabled={isSaving}
              >
                <X className="size-3.5" />
                Clear
              </Button>
            )}
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto p-2">
          {loading && candidates.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading people
            </div>
          )}

          {!loading && candidates.length === 0 && (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No team emails found.
            </div>
          )}

          {candidates.map(email => {
            const checked = draftEmails.includes(email);
            const isOwner = ownerEmail === email;
            return (
              <button
                key={email}
                type="button"
                onClick={() => toggleEmail(email)}
                disabled={isSaving}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left transition-[background-color,transform] duration-150 active:scale-[0.99]',
                  checked ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                  isSaving && 'cursor-not-allowed opacity-70',
                )}
              >
                <Avatar className="size-8">
                  <AvatarFallback className={cn('text-[11px] font-semibold ring-1', toneForEmail(email))}>
                    {initials(email)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{emailLabel(email)}</span>
                    {isOwner && (
                      <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                        Owner
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{email}</span>
                </span>
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full border transition-colors',
                    checked
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-transparent',
                  )}
                  aria-hidden="true"
                >
                  <Check className="size-3" />
                </span>
              </button>
            );
          })}
        </div>

        <div className="border-t p-3">
          <div className="flex gap-2">
            <Input
              type="email"
              value={customEmail}
              onChange={event => setCustomEmail(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addCustomEmail();
                }
              }}
              placeholder="name@company.com"
              className="h-9 text-sm"
            />
            <Button
              type="button"
              size="sm"
              className="h-9"
              onClick={addCustomEmail}
              disabled={!canAddCustom || isSaving}
            >
              Add
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
