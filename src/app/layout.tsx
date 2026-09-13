import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { BRAND_NAME } from "@/lib/site";

/**
 * Preload ONLY the fonts the first paint actually needs (audit §6: eight
 * simultaneous preloads competed with the LCP image). Inter 400/700 covers EN
 * first paint; Vazirmatn Regular/Bold covers FA first paint. The remaining
 * weights are fetched on demand by CSS. crossOrigin is REQUIRED for font
 * preloads (font fetches are CORS-mode, even same-origin).
 */
const FONT_PRELOADS = [
  "/fonts/inter-latin-400-normal.woff2",
  "/fonts/inter-latin-700-normal.woff2",
  "/fonts/Vazirmatn-Regular.woff2",
  "/fonts/Vazirmatn-Bold.woff2",
];

export const metadata: Metadata = {
  title: {
    default: `${BRAND_NAME} — Independent books from Tehran & Vienna`,
    template: `%s — ${BRAND_NAME}`,
  },
  description:
    "Contemporary Persian literature in English and bilingual editions: novels, poetry, memoir, art books and children's books. Ships across Europe from Vienna.",
  keywords: ["Persian literature", "books", "publishing house", "bilingual", "poetry", "fiction", "Iran"],
  authors: [{ name: BRAND_NAME }],
  openGraph: {
    title: BRAND_NAME,
    description: "Contemporary Persian literature in English and bilingual editions.",
    siteName: BRAND_NAME,
    type: "website",
    locale: "en",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#014B74",
  width: "device-width",
  initialScale: 1,
};

/**
 * Legacy-hash migration. This app previously routed inside location.hash
 * (#/books/x, #/fa/books/x). Old shared links land on /#/…, which the server
 * cannot see. Rendered as a plain <script> as the FIRST child of <body>:
 * the HTML parser executes it BEFORE any (deferred) Next bundle, so the
 * rewrite happens pre-hydration and Next captures the canonical URL from
 * the very start. It stays part of the React tree (identical on server and
 * client), so hydration stays consistent — a manual <head> element was
 * tried and broke App Router head hydration (radix useId mismatch,
 * user-reported console error), and next/script beforeInteractive lands
 * too late in the Turbopack flight payload. In-page anchors (#main,
 * #section-3) are left untouched.
 */
const LEGACY_HASH_MIGRATION =
  "try{var h=location.hash;if(h.length>1&&h.charCodeAt(1)===47){var p=h.slice(1);if(location.search&&p.indexOf('?')<0)p+=location.search;location.replace(p)}}catch(e){}";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Audit SEC-003: in production the proxy mints a per-request nonce (header
  // `x-nonce`) and CSP script-src drops 'unsafe-inline' — this inline bootstrap
  // script MUST carry the nonce to keep executing. In dev there is no nonce
  // header and the dev CSP still allows 'unsafe-inline', so the attribute is
  // simply omitted. All storefront routes are force-dynamic, so reading
  // headers() here forces nothing that wasn't already dynamic.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground font-sans">
        <script
          id="sp-legacy-hash-migration"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: LEGACY_HASH_MIGRATION }}
        />
        {/* React 19 hoists <link rel="preload"> into <head> on the server and
            the client, so these land in <head> of the SSR HTML — both font
            families start downloading with the document, long before any
            client-side locale switch can need them. */}
        {FONT_PRELOADS.map((href) => (
          <link
            key={href}
            rel="preload"
            href={href}
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
        ))}
        {children}
        <Toaster />
      </body>
    </html>
  );
}
