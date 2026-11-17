import { useEffect, useState } from 'preact/hooks'
import { decodePayload, encodePayload, lockHash } from '../lib/codec'
import { fmtDate, fmtMoney } from '../lib/grid'
import type { Account, Answer, Person, ReturnPayload, SendPayload } from '../lib/types'
import { appUrl, Banner, copy, Page, waLink } from '../lib/ui'

const MARITAL = ['נשוי/אה', 'גרוש/ה', 'פרוד/ה', 'אלמן/ה']
const DECLARE =
  'אני מצהיר/ה כי כל הפרטים שמסרתי נכונים, מלאים, מדויקים וכנים, וכי לא העלמתי כל פרט. ידוע לי כי מסירת פרטים בלתי נכונים או העלמת פרטים מהווה עבירה על החוק.'

interface Draft {
  p: Person
  ans: Record<number, Answer>
}

export function Soldier({ code }: { code: string }) {
  const [pl, setPl] = useState<SendPayload | null>(null)
  const [err, setErr] = useState('')
  const [draft, setDraft] = useState<Draft>({ p: {}, ans: {} })
  const [agree, setAgree] = useState(false)
  const [tried, setTried] = useState(false)
  const [out, setOut] = useState('')
  const [copied, setCopied] = useState(false)
  const key = pl ? `hafkadot.draft.${pl.id}.${pl.r}` : ''

  useEffect(() => {
    decodePayload<SendPayload>(code)
      .then(async (p) => {
        if (p.v !== 1 || !Array.isArray(p.rows)) throw new Error()
        if ((await lockHash(p.id, p.r, p.rows)) !== p.h) throw new Error()
        let saved: Draft | null = null
        try {
          saved = JSON.parse(localStorage.getItem(`hafkadot.draft.${p.id}.${p.r}`) || 'null')
        } catch {
          /* אין טיוטה */
        }
        setDraft(saved ?? { p: { ...p.person, acct: p.person?.acct ?? p.acct }, ans: { ...(p.ans ?? {}) } })
        setPl(p)
      })
      .catch(() => setErr('הקישור פגום או חתוך. בקש מהמשק לשלוח אותו שוב.'))
  }, [code])

  function save(next: Draft) {
    setDraft(next)
    setOut('')
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      /* אחסון חסום */
    }
  }
  const setP = (patch: Partial<Person>) => save({ ...draft, p: { ...draft.p, ...patch } })
  const setA = (i: number, patch: Partial<Answer>) =>
    save({ ...draft, ans: { ...draft.ans, [i]: { ...(draft.ans[i] ?? { exp: '' }), ...patch } } })
  const setAcct = (which: 'acct' | 'acct2', patch: Partial<Account>) => setP({ [which]: { ...draft.p[which], ...patch } })

  if (err) {
    return (
      <Page title="הצהרת הפקדות">
        <Banner kind="bad">{err}</Banner>
      </Page>
    )
  }
  if (!pl) return <Page title="הצהרת הפקדות">טוען…</Page>

  const tm = pl.t === 'tashmash'
  const p = draft.p
  const digits = (s?: string) => !!s && /^\d{5,9}$/.test(s)
  const missingP: string[] = []
  if (!p.name?.trim()) missingP.push('שם מלא')
  if (tm) {
    if (!digits(p.idNum)) missingP.push('מספר ת"ז')
    if (!p.marital) missingP.push('מצב משפחתי')
    if (!p.soldierName?.trim()) missingP.push('שם החייל')
    if (!digits(p.soldierNum)) missingP.push('מספר אישי של החייל')
    if (!p.acct?.number || !p.acct?.bank || !p.acct?.branch) missingP.push('פרטי חשבון הבנק')
  } else if (!digits(p.personalNum)) missingP.push('מספר אישי')
  const rowOk = (i: number) => {
    const a = draft.ans[i]
    return !!a && (a.exp.trim().length >= 2 || (a.dispute && (a.note ?? '').trim().length >= 2))
  }
  const missingRows = pl.rows.filter((r) => !rowOk(r.i)).length
  const ready = !missingP.length && !missingRows && agree

  async function finish() {
    setTried(true)
    if (!ready) return
    const ans: Record<number, Answer> = {}
    for (const r of pl!.rows) {
      const a = draft.ans[r.i]
      ans[r.i] = { exp: a.exp.trim(), ...(a.dispute ? { dispute: true, note: (a.note ?? '').trim() } : {}) }
    }
    const ret: ReturnPayload = { v: 1, id: pl!.id, r: pl!.r, h: pl!.h, p, ans }
    setOut(appUrl('#r=' + (await encodePayload(ret))))
  }

  return (
    <Page title={tm ? 'הצהרה על הוצאות והכנסות חריגות' : 'הצהרה על משיכות והפקדות חריגות'}>
      <Banner kind="info">
        המשק סימן {pl.rows.length} פעולות מהעו"ש שדורשות הסבר. יש לכתוב הסבר לכל אחת ולשלוח חזרה. את התאריך והסכום אי אפשר
        לשנות.
      </Banner>

      <section class="card">
        <h2>{tm && pl.w === 'owner' ? 'פרטי בעל החשבון' : 'הפרטים שלך'}</h2>
        <label class="field">
          <span>שם מלא</span>
          <input value={p.name ?? ''} onInput={(e) => setP({ name: e.currentTarget.value })} autocomplete="name" />
        </label>
        {!tm && (
          <label class="field">
            <span>מספר אישי</span>
            <input value={p.personalNum ?? ''} onInput={(e) => setP({ personalNum: e.currentTarget.value.replace(/\D/g, '') })} inputMode="numeric" dir="ltr" />
          </label>
        )}
        {tm && (
          <>
            <label class="field">
              <span>מספר ת"ז של בעל החשבון</span>
              <input value={p.idNum ?? ''} onInput={(e) => setP({ idNum: e.currentTarget.value.replace(/\D/g, '') })} inputMode="numeric" dir="ltr" />
            </label>
            <div class="field">
              <span>מצב משפחתי</span>
              <div class="seg wrap">
                {MARITAL.map((m) => (
                  <button class={p.marital === m ? 'on' : ''} onClick={() => setP({ marital: m })}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <label class="field">
              <span>שם החייל/ת</span>
              <input value={p.soldierName ?? ''} onInput={(e) => setP({ soldierName: e.currentTarget.value })} />
            </label>
            <label class="field">
              <span>מספר אישי של החייל/ת</span>
              <input value={p.soldierNum ?? ''} onInput={(e) => setP({ soldierNum: e.currentTarget.value.replace(/\D/g, '') })} inputMode="numeric" dir="ltr" />
            </label>
            <AcctFields title="חשבון הבנק" a={p.acct} set={(x) => setAcct('acct', x)} />
            <AcctFields title="חשבון בנק נוסף (אם יש)" a={p.acct2} set={(x) => setAcct('acct2', x)} />
          </>
        )}
      </section>

      <h2>הפעולות ({pl.rows.length})</h2>
      {pl.rows.map((r, n) => {
        const a = draft.ans[r.i] ?? { exp: '' }
        const bad = tried && !rowOk(r.i)
        return (
          <section class={'card rowcard' + (bad ? ' bad' : '') + (pl.fix?.[r.i] ? ' fixme' : '')} key={r.i}>
            <div class="line">
              <span class="date">
                {n + 1}. {fmtDate(r.d)}
              </span>
              <span class={'amt ' + (r.a > 0 ? 'dep' : 'wd')}>
                {r.a > 0 ? 'הפקדה' : 'משיכה'} <b>{fmtMoney(r.a)} ₪</b>
              </span>
            </div>
            <div class="desc">
              {r.s}
              {r.k && <span class="why">{r.k === 'f' ? 'הכנסה קבועה' : 'הכנסה חד פעמית'}</span>}
            </div>
            {pl.fix?.[r.i] && <div class="manual">המשק ביקש לתקן: {pl.fix[r.i]}</div>}
            <textarea
              rows={2}
              maxLength={300}
              placeholder="הסבר: עבור מה? ממי / למי? קבוע או חד פעמי?"
              value={a.exp}
              onInput={(e) => setA(r.i, { exp: e.currentTarget.value })}
            />
            <label class="check small">
              <input type="checkbox" checked={!!a.dispute} onChange={(e) => setA(r.i, { dispute: e.currentTarget.checked })} />
              <span>לדעתי השורה הזו שגויה</span>
            </label>
            {a.dispute && (
              <input maxLength={200} placeholder="מה לא נכון?" value={a.note ?? ''} onInput={(e) => setA(r.i, { note: e.currentTarget.value })} />
            )}
          </section>
        )
      })}

      <section class="card">
        <label class="check">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => {
              setAgree(e.currentTarget.checked)
              setOut('')
            }}
          />
          <span>{DECLARE}</span>
        </label>
        {tried && !ready && (
          <Banner kind="bad">
            {missingP.length > 0 && <div>חסר: {missingP.join(', ')}.</div>}
            {missingRows > 0 && <div>חסר הסבר ל-{missingRows} פעולות.</div>}
            {!agree && <div>יש לאשר את ההצהרה.</div>}
          </Banner>
        )}
        {!out ? (
          <button class="btn primary big" onClick={finish}>
            סיימתי, הכן לשליחה
          </button>
        ) : (
          <>
            <Banner kind="ok">מוכן. שלח את התשובה למשק. על הטופס המודפס חותמים אצל המשק.</Banner>
            <a class="btn primary big" href={waLink(`הצהרת הפקדות, התשובה שלי:\n${out}`)} target="_blank" rel="noopener">
              שלח למשק בוואטסאפ
            </a>
            <button class="btn" onClick={async () => setCopied(await copy(out))}>
              {copied ? 'הועתק ✓' : 'העתק קישור תשובה'}
            </button>
          </>
        )}
      </section>
    </Page>
  )
}

function AcctFields(props: { title: string; a?: Account; set: (p: Partial<Account>) => void }) {
  const a = props.a ?? {}
  return (
    <fieldset class="acct">
      <legend>{props.title}</legend>
      <input placeholder="שם הבנק" value={a.bank ?? ''} onInput={(e) => props.set({ bank: e.currentTarget.value })} />
      <input placeholder="סניף" value={a.branch ?? ''} onInput={(e) => props.set({ branch: e.currentTarget.value })} inputMode="numeric" dir="ltr" />
      <input placeholder="מספר חשבון" value={a.number ?? ''} onInput={(e) => props.set({ number: e.currentTarget.value })} inputMode="numeric" dir="ltr" />
    </fieldset>
  )
}
