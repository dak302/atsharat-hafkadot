import { lockHash } from './codec'
import { lockedRows } from './rules'
import type { Declaration, ReturnPayload, SendPayload } from './types'

const KEY = 'hafkadot.decls.v1'

export function loadAll(): Declaration[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

function saveAll(list: Declaration[]) {
  localStorage.setItem(KEY, JSON.stringify(list))
}

export function getDecl(id: string): Declaration | undefined {
  return loadAll().find((d) => d.id === id)
}

export function putDecl(d: Declaration) {
  d.updatedAt = Date.now()
  const list = loadAll().filter((x) => x.id !== d.id)
  list.unshift(d)
  saveAll(list)
}

export function deleteDecl(id: string) {
  saveAll(loadAll().filter((d) => d.id !== id))
}

export function newId(): string {
  const b = crypto.getRandomValues(new Uint8Array(6))
  return [...b].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 10)
}

/** נועל את השורות שנבחרו ויוצר את מה שנשלח לחייל */
export async function buildSend(d: Declaration): Promise<SendPayload> {
  const rows = lockedRows(d)
  const round = d.round + 1
  const hash = await lockHash(d.id, round, rows)
  d.round = round
  d.sent = { rows, hash, at: Date.now() }
  d.status = 'sent'
  // שומרים רק תשובות לשורות שעדיין בהצהרה
  const keep = new Set(rows.map((r) => r.i))
  for (const k of Object.keys(d.answers)) if (!keep.has(Number(k))) delete d.answers[Number(k)]
  for (const k of Object.keys(d.fixNotes)) if (!keep.has(Number(k))) delete d.fixNotes[Number(k)]
  putDecl(d)
  return payloadOf(d)
}

/** מה שנשלח לחייל, לפי הנעילה האחרונה */
export function payloadOf(d: Declaration): SendPayload {
  const p: SendPayload = { v: 1, id: d.id, t: d.type, r: d.round, w: d.recipient, rows: d.sent!.rows, h: d.sent!.hash, acct: d.account }
  if (d.person) p.person = d.person
  if (Object.keys(d.answers).length) p.ans = d.answers
  if (Object.keys(d.fixNotes).length) p.fix = d.fixNotes
  return p
}

export type ReturnCheck = { ok: true; decl: Declaration } | { ok: false; error: string }

/**
 * קליטת מה שחזר מהחייל. מהחייל נלקחים אך ורק הסברים, הערות ופרטים אישיים.
 * תאריכים וסכומים נשארים תמיד מהעותק שנשמר אצל המשק.
 */
export function applyReturn(p: ReturnPayload): ReturnCheck {
  if (!p || p.v !== 1 || typeof p.id !== 'string') return { ok: false, error: 'הקוד שחזר לא תקין.' }
  const d = getDecl(p.id)
  if (!d) return { ok: false, error: 'ההצהרה הזו לא נמצאת במכשיר הזה. פתח את הקישור במכשיר שממנו נשלחה, או ייבא גיבוי.' }
  if (!d.sent) return { ok: false, error: 'ההצהרה הזו לא נשלחה לחייל.' }
  if (p.r !== d.round) return { ok: false, error: 'התשובה שייכת לגרסה ישנה של ההצהרה. בקש מהחייל למלא את הקישור האחרון ששלחת.' }
  if (p.h !== d.sent.hash) return { ok: false, error: 'החותמת לא תואמת: הנתונים שהחייל ראה שונים ממה שנשלח. התשובה נדחתה.' }
  const ids = d.sent.rows.map((r) => r.i)
  const got = p.ans && typeof p.ans === 'object' ? p.ans : {}
  const extra = Object.keys(got).filter((k) => !ids.includes(Number(k)))
  if (extra.length) return { ok: false, error: 'התשובה כוללת שורות שלא נשלחו. התשובה נדחתה.' }
  const missing = ids.filter((i) => {
    const a = got[i]
    return !a || typeof a.exp !== 'string' || (!a.exp.trim() && !a.dispute)
  })
  if (missing.length) return { ok: false, error: `חסר הסבר ${missing.length === 1 ? 'לשורה אחת' : `ל-${missing.length} שורות`}. התשובה נדחתה.` }
  d.answers = {}
  for (const i of ids) {
    const a = got[i]
    d.answers[i] = { exp: String(a.exp).slice(0, 300), dispute: !!a.dispute, note: a.note ? String(a.note).slice(0, 300) : undefined }
  }
  d.person = sanitizePerson(p.p)
  d.fixNotes = {}
  d.status = 'returned'
  putDecl(d)
  return { ok: true, decl: d }
}

function str(v: unknown, max = 60): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined
}

function sanitizePerson(p: any): Declaration['person'] {
  const acct = (a: any) => (a ? { bank: str(a.bank), branch: str(a.branch, 10), number: str(a.number, 20) } : undefined)
  return {
    name: str(p?.name),
    idNum: str(p?.idNum, 12),
    personalNum: str(p?.personalNum, 12),
    marital: str(p?.marital, 12),
    soldierName: str(p?.soldierName),
    soldierNum: str(p?.soldierNum, 12),
    acct: acct(p?.acct),
    acct2: acct(p?.acct2),
  }
}

export function importDecls(list: Declaration[]): number {
  const cur = loadAll()
  const byId = new Map(cur.map((d) => [d.id, d]))
  let n = 0
  for (const d of list) {
    if (!d || typeof d.id !== 'string' || !Array.isArray(d.txs)) continue
    const ex = byId.get(d.id)
    if (!ex || d.updatedAt > ex.updatedAt) {
      byId.set(d.id, d)
      n++
    }
  }
  saveAll([...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt))
  return n
}
