/**
 * Minimal Webflow v2 API client used by both web API routes and the CLI.
 * No Next.js / browser globals — pure Node + fetch.
 */

export const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

export interface WebflowCollection {
  id: string;
  displayName: string;
  slug: string;
  fields?: Array<{ id: string; slug: string; displayName: string; type: string; isRequired?: boolean }>;
}

export interface WebflowItem {
  id: string;
  isDraft?: boolean;
  isArchived?: boolean;
  fieldData?: Record<string, unknown>;
}

export interface WebflowPagination {
  total?: number;
  offset?: number;
  limit?: number;
}

export function buildHeaders(apiToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiToken}`,
    accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function wfFetch(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith('http') ? path : `${WEBFLOW_API_BASE}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      ...buildHeaders(token),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

export async function listCollections(siteId: string, token: string): Promise<WebflowCollection[]> {
  const res = await wfFetch(`/sites/${siteId}/collections`, token);
  if (!res.ok) throw new Error(`listCollections ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { collections?: WebflowCollection[] };
  return data.collections || [];
}

export async function getCollection(collectionId: string, token: string): Promise<WebflowCollection> {
  const res = await wfFetch(`/collections/${collectionId}`, token);
  if (!res.ok) throw new Error(`getCollection ${res.status}: ${await res.text()}`);
  return (await res.json()) as WebflowCollection;
}

export async function listItems(
  collectionId: string,
  token: string,
  offset = 0,
  limit = 100
): Promise<{ items: WebflowItem[]; pagination: WebflowPagination }> {
  const res = await wfFetch(
    `/collections/${collectionId}/items?limit=${limit}&offset=${offset}`,
    token
  );
  if (!res.ok) throw new Error(`listItems ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { items?: WebflowItem[]; pagination?: WebflowPagination };
  return { items: data.items || [], pagination: data.pagination || {} };
}

export async function patchItems(
  collectionId: string,
  token: string,
  items: Array<{ id: string; fieldData: Record<string, unknown> }>
): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await wfFetch(`/collections/${collectionId}/items`, token, {
    method: 'PATCH',
    body: JSON.stringify({ items }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

export async function getAsset(
  assetId: string,
  token: string
): Promise<{ ok: boolean; status: number; data?: { id: string; hostedUrl?: string; fileName?: string } }> {
  const res = await wfFetch(`/assets/${assetId}`, token);
  if (!res.ok) return { ok: false, status: res.status };
  const data = (await res.json()) as { id: string; hostedUrl?: string; fileName?: string };
  return { ok: true, status: res.status, data };
}

export async function deleteAsset(
  assetId: string,
  token: string
): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await wfFetch(`/assets/${assetId}`, token, { method: 'DELETE' });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

export async function publishItems(
  collectionId: string,
  token: string,
  itemIds: string[]
): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await wfFetch(`/collections/${collectionId}/items/publish`, token, {
    method: 'POST',
    body: JSON.stringify({ itemIds }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}
