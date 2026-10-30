import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Card, Item, ManualCode, Manual, SittingRecord } from './types'

export type Theme = 'light' | 'dark' | 'system'
export type Goal = 'recall' | 'competition' | 'habit'
export type Pace = 'light' | 'steady' | 'focused'
export interface Profile { name: string; handle: string; goal: Goal; pace: Pace; glim: string }
export interface SessionSpec {
  kind: 'quest' | 'review' | 'target' | 'ladder' | 'daily' | 'check' | 'restart'; manual: ManualCode; lessons: string[]; count: number
  focus?: string[]; title: string; ranked?: boolean; only?: string[]; attemptId?: string
}
export interface Draft {
  id: string; spec: SessionSpec; queue: string[]; index: number; right: number; startedAt: number
  misses: SittingRecord['misses']; again: string[]; answered: string[]; rankedAnswers?: { u: string; value: string; ms: number }[]
}
export interface Ladder { q27?: boolean; q28?: boolean; q06?: boolean; q04?: boolean }
export interface Prefs {
  textScale: number; reduceMotion: boolean; mapWorld: 'theme' | 'day' | 'night'
  notif: { study: boolean; due: boolean; circle: boolean; quiz: boolean; league: boolean }; quiet: [string, string]; channel: 'inapp' | 'push' | 'email'
  keepPrivate: boolean; leagues: boolean; planDays: number; remindAt: string; sound: boolean
}
export const DEFAULT_PREFS: Prefs = { textScale: 1, reduceMotion: false, mapWorld: 'theme', notif: { study: true, due: true, circle: false, quiz: false, league: false }, quiet: ['22:00', '07:00'], channel: 'inapp', keepPrivate: true, leagues: false, planDays: 5, remindAt: '18:30', sound: false }

export const day = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const DAY = 86400000
const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30]

interface State {
  onboarded: boolean; profile: Profile; manual: ManualCode; theme: Theme; sessionSize: number
  cards: Record<string, Card>; done: Record<string, number>; ladder: Record<string, Ladder>
  history: SittingRecord[]; points: number; activeDays: string[]; arenaOptIn: boolean; reminders: boolean
  draft: Draft | null; seenIds: Record<string, true>
  prefs: Prefs; lastActive: number; prevActive: number; readings: Record<string, true>; joined: number; downloads: string[]
  account: { email: string; userId: string; role: string; lastSync: number } | null; inbox: { id: string; at: number; title: string; body: string }[]; askedPush: boolean; guideSeen: boolean; flash: string
  set: (p: Partial<State>) => void
  finishOnboarding: (p: Profile, manual: ManualCode) => void
  recordAnswer: (manual: ManualCode, item: Item, correct: boolean, assisted: boolean) => void
  markLadder: (manual: ManualCode, lesson: string, rung: keyof Ladder) => void
  completeSitting: (rec: SittingRecord) => void
  setDraft: (d: Draft | null) => void
  reset: () => void
}
const initial = {
  onboarded: false, profile: { name: '', handle: '', goal: 'recall' as Goal, pace: 'steady' as Pace, glim: 'classic' },
  manual: 'AD2627' as ManualCode, theme: 'system' as Theme, sessionSize: 20, cards: {}, done: {}, ladder: {}, history: [],
  points: 0, activeDays: [], arenaOptIn: false, reminders: false, draft: null, seenIds: {},
  prefs: DEFAULT_PREFS, lastActive: 0, prevActive: 0, readings: {}, joined: 0, downloads: [] as string[],
  account: null as State['account'], inbox: [] as State['inbox'], askedPush: false, guideSeen: false, flash: '',
}
export const useStore = create<State>()(persist((set, get) => ({
  ...initial,
  set: p => set(p),
  finishOnboarding: (profile, manual) => set({ onboarded: true, profile, manual, joined: Date.now(), lastActive: Date.now() }),
  recordAnswer: (manual, item, correct, assisted) => {
    const key = `${manual}|${item.s}`, now = Date.now(), c = get().cards[key] ?? { box: 0, due: now, seen: 0, right: 0, last: 0 }
    let box = c.box
    if (!correct) box = 0
    else if (!assisted) box = Math.min(INTERVAL_DAYS.length - 1, box + 1)   // help given counts less: no step up
    const next: Card = { box, seen: c.seen + 1, right: c.right + (correct ? 1 : 0), last: now, due: correct ? now + INTERVAL_DAYS[box] * DAY : now + 10 * 60000 }
    set({ cards: { ...get().cards, [key]: next } })
  },
  markLadder: (manual, lesson, rung) => { const k = `${manual}|${lesson}`; set({ ladder: { ...get().ladder, [k]: { ...get().ladder[k], [rung]: true } } }) },
  completeSitting: rec => {
    const s = get(); const d = day()
    const done = { ...s.done }
    if ((rec.kind === 'quest' || rec.kind === 'ladder') && rec.lesson && rec.right / Math.max(1, rec.total) >= 0.5) done[`${rec.manual}|${rec.lesson}`] = done[`${rec.manual}|${rec.lesson}`] ?? rec.at
    set({ history: [rec, ...s.history].slice(0, 300), done, points: s.points + rec.right * 10, activeDays: s.activeDays.includes(d) ? s.activeDays : [...s.activeDays, d].slice(-400), draft: null, prevActive: s.lastActive, lastActive: Date.now() })
  },
  setDraft: draft => set({ draft }),
  reset: () => set({ ...initial }),
}), { name: 'rhemlo.v1', version: 2, migrate: (p) => ({ ...(p as object), prefs: { ...DEFAULT_PREFS, ...((p as { prefs?: Partial<Prefs> }).prefs ?? {}) } }) as never }))

// ---- derived helpers ----------------------------------------------------------------------------
export type Mastery = 'secure' | 'strengthening' | 'learning' | 'new'
export const masteryOf = (c?: Card): Mastery => !c || c.seen === 0 ? 'new' : c.box >= 4 ? 'secure' : c.box >= 2 ? 'strengthening' : 'learning'

export function lessonStats(cards: Record<string, Card>, manual: Manual, lessonId: string) {
  const prefix = `${manual.code}|${manual.code}:${lessonId}.`; const now = Date.now()
  const m = manual.lessons.find(l => l.id === lessonId)!
  let secure = 0, strengthening = 0, learning = 0, due = 0
  for (const k in cards) if (k.startsWith(prefix) || k.startsWith(`${manual.code}|${manual.code}:${lessonId}`)) {
    const c = cards[k]; const st = masteryOf(c)
    if (st === 'secure') secure++; else if (st === 'strengthening') strengthening++; else if (st === 'learning') learning++
    if (c.due <= now && c.seen > 0) due++
  }
  const total = m.cc, notStarted = Math.max(0, total - secure - strengthening - learning)
  return { secure, strengthening, learning, notStarted, due, total, readiness: total ? secure / total : 0 }
}
export function manualStats(cards: Record<string, Card>, manual: Manual, from = 1, to = 99) {
  let secure = 0, strengthening = 0, learning = 0, total = 0, due = 0
  for (const l of manual.lessons) if (l.n >= from && l.n <= to) { const s = lessonStats(cards, manual, l.id); secure += s.secure; strengthening += s.strengthening; learning += s.learning; total += s.total; due += s.due }
  return { secure, strengthening, learning, notStarted: Math.max(0, total - secure - strengthening - learning), total, due, readiness: total ? secure / total : 0 }
}
export function streakInfo(days: string[]) {
  const set = new Set(days); let streak = 0; const t = new Date()
  for (let i = 0; i < 400; i++) { const d = day(t.getTime() - i * DAY); if (set.has(d)) streak++; else if (i === 0) continue; else break }
  return { streak, today: set.has(day()) }
}

/** The part of the state that syncs to the account (never the session or draft). */
export const SYNC_KEYS = ['profile', 'manual', 'theme', 'sessionSize', 'cards', 'done', 'ladder', 'history', 'points', 'activeDays', 'prefs', 'readings', 'joined', 'arenaOptIn'] as const
export const snapshotOf = () => { const s = useStore.getState() as unknown as Record<string, unknown>; return Object.fromEntries(SYNC_KEYS.map(k => [k, s[k]])) }
