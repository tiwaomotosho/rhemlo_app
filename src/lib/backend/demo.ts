// Demo backend: a pretend server that lives in this browser so every community, ranking and
// account screen can be tried before the real infrastructure exists. Demo people are labelled
// as demo everywhere they appear; their activity is simulated deterministically from the date.
import type { Assignment, Backend, ChallengeAttempt, Circle, Coop, FeedItem, League, MatchState, Message, Outbox, PublicUser, Report, Session, Snapshot, StandingRow, Tier, WeekResult } from './types'
import { TIERS } from './types'

const KEY = 'rhemlo.demo.server'
const DAY = 86400000, WEEK = 7 * DAY
export const DEMO_PASSWORD = 'Rhemlo-demo-2026'

// ---- deterministic randomness ------------------------------------------------------------------
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
const rnd = (...k: (string | number)[]) => { let t = hash(k.join('|')) + 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10)
const weekStart = (t = Date.now()) => { const d = new Date(t); const dow = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dow * DAY }
const weekId = (t = Date.now()) => { const s = new Date(weekStart(t) + 3 * DAY); const y = s.getUTCFullYear(); const w = Math.ceil(((s.getTime() - Date.UTC(y, 0, 1)) / DAY + 1) / 7); return `${y}-W${String(w).padStart(2, '0')}` }

// ---- the demo people -----------------------------------------------------------------------------
type DemoUser = PublicUser & { skill: number; activity: number }
const CWS = ['classic', 'twilight', 'meadow', 'rosewood', 'midnight', 'ocean']
const NAMES: [string, string, number, number][] = [
  ['grace.lights', 'Grace', .93, .9], ['deji_reads', 'Deji', .9, .85], ['amara.k', 'Amara', .88, .8], ['kemi_o', 'Kemi', .84, .8], ['psalmist22', 'Bisi', .82, .75],
  ['tolu.reads', 'Tolu', .8, .85], ['tobi.verse', 'Tobi', .76, .7], ['ruthie', 'Ruth', .72, .65], ['nk_walker', 'Nkem', .55, .35], ['dayo.lamp', 'Dayo', .78, .6],
  ['ife.writes', 'Ife', .74, .7], ['seyi_s', 'Seyi', .7, .55], ['joy.ola', 'Joy', .86, .7], ['femi.jr', 'Femi', .66, .5], ['zainab.r', 'Zainab', .81, .65],
  ['tunde.b', 'Tunde', .69, .6], ['esther.n', 'Esther', .9, .55], ['moses.k', 'Moses', .62, .45], ['blessing1', 'Blessing', .77, .75], ['victor.e', 'Victor', .73, .5],
  ['ada.light', 'Ada', .85, .6], ['peace.o', 'Peace', .68, .55], ['john.m', 'John', .6, .4], ['favour.a', 'Favour', .79, .7], ['samuel.t', 'Samuel', .71, .5],
  ['mercy.j', 'Mercy', .83, .65], ['david.o', 'David', .67, .45], ['lydia.p', 'Lydia', .75, .6], ['caleb.w', 'Caleb', .64, .5], ['hannah.e', 'Hannah', .87, .8],
  ['ope.reads', 'Ope', .72, .55], ['kunle.a', 'Kunle', .58, .4],
]
const DEMO: DemoUser[] = [
  ...NAMES.map(([handle, name, skill, activity], i) => ({ id: `d-${handle}`, handle, name, cw: CWS[i % 6], tier: 'silver' as Tier, role: 'learner' as const, demo: true, skill, activity })),
  { id: 'd-bro.femi', handle: 'bro.femi', name: 'Bro. Femi', cw: 'classic', tier: 'gold', role: 'coach', demo: true, skill: .9, activity: .5 },
  { id: 'd-sis.ada', handle: 'sis.ada', name: 'Sis. Ada', cw: 'meadow', tier: 'gold', role: 'steward', demo: true, skill: .9, activity: .3 },
  { id: 'd-tiwa_lamp', handle: 'tiwa_lamp', name: 'Tiwa', cw: 'classic', tier: 'silver', role: 'learner', demo: true, skill: .8, activity: .8 },
]
const ACCOUNTS = [
  { email: 'tiwa@demo.rhemlo.app', userId: 'd-tiwa_lamp', who: 'Learner · Silver league, friends, co-op and a circle' },
  { email: 'femi@demo.rhemlo.app', userId: 'd-bro.femi', who: 'Coach · Grace Youth Circle, assignments, Quiz Night host' },
  { email: 'ada@demo.rhemlo.app', userId: 'd-sis.ada', who: 'Content steward · review queue and reports' },
]
const pub = ({ skill: _s, activity: _a, ...u }: DemoUser): PublicUser => u

// ---- stored state --------------------------------------------------------------------------------
interface Store {
  accounts: { id: string; email: string; hash: string; userId: string }[]; users: DemoUser[]; session: Session | null
  snapshots: Record<string, Snapshot>; league: Record<string, { since: number; tier: Tier; processed: string }>
  attempts: Record<string, ChallengeAttempt[]>; friends: Record<string, string[]>; cheers: Record<string, string>
  groups: Record<string, string[]>; muted: Record<string, boolean>; messages: Record<string, Message[]>; blocks: Record<string, string[]>
  reports: Report[]; assignments: Record<string, Assignment[]>; outbox: Record<string, Outbox[]>; matches: Record<string, MatchState & { createdAt: number }>
}
const fresh = (): Store => ({ accounts: [], users: [], session: null, snapshots: {}, league: { 'd-tiwa_lamp': { since: Date.now() - 5 * WEEK, tier: 'silver', processed: weekId(Date.now() - WEEK) } }, attempts: {},
  friends: { 'd-tiwa_lamp': ['d-tolu.reads', 'd-amara.k', 'd-deji_reads', 'd-grace.lights', 'd-kemi_o'], 'd-bro.femi': ['d-tiwa_lamp'] }, cheers: {},
  groups: { 'd-tiwa_lamp': ['grace-youth'], 'd-bro.femi': ['grace-youth'] }, muted: {}, messages: {}, blocks: {}, reports: [], assignments: {}, outbox: {}, matches: {} })
let S: Store
const load = () => { if (S) return S; try { S = { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { S = fresh() } return S }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)) } catch { /* storage full or private mode */ } }
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('rhemlo:' + s)))).map(b => b.toString(16).padStart(2, '0')).join('')
const wait = (ms = 250) => new Promise(r => setTimeout(r, ms))
const me = () => { const s = load().session; if (!s) throw new Error('Please sign in again. Accepted progress is safe and nothing will be counted twice.'); return s }
const allUsers = () => [...DEMO, ...load().users]
const user = (id: string) => allUsers().find(u => u.id === id)!

// ---- simulated activity --------------------------------------------------------------------------
const dayScore = (u: DemoUser, day: string) => rnd(u.handle, day, 'on') < u.activity ? 10 * Math.max(0, Math.min(10, Math.round(10 * u.skill + (rnd(u.handle, day, 's') - .5) * 4))) : 0
function weekPoints(u: DemoUser, ws: number, now = Date.now()) {
  let p = 0
  for (let i = 0; i < 7; i++) { const t = ws + i * DAY; if (t > now) break; const d = utcDay(t)
    if (t + DAY <= now || (now - t) / DAY > rnd(u.handle, d, 'hour')) p += dayScore(u, d) }
  return p
}
function myWeekPoints(uid: string, ws: number) {
  const real = (load().attempts[uid] ?? []).filter(a => a.state !== 'open' && a.points !== undefined && Date.parse(a.day) >= ws && Date.parse(a.day) < ws + WEEK)
  let p = real.reduce((s, a) => s + (a.points ?? 0), 0)
  // demo personas come with a simulated history for the days before you started playing them
  const persona = DEMO.find(d => d.id === uid); if (persona) for (let i = 0; i < 7; i++) { const t = ws + i * DAY, d = utcDay(t); if (d >= utcDay(Date.now())) break; if (!real.some(a => a.day === d)) p += dayScore(persona, d) }
  return p
}
function rankRows(rows: { user: PublicUser; points: number; you: boolean }[]): StandingRow[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points || a.user.handle.localeCompare(b.user.handle))
  return sorted.map(r => ({ ...r, rank: 1 + sorted.filter(x => x.points > r.points).length }))
}
function cohort(tier: Tier, week: string, exclude: string) {
  const pool = DEMO.filter(u => u.role === 'learner' && u.id !== exclude)
  return [...pool].sort((a, b) => rnd(a.handle, week, tier) - rnd(b.handle, week, tier)).slice(0, 29)
}

export const demo: Backend = {
  mode: 'demo',
  session: () => load().session,
  demoAccounts: () => ACCOUNTS.map(a => ({ email: a.email, password: DEMO_PASSWORD, who: a.who })),
  async signUp(email, password, handle, name) {
    await wait(); const s = load(); email = email.trim().toLowerCase()
    if (s.accounts.some(a => a.email === email) || ACCOUNTS.some(a => a.email === email)) throw new Error('That email already has an account. Try signing in.')
    if (password.length < 8) throw new Error('Use at least 8 characters for your password.')
    const h = handle.toLowerCase().replace(/[^a-z0-9_.]/g, '') || email.split('@')[0].replace(/[^a-z0-9_.]/g, '')
    if (allUsers().some(u => u.handle === h)) throw new Error(`The handle @${h} is taken. Try another.`)
    const u: DemoUser = { id: `u-${crypto.randomUUID().slice(0, 8)}`, handle: h, name: name || h, cw: 'classic', tier: 'bronze', role: 'learner', skill: .7, activity: .5 }
    s.users.push(u); s.accounts.push({ id: u.id, email, hash: await sha(password), userId: u.id })
    s.friends[u.id] = []; s.session = { userId: u.id, email, user: pub(u), token: crypto.randomUUID() }; save(); return s.session
  },
  async signIn(email, password) {
    await wait(); const s = load(); email = email.trim().toLowerCase()
    const demoAcc = ACCOUNTS.find(a => a.email === email)
    if (demoAcc) { if (password !== DEMO_PASSWORD) throw new Error('That password does not match. Demo accounts use the password shown below.'); s.session = { userId: demoAcc.userId, email, user: pub(user(demoAcc.userId)), token: crypto.randomUUID() }; save(); return s.session }
    const acc = s.accounts.find(a => a.email === email)
    if (!acc || acc.hash !== await sha(password)) throw new Error('That email and password do not match an account.')
    s.session = { userId: acc.userId, email, user: pub(user(acc.userId)), token: crypto.randomUUID() }; save(); return s.session
  },
  async signOut() { load().session = null; save() },
  async pushSnapshot(data) { const s = load(), u = me(); const at = Date.now(); s.snapshots[u.userId] = { at, data }; save(); await wait(150); return at },
  async pullSnapshot() { await wait(); return load().snapshots[me().userId] ?? null },

  // ---- arena ----
  async join_league() { const s = load(), u = me(); s.league[u.userId] ??= { since: Date.now(), tier: 'bronze', processed: weekId() }; save() },
  async leave_league() { const s = load(); delete s.league[me().userId]; save() },
  async league_standings() {
    await wait(); const s = load(), u = me(), L = s.league[u.userId]; if (!L) return null
    const ws = weekStart(), wk = weekId()
    const rows = [...cohort(L.tier, wk, u.userId).map(d => ({ user: pub(d), points: weekPoints(d, ws), you: false })), { user: { ...u.user, tier: L.tier }, points: myWeekPoints(u.userId, ws), you: true }]
    return { id: `${L.tier}-${wk}`, week: wk, tier: L.tier, endsAt: ws + WEEK, rows: rankRows(rows), promoteTo: 10, demoteFrom: 26, firstWeek: Date.now() - L.since < WEEK } as League
  },
  async last_week_result() {
    const s = load(), u = me(), L = s.league[u.userId]; if (!L || Date.now() - L.since < WEEK) return null
    const ws = weekStart() - WEEK, wk = weekId(ws)
    const rows = rankRows([...cohort(L.tier, wk, u.userId).map(d => ({ user: pub(d), points: weekPoints(d, ws, ws + WEEK), you: false })), { user: u.user, points: myWeekPoints(u.userId, ws), you: true }])
    const mine = rows.find(r => r.you)!, i = TIERS.indexOf(L.tier)
    const moved = mine.points > 0 && mine.rank <= 10 && i < TIERS.length - 1 ? 'up' : mine.rank >= 26 && i > 0 && Date.now() - L.since > 2 * WEEK ? 'down' : 'stay'
    const newTier = moved === 'up' ? TIERS[i + 1] : moved === 'down' ? TIERS[i - 1] : L.tier
    if (L.processed !== weekId()) { L.tier = newTier; L.processed = weekId(); save() }
    return { week: wk, tier: TIERS[i], newTier, rank: mine.rank, points: mine.points, moved } as WeekResult
  },
  async daily_challenge(manual, eligible) {
    const s = load(), u = me(), day = utcDay(Date.now()); const list = (s.attempts[u.userId] ??= [])
    const have = list.find(a => a.day === day && a.manual === manual); if (have) return have
    const items = [...eligible].sort((a, b) => rnd(a, day) - rnd(b, day)).slice(0, 10)
    const a: ChallengeAttempt = { id: `DC-${day.slice(5).replace('-', '')}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`, day, manual, items, state: 'open', accepted: 0, startedAt: Date.now() }
    list.push(a); save(); return a
  },
  async submit_challenge(id, answers, grade) {
    const s = load(), u = me(); const a = (s.attempts[u.userId] ?? []).find(x => x.id === id); if (!a) throw new Error('This attempt has expired.')
    if (a.state !== 'open') return a // refresh never creates a second attempt
    const correct = answers.filter(x => a.items.includes(x.u) && grade(x.u, x.value)).length
    Object.assign(a, { state: 'pending', accepted: answers.length, correct, points: correct * 10, submittedAt: Date.now() }); save(); return a
  },
  async challenge_state(id) {
    const s = load(), u = me(); const a = (s.attempts[u.userId] ?? []).find(x => x.id === id) as ChallengeAttempt & { submittedAt?: number }
    if (a?.state === 'pending' && Date.now() - (a.submittedAt ?? 0) > 3500) { a.state = 'final'; save() }
    return a
  },

  // ---- matches ----
  async create_match(opponentId, items) { const s = load(); const m = { id: `m-${crypto.randomUUID().slice(0, 6)}`, opponent: pub(user(opponentId)), state: 'invited' as const, items, you: 0, them: 0, expiresAt: Date.now() + 5 * 60000, createdAt: Date.now() }; s.matches[m.id] = m; save(); return m },
  async match_state(id) { const m = load().matches[id]; const age = Date.now() - m.createdAt; if (m.state === 'invited' || m.state === 'joining') m.state = age > 4000 ? 'ready' : age > 1800 ? 'joining' : 'invited'; save(); return m },
  async opponent_answer(id, q, correct, options) {
    const m = load().matches[id], o = DEMO.find(d => d.id === m.opponent.id) ?? { skill: .7, handle: 'x' } as DemoUser
    const ok = rnd(o.handle, id, q) < o.skill; const wrong = options.filter(x => x !== correct)
    return { value: ok ? correct : wrong[Math.floor(rnd(id, q, 'w') * wrong.length)] ?? correct, ms: 3500 + Math.floor(rnd(id, q, 't') * 11000) }
  },
  async finish_match(id, you, them) { const m = load().matches[id]; Object.assign(m, { you, them, state: 'final' }); save(); return m },

  // ---- community ----
  async friends() { await wait(120); const s = load(), u = me(); const bl = s.blocks[u.userId] ?? []; return (s.friends[u.userId] ?? []).filter(id => !bl.includes(id)).map(id => pub(user(id) as DemoUser)) },
  async search_users(q) { const s = load(), u = me(); q = q.trim().toLowerCase().replace(/^@/, ''); if (q.length < 2) return []; return allUsers().filter(x => x.id !== u.userId && x.handle.includes(q) && !(s.blocks[u.userId] ?? []).includes(x.id)).slice(0, 6).map(x => pub(x)) },
  async request_connection(id) { const s = load(), u = me(); const f = (s.friends[u.userId] ??= []); if (!f.includes(id)) f.push(id); save() },
  async friends_feed() {
    const s = load(), u = me(), fr = (await demo.friends()); const out: FeedItem[] = []
    for (const f of fr) { const d = DEMO.find(x => x.id === f.id); if (!d) continue
      for (let back = 0; back < 3; back++) { const t = Date.now() - back * DAY, day = utcDay(t); if (rnd(f.handle, day, 'feed') > .55) continue
        const kind = Math.floor(rnd(f.handle, day, 'k') * 3), ch = 3 + Math.floor((Date.now() - Date.UTC(2026, 8, 6)) / WEEK) - back
        const text = kind === 0 ? `completed Chapter ${Math.max(1, ch)}` : kind === 1 ? 'came back to review after a week away' : `secured the memory verse of Lesson ${Math.max(1, ch - 1)}`
        const id = `${f.id}-${day}`; out.push({ id, user: f, text, badge: ['chapter', 'seed', 'lantern'][kind], at: t - Math.floor(rnd(id) * 8) * 3600000, cheers: 1 + Math.floor(rnd(id, 'c') * 8) + (s.cheers[id] ? 1 : 0), mine: s.cheers[id] }) } }
    void u; return out.sort((a, b) => b.at - a.at).slice(0, 8)
  },
  async cheer(id, kind) { load().cheers[id] = kind; save() },
  async coop() {
    const u = me(); const fr = await demo.friends(); const partner = fr.find(f => f.id === 'd-tolu.reads') ?? fr[0]; if (!partner) return null
    const ws = weekStart(); let them = 0; for (let i = 0; i < 7 && them < 5; i++) { const t = ws + i * DAY; if (t > Date.now()) break; if (rnd(partner.handle, utcDay(t), 'coop') < .75) them++ }
    const days = new Set(((load().snapshots[u.userId]?.data?.history ?? []) as { at: number; total: number }[]).filter(h => h.at >= ws && h.total >= 10).map(h => utcDay(h.at)))
    return { id: `cq-${weekId()}`, partner, endsAt: ws + WEEK - 60000, you: Math.min(5, days.size), them, goal: 10, reward: 'twilight', pendingOffline: 0 } as Coop
  },
  async my_groups() {
    await wait(120); const s = load(), u = me(); const ids = s.groups[u.userId] ?? []
    return ids.map(id => groupView(id, u.userId))
  },
  async join_group(code) { const s = load(), u = me(); const id = code.trim().toLowerCase(); if (id !== 'grace-youth') throw new Error('No circle uses that code. Check it with your coach. In this demo, try GRACE-YOUTH.'); const g = (s.groups[u.userId] ??= []); if (!g.includes(id)) g.push(id); save(); return groupView(id, u.userId) },
  async leave_group(id) { const s = load(), u = me(); s.groups[u.userId] = (s.groups[u.userId] ?? []).filter(x => x !== id); save() },
  async mute_group(id, muted) { load().muted[`${me().userId}|${id}`] = muted; save() },
  async messages(gid) {
    const s = load(), u = me(), bl = s.blocks[u.userId] ?? []; const today = new Date(); today.setHours(9, 0, 0, 0); const t0 = today.getTime()
    const seed: Message[] = [
      { id: 'm1', user: pub(user('d-bro.femi')), text: 'Well done everyone on last week’s chapter! This week’s memory verse is our focus.', at: t0 + 2 * 60000, mine: false },
      { id: 'm2', user: pub(user('d-tolu.reads')), text: 'The Fade rung really helped me with it', at: t0 + 10 * 60000, mine: false },
      { id: 'm3', user: pub(user('d-amara.k')), text: 'Spelling counts, so watch the double letters. Profit + eth: profiteth 🙂', at: t0 + 15 * 60000, mine: false },
    ]
    return [...seed, ...(s.messages[gid] ?? [])].filter(m => !bl.includes(m.user.id)).map(m => ({ ...m, mine: m.user.id === u.userId }))
  },
  async send_message(gid, text) { const s = load(), u = me(); const m: Message = { id: crypto.randomUUID(), user: u.user, text: text.slice(0, 500), at: Date.now(), mine: true }; (s.messages[gid] ??= []).push(m); save(); return m },
  async block_user(id) { const s = load(), u = me(); const b = (s.blocks[u.userId] ??= []); if (!b.includes(id)) b.push(id); save() },
  async blocked() { return load().blocks[me().userId] ?? [] },
  async report(kind, target, reason, note) { await wait(); const s = load(); const r: Report = { id: crypto.randomUUID(), ref: `RPT-${Date.now().toString(36).slice(-5).toUpperCase()}`, kind, target, reason, note, at: Date.now(), state: 'open' }; s.reports.push(r); save(); return r },

  // ---- roles ----
  async group_progress(gid) {
    void gid; const ws = weekStart(); return DEMO.filter(d => d.role === 'learner').slice(0, 24).map(d => {
      let sit = 0, last = 0; for (let i = 0; i < 14; i++) { const t = Date.now() - i * DAY; if (rnd(d.handle, utcDay(t), 'on') < d.activity) { sit++; last = Math.max(last, t) } }
      return { user: pub(d), sittings: sit, accuracy: Math.min(.99, d.skill + (rnd(d.handle, utcDay(ws)) - .5) * .1), secure: Math.round(d.skill * 600 * (.6 + rnd(d.handle, 'sec') * .4)), lastActive: last }
    })
  },
  async create_assignment(gid, a) { const s = load(), u = me(); const x: Assignment = { ...a, id: crypto.randomUUID(), by: u.user.name }; (s.assignments[gid] ??= []).push(x); save(); return x },
  async moderation_queue() { await wait(); return [...load().reports].reverse() },
  async resolve_report(id) { const r = load().reports.find(x => x.id === id); if (r) r.state = 'resolved'; save() },

  async email(subject, body) { const s = load(), u = me(); (s.outbox[u.userId] ??= []).unshift({ id: crypto.randomUUID(), at: Date.now(), subject, body }); s.outbox[u.userId] = s.outbox[u.userId].slice(0, 30); save() },
  async outbox() { return load().outbox[me().userId] ?? [] },
}

function groupView(id: string, uid: string): Circle {
  const s = load(), ws = weekStart(); const members = DEMO.filter(d => d.role === 'learner').slice(0, 22)
  let done = 0; for (const m of members) for (let i = 0; i < 7; i++) { const t = ws + i * DAY; if (t <= Date.now() && rnd(m.handle, utcDay(t), 'on') < m.activity) done++ }
  const mine = ((s.snapshots[uid]?.data?.history ?? []) as { at: number }[]).filter(h => h.at >= ws).length
  const fri = new Date(ws + 4 * DAY); fri.setHours(19, 0, 0, 0)
  const seeded: Assignment = { id: 'a-seed', title: 'This week’s memory verse', lessons: [], count: 10, due: ws + 5 * DAY, by: 'Bro. Femi', focus: ['verses'] }
  return { id, name: 'Grace Youth Circle', members: [...members.map(pub), user(uid)].filter(Boolean) as PublicUser[], coaches: [pub(user('d-bro.femi') as DemoUser)], goal: { target: 200, done: done + mine },
    assignments: [seeded, ...(s.assignments[id] ?? [])], quizNight: { at: fri.getTime() < Date.now() ? fri.getTime() + WEEK : fri.getTime(), room: 'LAMP', signedUp: 41 + Math.floor(rnd(utcDay(Date.now())) * 23) }, muted: !!s.muted[`${uid}|${id}`], joined: true }
}
export const demoPeople = () => DEMO.filter(d => d.role === 'learner').map(pub)
export const demoSkill = (id: string) => DEMO.find(d => d.id === id)?.skill ?? .7
export { rnd as demoRnd, weekStart, utcDay }
