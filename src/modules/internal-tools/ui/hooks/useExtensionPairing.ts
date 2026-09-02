'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchAuthed } from '@/lib/api-client';

/**
 * Detects whether a Chrome extension is installed, and pairs it with the
 * signed-in person.
 *
 * Detection works because the extension pins its id (the `key` field in its
 * manifest) and allows this origin in `externally_connectable`, so the page can
 * message it directly. Without the pinned id every unpacked install would get a
 * different id and there would be nothing to address.
 *
 * Pairing deliberately pushes a token into the extension rather than letting it
 * pull one: the server mints the token for whoever is signed in here, after
 * checking module access, and the page hands it over. The Refrens signing key
 * never enters this flow.
 */

export type PairingState =
  | 'checking'        // still probing
  | 'not-installed'   // extension absent, or Chrome APIs unavailable
  | 'installed'       // present but not paired from this account
  | 'paired'
  | 'error';

interface ChromeRuntimeLike {
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: (response?: { ok?: boolean; version?: string; error?: string }) => void
  ) => void;
  lastError?: { message?: string };
}

function chromeRuntime(): ChromeRuntimeLike | null {
  const c = (globalThis as { chrome?: { runtime?: ChromeRuntimeLike } }).chrome;
  return c?.runtime?.sendMessage ? c.runtime : null;
}

/** Promise wrapper — an absent extension surfaces via lastError, not a rejection. */
function message(extensionId: string, payload: unknown) {
  return new Promise<{ ok?: boolean; version?: string; error?: string } | null>((resolve) => {
    const runtime = chromeRuntime();
    if (!runtime) return resolve(null);
    try {
      runtime.sendMessage(extensionId, payload, (response) => {
        if (runtime.lastError) return resolve(null);
        resolve(response ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}

export function useExtensionPairing(slug: string, extensionId: string, enabled: boolean) {
  const [state, setState] = useState<PairingState>('checking');
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const probe = useCallback(async () => {
    if (!enabled) return;
    const res = await message(extensionId, { type: 'PING' });
    if (!res?.ok) {
      setState('not-installed');
      setVersion(null);
      return;
    }
    setVersion(res.version ?? null);
    // "Installed" is all the extension will tell an untrusted page; whether this
    // browser is paired is answered by the extension itself in its own popup.
    setState((prev) => (prev === 'paired' ? 'paired' : 'installed'));
  }, [extensionId, enabled]);

  useEffect(() => {
    if (!enabled) {
      setState('not-installed');
      return;
    }
    void probe();
  }, [probe, enabled]);

  const pair = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchAuthed('/api/extension/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Pairing failed (${res.status})`);

      const delivered = await message(extensionId, {
        type: 'PAIR',
        token: body.token,
        apiBase: body.apiBase,
        urlKey: body.urlKey,
        pairedAs: body.pairedAs,
      });
      if (!delivered?.ok) {
        throw new Error(
          'The extension did not accept the pairing. Make sure it is installed and enabled, then try again.'
        );
      }
      setState('paired');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pairing failed');
      setState('error');
    } finally {
      setBusy(false);
    }
  }, [slug, extensionId]);

  const unpair = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await fetchAuthed(`/api/extension/pair?slug=${encodeURIComponent(slug)}`, { method: 'DELETE' });
      await message(extensionId, { type: 'UNPAIR' });
      setState('installed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unpairing failed');
    } finally {
      setBusy(false);
    }
  }, [slug, extensionId]);

  return { state, version, error, busy, pair, unpair, recheck: probe };
}
