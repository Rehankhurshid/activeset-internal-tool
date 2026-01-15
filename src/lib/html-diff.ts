import * as cheerio from "cheerio";
import HtmlDiff from "htmldiff-js";

export interface HtmlDiffResult {
  diffHtml: string;
  stats: {
    additions: number;
    deletions: number;
  };
  baseUrl?: string;
  stylesheets: string[];
}

/**
 * Extract stylesheet links and inline styles from HTML head
 */
function extractStylesheets(html: string, baseUrl?: string): string[] {
  const $ = cheerio.load(html);
  const stylesheets: string[] = [];
  
  // Get external stylesheets
  $('link[rel="stylesheet"]').each((_, el) => {
    let href = $(el).attr("href");
    if (href) {
      // Make absolute if relative
      if (baseUrl && !href.startsWith("http") && !href.startsWith("//")) {
        try {
          href = new URL(href, baseUrl).href;
        } catch {
          // Keep original
        }
      }
      stylesheets.push(`<link rel="stylesheet" href="${href}">`);
    }
  });
  
  // Get inline styles
  $("style").each((_, el) => {
    const styleContent = $(el).html();
    if (styleContent) {
      stylesheets.push(`<style>${styleContent}</style>`);
    }
  });
  
  return stylesheets;
}

/**
 * Extract main content from HTML, removing navigation, header, footer, scripts, etc.
 */
function extractMainContent(html: string, baseUrl?: string): string {
  const $ = cheerio.load(html);
  
  // Remove elements that shouldn't be in the diff
  $("script, noscript, iframe").remove();
  
  // Remove navigation elements
  $("nav, header, footer").remove();
  $('[role="navigation"], [role="banner"], [role="contentinfo"]').remove();
  
  // Try to find main content area
  let mainContent = $("main").html() || $("article").html() || $('[role="main"]').html();
  
  // If no main/article, try common content containers
  if (!mainContent) {
    const contentSelectors = [
      ".content",
      ".main-content",
      ".page-content",
      "#content",
      "#main",
      ".container main",
      ".wrapper main",
    ];
    
    for (const selector of contentSelectors) {
      const content = $(selector).html();
      if (content && content.trim().length > 100) {
        mainContent = content;
        break;
      }
    }
  }
  
  // Fallback to body content
  if (!mainContent) {
    mainContent = $("body").html() || "";
  }
  
  // Clean up the content
  const $content = cheerio.load(`<div>${mainContent}</div>`);
  
  // Remove scripts from content
  $content("script").remove();
  
  // Make image sources absolute if we have a base URL
  if (baseUrl) {
    $content("img").each((_, el) => {
      const src = $content(el).attr("src");
      if (src && !src.startsWith("http") && !src.startsWith("data:")) {
        try {
          const absoluteUrl = new URL(src, baseUrl).href;
          $content(el).attr("src", absoluteUrl);
        } catch {
          // Keep original src if URL parsing fails
        }
      }
    });
    
    // Also handle background images in style attributes
    $content("[style*='url(']").each((_, el) => {
      const style = $content(el).attr("style");
      if (style) {
        const updatedStyle = style.replace(/url\(['"]?([^'")\s]+)['"]?\)/g, (match, url) => {
          if (url && !url.startsWith("http") && !url.startsWith("data:")) {
            try {
              const absoluteUrl = new URL(url, baseUrl).href;
              return `url('${absoluteUrl}')`;
            } catch {
              return match;
            }
          }
          return match;
        });
        $content(el).attr("style", updatedStyle);
      }
    });
  }
  
  // Remove empty whitespace-only text nodes and normalize spacing
  return $content("div").html()?.trim() || "";
}

/**
 * Count the number of additions and deletions in the diff HTML
 */
function countChanges(diffHtml: string): { additions: number; deletions: number } {
  const $ = cheerio.load(diffHtml);
  
  // htmldiff-js uses <ins> and <del> tags
  const additions = $("ins").length;
  const deletions = $("del").length;
  
  return { additions, deletions };
}

/**
 * Compute an inline HTML diff between two HTML strings.
 * Returns merged HTML with <del> tags for removed content and <ins> tags for added content.
 */
export function computeHtmlDiff(
  prevHtml: string,
  currHtml: string,
  baseUrl?: string
): HtmlDiffResult {
  // Extract stylesheets from the current HTML (to apply original styles)
  const stylesheets = extractStylesheets(currHtml, baseUrl);
  
  // Extract main content from both versions
  const prevMain = extractMainContent(prevHtml, baseUrl);
  const currMain = extractMainContent(currHtml, baseUrl);
  
  // Handle edge cases
  if (!prevMain && !currMain) {
    return {
      diffHtml: "<p>No content found in either version</p>",
      stats: { additions: 0, deletions: 0 },
      baseUrl,
      stylesheets,
    };
  }
  
  if (!prevMain) {
    return {
      diffHtml: `<ins class="diff-added">${currMain}</ins>`,
      stats: { additions: 1, deletions: 0 },
      baseUrl,
      stylesheets,
    };
  }
  
  if (!currMain) {
    return {
      diffHtml: `<del class="diff-removed">${prevMain}</del>`,
      stats: { additions: 0, deletions: 1 },
      baseUrl,
      stylesheets,
    };
  }
  
  // Compute the HTML diff
  const diffHtml = new HtmlDiff(prevMain, currMain).build();
  
  // Count changes
  const stats = countChanges(diffHtml);
  
  return { diffHtml, stats, baseUrl, stylesheets };
}

/**
 * Generate the CSS styles for diff visualization
 */
export function getDiffStyles(): string {
  return `
    /* Base diff styles */
    .diff-container {
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.6;
      padding: 16px;
    }
    
    /* Deleted content */
    del, .diff-del, ins.diff-html-removed {
      background-color: #fecaca;
      text-decoration: line-through;
      color: #991b1b;
      padding: 2px 4px;
      border-radius: 2px;
    }
    
    /* Added content */
    ins, .diff-ins, ins.diff-html-added {
      background-color: #bbf7d0;
      text-decoration: none;
      color: #166534;
      padding: 2px 4px;
      border-radius: 2px;
    }
    
    /* Deleted images */
    del img, img.diff-del {
      border: 4px solid #ef4444;
      opacity: 0.5;
      box-shadow: 0 0 0 2px #fecaca;
    }
    
    /* Added images */
    ins img, img.diff-ins {
      border: 4px solid #22c55e;
      box-shadow: 0 0 0 2px #bbf7d0;
    }
    
    /* Block-level deletions */
    del > div, del > section, del > article, del > p {
      background-color: #fee2e2;
      border-left: 4px solid #ef4444;
      padding-left: 12px;
      margin: 8px 0;
    }
    
    /* Block-level additions */
    ins > div, ins > section, ins > article, ins > p {
      background-color: #dcfce7;
      border-left: 4px solid #22c55e;
      padding-left: 12px;
      margin: 8px 0;
    }
    
    /* Ensure images display properly */
    img {
      max-width: 100%;
      height: auto;
    }
    
    /* Cards and block elements */
    .card, [class*="card"], [class*="project"] {
      position: relative;
    }
    
    del .card, del [class*="card"], del [class*="project"],
    del.card, del[class*="card"], del[class*="project"] {
      opacity: 0.7;
      outline: 3px solid #ef4444;
      outline-offset: 2px;
    }
    
    ins .card, ins [class*="card"], ins [class*="project"],
    ins.card, ins[class*="card"], ins[class*="project"] {
      outline: 3px solid #22c55e;
      outline-offset: 2px;
    }
  `;
}

/**
 * Wrap the diff HTML in a complete HTML document for iframe rendering
 */
export function wrapDiffHtml(diffHtml: string, baseUrl?: string, stylesheets: string[] = []): string {
  const diffStyles = getDiffStyles();
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${baseUrl ? `<base href="${baseUrl}">` : ""}
  <!-- Original page stylesheets -->
  ${stylesheets.join("\n  ")}
  <!-- Diff highlighting styles (override original styles for diff markers) -->
  <style>
    ${diffStyles}
  </style>
</head>
<body>
  <div class="diff-container">
    ${diffHtml}
  </div>
</body>
</html>
  `.trim();
}
