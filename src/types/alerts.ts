export type AlertSeverity = 'critical' | 'warning' | 'info';

export type AlertType =
  | 'gibberish_content'
  | 'content_degradation'
  | 'mass_changes'
  | 'scan_failed'
  | 'seo_regression'
  | 'word_count_drop'
  | 'collection_meta_conflict';

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
  collection_meta_conflict: 'Collection Metadata Conflict',
};
