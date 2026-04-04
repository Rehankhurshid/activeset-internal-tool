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
    files: [
      "src/modules/site-monitoring/ui/screens/PageAuditDetailsScreen.tsx",
      "src/modules/site-monitoring/ui/screens/WebsiteAuditDashboardScreen.tsx",
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
