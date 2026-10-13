import { useEffect, useState } from 'react'

export type Theme = 'auto' | 'light' | 'dark'
export type TextSize = 'normal' | 'large' | 'xlarge'

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return allowed.includes(v as T) ? (v as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* ignore */
  }
}

const listeners = new Set<() => void>()
let theme: Theme = read('il.theme', ['auto', 'light', 'dark'] as const, 'auto')
let size: TextSize = read('il.size', ['normal', 'large', 'xlarge'] as const, 'large')

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined

export function applyPrefs(): void {
  const root = document.documentElement
  const dark = theme === 'dark' || (theme === 'auto' && media?.matches)
  root.dataset.theme = dark ? 'dark' : 'light'
  root.dataset.size = size
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e1210' : '#f4f2ec')
}

media?.addEventListener('change', applyPrefs)

export function usePrefs() {
  const [, tick] = useState(0)
  useEffect(() => {
    const f = () => tick((n) => n + 1)
    listeners.add(f)
    return () => {
      listeners.delete(f)
    }
  }, [])
  return {
    theme,
    size,
    setTheme(v: Theme) {
      theme = v
      write('il.theme', v)
      applyPrefs()
      listeners.forEach((f) => f())
    },
    setSize(v: TextSize) {
      size = v
      write('il.size', v)
      applyPrefs()
      listeners.forEach((f) => f())
    },
  }
}
