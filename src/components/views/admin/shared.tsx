'use client'

import { useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getDict } from '@/lib/i18n'

export type Dict = ReturnType<typeof getDict>

export interface AdminCategoryRow {
  id: string; slug: string; sortOrder: number; isActive: boolean
  icon: string | null; iconUrl: string | null; color: string | null
  nameEn: string | null; nameFa: string | null
  descriptionEn: string | null; descriptionFa: string | null
  productCount: number
}

export function Card({ title, value, sub, tone }: { title: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{title}</p>
      <p className={cn('mt-1.5 text-2xl font-bold tabular-nums', tone ?? 'text-ink')}><span className="bdi">{value}</span></p>
      {sub && <p className="mt-0.5 text-xs text-ink-3">{sub}</p>}
    </div>
  )
}

/** Shared image upload → returns the public /uploads/... URL (admin-only endpoint). */
export async function uploadImageFile(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
  const j = (await res.json().catch(() => ({}))) as { url?: string; message?: string }
  if (!res.ok || !j.url) throw new Error(j.message ?? `Upload failed (HTTP ${res.status})`)
  return j.url
}

/** Upload button with busy state — used by hero slide / poster / editorial image fields. */
export function UploadButton({ onUploaded, label, busyLabel }: { onUploaded: (url: string) => void; label: string; busyLabel: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <label
      className={cn(
        'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line bg-white px-2.5 text-xs font-medium text-ink-2 transition hover:bg-soft',
        busy && 'pointer-events-none opacity-60',
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />}
      {busy ? busyLabel : label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="sr-only"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setBusy(true)
          try { onUploaded(await uploadImageFile(file)) } finally { setBusy(false) }
        }}
      />
    </label>
  )
}
