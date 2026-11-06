// Grading parity with rhemlo.normalize (competition marking): capitals and punctuation ignored,
// hyphens joining letters/digits count, digit:digit colons are kept, whitespace collapses, NFC first.
import type { Item, Response } from './types'

const DASHES = new Set(['-', '‐', '‑', '‒', '–', '—', '−'])
const ALNUM = /[\p{L}\p{N}]/u
const SPACE = /\s/u
const isDigit = (c: string) => /\p{Nd}/u.test(c)

export function normText(input: string): string {
  const s = input.normalize('NFC').toLowerCase()
  const chars = Array.from(s)
  let out = ''
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    const prev = i > 0 ? chars[i - 1] : ''
    const next = i + 1 < chars.length ? chars[i + 1] : ''
    if (ALNUM.test(ch) || SPACE.test(ch)) out += ch
    else if (DASHES.has(ch)) out += prev && ALNUM.test(prev) && next && ALNUM.test(next) ? '-' : ' '
    else if (ch === ':') out += prev && isDigit(prev) && next && isDigit(next) ? ':' : ' '
    // any other punctuation (quotes, apostrophes, commas ...) vanishes
  }
  return out.split(/\s+/u).filter(Boolean).join(' ')
}
export const normWords = (s: string) => { const t = normText(s); return t ? t.split(' ') : [] }

// ---- Bible references (port of rhemlo.books / rhemlo.refs) -------------------------------------
const BOOKS: [string, string[]][] = [
  ['Genesis', ['Gen']], ['Exodus', ['Exod', 'Ex']], ['Leviticus', ['Lev']], ['Numbers', ['Num']], ['Deuteronomy', ['Deut']],
  ['Joshua', ['Josh']], ['Judges', ['Judg']], ['Ruth', []], ['1 Samuel', ['1 Sam']], ['2 Samuel', ['2 Sam']],
  ['1 Kings', ['1 Kgs']], ['2 Kings', ['2 Kgs']], ['1 Chronicles', ['1 Chr', '1 Chron']], ['2 Chronicles', ['2 Chr', '2 Chron']],
  ['Ezra', []], ['Nehemiah', ['Neh']], ['Esther', ['Esth']], ['Job', []], ['Psalm', ['Psalms', 'Ps', 'Psa']],
  ['Proverbs', ['Prov', 'Pro']], ['Ecclesiastes', ['Eccl', 'Ecc', 'Eccles']], ['Song of Solomon', ['Song of Songs']],
  ['Isaiah', ['Isa']], ['Jeremiah', ['Jer']], ['Lamentations', ['Lam']], ['Ezekiel', ['Ezek']], ['Daniel', ['Dan']],
  ['Hosea', ['Hos']], ['Joel', []], ['Amos', []], ['Obadiah', ['Obad']], ['Jonah', []], ['Micah', ['Mic']], ['Nahum', ['Nah']],
  ['Habakkuk', ['Hab']], ['Zephaniah', ['Zeph']], ['Haggai', ['Hag']], ['Zechariah', ['Zech']], ['Malachi', ['Mal']],
  ['Matthew', ['Matt', 'Mt']], ['Mark', ['Mk']], ['Luke', ['Lk']], ['John', ['Jn']], ['Acts', []], ['Romans', ['Rom']],
  ['1 Corinthians', ['1 Cor']], ['2 Corinthians', ['2 Cor']], ['Galatians', ['Gal']], ['Ephesians', ['Eph']],
  ['Philippians', ['Phil']], ['Colossians', ['Col']], ['1 Thessalonians', ['1 Thess']], ['2 Thessalonians', ['2 Thess']],
  ['1 Timothy', ['1 Tim']], ['2 Timothy', ['2 Tim']], ['Titus', []], ['Philemon', ['Phlm']], ['Hebrews', ['Heb']],
  ['James', ['Jas']], ['1 Peter', ['1 Pet']], ['2 Peter', ['2 Pet']], ['1 John', []], ['2 John', []], ['3 John', []],
  ['Jude', []], ['Revelation', ['Rev']],
]
const VARIANTS = new Map<string, string>() // lower-case printed form -> canonical name
for (const [name, alts] of BOOKS) for (const form of [name, ...alts]) {
  VARIANTS.set(form.toLowerCase(), name)
  if (/^\d/.test(form)) VARIANTS.set(form.replace(' ', '').toLowerCase(), name)
}
const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const bookAlt = [...VARIANTS.keys()].sort((a, b) => b.length - a.length).map(esc).join('|')
const SPAN = String.raw`(\d+)(?:\s*:\s*(\d+)([ab])?)?(?:\s*[-–]\s*(\d+)(?:\s*:\s*(\d+))?([ab])?)?`
const CONT = String.raw`(?:\s*[;,]\s*|\s+and\s+(?=\d+\s*:))(?!\s)\d+(?:\s*:\s*\d+)?[ab]?(?:\s*[-–]\s*\d+(?::\d+)?[ab]?)?(?![\w])(?!\s+(?!and)[a-z])`
const REF_RE = new RegExp(String.raw`(?<![a-z])(${bookAlt})\.?\s*(${SPAN})((?:${CONT})*)(?![\w:])`, 'g')
const SEG_RE = new RegExp(String.raw`(^|[;,]|\s+and\s+)\s*${SPAN}`, 'g')
interface Seg { c1: number; v1: number | null; p1: string | null; c2: number | null; v2: number | null; p2: string | null }
function segment(g: string[], sep: string, prev: Seg | null): Seg {
  const [, , c1s, v1s, p1, e1, e2, p2] = g
  const c1 = +c1s
  let seg: Seg = { c1, v1: v1s ? +v1s : null, p1: p1 || null, c2: null, v2: null, p2: p2 || null }
  if (sep === ',' && !v1s && prev && prev.v1 !== null) {
    seg = { c1: prev.c2 ?? prev.c1, v1: c1, p1: p1 || null, c2: null, v2: null, p2: p2 || null }
    if (e1) seg.v2 = +e1
    return seg
  }
  if (e1) {
    if (e2) { seg.c2 = +e1; seg.v2 = +e2 } else if (seg.v1 !== null) seg.v2 = +e1; else seg.c2 = +e1
  }
  return seg
}
const segText = (s: Seg) => {
  let t = `${s.c1}`
  if (s.v1 !== null) t += `:${s.v1}${s.p1 ?? ''}`
  if (s.c2 !== null && s.v2 !== null) t += `-${s.c2}:${s.v2}${s.p2 ?? ''}`
  else if (s.v2 !== null) t += `-${s.v2}${s.p2 ?? ''}`
  else if (s.c2 !== null) t += `-${s.c2}`
  return t
}
/** Canonical keys of the references in a typed answer ("col 1:17" -> ["Colossians 1:17"]). Capitals never matter. */
export function typedRefs(text: string): string[] {
  const out: string[] = []
  for (const m of text.toLowerCase().matchAll(REF_RE)) {
    const name = VARIANTS.get(m[1])!
    const body = (m[2] ?? '') + (m[m.length - 1] ?? '')
    const segs: Seg[] = []; let prev: Seg | null = null
    for (const sm of body.matchAll(SEG_RE)) {
      const seg = segment(sm as unknown as string[], (sm[1] ?? '').trim(), prev); segs.push(seg); prev = seg
    }
    out.push(`${name} ${segs.map(segText).join('; ')}`)
  }
  return out
}

// ---- Marking ------------------------------------------------------------------------------------
export interface Grade { correct: boolean; parts?: boolean[]; expected: string[]; wrote: string[]; note?: string }
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000')

/** Edit-distance-1 style diff for the feedback banner: returns the first differing character pair, if any. */
export function charDiff(wrote: string, expected: string): { wrote: string; expected: string; extra?: string; missing?: string } {
  return { wrote, expected }
}

export function gradeItem(item: Item, r: Response): Grade {
  const a = item.a, kind = item.p.input?.kind
  if (r.kind === 'choice') {
    const correct = normText(r.value) === normText(a.text ?? '')
    return { correct, expected: [a.text ?? ''], wrote: [r.value] }
  }
  if (r.kind === 'multi') {
    const exp = (a.items ?? []) as string[], got = r.values
    const parts = got.map(v => exp.some(e => normText(e) === normText(v)))
    return { correct: got.length === exp.length && parts.every(Boolean), parts, expected: exp, wrote: got }
  }
  if (r.kind === 'order') {
    const exp = (a.items ?? []) as string[]
    const parts = exp.map((e, i) => normText(e) === normText(r.values[i] ?? ''))
    return { correct: parts.every(Boolean) && r.values.length === exp.length, parts, expected: exp, wrote: r.values }
  }
  if (r.kind === 'bank') {
    const exp = (a.words ?? normWords(a.text ?? '')) as string[]
    const wrote = r.values
    const ok = normText(wrote.join(' ')) === (a.norm ?? normText(a.text ?? ''))
    return { correct: ok, expected: [exp.join(' ')], wrote: [wrote.join(' ')] }
  }
  if (r.kind === 'fields') {
    const exp = (a.items ?? []) as string[]
    const ordered = a.ordered !== false
    if (ordered) {
      const parts = exp.map((e, i) => normText(e) === normText(r.values[i] ?? ''))
      return { correct: parts.every(Boolean), parts, expected: exp, wrote: r.values }
    }
    const left = exp.map(normText); const parts = r.values.map(v => { const k = left.indexOf(normText(v)); if (k >= 0) { left.splice(k, 1); return true } return false })
    return { correct: parts.length === exp.length && parts.every(Boolean), parts, expected: exp, wrote: r.values }
  }
  // single text
  const value = r.value
  if (kind === 'reference') {
    const exp = ((a.refs ?? []) as { key: string }[]).map(x => x.key)
    return { correct: sameSet(typedRefs(value), exp), expected: exp.length ? exp : [a.text ?? ''], wrote: [value] }
  }
  if (kind === 'number') {
    const n = (value.match(/\d+/) ?? [''])[0]
    return { correct: n === String(a.text), expected: [`Lesson ${a.text}`], wrote: [value] }
  }
  if (kind === 'lesson') {
    const nv = normText(value)
    const acc = ((a.accept ?? []) as string[]).map(normText)
    return { correct: acc.includes(nv) || nv === normText(a.text ?? ''), expected: [`Lesson ${a.lesson} · ${a.text}`], wrote: [value] }
  }
  const exp = a.norm ?? normText(a.text ?? '')
  return { correct: normText(value) === exp, expected: [a.text ?? ''], wrote: [value] }
}

// ---- Error analysis (FR-GR-04/05/07, FR-AD-04) --------------------------------------------------
export type DiffOp = { op: 'same' | 'missing' | 'extra' | 'wrong'; w: string; e?: string }
/** Word-level diff on normalised words (LCS), pairing adjacent missing+extra as "wrong". */
export function wordDiff(wrote: string, expected: string): { ops: DiffOp[]; exact: number } {
  const a = normWords(wrote), b = normWords(expected), n = a.length, m = b.length
  const L = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const raw: DiffOp[] = []; let i = 0, j = 0
  while (i < n && j < m) { if (a[i] === b[j]) { raw.push({ op: 'same', w: b[j] }); i++; j++ } else if (L[i + 1][j] >= L[i][j + 1]) raw.push({ op: 'extra', w: a[i++] }); else raw.push({ op: 'missing', w: b[j++] }) }
  while (i < n) raw.push({ op: 'extra', w: a[i++] }); while (j < m) raw.push({ op: 'missing', w: b[j++] })
  const ops: DiffOp[] = []
  for (let k = 0; k < raw.length; k++) {
    const x = raw[k], y = raw[k + 1]
    if (y && ((x.op === 'extra' && y.op === 'missing') || (x.op === 'missing' && y.op === 'extra'))) { ops.push({ op: 'wrong', w: x.op === 'extra' ? x.w : y.w, e: x.op === 'missing' ? x.w : y.w }); k++ } else ops.push(x)
  }
  return { ops, exact: m ? ops.filter(o => o.op === 'same').length / m : 0 }
}
const lev = (a: string, b: string) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length] }
export type ErrorKind = 'spelling' | 'hyphenation' | 'wrong word' | 'omission' | 'insertion' | 'order' | 'name' | 'reference number' | 'wrong lesson' | 'wrong choice'
/** Classify a wrong answer and say how close it was, in plain words. A spelling error is still wrong. */
export function classify(wrote: string, expected: string, kind?: string, rawExpected?: string): { kind: ErrorKind; note: string } {
  if (kind === 'reference') {
    const w = typedRefs(wrote).join('; '), e = expected
    if (w && w.split(' ').slice(0, -1).join(' ') === e.split(' ').slice(0, -1).join(' ')) return { kind: 'reference number', note: 'Right book, wrong chapter or verse number.' }
    return { kind: 'reference number', note: w ? 'A different reference.' : 'That could not be read as a reference.' }
  }
  if (kind === 'lesson' || kind === 'number') return { kind: 'wrong lesson', note: 'A different lesson.' }
  if (kind === 'choice') return { kind: 'wrong choice', note: '' }
  const A = normText(wrote), B = normText(expected)
  if (A.replace(/-/g, ' ') === B.replace(/-/g, ' ') || A.replace(/-/g, '') === B.replace(/-/g, '')) return { kind: 'hyphenation', note: 'Only a hyphen differs. Hyphens count.' }
  const aw = normWords(wrote), bw = normWords(expected)
  if (aw.length === bw.length && [...aw].sort().join(' ') === [...bw].sort().join(' ')) return { kind: 'order', note: 'Right words, wrong order.' }
  const { ops } = wordDiff(wrote, expected)
  const wrong = ops.filter(o => o.op === 'wrong'), miss = ops.filter(o => o.op === 'missing'), extra = ops.filter(o => o.op === 'extra')
  if (wrong.length === 1 && !miss.length && !extra.length) {
    const d = lev(wrong[0].w, wrong[0].e!), isName = new RegExp(`\b${wrong[0].e![0].toUpperCase()}${wrong[0].e!.slice(1)}\b`).test(rawExpected ?? '')
    if (d <= 2) return { kind: isName ? 'name' : 'spelling', note: d === 1 ? 'One letter off. Spelling counts.' : 'Two letters off. Spelling counts.' }
    return { kind: 'wrong word', note: `One word differs: “${wrong[0].w}” for “${wrong[0].e}”.` }
  }
  if (!wrong.length && miss.length && !extra.length) return { kind: 'omission', note: `${miss.length} word${miss.length === 1 ? '' : 's'} missing.` }
  if (!wrong.length && !miss.length && extra.length) return { kind: 'insertion', note: `${extra.length} extra word${extra.length === 1 ? '' : 's'}.` }
  return { kind: 'wrong word', note: `${wrong.length + miss.length} word${wrong.length + miss.length === 1 ? '' : 's'} differ from the manual.` }
}
