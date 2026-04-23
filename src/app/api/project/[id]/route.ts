import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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

function pickPublicFields(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of PUBLIC_FIELDS) {
    if (key in data) out[key] = data[key];
  }
  return out;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const docRef = doc(db, 'projects', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return new NextResponse(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: corsHeaders,
      });
    }
    const safe = pickPublicFields(snap.data() as Record<string, unknown>);
    return new NextResponse(
      JSON.stringify({ id: snap.id, ...safe }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (e: unknown) {
    return new NextResponse(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
