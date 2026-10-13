import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { en, type MessageKey } from './en'
import { kn } from './kn'

export type Lang = 'en' | 'kn'
export type { MessageKey }

const dictionaries: Record<Lang, Record<MessageKey, string>> = { en, kn }
const STORAGE_KEY = 'il.lang'

export type Params = Record<string, string | number>
export type TFn = (key: MessageKey, params?: Params) => string

export function translate(lang: Lang, key: MessageKey, params?: Params): string {
  const s = dictionaries[lang][key] ?? en[key] ?? key
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s
}

export function readStoredLang(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'en' || v === 'kn' ? v : null
  } catch {
    return null
  }
}

interface I18n {
  lang: Lang
  /** false until the person has picked a language once */
  chosen: boolean
  setLang: (l: Lang) => void
  t: TFn
}

const Ctx = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const stored = readStoredLang()
  const [lang, setLangState] = useState<Lang>(stored ?? 'en')
  const [chosen, setChosen] = useState(stored !== null)

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    setChosen(true)
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      /* private mode: choice lasts for this session */
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang === 'kn' ? 'kn' : 'en'
  }, [lang])

  const t = useCallback<TFn>((key, params) => translate(lang, key, params), [lang])
  const value = useMemo(() => ({ lang, chosen, setLang, t }), [lang, chosen, setLang, t])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18n {
  const v = useContext(Ctx)
  if (!v) throw new Error('useI18n outside I18nProvider')
  return v
}

export function useT(): TFn {
  return useI18n().t
}
