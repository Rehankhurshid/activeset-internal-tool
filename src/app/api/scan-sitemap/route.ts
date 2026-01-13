
import { NextRequest, NextResponse } from 'next/server';
import { projectsService } from '@/services/database';
import { ProjectLink } from '@/types';
import { auditService } from '@/services/AuditService';
import { changeLogService } from '@/services/ChangeLogService';

interface SitemapEntry {
    url: string;
    locale?: string;
}

/**
 * Parse sitemap XML and extract URLs with locale information.
 * Supports both standard sitemaps and multi-lingual sitemaps with xhtml:link hreflang.
 * 
 * For multilingual sitemaps, each <url> block contains:
 * - A primary <loc> URL
 * - Multiple <xhtml:link> elements pointing to all language variants
 * 
 * We detect the locale of the primary URL by finding the hreflang entry 
 * whose href matches the <loc> URL.
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
        const normalizedPrimaryUrl = primaryUrl.replace(/\/$/, '').toLowerCase();

        // Skip if we've already seen this URL
        if (seenUrls.has(normalizedPrimaryUrl)) continue;

        // Check for xhtml:link with hreflang (multi-lingual sitemap)
        // Format: <xhtml:link rel="alternate" hreflang="de" href="https://..."/>
        const hreflangRegex = /<xhtml:link[^>]*hreflang="([^"]+)"[^>]*href="([^"]+)"/g;
        const hreflangMatches = [...urlBlock.matchAll(hreflangRegex)];

        let detectedLocale: string | undefined;

        if (hreflangMatches.length > 0) {
            // Find the hreflang entry that matches the primary URL
            for (const [, hreflang, href] of hreflangMatches) {
                const normalizedHref = href.trim().replace(/\/$/, '').toLowerCase();
                if (normalizedHref === normalizedPrimaryUrl) {
                    // Found matching hreflang for this URL
                    detectedLocale = hreflang === 'x-default' ? 'en' : hreflang;
                    break;
                }
            }

            // Fallback: if no exact match found, try to detect from URL path
            if (!detectedLocale) {
                detectedLocale = detectLocaleFromPath(primaryUrl);
            }
        }

        seenUrls.add(normalizedPrimaryUrl);
        entries.push({
            url: primaryUrl,
            locale: detectedLocale
        });
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
                entries.push({
                    url,
                    locale: detectLocaleFromPath(url)
                });
            }
        }
    }

    return entries;
}

/**
 * Detect locale from URL path patterns like /es-mx/, /pt-br/, /de/, etc.
 */
function detectLocaleFromPath(url: string): string | undefined {
    try {
        const pathname = new URL(url).pathname;
        // Common locale patterns: /es-mx/, /pt-BR/, /de/, /fr-ca/, etc.
        const localeMatch = pathname.match(/^\/([a-z]{2}(?:-[a-z]{2,3})?)\//i);
        if (localeMatch) {
            return localeMatch[1].toLowerCase();
        }
        // Check if path starts with locale without trailing content (e.g., /es-mx)
        const shortMatch = pathname.match(/^\/([a-z]{2}(?:-[a-z]{2,3})?)$/i);
        if (shortMatch) {
            return shortMatch[1].toLowerCase();
        }
    } catch {
        // Invalid URL, ignore
    }
    return undefined;
}

/**
 * Check if a URL path matches a pattern.
 * Supports glob-like patterns: /blog/* matches /blog/anything
 */
function matchesPattern(pathname: string, pattern: string): boolean {
    // Normalize both
    const normalizedPath = pathname.replace(/\/$/, '').toLowerCase();
    const normalizedPattern = pattern.replace(/\/$/, '').toLowerCase();

    // Handle wildcard patterns
    if (normalizedPattern.endsWith('/*')) {
        const prefix = normalizedPattern.slice(0, -2);
        return normalizedPath === prefix || normalizedPath.startsWith(prefix + '/');
    }

    // Exact match
    return normalizedPath === normalizedPattern;
}

/**
 * Detect page type (collection/CMS vs static) using:
 * 1. User-defined PageTypeRules (highest priority)
 * 2. Webflow API data (if available)
 * 3. Default to 'static' (no heuristics - user must explicitly mark as CMS)
 */
function detectPageType(
    url: string,
    webflowPageTypeMap: Map<string, 'collection' | 'static'>,
    pageTypeRules: Array<{ pattern: string; pageType: 'static' | 'collection'; priority?: number }> = []
): 'collection' | 'static' {
    try {
        const normalizedUrl = url.replace(/\/$/, '').toLowerCase();
        const pathname = new URL(url).pathname.replace(/\/$/, '').toLowerCase();

        // Sort rules by priority (higher first), default priority = 0
        const sortedRules = [...pageTypeRules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

        // First try: Check user-defined rules
        for (const rule of sortedRules) {
            if (matchesPattern(pathname, rule.pattern)) {
                return rule.pageType;
            }
        }

        // Second try: exact URL match from Webflow
        if (webflowPageTypeMap.has(normalizedUrl)) {
            return webflowPageTypeMap.get(normalizedUrl)!;
        }

        // Third try: path match from Webflow
        if (webflowPageTypeMap.has(pathname)) {
            return webflowPageTypeMap.get(pathname)!;
        }

        // Default: All pages are static unless explicitly marked as CMS
        // User can review and mark folders as CMS through the dashboard
        return 'static';
    } catch {
        return 'static'; // Default to static on error
    }
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

        // Build Webflow page type lookup if project has Webflow config
        const webflowPageTypeMap = new Map<string, 'collection' | 'static'>();
        if (project.webflowConfig?.siteId && project.webflowConfig?.apiToken) {
            try {
                console.log(`[scan-sitemap] Fetching Webflow pages for accurate CMS detection...`);
                const webflowPagesUrl = new URL(`https://api.webflow.com/v2/sites/${project.webflowConfig.siteId}/pages`);
                webflowPagesUrl.searchParams.set('limit', '100');

                const wfResponse = await fetch(webflowPagesUrl.toString(), {
                    headers: {
                        Authorization: `Bearer ${project.webflowConfig.apiToken}`,
                        accept: 'application/json',
                    },
                });

                if (wfResponse.ok) {
                    const wfData = await wfResponse.json();
                    const pages = wfData.pages || [];

                    // Get custom domain or subdomain for URL matching
                    const baseUrl = project.webflowConfig.customDomain
                        ? `https://${project.webflowConfig.customDomain}`
                        : null;

                    pages.forEach((page: { publishedPath?: string; collectionId?: string; slug?: string }) => {
                        const path = page.publishedPath || `/${page.slug}`;
                        const pageType = page.collectionId ? 'collection' : 'static';

                        // Store the path (normalized) -> pageType mapping
                        const normalizedPath = path.replace(/\/$/, '').toLowerCase();
                        webflowPageTypeMap.set(normalizedPath, pageType);

                        // Also store with base URL if we know the domain
                        if (baseUrl) {
                            const fullUrl = `${baseUrl}${path}`.replace(/\/$/, '').toLowerCase();
                            webflowPageTypeMap.set(fullUrl, pageType);
                        }
                    });

                    console.log(`[scan-sitemap] Webflow page types loaded: ${webflowPageTypeMap.size} mappings (${pages.filter((p: { collectionId?: string }) => p.collectionId).length} CMS pages)`);
                } else {
                    console.warn(`[scan-sitemap] Failed to fetch Webflow pages: ${wfResponse.status} - using path heuristics`);
                }
            } catch (wfError) {
                console.warn(`[scan-sitemap] Webflow API error, falling back to path heuristics:`, wfError);
            }
        }

        // Create a set of normalized sitemap URLs for quick lookup
        const sitemapUrlSet = new Set(
            sitemapEntries.map(entry => entry.url.replace(/\/$/, '').toLowerCase())
        );

        // Separate existing links into auto and manual
        const existingAutoLinks = project.links.filter(l => l.source === 'auto');
        const manualLinks = project.links.filter(l => l.source !== 'auto');

        // Identify stale auto links (not in sitemap) to remove
        const staleAutoLinks = existingAutoLinks.filter(link => {
            const normalizedUrl = link.url.replace(/\/$/, '').toLowerCase();
            return !sitemapUrlSet.has(normalizedUrl);
        });

        // Identify auto links to keep (still in sitemap)
        const keptAutoLinks = existingAutoLinks.filter(link => {
            const normalizedUrl = link.url.replace(/\/$/, '').toLowerCase();
            return sitemapUrlSet.has(normalizedUrl);
        });

        console.log(`[scan-sitemap] Stale auto links to remove: ${staleAutoLinks.length}`);
        console.log(`[scan-sitemap] Auto links to keep: ${keptAutoLinks.length}`);
        console.log(`[scan-sitemap] Manual links preserved: ${manualLinks.length}`);

        // Delete audit history for stale links (batch delete in parallel)
        if (staleAutoLinks.length > 0) {
            console.log(`[scan-sitemap] Batch deleting audit history for ${staleAutoLinks.length} stale links...`);

            // Run all deletions in parallel
            await Promise.all(
                staleAutoLinks.flatMap(staleLink => [
                    auditService.deleteAuditLogsForLink(staleLink.id),
                    changeLogService.deleteEntriesForLink(staleLink.id)
                ])
            );

            console.log(`[scan-sitemap] Cleanup complete for ${staleAutoLinks.length} links`);
        }

        // Normalize existing URLs (from kept auto + manual) to avoid duplicates
        const existingUrls = new Set([
            ...keptAutoLinks.map(l => l.url.replace(/\/$/, '').toLowerCase()),
            ...manualLinks.map(l => l.url.replace(/\/$/, '').toLowerCase())
        ]);

        const newLinks: ProjectLink[] = [];

        sitemapEntries.forEach(entry => {
            const normalized = entry.url.replace(/\/$/, '').toLowerCase();
            if (!existingUrls.has(normalized)) {
                // Create new link with locale info
                const pathname = new URL(entry.url).pathname;
                // Use "Homepage" for root path, otherwise use pathname
                const displayTitle = pathname === '/' ? 'Homepage' : pathname;

                // Detect page type using rules, Webflow API data, or path heuristics
                const pageType = detectPageType(entry.url, webflowPageTypeMap, project.pageTypeRules || []);

                const title = entry.locale
                    ? `${displayTitle} [${entry.locale.toUpperCase()}]`
                    : displayTitle;

                const newLink: ProjectLink = {
                    id: crypto.randomUUID(),
                    url: entry.url,
                    title: title,
                    source: 'auto',
                    order: keptAutoLinks.length + manualLinks.length + newLinks.length,
                    pageType
                };

                // Only add locale if it exists (Firestore doesn't allow undefined)
                if (entry.locale) {
                    newLink.locale = entry.locale;
                }

                newLinks.push(newLink);
                existingUrls.add(normalized);
            } else {
                // URL already exists - find and ensure it's marked as 'auto' source
                const existingLink = [...keptAutoLinks, ...manualLinks].find(l =>
                    l.url.replace(/\/$/, '').toLowerCase() === normalized
                );
                if (existingLink && existingLink.source !== 'auto') {
                    existingLink.source = 'auto';
                    console.log(`[scan-sitemap] Updated source to 'auto': ${entry.url}`);
                }
                // Retroactively set or update pageType using rules/Webflow data
                if (existingLink && !existingLink.pageType) {
                    existingLink.pageType = detectPageType(existingLink.url, webflowPageTypeMap, project.pageTypeRules || []);
                }
            }
        });

        console.log(`Adding ${newLinks.length} new links from sitemap (${sitemapEntries.filter(e => e.locale).length} with locale info)`);

        // Build final links: manual links + kept auto links + new links
        // Ensure existing links also get pageType if missing, using Webflow data
        const processedKeptAutoLinks = keptAutoLinks.map(link => {
            if (link.pageType) return link;
            return { ...link, pageType: detectPageType(link.url, webflowPageTypeMap, project.pageTypeRules || []) };
        });

        const processedManualLinks = manualLinks.map(link => {
            if (link.pageType) return link;
            return { ...link, pageType: detectPageType(link.url, webflowPageTypeMap, project.pageTypeRules || []) };
        });

        const updatedLinks = [...processedManualLinks, ...processedKeptAutoLinks, ...newLinks];
        await projectsService.updateProjectLinks(projectId, updatedLinks);

        // Save sitemap URL for daily scans
        if (sitemapUrl) {
            await projectsService.updateProjectSitemap(projectId, sitemapUrl);
        }

        return NextResponse.json({
            count: newLinks.length,
            added: newLinks,
            removed: staleAutoLinks.length,
            removedLinks: staleAutoLinks.map(l => ({ id: l.id, url: l.url, title: l.title })),
            totalFound: sitemapEntries.length,
            localesDetected: [...new Set(sitemapEntries.map(e => e.locale).filter(Boolean))]
        });

    } catch (error) {
        console.error('Sitemap scan failed:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

