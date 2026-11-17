import { useState } from 'preact/hooks'
import { go } from '../app'
import { readStatement, type FileResult } from '../lib/files'
import { fmtDate, fmtMoney } from '../lib/grid'
import { checkFp, type FpCheck } from '../lib/fingerprint'
import { newId, putDecl } from '../lib/store'
import type { DeclType, Declaration } from '../lib/types'
import { Upload } from 'lucide-preact'
import { Banner, ICON, Page, Stamp } from '../lib/ui'

export function NewDecl() {
  const [type, setType] = useState<DeclType>('aid')
  const [label, setLabel] = useState('')
  const [recipient, setRecipient] = useState<'soldier' | 'owner'>('soldier')
  const [file, setFile] = useState<File | null>(null)
  const [res, setRes] = useState<FileResult | null>(null)
  const [fpc, setFpc] = useState<FpCheck | null>(null)
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
      const r = await readStatement(f)
      setFpc(checkFp(r.account.bank, r.fp))
      setRes(r)
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
      fp: res.fp,
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

  const money = (n: number) => (n < 0 ? '−' : '') + fmtMoney(n)
  const rep = res?.report
  const problems = (rep?.issues.length ?? 0) + (res?.fileWarnings.length ?? 0) + (fpc?.status === 'mismatch' ? 1 : 0)
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
          <span>שם החייל, לזיהוי אצלך בלבד</span>
          <input value={label} onInput={(e) => setLabel(e.currentTarget.value)} placeholder="ישראל ישראלי" />
        </label>
        <div class="field">
          <span>קובץ העו"ש, PDF מקורי מהבנק או אקסל</span>
          <div class="filepick">
            <label class="btn">
              <Upload {...ICON} />
              בחירת קובץ
              <input type="file" accept=".pdf,.xlsx,.xls,.csv,.html,.htm" hidden onChange={(e) => pick(e.currentTarget.files?.[0])} />
            </label>
            <span class="fname">{file?.name ?? ''}</span>
          </div>
        </div>
      </section>

      {busy && <p class="muted">קורא את הקובץ</p>}
      {err && <Banner kind="bad">{err}</Banner>}

      {res && rep && (
        <section class="card">
          <h2>תוצאת הקריאה</h2>
          {rep.opening != null && rep.count > 0 && (
            <div class="recon">
              <div>
                <small>יתרת פתיחה</small>
                <span class="num">{money(rep.opening)}</span>
              </div>
              <span class="op">+</span>
              <div>
                <small>{rep.count} תנועות</small>
                <span class="num">{money(rep.closing! - rep.opening)}</span>
              </div>
              <span class="op">=</span>
              <div>
                <small>יתרת סגירה</small>
                <span class="num">{money(rep.closing!)}</span>
              </div>
              {rep.status === 'verified' && <Stamp big>מאומת</Stamp>}
            </div>
          )}
          {rep.status === 'verified' && <Banner kind="ok">כל {rep.count} התנועות מתאזנות מול היתרה, שורה אחרי שורה</Banner>}
          {rep.status === 'unverified' && (
            <Banner kind="warn">
              <b>לא ניתן לאמת.</b> נקראו {rep.count} תנועות, אבל בקובץ אין עמודת יתרה ולכן אי אפשר לוודא שלא חסרה שורה.
            </Banner>
          )}
          {rep.status === 'failed' && (
            <Banner kind="bad">
              <b>הקריאה לא מאומתת.</b> נמצאו {rep.issues.length} בעיות. אין לסמוך על התוצאה בלי לבדוק מול העו"ש.
            </Banner>
          )}
          {fpc?.status === 'mismatch' && (
            <Banner kind="warn">
              <b>הקובץ שונה מקבצים קודמים של {fpc.bank}.</b> שונה: {fpc.diffs.join(', ')}. כדאי לבקש מהחייל להוריד אותו שוב
              מאפליקציית הבנק.
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
              {rep.issues.length > 12 && <li>ועוד {rep.issues.length - 12}</li>}
            </ul>
          )}
          {rep.count > 0 && (
            <dl class="facts">
              <dt>תקופה</dt>
              <dd>
                <span class="num">{fmtDate(rep.from!)}</span> עד <span class="num">{fmtDate(rep.to!)}</span>
              </dd>
              <dt>חשבון</dt>
              <dd>{[res.account.bank, res.account.branch, res.account.number].filter(Boolean).join(' · ') || 'לא זוהה'}</dd>
              <dt>מקור</dt>
              <dd>
                {fpc?.status === 'match' && `תואם לקבצים קודמים של ${fpc.bank}`}
                {fpc?.status === 'new' && `קובץ ראשון של ${fpc.bank} במכשיר הזה, יישמר כדוגמה אחרי הפקת ה-PDF`}
                {fpc?.status === 'mismatch' && <span class="neg">שונה מקבצים קודמים של {fpc.bank}</span>}
                {fpc?.status === 'nobank' && 'הבנק לא זוהה, אין למה להשוות'}
              </dd>
            </dl>
          )}
          {res.txs.length > 0 && (rep.status !== 'verified' || problems > 0) && (
            <label class="check">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.currentTarget.checked)} />
              <span>בדקתי ידנית מול העו"ש ואני ממשיך על אחריותי</span>
            </label>
          )}
          <button class="btn primary block" disabled={blocked} onClick={create}>
            המשך לבחירת השורות
          </button>
        </section>
      )}
    </Page>
  )
}
