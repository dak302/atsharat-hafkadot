/** מספר עם שם עצם בעברית: "שורה אחת" / "3 שורות" */
export function count(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`
}

/** קיצור תיאור במקום רווח, עם שלוש נקודות, במקום חיתוך באמצע מילה */
export function shorten(s: string, max = 90): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + '…'
}
