import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the DOM/readability libs external so they load from node_modules at
  // runtime rather than being bundled into the serverless function.
  serverExternalPackages: ["linkedom", "@mozilla/readability", "exceljs"],
};

export default nextConfig;
