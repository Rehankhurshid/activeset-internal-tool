# @activeset/schema-gen

Generate Schema.org JSON-LD recommendations for a Webflow site's static pages
using a **local Ollama model** (Gemma by default). Output is a portable JSON
file you can upload via the ActiveSet dashboard's **Import schema analyses**
button on the Webflow Pages tab.

Everything runs on your machine — your Webflow content and the model output
never leave it until *you* upload the file.

---

## Prerequisites

1. **Node.js** ≥ 20
2. **Ollama** running locally with a Gemma model:
   ```bash
   ollama serve
   ollama pull gemma4:e4b   # default — ~5 GB
   # or, smaller/faster:
   ollama pull gemma3:4b
   ```
3. A **Webflow API token** with read access to the target site.

---

## Usage

```bash
# Discover what'll be processed
npx @activeset/schema-gen list \
  --site <webflowSiteId> \
  --token <webflowApiToken>

# Generate recommendations for every published static page
npx @activeset/schema-gen generate \
  --site <webflowSiteId> \
  --token <webflowApiToken> \
  --domain www.example.com \
  --out schema-output.json
```

Then in the dashboard: **Webflow Pages → Import schema analyses → pick `schema-output.json`**. Every analyzed page now shows a "Cached" badge in the Schema panel.

### Auth via env

Place these in `.env.local` next to where you run the command and you can drop the flags:

```
WEBFLOW_API_TOKEN=...
OLLAMA_BASE_URL=http://127.0.0.1:11434   # optional
OLLAMA_MODEL=gemma4:e4b                  # optional
```

### Useful flags

| Flag | Default | Notes |
|---|---|---|
| `--only home,about` | — | Restrict to specific slugs or `publishedPath`s |
| `--model gemma3:4b` | `gemma4:e4b` | Smaller and noticeably faster |
| `--ollama-host <url>` | `http://127.0.0.1:11434` | Override if Ollama is on a different port |
| `--concurrency 2` | `1` | Pages analyzed in parallel — keep low; Ollama is single-GPU |
| `--out path/to/file.json` | `schema-output.json` | Output path |

---

## What's in the output file

```jsonc
{
  "version": 1,
  "generatedAt": "2026-04-15T...",
  "model": "gemma4:e4b",
  "siteId": "...",
  "domain": "www.example.com",
  "entries": [
    {
      "pageId": "...",
      "pageTitle": "Home",
      "url": "https://www.example.com/",
      "contentHash": "...",
      "result": {
        "pageType": "webpage",
        "summary": "...",
        "existing": [...],
        "recommended": [
          {
            "type": "Organization",
            "reason": "...",
            "confidence": "high",
            "jsonLd": { "@context": "https://schema.org", "@type": "Organization", ... }
          }
        ]
      }
    }
  ]
}
```

The `pageId` + `contentHash` pair is the cache key the dashboard uses, so
re-running on unchanged pages is instant (the importer skips matching docs).

---

## Why a CLI and not in-app?

Browser → local Ollama hits CORS restrictions, and a deployed server can't reach `localhost` on your machine. Running the analysis on the same machine that runs Ollama avoids both problems entirely. The dashboard becomes a viewer.

---

## License

MIT
