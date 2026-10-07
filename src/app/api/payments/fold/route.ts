import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import {
  disconnectFold,
  getFoldConnectionStatus,
  updateFoldSettings,
} from '@/modules/payments/infrastructure/fold.client';
import { paymentsErrorResponse } from '@/modules/payments/infrastructure/route-errors';

export const runtime = 'nodejs';

/** GET /api/payments/fold: connection status, accounts and settings. Never tokens. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return NextResponse.json(await getFoldConnectionStatus());
  } catch (err) {
    return paymentsErrorResponse(err, 'api/payments/fold GET');
  }
}

interface SettingsBody {
  selectedAccountIds?: unknown;
  minAmount?: unknown;
  notifyEmails?: unknown;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** PATCH /api/payments/fold: which accounts to read, the minimum amount, who gets the email. */
export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = (await req.json().catch(() => ({}))) as SettingsBody;
    const patch: { selectedAccountIds?: string[]; minAmount?: number; notifyEmails?: string[] } = {};

    if (body.selectedAccountIds !== undefined) {
      if (!Array.isArray(body.selectedAccountIds) || !body.selectedAccountIds.every((x) => typeof x === 'string')) {
        return NextResponse.json({ error: 'selectedAccountIds must be a list of ids' }, { status: 400 });
      }
      const known = new Set((await getFoldConnectionStatus()).accounts.map((a) => a.id));
      patch.selectedAccountIds = [...new Set(body.selectedAccountIds as string[])].filter((id) => known.has(id));
    }
    if (body.minAmount !== undefined) {
      const n = Number(body.minAmount);
      if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'minAmount must be 0 or more' }, { status: 400 });
      patch.minAmount = n;
    }
    if (body.notifyEmails !== undefined) {
      if (!Array.isArray(body.notifyEmails)) return NextResponse.json({ error: 'notifyEmails must be a list' }, { status: 400 });
      const emails = (body.notifyEmails as unknown[]).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
      const bad = emails.find((e) => !EMAIL_RE.test(e));
      if (bad) return NextResponse.json({ error: `Not an email: ${bad}` }, { status: 400 });
      patch.notifyEmails = [...new Set(emails)];
    }

    await updateFoldSettings(patch);
    return NextResponse.json(await getFoldConnectionStatus());
  } catch (err) {
    return paymentsErrorResponse(err, 'api/payments/fold PATCH');
  }
}

/** DELETE /api/payments/fold: revoke the Fold grant. Stored payments stay. */
export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin(req);
    await disconnectFold();
    return NextResponse.json(await getFoldConnectionStatus());
  } catch (err) {
    return paymentsErrorResponse(err, 'api/payments/fold DELETE');
  }
}
