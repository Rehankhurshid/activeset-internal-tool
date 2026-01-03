---
description: This workflow guides you through deploying the project-links-widget application.
---

## Prerequisites

- Ensure all changes are committed and pushed to main.
- Ensure environment variables are set in the deployment platform (Vercel/Railway).

## Steps

1. **Verify Build Locally**
   Run the build script to ensure no TypeScript or Next.js errors:
   ```bash
   npm run build
   ```

2. **Run UI Verification**
   Verify the UI and sitemap scanner integration:
   ```bash
   npm run verify:ui
   ```

3. **Push to Remote**
   Deploy via git push:
   ```bash
   git push origin main
   ```

4. **Monitor Deployment**
   Check the external platform logs (Vercel/Railway) for a successful build.
