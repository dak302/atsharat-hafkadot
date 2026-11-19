import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { ArrowRight, Volume2, VolumeX } from 'lucide-preact'
import { onCelebrate, setSound, soundOn } from './celebrate'
import { fmtMoney } from './grid'
import type { Declaration } from './types'

export const TYPE_NAME = { aid: 'סיוע כלכלי', tashmash: 'תשמ"ש' } as const
export const STATUS_NAME: Record<Declaration['status'], string> = {
  draft: 'טיוטה',
  sent: 'ממתין לתשובה',
  returned: 'חזר לבדיקה',
  done: 'הושלם',
}

/** אייקונים: סט אחד, גודל אחד, עובי קו אחד */
export const ICON = { size: 18, strokeWidth: 1.5 } as const

export function Page(props: { title: string; back?: string; children: ComponentChildren; wide?: boolean }) {
  const w = props.wide ? ' wide' : ''
  return (
    <>
      <header class="appbar">
        <div class={'appbar-in' + w}>
          {props.back != null && (
            <a class="iconbtn" href={props.back || '#'} aria-label="חזרה">
              <ArrowRight {...ICON} />
            </a>
          )}
          <h1>{props.title}</h1>
          <SoundToggle />
        </div>
      </header>
      <main class={'page' + w}>{props.children}</main>
    </>
  )
}

export function Banner(props: { kind: 'ok' | 'warn' | 'bad' | 'info'; children: ComponentChildren }) {
  return <div class={'banner ' + props.kind}>{props.children}</div>
}

export function Stamp(props: { children: ComponentChildren; big?: boolean }) {
  return <span class={'stamp' + (props.big ? ' big' : '')}>{props.children}</span>
}

/** סכום עם סימן: הפקדה בירוק עם +, משיכה בצבע הטקסט עם − */
export function Amount({ value }: { value: number }) {
  return <span class={'amt num ' + (value > 0 ? 'dep' : 'wd')}>{(value > 0 ? '+' : '−') + fmtMoney(value)}</span>
}

export function waLink(text: string, phone?: string): string {
  let p = (phone ?? '').replace(/\D/g, '')
  if (p.startsWith('0')) p = '972' + p.slice(1)
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`
}

export function appUrl(hash: string): string {
  return location.origin + location.pathname + hash
}

export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** איפה ההצהרה נמצאת בתהליך. מוצג למעלה בכל מסך של המשק. */
const STEPS = ['העלאת עו"ש', 'בחירת שורות', 'אצל החייל', 'בדיקה', 'הפקת PDF']
export const STEP_OF: Record<Declaration['status'], number> = { draft: 1, sent: 2, returned: 3, done: 4 }

export function Steps({ at }: { at: number }) {
  return (
    <ol class="steps" aria-label="שלבי ההצהרה">
      {STEPS.map((s, i) => (
        <li class={i < at ? 'past' : i === at ? 'now' : ''} aria-current={i === at ? 'step' : undefined}>
          <span class="dot num">{i + 1}</span>
          <span class="lbl">{s}</span>
        </li>
      ))}
    </ol>
  )
}

/** וי ירוק בעיגול שמצטייר כשהוא מופיע */
export function DoneCheck(props: { size?: number; label?: string }) {
  const n = props.size ?? 20
  return (
    <svg class="donecheck" width={n} height={n} viewBox="0 0 24 24" role="img" aria-label={props.label ?? 'בוצע'}>
      <circle cx="12" cy="12" r="12" />
      <path d="M7 12.5l3.2 3.2L17 9" pathLength={1} />
    </svg>
  )
}

/** כפתור השתקה בכותרת. ההעדפה נשמרת רק בדפדפן הזה */
function SoundToggle() {
  const [on, setOn] = useState(soundOn)
  return (
    <button
      class="iconbtn sound"
      aria-label={on ? 'השתקת צלילים' : 'הפעלת צלילים'}
      aria-pressed={!on}
      onClick={() => {
        setSound(!on)
        setOn(!on)
      }}
    >
      {on ? <Volume2 {...ICON} /> : <VolumeX {...ICON} />}
    </button>
  )
}

/** מסך הצלחה קצר: עיגול ירוק עם וי שמצטייר וטקסט, ונעלם לבד אחרי כשנייה וחצי */
export function Celebration() {
  const [e, setE] = useState<{ text: string; id: number } | null>(null)
  useEffect(() => onCelebrate(setE), [])
  useEffect(() => {
    if (!e) return
    const t = setTimeout(() => setE(null), 1500)
    return () => clearTimeout(t)
  }, [e])
  if (!e) return null
  return (
    <div class="celebrate" key={e.id} role="status" aria-live="polite">
      <div class="celebrate-in">
        <DoneCheck size={88} label="" />
        <p>{e.text}</p>
      </div>
    </div>
  )
}
