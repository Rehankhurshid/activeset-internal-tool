#!/usr/bin/env node

/**
 * url-to-md — Batch convert URLs to markdown files
 *
 * Usage:
 *   node url-to-md.mjs <urls.txt> [output-dir]
 *
 * urls.txt format: one URL per line, lines starting with # are ignored
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";

const JSDOM_AVAILABLE = await checkJsdom();

async function checkJsdom() {
  try {
    await import("jsdom");
    return true;
  } catch {
    return false;
  }
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function htmlToMarkdown(html, url) {
  // Lightweight regex-based HTML to markdown converter
  let text = html;

  // Remove script, style, nav, footer, header, aside
  text = text.replace(
    /<(script|style|nav|footer|header|aside|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,
    ""
  );

  // Try to extract main/article content
  const mainMatch =
    text.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ||
    text.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
    text.match(
      /<div[^>]*(?:class|id)="[^"]*(?:content|main|article|post|entry)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    );

  if (mainMatch) {
    text = mainMatch[1];
  }

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = cleanInline(h1Match?.[1] || titleMatch?.[1] || new URL(url).pathname);

  // Headings
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, c) => `\n# ${cleanInline(c)}\n`);
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, c) => `\n## ${cleanInline(c)}\n`);
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, c) => `\n### ${cleanInline(c)}\n`);
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, c) => `\n#### ${cleanInline(c)}\n`);
  text = text.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, c) => `\n##### ${cleanInline(c)}\n`);
  text = text.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, c) => `\n###### ${cleanInline(c)}\n`);

  // Code blocks
  text = text.replace(
    /<pre[^>]*>\s*<code[^>]*(?:class="[^"]*language-(\w+)[^"]*")?[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi,
    (_, lang, code) => `\n\`\`\`${lang || ""}\n${decodeEntities(code).trim()}\n\`\`\`\n`
  );
  text = text.replace(
    /<pre[^>]*>([\s\S]*?)<\/pre>/gi,
    (_, code) => `\n\`\`\`\n${decodeEntities(code).trim()}\n\`\`\`\n`
  );

  // Inline code
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, c) => `\`${decodeEntities(c)}\``);

  // Bold / italic
  text = text.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, c) => `**${cleanInline(c)}**`);
  text = text.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, c) => `*${cleanInline(c)}*`);

  // Links
  text = text.replace(
    /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, label) => {
      const clean = cleanInline(label).trim();
      if (!clean || href.startsWith("#") || href.startsWith("javascript:")) return clean;
      try {
        const absolute = new URL(href, url).href;
        return `[${clean}](${absolute})`;
      } catch {
        return `[${clean}](${href})`;
      }
    }
  );

  // Images
  text = text.replace(
    /<img\b[^>]*src="([^"]*)"[^>]*(?:alt="([^"]*)")?[^>]*\/?>/gi,
    (_, src, alt) => `![${alt || ""}](${src})`
  );

  // List items
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, c) => `- ${cleanInline(c).trim()}\n`);

  // Paragraphs and line breaks
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, c) => `\n${cleanInline(c).trim()}\n`);
  text = text.replace(/<\/?(div|section|blockquote|ul|ol|table|tr|td|th|thead|tbody|figure|figcaption|span|dl|dt|dd)[^>]*>/gi, "\n");

  // Blockquotes (simple)
  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, c) => {
    return c.split("\n").map((l) => `> ${l.trim()}`).join("\n");
  });

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  text = decodeEntities(text);

  // Clean up whitespace
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  return { title, content: text };
}

function cleanInline(html) {
  if (!html) return "";
  return decodeEntities(html.replace(/<[^>]+>/g, "")).trim();
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

async function fetchAndConvert(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

  const html = await res.text();
  return htmlToMarkdown(html, url);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: node url-to-md.mjs <urls.txt> [output-dir]");
    console.log("\nurls.txt: one URL per line (# lines are comments)");
    process.exit(1);
  }

  const inputFile = args[0];
  const outputDir = args[1] || dirname(inputFile);

  if (!existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`);
    process.exit(1);
  }

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const lines = readFileSync(inputFile, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  console.log(`Found ${lines.length} URL(s) to process\n`);

  const today = new Date().toISOString().split("T")[0];
  const results = [];

  for (const url of lines) {
    try {
      console.log(`Fetching: ${url}`);
      const { title, content } = await fetchAndConvert(url);
      const slug = slugify(title || url.split("/").pop() || "page");
      const filename = `${slug}.md`;
      const filepath = join(outputDir, filename);

      const md = `---\nsource: ${url}\nfetched: ${today}\ntitle: "${title.replace(/"/g, '\\"')}"\n---\n\n# ${title}\n\n${content}\n`;

      writeFileSync(filepath, md, "utf-8");
      console.log(`  -> ${filepath}\n`);
      results.push({ url, file: filepath, status: "ok" });
    } catch (err) {
      console.error(`  !! Failed: ${err.message}\n`);
      results.push({ url, status: "failed", error: err.message });
    }
  }

  console.log("--- Summary ---");
  console.log(`Total: ${results.length}`);
  console.log(`Success: ${results.filter((r) => r.status === "ok").length}`);
  console.log(`Failed: ${results.filter((r) => r.status === "failed").length}`);
}

main();
