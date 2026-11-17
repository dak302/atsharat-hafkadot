import { parseGrid, type Cell } from './grid'
import { pdfToGrid, type PdfItem } from './pdfgrid'
import { sha256Hex } from './codec'
import type { ParseResult } from './types'

export interface FileResult extends ParseResult {
  fileHash: string
  /** אזהרות על הקובץ עצמו (למשל PDF שעבר עריכה) */
  fileWarnings: string[]
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

const EDITORS = /ilovepdf|smallpdf|sejda|pdfescape|foxit|phantompdf|acrobat pro|nitro|pdf-?xchange|canva|photoshop|illustrator|word|libreoffice|google docs|skia|chrom|quartz|pdfelement|wondershare|inkscape|pdfsam|pdf24|xodo/i

async function readPdf(buf: ArrayBuffer): Promise<{ grid: Cell[][]; warnings: string[] }> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  const warnings: string[] = []
  try {
    const meta = await doc.getMetadata()
    const info = (meta.info ?? {}) as Record<string, unknown>
    const tool = `${info.Producer ?? ''} ${info.Creator ?? ''}`
    if (EDITORS.test(tool)) {
      warnings.push(`הקובץ נוצר או נשמר בתוכנה שאינה של בנק (${tool.trim().slice(0, 60)}). ייתכן שעבר עריכה או שהודפס מחדש.`)
    }
    const c = String(info.CreationDate ?? '')
    const m = String(info.ModDate ?? '')
    if (c && m && c.slice(0, 16) !== m.slice(0, 16)) {
      warnings.push('תאריך השינוי של הקובץ שונה מתאריך היצירה. ייתכן שהקובץ נערך אחרי שהופק.')
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
    throw new Error('ב-PDF הזה אין טקסט (כנראה סריקה או צילום). יש לבקש את הקובץ המקורי שהורד מאפליקציית הבנק.')
  }
  return { grid: pdfToGrid(pages), warnings }
}

export async function readStatement(file: File): Promise<FileResult> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const fileHash = (await sha256Hex(bytes)).slice(0, 16)
  const head = String.fromCharCode(...bytes.subarray(0, 5))
  const name = file.name.toLowerCase()
  let grid: Cell[][]
  let fileWarnings: string[] = []
  if (head.startsWith('%PDF')) {
    const r = await readPdf(buf)
    grid = r.grid
    fileWarnings = r.warnings
  } else if (head.startsWith('PK')) {
    const { default: readXlsx } = await import('read-excel-file/browser')
    const sheets = await readXlsx(file)
    // בוחרים את הגיליון עם הכי הרבה שורות
    const best = sheets.reduce((a, b) => (b.data.length > a.data.length ? b : a))
    grid = best.data as Cell[][]
  } else if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    throw new Error('זה קובץ אקסל בפורמט ישן (xls). יש לפתוח אותו באקסל ולשמור כ-xlsx, או להוריד מהבנק כ-PDF.')
  } else {
    let text = new TextDecoder('utf-8').decode(bytes)
    if (text.includes('�')) text = new TextDecoder('windows-1255').decode(bytes)
    if (/<table|<tr/i.test(text)) grid = parseHtmlTables(text)
    else if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv')) grid = parseCsv(text)
    else throw new Error('סוג קובץ לא נתמך. יש להעלות PDF מקורי מהבנק או קובץ אקסל.')
  }
  return { ...parseGrid(grid), fileHash, fileWarnings }
}
