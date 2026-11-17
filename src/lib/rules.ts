import type { DeclType, Declaration, LockedRow, Override, Tx } from './types'

export const AID_MONTH_LIMIT = 600
export const AID_ROW_LIMIT = 200
export const TM_FIXED_MIN = 250
export const TM_ONEOFF_MIN = 750

const CAR = /דלק|פז |פז$|סונול|דור אלון|אלון |ten |yellow|ילו|מוסך|ביטוח רכב|ביטוח חובה|ביטוח מקיף|טסט|רישוי|צמיגים/i

export interface RowState {
  tx: Tx
  /** מה שהכללים קבעו */
  auto: boolean
  /** הסבר קצר למה השורה נבחרה */
  reason: string
  /** אחרי שינוי ידני של המשק */
  include: boolean
  /** תשמ"ש: הכנסה קבועה */
  fixed?: boolean
  autoFixed?: boolean
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
const sourceKey = (tx: Tx) => sourceKeyOf(tx.desc)

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

export function evaluate(type: DeclType, txs: Tx[], overrides: Record<number, Override>): RowState[] {
  if (type === 'aid') {
    const months = new Map(summarize(txs).map((m) => [m.month, m]))
    return txs.map((tx) => {
      const m = months.get(monthOf(tx.date))!
      const dep = tx.amount > 0
      const over = dep ? m.depositsOver : m.withdrawalsOver
      const auto = over && Math.abs(tx.amount) > AID_ROW_LIMIT
      const reason = auto
        ? `${dep ? 'הפקדות' : 'משיכות'} החודש מעל ${AID_MONTH_LIMIT} ₪ והפעולה מעל ${AID_ROW_LIMIT} ₪`
        : ''
      return { tx, auto, reason, include: overrides[tx.id]?.include ?? auto }
    })
  }
  // תשמ"ש: מקור הכנסה שחוזר ביותר מחודש אחד מוצע כ"קבוע"
  const monthsBySource = new Map<string, Set<string>>()
  for (const tx of txs) {
    if (tx.amount <= 0) continue
    const k = sourceKey(tx)
    if (!k) continue
    if (!monthsBySource.has(k)) monthsBySource.set(k, new Set())
    monthsBySource.get(k)!.add(monthOf(tx.date))
  }
  return txs.map((tx) => {
    const o = overrides[tx.id]
    if (tx.amount > 0) {
      const autoFixed = (monthsBySource.get(sourceKey(tx))?.size ?? 0) >= 2
      const fixed = o?.fixed ?? autoFixed
      const auto = fixed ? tx.amount >= TM_FIXED_MIN : tx.amount >= TM_ONEOFF_MIN
      const reason = auto
        ? fixed
          ? `הכנסה קבועה של ${TM_FIXED_MIN} ₪ ומעלה`
          : `הכנסה חד פעמית של ${TM_ONEOFF_MIN} ₪ ומעלה`
        : ''
      return { tx, auto, reason, include: o?.include ?? auto, fixed, autoFixed }
    }
    const auto = CAR.test(tx.desc)
    return { tx, auto, reason: auto ? 'הוצאת רכב (דלק/ביטוח/מוסך)' : '', include: o?.include ?? auto }
  })
}

export function lockedRows(d: Pick<Declaration, 'type' | 'txs' | 'overrides'>): LockedRow[] {
  return evaluate(d.type, d.txs, d.overrides)
    .filter((r) => r.include)
    .map((r) => {
      const row: LockedRow = { i: r.tx.id, d: r.tx.date, a: r.tx.amount, s: r.tx.desc.slice(0, 60) }
      if (d.type === 'tashmash' && r.tx.amount > 0) row.k = r.fixed ? 'f' : 'o'
      return row
    })
}
