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
      try {
        if (this.config.projectId) {
          const data = await this.fetchProjectData();
          this.render(data);
        } else if (this.config.initialLinks) {
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
        "bottom-right": "bottom: 0; right: 20px;", // Old style: attached to bottom
        "bottom-left": "bottom: 0; left: 20px;",
        "top-right": "top: 20px; right: 20px;",
        "top-left": "top: 20px; left: 20px;",
      };

      const dropdownPosition = this.config.position.includes("bottom")
        ? "bottom: 100%;"
        : "top: 100%;";

      // Ensure container is fixed and positioned correctly matches old style
      this.container.style.cssText = `
        position: fixed; 
        z-index: 9999; 
        padding-top: 10px;
        ${positionStyles["bottom-right"]}
      `;

      this.container.innerHTML = `
        <div class="dropdown-widget-container">
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
          
          <div class="dropdown-widget-content" style="display: none; position: absolute; ${dropdownPosition} right: 0; background-color: #1f2937; min-width: 160px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05); z-index: 1; border-radius: 6px; overflow: hidden;">
            ${links
              .map(
                (link) => `
              <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="dropdown-widget-link" style="padding: 12px 16px; text-decoration: none; display: block; color: #fff; font-size: 14px; transition: background-color 0.2s;">
                ${link.title}
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
            border: none;
            cursor: pointer;
            border-radius: 6px 6px 0 0;
            font-weight: 500;
            color: #fff;
            font-size: 14px;
            transition: background-color 0.2s;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }
          
          .dropdown-widget-button:hover,
          .dropdown-widget-link:hover {
            background-color: #374151 !important;
          }
          
          .dropdown-widget-container:hover .dropdown-widget-content {
            display: block !important;
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
