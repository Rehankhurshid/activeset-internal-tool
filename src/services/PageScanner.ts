import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import { ExtendedContentSnapshot, ImageInfo, LinkInfo, SectionInfo } from '@/types';

export interface PageScanResult {
    fullHash: string;
    contentHash: string;
    htmlSource: string;
    contentSnapshot: ExtendedContentSnapshot;
    score: number;
    canDeploy: boolean;
    categories: {
        placeholders: {
            status: 'passed' | 'failed';
            issues: { type: string; count: number }[];
            score: number;
        };
        spelling: {
            status: 'passed';
            issues: { word: string; suggestion?: string }[];
            score: number;
        };
        readability: {
            status: 'passed';
            score: number;
            fleschScore: number;
            wordCount: number;
            sentenceCount: number;
            label: string;
        };
        completeness: {
            status: 'passed' | 'failed' | 'warning';
            issues: { check: string; detail: string }[];
            score: number;
        };
        seo: {
            status: 'passed' | 'failed' | 'warning';
            issues: string[];
            score: number;
        };
        technical: {
            status: 'passed';
            issues: string[];
            score: number;
        };
    };
}

/**
 * Server-side page scanner using Cheerio.
 * Fetches page HTML and extracts content without browser plugin artifacts.
 */
export class PageScanner {
    /**
     * Scan a URL and extract content snapshot with hashes
     */
    async scan(url: string): Promise<PageScanResult> {
        // Fetch the page
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'ActiveSet-Audit-Bot/1.0 (+https://activeset.co)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
        }

        const htmlSource = await response.text();
        const $ = cheerio.load(htmlSource);

        // Remove scripts, styles, and structural elements for content extraction
        $('script, style, noscript, iframe, svg').remove();

        // Remove known dynamic noise sections to prevent false positive Tech Changes
        // These sections change on every load (random related posts, etc) but are not 'real' changes
        $('.stories-listing_item, .stories-listing-wrapper').remove();

        // Extract metadata
        const title = $('title').text().trim() || '';
        const h1 = $('h1').first().text().trim() || '';
        const metaDescription = $('meta[name="description"]').attr('content')?.trim() || '';

        // Extract all headings (H1-H3) with their tag type
        const headings: string[] = [];
        const headingsWithTags: Array<{ tag: string, text: string }> = [];
        $('h1, h2, h3').each((_, el) => {
            const $el = $(el);
            const text = $el.text().trim();
            const tagName = (el as unknown as { name: string }).name?.toUpperCase() || 'H?';
            if (text) {
                headings.push(text);
                headingsWithTags.push({ tag: tagName, text });
            }
        });

        // Get main content area (prefer main, article, then body)
        let mainContent = $('main');
        if (mainContent.length === 0) mainContent = $('article');
        if (mainContent.length === 0) mainContent = $('body');

        // Clone and remove nav/footer from main content for word count
        const contentClone = mainContent.clone();
        contentClone.find('nav, header, footer, aside').remove();
        const bodyText = contentClone.text().replace(/\s+/g, ' ').trim();
        const words = bodyText.split(/\s+/).filter(w => w.length > 0);
        const wordCount = words.length;

        // Compute body text hash for content comparison
        const bodyTextHash = createHash('sha256').update(bodyText).digest('hex');

        // Extract images
        const images: ImageInfo[] = [];
        $('img').each((_, el) => {
            const $el = $(el);
            const src = $el.attr('src') || '';
            const alt = $el.attr('alt') || '';
            if (src) {
                // Check if image is within main content
                const inMainContent = mainContent.find('img').filter((_, img) => $(img).attr('src') === src).length > 0;
                images.push({ src, alt, inMainContent });
            }
        });

        // Extract links
        const links: LinkInfo[] = [];
        const pageHost = new URL(url).hostname;
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const text = $(el).text().trim();
            if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                let isExternal = false;
                try {
                    const linkUrl = new URL(href, url);
                    isExternal = linkUrl.hostname !== pageHost;
                } catch {
                    // Relative URL, not external
                }
                links.push({ href, text, isExternal });
            }
        });

        // Extract sections (simplified)
        const sections: SectionInfo[] = [];
        $('section, article, main > div').slice(0, 10).each((_, el) => {
            const $el = $(el);
            const heading = $el.find('h1, h2, h3').first().text().trim();
            const sectionText = $el.text().replace(/\s+/g, ' ').trim();
            const sectionWords = sectionText.split(/\s+/).filter(w => w.length > 0);
            const tagName = 'type' in el && el.type === 'tag' && 'name' in el ? (el as cheerio.TagElement).name : 'div';
            sections.push({
                selector: tagName.toLowerCase(),
                headingText: heading,
                wordCount: sectionWords.length,
                textPreview: sectionText.substring(0, 150)
            });
        });

        // Compute hashes
        const contentHash = bodyTextHash;

        // Build data object for canonical Full Hash (Data-Driven Hash)
        // This relies ONLY on extracted content, ignoring HTML structure/classes/attributes/comments
        const dataForHash = {
            title,
            h1,
            metaDescription,
            wordCount,
            headingsWithTags,
            images,
            links,
            bodyText // Include full body text in hash
        };
        const fullHash = createHash('sha256').update(JSON.stringify(dataForHash)).digest('hex');

        // Build content snapshot
        const contentSnapshot: ExtendedContentSnapshot = {
            title,
            h1,
            metaDescription,
            wordCount,
            headings,
            headingsWithTags,
            images,
            links,
            sections,
            bodyTextHash,
            // First 500 chars of body text for change comparison display
            bodyTextPreview: bodyText.substring(0, 500)
        };

        // Check for placeholders
        const placeholderPatterns = [
            { regex: /lorem ipsum/gi, type: 'Lorem Ipsum' },
            { regex: /\[placeholder\]/gi, type: '[placeholder]' },
            { regex: /\{\{.*?\}\}/g, type: 'Template variables' },
            { regex: /\[YOUR.*?\]/gi, type: '[YOUR...] placeholder' },
            { regex: /\[INSERT.*?\]/gi, type: '[INSERT...] placeholder' },
        ];

        const placeholderIssues: { type: string; count: number }[] = [];
        let hasPlaceholders = false;

        for (const pattern of placeholderPatterns) {
            const matches = bodyText.match(pattern.regex);
            if (matches && matches.length > 0) {
                placeholderIssues.push({ type: pattern.type, count: matches.length });
                hasPlaceholders = true;
            }
        }

        // Completeness checks
        const completenessIssues: { check: string; detail: string }[] = [];
        if (!title) completenessIssues.push({ check: 'Missing title', detail: 'Page has no <title> tag' });
        if (!h1) completenessIssues.push({ check: 'Missing H1', detail: 'Page has no H1 heading' });
        if (wordCount < 300) completenessIssues.push({ check: 'Low word count', detail: `Only ${wordCount} words (recommended: 300+)` });

        // SEO checks
        const seoIssues: string[] = [];
        if (!metaDescription) seoIssues.push('Missing meta description');
        else if (metaDescription.length < 50) seoIssues.push('Meta description too short');
        else if (metaDescription.length > 160) seoIssues.push('Meta description too long');

        const imagesWithoutAlt = images.filter(img => !img.alt);
        if (imagesWithoutAlt.length > 0) {
            seoIssues.push(`${imagesWithoutAlt.length} image(s) missing alt text`);
        }

        // Calculate score
        let score = 100;
        if (hasPlaceholders) score -= 30; // Major penalty
        if (completenessIssues.length > 0) score -= completenessIssues.length * 10;
        if (seoIssues.length > 0) score -= seoIssues.length * 5;
        score = Math.max(0, Math.min(100, score));

        const canDeploy = !hasPlaceholders;

        return {
            fullHash,
            contentHash,
            htmlSource,
            contentSnapshot,
            score,
            canDeploy,
            categories: {
                placeholders: {
                    status: hasPlaceholders ? 'failed' : 'passed',
                    issues: placeholderIssues,
                    score: hasPlaceholders ? 0 : 100
                },
                spelling: {
                    status: 'passed', // Spelling check done separately via LanguageTool
                    issues: [],
                    score: 100
                },
                readability: {
                    status: 'passed',
                    score: 100,
                    fleschScore: 0, // Not computed server-side
                    wordCount,
                    sentenceCount: 0,
                    label: 'Standard'
                },
                completeness: {
                    status: completenessIssues.length > 0 ? 'warning' : 'passed',
                    issues: completenessIssues,
                    score: Math.max(0, 100 - completenessIssues.length * 20)
                },
                seo: {
                    status: seoIssues.length > 0 ? 'warning' : 'passed',
                    issues: seoIssues,
                    score: Math.max(0, 100 - seoIssues.length * 10)
                },
                technical: {
                    status: 'passed',
                    issues: [],
                    score: 100
                }
            }
        };
    }
}

export const pageScanner = new PageScanner();
