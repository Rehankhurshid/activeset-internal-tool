import type NSpell from 'nspell';
import type { Dictionary } from 'dictionary-en';

/**
 * Hybrid Spell Checker Utility
 * - Primary: LanguageTool API (best accuracy)
 * - Fallback: nspell (offline support, no rate limits)
 */

class HybridSpellChecker {
  private nspellChecker: NSpell | null = null;
  private dictionary: Dictionary | null = null;
  private isNspellReady = false;
  private customJargon: Set<string>;
  private dictionaryCache: Map<string, boolean> = new Map();

  constructor() {
    // Custom technical/business jargon not in standard dictionary
    this.customJargon = new Set([
      'webflow','vercel','nextjs','react','typescript','javascript','css','html','seo','ux','ui',
      'saas','api','sdk','json','ajax','backend','frontend','fullstack','devops','agile','scrum',
      'kanban','roadmap','milestone','deliverable','kpi','roi','b2b','b2c','cta','cms','crm',
      'faq','gdpr','ccpa','sso','mfa','jwt','oauth','dns','ssl','tls','https','http','ssh','ftp',
      'widget','audit','optimization','scalability','reliability','usability','accessibility',
      'maintainability','interoperability','functionality','configurable','customizable',
      'integration','implementation','deployment','provisioning','orchestration','virtualization',
      'containerization','microservices','serverless','latency','throughput','bandwidth',
      'authentication','authorization','encryption','decryption','hashing','salting',
      'tokenization','serialization','deserialization','compilation','transpilation',
      'minification','obfuscation','refactoring','debugging','profiling','logging','monitoring',
      'alerting','tracing','telemetry','analytics','metrics','dashboard','reporting','visualization',
      'copyright','rights','reserved','terms','privacy','policy','contact','email','phone',
      'onboarding','credentials','seamless','mesoneer','mesoneers','workflow','workflows',
      'signeer','fiduciary','leanrun','digitizes','paperless','deliver','delivers','delivered','delivery'
    ]);
  }

  /**
   * Initialize nspell dictionary (lazy loading)
   */
  async initializeNspell(): Promise<void> {
    if (this.isNspellReady) return;

    try {
      // Dynamically import nspell and dictionary-en
      const nspellModule = await import('nspell');
      const nspellConstructor = nspellModule.default;
      const dictionaryModule = await import('dictionary-en');

      // Get the dictionary data directly
      const dict = dictionaryModule.default;

      this.dictionary = dict;
      // Use type assertion due to type incompatibility between packages
      this.nspellChecker = nspellConstructor(dict as any);
      this.isNspellReady = true;
      console.log('✅ nspell dictionary loaded successfully');
    } catch (error) {
      console.warn('Failed to initialize nspell:', error);
      throw error;
    }
  }

  /**
   * Check if a word is spelled correctly using nspell
   */
  private checkWordWithNspell(word: string): boolean {
    if (!this.isNspellReady || !this.nspellChecker) return true;

    const lower = word.toLowerCase();

    // Check cache first
    if (this.dictionaryCache.has(lower)) {
      return this.dictionaryCache.get(lower)!;
    }

    // Check custom jargon
    if (this.customJargon.has(lower)) {
      this.dictionaryCache.set(lower, true);
      return true;
    }

    // Check with nspell
    const isCorrect = this.nspellChecker.correct(word);
    this.dictionaryCache.set(lower, isCorrect);

    return isCorrect;
  }

  /**
   * Check spelling using nspell (fallback method)
   */
  async checkWithNspell(text: string): Promise<string[]> {
    if (!this.isNspellReady) {
      try {
        await this.initializeNspell();
      } catch (error) {
        console.warn('nspell initialization failed, returning empty result');
        return [];
      }
    }

    const typos: string[] = [];
    const seen = new Set<string>();

    // Extract words (simple tokenization)
    const words = text.match(/\b[a-zA-Z]+\b/g) || [];

    for (const word of words) {
      const lower = word.toLowerCase();

      // Skip if already checked
      if (seen.has(lower)) continue;
      seen.add(lower);

      // Skip short words (1-2 chars)
      if (word.length <= 2) continue;

      // Check spelling
      if (!this.checkWordWithNspell(word)) {
        typos.push(word);
      }
    }

    return typos.slice(0, 10); // Limit to 10 typos
  }

  /**
   * Check spelling using LanguageTool API (primary method)
   */
  async checkWithLanguageTool(text: string, apiUrl: string): Promise<string[]> {
    try {
      const textPayload = text.substring(0, 15000);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textPayload })
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();
      const typos: string[] = [];
      const seen = new Set<string>();

      if (data.matches) {
        data.matches.forEach((match: any) => {
          const word = textPayload.substring(match.offset, match.offset + match.length);
          const lower = word.toLowerCase();

          // Skip custom jargon
          if (this.customJargon.has(lower)) return;

          // Only include misspellings
          if (match.rule.issueType === 'misspelling' && !seen.has(lower)) {
            typos.push(word);
            seen.add(lower);
          }
        });
      }

      return typos.slice(0, 10);
    } catch (error) {
      console.warn('LanguageTool API failed:', error);
      throw error;
    }
  }

  /**
   * Hybrid spell check: Try API first, fallback to nspell
   */
  async check(text: string, options: { apiBaseUrl?: string; forceOffline?: boolean } = {}): Promise<{
    typos: string[];
    method: 'languagetool' | 'nspell' | 'unavailable';
  }> {
    const { apiBaseUrl, forceOffline = false } = options;

    // Try LanguageTool API first (unless forced offline)
    if (!forceOffline && apiBaseUrl) {
      try {
        const apiUrl = `${apiBaseUrl}/api/check-text`;
        const typos = await this.checkWithLanguageTool(text, apiUrl);
        return { typos, method: 'languagetool' };
      } catch (error) {
        console.warn('LanguageTool API failed, falling back to nspell');
      }
    }

    // Fallback to nspell
    try {
      const typos = await this.checkWithNspell(text);
      return { typos, method: 'nspell' };
    } catch (error) {
      console.warn('nspell check failed');
      return { typos: [], method: 'unavailable' };
    }
  }

  /**
   * Add custom words to the jargon list
   */
  addCustomWords(words: string[]): void {
    words.forEach(word => {
      const lower = word.toLowerCase();
      this.customJargon.add(lower);
      this.dictionaryCache.set(lower, true);
    });
  }

  /**
   * Clear the dictionary cache
   */
  clearCache(): void {
    this.dictionaryCache.clear();
  }
}

// Export singleton instance
export const hybridSpellChecker = new HybridSpellChecker();
export default hybridSpellChecker;
