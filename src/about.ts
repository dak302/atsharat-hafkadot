import '@fontsource/assistant/hebrew-400.css'
import '@fontsource/assistant/hebrew-600.css'
import '@fontsource/assistant/latin-400.css'
import '@fontsource/assistant/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import './styles.css'
import './about.css'

// המטבע הירוק התלת-ממדי של רגע ההצלחה, פעם אחת בטעינה, מעל צילום האפליקציה
const canvas = document.querySelector<HTMLCanvasElement>('.lp-coin')
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
if (canvas && !reduce) {
  import('./lib/check3d').then((m) => {
    if (!m.webglOk()) return canvas.classList.add('flat')
    const size = canvas.getBoundingClientRect().width || 140
    m.mountCheck3D(canvas, size)
    canvas.classList.add('on')
  })
} else canvas?.classList.add('flat')
