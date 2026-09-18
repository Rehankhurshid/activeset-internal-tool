import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse, requireAdmin, requireModule } from '@/lib/api-auth';
import { getExtensionBySlug } from '@/lib/extension-registry';
import { issueExtensionToken, revokeExtensionTokens } from '@/lib/extension-tokens';
import { getRefrensUrlKey } from '@/services/RefrensService';

/**
 * POST /api/extension/pair   { slug }
 *
 * Issues the signed-in person their own extension token, provided they hold the
 * module that extension requires. This is what lets a teammate set the extension
 * up without an admin handing over credentials: the Refrens signing key stays on
 * the server, and the token they receive only reaches the proxy routes. Tokens
 * expire after `EXTENSION_TOKEN_TTL_DAYS`; pairing again replaces the old one.
 *
 * DELETE /api/extension/pair?slug=<slug>
 *   Unpairs the caller: revokes every token they hold for that extension.
 *   Requires the extension's module, same as pairing.
 *
 * DELETE /api/extension/pair?slug=<slug>&email=<person>
 *   Admin form: revokes that person's tokens for the extension instead of the
 *   caller's. Requires an admin session. For cutting off a lost laptop or a
 *   departed teammate without waiting for their token to expire — although
 *   removing their module in Team Access already blocks every request, this also
 *   clears the record.
 *
 * Both forms return `{ revoked }` with the number of tokens deleted.
 */
export async function POST(req: NextRequest) {
  try {
    const { slug } = (await req.json().catch(() => ({}))) as { slug?: string };
    const extension = slug ? getExtensionBySlug(slug) : null;
    if (!extension) {
      return NextResponse.json({ error: 'Unknown extension' }, { status: 404 });
    }

    const caller = await requireModule(req, extension.module);
    const token = await issueExtensionToken({
      uid: caller.uid,
      email: caller.email,
      extension: extension.slug,
      module: extension.module,
    });

    return NextResponse.json({
      token,
      extensionId: extension.id,
      apiBase: new URL(req.url).origin,
      // Only the Refrens bridge builds deep links from the business slug, so
      // pairing any other extension must not depend on Refrens being set up.
      urlKey: extension.module === 'invoices' ? await getRefrensUrlKey() : null,
      pairedAs: caller.email,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[api/extension/pair] failed:', err);
    return NextResponse.json({ error: 'Pairing failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get('slug');
    const extension = slug ? getExtensionBySlug(slug) : null;
    if (!extension) {
      return NextResponse.json({ error: 'Unknown extension' }, { status: 404 });
    }

    const targetEmail = url.searchParams.get('email')?.trim().toLowerCase();
    if (targetEmail) {
      await requireAdmin(req);
      const revoked = await revokeExtensionTokens(targetEmail, extension.slug);
      return NextResponse.json({ revoked, email: targetEmail });
    }

    const caller = await requireModule(req, extension.module);
    const revoked = await revokeExtensionTokens(caller.email, extension.slug);
    return NextResponse.json({ revoked });
  } catch (err) {
    if (err instanceof ApiAuthError) return apiAuthErrorResponse(err);
    console.error('[api/extension/pair] revoke failed:', err);
    return NextResponse.json({ error: 'Unpairing failed' }, { status: 500 });
  }
}
