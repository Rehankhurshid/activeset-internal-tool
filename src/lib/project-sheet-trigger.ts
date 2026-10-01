import { fetchAuthed } from '@/lib/api-client';

/**
 * Asks the server to bring the project's app-kept sheet up to date, after an
 * edit the sheet shows: a tick, a page's status, a request for the client.
 *
 * Waits for the edits to settle first (ten seconds of quiet), so ticking six
 * items is one write, not six. Fire and forget: a project without an
 * app-kept sheet answers "skipped", a failure is the 15-minute cron's to
 * catch, and nothing here ever holds up the edit itself.
 */
const WAIT_MS = 10_000;
const pending = new Map<string, ReturnType<typeof setTimeout>>();

export function requestProjectSheetWrite(projectId: string | undefined | null): void {
  if (!projectId || typeof window === 'undefined') return;
  const timer = pending.get(projectId);
  if (timer) clearTimeout(timer);
  pending.set(
    projectId,
    setTimeout(() => {
      pending.delete(projectId);
      void fetchAuthed(`/api/client-portal/${encodeURIComponent(projectId)}/sheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'write' }),
      }).catch(() => {});
    }, WAIT_MS),
  );
}
