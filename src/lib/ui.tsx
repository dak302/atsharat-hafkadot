import type { ComponentChildren } from 'preact'
import type { Declaration } from './types'

export const TYPE_NAME = { aid: 'סיוע כלכלי', tashmash: 'תשמ"ש' } as const
export const STATUS_NAME: Record<Declaration['status'], string> = {
  draft: 'טיוטה',
  sent: 'נשלח, ממתין לתשובה',
  returned: 'חזר, לבדיקה',
  done: 'הושלם',
}

export function Page(props: { title: string; back?: string; children: ComponentChildren; wide?: boolean }) {
  return (
    <div class={'page' + (props.wide ? ' wide' : '')}>
      <header class="top">
        {props.back != null && (
          <a class="back" href={props.back || '#'} aria-label="חזרה">
            →
          </a>
        )}
        <h1>{props.title}</h1>
      </header>
      {props.children}
    </div>
  )
}

export function Banner(props: { kind: 'ok' | 'warn' | 'bad' | 'info'; children: ComponentChildren }) {
  return <div class={'banner ' + props.kind}>{props.children}</div>
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
