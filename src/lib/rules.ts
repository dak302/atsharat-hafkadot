import type { DeclType, Declaration, LockedRow, Override, Tx } from './types'

export const AID_MONTH_LIMIT = 600
export const AID_ROW_LIMIT = 200
export const TM_FIXED_MIN = 250
export const TM_ONEOFF_MIN = 750

const CAR = /דלק|פז |פז$|סונול|דור אלון|אלון |ten |yellow|ילו|מוסך|ביטוח רכב|ביטוח חובה|ביטוח מקיף|טסט|רישוי|צמיגים/i

export interface RowState {
  tx: Tx
  /** השורה עומדת בכללי הנוהל. רמז בלבד, לא בחירה */
  hint: boolean
  /** הסבר קצר לרמז */
  reason: string
  /** המשק בחר את השורה */
  include: boolean
  /** תשמ"ש: הכנסה קבועה (true), חד פעמית (false) או שעוד לא סווגה (undefined) */
  fixed?: boolean
}

export interface MonthSummary {
  month: string // yyyy-mm
  deposits: number
  withdrawals: number
  depositsOver: boolean
  withdrawalsOver: boolean
}

export const monthOf = (d: string) => d.slice(0, 7)

/** מפתח לזיהוי מקור חוזר: התיאור בלי ספרות ותווים משתנים */
export function sourceKeyOf(desc: string): string {
  return desc.replace(/[\d/.\-:,'"״׳·]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export interface RowGroup {
  key: string
  rows: LockedRow[]
}

/** מאחד שורות מאותו מקור, באותו כיוון ובאותו סיווג, כדי שיוסברו פעם אחת. הסדר נשמר לפי השורה הראשונה בכל קבוצה. */
export function groupRows(rows: LockedRow[]): RowGroup[] {
  const map = new Map<string, RowGroup>()
  const out: RowGroup[] = []
  for (const r of rows) {
    const src = sourceKeyOf(r.s)
    const k = src ? `${src}|${r.a > 0 ? '+' : '-'}|${r.k ?? ''}` : `#${r.i}`
    let g = map.get(k)
    if (!g) {
      g = { key: k, rows: [] }
      map.set(k, g)
      out.push(g)
    }
    g.rows.push(r)
  }
  return out
}

export function summarize(txs: Tx[]): MonthSummary[] {
  const map = new Map<string, MonthSummary>()
  for (const tx of txs) {
    const m = monthOf(tx.date)
    let s = map.get(m)
    if (!s) map.set(m, (s = { month: m, deposits: 0, withdrawals: 0, depositsOver: false, withdrawalsOver: false }))
    if (tx.amount > 0) s.deposits += tx.amount
    else s.withdrawals += -tx.amount
  }
  for (const s of map.values()) {
    s.deposits = Math.round(s.deposits * 100) / 100
    s.withdrawals = Math.round(s.withdrawals * 100) / 100
    s.depositsOver = s.deposits > AID_MONTH_LIMIT
    s.withdrawalsOver = s.withdrawals > AID_MONTH_LIMIT
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month))
}

/**
 * שום שורה לא נבחרת אוטומטית: המשק בוחר בעצמו.
 * הכללים משמשים רק לרמז (hint) ליד שורות שעומדות בהם.
 */
export function evaluate(type: DeclType, txs: Tx[], overrides: Record<number, Override>): RowState[] {
  if (type === 'aid') {
    const months = new Map(summarize(txs).map((m) => [m.month, m]))
    return txs.map((tx) => {
      const m = months.get(monthOf(tx.date))!
      const dep = tx.amount > 0
      const over = dep ? m.depositsOver : m.withdrawalsOver
      const hint = over && Math.abs(tx.amount) > AID_ROW_LIMIT
      const reason = hint ? `מעל ${AID_ROW_LIMIT} ₪, ו${dep ? 'ההפקדות' : 'המשיכות'} בחודש מעל ${AID_MONTH_LIMIT} ₪` : ''
      return { tx, hint, reason, include: overrides[tx.id]?.include ?? false }
    })
  }
  return txs.map((tx) => {
    const o = overrides[tx.id]
    if (tx.amount > 0) {
      const hint = tx.amount >= TM_FIXED_MIN
      const reason =
        tx.amount >= TM_ONEOFF_MIN
          ? `מעל ${TM_ONEOFF_MIN} ₪`
          : hint
            ? `מעל ${TM_FIXED_MIN} ₪, רלוונטי אם קבועה`
            : ''
      return { tx, hint, reason, include: o?.include ?? false, fixed: o?.fixed }
    }
    const hint = CAR.test(tx.desc)
    return { tx, hint, reason: hint ? 'הוצאת רכב' : '', include: o?.include ?? false }
  })
}

export function lockedRows(d: Pick<Declaration, 'type' | 'txs' | 'overrides'>): LockedRow[] {
  return evaluate(d.type, d.txs, d.overrides)
    .filter((r) => r.include)
    .map((r) => {
      const row: LockedRow = { i: r.tx.id, d: r.tx.date, a: r.tx.amount, s: r.tx.desc.slice(0, 60) }
      if (d.type === 'tashmash' && r.tx.amount > 0 && r.fixed !== undefined) row.k = r.fixed ? 'f' : 'o'
      return row
    })
}
