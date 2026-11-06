// Memory schedule: FSRS (ts-fsrs) as the PRD requires (FR-SC-01..09). Desired retention follows the
// study phase (90% while learning, 95% in consolidation and finale prep). Our Card keeps the FSRS
// state plus Rhemlo's own evidence (typed vs multiple-choice passes, assisted answers, speed).
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card as FCard } from 'ts-fsrs'
import type { Card } from './types'

const DAY = 86400000
export interface Phase { id: string; name: string; from: string; to: string; lessons: [number, number]; pace: number; retention: number; buffer?: boolean }
/** PRD 6.2 master study calendar (editable in the planner). */
export const DEFAULT_PHASES: Phase[] = [
  { id: 'P1', name: 'Q1 Learn', from: '2026-10-15', to: '2026-11-22', lessons: [1, 12], pace: 2, retention: .9 },
  { id: 'P2', name: 'Q1 Consolidate', from: '2026-11-23', to: '2026-12-15', lessons: [1, 12], pace: 0, retention: .95 },
  { id: 'P3', name: 'Q2 Learn', from: '2026-12-16', to: '2027-02-14', lessons: [14, 25], pace: 1.5, retention: .9 },
  { id: 'BX', name: 'Christmas buffer', from: '2026-12-24', to: '2026-12-31', lessons: [14, 25], pace: 0, retention: .9, buffer: true },
  { id: 'P4', name: 'Q3 Learn', from: '2027-02-15', to: '2027-04-11', lessons: [27, 38], pace: 1.5, retention: .9 },
  { id: 'P5', name: 'Q4 Learn', from: '2027-04-12', to: '2027-06-06', lessons: [40, 51], pace: 1.5, retention: .9 },
  { id: 'P6', name: 'Finale prep', from: '2027-06-07', to: '2027-07-01', lessons: [1, 51], pace: 0, retention: .95 },
]
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
export function phaseAt(phases: Phase[], t = Date.now()) {
  const d = iso(t); const all = phases.filter(p => d >= p.from && d <= p.to)
  return all.find(p => p.buffer) ?? all[0] ?? phases.find(p => d < p.from) ?? phases[phases.length - 1]
}
const schedulers = new Map<number, ReturnType<typeof fsrs>>()
const scheduler = (retention: number) => { if (!schedulers.has(retention)) schedulers.set(retention, fsrs(generatorParameters({ request_retention: retention, enable_fuzz: true, maximum_interval: 365 }))); return schedulers.get(retention)! }

/** Box 0–5 is kept as a coarse mirror of FSRS stability so mastery bands stay simple to read. */
export const boxOf = (stability: number, state: State) => state === State.New ? 0 : state === State.Learning || state === State.Relearning ? 1 : stability < 3 ? 1 : stability < 7 ? 2 : stability < 14 ? 3 : stability < 30 ? 4 : 5
function toF(c: Card | undefined, now: number): FCard {
  if (!c || c.stability === undefined) {
    const base = createEmptyCard(new Date(now))
    if (!c || !c.seen) return base
    // migrate an older Leitner card: keep its due date, estimate stability from its box
    const stab = [0.5, 1, 3, 7, 14, 30][c.box] ?? 1
    return { ...base, state: State.Review, stability: stab, difficulty: 5, reps: c.seen, lapses: Math.max(0, c.seen - c.right), due: new Date(c.due), last_review: new Date(c.last || now), scheduled_days: Math.round(stab) }
  }
  return { due: new Date(c.due), stability: c.stability, difficulty: c.difficulty ?? 5, scheduled_days: c.scheduled ?? 0, learning_steps: c.steps ?? 0, reps: c.reps ?? c.seen, lapses: c.lapses ?? 0, state: (c.state ?? State.Review) as State, last_review: c.last ? new Date(c.last) : undefined }
}
export interface Answer { correct: boolean; assisted: boolean; mcq: boolean; ms: number; retention: number }
export function review(c: Card | undefined, a: Answer, now = Date.now()): Card {
  const f = scheduler(a.retention)
  // honest adaptation: an assisted or multiple-choice pass moves the schedule less than an unaided typed one
  const rating = !a.correct ? Rating.Again : a.assisted ? Rating.Hard : a.mcq ? Rating.Hard : Rating.Good
  const r = f.next(toF(c, now), new Date(now), rating).card
  const prev = c ?? { box: 0, due: now, seen: 0, right: 0, last: 0 }
  return {
    ...prev, seen: prev.seen + 1, right: prev.right + (a.correct ? 1 : 0), last: now, due: r.due.getTime(),
    stability: r.stability, difficulty: r.difficulty, scheduled: r.scheduled_days, steps: r.learning_steps, reps: r.reps, lapses: r.lapses, state: r.state,
    box: a.correct ? boxOf(r.stability, r.state) : 0,
    typedOk: (prev.typedOk ?? 0) + (a.correct && !a.mcq && !a.assisted ? 1 : 0), mcqOk: (prev.mcqOk ?? 0) + (a.correct && a.mcq ? 1 : 0),
    fails: (prev.fails ?? 0) + (a.correct ? 0 : 1), leech: (prev.fails ?? 0) + (a.correct ? 0 : 1) >= 6, ms: a.correct ? a.ms : prev.ms,
  }
}
/** Chance of recalling this card now (FSRS retrievability), 0 for unseen. */
export function recall(c: Card | undefined, now = Date.now()) {
  if (!c || !c.seen) return 0
  try { return scheduler(.9).retrievability(toF(c, now), new Date(now)) } catch { return c.box >= 4 ? .9 : .5 }
}
/** Expected reviews per day for the next n days (FR-SC-08). */
export function forecast(cards: Record<string, Card>, prefix: string, days = 30, now = Date.now()) {
  const out = Array(days).fill(0); const start = new Date(now); start.setHours(0, 0, 0, 0)
  for (const k in cards) { if (!k.startsWith(prefix)) continue; const c = cards[k]; if (!c.seen) continue
    const i = Math.max(0, Math.floor((c.due - start.getTime()) / DAY)); if (i < days) out[i]++ }
  return out
}
