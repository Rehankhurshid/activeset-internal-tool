// Webflow Settings Auditor - Side Panel JavaScript
// Handles UI interactions, audit triggering, and result display

const API_BASE = 'https://app.activeset.co';
// const API_BASE = 'http://localhost:3000'; // For development

// State
let currentTabId = null;
let currentSiteSlug = null;
let auditResults = null;

// DOM Elements
const elements = {
    notWebflow: document.getElementById('notWebflow'),
    siteInfo: document.getElementById('siteInfo'),
    siteName: document.getElementById('siteName'),
    controls: document.getElementById('controls'),
    runAudit: document.getElementById('runAudit'),
    progress: document.getElementById('progress'),
    progressText: document.getElementById('progressText'),
    progressFill: document.getElementById('progressFill'),
    progressDetail: document.getElementById('progressDetail'),
    results: document.getElementById('results'),
    scoreCard: document.getElementById('scoreCard'),
    scoreNumber: document.getElementById('scoreNumber'),
    passedCount: document.getElementById('passedCount'),
    totalCount: document.getElementById('totalCount'),
    saveSection: document.getElementById('saveSection'),
    projectSelect: document.getElementById('projectSelect'),
    saveBtn: document.getElementById('saveBtn'),
    saveStatus: document.getElementById('saveStatus'),
    // Category badges
    generalBadge: document.getElementById('generalBadge'),
    publishingBadge: document.getElementById('publishingBadge'),
    seoBadge: document.getElementById('seoBadge')
};

// Initialize
async function init() {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab.id;
    
    // Check if on Webflow
    await checkCurrentPage();
    
    // Listen for tab changes
    chrome.tabs.onUpdated.addListener(handleTabUpdate);
    chrome.tabs.onActivated.addListener(handleTabActivated);
    
    // Listen for progress updates from background
    chrome.runtime.onMessage.addListener(handleMessage);
    
    // Event listeners
    elements.runAudit.addEventListener('click', startAudit);
    elements.projectSelect.addEventListener('change', handleProjectSelect);
    elements.saveBtn.addEventListener('click', saveResults);
}

// Check if current page is Webflow settings
async function checkCurrentPage() {
    const response = await chrome.runtime.sendMessage({
        action: 'checkWebflowPage',
        tabId: currentTabId
    });
    
    if (response.isWebflow) {
        currentSiteSlug = response.siteSlug;
        showWebflowUI(response.siteSlug);
    } else {
        showNotWebflowUI();
    }
}

function showWebflowUI(siteSlug) {
    elements.notWebflow.classList.add('hidden');
    elements.siteInfo.classList.remove('hidden');
    elements.controls.classList.remove('hidden');
    elements.siteName.textContent = siteSlug;
}

function showNotWebflowUI() {
    elements.notWebflow.classList.remove('hidden');
    elements.siteInfo.classList.add('hidden');
    elements.controls.classList.add('hidden');
    elements.results.classList.add('hidden');
}

// Handle tab updates
async function handleTabUpdate(tabId, changeInfo, tab) {
    if (tabId === currentTabId && changeInfo.status === 'complete') {
        await checkCurrentPage();
    }
}

async function handleTabActivated(activeInfo) {
    currentTabId = activeInfo.tabId;
    await checkCurrentPage();
}

// Handle messages from background
function handleMessage(request, sender, sendResponse) {
    if (request.action === 'auditProgress') {
        updateProgress(request.tab, request.progress);
    }
}

// Start audit
async function startAudit() {
    console.log('[SidePanel] Starting audit...');
    
    // Reset UI
    resetCheckItems();
    elements.controls.classList.add('hidden');
    elements.progress.classList.remove('hidden');
    elements.results.classList.add('hidden');
    elements.saveSection.classList.add('hidden');
    
    updateProgress('general', 0);
    
    try {
        const results = await chrome.runtime.sendMessage({
            action: 'startAudit',
            tabId: currentTabId
        });
        
        if (results.error) {
            showError(results.error);
            return;
        }
        
        auditResults = results;
        displayResults(results);
        
    } catch (e) {
        console.error('[SidePanel] Audit error:', e);
        showError(e.message);
    } finally {
        elements.progress.classList.add('hidden');
        elements.controls.classList.remove('hidden');
    }
}

// Update progress UI
function updateProgress(tabName, progress) {
    const tabLabels = {
        general: 'General Settings',
        publishing: 'Publishing Options',
        seo: 'SEO Settings'
    };
    
    elements.progressText.textContent = 'Scanning...';
    elements.progressDetail.textContent = `Checking ${tabLabels[tabName] || tabName}`;
    elements.progressFill.style.width = `${progress}%`;
}

// Reset check items to pending state
function resetCheckItems() {
    document.querySelectorAll('.check-item').forEach(item => {
        item.classList.remove('pass', 'fail');
        const icon = item.querySelector('.check-icon');
        icon.classList.remove('pass', 'fail');
        icon.classList.add('pending');
        icon.textContent = '○';
    });
    
    // Reset badges
    [elements.generalBadge, elements.publishingBadge, elements.seoBadge].forEach(badge => {
        badge.textContent = '-';
        badge.className = 'category-badge';
    });
}

// Display audit results
function displayResults(results) {
    elements.results.classList.remove('hidden');
    
    // Score
    const score = results.score || 0;
    elements.scoreNumber.textContent = score;
    elements.passedCount.textContent = results.passedCount || 0;
    elements.totalCount.textContent = results.totalCount || 17;
    
    // Score card color
    elements.scoreCard.classList.remove('warning', 'error');
    if (score < 50) {
        elements.scoreCard.classList.add('error');
    } else if (score < 80) {
        elements.scoreCard.classList.add('warning');
    }
    
    // General checks
    if (results.general) {
        updateCheckItem('favicon32', results.general.favicon32);
        updateCheckItem('favicon256', results.general.favicon256);
        updateCheckItem('timezone', results.general.timezone);
        updateCheckItem('language', results.general.language);
        updateCheckItem('brandingBadge', results.general.brandingBadge);
        updateCheckItem('brandingHtml', results.general.brandingHtml);
        updateCategoryBadge('general', elements.generalBadge, results.general);
    }
    
    // Publishing checks
    if (results.publishing) {
        updateCheckItem('defaultDomainWww', results.publishing.defaultDomainWww);
        updateCheckItem('redirectsExist', results.publishing.redirectsExist);
        updateCheckItem('minifyHtml', results.publishing.minifyHtml);
        updateCheckItem('minifyCss', results.publishing.minifyCss);
        updateCheckItem('minifyJs', results.publishing.minifyJs);
        updateCheckItem('hstsSubdomains', results.publishing.hstsSubdomains);
        updateCheckItem('hstsPreload', results.publishing.hstsPreload);
        // Secure frame headers should be OFF (false = pass)
        updateCheckItem('secureFrameHeaders', results.publishing.secureFrameHeaders === false);
        updateCategoryBadge('publishing', elements.publishingBadge, results.publishing);
    }
    
    // SEO checks
    if (results.seo) {
        updateCheckItem('subdomainIndexingOff', results.seo.subdomainIndexingOff);
        updateCheckItem('autoSitemap', results.seo.autoSitemap);
        updateCheckItem('canonicalUrl', results.seo.canonicalUrl);
        updateCategoryBadge('seo', elements.seoBadge, results.seo);
    }
    
    // Show save section
    elements.saveSection.classList.remove('hidden');
    loadProjects();
}

// Update individual check item
function updateCheckItem(id, passed) {
    const item = document.querySelector(`.check-item[data-id="${id}"]`);
    if (!item) return;
    
    const icon = item.querySelector('.check-icon');
    icon.classList.remove('pending', 'pass', 'fail');
    
    if (passed === true) {
        item.classList.add('pass');
        icon.classList.add('pass');
        icon.textContent = '✓';
    } else if (passed === false) {
        item.classList.add('fail');
        icon.classList.add('fail');
        icon.textContent = '✗';
    } else {
        // Unknown/error state
        icon.classList.add('pending');
        icon.textContent = '?';
    }
}

// Update category badge
function updateCategoryBadge(category, badge, results) {
    if (!results) return;
    
    let passed = 0;
    let total = 0;
    
    const checks = {
        general: ['favicon32', 'favicon256', 'timezone', 'language', 'brandingBadge', 'brandingHtml'],
        publishing: ['defaultDomainWww', 'redirectsExist', 'minifyHtml', 'minifyCss', 'minifyJs', 'hstsSubdomains', 'hstsPreload'],
        seo: ['subdomainIndexingOff', 'autoSitemap', 'canonicalUrl']
    };
    
    const categoryChecks = checks[category] || [];
    categoryChecks.forEach(key => {
        total++;
        let value = results[key];
        // Special case for secureFrameHeaders
        if (key === 'secureFrameHeaders') {
            value = results[key] === false;
        }
        if (value === true) passed++;
    });
    
    // Special handling for publishing secureFrameHeaders
    if (category === 'publishing' && results.secureFrameHeaders !== undefined) {
        total++;
        if (results.secureFrameHeaders === false) passed++;
    }
    
    badge.textContent = `${passed}/${total}`;
    badge.classList.remove('success', 'warning', 'error');
    
    if (passed === total) {
        badge.classList.add('success');
    } else if (passed >= total / 2) {
        badge.classList.add('warning');
    } else {
        badge.classList.add('error');
    }
}

// Load projects for save dropdown
async function loadProjects() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'fetchProjects' });
        
        if (response.success && response.projects) {
            elements.projectSelect.innerHTML = '<option value="">Select a project...</option>';
            response.projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                // Auto-select if site slug matches
                if (currentSiteSlug && project.name.toLowerCase().includes(currentSiteSlug.replace(/-/g, ' '))) {
                    option.selected = true;
                    elements.saveBtn.disabled = false;
                }
                elements.projectSelect.appendChild(option);
            });
        }
    } catch (e) {
        console.error('[SidePanel] Error loading projects:', e);
    }
}

function handleProjectSelect() {
    elements.saveBtn.disabled = !elements.projectSelect.value;
    elements.saveStatus.textContent = '';
}

// Save results to API
async function saveResults() {
    if (!auditResults || !elements.projectSelect.value) return;
    
    elements.saveBtn.disabled = true;
    elements.saveStatus.textContent = 'Saving...';
    elements.saveStatus.className = 'save-status';
    
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'saveResults',
            data: {
                projectId: elements.projectSelect.value,
                siteSlug: auditResults.siteSlug,
                auditDate: auditResults.auditDate,
                results: {
                    general: auditResults.general,
                    publishing: auditResults.publishing,
                    seo: auditResults.seo
                },
                score: auditResults.score,
                passedCount: auditResults.passedCount,
                totalCount: auditResults.totalCount
            }
        });
        
        if (response.success) {
            elements.saveStatus.textContent = '✓ Saved successfully!';
            elements.saveStatus.classList.add('success');
        } else {
            throw new Error(response.error || 'Failed to save');
        }
    } catch (e) {
        elements.saveStatus.textContent = '✗ ' + e.message;
        elements.saveStatus.classList.add('error');
    } finally {
        elements.saveBtn.disabled = false;
    }
}

// Show error message
function showError(message) {
    elements.progress.classList.add('hidden');
    elements.controls.classList.remove('hidden');
    alert('Audit Error: ' + message);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
