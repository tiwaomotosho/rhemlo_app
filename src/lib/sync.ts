// Accounts and sync, on top of whichever backend is active (demo now, live later).
import { api } from './backend'
import { demoRnd } from './backend/demo'
import { loadItems, loadManual } from './data'
import { day, snapshotOf, useStore } from './store'
import type { Card, ManualCode, SittingRecord } from './types'

/** Conflict-safe merge (FR-AC-04): the answer log is a union by time, each card keeps its latest review, nothing is ever dropped. */
export function merge(local: Record<string, unknown>, remote: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...remote, ...local }
  const L = local as Record<string, any>, R = remote as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const cards: Record<string, Card> = { ...(R.cards ?? {}) }; for (const [k, c] of Object.entries((L.cards ?? {}) as Record<string, Card>)) if (!cards[k] || (c.last ?? 0) >= (cards[k].last ?? 0)) cards[k] = c
  const byKey = <T,>(a: T[] = [], b: T[] = [], key: (x: T) => string) => { const m = new Map<string, T>(); for (const x of [...a, ...b]) m.set(key(x), x); return [...m.values()] }
  out.cards = cards
  out.log = byKey(R.log, L.log, (e: { at: number; s: string; u: string }) => `${e.at}|${e.u}`).sort((a, b) => a.at - b.at).slice(-6000)
  out.history = byKey(R.history, L.history, (h: { id: string; at: number }) => h.id).sort((a, b) => b.at - a.at)
  out.mocks = byKey(R.mocks, L.mocks, (h: { id: string; at: number }) => h.id).sort((a, b) => a.at - b.at)
  out.activeDays = [...new Set([...(R.activeDays ?? []), ...(L.activeDays ?? [])])].sort()
  out.done = { ...(R.done ?? {}), ...(L.done ?? {}) }; out.readings = { ...(R.readings ?? {}), ...(L.readings ?? {}) }; out.ladder = { ...(R.ladder ?? {}), ...(L.ladder ?? {}) }
  const checks: Record<string, { at: number; score: number }[]> = { ...(R.checks ?? {}) }; for (const [k, v] of Object.entries((L.checks ?? {}) as typeof checks)) checks[k] = byKey(checks[k], v, x => String(x.at)).sort((a, b) => a.at - b.at)
  out.checks = checks; out.points = Math.max(R.points ?? 0, L.points ?? 0)
  return out
}
let syncing = false
export async function syncNow() {
  const S = useStore.getState(); if (!S.account || !api.session() || syncing) return
  if (!navigator.onLine) { S.set({ syncPending: true } as never); return }
  syncing = true
  try {
    const remote = await api.pullSnapshot(); const local = snapshotOf()
    const merged = remote && remote.at > (S.account.lastSync ?? 0) ? merge(local, remote.data) : local
    if (merged !== local) useStore.getState().set(merged as never)
    const at = await api.pushSnapshot(merged); useStore.getState().set({ account: { ...useStore.getState().account!, lastSync: at }, syncPending: false } as never)
  } catch { useStore.getState().set({ syncPending: true } as never) /* stays saved on this device; retried when back online */ } finally { syncing = false }
}
/** Offline queue: anything saved while offline is pushed as soon as the connection returns. */
export function startSync() {
  const go = () => { if (navigator.onLine) syncNow() }
  addEventListener('online', go); const t = setInterval(() => { if ((useStore.getState() as unknown as { syncPending?: boolean }).syncPending) go() }, 60000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') go() })
  return () => { removeEventListener('online', go); clearInterval(t) }
}
export async function redeemLink(token: string) {
  const sess = await api.redeemLink(token); const snap = await api.pullSnapshot()
  adopt(sess.email, snap?.data ? merge(snapshotOf(), snap.data) : null); await syncNow()
}
function adopt(email: string, data: Record<string, unknown> | null, onboard = true) {
  const sess = api.session()!; const S = useStore.getState()
  S.set({ ...(data ?? {}), ...(onboard ? { onboarded: true } : {}), account: { email, userId: sess.userId, role: sess.user.role, lastSync: Date.now() },
    profile: { ...S.profile, ...((data?.profile as object) ?? {}), handle: sess.user.handle, name: (data?.profile as { name?: string })?.name ?? sess.user.name } } as never)
}
export async function signIn(email: string, password: string) {
  await api.signIn(email, password)
  let snap = await api.pullSnapshot()
  if (api.mode === 'demo' && email.endsWith('@demo.rhemlo.app')) {
    if (!snap) { await api.pushSnapshot(await demoProgress(email)); snap = await api.pullSnapshot() }
    else if (!Object.keys((snap.data.cards ?? {}) as object).some(k => k.startsWith('EN2627|'))) { // older demo data only covered the Adult manual
      const extra = await demoProgress(email, 'EN2627'); const d = snap.data as Record<string, Record<string, unknown>>
      await api.pushSnapshot({ ...snap.data, cards: { ...d.cards, ...extra.cards }, done: { ...d.done, ...extra.done }, ladder: { ...d.ladder, ...extra.ladder } }); snap = await api.pullSnapshot()
    }
  }
  adopt(email, snap?.data ?? null)
  if (!snap) await syncNow()
}
export async function signUp(email: string, password: string, handle: string, name: string) {
  await api.signUp(email, password, handle, name)
  adopt(email, null, false)
}
export async function signOut() {
  await syncNow(); await api.signOut(); useStore.getState().reset()
}

/** A believable few weeks of study for the demo personas, built from the real question bank. */
async function demoProgress(email: string, only?: ManualCode) {
  const coach = email.startsWith('femi'), steward = email.startsWith('ada'), now = Date.now()
  const cards: Record<string, Card> = {}, done: Record<string, number> = {}, ladder: Record<string, { q27?: boolean; q28?: boolean; q06?: boolean; q04?: boolean }> = {}
  // both manuals get believable progress, so switching manual never looks like a reset
  for (const [manual, base] of [['AD2627', coach ? 9 : steward ? 4 : 6], ['EN2627', coach ? 5 : steward ? 2 : 3]] as [ManualCode, number][]) {
  if (only && manual !== only) continue
  const m = await loadManual(manual), upto = base
  const lessons = m.lessons.slice(0, upto + 1)
  for (const [i, l] of lessons.entries()) {
    const its = await loadItems(manual, l.id); const keys = [...new Set(its.map(x => x.s))]
    const depth = i < upto ? .75 - i * .07 : .2
    for (const k of keys) { const r = demoRnd(email, k); if (r > depth + .15) continue
      const box = i < upto ? Math.min(5, Math.floor(demoRnd(email, k, 'b') * (6 - i * .5))) : Math.floor(demoRnd(email, k, 'b') * 2)
      const seen = 1 + box + Math.floor(demoRnd(email, k, 's') * 3)
      cards[`${manual}|${k}`] = { box, seen, right: Math.max(1, seen - (box ? 1 : 2)), last: now - Math.floor(demoRnd(k, 'l') * 9) * 86400000, due: now + (demoRnd(k, 'd') < .12 ? -86400000 : [0, 1, 3, 7, 14, 30][box] * 86400000 * demoRnd(k, 'f')) } }
    if (i < upto) { done[`${manual}|${l.id}`] = now - (upto - i) * 4 * 86400000; ladder[`${manual}|${l.id}`] = { q27: true, q28: true, q06: true, q04: i < upto - 1 } }
  }
  }
  const manual: ManualCode = 'AD2627', m = await loadManual(manual), upto = coach ? 9 : steward ? 4 : 6
  const history: SittingRecord[] = [], activeDays: string[] = []
  for (let d = 24; d >= 1; d--) { if (demoRnd(email, d) < .3) continue; const at = now - d * 86400000 + 18 * 3600000; activeDays.push(day(at))
    const total = 20, right = 13 + Math.floor(demoRnd(email, d, 'r') * 7)
    history.unshift({ id: crypto.randomUUID(), at, manual, kind: d % 5 === 0 ? 'review' : 'quest', lesson: m.lessons[Math.min(upto - 1, Math.floor((24 - d) / 4))].id, title: d % 5 === 0 ? 'Due review' : 'Recall', total, right, misses: [], minutes: 8 }) }
  const name = coach ? 'Bro. Femi' : steward ? 'Sis. Ada' : 'Tiwa'
  return { profile: { name, handle: '', goal: 'competition', pace: 'steady', glim: coach ? 'classic' : 'classic' }, manual, cards, done, ladder, history, activeDays, points: history.reduce((a, h) => a + h.right * 10, 0), joined: now - 30 * 86400000, arenaOptIn: !coach && !steward, sessionSize: 20 }
}
