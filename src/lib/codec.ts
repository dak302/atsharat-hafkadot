import type { LockedRow } from './types'

const enc = new TextEncoder()
const dec = new TextDecoder()

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unb64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
  return out
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>))
  return new Uint8Array(await res.arrayBuffer())
}

/** אובייקט -> מחרוזת קצרה לקישור. "z" = דחוס, "j" = לא דחוס (דפדפן ישן) */
export async function encodePayload(obj: unknown): Promise<string> {
  const raw = enc.encode(JSON.stringify(obj))
  if (typeof CompressionStream !== 'undefined') {
    return 'z' + b64url(await pipe(raw, new CompressionStream('deflate-raw')))
  }
  return 'j' + b64url(raw)
}

/** הגבלת גודל אחרי פענוח: קישור אמיתי הוא כמה קילובייטים. קישור זדוני דחוס יכול להתנפח לגיגות ולתקוע את הדפדפן */
export const MAX_DECODED = 2_000_000

async function inflateCapped(bytes: Uint8Array): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
    .getReader()
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_DECODED) {
      await reader.cancel()
      throw new Error('הקישור גדול מדי')
    }
    parts.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

export async function decodePayload<T>(s: string): Promise<T> {
  const kind = s[0]
  if (s.length > MAX_DECODED) throw new Error('הקישור גדול מדי')
  const bytes = unb64url(s.slice(1))
  if (kind === 'z') return JSON.parse(dec.decode(await inflateCapped(bytes)))
  if (kind === 'j') return JSON.parse(dec.decode(bytes))
  throw new Error('קוד לא תקין')
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? enc.encode(data) : data
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** חותמת של השורות הנעולות. כל שינוי בתאריך, סכום או שורה משנה אותה. */
export async function lockHash(id: string, round: number, rows: LockedRow[]): Promise<string> {
  const canon = JSON.stringify([id, round, rows.map((r) => [r.i, r.d, r.a, r.k ?? ''])])
  return (await sha256Hex(canon)).slice(0, 20)
}

/** שולף קוד מקישור מלא או מקוד שהודבק */
export function extractCode(input: string, key: 's' | 'r'): string | null {
  const m = new RegExp(`#${key}=([A-Za-z0-9_-]+)`).exec(input)
  if (m) return m[1]
  const t = input.trim()
  return /^[zj][A-Za-z0-9_-]+$/.test(t) ? t : null
}

// ---- גיבוי מוצפן בסיסמה (AES-GCM, מפתח מ-PBKDF2) ----

async function keyFrom(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 250_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptJson(obj: unknown, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await keyFrom(password, salt)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))))
  return JSON.stringify({ app: 'hafkadot', v: 1, salt: b64url(salt), iv: b64url(iv), data: b64url(ct) })
}

export async function decryptJson<T>(text: string, password: string): Promise<T> {
  const f = JSON.parse(text)
  if (f.app !== 'hafkadot') throw new Error('זה לא קובץ גיבוי של האפליקציה')
  const key = await keyFrom(password, unb64url(f.salt))
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64url(f.iv) as BufferSource }, key, unb64url(f.data) as BufferSource)
    return JSON.parse(dec.decode(pt))
  } catch {
    throw new Error('סיסמה שגויה או קובץ פגום')
  }
}
