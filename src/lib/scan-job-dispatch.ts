import { getCronSecretHeaders } from '@/lib/cron-auth';

export function getRequestBaseUrl(hostHeader?: string | null): string {
  // Prefer the public alias so internal fetches don't hit the protected
  // deployment URL when invoked from Vercel cron context (which sends the
  // deployment hostname and would 401 against deployment protection).
  const configured = process.env.NEXT_PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');

  const host = hostHeader || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

export async function triggerScanJobProcessing(baseUrl: string, scanId: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/scan-bulk/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getCronSecretHeaders(),
    },
    body: JSON.stringify({ scanId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to trigger scan processing for ${scanId}: ${response.status}`);
  }
}
