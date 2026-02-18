(function () {
  "use strict";

  // Determine base URL from the script source if possible, otherwise fallback to production
  let scriptBaseUrl = "https://app.activeset.co";
  
  try {
    const currentScript = document.currentScript || (function() {
      const scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();
    
    if (currentScript && currentScript.src) {
      const url = new URL(currentScript.src);
      scriptBaseUrl = url.origin;
    }
  } catch (e) {
    console.warn("Could not determine script origin, using default.");
  }

  // Default configuration
  const defaultConfig = {
    theme: "dark",
    allowReordering: true,
    showModal: true,
    baseUrl: scriptBaseUrl,
    style: "dropdown", // Enforced
    position: "bottom-right", // Enforced
    showOnDomains: [], 
  };

  // Font Loader
  function loadFonts() {
    if (document.getElementById('plw-fonts')) return;
    const link = document.createElement('link');
    link.id = 'plw-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Funnel+Display:wght@400;500;600&family=Funnel+Sans:wght@300;400;500&display=swap';
    document.head.appendChild(link);
  }

  // ========================================
  // Content Quality Auditor (5-Category System)
  // ========================================
  class ContentQualityAuditor {
    
    static dictionarySet = null;
    
    // Custom technical/business jargon not in standard dictionary
    static CUSTOM_JARGON = new Set([
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
    
    static dictionarySet = null; // Deprecated but kept for compatibility logic removal if needed

    static PLACEHOLDER_PATTERNS = [
      { regex: /lorem\s+ipsum/gi, name: 'Lorem Ipsum' },
      { regex: /\[your\s*name\]/gi, name: '[Your Name]' },
      { regex: /\[company\s*name\]/gi, name: '[Company Name]' },
      { regex: /\[client\s*name\]/gi, name: '[Client Name]' },
      { regex: /\[insert\s+.+?\s+here\]/gi, name: '[Insert X Here]' },
      { regex: /\bTBD\b/g, name: 'TBD' },
      { regex: /\bTODO\b/g, name: 'TODO' },
      { regex: /\bFIXME\b/g, name: 'FIXME' },
      { regex: /coming\s+soon/gi, name: 'Coming Soon' },
      { regex: /placeholder\s*text/gi, name: 'Placeholder Text' },
      { regex: /sample\s+text/gi, name: 'Sample Text' }
    ];

    /**
     * Recursive text extraction that ensures spaces around block/interactive elements.
     * Prevents "CI-readyExecution" type fusion.
     */
    static getTextContentWithSpaces(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.nodeValue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }
      
      const tagName = node.tagName.toLowerCase();
      // Skip unwanted tags
      if (['nav', 'footer', 'script', 'style', 'noscript', 'iframe', 'object', 'embed', 'svg', 'path', 'defs'].includes(tagName)) {
        return '';
      }
      
      // Check if element is visually hidden (basic check)
      if (node.style && (node.style.display === 'none' || node.style.visibility === 'hidden' || node.style.opacity === '0')) {
        return '';
      }
      
      let text = '';
      
      // Block-level or distinct inline elements that imply separation
      const isBlock = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'article', 'section', 'header', 'footer', 'aside', 'br', 'hr', 'tr', 'td', 'th', 'blockquote', 'pre', 'code'].includes(tagName);
      const isInteractive = ['a', 'button', 'label', 'option', 'select', 'textarea', 'input'].includes(tagName);
      
      if (isBlock || isInteractive || tagName === 'br') text += ' ';

      for (let child of node.childNodes) {
        text += this.getTextContentWithSpaces(child);
      }

      if (isBlock || isInteractive) text += ' ';
      
      return text;
    }

    /**
     * Extract all images from main content (excluding nav/footer)
     * Returns array of {src, alt, inMainContent}
     */
    static extractImages() {
      const images = [];
      const mainEl = document.querySelector('main, article, [role="main"]') || document.body;

      const allImages = mainEl.querySelectorAll('img');
      allImages.forEach(img => {
        // Skip nav/footer images
        if (img.closest('nav') || img.closest('footer')) return;

        const alt = img.alt || '';
        const missingAlt = !alt || alt.trim() === '';

        // Skip tiny images only when ALT is present.
        // If ALT is missing, keep it so we can surface it in compact issue view.
        if (!missingAlt && img.width < 50 && img.height < 50) return;

        // Prefer currentSrc, then src, then lazy-load attrs/srcset fallbacks
        const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
        const firstSrcset = srcset ? srcset.split(',')[0].trim().split(' ')[0] : '';
        const src = img.currentSrc
          || img.src
          || img.getAttribute('data-src')
          || img.getAttribute('data-lazy-src')
          || img.getAttribute('data-original')
          || firstSrcset
          || '';

        if (!src) return;

        images.push({
          src,
          alt,
          inMainContent: true
        });
      });

      return images.slice(0, 120); // Keep compact but enough for no-alt visibility
    }

    /**
     * Extract all links from main content (excluding nav/footer)
     * Returns array of {href, text, isExternal}
     */
    static extractLinks() {
      const links = [];
      const mainEl = document.querySelector('main, article, [role="main"]') || document.body;
      const currentHost = window.location.hostname;

      const allLinks = mainEl.querySelectorAll('a[href]');
      allLinks.forEach(a => {
        // Skip nav/footer links
        if (a.closest('nav') || a.closest('footer')) return;

        const href = a.href || '';
        // Skip empty/anchor-only links
        if (!href || href === '#' || href.startsWith('javascript:')) return;

        let isExternal = false;
        try {
          isExternal = new URL(href).hostname !== currentHost;
        } catch (e) {
          isExternal = false;
        }

        links.push({
          href: href,
          text: (a.textContent || '').trim().substring(0, 100),
          isExternal
        });
      });

      return links.slice(0, 100); // Limit to 100 links
    }

    /**
     * Extract content sections with headings
     */
    static extractSections() {
      const sections = [];
      const mainEl = document.querySelector('main, article, [role="main"]') || document.body;

      // Find all section-like elements
      const sectionElements = mainEl.querySelectorAll('section, article, .section, [data-section]');

      sectionElements.forEach((section, idx) => {
        if (section.closest('nav') || section.closest('footer')) return;

        const heading = section.querySelector('h1, h2, h3');
        const text = this.getTextContentWithSpaces(section);
        const words = text.match(/\b[a-zA-Z]+\b/g) || [];

        sections.push({
          selector: section.tagName.toLowerCase() + (section.id ? `#${section.id}` : `.${idx}`),
          headingText: heading ? (heading.textContent || '').trim() : `Section ${idx + 1}`,
          wordCount: words.length,
          textPreview: text.substring(0, 150).trim()
        });
      });

      return sections.slice(0, 20); // Limit to 20 sections
    }

    /**
     * Extract main content text EXCLUDING nav and footer elements.
     * Selects from: main, article, .hero, [role="main"], h1-h3
     * Normalizes whitespace for consistent hashing.
     */
    static extractMainContent() {
      const doc = document;
      const contentSelectors = [
        'main',
        'article', 
        '.hero',
        '[role="main"]',
        'h1', 'h2', 'h3'
      ];
      
      const textParts = [];
      
      contentSelectors.forEach(selector => {
        const elements = doc.querySelectorAll(selector);
        elements.forEach(el => {
          // Skip if element is inside nav or footer (double check)
          if (el.closest('nav') || el.closest('footer')) return;
          
          // Use robust recursive extraction
          const text = this.getTextContentWithSpaces(el);
          if (text && text.trim()) {
            textParts.push(text.trim());
          }
        });
      });
      
      // Fallback: if no main content found, use body
      if (textParts.length === 0) {
        const bodyClone = doc.body.cloneNode(true); // Scan body but skip nav/footer
        // Pre-remove known junk from top level if possible, but our recursive function handles skipping too.
        // For fallback, we'll just run on body and let the skipper handle it, 
        // but we should pass the body element directly? 
        // doc.body contains scripts etc, our scanner skips them.
        // However, to match previous behavior of avoiding footer entirely even if not in main:
        // Let's filter children of body?
        // Simpler: Just run on doc.body, the recursive function skips nav/footer tags.
        const text = this.getTextContentWithSpaces(doc.body);
        textParts.push(text.trim());
      }
      
      // Normalize whitespace: collapse multiple spaces/newlines to single space
      return textParts.join(' ').replace(/\s+/g, ' ').trim();
    }

    /**
     * Compute SHA-256 hash of given text using Web Crypto API.
     * Returns hex string.
     */
    static async computeHash(text) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) {
        console.warn('Hash computation failed:', e);
        return null;
      }
    }

    /**
     * Compute Flesch Reading Ease score and related metrics.
     * Formula: 206.835 - 1.015*(words/sentences) - 84.6*(syllables/words)
     */
    static computeReadability(text) {
      if (!text || text.length === 0) {
        return { fleschScore: 0, wordCount: 0, sentenceCount: 0, syllableCount: 0, label: 'N/A' };
      }
      
      // Count words
      const words = text.match(/\b[a-zA-Z]+\b/g) || [];
      const wordCount = words.length;
      
      // Count sentences (approximation)
      const sentences = text.match(/[.!?]+/g) || [];
      const sentenceCount = Math.max(1, sentences.length);
      
      // Count syllables (heuristic: count vowel groups)
      let syllableCount = 0;
      words.forEach(word => {
        const vowelGroups = word.toLowerCase().match(/[aeiouy]+/g) || [];
        let count = vowelGroups.length;
        // Adjust for silent e at end
        if (word.toLowerCase().endsWith('e') && count > 1) count--;
        // Minimum 1 syllable per word
        syllableCount += Math.max(1, count);
      });
      
      // Flesch Reading Ease
      const avgWordsPerSentence = wordCount / sentenceCount;
      const avgSyllablesPerWord = syllableCount / Math.max(1, wordCount);
      const fleschScore = Math.round(206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord));
      const clampedScore = Math.max(0, Math.min(100, fleschScore));
      
      // Label based on score
      let label = 'Very Difficult';
      if (clampedScore >= 90) label = 'Very Easy';
      else if (clampedScore >= 80) label = 'Easy';
      else if (clampedScore >= 60) label = 'Standard';
      else if (clampedScore >= 30) label = 'Difficult';
      
      return { fleschScore: clampedScore, wordCount, sentenceCount, syllableCount, label };
    }

    /**
     * Check content completeness thresholds.
     * Returns issues array and score.
     */
    static checkCompleteness(mainContentText, doc) {
      const issues = [];
      let score = 100;
      
      const { wordCount } = this.computeReadability(mainContentText);
      
      // Word count threshold (warn if < 300 words)
      if (wordCount < 300) {
        issues.push({ check: 'Low word count', detail: `${wordCount} words (< 300 threshold)` });
      }
      
      // Heading presence (at least one H1-H3 in main content)
      const mainEl = doc.querySelector('main, article, [role="main"]');
      const headings = mainEl 
        ? mainEl.querySelectorAll('h1, h2, h3')
        : doc.querySelectorAll('h1, h2, h3');
      
      // Filter out headings in nav/footer
      const validHeadings = Array.from(headings).filter(h => !h.closest('nav') && !h.closest('footer'));
      if (validHeadings.length === 0) {
        issues.push({ check: 'Missing headings', detail: 'No H1-H3 found in main content' });
        score -= 15;
      }
      
      // Paragraph presence (at least 2 paragraphs)
      const paragraphs = mainEl
        ? mainEl.querySelectorAll('p')
        : doc.querySelectorAll('p');
      const validParagraphs = Array.from(paragraphs).filter(p => 
        !p.closest('nav') && !p.closest('footer') && p.innerText.trim().length > 20
      );
      if (validParagraphs.length < 2) {
        issues.push({ check: 'Thin content', detail: `Only ${validParagraphs.length} paragraphs (need 2+)` });
        score -= 15;
      }
      
      // Images missing alt in main content
      const images = mainEl
        ? mainEl.querySelectorAll('img')
        : doc.body.querySelectorAll('img');
      const imagesNoAlt = Array.from(images).filter(img => 
        !img.closest('nav') && !img.closest('footer') && (!img.alt || img.alt.trim() === '')
      );
      if (imagesNoAlt.length > 0) {
        issues.push({ check: 'Images missing alt', detail: `${imagesNoAlt.length} images` });
        score -= imagesNoAlt.length * 5;
      }
      
      return { issues, score: Math.max(0, score) };
    }

    static getApiBaseUrl() {
        let scriptUrl = document.currentScript ? document.currentScript.src : null;
        if (!scriptUrl) {
           const scripts = document.querySelectorAll('script');
           for (let s of scripts) {
              if (s.src && s.src.includes('widget.js')) { scriptUrl = s.src; break; }
           }
        }
        return scriptUrl ? new URL(scriptUrl).origin : window.location.origin;
    }

    static async audit(options = { spellcheck: true }) {
      const doc = document;
      
      // Extract content EXCLUDING nav/footer
      const mainContentText = this.extractMainContent();
      const fullPageHtml = doc.documentElement.outerHTML;
      
      // Compute hashes
      const fullHash = await this.computeHash(fullPageHtml);
      const contentHash = await this.computeHash(mainContentText);
      
      // Compute readability metrics
      const readabilityData = this.computeReadability(mainContentText);
      
      // Check completeness
      const completenessResult = this.checkCompleteness(mainContentText, doc);
      
      const result = {
        canDeploy: true,
        overallScore: 100,
        summary: '',
        fullHash,
        contentHash,
        htmlSource: fullPageHtml, // Capture full source for diffing
        // Capture extended content snapshot for change detection
        contentSnapshot: {
          // Basic fields
          title: doc.title || '',
          h1: doc.querySelector('h1')?.textContent?.trim() || '',
          metaDescription: doc.querySelector('meta[name="description"]')?.content || '',
          wordCount: readabilityData.wordCount,
          headings: Array.from(doc.querySelectorAll('h1, h2, h3'))
            .filter(h => !h.closest('nav') && !h.closest('footer'))
            .map(h => h.textContent?.trim() || '')
            .slice(0, 10),
          // Extended fields for smart change tracking
          images: this.extractImages(),
          links: this.extractLinks(),
          sections: this.extractSections(),
          bodyTextHash: contentHash // Hash of main content text (nav/footer excluded)
        },
        categories: {
          placeholders: { status: 'passed', issues: [], score: 100 },
          spelling: { status: 'passed', issues: [], score: 100 },
          readability: { 
            status: 'passed', 
            score: readabilityData.fleschScore,
            fleschScore: readabilityData.fleschScore,
            wordCount: readabilityData.wordCount,
            sentenceCount: readabilityData.sentenceCount,
            label: readabilityData.label
          },
          completeness: {
            status: completenessResult.issues.length > 0 ? 'warning' : 'passed',
            issues: completenessResult.issues,
            score: completenessResult.score
          },
          seo: { status: 'passed', issues: [], score: 100 },
          technical: { status: 'passed', issues: [], score: 100 }
        }
      };

      // 1. PLACEHOLDER DETECTION (CRITICAL) - uses mainContentText
      this.PLACEHOLDER_PATTERNS.forEach(pattern => {
        const matches = mainContentText.match(pattern.regex);
        if (matches && matches.length > 0) {
          result.categories.placeholders.issues.push({ type: pattern.name, count: matches.length });
        }
      });

      if (result.categories.placeholders.issues.length > 0) {
        result.categories.placeholders.status = 'failed';
        result.categories.placeholders.score = 0;
        result.canDeploy = false;
        result.overallScore = 0;
      }

      // 2. SPELLING & GRAMMAR CHECK - uses mainContentText
      const typos = [];
      if (options.spellcheck) {
          try {
              const baseUrl = this.getApiBaseUrl();
              const apiUrl = `${baseUrl}/api/check-text`;

              // Use main content text (nav/footer excluded), truncated
              const textPayload = mainContentText.substring(0, 15000);

              const ltResponse = await fetch(apiUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ text: textPayload })
              });

              if (ltResponse.ok) {
                  const ltData = await ltResponse.json();
                  if (ltData.matches) {
                      const seen = new Set();
                      ltData.matches.forEach(match => {
                          const word = textPayload.substring(match.offset, match.offset + match.length);
                          const lower = word.toLowerCase();
                          if (this.CUSTOM_JARGON.has(lower)) return;
                          
                          // Ignore "li" (list item marker)
                          if (lower === 'li') return;
                          
                          // Ignore ANY capitalized word (Standard Technical Spellcheck behavior)
                          // This covers: Proper Nouns (Ordaz), Addresses (Piso, Cp), UI Labels (Meet, Get), Acronyms (IZA)
                          if (/^[A-Z]/.test(word)) return;

                          if (match.rule.issueType === 'misspelling' && !seen.has(lower)) {
                               typos.push(word);
                               seen.add(lower);
                          }
                      });
                  }
              }
          } catch (e) {
              console.warn('Audit: Spellcheck API failed (automatic fallback to nspell will occur)', e);
              typos.push('Check Unavailable');
          }
      } else {
         typos.push('Skipped (Volume Limit)');
      }

      const uniqueTypos = [...new Set(typos)].slice(0, 10);
      if (uniqueTypos.length > 0 && uniqueTypos[0] !== 'Check Unavailable' && uniqueTypos[0] !== 'Skipped (Volume Limit)') {
        result.categories.spelling.issues = uniqueTypos.map(w => ({ word: w }));
        result.categories.spelling.status = uniqueTypos.length > 3 ? 'warning' : 'info';
        result.categories.spelling.score = Math.max(0, 100 - (uniqueTypos.length * 5));
      } else if (uniqueTypos[0] === 'Skipped (Volume Limit)') {
         result.categories.spelling.status = 'info';
         result.categories.spelling.issues = [{ word: 'Skipped: High Volume Folder' }];
         result.categories.spelling.score = 100; // Don't penalize
      } else if (uniqueTypos[0] === 'Check Unavailable') {
         result.categories.spelling.status = 'info';
         result.categories.spelling.issues = [{ word: 'Service Unavailable' }];
      }

      // 3. SEO & META (global checks, not just main content)
      const seoIssues = [];
      const isLowImpactSeoIssue = (issue) => /^(Title too short|Title too long|Meta Description too short|Meta Description too long)/i.test(issue);
      const isLowImpactCompletenessIssue = (issue) => (issue?.check || '').toLowerCase() === 'low word count';
      if (!doc.title) seoIssues.push('Missing Title tag');
      else if (doc.title.length < 10) seoIssues.push('Title too short (< 10 chars)');
      else if (doc.title.length > 65) seoIssues.push('Title too long (> 65 chars)');

      const metaDesc = doc.querySelector('meta[name="description"]');
      if (!metaDesc) seoIssues.push('Missing Meta Description');
      else if (metaDesc.content.length < 50) seoIssues.push('Meta Description too short');
      else if (metaDesc.content.length > 160) seoIssues.push('Meta Description too long');

      const h1s = doc.querySelectorAll('h1');
      if (h1s.length === 0) seoIssues.push('Missing H1 heading');
      else if (h1s.length > 1) seoIssues.push(`Multiple H1 tags (${h1s.length})`);
      
      // Note: Images missing alt now in completeness, but keep global count in SEO
      const images = doc.querySelectorAll('img');
      let missingAlt = 0;
      images.forEach(img => { if (!img.alt || img.alt.trim() === '') missingAlt++; });
      if (missingAlt > 0) seoIssues.push(`${missingAlt} images missing alt text`);

      if (seoIssues.length > 0) {
        result.categories.seo.issues = seoIssues;
        const hasMajorSeoIssue = seoIssues.some(issue => !isLowImpactSeoIssue(issue));
        result.categories.seo.status = hasMajorSeoIssue ? 'warning' : 'info';
        const seoPenalty = seoIssues.reduce((sum, issue) => sum + (isLowImpactSeoIssue(issue) ? 0 : 15), 0);
        result.categories.seo.score = Math.max(0, 100 - seoPenalty);
      }

      if (result.categories.completeness.issues.length > 0) {
        const hasMajorCompletenessIssue = result.categories.completeness.issues.some(issue => !isLowImpactCompletenessIssue(issue));
        result.categories.completeness.status = hasMajorCompletenessIssue ? 'warning' : 'info';
      }

      // 4. TECHNICAL HEALTH
      const techIssues = [];
      
      // Broken/Unsafe Links
      const links = doc.querySelectorAll('a');
      let emptyLinks = 0;
      let unsafeLinks = 0;
      let httpLinks = 0;
      links.forEach(l => {
         const href = l.getAttribute('href');
         if (!href || href === '#') emptyLinks++;
         if (l.target === '_blank' && (!l.rel || !l.rel.includes('noopener'))) unsafeLinks++;
         if (href && href.startsWith('http:') && window.location.protocol === 'https:') httpLinks++;
      });
      if (emptyLinks > 0) techIssues.push(`${emptyLinks} empty links (href="#")`);
      if (unsafeLinks > 0) techIssues.push(`${unsafeLinks} unsafe external links (missing noopener)`);
      if (httpLinks > 0) techIssues.push(`${httpLinks} insecure HTTP links`);

      // CLS Risks
      let clsImages = 0;
      images.forEach(i => {
         if (!i.hasAttribute('width') && !i.hasAttribute('height')) clsImages++;
      });
      if (clsImages > 0) techIssues.push(`${clsImages} images missing width/height (CLS Risk)`);

      // Buttons
      const btns = doc.querySelectorAll('button');
      let noTypeBtns = 0;
      btns.forEach(b => {
         if (!b.hasAttribute('type')) noTypeBtns++;
      });
      if (noTypeBtns > 0) techIssues.push(`${noTypeBtns} buttons missing type attribute`);

      if (techIssues.length > 0) {
        result.categories.technical.issues = techIssues;
        result.categories.technical.status = 'warning';
        result.categories.technical.score = Math.max(0, 100 - (techIssues.length * 10));
      }

      // OVERALL CALCULATION
      // Weighted: Spelling (15%), Readability (10%), Completeness (15%), SEO (30%), Technical (30%)
      if (result.canDeploy) {
        result.overallScore = Math.round(
          (result.categories.spelling.score * 0.15) +
          (result.categories.readability.score * 0.10) +
          (result.categories.completeness.score * 0.15) +
          (result.categories.seo.score * 0.30) +
          (result.categories.technical.score * 0.30)
        );
      }

      // Summary
      const totalIssues = result.categories.placeholders.issues.length + 
                          result.categories.spelling.issues.length + 
                          result.categories.completeness.issues.length +
                          result.categories.seo.issues.length + 
                          result.categories.technical.issues.length;

      if (!result.canDeploy) {
        result.summary = '⛔ BLOCKED: Placeholders detected.';
      } else if (result.overallScore >= 90) {
        result.summary = '✅ Excellent! Site is production ready.';
      } else {
        result.summary = `⚠️ ${totalIssues} issues found. Review recommended.`;
      }

      return result;
    }

    static highlightTypos(typos) {
      if (!window.CSS || !CSS.highlights) return;
      CSS.highlights.clear();
      
      if (!typos || typos.length === 0) return;
      
      const ranges = [];
      const typoSet = new Set(typos.map(t => t.word.toLowerCase()));
      const treeWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let currentNode = treeWalker.nextNode();

      while (currentNode) {
         // Skip widget itself and scripts
         if (currentNode.parentElement && (
             currentNode.parentElement.closest('#plw-audit-container') || 
             currentNode.parentElement.tagName === 'SCRIPT' || 
             currentNode.parentElement.tagName === 'STYLE'
         )) {
             currentNode = treeWalker.nextNode();
             continue;
         }

         const text = currentNode.nodeValue;
         const regex = /[a-zA-Z]{4,}/g;
         let match;
         while ((match = regex.exec(text)) !== null) {
             if (typoSet.has(match[0].toLowerCase())) {
                 const range = new Range();
                 range.setStart(currentNode, match.index);
                 range.setEnd(currentNode, match.index + match[0].length);
                 ranges.push(range);
             }
         }
         currentNode = treeWalker.nextNode();
      }

      if (ranges.length > 0) {
         const highlight = new Highlight(...ranges);
         CSS.highlights.set("plw-typo", highlight);
      }
    }
  }

  // ProjectLinksWidget class
  class ProjectLinksWidget {
    constructor(container, config = {}) {
      // Check for .webflow.io domain
      this.container =
        typeof container === "string"
          ? document.getElementById(container)
          : container;
      
       // Enforce specific config overrides
      this.config = { 
        ...defaultConfig, 
        ...config,
        style: "dropdown", // Always dropdown
        // position override removed
      };

      // Domain Check
      const hostname = window.location.hostname;
      const isWebflow = hostname.endsWith('.webflow.io');
      const isFramer = hostname.endsWith('.framer.website');
      const isLocalhost = hostname.includes('localhost') || hostname.includes('127.0.0.1');
      const isAllowedDomain = this.config.showOnDomains && this.config.showOnDomains.some(d => hostname.includes(d));

      // Allow localhost, webflow, framer, or explicitly allowed domains
      // Allow localhost, webflow, framer, or explicitly allowed domains
      if (!isWebflow && !isFramer && !isLocalhost && !isAllowedDomain) {
        console.warn("Project Links Widget: Domain not allowed", hostname);
        return; 
      }

      console.log("Project Links Widget: Initializing on", hostname);

      if (!this.container) {
        console.error("ProjectLinksWidget: Container not found");
        return;
      }

      this.init();
    }

    async init() {
      this.initContentAudit(); // Auto-run audit on load
      loadFonts(); // Ensure fonts are loaded
      this.checklistProgress = null; // Will be { completed, total }
      try {
        if (this.config.projectId) {
          // Fetch project data and checklist progress in parallel
          const [data, clProgress] = await Promise.all([
            this.fetchProjectData(),
            this.fetchChecklistProgress().catch(() => null),
          ]);
          this.links = data.links || [];
          this.checklistProgress = clProgress;
          this.render(data);
        } else if (this.config.initialLinks) {
          this.links = this.config.initialLinks;
          this.render({ links: this.config.initialLinks });
        } else {
          console.warn("Project Links: No project ID provided");
        }
      } catch (error) {
        console.error("Failed to load project data:", error);
      }
    }

    async fetchProjectData() {
      const response = await fetch(
        `${this.config.baseUrl}/api/project/${this.config.projectId}`
      );
      if (!response.ok) throw new Error("Failed to fetch project data");
      return response.json();
    }

    async fetchChecklistProgress() {
      const response = await fetch(
        `${this.config.baseUrl}/api/project/${this.config.projectId}/checklist`
      );
      if (!response.ok) return null;
      return response.json();
    }

    render(data) {
      this.renderDropdown(data);
    }

    initContentAudit() {
       // Create Standalone Panel Container
       const auditContainer = document.createElement('div');
       auditContainer.id = 'plw-audit-container';
       document.body.appendChild(auditContainer);
       
       const baseUrl = this.config.baseUrl || "https://app.activeset.co";
       const iframeSrc = `${baseUrl}/embed?projectId=${encodeURIComponent(this.config.projectId || '')}&stagingUrl=${encodeURIComponent(this.config.stagingUrl || '')}&theme=${this.config.theme}&mode=qa`;

       // Inject Floating Badge + Panel HTML
       auditContainer.innerHTML = `
          <!-- Floating Score Badge -->
          <div id="plw-audit-badge" class="audit-badge">
             <div class="badge-ring">
                <svg viewBox="0 0 36 36" class="circular-chart">
                   <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                   <path id="plw-score-circle" class="circle" stroke-dasharray="0, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
             </div>
             <span id="plw-badge-score" class="badge-score">--</span>
          </div>

          <!-- Slide-out Panel -->
          <div id="plw-standalone-panel" class="standalone-panel">
             <button id="plw-close-standalone" class="close-standalone-btn">&times;</button>
             
             <div class="panel-header">
                <h3>Content Audit</h3>
                <div class="panel-tabs">
                    <button class="panel-tab active" data-tab="audit">Audit</button>
                    <button class="panel-tab" data-tab="qa">Checklist</button>
                </div>
             </div>

             <!-- Audit Tab Content -->
             <div id="plw-panel-content" class="panel-content tab-content active" data-tab="audit">
                <!-- Results go here -->
             </div>

             <!-- QA/Checklist Tab Content (Iframe) -->
             <div id="plw-qa-content" class="panel-content tab-content" data-tab="qa">
                ${(this.config.stagingUrl || this.config.projectId)
                    ? `<iframe src="${this.config.baseUrl}/embed?projectId=${this.config.projectId || ''}&stagingUrl=${encodeURIComponent(this.config.stagingUrl || '')}&theme=${this.config.theme}&mode=checklist" style="width: 100%; height: 100%; border: none; min-height: 400px; display: block;"></iframe>`
                    : `<div style="padding: 20px; color: #a1a1aa; text-align: center; font-size: 13px; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                         <div style="margin-bottom: 8px;">No Project ID or Staging URL provided.</div>
                         <div style="font-size: 11px; opacity: 0.7;">Add <code>data-project-id="..."</code> or <code>data-staging-url="..."</code> to your script tag.</div>
                       </div>`
                }
             </div>
          </div>
          
          <style>
             #plw-audit-container {
                font-family: 'Funnel Sans', sans-serif;
                z-index: 10001;
             }
             
             /* Tab Styles */
             .panel-tabs {
                 display: flex;
                 gap: 16px;
                 margin-top: 12px;
                 border-bottom: 1px solid #27272a;
             }
             
             .panel-tab {
                 background: none;
                 border: none;
                 color: #71717a;
                 padding: 8px 0;
                 font-size: 13px;
                 font-weight: 500;
                 cursor: pointer;
                 border-bottom: 2px solid transparent;
                 transition: all 0.2s;
             }
             
             .panel-tab:hover {
                 color: #e4e4e7;
             }
             
             .panel-tab.active {
                 color: #fff;
                 border-bottom-color: #fff;
             }
             
             .tab-content {
                 display: none;
                 height: calc(85vh - 110px); /* Adjust based on header */
                 flex-direction: column;
             }
             
             .tab-content.active {
                 display: flex;
             }

             ::highlight(plw-typo) {
                text-decoration: underline wavy #ef4444;
                text-decoration-thickness: 2px;
                background-color: rgba(239, 68, 68, 0.15);
                color: unset;
             }
             
             /* Badge Styles */
             .audit-badge {
                position: fixed;
                top: 50%;
                right: 20px;
                transform: translateY(-50%);
                width: 56px;
                height: 56px;
                background: #09090b;
                border: 1px solid #27272a;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                transition: all 0.2s ease;
                z-index: 10002;
                overflow: hidden;
             }
             
             .audit-badge:hover {
                transform: translateY(-50%) scale(1.05);
                box-shadow: 0 6px 16px rgba(0,0,0,0.4);
                border-color: #3f3f46;
             }
             
             .badge-ring {
                position: absolute;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
             }
             
             .circular-chart {
                display: block;
                margin: 0 auto;
                max-width: 100%;
                max-height: 100%;
             }
             
             .circle-bg {
                fill: none;
                stroke: #27272a;
                stroke-width: 2.5;
             }
             
             .circle {
                fill: none;
                stroke-width: 3; /* Thicker stroke */
                stroke-linecap: round;
                animation: progress 1s ease-out forwards;
                transition: stroke 0.3s;
             }
             
             @keyframes progress {
                0% { stroke-dasharray: 0 100; }
             }
             
             .badge-score {
                font-family: 'Funnel Display', sans-serif;
                font-weight: 700;
                font-size: 16px;
                color: #fff;
                z-index: 1;
             }
             
             /* Panel Styles */
             .standalone-panel {
                position: fixed;
                top: 50%;
                right: 0; 
                transform: translate(100%, -50%); /* Hidden by default */
                width: 400px; /* Slightly wider */
                max-height: 85vh;
                background: #09090b;
                border: 1px solid #27272a;
                border-right: none;
                border-radius: 12px 0 0 12px;
                box-shadow: -10px 0 30px rgba(0,0,0,0.5);
                display: flex;
                flex-direction: column;
                z-index: 10001;
                transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
             }
             
             .standalone-panel.open {
                transform: translate(0, -50%);
             }
             
             .panel-header {
                padding: 16px 20px 0; /* Adjusted padding */
                border-bottom: 1px solid #27272a;
                background: #09090b;
             }
             
             .panel-header h3 {
                margin: 0;
                font-size: 16px;
                color: #fff;
                font-family: 'Funnel Display', sans-serif;
             }
             
             .panel-subtitle {
                font-size: 12px;
                color: #71717a;
                display: none; /* Hide subtitle when tabs are active */
             }
             
             .panel-content {
                padding: 0;
                overflow-y: auto;
                /* Height handled by tab-content flex */
             }
             
             .close-standalone-btn {
                position: absolute;
                top: 12px;
                right: 12px;
                background: transparent;
                border: none;
                color: #71717a;
                font-size: 20px;
                cursor: pointer;
                padding: 4px;
                line-height: 1;
                z-index: 10;
             }
             
             .close-standalone-btn:hover { color: #fff; }
             
             /* Re-use existing category styles */
             .category-list { border: none; border-radius: 0; }
             .category-row { padding: 16px 20px; }
             .cat-details { background: #0c0c0c; }
             
             /* Colors */
             .stroke-green { stroke: #10b981; }
             .stroke-yellow { stroke: #f59e0b; }
             .stroke-red { stroke: #ef4444; }
             
             .score-blocked-badge {
                 border-color: #ef4444 !important;
                 box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
                 animation: pulse-badge 2s infinite;
             }
             
             @keyframes pulse-badge {
                0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
                70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
                100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
             }
          </style>
       `;
       
       // Wire Events
       const badge = document.getElementById('plw-audit-badge');
       const panel = document.getElementById('plw-standalone-panel');
       const closeBtn = document.getElementById('plw-close-standalone');
       
       badge.addEventListener('click', () => {
          panel.classList.add('open');
          // Hide badge when panel is open (optional, or move it)
          badge.style.opacity = '0';
          badge.style.pointerEvents = 'none';
       });
       
       closeBtn.addEventListener('click', () => {
          panel.classList.remove('open');
          badge.style.opacity = '1';
          badge.style.pointerEvents = 'auto';
       });

       // Tab Handling
       const tabs = panel.querySelectorAll('.panel-tab');
       tabs.forEach(tab => {
           tab.addEventListener('click', () => {
               // Deactivate all
               tabs.forEach(t => t.classList.remove('active'));
               panel.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
               
               // Activate this
               tab.classList.add('active');
               const target = panel.querySelector(`.tab-content[data-tab="${tab.dataset.tab}"]`);
               if(target) target.classList.add('active');
           });
       });
       
       // Run Initial Audit
       this.runStandaloneAudit();
    }
    
    async runStandaloneAudit() {
       // Small delay to ensure DOM is ready
       setTimeout(async () => {
          try {
             let enableSpellcheck = true;
             const baseUrl = ContentQualityAuditor.getApiBaseUrl();

             // 1. Check Scan Eligibility (Cost Control)
             if (this.config.projectId) {
                 try {
                     const checkUrl = `${baseUrl}/api/audit-config`;
                     const res = await fetch(checkUrl, {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ projectId: this.config.projectId, url: window.location.href })
                     });
                     const data = await res.json();
                     enableSpellcheck = data.enableSpellcheck;
                 } catch (e) { console.warn('Audit Config Check Failed', e); }
             }

             // 2. Run Audit
             const result = await ContentQualityAuditor.audit({ spellcheck: enableSpellcheck });
             ContentQualityAuditor.highlightTypos(result.categories.spelling.issues);
             this.renderStandaloneResults(result);
             
             // 3. Sync Logic (Save to Dashboard)
             if (this.config.projectId) {
                  try {
                      await fetch(`${baseUrl}/api/save-audit`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ 
                              projectId: this.config.projectId,
                              url: window.location.href,
                              title: document.title,
                              auditResult: result
                          })
                      });
                   } catch (e) {
                       // Suppress error if blocked by client (common for analytics/tracking)
                       console.warn('Audit Sync prevented (likely blocked by client):', e.message);
                   }
             }

          } catch (err) {
             console.error("Auto-Audit Failed:", err);
          }
       }, 500);
    }
    
    renderStandaloneResults(result) {
       const badgeScore = document.getElementById('plw-badge-score');
       const scoreCircle = document.getElementById('plw-score-circle');
       const badge = document.getElementById('plw-audit-badge');
       const content = document.getElementById('plw-panel-content');
       
       if(!badgeScore || !content) return;
       
       // 1. Update Badge
       badgeScore.textContent = result.overallScore;
       
       // Color Logic
       let colorClass = 'stroke-red';
       if (result.overallScore >= 90) colorClass = 'stroke-green';
       else if (result.overallScore >= 50) colorClass = 'stroke-yellow';
       
       // Blocked Logic
       if (!result.canDeploy) {
          colorClass = 'stroke-red'; // Force red
          badge.classList.add('score-blocked-badge');
       } else {
          badge.classList.remove('score-blocked-badge');
       }
       
       // Set Circle Stroke
       scoreCircle.classList.remove('stroke-green', 'stroke-yellow', 'stroke-red');
       scoreCircle.classList.add(colorClass);
       
       // Set Dash Array (Progress)
       // Circumference approx 100 for pathLength=100 logic or simply use percent
       // The SVG path has length ~100 via logic, let's just set dasharray
       // result.overallScore, 100
       scoreCircle.setAttribute('stroke-dasharray', `${result.overallScore}, 100`);
       
       // 2. Render Panel Content
       let html = `
          <div style="padding: 20px; text-align: center; border-bottom: 1px solid #27272a;">
             <div style="font-size: 32px; font-weight: 700; color: #fff; font-family: 'Funnel Display';">
                ${result.overallScore}
             </div>
             <p style="margin: 4px 0 0; color: #a1a1aa; font-size: 13px;">${result.summary}</p>
          </div>
          
          <div class="category-list" style="border: none;">
       `;
       
       // Helper for category row
       const renderRow = (icon, name, statusObj, detailsHtml = '') => {
           let statusColor = statusObj.status === 'passed' ? '#10b981' : statusObj.status === 'warning' ? '#f59e0b' : '#ef4444';
           let statusText = statusObj.status === 'passed' ? '✓ Passed' : 'Issues Found';
           
           return `
             <div class="category-row">
               <span class="cat-icon">${icon}</span>
               <span class="cat-name">${name}</span>
               <span class="cat-status" style="color: ${statusColor}">${statusText}</span>
             </div>
             ${detailsHtml}
           `;
       };
       
       // Placeholders
       const ph = result.categories.placeholders;
       let phDetails = '';
       if (ph.issues.length > 0) {
           phDetails = `<div class="cat-details">` + ph.issues.map(i => `<div class="detail-item">• ${i.type}</div>`).join('') + `</div>`;
       }
       html += renderRow('🔴', 'Placeholders', ph, phDetails);
       
       // Spelling
       const sp = result.categories.spelling;
       let spDetails = '';
       if (sp.issues.length > 0) {
           spDetails = `<div class="cat-details">` + sp.issues.slice(0, 5).map(i => `<div class="detail-item">• "${i.word}"</div>`).join('') + (sp.issues.length > 5 ? `<div class="detail-item">+ ${sp.issues.length-5} more</div>` : '') + `</div>`;
       }
       html += renderRow('🔤', 'Spelling', sp, spDetails);
       
       // SEO & Meta
       const seo = result.categories.seo;
       let seoDetails = '';
       if (seo.issues.length > 0) {
           seoDetails = `<div class="cat-details">` + seo.issues.map(i => `<div class="detail-item">• ${i}</div>`).join('') + `</div>`;
       }
       html += renderRow('🔍', 'SEO & Meta', seo, seoDetails);
       
       // Technical Health
       const tech = result.categories.technical;
       let techDetails = '';
       if (tech.issues.length > 0) {
           techDetails = `<div class="cat-details">` + tech.issues.map(i => `<div class="detail-item">• ${i}</div>`).join('') + `</div>`;
       }
       html += renderRow('⚙️', 'Technical Health', tech, techDetails);
       
       html += `</div>`; // Close list
       
       content.innerHTML = html;
    }

    renderDropdown(data) {
      // Filter out auto-discovered links (sitemap links)
      const allLinks = data.links || [];
      const links = allLinks.filter(link => link.source !== 'auto'); // Only manual links

      if (links.length === 0) return;

      const positionStyles = {
        "bottom-right": "bottom: 0; right: 24px;",
        "bottom-left": "bottom: 0; left: 24px;",
        "top-right": "top: 0; right: 24px;",
        "top-left": "top: 0; left: 24px;",
        "center-right": "top: 50%; right: 0; transform: translateY(-50%);",
        "center-left": "top: 50%; left: 0; transform: translateY(-50%);",
      };

      const posKey = this.config.position || "center-left"; 
      const styleString = positionStyles[posKey] || positionStyles["center-left"];

      // Calculate where the dropdown content should appear relative to the button
      // If widget is at the bottom, menu goes up (bottom: 100%). If top, menu goes down (top: 100%).
      let dropdownPosition = "bottom: 100%; margin-bottom: 12px;";
      if (posKey.startsWith("top")) {
        dropdownPosition = "top: 100%; margin-top: 12px;";
      } else if (posKey.includes("center")) {
        // For center positions, align to the side? Or keep default?
        // Let's assume bottom-up for center for now, or maybe top-0 relative to button
        dropdownPosition = "bottom: 100%; margin-bottom: 12px;";
      }

      // Ensure container is fixed and positioned correctly matches old style
      this.container.style.cssText = `
        position: fixed; 
        z-index: 9999; 
        ${styleString}
      `;

      this.container.innerHTML = `
        <div class="dropdown-widget-container">
          ${this.checklistProgress && this.checklistProgress.total > 0 ? `
            <div class="dropdown-widget-button-group">
              <button class="dropdown-widget-part-btn link-part" id="plw-trigger-btn">
                <div class="button-content">
                   <span>Project Links</span>
                   <div class="count-badge">${links.length}</div>
                </div>
                <svg class="chevron-icon" id="plw-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
              </button>
              <div class="group-divider"></div>
              <button class="dropdown-widget-part-btn checklist-part" id="plw-checklist-btn">
                 <svg class="checklist-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                 <span class="checklist-count">${this.checklistProgress.completed}/${this.checklistProgress.total}</span>
              </button>
            </div>
          ` : `
            <button class="dropdown-widget-button" id="plw-trigger-btn">
              <div class="button-content">
                 <span>Project Links</span>
                 <div class="count-badge">${links.length}</div>
              </div>
              <svg class="chevron-icon" id="plw-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
            </button>
          `}
          
          <div class="dropdown-widget-content" id="plw-content" style="display: none; position: absolute; ${dropdownPosition} right: 0; background-color: #000000; min-width: 280px; box-shadow: 0 0 0 1px #333333, 0 4px 6px -1px rgba(0, 0, 0, 0.5); z-index: 10000; border-radius: 6px; overflow: hidden; margin-bottom: 8px;">
             <div class="dropdown-header">
               <span class="header-title">Available Links</span>
            </div>
            ${links
              .map(
                (link) => `
              <div class="dropdown-widget-row">
                <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="dropdown-link-title" title="${link.title}">
                  ${link.title}
                  <svg class="external-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17l9.2-9.2M17 17V7H7"/></svg>
                </a>
                <button class="action-btn copy-btn" onclick="window.copyWidgetLink(this, '${link.url}')" title="Copy Link" aria-label="Copy Link">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
              </div>
            `
              )
              .join("")}
            </div>
          </div>
        </div>

        <style>
          .dropdown-widget-button {
            display: inline-flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            background-color: #000;
            padding: 10px 16px;
            border: 1px solid #333;
            border-bottom: none;
            cursor: pointer;
            border-radius: 8px 8px 0 0;
            font-weight: 500;
            color: #fff;
            font-size: 14px;
            transition: all 0.2s;
            font-family: 'Funnel Display', sans-serif;
            min-width: 160px;
            box-sizing: border-box;
          }
          
          .dropdown-widget-button:hover {
            background-color: #111;
          }

          .button-content {
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .count-badge {
            background: #333;
            color: #fff;
            font-size: 10px;
            padding: 1px 6px;
            border-radius: 4px;
            font-weight: 600;
            font-family: 'Funnel Sans', sans-serif;
          }

          /* Split Button Group Styles */
          .dropdown-widget-button-group {
            display: inline-flex;
            align-items: stretch;
            background-color: #000;
            border: 1px solid #333;
            border-bottom: none;
            border-radius: 8px 8px 0 0;
            overflow: hidden;
            min-width: 160px;
          }

          .dropdown-widget-part-btn {
            background: transparent;
            border: none;
            color: #fff;
            cursor: pointer;
            display: flex;
            align-items: center;
            padding: 10px 12px;
            font-family: 'Funnel Display', sans-serif;
            font-size: 14px;
            font-weight: 500;
            transition: background 0.2s;
          }

          .dropdown-widget-part-btn:hover {
            background-color: #111;
          }

          .link-part {
            flex: 1;
            justify-content: space-between;
            gap: 12px;
          }

          .checklist-part {
            gap: 6px;
          }

          .group-divider {
            width: 1px;
            background-color: #333;
          }
          
          .checklist-icon {
             color: #22c55e;
             width: 14px;
             height: 14px;
          }
          
          .checklist-count {
             color: #fff;
             font-size: 13px;
             font-weight: 500;
             font-family: 'Funnel Sans', sans-serif;
          }
          
          .chevron-icon {
            transition: transform 0.2s ease;
            color: #666;
          }

          .dropdown-header {
            padding: 12px 16px 8px;
            background: #000;
            border-bottom: 1px solid #222;
          }
          
          .header-title {
            font-size: 11px; 
            text-transform: uppercase; 
            letter-spacing: 0.05em; 
            color: #888; 
            font-family: 'Funnel Display', sans-serif;
          }

          .dropdown-widget-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background-color: #000;
            transition: background-color 0.2s;
            border-bottom: 1px solid #111;
          }

          .dropdown-widget-row:hover {
            background-color: #111;
          }

          .dropdown-link-title {
            flex: 1;
            color: #fff;
            font-size: 13px;
            font-weight: 400;
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 0;
            transition: color 0.15s;
            font-family: 'Funnel Sans', sans-serif;
          }

          .dropdown-link-title:hover {
            color: #ccc;
          }

          .external-icon {
            color: #444;
            transition: color 0.15s;
          }
          
          .dropdown-link-title:hover .external-icon {
            color: #fff;
          }

          .action-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border-radius: 4px;
            color: #666;
            background: transparent;
            border: 1px solid transparent;
            cursor: pointer;
            transition: all 0.15s;
            margin-left: 8px;
          }

          .action-btn:hover {
            background-color: #222;
            color: #fff;
            border-color: #333;
          }
          

          /* Category Rows */
          .category-list {
             border: 1px solid #27272a;
             border-radius: 8px;
             overflow: hidden;
          }

          .category-row {
             display: flex;
             align-items: center;
             padding: 12px 14px;
             background: #18181b;
             border-bottom: 1px solid #27272a;
             gap: 10px;
          }

          .category-row:last-of-type {
             border-bottom: none;
          }

          .cat-icon {
             font-size: 16px;
             flex-shrink: 0;
          }

          .cat-name {
             flex: 1;
             font-size: 13px;
             font-weight: 500;
             color: #e4e4e7;
          }

          .cat-status {
             font-size: 12px;
             color: #71717a;
          }

          .cat-details {
             background: #0c0c0c;
             padding: 8px 14px 8px 40px;
             border-bottom: 1px solid #27272a;
          }

          .detail-item {
             font-size: 13px; /* Bump size slightly */
             color: #e4e4e7 !important; /* Lighter gray and enforced */
             padding: 4px 0;
             line-height: 1.4;
          }
        </style>
      `;

      // Setup click listeners
      this.setupHandlers();
    }

    setupHandlers() {
       const btn = this.container.querySelector('#plw-trigger-btn');
       const checklistBtn = this.container.querySelector('#plw-checklist-btn');
       const content = this.container.querySelector('#plw-content');
       const chevron = this.container.querySelector('#plw-chevron');

       if (btn && content) {
         const toggleMenu = (e) => {
           e.stopPropagation();
           const isHidden = content.style.display === 'none';
           content.style.display = isHidden ? 'block' : 'none';
           if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
         };
         btn.addEventListener('click', toggleMenu);
       }

       if (checklistBtn) {
         checklistBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Open Standalone Panel
            const panel = document.getElementById('plw-standalone-panel');
            if (panel) {
                panel.classList.add('open');
                // Switch to Checklist tab
                const checklistTab = panel.querySelector('.panel-tab[data-tab="qa"]');
                if (checklistTab) checklistTab.click(); 
            }
         });
       }

       const closeMenu = (e) => {
         // Don't close if clicking inside container or if clicking the audit badge/panel
         if (this.container.contains(e.target)) return;
         
         const auditBadge = document.getElementById('plw-audit-badge');
         const auditPanel = document.getElementById('plw-standalone-panel');
         
         if (auditBadge && auditBadge.contains(e.target)) return;
         if (auditPanel && auditPanel.contains(e.target)) return;

         content.style.display = 'none';
         chevron.style.transform = 'rotate(0deg)';
       };

       btn.addEventListener('click', toggleMenu);
       document.addEventListener('click', closeMenu);
    }
  }

  // Helper for copy
  window.copyWidgetLink = function(btn, url) {
    if (!navigator.clipboard) {
       console.error("Clipboard API not available");
       return;
    }
    // Prevent clicking the row
    if (event) event.stopPropagation();

    navigator.clipboard.writeText(url).then(() => {
      const originalHtml = btn.innerHTML;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      btn.style.color = '#fff';
      setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.style.color = '';
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  // Global function to embed widget
  window.embedProjectLinksWidget = function (containerId, config = {}) {
    return new ProjectLinksWidget(containerId, config);
  };

  // Auto-initialize widgets with data attributes
  function initDataAttributeWidgets() {
    const widgets = document.querySelectorAll("[data-project-links-widget]");
    widgets.forEach((element) => {
      const config = {
        projectId: element.dataset.projectId,
        theme: element.dataset.theme || defaultConfig.theme,
        stagingUrl: element.dataset.stagingUrl, // Parse stagingUrl
      };

      if (element.dataset.initialLinks) {
        try {
          config.initialLinks = JSON.parse(element.dataset.initialLinks);
        } catch (e) {
          console.error("Invalid initialLinks JSON:", e);
        }
      }

      new ProjectLinksWidget(element, config);
    });
  }

  // Auto-inject functionality for script tags
  function autoInjectWidget() {
    // Find scripts with EITHER data-auto-inject="true" OR just data-project-id
    const scripts = Array.from(document.querySelectorAll('script')).filter(s => 
      s.dataset.autoInject === "true" || s.dataset.projectId
    );

    scripts.forEach((script) => {
      if (script.dataset.injected) return; // Already processed

      const config = {
        projectId: script.dataset.projectId,
        theme: script.dataset.theme || defaultConfig.theme,
        stagingUrl: script.dataset.stagingUrl, // Parse stagingUrl
      };

      // Create container element
      const container = document.createElement("div");
      container.className = "project-links-widget-auto";
      
      // Append to body effectively for fixed positioning
      document.body.appendChild(container);

      new ProjectLinksWidget(container, config);
      script.dataset.injected = "true";
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initDataAttributeWidgets();
      autoInjectWidget();
    });
  } else {
    initDataAttributeWidgets();
    autoInjectWidget();
  }
})();
