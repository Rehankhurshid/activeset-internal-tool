export interface ProjectHealthSummary {
  projectId: string;
  projectName: string;
  totalPages: number;
  avgScore: number;
  issues: {
    missingAltText: number;
    missingMetaDescription: number;
    missingTitle: number;
    missingH1: number;
    brokenLinks: number;
    spellingErrors: number;
    missingOpenGraph: number;
    missingSchema: number;
    accessibilityErrors: number;
    lowScorePages: number; // pages scoring below 60
  };
  topIssuePages: { url: string; title: string; score: number; issues: string[] }[];
}

export interface DailyHealthReport {
  id: string;
  date: string; // ISO date (YYYY-MM-DD)
  createdAt: string; // ISO timestamp
  projectCount: number;
  totalPages: number;
  avgScore: number;
  totalIssues: number;
  issueBreakdown: {
    missingAltText: number;
    missingMetaDescription: number;
    missingTitle: number;
    missingH1: number;
    brokenLinks: number;
    spellingErrors: number;
    missingOpenGraph: number;
    missingSchema: number;
    accessibilityErrors: number;
    lowScorePages: number;
  };
  projects: ProjectHealthSummary[];
}

export type CreateDailyHealthReportInput = Omit<DailyHealthReport, 'id'>;
