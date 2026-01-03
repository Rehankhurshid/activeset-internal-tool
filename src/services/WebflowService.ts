import {
  WebflowPage,
  WebflowPageWithQC,
  SEOIssue,
  SEOHealthScore,
  WebflowSiteHealth,
} from '@/types/webflow';

// SEO field length recommendations
const SEO_LIMITS = {
  title: { min: 30, max: 60 },
  description: { min: 120, max: 160 },
};

// Point deductions for SEO issues
const DEDUCTIONS = {
  seoTitle: { missing: 25, tooShort: 10, tooLong: 5 },
  seoDescription: { missing: 25, tooShort: 10, tooLong: 5 },
  ogTitle: { missing: 15 },
  ogDescription: { missing: 15 },
  slug: { missing: 10 },
};

/**
 * Analyze SEO health for a single page
 */
function analyzeSEOHealth(page: WebflowPage): {
  score: SEOHealthScore;
  issues: SEOIssue[];
} {
  const issues: SEOIssue[] = [];
  let deductions = 0;

  // Check SEO Title
  if (!page.seo?.title) {
    issues.push({
      field: 'seo.title',
      type: 'missing',
      message: 'SEO title is missing',
      severity: 'error',
    });
    deductions += DEDUCTIONS.seoTitle.missing;
  } else if (!page.seo.title.includes('{{') && page.seo.title.length < SEO_LIMITS.title.min) {
    issues.push({
      field: 'seo.title',
      type: 'too_short',
      message: `SEO title is too short (${page.seo.title.length} chars). Recommended: ${SEO_LIMITS.title.min}-${SEO_LIMITS.title.max} characters`,
      severity: 'warning',
    });
    deductions += DEDUCTIONS.seoTitle.tooShort;
  } else if (!page.seo.title.includes('{{') && page.seo.title.length > SEO_LIMITS.title.max) {
    issues.push({
      field: 'seo.title',
      type: 'too_long',
      message: `SEO title is too long (${page.seo.title.length} chars). Recommended: ${SEO_LIMITS.title.min}-${SEO_LIMITS.title.max} characters`,
      severity: 'warning',
    });
    deductions += DEDUCTIONS.seoTitle.tooLong;
  }

  // Check Meta Description
  if (!page.seo?.description) {
    issues.push({
      field: 'seo.description',
      type: 'missing',
      message: 'Meta description is missing',
      severity: 'error',
    });
    deductions += DEDUCTIONS.seoDescription.missing;
  } else if (!page.seo.description.includes('{{') && page.seo.description.length < SEO_LIMITS.description.min) {
    issues.push({
      field: 'seo.description',
      type: 'too_short',
      message: `Meta description is too short (${page.seo.description.length} chars). Recommended: ${SEO_LIMITS.description.min}-${SEO_LIMITS.description.max} characters`,
      severity: 'warning',
    });
    deductions += DEDUCTIONS.seoDescription.tooShort;
  } else if (!page.seo.description.includes('{{') && page.seo.description.length > SEO_LIMITS.description.max) {
    issues.push({
      field: 'seo.description',
      type: 'too_long',
      message: `Meta description is too long (${page.seo.description.length} chars). Recommended: ${SEO_LIMITS.description.min}-${SEO_LIMITS.description.max} characters`,
      severity: 'info',
    });
    deductions += DEDUCTIONS.seoDescription.tooLong;
  }

  // Check Open Graph Title (if not copied from SEO)
  if (!page.openGraph?.title && !page.openGraph?.titleCopied) {
    issues.push({
      field: 'openGraph.title',
      type: 'missing',
      message: 'Open Graph title is missing',
      severity: 'warning',
    });
    deductions += DEDUCTIONS.ogTitle.missing;
  }

  // Check Open Graph Description (if not copied from SEO)
  if (!page.openGraph?.description && !page.openGraph?.descriptionCopied) {
    issues.push({
      field: 'openGraph.description',
      type: 'missing',
      message: 'Open Graph description is missing',
      severity: 'warning',
    });
    deductions += DEDUCTIONS.ogDescription.missing;
  }

  // Check slug
  if (!page.slug) {
    issues.push({
      field: 'slug',
      type: 'missing',
      message: 'Page slug is empty',
      severity: 'error',
    });
    deductions += DEDUCTIONS.slug.missing;
  }

  const score = Math.max(0, 100 - deductions);
  const status: SEOHealthScore['status'] =
    score >= 80 ? 'good' : score >= 50 ? 'warning' : 'critical';

  return {
    score: { score, status },
    issues,
  };
}

export const webflowService = {
  /**
   * Process pages and add QC data
   */
  processPagesWithQC(pages: WebflowPage[]): WebflowPageWithQC[] {
    return pages.map((page) => {
      const { score, issues } = analyzeSEOHealth(page);
      return {
        ...page,
        seoHealth: score,
        issues,
      };
    });
  },

  /**
   * Calculate overall site SEO health metrics
   */
  calculateSiteHealth(pages: WebflowPageWithQC[]): WebflowSiteHealth {
    const staticPages = pages.filter((p) => !p.collectionId);
    const cmsPages = pages.filter((p) => p.collectionId);

    if (staticPages.length === 0) {
      return {
        averageScore: 0,
        pagesWithIssues: 0,
        criticalPages: 0,
        totalIssues: 0,
        totalPages: 0,
        staticPages: 0,
        cmsPages: 0,
        issuesCount: {
          critical: 0,
          warning: 0,
          info: 0,
        },
        distribution: {
          good: 0,
          warning: 0,
          critical: 0,
        },
      };
    }

    const totalScore = staticPages.reduce((sum, p) => sum + (p.seoHealth?.score || 0), 0);
    const pagesWithIssues = staticPages.filter((p) => p.issues.length > 0).length;
    const criticalPages = staticPages.filter(
      (p) => p.seoHealth?.status === 'critical'
    ).length;
    const totalIssues = staticPages.reduce((sum, p) => sum + p.issues.length, 0);

    const warningPages = staticPages.filter(
      (p) => p.seoHealth?.status === 'warning'
    ).length;
    const goodPages = staticPages.filter(
      (p) => p.seoHealth?.status === 'good'
    ).length;

    // Calculate issues count by severity
    const criticalIssues = staticPages.reduce((sum, p) => sum + p.issues.filter(i => i.severity === 'error').length, 0);
    const warningIssues = staticPages.reduce((sum, p) => sum + p.issues.filter(i => i.severity === 'warning').length, 0);
    const infoIssues = staticPages.reduce((sum, p) => sum + p.issues.filter(i => i.severity === 'info').length, 0);

    return {
      averageScore: staticPages.length ? Math.round(totalScore / staticPages.length) : 0,
      pagesWithIssues,
      criticalPages,
      totalIssues,
      totalPages: pages.length,
      staticPages: staticPages.length,
      cmsPages: cmsPages.length,
      issuesCount: {
        critical: criticalIssues,
        warning: warningIssues,
        info: infoIssues,
      },
      distribution: {
        good: goodPages,
        warning: warningPages,
        critical: criticalPages,
      },
    };
  },

  /**
   * Filter for static pages only (excludes CMS page templates)
   */
  filterStaticPages(pages: WebflowPage[]): WebflowPage[] {
    return pages.filter((page) => !page.collectionId);
  },

  /**
   * Filter for CMS pages only
   */
  filterCMSPages(pages: WebflowPage[]): WebflowPage[] {
    return pages.filter((page) => page.collectionId);
  },

  /**
   * Get pages sorted by SEO health (worst first)
   */
  sortByHealth(
    pages: WebflowPageWithQC[],
    ascending: boolean = true
  ): WebflowPageWithQC[] {
    return [...pages].sort((a, b) =>
      ascending
        ? (a.seoHealth?.score || 0) - (b.seoHealth?.score || 0)
        : (b.seoHealth?.score || 0) - (a.seoHealth?.score || 0)
    );
  },

  /**
   * Get pages that need attention (have issues)
   */
  getPagesNeedingAttention(pages: WebflowPageWithQC[]): WebflowPageWithQC[] {
    return pages.filter((p) => p.issues.length > 0);
  },

  /**
   * Get critical pages only
   */
  getCriticalPages(pages: WebflowPageWithQC[]): WebflowPageWithQC[] {
    return pages.filter((p) => p.seoHealth?.status === 'critical');
  },

  /**
   * Search pages by title, slug, or published path
   */
  searchPages(pages: WebflowPageWithQC[], query: string): WebflowPageWithQC[] {
    const lowerQuery = query.toLowerCase();
    return pages.filter(
      (p) =>
        (p.title && p.title.toLowerCase().includes(lowerQuery)) ||
        (p.slug && p.slug.toLowerCase().includes(lowerQuery)) ||
        (p.publishedPath && p.publishedPath.toLowerCase().includes(lowerQuery))
    );
  },

  /**
   * Extract plain text from Webflow DOM nodes
   */
  extractTextFromDOM(nodes: any[]): string {
    if (!nodes || !Array.isArray(nodes)) return '';

    return nodes
      .map((node) => {
        if (node.text?.text) return node.text.text;
        if (node.text?.html) return node.text.html.replace(/<[^>]*>/g, ''); // Simple strip tags
        if (node.type === 'text' && node.text) return node.text; // Some nodes might be simple text
        return '';
      })
      .filter((text) => text && text.trim().length > 0)
      .join('\n');
  },
};
