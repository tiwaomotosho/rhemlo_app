// Accounts and sync, on top of whichever backend is active (demo now, live later).
import { api } from './backend'
import { demoRnd } from './backend/demo'
import { loadItems, loadManual } from './data'
import { day, snapshotOf, useStore } from './store'
import type { Card, ManualCode, SittingRecord } from './types'

export async function syncNow() {
  const S = useStore.getState(); if (!S.account || !api.session()) return
  try { const at = await api.pushSnapshot(snapshotOf()); useStore.getState().set({ account: { ...S.account, lastSync: at } }) } catch { /* stays saved on this device; retried after the next sitting */ }
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
