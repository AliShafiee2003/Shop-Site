'use client'

import { useEffect } from 'react'

/**
 * Legacy-hash link migration — CLIENT effect (moved out of the RootLayout's
 * inline <script> to kill the React 19 dev-only console error "Encountered a
 * script tag while rendering React component", user-reported on every hard
 * page load; the old plain <script> element inside the React tree can never
 * be re-executed on the client and React warns about exactly that).
 *
 * This app previously routed inside location.hash (#/books/x, #/fa/books/x).
 * Old shared links land on /#/…, which the server cannot see (fragments are
 * never sent to the server), so the storefront would render the home view.
 * After mount we rewrite the URL to the canonical path and do a FULL reload —
 * Next then server-renders the correct view. In-page anchors (#main,
 * #section-3, plain #foo) are left untouched.
 *
 * Trade-off vs. the old pre-hydration inline script: legacy links now show
 * the home view for one paint before the reload. Legacy links are a
 * pre-launch artifact, so that cosmetic cost was accepted to keep the React
 * tree free of <script> elements (zero console errors in dev).
 */
export function LegacyHashRedirect() {
  useEffect(() => {
    const h = window.location.hash
    if (h.length > 1 && h.charCodeAt(1) === 47 /* '#/' */) {
      let p = h.slice(1)
      if (window.location.search && p.indexOf('?') < 0) p += window.location.search
      window.location.replace(p)
    }
  }, [])
  return null
}
