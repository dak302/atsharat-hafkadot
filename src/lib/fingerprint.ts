/**
 * טביעת אצבע של קובץ עו"ש: איזו תוכנה יצרה אותו ואיך בנויה הטבלה.
 * לכל בנק נשמרות הטביעות של קבצים שהמשק כבר אישר (הפיק מהם PDF).
 * קובץ חדש שלא דומה לאף אחת מהן מקבל אזהרה. זה לא מונע זיוף מתוחכם, אבל תופס את רוב הפשוטים.
 */
export interface Fingerprint {
  kind: 'pdf' | 'sheet'
  producer?: string
  creator?: string
  header: string
}

interface Entry {
  fp: Fingerprint
  n: number
  at: number
}
export type FpStore = Record<string, Entry[]>

export type FpCheck =
  | { status: 'nobank' }
  | { status: 'new'; bank: string }
  | { status: 'match'; bank: string; seen: number }
  | { status: 'mismatch'; bank: string; diffs: string[] }

const KEY = 'hafkadot.fp.v1'

/** טביעות מקבצים אמיתיים של הבנקים, מוטמעות באפליקציה. יתמלא כשיגיעו דוגמאות. */
const BUILTIN: FpStore = {}

function load(): FpStore {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}

function save(s: FpStore) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* אחסון חסום */
  }
}

// מספרי גרסה משתנים בין עדכונים של אותה תוכנה, לכן לא משווים אותם
const norm = (s?: string) =>
  (s ?? '')
    .toLowerCase()
    .replace(/\d+(\.\d+)*/g, '#')
    .replace(/\s+/g, ' ')
    .trim()

export function diffFp(a: Fingerprint, b: Fingerprint): string[] {
  const d: string[] = []
  if (a.kind !== b.kind) return ['סוג הקובץ']
  if (norm(a.producer) !== norm(b.producer) || norm(a.creator) !== norm(b.creator)) d.push('התוכנה שיצרה את הקובץ')
  if (a.header !== b.header) d.push('מבנה הטבלה')
  return d
}

const key = (bank: string, fp: Fingerprint) => `${bank}|${fp.kind}`

export function checkFp(bank: string | undefined, fp: Fingerprint, store: FpStore = load()): FpCheck {
  if (!bank) return { status: 'nobank' }
  const k = key(bank, fp)
  const known = [...(BUILTIN[k] ?? []), ...(store[k] ?? [])]
  if (!known.length) return { status: 'new', bank }
  const hit = known.find((e) => diffFp(e.fp, fp).length === 0)
  if (hit) return { status: 'match', bank, seen: known.filter((e) => diffFp(e.fp, fp).length === 0).reduce((n, e) => n + e.n, 0) }
  // מציגים את ההבדלים מול הטביעה הקרובה ביותר
  const diffs = known.map((e) => diffFp(e.fp, fp)).sort((x, y) => x.length - y.length)[0]
  return { status: 'mismatch', bank, diffs }
}

export function learnFp(bank: string | undefined, fp: Fingerprint | undefined) {
  if (!bank || !fp) return
  const s = load()
  const k = key(bank, fp)
  const list = (s[k] ??= [])
  const hit = list.find((e) => diffFp(e.fp, fp).length === 0)
  if (hit) hit.n++
  else list.push({ fp, n: 1, at: Date.now() })
  save(s)
}

export function exportFps(): FpStore {
  return load()
}

export function importFps(incoming: unknown) {
  if (!incoming || typeof incoming !== 'object') return
  const s = load()
  for (const [k, entries] of Object.entries(incoming as FpStore)) {
    if (!Array.isArray(entries)) continue
    const list = (s[k] ??= [])
    for (const e of entries) {
      if (!e?.fp || typeof e.fp.header !== 'string') continue
      const hit = list.find((x) => diffFp(x.fp, e.fp).length === 0)
      if (hit) hit.n = Math.max(hit.n, e.n || 1)
      else list.push({ fp: e.fp, n: e.n || 1, at: e.at || Date.now() })
    }
  }
  save(s)
}
