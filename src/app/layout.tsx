import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { LegacyHashRedirect } from "@/components/storefront/LegacyHashRedirect";
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
 * Legacy-hash link migration — moved OUT of the React tree (see
 * components/storefront/LegacyHashRedirect.tsx). The previous inline
 * <script> as the first child of <body> executed before the (deferred) Next
 * bundles, but a <script> element inside the React tree triggers React 19's
 * dev-only "Encountered a script tag while rendering React component"
 * console error on every page load (user-reported). The migration now runs
 * as a client effect after mount; legacy /#/… links cost one extra paint +
 * full reload, which is acceptable for a pre-launch artifact.
 */

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Audit SEO-401: /fa content was served with <html lang="en" dir="ltr"> —
  // wrong for crawlers and screen readers. The proxy exposes the real request
  // path via `x-sp-path`; the fa locale is the /fa prefix (isomorphic with the
  // KNOWN_ROOTS routing used by Shell). (The proxy's per-request CSP nonce is
  // consumed by Next itself from the CSP request header — the layout no
  // longer needs the x-nonce header now that the inline migration script is
  // gone.)
  const reqHeaders = await headers();
  const spPath = reqHeaders.get("x-sp-path") ?? "/";
  const isFa = spPath === "/fa" || spPath.startsWith("/fa/");
  return (
    <html
      lang={isFa ? "fa" : "en"}
      dir={isFa ? "rtl" : "ltr"}
      suppressHydrationWarning
    >
      <body className="antialiased bg-background text-foreground font-sans">
        <LegacyHashRedirect />
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
