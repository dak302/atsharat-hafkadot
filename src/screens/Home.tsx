import { useState } from 'preact/hooks'
import { ChevronLeft, Plus } from 'lucide-preact'
import { go } from '../app'
import { decodePayload, decryptJson, encryptJson, extractCode } from '../lib/codec'
import { applyReturn, importDecls, loadAll } from '../lib/store'
import type { Declaration, ReturnPayload } from '../lib/types'
import { Banner, ICON, Page, STATUS_NAME, TYPE_NAME } from '../lib/ui'

export function Home() {
  const [list, setList] = useState(loadAll)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null)
  const [tools, setTools] = useState(false)

  async function paste() {
    const c = extractCode(code, 'r')
    if (!c) return setMsg({ kind: 'bad', text: 'לא זוהה קישור תשובה. יש להדביק את הקישור המלא שהחייל שלח.' })
    try {
      const res = applyReturn(await decodePayload<ReturnPayload>(c))
      if (res.ok) go('#d/' + res.decl.id)
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
      setMsg({ kind: 'ok', text: `יובאו ${n} הצהרות` })
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

      {list.length > 0 ? (
        <ul class="list">
          {list.map((d) => (
            <li key={d.id}>
              <a href={'#d/' + d.id}>
                <span class="grow">
                  <b>{d.label || 'ללא שם'}</b>
                  <small>
                    {TYPE_NAME[d.type]} · {d.account.bank ?? d.fileName} · {d.txs.length} תנועות
                  </small>
                </span>
                <span class={'tag ' + d.status}>{STATUS_NAME[d.status]}</span>
                <ChevronLeft {...ICON} />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p class="muted">אין עדיין הצהרות במכשיר הזה. מתחילים מהעלאת העו"ש שהחייל שלח</p>
      )}

      <section class="card">
        <h2>קליטת תשובה מחייל</h2>
        <p class="muted">לחיצה על הקישור שהחייל שלח קולטת את התשובה לבד. אפשר גם להדביק אותו כאן</p>
        <div class="actions">
          <input value={code} onInput={(e) => setCode(e.currentTarget.value)} placeholder="קישור תשובה" dir="ltr" />
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
