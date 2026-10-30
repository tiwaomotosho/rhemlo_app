// Live backend: Supabase (Postgres + the RPCs in the bundle's db/migrations). Turned on by setting
// VITE_RHEMLO_BACKEND=live, VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.
// Parameter names below follow the migrations as written; confirm each against 0003–0006 when the
// database is first deployed (the migrations have never been run against a live project).
import type { Backend, Session } from './types'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const SKEY = 'rhemlo.live.session'
let session: Session | null = (() => { try { return JSON.parse(localStorage.getItem(SKEY) ?? 'null') } catch { return null } })()
const headers = () => ({ apikey: KEY!, 'Content-Type': 'application/json', Authorization: `Bearer ${session?.token ?? KEY}` })
async function call<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  if (!URL_ || !KEY) throw new Error('The live server is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  const r = await fetch(`${URL_}${path}`, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) })
  if (!r.ok) throw new Error(r.status === 401 ? 'Please sign in again. Accepted progress is safe and nothing will be counted twice.' : `The server could not finish that (${r.status}). Your work on this device is safe.`)
  return r.status === 204 ? (undefined as T) : r.json()
}
const rpc = <T,>(name: string, args: Record<string, unknown> = {}) => call<T>(`/rest/v1/rpc/${name}`, args)
async function startSession(t: { access_token: string; user: { id: string; email: string } }) {
  const [p] = await call<{ id: string; handle: string; display_name: string; colorway: string; role: string }[]>(`/rest/v1/profiles?id=eq.${t.user.id}&select=*`, undefined, 'GET').catch(() => [])
  session = { userId: t.user.id, email: t.user.email, token: t.access_token, user: { id: t.user.id, handle: p?.handle ?? '', name: p?.display_name ?? '', cw: p?.colorway ?? 'classic', tier: 'bronze', role: (p?.role as 'learner') ?? 'learner' } }
  localStorage.setItem(SKEY, JSON.stringify(session)); return session
}

export const live: Backend = {
  mode: 'live',
  session: () => session,
  demoAccounts: () => [],
  async signUp(email, password, handle, name) { const t = await call<{ access_token: string; user: { id: string; email: string } }>('/auth/v1/signup', { email, password, data: { handle, display_name: name } }); return startSession(t) },
  async signIn(email, password) { const t = await call<{ access_token: string; user: { id: string; email: string } }>('/auth/v1/token?grant_type=password', { email, password }); return startSession(t) },
  async signOut() { await call('/auth/v1/logout').catch(() => {}); session = null; localStorage.removeItem(SKEY) },
  async pushSnapshot(data) { await rpc('submit_reviews', { payload: data }); return Date.now() },
  async pullSnapshot() { return null },
  join_league: () => rpc('join_league'),
  leave_league: () => rpc('leave_league'),
  league_standings: () => rpc('league_standings'),
  last_week_result: () => rpc('my_league_position'),
  daily_challenge: (manual) => rpc('daily_challenge', { p_edition: manual }),
  submit_challenge: (id, answers) => rpc('award_points', { p_attempt: id, p_answers: answers }),
  challenge_state: (id) => rpc('daily_challenge', { p_attempt: id }),
  create_match: (opponentId) => rpc('create_match', { p_opponent: opponentId }),
  match_state: (id) => rpc('match_state', { p_match: id }),
  opponent_answer: (id, q) => rpc('match_reveal', { p_match: id, p_question: q }),
  finish_match: (id) => rpc('finish_match', { p_match: id }),
  friends: () => rpc('friends_board'),
  search_users: (q) => call(`/rest/v1/public_profiles?handle=ilike.*${encodeURIComponent(q)}*&limit=6`, undefined, 'GET'),
  request_connection: (id) => rpc('request_connection', { p_user: id }),
  friends_feed: () => rpc('friends_board', { p_feed: true }),
  cheer: (id, kind) => rpc('notify', { p_feed: id, p_kind: kind }),
  coop: () => rpc('group_daily', { p_coop: true }),
  my_groups: () => rpc('group_progress'),
  join_group: (code) => rpc('join_group', { p_code: code }),
  leave_group: (id) => rpc('join_group', { p_group: id, p_leave: true }),
  mute_group: (id, muted) => rpc('mark_chat_read', { p_group: id, p_muted: muted }),
  messages: (gid) => call(`/rest/v1/messages?conversation_id=eq.${gid}&order=created_at.asc&limit=200`, undefined, 'GET'),
  send_message: (gid, text) => rpc('send_message', { p_conversation: gid, p_body: text }),
  block_user: (id) => rpc('block_user', { p_user: id }),
  blocked: () => call(`/rest/v1/user_blocks?select=blocked_id`, undefined, 'GET'),
  report: (kind, target, reason, note) => rpc('report', { p_kind: kind, p_target: target, p_reason: reason, p_note: note }),
  group_progress: (gid) => rpc('group_progress', { p_group: gid }),
  create_assignment: (gid, a) => call(`/rest/v1/group_assignments`, { group_id: gid, ...a }),
  moderation_queue: () => rpc('moderation_queue'),
  resolve_report: (id) => rpc('moderate', { p_report: id, p_action: 'resolve' }),
  email: async () => { /* sent by the server's notify() job */ },
  outbox: async () => [],
}
