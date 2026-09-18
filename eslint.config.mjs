import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const modules = [
  "auth-access",
  "project-links",
  "site-monitoring",
  "webflow",
  "checklists",
  "proposal",
  "seo-engine",
  "screenshot-runner",
  "settings",
  "client-portal",
];

const createModuleBoundaryRule = (moduleName) => {
  const restrictedModuleInternals = modules
    .filter((candidate) => candidate !== moduleName)
    .map((candidate) => ({
      group: [`@/modules/${candidate}/**`],
      message: `Import ${candidate} through its public module API only.`,
    }));

  return {
    files: [`src/modules/${moduleName}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...restrictedModuleInternals,
            {
              group: [
                "@/hooks/useAuth",
                "@/hooks/useModuleAccess",
                "@/components/auth/LoginForm",
                "@/components/navigation/AppNavigation",
                "@/components/dashboard/Dashboard",
                "@/components/page-details",
                "@/components/website-audit-dashboard",
                "@/components/scan-sitemap-dialog",
                "@/components/projects/EmbedDialog",
                "@/components/projects/ProjectTextCheckCard",
              ],
              message: "Use the module or shared public export instead of the compatibility shim.",
            },
          ],
        },
      ],
    },
  };
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  ...modules.map(createModuleBoundaryRule),
  {
    files: ["src/app/page.tsx", "src/app/**/page.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*/**"],
              message: "App entrypoints must import modules through the module index only.",
            },
          ],
        },
      ],
    },
  },
  {
    // The client portal is served to people outside the company, so its route
    // must not import the client-portal barrel: that barrel also re-exports the
    // internal Client tab and its repository, both 'use client', and Next
    // registers them as client references for whatever route pulls the barrel
    // in. The result was ~326KB of internal admin UI — including its copy,
    // readable in devtools — shipped to a client viewing a static page. This
    // route reaches the one screen it renders directly instead.
    files: ["src/app/portal/**/*.tsx"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: [
      "src/modules/site-monitoring/ui/screens/PageAuditDetailsScreen.tsx",
      "src/modules/site-monitoring/ui/screens/WebsiteAuditDashboardScreen.tsx",
      "src/modules/project-links/ui/components/ImageLibrary.tsx",
    ],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  {
    files: ["src/modules/site-monitoring/ui/screens/PageAuditDetailsScreen.tsx"],
    rules: {
      "react-hooks/exhaustive-deps": "off",
      "jsx-a11y/alt-text": "off",
    },
  },
];

export default eslintConfig;
