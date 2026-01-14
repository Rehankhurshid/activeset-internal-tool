import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import { ExtendedContentSnapshot, ImageInfo, LinkInfo, SectionInfo } from '@/types';

type CategoryStatus = 'passed' | 'failed' | 'warning' | 'info';
type CheerioRoot = ReturnType<typeof cheerio.load>;

export interface PageScanResult {
    fullHash: string;
    contentHash: string;
    htmlSource: string;
    contentSnapshot: ExtendedContentSnapshot;
    score: number;
    canDeploy: boolean;
    categories: {
        placeholders: {
            status: CategoryStatus;
            issues: { type: string; count: number }[];
            score: number;
        };
        spelling: {
            status: CategoryStatus;
            issues: { word: string; suggestion?: string }[];
            score: number;
        };
        readability: {
            status: CategoryStatus;
            score: number;
            fleschScore: number;
            wordCount: number;
            sentenceCount: number;
            label: string;
        };
        completeness: {
            status: CategoryStatus;
            issues: { check: string; detail: string }[];
            score: number;
        };
        seo: {
            status: CategoryStatus;
            issues: string[];
            title?: string;
            titleLength?: number;
            metaDescription?: string;
            metaDescriptionLength?: number;
            imagesWithoutAlt?: number;
            score: number;
        };
        technical: {
            status: CategoryStatus;
            issues: string[];
            score: number;
        };
        schema: {
            status: CategoryStatus;
            hasSchema: boolean;
            schemaTypes: string[];
            issues: { type: string; message: string }[];
            rawSchemas: object[];
            score: number;
        };
        links: {
            status: CategoryStatus;
            totalLinks: number;
            internalLinks: number;
            externalLinks: number;
            brokenLinks: { href: string; status: number; text: string; error?: string }[];
            score: number;
        };
        openGraph: {
            status: CategoryStatus;
            hasOpenGraph: boolean;
            title?: string;
            description?: string;
            image?: string;
            url?: string;
            type?: string;
            issues: string[];
            score: number;
        };
        twitterCards: {
            status: CategoryStatus;
            hasTwitterCards: boolean;
            card?: string;
            title?: string;
            description?: string;
            image?: string;
            issues: string[];
            score: number;
        };
        metaTags: {
            status: CategoryStatus;
            canonicalUrl?: string;
            hasViewport: boolean;
            viewport?: string;
            language?: string;
            robots?: string;
            favicon?: string;
            issues: string[];
            score: number;
        };
        headingStructure: {
            status: CategoryStatus;
            headings: { level: number; text: string }[];
            h1Count: number;
            issues: string[];
            score: number;
        };
        accessibility: {
            status: CategoryStatus;
            score: number;
            issues: {
                type: 'alt-text' | 'form-label' | 'aria' | 'skip-link' | 'link-text' | 'heading-order';
                severity: 'error' | 'warning';
                element?: string;
                message: string;
            }[];
            ariaLandmarks: string[];
            hasSkipLink: boolean;
            formInputsWithoutLabels: number;
            linksWithGenericText: number;
        };
    };
}

/**
 * Server-side page scanner using Cheerio.
 * Fetches page HTML and extracts content without browser plugin artifacts.
 */
export class PageScanner {
    /**
     * Extract and validate JSON-LD schema markup
     */
    private extractSchemaMarkup(htmlSource: string): {
        hasSchema: boolean;
        schemaTypes: string[];
        issues: { type: string; message: string }[];
        rawSchemas: object[];
    } {
        const $ = cheerio.load(htmlSource);
        const schemas: object[] = [];
        const schemaTypes: string[] = [];
        const issues: { type: string; message: string }[] = [];

        // Find all JSON-LD scripts
        $('script[type="application/ld+json"]').each((_, el) => {
            const content = $(el).html();
            if (content) {
                try {
                    const parsed = JSON.parse(content);
                    // Handle @graph arrays
                    const schemaItems = Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed];
                    
                    for (const item of schemaItems) {
                        if (item && typeof item === 'object') {
                            schemas.push(item);
                            const type = item['@type'];
                            if (type) {
                                const types = Array.isArray(type) ? type : [type];
                                schemaTypes.push(...types);
                            } else {
                                issues.push({ type: 'Missing @type', message: 'Schema object is missing @type property' });
                            }
                        }
                    }
                } catch (e) {
                    issues.push({ type: 'Invalid JSON', message: `Failed to parse JSON-LD: ${e instanceof Error ? e.message : 'Unknown error'}` });
                }
            }
        });

        // Validate common schema types
        const requiredProperties: Record<string, string[]> = {
            'Organization': ['name'],
            'WebSite': ['name', 'url'],
            'WebPage': ['name'],
            'Article': ['headline', 'author'],
            'Product': ['name'],
            'BreadcrumbList': ['itemListElement'],
            'LocalBusiness': ['name', 'address'],
            'Person': ['name'],
        };

        for (const schema of schemas) {
            const type = (schema as Record<string, unknown>)['@type'];
            const types = Array.isArray(type) ? type : [type];
            
            for (const t of types) {
                if (typeof t === 'string' && requiredProperties[t]) {
                    for (const prop of requiredProperties[t]) {
                        if (!(prop in schema)) {
                            issues.push({ type: t, message: `Missing required property: ${prop}` });
                        }
                    }
                }
            }
        }

        return {
            hasSchema: schemas.length > 0,
            schemaTypes: [...new Set(schemaTypes)],
            issues,
            rawSchemas: schemas
        };
    }

    /**
     * Extract Open Graph metadata
     */
    private extractOpenGraph($: CheerioRoot): {
        hasOpenGraph: boolean;
        title?: string;
        description?: string;
        image?: string;
        url?: string;
        type?: string;
        issues: string[];
    } {
        const ogTitle = $('meta[property="og:title"]').attr('content');
        const ogDescription = $('meta[property="og:description"]').attr('content');
        const ogImage = $('meta[property="og:image"]').attr('content');
        const ogUrl = $('meta[property="og:url"]').attr('content');
        const ogType = $('meta[property="og:type"]').attr('content');

        const hasOpenGraph = !!(ogTitle || ogDescription || ogImage);
        const issues: string[] = [];

        if (!ogTitle) issues.push('Missing og:title');
        if (!ogDescription) issues.push('Missing og:description');
        if (!ogImage) issues.push('Missing og:image');

        return {
            hasOpenGraph,
            title: ogTitle,
            description: ogDescription,
            image: ogImage,
            url: ogUrl,
            type: ogType,
            issues
        };
    }

    /**
     * Extract Twitter Card metadata
     */
    private extractTwitterCards($: CheerioRoot): {
        hasTwitterCards: boolean;
        card?: string;
        title?: string;
        description?: string;
        image?: string;
        issues: string[];
    } {
        const twitterCard = $('meta[name="twitter:card"]').attr('content');
        const twitterTitle = $('meta[name="twitter:title"]').attr('content');
        const twitterDescription = $('meta[name="twitter:description"]').attr('content');
        const twitterImage = $('meta[name="twitter:image"]').attr('content');

        const hasTwitterCards = !!(twitterCard || twitterTitle);
        const issues: string[] = [];

        if (!twitterCard) issues.push('Missing twitter:card');
        if (!twitterTitle) issues.push('Missing twitter:title');

        return {
            hasTwitterCards,
            card: twitterCard,
            title: twitterTitle,
            description: twitterDescription,
            image: twitterImage,
            issues
        };
    }

    /**
     * Extract meta tags (canonical, viewport, language, robots, favicon)
     */
    private extractMetaTags($: CheerioRoot, htmlSource: string): {
        canonicalUrl?: string;
        hasViewport: boolean;
        viewport?: string;
        language?: string;
        robots?: string;
        favicon?: string;
        issues: string[];
    } {
        const canonicalUrl = $('link[rel="canonical"]').attr('href');
        const viewport = $('meta[name="viewport"]').attr('content');
        const language = $('html').attr('lang');
        const robots = $('meta[name="robots"]').attr('content');
        const favicon = $('link[rel="icon"], link[rel="shortcut icon"]').first().attr('href');

        const issues: string[] = [];

        if (!canonicalUrl) issues.push('Missing canonical URL');
        if (!viewport) issues.push('Missing viewport meta tag');
        if (!language) issues.push('Missing lang attribute on <html>');
        if (!favicon) issues.push('Missing favicon');

        // Check for mixed content (http resources on https page)
        if (htmlSource.includes('https://')) {
            const httpResources = htmlSource.match(/src=["']http:\/\/[^"']+["']/gi);
            if (httpResources && httpResources.length > 0) {
                issues.push(`${httpResources.length} mixed content resource(s) detected (HTTP on HTTPS)`);
            }
        }

        return {
            canonicalUrl,
            hasViewport: !!viewport,
            viewport,
            language,
            robots,
            favicon,
            issues
        };
    }

    /**
     * Validate heading structure (H1-H6 hierarchy)
     */
    private validateHeadingStructure($: CheerioRoot): {
        headings: { level: number; text: string }[];
        h1Count: number;
        issues: string[];
    } {
        const headings: { level: number; text: string }[] = [];
        const issues: string[] = [];

        $('h1, h2, h3, h4, h5, h6').each((_, el) => {
            const $el = $(el);
            const tagName = (el as unknown as { name: string }).name?.toLowerCase() || 'h1';
            const level = parseInt(tagName.replace('h', ''), 10);
            const text = $el.text().trim();
            
            if (text) {
                headings.push({ level, text: text.substring(0, 100) });
            }
        });

        const h1Count = headings.filter(h => h.level === 1).length;

        // Check for multiple H1s
        if (h1Count === 0) {
            issues.push('No H1 heading found');
        } else if (h1Count > 1) {
            issues.push(`Multiple H1 headings found (${h1Count})`);
        }

        // Check for skipped heading levels
        let previousLevel = 0;
        for (const heading of headings) {
            if (previousLevel > 0 && heading.level > previousLevel + 1) {
                issues.push(`Heading level skipped: H${previousLevel} to H${heading.level}`);
                break; // Only report first skip
            }
            previousLevel = heading.level;
        }

        return {
            headings,
            h1Count,
            issues
        };
    }

    /**
     * Check accessibility issues
     */
    private checkAccessibility($: CheerioRoot): {
        issues: {
            type: 'alt-text' | 'form-label' | 'aria' | 'skip-link' | 'link-text' | 'heading-order';
            severity: 'error' | 'warning';
            element?: string;
            message: string;
        }[];
        ariaLandmarks: string[];
        hasSkipLink: boolean;
        formInputsWithoutLabels: number;
        linksWithGenericText: number;
    } {
        const issues: {
            type: 'alt-text' | 'form-label' | 'aria' | 'skip-link' | 'link-text' | 'heading-order';
            severity: 'error' | 'warning';
            element?: string;
            message: string;
        }[] = [];

        // Check ARIA landmarks
        const ariaLandmarks: string[] = [];
        const landmarkRoles = ['banner', 'navigation', 'main', 'contentinfo', 'complementary', 'region', 'search'];
        
        // Check for role attributes
        landmarkRoles.forEach(role => {
            if ($(`[role="${role}"]`).length > 0) {
                ariaLandmarks.push(role);
            }
        });
        
        // Check for semantic HTML5 elements that imply landmarks
        if ($('header').length > 0 && !ariaLandmarks.includes('banner')) ariaLandmarks.push('banner');
        if ($('nav').length > 0 && !ariaLandmarks.includes('navigation')) ariaLandmarks.push('navigation');
        if ($('main').length > 0 && !ariaLandmarks.includes('main')) ariaLandmarks.push('main');
        if ($('footer').length > 0 && !ariaLandmarks.includes('contentinfo')) ariaLandmarks.push('contentinfo');
        if ($('aside').length > 0 && !ariaLandmarks.includes('complementary')) ariaLandmarks.push('complementary');

        // Check for missing main landmark
        if (!ariaLandmarks.includes('main')) {
            issues.push({
                type: 'aria',
                severity: 'warning',
                message: 'Missing main landmark (no <main> element or role="main")'
            });
        }

        // Check for skip link
        const skipLinkSelectors = [
            'a[href="#main"]',
            'a[href="#content"]',
            'a[href="#main-content"]',
            'a[href="#maincontent"]',
            'a.skip-link',
            'a.skip-to-main',
            'a.skip-to-content',
            '[class*="skip-link"]',
            '[class*="skip-to"]'
        ];
        const hasSkipLink = skipLinkSelectors.some(sel => $(sel).length > 0);
        
        if (!hasSkipLink) {
            issues.push({
                type: 'skip-link',
                severity: 'warning',
                message: 'No skip-to-main-content link found'
            });
        }

        // Check form inputs for labels
        let formInputsWithoutLabels = 0;
        $('input, select, textarea').each((_, el) => {
            const $el = $(el);
            const type = $el.attr('type');
            
            // Skip hidden, submit, button, reset types
            if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type || '')) {
                return;
            }

            const id = $el.attr('id');
            const ariaLabel = $el.attr('aria-label');
            const ariaLabelledby = $el.attr('aria-labelledby');
            const placeholder = $el.attr('placeholder');
            
            // Check if there's an associated label
            const hasLabel = (id && $(`label[for="${id}"]`).length > 0) || 
                             ariaLabel || 
                             ariaLabelledby ||
                             $el.closest('label').length > 0;
            
            if (!hasLabel) {
                formInputsWithoutLabels++;
                // Only add first few issues to avoid spam
                if (formInputsWithoutLabels <= 3) {
                    const identifier = id || $el.attr('name') || type || 'input';
                    issues.push({
                        type: 'form-label',
                        severity: 'error',
                        element: identifier,
                        message: `Form input "${identifier}" is missing a label${placeholder ? ' (placeholder is not a substitute)' : ''}`
                    });
                }
            }
        });

        if (formInputsWithoutLabels > 3) {
            issues.push({
                type: 'form-label',
                severity: 'error',
                message: `${formInputsWithoutLabels - 3} more form inputs without labels`
            });
        }

        // Check for generic link text
        const genericLinkTexts = ['click here', 'read more', 'learn more', 'here', 'more', 'link', 'click'];
        let linksWithGenericText = 0;
        
        $('a').each((_, el) => {
            const $el = $(el);
            const text = $el.text().trim().toLowerCase();
            const ariaLabel = $el.attr('aria-label');
            
            // Skip if has aria-label
            if (ariaLabel) return;
            
            if (genericLinkTexts.includes(text)) {
                linksWithGenericText++;
                // Only add first few issues
                if (linksWithGenericText <= 3) {
                    issues.push({
                        type: 'link-text',
                        severity: 'warning',
                        element: text,
                        message: `Link with generic text "${text}" - provide more descriptive text`
                    });
                }
            }
        });

        if (linksWithGenericText > 3) {
            issues.push({
                type: 'link-text',
                severity: 'warning',
                message: `${linksWithGenericText - 3} more links with generic text`
            });
        }

        return {
            issues,
            ariaLandmarks,
            hasSkipLink,
            formInputsWithoutLabels,
            linksWithGenericText
        };
    }

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
        
        // Extract new metadata BEFORE removing scripts
        const schemaResult = this.extractSchemaMarkup(htmlSource);
        
        const $ = cheerio.load(htmlSource);

        // Extract additional metadata before content cleaning
        const openGraphResult = this.extractOpenGraph($);
        const twitterCardsResult = this.extractTwitterCards($);
        const metaTagsResult = this.extractMetaTags($, htmlSource);
        const headingStructureResult = this.validateHeadingStructure($);
        const accessibilityResult = this.checkAccessibility($);

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

        // SEO checks (enhanced with title validation)
        const seoIssues: string[] = [];
        
        // Title checks
        if (!title) {
            seoIssues.push('Missing page title');
        } else if (title.length < 30) {
            seoIssues.push(`Title too short (${title.length} chars, recommended: 30-60)`);
        } else if (title.length > 60) {
            seoIssues.push(`Title too long (${title.length} chars, recommended: 30-60)`);
        }
        
        // Meta description checks
        if (!metaDescription) {
            seoIssues.push('Missing meta description');
        } else if (metaDescription.length < 50) {
            seoIssues.push(`Meta description too short (${metaDescription.length} chars, recommended: 50-160)`);
        } else if (metaDescription.length > 160) {
            seoIssues.push(`Meta description too long (${metaDescription.length} chars, recommended: 50-160)`);
        }

        const imagesWithoutAlt = images.filter(img => !img.alt);
        if (imagesWithoutAlt.length > 0) {
            seoIssues.push(`${imagesWithoutAlt.length} image(s) missing alt text`);
        }
        
        // Link stats for the links category
        const internalLinks = links.filter(l => !l.isExternal).length;
        const externalLinks = links.filter(l => l.isExternal).length;

        // Calculate individual category scores
        const schemaScore = schemaResult.hasSchema 
            ? Math.max(0, 100 - schemaResult.issues.length * 15)
            : 0;
        
        const openGraphScore = openGraphResult.hasOpenGraph
            ? Math.max(0, 100 - openGraphResult.issues.length * 20)
            : 0;
            
        const twitterCardsScore = twitterCardsResult.hasTwitterCards
            ? Math.max(0, 100 - twitterCardsResult.issues.length * 20)
            : 50; // Lower penalty for missing Twitter cards
            
        const metaTagsScore = Math.max(0, 100 - metaTagsResult.issues.length * 15);
        
        const headingStructureScore = Math.max(0, 100 - headingStructureResult.issues.length * 20);
        
        // Accessibility score: errors are -20, warnings are -10
        const accessibilityErrors = accessibilityResult.issues.filter(i => i.severity === 'error').length;
        const accessibilityWarnings = accessibilityResult.issues.filter(i => i.severity === 'warning').length;
        const accessibilityScore = Math.max(0, 100 - accessibilityErrors * 20 - accessibilityWarnings * 10);

        // Calculate overall score
        let score = 100;
        if (hasPlaceholders) score -= 30; // Major penalty
        if (completenessIssues.length > 0) score -= completenessIssues.length * 10;
        if (seoIssues.length > 0) score -= seoIssues.length * 5;
        if (!schemaResult.hasSchema) score -= 5; // Minor penalty for no schema
        if (schemaResult.issues.length > 0) score -= schemaResult.issues.length * 2;
        if (openGraphResult.issues.length > 0) score -= openGraphResult.issues.length * 2;
        if (headingStructureResult.issues.length > 0) score -= headingStructureResult.issues.length * 3;
        if (accessibilityErrors > 0) score -= accessibilityErrors * 3;
        if (accessibilityWarnings > 0) score -= accessibilityWarnings * 1;
        score = Math.max(0, Math.min(100, score));

        const canDeploy = !hasPlaceholders;

        // Determine status helper
        const getStatus = (issueCount: number, hasCritical = false): CategoryStatus => {
            if (hasCritical) return 'failed';
            if (issueCount === 0) return 'passed';
            if (issueCount <= 2) return 'warning';
            return 'failed';
        };

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
                    status: getStatus(completenessIssues.length),
                    issues: completenessIssues,
                    score: Math.max(0, 100 - completenessIssues.length * 20)
                },
                seo: {
                    status: getStatus(seoIssues.length),
                    issues: seoIssues,
                    title,
                    titleLength: title.length,
                    metaDescription,
                    metaDescriptionLength: metaDescription.length,
                    imagesWithoutAlt: imagesWithoutAlt.length,
                    score: Math.max(0, 100 - seoIssues.length * 10)
                },
                technical: {
                    status: 'passed',
                    issues: [],
                    score: 100
                },
                schema: {
                    status: schemaResult.hasSchema 
                        ? getStatus(schemaResult.issues.length)
                        : 'warning',
                    hasSchema: schemaResult.hasSchema,
                    schemaTypes: schemaResult.schemaTypes,
                    issues: schemaResult.issues,
                    rawSchemas: schemaResult.rawSchemas,
                    score: schemaScore
                },
                links: {
                    status: 'passed', // Broken links checked separately via API
                    totalLinks: links.length,
                    internalLinks,
                    externalLinks,
                    brokenLinks: [], // Populated by /api/check-links
                    score: 100
                },
                openGraph: {
                    status: openGraphResult.hasOpenGraph
                        ? getStatus(openGraphResult.issues.length)
                        : 'warning',
                    hasOpenGraph: openGraphResult.hasOpenGraph,
                    title: openGraphResult.title,
                    description: openGraphResult.description,
                    image: openGraphResult.image,
                    url: openGraphResult.url,
                    type: openGraphResult.type,
                    issues: openGraphResult.issues,
                    score: openGraphScore
                },
                twitterCards: {
                    status: twitterCardsResult.hasTwitterCards
                        ? getStatus(twitterCardsResult.issues.length)
                        : 'info', // Info level for missing Twitter cards
                    hasTwitterCards: twitterCardsResult.hasTwitterCards,
                    card: twitterCardsResult.card,
                    title: twitterCardsResult.title,
                    description: twitterCardsResult.description,
                    image: twitterCardsResult.image,
                    issues: twitterCardsResult.issues,
                    score: twitterCardsScore
                },
                metaTags: {
                    status: getStatus(metaTagsResult.issues.length),
                    canonicalUrl: metaTagsResult.canonicalUrl,
                    hasViewport: metaTagsResult.hasViewport,
                    viewport: metaTagsResult.viewport,
                    language: metaTagsResult.language,
                    robots: metaTagsResult.robots,
                    favicon: metaTagsResult.favicon,
                    issues: metaTagsResult.issues,
                    score: metaTagsScore
                },
                headingStructure: {
                    status: getStatus(headingStructureResult.issues.length),
                    headings: headingStructureResult.headings,
                    h1Count: headingStructureResult.h1Count,
                    issues: headingStructureResult.issues,
                    score: headingStructureScore
                },
                accessibility: {
                    status: getStatus(accessibilityResult.issues.length, accessibilityErrors > 3),
                    score: accessibilityScore,
                    issues: accessibilityResult.issues,
                    ariaLandmarks: accessibilityResult.ariaLandmarks,
                    hasSkipLink: accessibilityResult.hasSkipLink,
                    formInputsWithoutLabels: accessibilityResult.formInputsWithoutLabels,
                    linksWithGenericText: accessibilityResult.linksWithGenericText
                }
            }
        };
    }
}

export const pageScanner = new PageScanner();
