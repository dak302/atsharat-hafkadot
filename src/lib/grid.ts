import type { Account, ParseIssue, ParseResult, Tx } from './types'

/** תא בטבלה: טקסט, מספר או תאריך (כפי שמגיע מאקסל) */
export type Cell = string | number | Date | null | undefined

const MARKS = /[‎‏‪-‮⁦-⁩ ]/g

export function clean(v: Cell): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString()
  return String(v).replace(MARKS, ' ').replace(/\s+/g, ' ').trim()
}

/** קורא מספר בפורמטים של בנקים: 1,234.50 / 1234.50- / (1,234.50) / ‎-1,234.50 ₪ */
export function parseNum(v: Cell): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? round2(v) : null
  let s = clean(v)
  if (!s) return null
  s = s.replace(/[₪\s]|ש"ח|ש״ח/g, '').replace(/[−–]/g, '-')
  let neg = false
  if (/^\(.*\)$/.test(s)) {
    neg = true
    s = s.slice(1, -1)
  }
  if (s.endsWith('-')) {
    neg = !neg
    s = s.slice(0, -1)
  }
  if (s.startsWith('-')) {
    neg = !neg
    s = s.slice(1)
  }
  if (s.startsWith('+')) s = s.slice(1)
  if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s.replace(/,/g, ''))
  if (!Number.isFinite(n)) return null
  return round2(neg ? -n : n)
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** קורא תאריך: dd/mm/yyyy, dd.mm.yy, dd-mm-yyyy, yyyy-mm-dd או אובייקט Date */
export function parseDate(v: Cell): string | null {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null
    // read-excel-file מחזיר תאריכים ב-UTC
    return iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate())
  }
  // חלק מהבנקים מוסיפים את היום בשבוע: "ב׳ 26/10/26"
  const s = clean(v).replace(/^[א-ת][׳'"]?\s+|\s+[א-ת][׳'"]?$/g, '')
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s)
  if (m) {
    let y = Number(m[3])
    if (y < 100) y += 2000
    return iso(y, Number(m[2]), Number(m[1]))
  }
  m = /^(\d{4})-(\d{2})-(\d{2})(T.*)?$/.exec(s)
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]))
  return null
}

/** תאריך בלי שנה (06/09), כמו בדפי תנועות שמודפסים בסניף. השנה נלקחת מכותרות החודש. */
export function parseDayMonth(v: Cell): [number, number] | null {
  const m = /^(\d{1,2})[./](\d{1,2})$/.exec(clean(v))
  if (!m) return null
  const d = Number(m[1])
  const mo = Number(m[2])
  return iso(2000, mo, d) ? [d, mo] : null
}

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
const MONTH_HEADING = new RegExp(`(${MONTHS.join('|')}|מרס)\\s*(\\d{4})`)

type ColKey = 'date' | 'desc' | 'desc2' | 'ref' | 'debit' | 'credit' | 'amount' | 'balance'
export type ColMap = Partial<Record<ColKey, number>>

/** מזהה לאיזו עמודה שייכת כותרת */
export function classifyHeader(raw: Cell): ColKey | 'valueDate' | null {
  const s = clean(raw)
  if (!s || s.length > 40) return null
  if (/יתרה/.test(s)) return 'balance'
  const hasDebit = /חובה/.test(s)
  const hasCredit = /זכות/.test(s)
  if (hasDebit && hasCredit) return 'amount'
  if (hasDebit) return 'debit'
  if (hasCredit) return 'credit'
  if (/ערך/.test(s)) return 'valueDate'
  if (/^יום$/.test(s)) return 'date'
  if (/תאריך/.test(s)) return 'date'
  if (/אסמכת/.test(s)) return 'ref'
  if (/סכום/.test(s)) return 'amount'
  if (/תי?אור|סוג (ה)?(תנועה|פעולה)|^הפעולה$|^פעולה$/.test(s)) return 'desc'
  if (/פרטים|הערה|מידע נוסף/.test(s)) return 'desc2'
  return null
}

export function findHeader(rows: Cell[][]): { index: number; cols: ColMap } | null {
  for (let r = 0; r < rows.length; r++) {
    const cols: ColMap = {}
    rows[r].forEach((c, i) => {
      const k = classifyHeader(c)
      if (!k || k === 'valueDate') return
      if (k === 'desc2' && cols.desc == null) {
        cols.desc = i
        return
      }
      if (cols[k] == null) cols[k] = i
    })
    const hasAmount = cols.amount != null || (cols.debit != null && cols.credit != null)
    if (cols.date != null && hasAmount) return { index: r, cols }
  }
  return null
}

// רק ניסוחים חד-משמעיים: "ביטוח לאומי" או כתובת בירושלים לא אמורים לזהות בנק
const BANKS: [RegExp, string][] = [
  [/בנק\s*(ה)?פועלים/, 'הפועלים'],
  [/בנק\s*לאומי/, 'לאומי'],
  [/בנק\s*דיסקונט|דיסקונט לישראל/, 'דיסקונט'],
  [/מזרחי.?טפחות/, 'מזרחי טפחות'],
  [/הבינלאומי הראשון|בנק\s*הבינלאומי/, 'הבינלאומי'],
  [/אוצר החייל/, 'אוצר החייל'],
  [/פאג"?י|פועלי אגודת/, 'פאג"י'],
  [/בנק\s*מסד/, 'מסד'],
  [/וואן זירו|ONE ZERO/i, 'וואן זירו'],
  [/בנק\s*פפר|PEPPER/i, 'פפר'],
  [/בנק\s*הדואר/, 'בנק הדואר'],
  [/בנק\s*יהב/, 'יהב'],
  [/מרכנתיל/, 'מרכנתיל'],
  [/בנק\s*ירושלים/, 'בנק ירושלים'],
]

/** ניסיון לשלוף פרטי חשבון מהשורות שמעל הטבלה. החייל יכול לתקן. */
export function findAccount(rows: Cell[][]): Account {
  const acct: Account = {}
  const text = rows.map((r) => r.map(clean).filter(Boolean).join(' | ')).join('\n')
  for (const [re, name] of BANKS) {
    if (re.test(text)) {
      acct.bank = name
      break
    }
  }
  const full = /(\d{2})-(\d{3})-(\d{4,9})/.exec(text)
  if (full) {
    acct.branch = full[2]
    acct.number = full[3]
  }
  // "מס' 123-456789": סניף-חשבון
  const pair = /מס['׳]?\s*:?\s*(\d{3})-(\d{4,9})(?!\d)/.exec(text)
  if (pair && !acct.branch) {
    acct.branch = pair[1]
    acct.number = pair[2]
  }
  const br = /סניף[^\d\n]{0,12}(\d{1,3})(?!\d)/.exec(text)
  if (br && !acct.branch) acct.branch = br[1]
  const num = /(?:מספר |מס'? )?חשבון[^\d\n]{0,12}(\d[\d-]{3,12}\d)/.exec(text)
  if (num && !acct.number) acct.number = num[1]
  return acct
}

interface RawRow {
  line: number
  date: string
  desc: string
  ref?: string
  amount: number | null // מסומן אם ידוע
  unsigned?: number // סכום שהסימן שלו לא ידוע
  balance?: number
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.006

/**
 * הופך טבלה (מאקסל או מ-PDF) לרשימת תנועות ומאמת מול עמודת היתרה.
 * העיקרון: שום דבר לא מתקבל בשקט. כל שורה שלא מתאזנת מול היתרה מדווחת.
 */
export function parseGrid(rows: Cell[][]): ParseResult {
  const issues: ParseIssue[] = []
  const empty = (msg: string): ParseResult => ({
    txs: [],
    account: findAccount(rows),
    report: { status: 'failed', count: 0, issues: [{ row: 0, msg }], inferredSigns: 0 },
  })
  const header = findHeader(rows)
  if (!header) return empty('זה לא נראה כמו דף תנועות בחשבון: לא נמצאה טבלה עם תאריך וסכומים. ייתכן שזה ריכוז יתרות או אישור מהבנק. יש לבקש מהחייל את דף התנועות (עו"ש).')
  const { cols } = header
  const account = findAccount(rows.slice(0, header.index))

  // תאריכים בלי שנה: השנה מכותרת החודש ("ספטמבר 2026"), ואם אין כזו, מתאריך ההפקה של הדף
  let year: number | undefined
  let printed: { y: number; m: number } | undefined
  for (const row of rows.slice(0, header.index)) {
    const m = /(?:^|\D)(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)/.exec(row.map(clean).join(' '))
    if (m) {
      printed = { y: Number(m[3]), m: Number(m[2]) }
      break
    }
  }
  let noYear = false

  const raw: RawRow[] = []
  for (let r = header.index + 1; r < rows.length; r++) {
    const row = rows[r]
    const line = r + 1
    if (!row || row.every((c) => clean(c) === '')) continue
    // כותרת שחוזרת בכל עמוד
    if (classifyHeader(row[cols.date!]) === 'date') continue
    // "תנועות עתידיות" הן הערכה של הבנק לחיובים שעוד לא בוצעו. הן לא חלק מהתנועות בחשבון.
    if (/(תנועות|פעולות) עתידיות/.test(row.map(clean).join(' '))) break
    let date = parseDate(row[cols.date!])
    if (!date) {
      const dm = parseDayMonth(row[cols.date!])
      if (dm) {
        const y = year ?? (printed ? (dm[1] > printed.m ? printed.y - 1 : printed.y) : undefined)
        if (y) date = iso(y, dm[1], dm[0])
        else noYear = true
      } else {
        const mh = MONTH_HEADING.exec(row.map(clean).join(' '))
        if (mh) year = Number(mh[2])
      }
    }
    if (!date) {
      // שורה בלי תאריך: המשך תיאור, או שורת סיכום/יתרת פתיחה. אם יש בה סכום בעמודות הסכום, מדווחים.
      const hasMoney = [cols.debit, cols.credit, cols.amount].some(
        (c) => c != null && parseNum(row[c]) != null && parseNum(row[c]) !== 0,
      )
      const txt = row.map(clean).filter(Boolean).join(' ')
      if (hasMoney && !/סה"כ|סה״כ|סך הכל|יתרת פתיחה|יתרה קודמת|יתרת סגירה|מעמוד קודם|לעמוד הבא/.test(txt)) {
        issues.push({ row: line, msg: `שורה עם סכום אך בלי תאריך תקין, לא נקלטה: "${txt.slice(0, 60)}"` })
      } else if (!hasMoney && raw.length && cols.desc != null) {
        // המשך תיאור: רק טקסט קצר שכולו בעמודת התיאור. הערות ארוכות של הבנק באמצע הטבלה לא נכנסות לתיאור.
        const extra = clean(row[cols.desc])
        const onlyDesc = row.every((c, i) => i === cols.desc || i === cols.desc2 || !clean(c))
        if (extra && onlyDesc && extra.length <= 45) raw[raw.length - 1].desc += ' ' + extra
      }
      continue
    }
    const desc = [cols.desc, cols.desc2]
      .filter((c): c is number => c != null)
      .map((c) => clean(row[c]))
      .filter(Boolean)
      .join(' · ')
    const ref = cols.ref != null ? clean(row[cols.ref]) || undefined : undefined
    const balance = cols.balance != null ? (parseNum(row[cols.balance]) ?? undefined) : undefined
    let amount: number | null = null
    let unsigned: number | undefined
    if (cols.debit != null && cols.credit != null) {
      const dTxt = clean(row[cols.debit])
      const cTxt = clean(row[cols.credit])
      const d = parseNum(row[cols.debit])
      const c = parseNum(row[cols.credit])
      if ((dTxt && d == null) || (cTxt && c == null)) {
        issues.push({ row: line, msg: `סכום לא קריא בשורה: "${dTxt || cTxt}"` })
        continue
      }
      const dv = Math.abs(d ?? 0)
      const cv = Math.abs(c ?? 0)
      if (dv && cv) {
        issues.push({ row: line, msg: 'בשורה יש גם חובה וגם זכות' })
        continue
      }
      if (!dv && !cv) continue // שורת מידע בלי סכום
      amount = cv ? cv : -dv
    } else {
      const txt = clean(row[cols.amount!])
      const a = parseNum(row[cols.amount!])
      if (a == null) {
        if (txt) issues.push({ row: line, msg: `סכום לא קריא בשורה: "${txt}"` })
        continue
      }
      if (a === 0) continue
      if (a < 0) amount = a
      else unsigned = a // חיובי: ייתכן שהבנק מציג בלי סימן, נכריע לפי היתרה
    }
    // יתרה ריקה תקינה (נבדקת בתנועה הבאה שיש לה יתרה). רק טקסט שאינו מספר הוא תקלה.
    if (cols.balance != null && balance === undefined && clean(row[cols.balance])) {
      issues.push({ row: line, msg: 'יתרה לא קריאה בשורה' })
    }
    raw.push({ line, date, desc, ref, amount, unsigned, balance })
  }

  if (!raw.length) return empty(noYear ? 'בתאריכים בקובץ אין שנה, ולא נמצאה כותרת חודש שממנה אפשר להבין אותה.' : 'לא נמצאו תנועות בקובץ.')

  // סדר כרונולוגי: יש בנקים שמציגים מהחדש לישן
  const first = raw[0].date
  const last = raw[raw.length - 1].date
  let ordered = raw
  if (first > last) ordered = [...raw].reverse()
  else if (first === last && cols.balance != null) {
    // אותו יום בכל הקובץ: בוחרים את הכיוון שמתאזן
    if (chainErrors([...raw].reverse()) < chainErrors(raw)) ordered = [...raw].reverse()
  }
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].date < ordered[i - 1].date) {
      issues.push({ row: ordered[i].line, msg: 'התאריכים בקובץ לא ברצף' })
      break
    }
  }

  // חלק מהבנקים מציגים יתרה רק בתנועה האחרונה של היום, ובשאר רושמים 0 או משאירים ריק.
  // תנועה בלי יתרה מצטברת, והבדיקה נעשית בתנועה הבאה שיש לה יתרה: יתרה קודמת + כל הסכומים שביניהן.
  for (const r of ordered) if (r.balance === 0) r.balance = undefined
  const anyBalance = cols.balance != null && ordered.some((r) => r.balance !== undefined)
  const signedColumn = ordered.some((r) => r.amount != null)
  let inferredSigns = 0
  const txs: Tx[] = []
  let known: number | undefined
  let before = 0
  let opening: number | undefined
  ordered.forEach((r, i) => {
    let amount = r.amount ?? r.unsigned!
    if (known === undefined) {
      if (r.balance !== undefined) {
        known = r.balance
        opening = round2(r.balance - before - amount)
      } else before += amount
    } else if (r.balance !== undefined) {
      const delta = round2(r.balance - known)
      if (near(delta, amount)) {
        // תקין
      } else if (r.amount == null && near(delta, -amount)) {
        amount = -amount
        inferredSigns++
      } else {
        issues.push({
          row: r.line,
          msg: `היתרה לא מתאזנת בתאריך ${fmtDate(r.date)}: סכום ${amount}, שינוי ביתרה ${delta}`,
        })
      }
      known = r.balance
    } else {
      if (r.amount == null && signedColumn) {
        issues.push({ row: r.line, msg: `בתאריך ${fmtDate(r.date)} לא ניתן לקבוע אם זו הפקדה או משיכה, ואין יתרה לבדוק מולה` })
      }
      known = round2(known + amount)
    }
    txs.push({ id: i + 1, date: r.date, desc: r.desc, ref: r.ref, amount: round2(amount), balance: r.balance })
  })

  // סכומים בלי סימן שלא ניתן היה להכריע לגביהם
  if (!signedColumn) {
    if (!anyBalance) {
      issues.push({ row: ordered[0].line, msg: 'אין בקובץ סימן חובה/זכות ואין יתרה. לא ניתן לדעת מה הפקדה ומה משיכה.' })
    } else {
      issues.push({ row: ordered[0].line, msg: 'בשורה הראשונה לא ניתן לקבוע אם זו הפקדה או משיכה. יש לבדוק אותה ידנית.' })
    }
  }

  // תנועות אחרי היתרה האחרונה בקובץ לא נבדקו מול שום יתרה
  const tailChecked = ordered[ordered.length - 1].balance !== undefined
  const status = issues.length ? 'failed' : anyBalance && tailChecked ? 'verified' : 'unverified'
  return {
    txs,
    account,
    report: {
      status,
      count: txs.length,
      from: txs[0].date,
      to: txs[txs.length - 1].date,
      opening: anyBalance ? opening : undefined,
      closing: anyBalance ? known : undefined,
      issues,
      inferredSigns,
    },
  }
}

function chainErrors(rows: RawRow[]): number {
  let e = 0
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i].balance || !rows[i - 1].balance) continue
    const a = rows[i].amount ?? rows[i].unsigned ?? 0
    const delta = round2((rows[i].balance ?? 0) - (rows[i - 1].balance ?? 0))
    if (!near(delta, a) && !near(delta, -a)) e++
  }
  return e
}

export function fmtDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

export function fmtMoney(n: number): string {
  return Math.abs(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
