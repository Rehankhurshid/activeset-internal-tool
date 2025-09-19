import { VALIDATION, ERROR_MESSAGES } from './constants';

export function validateProjectName(name: string): { isValid: boolean; error?: string } {
  const trimmedName = name.trim();

  if (!trimmedName) {
    return { isValid: false, error: ERROR_MESSAGES.INVALID_PROJECT_NAME };
  }

  if (trimmedName.length < VALIDATION.MIN_PROJECT_NAME_LENGTH) {
    return { isValid: false, error: ERROR_MESSAGES.INVALID_PROJECT_NAME };
  }

  if (trimmedName.length > VALIDATION.MAX_PROJECT_NAME_LENGTH) {
    return { isValid: false, error: `Project name must be less than ${VALIDATION.MAX_PROJECT_NAME_LENGTH} characters` };
  }

  return { isValid: true };
}

export function validateLinkTitle(title: string): { isValid: boolean; error?: string } {
  const trimmedTitle = title.trim();

  if (!trimmedTitle) {
    return { isValid: false, error: ERROR_MESSAGES.INVALID_LINK_TITLE };
  }

  if (trimmedTitle.length < VALIDATION.MIN_LINK_TITLE_LENGTH) {
    return { isValid: false, error: ERROR_MESSAGES.INVALID_LINK_TITLE };
  }

  if (trimmedTitle.length > VALIDATION.MAX_LINK_TITLE_LENGTH) {
    return { isValid: false, error: `Link title must be less than ${VALIDATION.MAX_LINK_TITLE_LENGTH} characters` };
  }

  return { isValid: true };
}

export function validateUrl(url: string): { isValid: boolean; error?: string } {
  const trimmedUrl = url.trim();

  if (!trimmedUrl) {
    return { isValid: false, error: 'URL is required' };
  }

  if (!VALIDATION.URL_PATTERN.test(trimmedUrl)) {
    return { isValid: false, error: ERROR_MESSAGES.INVALID_URL };
  }

  try {
    new URL(trimmedUrl);
    return { isValid: true };
  } catch {
    return { isValid: false, error: ERROR_MESSAGES.INVALID_URL };
  }
}

export function validateLinkData(title: string, url: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  const titleValidation = validateLinkTitle(title);
  if (!titleValidation.isValid && titleValidation.error) {
    errors.push(titleValidation.error);
  }

  const urlValidation = validateUrl(url);
  if (!urlValidation.isValid && urlValidation.error) {
    errors.push(urlValidation.error);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}