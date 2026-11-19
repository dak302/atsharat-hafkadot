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

/** קו אפור במקום תוכן שעוד נטען */
export function Sk(props: { w?: string; h?: number; r?: number }) {
  return <span class="sk" style={{ width: props.w ?? '100%', height: (props.h ?? 16) + 'px', borderRadius: (props.r ?? 6) + 'px' }} />
}

/** שלד של תוצאת קריאת העו"ש, בזמן שהקובץ נקרא */
export function ReadSkeleton() {
  return (
    <section class="card skel" aria-busy="true" aria-label="קורא את הקובץ">
      <Sk w="35%" h={20} />
      <div class="recon">
        <div><Sk w="72px" h={12} /><Sk w="96px" h={24} /></div>
        <div><Sk w="72px" h={12} /><Sk w="96px" h={24} /></div>
        <div><Sk w="72px" h={12} /><Sk w="96px" h={24} /></div>
      </div>
      <Sk w="70%" />
      <Sk w="55%" />
      <Sk h={44} r={8} />
    </section>
  )
}

/** שלד של כרטיסים (מסך החייל ומסך הבדיקה של המשק) */
export function CardsSkeleton(props: { n?: number }) {
  return (
    <div class="skel" aria-busy="true" aria-label="טוען">
      {Array.from({ length: props.n ?? 3 }, (_, i) => (
        <section class="card entry" key={i}>
          <div class="ehead">
            <Sk w="88px" />
            <Sk w="64px" />
            <span style={{ marginInlineStart: 'auto' }}>
              <Sk w="80px" />
            </span>
          </div>
          <Sk w="60%" h={12} />
          <Sk h={64} r={8} />
        </section>
      ))}
    </div>
  )
}

/** שדה עם וי ירוק בסוף כשהערך תקין */
export function OkField(props: { ok: boolean; children: ComponentChildren }) {
  return (
    <span class={'okfield' + (props.ok ? ' ok' : '')}>
      {props.children}
      {props.ok && <DoneCheck size={18} label="תקין" />}
    </span>
  )
}
