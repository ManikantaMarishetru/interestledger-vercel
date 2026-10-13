// Tiny hash router: works offline, from file:// and inside Capacitor.

import { useSyncExternalStore } from 'react'

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

const getHash = () => window.location.hash.slice(1) || '/'

export interface Route {
  path: string
  segments: string[]
  query: URLSearchParams
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, () => '/')
  const [path, qs = ''] = hash.split('?')
  return { path, segments: path.split('/').filter(Boolean), query: new URLSearchParams(qs) }
}

export function go(to: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) {
    const url = `${window.location.pathname}${window.location.search}#${to}`
    window.history.replaceState(null, '', url)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = to
  }
  window.scrollTo({ top: 0 })
}

export function back(fallback = '/'): void {
  if (window.history.length > 1) window.history.back()
  else go(fallback, { replace: true })
}
