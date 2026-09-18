'use client';

import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TIMELINE_TEMPLATES } from '@/lib/timeline-templates';
import { todayIso } from '@/lib/review-status';
import { timelineRepository } from '@/modules/timeline';

interface StartPlanFromTemplateProps {
  projectId: string;
}

/**
 * Empty state for the milestone visibility list: seed the project timeline
 * from a built-in template so there is something to show the client.
 */
export function StartPlanFromTemplate({ projectId }: StartPlanFromTemplateProps) {
  const [templateId, setTemplateId] = useState<string>(TIMELINE_TEMPLATES[0]?.id ?? '');
  const [startDate, setStartDate] = useState<string>(() => todayIso());
  const [starting, setStarting] = useState(false);

  const selected = TIMELINE_TEMPLATES.find((t) => t.id === templateId);

  const handleStart = async () => {
    if (!selected || starting) return;
    setStarting(true);
    try {
      await timelineRepository.applyTemplate(projectId, selected.id, startDate || undefined);
      toast.success(`Plan started from “${selected.name}”`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start plan');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <p className="text-sm text-muted-foreground">
        No plan yet. Start from a template, then choose which milestones the client sees.
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="plan-template" className="text-xs text-muted-foreground">Template</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger id="plan-template" size="sm" className="w-full text-xs">
              <SelectValue placeholder="Choose a template" />
            </SelectTrigger>
            <SelectContent>
              {TIMELINE_TEMPLATES.map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-xs">
                  <span aria-hidden="true">{t.icon}</span>
                  <span>{t.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected && <p className="text-[11px] text-muted-foreground">{selected.description}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-start" className="text-xs text-muted-foreground">Start date</Label>
          <Input
            id="plan-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-8 text-xs sm:w-40"
          />
        </div>
      </div>
      <Button size="sm" className="h-8 text-xs" onClick={() => void handleStart()} disabled={!selected || starting}>
        {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        Start plan
      </Button>
    </div>
  );
}
