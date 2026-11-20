import { useState } from 'preact/hooks'
import { ChevronLeft, Plus } from 'lucide-preact'
import { go } from '../app'
import { decodePayload, decryptJson, encryptJson, extractCode } from '../lib/codec'
import { applyReturn, importDecls, loadAll } from '../lib/store'
import type { Declaration, ReturnPayload } from '../lib/types'
import { count } from '../lib/plural'
import { celebrate } from '../lib/celebrate'
import { Banner, ICON, Page, TYPE_NAME } from '../lib/ui'

/** קבוצות לפי מה שצריך לעשות עכשיו, מהדחוף לפחות דחוף */
const GROUPS: { status: Declaration['status']; title: string; action: string }[] = [
  { status: 'returned', title: 'חזרו מהחייל, לבדיקה', action: 'לבדוק ולהפיק PDF' },
  { status: 'draft', title: 'טיוטות', action: 'לבחור שורות ולשלוח' },
  { status: 'sent', title: 'אצל החייל', action: 'ממתין לתשובה' },
  { status: 'done', title: 'הושלמו', action: 'PDF הופק' },
]

export function Home() {
  const [list, setList] = useState(loadAll)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null)
  const [tools, setTools] = useState(false)
  const [showDone, setShowDone] = useState(false)

  async function paste() {
    const c = extractCode(code, 'r')
    if (!c) return setMsg({ kind: 'bad', text: 'לא זוהה קישור תשובה. יש להדביק את הקישור המלא שהחייל שלח.' })
    try {
      const res = applyReturn(await decodePayload<ReturnPayload>(c))
      if (res.ok) {
        celebrate('התשובה התקבלה')
        go('#d/' + res.decl.id)
      }
      else setMsg({ kind: 'bad', text: res.error })
    } catch {
      setMsg({ kind: 'bad', text: 'הקישור פגום או חתוך. יש לבקש מהחייל לשלוח שוב.' })
    }
  }

  async function exportAll() {
    const pw = prompt('סיסמה לקובץ הגיבוי, לפחות 6 תווים')
    if (!pw) return
    if (pw.length < 6) return setMsg({ kind: 'bad', text: 'הסיסמה קצרה מדי' })
    const blob = new Blob([await encryptJson({ decls: loadAll() }, pw)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `hafkadot-${new Date().toISOString().slice(0, 10)}.hafkadot`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importFile(f: File | undefined) {
    if (!f) return
    const pw = prompt('סיסמת קובץ הגיבוי')
    if (!pw) return
    try {
      const data = await decryptJson<Declaration[] | { decls: Declaration[] }>(await f.text(), pw)
      const n = importDecls(Array.isArray(data) ? data : data.decls ?? [])
      setList(loadAll())
      setMsg({ kind: 'ok', text: `יובאו ${count(n, 'הצהרה אחת', 'הצהרות')}` })
    } catch (e) {
      setMsg({ kind: 'bad', text: (e as Error).message })
    }
  }

  return (
    <Page title="הצהרות הפקדות">
      <a class="btn primary block" href="#new">
        <Plus {...ICON} />
        הצהרה חדשה מעו"ש
      </a>
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {list.length === 0 && (
        <section class="card howto">
          <h2>איך זה עובד</h2>
          <ol>
            <li>
              <b>מעלים את העו"ש</b> שהחייל שלח, PDF מקורי מהבנק או אקסל
            </li>
            <li>
              <b>בודקים את השורות</b> שהאפליקציה בחרה לפי הכללים, ושולחים לחייל קישור בוואטסאפ
            </li>
            <li>
              <b>החייל כותב הסבר</b> לכל פעולה ושולח קישור חזרה
            </li>
            <li>
              <b>לוחצים על הקישור שחזר</b>, בודקים ומפיקים את הטופס כ-PDF
            </li>
          </ol>
        </section>
      )}

      {GROUPS.map((g) => {
        const items = list.filter((d) => d.status === g.status)
        if (!items.length) return null
        const hidden = g.status === 'done' && !showDone
        return (
          <section class="group" key={g.status}>
            <h2>
              {g.title} <span class="count num">{items.length}</span>
            </h2>
            {hidden ? (
              <button class="link" onClick={() => setShowDone(true)}>
                הצגת ההצהרות שהושלמו
              </button>
            ) : (
              <ul class="list">
                {items.map((d) => (
                  <li key={d.id}>
                    <a href={'#d/' + d.id}>
                      <span class="grow">
                        <b>{d.label || 'ללא שם'}</b>
                        <small>
                          {TYPE_NAME[d.type]} · {d.account.bank ?? d.fileName} · {d.txs.length} תנועות
                        </small>
                      </span>
                      <span class={'tag ' + d.status}>{g.action}</span>
                      <ChevronLeft {...ICON} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}

      <section class="card">
        <h2>חייל שלח תשובה?</h2>
        <p class="muted">לוחצים על הקישור שהוא שלח בוואטסאפ, והתשובה נקלטת לבד. אם זה לא עובד, מדביקים אותו כאן</p>
        <label class="fieldlabel" for="reply">
          קישור התשובה מהחייל
        </label>
        <div class="actions">
          <input id="reply" value={code} onInput={(e) => setCode(e.currentTarget.value)} placeholder="קישור תשובה" dir="ltr" />
          <button class="btn" onClick={paste} disabled={!code.trim()}>
            קליטה
          </button>
        </div>
      </section>

      <button class="link" onClick={() => setTools(!tools)}>
        גיבוי והעברה בין מכשירים
      </button>
      {tools && (
        <section class="card">
          <p class="muted">
            הנתונים נשמרים רק בדפדפן של המכשיר הזה. כדי להעביר למכשיר אחר או למשק אחר, מייצאים קובץ מוצפן בסיסמה ומייבאים
            אותו שם.
          </p>
          <div class="actions">
            <button class="btn" onClick={exportAll} disabled={!list.length}>
              ייצוא קובץ מוצפן
            </button>
            <label class="btn">
              ייבוא קובץ
              <input type="file" accept=".hafkadot,application/json" hidden onChange={(e) => importFile(e.currentTarget.files?.[0])} />
            </label>
          </div>
        </section>
      )}
    </Page>
  )
}
