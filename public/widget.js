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

    static issueElementMap = new Map();

    static isWidgetInjectedElement(el) {
      if (!el || !el.closest) return false;
      return Boolean(
        el.closest('#plw-audit-container') ||
        el.closest('[data-plw-widget-root="true"]')
      );
    }

    static resetIssueTracking() {
      this.issueElementMap = new Map();
      this.clearIssueHighlights();
    }

    static trackIssueElement(el) {
      if (!el || this.isWidgetInjectedElement(el)) return null;
      const id = `plw-issue-${this.issueElementMap.size + 1}`;
      this.issueElementMap.set(id, el);
      return id;
    }

    static clearIssueHighlights() {
      document.querySelectorAll('.plw-issue-highlight, .plw-issue-highlight-focus').forEach((node) => {
        node.classList.remove('plw-issue-highlight', 'plw-issue-highlight-focus');
      });
    }

    static highlightIssueElementsByIds(ids = [], options = {}) {
      const { scroll = true, append = false } = options;
      if (!append) this.clearIssueHighlights();

      const elements = ids
        .map((id) => this.issueElementMap.get(id))
        .filter((el) => el && document.contains(el) && !this.isWidgetInjectedElement(el));

      elements.forEach((el) => el.classList.add('plw-issue-highlight'));

      if (scroll && elements.length > 0) {
        const focusEl = elements[0];
        focusEl.classList.add('plw-issue-highlight-focus');
        focusEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        setTimeout(() => focusEl.classList.remove('plw-issue-highlight-focus'), 2200);
      }

      return elements.length;
    }

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

    static escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    static truncate(value, max = 100) {
      const text = String(value ?? '').replace(/\s+/g, ' ').trim();
      if (!text) return '';
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    }

    static getElementSelector(el) {
      if (!el || !el.tagName) return 'unknown';
      if (el.id) return `#${el.id}`;

      const parts = [];
      let current = el;
      let depth = 0;

      while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body && depth < 5) {
        let part = current.tagName.toLowerCase();

        const className = typeof current.className === 'string' ? current.className.trim() : '';
        if (className) {
          const classParts = className
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((cls) => cls.replace(/[^a-zA-Z0-9_-]/g, ''))
            .filter(Boolean);
          if (classParts.length) {
            part += `.${classParts.join('.')}`;
          }
        }

        if (current.parentElement) {
          const sameTagSiblings = Array.from(current.parentElement.children).filter(
            (child) => child.tagName === current.tagName
          );
          if (sameTagSiblings.length > 1) {
            part += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
          }
        }

        parts.unshift(part);
        if (current.parentElement && current.parentElement.id) {
          parts.unshift(`#${current.parentElement.id}`);
          break;
        }
        current = current.parentElement;
        depth++;
      }

      return parts.join(' > ') || el.tagName.toLowerCase();
    }

    static getNodeText(el, max = 90) {
      if (!el) return '';
      const text = el.innerText || el.textContent || '';
      return this.truncate(text, max);
    }

    static escapeRegExp(value) {
      return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    static collectTextMatchDetails(pattern, options = {}) {
      const maxItems = options.maxItems || 80;
      const label = options.label || '';
      const flags = pattern.flags ? (pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`) : 'g';
      const regex = new RegExp(pattern.source, flags);
      const details = [];

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let currentNode = walker.nextNode();

      while (currentNode && details.length < maxItems) {
        const parent = currentNode.parentElement;
        if (!parent || this.isWidgetInjectedElement(parent)) {
          currentNode = walker.nextNode();
          continue;
        }
        if (parent.closest('script,style,noscript,svg,nav,footer')) {
          currentNode = walker.nextNode();
          continue;
        }

        const text = currentNode.nodeValue || '';
        if (!text.trim()) {
          currentNode = walker.nextNode();
          continue;
        }

        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(text)) !== null) {
          const target = parent.closest('a,button,p,li,h1,h2,h3,h4,h5,h6,span,div,section,article') || parent;
          details.push({
            elementId: this.trackIssueElement(target),
            selector: this.getElementSelector(target),
            label,
            match: this.truncate(match[0], 80),
            snippet: this.truncate(text.trim(), 140),
          });

          if (details.length >= maxItems) break;
          if (match.index === regex.lastIndex) regex.lastIndex += 1;
        }

        currentNode = walker.nextNode();
      }

      return details;
    }

    static buildWebflowMcpPrompt(issueType, pageUrl, items = [], totalCount = items.length) {
      const maxItems = 15;
      const sample = items.slice(0, maxItems);
      const format = (value) => this.truncate(value || '[missing]', 180);
      let issueName = 'technical issue';
      let fixSteps = '';
      let itemLines = [];

      if (issueType === 'empty-links') {
        issueName = 'empty links (href="#" or missing href)';
        fixSteps = [
          '1) Open the page in Webflow Designer and locate each link below.',
          '2) Replace placeholder href with a real destination (page, section, URL, email, or phone).',
          '3) If the element should not navigate anywhere, remove link wrapping and keep plain text/div.',
          '4) Publish and re-run the audit.',
        ].join('\n');
        itemLines = sample.map((item, idx) => (
          `${idx + 1}. selector=${format(item.selector)} | text="${format(item.text || '[no text]')}" | href=${format(item.href)}`
        ));
      } else if (issueType === 'unsafe-links') {
        issueName = 'unsafe links opening in new tab (missing noopener)';
        fixSteps = [
          '1) Open the page in Webflow Designer and locate each link below.',
          '2) Keep target="_blank" only if needed.',
          '3) Ensure rel includes both noopener and noreferrer (append without removing existing safe tokens).',
          '4) Publish and re-run the audit.',
        ].join('\n');
        itemLines = sample.map((item, idx) => (
          `${idx + 1}. selector=${format(item.selector)} | href=${format(item.href)} | rel=${format(item.rel)}`
        ));
      } else if (issueType === 'http-links') {
        issueName = 'insecure HTTP links on HTTPS page';
        fixSteps = [
          '1) Open the page in Webflow Designer and locate each link below.',
          '2) Change each URL from http:// to https:// where supported.',
          '3) If destination does not support HTTPS, route through a secure alternative or remove link.',
          '4) Publish and re-run the audit.',
        ].join('\n');
        itemLines = sample.map((item, idx) => (
          `${idx + 1}. selector=${format(item.selector)} | href=${format(item.href)}`
        ));
      } else if (issueType === 'cls-images') {
        issueName = 'images missing width/height (CLS risk)';
        fixSteps = [
          '1) Open the page in Webflow Designer and locate each image below.',
          '2) Set explicit width and height attributes, or enforce fixed aspect ratio containers.',
          '3) Keep responsive sizing via CSS but preserve intrinsic aspect ratio to prevent layout shift.',
          '4) Publish and re-run the audit.',
        ].join('\n');
        itemLines = sample.map((item, idx) => (
          `${idx + 1}. selector=${format(item.selector)} | src=${format(item.src)} | width=${format(item.widthAttr)} | height=${format(item.heightAttr)}`
        ));
      } else if (issueType === 'button-type') {
        issueName = 'buttons missing type attribute';
        fixSteps = [
          '1) Open the page in Webflow Designer and locate each button below.',
          '2) Set type="button" for non-submit actions, or type="submit" only for form submission buttons.',
          '3) Publish and re-run the audit.',
        ].join('\n');
        itemLines = sample.map((item, idx) => (
          `${idx + 1}. selector=${format(item.selector)} | text="${format(item.text || '[no text]')}" | type=${format(item.type)}`
        ));
      }

      const moreCount = Math.max(0, totalCount - sample.length);
      const moreLine = moreCount > 0 ? `\nAdditional affected elements not listed here: ${moreCount}` : '';
      const itemBlock = itemLines.length > 0
        ? `Affected elements (${sample.length}/${totalCount}):\n${itemLines.join('\n')}`
        : `Affected elements: ${totalCount}`;

      return [
        `Fix this Webflow page issue: ${issueName}`,
        `Page URL: ${pageUrl}`,
        '',
        fixSteps,
        '',
        itemBlock + moreLine,
      ].join('\n');
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
      this.resetIssueTracking();
      
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
      const placeholderDetailItems = [];
      this.PLACEHOLDER_PATTERNS.forEach(pattern => {
        const matches = mainContentText.match(pattern.regex);
        if (matches && matches.length > 0) {
          result.categories.placeholders.issues.push({ type: pattern.name, count: matches.length });
          const detailItems = this.collectTextMatchDetails(pattern.regex, {
            maxItems: 120,
            label: pattern.name,
          });
          placeholderDetailItems.push(...detailItems);
        }
      });
      if (placeholderDetailItems.length > 0) {
        result.categories.placeholders.detailItems = placeholderDetailItems;
      }

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
        const spellingDetailItems = [];
        uniqueTypos.forEach((word) => {
          const typoRegex = new RegExp(`\\b${this.escapeRegExp(word)}\\b`, 'gi');
          const wordItems = this.collectTextMatchDetails(typoRegex, {
            maxItems: 80,
            label: word,
          });
          spellingDetailItems.push(...wordItems);
        });
        if (spellingDetailItems.length > 0) {
          result.categories.spelling.detailItems = spellingDetailItems;
        }
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
      const seoDetailItems = [];
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
      else if (h1s.length > 1) {
        seoIssues.push(`Multiple H1 tags (${h1s.length})`);
        Array.from(h1s).forEach((h1) => {
          if (this.isWidgetInjectedElement(h1)) return;
          seoDetailItems.push({
            elementId: this.trackIssueElement(h1),
            selector: this.getElementSelector(h1),
            label: 'Multiple H1 tags',
            match: this.truncate(h1.textContent || '[empty]', 100),
            snippet: this.truncate(h1.textContent || '[empty]', 140),
          });
        });
      }
      
      // Note: Images missing alt now in completeness, but keep global count in SEO
      const images = doc.querySelectorAll('img');
      let missingAlt = 0;
      images.forEach(img => {
        if (this.isWidgetInjectedElement(img)) return;
        if (!img.alt || img.alt.trim() === '') {
          missingAlt++;
          seoDetailItems.push({
            elementId: this.trackIssueElement(img),
            selector: this.getElementSelector(img),
            label: 'Image missing alt text',
            match: this.truncate(img.currentSrc || img.getAttribute('src') || '[missing src]', 100),
            snippet: this.truncate(`src: ${img.currentSrc || img.getAttribute('src') || '[missing]'} | alt: [missing]`, 140),
          });
        }
      });
      if (missingAlt > 0) seoIssues.push(`${missingAlt} images missing alt text`);

      if (seoIssues.length > 0) {
        result.categories.seo.issues = seoIssues;
        if (seoDetailItems.length > 0) {
          result.categories.seo.detailItems = seoDetailItems;
        }
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
      const technicalDetailGroups = [];
      const addDetail = (arr, value) => {
        arr.push(value);
      };
      
      // Broken/Unsafe Links
      const links = doc.querySelectorAll('a');
      let emptyLinks = 0;
      let unsafeLinks = 0;
      let httpLinks = 0;
      const emptyLinkItems = [];
      const unsafeLinkItems = [];
      const httpLinkItems = [];
      links.forEach(l => {
         if (this.isWidgetInjectedElement(l)) return;
         const href = (l.getAttribute('href') || '').trim();
         const selector = this.getElementSelector(l);
         const text = this.getNodeText(l, 90) || '[no text]';
         let elementId = null;
         const getElementId = () => {
           if (!elementId) elementId = this.trackIssueElement(l);
           return elementId;
         };

         if (!href || href === '#') {
            emptyLinks++;
            addDetail(emptyLinkItems, {
              elementId: getElementId(),
              selector,
              text,
              href: href || '[missing]'
            });
         }

         if (l.target === '_blank' && (!l.rel || !/\bnoopener\b/i.test(l.rel))) {
            unsafeLinks++;
            addDetail(unsafeLinkItems, {
              elementId: getElementId(),
              selector,
              text,
              href: href || l.href || '[missing]',
              rel: l.getAttribute('rel') || '[missing]'
            });
         }

         if (href && href.startsWith('http:') && window.location.protocol === 'https:') {
            httpLinks++;
            addDetail(httpLinkItems, {
              elementId: getElementId(),
              selector,
              text,
              href
            });
         }
      });
      if (emptyLinks > 0) {
        const summary = `${emptyLinks} empty links (href="#")`;
        techIssues.push(summary);
        technicalDetailGroups.push({
          key: 'empty-links',
          summary,
          count: emptyLinks,
          items: emptyLinkItems
        });
      }
      if (unsafeLinks > 0) {
        const summary = `${unsafeLinks} unsafe external links (missing noopener)`;
        techIssues.push(summary);
        technicalDetailGroups.push({
          key: 'unsafe-links',
          summary,
          count: unsafeLinks,
          items: unsafeLinkItems
        });
      }
      if (httpLinks > 0) {
        const summary = `${httpLinks} insecure HTTP links`;
        techIssues.push(summary);
        technicalDetailGroups.push({
          key: 'http-links',
          summary,
          count: httpLinks,
          items: httpLinkItems
        });
      }

      // CLS Risks
      let clsImages = 0;
      const clsImageItems = [];
      images.forEach(i => {
         if (this.isWidgetInjectedElement(i)) return;
         if (!i.hasAttribute('width') && !i.hasAttribute('height')) {
            clsImages++;
            addDetail(clsImageItems, {
              elementId: this.trackIssueElement(i),
              selector: this.getElementSelector(i),
              src: i.currentSrc || i.getAttribute('src') || i.getAttribute('data-src') || '[missing]',
              alt: this.getNodeText(i, 80) || i.getAttribute('alt') || '[missing]',
              widthAttr: i.getAttribute('width') || '[missing]',
              heightAttr: i.getAttribute('height') || '[missing]'
            });
         }
      });
      if (clsImages > 0) {
        const summary = `${clsImages} images missing width/height (CLS Risk)`;
        techIssues.push(summary);
        technicalDetailGroups.push({
          key: 'cls-images',
          summary,
          count: clsImages,
          items: clsImageItems
        });
      }

      // Buttons
      const btns = doc.querySelectorAll('button');
      let noTypeBtns = 0;
      const noTypeButtonItems = [];
      btns.forEach(b => {
         if (this.isWidgetInjectedElement(b)) return;
         if (!b.hasAttribute('type')) {
           noTypeBtns++;
           addDetail(noTypeButtonItems, {
             elementId: this.trackIssueElement(b),
             selector: this.getElementSelector(b),
             text: this.getNodeText(b, 90) || '[no text]',
             type: '[missing]'
           });
         }
      });
      if (noTypeBtns > 0) {
        const summary = `${noTypeBtns} buttons missing type attribute`;
        techIssues.push(summary);
        technicalDetailGroups.push({
          key: 'button-type',
          summary,
          count: noTypeBtns,
          items: noTypeButtonItems
        });
      }

      if (techIssues.length > 0) {
        result.categories.technical.issues = techIssues;
        result.categories.technical.detailGroups = technicalDetailGroups;
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

      this.container.setAttribute('data-plw-widget-root', 'true');
      this.activeHighlightGroupKey = null;

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
                    <button class="panel-tab" data-tab="links">Project Links</button>
                    <button class="panel-tab" data-tab="qa">Checklist</button>
                </div>
             </div>

             <!-- Audit Tab Content -->
             <div id="plw-panel-content" class="panel-content tab-content active" data-tab="audit">
                <!-- Results go here -->
             </div>

             <!-- Project Links Tab Content (Iframe) -->
             <div id="plw-links-content" class="panel-content tab-content" data-tab="links">
                ${this.config.projectId
                    ? `<iframe src="${this.config.baseUrl}/embed?projectId=${this.config.projectId || ''}&theme=${this.config.theme}&mode=links" style="width: 100%; height: 100%; border: none; min-height: 400px; display: block;"></iframe>`
                    : `<div style="padding: 20px; color: #a1a1aa; text-align: center; font-size: 13px; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                         <div style="margin-bottom: 8px;">No Project ID provided.</div>
                         <div style="font-size: 11px; opacity: 0.7;">Add <code>data-project-id="..."</code> to your script tag.</div>
                       </div>`
                }
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
                 height: 100%;
                 flex: 1 1 auto;
                 min-height: 0;
                 overflow-y: auto;
                 overflow-x: hidden;
                 -webkit-overflow-scrolling: touch;
                 overscroll-behavior: contain;
             }
             
             .tab-content.active {
                 display: block;
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
                height: 85vh;
                max-height: 85vh;
                background: #09090b;
                border: 1px solid #27272a;
                border-right: none;
                border-radius: 12px 0 0 12px;
                box-shadow: -10px 0 30px rgba(0,0,0,0.5);
                display: flex;
                flex-direction: column;
                overflow: hidden;
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
                min-height: 0;
                overflow: auto;
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
             .category-row.toggleable { cursor: pointer; user-select: none; }
             .category-row.toggleable:hover { background: #1f1f23; }
             .category-row.toggleable:focus-visible { outline: 1px solid #3f3f46; outline-offset: -1px; }
             .cat-expander { font-size: 11px; color: #a1a1aa; transition: transform 0.2s ease; margin-left: 4px; }
             .category-row[aria-expanded="true"] .cat-expander { transform: rotate(180deg); }
             .cat-details { background: #0c0c0c; }
             .cat-details.collapsed { display: none; }
             .detail-item code {
                font-size: 12px;
                color: #d4d4d8;
                background: #18181b;
                border: 1px solid #27272a;
                border-radius: 4px;
                padding: 1px 4px;
             }
             .tech-issue-group {
                margin: 6px 0;
                border: 1px solid #27272a;
                border-radius: 6px;
                overflow: hidden;
                background: #111114;
             }
             .tech-issue-group summary {
                list-style: none;
                cursor: pointer;
                padding: 10px 12px;
                font-size: 13px;
                font-weight: 500;
                color: #e4e4e7;
                line-height: 1.35;
             }
             .tech-issue-group summary::-webkit-details-marker { display: none; }
             .tech-issue-group[open] summary { border-bottom: 1px solid #27272a; background: #17171b; }
             .tech-issue-content { padding: 8px 12px 12px; }
             .tech-issue-list .detail-item {
                font-size: 12px;
                color: #d4d4d8 !important;
                word-break: break-word;
             }
             .tech-item-row {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 8px;
             }
             .tech-issue-actions {
                margin-top: 10px;
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
             }
             .category-issue-actions {
                margin: 0 0 10px;
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
             }
             .clickable-issue-item {
                cursor: pointer;
                border-radius: 6px;
                padding: 6px 8px;
                margin: 0 0 2px -8px;
                transition: background 0.15s ease;
             }
             .clickable-issue-item:hover {
                background: #15151a;
             }
             .clickable-issue-item.is-focused {
                background: rgba(245, 158, 11, 0.18);
             }
             .highlight-group-btn,
             .copy-mcp-prompt-btn {
                border: 1px solid #333;
                background: #171717;
                color: #f4f4f5;
                font-size: 11px;
                font-family: 'Funnel Sans', sans-serif;
                padding: 6px 10px;
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.15s ease;
                white-space: nowrap;
             }
             .highlight-group-btn:hover,
             .copy-mcp-prompt-btn:hover { background: #222; border-color: #4a4a4f; }
             .highlight-group-btn.is-active {
                background: #f59e0b;
                border-color: #f59e0b;
                color: #111827;
             }
             .highlight-group-btn.is-active:hover {
                background: #fbbf24;
                border-color: #fbbf24;
             }
             .highlight-group-btn:disabled,
             .copy-mcp-prompt-btn:disabled {
                opacity: 0.45;
                cursor: not-allowed;
             }
             .plw-issue-highlight {
                outline: 3px solid #f59e0b !important;
                outline-offset: 2px !important;
                box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.22) !important;
                transition: outline-color 0.2s ease, box-shadow 0.2s ease;
             }
             .plw-issue-highlight-focus {
                animation: plw-highlight-pulse 1.4s ease;
             }
             @keyframes plw-highlight-pulse {
                0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); }
                80% { box-shadow: 0 0 0 8px rgba(245, 158, 11, 0); }
                100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
             }
             
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
       if (!badge || !panel || !closeBtn) return;
       
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
       ContentQualityAuditor.clearIssueHighlights();
       this.activeHighlightGroupKey = null;
       
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
       const esc = (value) => ContentQualityAuditor.escapeHtml(value);
       const rowKey = (name) => `cat-${name.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}`;
       const renderRow = (icon, name, statusObj, detailsHtml = '') => {
           let statusColor = statusObj.status === 'passed' ? '#10b981' : statusObj.status === 'warning' ? '#f59e0b' : '#ef4444';
           let statusText = statusObj.status === 'passed' ? '✓ Passed' : 'Issues Found';
           const hasDetails = Boolean(detailsHtml && detailsHtml.trim());
           const key = rowKey(name);
           
           return `
             <div class="category-row ${hasDetails ? 'toggleable' : ''}" ${hasDetails ? `role="button" tabindex="0" aria-expanded="false" data-toggle-target="${key}"` : ''}>
               <span class="cat-icon">${icon}</span>
               <span class="cat-name">${name}</span>
               <span class="cat-status" style="color: ${statusColor}">${statusText}</span>
               ${hasDetails ? `<span class="cat-expander">▾</span>` : ''}
             </div>
             ${hasDetails ? `<div class="cat-details collapsed" data-details-key="${key}" style="display: none;">${detailsHtml}</div>` : ''}
           `;
       };

       const renderInteractiveDetails = (groupKey, items, itemRenderer, maxVisible = 12) => {
         const detailItems = Array.isArray(items) ? items : [];
         if (detailItems.length === 0) return '';

         const visibleItems = detailItems.slice(0, maxVisible);
         const hiddenCount = Math.max(0, detailItems.length - visibleItems.length);
         const groupIds = detailItems.map((item) => item.elementId).filter(Boolean);
         const encodedGroupIds = encodeURIComponent(groupIds.join(','));

         const actionButton = groupIds.length > 0
           ? `<div class="category-issue-actions"><button type="button" class="highlight-group-btn" data-highlight-group="${esc(groupKey)}" data-highlight-ids="${encodedGroupIds}" aria-pressed="false">Highlight</button></div>`
           : '';

         const listItems = visibleItems.map((item) => {
           const itemIds = item.elementId ? encodeURIComponent(item.elementId) : '';
           const className = itemIds ? 'detail-item clickable-issue-item' : 'detail-item';
           const dataAttr = itemIds ? ` data-highlight-ids="${itemIds}"` : '';
           return `<div class="${className}"${dataAttr}>• ${itemRenderer(item)}</div>`;
         }).join('');

         const moreLabel = hiddenCount > 0 ? `<div class="detail-item">+ ${hiddenCount} more</div>` : '';
         return `${actionButton}${listItems}${moreLabel}`;
       };
       
       // Placeholders
       const ph = result.categories.placeholders;
       let phDetails = '';
       if (Array.isArray(ph.detailItems) && ph.detailItems.length > 0) {
           phDetails = renderInteractiveDetails(
             'placeholders',
             ph.detailItems,
             (item) => `${esc(item.label || 'Placeholder')} · <code>${esc(item.selector || 'unknown')}</code> · "${esc(item.match || '[match]')}"`,
             14
           );
       } else if (ph.issues.length > 0) {
           phDetails = ph.issues.map(i => `<div class="detail-item">• ${esc(i.type)}</div>`).join('');
       }
       html += renderRow('🔴', 'Placeholders', ph, phDetails);
       
       // Spelling
       const sp = result.categories.spelling;
       let spDetails = '';
       if (Array.isArray(sp.detailItems) && sp.detailItems.length > 0) {
           spDetails = renderInteractiveDetails(
             'spelling',
             sp.detailItems,
             (item) => `"${esc(item.label || item.match || '[word]')}" · <code>${esc(item.selector || 'unknown')}</code>`,
             14
           );
       } else if (sp.issues.length > 0) {
           spDetails = sp.issues
             .slice(0, 5)
             .map(i => `<div class="detail-item">• "${esc(i.word)}"</div>`)
             .join('');
           if (sp.issues.length > 5) {
             spDetails += `<div class="detail-item">+ ${sp.issues.length - 5} more</div>`;
           }
       }
       html += renderRow('🔤', 'Spelling', sp, spDetails);
       
       // SEO & Meta
       const seo = result.categories.seo;
       let seoDetails = '';
       if (Array.isArray(seo.detailItems) && seo.detailItems.length > 0) {
           seoDetails = renderInteractiveDetails(
             'seo',
             seo.detailItems,
             (item) => `${esc(item.label || 'SEO issue')} · <code>${esc(item.selector || 'unknown')}</code>`,
             14
           );
       } else if (seo.issues.length > 0) {
           seoDetails = seo.issues.map(i => `<div class="detail-item">• ${esc(i)}</div>`).join('');
       }
       html += renderRow('🔍', 'SEO & Meta', seo, seoDetails);
       
       // Technical Health
       const tech = result.categories.technical;
       let techDetails = '';
       if (tech.issues.length > 0) {
           const detailGroups = Array.isArray(tech.detailGroups) ? tech.detailGroups : [];
           const renderTechnicalItem = (groupKey, item) => {
             if (groupKey === 'empty-links') {
               return `<div class="tech-item-row"><span><code>${esc(item.selector || 'unknown')}</code> · text: "${esc(item.text || '[no text]')}" · href: <code>${esc(item.href || '[missing]')}</code></span></div>`;
             }
             if (groupKey === 'unsafe-links') {
               return `<div class="tech-item-row"><span><code>${esc(item.selector || 'unknown')}</code> · href: <code>${esc(item.href || '[missing]')}</code> · rel: <code>${esc(item.rel || '[missing]')}</code></span></div>`;
             }
             if (groupKey === 'http-links') {
               return `<div class="tech-item-row"><span><code>${esc(item.selector || 'unknown')}</code> · href: <code>${esc(item.href || '[missing]')}</code></span></div>`;
             }
             if (groupKey === 'cls-images') {
               return `<div class="tech-item-row"><span><code>${esc(item.selector || 'unknown')}</code> · src: <code>${esc(item.src || '[missing]')}</code> · width: <code>${esc(item.widthAttr || '[missing]')}</code> · height: <code>${esc(item.heightAttr || '[missing]')}</code></span></div>`;
             }
             if (groupKey === 'button-type') {
               return `<div class="tech-item-row"><span><code>${esc(item.selector || 'unknown')}</code> · text: "${esc(item.text || '[no text]')}"</span></div>`;
             }
             return `<div class="tech-item-row"><span>${esc(JSON.stringify(item || {}))}</span></div>`;
           };

           if (detailGroups.length > 0) {
             techDetails = detailGroups.map((group, idx) => {
               const items = Array.isArray(group.items) ? group.items : [];
               const count = typeof group.count === 'number' ? group.count : items.length;
               const visible = items.slice(0, 12);
               const highlightIds = items.map((item) => item.elementId).filter(Boolean);
               const encodedHighlightIds = encodeURIComponent(highlightIds.join(','));
               const hiddenCount = Math.max(0, count - visible.length);
               const prompt = ContentQualityAuditor.buildWebflowMcpPrompt(
                 group.key,
                 window.location.href,
                 items,
                 count
               );
               const encodedPrompt = encodeURIComponent(prompt);

               return `
                 <details class="tech-issue-group">
                    <summary>${esc(group.summary || `Issue ${idx + 1}`)}</summary>
                    <div class="tech-issue-content">
                      <div class="tech-issue-list">
                        ${visible.length > 0 ? visible.map(item => {
                          const itemIds = item.elementId ? encodeURIComponent(item.elementId) : '';
                          const className = itemIds ? 'detail-item clickable-issue-item' : 'detail-item';
                          const attr = itemIds ? ` data-highlight-ids="${itemIds}"` : '';
                          return `<div class="${className}"${attr}>• ${renderTechnicalItem(group.key, item)}</div>`;
                        }).join('') : '<div class="detail-item">No element details captured.</div>'}
                        ${hiddenCount > 0 ? `<div class="detail-item">+ ${hiddenCount} more affected elements</div>` : ''}
                      </div>
                      <div class="tech-issue-actions">
                        <button type="button" class="highlight-group-btn" data-highlight-group="${esc(`technical-${group.key || `group-${idx + 1}`}`)}" data-highlight-ids="${encodedHighlightIds}" aria-pressed="false" ${highlightIds.length === 0 ? 'disabled' : ''}>Highlight</button>
                        <button type="button" class="copy-mcp-prompt-btn" data-copy-prompt="${encodedPrompt}">Copy Webflow MCP Prompt</button>
                      </div>
                    </div>
                 </details>
               `;
             }).join('');
           } else {
             techDetails = tech.issues.map(i => `<div class="detail-item">• ${esc(i)}</div>`).join('');
           }
       }
       html += renderRow('⚙️', 'Technical Health', tech, techDetails);
       
       html += `</div>`; // Close list
       
       content.innerHTML = html;

       // Toggle category detail blocks
       const toggleRows = content.querySelectorAll('.category-row.toggleable[data-toggle-target]');
       toggleRows.forEach((row) => {
         const toggle = () => {
           const key = row.getAttribute('data-toggle-target');
           if (!key) return;
           const details = content.querySelector(`.cat-details[data-details-key="${key}"]`);
           if (!details) return;

           const isExpanded = row.getAttribute('aria-expanded') === 'true';
           row.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
           details.style.display = isExpanded ? 'none' : 'block';
           details.classList.toggle('collapsed', isExpanded);
         };

         row.addEventListener('click', toggle);
         row.addEventListener('keydown', (event) => {
           if (event.key === 'Enter' || event.key === ' ') {
             event.preventDefault();
             toggle();
           }
         });
       });

       // Copy MCP prompts from technical issue blocks
       const copyButtons = content.querySelectorAll('.copy-mcp-prompt-btn[data-copy-prompt]');
       const highlightGroupButtons = content.querySelectorAll('.highlight-group-btn[data-highlight-ids]');
       const clickableIssueItems = content.querySelectorAll('.clickable-issue-item[data-highlight-ids]');
       const copyToClipboard = async (text) => {
         if (navigator.clipboard && navigator.clipboard.writeText) {
           await navigator.clipboard.writeText(text);
           return;
         }
         const input = document.createElement('textarea');
         input.value = text;
         input.style.position = 'fixed';
         input.style.opacity = '0';
         document.body.appendChild(input);
         input.focus();
         input.select();
         document.execCommand('copy');
         document.body.removeChild(input);
       };
       const flashButtonText = (button, nextText) => {
         const originalText = button.textContent;
         button.textContent = nextText;
         setTimeout(() => {
           button.textContent = originalText;
         }, 1400);
       };
       const setGroupHighlightButtonState = (button, isActive, count = 0) => {
         button.classList.toggle('is-active', isActive);
         button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
         button.textContent = isActive ? `Highlighted (${count})` : 'Highlight';
       };
       const clearGroupHighlightState = () => {
         highlightGroupButtons.forEach((btn) => setGroupHighlightButtonState(btn, false));
         this.activeHighlightGroupKey = null;
       };

       copyButtons.forEach((button) => {
         button.addEventListener('click', async (event) => {
           event.preventDefault();
           event.stopPropagation();
           const encoded = button.getAttribute('data-copy-prompt') || '';
           const prompt = encoded ? decodeURIComponent(encoded) : '';
           if (!prompt) return;

           try {
             await copyToClipboard(prompt);
             flashButtonText(button, 'Copied');
           } catch (e) {
             flashButtonText(button, 'Copy Failed');
           }
         });
       });

       highlightGroupButtons.forEach((button) => {
         setGroupHighlightButtonState(button, false);
         button.addEventListener('click', (event) => {
           event.preventDefault();
           event.stopPropagation();
           const groupKey = button.getAttribute('data-highlight-group') || '';
           const encodedIds = button.getAttribute('data-highlight-ids') || '';
           const ids = encodedIds ? decodeURIComponent(encodedIds).split(',').filter(Boolean) : [];
           if (ids.length === 0) {
             flashButtonText(button, 'No Match');
             return;
           }

           const isAlreadyActive = this.activeHighlightGroupKey === groupKey && button.classList.contains('is-active');
           if (isAlreadyActive) {
             ContentQualityAuditor.clearIssueHighlights();
             clearGroupHighlightState();
             return;
           }

           clearGroupHighlightState();
           const highlighted = ContentQualityAuditor.highlightIssueElementsByIds(ids, { scroll: true });
           if (highlighted > 0) {
             this.activeHighlightGroupKey = groupKey;
             setGroupHighlightButtonState(button, true, highlighted);
           } else {
             this.activeHighlightGroupKey = null;
             flashButtonText(button, 'No Match');
           }
         });
       });

       clickableIssueItems.forEach((item) => {
         item.addEventListener('click', (event) => {
           event.preventDefault();
           event.stopPropagation();
           const encodedIds = item.getAttribute('data-highlight-ids') || '';
           const ids = encodedIds ? decodeURIComponent(encodedIds).split(',').filter(Boolean) : [];
           if (ids.length === 0) return;

           clearGroupHighlightState();
           const highlighted = ContentQualityAuditor.highlightIssueElementsByIds(ids, { scroll: true });
           if (highlighted > 0) {
             clickableIssueItems.forEach((node) => node.classList.remove('is-focused'));
             item.classList.add('is-focused');
             setTimeout(() => item.classList.remove('is-focused'), 1200);
           }
         });
       });
    }

    renderDropdown(data) {
      // Filter out auto-discovered links (sitemap links)
      const allLinks = data.links || [];
      const links = allLinks.filter(link => link.source !== 'auto'); // Only manual links

      if (links.length === 0 && !this.config.projectId) return;

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
               ${this.config.projectId ? `
                 <button class="header-manage-btn" id="plw-manage-links-btn" type="button">
                   Manage
                 </button>
               ` : ''}
            </div>
            ${links.length > 0
              ? links
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
              .join("")
              : `<div class="dropdown-empty-state">No links yet. Use Manage to add your first link.</div>`
            }
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
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          
          .header-title {
            font-size: 11px; 
            text-transform: uppercase; 
            letter-spacing: 0.05em; 
            color: #888; 
            font-family: 'Funnel Display', sans-serif;
          }

          .header-manage-btn {
            border: 1px solid #2f2f2f;
            background: #111;
            color: #b4b4b8;
            font-size: 10px;
            line-height: 1;
            padding: 4px 8px;
            border-radius: 999px;
            cursor: pointer;
            font-family: 'Funnel Sans', sans-serif;
            transition: all 0.15s ease;
          }

          .header-manage-btn:hover {
            color: #ffffff;
            border-color: #4a4a4f;
            background: #18181b;
          }

          .dropdown-empty-state {
            padding: 14px 16px;
            color: #888;
            font-size: 12px;
            border-bottom: 1px solid #111;
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

          .category-row.toggleable {
             cursor: pointer;
             user-select: none;
          }

          .category-row.toggleable:hover {
             background: #1f1f23;
          }

          .category-row.toggleable:focus-visible {
             outline: 1px solid #3f3f46;
             outline-offset: -1px;
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

          .cat-expander {
             font-size: 11px;
             color: #a1a1aa;
             transition: transform 0.2s ease;
             margin-left: 4px;
          }

          .category-row[aria-expanded="true"] .cat-expander {
             transform: rotate(180deg);
          }

          .cat-details {
             background: #0c0c0c;
             padding: 8px 14px 8px 40px;
             border-bottom: 1px solid #27272a;
          }

          .cat-details.collapsed {
             display: none;
          }

          .detail-item {
             font-size: 13px; /* Bump size slightly */
             color: #e4e4e7 !important; /* Lighter gray and enforced */
             padding: 4px 0;
             line-height: 1.4;
          }

          .detail-item code {
             font-size: 12px;
             color: #d4d4d8;
             background: #18181b;
             border: 1px solid #27272a;
             border-radius: 4px;
             padding: 1px 4px;
          }

          .tech-issue-group {
             margin: 6px 0;
             border: 1px solid #27272a;
             border-radius: 6px;
             overflow: hidden;
             background: #111114;
          }

          .tech-issue-group summary {
             list-style: none;
             cursor: pointer;
             padding: 10px 12px;
             font-size: 13px;
             font-weight: 500;
             color: #e4e4e7;
             line-height: 1.35;
          }

          .tech-issue-group summary::-webkit-details-marker {
             display: none;
          }

          .tech-issue-group[open] summary {
             border-bottom: 1px solid #27272a;
             background: #17171b;
          }

          .tech-issue-content {
             padding: 8px 12px 12px;
          }

          .tech-issue-list .detail-item {
             font-size: 12px;
             color: #d4d4d8 !important;
             word-break: break-word;
          }

          .tech-item-row {
             display: flex;
             align-items: flex-start;
             justify-content: space-between;
             gap: 8px;
          }

          .tech-issue-actions {
             margin-top: 10px;
             display: flex;
             flex-wrap: wrap;
             gap: 8px;
          }

          .category-issue-actions {
             margin: 0 0 10px;
             display: flex;
             flex-wrap: wrap;
             gap: 8px;
          }

          .clickable-issue-item {
             cursor: pointer;
             border-radius: 6px;
             padding: 6px 8px;
             margin: 0 0 2px -8px;
             transition: background 0.15s ease;
          }

          .clickable-issue-item:hover {
             background: #15151a;
          }

          .clickable-issue-item.is-focused {
             background: rgba(245, 158, 11, 0.18);
          }

          .highlight-group-btn,
          .copy-mcp-prompt-btn {
             border: 1px solid #333;
             background: #171717;
             color: #f4f4f5;
             font-size: 11px;
             font-family: 'Funnel Sans', sans-serif;
             padding: 6px 10px;
             border-radius: 6px;
             cursor: pointer;
             transition: all 0.15s ease;
             white-space: nowrap;
          }

          .highlight-group-btn:hover,
          .copy-mcp-prompt-btn:hover {
             background: #222;
             border-color: #4a4a4f;
          }

          .highlight-group-btn.is-active {
             background: #f59e0b;
             border-color: #f59e0b;
             color: #111827;
          }

          .highlight-group-btn.is-active:hover {
             background: #fbbf24;
             border-color: #fbbf24;
          }

          .highlight-group-btn:disabled,
          .copy-mcp-prompt-btn:disabled {
             opacity: 0.45;
             cursor: not-allowed;
          }

          .plw-issue-highlight {
             outline: 3px solid #f59e0b !important;
             outline-offset: 2px !important;
             box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.22) !important;
             transition: outline-color 0.2s ease, box-shadow 0.2s ease;
          }

          .plw-issue-highlight-focus {
             animation: plw-highlight-pulse 1.4s ease;
          }

          @keyframes plw-highlight-pulse {
             0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); }
             80% { box-shadow: 0 0 0 8px rgba(245, 158, 11, 0); }
             100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
          }
        </style>
      `;

      // Setup click listeners
      this.setupHandlers();
    }

    setupHandlers() {
       const btn = this.container.querySelector('#plw-trigger-btn');
       const checklistBtn = this.container.querySelector('#plw-checklist-btn');
       const manageLinksBtn = this.container.querySelector('#plw-manage-links-btn');
       const content = this.container.querySelector('#plw-content');
       const chevron = this.container.querySelector('#plw-chevron');

       const toggleMenu = (e) => {
         if (!content) return;
         e.stopPropagation();
         const isHidden = content.style.display === 'none';
         content.style.display = isHidden ? 'block' : 'none';
         if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
       };

       const openStandalonePanel = (tabId) => {
         const panel = document.getElementById('plw-standalone-panel');
         const badge = document.getElementById('plw-audit-badge');
         if (!panel) return;

         panel.classList.add('open');
         if (badge) {
           badge.style.opacity = '0';
           badge.style.pointerEvents = 'none';
         }

         const targetTab = panel.querySelector(`.panel-tab[data-tab="${tabId}"]`);
         if (targetTab) targetTab.click();
       };

       if (checklistBtn) {
         checklistBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (content) content.style.display = 'none';
            if (chevron) chevron.style.transform = 'rotate(0deg)';
            openStandalonePanel('qa');
         });
       }

       if (manageLinksBtn) {
         manageLinksBtn.addEventListener('click', (e) => {
           e.stopPropagation();
           if (content) content.style.display = 'none';
           if (chevron) chevron.style.transform = 'rotate(0deg)';
           openStandalonePanel('links');
         });
       }

       const closeMenu = (e) => {
         if (!content) return;
         // Don't close if clicking inside container or if clicking the audit badge/panel
         if (this.container.contains(e.target)) return;
         
         const auditBadge = document.getElementById('plw-audit-badge');
         const auditPanel = document.getElementById('plw-standalone-panel');
         
         if (auditBadge && auditBadge.contains(e.target)) return;
         if (auditPanel && auditPanel.contains(e.target)) return;

         content.style.display = 'none';
         if (chevron) chevron.style.transform = 'rotate(0deg)';
       };

       if (btn && content) {
         btn.addEventListener('click', toggleMenu);
       }
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
