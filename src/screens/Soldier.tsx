import { useEffect, useState } from 'preact/hooks'
import { decodePayload, encodePayload, lockHash } from '../lib/codec'
import { fmtDate } from '../lib/grid'
import { groupRows, type RowGroup } from '../lib/rules'
import type { Account, Answer, Person, ReturnPayload, SendPayload } from '../lib/types'
import { Check, CircleCheck, Copy, Lock, Send } from 'lucide-preact'
import { Amount, appUrl, Banner, copy, ICON, Page, waLink } from '../lib/ui'

const MARITAL = ['נשוי/אה', 'גרוש/ה', 'פרוד/ה', 'אלמן/ה']
const DECLARE =
  'אני מצהיר/ה כי כל הפרטים שמסרתי נכונים, מלאים, מדויקים וכנים, וכי לא העלמתי כל פרט. ידוע לי כי מסירת פרטים בלתי נכונים או העלמת פרטים מהווה עבירה על החוק.'

interface Draft {
  p: Person
  ans: Record<number, Answer>
  /** קבוצות שהמצהיר בחר להסביר שורה-שורה */
  split?: string[]
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
  const setMany = (ids: number[], exp: string) => {
    const ans = { ...draft.ans }
    for (const i of ids) ans[i] = { ...(ans[i] ?? { exp: '' }), exp }
    save({ ...draft, ans })
  }
  const splitGroup = (key: string) => save({ ...draft, split: [...(draft.split ?? []), key] })
  const setAcct = (which: 'acct' | 'acct2', patch: Partial<Account>) => setP({ [which]: { ...draft.p[which], ...patch } })

  if (err) {
    return (
      <Page title="הצהרת הפקדות">
        <Banner kind="bad">{err}</Banner>
      </Page>
    )
  }
  if (!pl) return <Page title="הצהרת הפקדות">{''}</Page>

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
  /** קבוצה מוצגת שורה-שורה אם יש בה שורה אחת, אם המצהיר פיצל, או אם יש בה הערת תיקון, סימון שגיאה או הסברים שונים מסבב קודם */
  const isSplit = (g: RowGroup) => {
    if (g.rows.length < 2 || draft.split?.includes(g.key)) return true
    const ans = g.rows.map((r) => draft.ans[r.i])
    if (g.rows.some((r) => pl.fix?.[r.i]) || ans.some((a) => a?.dispute)) return true
    return new Set(ans.map((a) => a?.exp ?? '')).size > 1
  }
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
      <section class="card howto">
        <p>
          המשק סימן <b>{pl.rows.length} פעולות</b> מהעו"ש שדורשות הסבר. זה לוקח כמה דקות:
        </p>
        <ol>
          <li>ממלאים את הפרטים</li>
          <li>כותבים לכל פעולה עבור מה היא, ממי או למי</li>
          <li>מאשרים ושולחים למשק בוואטסאפ</li>
        </ol>
        <p class="muted locknote">
          <Lock size={14} strokeWidth={1.5} /> התאריכים והסכומים נלקחו מהעו"ש ואי אפשר לשנות אותם
        </p>
      </section>

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

      <h2>{pl.rows.length} פעולות להסבר</h2>
      {groupRows(pl.rows).map((g) => {
        if (!isSplit(g)) {
          const ids = g.rows.map((r) => r.i)
          const exp = draft.ans[ids[0]]?.exp ?? ''
          const dep = g.rows[0].a > 0
          const bad = tried && ids.some((i) => !rowOk(i))
          return (
            <section class={'card entry rowcard' + (bad ? ' bad' : '') + (ids.every(rowOk) ? ' done' : '')} key={g.key}>
              <div class="ehead">
                <span class="gtitle">{g.rows[0].s}</span>
                {ids.every(rowOk) && <CircleCheck class="okmark" size={18} strokeWidth={1.5} aria-label="הוסבר" />}
              </div>
              <ul class="glist">
                {g.rows.map((r) => (
                  <li key={r.i}>
                    <span class="date num">{fmtDate(r.d)}</span>
                    <span class="kind">{dep ? 'הפקדה' : 'משיכה'}</span>
                    <Amount value={r.a} />
                  </li>
                ))}
              </ul>
              <div class="desc">
                {g.rows.length} פעולות מאותו מקור, הסבר אחד לכולן
                {g.rows[0].k && <span class="hint">{g.rows[0].k === 'f' ? 'הכנסה קבועה' : 'הכנסה חד פעמית'}</span>}
              </div>
              <textarea
                rows={2}
                maxLength={300}
                placeholder="עבור מה, ממי או למי, קבוע או חד פעמי"
                value={exp}
                onInput={(e) => setMany(ids, e.currentTarget.value)}
              />
              <button class="link" onClick={() => splitGroup(g.key)}>
                הסבר נפרד לכל פעולה
              </button>
            </section>
          )
        }
        return g.rows.map((r) => {
          const a = draft.ans[r.i] ?? { exp: '' }
          const bad = tried && !rowOk(r.i)
          return (
            <section class={'card entry rowcard' + (bad ? ' bad' : '') + (pl.fix?.[r.i] ? ' fixme' : '') + (rowOk(r.i) ? ' done' : '')} key={r.i}>
              <div class="ehead">
                <span class="date num">{fmtDate(r.d)}</span>
                <span class="kind">{r.a > 0 ? 'הפקדה' : 'משיכה'}</span>
                <Amount value={r.a} />
                {rowOk(r.i) && <CircleCheck class="okmark" size={18} strokeWidth={1.5} aria-label="הוסבר" />}
              </div>
              <div class="desc">
                {r.s}
                {r.k && <span class="hint">{r.k === 'f' ? 'הכנסה קבועה' : 'הכנסה חד פעמית'}</span>}
              </div>
              {pl.fix?.[r.i] && <div class="manual">המשק ביקש לתקן: {pl.fix[r.i]}</div>}
              <textarea
                rows={2}
                maxLength={300}
                placeholder="עבור מה, ממי או למי, קבוע או חד פעמי"
                value={a.exp}
                onInput={(e) => setA(r.i, { exp: e.currentTarget.value })}
              />
              <label class="check small">
                <input type="checkbox" checked={!!a.dispute} onChange={(e) => setA(r.i, { dispute: e.currentTarget.checked })} />
                <span>לדעתי השורה שגויה</span>
              </label>
              {a.dispute && (
                <input maxLength={200} placeholder="מה לא נכון" value={a.note ?? ''} onInput={(e) => setA(r.i, { note: e.currentTarget.value })} />
              )}
            </section>
          )
        })
      })}

      <section class="card" id="finish">
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
            {missingP.length > 0 && <div>חסר: {missingP.join(', ')}</div>}
            {missingRows > 0 && <div>חסר הסבר ל-{missingRows} פעולות</div>}
            {!agree && <div>יש לאשר את ההצהרה</div>}
          </Banner>
        )}
        {!out ? (
          <button class="btn primary block" onClick={finish}>
            סיימתי, הכנה לשליחה
          </button>
        ) : (
          <>
            <Banner kind="ok">מוכן לשליחה. על הטופס המודפס חותמים אצל המשק</Banner>
            <a class="btn primary block" href={waLink(`הצהרת הפקדות, התשובה שלי:\n${out}`)} target="_blank" rel="noopener">
              <Send {...ICON} />
              שליחה למשק בוואטסאפ
            </a>
            <button class="btn block" onClick={async () => setCopied(await copy(out))}>
              {copied ? <Check {...ICON} /> : <Copy {...ICON} />}
              {copied ? 'הועתק' : 'העתקת קישור תשובה'}
            </button>
          </>
        )}
      </section>
      {!out && (
        <div class="bar">
          <div class="bar-in">
            <span>
              הוסברו <b>{pl.rows.length - missingRows}</b> מתוך <b>{pl.rows.length}</b>
            </span>
            <button class="btn primary" onClick={() => document.getElementById('finish')?.scrollIntoView({ behavior: 'smooth' })}>
              לאישור ושליחה
            </button>
          </div>
        </div>
      )}
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
