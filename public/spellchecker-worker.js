/**
 * Web Worker for Hybrid Spell Checker
 * This worker handles spell checking to avoid blocking the main thread
 */

// Import nspell and dictionary dynamically
let nspellChecker = null;
let isReady = false;

const CUSTOM_JARGON = new Set([
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
  'signeer','fiduciary','leanrun','digitizes','paperless','deliver','delivers','delivered','delivery',
  'usecase','lifecycle','onboarding','roadmap','workflow','workflows','journey','touchpoint',
  'checklist','timeline','build','learn','optimization','li',
  'uppal','iza','día'
]);

// Initialize nspell when worker starts
async function initialize() {
  if (isReady) return;

  try {
    // For now, we'll use a simpler approach in the worker
    // The full nspell implementation will be in the API route
    isReady = true;
    self.postMessage({ type: 'ready' });
  } catch (error) {
    self.postMessage({ type: 'error', error: error.message });
  }
}

// Check spelling using LanguageTool API
async function checkWithLanguageTool(text, apiUrl) {
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
    const typos = [];
    const seen = new Set();

    if (data.matches) {
      data.matches.forEach(match => {
        const word = textPayload.substring(match.offset, match.offset + match.length);
        const lower = word.toLowerCase();

        if (CUSTOM_JARGON.has(lower)) return;
        
        // Ignore "li" (list item marker)
        if (lower === 'li') return;
        
        // Ignore 2-3 letter uppercase words (likely acronyms e.g. IZA)
        if (word.length >= 2 && word.length <= 3 && word === word.toUpperCase()) return;

        if (match.rule.issueType === 'misspelling' && !seen.has(lower)) {
          typos.push(word);
          seen.add(lower);
        }
      });
    }

    return { typos: typos.slice(0, 10), method: 'languagetool' };
  } catch (error) {
    throw error;
  }
}

// Simple fallback spell check (basic implementation)
function checkWithFallback(text) {
  // This is a placeholder - in production, you'd use nspell here
  // For now, just return empty to indicate fallback was used
  return { typos: [], method: 'fallback' };
}

// Message handler
self.addEventListener('message', async (event) => {
  const { type, text, apiUrl, forceOffline } = event.data;

  if (type === 'init') {
    await initialize();
    return;
  }

  if (type === 'check') {
    try {
      let result;

      // Try API first
      if (!forceOffline && apiUrl) {
        try {
          result = await checkWithLanguageTool(text, apiUrl);
        } catch (error) {
          console.warn('API failed, using fallback');
          result = checkWithFallback(text);
        }
      } else {
        result = checkWithFallback(text);
      }

      self.postMessage({ type: 'result', ...result });
    } catch (error) {
      self.postMessage({
        type: 'result',
        typos: [],
        method: 'error',
        error: error.message
      });
    }
  }
});

// Initialize on load
initialize();
