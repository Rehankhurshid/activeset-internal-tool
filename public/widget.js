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

  // Smart Auditor Engine (Local)
  class SmartAuditor {
    static analyze() {
      const report = {
        score: 100,
        errors: [],
        warnings: [],
        passed: []
      };

      const addIssue = (type, message, deduction) => {
        report[type].push(message);
        if (type === 'errors') report.score -= deduction;
        if (type === 'warnings') report.score -= (deduction / 2);
      };

      // 1. SEO Checks
      const title = document.title;
      if (!title) {
        addIssue('errors', 'Missing page title', 20);
      } else if (title.length < 10 || title.length > 60) {
        addIssue('warnings', `Title length (${title.length}) is not optimal (10-60 chars)`, 5);
      } else {
        report.passed.push('Page title is optimized');
      }

      const metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        addIssue('errors', 'Missing meta description', 20);
      } else if (metaDesc.content.length < 50 || metaDesc.content.length > 160) {
        addIssue('warnings', 'Meta description length should be between 50-160 chars', 5);
      } else {
        report.passed.push('Meta description exists');
      }

      const h1s = document.querySelectorAll('h1');
      if (h1s.length === 0) {
        addIssue('errors', 'Missing H1 heading', 15);
      } else if (h1s.length > 1) {
        addIssue('warnings', 'Multiple H1 tags found (should be one)', 5);
      } else {
        report.passed.push('H1 structure is correct');
      }

      // 2. Accessibility Checks
      const images = document.querySelectorAll('img');
      let missingAlt = 0;
      images.forEach(img => {
        if (!img.alt) missingAlt++;
      });
      if (missingAlt > 0) {
        addIssue('errors', `${missingAlt} images missing alt text`, 5 * missingAlt);
      } else {
        report.passed.push('All images have alt text');
      }

      const links = document.querySelectorAll('a');
      let badLinks = 0;
      links.forEach(link => {
        if (!link.innerText.trim() && !link.getAttribute('aria-label')) badLinks++;
      });
      if (badLinks > 0) {
        addIssue('warnings', `${badLinks} links have no descriptive text`, 5);
      }

      report.score = Math.max(0, report.score);
      return report;
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
            <div class="audit-section">
               <button class="audit-btn" id="plw-local-audit-btn">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                 Quick Check
               </button>
               <button class="audit-btn ai-btn" id="plw-ai-audit-btn" style="margin-top: 4px; border-color: #8b5cf6; color: #a78bfa;">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                 AI Deep Scan
               </button>
            </div>
          </div>
          
          <!-- Local Audit Modal -->
          <div id="plw-audit-modal" class="audit-modal-overlay" style="display: none;">
            <div class="audit-modal-content">
              <div class="audit-modal-header">
                <h3>Page Health Report</h3>
                <button id="plw-close-audit" class="close-audit-btn">&times;</button>
              </div>
              <div id="plw-audit-body" class="audit-modal-body">
                 <!-- Results injected here -->
              </div>
            </div>
          </div>

          <!-- AI Audit Right Panel -->
          <div id="plw-ai-panel" class="ai-panel" style="display: none;">
             <button id="plw-close-ai" class="close-ai-btn">&times;</button>
             <div class="ai-header">
                <h3>AI Content Audit</h3>
                <span class="ai-subtitle">Analyzing tone, clarity & conversion</span>
             </div>
             <div id="plw-ai-content" class="ai-content">
                <div class="ai-loading">
                  <div class="spinner"></div>
                  <p>Analyzing page content...</p>
                </div>
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
          
          /* Audit Section */
          .audit-section {
            padding: 8px 12px;
            background: #000;
            border-top: 1px solid #222;
          }
          
          .audit-btn {
             width: 100%;
             display: flex;
             align-items: center;
             justify-content: center;
             gap: 8px;
             padding: 6px;
             font-size: 12px;
             background: #111;
             border: 1px solid #333;
             color: #888;
             border-radius: 4px;
             cursor: pointer;
             transition: all 0.2s;
             font-family: 'Funnel Sans', sans-serif;
          }
          
          .audit-btn:hover {
            background: #222;
            color: #fff;
            border-color: #444;
          }

          .ai-btn:hover {
            background: #2e1065 !important;
            border-color: #8b5cf6 !important;
            color: #fff !important;
          }
          
          /* Modal Styles */
          .audit-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 20000;
            backdrop-filter: blur(2px);
          }
          
          .audit-modal-content {
            width: 500px;
            background: #09090b;
            border: 1px solid #27272a;
            border-radius: 12px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
            overflow: hidden;
            font-family: 'Funnel Sans', sans-serif;
          }
          
          .audit-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px;
            border-bottom: 1px solid #27272a;
            background: #09090b;
          }
          
          .audit-modal-header h3 {
            margin: 0;
            font-size: 16px;
            color: #fff;
            font-weight: 600;
            font-family: 'Funnel Display', sans-serif;
          }
          
          .close-audit-btn {
            background: none;
            border: none;
            color: #71717a;
            font-size: 24px;
            cursor: pointer;
            line-height: 1;
            padding: 0;
          }
          
          .close-audit-btn:hover {
            color: #fff;
          }
          
          .audit-modal-body {
            padding: 20px;
            color: #a1a1aa;
            font-size: 14px;
            max-height: 70vh;
            overflow-y: auto;
          }
          
          .score-container {
             display: flex;
             align-items: center;
             justify-content: center;
             margin-bottom: 24px;
          }
          
          .score-circle {
             width: 80px;
             height: 80px;
             border-radius: 50%;
             display: flex;
             align-items: center;
             justify-content: center;
             font-size: 28px;
             font-weight: 700;
             font-family: 'Funnel Display', sans-serif;
             border: 4px solid #27272a;
          }
          
          .score-high { border-color: #10b981; color: #10b981; }
          .score-med { border-color: #f59e0b; color: #f59e0b; }
          .score-low { border-color: #ef4444; color: #ef4444; }
          
          .issue-group { margin-bottom: 20px; }
          .issue-title { font-weight: 600; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
          
          .issue-item {
             background: #18181b;
             padding: 10px 12px;
             border-radius: 6px;
             margin-bottom: 6px;
             border: 1px solid #27272a;
             display: flex;
             gap: 8px;
             align-items: start;
          }
          
          .issue-icon { flex-shrink: 0; margin-top: 2px; }
          .text-red { color: #ef4444; }
          .text-yellow { color: #f59e0b; }
          .text-green { color: #10b981; }

          /* AI Panel Styles */
          .ai-panel {
            position: fixed;
            top: 50%;
            right: 20px;
            transform: translateY(-50%);
            width: 350px;
            max-height: 80vh;
            background: #09090b;
            border: 1px solid #27272a;
            border-radius: 12px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            z-index: 20001;
            padding: 0;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            font-family: 'Funnel Sans', sans-serif;
          }

          .close-ai-btn {
             position: absolute;
             top: 10px;
             right: 15px;
             background: none;
             border: none;
             color: #71717a;
             font-size: 22px;
             cursor: pointer;
             z-index: 10;
          }
          .close-ai-btn:hover { color: #fff; }

          .ai-header {
             padding: 20px 20px 15px;
             border-bottom: 1px solid #27272a;
             background: #09090b;
          }
          
          .ai-header h3 {
             margin: 0;
             font-size: 18px;
             color: #fff;
             font-family: 'Funnel Display', sans-serif;
             display: flex;
             align-items: center;
             gap: 8px;
          }
          
          .ai-subtitle {
             display: block;
             font-size: 12px;
             color: #71717a;
             margin-top: 4px;
          }

          .ai-content {
             padding: 20px;
             overflow-y: auto;
             flex: 1;
             color: #a1a1aa;
             font-size: 14px;
             line-height: 1.6;
          }

          .ai-loading {
             display: flex;
             flex-direction: column;
             align-items: center;
             justify-content: center;
             padding: 40px 0;
             gap: 15px;
             color: #a78bfa;
          }

          .spinner {
             width: 30px;
             height: 30px;
             border: 3px solid #2e1065;
             border-top: 3px solid #a78bfa;
             border-radius: 50%;
             animation: spin 1s linear infinite;
          }

          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

          .ai-card {
             background: #18181b;
             border: 1px solid #27272a;
             border-radius: 8px;
             padding: 15px;
             margin-bottom: 15px;
          }
          
          .ai-card h4 {
             margin: 0 0 10px 0;
             font-size: 14px;
             color: #e4e4e7;
             font-weight: 600;
             text-transform: uppercase;
             letter-spacing: 0.05em;
          }
          
          .ai-list {
             margin: 0;
             padding-left: 20px;
          }
          
          .ai-list li {
             margin-bottom: 6px;
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
       
       const localAuditBtn = this.container.querySelector('#plw-local-audit-btn');
       const aiAuditBtn = this.container.querySelector('#plw-ai-audit-btn');
       
       const localModal = this.container.querySelector('#plw-audit-modal');
       const closeLocalAudit = this.container.querySelector('#plw-close-audit');
       const localAuditBody = this.container.querySelector('#plw-audit-body');
       
       const aiPanel = this.container.querySelector('#plw-ai-panel');
       const closeAi = this.container.querySelector('#plw-close-ai');
       const aiContent = this.container.querySelector('#plw-ai-content');

       if (!btn || !content) return;

       const toggleMenu = (e) => {
         e.stopPropagation();
         const isHidden = content.style.display === 'none';
         content.style.display = isHidden ? 'block' : 'none';
         chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
       };

       const closeMenu = (e) => {
         if (!this.container.contains(e.target)) {
            content.style.display = 'none';
            chevron.style.transform = 'rotate(0deg)';
         }
       };
       
       // --- Local Audit Logic ---
       const runLocalAudit = () => {
         const report = SmartAuditor.analyze();
         
         let scoreClass = 'score-low';
         if (report.score >= 90) scoreClass = 'score-high';
         else if (report.score >= 50) scoreClass = 'score-med';

         let resultHtml = `
           <div class="score-container">
              <div class="score-circle ${scoreClass}">${report.score}</div>
           </div>
         `;
         if (report.errors.length > 0) { /* ... same as before */
           resultHtml += `<div class="issue-group"><div class="issue-title text-red">Critical Issues</div>`;
           report.errors.forEach(err => { resultHtml += `<div class="issue-item"><span class="issue-icon text-red">●</span>${err}</div>`; });
           resultHtml += `</div>`;
         }
         if (report.warnings.length > 0) {
           resultHtml += `<div class="issue-group"><div class="issue-title text-yellow">Warnings</div>`;
           report.warnings.forEach(warn => { resultHtml += `<div class="issue-item"><span class="issue-icon text-yellow">●</span>${warn}</div>`; });
           resultHtml += `</div>`;
         }
         if (report.passed.length > 0) {
           resultHtml += `<div class="issue-group"><div class="issue-title text-green">Passed Checks</div>`;
           report.passed.forEach(pass => { resultHtml += `<div class="issue-item"><span class="issue-icon text-green">✓</span>${pass}</div>`; });
           resultHtml += `</div>`;
         }

         localAuditBody.innerHTML = resultHtml;
         localModal.style.display = 'flex';
       };
       
       // --- AI Audit Logic ---
       const runAiAudit = async () => {
          aiPanel.style.display = 'flex';
          aiContent.innerHTML = `
            <div class="ai-loading">
               <div class="spinner"></div>
               <p>Analyzing content with Gemini AI...</p>
            </div>
          `;
          
          try {
             // 1. Match current URL to project link
             const currentUrl = window.location.href;
             const currentPath = window.location.pathname;
             
             // Simple matching logic: exact match or contains
             let matchedLink = this.links.find(l => currentUrl.includes(l.url) || l.url.includes(currentPath));
             // Fallback: if homepage, try finding link with '/' or base url
             if (!matchedLink && currentPath === '/') {
                 matchedLink = this.links.find(l => l.url.endsWith(window.location.hostname)); 
             }
             
             // 2. Scrape Content
             const textContent = document.body.innerText;
             
             // 3. Call API
             const response = await fetch(`${this.config.baseUrl}/api/audit`, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                    text: textContent,
                    url: currentUrl,
                    projectId: this.config.projectId,
                    linkId: matchedLink ? matchedLink.id : undefined
                 })
             });
             
             const result = await response.json();
             
             if (!result.success) {
                 throw new Error(result.error || 'Audit failed');
             }
             
             const data = result.data;
             
             // 4. Render Results
             let html = `
                <div class="score-container">
                    <div class="score-circle ${data.score >= 80 ? 'score-high' : data.score >= 50 ? 'score-med' : 'score-low'}">${data.score}</div>
                </div>
                <div class="ai-card">
                   <h4>Executive Summary</h4>
                   <p>${data.summary}</p>
                </div>
             `;
             
             if (data.strengths && data.strengths.length) {
                 html += `
                 <div class="ai-card" style="border-left: 3px solid #10b981;">
                    <h4 class="text-green">Strengths</h4>
                    <ul class="ai-list">
                       ${data.strengths.map(s => `<li>${s}</li>`).join('')}
                    </ul>
                 </div>`;
             }
             
             if (data.improvements && data.improvements.length) {
                 html += `
                 <div class="ai-card" style="border-left: 3px solid #f59e0b;">
                    <h4 class="text-yellow">Opportunities</h4>
                    <ul class="ai-list">
                       ${data.improvements.map(i => `<li>${i}</li>`).join('')}
                    </ul>
                 </div>`;
             }
             
             aiContent.innerHTML = html;

          } catch (err) {
             console.error(err);
             aiContent.innerHTML = `
                <div style="text-align: center; color: #ef4444; padding: 20px;">
                   <p>Analysis Failed</p>
                   <p style="font-size: 12px; opacity: 0.8;">${err.message}</p>
                </div>
             `;
          }
       };

       btn.addEventListener('click', toggleMenu);
       document.addEventListener('click', closeMenu);
       
       if (localAuditBtn) localAuditBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runLocalAudit();
       });
       
       if (aiAuditBtn) aiAuditBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runAiAudit(); // Close menu? No, keep context.
       });
       
       if (closeLocalAudit) closeLocalAudit.addEventListener('click', () => {
          localModal.style.display = 'none';
       });
       
       if (localModal) localModal.addEventListener('click', (e) => {
          if (e.target === localModal) localModal.style.display = 'none';
       });
       
       if (closeAi) closeAi.addEventListener('click', () => {
           aiPanel.style.display = 'none';
       });
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
