import type { ComponentChildren } from 'preact'
import { ArrowRight } from 'lucide-preact'
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
