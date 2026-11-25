import { describe, expect, it } from 'vitest'
import { parseDate, parseDayMonth, parseGrid, parseNum } from '../src/lib/grid'
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
  it('דף תנועות שמודפס בסניף: אות לכל פריט, תאריך בלי שנה, כותרת חודש, תיאור שממשיך מתחת', () => {
    // כל אות עברית היא פריט נפרד, כמו בקבצים האמיתיים. מספרים שלמים. כל הנתונים מומצאים.
    const W = 6
    const heb = (word: string, right: number, y: number): PdfItem[] =>
      [...word].map((ch, k) => ({ str: ch, x: right - (k + 1) * (W - 0.5), y, w: W }))
    const num = (str: string, x: number, y: number): PdfItem => ({ str, x, y, w: str.length * 5 })
    const words = (text: string, right: number, y: number) => {
      const out: PdfItem[] = []
      for (const w of text.split(' ')) {
        out.push(...heb(w, right, y))
        right -= w.length * (W - 0.5) + 5
      }
      return out
    }
    const page: PdfItem[] = [
      ...words('לכבוד ישראל ישראלי', 560, 760),
      num('01/12/2026', 42, 770),
      ...heb('יום', 557, 620), ...heb('ערך', 525, 620),
      ...heb('תיאור', 421, 620), ...heb('הפעולה', 388, 620),
      ...heb('אסמכתא', 290, 620), ...heb('זכות', 230, 620), ...heb('חובה', 176, 620), ...heb('יתרה', 110, 620),
      ...words('נובמבר', 557, 600), num('2026', 496, 600), ...words('העברה מדף קודם', 481, 600), num('1,000.00', 71, 600),
      num('03/11', 529, 588), ...heb('ח', 492, 588), ...words('העברה מחברה', 481, 588), num('11', 257, 588), num('500.00', 207, 588),
      ...words('משכורת', 481, 576),
      num('05/11', 529, 564), ...words('חיוב לכרטיס', 481, 564), num('12', 257, 564), num('-200.00', 152, 564), num('1,300.00', 71, 564),
      ...words('דצמבר', 557, 540), num('2026', 496, 540),
      num('01/12', 529, 528), ...heb('ד', 492, 528), ...words('העברה לחבר', 481, 528), num('13', 257, 528), num('-100.00', 152, 528), num('1,200.00', 71, 528),
      ...words('המשך בעמוד הבא', 110, 500),
      ...words('תנועות עתידיות', 557, 480),
      num('09/12', 529, 468), ...words('חיוב לכרטיס', 481, 468), num('-50.00', 152, 468), num('1,150.00', 71, 468),
    ]
    const r = parseGrid(pdfToGrid([page]))
    expect(r.report.issues).toEqual([])
    expect(r.report.status).toBe('verified')
    expect(r.txs.map((t) => [t.date, t.amount])).toEqual([
      ['2026-11-03', 500],
      ['2026-11-05', -200],
      ['2026-12-01', -100],
    ])
    expect(r.txs[0].desc).toBe('העברה מחברה משכורת')
    expect(r.txs[2].desc).toBe('העברה לחבר')
  })
  it('תאריך בלי שנה: השנה מתאריך ההפקה כשאין כותרת חודש', () => {
    const r = parseGrid([
      ['הופק ב-05/01/2027'],
      ['יום', 'תיאור', 'זכות', 'חובה', 'יתרה'],
      ['28/12', 'הפקדה', '100', '', '100'],
      ['02/01', 'משיכה', '', '-40', '60'],
    ])
    expect(r.txs.map((t) => t.date)).toEqual(['2026-12-28', '2027-01-02'])
    expect(parseDayMonth('31/02')).toBeNull()
    expect(parseDayMonth('29/02')).toEqual([29, 2])
  })
  it('עברית הפוכה', () => {
    expect(unvisual('ךיראת')).toBe('תאריך')
    expect(unvisual('1,500.00')).toBe('1,500.00')
    expect(unvisual('bit-ב הרבעה')).toBe('העברה ב-bit')
  })
})

const tx = (id: number, date: string, amount: number, desc = 'x'): Tx => ({ id, date, amount, desc })

describe('כללים (רמז בלבד, שום דבר לא נבחר אוטומטית)', () => {
  it('סיוע כלכלי: רמז לפי הפקדות ומשיכות בנפרד, ושום שורה לא מסומנת', () => {
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
    const rows = evaluate('aid', txs, {})
    expect(rows.filter((r) => r.hint).map((r) => r.tx.id)).toEqual([1, 3, 6])
    expect(rows.some((r) => r.include)).toBe(false)
  })
  it('רק המשק בוחר', () => {
    const txs = [tx(1, '2026-03-01', 700), tx(2, '2026-03-02', -50)]
    const rows = evaluate('aid', txs, { 2: { include: true } })
    expect(rows.map((r) => r.include)).toEqual([false, true])
  })
  it('תשמ"ש: רמזים, וסיווג קבועה/חד פעמית רק לפי המשק', () => {
    const txs = [
      tx(1, '2026-03-01', 300, 'העברה מאבא 123'),
      tx(2, '2026-04-01', 300, 'העברה מאבא 456'),
      tx(3, '2026-03-05', 200, 'bit מיוסי'),
      tx(4, '2026-03-06', 750, 'הפקדת מזומן'),
      tx(5, '2026-03-07', -180, 'פז דלק'),
      tx(6, '2026-03-08', -900, 'שכר דירה'),
    ]
    const rows = evaluate('tashmash', txs, {})
    expect(rows.filter((r) => r.hint).map((r) => r.tx.id)).toEqual([1, 2, 4, 5])
    expect(rows.every((r) => r.fixed === undefined && !r.include)).toBe(true)
    const ov = { 1: { include: true, fixed: true }, 4: { include: true, fixed: false }, 2: { include: true }, 5: { include: true } }
    expect(lockedRows({ type: 'tashmash', txs, overrides: ov }).map((r) => [r.i, r.k])).toEqual([
      [1, 'f'],
      [2, undefined],
      [4, 'o'],
      [5, undefined],
    ])
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

describe('פורמטים מוכרים של בנקים', async () => {
  const { checkFp } = await import('../src/lib/fingerprint')
  const header = 'תאריך|יום ערך|תיאור התנועה|אסמכתה|זכות/חובה ₪|יתרה ₪'
  it('פורמט מוכר מהתוכנה של הבנק', () => {
    expect(checkFp({ kind: 'pdf', producer: 'FreeForm System', header })).toEqual({ status: 'match', bank: 'דיסקונט / מרכנתיל' })
  })
  it('אותו פורמט מתוכנת עריכה', () => {
    expect(checkFp({ kind: 'pdf', producer: 'iLovePDF', header }).status).toBe('mismatch')
  })
  it('פורמט לא מוכר', () => {
    expect(checkFp({ kind: 'pdf', producer: 'x', header: 'תאריך|סכום' })).toEqual({ status: 'unknown' })
  })
})

describe('קיבוץ שורות להסבר אחד', async () => {
  const { groupRows } = await import('../src/lib/rules')
  it('מאחד לפי מקור וכיוון, שומר סדר', () => {
    const rows = [
      { i: 1, d: '2026-03-01', a: 300, s: 'העברה מאמא 123' },
      { i: 2, d: '2026-03-02', a: -400, s: 'משיכת מזומן כספומט 4421' },
      { i: 3, d: '2026-04-01', a: 300, s: 'העברה מאמא 456' },
      { i: 4, d: '2026-04-02', a: -300, s: 'העברה מאמא 789' }, // כיוון אחר
      { i: 5, d: '2026-04-03', a: -250, s: 'משיכת מזומן כספומט 4421' },
      { i: 6, d: '2026-04-04', a: 900, s: '' },
      { i: 7, d: '2026-04-05', a: 900, s: '' },
    ]
    expect(groupRows(rows).map((g) => g.rows.map((r) => r.i))).toEqual([[1, 3], [2, 5], [4], [6], [7]])
  })
})

describe('מבנים מקבצים אמיתיים (נתונים מומצאים)', () => {
  it('יתרה רק בחלק מהשורות (0 = לא מוצגת) נבדקת בשורה הבאה עם יתרה', () => {
    const r = parseGrid([
      ['תאריך', 'תיאור', 'זכות', 'חובה', 'יתרה', 'אסמכתא'],
      ['01/03/2026', 'א', '', '100', '900', '1'],
      ['02/03/2026', 'ב', '50', '', '0', '2'],
      ['02/03/2026', 'ג', '', '30', '920', '3'],
    ])
    expect(r.report.status).toBe('verified')
    expect(r.report.opening).toBe(1000)
    const bad = parseGrid([
      ['תאריך', 'תיאור', 'זכות', 'חובה', 'יתרה', 'אסמכתא'],
      ['01/03/2026', 'א', '', '100', '900', '1'],
      ['02/03/2026', 'ב', '500', '', '0', '2'],
      ['02/03/2026', 'ג', '', '30', '920', '3'],
    ])
    expect(bad.report.status).toBe('failed')
  })
  it('תאריך עם יום בשבוע', () => {
    expect(parseDate('ב׳ 26/10/26')).toBe('2026-10-26')
    expect(parseDate("א' 01/03/2026")).toBe('2026-03-01')
  })
  it('תיאור שנשבר מעל ומתחת לשורה מוצמד לתנועה הנכונה', () => {
    const it = (y: number, x: number, str: string): PdfItem => ({ str, x, y, w: str.length * 5 })
    const page = [
      it(700, 600, 'תאריך'), it(700, 500, 'תיאור'), it(700, 400, 'זכות'), it(700, 330, 'חובה'), it(700, 260, 'יתרה'),
      it(680, 590, '01/03/2026'), it(680, 500, 'קניה'), it(680, 330, '100.00'), it(680, 255, '900.00'),
      it(652, 500, 'החזרת חיוב'),
      it(640, 590, '02/03/2026'), it(640, 400, '50.00'), it(640, 255, '950.00'),
      it(628, 500, 'מסיבות טכניות'),
      it(560, 300, 'התנועות והיתרות שנרשמו לאחר תום יום העסקים הינן על תנאי ובסכומים משוערים'),
    ]
    const r = parseGrid(pdfToGrid([page]))
    expect(r.report.status).toBe('verified')
    expect(r.txs.map((t) => t.desc)).toEqual(['קניה', 'החזרת חיוב מסיבות טכניות'])
  })
  it('זיהוי בנק רק מניסוח חד-משמעי', () => {
    expect(parseGrid([['ביטוח לאומי, ירושלים'], ['תאריך', 'חובה', 'זכות'], ['01/03/2026', '1', '']]).account.bank).toBeUndefined()
    expect(parseGrid([["תנועות בחשבון מס' 123-456789"], ['תאריך', 'חובה', 'זכות'], ['01/03/2026', '1', '']]).account).toEqual({ branch: '123', number: '456789' })
  })
})

describe('ספירה וקיצור', async () => {
  const { count, shorten } = await import('../src/lib/plural')
  it('שורה אחת / שורות', () => {
    expect(count(1, 'שורה אחת', 'שורות')).toBe('שורה אחת')
    expect(count(3, 'שורה אחת', 'שורות')).toBe('3 שורות')
  })
  it('קיצור במקום רווח', () => {
    const s = 'העברה מחשבון 12-345-678901 לחשבון 20-563-12345678 עבור שכר דירה חודש אוקטובר ועוד הרבה מילים כאן'
    const out = shorten(s, 60)
    expect(out.endsWith('…')).toBe(true)
    expect(s.startsWith(out.slice(0, -1))).toBe(true)
    expect(s[out.length - 1]).toBe(' ')
    expect(shorten('קצר', 60)).toBe('קצר')
  })
})

describe('קישור זדוני גדול מדי', async () => {
  const { decodePayload, MAX_DECODED } = await import('../src/lib/codec')
  it('קישור שמתנפח מעל המגבלה נדחה', async () => {
    const big = new TextEncoder().encode('"' + 'א'.repeat(MAX_DECODED) + '"')
    const comp = new Uint8Array(await new Response(new Blob([big]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
    let bin = ''
    comp.forEach((c) => (bin += String.fromCharCode(c)))
    const code = 'z' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(code.length).toBeLessThan(20000)
    await expect(decodePayload(code)).rejects.toThrow('גדול מדי')
  })
})
