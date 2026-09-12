// GET /api/newsletter/unsubscribe?email=&sig= — signed one-click opt-out (S14).
// The link is HMAC-signed with STATE_SECRET so third parties cannot forge
// unsubscribes for arbitrary addresses. In a full deployment the link is
// emailed at subscribe time; the subscribe response already carries manageUrl.
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { newsletterSigValid } from '@/lib/server/newsletter'

export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get('email') ?? '').toLowerCase().trim()
  const sig = req.nextUrl.searchParams.get('sig') ?? ''
  if (!email || !sig) {
    return NextResponse.redirect(new URL('/?newsletter=unsub_invalid', req.url))
  }
  if (!newsletterSigValid('unsub', email, sig)) {
    return NextResponse.redirect(new URL('/?newsletter=unsub_invalid', req.url))
  }

  await db.newsletterSubscriber.updateMany({
    where: { email },
    data: { status: 'UNSUBSCRIBED' },
  })

  return NextResponse.redirect(new URL('/?newsletter=unsubscribed', req.url))
}
