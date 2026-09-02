import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, apiAuthErrorResponse, requireModule } from '@/lib/api-auth';
import { getExtensionBySlug } from '@/lib/extension-registry';
import { issueExtensionToken, revokeExtensionTokens } from '@/lib/extension-tokens';
import { getRefrensUrlKey } from '@/services/RefrensService';

/**
 * POST /api/extension/pair   { slug }
 *
 * Issues the signed-in person their own extension token, provided they hold the
 * module that extension requires. This is what lets a teammate set the extension
 * up without an admin handing over credentials: the Refrens signing key stays on
 * the server, and the token they receive only reaches the proxy routes.
 *
 * DELETE unpairs.
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
      urlKey: await getRefrensUrlKey(),
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
    const slug = new URL(req.url).searchParams.get('slug');
    const extension = slug ? getExtensionBySlug(slug) : null;
    if (!extension) {
      return NextResponse.json({ error: 'Unknown extension' }, { status: 404 });
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
