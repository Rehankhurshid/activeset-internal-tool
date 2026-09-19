'use client';

import { useEffect, useState } from 'react';
import {
  altSuggestionsRepository,
  type AltSuggestionDoc,
} from '../../infrastructure/alt-suggestions.repository';

/**
 * Suggestions written by `npm run alt project <id>`, keyed by image
 * fingerprint so they line up with the findings on the Alt text tab.
 */
export function useAltSuggestions(projectId: string, enabled = true) {
  const [suggestions, setSuggestions] = useState<Map<string, AltSuggestionDoc>>(new Map());

  useEffect(() => {
    if (!enabled || !projectId) return;
    return altSuggestionsRepository.subscribe(projectId, setSuggestions);
  }, [projectId, enabled]);

  return suggestions;
}
