'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CheckCircle2, ExternalLink, Loader2, AlertTriangle } from 'lucide-react';
import type { IntakeSubmissionResponse } from '@/types';

interface IntakeFormProps {
  token: string;
  autoCreate: boolean;
}

interface FormState {
  requesterName: string;
  requesterEmail: string;
  message: string;
  referenceUrl: string;
  isList: boolean;
  urgency: 'low' | 'medium' | 'high' | 'urgent';
  deadline: string;
}

const initialState: FormState = {
  requesterName: '',
  requesterEmail: '',
  message: '',
  referenceUrl: '',
  isList: false,
  urgency: 'medium',
  deadline: '',
};

export function IntakeForm({ token, autoCreate }: IntakeFormProps) {
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<IntakeSubmissionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChange = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (form.requesterName.trim().length < 1) {
      setError('Please add your name so we know who to follow up with.');
      return;
    }
    if (form.message.trim().length < 3) {
      setError('Add a few words about what you need.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/clickup/public-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          payload: {
            requesterName: form.requesterName.trim(),
            requesterEmail: form.requesterEmail.trim() || undefined,
            message: form.message.trim(),
            referenceUrl: form.referenceUrl.trim() || undefined,
            isList: form.isList,
            urgency: form.urgency,
            deadline: form.deadline || undefined,
          },
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | (IntakeSubmissionResponse & { error?: string; details?: string[] })
        | null;

      if (!res.ok || !data?.success) {
        const detail =
          data?.details?.join(', ') ||
          data?.error ||
          `Submission failed (${res.status})`;
        setError(detail);
        return;
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            Request received
          </CardTitle>
          <CardDescription>{result.message}</CardDescription>
        </CardHeader>
        {result.taskUrls.length > 0 && (
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              {result.taskUrls.length === 1
                ? 'Your task has been logged:'
                : `${result.taskUrls.length} tasks have been logged:`}
            </p>
            <ul className="space-y-1">
              {result.taskUrls.map((url, idx) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Task #{idx + 1}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        )}
        <CardContent>
          <Button
            variant="outline"
            onClick={() => {
              setResult(null);
              setForm(initialState);
            }}
          >
            Submit another request
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="requesterName">Your name *</Label>
              <Input
                id="requesterName"
                value={form.requesterName}
                onChange={(e) => handleChange('requesterName', e.target.value)}
                placeholder="Jane Smith"
                required
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="requesterEmail">Email (optional)</Label>
              <Input
                id="requesterEmail"
                type="email"
                value={form.requesterEmail}
                onChange={(e) => handleChange('requesterEmail', e.target.value)}
                placeholder="jane@company.com"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="message">What do you need? *</Label>
            <Textarea
              id="message"
              value={form.message}
              onChange={(e) => handleChange('message', e.target.value)}
              placeholder="Describe the change. If you have multiple asks, list them out — we will split them into separate tasks."
              rows={7}
              required
              disabled={submitting}
              className="resize-y"
            />
            <p className="text-xs text-muted-foreground">
              Markdown / bullet lists are fine. Include page URLs and exact copy where possible.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="isList" className="font-medium">
                Multiple asks in one message
              </Label>
              <p className="text-xs text-muted-foreground">
                Toggle on if you've bundled several requests — we'll split them into discrete
                tasks.
              </p>
            </div>
            <Switch
              id="isList"
              checked={form.isList}
              onCheckedChange={(v) => handleChange('isList', v)}
              disabled={submitting}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="urgency">Urgency</Label>
              <Select
                value={form.urgency}
                onValueChange={(v) =>
                  handleChange('urgency', v as FormState['urgency'])
                }
                disabled={submitting}
              >
                <SelectTrigger id="urgency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low — when you have time</SelectItem>
                  <SelectItem value="medium">Medium — normal priority</SelectItem>
                  <SelectItem value="high">High — needed soon</SelectItem>
                  <SelectItem value="urgent">Urgent — blocking us</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deadline">Need-by date (optional)</Label>
              <Input
                id="deadline"
                type="date"
                value={form.deadline}
                onChange={(e) => handleChange('deadline', e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="referenceUrl">Reference link (optional)</Label>
            <Input
              id="referenceUrl"
              type="url"
              value={form.referenceUrl}
              onChange={(e) => handleChange('referenceUrl', e.target.value)}
              placeholder="Loom, Figma, Google Doc, page URL, etc."
              disabled={submitting}
            />
          </div>

          {autoCreate ? (
            <div className="flex items-start gap-2 rounded-md border border-purple-200 bg-purple-50/50 dark:border-purple-900/50 dark:bg-purple-950/20 px-3 py-2 text-xs">
              <Badge variant="outline" className="text-[10px]">
                Auto-routed
              </Badge>
              <p className="text-muted-foreground">
                This project is set up to auto-create tasks the moment you submit. You'll see
                direct links once the request lands.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              We will triage your request and confirm timing — usually within one business day.
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <span className="text-destructive">{error}</span>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={submitting} size="lg">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting…
                </>
              ) : (
                'Submit request'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
