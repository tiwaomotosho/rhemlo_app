import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api, isDemo, type ChallengeAttempt, type League, type MatchState, type PublicUser, type WeekResult } from '@/lib/backend'
import { loadItems } from '@/lib/data'
import { day, useStore } from '@/lib/store'
import { play } from '@/lib/sound'
import { BackBar, Glim, GlimHead, Icon, Loading, StatPills, asset, useManualData } from '@/ui/bits'
import { SignInSheet } from './Onboarding'
import { useStart } from './Journey'
import { Board, liveQuestions, same, Tiles, Timer, useCountdown, useRoom, type LiveQ } from './Live'

const TIERS = ['bronze', 'silver', 'gold', 'jade', 'amethyst', 'lantern']
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const DemoNote = () => isDemo ? <p className="tiny faint center"><Icon n="info" className="s" style={{ verticalAlign: 'middle' }} /> Demo server: other players and their scores are simulated.</p> : null
function untilMidnightUTC() { const n = new Date(); const e = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1); const ms = e - n.getTime(); return `${Math.floor(ms / 3600000)}h ${Math.floor(ms / 60000) % 60}m left` }

export function NeedAccount({ what }: { what: string }) {
  const [open, setOpen] = useState(false)
  return <div className="card col center" style={{ alignItems: 'center' }}><Glim pose="peek" size={110} /><h2>Sign in to use {what}</h2>
    <p className="small muted">{what} needs an account so results can be checked and shared fairly. Private study works without one.</p>
    <button className="btn block" onClick={() => setOpen(true)}>Sign in</button>{isDemo && <p className="tiny muted">Demo accounts are listed on the sign-in sheet.</p>}
    {open && <SignInSheet onClose={() => setOpen(false)} />}</div>
}

// ---- Arena home (R29) -------------------------------------------------------------------------------
export function Arena() {
  const { account, arenaOptIn, set, prefs, history, manual } = useStore(); const nav = useNavigate()
  const [league, setLeague] = useState<League | null | undefined>(undefined); const [result, setResult] = useState<WeekResult | null>(null); const [skip, setSkip] = useState(false)
  useEffect(() => { if (!account) return; api.league_standings().then(setLeague).catch(() => setLeague(null)); api.last_week_result().then(r => { if (r && localStorage.getItem('rhemlo.result') !== r.week) setResult(r) }).catch(() => {}) }, [account])
  const join = async () => { if (account) await api.join_league(); set({ arenaOptIn: true, prefs: { ...prefs, leagues: true } }); if (account) setLeague(await api.league_standings()) }
  if (result) return <WeekResultView r={result} onDone={() => { localStorage.setItem('rhemlo.result', result.week); setResult(null) }} />
  if (!arenaOptIn && !skip) return <div className="page col gap16 center" style={{ maxWidth: 520, alignItems: 'stretch' }}>
    <div className="pagehead"><h1>Arena</h1><StatPills /></div>
    <div style={{ display: 'grid', placeItems: 'center' }}><Glim pose="trophy" size={150} /></div>
    <div className="tiers">{TIERS.map(t => <img key={t} src={asset(`emblems/tiers/tier-${t}-128.webp`)} alt={`${t} tier`} />)}</div>
    <h1>Play fairly, if you like.</h1><p className="muted">Weekly leagues of about 30 learners on the same manual. One daily challenge. Server-verified.</p>
    <div className="col gap8" style={{ textAlign: 'left' }}>{[['you', 'Pseudonymous handle only'], ['scale', 'Ties promote together · no speed tie-breaks'], ['shield', 'No demotion in your first week'], ['door', 'Leave any time · learning stays']].map(([i, t]) =>
      <div key={t} className="card row" style={{ padding: '10px 14px' }}><Icon n={i} style={{ color: 'var(--rh-action)' }} /><span className="small b">{t}</span></div>)}</div>
    <button className="btn block" onClick={join}>Join weekly leagues</button>
    <button className="btn link" onClick={() => setSkip(true)}>Look around first</button>
  </div>
  const me = league?.rows.find(r => r.you); const played = history.some(h => h.kind === 'daily' && day(h.at) === day() && h.manual === manual)
  return <div className="page col gap16" style={{ maxWidth: 760 }}>
    <div className="pagehead"><h1>Arena</h1><StatPills /></div>
    <div className="card col" style={{ background: 'linear-gradient(135deg,#7041D9,#9A6CF2)', color: '#fff', border: 0, position: 'relative', overflow: 'hidden' }}>
      <p className="eyebrow" style={{ color: 'rgba(255,255,255,.85)' }}>Daily challenge · {new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
      <h2 style={{ maxWidth: '62%' }}>10 questions · one ranked attempt</h2>
      <span className="chip" style={{ alignSelf: 'flex-start', background: 'rgba(255,255,255,.2)', color: '#fff' }}><Icon n="clock" />{untilMidnightUTC()}</span>
      <Glim pose="trophy" size={110} style={{ position: 'absolute', right: 6, top: 8 }} />
      <button className="btn apricot block" onClick={() => nav('/arena/challenge')}>{played ? 'See today’s result' : account ? 'Begin ranked attempt' : 'See the challenge'}</button></div>
    {account ? (league ? <Link to="/arena/league" className="card row" style={{ color: 'inherit' }}><img src={asset(`emblems/tiers/tier-${league.tier}-128.webp`)} width={56} height={64} alt="" />
      <div className="grow"><p className="eyebrow">{cap(league.tier)} league · week {league.week.slice(-2)}</p><b className="disp">You are {me?.rank ? `${me.rank}${me.rank === 1 ? 'st' : me.rank === 2 ? 'nd' : me.rank === 3 ? 'rd' : 'th'}` : '–'} of {league.rows.length}</b>
        <div className="tiny muted">{me?.points ?? 0} verified points · ends {new Date(league.endsAt).toLocaleDateString(undefined, { weekday: 'short' })} {new Date(league.endsAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div></div><Icon n="chev" className="faint" /></Link>
      : league === null ? <button className="card row" onClick={join} style={{ textAlign: 'left', color: 'inherit' }}><img src={asset('emblems/tiers/tier-bronze-128.webp')} width={56} height={64} alt="" /><div className="grow"><b>Join this week’s league</b><div className="tiny muted">Start in Bronze · no demotion in your first week</div></div><Icon n="chev" /></button> : <div className="skel" style={{ height: 88 }} />)
      : <NeedAccount what="weekly leagues" />}
    <Link to="/arena/quiz-night" className="card row" style={{ color: 'inherit' }}><span className="tile apricot"><Icon n="radio" /></span><div className="grow"><b>Quiz Night · Friday 7pm</b><div className="tiny muted">Grace Youth Circle · room LAMP</div></div><span className="btn sec xs">Join</span></Link>
    <Link to="/arena/match" className="card row" style={{ color: 'inherit' }}><span className="tile"><Icon n="people" /></span><div className="grow"><b>Friendly match</b><div className="tiny muted">Same manual · no league points</div></div><span className="btn sec xs">Invite</span></Link>
    <Link to="/arena/rules" className="btn link">League rules</Link>
    <DemoNote />
  </div>
}

function WeekResultView({ r, onDone }: { r: WeekResult; onDone: () => void }) {
  useEffect(() => { if (r.moved === 'up') play('complete') }, [r.moved])
  return <div className="page col gap16 center" style={{ maxWidth: 480, alignItems: 'center', minHeight: '80dvh', justifyContent: 'center' }}>
    <img src={asset(`emblems/tiers/tier-${r.newTier}-256.webp`)} width={150} height={170} alt="" style={{ animation: 'up .7s var(--rh-ease-spring)' }} />
    <h1>{r.moved === 'up' ? `Hello, ${cap(r.newTier)}.` : r.moved === 'down' ? 'A new week, a fresh start.' : `Still ${cap(r.newTier)}.`}</h1>
    <p className="muted">{r.moved === 'down' ? 'Your learning progress has not changed.' : 'This week’s verified result is final.'}</p>
    <div className="card col" style={{ width: '100%' }}><div className="row between small"><span className="muted">Week</span><b>{r.week}</b></div><div className="row between small"><span className="muted">Final rank</span><b>{r.rank}</b></div><div className="row between small"><span className="muted">Verified points</span><b>{r.points}</b></div></div>
    <button className="btn block" onClick={onDone}>Back to Arena</button><DemoNote />
  </div>
}

// ---- Weekly league (R30) ------------------------------------------------------------------------------
export function LeagueView() {
  const nav = useNavigate(); const { account } = useStore(); const [l, setL] = useState<League | null | undefined>(undefined)
  useEffect(() => { if (account) api.league_standings().then(setL) }, [account])
  if (!account) return <div className="page"><NeedAccount what="weekly leagues" /></div>
  if (l === undefined) return <Loading />
  if (!l) return <div className="page"><BackBar title="League" onBack={() => nav('/arena')} /><p className="muted">You have not joined this week’s league.</p></div>
  const left = l.endsAt - Date.now(), d = Math.floor(left / 86400000), h = Math.floor(left / 3600000) % 24
  const shared = l.rows.find(r => r.you && l.rows.filter(x => x.rank === r.rank).length > 1)
  return <div className="page col gap16" style={{ maxWidth: 560 }}>
    <BackBar title={`${cap(l.tier)} league`} onBack={() => nav('/arena')} right={<Link to="/arena/rules" className="iconbtn" aria-label="League rules"><Icon n="info" /></Link>} />
    <div className="col center" style={{ alignItems: 'center', gap: 4 }}><img src={asset(`emblems/tiers/tier-${l.tier}-256.webp`)} width={96} height={110} alt="" /><p className="tiny muted">Week {l.week.slice(-2)} · ends in {d}d {h}h · Mon 00:00 UTC{l.firstWeek ? ' · first week: no demotion' : ''}</p></div>
    {shared && <p className="hint"><Icon n="scale" />Rank {shared.rank} is shared. Equal points share a rank.</p>}
    <div className="card list" style={{ padding: '2px 12px' }}>{l.rows.map((r, i) => <div key={r.user.id}>
      {i > 0 && l.rows[i - 1].rank <= l.promoteTo && r.rank > l.promoteTo && <p className="tiny b center" style={{ color: 'var(--rh-correct)', borderTop: '2px solid var(--rh-correct-line)', padding: 4 }}>↑ Promotion line</p>}
      {i > 0 && l.rows[i - 1].rank < l.demoteFrom && r.rank >= l.demoteFrom && <p className="tiny b center" style={{ color: 'var(--rh-incorrect)', borderTop: '2px solid var(--rh-incorrect-line)', padding: 4 }}>↓ Demotion line</p>}
      <div className="li" style={{ background: r.you ? 'var(--rh-raised)' : undefined, borderRadius: r.you ? 12 : 0, paddingLeft: 8 }}>
        <b style={{ width: 26 }}>{r.rank}</b><GlimHead cw={r.user.cw} size={36} /><span className="grow small"><b>{r.user.handle}</b>{r.you && ' (you)'}</span><b>{r.points}</b></div></div>)}</div>
    <p className="tiny muted center">Verified points from daily ranked challenges only. Personal XP never appears here.</p><DemoNote />
  </div>
}

export function ArenaRules() {
  const nav = useNavigate()
  const rows = [['Score source', 'Daily ranked challenge only'], ['Per question', '10 verified points if correct'], ['Daily / weekly max', '100 / 700 points'], ['Boundaries', 'Day 00:00 UTC · week Monday 00:00 UTC'], ['Promote', 'Ranks 1–10 and anyone tied with 10th'], ['Stay', 'Ranks 11–25'], ['Demote', 'Ranks 26–30 · tie groups crossing the line stay'], ['Protection', 'No demotion in your first week'], ['Small leagues', 'No demotion below 20 players'], ['Matches & Quiz Night', 'Never add league points']]
  return <div className="page col gap16" style={{ maxWidth: 560 }}>
    <BackBar title="League rules" onBack={() => nav('/arena')} />
    <h1>How weeks are scored</h1><p className="small muted">Published before you join. Changes are announced, never silent.</p>
    <div className="card list" style={{ padding: '2px 16px' }}>{rows.map(([k, v]) => <div key={k} className="li" style={{ alignItems: 'flex-start' }}><b className="small" style={{ width: 130, flex: 'none' }}>{k}</b><span className="small">{v}</span></div>)}</div>
    <div className="tiers">{TIERS.map(t => <img key={t} src={asset(`emblems/tiers/tier-${t}-128.webp`)} alt={`${t} tier`} />)}</div>
    <p className="hint"><Icon n="info" />Rank = 1 + players with strictly more points. Equal points share a rank.</p>
  </div>
}

// ---- Daily challenge (R33) -----------------------------------------------------------------------
export function DailyChallenge() {
  const m = useManualData(); const nav = useNavigate(); const start = useStart(); const { done, account } = useStore()
  const [a, setA] = useState<ChallengeAttempt | null>(null); const [err, setErr] = useState('')
  const lessons = m ? m.lessons.filter(l => done[`${m.code}|${l.id}`]) : []
  useEffect(() => {
    if (!m || !account || !lessons.length) return
    ;(async () => { try { const its = (await Promise.all(lessons.slice(-12).map(l => loadItems(m.code, l.id)))).flat().filter(i => !['Q04', 'Q27', 'Q28', 'Q24'].includes(i.t)).map(i => i.u); setA(await api.daily_challenge(m.code, its)) } catch (e) { setErr((e as Error).message) } })()
  }, [m?.code, account, lessons.length]) // eslint-disable-line
  useEffect(() => { if (a?.state !== 'pending') return; const t = setInterval(async () => { const x = await api.challenge_state(a.id); if (x.state !== 'pending') { setA({ ...x }); play('complete') } }, 1000); return () => clearInterval(t) }, [a?.state, a?.id])
  if (!m) return <Loading />
  if (!account) return <div className="page col gap16" style={{ maxWidth: 520 }}><BackBar title="Daily challenge" onBack={() => nav('/arena')} /><NeedAccount what="ranked challenges" />
    <button className="btn sec block" disabled={!lessons.length} onClick={() => start({ kind: 'daily', manual: m.code, lessons: lessons.slice(-12).map(l => l.id), count: 10, title: 'Daily challenge · practice run' })}>Practice run instead (not ranked)</button></div>
  if (a && a.state !== 'open') return <div className="page col gap16 center" style={{ maxWidth: 520, alignItems: 'center' }}>
    <BackBar title="Daily challenge" onBack={() => nav('/arena')} />
    {a.state === 'pending' ? <><div style={{ width: 150, height: 150, borderRadius: '50%', border: '8px solid var(--rh-raised)', borderTopColor: 'var(--rh-action)', display: 'grid', placeItems: 'center', animation: 'spin 1.4s linear infinite' }}><img src={asset('emblems/badges/badge-fair-128.webp')} width={96} height={96} alt="" style={{ animation: 'spin 1.4s linear infinite reverse' }} /></div>
      <h1>Verification in progress.</h1><p className="muted">Your final result is not ready yet. All {a.accepted} answers were received.</p></>
      : <><img src={asset('emblems/badges/badge-fair-128.webp')} width={120} height={120} alt="" /><h1>{a.correct} of {a.items.length} correct.</h1><p className="muted">This result is final and counts toward this week’s league.</p></>}
    <div className="card col" style={{ width: '100%' }}>
      <div className="row between small"><span className="muted">Answers accepted</span><b>{a.accepted} / {a.items.length}</b></div>
      <div className="row between small"><span className="muted">Attempt ID</span><b>{a.id}</b></div>
      <div className="row between small"><span className="muted">Points</span>{a.state === 'pending' ? <span className="chip pend"><Icon n="clock" />Pending</span> : <b style={{ color: 'var(--rh-action)' }}>{a.points} verified</b>}</div></div>
    <button className="btn sec block" onClick={() => nav('/arena')}>Back to Arena</button><DemoNote /></div>
  return <div className="page col gap16 center" style={{ maxWidth: 520, alignItems: 'stretch' }}>
    <BackBar title="Daily challenge" onBack={() => nav('/arena')} />
    <div style={{ display: 'grid', placeItems: 'center' }}><Glim pose="trophy" size={140} /></div>
    <h1>Ready when you are.</h1><p className="small muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · {m.short} · {lessons.length ? `Lessons ${lessons[0].n}–${lessons[lessons.length - 1].n}` : 'no lessons cleared yet'}</p>
    <div className="col gap8" style={{ textAlign: 'left' }}>{[['listn', '10 questions · 10 verified points each'], ['star', 'One ranked attempt today'], ['wifi', 'Needs a connection · marked on the server'], ['refresh', 'Disconnect? Accepted answers are kept; resume within 30 min'], ['eyeoff', 'Explanations appear after you finish']].map(([i, t]) =>
      <div key={t} className="card row" style={{ padding: '10px 14px' }}><Icon n={i} style={{ color: 'var(--rh-action)' }} /><span className="small">{t}</span></div>)}</div>
    {err && <p className="small" role="alert" style={{ color: 'var(--rh-incorrect)' }}>{err}</p>}
    <button className="btn block" disabled={!a || !lessons.length} onClick={() => a && start({ kind: 'daily', manual: m.code, lessons: lessons.slice(-12).map(l => l.id), count: 10, only: a.items, ranked: true, attemptId: a.id, title: 'Daily challenge · ranked' })}>{lessons.length ? 'Begin ranked attempt' : 'Clear a first lesson to play'}</button>
    <p className="tiny faint">Extra-time accommodation is available in settings.</p><DemoNote />
  </div>
}

// ---- Friendly match (R34–R36) ------------------------------------------------------------------
export function FriendlyMatch() {
  const nav = useNavigate(); const m = useManualData(); const { account, profile, done } = useStore()
  const [friends, setFriends] = useState<PublicUser[] | null>(null); const [match, setMatch] = useState<MatchState | null>(null)
  useEffect(() => { if (account) api.friends().then(setFriends) }, [account])
  useEffect(() => { if (!match || match.state === 'ready' || match.state === 'live' || match.state === 'final') return; const t = setInterval(async () => setMatch({ ...(await api.match_state(match.id)) }), 700); return () => clearInterval(t) }, [match])
  if (!m) return <Loading />
  if (!account) return <div className="page col gap16" style={{ maxWidth: 520 }}><BackBar title="Friendly match" onBack={() => nav('/arena')} /><NeedAccount what="friendly matches" /></div>
  const lessons = m.lessons.filter(l => done[`${m.code}|${l.id}`]).slice(-8)
  const invite = async (f: PublicUser) => setMatch(await api.create_match(f.id, []))
  return <div className="page col gap16" style={{ maxWidth: 520 }}>
    <BackBar title="Friendly match" onBack={() => nav('/arena')} />
    {!match ? <><h2>Who would you like to play?</h2><p className="small muted">Same manual, 10 questions, 20 seconds each. Matches never add league points.</p>
      {friends === null ? <div className="skel" style={{ height: 120 }} /> : friends.length ? <div className="card list" style={{ padding: '2px 14px' }}>{friends.map(f => <button key={f.id} className="li" onClick={() => invite(f)}><GlimHead cw={f.cw} size={40} /><span className="grow"><b className="small">{f.handle}</b><span className="tiny muted" style={{ display: 'block' }}>{f.name}</span></span><span className="btn sec xs">Invite</span></button>)}</div>
        : <p className="muted">Add a friend in Circle first.</p>}</>
      : <>
        <div className="row" style={{ justifyContent: 'center', gap: 18 }}>
          <div className="col center" style={{ alignItems: 'center', gap: 6 }}><Glim pose="wave" size={110} /><b className="small">{profile.handle}</b><span className="chip ok"><Icon n="check" />Ready</span></div>
          <b className="disp faint" style={{ fontSize: 24 }}>VS</b>
          <div className="col center" style={{ alignItems: 'center', gap: 6 }}><Glim pose={match.state === 'ready' ? 'wave' : 'peek'} cw={match.opponent.cw} size={110} /><b className="small">{match.opponent.handle}</b>
            <span className={`chip ${match.state === 'ready' ? 'ok' : 'pend'}`}><Icon n={match.state === 'ready' ? 'check' : 'clock'} />{match.state === 'ready' ? 'Ready' : match.state === 'joining' ? 'Joining' : 'Invited'}</span></div></div>
        <div className="card list" style={{ padding: '2px 16px' }}>{[['Manual', m.short], ['Format', '10 questions · 20s each'], ['Lessons', lessons.length ? `${lessons[0].n}–${lessons[lessons.length - 1].n}` : '1'], ['League points', 'None · match only']].map(([k, v]) => <div key={k} className="li"><span className="small muted grow">{k}</span><b className="small">{v}</b></div>)}</div>
        {match.state !== 'ready' && <p className="hint"><Icon n="clock" />Invite expires in {Math.max(0, Math.round((match.expiresAt - Date.now()) / 60000))} min if {match.opponent.handle} does not join.</p>}
        <button className="btn block" disabled={match.state !== 'ready'} onClick={() => nav(`/arena/match/${match.id}`, { state: { opp: match.opponent, lessons: (lessons.length ? lessons : m.lessons.slice(0, 1)).map(l => l.id) } })}>{match.state === 'ready' ? 'Start match' : `Waiting for ${match.opponent.handle}…`}</button>
        <button className="btn link" onClick={() => setMatch(null)}>Cancel invite</button></>}
    <DemoNote />
  </div>
}

export function MatchPlay() {
  const { id = '' } = useParams(); const nav = useNavigate(); const m = useManualData(); const { profile } = useStore()
  const st = (useLocation().state ?? {}) as { opp?: PublicUser; lessons?: string[] }
  const [qs, setQs] = useState<LiveQ[] | null>(null); const [i, setI] = useState(0); const [pick, setPick] = useState<string | null>(null); const [opp, setOpp] = useState<{ value: string; ms: number } | null>(null)
  const [reveal, setReveal] = useState(false); const [score, setScore] = useState({ you: 0, them: 0 }); const [done, setDone] = useState(false); const [misses, setMisses] = useState<LiveQ[]>([]); const [react, setReact] = useState('')
  useEffect(() => { if (m) liveQuestions(m.code, st.lessons ?? ['L01'], 10, id).then(setQs) }, [m?.code]) // eslint-disable-line
  const q = qs?.[i]
  useEffect(() => { if (!q) return; setPick(null); setReveal(false); setOpp(null); api.opponent_answer(id, i, q.answer, q.options).then(setOpp) }, [q?.u]) // eslint-disable-line
  const settle = () => { if (!q || reveal) return; setReveal(true); const y = !!pick && same(pick, q.answer), t = !!opp && same(opp.value, q.answer); play(y ? 'correct' : 'wrong'); if (!y) setMisses(x => [...x, q]); setScore(s => ({ you: s.you + (y ? 1 : 0), them: s.them + (t ? 1 : 0) })) }
  const left = useCountdown(20, !!q && !reveal, settle)
  useEffect(() => { if (pick && opp && !reveal) { const t = setTimeout(settle, Math.max(400, opp.ms - (20 - left) * 1000)); return () => clearTimeout(t) } }, [pick, opp]) // eslint-disable-line
  if (!qs || !m) return <Loading />
  const next = async () => { if (i + 1 >= qs.length) { await api.finish_match(id, score.you, score.them); setDone(true); play('complete') } else setI(i + 1) }
  if (done) return <div className="page col gap16 center" style={{ maxWidth: 520, alignItems: 'center' }}>
    <Glim pose={score.you >= score.them ? 'celebrate' : 'thumbs'} motion={score.you >= score.them ? 'jump' : undefined} once size={150} />
    <h1>{score.you > score.them ? 'You won the match.' : score.you === score.them ? 'A draw. Well matched.' : `${st.opp?.handle ?? 'Your friend'} took this one.`}</h1>
    <div className="row" style={{ gap: 24 }}><div className="center"><b className="disp" style={{ fontSize: 40 }}>{score.you}</b><div className="tiny muted">{profile.handle}</div></div><b className="faint">–</b><div className="center"><b className="disp" style={{ fontSize: 40 }}>{score.them}</b><div className="tiny muted">{st.opp?.handle}</div></div></div>
    <div className="row wrap gap8">{['Good game', 'Well played', 'Rematch soon?'].map(r => <button key={r} className={`chip btnchip`} aria-pressed={react === r} onClick={() => setReact(r)}>{r}</button>)}</div>
    {react && <p className="tiny muted">Sent “{react}” to {st.opp?.handle}.</p>}
    {misses.length > 0 && <div className="card col" style={{ width: '100%', textAlign: 'left' }}><p className="eyebrow">Review your misses</p>{misses.map(x => <div key={x.u} className="small"><b>{x.prompt}</b><div className="okm">{x.answer}</div></div>)}</div>}
    <p className="tiny muted">Match scores never add weekly league points.</p>
    <button className="btn block" onClick={() => nav('/arena')}>Back to Arena</button><DemoNote /></div>
  return <div className="page col gap16" style={{ maxWidth: 640 }}>
    <div className="row between"><div className="row gap8"><GlimHead cw={profile.glim} size={34} /><b className="disp" style={{ fontSize: 22 }}>{score.you}</b></div><Timer left={left} total={20} /><div className="row gap8"><b className="disp" style={{ fontSize: 22 }}>{score.them}</b><GlimHead cw={st.opp?.cw ?? 'ocean'} size={34} /></div></div>
    <div className="bar thin apricot"><i style={{ width: `${((i + (reveal ? 1 : 0)) / qs.length) * 100}%` }} /></div>
    <div className="row between tiny muted"><span>Question {i + 1} of {qs.length}</span><span>server timer</span></div>
    <h2 style={{ fontSize: 19 }}>{q!.prompt}</h2>{q!.text && <div className="pcard">{q!.text}</div>}
    <Tiles q={q!} picked={pick} reveal={reveal} onPick={setPick} />
    {reveal ? <button className="btn block" onClick={next}>{i + 1 >= qs.length ? 'See result' : 'Next question'}</button> : pick && <p className="hint"><Icon n="lock" />Answer locked. Waiting for {st.opp?.handle ?? 'your friend'}…</p>}
  </div>
}

// ---- Quiz Night (live room) ---------------------------------------------------------------------
export function QuizNight() {
  const nav = useNavigate(); const { account } = useStore(); const [code, setCode] = useState(''); const [err, setErr] = useState('')
  const join = () => { if (code.toUpperCase() !== 'LAMP') { setErr(isDemo ? 'No live room uses that code. In this demo, the Grace Youth room is LAMP.' : 'No live room uses that code.'); return } nav('/arena/quiz-night/LAMP') }
  return <div className="page col gap16" style={{ maxWidth: 520 }}>
    <BackBar title="" onBack={() => nav('/arena')} />
    <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', minHeight: 330, background: '#241B2E' }}>
      <img src={asset('worlds/scenes/stage-quiznight/stage-quiznight-800.webp')} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <span className="chip" style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(36,27,46,.7)', color: '#fff' }}><Icon n="radio" />Quiz Night</span>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, background: 'linear-gradient(transparent,rgba(36,27,46,.92))', color: '#fff', textAlign: 'center' }}><h1>Grace Youth Quiz Night</h1><p className="small" style={{ opacity: .85 }}>Friday · 7:00 pm · Lessons you have cleared</p></div></div>
    <label className="lbl" htmlFor="rc">Room code</label>
    <input id="rc" className="field" value={code} maxLength={6} onChange={e => { setErr(''); setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')) }} style={{ letterSpacing: '.5em', textAlign: 'center', fontSize: 26, fontFamily: 'var(--rh-font-display)', fontWeight: 900 }} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="LAMP" />
    <div className="row gap8" style={{ justifyContent: 'center' }}><span className="chip lg plain"><Icon n="people" />64 in the room</span><span className="chip lg plain">Host: Bro. Femi</span></div>
    {err && <p className="small" role="alert" style={{ color: 'var(--rh-incorrect)' }}>{err}</p>}
    {account ? <button className="btn block" disabled={code.length < 4} onClick={join}>Join Quiz Night</button> : <NeedAccount what="Quiz Night" />}
    <p className="hint"><Icon n="scale" />Correctness first; speed only breaks ties within the night and never touches league points.</p><DemoNote />
  </div>
}

export function QuizNightPlay({ host = false }: { host?: boolean }) {
  const nav = useNavigate(); const m = useManualData(); const { profile, done } = useStore(); const room = 'LAMP-' + day()
  const { people, answers } = useRoom(room, 63)
  const [qs, setQs] = useState<LiveQ[] | null>(null); const [i, setI] = useState(-1); const [pick, setPick] = useState<string | null>(null); const [myMs, setMyMs] = useState(0)
  const [reveal, setReveal] = useState(false); const [scores, setScores] = useState<Record<string, { s: number; t: number }>>({}); const [answered, setAnswered] = useState(0)
  useEffect(() => { if (!m) return; const ls = m.lessons.filter(l => done[`${m.code}|${l.id}`]).slice(-8).map(l => l.id); liveQuestions(m.code, ls.length ? ls : ['L01', 'L02'], 15, room).then(setQs) }, [m?.code]) // eslint-disable-line
  const q = qs && i >= 0 ? qs[i] : null
  const settle = () => { if (!q || reveal) return; setReveal(true)
    const as = answers(i, q.answer, q.options); setScores(s => { const n = { ...s }; for (const a of as) { const o = n[a.p.handle] ?? { s: 0, t: 0 }; n[a.p.handle] = { s: o.s + (same(a.value, q.answer) ? 100 : 0), t: o.t + a.ms } }
      if (!host) { const o = n.__you ?? { s: 0, t: 0 }; const ok = !!pick && same(pick, q.answer); n.__you = { s: o.s + (ok ? 100 : 0), t: o.t + (myMs || 20000) }; play(ok ? 'correct' : 'wrong') } return n }) }
  const left = useCountdown(20, !!q && !reveal, settle)
  useEffect(() => { if (!q || reveal) return; const t = setInterval(() => setAnswered(a => Math.min(63, a + 3 + Math.floor(Math.random() * 6))), 600); return () => clearInterval(t) }, [q?.u, reveal]) // eslint-disable-line
  useEffect(() => { setAnswered(0); setPick(null); setReveal(false) }, [i])
  const rows = Object.entries(scores).map(([h, v]) => ({ h, ...v })).sort((a, b) => b.s - a.s || a.t - b.t)
  const board = rows.slice(0, 5).map(r => r.h === '__you' ? { user: { handle: profile.handle, cw: profile.glim }, score: r.s, you: true } : { user: people.find(p => p.handle === r.h)!, score: r.s })
  const myRank = rows.findIndex(r => r.h === '__you') + 1
  if (!qs || !m) return <Loading />
  if (i < 0) return <div className="page col gap16 center" style={{ maxWidth: 560, alignItems: 'center' }}>
    <BackBar title="Room LAMP" onBack={() => nav(host ? '/coach' : '/arena')} />
    <Glim pose="announce" size={140} /><h1>{host ? 'Your room is open.' : 'You are in.'}</h1><p className="muted">{people.length + (host ? 0 : 1)} players in the room · 15 questions · 20 seconds each</p>
    <div className="row wrap gap8" style={{ justifyContent: 'center' }}>{people.slice(0, 12).map(p => <GlimHead key={p.handle} cw={p.cw} size={36} />)}<span className="chip plain">+{people.length - 12}</span></div>
    <button className="btn block" onClick={() => setI(0)}>{host ? 'Start the first question' : 'Ready'}</button>{!host && <p className="tiny muted">The host starts each question. In this demo you start them yourself.</p>}<DemoNote /></div>
  if (i >= qs.length) return <div className="page col gap16 center" style={{ maxWidth: 560, alignItems: 'center' }}>
    <Glim pose="champion" motion="cheer" once size={150} /><h1>Quiz Night complete.</h1>{!host && <p className="muted">You finished {myRank}{myRank === 1 ? 'st' : myRank === 2 ? 'nd' : myRank === 3 ? 'rd' : 'th'} of {rows.length}.</p>}
    <div style={{ width: '100%' }}><Board rows={board} /></div><p className="tiny muted">Quiz Night never adds league points.</p>
    <button className="btn block" onClick={() => nav(host ? '/coach' : '/arena')}>{host ? 'Back to coach workspace' : 'Back to Arena'}</button><DemoNote /></div>
  const dist = reveal ? q!.options.map(o => answers(i, q!.answer, q!.options).filter(a => a.value === o).length) : null
  return <div className="page col gap16" style={{ maxWidth: host ? 960 : 640 }}>
    <div className="row between"><span className="chip lg">Q {i + 1} / {qs.length}</span><Timer left={left} total={20} /><span className="chip lg plain"><Icon n="people" />{people.length + (host ? 0 : 1)}</span></div>
    <h2 style={{ fontSize: host ? 30 : 19, lineHeight: host ? '36px' : '25px' }}>{q!.prompt}</h2>{q!.text && <div className="pcard" style={host ? { fontSize: 24, lineHeight: '36px' } : undefined}>{q!.text}</div>}
    <Tiles q={q!} picked={host ? null : pick} reveal={reveal} big={host} onPick={o => { if (host) return; setPick(o); setMyMs((20 - left) * 1000) }} />
    {dist && <div className="row gap8">{dist.map((n, k) => <div key={k} className="grow center tiny b">{'ABCD'[k]} · {n}</div>)}</div>}
    {!reveal && (host || pick) && <p className="hint"><Icon n="lock" />{host ? '' : 'Answer locked. '}Waiting for the room · {answered} of {people.length} answered</p>}
    {!reveal && host && <button className="btn sec" onClick={settle}>Close question now</button>}
    {reveal && <><Board rows={board} you={!host && myRank > 5 ? `You are ${myRank}th with ${scores.__you?.s ?? 0}` : undefined} /><button className="btn block" onClick={() => setI(i + 1)}>{i + 1 >= qs.length ? 'Final results' : 'Next question'}</button></>}
    {!host && <div className="row"><GlimHead cw={profile.glim} size={36} /><div className="grow"><b className="small">{profile.handle}{myRank ? ` · ${myRank}${myRank === 1 ? 'st' : myRank === 2 ? 'nd' : myRank === 3 ? 'rd' : 'th'}` : ''}</b></div><b className="disp" style={{ color: 'var(--rh-action)', fontSize: 20 }}>{scores.__you?.s ?? 0}</b></div>}
  </div>
}
