import { Project, ProjectLink } from '@/types';
import { ProjectHealthSummary, CreateDailyHealthReportInput } from '@/types/health-report';

function normalizeImageSrc(src: string, pageUrl: string): string {
  const value = (src || '').trim();
  if (!value) return '';

  try {
    const parsed = new URL(value, pageUrl);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return value;
  }
}

/**
 * Analyze a single project's auto links and produce a health summary.
 */
function analyzeProject(project: Project): ProjectHealthSummary | null {
  const autoLinks = project.links?.filter(l => l.source === 'auto' && l.auditResult) || [];
  if (autoLinks.length === 0) return null;

  const issues = {
    missingAltText: 0,
    missingMetaDescription: 0,
    missingTitle: 0,
    missingH1: 0,
    brokenLinks: 0,
    spellingErrors: 0,
    missingOpenGraph: 0,
    missingSchema: 0,
    accessibilityErrors: 0,
    lowScorePages: 0,
  };

  let totalScore = 0;
  const topIssuePages: ProjectHealthSummary['topIssuePages'] = [];
  const uniqueMissingAltImages = new Set<string>();

  for (const link of autoLinks) {
    const audit = link.auditResult!;
    const cat = audit.categories;
    const pageIssues: string[] = [];

    totalScore += audit.score;

    if (audit.score < 60) {
      issues.lowScorePages++;
    }

    // ALT text
    const altMissing = cat.seo?.imagesWithoutAlt || 0;
    if (altMissing > 0) {
      pageIssues.push(`${altMissing} images missing ALT`);
    }

    const pageImages = (audit.contentSnapshot as { images?: { src: string; alt?: string }[] } | undefined)?.images || [];
    for (const image of pageImages) {
      const src = image?.src || '';
      const hasAlt = !!image?.alt?.trim();
      if (!src || hasAlt) continue;

      const normalized = normalizeImageSrc(src, link.url);
      if (normalized) {
        uniqueMissingAltImages.add(normalized);
      }
    }

    // Accessibility reporting is intentionally hidden for now.

    // Meta description
    if (!audit.contentSnapshot?.metaDescription && cat.seo?.status !== 'passed') {
      issues.missingMetaDescription++;
      pageIssues.push('Missing meta description');
    }

    // Title
    if (!audit.contentSnapshot?.title) {
      issues.missingTitle++;
      pageIssues.push('Missing title');
    }

    // H1
    if (!audit.contentSnapshot?.h1) {
      issues.missingH1++;
      pageIssues.push('Missing H1');
    }

    // Broken links
    const broken = cat.links?.brokenLinks?.length || 0;
    if (broken > 0) {
      issues.brokenLinks += broken;
      pageIssues.push(`${broken} broken links`);
    }

    // Spelling
    const spelling = cat.spelling?.issues?.length || 0;
    if (spelling > 0) {
      issues.spellingErrors += spelling;
      pageIssues.push(`${spelling} spelling errors`);
    }

    // Open Graph
    if (cat.openGraph && !cat.openGraph.hasOpenGraph) {
      issues.missingOpenGraph++;
      pageIssues.push('Missing Open Graph');
    }

    // Schema
    if (cat.schema && !cat.schema.hasSchema) {
      issues.missingSchema++;
      pageIssues.push('Missing structured data');
    }

    if (pageIssues.length > 0) {
      topIssuePages.push({
        url: link.url,
        title: link.title,
        score: audit.score,
        issues: pageIssues,
      });
    }
  }

  // Sort top issue pages by score ascending (worst first), take top 5
  topIssuePages.sort((a, b) => a.score - b.score);

  // ALT reporting is image-based (unique assets), not repeated occurrences across pages.
  issues.missingAltText = uniqueMissingAltImages.size;

  return {
    projectId: project.id,
    projectName: project.name,
    totalPages: autoLinks.length,
    avgScore: Math.round(totalScore / autoLinks.length),
    issues,
    topIssuePages: topIssuePages.slice(0, 5),
  };
}

/**
 * Generate a daily health report from all current projects.
 */
export function generateHealthReport(projects: Project[]): CreateDailyHealthReportInput {
  const projectSummaries: ProjectHealthSummary[] = [];

  for (const project of projects) {
    const summary = analyzeProject(project);
    if (summary) {
      projectSummaries.push(summary);
    }
  }

  // Aggregate across all projects
  const issueBreakdown = {
    missingAltText: 0,
    missingMetaDescription: 0,
    missingTitle: 0,
    missingH1: 0,
    brokenLinks: 0,
    spellingErrors: 0,
    missingOpenGraph: 0,
    missingSchema: 0,
    accessibilityErrors: 0,
    lowScorePages: 0,
  };

  let totalPages = 0;
  let totalScore = 0;

  for (const p of projectSummaries) {
    totalPages += p.totalPages;
    totalScore += p.avgScore * p.totalPages;
    for (const key of Object.keys(issueBreakdown) as (keyof typeof issueBreakdown)[]) {
      issueBreakdown[key] += p.issues[key];
    }
  }

  const totalIssues = Object.values(issueBreakdown).reduce((a, b) => a + b, 0);
  const today = new Date().toISOString().split('T')[0];

  return {
    date: today,
    createdAt: new Date().toISOString(),
    projectCount: projectSummaries.length,
    totalPages,
    avgScore: totalPages > 0 ? Math.round(totalScore / totalPages) : 0,
    totalIssues,
    issueBreakdown,
    projects: projectSummaries,
  };
}
