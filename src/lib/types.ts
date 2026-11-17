export type DeclType = 'aid' | 'tashmash'

/** תנועה אחת בעו"ש. amount חיובי = הפקדה (זכות), שלילי = משיכה (חובה). */
export interface Tx {
  id: number
  date: string // yyyy-mm-dd
  desc: string
  ref?: string
  amount: number
  balance?: number
}

export interface Account {
  bank?: string
  branch?: string
  number?: string
}

export interface ParseIssue {
  row: number // מספר שורה בקובץ (1-based) או אינדקס תנועה
  msg: string
}

export interface ParseReport {
  /** verified = כל היתרות מתאזנות; unverified = אין עמודת יתרה; failed = נמצאו אי התאמות */
  status: 'verified' | 'unverified' | 'failed'
  count: number
  from?: string
  to?: string
  opening?: number
  closing?: number
  issues: ParseIssue[]
  inferredSigns: number
}

export interface ParseResult {
  txs: Tx[]
  account: Account
  report: ParseReport
}

export interface Override {
  include?: boolean
  fixed?: boolean
}

/** שורה נעולה כפי שנשלחה לחייל */
export interface LockedRow {
  i: number // tx id
  d: string // date
  a: number // signed amount
  s: string // תיאור מהבנק
  k?: 'f' | 'o' // קבועה / חד פעמית (תשמ"ש)
}

export interface Person {
  name?: string
  idNum?: string // ת"ז (תשמ"ש)
  personalNum?: string // מ.א
  marital?: string
  soldierName?: string // תשמ"ש: שם החייל
  soldierNum?: string // תשמ"ש: מ.א של החייל
  acct?: Account
  acct2?: Account
}

export interface Answer {
  exp: string
  dispute?: boolean
  note?: string
}

export interface Declaration {
  id: string
  type: DeclType
  label: string
  createdAt: number
  updatedAt: number
  status: 'draft' | 'sent' | 'returned' | 'done'
  fileName: string
  fileHash: string
  report: ParseReport
  account: Account
  txs: Tx[]
  overrides: Record<number, Override>
  /** למי נשלח הקישור: לחייל או לבעל החשבון */
  recipient: 'soldier' | 'owner'
  round: number
  sent?: { rows: LockedRow[]; hash: string; at: number }
  person?: Person
  answers: Record<number, Answer>
  /** הערות המשק לשורות שהוחזרו לתיקון */
  fixNotes: Record<number, string>
}

/** מה שנשלח לחייל בקישור */
export interface SendPayload {
  v: 1
  id: string
  t: DeclType
  r: number
  w: 'soldier' | 'owner'
  rows: LockedRow[]
  h: string
  acct: Account
  person?: Person
  ans?: Record<number, Answer>
  fix?: Record<number, string>
}

/** מה שחוזר מהחייל */
export interface ReturnPayload {
  v: 1
  id: string
  r: number
  h: string
  p: Person
  ans: Record<number, Answer>
}
