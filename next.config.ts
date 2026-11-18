import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second local server (e.g. an isolated test instance) use its own build folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
