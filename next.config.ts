import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["react-reader", "epubjs"],
  serverExternalPackages: [],
};

export default nextConfig;
