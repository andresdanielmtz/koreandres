import { useEffect, useState } from 'react'

export type ThemeMode = 'system' | 'light' | 'dark'

export const THEME_KEY = 'itinerary.theme'

/**
 * 
 * @param v The version mode
 * @returns a string indicating whether the mode is light, dark or declared by the system.
 */
const isMode = (v: string | null): v is ThemeMode =>
  v === 'system' || v === 'light' || v === 'dark'

/**
 * Retrieves the current
 * @returns 
 */
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
  /* The concrete answer, for the things CSS variables can't reach — the map
     is built with a colour scheme rather than styled with one. */
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  )

  useEffect(() => {
    localStorage.setItem(THEME_KEY, mode)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = () => {
      const next = mode === 'system' ? (mq.matches ? 'dark' : 'light') : mode
      document.documentElement.dataset.theme = next
      setResolved(next)
    }

    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [mode])

  return { mode, setMode, resolved }
}

/* Called once, in App, and passed down. Two copies would hold independent
   React state — the shared truth is the `data-theme` attribute, not the hook. */
export type Theme = ReturnType<typeof useTheme>

