/**
 * משוב הצלחה: וי ירוק, צליל ורטט כשמסיימים משהו.
 * גדול (מסך מלא קצר) לסיום שלב, קטן (צליל ורטט בלבד) לסיום פריט.
 */

export type Size = 'big' | 'small'

type Listener = (e: { text: string; id: number }) => void
const listeners = new Set<Listener>()
let counter = 0

export function onCelebrate(fn: Listener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const SOUND_KEY = 'hafkadot.sound'

/** העדפת הצליל נשמרת רק בדפדפן הזה. ברירת המחדל: צליל פועל */
export function soundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setSound(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
  } catch {
    /* אחסון חסום */
  }
}

let ctx: AudioContext | null = null

/** צליל קצר שנוצר בקוד, בלי קובץ שמע: שני צלילים עולים לסיום שלב, צליל אחד רך לסיום פריט */
function chime(size: Size) {
  if (!soundOn()) return
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return
    ctx ??= new AC()
    if (ctx.state === 'suspended') void ctx.resume()
    const notes = size === 'big' ? [880, 1318.5] : [1046.5]
    const now = ctx.currentTime
    notes.forEach((freq, i) => {
      const t = now + i * 0.11
      const osc = ctx!.createOscillator()
      const gain = ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const peak = size === 'big' ? 0.18 : 0.1
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + (size === 'big' ? 0.45 : 0.25))
      osc.connect(gain).connect(ctx!.destination)
      osc.start(t)
      osc.stop(t + 0.5)
    })
  } catch {
    /* אין שמע במכשיר */
  }
}

function buzz(size: Size) {
  try {
    navigator.vibrate?.(size === 'big' ? [18, 60, 28] : 12)
  } catch {
    /* אין רטט */
  }
}

/** סיום שלב: וי גדול על המסך עם טקסט, צליל ורטט */
export function celebrate(text: string) {
  chime('big')
  buzz('big')
  const e = { text, id: ++counter }
  listeners.forEach((fn) => fn(e))
}

/** סיום פריט קטן (למשל הסבר שמולא): צליל רך ורטט קצר. הוי הקטן מוצג ליד הפריט עצמו */
export function tick() {
  chime('small')
  buzz('small')
}
