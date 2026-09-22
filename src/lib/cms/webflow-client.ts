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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Every Webflow call, with its rate limit waited out rather than reported.
 *
 * Webflow limits each token per minute, and optimising a whole library is
 * hundreds of calls back to back. Before this, the first 429 anywhere in a
 * run failed the entire job — PeakXV's first one-click run died on "Webflow
 * refused the asset list (429)" before describing a single image. A 429 is
 * Webflow saying "not yet", not "no", so it is retried after the wait it asks
 * for. The body is a string everywhere here, so resending it is safe.
 */
export async function webflowFetch(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith('http') ? path : `${WEBFLOW_API_BASE}${path}`;
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...buildHeaders(token),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (res.status !== 429 || attempt >= 5) return res;
    const retryAfter = Number(res.headers.get('retry-after'));
    await sleep(Math.min(60_000, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 10_000 * (attempt + 1)));
  }
}

const wfFetch = webflowFetch;

export async function listCollections(siteId: string, token: string): Promise<WebflowCollection[]> {
  const res = await wfFetch(`/sites/${siteId}/collections`, token);
  if (!res.ok) throw new Error(`listCollections ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.collections || [];
}

export async function getCollection(collectionId: string, token: string): Promise<WebflowCollection> {
  const res = await wfFetch(`/collections/${collectionId}`, token);
  if (!res.ok) throw new Error(`getCollection ${res.status}: ${await res.text()}`);
  return res.json();
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
  const data = await res.json();
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
