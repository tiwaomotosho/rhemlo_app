import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, isDemo, type Circle as CircleT, type Coop, type FeedItem, type Message, type PublicUser, type Report } from '@/lib/backend'
import { useStore } from '@/lib/store'
import { inQuiet } from '@/lib/notify'
import { BackBar, Glim, GlimHead, Icon, Loading, Sheet, StatPills, asset, useManualData } from '@/ui/bits'
import { NeedAccount } from './Arena'
import { useStart } from './Journey'

const DemoNote = () => isDemo ? <p className="tiny faint center"><Icon n="info" className="s" style={{ verticalAlign: 'middle' }} /> Demo server: friends, circle members and their activity are simulated.</p> : null
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${Math.max(1, m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : m < 2880 ? 'Yesterday' : `${Math.round(m / 1440)}d` }

export default function Circle() {
  const { account } = useStore(); const [tab, setTab] = useState<'friends' | 'coop' | 'circles'>('friends')
  return <div className="page col gap16" style={{ maxWidth: 640 }}>
    <div className="pagehead"><h1>Circle</h1><StatPills /></div>
    <div className="tabs" role="tablist">{([['friends', 'Friends'], ['coop', 'Co-op'], ['circles', 'Circles']] as const).map(([k, t]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>)}</div>
    {!account ? <NeedAccount what="Circle" /> : tab === 'friends' ? <Friends /> : tab === 'coop' ? <CoopView /> : <Circles />}
    <DemoNote />
  </div>
}

function Friends() {
  const [feed, setFeed] = useState<FeedItem[] | null>(null); const [q, setQ] = useState(''); const [found, setFound] = useState<PublicUser[]>([]); const [friends, setFriends] = useState<PublicUser[]>([]); const [msg, setMsg] = useState('')
  const reload = () => { api.friends_feed().then(setFeed); api.friends().then(setFriends) }
  useEffect(reload, [])
  useEffect(() => { const t = setTimeout(() => api.search_users(q).then(setFound), 200); return () => clearTimeout(t) }, [q])
  const cheer = async (f: FeedItem, kind: string) => { await api.cheer(f.id, kind); setFeed(x => x!.map(y => y.id === f.id ? { ...y, mine: kind, cheers: y.cheers + (y.mine ? 0 : 1) } : y)) }
  return <>
    {feed === null ? <div className="skel" style={{ height: 120 }} /> : feed.map(f => <div key={f.id} className="card col gap8">
      <div className="feedrow"><GlimHead cw={f.user.cw} size={44} /><div className="grow"><p className="small"><b>{f.user.handle}</b> {f.text}</p><p className="tiny muted">{ago(f.at)} · Friends only</p></div><img src={asset(`emblems/badges/badge-${f.badge}-128.webp`)} width={40} height={40} alt="" /></div>
      <div className="row gap8">{[['Well done', 'sparkle'], ['Keep going', 'sprout']].map(([k, i]) => <button key={k} className="chip btnchip plain" aria-pressed={f.mine === k} onClick={() => cheer(f, k)}><Icon n={i} />{k}</button>)}<span className="tiny muted" style={{ marginLeft: 'auto' }}>{f.cheers} cheers</span></div></div>)}
    {feed && <p className="tiny muted center row gap8" style={{ justifyContent: 'center' }}><Icon n="check" className="s" />You are all caught up</p>}
    <div className="card col gap8"><b>Add a friend by handle</b><p className="tiny muted">No contact upload, ever. Friends see milestones only, with preset encouragement.</p>
      <input className="field" placeholder="@handle" value={q} onChange={e => setQ(e.target.value)} aria-label="Search by handle" autoComplete="off" />
      {found.map(u => { const is = friends.some(f => f.id === u.id); return <div key={u.id} className="row"><GlimHead cw={u.cw} size={36} /><b className="small grow">{u.handle}</b>{is ? <span className="chip ok">Friends</span> : <button className="btn sec xs" onClick={async () => { await api.request_connection(u.id); setMsg(`You and ${u.handle} are now friends.${isDemo ? ' (Demo requests are accepted at once.)' : ''}`); reload() }}>Add</button>}</div> })}
      {msg && <p className="tiny" role="status">{msg}</p>}</div>
    <div className="card col gap8"><b>Your friends · {friends.length}</b><div className="row wrap gap8">{friends.map(f => <span key={f.id} className="chip lg plain"><img src={asset(`characters/glim/avatars/avatar-${f.cw}-64.png`)} width={20} height={20} alt="" />{f.handle}</span>)}</div></div>
  </>
}

function CoopView() {
  const [c, setC] = useState<Coop | null | undefined>(undefined); const m = useManualData(); const start = useStart(); const { sessionSize, done } = useStore()
  useEffect(() => { api.coop().then(setC) }, [])
  if (c === undefined || !m) return <div className="skel" style={{ height: 200 }} />
  if (!c) return <div className="card"><p className="muted">Add a friend first, then start a co-op quest together.</p></div>
  const total = c.you + c.them, ends = new Date(c.endsAt)
  const cur = m.lessons.find(l => !done[`${m.code}|${l.id}`]) ?? m.lessons[0]
  return <div className="col gap16">
    <div className="row" style={{ justifyContent: 'center' }}><Glim pose="highfive" size={110} /><Glim pose="highfive" cw={c.partner.cw} size={110} style={{ transform: 'scaleX(-1)' }} /></div>
    <div className="center"><h2>Ten sittings together</h2><p className="small muted">With {c.partner.handle} · ends {ends.toLocaleDateString(undefined, { weekday: 'long' })} {ends.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</p></div>
    <div className="card col"><div className="row between"><b className="disp" style={{ fontSize: 30 }}>{total} / {c.goal}</b><span className={`chip ${total >= c.goal ? 'ok' : total >= 5 ? 'str' : 'pend'}`}>{total >= c.goal ? 'Complete' : total >= 5 ? 'On track' : 'Warming up'}</span></div>
      <div className="bar green"><i style={{ width: `${(total / c.goal) * 100}%` }} /></div>
      <div className="grid2"><div><div className="row between tiny b"><span>You</span><span>{c.you} / 5</span></div><div className="bar thin"><i style={{ width: `${c.you * 20}%` }} /></div></div><div><div className="row between tiny b"><span>{c.partner.name}</span><span>{c.them} / 5</span></div><div className="bar thin apricot"><i style={{ width: `${c.them * 20}%` }} /></div></div></div>
      <p className="tiny muted">Max 5 per person · 1 per day · a sitting counts at 10+ unique answers</p></div>
    <div className="card row"><Glim pose="stand" cw={c.reward} size={52} still /><div><b>Reward: {c.reward[0].toUpperCase() + c.reward.slice(1)} Glim</b><div className="tiny muted">+ 200 personal XP each · never verified points</div></div></div>
    <button className="btn block" onClick={() => start({ kind: 'quest', manual: m.code, lessons: [cur.id], count: sessionSize, title: `Lesson ${cur.n} · Recall` })}>Start {sessionSize} questions</button>
    <p className="tiny faint center">Leave any time · no loss of learning. If a quest expires, nobody is blamed.</p>
  </div>
}

function Circles() {
  const [gs, setGs] = useState<CircleT[] | null>(null); const [code, setCode] = useState(''); const [err, setErr] = useState('')
  useEffect(() => { api.my_groups().then(setGs) }, [])
  if (!gs) return <div className="skel" style={{ height: 160 }} />
  return <>{gs.map(g => <Link key={g.id} to={`/circle/${g.id}`} className="card col" style={{ padding: 0, overflow: 'hidden', color: 'inherit' }}>
    <img src={asset('worlds/scenes/hero-sunrise/hero-sunrise-wide-1200x675.webp')} alt="" style={{ width: '100%', height: 120, objectFit: 'cover' }} />
    <div className="col gap8" style={{ padding: 16 }}><h2>{g.name}</h2><p className="tiny muted">{g.members.length} members · {g.coaches.length} coach · moderated</p>
      <div className="bar green thin"><i style={{ width: `${Math.min(100, g.goal.done / g.goal.target * 100)}%` }} /></div><p className="tiny muted">Shared goal · {g.goal.done} / {g.goal.target} sittings this week</p></div></Link>)}
    <div className="card col gap8"><b>Join a circle</b><label className="lbl" htmlFor="cc">Invite code</label><input id="cc" className="field" value={code} onChange={e => { setErr(''); setCode(e.target.value) }} placeholder="e.g. GRACE-YOUTH" autoComplete="off" />
      {err && <p className="small" role="alert" style={{ color: 'var(--rh-incorrect)' }}>{err}</p>}
      <button className="btn block" disabled={!code.trim()} onClick={async () => { try { await api.join_group(code); setGs(await api.my_groups()); setCode('') } catch (e) { setErr((e as Error).message) } }}>Join circle</button>
      <p className="tiny faint">A circle invite never unlocks a licensed manual.</p></div></>
}

// ---- Circle home (R39) -----------------------------------------------------------------------------
export function CircleHome() {
  const { id = '' } = useParams(); const nav = useNavigate(); const start = useStart(); const m = useManualData(); const { done } = useStore()
  const [g, setG] = useState<CircleT | null>(null); const [safety, setSafety] = useState(false); const [reminded, setReminded] = useState(false)
  useEffect(() => { api.my_groups().then(x => setG(x.find(y => y.id === id) ?? null)) }, [id])
  if (!g || !m) return <Loading />
  const cur = m.lessons.find(l => !done[`${m.code}|${l.id}`]) ?? m.lessons[0]
  return <div className="page col gap16" style={{ maxWidth: 640 }}>
    <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', minHeight: 170 }}>
      <img src={asset('worlds/scenes/hero-sunrise/hero-sunrise-wide-1200x675.webp')} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <div className="row between" style={{ position: 'relative', padding: 10 }}><button className="iconbtn" style={{ background: 'var(--rh-glass)' }} aria-label="Back" onClick={() => nav('/circle')}><Icon n="back" /></button><button className="chip lg" style={{ background: 'var(--rh-glass)', color: 'var(--rh-text)', border: 0 }} onClick={() => setSafety(true)}><Icon n="shield" />Safety</button></div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, background: 'linear-gradient(transparent,var(--rh-bg))' }}><h1>{g.name}</h1><p className="tiny muted">{g.members.length} members · {g.coaches.length} coach · moderated</p></div></div>
    <div className="card col gap8"><div className="row between"><p className="eyebrow">Shared goal · this week</p><b className="small">{g.goal.done} / {g.goal.target}</b></div><b>{g.goal.target} sittings as a circle</b>
      <div className="bar green"><i style={{ width: `${Math.min(100, g.goal.done / g.goal.target * 100)}%` }} /></div><p className="tiny muted">Counts learning, never messages</p></div>
    {g.assignments.map(a => <div key={a.id} className="card row"><span className="tile apricot"><Icon n="flag" /></span><div className="grow"><p className="eyebrow">From your coach</p><b>{a.title}</b><div className="tiny muted">{a.by} · due {new Date(a.due).toLocaleDateString(undefined, { weekday: 'long' })}</div></div>
      <button className="btn sm" onClick={() => start({ kind: 'target', manual: m.code, lessons: a.lessons.length ? a.lessons : [cur.id], count: a.count, focus: a.focus, title: `Assignment · ${a.title}` })}>Start</button></div>)}
    <div className="card row"><span className="tile"><Icon n="radio" /></span><div className="grow"><b>Quiz Night · {new Date(g.quizNight.at).toLocaleDateString(undefined, { weekday: 'short' })} {new Date(g.quizNight.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</b><div className="tiny muted">Room {g.quizNight.room} · {g.quizNight.signedUp} signed up</div></div>
      <button className="btn sec sm" onClick={() => setReminded(true)}>{reminded ? 'Reminder set' : 'Remind'}</button></div>
    <div className="row between"><div className="row" style={{ gap: 0 }}>{g.members.slice(0, 6).map((u, i) => <img key={u.id} src={asset(`characters/glim/avatars/avatar-${u.cw}-64.png`)} width={34} height={34} alt="" style={{ marginLeft: i ? -8 : 0, borderRadius: 99, background: 'var(--rh-surface2)', border: '2px solid var(--rh-bg)' }} />)}<span className="tiny muted" style={{ marginLeft: 8 }}>+{g.members.length - 6} members</span></div>
      <Link className="chip lg" to={`/circle/${g.id}/chat`}><Icon n="send" />Chat</Link></div>
    {safety && <SafetySheet g={g} onClose={() => setSafety(false)} onLeft={() => nav('/circle')} />}
    <DemoNote />
  </div>
}

// ---- Chat (R40) + safety (R41) -----------------------------------------------------------------------
export function CircleChat() {
  const { id = '' } = useParams(); const nav = useNavigate(); const { prefs } = useStore()
  const [g, setG] = useState<CircleT | null>(null); const [msgs, setMsgs] = useState<Message[] | null>(null); const [text, setText] = useState(''); const [safety, setSafety] = useState(false); const [report, setReport] = useState<Message | null>(null)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { api.my_groups().then(x => setG(x.find(y => y.id === id) ?? null)); api.messages(id).then(setMsgs) }, [id])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs?.length])
  if (!g || !msgs) return <Loading />
  const send = async () => { const t = text.trim(); if (!t) return; setText(''); const m = await api.send_message(id, t); setMsgs(x => [...x!, m]) }
  return <div className="page col gap8" style={{ maxWidth: 760, minHeight: 'calc(100dvh - 80px)' }}>
    <BackBar title={g.name} onBack={() => nav(`/circle/${id}`)} right={<button className="iconbtn" aria-label="Safety: mute, report, block or leave" onClick={() => setSafety(true)}><Icon n="shield" /></button>} />
    <p className="tiny muted center">{g.members.length} members · moderated</p>
    {inQuiet(prefs.quiet) && <p className="hint"><Icon n="clock" />Quiet hours {prefs.quiet[0]}–{prefs.quiet[1]} · you are not notified</p>}
    {g.muted && <p className="hint"><Icon n="mute" />You muted this circle. Messages still arrive here; you get no notifications.</p>}
    <div className="col gap8" style={{ flex: 1 }}>{msgs.map(m => <div key={m.id} className="row" style={{ alignItems: 'flex-end', justifyContent: m.mine ? 'flex-end' : 'flex-start' }}>
      {!m.mine && <GlimHead cw={m.user.cw} size={32} />}
      <div style={{ maxWidth: '78%' }}>{!m.mine && <p className="tiny b" style={{ margin: '0 0 2px 4px' }}>{m.user.name}{m.user.role === 'coach' ? ' · Coach' : ''} <span className="faint">{new Date(m.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span></p>}
        <div style={{ padding: '10px 14px', borderRadius: 16, background: m.mine ? 'var(--rh-raised)' : 'var(--rh-surface)', border: '1.5px solid var(--rh-line)' }} className="small">{m.text}</div>
        {!m.mine && <button className="btn link" style={{ minHeight: 28, padding: '0 4px', fontSize: 12 }} onClick={() => setReport(m)}>Report</button>}</div></div>)}<div ref={end} /></div>
    <form className="row gap8" style={{ position: 'sticky', bottom: 'calc(var(--rh-nav-h) + 8px)', background: 'var(--rh-bg)', paddingTop: 8 }} onSubmit={e => { e.preventDefault(); send() }}>
      <input className="field" value={text} onChange={e => setText(e.target.value)} placeholder="Message the circle" aria-label="Message the circle" maxLength={500} />
      <button className="btn" type="submit" aria-label="Send" disabled={!text.trim()}><Icon n="send" /></button></form>
    {safety && <SafetySheet g={g} onClose={() => setSafety(false)} onLeft={() => nav('/circle')} onMuted={mu => setG({ ...g, muted: mu })} />}
    {report && <ReportSheet kind="message" target={report.id} who={report.user} onClose={() => setReport(null)} onBlocked={() => setMsgs(x => x!.filter(y => y.user.id !== report.user.id))} />}
  </div>
}

function SafetySheet({ g, onClose, onLeft, onMuted }: { g: CircleT; onClose: () => void; onLeft: () => void; onMuted?: (m: boolean) => void }) {
  const [rep, setRep] = useState(false); const [sure, setSure] = useState(false)
  if (rep) return <ReportSheet kind="user" target={g.id} onClose={onClose} />
  return <Sheet label="Safety" onClose={onClose}><div className="col"><h2>Safety</h2><p className="small muted">Always one tap away. Leaving or muting never affects your private study.</p>
    <div className="card list" style={{ padding: '2px 14px' }}>
      <button className="li" onClick={async () => { await api.mute_group(g.id, !g.muted); onMuted?.(!g.muted); onClose() }}><span className="tile"><Icon n="mute" className="s" /></span><span className="grow"><b className="small">{g.muted ? 'Unmute circle' : 'Mute circle'}</b><span className="tiny muted" style={{ display: 'block' }}>No notifications from this circle</span></span></button>
      <button className="li" onClick={() => setRep(true)}><span className="tile apricot"><Icon n="flag" className="s" /></span><span className="grow"><b className="small">Report a problem</b><span className="tiny muted" style={{ display: 'block' }}>Reaches the moderators; your name is never shown to the reported person</span></span></button>
      <button className="li" onClick={() => setSure(true)}><span className="tile red"><Icon n="door" className="s" /></span><span className="grow"><b className="small">Leave circle</b><span className="tiny muted" style={{ display: 'block' }}>Your learning progress stays with you</span></span></button></div>
    {sure && <div className="card lav col"><b>Leave {g.name}?</b><div className="row gap8"><button className="btn sec grow" onClick={() => setSure(false)}>Stay</button><button className="btn bad grow" onClick={async () => { await api.leave_group(g.id); onLeft() }}>Leave</button></div></div>}
    <p className="tiny muted">For an urgent safety concern, tell a trusted adult or your church coordinator straight away.</p></div></Sheet>
}

export function ReportSheet({ kind, target, who, onClose, onBlocked }: { kind: Report['kind']; target: string; who?: PublicUser; onClose: () => void; onBlocked?: () => void }) {
  const [why, setWhy] = useState(''); const [note, setNote] = useState(''); const [done, setDone] = useState<Report | null>(null); const [busy, setBusy] = useState(false); const [blocked, setBlocked] = useState(false)
  const reasons = kind === 'content' ? ['The expected answer is wrong', 'The question is unclear', 'A typo', 'Something else'] : ['Unkind or bullying', 'Inappropriate content', 'Spam', 'I feel unsafe', 'Something else']
  if (done) return <Sheet label="Report sent" onClose={onClose}><div className="col center" style={{ alignItems: 'center' }}><img src={asset('illustrations/states/state-sent-256.webp')} width={120} alt="" /><h2>Thank you. We have it.</h2>
    <p className="muted">Reference <b>{done.ref}</b>. A moderator reviews reports in order; we cannot promise an outcome, but we take every report seriously.{kind === 'content' ? ' A report never changes a grade.' : ''}</p>
    {who && !blocked && <button className="btn sec block" onClick={async () => { await api.block_user(who.id); setBlocked(true); onBlocked?.() }}>Also block {who.handle}</button>}
    {blocked && <p className="small" role="status">{who?.handle} is blocked. You will not see their messages.</p>}
    <button className="btn block" onClick={onClose}>Close</button></div></Sheet>
  return <Sheet label="Report" onClose={onClose}><div className="col"><h2>Report {kind === 'message' ? 'this message' : kind === 'user' ? 'a problem' : 'a content error'}</h2>
    {reasons.map(r => <button key={r} className={`opt ${why === r ? 'sel' : ''}`} onClick={() => setWhy(r)}><span className="grow">{r}</span></button>)}
    <label className="lbl" htmlFor="rn">Anything else? (optional)</label><textarea id="rn" className="field" rows={3} value={note} onChange={e => setNote(e.target.value)} />
    <button className="btn block" disabled={!why || busy} onClick={async () => { setBusy(true); setDone(await api.report(kind, target, why, note)) }}>Send report</button>
    <p className="tiny muted">Your identity is never shown to the person you report.</p></div></Sheet>
}
