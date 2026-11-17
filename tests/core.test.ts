import { describe, expect, it } from 'vitest'
import { parseDate, parseGrid, parseNum } from '../src/lib/grid'
import { pdfToGrid, unvisual, type PdfItem } from '../src/lib/pdfgrid'
import { evaluate, lockedRows } from '../src/lib/rules'
import { decodePayload, decryptJson, encodePayload, encryptJson, extractCode, lockHash } from '../src/lib/codec'
import type { Tx } from '../src/lib/types'

describe('מספרים ותאריכים', () => {
  it('קורא פורמטים של בנקים', () => {
    expect(parseNum('1,234.50')).toBe(1234.5)
    expect(parseNum('1,234.50-')).toBe(-1234.5)
    expect(parseNum('-1,234.50 ₪')).toBe(-1234.5)
    expect(parseNum('(250.00)')).toBe(-250)
    expect(parseNum('‎-300')).toBe(-300)
    expect(parseNum('12/03')).toBeNull()
    expect(parseNum('1.234,50')).toBeNull()
    expect(parseNum('')).toBeNull()
  })
  it('קורא תאריכים', () => {
    expect(parseDate('05/03/2026')).toBe('2026-03-05')
    expect(parseDate('5.3.26')).toBe('2026-03-05')
    expect(parseDate('2026-03-05')).toBe('2026-03-05')
    expect(parseDate(new Date(Date.UTC(2026, 2, 5)))).toBe('2026-03-05')
    expect(parseDate('31/02/2026')).toBeNull()
    expect(parseDate('abc')).toBeNull()
  })
})

const HAPOALIM = [
  ['בנק הפועלים', '', '', '', '', '', ''],
  ['חשבון 12-345-678901', '', '', '', '', '', ''],
  ['תאריך', 'הפעולה', 'פרטים', 'אסמכתא', 'חובה', 'זכות', 'יתרה בש"ח'],
  ['01/03/2026', 'משכורת צה"ל', '', '111', '', '1,500.00', '2,500.00'],
  ['03/03/2026', 'משיכת מזומן', 'כספומט', '112', '400.00', '', '2,100.00'],
  ['10/03/2026', 'העברה ב-bit', 'מדני', '113', '', '250.00', '2,350.00'],
  ['15/03/2026', 'כרטיס אשראי', '', '114', '150.00', '', '2,200.00'],
  ['02/04/2026', 'משכורת צה"ל', '', '115', '', '1,500.00', '3,700.00'],
]

describe('קריאת טבלת עו"ש', () => {
  it('קורא ומאמת מול היתרה', () => {
    const r = parseGrid(HAPOALIM)
    expect(r.report.status).toBe('verified')
    expect(r.txs.map((t) => t.amount)).toEqual([1500, -400, 250, -150, 1500])
    expect(r.report.opening).toBe(1000)
    expect(r.report.closing).toBe(3700)
    expect(r.account).toEqual({ bank: 'הפועלים', branch: '345', number: '678901' })
    expect(r.txs[1].desc).toBe('משיכת מזומן · כספומט')
  })
  it('מזהה סכום ששונה', () => {
    const g = HAPOALIM.map((r) => [...r])
    g[4][4] = '40.00' // מישהו שינה 400 ל-40
    const r = parseGrid(g)
    expect(r.report.status).toBe('failed')
    expect(r.report.issues[0].msg).toContain('היתרה לא מתאזנת')
  })
  it('מזהה שורה שנמחקה', () => {
    const g = HAPOALIM.filter((_, i) => i !== 5)
    expect(parseGrid(g).report.status).toBe('failed')
  })
  it('סדר מהחדש לישן', () => {
    const g = [...HAPOALIM.slice(0, 3), ...HAPOALIM.slice(3).reverse()]
    const r = parseGrid(g)
    expect(r.report.status).toBe('verified')
    expect(r.txs[0].date).toBe('2026-03-01')
  })
  it('עמודת סכום אחת בלי סימן: הסימן נקבע לפי היתרה', () => {
    const r = parseGrid([
      ['תאריך', 'תיאור', 'סכום', 'יתרה'],
      ['01/03/2026', 'פתיחה', '100.00', '1,100.00'],
      ['02/03/2026', 'משיכה', '300.00', '800.00'],
      ['03/03/2026', 'הפקדה', '50.00', '850.00'],
    ])
    expect(r.txs.map((t) => t.amount)).toEqual([100, -300, 50])
    expect(r.report.inferredSigns).toBe(1)
    expect(r.report.status).toBe('failed') // השורה הראשונה דורשת בדיקה ידנית
  })
  it('עמודת זכות/חובה מסומנת (דיסקונט)', () => {
    const r = parseGrid([
      ['תאריך', 'יום ערך', 'תיאור התנועה', '₪ זכות/חובה', '₪ יתרה', 'אסמכתה'],
      ['01/03/2026', '01/03/2026', 'משכורת', '1,000.00', '1,500.00', '1'],
      ['02/03/2026', '02/03/2026', 'כספומט', '-300.00', '1,200.00', '2'],
    ])
    expect(r.report.status).toBe('verified')
    expect(r.txs.map((t) => t.amount)).toEqual([1000, -300])
  })
  it('בלי עמודת יתרה: לא מאומת', () => {
    const r = parseGrid([
      ['תאריך', 'תיאור', 'חובה', 'זכות'],
      ['01/03/2026', 'א', '', '100'],
    ])
    expect(r.report.status).toBe('unverified')
  })
  it('שורה עם סכום ובלי תאריך מדווחת', () => {
    const g = HAPOALIM.map((r) => [...r])
    g[5][0] = '??'
    const r = parseGrid(g)
    expect(r.report.status).toBe('failed')
  })
  it('קובץ שאינו עו"ש', () => {
    expect(parseGrid([['שלום'], ['עולם']]).report.status).toBe('failed')
  })
})

describe('PDF', () => {
  const line = (y: number, cells: [number, string][]): PdfItem[] =>
    cells.map(([x, str]) => ({ str, x, y, w: str.length * 5 }))
  it('בונה טבלה לפי מיקום העמודות', () => {
    const page = [
      ...line(800, [[400, 'בנק לאומי']]),
      ...line(700, [[500, 'תאריך'], [380, 'תיאור'], [250, 'חובה'], [170, 'זכות'], [60, 'יתרה']]),
      ...line(680, [[490, '01/03/2026'], [360, 'משכורת'], [165, '1,500.00'], [55, '2,500.00']]),
      ...line(660, [[490, '03/03/2026'], [395, 'מזומן'], [350, 'משיכת'], [245, '400.00'], [55, '2,100.00']]),
    ]
    const r = parseGrid(pdfToGrid([page]))
    expect(r.report.status).toBe('verified')
    expect(r.txs.map((t) => t.amount)).toEqual([1500, -400])
    expect(r.txs[1].desc).toBe('מזומן משיכת'.split(' ').join(' '))
    expect(r.account.bank).toBe('לאומי')
  })
  it('עברית הפוכה', () => {
    expect(unvisual('ךיראת')).toBe('תאריך')
    expect(unvisual('1,500.00')).toBe('1,500.00')
    expect(unvisual('bit-ב הרבעה')).toBe('העברה ב-bit')
  })
})

const tx = (id: number, date: string, amount: number, desc = 'x'): Tx => ({ id, date, amount, desc })

describe('כללים', () => {
  it('סיוע כלכלי: הפקדות ומשיכות נבדקות בנפרד', () => {
    const txs = [
      tx(1, '2026-03-01', 500),
      tx(2, '2026-03-05', 150),
      tx(3, '2026-03-09', 201), // סה"כ הפקדות 851 > 600
      tx(4, '2026-03-10', -550), // סה"כ משיכות 550, לא עובר
      tx(5, '2026-04-01', 600), // בדיוק 600, לא עובר
      tx(6, '2026-04-02', -400),
      tx(7, '2026-04-03', -200), // בדיוק 200, לא מעל
      tx(8, '2026-04-04', -100), // סה"כ משיכות 700
    ]
    const inc = evaluate('aid', txs, {}).filter((r) => r.include).map((r) => r.tx.id)
    expect(inc).toEqual([1, 3, 6])
  })
  it('שינוי ידני של המשק גובר', () => {
    const txs = [tx(1, '2026-03-01', 700), tx(2, '2026-03-02', -50)]
    const inc = evaluate('aid', txs, { 1: { include: false }, 2: { include: true } })
    expect(inc.map((r) => r.include)).toEqual([false, true])
  })
  it('תשמ"ש: קבועה מ-250, חד פעמית מ-750, הוצאות רכב', () => {
    const txs = [
      tx(1, '2026-03-01', 300, 'העברה מאבא 123'),
      tx(2, '2026-04-01', 300, 'העברה מאבא 456'),
      tx(3, '2026-03-05', 700, 'bit מיוסי'),
      tx(4, '2026-03-06', 750, 'הפקדת מזומן'),
      tx(5, '2026-03-07', -180, 'פז דלק'),
      tx(6, '2026-03-08', -900, 'שכר דירה'),
    ]
    const rows = evaluate('tashmash', txs, {})
    expect(rows.filter((r) => r.include).map((r) => r.tx.id)).toEqual([1, 2, 4, 5])
    expect(rows[0].fixed).toBe(true)
    expect(rows[2].fixed).toBe(false)
    // המשק מסמן את 3 כקבועה
    const rows2 = evaluate('tashmash', txs, { 3: { fixed: true } })
    expect(rows2[2].include).toBe(true)
    expect(lockedRows({ type: 'tashmash', txs, overrides: {} }).map((r) => r.k)).toEqual(['f', 'f', 'o', undefined])
  })
})

describe('קישור וחותמת', () => {
  it('קידוד ופענוח', async () => {
    const obj = { v: 1, rows: [{ i: 1, d: '2026-03-01', a: -400, s: 'משיכת מזומן' }] }
    const code = await encodePayload(obj)
    expect(code).toMatch(/^z[A-Za-z0-9_-]+$/)
    expect(await decodePayload(code)).toEqual(obj)
    expect(extractCode(`https://x.app/#s=${code}`, 's')).toBe(code)
    expect(extractCode(code, 'r')).toBe(code)
    expect(extractCode('שלום', 'r')).toBeNull()
  })
  it('החותמת משתנה בכל שינוי', async () => {
    const rows = [{ i: 1, d: '2026-03-01', a: -400, s: 'a' }, { i: 2, d: '2026-03-02', a: 250, s: 'b' }]
    const h = await lockHash('abc', 1, rows)
    expect(await lockHash('abc', 1, [{ ...rows[0], a: -40 }, rows[1]])).not.toBe(h)
    expect(await lockHash('abc', 1, [rows[0]])).not.toBe(h)
    expect(await lockHash('abc', 2, rows)).not.toBe(h)
    expect(await lockHash('abc', 1, rows)).toBe(h)
  })
  it('גיבוי מוצפן', async () => {
    const f = await encryptJson([{ id: 'a' }], 'סיסמה1')
    expect(f).not.toContain('"id"')
    expect(await decryptJson(f, 'סיסמה1')).toEqual([{ id: 'a' }])
    await expect(decryptJson(f, 'אחרת')).rejects.toThrow('סיסמה שגויה')
  })
})
