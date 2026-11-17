import { render } from 'preact'
import '@fontsource/ibm-plex-sans-hebrew/hebrew-400.css'
import '@fontsource/ibm-plex-sans-hebrew/hebrew-500.css'
import '@fontsource/ibm-plex-sans-hebrew/latin-400.css'
import '@fontsource/ibm-plex-sans-hebrew/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import { App } from './app'
import './styles.css'

render(<App />, document.getElementById('app')!)
