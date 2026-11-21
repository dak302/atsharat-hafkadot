import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import header from '../assets/header.png'
import { fmtDate, fmtMoney } from '../lib/grid'
import { getDecl, putDecl } from '../lib/store'
import { celebrate } from '../lib/celebrate'
import type { Declaration, LockedRow } from '../lib/types'
import { ArrowRight, Printer } from 'lucide-preact'
import { Banner, ICON } from '../lib/ui'

const DECL_AID =
  'הנני מצהיר כי כל הפרטים אשר מסרתי בטופס זה נכונים, מלאים, מדויקים וכנים, וכי לא העלמתי כל פרט שהוא. הנני מצהיר כי הוזהרתי בעת מילוי טופס זה בדבר חובתי למסור את האמת ואת כל האמת וידוע לי כי מסירת פרטים בלתי נכונים, באופן מלא או חלקי, או העלמת פרטים כל שהם, וכן אי הודעה בזמן על שינוי בפרטים אותם מסרתי בטופס זה, מהווה עבירה על החוק, ותגרור בעקבותיה עונשים כקבוע בחוק ושלילת זכויות שנרכשו על-פי ההצהרה. ידוע לי שצה״ל עשוי להיעזר בחברת חקירות אזרחיות שמטרתה בדיקת נכונות הפרטים שמסרתי.'
const DECL_TM =
  'הנני מצהיר כי כל הפרטים אשר מסרתי בטופס זה נכונים, מלאים, מדויקים וכנים, וכי לא העלמתי כל פרט שהוא. הנני מתחייב להודיע למפקד היחידה ולקצינת הת"ש על כל שינוי שיחול בפרטים אלו בתוך ארבעה עשר ימים מיום שיחול שינוי כאמור. הנני מצהיר כי הוזהרתי בעת מילוי טופס זה בדבר חובתי למסור את האמת ואת כל האמת וידוע לי כי מסירת פרטים בלתי נכונים, באופן מלא או חלקי, או העלמת פרטים כל שהם, וכן אי הודעה בזמן על שינוי בפרטים אותם מסרתי בטופס זה, מהווה עבירה על החוק, ותגרור בעקבותיה עונשים כקבוע בחוק ושלילת זכויות שנרכשו על-פי ההצהרה. ידוע לי שצה"ל עשוי להיעזר בחברת חקירות אזרחית שמטרתה בדיקת נכונות הפרטים שמסרתי.'
const MARITAL = ['גרוש/ה', 'נשוי/אה', 'פרוד/ה', 'אלמן/ה']

function Fill(props: { v?: string; w?: number }) {
  return (
    <span class="fill" style={{ minWidth: (props.w ?? 150) + 'px' }}>
      {props.v ?? ''}
    </span>
  )
}

/** שורות של עמוד אחד, ומספר השורות הריקות שמשלימות את הטבלה בעמוד האחרון */
interface Chunk {
  rows: LockedRow[]
  pad: number
}

/** חלוקה ראשונית: כמספר השורות בטופס הרשמי בכל עמוד. אחר כך המדידה מעבירה שורה לעמוד הבא אם עמוד גולש */
function initialChunks(rows: LockedRow[], perPage: number): Chunk[] {
  const out: Chunk[] = []
  for (let i = 0; i < rows.length; i += perPage) out.push({ rows: rows.slice(i, i + perPage), pad: 0 })
  if (!out.length) out.push({ rows: [], pad: 0 })
  const last = out[out.length - 1]
  last.pad = Math.max(0, perPage - last.rows.length)
  return out
}

export function PrintView({ id }: { id: string }) {
  const [d, setD] = useState<Declaration | undefined>(() => getDecl(id))
  const perPage = 8
  const [chunks, setChunks] = useState<Chunk[]>(() => initialChunks(d?.sent?.rows ?? [], perPage))
  const sheets = useRef<(HTMLElement | null)[]>([])

  // הגופן נטען אחרי המדידה הראשונה ומגדיל את הטקסט, ולכן מחלקים מחדש כשהוא מוכן
  useLayoutEffect(() => {
    const redo = () => setChunks(initialChunks(d?.sent?.rows ?? [], perPage))
    let live = true
    document.fonts?.ready.then(() => { if (live) redo() })
    return () => { live = false }
  }, [d?.sent])

  // כל עמוד חייב להיכנס ב-A4 עם כל הטקסט והחתימות. עמוד שגולש מוותר קודם על שורה ריקה, ואחר כך מעביר שורה לעמוד הבא
  useLayoutEffect(() => {
    for (let k = 0; k < chunks.length; k++) {
      const el = sheets.current[k]
      if (!el || el.scrollHeight <= el.clientHeight + 1) continue
      const next = chunks.map((c) => ({ rows: [...c.rows], pad: c.pad }))
      if (next[k].pad > 0) next[k].pad--
      else if (next[k].rows.length > 1) {
        const moved = next[k].rows.pop()!
        if (!next[k + 1]) next.push({ rows: [], pad: 0 })
        next[k + 1].rows.unshift(moved)
      } else continue
      setChunks(next)
      return
    }
  }, [chunks])

  if (!d || !d.sent) return <Banner kind="bad">ההצהרה לא נמצאת או שעדיין לא חזרה מהחייל.</Banner>
  const p = d.person ?? {}
  const rows = d.sent.rows
  const disputes = rows.filter((r) => d.answers[r.i]?.dispute).length
  const today = fmtDate(new Date().toISOString().slice(0, 10))

  function print() {
    const prev = document.title
    document.title = `הצהרת הפקדות - ${p.name ?? d!.label}`
    window.print()
    document.title = prev
    celebrate('הטופס הופק')
    if (d!.status !== 'done') {
      const c = { ...d!, status: 'done' as const }
      putDecl(c)
      setD(c)
    }
  }

  const table = (chunk: Chunk) => (
    <table class="ftable">
      <thead>
        <tr>
          <th style="width:24%">תאריך הפעולה</th>
          <th style="width:21%">הפקדה/משיכה</th>
          <th style="width:21%">סכום</th>
          <th>
            הסבר
            <br />
            עבור מה ההכנסה/הוצאה, האם קבועה/חד פעמית וכו'
          </th>
        </tr>
      </thead>
      <tbody>
        {chunk.rows.map((r) => (
          <tr key={r.i}>
            <td>{fmtDate(r.d)}</td>
            <td>{r.a > 0 ? 'הפקדה' : 'משיכה'}</td>
            <td>{fmtMoney(r.a)} ₪</td>
            <td class="exp">
              {r.k ? (r.k === 'f' ? 'קבועה. ' : 'חד פעמית. ') : ''}
              {d.answers[r.i]?.exp ?? ''}
            </td>
          </tr>
        ))}
        {Array.from({ length: chunk.pad }, (_, i) => (
          <tr key={'p' + i}>
            <td>&nbsp;</td>
            <td />
            <td />
            <td />
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div class="printwrap">
      <div class="noprint tools">
        <a class="btn" href={'#d/' + d.id}>
          <ArrowRight {...ICON} />
          חזרה
        </a>
        <button class="btn primary" onClick={print}>
          <Printer {...ICON} />
          הדפסה או שמירה כ-PDF
        </button>
        <span class="muted">בחלון ההדפסה בוחרים שמירה כ-PDF, גודל A4, בלי כותרות עליונות ותחתונות</span>
        {disputes > 0 && <Banner kind="warn">{disputes === 1 ? 'שורה אחת עדיין מסומנת כשגויה' : `${disputes} שורות עדיין מסומנות כשגויות`}</Banner>}
        {d.report.status !== 'verified' && <Banner kind="warn">קריאת העו"ש של ההצהרה הזו לא אומתה מול היתרות</Banner>}
      </div>

      {chunks.length > 1 && (
        <p class="noprint pages-note">
          ההצהרה ארוכה מעמוד אחד, ולכן היא מחולקת ל-{chunks.length} עמודים. בכל עמוד יש את כל הטופס, וצריך לחתום על כל עמוד.
        </p>
      )}
      {chunks.map((chunk, k) => (
      <article class="sheet" key={k} ref={(el) => {
          sheets.current[k] = el
        }}>
        <img class="fhead" src={header} width={1430} height={182} alt='ספר ניהול משרד הת"ש' />
        {d.type === 'aid' ? (
          <>
            <div class="ftitle">נספח ו' - הצהרת חייל בפני מפקד בדרגת סמל ומעלה בדבר משיכות והפקדות חריגות</div>
            <p class="lead">
              אני הח״מ <Fill v={p.name} w={130} /> מ.א <Fill v={p.personalNum} w={110} /> <b>מצהיר בזאת על ההוצאות/ההכנסות להלן:</b>
            </p>
            {table(chunk)}
            <div class="rulebox">
              <u>
                <b>הצהרה נדרשת על פי הפירוט הבא:</b>
              </u>
              <p>
                ההצהרה תתבצע במידה וסכום ההפקדות/המשיכות עולה על 600 ש״ח הכול בחודש, במקרה זה נדרש להצהיר עבור כל
                הפקדה/משיכה של מעל 200 ש״ח.
              </p>
            </div>
            <p class="decl">{DECL_AID}</p>
            <div class="sig">
              <div class="vals">
                <span>{p.name}</span>
                <span>{p.personalNum}</span>
                <span>{today}</span>
                <span />
              </div>
              <div class="labels">
                <span>שם פרטי ומשפחה</span>
                <span>מספר אישי</span>
                <span>תאריך</span>
                <span>חתימה</span>
              </div>
            </div>
            <div class="cmd">
              <p>
                <u>
                  <b>פרטי המפקד המאשר:</b>
                </u>
              </p>
              <p class="lead">
                אני הח"מ <Fill w={210} /> מאשר בזאת כי בתאריך <Fill w={130} /> הופיע בפני <Fill w={220} /> המוכר לי
                אישית/ אשר הזדהה בתעודה <Fill w={120} /> (יש למחוק את המיותר) והצהיר בפני את הצהרתו דלעיל.
              </p>
              <div class="sig">
                <div class="vals">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <div class="labels">
                  <span>שם פרטי ומשפחה</span>
                  <span>מספר אישי</span>
                  <span>דרגה</span>
                  <span>תפקיד</span>
                  <span>תאריך</span>
                  <span>חתימה</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div class="ftitle narrow">נספח ג' - הצהרת מוטב לתשמ"ש בדבר הוצאות והכנסות חריגות</div>
            <div class="sec">
              <h4>1. פרטים אישיים -</h4>
              <p>
                אני הח"מ: <small>(שם מלא)</small> <Fill v={p.name} /> <small>(מספר ת.ז)</small> <Fill v={p.idNum} />
              </p>
            </div>
            <div class="sec inline">
              <h4>2. מצב משפחתי -</h4>
              <p>
                {MARITAL.map((m, i) => (
                  <span class={'mar' + (p.marital === m ? ' on' : '')}>
                    {m}
                    {i < MARITAL.length - 1 ? ',' : '.'}
                  </span>
                ))}
              </p>
            </div>
            <div class="sec">
              <h4>3. ההצהרה הינה בנוגע לבקשת החייל -</h4>
              <p>
                <small>(שם מלא)</small> <Fill v={p.soldierName} w={200} /> <small>(מספר אישי)</small> <Fill v={p.soldierNum} />
              </p>
            </div>
            <div class="sec">
              <h4>4. פרטי חשבון בנק של המצהיר -</h4>
              <p>
                <small>(מספר חשבון)</small> <Fill v={p.acct?.number} /> <small>(שם הבנק)</small> <Fill v={p.acct?.bank} w={130} />{' '}
                <small>(מספר הסניף)</small> <Fill v={p.acct?.branch} w={90} />
              </p>
            </div>
            <div class="sec">
              <h4>5. פרטי חשבון בנק נוסף -</h4>
              <p>
                <small>(מספר חשבון)</small> <Fill v={p.acct2?.number} /> <small>(שם הבנק)</small> <Fill v={p.acct2?.bank} w={130} />{' '}
                <small>(מספר הסניף)</small> <Fill v={p.acct2?.branch} w={90} />
              </p>
            </div>
            <div class="sec">
              <h4>6. הצהרה לגבי הכנסות קבועות ו/או חד פעמיות (על סגל הת"ש למלא את הפעולות עבורן נדרש הסבר) -</h4>
            </div>
            {table(chunk)}
            <p class="decl">{DECL_TM}</p>
            <div class="sig">
              <div class="vals">
                <span>{p.name}</span>
                <span>{p.idNum}</span>
                <span>{today}</span>
                <span />
              </div>
              <div class="labels">
                <span>שם + משפחה</span>
                <span>מס' ת.ז</span>
                <span>תאריך</span>
                <span>חתימה</span>
              </div>
            </div>
          </>
        )}
        <div class="pageno">
          עמוד {k + 1} מתוך {chunks.length}
        </div>
      </article>
      ))}
    </div>
  )
}
