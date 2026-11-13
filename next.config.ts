import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Meal photos are downscaled on the client (~200–500 KB) before upload.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
