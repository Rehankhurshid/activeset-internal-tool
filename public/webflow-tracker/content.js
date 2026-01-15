// Content Script for Webflow Team Tracker
// Runs on webflow.com/* and *.design.webflow.com/* to detect login state and current project/page

(function() {
  'use strict';

  let lastEmail = null;
  let lastProject = null;
  let isInitialized = false;

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
    console.log('[Webflow Tracker] Logout detected:', { previousEmail, reason });
    
    // Set state to 'logged_out' (different from 'no_tabs')
    await chrome.storage.local.set({ 
      currentEmail: null, 
      currentProject: null,
      sessionState: 'logged_out',
      lastLogoutReason: reason
    });
    
    if (previousEmail) {
      try {
        await chrome.runtime.sendMessage({
          type: 'LOGOUT_DETECTED',
          email: previousEmail,
          reason: reason
        });
      } catch (e) {
        console.error('[Webflow Tracker] Error sending logout message:', e);
      }
    }
    
    lastEmail = null;
    lastProject = null;
  }

  /**
   * Handle login/session update
   */
  async function handleLogin(email, project) {
    console.log('[Webflow Tracker] Session update:', { email, project });
    
    await chrome.storage.local.set({ 
      currentEmail: email, 
      currentProject: project,
      sessionState: 'active',
      lastLogoutReason: null
    });

    try {
      await chrome.runtime.sendMessage({
        type: 'SESSION_UPDATE',
        email: email,
        project: project
      });
    } catch (e) {
      console.error('[Webflow Tracker] Error sending session update:', e);
    }
    
    lastEmail = email;
    lastProject = project;
  }

  /**
   * Detect current state and notify background script
   */
  async function detectAndNotify() {
    const isLoggedOut = isOnLoginPage();
    
    if (isLoggedOut) {
      const stored = await chrome.storage.local.get(['currentEmail']);
      const emailToRelease = lastEmail || stored.currentEmail;
      
      // Check if this might be a force logout (kicked by another user)
      const url = window.location.href;
      const isKickedOut = url.includes('m=WW91') || url.includes('logged%20out');
      const reason = isKickedOut ? 'kicked' : 'manual';
      
      if (emailToRelease || lastEmail) {
        await handleLogout(emailToRelease, reason);
      } else {
        // Just on login page without prior session
        await chrome.storage.local.set({ sessionState: 'logged_out' });
      }
      return;
    }

    const email = extractEmail();
    const project = extractProjectAndPage();

    console.log('[Webflow Tracker] Detection:', { email, project, lastEmail, lastProject });

    if (email) {
      if (email !== lastEmail || project !== lastProject) {
        await handleLogin(email, project);
      }
    }
  }

  /**
   * Monitor logout button clicks
   */
  function monitorLogoutClicks() {
    document.addEventListener('click', async (e) => {
      const target = e.target.closest('a[href*="/dashboard/logout"], a[href*="logout"], button[aria-label*="logout" i]');
      const textContent = e.target.textContent?.toLowerCase() || '';
      
      if (target || textContent.includes('sign out')) {
        console.log('[Webflow Tracker] Logout click detected');
        const stored = await chrome.storage.local.get(['currentEmail']);
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
    isInitialized = true;
    
    console.log('[Webflow Team Tracker] Initializing on:', window.location.href);
    
    const stored = await chrome.storage.local.get(['currentEmail', 'currentProject']);
    lastEmail = stored.currentEmail;
    lastProject = stored.currentProject;
    
    setTimeout(detectAndNotify, 1000);
    monitorLogoutClicks();
    // Periodic check for changes
    setInterval(detectAndNotify, 2000);

    let lastUrl = window.location.href;
    const observer = new MutationObserver(() => {
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
