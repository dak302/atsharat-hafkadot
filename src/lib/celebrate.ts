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

function audio(): AudioContext | null {
  const AC = window.AudioContext || (window as any).webkitAudioContext
  if (!AC) return null
  ctx ??= new AC()
  return ctx
}

/**
 * אייפון ודפדפנים אחרים משמיעים צליל רק אם השמע נפתח בתוך נגיעה של המשתמש.
 * בנגיעה הראשונה בדף פותחים את השמע ומשמיעים שקט, וכך כל צליל אחר כך עובד.
 */
export function armAudio() {
  const unlock = () => {
    try {
      const c = audio()
      if (!c) return
      if (c.state === 'suspended') void c.resume()
      const b = c.createBuffer(1, 1, 22050)
      const src = c.createBufferSource()
      src.buffer = b
      src.connect(c.destination)
      src.start(0)
    } catch {
      /* אין שמע */
    }
    if (ctx?.state === 'running') ['pointerdown', 'touchend', 'keydown'].forEach((t) => removeEventListener(t, unlock, true))
  }
  ;['pointerdown', 'touchend', 'keydown'].forEach((t) => addEventListener(t, unlock, true))
}

/** צליל קצר שנוצר בקוד, בלי קובץ שמע: שני צלילים עולים לסיום שלב, צליל אחד רך לסיום פריט */
function chime(size: Size) {
  if (!soundOn()) return
  try {
    const c = audio()
    if (!c) return
    if (c.state === 'suspended') void c.resume()
    // סיום שלב: שלושה צלילים עולים (דו-מי-סול). סיום פריט: צליל אחד רך
    const notes = size === 'big' ? [1046.5, 1318.5, 1568] : [1318.5]
    const now = c.currentTime
    notes.forEach((freq, i) => {
      const t = now + i * 0.085
      const len = size === 'big' ? (i === notes.length - 1 ? 0.6 : 0.3) : 0.22
      const peak = size === 'big' ? 0.16 : 0.09
      for (const [type, mul, vol] of [['sine', 1, 1], ['triangle', 2, 0.18]] as const) {
        const osc = c.createOscillator()
        const gain = c.createGain()
        osc.type = type
        osc.frequency.value = freq * mul
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(peak * vol, t + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + len)
        osc.connect(gain).connect(c.destination)
        osc.start(t)
        osc.stop(t + len + 0.05)
      }
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
