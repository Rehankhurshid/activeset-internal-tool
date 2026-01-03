---
description: Steps to verify the UI and links scanner.
---

# UI Verification Workflow

Steps to verify the UI and links scanner.

## Steps

1. **Start Development Server**
   ```bash
   npm run dev
   ```

2. **Run Verification Script**
   ```bash
   npm run verify:ui
   ```

3. **Check Report**
   Review the generated `ui-verification-report.md` for any failures or visual regressions.

4. **Fix Issues**
   Address any 404s or styling issues reported in the verification report.
