// GET /api/bootstrap — the storefront boot payload in ONE request.
//
// The shell previously opened 4-5 parallel calls on every full page load
// (audit P2: merge duplicate dispatches):
//   /api/auth/me + /api/cart + /api/settings + /api/privacy/consent (+ /api/wishlist)
// This endpoint composes the same data from the SAME server helpers — no
// internal HTTP fan-out. Each section is best-effort with the same failure
// semantics as the individual endpoints (a failing section degrades to its
// default shape; the boot never 500s because one part hiccuped).
//
// Response shape:
// {
//   user:     PublicUser | null
//   cart:     CartPayload                       (guest cart included)
//   settings: SettingsPayload                   (store/shipping/features/giftWrap/announcements/series/promotion)
//   consent:  ConsentState & currentPolicyVersion
//   wishlist: { slugs: string[] } | null        (null when signed out —
//                                                guests keep localStorage as source of truth)
// }
import { db } from '@/lib/db'
import { getSessionUser, publicUser } from '@/lib/server/auth'
import { getCartPayload } from '@/lib/server/cart'
import { CONSENT_POLICY_VERSION, resolveConsent } from '@/lib/server/consent'
import { buildSettingsPayload } from '@/lib/server/store-settings'
import { json } from '@/lib/server/utils'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getSessionUser()

  const [cart, settings, consent, wishlist] = await Promise.all([
    // Cart payload — includes lines + summary; consumers read what they need.
    getCartPayload().catch(() => null),
    buildSettingsPayload().catch(() => null),
    // resolveConsent already fails closed to all-necessary-only.
    resolveConsent()
      .then((state) => ({ ...state, currentPolicyVersion: CONSENT_POLICY_VERSION }))
      .catch(() => null),
    // Wishlist slugs only exist server-side for signed-in users. Guests get
    // null and keep their localStorage list authoritative client-side.
    user
      ? db.wishlistItem
          .findMany({ where: { userId: user.id }, orderBy: { addedAt: 'asc' }, select: { productSlug: true } })
          .then((rows) => ({ slugs: rows.map((r) => r.productSlug) }))
          .catch(() => null)
      : Promise.resolve(null),
  ])

  return json({
    user: user ? publicUser(user) : null,
    cart,
    settings,
    consent,
    wishlist,
  })
}
