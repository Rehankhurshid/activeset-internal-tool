// Webflow Settings Auditor - Background Service Worker
// Handles side panel management, tab navigation orchestration, and the pairing
// with app.activeset.co that authenticates the project list and result saving.

// Fallback only — once paired, the apiBase pushed in by the app wins.
const API_BASE = 'https://app.activeset.co';
// const API_BASE = 'http://localhost:3000'; // For development

/* --------------------------------------------------------------------------
   Pairing.

   /api/projects and /api/webflow-settings require a per-person token. The
   Internal Tools page mints one for whoever is signed in there and pushes it in
   over onMessageExternal (bottom of this file). It lives in chrome.storage.local
   and goes out as a bearer header — nothing is ever typed into this extension.
   -------------------------------------------------------------------------- */
const NOT_PAIRED_ERROR =
    'Not paired — open Internal Tools in the app and click "Pair with this browser".';

async function savePairing({ token, apiBase, pairedAs }) {
    await chrome.storage.local.set({
        extToken: token,
        apiBase: apiBase || API_BASE,
        pairedAs: pairedAs || null,
        pairedAt: new Date().toISOString()
    });
}

async function clearPairing() {
    await chrome.storage.local.remove(['extToken', 'pairedAs', 'pairedAt']);
}

async function getPairing() {
    const s = await chrome.storage.local.get(['extToken', 'apiBase', 'pairedAs', 'pairedAt']);
    return {
        paired: !!s.extToken,
        token: s.extToken || null,
        apiBase: s.apiBase || API_BASE,
        pairedAs: s.pairedAs || null,
        pairedAt: s.pairedAt || null
    };
}

// fetch() against the app with the pairing token. Resolves to null when there
// is no token, or when the server no longer accepts it, and the caller turns
// that into a needsPairing result. A 401 means the token is gone server-side
// (unpaired from the app, or revoked), so the stale local copy is dropped too.
async function fetchAuthed(path, init = {}) {
    const { token, apiBase } = await getPairing();
    if (!token) return null;

    const response = await fetch(`${apiBase}${path}`, {
        ...init,
        headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` }
    });

    if (response.status === 401) {
        await clearPairing();
        return null;
    }
    if (response.status === 403) return null;
    return response;
}

const needsPairing = () => ({ success: false, error: NOT_PAIRED_ERROR, needsPairing: true });

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
    await chrome.sidePanel.open({ tabId: tab.id });
});

// Set side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Message handler for side panel and content script communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startAudit') {
        handleAudit(request.tabId).then(sendResponse);
        return true; // Keep channel open for async
    }
    
    if (request.action === 'fetchProjects') {
        fetchProjects().then(sendResponse);
        return true;
    }
    
    if (request.action === 'saveResults') {
        saveResults(request.data).then(sendResponse);
        return true;
    }
    
    if (request.action === 'checkWebflowPage') {
        checkWebflowPage(request.tabId).then(sendResponse);
        return true;
    }

    // The side panel only needs to know whether it is paired and where the app
    // lives; the token itself stays in the worker.
    if (request.action === 'getPairing') {
        getPairing().then(({ paired, apiBase, pairedAs, pairedAt }) =>
            sendResponse({ paired, apiBase, pairedAs, pairedAt })
        );
        return true;
    }
});

// Check if current tab is a Webflow settings page
async function checkWebflowPage(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        const url = tab.url || '';
        
        // Check if on Webflow dashboard sites page
        const match = url.match(/webflow\.com\/dashboard\/sites\/([^/]+)/);
        if (match) {
            return {
                isWebflow: true,
                siteSlug: match[1],
                currentTab: url.split('/').pop() || 'general'
            };
        }
        
        return { isWebflow: false };
    } catch (e) {
        console.error('[Auditor] checkWebflowPage error:', e);
        return { isWebflow: false, error: e.message };
    }
}

// Main audit orchestration
async function handleAudit(tabId) {
    console.log('[Auditor] Starting audit for tab:', tabId);
    
    try {
        const tab = await chrome.tabs.get(tabId);
        const baseUrlMatch = tab.url.match(/(https:\/\/webflow\.com\/dashboard\/sites\/[^/]+)/);
        
        if (!baseUrlMatch) {
            return { error: 'Not on a Webflow project settings page' };
        }
        
        const baseUrl = baseUrlMatch[1];
        const siteSlug = baseUrl.split('/').pop();
        
        const results = {
            siteSlug,
            general: null,
            publishing: null,
            seo: null,
            auditDate: new Date().toISOString()
        };
        
        // Tab navigation order
        const tabs = [
            { name: 'general', path: '/general' },
            { name: 'publishing', path: '/publishing' },
            { name: 'seo', path: '/seo' }
        ];
        
        for (const tabConfig of tabs) {
            // Navigate to tab
            const targetUrl = baseUrl + tabConfig.path;
            console.log(`[Auditor] Navigating to ${tabConfig.name}:`, targetUrl);
            
            // Update tab URL
            await chrome.tabs.update(tabId, { url: targetUrl });
            
            // Wait for page to load
            await waitForPageLoad(tabId);
            
            // Wait for Webflow's client-side content to fully render
            // This waits for loading spinner to disappear and actual content to appear
            await waitForContentReady(tabId);
            
            // Execute content script and get results
            try {
                const [{ result }] = await chrome.scripting.executeScript({
                    target: { tabId },
                    files: ['content.js']
                });
                
                // Now send message to get parsed data
                const tabResults = await chrome.tabs.sendMessage(tabId, { 
                    action: 'parseCurrentTab',
                    tabName: tabConfig.name
                });
                
                results[tabConfig.name] = tabResults;
                console.log(`[Auditor] ${tabConfig.name} results:`, tabResults);
                
            } catch (e) {
                console.error(`[Auditor] Error parsing ${tabConfig.name}:`, e);
                results[tabConfig.name] = { error: e.message };
            }
            
            // Send progress update to side panel
            chrome.runtime.sendMessage({
                action: 'auditProgress',
                tab: tabConfig.name,
                progress: (tabs.indexOf(tabConfig) + 1) / tabs.length * 100
            }).catch(() => {}); // Ignore if side panel not listening
        }
        
        // Calculate score
        const { passed, total } = calculateScore(results);
        results.score = Math.round((passed / total) * 100);
        results.passedCount = passed;
        results.totalCount = total;
        
        console.log('[Auditor] Audit complete:', results);
        return results;
        
    } catch (e) {
        console.error('[Auditor] Audit error:', e);
        return { error: e.message };
    }
}

// Wait for tab to finish loading
function waitForPageLoad(tabId) {
    return new Promise((resolve) => {
        const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
        
        // Timeout after 10 seconds
        setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
        }, 10000);
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Wait for Webflow content to fully load (loading spinner to disappear)
async function waitForContentReady(tabId, maxWaitMs = 15000) {
    console.log('[Auditor] Waiting for content to be ready...');
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
        try {
            // Execute a check to see if content is loaded
            const [{ result }] = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    // Check for loading spinner
                    const hasLoadingSpinner = 
                        document.querySelector('[class*="loading"], [class*="spinner"], .wf-loading') !== null ||
                        document.querySelector('svg[class*="spin"], [class*="loader"]') !== null;
                    
                    // Check if there's actual content (H2 headings or form elements)
                    const hasContent = 
                        document.querySelectorAll('h2').length > 1 ||
                        document.querySelectorAll('input[type="checkbox"]').length > 0;
                    
                    // Check for the main content area
                    const hasMainContent = 
                        document.querySelector('[class*="settings"], [class*="content"], main') !== null;
                    
                    return {
                        hasLoadingSpinner,
                        hasContent,
                        hasMainContent,
                        isReady: hasContent && !hasLoadingSpinner
                    };
                }
            });
            
            console.log('[Auditor] Content check:', result);
            
            if (result.isReady) {
                console.log('[Auditor] Content is ready!');
                // Extra small delay for any final rendering
                await sleep(500);
                return true;
            }
        } catch (e) {
            console.log('[Auditor] Content check error:', e.message);
        }
        
        // Wait before checking again
        await sleep(500);
    }
    
    console.log('[Auditor] Content wait timeout, proceeding anyway');
    // Final fallback wait
    await sleep(2000);
    return false;
}

// Calculate audit score
function calculateScore(results) {
    let passed = 0;
    let total = 0;
    
    // General checks
    if (results.general && !results.general.error) {
        const g = results.general;
        const checks = [
            g.favicon32, g.favicon256, g.timezone, g.language,
            g.brandingBadge, g.brandingHtml
        ];
        checks.forEach(c => {
            total++;
            if (c === true) passed++;
        });
    }
    
    // Publishing checks
    if (results.publishing && !results.publishing.error) {
        const p = results.publishing;
        const checks = [
            p.defaultDomainWww, p.redirectsExist,
            p.minifyHtml, p.minifyCss, p.minifyJs,
            p.hstsSubdomains, p.hstsPreload, p.secureFrameHeaders === false
        ];
        checks.forEach(c => {
            total++;
            if (c === true) passed++;
        });
    }
    
    // SEO checks
    if (results.seo && !results.seo.error) {
        const s = results.seo;
        const checks = [
            s.subdomainIndexingOff, s.autoSitemap, s.canonicalUrl
        ];
        checks.forEach(c => {
            total++;
            if (c === true) passed++;
        });
    }
    
    return { passed, total: total || 17 }; // Default to 17 if no results
}

// Fetch projects from API (needs pairing)
async function fetchProjects() {
    try {
        const response = await fetchAuthed('/api/projects');
        if (!response) return needsPairing();
        if (!response.ok) throw new Error('Failed to fetch projects');
        const data = await response.json();
        return { success: true, projects: data.projects || [] };
    } catch (e) {
        console.error('[Auditor] fetchProjects error:', e);
        return { success: false, error: e.message };
    }
}

// Save results to API (needs pairing)
async function saveResults(data) {
    try {
        const response = await fetchAuthed('/api/webflow-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response) return needsPairing();
        if (!response.ok) throw new Error('Failed to save results');
        const result = await response.json();
        return { success: true, ...result };
    } catch (e) {
        console.error('[Auditor] saveResults error:', e);
        return { success: false, error: e.message };
    }
}

/* --------------------------------------------------------------------------
   Messages from app.activeset.co (allowed by externally_connectable).

   Two things only: answer "are you installed?" so the Internal Tools page can
   show real status, and accept a pairing token the page just minted for the
   signed-in person. Nothing else is reachable from a web page, and the token is
   only ever pushed in — the page cannot read one back out.
   -------------------------------------------------------------------------- */
const PAIRING_ORIGINS = ['https://app.activeset.co', 'http://localhost:3000'];

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
    const origin = sender.origin || (sender.url ? new URL(sender.url).origin : '');
    if (!PAIRING_ORIGINS.includes(origin)) {
        sendResponse({ ok: false, error: 'Origin not allowed' });
        return false;
    }

    if (msg && msg.type === 'PING') {
        sendResponse({
            ok: true,
            installed: true,
            version: chrome.runtime.getManifest().version,
            name: chrome.runtime.getManifest().name
        });
        return false;
    }

    if (msg && msg.type === 'PAIR') {
        savePairing({
            token: msg.token,
            apiBase: msg.apiBase || origin,
            pairedAs: msg.pairedAs
        })
            .then(() => sendResponse({ ok: true }))
            .catch((err) => sendResponse({ ok: false, error: err.message }));
        return true;
    }

    if (msg && msg.type === 'UNPAIR') {
        clearPairing()
            .then(() => sendResponse({ ok: true }))
            .catch((err) => sendResponse({ ok: false, error: err.message }));
        return true;
    }

    sendResponse({ ok: false, error: 'Unknown message' });
    return false;
});

console.log('[Auditor] Background service worker loaded');
