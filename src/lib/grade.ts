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
  if (kind === 'lesson') {
    const nv = normText(value)
    const acc = ((a.accept ?? []) as string[]).map(normText)
    return { correct: acc.includes(nv) || nv === normText(a.text ?? ''), expected: [`Lesson ${a.lesson} · ${a.text}`], wrote: [value] }
  }
  const exp = a.norm ?? normText(a.text ?? '')
  return { correct: normText(value) === exp, expected: [a.text ?? ''], wrote: [value] }
}
