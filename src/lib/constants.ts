// Database constants
export const COLLECTIONS = {
  PROJECTS: 'projects',
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

// Success messages
export const SUCCESS_MESSAGES = {
  PROJECT_CREATED: 'Project created successfully',
  PROJECT_UPDATED: 'Project updated successfully',
  PROJECT_DELETED: 'Project deleted successfully',
  LINK_ADDED: 'Link added successfully',
  LINK_UPDATED: 'Link updated successfully',
  LINK_DELETED: 'Link deleted successfully',
} as const;