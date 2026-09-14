// POST /api/admin/emails/dispatch — drain the MailMessage outbox through the
// configured SMTP provider (OWNER-only: dispatching mail is an external,
// unrecallable side effect, same class as refunds). Without SMTP_* env vars
// the call is a documented no-op that still reports queue state.
import { requireOwner } from '@/lib/server/auth'
import { apiError, json } from '@/lib/server/utils'
import { dispatchQueuedMails } from '@/lib/server/mail-dispatch'

export async function POST() {
  const user = await requireOwner()
  if (!user) return apiError(403, 'FORBIDDEN')
  const result = await dispatchQueuedMails(25)
  return json(result)
}
