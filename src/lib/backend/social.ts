// Community, organisation and administration services (PRD 9.12–9.17, CP-12, FR-IN-06..09).
// The demo version keeps everything in this browser and simulates other people from the date;
// the live version calls the Supabase RPCs of the same names. Demo people are always labelled.
import type { PublicUser, Role } from './types'
import { DEMO_USERS, demoAllPeople, demoRnd, demoSession, demoUserById, demoWeekPoints, utcDay, weekStart } from './demo'
import { rpc } from './live'

const DAY = 86400000, WEEK = 7 * DAY
export type BoardScope = 'week' | 'season' | 'all' | 'friends' | 'org'
export interface BoardRow { rank: number; user: PublicUser; points: number; you: boolean; hidden?: boolean }
export interface PrivateLeague { id: string; name: string; code: string; owner: string; members: string[]; createdAt: number; note?: string }
export interface InboxItem { id: string; at: number; kind: 'system' | 'moderation' | 'assignment' | 'league' | 'consent' | 'dm'; title: string; body: string; read?: boolean; link?: string; action?: { type: 'connection'; user: string } }
export interface DM { id: string; from: string; to: string; text: string; sticker?: string; at: number; deleted?: boolean }
export interface Thread { with: PublicUser; last: DM | null; unread: number }
export interface Season { id: string; name: string; from: string; to: string; active: boolean }
export interface Org { id: string; name: string; code: string; manuals: string[]; members: number; region: string }
export interface CatalogueManual { code: string; title: string; status: 'published' | 'licensed' | 'retired' | 'draft'; version: string; checksum: string; orgs: string[]; retiredAt?: number }
export interface Consent { id: string; uid: string; handle: string; guardian: string; at: number; state: 'pending' | 'granted' | 'declined' }
export interface Sanction { id: string; uid: string; kind: 'warn' | 'mute' | 'suspend' | 'ban' | 'remove' | 'reset'; reason: string; at: number; until?: number; by: string }
export interface Verification { u: string; state: 'approved' | 'corrected' | 'flagged'; note: string; correction?: string; by: string; at: number }
export interface Anomaly { id: string; manual: string; lesson: string; where: string; kind: string; detail: string; state: 'open' | 'kept' | 'fixed'; at: number }
export interface RoomOptions { lessons: string[]; formats: ('mcq' | 'typed')[]; count: number; seconds: number; cap: number }
export interface Room { code: string; host: string; hostName: string; options: RoomOptions; createdAt: number; manual: string
  // live only: the server's match behind the room
  id?: string; kind?: 'room' | 'duel'; status?: 'lobby' | 'live' | 'finished' | 'cancelled'; players?: number; playerList?: PublicUser[]; amHost?: boolean; amPlayer?: boolean; startsAt?: number | null }
/** Server-timed play (live): what match_state returns. */
export interface RoomState { status: string; position: number; question_count: number; seconds: number; reveal_seconds: number; server_time: string; base: string | null
  opens_at: string | null; closes_at: string | null
  question: { position: number; format: 'mcq' | 'typed'; prompt: { instruction: string; text?: string; ref?: string; title?: string }; options: string[] | null; answer_kind: string } | null
  players: { name: string; score: number; me: boolean }[] }
export interface RoomReveal { answer: string; correct_option: number | null; lesson: string; answered: number; correct: number; option_counts: Record<string, number> | null
  mine: { is_correct: boolean; points: number } | null; scripture: { ref: string; verses: { c: number; v: number; t: string }[] | null }[] }
export interface MockSet { id: string; group: string; title: string; lessons: string[]; count: number; minutes: number; due: number; by: string; at: number }
export interface Submission { uid: string; user: PublicUser; score: number; at: number; usedS: number; flagged?: string }
export interface Safety { birthYear?: number; guardian?: boolean; dmFrom: 'everyone' | 'connections' | 'nobody'; visibility: 'public' | 'hidden' }

export interface Social {
  leaderboard(scope: BoardScope, manual: string): Promise<BoardRow[]>
  seasons(): Promise<Season[]>
  my_leagues(): Promise<PrivateLeague[]>
  create_league(name: string, note?: string): Promise<PrivateLeague>
  league_preview(code: string): Promise<PrivateLeague & { ownerUser?: PublicUser }>
  join_league_code(code: string): Promise<PrivateLeague>
  leave_private(id: string): Promise<void>
  league_table(id: string): Promise<BoardRow[]>
  inbox(): Promise<InboxItem[]>
  mark_read(ids: string[]): Promise<void>
  set_safety(s: Safety): Promise<void>
  can_message(userId: string): Promise<{ ok: boolean; why?: string }>
  threads(): Promise<Thread[]>
  dm(userId: string): Promise<DM[]>
  send_dm(userId: string, text: string, sticker?: string): Promise<DM>
  delete_dm(id: string): Promise<void>
  request_consent(guardian: string): Promise<Consent>
  create_room(manual: string, o: RoomOptions): Promise<Room>
  room(code: string): Promise<Room | null>
  set_mock(group: string, m: Omit<MockSet, 'id' | 'by' | 'at' | 'group'>): Promise<MockSet>
  mocks_for(group: string): Promise<MockSet[]>
  submit_mock(id: string, score: number, usedS: number): Promise<void>
  submissions(id: string): Promise<Submission[]>
  // administration
  catalogue(): Promise<CatalogueManual[]>
  set_manual(code: string, p: Partial<CatalogueManual>): Promise<void>
  save_season(s: Season): Promise<void>
  orgs(): Promise<Org[]>
  save_org(o: Org): Promise<void>
  consents(): Promise<Consent[]>
  decide_consent(id: string, granted: boolean): Promise<void>
  people(q: string): Promise<(PublicUser & { sanctions: Sanction[] })[]>
  sanction(uid: string, kind: Sanction['kind'], reason: string, days?: number): Promise<Sanction>
  my_sanctions(): Promise<Sanction[]>
  verifications(manual: string): Promise<Record<string, Verification>>
  verify(manual: string, v: Omit<Verification, 'by' | 'at'>): Promise<void>
  anomalies(manual: string): Promise<Anomaly[]>
  set_anomaly(id: string, state: Anomaly['state']): Promise<void>
  magic_link(email: string): Promise<void>
  // connections and live play (server-timed; the demo simulates these on the device instead)
  respond_connection(userId: string, accept: boolean): Promise<void>
  create_duel(manual: string, opponent: string, lessons: string[]): Promise<Room>
  join_room(code: string): Promise<Room>
  start_room(id: string): Promise<Room>
  room_state(id: string): Promise<RoomState>
  answer_room(id: string, position: number, answer: string | null, option: number | null): Promise<{ accepted: boolean; is_correct?: boolean; points?: number; reason?: string }>
  room_reveal(id: string, position: number): Promise<RoomReveal>
  finish_room(id: string): Promise<{ standings: { name: string; score: number; correct: number; rank: number | null }[] }>
}

// ---- demo ----------------------------------------------------------------------------------------
const KEY = 'rhemlo.demo.social'
interface Db {
  leagues: PrivateLeague[]; inbox: Record<string, InboxItem[]>; dms: DM[]; sends: Record<string, number[]>; safety: Record<string, Safety>
  consents: Consent[]; rooms: Room[]; mocks: MockSet[]; subs: Record<string, Submission[]>; seasons: Season[]; orgs: Org[]; catalogue: CatalogueManual[]
  sanctions: Sanction[]; verify: Record<string, Record<string, Verification>>; anomalies: Anomaly[]; seen: Record<string, number>
}
const SEASON0: Season[] = [{ id: 's26', name: 'Season 2026–27', from: '2026-09-06', to: '2027-08-29', active: true }, { id: 's25', name: 'Season 2025–26', from: '2025-09-07', to: '2026-08-30', active: false }]
const ORG0: Org[] = [{ id: 'o-grace', name: 'Grace Parish Youth', code: 'GRACE-YOUTH', manuals: ['AD2627', 'EN2627'], members: 64, region: 'Lagos Province 12' }, { id: 'o-lp12', name: 'Lagos Province 12', code: 'LP12', manuals: ['AD2627', 'EN2627', 'TT2627'], members: 412, region: 'Lagos' }]
const CAT0: CatalogueManual[] = [
  { code: 'AD2627', title: 'Adult Sunday School 2026–2027', status: 'published', version: 'gen-1.0 · 21 Oct 2026', checksum: 'sha256:9f1c…a73e', orgs: [] },
  { code: 'EN2627', title: 'YAYA Sunday School 2026–2027', status: 'published', version: 'gen-1.0 · 21 Oct 2026', checksum: 'sha256:41be…0d92', orgs: [] },
  { code: 'TT2627', title: 'Teens Sunday School 2026–2027', status: 'licensed', version: 'awaiting import', checksum: '—', orgs: ['o-lp12'] },
  { code: 'AD2526', title: 'Adult Sunday School 2025–2026', status: 'retired', version: 'gen-0.9', checksum: 'sha256:77aa…19c0', orgs: [], retiredAt: Date.UTC(2026, 7, 31) },
]
const ANOM0 = (m: string): Anomaly[] => [
  { id: `${m}-a1`, manual: m, lesson: 'L03', where: 'Outline 2, sentence 4', kind: 'Printed typo kept', detail: 'The manual prints “recieve”. Kept as printed; graded as printed.', state: 'kept', at: Date.UTC(2026, 9, 18) },
  { id: `${m}-a2`, manual: m, lesson: 'L11', where: 'Bible passage line', kind: 'Reference range', detail: 'Printed as “Acts 2:1-4,” with a trailing comma. Parsed as Acts 2:1–4.', state: 'fixed', at: Date.UTC(2026, 9, 19) },
  { id: `${m}-a3`, manual: m, lesson: 'L27', where: 'Conclusion', kind: 'Hyphenation', detail: 'Line-break hyphen “every-thing” in the scan. Needs a steward decision.', state: 'open', at: Date.UTC(2026, 9, 20) },
]
const fresh = (): Db => ({ leagues: [], inbox: {}, dms: [], sends: {}, safety: {}, consents: [], rooms: [], mocks: [], subs: {}, seasons: SEASON0, orgs: ORG0, catalogue: CAT0, sanctions: [], verify: {}, anomalies: [...ANOM0('AD2627'), ...ANOM0('EN2627')], seen: {} })
let D: Db
const load = () => { if (D) return D; try { D = { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { D = fresh() } return D }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(D)) } catch { /* private mode */ } }
const me = () => { const s = demoSession(); if (!s) throw new Error('Please sign in to use this.'); return s }
const who = (id: string) => demoUserById(id) ?? { id, handle: 'someone', name: 'Someone', cw: 'classic', tier: 'bronze' as const, role: 'learner' as Role }
const wait = (ms = 160) => new Promise(r => setTimeout(r, ms))
const code6 = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('')
const thread = (a: string, b: string) => [a, b].sort().join('~')
const notify = (uid: string, i: Omit<InboxItem, 'id' | 'at'>) => { const d = load(); (d.inbox[uid] ??= []).unshift({ id: crypto.randomUUID(), at: Date.now(), ...i }); d.inbox[uid] = d.inbox[uid].slice(0, 80) }
// demo personas are adults with ages on file; new accounts start with no age, so the under-18 rules apply until they add one
const PERSONA_SAFETY: Record<string, Safety> = { 'd-tiwa_lamp': { birthYear: 2001, dmFrom: 'connections', visibility: 'public' }, 'd-bro.femi': { birthYear: 1986, dmFrom: 'connections', visibility: 'public' }, 'd-sis.ada': { birthYear: 1990, dmFrom: 'connections', visibility: 'public' }, 'd-admin.ola': { birthYear: 1978, dmFrom: 'connections', visibility: 'public' } }
const safetyOf = (id: string) => load().safety[id] ?? PERSONA_SAFETY[id]
const isMinor = (s?: Safety) => !s?.birthYear || new Date().getFullYear() - s.birthYear < 18 // unknown age is treated as under 18
const friendsOf = (uid: string): string[] => { try { return JSON.parse(localStorage.getItem('rhemlo.demo.server') ?? '{}').friends?.[uid] ?? [] } catch { return [] } }
const activeSanction = (uid: string, kinds: Sanction['kind'][]) => load().sanctions.find(x => x.uid === uid && kinds.includes(x.kind) && (!x.until || x.until > Date.now()))
function seasonPoints(id: string, from: number, to = Date.now()) { const u = DEMO_USERS.find(x => x.id === id); if (!u) return 0; let p = 0; for (let w = weekStart(from); w < to; w += WEEK) p += demoWeekPoints(u, w, to); return p }

function seedInbox(uid: string) {
  const d = load(); if (d.seen[uid]) return; d.seen[uid] = Date.now()
  notify(uid, { kind: 'system', title: 'Welcome to your inbox', body: 'Assignments, league results, safety notices and messages from your coach arrive here. Nothing here is ever an advert.' })
  notify(uid, { kind: 'assignment', title: 'New from Bro. Femi: Quarter 1 mock', body: 'A 50-question timed mock is due Saturday. It counts for your circle, not for leagues.', link: '/circle/grace-youth' })
  notify(uid, { kind: 'league', title: 'Your weekly league result is ready', body: 'See where you finished and whether you moved tier.', link: '/arena' })
  save()
}

export const demoSocial: Social = {
  async leaderboard(scope, manual) {
    await wait(); const u = me(), d = load(), now = Date.now(); void manual
    const season = d.seasons.find(s => s.active) ?? SEASON0[0]
    const pts = (id: string) => scope === 'week' ? demoWeekPoints(DEMO_USERS.find(x => x.id === id)!, weekStart(), now) : scope === 'all' ? seasonPoints(id, Date.UTC(2025, 8, 7)) : seasonPoints(id, Date.parse(season.from))
    let ids = DEMO_USERS.filter(x => x.role === 'learner' && x.id !== u.userId).map(x => x.id)
    if (scope === 'friends') ids = ids.filter(id => friendsOf(u.userId).includes(id))
    if (scope === 'org') ids = ids.slice(0, 22)
    const mine = (() => { const snap = JSON.parse(localStorage.getItem('rhemlo.demo.server') ?? '{}').snapshots?.[u.userId]?.data; return Math.round(((snap?.points as number) ?? 0) * (scope === 'week' ? .15 : 1)) })()
    const rows = [...ids.map(id => ({ user: who(id), points: pts(id), you: false, hidden: !!d.safety[id] && d.safety[id].visibility === 'hidden' })), { user: u.user, points: mine, you: true, hidden: d.safety[u.userId]?.visibility === 'hidden' }]
      .filter(r => !activeSanction(r.user.id, ['ban', 'remove'])).sort((a, b) => b.points - a.points)
    return rows.map(r => ({ ...r, rank: 1 + rows.filter(x => x.points > r.points).length, user: r.hidden && !r.you ? { ...r.user, handle: 'Hidden learner', name: 'Hidden learner' } : r.user }))
  },
  async seasons() { return load().seasons },
  async my_leagues() { const u = me(); const d = load()
    if (!d.leagues.some(l => l.id === 'pl-seed')) { d.leagues.push({ id: 'pl-seed', name: 'Province 12 Youth Cup', code: 'P12CUP', owner: 'd-bro.femi', members: [...DEMO_USERS.filter(x => x.role === 'learner').slice(0, 14).map(x => x.id), 'd-tiwa_lamp'], createdAt: Date.UTC(2026, 8, 6), note: 'Season-long, all lessons. Winner reads at the province finale.' }); save() }
    return d.leagues.filter(l => l.members.includes(u.userId) || l.owner === u.userId) },
  async create_league(name, note) { const u = me(), d = load(); const l: PrivateLeague = { id: crypto.randomUUID(), name: name.trim().slice(0, 40) || 'My league', code: code6(), owner: u.userId, members: [u.userId], createdAt: Date.now(), note }; d.leagues.push(l); save(); return l },
  async league_preview(code) { await wait(); await demoSocial.my_leagues().catch(() => []); const l = load().leagues.find(x => x.code === code.toUpperCase()); if (!l) throw new Error('No league uses that invite code. Check the link with whoever sent it.'); return { ...l, ownerUser: who(l.owner) } },
  async join_league_code(code) { const u = me(), l = load().leagues.find(x => x.code === code.toUpperCase()); if (!l) throw new Error('No league uses that invite code.'); if (!l.members.includes(u.userId)) l.members.push(u.userId); save(); return l },
  async leave_private(id) { const u = me(), l = load().leagues.find(x => x.id === id); if (l) l.members = l.members.filter(x => x !== u.userId); save() },
  async league_table(id) {
    const u = me(), l = load().leagues.find(x => x.id === id); if (!l) return []
    const all = await demoSocial.leaderboard('season', ''); return all.filter(r => l.members.includes(r.user.id) || (r.you && l.members.includes(u.userId))).map((r, i, a) => ({ ...r, rank: 1 + a.filter(x => x.points > r.points).length }))
  },
  async inbox() { const u = me(); seedInbox(u.userId); return load().inbox[u.userId] ?? [] },
  async mark_read(ids) { const u = me(); for (const i of load().inbox[u.userId] ?? []) if (ids.includes(i.id)) i.read = true; save() },
  async set_safety(s) { load().safety[me().userId] = s; save() },
  async can_message(id) {
    const u = me(), mine = safetyOf(u.userId), theirs = safetyOf(id) ?? { dmFrom: 'connections', visibility: 'public' }
    if (activeSanction(u.userId, ['mute', 'suspend', 'ban'])) return { ok: false, why: 'Messaging is paused on your account. Check your inbox for the notice.' }
    if (isMinor(mine) && !mine?.guardian) return { ok: false, why: 'Under-18s need a guardian’s consent before direct messages. Request it in You → Privacy.' }
    const connected = friendsOf(u.userId).includes(id) || friendsOf(id).includes(u.userId) || ['d-bro.femi'].includes(id)
    if (isMinor(mine) && !connected) return { ok: false, why: 'Under-18s can only message people they are connected with.' }
    if (theirs.dmFrom === 'nobody') return { ok: false, why: 'This person is not taking direct messages.' }
    if (theirs.dmFrom === 'connections' && !connected) return { ok: false, why: 'This person only takes messages from connections. Connect first.' }
    return { ok: true }
  },
  async threads() {
    const u = me(), d = load(); const mine = d.dms.filter(m => m.from === u.userId || m.to === u.userId)
    const ids = [...new Set([...mine.map(m => m.from === u.userId ? m.to : m.from), 'd-bro.femi', ...friendsOf(u.userId).slice(0, 3)])].filter(x => x !== u.userId)
    return ids.map(id => { const ms = mine.filter(m => m.from === id || m.to === id); return { with: who(id), last: ms[ms.length - 1] ?? null, unread: ms.filter(m => m.from === id && m.at > (d.seen[`${u.userId}|${id}`] ?? 0)).length } }).sort((a, b) => (b.last?.at ?? 0) - (a.last?.at ?? 0))
  },
  async dm(id) {
    const u = me(), d = load(); d.seen[`${u.userId}|${id}`] = Date.now(); save()
    if (id === 'd-bro.femi' && !d.dms.some(m => thread(m.from, m.to) === thread(u.userId, id))) { d.dms.push({ id: crypto.randomUUID(), from: id, to: u.userId, text: 'Well done on this week’s lesson. Remember the Quarter 1 mock is due Saturday.', at: Date.now() - 3 * 3600000 }); save() }
    return d.dms.filter(m => thread(m.from, m.to) === thread(u.userId, id))
  },
  async send_dm(id, text, sticker) {
    const u = me(), d = load(); const can = await demoSocial.can_message(id); if (!can.ok) throw new Error(can.why)
    const t = (d.sends[u.userId] ?? []).filter(x => x > Date.now() - 60000); if (t.length >= 20) throw new Error('Slow down a little: at most 20 messages a minute.')
    if (text.length > 2000) throw new Error('Messages are limited to 2,000 characters.')
    d.sends[u.userId] = [...t, Date.now()]; const m: DM = { id: crypto.randomUUID(), from: u.userId, to: id, text: text.trim(), sticker, at: Date.now() }; d.dms.push(m)
    if (DEMO_USERS.some(x => x.id === id) && demoRnd(m.id) < .6) setTimeout(() => { load().dms.push({ id: crypto.randomUUID(), from: id, to: u.userId, text: ['Amen! Thanks 🙏', 'Let’s review together tonight?', 'Got it, see you at Quiz Night.', 'That verse is tricky, the spelling especially.'][Math.floor(demoRnd(m.id, 'r') * 4)], at: Date.now() }); save() }, 2500)
    save(); return m
  },
  async delete_dm(id) { const u = me(), m = load().dms.find(x => x.id === id && x.from === u.userId); if (m) { m.deleted = true; m.text = ''; m.sticker = undefined } save() },
  async request_consent(guardian) { const u = me(), d = load(); const c: Consent = { id: crypto.randomUUID(), uid: u.userId, handle: u.user.handle, guardian: guardian.trim().toLowerCase(), at: Date.now(), state: 'pending' }; d.consents.push(c)
    notify(u.userId, { kind: 'consent', title: 'Consent request sent', body: `We emailed ${c.guardian}. Direct messages open once they agree. In the demo, an admin (ola@demo.rhemlo.app) can approve it.` }); save(); return c },
  async create_room(manual, o) { const u = me(), d = load(); const r: Room = { code: code6().slice(0, 5), host: u.userId, hostName: u.user.name, options: { ...o, cap: Math.min(100, o.cap) }, createdAt: Date.now(), manual }; d.rooms.push(r); save(); return r },
  async room(code) { return load().rooms.find(r => r.code === code.toUpperCase()) ?? null },
  async set_mock(group, x) { const u = me(), d = load(); const m: MockSet = { ...x, id: crypto.randomUUID(), group, by: u.user.name, at: Date.now() }; d.mocks.push(m); save(); return m },
  async mocks_for(group) {
    const d = load(); if (!d.mocks.some(m => m.id === 'mk-seed')) { const ws = weekStart(); d.mocks.push({ id: 'mk-seed', group: 'grace-youth', title: 'Quarter 1 mock', lessons: ['L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10', 'L11', 'L12', 'L13'], count: 50, minutes: 45, due: ws + 5 * DAY + 18 * 3600000, by: 'Bro. Femi', at: ws }); save() }
    return d.mocks.filter(m => m.group === group)
  },
  async submit_mock(id, score, usedS) { const u = me(), d = load(); const list = (d.subs[id] ??= []); const i = list.findIndex(s => s.uid === u.userId); const s: Submission = { uid: u.userId, user: u.user, score, at: Date.now(), usedS }; if (i >= 0) list[i] = s; else list.push(s); save() },
  async submissions(id) {
    if (id === 'mk-seed') await demoSocial.mocks_for('grace-youth')
    const m = load().mocks.find(x => x.id === id); if (!m) return []
    const sim = DEMO_USERS.filter(x => x.role === 'learner').slice(0, 22).filter(x => demoRnd(x.handle, id, 'sub') < x.activity + .1).map(x => { const score = Math.min(1, Math.max(.3, x.skill + (demoRnd(x.handle, id) - .5) * .2)), usedS = Math.round(m.minutes * 60 * (.55 + demoRnd(x.handle, id, 't') * .4))
      return { uid: x.id, user: who(x.id), score, at: m.at + Math.floor(demoRnd(x.handle, id, 'a') * 4) * DAY, usedS, flagged: usedS < m.minutes * 60 * .6 && score > .95 ? 'Very fast and near-perfect: check fair play' : undefined } })
    return [...sim, ...(load().subs[id] ?? [])].sort((a, b) => b.score - a.score)
  },
  async catalogue() { return load().catalogue },
  async set_manual(code, p) { const d = load(), m = d.catalogue.find(x => x.code === code); if (m) Object.assign(m, p, p.status === 'retired' ? { retiredAt: Date.now() } : {}); save() },
  async save_season(s) { const d = load(); d.seasons = [...d.seasons.filter(x => x.id !== s.id), s].map(x => s.active && x.id !== s.id ? { ...x, active: false } : x).sort((a, b) => b.from.localeCompare(a.from)); save() },
  async orgs() { return load().orgs },
  async save_org(o) { const d = load(); d.orgs = [...d.orgs.filter(x => x.id !== o.id), o]; save() },
  async consents() { const d = load(); if (!d.consents.some(c => c.id === 'c-seed')) { d.consents.push({ id: 'c-seed', uid: 'd-tobi.verse', handle: 'tobi.verse', guardian: 'mrs.adebayo@example.com', at: Date.now() - 2 * DAY, state: 'pending' }); save() } return d.consents },
  async decide_consent(id, granted) { const d = load(), c = d.consents.find(x => x.id === id); if (!c) return; c.state = granted ? 'granted' : 'declined'
    d.safety[c.uid] = { ...(d.safety[c.uid] ?? { dmFrom: 'connections', visibility: 'public' }), guardian: granted }
    notify(c.uid, { kind: 'consent', title: granted ? 'Guardian consent received' : 'Guardian consent declined', body: granted ? 'Direct messages with your connections are now open.' : 'Direct messages stay off. Circles and study are unaffected.' }); save() },
  async people(q) { const d = load(); q = q.trim().toLowerCase(); return demoAllPeople().filter(p => !q || p.handle.includes(q) || p.name.toLowerCase().includes(q)).slice(0, 30).map(p => ({ ...p, sanctions: d.sanctions.filter(s => s.uid === p.id) })) },
  async sanction(uid, kind, reason, days) {
    const u = me(), d = load(); const s: Sanction = { id: crypto.randomUUID(), uid, kind, reason, at: Date.now(), until: days ? Date.now() + days * DAY : undefined, by: u.user.name }; d.sanctions.push(s)
    const what = { warn: 'You have received a warning', mute: `Messaging is paused${days ? ` for ${days} days` : ''}`, suspend: `Your account is suspended${days ? ` for ${days} days` : ''}`, ban: 'Your account is banned from community features', remove: 'Content you posted was removed', reset: 'Your league points were reset' }[kind]
    notify(uid, { kind: 'moderation', title: what, body: `Reason: ${reason || 'Community guidelines'}. Your private study and progress are not affected. Reply through Report a problem to appeal.` }); save(); return s
  },
  async my_sanctions() { const u = me(); return load().sanctions.filter(s => s.uid === u.userId && (!s.until || s.until > Date.now())) },
  async verifications(manual) { return load().verify[manual] ?? {} },
  async verify(manual, v) { const u = me(), d = load(); (d.verify[manual] ??= {})[v.u] = { ...v, by: u.user.name, at: Date.now() }; save() },
  async anomalies(manual) { return load().anomalies.filter(a => a.manual === manual) },
  async set_anomaly(id, state) { const a = load().anomalies.find(x => x.id === id); if (a) a.state = state; save() },
  async respond_connection() { /* demo connections are accepted at once */ },
  ...(Object.fromEntries(['create_duel', 'join_room', 'start_room', 'room_state', 'answer_room', 'room_reveal', 'finish_room'].map(k =>
    [k, async () => { throw new Error('In the demo, rooms and friendly matches are simulated on this device.') }])) as unknown as Pick<Social, 'create_duel' | 'join_room' | 'start_room' | 'room_state' | 'answer_room' | 'room_reveal' | 'finish_room'>),
  async magic_link(email) {
    await wait(400); const box = JSON.parse(localStorage.getItem('rhemlo.demo.magic') ?? '[]') as { email: string; token: string; at: number }[]
    const token = crypto.randomUUID().slice(0, 8); box.unshift({ email: email.trim().toLowerCase(), token, at: Date.now() }); localStorage.setItem('rhemlo.demo.magic', JSON.stringify(box.slice(0, 10)))
  },
}
export const demoMagicLinks = () => { try { return JSON.parse(localStorage.getItem('rhemlo.demo.magic') ?? '[]') as { email: string; token: string; at: number }[] } catch { return [] } }
void utcDay

// ---- live: one RPC per method, same names and arguments --------------------------------------------
export const liveSocial: Social = {
  leaderboard: (scope, manual) => rpc('app_leaderboard', { p_scope: scope, p_edition: manual }),
  seasons: () => rpc('app_seasons'),
  my_leagues: () => rpc('app_my_leagues'),
  create_league: (name, note) => rpc('app_create_league', { p_name: name, p_note: note ?? null }),
  league_preview: (code) => rpc('app_league_preview', { p_code: code }),
  join_league_code: (code) => rpc('app_join_league_code', { p_code: code }),
  leave_private: (id) => rpc('app_leave_private', { p_league: id }),
  league_table: (id) => rpc('app_league_table', { p_league: id }),
  inbox: () => rpc('app_inbox'),
  mark_read: (ids) => rpc('app_mark_read', { p_ids: ids }),
  set_safety: (s) => rpc('app_set_safety', { p_s: s }),
  can_message: (id) => rpc('app_can_message', { p_user: id }),
  threads: () => rpc('app_threads'),
  dm: (id) => rpc('app_dm', { p_user: id }),
  send_dm: (id, text, sticker) => rpc('app_send_dm', { p_user: id, p_text: text, p_sticker: sticker ?? null }),
  delete_dm: (id) => rpc('app_delete_dm', { p_id: id }),
  request_consent: (contact) => rpc('app_request_consent', { p_contact: contact }),
  create_room: (manual, o) => rpc('app_create_room', { p_edition: manual, p_options: o }),
  room: (code) => rpc('app_room', { p_code: code }),
  set_mock: (group, m) => rpc('app_set_mock', { p_group: group, p_m: m }),
  mocks_for: (group) => rpc('app_mocks_for', { p_group: group }),
  submit_mock: (id, score, usedS) => rpc('app_submit_mock', { p_assignment: id, p_score: score, p_used_s: usedS }),
  submissions: (id) => rpc('app_submissions', { p_assignment: id }),
  catalogue: () => rpc('app_catalogue'),
  set_manual: (code, p) => rpc('app_set_manual', { p_code: code, p }),
  save_season: (s) => rpc('app_save_season', { p_s: s }),
  orgs: () => rpc('app_orgs'),
  save_org: (o) => rpc('app_save_org', { p_o: o }),
  consents: () => rpc('app_consents'),
  decide_consent: (id, granted) => rpc('app_decide_consent', { p_id: id, p_granted: granted }),
  people: (q) => rpc('app_people', { p_q: q }),
  sanction: (uid, kind, reason, days) => rpc('app_sanction', { p_user: uid, p_kind: kind, p_reason: reason, p_days: days ?? null }),
  my_sanctions: () => rpc('app_my_sanctions'),
  verifications: (manual) => rpc('app_verifications', { p_edition: manual }),
  verify: (manual, v) => rpc('app_verify', { p_edition: manual, p_v: v }),
  anomalies: (manual) => rpc('app_anomalies', { p_edition: manual }),
  set_anomaly: (id, state) => rpc('app_set_anomaly', { p_id: id, p_state: state }),
  magic_link: async () => { /* live sign-in links are sent by Supabase Auth (api.sendLink) */ },
  respond_connection: async (id, accept) => { await rpc('app_respond_connection', { p_user: id, p_accept: accept }) },
  create_duel: (manual, opponent, lessons) => rpc('app_create_duel', { p_edition: manual, p_opponent: opponent, p_lessons: lessons }),
  join_room: (code) => rpc('app_join_room', { p_code: code }),
  start_room: (id) => rpc('app_start_room', { p_match: id }),
  room_state: (id) => rpc('match_state', { p_match: id }),
  answer_room: (id, position, answer, option) => rpc('answer_match', { p_match: id, p_position: position, p_answer: answer, p_option: option }),
  room_reveal: (id, position) => rpc('app_room_reveal', { p_match: id, p_position: position }),
  finish_room: (id) => rpc('finish_match', { p_match: id }),
}
