// Background Script for Webflow Team Tracker
// Handles heartbeat, session claiming, and API communication

// API endpoint - production URL
const API_BASE = 'https://app.activeset.co';

// Heartbeat interval - 30 seconds
const HEARTBEAT_INTERVAL_MINUTES = 0.5;

// Track last sent state to throttle API calls
let lastSentEmail = null;
let lastSentProject = null;
let lastSentTime = 0;

// Throttle heartbeats to max 1 per 3 seconds
const HEARTBEAT_THROTTLE_MS = 3000;

/**
 * Send session update to API (only if needed)
 */
async function sendSessionUpdate(action, email, project, force = false) {
  try {
    const result = await chrome.storage.local.get(['userName']);
    const userName = result.userName;

    if (!userName || !email) {
      console.log('[Webflow Tracker] Missing userName or email, skipping update');
      return;
    }

    // Throttle heartbeats - only send if 5+ seconds since last send
    const now = Date.now();
    if (action === 'heartbeat' && !force) {
      if (email === lastSentEmail && (now - lastSentTime) < HEARTBEAT_THROTTLE_MS) {
        // Skip - sent too recently
        return;
      }
    }

    const response = await fetch(`${API_BASE}/api/webflow/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        userName,
        projectPath: project || 'dashboard',
        action,
      }),
    });

    const data = await response.json();
    
    if (data.success) {
      console.log(`[Webflow Tracker] ${action} successful`);
      if (action === 'claim' || action === 'heartbeat') {
        lastSentEmail = email;
        lastSentProject = project;
        lastSentTime = Date.now();
      } else if (action === 'release') {
        lastSentEmail = null;
        lastSentProject = null;
        lastSentTime = 0;
      }
    } else {
      console.error('[Webflow Tracker] API error:', data.error);
    }
  } catch (error) {
    console.error('[Webflow Tracker] Network error:', error);
  }
}

/**
 * Handle heartbeat alarm
 * Only sends heartbeat if there's an active Webflow tab
 */
async function handleHeartbeat() {
  try {
    const tabs = await chrome.tabs.query({
      url: ['https://webflow.com/*', 'https://*.design.webflow.com/*']
    });

    // Only heartbeat if Webflow tab is open
    if (tabs.length > 0) {
      const result = await chrome.storage.local.get(['currentEmail', 'currentProject']);
      
      if (result.currentEmail) {
        await sendSessionUpdate('heartbeat', result.currentEmail, result.currentProject);
      }
    }
    // If no tabs, just don't heartbeat - but DON'T release the session
    // The session will be cleaned up by the server's stale session cleanup if inactive too long
  } catch (error) {
    console.error('[Webflow Tracker] Error in heartbeat:', error);
  }
}

/**
 * Handle messages from content script and popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Webflow Tracker] Received message:', message.type);

  switch (message.type) {
    case 'SESSION_UPDATE':
      // Always claim on session update (user is actively using Webflow)
      sendSessionUpdate('claim', message.email, message.project, true);
      break;

    case 'FORCE_SYNC':
      // Popup detected local session not in API - force a claim
      console.log('[Webflow Tracker] Force sync requested from popup');
      sendSessionUpdate('claim', message.email, message.project, true);
      break;

    case 'HEARTBEAT':
      // Content script heartbeat (every 2 seconds while tab is open)
      sendSessionUpdate('heartbeat', message.email, message.project, false);
      break;

    case 'LOGOUT_DETECTED':
    case 'LOGOUT_CLICKED':
      // ONLY release on actual logout (not tab close)
      if (message.email) {
        console.log('[Webflow Tracker] Logout detected, releasing session');
        sendSessionUpdate('release', message.email, null, true);
        // Clear local state
        chrome.storage.local.set({
          currentEmail: null,
          currentProject: null,
          sessionState: 'logged_out'
        });
      }
      break;
  }

  return true;
});

// NOTE: Removed tab close listeners - we don't release session when tab is closed
// Session persists until explicit logout or claimed by another user

/**
 * Setup heartbeat alarm - every 30 seconds
 */
chrome.alarms.create('heartbeat', {
  periodInMinutes: HEARTBEAT_INTERVAL_MINUTES,
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'heartbeat') {
    handleHeartbeat();
  }
});

/**
 * Handle extension installation/update
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Webflow Team Tracker] Extension installed/updated');
  // Don't clear session on install - preserve existing state
});

/**
 * Initial heartbeat on service worker startup
 */
handleHeartbeat();

console.log('[Webflow Team Tracker] Background script initialized');
