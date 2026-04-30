import { NextRequest, NextResponse } from 'next/server';
import {
  ApiAuthError,
  apiAuthErrorResponse,
  requireAdmin,
} from '@/lib/api-auth';
import { runNagBot } from '@/lib/nag-bot';
import { lookupUserIdByEmail, SlackError } from '@/lib/slack';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Admin-only test endpoint. Runs the nag-bot but routes every would-be channel
 * post to the caller as a Slack DM, with a header noting which teammate would
 * have been pinged. The real assignees are NOT @-mentioned and the team
 * channel receives nothing.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await requireAdmin(request);

    if (!process.env.SLACK_BOT_TOKEN) {
      return NextResponse.json({ error: 'SLACK_BOT_TOKEN not configured' }, { status: 503 });
    }

    let slackId: string | null = null;
    try {
      slackId = await lookupUserIdByEmail(caller.email);
    } catch (err) {
      const code = err instanceof SlackError ? err.code : undefined;
      return NextResponse.json(
        {
          error: 'Could not resolve your Slack user id',
          details:
            code === 'missing_scope'
              ? 'The bot is missing the users:read.email scope. Add it on api.slack.com/apps and reinstall.'
              : code === 'users_not_found'
                ? `No Slack user with email ${caller.email}. Test runs need your Slack account to receive the DM.`
                : (err instanceof Error ? err.message : 'unknown error'),
        },
        { status: 502 },
      );
    }

    if (!slackId) {
      return NextResponse.json(
        {
          error: `No Slack account found for ${caller.email}`,
        },
        { status: 404 },
      );
    }

    const result = await runNagBot({ testRecipientSlackId: slackId });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason ?? 'unknown' }, { status: 503 });
    }
    return NextResponse.json({ ...result, recipient: caller.email });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[test-nag] failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
