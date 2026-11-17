/**
 * זיהוי מקור קובץ העו"ש לפי פורמטים מוכרים של הבנקים.
 * כל פורמט מוגדר לפי שורת הכותרות של הטבלה והתוכנה שהבנק משתמש בה כדי ליצור את הקובץ.
 * הפורמטים מוטמעים באפליקציה (נלמדו מקבצים אמיתיים). שום דבר לא נשמר במכשיר של המשק.
 */
export interface Fingerprint {
  kind: 'pdf' | 'sheet'
  producer?: string
  creator?: string
  header: string
}

interface Profile {
  bank: string
  kind: Fingerprint['kind']
  header: string
  /** התוכנה שיוצרת את הקובץ אצל הבנק (Producer או Creator) */
  makers: RegExp[]
}

/** פורמטים שנבדקו על קבצים אמיתיים */
const PROFILES: Profile[] = [
  {
    bank: 'הפועלים',
    kind: 'pdf',
    header: 'תאריך|הפעולה|חובה|זכות|יתרה בש"ח',
    makers: [/skia\/pdf/i, /chrome/i],
  },
  {
    bank: 'דיסקונט / מרכנתיל',
    kind: 'pdf',
    header: 'תאריך|יום ערך|תיאור התנועה|אסמכתה|זכות/חובה ₪|יתרה ₪',
    makers: [/freeform/i],
  },
  {
    bank: 'הבינלאומי / פאג"י',
    kind: 'pdf',
    header: 'תאריך|תיאור|זכות|חובה|יתרה|אסמכתא|סו"פ|תאריך ערך',
    makers: [/winnovative/i],
  },
]

export type FpCheck =
  | { status: 'match'; bank: string }
  | { status: 'mismatch'; bank: string; maker: string }
  | { status: 'unknown' }

const normHeader = (h: string) => h.replace(/[\s₪"״'׳]/g, '')

export function checkFp(fp: Fingerprint): FpCheck {
  const p = PROFILES.find((x) => x.kind === fp.kind && normHeader(x.header) === normHeader(fp.header))
  if (!p) return { status: 'unknown' }
  const maker = `${fp.producer ?? ''} ${fp.creator ?? ''}`.trim()
  if (p.makers.some((re) => re.test(maker))) return { status: 'match', bank: p.bank }
  return { status: 'mismatch', bank: p.bank, maker: maker || 'לא ידוע' }
}
