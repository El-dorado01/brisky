import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers(){return [{source:'/audio/brisky/:path*',headers:[{key:'Cache-Control',value:'public, max-age=86400, stale-while-revalidate=604800'}]}];},
  allowedDevOrigins: [
    "172.27.0.1",
    "10.69.180.23",
    "172.*.*.*",
    "10.*.*.*",
    "192.168.*.*",
  ],
};

export default nextConfig;
