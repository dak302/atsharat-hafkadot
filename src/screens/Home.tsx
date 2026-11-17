import { useState } from 'preact/hooks'
import { go } from '../app'
import { decodePayload, decryptJson, encryptJson, extractCode } from '../lib/codec'
import { applyReturn, importDecls, loadAll } from '../lib/store'
import type { Declaration, ReturnPayload } from '../lib/types'
import { Banner, Page, STATUS_NAME, TYPE_NAME } from '../lib/ui'

export function Home() {
  const [list, setList] = useState(loadAll)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null)
  const [tools, setTools] = useState(false)

  async function paste() {
    const c = extractCode(code, 'r')
    if (!c) return setMsg({ kind: 'bad', text: 'לא זוהה קוד תשובה. הדבק את הקישור המלא שהחייל שלח.' })
    try {
      const res = applyReturn(await decodePayload<ReturnPayload>(c))
      if (res.ok) go('#d/' + res.decl.id)
      else setMsg({ kind: 'bad', text: res.error })
    } catch {
      setMsg({ kind: 'bad', text: 'הקוד פגום או חתוך. בקש מהחייל לשלוח שוב.' })
    }
  }

  async function exportAll() {
    const pw = prompt('בחר סיסמה לקובץ הגיבוי (לפחות 6 תווים):')
    if (!pw) return
    if (pw.length < 6) return setMsg({ kind: 'bad', text: 'הסיסמה קצרה מדי.' })
    const blob = new Blob([await encryptJson(loadAll(), pw)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `hafkadot-${new Date().toISOString().slice(0, 10)}.hafkadot`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importFile(f: File | undefined) {
    if (!f) return
    const pw = prompt('סיסמת קובץ הגיבוי:')
    if (!pw) return
    try {
      const n = importDecls(await decryptJson<Declaration[]>(await f.text(), pw))
      setList(loadAll())
      setMsg({ kind: 'ok', text: `יובאו ${n} הצהרות.` })
    } catch (e) {
      setMsg({ kind: 'bad', text: (e as Error).message })
    }
  }

  return (
    <Page title="הצהרות הפקדות">
      <a class="btn primary big" href="#new">
        + הצהרה חדשה
      </a>
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <section class="card">
        <h2>חייל שלח תשובה?</h2>
        <p class="muted">לחיצה על הקישור שהחייל שלח פותחת אותה אוטומטית. אפשר גם להדביק כאן:</p>
        <div class="row">
          <input value={code} onInput={(e) => setCode(e.currentTarget.value)} placeholder="הדבק קישור תשובה" dir="ltr" />
          <button class="btn" onClick={paste} disabled={!code.trim()}>
            קלוט
          </button>
        </div>
      </section>

      <h2>ההצהרות במכשיר הזה</h2>
      {list.length === 0 && <p class="muted">עדיין אין הצהרות.</p>}
      <ul class="list">
        {list.map((d) => (
          <li key={d.id}>
            <a href={'#d/' + d.id}>
              <span class="grow">
                <b>{d.label || 'ללא שם'}</b>
                <small>
                  {TYPE_NAME[d.type]} · {d.account.bank ?? d.fileName}
                </small>
              </span>
              <span class={'tag ' + d.status}>{STATUS_NAME[d.status]}</span>
            </a>
          </li>
        ))}
      </ul>

      <button class="link" onClick={() => setTools(!tools)}>
        גיבוי והעברה בין מכשירים
      </button>
      {tools && (
        <section class="card">
          <p class="muted">
            הנתונים נשמרים רק בדפדפן של המכשיר הזה. כדי להעביר למכשיר אחר או למשק אחר, ייצא קובץ מוצפן בסיסמה וייבא
            אותו שם.
          </p>
          <div class="row">
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
