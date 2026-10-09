'use client';

import { Mail, MessageSquare, Phone, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface DeliveryEvidenceCardProps {
  projectId: string;
  projectName: string;
}

/**
 * How delivery stays in sync with Slack, email, and calls — without piping
 * secrets through the browser. The agent playbook reads those sources and
 * applies ticks via `npm run checklist`.
 */
export function DeliveryEvidenceCard({ projectId, projectName }: DeliveryEvidenceCardProps) {
  const contextCmd = `npm run checklist -- context "${projectName}"`;
  const showCmd = `npm run checklist -- show "${projectName}"`;

  return (
    <Card className="gap-3 border-dashed bg-muted/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          Keep delivery in sync from Slack, mail &amp; calls
        </CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          Fathom calls already land on the Client tab. For everything else, run the checklist agent with your Slack,
          Gmail, and Calendar connectors — then apply a plan so Delivery, the client portal, and the project sheet move
          together.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <ul className="grid gap-2 sm:grid-cols-3">
          <li className="flex gap-2 rounded-md border bg-background/80 px-2.5 py-2">
            <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              <span className="font-medium text-foreground">Slack</span>
              <span className="block text-muted-foreground">Kickoff threads, asset drops, staging links</span>
            </span>
          </li>
          <li className="flex gap-2 rounded-md border bg-background/80 px-2.5 py-2">
            <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              <span className="font-medium text-foreground">Email</span>
              <span className="block text-muted-foreground">Welcome mail sent, client approvals, file shares</span>
            </span>
          </li>
          <li className="flex gap-2 rounded-md border bg-background/80 px-2.5 py-2">
            <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              <span className="font-medium text-foreground">Calls</span>
              <span className="block text-muted-foreground">Fathom summaries → checklist fields &amp; dates</span>
            </span>
          </li>
        </ul>
        <div className="space-y-1.5 rounded-md border bg-background px-3 py-2 font-mono text-[11px] text-muted-foreground">
          <p className="select-all break-all">{contextCmd}</p>
          <p className="select-all break-all">{showCmd}</p>
          <p className="font-sans text-[10px]">
            Project id: <span className="font-mono">{projectId}</span> · Playbook:{' '}
            <span className="font-mono">.agents/skills/update-checklist</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
