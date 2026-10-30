// Gentle reminders. Browser notifications are real (shown by the service worker on HTTPS or
// localhost); email digests go through the backend (a demo outbox until the live server sends mail).
import { api } from './backend'
import { useStore } from './store'

export const canNotify = () => typeof Notification !== 'undefined'
export async function askPermission() {
  if (!canNotify()) return false
  const p = await Notification.requestPermission(); const S = useStore.getState()
  if (p === 'granted') S.set({ prefs: { ...S.prefs, channel: 'push' } })
  return p === 'granted'
}
export async function show(title: string, body: string, tag: string) {
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
  const opts = { body, tag, icon: '/assets/brand/app-icons/icon-192.png', badge: '/assets/brand/app-icons/icon-48.png' }
  if (reg) return reg.showNotification(title, opts)
  return new Notification(title, opts)
}
const toMin = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m }
export const inQuiet = (q: [string, string], d = new Date()) => { const n = d.getHours() * 60 + d.getMinutes(), a = toMin(q[0]), b = toMin(q[1]); return a <= b ? n >= a && n < b : n >= a || n < b }

async function deliver(kind: string, title: string, body: string) {
  const S = useStore.getState(), day = new Date().toDateString(), key = `rhemlo.notified.${kind}`
  if (localStorage.getItem(key) === day) return
  localStorage.setItem(key, day)
  if (S.prefs.channel === 'push' && canNotify() && Notification.permission === 'granted') await show(title, body, kind)
  else if (S.prefs.channel === 'email' && api.session()) await api.email(title, body)
  else S.set({ inbox: [{ id: crypto.randomUUID(), at: Date.now(), title, body }, ...S.inbox].slice(0, 20) })
}

/** Checks once a minute while the app is open: the study reminder time and newly due review. */
export function startReminders() {
  const tick = () => {
    const S = useStore.getState(); if (!S.onboarded) return
    const now = new Date(), p = S.prefs; if (inQuiet(p.quiet, now)) return
    const studied = S.activeDays.includes(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`)
    if (p.notif.study && !studied && now.getHours() * 60 + now.getMinutes() >= toMin(p.remindAt)) deliver('study', 'Rhemlo', 'Your next little quest is ready.')
    const due = Object.entries(S.cards).filter(([k, c]) => k.startsWith(S.manual + '|') && c.seen > 0 && c.due <= Date.now()).length
    if (p.notif.due && due >= 5) deliver('due', 'Due review ready', `${due} points are ready to revisit. About ${Math.max(2, Math.round(Math.min(due, 20) * .4))} minutes.`)
  }
  tick(); const t = setInterval(tick, 60000); return () => clearInterval(t)
}
