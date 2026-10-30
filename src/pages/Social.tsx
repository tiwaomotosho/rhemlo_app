import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { niceTitle } from '@/lib/engine'
import { day, useStore } from '@/lib/store'
import { BackBar, Glim, Icon, Loading, StatPills, asset, useManualData } from '@/ui/bits'
import { useStart } from './Journey'

const TIERS = ['bronze', 'silver', 'gold', 'jade', 'amethyst', 'lantern']
const SERVER = 'Opens when the Rhemlo server is connected'
function useCountdown() {
  const [now, setNow] = useState(Date.now()); useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])
  const end = new Date(); end.setHours(24, 0, 0, 0); const ms = end.getTime() - now
  return `${Math.floor(ms / 3600000)}h ${Math.floor(ms / 60000) % 60}m left`
}

// ---- Arena home + first-time opt-in (R29) ----------------------------------------------------------
export function Arena() {
  const { arenaOptIn, set, prefs, history, manual } = useStore(); const nav = useNavigate(); const left = useCountdown()
  const [skip, setSkip] = useState(false)
  const playedToday = history.some(h => h.kind === 'daily' && day(h.at) === day() && h.manual === manual)
  if (!arenaOptIn && !skip) return <div className="page col gap16 center" style={{ maxWidth: 520, alignItems: 'stretch' }}>
    <div className="pagehead"><h1>Arena</h1><StatPills /></div>
    <div style={{ display: 'grid', placeItems: 'center' }}><Glim pose="trophy" size={150} /></div>
    <div className="tiers">{TIERS.map(t => <img key={t} src={asset(`emblems/tiers/tier-${t}-128.webp`)} alt={`${t} tier`} />)}</div>
    <h1>Play fairly, if you like.</h1><p className="muted">Weekly leagues of about 30 learners on the same manual. One daily challenge. Server-verified.</p>
    <div className="col gap8" style={{ textAlign: 'left' }}>{[['you', 'Pseudonymous handle only'], ['scale', 'Ties promote together · no speed tie-breaks'], ['shield', 'No demotion in your first week'], ['door', 'Leave any time · learning stays']].map(([i, t]) =>
      <div key={t} className="card row" style={{ padding: '10px 14px' }}><Icon n={i} style={{ color: 'var(--rh-action)' }} /><span className="small b">{t}</span></div>)}</div>
    <button className="btn block" onClick={() => set({ arenaOptIn: true, prefs: { ...prefs, leagues: true } })}>Join weekly leagues</button>
    <button className="btn link" onClick={() => setSkip(true)}>Look around first</button>
  </div>
  return <div className="page col gap16" style={{ maxWidth: 760 }}>
    <div className="pagehead"><h1>Arena</h1><StatPills /></div>
    <div className="card col" style={{ background: 'linear-gradient(135deg,#7041D9,#9A6CF2)', color: '#fff', border: 0, position: 'relative', overflow: 'hidden' }}>
      <p className="eyebrow" style={{ color: 'rgba(255,255,255,.85)' }}>Daily challenge · {new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
      <h2 style={{ maxWidth: '62%' }}>10 questions · one attempt today</h2>
      <span className="chip" style={{ alignSelf: 'flex-start', background: 'rgba(255,255,255,.2)', color: '#fff' }}><Icon n="clock" />{left}</span>
      <Glim pose="trophy" size={110} style={{ position: 'absolute', right: 6, top: 8 }} />
      <button className="btn apricot block" onClick={() => nav('/arena/challenge')}>{playedToday ? 'See today’s result' : 'Begin practice run'}</button>
      <p className="tiny" style={{ opacity: .85 }}>Ranked attempts and verified points open when the Rhemlo server is connected.</p></div>
    <Link to="/arena/rules" className="card row" style={{ color: 'inherit' }}><img src={asset('emblems/tiers/tier-bronze-128.webp')} width={56} height={64} alt="" /><div className="grow"><p className="eyebrow">Weekly league</p><b className="disp">Standings appear once verified</b><div className="tiny muted">No players are invented. Read the published rules.</div></div><span className="chip pend"><Icon n="clock" />Pending</span></Link>
    <Link to="/arena/quiz-night" className="card row" style={{ color: 'inherit' }}><span className="tile apricot"><Icon n="radio" /></span><div className="grow"><b>Quiz Night</b><div className="tiny muted">Join your church’s live room with a code</div></div><span className="btn sec xs">Join</span></Link>
    <Link to="/arena/match" className="card row" style={{ color: 'inherit' }}><span className="tile"><Icon n="people" /></span><div className="grow"><b>Friendly match</b><div className="tiny muted">Same manual · no league points</div></div><span className="btn sec xs">Invite</span></Link>
    {!arenaOptIn && <button className="btn sec" onClick={() => set({ arenaOptIn: true, prefs: { ...prefs, leagues: true } })}>Join weekly leagues</button>}
  </div>
}

// ---- Published rules (R32) ------------------------------------------------------------------------
export function ArenaRules() {
  const nav = useNavigate()
  const rows = [['Score source', 'Daily ranked challenge only'], ['Per question', '10 verified points if correct'], ['Daily / weekly max', '100 / 700 points'], ['Boundaries', 'Day 00:00 UTC · week Monday 00:00 UTC'], ['Promote', 'Ranks 1–10 and anyone tied with 10th'], ['Stay', 'Ranks 11–25'], ['Demote', 'Ranks 26–30 · tie groups crossing the line stay'], ['Protection', 'No demotion in your first week'], ['Small leagues', 'No demotion below 20 players'], ['Matches & Quiz Night', 'Never add league points']]
  return <div className="page col gap16" style={{ maxWidth: 560 }}>
    <BackBar title="League rules" onBack={() => nav('/arena')} />
    <h1>How weeks are scored</h1><p className="small muted">Published before you join. Changes are announced, never silent.</p>
    <div className="card list" style={{ padding: '2px 16px' }}>{rows.map(([k, v]) => <div key={k} className="li" style={{ alignItems: 'flex-start' }}><b className="small" style={{ width: 130, flex: 'none' }}>{k}</b><span className="small">{v}</span></div>)}</div>
    <div className="tiers">{TIERS.map(t => <img key={t} src={asset(`emblems/tiers/tier-${t}-128.webp`)} alt={`${t} tier`} />)}</div>
    <p className="hint"><Icon n="info" />Rank = 1 + players with strictly more points. Equal points share a rank. Personal XP never appears in standings.</p>
  </div>
}

// ---- Daily challenge (R33) -------------------------------------------------------------------------
export function DailyChallenge() {
  const m = useManualData(); const nav = useNavigate(); const start = useStart(); const { done, history } = useStore()
  if (!m) return <Loading />
  const lessons = m.lessons.filter(l => done[`${m.code}|${l.id}`])
  const today = history.find(h => h.kind === 'daily' && day(h.at) === day() && h.manual === m.code)
  if (today) return <div className="page col gap16 center" style={{ maxWidth: 520, alignItems: 'center' }}>
    <BackBar title="Daily challenge" onBack={() => nav('/arena')} />
    <img src={asset('emblems/badges/badge-fair-128.webp')} width={120} height={120} alt="" />
    <h1>Today’s run is done.</h1><p className="muted">This was a practice run on this device. No ranked points were claimed.</p>
    <div className="card col" style={{ width: '100%' }}>
      <div className="row between small"><span className="muted">Answers accepted</span><b>{today.total} / {today.total}</b></div>
      <div className="row between small"><span className="muted">Correct</span><b>{today.right}</b></div>
      <div className="row between small"><span className="muted">Verified points</span><span className="chip pend"><Icon n="clock" />Not ranked</span></div></div>
    <button className="btn sec block" onClick={() => nav('/arena')}>Back to Arena</button></div>
  return <div className="page col gap16 center" style={{ maxWidth: 520, alignItems: 'stretch' }}>
    <BackBar title="Daily challenge" onBack={() => nav('/arena')} />
    <div style={{ display: 'grid', placeItems: 'center' }}><Glim pose="trophy" size={140} /></div>
    <h1>Ready when you are.</h1><p className="small muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · {m.short} · {lessons.length ? `Lessons ${lessons[0].n}–${lessons[lessons.length - 1].n}` : 'no lessons cleared yet'}</p>
    <div className="col gap8" style={{ textAlign: 'left' }}>{[['listn', '10 questions from lessons you have cleared'], ['star', 'One attempt today'], ['wifi', 'Practice run · marked on this device'], ['refresh', 'Leave mid-way? Accepted answers are kept'], ['eyeoff', 'Same marking as a real quiz']].map(([i, t]) =>
      <div key={t} className="card row" style={{ padding: '10px 14px' }}><Icon n={i} style={{ color: 'var(--rh-action)' }} /><span className="small">{t}</span></div>)}</div>
    <button className="btn block" disabled={!lessons.length} onClick={() => start({ kind: 'daily', manual: m.code, lessons: lessons.slice(-12).map(l => l.id), count: 10, title: 'Daily challenge · practice run' })}>{lessons.length ? 'Begin practice run' : 'Clear a first lesson to play'}</button>
    <p className="tiny faint">Ranked attempts with verified points: {SERVER.toLowerCase()}.</p>
  </div>
}

// ---- Quiz Night join (live) -----------------------------------------------------------------------
export function QuizNight() {
  const nav = useNavigate(); const [code, setCode] = useState('')
  return <div className="page col gap16" style={{ maxWidth: 520 }}>
    <BackBar title="" onBack={() => nav('/arena')} />
    <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', minHeight: 320, background: '#241B2E' }}>
      <img src={asset('worlds/scenes/stage-quiznight/stage-quiznight-800.webp')} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <span className="chip" style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(36,27,46,.7)', color: '#fff' }}><Icon n="radio" />Quiz Night</span>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, background: 'linear-gradient(transparent,rgba(36,27,46,.92))', color: '#fff', textAlign: 'center' }}><h1>Join a Quiz Night</h1><p className="small" style={{ opacity: .85 }}>Your host shares a room code on the screen</p></div></div>
    <label className="lbl" htmlFor="rc">Room code</label>
    <input id="rc" className="field" value={code} maxLength={6} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} style={{ letterSpacing: '.5em', textAlign: 'center', fontSize: 26, fontFamily: 'var(--rh-font-display)', fontWeight: 900 }} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
    <button className="btn block" disabled>Join Quiz Night</button>
    <p className="hint"><Icon n="radio" />Live rooms are marked on the server in milliseconds, so they need the Rhemlo server. {SERVER}. Correctness first; speed only breaks ties within the night and never touches league points.</p>
  </div>
}

// ---- Friendly match lobby (R34) ------------------------------------------------------------------
export function FriendlyMatch() {
  const nav = useNavigate(); const m = useManualData(); const { profile } = useStore()
  return <div className="page col gap16" style={{ maxWidth: 520 }}>
    <BackBar title="Friendly match" onBack={() => nav('/arena')} />
    <div className="row" style={{ justifyContent: 'center', gap: 18 }}>
      <div className="col center" style={{ alignItems: 'center', gap: 6 }}><Glim pose="wave" size={120} /><b className="small">{profile.handle || profile.name}</b><span className="chip ok"><Icon n="check" />Ready</span></div>
      <b className="disp faint" style={{ fontSize: 24 }}>VS</b>
      <div className="col center" style={{ alignItems: 'center', gap: 6 }}><div style={{ width: 120, height: 120, borderRadius: 24, border: '2px dashed var(--rh-line2)', display: 'grid', placeItems: 'center' }}><Icon n="plus" className="l faint" /></div><b className="small muted">Your friend</b><span className="chip plain">Not invited</span></div></div>
    <div className="card list" style={{ padding: '2px 16px' }}>{[['Manual', m?.short ?? ''], ['Format', '10 questions · 20s each'], ['Lessons', 'Lessons you both cleared'], ['League points', 'None · match only']].map(([k, v]) => <div key={k} className="li"><span className="small muted grow">{k}</span><b className="small">{v}</b></div>)}</div>
    <p className="hint"><Icon n="clock" />Matches need consent from both players, the same manual and both ready. Invites by handle: {SERVER.toLowerCase()}.</p>
    <button className="btn block" disabled>Invite a friend</button>
  </div>
}

// ---- Circle (R37–R39) ----------------------------------------------------------------------------
export function Circle() {
  const m = useManualData(); const { history, done, ladder, manual } = useStore(); const [tab, setTab] = useState<'friends' | 'coop' | 'circles'>('friends'); const [code, setCode] = useState('')
  if (!m) return <Loading />
  const feed = [
    ...m.lessons.filter(l => done[`${m.code}|${l.id}`]).map(l => ({ at: done[`${m.code}|${l.id}`], t: <>You completed Chapter {l.n} · {niceTitle(l.title)}</>, b: 'chapter' })),
    ...Object.entries(ladder).filter(([k, v]) => k.startsWith(manual + '|') && v.q04).map(([k]) => ({ at: 0, t: <>You secured the memory verse of Lesson {+k.split('|L')[1]}</>, b: 'lantern' })),
    ...history.filter(h => h.kind === 'review').slice(0, 2).map(h => ({ at: h.at, t: <>You came back to review {h.total} points</>, b: 'seed' })),
  ].sort((a, b) => b.at - a.at).slice(0, 6)
  return <div className="page col gap16" style={{ maxWidth: 640 }}>
    <div className="pagehead"><h1>Circle</h1><StatPills /></div>
    <div className="tabs" role="tablist">{([['friends', 'Friends'], ['coop', 'Co-op'], ['circles', 'Circles']] as const).map(([k, t]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>)}</div>
    {tab === 'friends' && <>
      {feed.map((f, i) => <div key={i} className="card feedrow"><img className="avatar" src={asset('characters/glim/avatars/avatar-classic-128.png')} alt="" /><div className="grow"><p className="small"><b>{f.t}</b></p><p className="tiny muted">{f.at ? new Date(f.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'Recently'} · Only you</p></div><img src={asset(`emblems/badges/badge-${f.b}-128.webp`)} width={40} height={40} alt="" /></div>)}
      {!feed.length && <div className="card statecard"><Glim pose="hug" size={80} /><div><b>Your milestones show here</b><p className="tiny muted mt8">Clear a chapter or secure a verse. Sharing with friends is opt-in.</p></div></div>}
      <p className="tiny muted center row gap8" style={{ justifyContent: 'center' }}><Icon n="check" className="s" />You are all caught up</p>
      <div className="card col gap8"><b>Add a friend by handle</b><p className="tiny muted">No contact upload, ever. Friends see milestones only, with preset encouragement.</p><input className="field" placeholder="@handle" disabled /><p className="tiny faint">{SERVER}.</p></div></>}
    {tab === 'coop' && <div className="col gap16">
      <div className="row" style={{ justifyContent: 'center' }}><Glim pose="highfive" size={110} /><Glim pose="highfive" cw="meadow" size={110} style={{ transform: 'scaleX(-1)' }} /></div>
      <h2 className="center">Ten sittings together</h2><p className="small muted center">Invite one friend. Each sitting either of you completes counts.</p>
      <div className="card col"><div className="row between"><b className="disp" style={{ fontSize: 30 }}>0 / 10</b><span className="chip plain">Not started</span></div><div className="bar green"><i style={{ width: 0 }} /></div>
        <p className="tiny muted">Max 5 per person · 1 per day · a sitting counts at 10+ unique answers</p></div>
      <div className="card row"><Glim pose="stand" cw="twilight" size={52} still /><div><b>Reward: Twilight Glim</b><div className="tiny muted">+ 200 personal XP each · never verified points</div></div></div>
      <button className="btn block" disabled>Invite a partner</button><p className="tiny faint center">{SERVER}. Leave any time · no loss of learning.</p></div>}
    {tab === 'circles' && <div className="col gap16">
      <div className="card col" style={{ padding: 0, overflow: 'hidden' }}><img src={asset('worlds/scenes/hero-sunrise/hero-sunrise-wide-1200x675.webp')} alt="" style={{ width: '100%', height: 140, objectFit: 'cover' }} />
        <div className="col" style={{ padding: 16 }}><h2>Join your church’s circle</h2><p className="small muted">Circles share study goals, coach assignments and Quiz Nights. Moderated, invite-only, with mute, block, report and leave one tap away.</p>
          <label className="lbl" htmlFor="cc">Invite code</label><input id="cc" className="field" value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. GRACE-YOUTH" autoComplete="off" />
          <button className="btn block" disabled>Join circle</button><p className="tiny faint">{SERVER}. A circle invite never unlocks a licensed manual.</p></div></div>
      <div className="card row"><span className="tile"><Icon n="shield" /></span><div><b>Safety first</b><div className="tiny muted">Quiet hours 22:00–07:00 apply to circle chat. No stranger messages by default.</div></div></div></div>}
  </div>
}
