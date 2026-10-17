import type { NextConfig } from "next";

// Cache Components is off on purpose: every page is per-user, DB-backed and behind auth,
// so plain request-time rendering is the simplest correct model.
const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
