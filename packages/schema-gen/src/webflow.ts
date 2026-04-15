import type { WebflowPageLite } from './types';

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

export async function fetchAllStaticPages(
  siteId: string,
  token: string
): Promise<WebflowPageLite[]> {
  const pages: WebflowPageLite[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await fetch(
      `${WEBFLOW_API_BASE}/sites/${siteId}/pages?limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' } }
    );
    if (!res.ok) {
      throw new Error(`Webflow pages API ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as {
      pages: WebflowPageLite[];
      pagination?: { total?: number };
    };
    pages.push(...(json.pages ?? []));
    const total = json.pagination?.total ?? 0;
    if (!json.pages?.length || pages.length >= total) break;
    offset += limit;
  }

  return pages.filter((p) => !p.collectionId && !p.draft && !p.archived);
}

export function buildLiveUrl(domain: string, page: WebflowPageLite): string {
  const path = page.publishedPath || `/${page.slug}`;
  const clean = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${clean}${path}`;
}
