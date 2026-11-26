import { clean, findHeader, parseGrid, type Cell } from './grid'
import type { Fingerprint } from './fingerprint'
import { pdfToGrid, type PdfItem } from './pdfgrid'
import { sha256Hex } from './codec'
import type { ParseResult } from './types'

export interface FileResult extends ParseResult {
  fileHash: string
  /** אזהרות על הקובץ עצמו (למשל PDF שעבר עריכה) */
  fileWarnings: string[]
  fp: Fingerprint
}

function parseCsv(text: string): Cell[][] {
  const delim = (text.match(/\t/g)?.length ?? 0) > (text.match(/,/g)?.length ?? 0) ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === delim) {
      row.push(cur)
      cur = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
    } else cur += ch
  }
  if (cur || row.length) {
    row.push(cur)
    rows.push(row)
  }
  return rows
}

/** חלק מהבנקים מייצאים "אקסל" שהוא בעצם טבלת HTML */
function parseHtmlTables(text: string): Cell[][] {
  const doc = new DOMParser().parseFromString(text, 'text/html')
  const rows: Cell[][] = []
  doc.querySelectorAll('tr').forEach((tr) => {
    const cells: string[] = []
    tr.querySelectorAll('th,td').forEach((td) => {
      cells.push(td.textContent ?? '')
      const span = Number(td.getAttribute('colspan') || 1)
      for (let i = 1; i < span && i < 30; i++) cells.push('')
    })
    rows.push(cells)
  })
  return rows
}

// תוכנות עריכה. דפדפנים ו"הדפסה ל-PDF" לא ברשימה, כי חלק מהבנקים מפיקים את הקובץ כך
const EDITORS = /ilovepdf|smallpdf|sejda|pdfescape|foxit|phantompdf|acrobat|nitro|pdf-?xchange|canva|photoshop|illustrator|microsoft.{0,4}word|libreoffice|openoffice|pdfelement|wondershare|inkscape|pdfsam|pdf24|xodo|pdffiller|dochub|camscanner/i

async function readPdf(buf: ArrayBuffer): Promise<{ grid: Cell[][]; warnings: string[]; producer?: string; creator?: string }> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise.catch(() => {
    throw new Error('הקובץ לא נפתח כ-PDF תקין. ייתכן שהוא פגום או שנשמר לא נכון. יש לבקש מהחייל להוריד אותו שוב מהבנק.')
  })
  const warnings: string[] = []
  let producer: string | undefined
  let creator: string | undefined
  try {
    const meta = await doc.getMetadata()
    const info = (meta.info ?? {}) as Record<string, unknown>
    producer = info.Producer ? String(info.Producer).slice(0, 80) : undefined
    creator = info.Creator ? String(info.Creator).slice(0, 80) : undefined
    const tool = `${info.Producer ?? ''} ${info.Creator ?? ''}`
    if (EDITORS.test(tool)) {
      warnings.push(`הקובץ נוצר או נשמר בתוכנה שאינה של בנק (${tool.trim().slice(0, 60)}). ייתכן שעבר עריכה או שהודפס מחדש.`)
    }
  } catch {
    /* אין מטא-דאטה */
  }
  const pages: PdfItem[][] = []
  let chars = 0
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    const items: PdfItem[] = []
    for (const it of tc.items as any[]) {
      if (typeof it.str !== 'string' || !it.str.trim()) continue
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width })
      chars += it.str.length
    }
    pages.push(items)
  }
  if (chars < 40) {
    throw new Error('ה-PDF הזה הוא תמונה (צילום מסך, צילום או סריקה), ואין בו טקסט לקרוא. יש לבקש מהחייל את הקובץ המקורי שהורד מהאתר או מהאפליקציה של הבנק.')
  }
  if (isGarbled(pages)) {
    throw new Error(
      'הקובץ הודפס מאתר הבנק דרך מדפסת PDF במחשב (למשל Adobe PDF), והטקסט בו נשמר כציורים שאי אפשר לקרוא. ' +
        'יש לבקש מהחייל להוריד את הקובץ שוב: באתר הבנק, בהדפסה בכרום, לבחור ביעד "שמירה כ-PDF" (ולא Adobe PDF), או להוריד מהאפליקציה של הבנק.',
    )
  }
  return { grid: pdfToGrid(pages), warnings, producer, creator }
}

/**
 * יש מדפסות PDF ששומרות את האותיות כציורים בלי המשמעות שלהן. יוצא הרבה "טקסט" שכולו סימנים,
 * בלי אף אות עברית ובלי אף תאריך. קובץ כזה אי אפשר לקרוא, וחשוב להגיד את זה במפורש.
 */
export function isGarbled(pages: PdfItem[][]): boolean {
  const text = pages.flat().map((i) => i.str).join(' ')
  const visible = text.replace(/\s/g, '').length
  if (visible < 200) return false
  const heb = (text.match(/[\u05D0-\u05EA]/g) ?? []).length
  const dates = /\d{1,2}[./]\d{1,2}([./]\d{2,4})?/.test(text)
  return heb / visible < 0.02 && !dates
}

/** עו"ש של שנה הוא פחות מ-2MB. קובץ ענק הוא טעות או ניסיון לתקוע את הדפדפן */
export const MAX_FILE = 15 * 1024 * 1024

export async function readStatement(file: File): Promise<FileResult> {
  if (file.size > MAX_FILE) throw new Error('הקובץ גדול מדי לעו"ש (מעל 15MB). יש להוריד מהבנק רק את תקופת העו"ש הנדרשת.')
  if (file.size === 0) throw new Error('הקובץ ריק.')
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const fileHash = (await sha256Hex(bytes)).slice(0, 16)
  const head = String.fromCharCode(...bytes.subarray(0, 5))
  const name = file.name.toLowerCase()
  let grid: Cell[][]
  let fileWarnings: string[] = []
  let fp: Omit<Fingerprint, 'header'> = { kind: 'sheet' }
  if (head.startsWith('%PDF')) {
    const r = await readPdf(buf)
    grid = r.grid
    fileWarnings = r.warnings
    fp = { kind: 'pdf', producer: r.producer, creator: r.creator }
  } else if (head.startsWith('PK')) {
    const { default: readXlsx } = await import('read-excel-file/browser')
    const sheets = await readXlsx(file)
    // בוחרים את הגיליון עם הכי הרבה שורות
    const best = sheets.reduce((a, b) => (b.data.length > a.data.length ? b : a))
    grid = best.data as Cell[][]
    fp = { kind: 'sheet', creator: 'xlsx:' + best.sheet }
  } else if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    throw new Error('זה קובץ אקסל בפורמט ישן (xls). יש לפתוח אותו באקסל ולשמור כ-xlsx, או להוריד מהבנק כ-PDF.')
  } else {
    let text = new TextDecoder('utf-8').decode(bytes)
    if (text.includes('�')) text = new TextDecoder('windows-1255').decode(bytes)
    if (/<table|<tr/i.test(text)) {
      grid = parseHtmlTables(text)
      fp = { kind: 'sheet', creator: 'html' }
    } else if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv')) grid = parseCsv(text)
    else throw new Error('סוג קובץ לא נתמך. יש להעלות PDF מקורי מהבנק או קובץ אקסל.')
  }
  const h = findHeader(grid)
  const header = h ? grid[h.index].map(clean).filter(Boolean).join('|') : ''
  return { ...parseGrid(grid), fileHash, fileWarnings, fp: { ...fp, header } }
}
