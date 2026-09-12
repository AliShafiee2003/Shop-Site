import Link from 'next/link'
import { headers } from 'next/headers'

/** Branded 404 for unknown paths (real 404 status via notFound()). */
export default async function NotFound() {
  const h = await headers()
  const path = h.get('x-sp-path') ?? '/'
  const locale = path === '/fa' || path.startsWith('/fa/') ? 'fa' : 'en'
  const fa = locale === 'fa'

  return (
    <main className="mx-auto flex min-h-[70svh] max-w-2xl flex-col items-center justify-center px-4 py-24 text-center sm:px-6">
      <p className="text-6xl font-bold text-[#EAF4F8]" aria-hidden>404</p>
      <h1 className="mt-4 text-2xl font-bold text-[#172026]">
        {fa ? 'این صفحه پیدا نشد' : 'This page could not be found'}
      </h1>
      <p className="mt-2 text-sm text-[#5c6b73]">
        {fa
          ? 'ممکن است نشانی تغییر کرده باشد یا صفحه حذف شده باشد.'
          : 'The address may have changed, or the page may have been removed.'}
      </p>
      <Link
        href={`/${locale}`}
        className="mt-6 inline-flex h-11 items-center rounded-md bg-[#014B74] px-5 text-sm font-medium text-white transition hover:bg-[#003A5B]"
      >
        {fa ? 'بازگشت به خانه' : 'Back to home'}
      </Link>
    </main>
  )
}
