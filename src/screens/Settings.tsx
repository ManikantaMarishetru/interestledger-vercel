import { HardDrive, Info, Scale, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { BackButton, Card, Choice, PageTitle, SectionTitle } from '../ui/components'
import { usePrefs, type TextSize, type Theme } from '../ui/prefs'

export function Settings() {
  const { t, lang, setLang } = useI18n()
  const prefs = usePrefs()
  const [persisted, setPersisted] = useState<boolean | null>(null)

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
  }, [])

  async function askPersist() {
    const ok = await navigator.storage?.persist?.()
    setPersisted(!!ok)
  }

  return (
    <>
      <BackButton />
      <PageTitle title={t('nav.settings')} />

      <SectionTitle>{t('settings.language')}</SectionTitle>
      <Choice
        value={lang}
        onChange={setLang}
        options={[
          { value: 'kn', label: 'ಕನ್ನಡ' },
          { value: 'en', label: 'English' },
        ]}
      />

      <SectionTitle>{t('settings.text_size')}</SectionTitle>
      <Choice<TextSize>
        columns={3}
        value={prefs.size}
        onChange={prefs.setSize}
        options={[
          { value: 'normal', label: t('settings.size_normal') },
          { value: 'large', label: t('settings.size_large') },
          { value: 'xlarge', label: t('settings.size_xlarge') },
        ]}
      />

      <SectionTitle>{t('settings.theme')}</SectionTitle>
      <Choice<Theme>
        columns={3}
        value={prefs.theme}
        onChange={prefs.setTheme}
        options={[
          { value: 'auto', label: t('settings.theme_auto') },
          { value: 'light', label: t('settings.theme_light') },
          { value: 'dark', label: t('settings.theme_dark') },
        ]}
      />

      <SectionTitle>{t('settings.data')}</SectionTitle>
      <Card>
        <div className="flex gap-3">
          <HardDrive className="mt-0.5 shrink-0 text-brand" aria-hidden />
          <div className="text-base text-ink">
            <p>{t('settings.local_only')}</p>
            <p className="mt-2 text-ink2">{t('settings.not_encrypted')}</p>
          </div>
        </div>
        <div className="mt-4 flex gap-3 rounded-2xl bg-part-soft p-3.5 text-part">
          <ShieldAlert className="mt-0.5 shrink-0" aria-hidden />
          <p className="text-base font-medium">{t('settings.data_warning')}</p>
        </div>
        <div className="mt-4 rounded-2xl bg-sunk p-3.5">
          <p className="text-base text-ink">
            {persisted === true ? t('settings.persist_on') : persisted === false ? t('settings.persist_off') : t('settings.persist_unknown')}
          </p>
          {persisted === false && (
            <button type="button" onClick={askPersist} className="mt-2 min-h-12 rounded-2xl bg-surface px-4 text-base font-semibold text-brand">
              {t('settings.persist_ask')}
            </button>
          )}
        </div>
      </Card>

      <SectionTitle>{t('settings.about')}</SectionTitle>
      <Card>
        <div className="flex gap-3">
          <Info className="mt-0.5 shrink-0 text-ink2" aria-hidden />
          <p className="text-base text-ink2">{t('settings.about_body')}</p>
        </div>
        <div className="mt-3 flex gap-3">
          <Scale className="mt-0.5 shrink-0 text-ink2" aria-hidden />
          <p className="text-base text-ink2">{t('settings.legal')}</p>
        </div>
        <p className="mt-3 text-sm text-ink3">InterestLedger {__APP_VERSION__}</p>
      </Card>
    </>
  )
}
