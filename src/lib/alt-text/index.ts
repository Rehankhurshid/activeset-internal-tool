export { CACHE_DIR, clearCache } from './cache';
export { extractImageContexts, fetchPage, type ExtractedImage, type ExtractOptions } from './context';
export {
  generateAltText,
  generateAltTextBatch,
  type BatchProgress,
  type GenerateOptions,
} from './generate';
export {
  DEFAULT_HOST,
  DEFAULT_MODEL,
  OllamaError,
  checkOllama,
  resolveOllama,
  type OllamaHealth,
  type OllamaOptions,
} from './ollama';
export { DEFAULT_MAX_DIM, ImageFetchError, precheck, prepareImage } from './prepare';
export {
  KIND_RULES,
  MAX_ALT_CHARS,
  PROMPT_VERSION,
  fileNameOf,
  systemPrompt,
  userPrompt,
} from './taxonomy';
export { echoesFileName, stripRedundantOpener, truncateAlt, validateJudgment } from './validate';
export {
  ALT_KINDS,
  type AltKind,
  type AltSuggestion,
  type Certainty,
  type ImageContext,
  type ImageFacts,
  type RawJudgment,
} from './types';
