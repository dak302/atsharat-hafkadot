import { useEffect, useMemo, useState } from 'preact/hooks'
import { go } from '../app'
import { encodePayload } from '../lib/codec'
import { fmtDate, fmtMoney } from '../lib/grid'
import { AID_MONTH_LIMIT, evaluate, monthOf, summarize } from '../lib/rules'
import { buildSend, deleteDecl, getDecl, payloadOf, putDecl } from '../lib/store'
import type { Declaration } from '../lib/types'
import { appUrl, Banner, copy, Page, STATUS_NAME, TYPE_NAME, waLink } from '../lib/ui'

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
const monthName = (m: string) => `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`

export function DeclScreen({ id }: { id: string }) {
  const [d, setD] = useState<Declaration | undefined>(() => getDecl(id))
  if (!d) {
    return (
      <Page title="לא נמצא" back="#">
        <Banner kind="bad">ההצהרה לא נמצאת במכשיר הזה.</Banner>
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
  const title = `${d.label || 'הצהרה'} · ${TYPE_NAME[d.type]}`
  return (
    <Page title={title} back="#" wide>
      <p class="muted">
        <span class={'tag ' + d.status}>{STATUS_NAME[d.status]}</span> {d.account.bank ?? ''} · {d.fileName}
        {d.report.status !== 'verified' && <b class="red"> · קריאת הקובץ לא אומתה</b>}
      </p>
      {d.status === 'draft' && <Review d={d} update={update} setD={setD} />}
      {d.status === 'sent' && <Sent d={d} update={update} />}
      {(d.status === 'returned' || d.status === 'done') && <Returned d={d} update={update} setD={setD} />}
      <button class="link red" onClick={remove}>
        מחיקת ההצהרה מהמכשיר
      </button>
    </Page>
  )
}

type Upd = (fn: (d: Declaration) => void) => void

function Review({ d, update, setD }: { d: Declaration; update: Upd; setD: (d: Declaration) => void }) {
  const [onlySel, setOnlySel] = useState(false)
  const rows = useMemo(() => evaluate(d.type, d.txs, d.overrides), [d])
  const months = useMemo(() => summarize(d.txs), [d.txs])
  const selected = rows.filter((r) => r.include).length

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
        {d.type === 'aid'
          ? `הכלל: אם סך ההפקדות בחודש (או סך המשיכות, בנפרד) עולה על ${AID_MONTH_LIMIT} ₪, נבחרת כל פעולה מעל 200 ₪.`
          : 'הכלל: הכנסה קבועה מ-250 ₪, הכנסה חד פעמית מ-750 ₪, והוצאות רכב. הוצאות חריגות אחרות מסמנים ידנית.'}{' '}
        אפשר לסמן או להסיר כל שורה.
      </Banner>
      <label class="check">
        <input type="checkbox" checked={onlySel} onChange={(e) => setOnlySel(e.currentTarget.checked)} />
        <span>הצג רק שורות שנבחרו</span>
      </label>
      {months.map((m) => {
        const mr = rows.filter((r) => monthOf(r.tx.date) === m.month && (!onlySel || r.include))
        return (
          <section class="month" key={m.month}>
            <h3>
              {monthName(m.month)}
              <span class={'sum' + (d.type === 'aid' && m.depositsOver ? ' over' : '')}>הפקדות {fmtMoney(m.deposits)}</span>
              <span class={'sum' + (d.type === 'aid' && m.withdrawalsOver ? ' over' : '')}>משיכות {fmtMoney(m.withdrawals)}</span>
            </h3>
            {mr.length === 0 && <p class="muted">אין שורות להצגה.</p>}
            {mr.map((r) => (
              <div class={'tx' + (r.include ? ' sel' : '')} key={r.tx.id}>
                <label class="pick">
                  <input type="checkbox" checked={r.include} onChange={(e) => toggle(r.tx.id, e.currentTarget.checked, r.auto)} />
                </label>
                <div class="grow">
                  <div class="line">
                    <span class="date">{fmtDate(r.tx.date)}</span>
                    <span class={'amt ' + (r.tx.amount > 0 ? 'dep' : 'wd')}>
                      {r.tx.amount > 0 ? 'הפקדה' : 'משיכה'} <b>{fmtMoney(r.tx.amount)}</b>
                    </span>
                  </div>
                  <div class="desc">{r.tx.desc || '—'}</div>
                  <div class="meta">
                    {r.reason && <span class="why">{r.reason}</span>}
                    {r.include !== r.auto && <span class="manual">{r.include ? 'נוסף ידנית' : 'הוסר ידנית'}</span>}
                    {d.type === 'tashmash' && r.tx.amount > 0 && (
                      <span class="seg small">
                        <button class={r.fixed ? 'on' : ''} onClick={() => setFixed(r.tx.id, true, !!r.autoFixed)}>
                          קבועה
                        </button>
                        <button class={!r.fixed ? 'on' : ''} onClick={() => setFixed(r.tx.id, false, !!r.autoFixed)}>
                          חד פעמית
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </section>
        )
      })}
      <div class="bar">
        <span>
          נבחרו <b>{selected}</b> מתוך {rows.length} תנועות
        </span>
        <button class="btn primary" disabled={!selected} onClick={send}>
          נעל ושלח ל{d.recipient === 'owner' ? 'בעל החשבון' : 'חייל'}
        </button>
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
        <h2>שליחה ל{who}</h2>
        <p>
          ננעלו <b>{d.sent!.rows.length}</b> שורות (סבב {d.round}). {who} יכול לכתוב הסברים בלבד. תאריכים וסכומים נשארים
          כפי שהם אצלך.
        </p>
        <label class="field">
          <span>טלפון (לא חובה, אפשר לבחור איש קשר בוואטסאפ)</span>
          <input value={phone} onInput={(e) => setPhone(e.currentTarget.value)} inputMode="tel" dir="ltr" placeholder="050-0000000" />
        </label>
        <div class="row">
          <a class={'btn primary' + (link ? '' : ' disabled')} href={link ? waLink(text, phone) : undefined} target="_blank" rel="noopener">
            שלח בוואטסאפ
          </a>
          <button
            class="btn"
            disabled={!link}
            onClick={async () => {
              setCopied(await copy(link))
            }}
          >
            {copied ? 'הועתק ✓' : 'העתק קישור'}
          </button>
        </div>
        <p class="muted">אורך הקישור: {link.length} תווים. כשהתשובה תחזור, לחץ על הקישור שהחייל שלח או הדבק אותו במסך הראשי.</p>
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
        חזרה לעריכת השורות (מבטל את הקישור שנשלח)
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
          {disputes} שורות סומנו "לא מסכים". בדוק מול העו"ש, ואז הסר את השורה (עריכת שורות) או החזר לתיקון.
        </Banner>
      )}
      <section class="card">
        <h2>פרטי המצהיר</h2>
        <dl class="facts">
          <dt>שם</dt>
          <dd>{p.name ?? '—'}</dd>
          {d.type === 'aid' ? (
            <>
              <dt>מספר אישי</dt>
              <dd>{p.personalNum ?? '—'}</dd>
            </>
          ) : (
            <>
              <dt>ת"ז</dt>
              <dd>{p.idNum ?? '—'}</dd>
              <dt>מצב משפחתי</dt>
              <dd>{p.marital ?? '—'}</dd>
              <dt>החייל</dt>
              <dd>
                {p.soldierName ?? '—'} · {p.soldierNum ?? '—'}
              </dd>
              <dt>חשבון</dt>
              <dd>{[p.acct?.bank, p.acct?.branch, p.acct?.number].filter(Boolean).join(' · ') || '—'}</dd>
            </>
          )}
        </dl>
      </section>
      {rows.map((r) => {
        const a = d.answers[r.i]
        return (
          <div class={'tx sel' + (a?.dispute ? ' disputed' : '')} key={r.i}>
            <div class="grow">
              <div class="line">
                <span class="date">{fmtDate(r.d)}</span>
                <span class={'amt ' + (r.a > 0 ? 'dep' : 'wd')}>
                  {r.a > 0 ? 'הפקדה' : 'משיכה'} <b>{fmtMoney(r.a)}</b>
                </span>
              </div>
              <div class="desc">{r.s}</div>
              <div class="exp">{a?.exp || <i>אין הסבר</i>}</div>
              {a?.dispute && <div class="manual">לא מסכים: {a.note || 'בלי הערה'}</div>}
              {d.status === 'returned' && (
                <input
                  class="fix"
                  placeholder="הערה לתיקון (למשל: פרט ממי ההעברה)"
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
          </div>
        )
      })}
      <div class="bar">
        {d.status === 'returned' ? (
          <>
            <button class="btn" disabled={!fixes} onClick={resend}>
              החזר לתיקון ({fixes})
            </button>
            <a class="btn primary" href={'#print/' + d.id}>
              הפק PDF
            </a>
          </>
        ) : (
          <a class="btn primary" href={'#print/' + d.id}>
            הפק PDF שוב
          </a>
        )}
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
          עריכת שורות (הוספה או הסרה) ושליחה מחדש
        </button>
      )}
    </>
  )
}
