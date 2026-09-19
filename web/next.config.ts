import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Silence Turbopack's workspace-root inference: a sibling package-lock.json
  // lives in ../ (the root import/eval CLI package), not this app.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
