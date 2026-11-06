// Mastery levels (PRD 8.1), retrieval directions (8.2), readiness (FR-AD-01) and the capability
// scorecard with the finale readiness rule (3.4, FR-AN-10).
import { recall } from './srs'
import type { Card, LogEntry, Manual, MockRecord } from './types'

export const DIRECTIONS: Record<string, { name: string; types: string[] }> = {
  D1: { name: 'Lesson → references', types: ['Q09'] },
  D2: { name: 'Reference → lesson', types: ['Q10', 'Q15', 'Q30'] },
  D3: { name: 'Reference → context', types: ['Q11', 'Q16', 'Q34'] },
  D4: { name: 'Context → reference', types: ['Q12', 'Q24', 'Q37'] },
  D5: { name: 'Reference → printed text', types: ['Q04', 'Q27'] },
  D6: { name: 'Printed text → reference', types: ['Q05', 'Q23'] },
  D7: { name: 'Title → outline', types: ['Q07', 'Q29'] },
  D8: { name: 'Outline → title', types: ['Q08', 'Q31'] },
  D9: { name: 'Partial and mixed clues', types: ['Q01', 'Q02', 'Q03', 'Q06', 'Q13', 'Q14', 'Q17', 'Q22', 'Q25', 'Q26', 'Q28', 'Q33'] },
}
export const LEVELS = ['Not started', 'Understanding', 'Recognition', 'Recall', 'Verbatim', 'Bidirectional']
const pre = (m: string, l: string) => `${m}:${l}.`

export function lessonLevel(m: Manual, id: string, cards: Record<string, Card>, log: LogEntry[], checks: Record<string, { at: number; score: number }[]>, read: boolean, learn: string[] = []) {
  const p = pre(m.code, id), lcards = Object.entries(cards).filter(([k]) => k.startsWith(`${m.code}|${p}`)).map(([, c]) => c)
  const lg = log.filter(e => e.m === m.code && e.s.startsWith(p))
  const passed = new Set(lg.filter(e => e.ok && !e.assisted).map(e => e.t))
  const dirs = Object.fromEntries(Object.entries(DIRECTIONS).map(([d, v]) => [d, v.types.some(t => passed.has(t))]))
  const cc = m.lessons.find(l => l.id === id)?.cc ?? 1
  const recog = lcards.filter(c => (c.mcqOk ?? 0) + (c.typedOk ?? 0) > 0).length / cc
  const typed = lcards.filter(c => (c.typedOk ?? 0) > 0).length / cc
  const ch = checks[`${m.code}|${id}`] ?? [], best = ch.filter(c => c.score >= .98)
  let level = 0
  if (read || learn.includes('pretest')) level = 1
  if (level >= 1 && recog >= .6) level = 2
  if (level >= 2 && typed >= .6) level = 3
  if (level >= 3 && best.length) level = 4
  if (level >= 4 && Object.values(dirs).every(Boolean)) level = 5
  const mastered = level === 5 && best.some(a => best.some(b => Math.abs(a.at - b.at) >= 7 * 86400000))
  return { level, name: mastered ? 'Mastered' : LEVELS[level], mastered, dirs, recog, typed, lastCheck: ch[ch.length - 1]?.score }
}

/** Readiness 0–1: chance of recall today across all the lesson's points, the latest mastery check and coverage. Only real recall moves it. */
export function lessonReadiness(m: Manual, id: string, cards: Record<string, Card>, checks: Record<string, { at: number; score: number }[]>, now = Date.now()) {
  const p = `${m.code}|${pre(m.code, id)}`, cc = m.lessons.find(l => l.id === id)?.cc ?? 1
  let sum = 0, tried = 0
  for (const k in cards) if (k.startsWith(p)) { const c = cards[k]; if (!c.seen) continue; tried++; sum += c.right ? recall(c, now) : 0 }
  const avg = sum / cc, coverage = Math.min(1, tried / cc)
  const ch = checks[`${m.code}|${id}`]; const check = ch?.length ? ch[ch.length - 1].score : avg
  return Math.max(0, Math.min(1, .65 * avg + .2 * check * coverage + .15 * coverage * avg))
}
export function readinessFor(m: Manual, lessons: [number, number], cards: Record<string, Card>, checks: Record<string, { at: number; score: number }[]>) {
  const ls = m.lessons.filter(l => l.n >= lessons[0] && l.n <= lessons[1])
  const per = ls.map(l => ({ l, r: lessonReadiness(m, l.id, cards, checks) }))
  const total = ls.reduce((a, l) => a + l.cc, 0) || 1
  const r = per.reduce((a, x) => a + x.r * x.l.cc, 0) / total
  return { readiness: r, gap: Math.max(0, .95 - r), per, below: per.filter(x => x.r < .95) }
}

/** Weakest part of a set of lessons, from this learner's own answers (FR-AD-02). */
export function weakestPart(log: LogEntry[], manual: string, lessons: string[]) {
  const parts: Record<string, string[]> = { references: ['Q05', 'Q09', 'Q10', 'Q11', 'Q12', 'Q16', 'Q23', 'Q24', 'Q32', 'Q34', 'Q37'], outlines: ['Q07', 'Q08', 'Q13', 'Q14', 'Q31', 'Q36'], verses: ['Q04', 'Q06', 'Q27', 'Q28'], sentences: ['Q01', 'Q02', 'Q03', 'Q15', 'Q22', 'Q25'], spelling: ['Q17', 'Q26', 'Q33'] }
  const lg = log.filter(e => e.m === manual && lessons.some(l => e.s.includes(`:${l}.`)))
  let worst = '', acc = 2
  for (const [k, ts] of Object.entries(parts)) { const xs = lg.filter(e => ts.includes(e.t)); if (xs.length < 3) continue; const a = xs.filter(e => e.ok).length / xs.length; if (a < acc) { acc = a; worst = k } }
  return worst ? { part: worst, acc } : null
}

const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
export const CAPS = [
  { k: 'C1', name: 'Context to scripture', types: ['Q12', 'Q24', 'Q37', 'Q34'], target: .95, secs: 10 },
  { k: 'C2', name: 'Missing words, right spelling', types: ['Q01', 'Q02', 'Q06', 'Q17', 'Q33'], target: .98, secs: 8 },
  { k: 'C3', name: 'Memory verse ↔ lesson', types: ['Q05', 'Q09', 'Q10', 'Q08', 'Q29', 'Q30', 'Q31'], target: .98, secs: 6 },
  { k: 'C4', name: 'Trap detection', types: ['Q23', 'Q33', 'Q36', 'Q32'], target: .95, secs: 20 },
  { k: 'C5', name: 'Speed through mastery', types: [], target: 0, secs: 0 },
  { k: 'C6', name: 'Manual-exact accuracy', types: [], target: .98, secs: 0 },
]
/** Live scorecard from the last 30 days of answers, plus the finale rule over full-manual mocks. */
export function scorecard(log: LogEntry[], manual: string, mocks: MockRecord[], checks: Record<string, { at: number; score: number }[]>) {
  const since = Date.now() - 30 * 86400000, lg = log.filter(e => e.m === manual && e.at > since)
  const rows = CAPS.slice(0, 4).map(c => { const xs = lg.filter(e => c.types.includes(e.t)); const acc = xs.length ? xs.filter(e => e.ok).length / xs.length : 0; const med = median(xs.filter(e => e.ok && e.ms > 0).map(e => e.ms / 1000)); return { ...c, n: xs.length, acc, med, ok: xs.length >= 10 && acc >= c.target && (!med || med <= c.secs) } })
  const speedOk = rows.filter(r => r.n >= 10).every(r => !r.med || r.med <= r.secs) && rows.some(r => r.n >= 10)
  const allChecks = Object.entries(checks).filter(([k]) => k.startsWith(manual + '|')).map(([, v]) => v[v.length - 1].score)
  const c6 = allChecks.length ? allChecks.reduce((a, b) => a + b, 0) / allChecks.length : 0
  const caps = [...rows, { ...CAPS[4], n: lg.length, acc: speedOk ? 1 : 0, med: 0, ok: speedOk }, { ...CAPS[5], n: allChecks.length, acc: c6, med: 0, ok: allChecks.length > 0 && c6 >= .98 }]
  const full = mocks.filter(x => x.manual === manual && x.full && x.score >= .95).sort((a, b) => a.at - b.at)
  const twoApart = full.some((a, i) => full.slice(i + 1).some(b => b.at - a.at >= 7 * 86400000))
  return { caps, finaleReady: caps.every(c => c.ok) && twoApart, fullMocksOnTarget: full.length, twoApart }
}
