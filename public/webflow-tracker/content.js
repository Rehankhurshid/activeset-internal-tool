// Content Script for Webflow Team Tracker
// Runs on webflow.com/* and *.design.webflow.com/* to detect login state and current project/page

(function() {
  'use strict';

  let lastEmail = null;
  let lastProject = null;
  let isInitialized = false;
  let intervalId = null;

  /**
   * Check if extension context is still valid
   */
  function isExtensionValid() {
    try {
      // This will throw if context is invalidated
      return !!chrome.runtime?.id;
    } catch (e) {
      return false;
    }
  }

  /**
   * Safe wrapper for chrome.storage.local.get
   */
  async function safeStorageGet(keys) {
    if (!isExtensionValid()) return {};
    try {
      return await chrome.storage.local.get(keys);
    } catch (e) {
      console.log('[Webflow Tracker] Extension context invalidated');
      cleanup();
      return {};
    }
  }

  /**
   * Safe wrapper for chrome.storage.local.set
   */
  async function safeStorageSet(data) {
    if (!isExtensionValid()) return;
    try {
      await chrome.storage.local.set(data);
    } catch (e) {
      console.log('[Webflow Tracker] Extension context invalidated');
      cleanup();
    }
  }

  /**
   * Safe wrapper for chrome.runtime.sendMessage
   */
  async function safeSendMessage(message) {
    if (!isExtensionValid()) return;
    try {
      await chrome.runtime.sendMessage(message);
    } catch (e) {
      console.log('[Webflow Tracker] Extension context invalidated');
      cleanup();
    }
  }

  /**
   * Cleanup when extension is invalidated
   */
  function cleanup() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    console.log('[Webflow Tracker] Cleaned up - please reload the page');
  }

  /**
   * Decode HTML entities in a string
   */
  function decodeHtmlEntities(text) {
    const decoder = document.createElement('div');
    decoder.innerHTML = text;
    return decoder.textContent || '';
  }

  /**
   * Extract email from Webflow's initial data script
   */
  function extractEmail() {
    try {
      const initialDataScript = document.getElementById('wf-initial-data');
      if (initialDataScript) {
        const decodedContent = decodeHtmlEntities(initialDataScript.textContent);
        const data = JSON.parse(decodedContent);
        
        const email = 
          data?.featureConfig?.identity?.privateAttributes?.email ||
          data?.hydrationData?.identity?.privateAttributes?.email ||
          data?.identity?.privateAttributes?.email;
          
        if (email) return email;
        
        const jsonStr = JSON.stringify(data);
        const emailMatch = jsonStr.match(/"email"\s*:\s*"([^"@]+@[^"]+)"/);
        if (emailMatch && emailMatch[1]) return emailMatch[1];
      }
    } catch (e) {
      console.error('[Webflow Tracker] Error extracting email:', e);
    }
    return null;
  }

  /**
   * Extract project and page from URL and DOM
   */
  function extractProjectAndPage() {
    const hostname = window.location.hostname;
    const path = window.location.pathname;
    const url = window.location.href;
    
    let project = 'dashboard';
    let page = null;
    
    // Designer subdomain (e.g., project-slug.design.webflow.com)
    if (hostname.includes('.design.webflow.com')) {
      project = hostname.split('.design.webflow.com')[0];
      
      const pageButton = document.querySelector('button[aria-label*="on page"]');
      if (pageButton && pageButton.getAttribute('aria-label')) {
        const ariaLabel = pageButton.getAttribute('aria-label');
        const pageMatch = ariaLabel.match(/on page (.+)$/);
        if (pageMatch && pageMatch[1]) {
          page = pageMatch[1];
        }
      }
      
      if (!page) {
        const pageSelectorBtn = document.querySelector('[data-automation-id="page-selector-button"]');
        if (pageSelectorBtn) {
          page = pageSelectorBtn.textContent?.trim();
        }
      }
      
      if (!page) {
        const pageIdMatch = url.match(/pageId=([^&]+)/);
        if (pageIdMatch) {
          page = `Page ${pageIdMatch[1].slice(0, 8)}...`;
        }
      }
      
      return page ? `${project} / ${page}` : project;
    }
    
    // Dashboard URLs
    if (hostname === 'webflow.com') {
      const designMatch = path.match(/\/design\/([^\/]+)/);
      if (designMatch) return designMatch[1];

      const sitesMatch = path.match(/\/dashboard\/sites\/([^\/]+)/);
      if (sitesMatch) return sitesMatch[1];

      const editorMatch = path.match(/\/editor\/([^\/]+)/);
      if (editorMatch) return editorMatch[1];

      const folderMatch = path.match(/\/dashboard\/folder\/([^?\/]+)/);
      if (folderMatch) return `folder: ${folderMatch[1].slice(0, 8)}`;
      
      if (path.includes('/dashboard')) {
        const workspaceMatch = url.match(/workspace=([^&]+)/);
        if (workspaceMatch) {
          return `dashboard (${workspaceMatch[1]})`;
        }
        return 'dashboard';
      }
    }
    
    return project;
  }

  /**
   * Check if user is on login page (logged out)
   */
  function isOnLoginPage() {
    const path = window.location.pathname;
    const url = window.location.href;
    
    if (path === '/login' || path.startsWith('/login')) return true;
    if (url.includes('/login?')) return true;
    
    const loginButton = document.querySelector('button[data-provider="google"]');
    if (loginButton) return true;
    
    const emailInput = document.getElementById('email-input');
    if (emailInput) return true;
    
    return false;
  }

  /**
   * Handle logout - differentiate between manual logout and kicked out
   */
  async function handleLogout(previousEmail, reason = 'manual') {
    if (!isExtensionValid()) return;
    
    console.log('[Webflow Tracker] Logout detected:', { previousEmail, reason });
    
    await safeStorageSet({ 
      currentEmail: null, 
      currentProject: null,
      sessionState: 'logged_out',
      lastLogoutReason: reason
    });
    
    if (previousEmail) {
      await safeSendMessage({
        type: 'LOGOUT_DETECTED',
        email: previousEmail,
        reason: reason
      });
    }
    
    lastEmail = null;
    lastProject = null;
  }

  /**
   * Handle login/session update
   */
  async function handleLogin(email, project) {
    if (!isExtensionValid()) return;
    
    console.log('[Webflow Tracker] Session update:', { email, project });
    
    await safeStorageSet({ 
      currentEmail: email, 
      currentProject: project,
      sessionState: 'active',
      lastLogoutReason: null
    });

    await safeSendMessage({
      type: 'SESSION_UPDATE',
      email: email,
      project: project
    });
    
    lastEmail = email;
    lastProject = project;
  }

  /**
   * Detect current state and notify background script
   */
  async function detectAndNotify() {
    if (!isExtensionValid()) {
      cleanup();
      return;
    }
    
    const isLoggedOut = isOnLoginPage();
    
    if (isLoggedOut) {
      const stored = await safeStorageGet(['currentEmail']);
      const emailToRelease = lastEmail || stored.currentEmail;
      
      const url = window.location.href;
      const isKickedOut = url.includes('m=WW91') || url.includes('logged%20out');
      const reason = isKickedOut ? 'kicked' : 'manual';
      
      if (emailToRelease || lastEmail) {
        await handleLogout(emailToRelease, reason);
      } else {
        await safeStorageSet({ sessionState: 'logged_out' });
      }
      return;
    }

    const email = extractEmail();
    const project = extractProjectAndPage();

    // Use detected email, or fall back to last known email for heartbeats
    const effectiveEmail = email || lastEmail;

    console.log('[Webflow Tracker] Detection:', { email, effectiveEmail, project, lastEmail, lastProject });

    if (effectiveEmail) {
      if (email && (email !== lastEmail || project !== lastProject)) {
        // Email detected and changed - send full session update
        await handleLogin(email, project);
      } else {
        // Same email/project OR using fallback - send heartbeat
        await safeSendMessage({
          type: 'HEARTBEAT',
          email: effectiveEmail,
          project: project || lastProject || 'dashboard'
        });
      }
    }
  }

  /**
   * Monitor logout button clicks
   */
  function monitorLogoutClicks() {
    document.addEventListener('click', async (e) => {
      if (!isExtensionValid()) return;
      
      const target = e.target.closest('a[href*="/dashboard/logout"], a[href*="logout"], button[aria-label*="logout" i]');
      const textContent = e.target.textContent?.toLowerCase() || '';
      
      if (target || textContent.includes('sign out')) {
        console.log('[Webflow Tracker] Logout click detected');
        const stored = await safeStorageGet(['currentEmail']);
        const emailToRelease = lastEmail || stored.currentEmail;
        if (emailToRelease) {
          await handleLogout(emailToRelease, 'manual');
        }
      }
    }, true);
  }

  /**
   * Initialize content script
   */
  async function init() {
    if (isInitialized) return;
    if (!isExtensionValid()) return;
    
    isInitialized = true;
    
    console.log('[Webflow Team Tracker] Initializing on:', window.location.href);
    
    const stored = await safeStorageGet(['currentEmail', 'currentProject']);
    lastEmail = stored.currentEmail;
    lastProject = stored.currentProject;
    
    setTimeout(detectAndNotify, 1000);
    monitorLogoutClicks();
    
    // Periodic check for changes
    intervalId = setInterval(detectAndNotify, 2000);

    let lastUrl = window.location.href;
    const observer = new MutationObserver(() => {
      if (!isExtensionValid()) {
        observer.disconnect();
        cleanup();
        return;
      }
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        console.log('[Webflow Tracker] URL changed:', lastUrl);
        setTimeout(detectAndNotify, 300);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    console.log('[Webflow Team Tracker] Content script ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
