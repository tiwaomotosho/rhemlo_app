import { loadItems, loadManual } from './data'
import type { Card, Item, Manual } from './types'
import { day, type Ladder, type SessionSpec } from './store'

export const FOCUS: Record<string, { label: string; types: string[] }> = {
  verses: { label: 'Memory verses', types: ['Q04', 'Q06', 'Q27', 'Q28', 'Q05', 'Q09'] },
  outlines: { label: 'Outlines', types: ['Q07', 'Q08', 'Q13', 'Q14'] },
  references: { label: 'References', types: ['Q05', 'Q09', 'Q10', 'Q11', 'Q12', 'Q16', 'Q23'] },
  sentences: { label: 'Key sentences', types: ['Q01', 'Q02', 'Q03', 'Q15', 'Q22', 'Q25'] },
  spelling: { label: 'Spelling traps', types: ['Q26', 'Q06', 'Q01'] },
  listening: { label: 'Listening', types: ['Q24'] },
}
export const KIND_LABEL: Record<string, string> = {
  Q01: 'Missing word', Q02: 'Missing words', Q03: 'Sequence', Q04: 'Full verse', Q05: 'Reference recall', Q06: 'Verse missing word',
  Q07: 'Outline', Q08: 'Which lesson by outline', Q09: 'Verse reference', Q10: 'Verse of which lesson', Q11: 'What it supports',
  Q12: 'Reference support', Q13: 'List recall', Q14: 'Next in list', Q15: 'Which lesson', Q16: 'Cross-lesson', Q22: 'First letters',
  Q23: 'Which is the verse', Q24: 'Listening', Q25: 'Sentence order', Q26: 'Spot the error', Q27: 'Build the verse', Q28: 'Fade',
}
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
export const shuffleSeed = <T,>(a: T[], seed: string) => { const r = [...a]; let h = hash(seed); for (let i = r.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const j = h % (i + 1);[r[i], r[j]] = [r[j], r[i]] } return r }
export const lessonOfKey = (s: string) => s.match(/:(L\d+)/)?.[1] ?? ''

const tier = (it: Item) => (it.g[0] === 'tier:2' ? 2 : it.g[0] === 'tier:3' ? 3 : 1)
const LADDER_TYPES = new Set(['Q27', 'Q28', 'Q04'])

/** Items eligible for a spec, with the honest pool size. */
export async function buildSession(spec: SessionSpec, cards: Record<string, Card>, ladder: Record<string, Ladder>): Promise<{ items: Item[]; pool: number }> {
  const types = spec.focus?.length ? new Set(spec.focus.flatMap(f => FOCUS[f]?.types ?? [])) : null
  const lessons = spec.lessons
  const lists = await Promise.all(lessons.map(l => loadItems(spec.manual, l)))
  // Q04 (full verse) is only served once Q27 (build) and Q28 (fade) are right for that lesson
  const rungOpen = (i: Item) => { const l = ladder[`${spec.manual}|${lessonOfKey(i.s)}`]; return !!(l?.q27 && l?.q28) }
  const allowed = (i: Item) => (types ? types.has(i.t) : !LADDER_TYPES.has(i.t)) && (i.t !== 'Q04' || rungOpen(i))
  let pool = lists.flat().filter(allowed)
  if (spec.only) { const keep = new Set(spec.only); const its = lists.flat().filter(i => keep.has(i.u)); return { items: its, pool: its.length } }
  const now = Date.now(), seed = spec.kind === 'daily' ? `daily${day()}` : `${spec.kind}${now >> 16}`
  if (spec.kind === 'ladder') {
    const l = lessons[0]; const lad = ladder[`${spec.manual}|${l}`] ?? {}
    const pick = (t: string) => lists[0].filter(i => i.t === t)
    const q = [...pick('Q27').slice(0, 1), ...pick('Q28').slice(0, 1)]
    if (lad.q27 && lad.q28) q.push(...pick('Q04').slice(0, 1))
    return { items: q.length ? q : pick('Q27').slice(0, 1), pool: q.length }
  }
  const byCard = new Map<string, Item[]>()
  for (const it of pool) { const k = it.s; if (!byCard.has(k)) byCard.set(k, []); byCard.get(k)!.push(it) }
  // score each card: due (seen & overdue) first, then new, then not yet due; never more than one item per card
  const cardsArr = [...byCard.entries()].map(([k, its]) => {
    const c = cards[`${spec.manual}|${k}`]; const dueNow = c && c.seen > 0 && c.due <= now
    const score = spec.kind === 'review' ? (dueNow ? 0 : 9) : spec.kind === 'restart' ? (c && c.seen ? 5 - c.box : 9) : dueNow ? 0 : !c || c.seen === 0 ? 1 : 2
    return { k, its, score, jitter: hash(k + seed) }
  })
  if (spec.kind === 'restart') cardsArr.splice(0, cardsArr.length, ...cardsArr.filter(c => c.score < 9))
  if (spec.kind === 'review') { const due = cardsArr.filter(c => c.score === 0); pool = due.flatMap(c => c.its) }
  cardsArr.sort((a, b) => a.score - b.score || a.jitter - b.jitter)
  const eligible = spec.kind === 'review' ? cardsArr.filter(c => c.score === 0) : cardsArr
  const chosen: Item[] = []
  // round-robin by type so a sitting is varied, easier tiers first inside each type
  const queues = new Map<string, Item[]>()
  for (const c of eligible) {
    const pick = [...c.its].sort((a, b) => tier(a) - tier(b) || hash(a.u + seed) - hash(b.u + seed))[0]
    if (!queues.has(pick.t)) queues.set(pick.t, []); queues.get(pick.t)!.push(pick)
  }
  const order = shuffleSeed([...queues.keys()], seed)
  while (chosen.length < spec.count && [...queues.values()].some(q => q.length)) {
    for (const t of order) { const q = queues.get(t)!; if (q.length && chosen.length < spec.count) { chosen.push(q.shift()!) } }
  }
  chosen.sort((a, b) => tier(a) - tier(b))
  if (spec.kind === 'quest' && spec.lessons.length === 1) {
    const lad = ladder[`${spec.manual}|${spec.lessons[0]}`] ?? {}
    const rung = !lad.q27 ? 'Q27' : !lad.q28 ? 'Q28' : !lad.q04 ? 'Q04' : null
    const add = rung ? lists[0].find(i => i.t === rung) : null
    if (add && chosen.length >= 3) { if (chosen.length >= spec.count) chosen.pop(); chosen.push(add) }
  }
  return { items: chosen, pool: pool.length }
}

export function readinessGap(manual: Manual, stageLessons: [number, number], cards: Record<string, Card>) {
  let secure = 0, total = 0
  for (const l of manual.lessons) if (l.n >= stageLessons[0] && l.n <= stageLessons[1]) {
    total += l.cc
    for (const k in cards) if (k.startsWith(`${manual.code}|${manual.code}:${l.id}.`) && cards[k].box >= 4) secure++
  }
  return { secure, total, readiness: total ? secure / total : 0, gap: Math.max(0, 0.95 - (total ? secure / total : 0)) }
}
export const daysUntil = (iso: string) => Math.ceil((new Date(iso + 'T23:59:59').getTime() - Date.now()) / 86400000)
export { loadManual }

/** Cards due now: count, and the lessons they belong to (lowest first). */
export function dueInfo(cards: Record<string, Card>, code: string) {
  const now = Date.now(), per: Record<string, number> = {}; let count = 0
  for (const k in cards) if (k.startsWith(code + '|') && cards[k].seen > 0 && cards[k].due <= now) { count++; const l = lessonOfKey(k); per[l] = (per[l] ?? 0) + 1 }
  const lessons = Object.keys(per).sort()
  const nums = lessons.map(l => +l.slice(1))
  return { count, lessons, range: nums.length ? (nums[0] === nums[nums.length - 1] ? `Lesson ${nums[0]}` : `Lessons ${nums[0]}–${nums[nums.length - 1]}`) : '', minutes: Math.max(2, Math.round(Math.min(count, 20) * 0.4)) }
}
/** Lessons where this learner's answers are least often right (needs enough attempts to mean anything). */
export function weakAreas(cards: Record<string, Card>, code: string, minSeen = 5) {
  const per: Record<string, { seen: number; right: number }> = {}
  for (const k in cards) if (k.startsWith(code + '|')) { const l = lessonOfKey(k), c = cards[k]; const e = (per[l] ??= { seen: 0, right: 0 }); e.seen += c.seen; e.right += c.right }
  return Object.entries(per).filter(([, v]) => v.seen >= minSeen).map(([l, v]) => ({ lesson: l, n: +l.slice(1), acc: v.right / v.seen, seen: v.seen })).sort((a, b) => a.acc - b.acc)
}

const SMALL = new Set(['of', 'the', 'and', 'in', 'to', 'for', 'a', 'an', 'on', 'at', 'by', 'with'])
/** "THE IMMANENCE OF GOD" → "The Immanence of God" */
export const niceTitle = (t: string) => t.toLowerCase().split(' ').map((w, i) => i && SMALL.has(w) ? w : w.replace(/(^|-)\S/g, c => c.toUpperCase())).join(' ')

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
/** "6TH SEPTEMBER, 2026" → Date (the Sunday the lesson is taught). */
export function lessonDate(d: string): Date | null {
  const m = d.toLowerCase().match(/(\d+)\w*\s+([a-z]+),?\s+(\d{4})/); if (!m) return null
  const mo = MONTHS.indexOf(m[2]); return mo < 0 ? null : new Date(+m[3], mo, +m[1])
}
/** The lesson taught this week: the latest one whose Sunday is on or before today. */
export function weekLesson(manual: Manual, now = new Date()) {
  let cur = manual.lessons[0]
  for (const l of manual.lessons) { const d = lessonDate(l.date); if (d && d <= now) cur = l }
  return cur
}
export type Category = 'verse' | 'outline' | 'refs' | 'sentences'
export const categoryOf = (s: string): Category => /\.MV$/.test(s) ? 'verse' : /\.OUT$|\.L\d/.test(s) ? 'outline' : /\.R\d+$/.test(s) ? 'refs' : 'sentences'
export const shortDate = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
