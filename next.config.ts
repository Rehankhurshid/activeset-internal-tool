import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['puppeteer', '@sparticuz/chromium'],
  output: 'standalone',
};

export default nextConfig;
