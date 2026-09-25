import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repository already maintains project-specific AGENTS.md instructions.
  agentRules: false,
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/@fontsource/unifrakturcook/files/unifrakturcook-latin-700-normal.woff",
    ],
  },
};

export default nextConfig;
