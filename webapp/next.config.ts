import type { NextConfig } from "next";

/**
 * Security headers (SEC-005).
 *
 * CSP is shipped as Report-Only first: the browser logs violations to the console but blocks
 * nothing. Flip CSP_HEADER_NAME to "Content-Security-Policy" once production shows no
 * violations.
 *
 * Why no nonce: Next applies nonces only during server-side rendering of dynamic pages, and
 * every page here is statically prerendered. A nonce policy would force all pages dynamic
 * (no CDN caching, a render per request) — see node_modules/next/dist/docs/01-app/02-guides/
 * content-security-policy.md. So this uses the documented "without nonces" policy:
 * `script-src 'self' 'unsafe-inline'` (Next's inline bootstrap scripts). It does not stop
 * injected inline script, but still blocks third-party script origins, plugins, framing,
 * base-tag hijacking, off-site form posts, and exfiltration to hosts other than Supabase.
 * `style-src 'unsafe-inline'` is needed for the many React `style={{…}}` attributes, which
 * nonces cannot cover anyway.
 *
 * Inventory of what the browser loads/contacts:
 *  - scripts/styles/fonts: same origin only (system font stack, no web fonts)
 *  - images: same origin + data: (inline SVG select arrow in globals.css)
 *  - connect: same origin (/api/*, Vercel Analytics + Speed Insights beacons under /_vercel/)
 *    and the Supabase project origin (Auth + REST via supabase-js in the browser)
 *  - Yahoo, Frankfurter and Telegram are called server-side only, so not listed.
 */
const CSP_HEADER_NAME = "Content-Security-Policy-Report-Only";

function supabaseOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function buildCsp(): string {
  const supabase = supabaseOrigin();
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${supabase ? ` ${supabase}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/past-spendings",
        destination: "/past-cashflow",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: CSP_HEADER_NAME, value: buildCsp() },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), interest-cohort=()",
          },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
        ],
      },
    ];
  },
};

export default nextConfig;
