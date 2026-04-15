"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAllStaticPages = fetchAllStaticPages;
exports.buildLiveUrl = buildLiveUrl;
const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';
async function fetchAllStaticPages(siteId, token) {
    const pages = [];
    let offset = 0;
    const limit = 100;
    while (true) {
        const res = await fetch(`${WEBFLOW_API_BASE}/sites/${siteId}/pages?limit=${limit}&offset=${offset}`, { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' } });
        if (!res.ok) {
            throw new Error(`Webflow pages API ${res.status}: ${await res.text()}`);
        }
        const json = (await res.json());
        pages.push(...(json.pages ?? []));
        const total = json.pagination?.total ?? 0;
        if (!json.pages?.length || pages.length >= total)
            break;
        offset += limit;
    }
    return pages.filter((p) => !p.collectionId && !p.draft && !p.archived);
}
function buildLiveUrl(domain, page) {
    const path = page.publishedPath || `/${page.slug}`;
    const clean = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `https://${clean}${path}`;
}
