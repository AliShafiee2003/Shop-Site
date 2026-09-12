import type { NextConfig } from "next";

/**
 * S4 — baseline security headers on every response.
 * - nosniff: stops MIME-sniffing stored XSS via /uploads polyglot files.
 * - frame-ancestors 'self' (+ X-Frame-Options SAMEORIGIN): clickjacking
 *   defence that still allows the sandbox preview panel (same-origin iframe).
 * - Referrer-Policy strict-origin-when-cross-origin: no full URL (with query)
 *   leaks to third parties.
 * - Permissions-Policy: deny unused powerful features.
 * - CSP: same-origin default; inline scripts/styles stay allowed because the
 *   app bootstraps with an inline legacy-hash migration script, React inline
 *   styles and JSON-LD blocks. `unsafe-eval` is required by next dev (HMR)
 *   and kept for build parity; frame-ancestors is the operative guard here.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
