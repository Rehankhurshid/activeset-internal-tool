// Popup Script for Webflow Team Tracker
// Shows all @activeset.co Webflow accounts and who is using each

// API endpoint - production URL
const API_BASE = 'https://app.activeset.co';

// Seed accounts - always shown (add more as needed)
const SEED_ACCOUNTS = [
  'rehan@activeset.co',
  'hello@activeset.co',
  'sanjay.rs@activeset.co',
  'arth@activeset.co'
];

// DOM Elements
const setupSection = document.getElementById('setup-section');
const yourStatusMini = document.getElementById('your-status-mini');
const nameInput = document.getElementById('name-input');
const saveNameBtn = document.getElementById('save-name-btn');
const yourNameMini = document.getElementById('your-name-mini');
const yourAccountMini = document.getElementById('your-account-mini');
const accountsList = document.getElementById('accounts-list');

// LocalStorage keys
const KNOWN_ACCOUNTS_KEY = 'knownActivesetAccounts';
const POPUP_REFRESH_MS = 2500;
const FORCE_SYNC_COOLDOWN_MS = 5000;

// State
let currentUserName = '';
let refreshInterval = null;
let refreshInFlight = false;
let lastForceSyncAt = 0;

/**
 * Initialize popup
 */
async function init() {
  const result = await chrome.storage.local.get(['userName', 'currentEmail', 'currentProject']);

  // Show user status
  if (result.userName) {
    currentUserName = result.userName;
    showStatus(result.userName, result.currentEmail, result.currentProject);
  } else {
    showSetup();
  }

  // Show loading state, then fetch from API
  renderAccountsList(SEED_ACCOUNTS, [], {}, true);
  await refreshAccountStatus();
  refreshInterval = setInterval(refreshAccountStatus, POPUP_REFRESH_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshAccountStatus();
    }
  });

  window.addEventListener('focus', () => {
    refreshAccountStatus();
  });

  window.addEventListener('online', () => {
    refreshAccountStatus();
  });
}

/**
 * Show setup section for name entry
 */
function showSetup() {
  setupSection.style.display = 'block';
  yourStatusMini.style.display = 'none';
}

/**
 * Show mini status bar
 */
function showStatus(name, email, project) {
  setupSection.style.display = 'none';
  yourStatusMini.style.display = 'flex';
  
  yourNameMini.textContent = name;
  
  if (email) {
    const emailPrefix = email.split('@')[0];
    yourAccountMini.textContent = `Using: ${emailPrefix}@...`;
    yourAccountMini.style.color = '#4ade80';
  } else {
    yourAccountMini.textContent = 'Not using';
    yourAccountMini.style.color = 'rgba(255, 255, 255, 0.5)';
  }
}

/**
 * Save user name
 */
saveNameBtn.addEventListener('click', async () => {
  const name = nameInput.value.trim();

  if (!name) {
    nameInput.style.border = '1px solid #f72585';
    return;
  }

  await chrome.storage.local.set({ userName: name });
  currentUserName = name;

  const result = await chrome.storage.local.get(['currentEmail', 'currentProject']);
  showStatus(name, result.currentEmail, result.currentProject);

  // If already logged into Webflow, sync the session with new name
  if (result.currentEmail) {
    await chrome.runtime.sendMessage({
      type: 'FORCE_SYNC',
      email: result.currentEmail,
      project: result.currentProject || 'dashboard'
    });
    await refreshAccountStatus();
  }
});

/**
 * Get known accounts from storage
 */
async function getKnownAccounts() {
  const result = await chrome.storage.local.get([KNOWN_ACCOUNTS_KEY]);
  return result[KNOWN_ACCOUNTS_KEY] || [];
}

/**
 * Save known accounts to storage
 */
async function saveKnownAccounts(accounts) {
  await chrome.storage.local.set({ [KNOWN_ACCOUNTS_KEY]: accounts });
}

/**
 * Fetch and display account status from API
 */
async function refreshAccountStatus() {
  if (refreshInFlight) {
    return;
  }

  refreshInFlight = true;

  try {
    const localData = await chrome.storage.local.get([
      'userName',
      'currentEmail',
      'currentProject',
      'sessionState'
    ]);
    const response = await fetch(`${API_BASE}/api/webflow/session`);
    const data = await response.json();

    if (data.success) {
      const sessions = data.sessions || [];
      const accountHistory = data.accountHistory || {};

      // Filter to only @activeset.co accounts
      let activesetSessions = sessions.filter(s =>
        s.email && s.email.endsWith('@activeset.co')
      );

      // Start with seed accounts
      let allAccounts = [...SEED_ACCOUNTS];

      // Get additional known accounts from storage
      const storedAccounts = await getKnownAccounts();
      storedAccounts.forEach(email => {
        if (!allAccounts.includes(email)) {
          allAccounts.push(email);
        }
      });

      // Add any new accounts discovered from sessions
      activesetSessions.forEach(s => {
        if (!allAccounts.includes(s.email)) {
          allAccounts.push(s.email);
        }
      });

      if (localData.currentEmail && localData.currentEmail.endsWith('@activeset.co')) {
        if (!allAccounts.includes(localData.currentEmail)) {
          allAccounts.push(localData.currentEmail);
        }
      }

      // Sort alphabetically
      allAccounts.sort();

      // Save new accounts (excluding seed) to storage for persistence
      const newAccounts = allAccounts.filter(a => !SEED_ACCOUNTS.includes(a));
      await saveKnownAccounts(newAccounts);

      activesetSessions = mergeLocalSession(activesetSessions, localData);
      maybeForceSyncLocalSession(activesetSessions, localData);

      // Render the accounts
      renderAccountsList(allAccounts, activesetSessions, accountHistory);
    }
  } catch (error) {
    console.error('Failed to fetch account status:', error);
    // Show seed + known accounts with no sessions
    const storedAccounts = await getKnownAccounts();
    const localData = await chrome.storage.local.get([
      'userName',
      'currentEmail',
      'currentProject',
      'sessionState'
    ]);
    const allAccounts = [...new Set([
      ...SEED_ACCOUNTS,
      ...storedAccounts,
      ...(localData.currentEmail ? [localData.currentEmail] : [])
    ])].sort();
    const fallbackSessions = mergeLocalSession([], localData);
    renderAccountsList(allAccounts, fallbackSessions, {});
  } finally {
    refreshInFlight = false;
  }
}

function mergeLocalSession(sessions, localData) {
  const localEmail = localData.currentEmail;
  const localUserName = localData.userName;
  const localProject = localData.currentProject || 'dashboard';
  const localIsActive = localData.sessionState !== 'logged_out';

  if (!localEmail || !localUserName || !localEmail.endsWith('@activeset.co') || !localIsActive) {
    return sessions;
  }

  const existingSession = sessions.find((session) => session.email === localEmail);
  if (existingSession) {
    return sessions;
  }

  return [
    ...sessions,
    {
      email: localEmail,
      userName: localUserName,
      projectPath: localProject,
      pendingSync: true
    }
  ];
}

function maybeForceSyncLocalSession(sessions, localData) {
  const localEmail = localData.currentEmail;
  const localUserName = localData.userName;
  const localProject = localData.currentProject || 'dashboard';
  const localIsActive = localData.sessionState !== 'logged_out';

  if (!localEmail || !localUserName || !localIsActive) {
    return;
  }

  const matchingSession = sessions.find((session) => session.email === localEmail);
  if (matchingSession && !matchingSession.pendingSync) {
    return;
  }

  const now = Date.now();
  if (now - lastForceSyncAt < FORCE_SYNC_COOLDOWN_MS) {
    return;
  }

  lastForceSyncAt = now;
  chrome.runtime.sendMessage({
    type: 'FORCE_SYNC',
    email: localEmail,
    project: localProject
  }).catch((error) => {
    console.error('Failed to force sync local session:', error);
  });
}

/**
 * Render the list of known accounts with current users
 * @param {string[]} knownAccounts - List of email addresses
 * @param {object[]} sessions - Active sessions from API
 * @param {Record<string, object>} accountHistory - Last manual logout history keyed by email
 * @param {boolean} isLoading - Whether we're still loading from API
 */
function renderAccountsList(knownAccounts, sessions, accountHistory = {}, isLoading = false) {
  // Create a map of email -> session for quick lookup
  const sessionMap = {};
  sessions.forEach(s => {
    sessionMap[s.email] = s;
  });

  if (knownAccounts.length === 0) {
    accountsList.innerHTML = `
      <div class="empty-state">
        No accounts discovered yet.<br>
        <small>Log into a Webflow @activeset.co account to start tracking.</small>
      </div>
    `;
    return;
  }

  accountsList.innerHTML = knownAccounts.map(email => {
    const session = sessionMap[email];
    const history = accountHistory[email];
    const isActive = !!session;
    const userName = session?.userName || null;
    const projectPath = session?.projectPath || null;
    const isPendingSync = !!session?.pendingSync;

    // Determine status - simple: if session exists, show username
    let statusText;
    let statusClass;
    if (isLoading) {
      statusText = '...';
      statusClass = 'empty';
    } else if (isActive) {
      statusText = escapeHtml(userName);
      statusClass = isPendingSync ? 'idle' : '';
    } else if (history?.lastUsedBy && history?.lastLogoutReason === 'manual') {
      statusText = `Last used by ${escapeHtml(history.lastUsedBy)}`;
      statusClass = 'idle';
    } else {
      statusText = 'No one using';
      statusClass = 'empty';
    }

    let secondaryDetail = '';
    if (projectPath) {
      secondaryDetail = `${escapeHtml(projectPath)}${isPendingSync ? ' • syncing' : ''}`;
    } else if (!isActive && history?.lastProjectPath && history?.lastLogoutReason === 'manual') {
      secondaryDetail = `Last project: ${escapeHtml(history.lastProjectPath)}`;
    }

    return `
      <div class="account-card ${isActive ? 'active' : ''}">
        <div>
          <div class="account-email">${escapeHtml(email)}</div>
          ${secondaryDetail ? `<div class="account-project">${secondaryDetail}</div>` : ''}
        </div>
        <div class="account-user">
          <span class="account-user-name ${statusClass}">
            ${statusText}
          </span>
          <span class="status-dot ${isActive ? 'active' : 'inactive'}"></span>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Listen for storage changes
chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.currentEmail || changes.currentProject || changes.userName) {
    const result = await chrome.storage.local.get(['userName', 'currentEmail', 'currentProject']);
    if (result.userName) {
      showStatus(result.userName, result.currentEmail, result.currentProject);
    }
    await refreshAccountStatus();
  }
});

// Initialize
init();
