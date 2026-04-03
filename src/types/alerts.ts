export type AlertSeverity = 'critical' | 'warning' | 'info';

export type AlertType =
  | 'gibberish_content'
  | 'content_degradation'
  | 'mass_changes'
  | 'scan_failed'
  | 'seo_regression'
  | 'word_count_drop';

export interface AffectedPage {
  url: string;
  title: string;
  detail?: string;
}

export interface SiteAlert {
  id: string;
  projectId: string;
  projectName: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  affectedPages: AffectedPage[];
  read: boolean;
  dismissed: boolean;
  createdAt: string; // ISO timestamp
  scanId?: string;
}

export type CreateSiteAlertInput = Omit<SiteAlert, 'id'>;

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  gibberish_content: 'Gibberish Content',
  content_degradation: 'Content Degradation',
  mass_changes: 'Mass Changes',
  scan_failed: 'Scan Failed',
  seo_regression: 'SEO Regression',
  word_count_drop: 'Word Count Drop',
};

export const ALERT_SEVERITY_COLORS: Record<AlertSeverity, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  warning: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  info: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
};
