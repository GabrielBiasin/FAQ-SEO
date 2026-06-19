import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // jsdom (and its readability consumer) use dynamic requires that break when
  // bundled into a serverless function. Keep them external so they load from
  // node_modules at runtime on Vercel.
  serverExternalPackages: ["jsdom", "@mozilla/readability"],
};

export default nextConfig;
