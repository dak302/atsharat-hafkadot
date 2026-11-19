import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// בדיקות שמוודאות שכללי DESIGN.md לא נשברים בטעות
const css = readFileSync(join(__dirname, '../src/styles.css'), 'utf8')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

describe('DESIGN.md', () => {
  it('תמיד ערכה בהירה', () => {
    expect(css).not.toMatch(/prefers-color-scheme:\s*dark/)
  })
  it('בלי גרדיאנטים', () => {
    expect(css).not.toMatch(/gradient\(/)
  })
  it('בלי כפתורי הסברים מוכנים במסך החייל', () => {
    const soldier = readFileSync(join(__dirname, '../src/screens/Soldier.tsx'), 'utf8')
    expect(soldier).not.toMatch(/CHIPS|class="chip/)
  })
  it('שום שורה לא נבחרת אוטומטית', () => {
    const rules = readFileSync(join(__dirname, '../src/lib/rules.ts'), 'utf8')
    expect(rules).toMatch(/include: (overrides\[tx\.id\]|o)\?\.include \?\? false/)
  })
  it('בלי אימוג\'י בממשק', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
    for (const f of files(join(__dirname, '../src')).filter((f) => /\.(tsx?|css)$/.test(f))) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(emoji)
    }
  })
})
