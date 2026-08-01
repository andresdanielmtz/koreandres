import { useEffect, useState } from 'react'

export type ThemeMode = 'system' | 'light' | 'dark'

export const THEME_KEY = 'itinerary.theme'

const isMode = (v: string | null): v is ThemeMode =>
  v === 'system' || v === 'light' || v === 'dark'

function stored(): ThemeMode {
  const v = localStorage.getItem(THEME_KEY)
  return isMode(v) ? v : 'system'
}

/**
 * Resolves the mode down to a concrete `data-theme` on <html>, which is the
 * only thing the stylesheet reads. The matching inline script in index.html
 * does the same before first paint, so there's no flash of the wrong theme.
 */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(stored)

  useEffect(() => {
    localStorage.setItem(THEME_KEY, mode)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = () => {
      document.documentElement.dataset.theme =
        mode === 'system' ? (mq.matches ? 'dark' : 'light') : mode
    }

    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [mode])

  return { mode, setMode }
}
