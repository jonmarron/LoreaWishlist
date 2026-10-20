import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Pin the workspace root: without it Turbopack walks up and picks up unrelated
// lockfiles from the home directory.
const projectRoot = dirname(fileURLToPath(import.meta.url));

// For a GitHub Pages *project* site the app is served from /<repo>, so every
// asset and route needs that prefix. Set BASE_PATH="/wishlist" in CI; leave it
// empty for `next dev` and for user/org sites served from the domain root.
const basePath = process.env.BASE_PATH?.replace(/\/$/, "") ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  turbopack: {
    root: projectRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
