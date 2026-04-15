import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output bundles the server + dependencies into .next/standalone
  // so Electron can spawn it as a self-contained process
  output: "standalone",
};

export default nextConfig;
