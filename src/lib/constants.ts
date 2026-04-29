// Database constants
export const COLLECTIONS = {
  PROJECTS: 'projects',
  PROJECT_CHECKLISTS: 'project_checklists',
  PROJECT_TIMELINES: 'project_timelines',
  TIMELINE_TEMPLATES: 'timeline_templates',
  SOP_TEMPLATES: 'sop_templates',
  SCAN_JOBS: 'scan_jobs',
  SITE_ALERTS: 'site_alerts',
  HEALTH_REPORTS: 'health_reports',
  SCAN_NOTIFICATIONS: 'scan_notifications',
  // Server-only: stores third-party API tokens (e.g. Webflow). NEVER readable
  // from the client — access must go through firebase-admin and an authenticated
  // server route that verifies project ownership.
  PROJECT_SECRETS: 'project_secrets',
  // Server-only: app-level (not per-project) third-party credentials. Single
  // doc per integration, e.g. `app_secrets/refrens`. Same access rules as
  // PROJECT_SECRETS — admin-only via firebase-admin.
  APP_SECRETS: 'app_secrets',
  // Per-project mirror of Refrens invoices. Admin-only at the API layer.
  PROJECT_INVOICES: 'project_invoices',
  // Discrete trackable work items, one row per actionable task.
  TASKS: 'tasks',
  // Raw incoming request blobs (Slack/email/paste) that get parsed into tasks.
  REQUESTS: 'requests',
} as const;

// UI constants
export const BREAKPOINTS = {
  MOBILE: 768,
  TABLET: 1024,
  DESKTOP: 1280,
} as const;

// Animation constants
export const ANIMATION_DURATION = {
  FAST: 150,
  NORMAL: 300,
  SLOW: 500,
} as const;

// Form validation constants
export const VALIDATION = {
  MIN_PROJECT_NAME_LENGTH: 1,
  MAX_PROJECT_NAME_LENGTH: 100,
  MIN_LINK_TITLE_LENGTH: 1,
  MAX_LINK_TITLE_LENGTH: 200,
  URL_PATTERN: /^https?:\/\/.+/,
} as const;

// Default values
export const DEFAULTS = {
  DEBOUNCE_DELAY: 300,
  ERROR_DISPLAY_DURATION: 5000,
  LOADING_SPINNER_DELAY: 200,
} as const;

// Error messages
export const ERROR_MESSAGES = {
  GENERIC: 'An unexpected error occurred',
  NETWORK: 'Network error. Please check your connection.',
  PROJECT_NOT_FOUND: 'Project not found',
  INVALID_PROJECT_NAME: 'Project name is required',
  INVALID_LINK_TITLE: 'Link title is required',
  INVALID_URL: 'Please enter a valid URL starting with http:// or https://',
  UNAUTHORIZED: 'You are not authorized to perform this action',
} as const;

