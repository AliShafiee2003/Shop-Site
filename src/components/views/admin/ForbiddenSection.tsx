'use client'

import { ShieldAlert } from 'lucide-react'
import { getDict } from '@/lib/i18n'
import { useApp } from '@/store/store'

/** S10: rendered when a non-content role (ORDER_SUPPORT) deep-links into a
 *  content section. The API routes enforce the same matrix server-side. */
export function ForbiddenSection() {
  const locale = useApp((s) => s.locale)
  const t = getDict(locale)
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/10 p-8 text-center" role="alert">
      <ShieldAlert className="mx-auto h-8 w-8 text-orange-dark" aria-hidden />
      <p className="mt-3 text-sm font-semibold text-ink">{t.admin.forbidden}</p>
      <p className="mt-1 text-xs text-ink-3">
        {locale === 'fa'
          ? 'این بخش فقط برای مدیران محتوا (OWNER/EDITOR) در دسترس است.'
          : 'This section is only available to content managers (OWNER/EDITOR).'}
      </p>
    </div>
  )
}
