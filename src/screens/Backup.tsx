import { AlertTriangle, CheckCircle2, Download, FileWarning, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import {
  BackupError,
  backupFileName,
  compareWithCurrent,
  createBackup,
  parseBackup,
  restoreBackup,
  type ParsedBackup,
  type RestoreComparison,
} from '../backup/backup'
import { downloadText } from '../backup/csv'
import { setMeta } from '../db/repo'
import { computePortfolio, reconcile, todayISO } from '../engine'
import { useI18n, type MessageKey } from '../i18n'
import { BackButton, Button, Card, PageTitle, SectionTitle, Sheet, useToast } from '../ui/components'
import { useData, useMeta } from '../ui/data'
import { date as fmtDate } from '../ui/format'

export function BackupScreen() {
  const { t, lang } = useI18n()
  const toast = useToast()
  const data = useData()
  const last = useMeta<string>('lastBackupDate')
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, setPending] = useState<{ parsed: ParsedBackup; cmp: RestoreComparison; name: string } | null>(null)
  const [typed, setTyped] = useState('')
  const [result, setResult] = useState<{ ok: boolean; issues: number } | null>(null)

  async function save() {
    setBusy(true)
    try {
      const file = await createBackup()
      downloadText(backupFileName(), JSON.stringify(file, null, 1), 'application/json')
      await setMeta('lastBackupDate', todayISO())
      toast(t('backup.saved'))
    } finally {
      setBusy(false)
    }
  }

  async function pick(f: File) {
    setProblem(null)
    setResult(null)
    try {
      const text = await f.text()
      const parsed = parseBackup(text)
      const cmp = await compareWithCurrent(parsed.file)
      setPending({ parsed, cmp, name: f.name })
      setTyped('')
    } catch (e) {
      const key = e instanceof BackupError ? (`backup.problem_${e.problem}` as MessageKey) : 'backup.problem_not_json'
      setProblem(t(key))
    }
  }

  async function restore() {
    if (!pending) return
    setBusy(true)
    try {
      await restoreBackup(pending.parsed.file)
      const f = pending.parsed.file
      const issues = reconcile(f.customers, f.loans, f.transactions, computePortfolio(f.loans, f.transactions, todayISO()))
      setResult({ ok: issues.length === 0, issues: issues.length })
      setPending(null)
      toast(t('backup.restored'))
    } catch {
      setProblem(t('backup.restore_failed'))
    } finally {
      setBusy(false)
    }
  }

  const hasData = (data?.customers.length ?? 0) + (data?.transactions.length ?? 0) > 0
  const needsTyping = pending ? pending.cmp.current.transactions > 0 : false
  const word = t('backup.confirm_word')

  return (
    <>
      <BackButton />
      <PageTitle title={t('nav.backup')} />

      <Card>
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 shrink-0 text-part" aria-hidden />
          <p className="text-base text-ink">{t('settings.data_warning')}</p>
        </div>
      </Card>

      <SectionTitle>{t('backup.save_title')}</SectionTitle>
      <Card>
        <p className="text-base text-ink2">{t('backup.save_body')}</p>
        <p className="mt-2 text-base font-semibold text-part">{t('backup.sensitive')}</p>
        <p className="mt-3 text-base text-ink">
          {last ? t('backup.last', { date: fmtDate(last, lang) }) : t('backup.never')}
        </p>
        <Button variant="primary" size="xl" block className="mt-4" icon={<Download size={24} />} disabled={busy || !hasData} onClick={save}>
          {t('backup.save_button')}
        </Button>
      </Card>

      <SectionTitle>{t('backup.restore_title')}</SectionTitle>
      <Card>
        <p className="text-base text-ink2">{t('backup.restore_body')}</p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) pick(f)
            e.target.value = ''
          }}
        />
        <Button size="lg" block className="mt-4" icon={<Upload size={22} />} disabled={busy} onClick={() => fileRef.current?.click()}>
          {t('backup.choose_file')}
        </Button>
        {problem && (
          <div role="alert" className="mt-3 flex gap-3 rounded-2xl bg-due-soft p-3.5 text-due">
            <FileWarning className="shrink-0" aria-hidden />
            <p className="text-base font-medium">{problem}</p>
          </div>
        )}
        {result && (
          <div className="mt-3 flex gap-3 rounded-2xl bg-paid-soft p-3.5 text-paid">
            <CheckCircle2 className="shrink-0" aria-hidden />
            <p className="text-base font-medium">{result.ok ? t('backup.reconciled_ok') : t('backup.reconciled_issues', { count: result.issues })}</p>
          </div>
        )}
      </Card>

      <Sheet
        open={!!pending}
        onClose={() => !busy && setPending(null)}
        title={t('backup.confirm_title')}
        footer={
          <div className="grid gap-2">
            <Button variant="danger" size="lg" block disabled={busy || (needsTyping && typed.trim().toLowerCase() !== word.toLowerCase())} onClick={restore}>
              {t('backup.confirm_yes')}
            </Button>
            <Button size="lg" block disabled={busy} onClick={() => setPending(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        }
      >
        {pending && (
          <div className="flex flex-col gap-3 text-base">
            <p className="font-semibold break-all text-ink">{pending.name}</p>
            <div className="rounded-2xl bg-sunk p-3.5">
              <p className="font-semibold text-ink">{t('backup.file_has')}</p>
              <p className="text-ink2">
                {t('backup.counts', {
                  customers: pending.parsed.file.counts.customers,
                  loans: pending.parsed.file.counts.loans,
                  entries: pending.parsed.file.counts.transactions,
                })}
              </p>
              {pending.parsed.file.exportedAt && (
                <p className="text-sm text-ink3">{t('backup.made_on', { date: fmtDate(pending.parsed.file.exportedAt.slice(0, 10), lang) })}</p>
              )}
            </div>
            <div className="rounded-2xl bg-sunk p-3.5">
              <p className="font-semibold text-ink">{t('backup.phone_has')}</p>
              <p className="text-ink2">
                {t('backup.counts', { customers: pending.cmp.current.customers, loans: pending.cmp.current.loans, entries: pending.cmp.current.transactions })}
              </p>
              {pending.cmp.sameIds > 0 && <p className="text-sm text-ink2">{t('backup.same_ids', { count: pending.cmp.sameIds })}</p>}
            </div>
            {pending.cmp.onlyHere > 0 && (
              <p className="rounded-2xl bg-due-soft p-3.5 font-semibold text-due">{t('backup.will_lose', { count: pending.cmp.onlyHere })}</p>
            )}
            <p className="rounded-2xl bg-part-soft p-3.5 font-medium text-part">{t('backup.replace_warning')}</p>
            {needsTyping && (
              <label className="flex flex-col gap-1.5">
                <span className="font-semibold text-ink">{t('backup.type_to_confirm', { word })}</span>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} className="min-h-14 rounded-2xl border border-line bg-surface px-4 text-lg text-ink" autoComplete="off" />
              </label>
            )}
          </div>
        )}
      </Sheet>
    </>
  )
}
