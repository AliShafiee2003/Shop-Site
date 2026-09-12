// GET /api/newsletter/unsubscribe?email=&sig= — signed one-click opt-out (S14).
// The link is HMAC-signed with STATE_SECRET so third parties cannot forge
// unsubscribes for arbitrary addresses. In a full deployment the link is
// emailed at subscribe time; the subscribe response already carries manageUrl.
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

function signingKey(): string {
  return process.env.STATE_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim() || 'persepix-unsubscribe-key'
}

function signUnsubscribeToken(email: string): string {
  return createHmac('sha256', signingKey()).update(`unsub:${email.toLowerCase()}`).digest('base64url')
}

export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get('email') ?? '').toLowerCase().trim()
  const sig = req.nextUrl.searchParams.get('sig') ?? ''
  if (!email || !sig) {
    return NextResponse.redirect(new URL('/?newsletter=unsub_invalid', req.url))
  }
  const expected = Buffer.from(signUnsubscribeToken(email))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return NextResponse.redirect(new URL('/?newsletter=unsub_invalid', req.url))
  }

  await db.newsletterSubscriber.updateMany({
    where: { email },
    data: { status: 'UNSUBSCRIBED' },
  })

  return NextResponse.redirect(new URL('/?newsletter=unsubscribed', req.url))
}
