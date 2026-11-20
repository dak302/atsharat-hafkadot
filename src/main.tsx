import { render } from 'preact'
import '@fontsource/assistant/hebrew-300.css'
import '@fontsource/assistant/hebrew-400.css'
import '@fontsource/assistant/hebrew-600.css'
import '@fontsource/assistant/latin-400.css'
import '@fontsource/assistant/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import { App } from './app'
import { armAudio } from './lib/celebrate'
import { preloadCheck3D } from './lib/ui'
import './styles.css'

armAudio()
// טוענים את הווי התלת-ממדי ברקע אחרי הנגיעה הראשונה, כדי שיהיה מוכן לרגע ההצלחה
addEventListener('pointerdown', preloadCheck3D, { once: true, capture: true })
render(<App />, document.getElementById('app')!)
