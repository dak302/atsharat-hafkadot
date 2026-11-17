import { classifyHeader, clean, parseDate, type Cell } from './grid'

export interface PdfItem {
  str: string
  x: number
  y: number
  w: number
}

interface Box {
  text: string
  x0: number
  x1: number
}

const HEB = /[֐-׿]/

/** חלק מקובצי ה-PDF שומרים עברית הפוכה (סדר תצוגה). הופך חזרה ומשאיר מספרים ולטינית כסדרם. */
export function unvisual(s: string): string {
  if (!HEB.test(s)) return s
  return [...s]
    .reverse()
    .join('')
    .replace(/[A-Za-z0-9][A-Za-z0-9.,/:\-]*[A-Za-z0-9]|[A-Za-z0-9]/g, (m) => [...m].reverse().join(''))
    .replace(/[()]/g, (c) => (c === '(' ? ')' : '('))
}

function toLines(items: PdfItem[]): PdfItem[][] {
  const sorted = [...items].filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: PdfItem[][] = []
  let cur: PdfItem[] = []
  let y = Infinity
  for (const it of sorted) {
    if (Math.abs(it.y - y) > 2.5) {
      if (cur.length) lines.push(cur)
      cur = []
      y = it.y
    }
    cur.push(it)
  }
  if (cur.length) lines.push(cur)
  return lines
}

/** מאחד פריטים צמודים לתיבת טקסט אחת. הטקסט מחובר מימין לשמאל. */
function toBoxes(line: PdfItem[], visual: boolean, gap = 3.5): Box[] {
  const s = [...line].sort((a, b) => a.x - b.x)
  const groups: PdfItem[][] = []
  for (const it of s) {
    const g = groups[groups.length - 1]
    const last = g?.[g.length - 1]
    if (last && it.x - (last.x + last.w) < gap) g.push(it)
    else groups.push([it])
  }
  return groups.map((g) => {
    const parts = g.map((i) => (visual ? unvisual(i.str.trim()) : i.str.trim()))
    const hasHeb = parts.some((p) => HEB.test(p))
    // טקסט עברי: הפריט הימני הוא הראשון. מספרים/לטינית: משמאל לימין.
    const text = (hasHeb ? [...parts].reverse() : parts).join(hasHeb ? ' ' : '')
    return { text: text.replace(/\s+/g, ' ').trim(), x0: g[0].x, x1: g[g.length - 1].x + g[g.length - 1].w }
  })
}

function headerScore(boxes: Box[]): number {
  const kinds = new Set(boxes.map((b) => classifyHeader(b.text)).filter(Boolean))
  const amount = kinds.has('amount') || (kinds.has('debit') && kinds.has('credit'))
  return kinds.has('date') && amount ? kinds.size : 0
}

interface Line {
  y: number
  cells: string[]
  kind: 'row' | 'frag' | 'other'
  above: string[]
  below: string[]
}

/** מכניס כל תיבת טקסט לעמודה שהכותרת שלה הכי קרובה אליה */
function toCells(boxes: Box[], cols: Box[]): string[] {
  const row: string[] = cols.map(() => '')
  for (const b of [...boxes].sort((a, b) => b.x0 - a.x0)) {
    const c = (b.x0 + b.x1) / 2
    let best = 0
    let bestD = Infinity
    cols.forEach((h, i) => {
      const d = c < h.x0 ? h.x0 - c : c > h.x1 ? c - h.x1 : 0
      const tie = Math.abs((h.x0 + h.x1) / 2 - c) / 1000
      if (d + tie < bestD) {
        bestD = d + tie
        best = i
      }
    })
    row[best] = row[best] ? row[best] + ' ' + b.text : b.text
  }
  return row
}

/** מרחק מקסימלי (בנקודות) בין שורת תנועה לשורת המשך של התיאור שלה */
const FRAG_DIST = 30

/**
 * הופך את פריטי הטקסט של PDF (עמוד אחרי עמוד) לטבלה.
 * העמודות נקבעות לפי המיקום האופקי של הכותרות.
 * בחלק מהבנקים התיאור נשבר לכמה שורות מעל ומתחת לשורת התנועה; שורות כאלה מוצמדות לתנועה הקרובה אליהן.
 */
export function pdfToGrid(pages: PdfItem[][]): Cell[][] {
  const grid: Cell[][] = []
  let cols: Box[] | null = null
  let visual = false
  for (const page of pages) {
    const lines: Line[] = []
    for (const line of toLines(page)) {
      const y = line[0].y
      let boxes = toBoxes(line, visual)
      let score = headerScore(boxes)
      if (!score && !cols) {
        const alt = toBoxes(line, true)
        if (headerScore(alt)) {
          visual = true
          boxes = alt
          score = headerScore(alt)
          // השורות שכבר נקלטו (מעל הכותרת) נקראו הפוך
          for (const r of grid) r[0] = unvisual(String(r[0] ?? ''))
        }
      }
      if (score) {
        const sorted = [...boxes].sort((a, b) => b.x0 - a.x0) // מימין לשמאל
        if (!cols) grid.push(sorted.map((b) => b.text))
        cols = sorted
        continue
      }
      if (!cols) {
        grid.push([[...boxes].sort((a, b) => b.x0 - a.x0).map((b) => b.text).join(' ')])
        continue
      }
      const cells = toCells(boxes, cols)
      const kinds = cols.map((h) => classifyHeader(h.text))
      const dateCol = kinds.indexOf('date')
      const descCols = kinds.map((k, i) => (k === 'desc' || k === 'desc2' ? i : -1)).filter((i) => i >= 0)
      let kind: Line['kind'] = 'other'
      if (dateCol >= 0 && parseDate(cells[dateCol])) kind = 'row'
      else if (
        descCols.length &&
        cells.every((c, i) => !c || (descCols.includes(i) && clean(c).length <= 45)) &&
        cells.some((c) => c)
      )
        kind = 'frag'
      lines.push({ y, cells, kind, above: [], below: [] })
    }
    // הצמדת שורות המשך לתנועה הקרובה ביותר באותו עמוד
    const rows = lines.filter((l) => l.kind === 'row')
    for (const f of lines.filter((l) => l.kind === 'frag')) {
      let best: Line | null = null
      for (const r of rows) if (!best || Math.abs(r.y - f.y) < Math.abs(best.y - f.y)) best = r
      if (!best || Math.abs(best.y - f.y) > FRAG_DIST) {
        f.kind = 'other'
        continue
      }
      const text = f.cells.filter(Boolean).join(' ')
      if (f.y > best.y) best.above.push(text)
      else best.below.push(text)
      f.kind = 'frag'
    }
    const kinds = cols ? cols.map((h) => classifyHeader(h.text)) : []
    const descCol = kinds.findIndex((k) => k === 'desc' || k === 'desc2')
    for (const l of lines) {
      if (l.kind === 'frag') continue
      if (l.kind === 'row' && descCol >= 0 && (l.above.length || l.below.length)) {
        l.cells[descCol] = [...l.above, l.cells[descCol], ...l.below].filter(Boolean).join(' ')
      }
      grid.push(l.cells)
    }
  }
  return grid
}
