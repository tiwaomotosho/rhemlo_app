// Question styles generated in the app from the verified content (manual.json, lesson text and the
// lesson's own items). Every answer comes from the printed manual; distractors come from the manual
// too (PRD 9.4): neighbouring lessons, sibling outline points and list items, swapped order, and
// look-alike spellings of the printed word.
import { normText, typedRefs } from './grade'
import type { Item, Lesson, Manual } from './types'

const h = (s: string) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) } return x >>> 0 }
const pickN = <T,>(a: T[], n: number, seed: string) => [...a].sort((x, y) => h(seed + JSON.stringify(x)) - h(seed + JSON.stringify(y))).slice(0, n)
const uniq = (a: string[]) => a.filter((x, i) => a.findIndex(y => normText(y) === normText(x)) === i)
const strip = (s: string) => s.replace(/\s*\([^()]*\d+\s*:\s*\d+[^()]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim().replace(/[.;:,]$/, '')
const title = (t: string) => t // printed (upper-case) title; options are shown in title case by the UI

/** Look-alike spellings: doubled or dropped letters, swapped neighbours, common ending swaps. */
export function misspell(word: string, seed: string, n = 3): string[] {
  const out = new Set<string>(); const w = word
  const tries: ((s: string, i: number) => string)[] = [
    (s, i) => s.slice(0, i) + s[i] + s.slice(i), // double a letter
    (s, i) => s.slice(0, i) + s.slice(i + 1), // drop a letter
    (s, i) => i < s.length - 1 ? s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2) : s, // swap neighbours
    s => s.replace(/our\b/, 'or').replace(/ise\b/, 'ize').replace(/ll/, 'l'), // British/American look-alikes
    s => s.replace(/ie/, 'ei').replace(/ei/, 'ie'),
  ]
  for (let k = 0; out.size < n && k < 60; k++) {
    const f = tries[h(seed + k) % tries.length], i = 1 + (h(seed + 'i' + k) % Math.max(1, w.length - 2))
    const v = f(w, i); if (v && v !== w && normText(v) !== normText(w) && /\p{L}/u.test(v)) out.add(v)
  }
  return [...out]
}

export function extraItems(m: Manual, l: Lesson, items: Item[]): Item[] {
  const out: Item[] = []; const code = m.code, meta = m.lessons.find(x => x.id === l.id); if (!meta) return out
  const quarter = Object.values(m.groups).find(r => meta.n >= r[0] && meta.n <= r[1]) ?? [1, 99]
  const near = m.lessons.filter(x => x.id !== l.id && x.n >= quarter[0] && x.n <= quarter[1])
  const others = near.length >= 3 ? near : m.lessons.filter(x => x.id !== l.id)
  const ctx = `Lesson ${meta.n} · ${meta.title}`
  const mk = (t: string, k: string, p: Item['p'], a: Item['a'], d: string[], f: Item['f'], s: string): Item => ({ u: `X-${code}-${l.id}-${t}-${k}`, t, f, p, a, d, g: ['tier:2'], s, tg: s })

  // Q29 lesson number → title (typed or choose)
  const titleD = pickN(others.map(x => x.title), 3, l.id + 'q29')
  out.push(mk('Q29', 'a', { instruction: `What is the topic of Lesson ${meta.n}?`, lesson: meta.n, input: { kind: 'text', note: 'Spelling and hyphens count. Capitals and punctuation do not.' } },
    { text: title(meta.title), norm: normText(meta.title) }, titleD, ['typed', 'mcq'], `${code}:${l.id}.TITLE`))
  // Q30 title → lesson number
  const numD = pickN(others.map(x => String(x.n)), 3, l.id + 'q30')
  out.push(mk('Q30', 'a', { instruction: `“${title(meta.title)}” is the topic of which lesson? Give the lesson number.`, title: meta.title, input: { kind: 'number', note: 'Type the number, for example 12.' } },
    { text: String(meta.n), norm: String(meta.n), lesson: meta.n }, numD, ['typed', 'mcq'], `${code}:${l.id}.TITLE`))
  // Q31 one numbered outline point → which lesson
  meta.outline.forEach((pt, i) => {
    const d = pickN(others.map(x => x.title), 3, l.id + 'q31' + i)
    out.push(mk('Q31', String(i + 1), { instruction: `“${pt}” is outline point ${i + 1} of which lesson?`, input: { kind: 'lesson' } },
      { text: meta.title, lesson: meta.n, accept: [String(meta.n), `lesson ${meta.n}`] }, d, ['typed', 'mcq'], `${code}:${l.id}.OUT`))
  })
  // Q36 outline order (order-swap trap and sibling outlines)
  if (meta.outline.length >= 2) {
    const right = meta.outline.join(' → '), swapped = [...meta.outline].reverse().join(' → ')
    const alien = pickN(others.filter(x => x.outline.length >= 2), 2, l.id + 'q36').map(x => x.outline.join(' → '))
    out.push(mk('Q36', 'a', { instruction: `Which shows the outline of Lesson ${meta.n} in the printed order?`, title: meta.title, lesson: meta.n, input: { kind: 'choice' } },
      { text: right, norm: normText(right), trap: 'order_swap' }, uniq([swapped, ...alien]).filter(x => normText(x) !== normText(right)).slice(0, 3), ['mcq'], `${code}:${l.id}.OUT`))
  }
  // Q32 two references, "respectively"
  const q11 = items.filter(i => i.t === 'Q11' && i.p.ref && i.a.text && i.a.text.length <= 110)
  const seen = new Set<string>(); const pairs: [Item, Item][] = []
  for (let i = 0; i < q11.length && pairs.length < 3; i++) for (let j = i + 1; j < q11.length && pairs.length < 3; j++) {
    const A = q11[i], B = q11[j]; if (A.p.ref === B.p.ref || normText(A.a.text!) === normText(B.a.text!) || seen.has(A.u) || seen.has(B.u)) continue
    seen.add(A.u); seen.add(B.u); pairs.push([A, B])
  }
  pairs.forEach(([A, B], k) => {
    const a = strip(A.a.text!), b = strip(B.a.text!), pool = q11.filter(x => x !== A && x !== B).map(x => strip(x.a.text!))
    const right = `${a}; ${b}`, d = uniq([`${b}; ${a}`, `${a}; ${pool[k % Math.max(1, pool.length)] ?? b}`, `${pool[(k + 1) % Math.max(1, pool.length)] ?? a}; ${b}`]).filter(x => normText(x) !== normText(right))
    out.push(mk('Q32', String(k), { instruction: `In Lesson ${meta.n}, what do ${A.p.ref} and ${B.p.ref} support, respectively?`, context: ctx, input: { kind: 'choice' } },
      { text: right, norm: normText(right), trap: 'order_swap' }, d.slice(0, 3), ['mcq'], A.s))
  })
  // Q33 choose the printed spelling (names and words the manual spells its own way)
  const spell = items.filter(i => (i.t === 'Q17' || i.t === 'Q26') && i.a.text && /^\p{L}[\p{L}'’-]{3,}$/u.test(i.a.text)).slice(0, 6)
  spell.forEach((i, k) => {
    const w = i.a.text!, d = misspell(w, i.u)
    if (d.length < 2) return
    const text = i.t === 'Q17' ? i.p.text : i.p.text?.replace(i.a.wrong ?? '\u0000', '____')
    out.push(mk('Q33', String(k), { instruction: 'Choose the spelling printed in the manual.', text, context: i.p.context, input: { kind: 'choice' } },
      { text: w, norm: normText(w), trap: 'look_alike' }, d, ['mcq'], i.s))
  })
  // Q34 reference → which item of a list (the list's other items are the options)
  l.sections.forEach(sec => sec.b.forEach((b, bi) => {
    if (b.t !== 'l' || !b.i || b.i.length < 3) return
    b.i.forEach((it, ii) => {
      const refs = typedRefs(it); if (!refs.length) return
      const right = strip(it); if (right.length > 140 || !right) return
      const d = uniq(b.i!.filter((_, j) => j !== ii).map(strip)).filter(x => x && normText(x) !== normText(right))
      if (d.length < 2) return
      out.push(mk('Q34', `${bi}-${ii}`, { instruction: `In Lesson ${meta.n}, which point under “${sec.h || 'this section'}” does ${refs[0]} support?`, ref: refs[0], context: `${ctx} · ${sec.h}`, input: { kind: 'choice' } },
        { text: right, norm: normText(right) }, pickN(d, 3, it), ['mcq'], `${code}:${l.id}.LIST.${bi}.${ii}`))
    })
  }))
  // Q37 select all that apply: sentences with several references (FR-MC-04)
  const lessonRefs = uniq(items.flatMap(i => i.a.refs?.map(r => r.key) ?? []))
  items.filter(i => i.t === 'Q12' && (i.a.refs?.length ?? 0) >= 2).slice(0, 4).forEach((i, k) => {
    const right = i.a.refs!.map(r => r.key), wrong = pickN(uniq([...i.d, ...lessonRefs]).filter(x => !right.some(r => normText(r) === normText(x))), 3, i.u)
    if (wrong.length < 2) return
    out.push(mk('Q37', String(k), { instruction: 'Select every reference that supports this. More than one is right.', text: i.p.text, context: i.p.context, input: { kind: 'multi', count: right.length } },
      { items: right, ordered: false, text: right.join('; ') }, wrong, ['mcq'], i.s))
  })
  return out
}
