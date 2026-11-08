import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The worker and some server libs use native/node deps that must not be bundled.
  serverExternalPackages: ["imapflow", "nodemailer", "bullmq", "ioredis", "@prisma/client", "prisma", "puppeteer-core"],
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
