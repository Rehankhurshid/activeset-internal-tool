'use client';

import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { Check, Copy, Mail, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Project } from '@/types';
import { buildKickoffEmail, type SyncCadence } from '../../domain/kickoff.email';

/**
 * The kickoff email, drafted here and sent by a person from their own mailbox.
 *
 * Deliberately not a send button. The intro email is the client's first
 * impression of the people who will be building their site, and it should come
 * from one of them — the app's job is to stop it going out with the ask list
 * missing, not to take it over.
 */

/** Clipboard write with the execCommand fallback used elsewhere in the app. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    } catch {
      return false;
    }
  }
}

/** The first project link whose title or URL looks like the thing we want. */
function findLink(project: Pick<Project, 'links'>, pattern: RegExp): string | undefined {
  const match = (project.links ?? []).find(
    (link) => link.url && (pattern.test(link.title ?? '') || pattern.test(link.url)),
  );
  return match?.url;
}

interface KickoffEmailDialogProps {
  project: Project;
  /** Whoever is drafting, used as the lead when the project has no owner set. */
  userEmail: string;
  /**
   * What kickoff is still waiting on, in the client's own words — the titles of
   * the project's outstanding kickoff checklist items. The caller reads them off
   * the project's checklist, because what kickoff needs differs per project.
   */
  outstanding: string[];
  /** The client portal link, when the caller has one — it is not derivable here. */
  portalUrl?: string;
}

/** Lets a caller open this draft from elsewhere on the page, not only its own trigger. */
export interface KickoffEmailDialogHandle {
  open: () => void;
}

export const KickoffEmailDialog = forwardRef<KickoffEmailDialogHandle, KickoffEmailDialogProps>(
  function KickoffEmailDialog({ project, userEmail, outstanding, portalUrl }, ref) {
  const [open, setOpen] = useState(false);
  useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);
  const [copied, setCopied] = useState(false);

  const draft = useMemo(() => {
    const delivery = project.delivery;
    return buildKickoffEmail({
      projectName: project.name,
      clientName: project.client,
      teamEmails: project.assigneeEmails ?? [],
      leadEmail: project.reviewOwnerEmail ?? userEmail,
      trackerUrl: delivery?.trackerSheetUrl ?? findLink(project, /tracker|sheet/i),
      stagingUrl: findLink(project, /staging|webflow\.io/i),
      portalUrl,
      cadence: (delivery?.callCadence ?? 'none') as SyncCadence,
      outstandingInputs: outstanding,
    });
  }, [project, userEmail, outstanding, portalUrl]);

  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);

  const edited = subject !== draft.subject || body !== draft.body;

  const handleOpenChange = (next: boolean) => {
    // Re-seed from the current project state each time it is opened, so a draft
    // left over from before three of the asks arrived does not come back.
    if (next) {
      setSubject(draft.subject);
      setBody(draft.body);
      setCopied(false);
    }
    setOpen(next);
  };

  const handleCopy = async () => {
    const ok = await copyText(body);
    if (!ok) {
      toast.error('Could not copy — select the text and copy it manually');
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Email copied. Paste it into your mail app and send it yourself.');
  };

  const handleCopySubject = async () => {
    const ok = await copyText(subject);
    if (ok) toast.success('Subject copied');
    else toast.error('Could not copy the subject');
  };

  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 w-full justify-start px-2.5 text-xs">
          <Mail className="h-3.5 w-3.5" />
          Draft the kickoff email
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Kickoff email</DialogTitle>
          <DialogDescription className="text-xs">
            A draft only. Nothing is sent from here — edit it, copy it out, and send it from your
            own mailbox.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="kickoff-email-subject" className="text-xs">
              Subject
            </Label>
            <Input
              id="kickoff-email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="kickoff-email-body" className="text-xs">
              Body
            </Label>
            <Textarea
              id="kickoff-email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[320px] font-mono text-xs leading-relaxed"
              spellCheck
            />
            <p className="text-[11px] text-muted-foreground">
              Built from the project&rsquo;s team, links, call cadence and whatever the client still
              owes us. Edit it freely — changes here are not saved.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs"
              onClick={handleCopySubject}
            >
              Copy subject
            </Button>
            {edited && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs"
                onClick={() => {
                  setSubject(draft.subject);
                  setBody(draft.body);
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset to draft
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" asChild>
              <a href={mailto}>
                <Mail className="h-3.5 w-3.5" />
                Open in mail app
              </a>
            </Button>
            <Button size="sm" className="h-8 px-2.5 text-xs" onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy email'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
