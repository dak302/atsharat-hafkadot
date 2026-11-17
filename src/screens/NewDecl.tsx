import { useState } from 'preact/hooks'
import { go } from '../app'
import { readStatement, type FileResult } from '../lib/files'
import { fmtDate, fmtMoney } from '../lib/grid'
import { newId, putDecl } from '../lib/store'
import type { DeclType, Declaration } from '../lib/types'
import { Banner, Page } from '../lib/ui'

export function NewDecl() {
  const [type, setType] = useState<DeclType>('aid')
  const [label, setLabel] = useState('')
  const [recipient, setRecipient] = useState<'soldier' | 'owner'>('soldier')
  const [file, setFile] = useState<File | null>(null)
  const [res, setRes] = useState<FileResult | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [ack, setAck] = useState(false)

  async function pick(f: File | undefined) {
    setRes(null)
    setErr('')
    setAck(false)
    setFile(f ?? null)
    if (!f) return
    setBusy(true)
    try {
      setRes(await readStatement(f))
    } catch (e) {
      setErr((e as Error).message || 'הקובץ לא נקרא.')
    }
    setBusy(false)
  }

  function create() {
    if (!res || !file) return
    const d: Declaration = {
      id: newId(),
      type,
      label: label.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'draft',
      fileName: file.name,
      fileHash: res.fileHash,
      report: res.report,
      account: res.account,
      txs: res.txs,
      overrides: {},
      recipient: type === 'aid' ? 'soldier' : recipient,
      round: 0,
      answers: {},
      fixNotes: {},
    }
    putDecl(d)
    go('#d/' + d.id)
  }

  const rep = res?.report
  const problems = (rep?.issues.length ?? 0) + (res?.fileWarnings.length ?? 0)
  const blocked = !res || !res.txs.length || (rep!.status !== 'verified' && !ack) || (problems > 0 && !ack)

  return (
    <Page title="הצהרה חדשה" back="#">
      <section class="card">
        <div class="field">
          <span>סוג הבקשה</span>
          <div class="seg">
            <button class={type === 'aid' ? 'on' : ''} onClick={() => setType('aid')}>
              סיוע כלכלי
            </button>
            <button class={type === 'tashmash' ? 'on' : ''} onClick={() => setType('tashmash')}>
              תשמ"ש
            </button>
          </div>
        </div>
        {type === 'tashmash' && (
          <div class="field">
            <span>מי ימלא את ההסברים?</span>
            <div class="seg">
              <button class={recipient === 'soldier' ? 'on' : ''} onClick={() => setRecipient('soldier')}>
                החייל
              </button>
              <button class={recipient === 'owner' ? 'on' : ''} onClick={() => setRecipient('owner')}>
                בעל החשבון (הורה / בן זוג)
              </button>
            </div>
          </div>
        )}
        <label class="field">
          <span>שם החייל (לזיהוי אצלך בלבד)</span>
          <input value={label} onInput={(e) => setLabel(e.currentTarget.value)} placeholder="ישראל ישראלי" />
        </label>
        <label class="field">
          <span>קובץ העו"ש: PDF מקורי מהבנק או אקסל</span>
          <input type="file" accept=".pdf,.xlsx,.xls,.csv,.html,.htm" onChange={(e) => pick(e.currentTarget.files?.[0])} />
        </label>
      </section>

      {busy && <p class="muted">קורא את הקובץ…</p>}
      {err && <Banner kind="bad">{err}</Banner>}

      {res && rep && (
        <section class="card">
          <h2>תוצאת הקריאה</h2>
          {rep.status === 'verified' && (
            <Banner kind="ok">
              <b>מאומת.</b> נקראו {rep.count} תנועות וכל היתרות מתאזנות שורה אחרי שורה.
            </Banner>
          )}
          {rep.status === 'unverified' && (
            <Banner kind="warn">
              <b>לא ניתן לאמת.</b> נקראו {rep.count} תנועות, אבל בקובץ אין עמודת יתרה ולכן אי אפשר לוודא שלא חסרה שורה.
            </Banner>
          )}
          {rep.status === 'failed' && (
            <Banner kind="bad">
              <b>הקריאה לא מאומתת.</b> נמצאו {rep.issues.length} בעיות. אל תסמוך על התוצאה בלי לבדוק מול העו"ש.
            </Banner>
          )}
          {res.fileWarnings.map((w) => (
            <Banner kind="warn">{w}</Banner>
          ))}
          {rep.issues.length > 0 && (
            <ul class="issues">
              {rep.issues.slice(0, 12).map((i) => (
                <li>
                  {i.row ? `שורה ${i.row}: ` : ''}
                  {i.msg}
                </li>
              ))}
              {rep.issues.length > 12 && <li>ועוד {rep.issues.length - 12}…</li>}
            </ul>
          )}
          {rep.count > 0 && (
            <dl class="facts">
              <dt>תקופה</dt>
              <dd>
                {fmtDate(rep.from!)} עד {fmtDate(rep.to!)}
              </dd>
              {rep.opening != null && (
                <>
                  <dt>יתרת פתיחה</dt>
                  <dd dir="ltr">{(rep.opening < 0 ? '-' : '') + fmtMoney(rep.opening)}</dd>
                  <dt>יתרת סגירה</dt>
                  <dd dir="ltr">{(rep.closing! < 0 ? '-' : '') + fmtMoney(rep.closing!)}</dd>
                </>
              )}
              <dt>חשבון</dt>
              <dd>{[res.account.bank, res.account.branch, res.account.number].filter(Boolean).join(' · ') || 'לא זוהה'}</dd>
            </dl>
          )}
          {res.txs.length > 0 && (rep.status !== 'verified' || problems > 0) && (
            <label class="check">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.currentTarget.checked)} />
              <span>בדקתי ידנית מול העו"ש ואני ממשיך על אחריותי</span>
            </label>
          )}
          <button class="btn primary big" disabled={blocked} onClick={create}>
            המשך לבחירת השורות
          </button>
        </section>
      )}
    </Page>
  )
}
