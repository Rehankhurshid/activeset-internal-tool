// Webflow Settings Auditor - Content Script
// Parses DOM on each Webflow settings tab to extract configuration state

console.log('[Auditor Content] Content script loaded');

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'parseCurrentTab') {
        const results = parseCurrentTab(request.tabName);
        sendResponse(results);
        return true;
    }
});

// Detect which tab we're on based on URL
function detectCurrentTab() {
    const path = window.location.pathname;
    if (path.includes('/general')) return 'general';
    if (path.includes('/publishing') || path.includes('/hosting')) return 'publishing';
    if (path.includes('/seo')) return 'seo';
    if (path.includes('/forms')) return 'forms';
    return 'unknown';
}

// Main parser dispatcher
function parseCurrentTab(tabName) {
    const detectedTab = tabName || detectCurrentTab();
    console.log('[Auditor Content] Parsing tab:', detectedTab);
    
    switch (detectedTab) {
        case 'general':
            return parseGeneralTab();
        case 'publishing':
            return parsePublishingTab();
        case 'seo':
            return parseSeoTab();
        case 'forms':
            return parseFormsTab();
        default:
            return { error: 'Unknown tab: ' + detectedTab };
    }
}

// ============================================
// GENERAL TAB PARSER
// ============================================
function parseGeneralTab() {
    console.log('[Auditor Content] Parsing General tab...');
    
    const results = {
        favicon32: false,
        favicon256: false,
        timezone: false,
        language: false,
        brandingBadge: false,
        brandingHtml: false
    };
    
    try {
        // Favicon 32x32: Check if there's a Delete/Remove button in the favicon section
        // The favicon section usually has "32 × 32" text nearby
        const faviconSection = findSectionByText('Favicon') || findSectionByText('32');
        if (faviconSection) {
            // Look for uploaded indicator (Delete button or image preview)
            const hasDelete = faviconSection.querySelector('button')?.textContent?.toLowerCase().includes('delete') ||
                              faviconSection.querySelector('[class*="delete"]') !== null;
            const hasImage = faviconSection.querySelector('img[src*="uploads"]') !== null ||
                             faviconSection.querySelector('[style*="background-image"]') !== null;
            results.favicon32 = hasDelete || hasImage;
        }
        
        // Webclip 256x256: Check for second upload in Icons section
        const webclipSection = findSectionByText('Webclip') || findSectionByText('256');
        if (webclipSection) {
            const hasDelete = webclipSection.querySelector('button')?.textContent?.toLowerCase().includes('delete') ||
                              webclipSection.querySelector('[class*="delete"]') !== null;
            const hasImage = webclipSection.querySelector('img[src*="uploads"]') !== null;
            results.favicon256 = hasDelete || hasImage;
        }
        
        // Timezone: Find the Localization section and check for select value
        const localizationSection = findSectionByText('Localization') || findSectionByText('time zone');
        if (localizationSection) {
            const select = localizationSection.querySelector('select');
            const button = localizationSection.querySelector('button[class*="select"], [role="combobox"]');
            // Check if a value is selected (not empty or default)
            if (select) {
                results.timezone = select.value && select.value !== '';
            } else if (button) {
                // Webflow uses custom dropdowns - check button text
                const buttonText = button.textContent.toLowerCase();
                results.timezone = buttonText && !buttonText.includes('choose') && !buttonText.includes('select');
            }
        }
        
        // Language code: Find input with language code value (usually 2-letter code)
        const langSection = findSectionByText('Language code') || findSectionByText('language');
        if (langSection) {
            const input = langSection.querySelector('input[type="text"], input:not([type])');
            if (input) {
                results.language = input.value && input.value.length >= 2;
            }
        }
        
        // Webflow branding toggles
        const brandingSection = findSectionByText('Webflow branding');
        if (brandingSection) {
            const toggles = findTogglesInSection(brandingSection);
            // First toggle: "Made in Webflow" badge - should be OFF
            // Second toggle: "Webflow branding in HTML" - should be OFF
            if (toggles.length >= 1) {
                results.brandingBadge = !toggles[0]; // Pass if unchecked
            }
            if (toggles.length >= 2) {
                results.brandingHtml = !toggles[1]; // Pass if unchecked
            }
        }
        
    } catch (e) {
        console.error('[Auditor Content] General parse error:', e);
        results.error = e.message;
    }
    
    console.log('[Auditor Content] General results:', results);
    return results;
}

// ============================================
// PUBLISHING TAB PARSER
// ============================================
function parsePublishingTab() {
    console.log('[Auditor Content] Parsing Publishing tab...');
    
    const results = {
        defaultDomainWww: false,
        redirectsExist: false,
        minifyHtml: false,
        minifyCss: false,
        minifyJs: false,
        hstsSubdomains: false,
        hstsPreload: false,
        secureFrameHeaders: true // Default true, should be false to pass
    };
    
    try {
        // Default domain is www: Look for "Default" badge on www domain
        const productionSection = findSectionByText('Production');
        if (productionSection) {
            // Find domain rows with "Default" label
            const domainText = productionSection.textContent || '';
            // Check if www domain has the Default badge
            const hasWwwDefault = domainText.includes('www.') && domainText.toLowerCase().includes('default');
            results.defaultDomainWww = hasWwwDefault;
        }
        
        // 301 Redirects: Check if redirect table has rows
        const redirectSection = findSectionByText('301 redirects');
        if (redirectSection) {
            // Look for table rows or redirect items
            const rows = redirectSection.querySelectorAll('tr, [class*="redirect-row"], [class*="row"]');
            // Filter out header row
            const dataRows = Array.from(rows).filter(row => {
                const text = row.textContent || '';
                return !text.includes('Old path') && !text.includes('New path') && text.trim().length > 0;
            });
            results.redirectsExist = dataRows.length > 0;
        }
        
        // Advanced publishing options
        const advancedSection = findSectionByText('Advanced publishing options');
        if (advancedSection) {
            // Get all toggles in this section
            const allToggles = findAllTogglesWithLabels(advancedSection);
            
            // Map toggles by label
            allToggles.forEach(toggle => {
                const label = toggle.label.toLowerCase();
                if (label.includes('minify html')) {
                    results.minifyHtml = toggle.checked;
                } else if (label.includes('minify css')) {
                    results.minifyCss = toggle.checked;
                } else if (label.includes('minify js')) {
                    results.minifyJs = toggle.checked;
                } else if (label.includes('hsts') && label.includes('subdomain')) {
                    results.hstsSubdomains = toggle.checked;
                } else if (label.includes('hsts') && label.includes('preload')) {
                    results.hstsPreload = toggle.checked;
                } else if (label.includes('secure frame') || label.includes('frame header')) {
                    results.secureFrameHeaders = toggle.checked;
                }
            });
            
            // Fallback: Parse toggles by position if labels didn't match
            if (!results.minifyHtml && !results.minifyCss) {
                const toggles = findTogglesInSection(advancedSection);
                // Order based on screenshot:
                // 0: Async JS, 1: Minify HTML, 2: Minify CSS, 3: Minify JS, 4: Per page CSS
                // 5: HSTS subdomains, 6: HSTS preload, 7: Secure frame headers
                if (toggles.length >= 8) {
                    results.minifyHtml = toggles[1];
                    results.minifyCss = toggles[2];
                    results.minifyJs = toggles[3];
                    results.hstsSubdomains = toggles[5];
                    results.hstsPreload = toggles[6];
                    results.secureFrameHeaders = toggles[7];
                }
            }
        }
        
    } catch (e) {
        console.error('[Auditor Content] Publishing parse error:', e);
        results.error = e.message;
    }
    
    console.log('[Auditor Content] Publishing results:', results);
    return results;
}

// ============================================
// SEO TAB PARSER
// ============================================
function parseSeoTab() {
    console.log('[Auditor Content] Parsing SEO tab...');
    
    const results = {
        subdomainIndexingOff: false,
        autoSitemap: false,
        canonicalUrl: false
    };
    
    try {
        // Subdomain indexing: Should be OFF (disabled)
        const indexingSection = findSectionByText('Indexing');
        if (indexingSection) {
            const toggles = findTogglesInSection(indexingSection);
            // The toggle for "Webflow subdomain indexing" - if OFF, indexing is disabled (good)
            if (toggles.length >= 1) {
                // Toggle OFF = indexing disabled = pass
                results.subdomainIndexingOff = !toggles[0];
            }
        }
        
        // Auto-generate sitemap: Should be ON
        const sitemapSection = findSectionByText('Sitemap');
        if (sitemapSection) {
            const toggles = findTogglesInSection(sitemapSection);
            if (toggles.length >= 1) {
                results.autoSitemap = toggles[0];
            }
        }
        
        // Global canonical URL: Should be set and start with https://www.
        const canonicalSection = findSectionByText('Global canonical tag URL');
        if (canonicalSection) {
            const input = canonicalSection.querySelector('input[type="text"], input:not([type])');
            if (input && input.value) {
                const url = input.value.trim().toLowerCase();
                results.canonicalUrl = url.startsWith('https://www.');
            }
        }
        
    } catch (e) {
        console.error('[Auditor Content] SEO parse error:', e);
        results.error = e.message;
    }
    
    console.log('[Auditor Content] SEO results:', results);
    return results;
}

// ============================================
// FORMS TAB PARSER (Optional)
// ============================================
function parseFormsTab() {
    console.log('[Auditor Content] Parsing Forms tab...');
    
    const results = {
        configured: false
    };
    
    // Placeholder - forms tab parsing if needed later
    return results;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Find a section container by looking for H2/H3 heading with text
 */
function findSectionByText(text) {
    const headings = document.querySelectorAll('h1, h2, h3, h4, [class*="heading"], [class*="title"]');
    for (const heading of headings) {
        if (heading.textContent.toLowerCase().includes(text.toLowerCase())) {
            // Return the parent section/container
            let container = heading.parentElement;
            // Walk up to find a meaningful container (usually 2-3 levels up)
            for (let i = 0; i < 4 && container; i++) {
                if (container.tagName === 'SECTION' || 
                    container.classList.toString().includes('section') ||
                    container.classList.toString().includes('card') ||
                    container.classList.toString().includes('group')) {
                    return container;
                }
                container = container.parentElement;
            }
            // Fallback: return parent's parent
            return heading.parentElement?.parentElement || heading.parentElement;
        }
    }
    return null;
}

/**
 * Find all checkbox toggles within a section
 * Returns array of boolean values (checked state)
 */
function findTogglesInSection(section) {
    if (!section) return [];
    
    const checkboxes = section.querySelectorAll('input[type="checkbox"]');
    return Array.from(checkboxes).map(cb => cb.checked);
}

/**
 * Find toggles with their labels within a section
 */
function findAllTogglesWithLabels(section) {
    if (!section) return [];
    
    const results = [];
    const checkboxes = section.querySelectorAll('input[type="checkbox"]');
    
    checkboxes.forEach(checkbox => {
        // Try to find associated label
        let label = '';
        
        // Check for label element with 'for' attribute
        if (checkbox.id) {
            const labelEl = document.querySelector(`label[for="${checkbox.id}"]`);
            if (labelEl) label = labelEl.textContent;
        }
        
        // Check parent/siblings for label text
        if (!label) {
            const container = checkbox.closest('div, label');
            if (container) {
                // Look for text in siblings
                const siblings = container.parentElement?.children || [];
                for (const sibling of siblings) {
                    if (sibling !== container && sibling.textContent) {
                        const text = sibling.textContent.trim();
                        if (text && text.length < 100) {
                            label = text;
                            break;
                        }
                    }
                }
            }
        }
        
        // Fallback: look for nearby text
        if (!label) {
            let parent = checkbox.parentElement;
            for (let i = 0; i < 3 && parent; i++) {
                const text = parent.textContent?.trim() || '';
                if (text.length > 0 && text.length < 100) {
                    // Clean up the text
                    label = text.replace(/\s+/g, ' ').split(/On|Off/i)[0].trim();
                    break;
                }
                parent = parent.parentElement;
            }
        }
        
        results.push({
            checked: checkbox.checked,
            label: label || 'Unknown',
            element: checkbox
        });
    });
    
    return results;
}

/**
 * Debug helper - log all found elements
 */
function debugLogElements() {
    console.log('[Auditor Content] Debug - All H2 sections:');
    document.querySelectorAll('h2').forEach(h2 => {
        console.log(' - ', h2.textContent.trim());
    });
    
    console.log('[Auditor Content] Debug - All checkboxes:');
    document.querySelectorAll('input[type="checkbox"]').forEach((cb, i) => {
        console.log(` ${i}: checked=${cb.checked}, id=${cb.id}`);
    });
}

// Auto-run debug on load (for testing)
// setTimeout(debugLogElements, 2000);
