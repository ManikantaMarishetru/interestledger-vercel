import { ChevronRight, DatabaseBackup, Languages, Settings as SettingsIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import { Sheet, cx } from '../ui/components'
import { go } from '../ui/router'

export function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang, setLang } = useI18n()
  const item = (icon: ReactNode, label: string, onClick: () => void, sub?: string) => (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 w-full items-center gap-4 rounded-2xl px-3 text-left hover:bg-sunk"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold text-ink">{label}</span>
        {sub && <span className="block text-sm text-ink2">{sub}</span>}
      </span>
      <ChevronRight className="text-ink3" aria-hidden />
    </button>
  )
  const open_ = (path: string) => () => {
    onClose()
    go(path)
  }
  return (
    <Sheet open={open} onClose={onClose} title={t('nav.more')}>
      <div className="flex flex-col gap-1">
        <div className="mb-3 rounded-2xl bg-sunk p-3">
          <div className="mb-2 flex items-center gap-2 px-1 text-base font-semibold text-ink">
            <Languages size={20} aria-hidden />
            {t('settings.language')}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['kn', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={cx(
                  'min-h-14 rounded-2xl border-2 text-xl font-bold',
                  lang === l ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-ink',
                )}
              >
                {l === 'kn' ? 'ಕನ್ನಡ' : 'English'}
              </button>
            ))}
          </div>
        </div>
        {item(<DatabaseBackup size={22} />, t('nav.backup'), open_('/backup'), t('backup.menu_sub'))}
        {item(<SettingsIcon size={22} />, t('nav.settings'), open_('/settings'), t('settings.menu_sub'))}
      </div>
    </Sheet>
  )
}
