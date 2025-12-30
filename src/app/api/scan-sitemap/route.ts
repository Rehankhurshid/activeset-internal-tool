
import { NextRequest, NextResponse } from 'next/server';
import { projectsService } from '@/services/database';
import { ProjectLink } from '@/types';

export async function POST(request: NextRequest) {
    try {
        const { projectId, sitemapUrl } = await request.json();

        if (!projectId || !sitemapUrl) {
            return NextResponse.json({ error: 'Missing projectId or sitemapUrl' }, { status: 400 });
        }

        console.log(`Scanning sitemap for project ${projectId}: ${sitemapUrl}`);

        // Fetch sitemap
        const response = await fetch(sitemapUrl);
        if (!response.ok) {
            return NextResponse.json({ error: `Failed to fetch sitemap: ${response.statusText}` }, { status: response.status });
        }
        const xmlText = await response.text();

        // Parse URLs using regex (simple and robust for standard sitemaps)
        const locRegex = /<loc>(.*?)<\/loc>/g;
        const matches = [...xmlText.matchAll(locRegex)].map(m => m[1]);
        const uniqueUrls = Array.from(new Set(matches));

        console.log(`Found ${uniqueUrls.length} URLs in sitemap`);

        if (uniqueUrls.length === 0) {
            return NextResponse.json({ count: 0, message: 'No URLs found in sitemap' });
        }

        // Get Project to check for duplicates
        const project = await projectsService.getProject(projectId);
        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        // Normalize URLs to avoid duplicates (strip trailing slash, lowercase)
        const existingUrls = new Set(project.links.map(l => l.url.replace(/\/$/, '').toLowerCase()));
        const newLinks: ProjectLink[] = [];

        uniqueUrls.forEach(url => {
            const normalized = url.replace(/\/$/, '').toLowerCase();
            if (!existingUrls.has(normalized)) {
                // Create new link
                newLinks.push({
                    id: crypto.randomUUID(),
                    url: url,
                    title: new URL(url).pathname, // Fallback title, will be updated by audit
                    source: 'auto',
                    order: project.links.length + newLinks.length // Assign order
                });
                existingUrls.add(normalized);
            }
        });

        console.log(`Adding ${newLinks.length} new links from sitemap`);

        if (newLinks.length > 0) {
            await projectsService.updateProjectLinks(projectId, [...project.links, ...newLinks]);
        }

        return NextResponse.json({
            count: newLinks.length,
            added: newLinks,
            totalFound: uniqueUrls.length
        });

    } catch (error) {
        console.error('Sitemap scan failed:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
