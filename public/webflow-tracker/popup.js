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

// LocalStorage key for known accounts
const KNOWN_ACCOUNTS_KEY = 'knownActivesetAccounts';

// State
let currentUserName = '';
let refreshInterval = null;

/**
 * Initialize popup
 */
async function init() {
  const result = await chrome.storage.local.get(['userName', 'currentEmail', 'currentProject']);
  
  if (result.userName) {
    currentUserName = result.userName;
    showStatus(result.userName, result.currentEmail, result.currentProject);
  } else {
    showSetup();
  }

  await refreshAccountStatus();
  refreshInterval = setInterval(refreshAccountStatus, 5000);
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
  try {
    const response = await fetch(`${API_BASE}/api/webflow/session`);
    const data = await response.json();

    if (data.success) {
      const sessions = data.sessions || [];
      
      // Filter to only @activeset.co accounts
      const activesetSessions = sessions.filter(s => 
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
      
      // Also add current user's account if it's @activeset.co
      const localData = await chrome.storage.local.get(['currentEmail']);
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
      
      // Render the accounts
      renderAccountsList(allAccounts, activesetSessions);
    }
  } catch (error) {
    console.error('Failed to fetch account status:', error);
    // Show seed + known accounts with no sessions
    const storedAccounts = await getKnownAccounts();
    const allAccounts = [...new Set([...SEED_ACCOUNTS, ...storedAccounts])].sort();
    renderAccountsList(allAccounts, []);
  }
}

/**
 * Render the list of known accounts with current users
 */
function renderAccountsList(knownAccounts, sessions) {
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
    const isActive = !!session;
    const userName = session?.userName || null;
    const projectPath = session?.projectPath || null;
    
    // Check if session is fresh (within last 60 seconds)
    let isOnline = false;
    if (session?.lastActive) {
      const lastActiveMs = session.lastActive._seconds 
        ? session.lastActive._seconds * 1000 
        : (session.lastActive.seconds ? session.lastActive.seconds * 1000 : Date.now());
      isOnline = (Date.now() - lastActiveMs) < 60000;
    }

    return `
      <div class="account-card ${isActive ? 'active' : ''}">
        <div>
          <div class="account-email">${escapeHtml(email)}</div>
          ${projectPath ? `<div class="account-project">${escapeHtml(projectPath)}</div>` : ''}
        </div>
        <div class="account-user">
          <span class="account-user-name ${isActive ? '' : 'empty'}">
            ${isActive ? escapeHtml(userName) : 'No one using'}
          </span>
          <span class="status-dot ${isActive && isOnline ? 'active' : 'inactive'}"></span>
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
