import { defineConfig, type Plugin } from 'vite'
import preact from '@preact/preset-vite'

// מדיניות אבטחה בתוך הדף עצמו, כך שהיא תקפה בכל אחסון סטטי: שום דבר לא נטען ולא נשלח מחוץ לאתר
const CSP =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self' blob:"

const csp = (): Plugin => ({
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
})

export default defineConfig({
  base: './',
  plugins: [preact(), csp()],
  build: {
    rollupOptions: {
      // האפליקציה, ודף שמסביר עליה
      input: { main: 'index.html', about: 'about.html' },
    },
  },
})
