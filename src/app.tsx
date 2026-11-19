import { useEffect, useState } from 'preact/hooks'
import { Home } from './screens/Home'
import { NewDecl } from './screens/NewDecl'
import { DeclScreen } from './screens/DeclScreen'
import { Soldier } from './screens/Soldier'
import { ReturnScreen } from './screens/ReturnScreen'
import { PrintView } from './screens/PrintView'
import { Celebration } from './lib/ui'

export function go(hash: string) {
  location.hash = hash
}

function useHash(): string {
  const [h, setH] = useState(location.hash)
  useEffect(() => {
    const on = () => {
      setH(location.hash)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return h
}

export function App() {
  return (
    <>
      <Screen />
      <Celebration />
    </>
  )
}

function Screen() {
  const h = useHash()
  if (h.startsWith('#s=')) return <Soldier code={h.slice(3)} />
  if (h.startsWith('#r=')) return <ReturnScreen code={h.slice(3)} />
  if (h.startsWith('#print/')) return <PrintView id={h.slice(7)} />
  if (h.startsWith('#d/')) return <DeclScreen key={h} id={h.slice(3)} />
  if (h === '#new') return <NewDecl />
  return <Home />
}
