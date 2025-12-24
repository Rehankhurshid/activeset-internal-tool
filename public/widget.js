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
    
    // Common words dictionary (compact) for spell checking
    static COMMON_WORDS = new Set([
      'the','be','to','of','and','a','in','that','have','i','it','for','not','on','with','he','as','you',
      'do','at','this','but','his','by','from','they','we','say','her','she','or','an','will','my','one',
      'all','would','there','their','what','so','up','out','if','about','who','get','which','go','me',
      'when','make','can','like','time','no','just','him','know','take','people','into','year','your',
      'good','some','could','them','see','other','than','then','now','look','only','come','its','over',
      'think','also','back','after','use','two','how','our','work','first','well','way','even','new',
      'want','because','any','these','give','day','most','us','is','are','was','were','been','being',
      'has','had','having','does','did','doing','am','here','more','very','should','such','must','may',
      'might','shall','need','own','still','each','both','much','many','most','find','found','made',
      'same','great','where','while','right','through','before','those','every','thing','got','down',
      'always','another','around','never','going','last','long','little','three','left','old','own',
      'put','end','off','does','let','set','try','ask','went','came','next','best','though','place',
      'took','called','world','part','head','keep','hand','against','high','without','within','show',
      'small','few','since','start','love','life','home','name','home','point','form','full','real',
      'team','case','company','service','need','group','system','number','under','problem','however',
      'help','run','feel','week','ever','actually','something','nothing','between','might','believe',
      'kind','mean','money','today','away','experience','read','write','website','page','content',
      'design','development','client','project','business','digital','marketing','brand','creative',
      'webflow','services','solutions','contact','email','phone','address','submit','send','message'
    ]);

    // Placeholder patterns (CRITICAL - blocks deployment)
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
      { regex: /sample\s+text/gi, name: 'Sample Text' },
      { regex: /dolor\s+sit\s+amet/gi, name: 'Lorem Ipsum (latin)' }
    ];

    // Count syllables in a word (for readability)
    static countSyllables(word) {
      word = word.toLowerCase().replace(/[^a-z]/g, '');
      if (word.length <= 3) return 1;
      word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
      word = word.replace(/^y/, '');
      const matches = word.match(/[aeiouy]{1,2}/g);
      return matches ? matches.length : 1;
    }

    // Flesch Reading Ease Score
    static calculateReadability(text) {
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const words = text.split(/\s+/).filter(w => w.length > 0);
      const totalSyllables = words.reduce((sum, w) => sum + this.countSyllables(w), 0);
      
      if (sentences.length === 0 || words.length === 0) {
        return { score: 0, gradeLevel: 'Unknown', difficulty: 'Unknown' };
      }

      const avgSentenceLength = words.length / sentences.length;
      const avgSyllablesPerWord = totalSyllables / words.length;
      
      // Flesch Reading Ease: 206.835 - 1.015(ASL) - 84.6(ASW)
      const score = Math.round(206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord));
      const clampedScore = Math.max(0, Math.min(100, score));

      let difficulty, gradeLevel;
      if (clampedScore >= 90) { difficulty = 'Very Easy'; gradeLevel = '5th Grade'; }
      else if (clampedScore >= 80) { difficulty = 'Easy'; gradeLevel = '6th Grade'; }
      else if (clampedScore >= 70) { difficulty = 'Fairly Easy'; gradeLevel = '7th Grade'; }
      else if (clampedScore >= 60) { difficulty = 'Standard'; gradeLevel = '8th-9th Grade'; }
      else if (clampedScore >= 50) { difficulty = 'Fairly Difficult'; gradeLevel = '10th-12th Grade'; }
      else if (clampedScore >= 30) { difficulty = 'Difficult'; gradeLevel = 'College'; }
      else { difficulty = 'Very Difficult'; gradeLevel = 'College Graduate'; }

      return { score: clampedScore, gradeLevel, difficulty };
    }

    // Main audit function
    static audit() {
      const text = document.body.innerText || '';
      const result = {
        canDeploy: true,
        overallScore: 100,
        summary: '',
        categories: {
          placeholders: { status: 'passed', issues: [], score: 100 },
          spelling: { status: 'passed', issues: [], errorCount: 0, errorRate: '0%', score: 100 },
          readability: { status: 'passed', score: 0, gradeLevel: '', difficulty: '', displayScore: 100 },
          completeness: { status: 'passed', issues: [], wordCount: 0, hasH1: false, missingAlt: 0, score: 100 }
        }
      };

      // ========== 1. PLACEHOLDER DETECTION (CRITICAL) ==========
      this.PLACEHOLDER_PATTERNS.forEach(pattern => {
        const matches = text.match(pattern.regex);
        if (matches && matches.length > 0) {
          result.categories.placeholders.issues.push({
            type: pattern.name,
            count: matches.length
          });
        }
      });

      if (result.categories.placeholders.issues.length > 0) {
        result.categories.placeholders.status = 'failed';
        result.categories.placeholders.score = 0;
        result.canDeploy = false;
        result.overallScore = 0;
      }

      // ========== 2. SPELLING CHECK ==========
      const words = text.split(/\s+/).filter(w => /^[a-zA-Z]{4,}$/.test(w));
      const unknownWords = [];
      const checked = new Set();

      words.forEach(word => {
        const lower = word.toLowerCase();
        if (!checked.has(lower) && !this.COMMON_WORDS.has(lower)) {
          // Skip proper nouns (capitalized words in middle of text)
          if (word[0] === word[0].toUpperCase() && word.length > 2) return;
          unknownWords.push(word);
          checked.add(lower);
        }
      });

      // Limit to top 10 potential typos
      const potentialTypos = unknownWords.slice(0, 10);
      if (potentialTypos.length > 0) {
        result.categories.spelling.issues = potentialTypos.map(w => ({ word: w }));
        result.categories.spelling.errorCount = potentialTypos.length;
        result.categories.spelling.errorRate = ((potentialTypos.length / words.length) * 100).toFixed(1) + '%';
        result.categories.spelling.status = potentialTypos.length > 5 ? 'warning' : 'info';
        result.categories.spelling.score = Math.max(0, 100 - (potentialTypos.length * 5));
      }

      // ========== 3. READABILITY ==========
      const readability = this.calculateReadability(text);
      result.categories.readability.score = readability.score;
      result.categories.readability.gradeLevel = readability.gradeLevel;
      result.categories.readability.difficulty = readability.difficulty;
      
      // Ideal range is 60-70 for web content
      if (readability.score >= 50 && readability.score <= 80) {
        result.categories.readability.status = 'passed';
        result.categories.readability.displayScore = 100;
      } else if (readability.score < 30 || readability.score > 90) {
        result.categories.readability.status = 'warning';
        result.categories.readability.displayScore = 70;
      } else {
        result.categories.readability.status = 'info';
        result.categories.readability.displayScore = 85;
      }

      // ========== 4. COMPLETENESS ==========
      const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
      result.categories.completeness.wordCount = wordCount;

      // Check H1
      const h1s = document.querySelectorAll('h1');
      result.categories.completeness.hasH1 = h1s.length > 0;
      if (h1s.length === 0) {
        result.categories.completeness.issues.push('Missing H1 heading');
      } else if (h1s.length > 1) {
        result.categories.completeness.issues.push(`Multiple H1 tags (${h1s.length})`);
      }

      // Check alt text
      const images = document.querySelectorAll('img');
      let missingAlt = 0;
      images.forEach(img => {
        if (!img.alt || img.alt.trim() === '') missingAlt++;
      });
      result.categories.completeness.missingAlt = missingAlt;
      if (missingAlt > 0) {
        result.categories.completeness.issues.push(`${missingAlt} images missing alt text`);
      }

      // Word count check
      if (wordCount < 50) {
        result.categories.completeness.issues.push('Very thin content (< 50 words)');
      } else if (wordCount < 100) {
        result.categories.completeness.issues.push('Light content (< 100 words)');
      }

      if (result.categories.completeness.issues.length > 0) {
        result.categories.completeness.status = result.categories.completeness.issues.some(i => i.includes('Missing H1')) ? 'warning' : 'info';
        result.categories.completeness.score = Math.max(0, 100 - (result.categories.completeness.issues.length * 10));
      }

      // ========== CALCULATE OVERALL SCORE ==========
      if (result.canDeploy) {
        // Weighted average: Placeholders (blocked), Spelling 30%, Readability 20%, Completeness 50%
        result.overallScore = Math.round(
          (result.categories.spelling.score * 0.3) +
          (result.categories.readability.displayScore * 0.2) +
          (result.categories.completeness.score * 0.5)
        );
      }

      // Generate summary
      const issueCount = 
        result.categories.placeholders.issues.length +
        result.categories.spelling.issues.length +
        result.categories.completeness.issues.length;

      if (!result.canDeploy) {
        result.summary = '⛔ BLOCKED: Placeholder content detected. Replace before deploying.';
      } else if (result.overallScore >= 90) {
        result.summary = '✅ Excellent! Content is ready for deployment.';
      } else if (result.overallScore >= 70) {
        result.summary = `⚠️ Good with ${issueCount} minor issue(s). Review recommended.`;
      } else {
        result.summary = `❌ ${issueCount} issues found. Fix before deploying.`;
      }

      return result;
    }
  }

  // ProjectLinksWidget class
  class ProjectLinksWidget {
    constructor(container, config = {}) {
      // Check for .webflow.io domain
      const hostname = window.location.hostname;
      const isWebflow = hostname.endsWith('.webflow.io');
      const isLocalhost = hostname.includes('localhost') || hostname.includes('127.0.0.1');

      // Allow localhost for testing, strict on production
      if (!isWebflow && !isLocalhost) {
        return;
      }

      console.log("Project Links Widget: Initializing on", hostname);

      this.container =
        typeof container === "string"
          ? document.getElementById(container)
          : container;
      
       // Enforce specific config overrides
      this.config = { 
        ...defaultConfig, 
        ...config,
        style: "dropdown", // Always dropdown
        position: "bottom-right" // Always bottom-right
      };

      if (!this.container) {
        console.error("ProjectLinksWidget: Container not found");
        return;
      }

      this.init();
    }

    async init() {
      this.initContentAudit(); // Auto-run audit on load
      loadFonts(); // Ensure fonts are loaded
      try {
        if (this.config.projectId) {
          const data = await this.fetchProjectData();
          this.links = data.links || []; // Store links for later use
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

    render(data) {
      this.renderDropdown(data);
    }

    initContentAudit() {
       // Create Standalone Panel Container
       const auditContainer = document.createElement('div');
       auditContainer.id = 'plw-audit-container';
       document.body.appendChild(auditContainer);
       
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
                <span class="panel-subtitle">Placeholder · Spelling · Tech</span>
             </div>
             <div id="plw-panel-content" class="panel-content">
                <!-- Results go here -->
             </div>
          </div>
          
          <style>
             #plw-audit-container {
                font-family: 'Funnel Sans', sans-serif;
                z-index: 10001;
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
                stroke-width: 2.5;
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
                width: 360px;
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
                padding: 16px 20px;
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
             }
             
             .panel-content {
                padding: 0;
                overflow-y: auto;
                max-height: calc(85vh - 60px);
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
       
       // Run Initial Audit
       this.runStandaloneAudit();
    }
    
    runStandaloneAudit() {
       // Small delay to ensure DOM is ready
       setTimeout(() => {
          try {
             const result = ContentQualityAuditor.audit();
             this.renderStandaloneResults(result);
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
           if(name === 'Readability') statusText = `${statusObj.score}`;
           
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
       
       // Readability
       const rd = result.categories.readability;
       html += renderRow('📖', 'Readability', {status: rd.status, score: rd.score}, `<div class="cat-details"><div class="detail-item">Grade Level: ${rd.gradeLevel}</div></div>`);
       
       // Completeness
       const cm = result.categories.completeness;
       let cmDetails = '';
       if (cm.issues.length > 0) {
           cmDetails = `<div class="cat-details">` + cm.issues.map(i => `<div class="detail-item">• ${i}</div>`).join('') + `</div>`;
       }
       html += renderRow('✅', 'Completeness', cm, cmDetails);
       
       html += `</div>`; // Close list
       
       content.innerHTML = html;
    }

    renderDropdown(data) {
      const links = data.links || [];
      if (links.length === 0) return;

      const positionStyles = {
        "bottom-right": "bottom: 0; right: 24px;",
      };

      const dropdownPosition = this.config.position.includes("bottom")
        ? "bottom: 100%;"
        : "top: 100%;";

      // Ensure container is fixed and positioned correctly matches old style
      this.container.style.cssText = `
        position: fixed; 
        z-index: 9999; 
        ${positionStyles["bottom-right"]}
      `;

      this.container.innerHTML = `
        <div class="dropdown-widget-container">
          <button class="dropdown-widget-button" id="plw-trigger-btn">
            <div class="button-content">
               <span>Project Links</span>
               <div class="count-badge">${links.length}</div>
            </div>
            <svg class="chevron-icon" id="plw-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
          </button>
          
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
             font-size: 12px;
             color: #a1a1aa;
             padding: 3px 0;
          }
        </style>
      `;

      // Setup click listeners
      this.setupHandlers();
    }

    setupHandlers() {
       const btn = this.container.querySelector('#plw-trigger-btn');
       const content = this.container.querySelector('#plw-content');
       const chevron = this.container.querySelector('#plw-chevron');

       if (!btn || !content) return;

       const toggleMenu = (e) => {
         e.stopPropagation();
         const isHidden = content.style.display === 'none';
         content.style.display = isHidden ? 'block' : 'none';
         chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
       };

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
    const scripts = document.querySelectorAll(
      'script[data-auto-inject="true"]'
    );

    scripts.forEach((script) => {
      if (script.dataset.injected) return; // Already processed

      const config = {
        projectId: script.dataset.projectId,
        theme: script.dataset.theme || defaultConfig.theme,
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
