import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import {
  ApiAuthError,
  apiAuthErrorResponse,
  requireAdmin,
} from '@/lib/api-auth';
import {
  CLICKUP_TASK_EVENTS,
  ClickUpError,
  createWebhook,
  deleteWebhook,
  listTeams,
  listWebhooks,
} from '@/lib/clickup';
import {
  db as adminDb,
  hasFirebaseAdminCredentials,
} from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SECRETS_DOC = adminDb.collection(COLLECTIONS.APP_SECRETS).doc('clickup');

function originForRequest(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (fromEnv) {
    return fromEnv.startsWith('http') ? fromEnv : `https://${fromEnv}`;
  }
  return new URL(request.url).origin;
}

interface RegisterBody {
  teamId?: string;
  /** Optional override for the webhook endpoint (useful when testing via tunnels). */
  endpointOverride?: string;
}

/** GET — return current registration status. */
export async function GET(request: NextRequest) {
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }
  try {
    await requireAdmin(request);
    const snap = await SECRETS_DOC.get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : null;
    return NextResponse.json({
      registered: Boolean(data?.webhookId),
      webhookId: (data?.webhookId as string | undefined) ?? null,
      teamId: (data?.teamId as string | undefined) ?? null,
      endpoint: (data?.endpoint as string | undefined) ?? null,
      registeredAt: data?.registeredAt ?? null,
      hasSecret: Boolean(data?.webhookSecret),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — create the webhook in ClickUp and persist the returned secret. */
export async function POST(request: NextRequest) {
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }
  try {
    await requireAdmin(request);
    const body = (await request.json().catch(() => ({}))) as RegisterBody;
    const endpoint = `${body.endpointOverride?.trim() || originForRequest(request)}/api/clickup/webhook`;

    let teamId = body.teamId?.trim() || process.env.CLICKUP_TEAM_ID?.trim() || '';
    if (!teamId) {
      const teams = await listTeams();
      if (teams.length === 0) {
        return NextResponse.json(
          { error: 'No ClickUp workspaces found for the configured token' },
          { status: 400 },
        );
      }
      if (teams.length > 1) {
        return NextResponse.json(
          {
            error: 'Multiple ClickUp workspaces — pass `teamId` in the body',
            teams,
          },
          { status: 400 },
        );
      }
      teamId = teams[0].id;
    }

    // If a webhook already exists for this endpoint, replace it so the secret in
    // ClickUp matches the one we'll persist below.
    const existing = await listWebhooks(teamId).catch(() => []);
    for (const w of existing) {
      if (w.endpoint === endpoint) {
        await deleteWebhook(w.id).catch((err) => {
          console.warn('[register-webhook] failed to delete old webhook:', err);
        });
      }
    }

    const webhook = await createWebhook(teamId, endpoint, CLICKUP_TASK_EVENTS);

    await SECRETS_DOC.set(
      {
        teamId,
        webhookId: webhook.id,
        webhookSecret: webhook.secret,
        endpoint,
        events: webhook.events ?? CLICKUP_TASK_EVENTS,
        registeredAt: Timestamp.now(),
      },
      { merge: true },
    );

    return NextResponse.json({
      ok: true,
      webhookId: webhook.id,
      endpoint,
      teamId,
      events: webhook.events ?? CLICKUP_TASK_EVENTS,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    if (err instanceof ClickUpError) {
      return NextResponse.json(
        { error: 'ClickUp request failed', details: err.message },
        { status: err.status ?? 502 },
      );
    }
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[register-webhook] failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE — remove the webhook from ClickUp and clear stored secret. */
export async function DELETE(request: NextRequest) {
  if (!hasFirebaseAdminCredentials) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }
  try {
    await requireAdmin(request);
    const snap = await SECRETS_DOC.get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : null;
    const webhookId = data?.webhookId as string | undefined;
    if (webhookId) {
      await deleteWebhook(webhookId).catch((err) => {
        console.warn('[register-webhook] DELETE failed:', err);
      });
    }
    await SECRETS_DOC.set(
      {
        webhookId: null,
        webhookSecret: null,
        endpoint: null,
        registeredAt: null,
      },
      { merge: true },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
