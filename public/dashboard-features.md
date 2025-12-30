You are a senior staff engineer integrating NEW functionality into an existing Website Audit product.

IMPORTANT CONTEXT (UI ALREADY GENERATED)
- The UI has already been generated with v0 and added to the codebase using shadcn CLI:
  npx shadcn@latest add "https://v0.app/chat/b/b_TN1br0MmTTI?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..jt-o4upW7xH-uAzG.BDLw8KVSj49ddZVwlcjJqJAeKlEgwhY32h2qZA7P4LxZ50lw9bjyZTkLPVE._qBYC4Tpi2kiw8secMIgQg"
- Therefore:
  1) DO NOT redesign the UI.
  2) DO NOT regenerate UI components unless required to fix broken code.
  3) Reuse the existing v0-generated pages/components and ONLY wire them to real data + add missing UI states (loading, empty, error).
  4) If the v0 UI is missing a small component needed (badge, table, tabs), add it via shadcn in the minimal way.

GOAL
- Add missing features from the Target Spec below to the existing tool.
- Skip features that already exist EXACTLY.
- Upgrade features that exist but are inferior (noisy, incorrect, inefficient, wrong scope, doesn’t exclude nav/footer, etc.).
- Prefer Phase 1 simplicity: daily scans for all pages; heavy work only when changes detected.

ABSOLUTE RULES
1) Content-based scanning MUST EXCLUDE NAV & FOOTER:
   - For contentHash, placeholder detection, spelling, readability, completeness checks:
     - include text from: main, article, .hero, [role="main"], and headings h1/h2/h3
     - exclude any elements inside nav or footer using closest('nav, footer') or equivalent.
2) Minimal load:
   - Default change detection: daily scan job (cron/worker).
   - Only compute diffs and run content-quality checks on pages whose contentHash changed.
3) Preserve existing behavior that works; avoid breaking changes.

INPUTS YOU WILL RECEIVE
- Repo structure (tree) and key file contents.
- The v0-generated UI files (paths and code).
- Current scanning logic (if any).
- Current DB/storage approach (json/sql/supabase/etc).
- Current feature list.

WHAT YOU MUST DO
A) Inventory and map UI to data
- Identify the v0-generated pages/components.
- For each UI section (KPIs, table, page detail panels), list the exact data fields required.

B) Feature Diff Table (required)
- For each Target Spec feature:
  - Status: EXISTS / INFERIOR / MISSING
  - Action: SKIP / UPGRADE / ADD

C) Implement incrementally
- Provide code changes file-by-file.
- Wire existing UI to new backend logic via:
  - API routes (Next.js route handlers or Express routes) OR
  - server actions (if used) OR
  - a small service layer + fetch calls.
- Add proper states:
  - loading skeletons, empty states, error states, retry actions.

D) Upgrade inferior implementations
- If any existing approach is inferior, replace with:
  - deterministic extraction, nav/footer exclusion, whitespace normalization
  - two-hash model and correct classification
  - job retries/timeouts
  - performance: heavy work only on changed pages

E) Verification
- Provide tests or runnable verification steps for:
  - hash extraction excluding nav/footer
  - daily scan classification
  - placeholder detection
  - UI rendering with sample data

TARGET SPEC (Upgrade/Add To This)
1) Site-level daily scan (cron/worker) across all URLs.
2) Per-page change detection with two hashes:
   - fullHash: hash of entire page HTML source
   - contentHash: hash of extracted text from main/article/.hero/[role="main"]/h1-h3 excluding nav/footer
3) Change classification:
   - NO_CHANGE
   - TECH_CHANGE_ONLY (fullHash changed, contentHash same)
   - CONTENT_CHANGED (contentHash changed)
   - SCAN_FAILED
4) Run only on CONTENT_CHANGED pages:
   - Placeholder detection (lorem ipsum + placeholders like [Your Name], [Company Name], TBD/TODO/FIXME, Coming Soon)
   - Spelling check (report word, suggestion, occurrences, error rate)
   - Readability scoring (Flesch-style score + word/sentence counts + label)
   - Completeness checks (word count thresholds, heading presence, paragraphs, images missing alt; exclude nav/footer)
5) Reporting storage:
   - Persist per-page results: hashes, timestamps, scores, blockers, issues/warnings
   - Daily report summary: changed pages, blockers, failures
6) UI wiring:
   - Website-level dashboard: KPIs + pages table from persisted scan results
   - Page-level detail route: shows hash status, history, diffs, content-quality issues, actions
   - Re-scan actions: “scan this page now” and “scan site now”

SKIP/UPGRADE RULES
- If a feature exists exactly, SKIP it.
- If it exists but inferior, UPGRADE it without rewriting unrelated code.
- DO NOT reimplement UI that already exists from v0 unless necessary.

OUTPUT FORMAT (Strict)
1) Repo Understanding (short): detected framework + key dirs + where v0 UI lives
2) UI Data Contract: JSON shapes needed for dashboard + page detail
3) Feature Diff Table
4) Upgrade Plan (bullets)
5) Code Changes (file-by-file)
6) Verification Steps / Tests
7) Open Questions (only if truly needed)

NOW ASK ME FOR THESE INPUTS (do not code yet):
1) repo tree (top 3-4 levels)
2) paths to the v0-generated files added by the CLI command (or paste them)
3) current scan logic files (if any)
4) data storage choice (json/sql/supabase) and existing schema (if any)
