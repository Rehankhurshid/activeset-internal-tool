import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

// Use Node runtime because firestore SDK relies on Node APIs not available in Edge Runtime
export const runtime = 'nodejs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Fields safe to expose to the public widget. Anything else (e.g. webflowConfig,
// userId) must never leave the server — this endpoint is unauthenticated and
// CORS-open, so the response is effectively world-readable.
const PUBLIC_FIELDS = [
  'name',
  'status',
  'tags',
  'links',
  'client',
  'sitemapUrl',
  'detectedLocales',
  'pathToLocaleMap',
  'folderPageTypes',
  'disableAuditBadge',
  'disableDropdown',
  'enableSpellcheck',
  'publicAuditShareEnabled',
] as const;

// Deliverable details on a link (who on the client's side got it, when, which
// version) are for the client portal, which builds its own allow-list. The
// widget only needs a link's title and address, so they never leave here.
const PRIVATE_LINK_FIELDS = ['sharedWith', 'sharedAt', 'version', 'deliverableId'] as const;

function publicLinks(links: unknown): unknown {
  if (!Array.isArray(links)) return links;
  return links.map((link) => {
    if (!link || typeof link !== 'object') return link;
    const copy = { ...(link as Record<string, unknown>) };
    for (const key of PRIVATE_LINK_FIELDS) delete copy[key];
    return copy;
  });
}

function pickPublicFields(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of PUBLIC_FIELDS) {
    if (key in data) out[key] = key === 'links' ? publicLinks(data[key]) : data[key];
  }
  return out;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const snap = await db.collection('projects').doc(id).get();
    if (!snap.exists) {
      return new NextResponse(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: corsHeaders,
      });
    }
    const safe = pickPublicFields((snap.data() || {}) as Record<string, unknown>);
    return new NextResponse(
      JSON.stringify({ id: snap.id, ...safe }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (e: unknown) {
    const err = e as Error & { code?: string | number };
    return new NextResponse(
      JSON.stringify({ error: err.message, code: err.code, name: err.name }),
      { status: 500, headers: corsHeaders }
    );
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
