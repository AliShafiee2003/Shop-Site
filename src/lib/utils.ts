import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Task 47 — device-variant copy picker (mobile-first, for sliders):
 * on phones the admin's shorter mobile override wins; everywhere else (and
 * whenever the override is blank) the web text is used. Callers layer their
 * own locale fallbacks INTO `webValue` (e.g. `sl.titleFa || sl.titleEn`), so
 * the FA cascade (mobileFa → fa → en) never crosses the locale boundary.
 */
export function pickCopy(mobile: boolean, mobileValue: string | null | undefined, webValue: string | null | undefined): string {
  const mv = mobileValue?.trim()
  if (mobile && mv) return mv
  return webValue?.trim() || ''
}
