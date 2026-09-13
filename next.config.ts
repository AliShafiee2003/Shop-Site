import type { NextConfig } from "next";

/**
 * S4 — baseline security headers on every response.
 * - nosniff: stops MIME-sniffing stored XSS via /uploads polyglot files.
 * - frame-ancestors 'self' (+ X-Frame-Options SAMEORIGIN): clickjacking
 *   defence that still allows the sandbox preview panel (same-origin iframe).
 * - Referrer-Policy strict-origin-when-cross-origin: no full URL (with query)
 *   leaks to third parties.
 * - Permissions-Policy: deny unused powerful features.
 *
 * Audit SEC-003: the Content-Security-Policy for PAGE routes now lives in
 * `src/proxy.ts` (nonce + strict-dynamic in production — no 'unsafe-inline').
 * A CSP here AND in the proxy would produce two headers, and browsers enforce
 * the INTERSECTION of duplicates — so only /api/:path* keeps a static CSP
 * here (JSON responses don't execute scripts; the proxy matcher excludes api/).
 */
const isProd = process.env.NODE_ENV === "production";
const apiScriptSrc = isProd
  ? "script-src 'self'"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];
const apiCsp = [
  "default-src 'self'",
  apiScriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Next ≥16.2 blocks dev-only resources (/_next/hmr etc.) for hosts outside
  // this list — the sandbox gateway/preview proxies mean the browser origin
  // may differ from the server hostname, which silently killed hydration.
  // DEV-ONLY key: production ignores it.
  allowedDevOrigins: ["localhost", "**.localhost", "127.0.0.1"],
  async headers() {
    return [
      // PERF-003: product/content images are content-static — immutable
      // year-long caching. Applied alongside (not instead of) the global
      // security headers below; the keys do not overlap, so both sets apply.
      {
        source: "/images/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // Static CSP for API routes only (page CSP is nonce-based in proxy.ts).
      {
        source: "/api/:path*",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy", value: apiCsp },
        ],
      },
      { source: "/:path*", headers: securityHeaders },
    ];
  },
  reactStrictMode: true,
};

export default nextConfig;
