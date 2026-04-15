"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runOllama = runOllama;
function buildPrompt(signals) {
    return `You are an SEO expert specializing in Schema.org structured data (JSON-LD).

Return ONLY a JSON object (no prose, no markdown fences):

{
  "pageType": "article|product|localbusiness|faq|howto|event|organization|webpage|other",
  "summary": "1-2 sentence description",
  "existing": [{ "type": "SchemaType", "raw": { ... }, "issues": ["..."] }],
  "recommended": [
    {
      "type": "SchemaType",
      "reason": "why this applies",
      "confidence": "high|medium|low",
      "jsonLd": { "@context": "https://schema.org", "@type": "...", ... }
    }
  ]
}

Rules: use real page values, do not invent ratings/prices, each jsonLd must be standalone Schema.org JSON-LD.

PAGE DATA:
URL: ${signals.url}
Title: ${signals.title ?? '(none)'}
Meta description: ${signals.metaDescription ?? '(none)'}
H1: ${JSON.stringify(signals.h1)}
H2: ${JSON.stringify(signals.h2)}
Images: ${JSON.stringify(signals.images.slice(0, 8))}
Existing JSON-LD: ${JSON.stringify(signals.existingJsonLd)}
Main text: ${signals.mainText}
`;
}
function normalizeResult(raw) {
    const obj = (raw ?? {});
    const existing = Array.isArray(obj.existing) ? obj.existing : [];
    const recommended = Array.isArray(obj.recommended) ? obj.recommended : [];
    return {
        pageType: typeof obj.pageType === 'string' ? obj.pageType : 'webpage',
        summary: typeof obj.summary === 'string' ? obj.summary : undefined,
        existing: existing.map((e) => {
            const item = (e ?? {});
            return {
                type: typeof item.type === 'string' ? item.type : 'Unknown',
                raw: item.raw ?? {},
                issues: Array.isArray(item.issues)
                    ? item.issues.filter((s) => typeof s === 'string')
                    : [],
            };
        }),
        recommended: recommended.map((r) => {
            const item = (r ?? {});
            const conf = item.confidence;
            return {
                type: typeof item.type === 'string' ? item.type : 'Thing',
                reason: typeof item.reason === 'string' ? item.reason : '',
                confidence: conf === 'high' || conf === 'medium' || conf === 'low'
                    ? conf
                    : 'medium',
                jsonLd: item.jsonLd ?? {},
            };
        }),
    };
}
async function runOllama(signals, opts) {
    let res;
    try {
        res = await fetch(`${opts.baseUrl.replace(/\/$/, '')}/api/generate`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                model: opts.model,
                prompt: buildPrompt(signals),
                stream: false,
                format: 'json',
                options: { temperature: 0.2 },
            }),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Cannot reach Ollama at ${opts.baseUrl} (${msg}). Start it with: ollama serve`);
    }
    if (!res.ok) {
        throw new Error(`Ollama returned ${res.status}: ${await res.text().catch(() => res.statusText)}. ` +
            `Pull the model first: ollama pull ${opts.model}`);
    }
    const payload = (await res.json());
    const raw = payload.response?.trim() ?? '';
    if (!raw)
        throw new Error('Ollama returned an empty response');
    try {
        return normalizeResult(JSON.parse(raw));
    }
    catch {
        const stripped = raw
            .replace(/^```(?:json)?/i, '')
            .replace(/```$/, '')
            .trim();
        return normalizeResult(JSON.parse(stripped));
    }
}
