import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
// HTTPS-only directives are applied on Vercel so local http:// testing still works.
const isHttpsDeploy = !!process.env.VERCEL;

/**
 * Content Security Policy (no nonces, so pages can stay static/cached).
 * Blocks third-party scripts, plugins, <base> hijacking and framing.
 * - form-action allows Google: the OAuth sign-in POST redirects there.
 * - img-src allows data: for meal photo thumbnails stored as data URLs.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  "worker-src 'self'",
  ...(isHttpsDeploy ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Photos use <input capture>, which needs no camera permission.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isHttpsDeploy
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Meal photos are downscaled on the client (~100–300 KB) before upload.
    serverActions: { bodySizeLimit: "4mb" },
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Personal data exports must never be cached by shared caches.
      { source: "/api/(.*)", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
