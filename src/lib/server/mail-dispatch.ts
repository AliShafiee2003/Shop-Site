// Transactional-mail dispatch seam (audit follow-up: "wire a provider, stamp sentAt").
//
// The sandbox outbox (MailMessage rows) is the single queue for every
// transactional mail: PASSWORD_RESET, EMAIL_VERIFY, NEWSLETTER_CONFIRM,
// EMAIL_CHANGE(_NOTICE), ORDER_CONFIRMATION, SHIPPING_NOTICE. This module
// drains that queue through a real SMTP transport when one is configured:
//
//   SMTP_HOST / SMTP_PORT       required to enable dispatch
//   SMTP_USER / SMTP_PASS       optional auth credentials
//   SMTP_FROM                   optional "Persepix <no-reply@…>" override
//
// Without SMTP_* env vars the dispatcher is a strict no-op (rows stay queued,
// the admin outbox keeps rendering previews) — exactly the sandbox behaviour.
import { db } from '@/lib/db'

export interface DispatchResult {
  configured: boolean
  attempted: number
  sent: number
  failed: number
  remaining: number
  errors: { id: string; to: string; error: string }[]
}

export function isMailProviderConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_PORT?.trim())
}

type Transport = {
  sendMail(opts: { from: string; to: string; subject: string; text: string }): Promise<{ messageId?: string }>
  close(): void
}

// One transport per process, invalidated when the env changes (hot reload safe).
const globalForMail = globalThis as unknown as {
  __mailTransport?: { transport: Transport; key: string }
}

function transportKey(): string {
  return [process.env.SMTP_HOST, process.env.SMTP_PORT, process.env.SMTP_USER, process.env.SMTP_PASS, process.env.SMTP_FROM].join('|')
}

async function getTransport(): Promise<Transport | null> {
  if (!isMailProviderConfigured()) return null
  const key = transportKey()
  if (globalForMail.__mailTransport?.key === key) return globalForMail.__mailTransport.transport
  // Lazy import keeps nodemailer out of every route that touches this module.
  const nodemailer = (await import('nodemailer')).default
  const port = Number(process.env.SMTP_PORT)
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number.isFinite(port) ? port : 587,
    secure: port === 465,
    auth: process.env.SMTP_USER?.trim()
      ? { user: process.env.SMTP_USER.trim(), pass: process.env.SMTP_PASS ?? '' }
      : undefined,
    // Outbox mails are plain text; keep the connection work minimal.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  }) as unknown as Transport
  globalForMail.__mailTransport = { transport, key }
  return transport
}

function fromAddress(): string {
  return process.env.SMTP_FROM?.trim() || 'Persepix <no-reply@persepix.ir>'
}

/** Try to send up to `limit` queued (sentAt: null) mails, oldest first.
 *  Failures are per-mail: the row stays queued, the error is returned and
 *  never thrown — dispatch must be safe to call from healthz housekeeping. */
export async function dispatchQueuedMails(limit = 10): Promise<DispatchResult> {
  const transport = await getTransport().catch(() => null)
  const remaining = await db.mailMessage.count({ where: { sentAt: null } })
  if (!transport) return { configured: false, attempted: 0, sent: 0, failed: 0, remaining, errors: [] }

  const batch = await db.mailMessage.findMany({
    where: { sentAt: null },
    orderBy: { createdAt: 'asc' },
    take: Math.max(1, Math.min(limit, 50)),
  })

  const errors: DispatchResult['errors'] = []
  let sent = 0
  for (const m of batch) {
    try {
      await transport.sendMail({ from: fromAddress(), to: m.to, subject: m.subject, text: m.bodyText })
      await db.mailMessage.update({ where: { id: m.id }, data: { sentAt: new Date() } })
      sent++
    } catch (err) {
      errors.push({ id: m.id, to: m.to, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return {
    configured: true,
    attempted: batch.length,
    sent,
    failed: errors.length,
    remaining: await db.mailMessage.count({ where: { sentAt: null } }),
    errors,
  }
}
