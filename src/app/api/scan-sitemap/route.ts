
import { NextRequest, NextResponse } from 'next/server';
import { projectsService } from '@/services/database';
import { ProjectLink } from '@/types';

interface SitemapEntry {
    url: string;
    locale?: string;
}

/**
 * Parse sitemap XML and extract URLs with locale information.
 * Supports both standard sitemaps and multi-lingual sitemaps with xhtml:link hreflang.
 */
function parseSitemap(xmlText: string): SitemapEntry[] {
    const entries: SitemapEntry[] = [];
    const seenUrls = new Set<string>();

    // Match each <url> block
    const urlBlockRegex = /<url>([\s\S]*?)<\/url>/g;
    let urlMatch;

    while ((urlMatch = urlBlockRegex.exec(xmlText)) !== null) {
        const urlBlock = urlMatch[1];

        // Extract primary <loc> URL
        const locMatch = urlBlock.match(/<loc>(.*?)<\/loc>/);
        if (!locMatch) continue;

        const primaryUrl = locMatch[1].trim();

        // Check for xhtml:link with hreflang (multi-lingual sitemap)
        // Format: <xhtml:link rel="alternate" hreflang="de" href="https://..."/>
        const hreflangRegex = /<xhtml:link[^>]*hreflang="([^"]+)"[^>]*href="([^"]+)"/g;
        const hreflangMatches = [...urlBlock.matchAll(hreflangRegex)];

        if (hreflangMatches.length > 0) {
            // Multi-lingual: add each hreflang variant
            for (const [, hreflang, href] of hreflangMatches) {
                const url = href.trim();
                const normalizedUrl = url.replace(/\/$/, '').toLowerCase();

                if (!seenUrls.has(normalizedUrl)) {
                    seenUrls.add(normalizedUrl);
                    entries.push({
                        url,
                        locale: hreflang === 'x-default' ? undefined : hreflang
                    });
                }
            }
        } else {
            // Single-language: just add the primary URL
            const normalizedUrl = primaryUrl.replace(/\/$/, '').toLowerCase();
            if (!seenUrls.has(normalizedUrl)) {
                seenUrls.add(normalizedUrl);
                entries.push({ url: primaryUrl });
            }
        }
    }

    // Fallback: if no <url> blocks found, try simple <loc> extraction
    if (entries.length === 0) {
        const locRegex = /<loc>(.*?)<\/loc>/g;
        let match;
        while ((match = locRegex.exec(xmlText)) !== null) {
            const url = match[1].trim();
            const normalizedUrl = url.replace(/\/$/, '').toLowerCase();
            if (!seenUrls.has(normalizedUrl)) {
                seenUrls.add(normalizedUrl);
                entries.push({ url });
            }
        }
    }

    return entries;
}

export async function POST(request: NextRequest) {
    try {
        const { projectId, sitemapUrl } = await request.json();

        if (!projectId || !sitemapUrl) {
            return NextResponse.json({ error: 'Missing projectId or sitemapUrl' }, { status: 400 });
        }

        console.log(`Scanning sitemap for project ${projectId}: ${sitemapUrl}`);

        // Normalize sitemap URL - add https:// if no protocol specified
        let normalizedSitemapUrl = sitemapUrl.trim();
        if (!normalizedSitemapUrl.startsWith('http://') && !normalizedSitemapUrl.startsWith('https://')) {
            normalizedSitemapUrl = `https://${normalizedSitemapUrl}`;
        }

        // Fetch sitemap
        const response = await fetch(normalizedSitemapUrl);
        if (!response.ok) {
            return NextResponse.json({ error: `Failed to fetch sitemap: ${response.statusText}` }, { status: response.status });
        }
        const xmlText = await response.text();

        // Parse sitemap with hreflang support
        const sitemapEntries = parseSitemap(xmlText);

        console.log(`Found ${sitemapEntries.length} URLs in sitemap`);
        console.log('URLs found:', sitemapEntries.slice(0, 5).map(e => e.url)); // Log first 5 for debugging

        if (sitemapEntries.length === 0) {
            return NextResponse.json({ count: 0, message: 'No URLs found in sitemap' });
        }

        // Get Project to check for duplicates
        const project = await projectsService.getProject(projectId);
        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        // Normalize existing URLs to avoid duplicates
        const existingUrls = new Set(project.links.map(l => l.url.replace(/\/$/, '').toLowerCase()));
        const newLinks: ProjectLink[] = [];

        sitemapEntries.forEach(entry => {
            const normalized = entry.url.replace(/\/$/, '').toLowerCase();
            if (!existingUrls.has(normalized)) {
                // Create new link with locale info
                const pathname = new URL(entry.url).pathname;
                // Use "Homepage" for root path, otherwise use pathname
                const displayTitle = pathname === '/' ? 'Homepage' : pathname;

                // Detect page type: Nested paths (>1 segment) are likely collections/CMS items
                const pathSegments = pathname.split('/').filter(Boolean);
                const isCollection = pathSegments.length > 1; // e.g., /blog/post-1
                const pageType: 'collection' | 'static' = isCollection ? 'collection' : 'static';

                const title = entry.locale
                    ? `${displayTitle} [${entry.locale.toUpperCase()}]`
                    : displayTitle;

                const newLink: ProjectLink = {
                    id: crypto.randomUUID(),
                    url: entry.url,
                    title: title,
                    source: 'auto',
                    order: project.links.length + newLinks.length,
                    pageType
                };

                // Only add locale if it exists (Firestore doesn't allow undefined)
                if (entry.locale) {
                    newLink.locale = entry.locale;
                }

                newLinks.push(newLink);
                existingUrls.add(normalized);
            } else {
                // URL already exists - find and mark it as 'auto' source to include in Audit Dashboard
                const existingLink = project.links.find(l =>
                    l.url.replace(/\/$/, '').toLowerCase() === normalized
                );
                if (existingLink) {
                    if (existingLink.source !== 'auto') {
                        existingLink.source = 'auto';
                        console.log(`[scan-sitemap] Updated source to 'auto': ${entry.url}`);
                    }
                    // Retroactively set pageType if missing
                    if (!existingLink.pageType) {
                        try {
                            const pathname = new URL(existingLink.url).pathname;
                            const pathSegments = pathname.split('/').filter(Boolean);
                            const isCollection = pathSegments.length > 1;
                            existingLink.pageType = isCollection ? 'collection' : 'static';
                        } catch (e) { /* ignore URL parse error */ }
                    }
                } else {
                    console.log(`[scan-sitemap] Skipped (already exists): ${entry.url}`);
                }
            }
        });

        console.log(`Adding ${newLinks.length} new links from sitemap (${sitemapEntries.filter(e => e.locale).length} with locale info)`);

        // Update project with new links + any existing links with updated source/pageType
        // Ensure existing links also get pageType if missing
        const updatedExistingLinks = project.links.map(link => {
            if (link.pageType) return link;
            // Retroactively detect page type
            try {
                const pathname = new URL(link.url).pathname;
                const pathSegments = pathname.split('/').filter(Boolean);
                const isCollection = pathSegments.length > 1;
                return { ...link, pageType: (isCollection ? 'collection' : 'static') as 'collection' | 'static' };
            } catch (e) {
                return link;
            }
        });

        const updatedLinks = [...updatedExistingLinks, ...newLinks];
        await projectsService.updateProjectLinks(projectId, updatedLinks);

        // Save sitemap URL for daily scans
        if (sitemapUrl) {
            await projectsService.updateProjectSitemap(projectId, sitemapUrl);
        }

        return NextResponse.json({
            count: newLinks.length,
            added: newLinks,
            totalFound: sitemapEntries.length,
            localesDetected: [...new Set(sitemapEntries.map(e => e.locale).filter(Boolean))]
        });

    } catch (error) {
        console.error('Sitemap scan failed:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
