// GET /api/auth/google/status — is Google sign-in configured + which
// redirect_uri must be registered in Google Cloud Console for THIS origin.
import type { NextRequest } from 'next/server'
import { json } from '@/lib/server/utils'
import { googleConfigured, googleRedirectUri } from '@/lib/server/google'

export async function GET(req: NextRequest) {
  return json({ configured: googleConfigured(), redirectUri: googleRedirectUri(req) })
}
