import { useI18n } from '../i18n'

/** First screen ever: pick a language with one tap. Shown in both languages. */
export function LanguagePick() {
  const { setLang } = useI18n()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <img src="icon.svg" alt="" className="size-20" />
      <h1 className="mt-5 text-center text-3xl font-bold tracking-tight text-ink">InterestLedger</h1>
      <p className="mt-2 text-center text-lg text-ink2">
        ಭಾಷೆ ಆರಿಸಿ
        <span className="mx-2 text-ink3">·</span>
        Choose language
      </p>
      <div className="mt-10 grid w-full max-w-sm gap-4">
        <button
          type="button"
          onClick={() => setLang('kn')}
          lang="kn"
          className="min-h-24 rounded-3xl bg-brand px-6 text-3xl font-bold text-brand-ink shadow-[0_12px_30px_-12px] shadow-brand/70 transition active:scale-[0.98]"
        >
          ಕನ್ನಡ
        </button>
        <button
          type="button"
          onClick={() => setLang('en')}
          lang="en"
          className="min-h-24 rounded-3xl border-2 border-line bg-surface px-6 text-3xl font-bold text-ink transition hover:bg-sunk active:scale-[0.98]"
        >
          English
        </button>
      </div>
      <p className="mt-8 max-w-sm text-center text-base text-ink3">
        <span lang="kn">ನಂತರ ಸೆಟ್ಟಿಂಗ್ಸ್‌ನಲ್ಲಿ ಬದಲಿಸಬಹುದು.</span>
        <br />
        You can change this later in Settings.
      </p>
    </div>
  )
}
