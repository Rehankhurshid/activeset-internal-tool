(function () {
  "use strict";

  // Default configuration
  const defaultConfig = {
    theme: "dark",
    allowReordering: true,
    showModal: true,
    baseUrl: "https://active-set-internal-tool-production.up.railway.app", // Updated to production URL
    style: "dropdown", // Enforced
    position: "bottom-right", // Enforced
    showOnDomains: [], // array of domains to show on
  };

  // ProjectLinksWidget class
  class ProjectLinksWidget {
    constructor(container, config = {}) {
      // Check for .webflow.io domain
      const hostname = window.location.hostname;
      if (!hostname.endsWith('.webflow.io')) {
        // console.log("Project Links Widget: Disabled on this domain (" + hostname + ")");
        return;
      }

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
      try {
        if (this.config.projectId) {
          const data = await this.fetchProjectData();
          this.render(data);
        } else if (this.config.initialLinks) {
          this.render({ links: this.config.initialLinks });
        } else {
          // Silent fail or minimal log
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
      // Always render dropdown
      this.renderDropdown(data);
    }

    renderDropdown(data) {
      const links = data.links || [];
      if (links.length === 0) return;

      const positionStyles = {
        "bottom-right": "bottom: 20px; right: 20px;",
        // Other positions ignored
      };

      // Ensure container is fixed and positioned correctly
      this.container.style.cssText = `
        position: fixed; 
        z-index: 9999; 
        ${positionStyles["bottom-right"]}
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      `;

      this.container.innerHTML = `
        <div class="dropdown-widget-wrapper" style="position: relative;">
          <button class="dropdown-widget-button">
            <svg width="16" height="16" viewBox="0 0 547 367" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M183.01 366.66H6.78001C5.48149 366.66 4.21044 366.286 3.11833 365.584C2.02623 364.881 1.15919 363.88 0.620591 362.698C0.0819888 361.517 -0.105462 360.205 0.080613 358.92C0.266688 357.635 0.818414 356.43 1.67003 355.45L301.06 9.69001C303.691 6.64561 306.948 4.20417 310.608 2.53199C314.268 0.859824 318.246 -0.0037835 322.27 1.24596e-05H498.49C499.787 -0.000107337 501.058 0.372636 502.149 1.07387C503.241 1.77509 504.108 2.77528 504.648 3.95533C505.187 5.13539 505.376 6.44559 505.192 7.72999C505.008 9.01439 504.459 10.2189 503.61 11.2L204.22 356.96C201.59 360.006 198.333 362.45 194.673 364.124C191.013 365.797 187.035 366.663 183.01 366.66Z" fill="white"/>
              <path d="M452.63 366.66C427.7 366.66 403.79 356.756 386.162 339.128C368.534 321.5 358.63 297.59 358.63 272.66V178.66H452.63C477.56 178.66 501.47 188.564 519.098 206.192C536.727 223.82 546.63 247.73 546.63 272.66C546.63 297.59 536.727 321.5 519.098 339.128C501.47 356.756 477.56 366.66 452.63 366.66Z" fill="white"/>
            </svg>
            <span>Project Links</span>
            <svg viewBox="0 0 20 20" fill="currentColor" style="width: 16px; height: 16px;">
              <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/>
            </svg>
          </button>
          
          <div class="dropdown-widget-content">
            <div class="dropdown-header">
               <span>Quick Links</span>
               <span class="live-badge"><span class="dot"></span>Live</span>
            </div>
            ${links
              .map(
                (link) => `
              <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="dropdown-widget-link">
                <span>${link.title}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              </a>
            `
              )
              .join("")}
          </div>
        </div>

        <style>
          .dropdown-widget-button {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background-color: #1f2937;
            padding: 10px 16px;
            border: 1px solid #374151;
            cursor: pointer;
            border-radius: 8px;
            font-weight: 500;
            color: #fff;
            font-size: 14px;
            transition: all 0.2s ease;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          }
          
          .dropdown-widget-button:hover {
            background-color: #374151;
            transform: translateY(-1px);
            box-shadow: 0 6px 8px -1px rgba(0, 0, 0, 0.15);
          }
          
          .dropdown-widget-content {
            display: none;
            position: absolute;
            bottom: calc(100% + 12px);
            right: 0;
            background-color: #1f2937;
            min-width: 200px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            z-index: 10000;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid #374151;
            opacity: 0;
            transform: translateY(8px);
            transition: all 0.2s ease;
          }

          .dropdown-widget-wrapper:hover .dropdown-widget-content {
            display: block;
            opacity: 1;
            transform: translateY(0);
          }

          .dropdown-header {
            padding: 12px 16px;
            border-bottom: 1px solid #374151;
            font-size: 13px;
            font-weight: 600;
            color: #fff;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .live-badge {
            font-size: 10px;
            background: #374151;
            padding: 2px 6px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
            color: #9ca3af;
          }

          .dot {
            width: 6px;
            height: 6px;
            background: #10b981;
            border-radius: 50%;
          }

          .dropdown-widget-link {
            padding: 10px 16px;
            text-decoration: none;
            display: flex;
            align-items: center;
            justify-content: space-between;
            color: #fff;
            font-size: 14px;
            transition: background-color 0.2s;
            border-bottom: 1px solid #374151;
          }
          
          .dropdown-widget-link:last-child {
            border-bottom: none;
          }

          .dropdown-widget-link:hover {
            background-color: #374151;
            padding-left: 20px;
          }
        </style>
      `;
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
        // Ignore other style configs
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
        // Ignore other style configs
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
