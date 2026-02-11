// Webflow Settings Auditor - Background Service Worker
// Handles side panel management and tab navigation orchestration

const API_BASE = 'https://app.activeset.co';
// const API_BASE = 'http://localhost:3000'; // For development

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

// Fetch projects from API
async function fetchProjects() {
    try {
        const response = await fetch(`${API_BASE}/api/projects`);
        if (!response.ok) throw new Error('Failed to fetch projects');
        const data = await response.json();
        return { success: true, projects: data.projects || [] };
    } catch (e) {
        console.error('[Auditor] fetchProjects error:', e);
        return { success: false, error: e.message };
    }
}

// Save results to API
async function saveResults(data) {
    try {
        const response = await fetch(`${API_BASE}/api/webflow-settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) throw new Error('Failed to save results');
        const result = await response.json();
        return { success: true, ...result };
    } catch (e) {
        console.error('[Auditor] saveResults error:', e);
        return { success: false, error: e.message };
    }
}

console.log('[Auditor] Background service worker loaded');
