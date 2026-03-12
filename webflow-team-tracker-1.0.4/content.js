// Content Script for Webflow Team Tracker
// Runs on webflow.com/* and *.design.webflow.com/* to detect login state and current project/page

(function() {
  'use strict';

  const API_BASE = 'https://app.activeset.co';
  const LOGIN_CHECK_DEBOUNCE_MS = 400;
  const LOGIN_WARNING_REFRESH_MS = 5000;

  let lastEmail = null;
  let lastProject = null;
  let isInitialized = false;
  let intervalId = null;
  let loginCheckTimeoutId = null;
  let loginWarningRefreshId = null;
  let loginWarningUi = null;
  let loginSessionStatus = {
    email: '',
    state: 'idle',
    session: null,
    acknowledged: false
  };

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
    if (loginCheckTimeoutId) {
      clearTimeout(loginCheckTimeoutId);
      loginCheckTimeoutId = null;
    }
    if (loginWarningRefreshId) {
      clearInterval(loginWarningRefreshId);
      loginWarningRefreshId = null;
    }
    console.log('[Webflow Tracker] Cleaned up - please reload the page');
  }

  function getLoginEmailInput() {
    return document.getElementById('email-input');
  }

  function getLoginSubmitButton() {
    return document.querySelector('button[type="submit"]');
  }

  function getLoginForm() {
    const emailInput = getLoginEmailInput();
    return emailInput?.closest('form') || null;
  }

  function ensureLoginWarningUi() {
    const emailInput = getLoginEmailInput();
    if (!emailInput) return null;

    if (loginWarningUi?.container?.isConnected) {
      return loginWarningUi;
    }

    const container = document.createElement('div');
    container.setAttribute('data-activeset-login-warning', 'true');
    container.style.display = 'none';
    container.style.marginTop = '8px';
    container.style.padding = '10px 12px';
    container.style.borderRadius = '8px';
    container.style.fontSize = '12px';
    container.style.lineHeight = '1.45';
    container.style.fontFamily = 'Inter, system-ui, sans-serif';
    container.style.border = '1px solid rgba(255,255,255,0.12)';
    container.style.background = 'rgba(17, 24, 39, 0.92)';
    container.style.color = '#e5e7eb';

    const title = document.createElement('div');
    title.style.fontWeight = '600';
    title.style.marginBottom = '2px';

    const detail = document.createElement('div');
    detail.style.color = 'rgba(229, 231, 235, 0.82)';

    container.appendChild(title);
    container.appendChild(detail);

    const target = emailInput.closest('[data-sc="FormGroup Stack"]') || emailInput.parentElement;
    target?.appendChild(container);

    loginWarningUi = { container, title, detail };
    return loginWarningUi;
  }

  function setLoginWarning(type, titleText = '', detailText = '') {
    const ui = ensureLoginWarningUi();
    if (!ui) return;

    if (!titleText && !detailText) {
      ui.container.style.display = 'none';
      return;
    }

    const styles = {
      info: {
        border: '1px solid rgba(96, 165, 250, 0.35)',
        background: 'rgba(30, 64, 175, 0.18)',
        title: '#bfdbfe',
      },
      success: {
        border: '1px solid rgba(74, 222, 128, 0.35)',
        background: 'rgba(21, 128, 61, 0.16)',
        title: '#86efac',
      },
      warning: {
        border: '1px solid rgba(251, 191, 36, 0.4)',
        background: 'rgba(146, 64, 14, 0.18)',
        title: '#fde68a',
      },
      error: {
        border: '1px solid rgba(248, 113, 113, 0.4)',
        background: 'rgba(127, 29, 29, 0.2)',
        title: '#fca5a5',
      }
    };

    const currentStyle = styles[type] || styles.info;
    ui.container.style.display = 'block';
    ui.container.style.border = currentStyle.border;
    ui.container.style.background = currentStyle.background;
    ui.title.style.color = currentStyle.title;
    ui.title.textContent = titleText;
    ui.detail.textContent = detailText;
  }

  function updateLoginButtonState() {
    const button = getLoginSubmitButton();
    if (!button) return;

    button.removeAttribute('title');

    if (loginSessionStatus.state === 'in_use' && !loginSessionStatus.acknowledged) {
      button.style.boxShadow = '0 0 0 2px rgba(251, 191, 36, 0.35)';
      button.setAttribute('title', 'This account is currently being used. Click once to acknowledge the warning, then click again to continue.');
      return;
    }

    button.style.boxShadow = '';
  }

  function resetLoginWarningState(nextEmail = '') {
    loginSessionStatus = {
      email: nextEmail,
      state: 'idle',
      session: null,
      acknowledged: false
    };
    setLoginWarning();
    updateLoginButtonState();
  }

  async function fetchTrackedSessions() {
    const response = await fetch(`${API_BASE}/api/webflow/session`);
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch tracked sessions');
    }
    return data.sessions || [];
  }

  function formatSessionDetail(session) {
    const user = session?.userName || 'Another teammate';
    const project = session?.projectPath || 'dashboard';
    return `${user} is currently using this account on ${project}.`;
  }

  async function checkLoginEmailUsage(force = false) {
    const emailInput = getLoginEmailInput();
    if (!emailInput) return;

    const email = emailInput.value.trim().toLowerCase();
    if (!email || !email.endsWith('@activeset.co')) {
      resetLoginWarningState(email);
      return;
    }

    if (!force && loginSessionStatus.email === email && loginSessionStatus.state !== 'idle') {
      return;
    }

    loginSessionStatus.email = email;
    loginSessionStatus.state = 'checking';
    loginSessionStatus.session = null;
    loginSessionStatus.acknowledged = false;
    setLoginWarning('info', 'Checking account status', 'Looking up whether this shared Webflow account is already active.');
    updateLoginButtonState();

    try {
      const sessions = await fetchTrackedSessions();
      const matchingSession = sessions.find((session) => session.email?.toLowerCase() === email);

      if (getLoginEmailInput()?.value.trim().toLowerCase() !== email) {
        return;
      }

      if (matchingSession) {
        loginSessionStatus.state = 'in_use';
        loginSessionStatus.session = matchingSession;
        setLoginWarning(
          'warning',
          'Account already in use',
          `${formatSessionDetail(matchingSession)} Clicking Login will likely replace their session.`
        );
      } else {
        loginSessionStatus.state = 'available';
        loginSessionStatus.session = null;
        setLoginWarning(
          'success',
          'Account looks available',
          'No active session is currently being tracked for this email.'
        );
      }
    } catch (error) {
      loginSessionStatus.state = 'error';
      loginSessionStatus.session = null;
      setLoginWarning(
        'error',
        'Could not verify account usage',
        'The tracker service did not respond. Login still works, but the shared-account warning is temporarily unavailable.'
      );
    } finally {
      updateLoginButtonState();
    }
  }

  function scheduleLoginEmailCheck() {
    if (loginCheckTimeoutId) {
      clearTimeout(loginCheckTimeoutId);
    }
    loginCheckTimeoutId = setTimeout(() => {
      checkLoginEmailUsage();
    }, LOGIN_CHECK_DEBOUNCE_MS);
  }

  function monitorLoginPageWarnings() {
    const emailInput = getLoginEmailInput();
    const form = getLoginForm();
    const submitButton = getLoginSubmitButton();

    if (!emailInput || !form || !submitButton || emailInput.dataset.activesetTracked === 'true') {
      return;
    }

    emailInput.dataset.activesetTracked = 'true';
    form.dataset.activesetTracked = 'true';

    ensureLoginWarningUi();

    emailInput.addEventListener('input', () => {
      scheduleLoginEmailCheck();
    });

    emailInput.addEventListener('blur', () => {
      checkLoginEmailUsage(true);
    });

    form.addEventListener('submit', async (event) => {
      if (loginSessionStatus.state === 'in_use' && !loginSessionStatus.acknowledged) {
        event.preventDefault();
        loginSessionStatus.acknowledged = true;
        setLoginWarning(
          'warning',
          'Account in use. Click Login again to continue.',
          `${formatSessionDetail(loginSessionStatus.session)} A second click will continue and may log them out.`
        );
        updateLoginButtonState();
      }
    }, true);

    submitButton.addEventListener('click', async () => {
      if (emailInput.value.trim().toLowerCase() !== loginSessionStatus.email) {
        scheduleLoginEmailCheck();
      }
    }, true);

    if (!loginWarningRefreshId) {
      loginWarningRefreshId = setInterval(() => {
        if (isOnLoginPage() && loginSessionStatus.email) {
          checkLoginEmailUsage(true);
        }
      }, LOGIN_WARNING_REFRESH_MS);
    }
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
      monitorLoginPageWarnings();
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
