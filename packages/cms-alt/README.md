# @activeset/cms-alt

Webflow CMS ALT text & lossless WebP compression pipeline, powered by local Ollama (Gemma 3 4B by default). No API keys. No cloud AI.

## Quick start

```bash
# 1. Pull the local model (one-time)
ollama pull gemma3:4b

# 2. Run the full pipeline
export WEBFLOW_API_TOKEN=your_token
npx @activeset/cms-alt run --site <siteId> --ai --compress --publish
```

The UI at your admin dashboard generates the exact command for you — pick collections & fields, copy, paste, go.

## Commands

```
cms-alt scan       — list CMS collections + image/richtext field counts
cms-alt export     — dump every image entry to CSV
cms-alt generate   — fill empty new_alt cells via Ollama
cms-alt compress   — re-encode to lossless WebP + upload to Webflow Assets
cms-alt import     — push CSV changes back to Webflow
cms-alt publish    — publish changed items
cms-alt run        — full pipeline: export → generate → compress → import → publish
```

## Auth

Set `WEBFLOW_API_TOKEN` in `.env.local` (or pass `--token`).
Set `WEBFLOW_SITE_ID` (or pass `--site`).

## Ollama config

- Host: `OLLAMA_HOST` env or `--ollama-host` (default `http://localhost:11434`)
- Model: `OLLAMA_MODEL` env or `--model` (default `gemma3:4b`)

## Requirements

- Node.js ≥ 20
- [Ollama](https://ollama.com) running locally
- Any multimodal model pulled (Gemma 3 4B recommended)

## License

MIT
