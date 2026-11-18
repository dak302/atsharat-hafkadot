import { useEffect, useMemo, useState } from 'preact/hooks'
import { Check, Copy, Lock, Printer, Send, Trash2 } from 'lucide-preact'
import { go } from '../app'
import { encodePayload } from '../lib/codec'
import { fmtDate, fmtMoney } from '../lib/grid'
import { AID_MONTH_LIMIT, AID_ROW_LIMIT, evaluate, monthOf, summarize } from '../lib/rules'
import { buildSend, deleteDecl, getDecl, payloadOf, putDecl } from '../lib/store'
import type { Declaration } from '../lib/types'
import { Amount, appUrl, Banner, copy, ICON, Page, STATUS_NAME, STEP_OF, Steps, TYPE_NAME, waLink } from '../lib/ui'

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
const monthName = (m: string) => `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`

export function DeclScreen({ id }: { id: string }) {
  const [d, setD] = useState<Declaration | undefined>(() => getDecl(id))
  if (!d) {
    return (
      <Page title="לא נמצא" back="#">
        <Banner kind="bad">ההצהרה לא נמצאת במכשיר הזה</Banner>
      </Page>
    )
  }
  const update = (fn: (d: Declaration) => void) => {
    const copyD = structuredClone(d)
    fn(copyD)
    putDecl(copyD)
    setD(copyD)
  }
  const remove = () => {
    if (confirm('למחוק את ההצהרה וכל נתוני העו"ש שלה מהמכשיר?')) {
      deleteDecl(d.id)
      go('#')
    }
  }
  return (
    <Page title={d.label || 'הצהרה'} back="#" wide>
      <Steps at={STEP_OF[d.status]} />
      <p class="sub">
        <span class={'tag ' + d.status}>{STATUS_NAME[d.status]}</span>
        <span>{TYPE_NAME[d.type]}</span>
        <span>{d.account.bank ?? d.fileName}</span>
        {d.report.status !== 'verified' && <span class="neg">קריאת הקובץ לא אומתה</span>}
      </p>
      {d.status === 'draft' && <Review d={d} update={update} setD={setD} />}
      {d.status === 'sent' && <Sent d={d} update={update} />}
      {(d.status === 'returned' || d.status === 'done') && <Returned d={d} update={update} setD={setD} />}
      <button class="link neg" onClick={remove}>
        <Trash2 size={16} strokeWidth={1.5} />
        מחיקת ההצהרה מהמכשיר
      </button>
    </Page>
  )
}

type Upd = (fn: (d: Declaration) => void) => void

/** סכום חודשי מול רף ה-600. הפס מתמלא עד הרף ומעבר לו, והקו מסמן את הרף עצמו. */
function Meter(props: { label: string; sum: number; over: boolean; limit: boolean }) {
  const scale = Math.max(props.sum, AID_MONTH_LIMIT * 2)
  return (
    <span class={'meter' + (props.limit && props.over ? ' over' : '')}>
      <span>{props.label}</span>
      <span class="num">{fmtMoney(props.sum)}</span>
      {props.limit && (
        <>
          <span class="track" aria-hidden="true">
            <i style={{ width: (props.sum / scale) * 100 + '%' }} />
            <b style={{ insetInlineStart: (AID_MONTH_LIMIT / scale) * 100 + '%' }} />
          </span>
          <span class="mstate">{props.over ? `מעל ${AID_MONTH_LIMIT}` : `עד ${AID_MONTH_LIMIT}`}</span>
        </>
      )}
    </span>
  )
}

function Review({ d, update, setD }: { d: Declaration; update: Upd; setD: (d: Declaration) => void }) {
  const [onlySel, setOnlySel] = useState(false)
  const rows = useMemo(() => evaluate(d.type, d.txs, d.overrides), [d])
  const months = useMemo(() => summarize(d.txs), [d.txs])
  const selected = rows.filter((r) => r.include).length
  const aid = d.type === 'aid'

  const toggle = (id: number, include: boolean, auto: boolean) =>
    update((x) => {
      const o = { ...x.overrides[id] }
      if (include === auto) delete o.include
      else o.include = include
      x.overrides[id] = o
    })
  const setFixed = (id: number, fixed: boolean, autoFixed: boolean) =>
    update((x) => {
      const o = { ...x.overrides[id] }
      if (fixed === autoFixed) delete o.fixed
      else o.fixed = fixed
      delete o.include // הסיווג השתנה, חוזרים להחלטת הכללים
      x.overrides[id] = o
    })
  async function send() {
    const c = structuredClone(d)
    await buildSend(c)
    setD(c)
  }

  return (
    <>
      <Banner kind="info">
        {aid
          ? `בחודש שבו סך ההפקדות, או סך המשיכות, עולה על ${AID_MONTH_LIMIT} ₪, נבחרת כל פעולה מאותו סוג מעל ${AID_ROW_LIMIT} ₪.`
          : 'נבחרות הכנסה קבועה מ-250 ₪, הכנסה חד פעמית מ-750 ₪ והוצאות רכב. הוצאות חריגות אחרות מסמנים ידנית.'}{' '}
        לחיצה על שורה מוסיפה או מסירה אותה.
      </Banner>
      <div class="seg" role="tablist">
        <button class={!onlySel ? 'on' : ''} onClick={() => setOnlySel(false)}>
          כל התנועות <span class="num">{rows.length}</span>
        </button>
        <button class={onlySel ? 'on' : ''} onClick={() => setOnlySel(true)}>
          רק מה שנבחר <span class="num">{selected}</span>
        </button>
      </div>
      {months.map((m) => {
        const mr = rows.filter((r) => monthOf(r.tx.date) === m.month && (!onlySel || r.include))
        return (
          <section class="month" key={m.month}>
            <header class="mhead">
              <h3>{monthName(m.month)}</h3>
              <Meter label="הפקדות" sum={m.deposits} over={m.depositsOver} limit={aid} />
              <Meter label="משיכות" sum={m.withdrawals} over={m.withdrawalsOver} limit={aid} />
            </header>
            {mr.length === 0 ? (
              <p class="muted">אין שורות נבחרות בחודש הזה</p>
            ) : (
              <div class="ledger">
                {mr.map((r) => (
                  <div
                    class={'tx' + (r.include ? ' sel' : '')}
                    key={r.tx.id}
                    onClick={(e) => {
                      // לחיצה בכל מקום בשורה מסמנת או מסירה אותה, חוץ מכפתורי קבועה/חד פעמית
                      if ((e.target as HTMLElement).closest('button, input')) return
                      toggle(r.tx.id, !r.include, r.auto)
                    }}
                  >
                    <span class="pick">
                      <input
                        type="checkbox"
                        checked={r.include}
                        aria-label={`${fmtDate(r.tx.date)} ${r.tx.desc}`}
                        onChange={(e) => toggle(r.tx.id, e.currentTarget.checked, r.auto)}
                      />
                    </span>
                    <span class="date num">{fmtDate(r.tx.date)}</span>
                    <span class="desc">{r.tx.desc || 'ללא תיאור'}</span>
                    <span class="note">
                      {!aid && r.include && r.auto && r.tx.amount < 0 && <span>הוצאת רכב</span>}
                      {r.include !== r.auto && <span class="manual">{r.include ? 'נוסף ידנית' : 'הוסר ידנית'}</span>}
                      {!aid && r.tx.amount > 0 && (
                        <span class="seg small">
                          <button class={r.fixed ? 'on' : ''} onClick={() => setFixed(r.tx.id, true, !!r.autoFixed)}>
                            קבועה
                          </button>
                          <button class={!r.fixed ? 'on' : ''} onClick={() => setFixed(r.tx.id, false, !!r.autoFixed)}>
                            חד פעמית
                          </button>
                        </span>
                      )}
                    </span>
                    <span class="kind">{r.tx.amount > 0 ? 'הפקדה' : 'משיכה'}</span>
                    <Amount value={r.tx.amount} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
      <div class="bar">
        <div class="bar-in">
          <span>
            נבחרו <b>{selected}</b> מתוך <b>{rows.length}</b> תנועות
          </span>
          <button class="btn primary" disabled={!selected} onClick={send}>
            <Lock {...ICON} />
            נעילה ושליחה ל{d.recipient === 'owner' ? 'בעל החשבון' : 'חייל'}
          </button>
        </div>
      </div>
    </>
  )
}

function Sent({ d, update }: { d: Declaration; update: Upd }) {
  const [link, setLink] = useState('')
  const [phone, setPhone] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    encodePayload(payloadOf(d)).then((c) => setLink(appUrl('#s=' + c)))
  }, [d])
  const who = d.recipient === 'owner' ? 'בעל החשבון' : 'החייל'
  const text = `שלום, יש למלא הסבר לכל שורה בהצהרת ההפקדות ולשלוח חזרה:\n${link}`
  return (
    <>
      <section class="card">
        <h2>
          שליחה ל{who}, סבב {d.round}
        </h2>
        <p>
          ננעלו <b class="num">{d.sent!.rows.length}</b> שורות. {who} יכול לכתוב הסברים בלבד, והתאריכים והסכומים נשארים כפי
          שהם אצלך.
        </p>
        <label class="field">
          <span>טלפון, לא חובה. בלי מספר בוחרים איש קשר בוואטסאפ</span>
          <input value={phone} onInput={(e) => setPhone(e.currentTarget.value)} inputMode="tel" dir="ltr" placeholder="050-0000000" />
        </label>
        <div class="actions">
          <a class={'btn primary' + (link ? '' : ' disabled')} href={link ? waLink(text, phone) : undefined} target="_blank" rel="noopener">
            <Send {...ICON} />
            שליחה בוואטסאפ
          </a>
          <button class="btn" disabled={!link} onClick={async () => setCopied(await copy(link))}>
            {copied ? <Check {...ICON} /> : <Copy {...ICON} />}
            {copied ? 'הועתק' : 'העתקת קישור'}
          </button>
        </div>
        <p class="muted">כשהתשובה חוזרת, לוחצים על הקישור שהחייל שלח או מדביקים אותו במסך הראשי</p>
      </section>
      <button
        class="link"
        onClick={() => {
          if (confirm('חזרה לעריכה מבטלת את הקישור שנשלח. להמשיך?'))
            update((x) => {
              x.status = 'draft'
              delete x.sent
            })
        }}
      >
        חזרה לעריכת השורות, מבטל את הקישור שנשלח
      </button>
    </>
  )
}

function Returned({ d, update, setD }: { d: Declaration; update: Upd; setD: (d: Declaration) => void }) {
  const rows = d.sent!.rows
  const disputes = rows.filter((r) => d.answers[r.i]?.dispute).length
  const fixes = Object.values(d.fixNotes).filter((n) => n.trim()).length
  const p = d.person ?? {}
  async function resend() {
    const c = structuredClone(d)
    await buildSend(c)
    setD(c)
  }
  return (
    <>
      {disputes > 0 && (
        <Banner kind="warn">
          <b>{disputes} שורות סומנו כשגויות.</b> בודקים מול העו"ש, ואז מסירים את השורה בעריכת שורות או מחזירים לתיקון.
        </Banner>
      )}
      <section class="card">
        <h2>פרטי המצהיר</h2>
        <dl class="facts">
          <dt>שם</dt>
          <dd>{p.name ?? 'חסר'}</dd>
          {d.type === 'aid' ? (
            <>
              <dt>מספר אישי</dt>
              <dd class="num">{p.personalNum ?? ''}</dd>
            </>
          ) : (
            <>
              <dt>ת"ז</dt>
              <dd class="num">{p.idNum ?? ''}</dd>
              <dt>מצב משפחתי</dt>
              <dd>{p.marital ?? 'חסר'}</dd>
              <dt>החייל</dt>
              <dd>
                {p.soldierName ?? 'חסר'} · <span class="num">{p.soldierNum ?? ''}</span>
              </dd>
              <dt>חשבון</dt>
              <dd>{[p.acct?.bank, p.acct?.branch, p.acct?.number].filter(Boolean).join(' · ') || 'חסר'}</dd>
            </>
          )}
        </dl>
      </section>
      <div class="ledger">
        {rows.map((r) => {
          const a = d.answers[r.i]
          return (
            <div class={'entry' + (a?.dispute ? ' disputed' : '')} key={r.i}>
              <div class="ehead">
                <span class="date num">{fmtDate(r.d)}</span>
                <span class="kind">{r.a > 0 ? 'הפקדה' : 'משיכה'}</span>
                <Amount value={r.a} />
              </div>
              <div class="desc">{r.s}</div>
              <div class="exp">{a?.exp || 'אין הסבר'}</div>
              {a?.dispute && <div class="manual">לדעת המצהיר השורה שגויה: {a.note || 'בלי הערה'}</div>}
              {d.status === 'returned' && (
                <input
                  class="fix"
                  placeholder="הערה לתיקון, למשל: ממי ההעברה"
                  value={d.fixNotes[r.i] ?? ''}
                  onInput={(e) => {
                    const v = e.currentTarget.value
                    update((x) => {
                      if (v) x.fixNotes[r.i] = v.slice(0, 200)
                      else delete x.fixNotes[r.i]
                    })
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
      <div class="bar">
        <div class="bar-in">
          <span>
            <b>{rows.length}</b> שורות עם הסבר
          </span>
          <span class="actions">
            {d.status === 'returned' && (
              <button class="btn" disabled={!fixes} onClick={resend}>
                החזרה לתיקון{fixes ? ` (${fixes})` : ''}
              </button>
            )}
            <a class="btn primary" href={'#print/' + d.id}>
              <Printer {...ICON} />
              הפקת PDF
            </a>
          </span>
        </div>
      </div>
      {d.status === 'returned' && (
        <button
          class="link"
          onClick={() =>
            update((x) => {
              x.status = 'draft'
              delete x.sent
            })
          }
        >
          עריכת שורות ושליחה מחדש
        </button>
      )}
    </>
  )
}
