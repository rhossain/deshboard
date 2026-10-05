import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A static site in out/, for hosts without Node.js: `npm run fetch` collects the headlines, then
  // `next build` bakes them in. See .github/workflows/deploy.yml.
  output: "export",
  // /health/index.html rather than /health.html, so Apache serves /health/ without rewrites.
  trailingSlash: true,
  // Same build ID for the same commit, so a scheduled rebuild only changes files whose content did.
  generateBuildId: async () => process.env.GITHUB_SHA ?? null,
};

export default nextConfig;
