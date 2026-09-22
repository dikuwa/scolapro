import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/@fontsource/unifrakturcook/files/unifrakturcook-latin-700-normal.woff",
    ],
  },
};

export default nextConfig;
