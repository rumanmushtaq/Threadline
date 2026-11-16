import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every staff page is per-user and per-request, so classic dynamic rendering fits better
  // than Cache Components here.
  cacheComponents: false,
  // Lets end-to-end tests run their own server next to `pnpm dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["sharp", "@node-rs/argon2", "pg"],
  // Fonts for the marketing-card template are read from disk at runtime.
  outputFileTracingIncludes: { "/**": ["./assets/fonts/**"] },
  experimental: {
    serverActions: {
      // Product photos up to 8 MB plus form fields.
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: [
      new URL("https://res.cloudinary.com/**"),
      ...(process.env.S3_PUBLIC_URL ? [new URL(`${process.env.S3_PUBLIC_URL.replace(/\/$/, "")}/**`)] : []),
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
