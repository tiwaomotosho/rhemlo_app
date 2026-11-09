// Live backend: Supabase (Postgres + the app_* functions in supabase/migrations/0007_app_api.sql).
// Turned on by setting VITE_RHEMLO_BACKEND=live, VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
import type { Backend, PublicUser, Session } from './types'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const SKEY = 'rhemlo.live.session'
type Stored = Session & { refresh?: string; expiresAt?: number }
let session: Stored | null = (() => { try { return JSON.parse(localStorage.getItem(SKEY) ?? 'null') } catch { return null } })()
const keep = () => { if (session) localStorage.setItem(SKEY, JSON.stringify(session)); else localStorage.removeItem(SKEY) }
interface Tokens { access_token: string; refresh_token?: string; expires_in?: number; user: { id: string; email: string } }

/** The server's own words for an error, made readable ("slow down" -> a sentence), never a raw stack. */
function friendly(status: number, body: { message?: string; msg?: string; error_description?: string } | null) {
  const m = body?.message ?? body?.msg ?? body?.error_description ?? ''
  if (status === 401 || /jwt/i.test(m)) return 'Please sign in again. Accepted progress is safe and nothing will be counted twice.'
  if (/slow down/i.test(m)) return 'Slow down a little: at most 20 messages a minute.'
  if (/invalid login credentials/i.test(m)) return 'That email and password do not match an account.'
  if (/already registered/i.test(m)) return 'That email already has an account. Try signing in.'
  if (/email not confirmed/i.test(m)) return 'Confirm your email first: open the link we sent you, then sign in.'
  if (m && m.length < 200 && !/[{}]/.test(m)) return m.charAt(0).toUpperCase() + m.slice(1) + (/[.!?]$/.test(m) ? '' : '.')
  return `The server could not finish that (${status}). Your work on this device is safe.`
}
async function raw<T>(path: string, body?: unknown, method = 'POST', auth = true): Promise<T> {
  if (!URL_ || !KEY) throw new Error('The live server is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  const r = await fetch(`${URL_}${path}`, { method, headers: { apikey: KEY, 'Content-Type': 'application/json', Authorization: `Bearer ${auth && session ? session.token : KEY}` },
    body: body === undefined ? undefined : JSON.stringify(body) })
  if (!r.ok) { const b = await r.json().catch(() => null); const e = new Error(friendly(r.status, b)) as Error & { status?: number }; e.status = r.status; throw e }
  if (r.status === 204) return undefined as T
  const text = await r.text(); return (text ? JSON.parse(text) : null) as T
}
/** Access tokens last an hour: refresh a minute early, and once more if the server says it has expired. */
async function fresh() {
  if (!session?.refresh || !session.expiresAt || Date.now() < session.expiresAt - 60_000) return
  try { const t = await raw<Tokens>('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh }, 'POST', false); setTokens(t) }
  catch { /* the next call reports "sign in again" */ }
}
function setTokens(t: Tokens) { if (!session) return; session.token = t.access_token; if (t.refresh_token) session.refresh = t.refresh_token; session.expiresAt = Date.now() + (t.expires_in ?? 3600) * 1000; keep() }
async function call<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  await fresh()
  try { return await raw<T>(path, body, method) }
  catch (e) { if ((e as { status?: number }).status === 401 && session?.refresh) { session.expiresAt = 0; await fresh(); return raw<T>(path, body, method) } throw e }
}
export const rpc = <T,>(name: string, args: Record<string, unknown> = {}) => call<T>(`/rest/v1/rpc/${name}`, args)

async function startSession(t: Tokens) {
  session = { userId: t.user.id, email: t.user.email, token: t.access_token, refresh: t.refresh_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000,
    user: { id: t.user.id, handle: '', name: '', cw: 'classic', tier: 'bronze', role: 'learner' } }
  keep()
  const me = await rpc<PublicUser & { email: string }>('app_me')
  session.user = { id: me.id, handle: me.handle, name: me.name, cw: me.cw, tier: me.tier, role: me.role }; keep()
  return session as Session
}

/** The plain answer the server marks: typed text, the chosen option, or "Book c:v" from the two reference boxes. */
export function plainAnswer(v: string) {
  try {
    const r = JSON.parse(v) as { kind: string; value?: string; values?: string[] }
    if (r.kind === 'text' || r.kind === 'choice') return r.value ?? ''
    if (r.kind === 'fields') return (r.values ?? []).join(' ').replace(/\s+/g, ' ').trim()
    return (r.values ?? []).join('; ')
  } catch { return v }
}

export const live: Backend = {
  mode: 'live',
  session: () => session,
  demoAccounts: () => [],
  async signUp(email, password, handle, name) {
    const t = await raw<Tokens & { id?: string }>('/auth/v1/signup', { email, password, data: { handle, display_name: name } }, 'POST', false)
    if (!t.access_token) throw new Error('Check your email: open the confirmation link we sent, then sign in.')
    return startSession(t)
  },
  async signIn(email, password) { return startSession(await raw<Tokens>('/auth/v1/token?grant_type=password', { email, password }, 'POST', false)) },
  async sendLink(email) { await raw('/auth/v1/otp', { email, create_user: false, options: { emailRedirectTo: `${location.origin}/auth/callback` } }, 'POST', false) },
  /** Finish an email-link sign-in: `token` is the URL fragment Supabase redirects back with (#access_token=…). */
  async redeemLink(token) {
    const p = new URLSearchParams(token.replace(/^#/, ''))
    const access = p.get('access_token'); if (!access) throw new Error(p.get('error_description') ?? 'That sign-in link has expired. Ask for a new one.')
    session = { userId: '', email: '', token: access, user: { id: '', handle: '', name: '', cw: 'classic', tier: 'bronze', role: 'learner' } }
    const u = await raw<{ id: string; email: string }>('/auth/v1/user', undefined, 'GET')
    return startSession({ access_token: access, refresh_token: p.get('refresh_token') ?? undefined, expires_in: +(p.get('expires_in') ?? 3600), user: u })
  },
  async signOut() { await raw('/auth/v1/logout').catch(() => {}); session = null; keep() },
  pushSnapshot: (data) => rpc<number>('app_push_snapshot', { p_data: data }),
  pullSnapshot: () => rpc('app_pull_snapshot'),
  // arena
  join_league: (manual) => rpc('app_join_tier_league', { p_edition: manual ?? null }),
  leave_league: () => rpc('app_leave_tier_league'),
  league_standings: () => rpc('app_tier_standings'),
  last_week_result: () => rpc('app_last_week_result'),
  daily_challenge: (manual) => rpc('app_daily_challenge', { p_edition: manual }),
  submit_challenge: (id, answers) => rpc('app_submit_challenge', { p_match: id, p_answers: answers.map(a => ({ u: a.u, value: plainAnswer(a.value), ms: a.ms })) }),
  challenge_state: (id) => rpc('app_challenge_state', { p_match: id }),
  // friendly matches are server-timed rooms when live (see social.create_duel); these demo-only calls are not used
  create_match: async () => { throw new Error('Friendly matches use live rooms.') },
  match_state: async () => { throw new Error('Friendly matches use live rooms.') },
  opponent_answer: async () => ({ value: '', ms: 0 }),
  finish_match: async () => { throw new Error('Friendly matches use live rooms.') },
  // community
  friends: () => rpc('app_friends'),
  search_users: (q) => rpc('app_search_users', { p_q: q }),
  request_connection: async (id) => { await rpc('app_request_connection', { p_user: id }) },
  friends_feed: () => rpc('app_friends_feed'),
  cheer: (id, kind) => rpc('app_cheer', { p_feed: id, p_kind: kind }),
  coop: () => rpc('app_coop'),
  my_groups: () => rpc('app_my_groups'),
  join_group: (code) => rpc('app_join_group', { p_code: code }),
  leave_group: (id) => rpc('app_leave_group', { p_group: id }),
  mute_group: (id, muted) => rpc('app_mute_group', { p_group: id, p_muted: muted }),
  messages: (gid) => rpc('app_group_messages', { p_group: gid }),
  send_message: (gid, text) => rpc('app_send_group_message', { p_group: gid, p_text: text }),
  block_user: (id) => rpc('block_user', { p_other: id }),
  blocked: () => rpc('app_blocked'),
  report: (kind, target, reason, note) => rpc('app_report', { p_kind: kind, p_target: target, p_reason: reason, p_note: note }),
  // roles
  group_progress: (gid) => rpc('app_group_progress', { p_group: gid }),
  create_assignment: (gid, a) => rpc('app_create_assignment', { p_group: gid, p_a: a }),
  moderation_queue: () => rpc('app_moderation_queue'),
  resolve_report: (id) => rpc('app_resolve_report', { p_id: id }),
  // notifications (the mail job sends what app_email queues)
  email: (subject, body) => rpc('app_email', { p_subject: subject, p_body: body }),
  outbox: () => rpc('app_outbox'),
}
