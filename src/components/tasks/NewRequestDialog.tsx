'use client';

import { useState } from 'react';
import { Loader2, Sparkles, Trash2, ArrowLeft, Plus } from 'lucide-react';
import { toast } from 'sonner';

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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

import { fetchForProject } from '@/lib/api-client';
import { tasksService, requestsService } from '@/services/database';
import {
  TASK_CATEGORIES,
  TASK_CATEGORY_LABELS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  type ParsedTaskSuggestion,
  type RequestSource,
  type TaskCategory,
  type TaskPriority,
} from '@/types';

interface NewRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  userEmail: string;
}

type Stage = 'input' | 'preview' | 'saving';

interface EditableSuggestion extends ParsedTaskSuggestion {
  /** local-only id so React keys are stable while editing */
  _id: string;
}

const SOURCE_OPTIONS: RequestSource[] = ['paste', 'slack', 'email'];
const SOURCE_LABELS: Record<RequestSource, string> = {
  paste: 'Pasted',
  slack: 'Slack',
  email: 'Email',
  // 'intake' arrives via the public intake form, not the operator dialog —
  // labelled here so the record stays exhaustive for the type.
  intake: 'Public intake',
};

let idCounter = 0;
const newId = () => `s_${++idCounter}_${Date.now()}`;

export function NewRequestDialog({
  open,
  onOpenChange,
  projectId,
  userEmail,
}: NewRequestDialogProps) {
  const [stage, setStage] = useState<Stage>('input');
  const [rawText, setRawText] = useState('');
  const [source, setSource] = useState<RequestSource>('paste');
  const [sender, setSender] = useState('');
  const [suggestions, setSuggestions] = useState<EditableSuggestion[]>([]);
  const [isParsing, setIsParsing] = useState(false);

  const reset = () => {
    setStage('input');
    setRawText('');
    setSource('paste');
    setSender('');
    setSuggestions([]);
    setIsParsing(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      reset();
    }
    onOpenChange(next);
  };

  const handleParse = async () => {
    const trimmed = rawText.trim();
    if (!trimmed) {
      toast.error('Paste a message first.');
      return;
    }

    setIsParsing(true);
    try {
      const res = await fetchForProject(projectId, '/api/tasks/parse-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          rawText: trimmed,
          sender: sender.trim() || undefined,
        }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        suggestions?: ParsedTaskSuggestion[];
        warning?: string;
        error?: string;
      };

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Parsing failed');
      }

      const list = data.suggestions ?? [];
      if (list.length === 0) {
        toast.warning(data.warning || 'No actionable tasks detected.');
        return;
      }

      setSuggestions(list.map((s) => ({ ...s, _id: newId() })));
      setStage('preview');
    } catch (err) {
      console.error('[NewRequestDialog] parse failed', err);
      toast.error(err instanceof Error ? err.message : 'Parsing failed');
    } finally {
      setIsParsing(false);
    }
  };

  const updateSuggestion = (id: string, patch: Partial<EditableSuggestion>) => {
    setSuggestions((prev) =>
      prev.map((s) => (s._id === id ? { ...s, ...patch } : s)),
    );
  };

  const removeSuggestion = (id: string) => {
    setSuggestions((prev) => prev.filter((s) => s._id !== id));
  };

  const addSuggestion = () => {
    setSuggestions((prev) => [
      ...prev,
      {
        _id: newId(),
        title: '',
        description: undefined,
        category: 'other',
        priority: 'medium',
      },
    ]);
  };

  const handleSave = async () => {
    const valid = suggestions.filter((s) => s.title.trim().length > 0);
    if (valid.length === 0) {
      toast.error('At least one task with a title is required.');
      return;
    }

    setStage('saving');
    try {
      // 1. Create the Request blob (the original message).
      const requestId = await requestsService.createRequest({
        projectId,
        rawText: rawText.trim(),
        source,
        sender: sender.trim() || undefined,
        createdBy: userEmail,
      });

      // 2. Create the parsed tasks linked to the request.
      const taskIds = await tasksService.createTasksBatch(
        valid.map((s) => ({
          projectId,
          requestId,
          title: s.title.trim(),
          description: s.description?.trim() || undefined,
          category: s.category,
          status: 'todo',
          priority: s.priority,
          tags: [],
          source,
          createdBy: userEmail,
        })),
      );

      // 3. Mark the request as parsed and link the task ids back.
      await requestsService.markRequestParsed(requestId, taskIds);

      toast.success(`${taskIds.length} task${taskIds.length === 1 ? '' : 's'} created`);
      reset();
      onOpenChange(false);
    } catch (err) {
      console.error('[NewRequestDialog] save failed', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save tasks');
      setStage('preview');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {stage === 'preview'
              ? `Review ${suggestions.length} task${suggestions.length === 1 ? '' : 's'}`
              : 'New Request'}
          </DialogTitle>
          <DialogDescription>
            {stage === 'input' &&
              'Paste a Slack message, email, or any bundled change request. AI will split it into discrete tasks you can review before saving.'}
            {stage === 'preview' &&
              'Edit the parsed tasks before saving. The original message is kept on file as the source.'}
            {stage === 'saving' && 'Saving tasks…'}
          </DialogDescription>
        </DialogHeader>

        {stage === 'input' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="req-source" className="text-xs">
                  Source
                </Label>
                <Select
                  value={source}
                  onValueChange={(v) => setSource(v as RequestSource)}
                >
                  <SelectTrigger id="req-source" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {SOURCE_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="req-sender" className="text-xs">
                  Sender (optional)
                </Label>
                <Input
                  id="req-sender"
                  value={sender}
                  onChange={(e) => setSender(e.target.value)}
                  placeholder="e.g. Patrick (Front Row)"
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="req-text" className="text-xs">
                Raw message
              </Label>
              <Textarea
                id="req-text"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste the Slack/email message here…"
                rows={10}
                className="mt-1 font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {rawText.length.toLocaleString()} characters
              </p>
            </div>
          </div>
        )}

        {stage === 'preview' && (
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-3">
              {suggestions.map((s) => (
                <div
                  key={s._id}
                  className="border rounded-md p-3 space-y-2 bg-muted/30"
                >
                  <div className="flex items-start gap-2">
                    <Input
                      value={s.title}
                      onChange={(e) =>
                        updateSuggestion(s._id, { title: e.target.value })
                      }
                      placeholder="Task title…"
                      className="flex-1"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeSuggestion(s._id)}
                      title="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={s.category}
                      onValueChange={(v) =>
                        updateSuggestion(s._id, { category: v as TaskCategory })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {TASK_CATEGORY_LABELS[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={s.priority}
                      onValueChange={(v) =>
                        updateSuggestion(s._id, { priority: v as TaskPriority })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {TASK_PRIORITY_LABELS[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Textarea
                    value={s.description ?? ''}
                    onChange={(e) =>
                      updateSuggestion(s._id, {
                        description: e.target.value || undefined,
                      })
                    }
                    placeholder="Description (optional)"
                    rows={2}
                    className="text-sm"
                  />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addSuggestion} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add another task
              </Button>
            </div>
          </ScrollArea>
        )}

        {stage === 'saving' && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {stage === 'input' && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={handleParse} disabled={isParsing || !rawText.trim()}>
                {isParsing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Parse with AI
              </Button>
            </>
          )}
          {stage === 'preview' && (
            <>
              <Button
                variant="outline"
                onClick={() => setStage('input')}
                className="mr-auto"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Badge variant="secondary" className="font-mono">
                {suggestions.filter((s) => s.title.trim()).length} valid
              </Badge>
              <Button onClick={handleSave} disabled={suggestions.length === 0}>
                Save tasks
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
