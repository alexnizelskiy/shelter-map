import type { NextConfig } from "next";

// Версия сборки: по ней service worker сбрасывает старые кэши после каждого деплоя
const BUILD = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 10) ?? String(Date.now());

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  env: { NEXT_PUBLIC_BUILD_ID: BUILD },
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default nextConfig;
