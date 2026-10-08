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
         result.categories.spelling.status = 'info';
         result.categories.spelling.score = 100;
         result.categories.spelling.skippedReason = options.spellcheckReason || 'Disabled';
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
         result.categories.spelling.skippedReason = 'High Volume Folder';
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

  // ========================================
  // Page-level styles + Webflow badge
  // ========================================
  // The widget itself lives in a shadow root, so the site's CSS can't reach it.
  // These few rules have to sit on the page: the typo highlight, the issue
  // outline, and hiding the "Made in Webflow" badge. Webflow re-appends the
  // badge 500ms after load and on fullscreen changes, so CSS hides it and an
  // observer removes it whenever it comes back.
  function injectPageStyles() {
    if (document.getElementById('plw-page-styles')) return;
    const style = document.createElement('style');
    style.id = 'plw-page-styles';
    style.textContent = `
      html body .w-webflow-badge,
      html body a.w-webflow-badge[href] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      ::highlight(plw-typo) {
        text-decoration: underline wavy #ef4444;
        text-decoration-thickness: 2px;
        background-color: rgba(239, 68, 68, 0.15);
        color: unset;
      }
      .plw-issue-highlight {
        outline: 3px solid #f59e0b !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.22) !important;
        transition: outline-color 0.2s ease, box-shadow 0.2s ease;
      }
      .plw-issue-highlight-focus { animation: plw-highlight-pulse 1.4s ease; }
      @keyframes plw-highlight-pulse {
        0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); }
        80% { box-shadow: 0 0 0 8px rgba(245, 158, 11, 0); }
        100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  let webflowBadgeObserver = null;
  function removeWebflowBadge() {
    injectPageStyles();
    const strip = () => document.querySelectorAll('.w-webflow-badge').forEach((node) => node.remove());
    strip();
    if (webflowBadgeObserver || !document.body) return;
    webflowBadgeObserver = new MutationObserver(strip);
    webflowBadgeObserver.observe(document.body, { childList: true });
  }

  // Runs as soon as the script loads, before the project is fetched, so the
  // badge never flashes.
  injectPageStyles();

  // ========================================
  // Widget UI helpers
  // ========================================
  const ICON_PATHS = {
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    external: '<path d="M7 17 17 7M8 7h9v9"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    chevronUp: '<path d="m18 15-6-6-6 6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
    minimize: '<path d="M5 12h14"/>',
    listCheck: '<path d="m3 7 2 2 4-4"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8M13 12h8M13 18h8"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/>',
  };

  function icon(name, size = 16, strokeWidth = 2) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
  }

  function escapeHtml(value) {
    return ContentQualityAuditor.escapeHtml(value);
  }

  // Only let real destinations through; a javascript: URL in a link title
  // field must not become a clickable link on a client's site.
  function safeUrl(url) {
    try {
      const parsed = new URL(String(url || ''), window.location.href);
      return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol) ? parsed.href : '#';
    } catch (e) {
      return '#';
    }
  }

  function normalizeForCompare(url) {
    try {
      const parsed = new URL(url, window.location.href);
      return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.replace(/\/+$/, '')}`;
    } catch (e) {
      return '';
    }
  }

  const LINK_KINDS = [
    { test: (h) => /(^|\.)figma\.com$/.test(h), tint: '#a259ff' },
    { test: (h) => /(^|\.)webflow\.(io|com)$/.test(h), tint: '#5b6cff' },
    { test: (h) => /(^|\.)framer\.(website|com|app|ai)$/.test(h), tint: '#3b9eff' },
    { test: (h, p) => h === 'docs.google.com' && p.startsWith('/spreadsheets'), tint: '#22a565' },
    { test: (h, p) => h === 'docs.google.com' && p.startsWith('/presentation'), tint: '#f4b400' },
    { test: (h) => h === 'docs.google.com', tint: '#4c8bf5' },
    { test: (h) => h === 'drive.google.com', tint: '#f4b400' },
    { test: (h) => /(^|\.)notion\.(so|site)$/.test(h), tint: '#a1a1aa' },
    { test: (h) => /(^|\.)loom\.com$/.test(h), tint: '#7b6cff' },
    { test: (h) => /(^|\.)clickup\.com$/.test(h), tint: '#8b7bff' },
    { test: (h) => /(^|\.)miro\.com$/.test(h), tint: '#f5c518' },
    { test: (h) => /(^|\.)slack\.com$/.test(h), tint: '#e0457b' },
  ];

  function describeLink(url) {
    let host = '';
    let path = '';
    try {
      const parsed = new URL(url, window.location.href);
      host = parsed.hostname.replace(/^www\./, '');
      path = parsed.pathname.replace(/\/+$/, '');
    } catch (e) { /* not a URL */ }
    const kind = LINK_KINDS.find((k) => k.test(host, path));
    return {
      host,
      display: host ? `${host}${path && path.length < 40 ? path : ''}` : String(url || ''),
      tint: kind ? kind.tint : '#a1a1aa',
    };
  }

  function siteLabel(hostname) {
    if (hostname.endsWith('.webflow.io')) return 'Staging';
    if (hostname.endsWith('.framer.website')) return 'Preview';
    if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) return 'Local';
    return 'Site';
  }

  function readSession(key) {
    try { return window.sessionStorage.getItem(key); } catch (e) { return null; }
  }

  function writeSession(key, value) {
    try { window.sessionStorage.setItem(key, value); } catch (e) { /* storage blocked */ }
  }

  function ringMarkup(size) {
    return `
      <span class="ring" data-ring data-tone="loading" style="--size:${size}px">
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <circle class="ring-track" cx="18" cy="18" r="15.9155"/>
          <circle class="ring-arc" data-ring-arc cx="18" cy="18" r="15.9155" pathLength="100" stroke-dasharray="0 100"/>
        </svg>
        <span class="ring-score" data-ring-score>–</span>
      </span>`;
  }

  function scoreTone(result) {
    if (!result.canDeploy) return 'bad';
    if (result.overallScore >= 90) return 'good';
    if (result.overallScore >= 50) return 'warn';
    return 'bad';
  }

  const WIDGET_STYLES = `
    :host { all: initial; }
    .plw {
      --bg: #0c0c0e; --bg-2: #151518; --bg-3: #1e1e22;
      --line: rgba(255,255,255,.07); --line-2: rgba(255,255,255,.13);
      --text: #f4f4f5; --muted: #a1a1aa; --faint: #71717a;
      --good: #22c55e; --warn: #f59e0b; --bad: #ef4444; --info: #60a5fa;
      --shadow: 0 24px 64px -16px rgba(0,0,0,.6), 0 8px 24px -8px rgba(0,0,0,.45);
      --display: 'Funnel Display', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
      font-family: 'Funnel Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
      font-size: 14px; line-height: 1.4; color: var(--text);
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    .plw[data-theme="light"] {
      --bg: #ffffff; --bg-2: #f5f5f6; --bg-3: #ebebee;
      --line: rgba(0,0,0,.07); --line-2: rgba(0,0,0,.12);
      --text: #18181b; --muted: #52525b; --faint: #8a8a93;
      --shadow: 0 24px 64px -16px rgba(0,0,0,.2), 0 8px 24px -8px rgba(0,0,0,.12);
    }
    *, *::before, *::after { box-sizing: border-box; }
    button { font: inherit; color: inherit; margin: 0; }
    a { color: inherit; }
    [hidden] { display: none !important; }

    /* Launcher */
    .launcher {
      position: fixed; right: 20px; bottom: 20px;
      display: inline-flex; align-items: center; gap: 10px;
      height: 46px; padding: 0 14px 0 9px; max-width: calc(100vw - 40px);
      border-radius: 999px; border: 1px solid var(--line-2);
      background: var(--bg); color: var(--text); box-shadow: var(--shadow);
      cursor: pointer; user-select: none;
      transition: transform .2s cubic-bezier(.2,.8,.2,1), padding .2s, width .2s, border-color .2s;
    }
    .launcher:hover { transform: translateY(-1px); border-color: rgba(255,255,255,.2); }
    .plw[data-theme="light"] .launcher:hover { border-color: rgba(0,0,0,.2); }
    .launcher:active { transform: scale(.97); }
    .launcher:focus-visible, .tab:focus-visible, .icon-btn:focus-visible, .link:focus-visible,
    .cat-row:focus-visible, .btn:focus-visible, .text-btn:focus-visible {
      outline: 2px solid var(--info); outline-offset: 2px;
    }
    .lead { display: inline-flex; }
    .launcher-label {
      font-family: var(--display); font-weight: 500; font-size: 14px; letter-spacing: -.005em;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;
    }
    .launcher-chip {
      display: inline-flex; align-items: center; gap: 5px;
      height: 22px; padding: 0 8px; border-radius: 999px;
      background: var(--bg-3); color: var(--muted);
      font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap;
    }
    .launcher-chip svg { color: var(--good); }
    .chev { display: inline-flex; color: var(--faint); transition: transform .25s cubic-bezier(.2,.8,.2,1); }
    .plw[data-open="true"] .chev { transform: rotate(180deg); }
    .plw[data-minimized="true"] .launcher { width: 46px; padding: 0; justify-content: center; }
    .plw[data-minimized="true"] .launcher > :not(.lead) { display: none; }
    .plw[data-blocked="true"] .launcher { border-color: rgba(239,68,68,.6); animation: plw-pulse 2.2s infinite; }
    .plw[data-pos="left"] .launcher { right: auto; left: 20px; }

    .mark {
      width: 28px; height: 28px; border-radius: 50%;
      display: inline-grid; place-items: center; flex-shrink: 0;
      background: var(--bg-3); color: var(--text);
      font-family: var(--display); font-weight: 600; font-size: 13px;
    }
    .mark.lg { width: 34px; height: 34px; border-radius: 10px; font-size: 15px; }

    /* Score ring */
    .ring { position: relative; width: var(--size); height: var(--size); display: inline-grid; place-items: center; flex-shrink: 0; --c: var(--faint); }
    .ring svg { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
    .ring-track { fill: none; stroke: var(--line-2); stroke-width: 3.4; }
    .ring-arc { fill: none; stroke: var(--c); stroke-width: 3.4; stroke-linecap: round; transition: stroke .3s; }
    .ring-score {
      position: relative; font-family: var(--display); font-weight: 600; line-height: 1;
      font-size: calc(var(--size) * .38); font-variant-numeric: tabular-nums; color: var(--text);
    }
    .ring[data-tone="good"] { --c: var(--good); }
    .ring[data-tone="warn"] { --c: var(--warn); }
    .ring[data-tone="bad"] { --c: var(--bad); }
    .ring[data-tone="loading"] { --c: var(--muted); }
    .ring[data-tone="loading"] svg { animation: plw-spin 1s linear infinite; }
    .ring[data-tone="loading"] .ring-arc { stroke-dasharray: 26 100; }
    .ring[data-tone="loading"] .ring-score { opacity: .45; }

    /* Panel */
    .panel {
      position: fixed; right: 20px; bottom: 78px;
      width: 392px; max-width: calc(100vw - 24px);
      /* Fixed height so the tabs don't jump when switching between short and long views */
      height: min(560px, calc(100vh - 104px));
      display: flex; flex-direction: column;
      background: var(--bg); border: 1px solid var(--line-2); border-radius: 18px;
      box-shadow: var(--shadow); overflow: hidden;
      opacity: 0; visibility: hidden; transform: translateY(10px) scale(.98); transform-origin: bottom right;
      transition: opacity .16s ease, transform .3s cubic-bezier(.16,1,.3,1), visibility 0s linear .3s;
    }
    .plw[data-open="true"] .panel {
      opacity: 1; visibility: visible; transform: none;
      transition: opacity .16s ease, transform .3s cubic-bezier(.16,1,.3,1), visibility 0s;
    }
    .plw[data-pos="left"] .panel { right: auto; left: 20px; transform-origin: bottom left; }

    .head { display: flex; align-items: center; gap: 12px; padding: 16px 12px 14px 16px; }
    .head-text { min-width: 0; flex: 1; }
    .title {
      font-family: var(--display); font-weight: 500; font-size: 16px; letter-spacing: -.01em;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .sub { display: flex; align-items: center; gap: 6px; margin-top: 2px; font-size: 12px; color: var(--faint); min-width: 0; }
    .sub span:last-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--good); flex-shrink: 0; box-shadow: 0 0 0 3px rgba(34,197,94,.18); }
    .head-actions { display: flex; gap: 2px; flex-shrink: 0; }
    .icon-btn {
      width: 32px; height: 32px; border-radius: 9px; border: 0;
      display: inline-grid; place-items: center; flex-shrink: 0;
      background: transparent; color: var(--faint); cursor: pointer; text-decoration: none;
      transition: background .15s, color .15s;
    }
    .icon-btn:hover { background: var(--bg-3); color: var(--text); }

    .tabs { display: flex; gap: 2px; margin: 0 16px 14px; padding: 3px; border-radius: 12px; background: var(--bg-2); border: 1px solid var(--line); }
    .tab {
      flex: 1; min-width: 0; height: 32px; padding: 0 8px; border: 0; border-radius: 9px;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      background: transparent; color: var(--muted); font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap;
      transition: background .15s, color .15s, box-shadow .15s;
    }
    .tab:hover { color: var(--text); }
    .tab[aria-selected="true"] { background: var(--bg-3); color: var(--text); box-shadow: inset 0 0 0 1px var(--line), 0 1px 2px rgba(0,0,0,.2); }
    .plw[data-theme="light"] .tab[aria-selected="true"] { background: var(--bg); }
    .tab-count { font-size: 11.5px; color: var(--faint); font-variant-numeric: tabular-nums; }
    .tab-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; background: var(--faint); }
    .tab-dot[data-tone="good"] { background: var(--good); }
    .tab-dot[data-tone="warn"] { background: var(--warn); }
    .tab-dot[data-tone="bad"] { background: var(--bad); }

    .views { position: relative; flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; border-top: 1px solid var(--line); scrollbar-width: thin; scrollbar-color: var(--line-2) transparent; }
    .view { display: none; padding: 8px; }
    .view[data-active="true"] { display: block; }

    .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px 8px 16px; border-top: 1px solid var(--line); font-size: 11.5px; color: var(--faint); }
    .foot strong { font-family: var(--display); font-weight: 500; color: var(--muted); }
    .text-btn { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; color: var(--faint); font-size: 11.5px; cursor: pointer; }
    .text-btn:hover { background: var(--bg-3); color: var(--text); }

    /* Links */
    .search { position: relative; margin: 4px 4px 6px; }
    .search svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--faint); pointer-events: none; }
    .search input {
      width: 100%; height: 38px; padding: 0 12px 0 34px; border-radius: 10px;
      border: 1px solid var(--line); background: var(--bg-2); color: var(--text);
      font: inherit; font-size: 13.5px; outline: none; transition: border-color .15s, box-shadow .15s;
    }
    .search input::placeholder { color: var(--faint); }
    .search input:focus { border-color: var(--line-2); box-shadow: 0 0 0 3px rgba(96,165,250,.22); }
    .link-row { position: relative; display: flex; align-items: center; border-radius: 12px; transition: background .12s; }
    .link-row:hover { background: var(--bg-2); }
    .link { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 12px; text-decoration: none; }
    .fav {
      width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
      display: inline-grid; place-items: center;
      font-family: var(--display); font-weight: 600; font-size: 15px; text-transform: uppercase;
      color: var(--tint); background: color-mix(in srgb, var(--tint) 15%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tint) 24%, transparent);
    }
    .link-text { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .link-title { display: flex; align-items: center; gap: 7px; min-width: 0; font-size: 14px; font-weight: 500; color: var(--text); }
    .link-title span:first-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .link-url { font-size: 12px; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .here { flex-shrink: 0; font-size: 10px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; padding: 2px 6px; border-radius: 999px; color: var(--good); background: rgba(34,197,94,.14); }
    .row-actions { display: flex; align-items: center; gap: 2px; padding-right: 8px; opacity: 0; transition: opacity .15s; }
    .link-row:hover .row-actions, .link-row:focus-within .row-actions { opacity: 1; }
    .row-actions .icon-btn { width: 30px; height: 30px; }
    .row-actions .icon-btn.is-done { color: var(--good); }
    @media (hover: none) { .row-actions { opacity: 1; } }

    .empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 40px 24px; color: var(--muted); font-size: 13px; }
    .empty-icon { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; background: var(--bg-2); color: var(--faint); margin-bottom: 6px; }
    .empty strong { color: var(--text); font-weight: 500; font-size: 14px; }

    /* Checklist */
    .cl-card { margin: 4px 4px 8px; padding: 16px; border-radius: 14px; background: var(--bg-2); border: 1px solid var(--line); }
    .cl-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .cl-big { font-family: var(--display); font-weight: 500; font-size: 28px; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
    .cl-big span { font-size: 15px; color: var(--faint); margin-left: 3px; }
    .cl-pct { font-size: 12.5px; color: var(--muted); }
    .bar { height: 6px; border-radius: 999px; background: var(--bg-3); overflow: hidden; }
    .bar > span { display: block; height: 100%; border-radius: inherit; background: var(--good); transition: width .6s cubic-bezier(.16,1,.3,1); }
    .cl-row { padding: 10px 12px; }
    .cl-row-top { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 7px; font-size: 13px; }
    .cl-row-top span:first-child { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cl-row-top span:last-child { color: var(--faint); font-variant-numeric: tabular-nums; }
    .cl-row .bar { height: 4px; }
    .cl-more { display: flex; justify-content: center; padding: 6px 0 4px; }
    .cl-frame { margin: 8px 4px 4px; border-radius: 12px; overflow: hidden; border: 1px solid var(--line); background: #fff; }
    .cl-frame iframe { display: block; width: 100%; height: 520px; border: 0; }

    /* Buttons */
    .btn {
      display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px;
      border-radius: 9px; border: 1px solid var(--line-2); background: var(--bg-2); color: var(--text);
      font-size: 12.5px; font-weight: 500; cursor: pointer; white-space: nowrap; transition: background .15s, border-color .15s;
    }
    .btn:hover { background: var(--bg-3); }
    .btn.is-active { background: var(--warn); border-color: var(--warn); color: #111; }
    .btn:disabled { opacity: .45; cursor: not-allowed; }

    /* Page check */
    .check-summary { display: flex; align-items: center; gap: 14px; margin: 4px 4px 8px; padding: 14px; border-radius: 14px; background: var(--bg-2); border: 1px solid var(--line); }
    .check-summary .head-text { flex: 1; }
    .verdict { font-family: var(--display); font-weight: 500; font-size: 16px; letter-spacing: -.01em; }
    .verdict-sub { margin-top: 2px; font-size: 12.5px; color: var(--muted); }
    .checking { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 48px 24px; color: var(--muted); font-size: 13px; }
    .cat + .cat { margin-top: 2px; }
    .cat-row {
      width: 100%; display: flex; align-items: center; gap: 12px; padding: 11px 10px;
      border: 0; border-radius: 12px; background: transparent; text-align: left; cursor: pointer; transition: background .12s;
      --c: var(--faint);
    }
    .cat-row:hover { background: var(--bg-2); }
    .cat-row[aria-disabled="true"] { cursor: default; }
    .cat-row[aria-disabled="true"]:hover { background: transparent; }
    .cat-row[data-tone="good"] { --c: var(--good); }
    .cat-row[data-tone="warn"] { --c: var(--warn); }
    .cat-row[data-tone="bad"] { --c: var(--bad); }
    .cat-row[data-tone="info"] { --c: var(--info); }
    .cat-dot { width: 8px; height: 8px; margin: 0 4px; border-radius: 50%; flex-shrink: 0; background: var(--c); box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 18%, transparent); }
    .cat-text { flex: 1; min-width: 0; }
    .cat-name { display: block; font-size: 14px; font-weight: 500; }
    .cat-hint { display: block; font-size: 12px; color: var(--faint); margin-top: 1px; }
    .cat-status { font-size: 12.5px; font-weight: 500; color: var(--c); white-space: nowrap; font-variant-numeric: tabular-nums; }
    .cat-chev { display: inline-flex; color: var(--faint); transition: transform .2s; }
    .cat-row[aria-expanded="true"] .cat-chev { transform: rotate(180deg); }
    .cat-details { padding: 2px 10px 12px 38px; }
    .detail-item { font-size: 12.5px; color: var(--muted); padding: 5px 0; line-height: 1.45; word-break: break-word; }
    .detail-item code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; color: var(--text); background: var(--bg-3); border-radius: 5px; padding: 1px 5px; }
    .clickable-issue-item { cursor: pointer; border-radius: 8px; padding: 6px 8px; margin: 0 0 2px -8px; transition: background .12s; }
    .clickable-issue-item:hover { background: var(--bg-2); }
    .clickable-issue-item.is-focused { background: rgba(245,158,11,.18); }
    .issue-actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 8px; }
    .tech-issue-group { margin: 6px 0; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--bg-2); }
    .tech-issue-group summary { list-style: none; cursor: pointer; padding: 10px 12px; font-size: 13px; font-weight: 500; color: var(--text); }
    .tech-issue-group summary::-webkit-details-marker { display: none; }
    .tech-issue-group[open] summary { border-bottom: 1px solid var(--line); }
    .tech-issue-content { padding: 8px 12px 12px; }
    .tech-issue-content .issue-actions { margin: 10px 0 0; }

    @keyframes plw-spin { to { transform: rotate(270deg); } from { transform: rotate(-90deg); } }
    @keyframes plw-pulse {
      0% { box-shadow: var(--shadow), 0 0 0 0 rgba(239,68,68,.45); }
      70% { box-shadow: var(--shadow), 0 0 0 10px rgba(239,68,68,0); }
      100% { box-shadow: var(--shadow), 0 0 0 0 rgba(239,68,68,0); }
    }

    @media (max-width: 520px) {
      .launcher { right: 12px; bottom: 12px; }
      .plw[data-pos="left"] .launcher { left: 12px; }
      .launcher-label { max-width: 120px; }
      .panel, .plw[data-pos="left"] .panel { left: 8px; right: 8px; bottom: 68px; width: auto; max-width: none; height: min(560px, calc(100vh - 84px)); border-radius: 16px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition: none !important; animation: none !important; }
    }
  `;

  const CATEGORY_COPY = {
    placeholders: { name: 'Placeholder text', hint: 'Lorem ipsum, TODO and other filler' },
    spelling: { name: 'Spelling', hint: 'Possible typos in the page copy' },
    seo: { name: 'SEO & meta', hint: 'Title, description, headings, alt text' },
    technical: { name: 'Technical', hint: 'Links, image sizes and buttons' },
  };

  // ProjectLinksWidget class
  class ProjectLinksWidget {
    constructor(container, config = {}) {
      this.container =
        typeof container === "string"
          ? document.getElementById(container)
          : container;

      this.config = {
        ...defaultConfig,
        ...config,
        style: "dropdown",
      };

      // Domain Check
      const hostname = window.location.hostname;
      const isWebflow = hostname.endsWith('.webflow.io');
      const isFramer = hostname.endsWith('.framer.website');
      const isLocalhost = hostname.includes('localhost') || hostname.includes('127.0.0.1');
      const isAllowedDomain = this.config.showOnDomains && this.config.showOnDomains.some(d => hostname.includes(d));

      // Allow localhost, webflow, framer, or explicitly allowed domains
      if (!isWebflow && !isFramer && !isLocalhost && !isAllowedDomain) {
        console.warn("Project Links Widget: Domain not allowed", hostname);
        return;
      }

      if (!this.container) {
        console.error("ProjectLinksWidget: Container not found");
        return;
      }

      this.container.setAttribute('data-plw-widget-root', 'true');
      this.activeHighlightGroupKey = null;
      this.isOpen = false;
      this.isMinimized = readSession('plw-minimized') === '1';

      this.init();
    }

    async init() {
      loadFonts();
      removeWebflowBadge();
      this.project = {};
      this.links = [];
      this.checklistProgress = null;
      try {
        if (this.config.projectId) {
          const [data, clProgress] = await Promise.all([
            this.fetchProjectData(),
            this.fetchChecklistProgress().catch(() => null),
          ]);
          this.project = data || {};
          this.links = this.project.links || [];
          this.checklistProgress = clProgress;
          // Per-project display flags (set from the Project Dashboard)
          this.auditEnabled = this.project.disableAuditBadge !== true;
          this.linksEnabled = this.project.disableDropdown !== true;
          this.projectSpellcheckEnabled = this.project.enableSpellcheck !== false;
        } else if (this.config.initialLinks) {
          // No project = no per-project flags; fall back to showing both
          this.links = this.config.initialLinks;
          this.auditEnabled = true;
          this.linksEnabled = true;
        } else {
          console.warn("Project Links: No project ID provided");
          return;
        }
      } catch (error) {
        console.error("Failed to load project data:", error);
        return;
      }

      this.checklistEnabled = Boolean(
        this.config.projectId && this.checklistProgress && this.checklistProgress.total > 0
      );
      if (!this.linksEnabled && !this.auditEnabled) return;

      this.mount();
      if (this.auditEnabled) this.runStandaloneAudit();
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

    // Manual links only; sitemap links are for the audit, not for people.
    getVisibleLinks() {
      return (this.links || [])
        .filter((link) => link && link.source !== 'auto' && link.url)
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    $(selector) {
      return this.root.querySelector(selector);
    }

    $$(selector) {
      return Array.from(this.root.querySelectorAll(selector));
    }

    mount() {
      const host = this.container;
      try {
        this.root = host.shadowRoot || host.attachShadow({ mode: 'open' });
      } catch (e) {
        // Some elements can't host a shadow root; give it a div that can.
        const inner = document.createElement('div');
        inner.setAttribute('data-plw-widget-root', 'true');
        host.appendChild(inner);
        this.root = inner.attachShadow({ mode: 'open' });
      }
      host.style.cssText = 'position:fixed;z-index:2147483000;width:0;height:0;margin:0;padding:0;border:0;bottom:0;right:0;';

      const links = this.getVisibleLinks();
      const name = String(this.project.name || 'Project').trim() || 'Project';
      const initial = escapeHtml(name.charAt(0).toUpperCase());
      const hostname = window.location.hostname;
      const progress = this.checklistProgress;

      this.tabs = [];
      if (this.linksEnabled) this.tabs.push({ id: 'links', label: 'Links', meta: `<span class="tab-count">${links.length}</span>` });
      if (this.checklistEnabled && (this.linksEnabled || this.auditEnabled)) {
        this.tabs.push({ id: 'checklist', label: 'Checklist', meta: `<span class="tab-count">${progress.completed}/${progress.total}</span>` });
      }
      if (this.auditEnabled) {
        this.tabs.push({ id: 'check', label: 'Page check', meta: `<span class="tab-dot" data-check-dot></span><span class="tab-count" data-check-count></span>` });
      }
      const savedTab = readSession('plw-tab');
      this.activeTab = this.tabs.some((t) => t.id === savedTab) ? savedTab : this.tabs[0].id;

      const chip = this.checklistEnabled
        ? `<span class="launcher-chip" title="Checklist progress">${icon('check', 12, 3)}${progress.completed}/${progress.total}</span>`
        : this.linksEnabled
          ? `<span class="launcher-chip">${links.length} ${links.length === 1 ? 'link' : 'links'}</span>`
          : '';

      const appUrl = this.config.projectId
        ? `${this.config.baseUrl}/modules/project-links/${encodeURIComponent(this.config.projectId)}`
        : '';

      this.root.innerHTML = `
        <style>${WIDGET_STYLES}</style>
        <div class="plw" data-theme="${this.config.theme === 'light' ? 'light' : 'dark'}" data-pos="${this.config.position === 'bottom-left' ? 'left' : 'right'}" data-open="false" data-minimized="${this.isMinimized}">
          <section class="panel" id="plw-panel" role="dialog" aria-label="${escapeHtml(name)}" aria-hidden="true">
            <header class="head">
              <span class="mark lg" aria-hidden="true">${initial}</span>
              <div class="head-text">
                <div class="title">${escapeHtml(name)}</div>
                <div class="sub"><span class="live-dot"></span><span>${escapeHtml(siteLabel(hostname))} · ${escapeHtml(hostname)}</span></div>
              </div>
              <div class="head-actions">
                ${appUrl ? `<a class="icon-btn" href="${escapeHtml(appUrl)}" target="_blank" rel="noopener noreferrer" title="Open in ActiveSet" aria-label="Open in ActiveSet">${icon('external', 16)}</a>` : ''}
                <button type="button" class="icon-btn" data-action="close" title="Close (Esc)" aria-label="Close">${icon('close', 16)}</button>
              </div>
            </header>
            <nav class="tabs" role="tablist" ${this.tabs.length < 2 ? 'hidden' : ''}>
              ${this.tabs.map((tab) => `
                <button type="button" class="tab" role="tab" id="plw-tab-${tab.id}" data-tab="${tab.id}" aria-controls="plw-view-${tab.id}" aria-selected="${tab.id === this.activeTab}" tabindex="${tab.id === this.activeTab ? 0 : -1}">
                  <span>${tab.label}</span>${tab.meta}
                </button>`).join('')}
            </nav>
            <div class="views">
              ${this.linksEnabled ? `<div class="view" role="tabpanel" id="plw-view-links" data-view="links" aria-labelledby="plw-tab-links"></div>` : ''}
              ${this.tabs.some((t) => t.id === 'checklist') ? `<div class="view" role="tabpanel" id="plw-view-checklist" data-view="checklist" aria-labelledby="plw-tab-checklist"></div>` : ''}
              ${this.auditEnabled ? `<div class="view" role="tabpanel" id="plw-view-check" data-view="check" aria-labelledby="plw-tab-check"></div>` : ''}
            </div>
            <footer class="foot">
              <span>Shared by <strong>ActiveSet</strong></span>
              <button type="button" class="text-btn" data-action="minimize" title="Shrink the launcher to a small dot">${icon('minimize', 13)}Minimize</button>
            </footer>
          </section>
          <button type="button" class="launcher" aria-expanded="false" aria-controls="plw-panel" aria-label="Open ${escapeHtml(name)} panel">
            <span class="lead">${this.auditEnabled ? ringMarkup(28) : `<span class="mark">${initial}</span>`}</span>
            <span class="launcher-label">${escapeHtml(name)}</span>
            ${chip}
            <span class="chev">${icon('chevronUp', 16)}</span>
          </button>
        </div>
      `;

      this.shell = this.$('.plw');
      this.panel = this.$('.panel');
      this.launcher = this.$('.launcher');

      if (this.linksEnabled) this.renderLinks();
      if (this.tabs.some((t) => t.id === 'checklist')) this.renderChecklist();
      if (this.auditEnabled) this.renderChecking();
      this.selectTab(this.activeTab, { focus: false });
      this.bindShell();
    }

    bindShell() {
      this.launcher.addEventListener('click', () => {
        if (this.isMinimized) {
          this.setMinimized(false);
          this.setOpen(true);
          return;
        }
        this.setOpen(!this.isOpen);
      });

      this.root.addEventListener('click', (event) => {
        const actionEl = event.target.closest('[data-action]');
        if (!actionEl) return;
        const action = actionEl.getAttribute('data-action');
        if (action === 'close') this.setOpen(false);
        if (action === 'minimize') {
          this.setOpen(false);
          this.setMinimized(true);
        }
        if (action === 'rerun') this.runStandaloneAudit();
        if (action === 'checklist-items') this.showChecklistItems(actionEl);
      });

      const tabButtons = this.$$('.tab');
      tabButtons.forEach((tab, index) => {
        tab.addEventListener('click', () => this.selectTab(tab.dataset.tab));
        tab.addEventListener('keydown', (event) => {
          if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
          event.preventDefault();
          const step = event.key === 'ArrowRight' ? 1 : -1;
          const next = tabButtons[(index + step + tabButtons.length) % tabButtons.length];
          this.selectTab(next.dataset.tab);
        });
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.isOpen) {
          this.setOpen(false);
          this.launcher.focus();
        }
      });
    }

    setOpen(open) {
      this.isOpen = open;
      this.shell.dataset.open = String(open);
      this.panel.setAttribute('aria-hidden', String(!open));
      this.launcher.setAttribute('aria-expanded', String(open));
      if (open) {
        const active = this.$(`.tab[data-tab="${this.activeTab}"]`);
        setTimeout(() => {
          const search = this.activeTab === 'links' ? this.$('.search input') : null;
          if (search && window.matchMedia('(hover: hover)').matches) search.focus();
          else if (active && this.tabs.length > 1) active.focus();
        }, 60);
      }
    }

    setMinimized(minimized) {
      this.isMinimized = minimized;
      this.shell.dataset.minimized = String(minimized);
      writeSession('plw-minimized', minimized ? '1' : '0');
    }

    selectTab(tabId, options = {}) {
      const { focus = true } = options;
      this.activeTab = tabId;
      writeSession('plw-tab', tabId);
      this.$$('.tab').forEach((tab) => {
        const selected = tab.dataset.tab === tabId;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        if (selected && focus) tab.focus();
      });
      this.$$('.view').forEach((view) => {
        view.dataset.active = String(view.dataset.view === tabId);
      });
      const views = this.$('.views');
      if (views) views.scrollTop = 0;
    }

    // ---------- Links ----------

    renderLinks() {
      const view = this.$('[data-view="links"]');
      const links = this.getVisibleLinks();
      const here = normalizeForCompare(window.location.href);

      if (links.length === 0) {
        view.innerHTML = `
          <div class="empty">
            <div class="empty-icon">${icon('link', 20)}</div>
            <strong>No links yet</strong>
            <span>Links to designs, docs and staging pages will show up here.</span>
          </div>`;
        return;
      }

      view.innerHTML = `
        ${links.length > 6 ? `
          <label class="search">
            ${icon('search', 15)}
            <input type="search" placeholder="Search ${links.length} links" aria-label="Search links" autocomplete="off" spellcheck="false" />
          </label>` : ''}
        <div class="link-list">
          ${links.map((link) => {
            const url = safeUrl(link.url);
            const meta = describeLink(url);
            const title = String(link.title || meta.host || 'Link');
            const isHere = here && normalizeForCompare(url) === here;
            return `
              <div class="link-row" data-search="${escapeHtml(`${title} ${link.url}`.toLowerCase())}">
                <a class="link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
                  <span class="fav" style="--tint:${meta.tint}" aria-hidden="true">${escapeHtml(title.trim().charAt(0) || '•')}</span>
                  <span class="link-text">
                    <span class="link-title"><span>${escapeHtml(title)}</span>${isHere ? '<span class="here">You’re here</span>' : ''}</span>
                    <span class="link-url">${escapeHtml(meta.display)}</span>
                  </span>
                </a>
                <span class="row-actions">
                  <button type="button" class="icon-btn" data-copy="${escapeHtml(url)}" title="Copy link" aria-label="Copy link to ${escapeHtml(title)}">${icon('copy', 15)}</button>
                </span>
              </div>`;
          }).join('')}
        </div>
        <div class="empty" data-no-match hidden><strong>No matching links</strong><span>Try a different word.</span></div>
      `;

      const search = view.querySelector('.search input');
      if (search) {
        search.addEventListener('input', () => {
          const query = search.value.trim().toLowerCase();
          let shown = 0;
          view.querySelectorAll('.link-row').forEach((row) => {
            const match = !query || row.dataset.search.includes(query);
            row.hidden = !match;
            if (match) shown++;
          });
          view.querySelector('[data-no-match]').hidden = shown > 0;
        });
        search.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter') return;
          const first = view.querySelector('.link-row:not([hidden]) .link');
          if (first) first.click();
        });
      }

      view.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-copy]');
        if (!button) return;
        event.preventDefault();
        try {
          await this.copyText(button.getAttribute('data-copy'));
          button.innerHTML = icon('check', 15, 2.5);
          button.classList.add('is-done');
          button.setAttribute('title', 'Copied');
          setTimeout(() => {
            button.innerHTML = icon('copy', 15);
            button.classList.remove('is-done');
            button.setAttribute('title', 'Copy link');
          }, 1600);
        } catch (e) {
          console.error('Failed to copy text: ', e);
        }
      });
    }

    async copyText(text) {
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
    }

    // ---------- Checklist ----------

    renderChecklist() {
      const view = this.$('[data-view="checklist"]');
      const { completed, total, checklists = [] } = this.checklistProgress;
      const pct = (done, all) => (all > 0 ? Math.round((done / all) * 100) : 0);
      const overall = pct(completed, total);

      view.innerHTML = `
        <div class="cl-card">
          <div class="cl-top">
            <div class="cl-big">${completed}<span>/ ${total}</span></div>
            <div class="cl-pct">${overall === 100 ? 'All done' : `${overall}% complete`}</div>
          </div>
          <div class="bar"><span style="width:${overall}%"></span></div>
        </div>
        ${checklists.length > 1 ? checklists.map((cl) => `
          <div class="cl-row">
            <div class="cl-row-top"><span>${escapeHtml(cl.name)}</span><span>${cl.completed}/${cl.total}</span></div>
            <div class="bar"><span style="width:${pct(cl.completed, cl.total)}%"></span></div>
          </div>`).join('') : ''}
        <div class="cl-more">
          <button type="button" class="btn" data-action="checklist-items">${icon('listCheck', 14)}See every item</button>
        </div>
        <div class="cl-frame" hidden></div>
      `;
    }

    // The item list is the app's own checklist page; load it only when asked.
    showChecklistItems(button) {
      const frame = this.$('.cl-frame');
      if (!frame) return;
      if (!frame.firstChild) {
        const src = `${this.config.baseUrl}/embed?projectId=${encodeURIComponent(this.config.projectId || '')}&stagingUrl=${encodeURIComponent(this.config.stagingUrl || '')}&theme=${encodeURIComponent(this.config.theme)}&mode=checklist`;
        frame.innerHTML = `<iframe src="${escapeHtml(src)}" title="Checklist items" loading="lazy"></iframe>`;
      }
      frame.hidden = false;
      if (button && button.parentElement) button.parentElement.hidden = true;
    }

    // ---------- Page check ----------

    renderChecking() {
      const view = this.$('[data-view="check"]');
      if (!view) return;
      view.innerHTML = `
        <div class="checking">
          ${ringMarkup(44)}
          <span>Checking this page…</span>
        </div>`;
    }

    setBadgeLoadingState(isLoading) {
      if (!this.root) return;
      if (isLoading) {
        if (this.badgeAnimationFrame) cancelAnimationFrame(this.badgeAnimationFrame);
        this.$$('[data-ring]').forEach((ring) => { ring.dataset.tone = 'loading'; });
        this.$$('[data-ring-score]').forEach((el) => { el.textContent = '–'; el.style.filter = ''; el.style.opacity = ''; });
        this.$$('[data-ring-arc]').forEach((arc) => arc.setAttribute('stroke-dasharray', '0 100'));
        const dot = this.$('[data-check-dot]');
        const count = this.$('[data-check-count]');
        if (dot) dot.removeAttribute('data-tone');
        if (count) count.textContent = '';
        if (this.shell) this.shell.dataset.blocked = 'false';
      }
    }

    animateBadgeToScore(targetScore, tone) {
      const clampedTarget = Math.max(0, Math.min(100, Number(targetScore) || 0));
      const duration = 1100;
      const startTime = performance.now();
      const rings = this.$$('[data-ring]');
      const scores = this.$$('[data-ring-score]');
      const arcs = this.$$('[data-ring-arc]');
      rings.forEach((ring) => { ring.dataset.tone = tone; });

      if (this.badgeAnimationFrame) cancelAnimationFrame(this.badgeAnimationFrame);

      const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
      const step = (now) => {
        const progress = Math.min(1, (now - startTime) / duration);
        const value = clampedTarget * easeOutCubic(progress);
        scores.forEach((el) => {
          el.textContent = String(Math.round(value));
          el.style.filter = progress < 1 ? `blur(${(1 - progress) * 4}px)` : 'none';
          el.style.opacity = String(0.5 + progress * 0.5);
        });
        arcs.forEach((arc) => arc.setAttribute('stroke-dasharray', `${value.toFixed(2)} 100`));
        if (progress < 1) {
          this.badgeAnimationFrame = requestAnimationFrame(step);
        } else {
          this.badgeAnimationFrame = null;
        }
      };
      this.badgeAnimationFrame = requestAnimationFrame(step);
    }

    async runStandaloneAudit() {
       this.setBadgeLoadingState(true);
       if (this.lastAuditResult) this.renderChecking();
       // Small delay to ensure DOM is ready
       setTimeout(async () => {
          try {
             let enableSpellcheck = this.projectSpellcheckEnabled !== false;
             let spellcheckReason = enableSpellcheck ? '' : 'Disabled in Project Dashboard';
             const baseUrl = ContentQualityAuditor.getApiBaseUrl();

             // 1. Check Scan Eligibility (Cost Control)
             if (this.config.projectId && enableSpellcheck) {
                 try {
                     const checkUrl = `${baseUrl}/api/audit-config`;
                     const res = await fetch(checkUrl, {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ projectId: this.config.projectId, url: window.location.href })
                     });
                     const data = await res.json();
                     enableSpellcheck = data.enableSpellcheck !== false;
                     if (!enableSpellcheck) {
                        spellcheckReason = data.reason || 'Disabled';
                     }
                 } catch (e) { console.warn('Audit Config Check Failed', e); }
             }

             // 2. Run Audit
             const result = await ContentQualityAuditor.audit({ spellcheck: enableSpellcheck, spellcheckReason });
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
             this.renderAuditError();
          }
       }, 500);
    }

    renderAuditError() {
      const view = this.$('[data-view="check"]');
      this.$$('[data-ring]').forEach((ring) => { ring.dataset.tone = 'bad'; });
      this.$$('[data-ring-score]').forEach((el) => { el.textContent = '!'; });
      if (!view) return;
      view.innerHTML = `
        <div class="empty">
          <strong>Couldn’t check this page</strong>
          <span>Something on the page stopped the check from finishing.</span>
          <button type="button" class="btn" data-action="rerun" style="margin-top:8px">${icon('refresh', 14)}Try again</button>
        </div>`;
    }

    renderStandaloneResults(result) {
       const view = this.$('[data-view="check"]');
       if (!view) return;
       this.lastAuditResult = result;
       ContentQualityAuditor.clearIssueHighlights();
       this.activeHighlightGroupKey = null;

       const tone = scoreTone(result);
       const esc = (value) => ContentQualityAuditor.escapeHtml(value);
       const cats = result.categories;
       const issueCount =
         cats.placeholders.issues.length +
         (cats.spelling.skippedReason || (cats.spelling.issues[0] && cats.spelling.issues[0].word === 'Service Unavailable') ? 0 : cats.spelling.issues.length) +
         cats.seo.issues.length +
         cats.technical.issues.length;

       let verdict = 'Looks great';
       if (!result.canDeploy) verdict = 'Placeholder text found';
       else if (result.overallScore < 50) verdict = 'Needs attention';
       else if (result.overallScore < 90) verdict = 'A few things to tidy';
       const verdictSub = !result.canDeploy
         ? 'Replace it before this page goes live.'
         : issueCount === 0
           ? 'Nothing to fix on this page.'
           : `${issueCount} ${issueCount === 1 ? 'thing' : 'things'} to look at on this page.`;

       // Detail renderers (same data as before, restyled)
       const renderInteractiveDetails = (groupKey, items, itemRenderer, maxVisible = 12) => {
         const detailItems = Array.isArray(items) ? items : [];
         if (detailItems.length === 0) return '';

         const visibleItems = detailItems.slice(0, maxVisible);
         const hiddenCount = Math.max(0, detailItems.length - visibleItems.length);
         const groupIds = detailItems.map((item) => item.elementId).filter(Boolean);
         const encodedGroupIds = encodeURIComponent(groupIds.join(','));

         const actionButton = groupIds.length > 0
           ? `<div class="issue-actions"><button type="button" class="btn highlight-group-btn" data-highlight-group="${esc(groupKey)}" data-highlight-ids="${encodedGroupIds}" aria-pressed="false">Highlight on page</button></div>`
           : '';

         const listItems = visibleItems.map((item) => {
           const itemIds = item.elementId ? encodeURIComponent(item.elementId) : '';
           const className = itemIds ? 'detail-item clickable-issue-item' : 'detail-item';
           const dataAttr = itemIds ? ` data-highlight-ids="${itemIds}" title="Show on page"` : '';
           return `<div class="${className}"${dataAttr}>${itemRenderer(item)}</div>`;
         }).join('');

         const moreLabel = hiddenCount > 0 ? `<div class="detail-item">+ ${hiddenCount} more</div>` : '';
         return `${actionButton}${listItems}${moreLabel}`;
       };

       const renderRow = (key, statusObj, detailsHtml) => {
         const copy = CATEGORY_COPY[key];
         const count = (statusObj.issues || []).length;
         let rowTone = 'good';
         let statusText = 'Passed';
         if (statusObj.status === 'failed') { rowTone = 'bad'; statusText = `${count} found`; }
         else if (statusObj.status === 'warning') { rowTone = 'warn'; statusText = `${count} ${count === 1 ? 'issue' : 'issues'}`; }
         else if (statusObj.status === 'info') {
           rowTone = 'info';
           statusText = statusObj.skippedReason ? 'Skipped' : count > 0 ? `${count} to review` : 'Info';
         }
         const hasDetails = Boolean(detailsHtml && detailsHtml.trim());
         return `
           <div class="cat">
             <button type="button" class="cat-row" data-tone="${rowTone}" ${hasDetails ? `aria-expanded="false" aria-controls="plw-cat-${key}"` : 'aria-disabled="true" tabindex="-1"'}>
               <span class="cat-dot" aria-hidden="true"></span>
               <span class="cat-text">
                 <span class="cat-name">${copy.name}</span>
                 <span class="cat-hint">${copy.hint}</span>
               </span>
               <span class="cat-status">${statusText}</span>
               ${hasDetails ? `<span class="cat-chev">${icon('chevronDown', 16)}</span>` : ''}
             </button>
             ${hasDetails ? `<div class="cat-details" id="plw-cat-${key}" hidden>${detailsHtml}</div>` : ''}
           </div>`;
       };

       // Placeholders
       const ph = cats.placeholders;
       let phDetails = '';
       if (Array.isArray(ph.detailItems) && ph.detailItems.length > 0) {
           phDetails = renderInteractiveDetails(
             'placeholders',
             ph.detailItems,
             (item) => `${esc(item.label || 'Placeholder')} · “${esc(item.match || '[match]')}” · <code>${esc(item.selector || 'unknown')}</code>`,
             14
           );
       } else if (ph.issues.length > 0) {
           phDetails = ph.issues.map(i => `<div class="detail-item">${esc(i.type)}</div>`).join('');
       }

       // Spelling
       const sp = cats.spelling;
       let spDetails = '';
       if (Array.isArray(sp.detailItems) && sp.detailItems.length > 0) {
           spDetails = renderInteractiveDetails(
             'spelling',
             sp.detailItems,
             (item) => `“${esc(item.label || item.match || '[word]')}” · <code>${esc(item.selector || 'unknown')}</code>`,
             14
           );
       } else if (sp.skippedReason) {
           spDetails = `<div class="detail-item">${esc(sp.skippedReason)}</div>`;
       } else if (sp.issues.length > 0) {
           spDetails = sp.issues
             .slice(0, 5)
             .map(i => `<div class="detail-item">“${esc(i.word)}”</div>`)
             .join('');
           if (sp.issues.length > 5) {
             spDetails += `<div class="detail-item">+ ${sp.issues.length - 5} more</div>`;
           }
       }

       // SEO & Meta
       const seo = cats.seo;
       let seoDetails = '';
       if (seo.issues.length > 0) {
           seoDetails = seo.issues.map(i => `<div class="detail-item">${esc(i)}</div>`).join('');
           if (Array.isArray(seo.detailItems) && seo.detailItems.length > 0) {
             seoDetails += renderInteractiveDetails(
               'seo',
               seo.detailItems,
               (item) => `${esc(item.label || 'SEO issue')} · <code>${esc(item.selector || 'unknown')}</code>`,
               14
             );
           }
       }

       // Technical Health
       const tech = cats.technical;
       let techDetails = '';
       if (tech.issues.length > 0) {
           const detailGroups = Array.isArray(tech.detailGroups) ? tech.detailGroups : [];
           const renderTechnicalItem = (groupKey, item) => {
             if (groupKey === 'empty-links') {
               return `<code>${esc(item.selector || 'unknown')}</code> · “${esc(item.text || '[no text]')}” · href <code>${esc(item.href || '[missing]')}</code>`;
             }
             if (groupKey === 'unsafe-links') {
               return `<code>${esc(item.selector || 'unknown')}</code> · href <code>${esc(item.href || '[missing]')}</code> · rel <code>${esc(item.rel || '[missing]')}</code>`;
             }
             if (groupKey === 'http-links') {
               return `<code>${esc(item.selector || 'unknown')}</code> · href <code>${esc(item.href || '[missing]')}</code>`;
             }
             if (groupKey === 'cls-images') {
               return `<code>${esc(item.selector || 'unknown')}</code> · src <code>${esc(item.src || '[missing]')}</code>`;
             }
             if (groupKey === 'button-type') {
               return `<code>${esc(item.selector || 'unknown')}</code> · “${esc(item.text || '[no text]')}”`;
             }
             return esc(JSON.stringify(item || {}));
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
                      ${visible.length > 0 ? visible.map(item => {
                        const itemIds = item.elementId ? encodeURIComponent(item.elementId) : '';
                        const className = itemIds ? 'detail-item clickable-issue-item' : 'detail-item';
                        const attr = itemIds ? ` data-highlight-ids="${itemIds}" title="Show on page"` : '';
                        return `<div class="${className}"${attr}>${renderTechnicalItem(group.key, item)}</div>`;
                      }).join('') : '<div class="detail-item">No element details captured.</div>'}
                      ${hiddenCount > 0 ? `<div class="detail-item">+ ${hiddenCount} more affected elements</div>` : ''}
                      <div class="issue-actions">
                        <button type="button" class="btn highlight-group-btn" data-highlight-group="${esc(`technical-${group.key || `group-${idx + 1}`}`)}" data-highlight-ids="${encodedHighlightIds}" aria-pressed="false" ${highlightIds.length === 0 ? 'disabled' : ''}>Highlight on page</button>
                        <button type="button" class="btn copy-mcp-prompt-btn" data-copy-prompt="${encodedPrompt}">Copy Webflow MCP prompt</button>
                      </div>
                    </div>
                 </details>
               `;
             }).join('');
           } else {
             techDetails = tech.issues.map(i => `<div class="detail-item">${esc(i)}</div>`).join('');
           }
       }

       view.innerHTML = `
         <div class="check-summary">
           ${ringMarkup(52)}
           <div class="head-text">
             <div class="verdict">${verdict}</div>
             <div class="verdict-sub">${verdictSub}</div>
           </div>
           <button type="button" class="icon-btn" data-action="rerun" title="Check again" aria-label="Check this page again">${icon('refresh', 16)}</button>
         </div>
         ${renderRow('placeholders', ph, phDetails)}
         ${renderRow('spelling', sp, spDetails)}
         ${renderRow('seo', seo, seoDetails)}
         ${renderRow('technical', tech, techDetails)}
       `;

       const dot = this.$('[data-check-dot]');
       const count = this.$('[data-check-count]');
       if (dot) dot.dataset.tone = tone;
       if (count) count.textContent = String(result.overallScore);
       this.shell.dataset.blocked = String(!result.canDeploy);
       this.animateBadgeToScore(result.overallScore, tone);

       this.bindAuditDetails(view);
    }

    bindAuditDetails(view) {
       view.querySelectorAll('.cat-row[aria-controls]').forEach((row) => {
         row.addEventListener('click', () => {
           const details = view.querySelector(`#${row.getAttribute('aria-controls')}`);
           if (!details) return;
           const expanded = row.getAttribute('aria-expanded') === 'true';
           row.setAttribute('aria-expanded', String(!expanded));
           details.hidden = expanded;
           // Bring an opened category to the top of the list when it would run off the bottom
           const views = this.$('.views');
           const cat = row.closest('.cat');
           if (!expanded && views && cat && cat.offsetTop + cat.offsetHeight > views.scrollTop + views.clientHeight) {
             views.scrollTo({ top: cat.offsetTop - 8, behavior: 'smooth' });
           }
         });
       });

       const highlightGroupButtons = view.querySelectorAll('.highlight-group-btn[data-highlight-ids]');
       const clickableIssueItems = view.querySelectorAll('.clickable-issue-item[data-highlight-ids]');
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
         button.textContent = isActive ? `Highlighted (${count})` : 'Highlight on page';
       };
       const clearGroupHighlightState = () => {
         highlightGroupButtons.forEach((btn) => setGroupHighlightButtonState(btn, false));
         this.activeHighlightGroupKey = null;
       };

       view.querySelectorAll('.copy-mcp-prompt-btn[data-copy-prompt]').forEach((button) => {
         button.addEventListener('click', async (event) => {
           event.preventDefault();
           event.stopPropagation();
           const encoded = button.getAttribute('data-copy-prompt') || '';
           const prompt = encoded ? decodeURIComponent(encoded) : '';
           if (!prompt) return;
           try {
             await this.copyText(prompt);
             flashButtonText(button, 'Copied');
           } catch (e) {
             flashButtonText(button, 'Copy failed');
           }
         });
       });

       highlightGroupButtons.forEach((button) => {
         button.addEventListener('click', (event) => {
           event.preventDefault();
           event.stopPropagation();
           const groupKey = button.getAttribute('data-highlight-group') || '';
           const encodedIds = button.getAttribute('data-highlight-ids') || '';
           const ids = encodedIds ? decodeURIComponent(encodedIds).split(',').filter(Boolean) : [];
           if (ids.length === 0) {
             flashButtonText(button, 'No match');
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
             flashButtonText(button, 'No match');
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
  }

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
        position: element.dataset.position || defaultConfig.position,
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
        position: script.dataset.position || defaultConfig.position,
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
