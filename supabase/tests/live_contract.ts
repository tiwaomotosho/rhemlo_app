// Contract test: drives the app's real live adapters (src/lib/backend/live.ts and liveSocial) against a TEST
// database, through a small stand-in for Supabase's /rest/v1/rpc endpoint that behaves like PostgREST: it
// switches to the 'authenticated' role, sets the JWT claims, and calls the function with NAMED parameters,
// so a misspelt parameter or a wrong type fails exactly as it would on Supabase.
//
// Run after supabase/tests/run_local.sh (it reuses that test's users, circle and data):
//   TEST_DB=postgres://postgres@127.0.0.1:54329/rhemlo_test bun supabase/tests/live_contract.ts
import { SQL } from 'bun'

const DB = process.env.TEST_DB ?? 'postgres://postgres@127.0.0.1:54329/rhemlo_test'
if (!/test/.test(DB)) throw new Error('refusing: TEST_DB must name a test database')
const db = new SQL(DB)
const U = { tola: 'a1000000-0000-4000-8000-000000000001', kemi: 'a1000000-0000-4000-8000-000000000002', tobi: 'a1000000-0000-4000-8000-000000000003',
            ola: 'a1000000-0000-4000-8000-000000000004', ada: 'a1000000-0000-4000-8000-000000000005' }
const GROUP = 'b1000000-0000-4000-8000-000000000001'
let current = U.tola

// ---- the PostgREST stand-in ----------------------------------------------------------------------------
const sigs = new Map<string, Map<string, string>>()
for (const r of await db`select p.proname as name, coalesce(p.proargnames, '{}') as names,
    array(select format_type(t, null) from unnest(p.proargtypes::oid[]) with ordinality u(t, o) order by o) as types
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`) {
  const m = new Map<string, string>(); (r.names as string[]).forEach((a, i) => { if (a && (r.types as string[])[i]) m.set(a, (r.types as string[])[i]) }); sigs.set(r.name, m)
}
const server = Bun.serve({ port: 3011, async fetch(req) {
  const name = new URL(req.url).pathname.replace(/^\/rest\/v1\/rpc\//, '')
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const sig = sigs.get(name), keys = Object.keys(body)
  if (!sig || keys.some(k => !sig.has(k))) return Response.json({ message: `Could not find the function public.${name}(${keys.join(', ')}) in the schema cache` }, { status: 404 })
  const vals: unknown[] = [], args = keys.map((k, i) => {
    const t = sig.get(k)!, v = body[k]
    // the driver JSON-encodes values bound as jsonb, so pass objects and arrays as they are
    if (t.endsWith('[]')) { vals.push(v ?? null); return `${k} => (select array_agg(x::${t.slice(0, -2)}) from jsonb_array_elements_text($${i + 1}::jsonb) x)` }
    vals.push(v == null ? null : t === 'jsonb' || t === 'json' ? v : String(v)); return `${k} => $${i + 1}::${t}`
  })
  try {
    const out = await db.begin(async tx => {
      await tx.unsafe('set local role authenticated')
      await tx.unsafe(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: current, role: 'authenticated' })])
      const r = await tx.unsafe(`select to_jsonb(${name}(${args.join(', ')})) as r`, vals)
      return r[0]?.r ?? null
    })
    return out == null ? new Response(null, { status: 204 }) : new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } })   // like PostgREST, scalars too
  } catch (e) { return Response.json({ message: (e as Error).message }, { status: 400 }) }
} })

// ---- the app's adapters, configured for "live" -----------------------------------------------------------
const store: Record<string, string> = { 'rhemlo.live.session': JSON.stringify({ userId: U.tola, email: 'tola@example.com', token: 'test', expiresAt: Date.now() + 1e9,
  user: { id: U.tola, handle: 'tolareads', name: 'Tola', cw: 'classic', tier: 'bronze', role: 'learner' } }) }
Object.assign(globalThis, { localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v }, removeItem: (k: string) => { delete store[k] } },
  location: { origin: 'http://localhost' } })
Object.assign(process.env, { VITE_SUPABASE_URL: `http://127.0.0.1:${server.port}`, VITE_SUPABASE_ANON_KEY: 'anon', VITE_RHEMLO_BACKEND: 'live' })
const { live } = await import('../../src/lib/backend/live')
const { liveSocial: social } = await import('../../src/lib/backend/social')

let pass = 0; const fails: string[] = []
/** Call through the adapter; `allow` lists business-rule refusals that still prove the contract (right name, right types). */
async function t<T>(label: string, fn: () => Promise<T>, allow: string[] = []): Promise<T | undefined> {
  try { const r = await fn(); pass++; return r }
  catch (e) { const m = (e as Error).message
    if (allow.some(a => m.toLowerCase().includes(a.toLowerCase()))) { pass++; return undefined }
    fails.push(`${label}: ${m}`); return undefined }
}
const as = (u: keyof typeof U) => { current = U[u] }

// ---- learner ----
as('tola')
await t('pushSnapshot', () => live.pushSnapshot({ points: 310, history: [], done: {}, cards: {}, profile: { glim: 'ocean' } }))
await t('pullSnapshot', () => live.pullSnapshot())
await t('join_league', () => live.join_league('AD2627'))
await t('league_standings', () => live.league_standings())
await t('last_week_result', () => live.last_week_result())
const dc = await t('daily_challenge', () => live.daily_challenge('AD2627', []))
if (dc) {
  await t('challenge_state', () => live.challenge_state(dc.id))
  await t('submit_challenge', () => live.submit_challenge(dc.id, [{ u: dc.items[0], value: JSON.stringify({ kind: 'fields', values: ['Colossians', '1:17'] }), ms: 3000 }], () => false))
}
await t('friends', () => live.friends())
await t('search_users', () => live.search_users('kem'))
await t('request_connection', () => live.request_connection(U.kemi))
const feed = await t('friends_feed', () => live.friends_feed())
if (feed?.length) await t('cheer', () => live.cheer(feed[0].id, 'clap'), ['friends only'])
await t('coop', () => live.coop())
await t('my_groups', () => live.my_groups())
await t('join_group', () => live.join_group('GRACE-T'))
await t('mute_group', () => live.mute_group(GROUP, false))
const msg = await t('send_message', () => live.send_message(GROUP, 'Contract test hello'))
await t('messages', () => live.messages(GROUP))
await t('blocked', () => live.blocked())
await t('report (message)', () => live.report('message', msg!.id, 'Spam', 'contract'))
await t('report (user)', () => live.report('user', U.kemi, 'Something else', ''))
await t('report (content)', () => live.report('content', 'I-329088973e713664', 'A typo', ''))
await t('group_progress (learner refused)', () => live.group_progress(GROUP), ['only coaches'])
await t('email', () => live.email('Weekly report', 'Body'))
await t('outbox', () => live.outbox())

await t('leaderboard week', () => social.leaderboard('week', 'AD2627'))
await t('leaderboard season', () => social.leaderboard('season', 'AD2627'))
await t('leaderboard all', () => social.leaderboard('all', 'AD2627'))
await t('leaderboard friends', () => social.leaderboard('friends', 'AD2627'))
await t('leaderboard org', () => social.leaderboard('org', 'AD2627'))
await t('seasons', () => social.seasons())
const lg = await t('create_league', () => social.create_league('Contract Cup', 'Contract note'))
await t('my_leagues', () => social.my_leagues())
if (lg) { await t('league_preview', () => social.league_preview(lg.code)); await t('league_table', () => social.league_table(lg.id)) }
const inbox = await t('inbox', () => social.inbox())
if (inbox?.length) await t('mark_read', () => social.mark_read(inbox.map(i => i.id)))
await t('set_safety', () => social.set_safety({ dmFrom: 'connections', visibility: 'public' }))
await t('can_message', () => social.can_message(U.kemi))
await t('threads', () => social.threads())
const dm = await t('send_dm', () => social.send_dm(U.kemi, 'Contract DM'))
await t('send_dm sticker', () => social.send_dm(U.kemi, '', '🔥'))
await t('dm', () => social.dm(U.kemi))
if (dm) await t('delete_dm', () => social.delete_dm(dm.id))
const room = await t('create_room', () => social.create_room('AD2627', { lessons: ['L01', 'L02'], formats: ['mcq', 'typed'], count: 5, seconds: 10, cap: 30 }))
if (room) {
  await t('room', () => social.room(room.code))
  as('kemi'); await t('join_room', () => social.join_room(room.code)); as('tola')
  await t('start_room', () => social.start_room(room.id!))
  await t('room_state', () => social.room_state(room.id!))
  await t('answer_room', () => social.answer_room(room.id!, 1, null, 1))
  await t('room_reveal (still open)', () => social.room_reveal(room.id!, 1), ['still open'])
  await t('finish_room', () => social.finish_room(room.id!))
}
await t('create_duel', () => social.create_duel('AD2627', U.kemi, ['L01']))
const mocks = await t('mocks_for', () => social.mocks_for(GROUP))
if (mocks?.length) await t('submit_mock', () => social.submit_mock(mocks[0].id, 0.82, 1500))
await t('respond_connection', () => social.respond_connection(U.kemi, true))
await t('my_sanctions', () => social.my_sanctions())
await t('catalogue', () => social.catalogue())
if (lg) { as('kemi'); await t('join_league_code', () => social.join_league_code(lg.code)); await t('leave_private', () => social.leave_private(lg.id)); as('tola') }

// ---- coach ----
as('kemi')
await t('group_progress', () => live.group_progress(GROUP))
await t('create_assignment', () => live.create_assignment(GROUP, { title: 'Contract work', lessons: ['L01'], count: 10, due: Date.now() + 86400000, focus: ['verses'] }))
const mk = await t('set_mock', () => social.set_mock(GROUP, { title: 'Contract mock', lessons: ['L01', 'L02'], count: 20, minutes: 20, due: Date.now() + 86400000 }))
if (mk) await t('submissions', () => social.submissions(mk.id))

// ---- admin ----
as('ola')
const q = await t('moderation_queue', () => live.moderation_queue())
if (q?.length) await t('resolve_report', () => live.resolve_report(q[0].id))
await t('people', () => social.people('t'))
await t('sanction', () => social.sanction(U.tobi, 'warn', 'Contract test'))
await t('sanction with days', () => social.sanction(U.tobi, 'mute', 'Contract test', 2))
await t('save_season', () => social.save_season({ id: 'x', name: 'Contract Season', from: '2028-09-03', to: '2029-08-26', active: false }))
await t('orgs', () => social.orgs())
await t('save_org', () => social.save_org({ id: 'o-new', name: 'Contract Parish', code: 'CP1', manuals: ['AD2627'], members: 0, region: '' }))
await t('set_manual', () => social.set_manual('EN2627', { status: 'published' }))
as('tobi')
await t('request_consent', () => social.request_consent('dad@example.com'))
as('ola')
const cs = await t('consents', () => social.consents())
const pending = cs?.find(c => c.state === 'pending')
if (pending) await t('decide_consent', () => social.decide_consent(pending.id, false))

// ---- steward ----
as('ada')
await t('verifications', () => social.verifications('AD2627'))
await t('verify', () => social.verify('AD2627', { u: 'I-b3f7ea2dd7bb3a02', state: 'approved', note: '' }))
const an = await t('anomalies', () => social.anomalies('AD2627'))
if (an?.length) await t('set_anomaly', () => social.set_anomaly(an[0].id, an[0].state))

// ---- last: leaving and blocking ----
as('tola')
await t('leave_group', () => live.leave_group(GROUP))
await t('block_user', () => live.block_user(U.tobi))
await t('leave_league', () => live.leave_league())

server.stop(true); await db.close()
console.log(`${pass} adapter calls passed`)
if (fails.length) { console.error(`${fails.length} FAILED:\n  ` + fails.join('\n  ')); process.exit(1) }
console.log('ALL LIVE CONTRACT CHECKS PASSED')
