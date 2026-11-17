import { useEffect, useState } from 'preact/hooks'
import { decodePayload } from '../lib/codec'
import { applyReturn } from '../lib/store'
import type { ReturnPayload } from '../lib/types'
import { Banner, Page } from '../lib/ui'

export function ReturnScreen({ code }: { code: string }) {
  const [err, setErr] = useState('')
  useEffect(() => {
    decodePayload<ReturnPayload>(code)
      .then((p) => {
        const res = applyReturn(p)
        if (res.ok) location.replace(location.pathname + '#d/' + res.decl.id)
        else setErr(res.error)
      })
      .catch(() => setErr('הקישור פגום או חתוך. בקש מהחייל לשלוח שוב.'))
  }, [code])
  return (
    <Page title="קליטת תשובה" back="#">
      {err ? <Banner kind="bad">{err}</Banner> : <p class="muted">בודק את התשובה…</p>}
    </Page>
  )
}
