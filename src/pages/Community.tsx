// Leaderboards and seasons, private leagues with invite links, inbox, direct messages with
// under-18 safeguards, and host rooms of up to 100 (PRD 9.12–9.14, CP-12).
import { useEffect, useRef, useState } from 'react'
import { useTabSwipe } from '@/ui/swipe'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { isDemo, social, type BoardRow, type BoardScope, type DM, type InboxItem, type PrivateLeague, type Room, type RoomOptions, type RoomReveal, type RoomState, type Thread, type PublicUser } from '@/lib/backend'
import { readPassage } from '@/lib/data'
import { niceTitle } from '@/lib/engine'
import { play } from '@/lib/sound'
import { useStore } from '@/lib/store'
import { BackBar, Glim, GlimHead, Icon, Loading, StateCard, useManualData } from '@/ui/bits'
import { NeedAccount } from './Arena'
import { ReportSheet } from './Circle'
import { roomQuestions, same, Tiles, Timer, useCountdown, useRoom, type LiveQ } from './Live'

const DemoNote = ({ t = 'other people and their points are simulated' }: { t?: string }) => isDemo ? <p className="tiny faint center"><Icon n="info" className="s" style={{ verticalAlign: 'middle' }} /> Demo server: {t}.</p> : null
const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'now' : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d` }
function Rows({ rows }: { rows: BoardRow[] }) {
  return <div className="card list" style={{ padding: '2px 14px' }}>{rows.map(r => <div key={r.user.id + r.rank} className="li" style={{ background: r.you ? 'var(--rh-raised)' : undefined, borderRadius: r.you ? 12 : 0, paddingLeft: r.you ? 8 : 4 }}>
    <b style={{ width: 34 }}>{r.rank}</b>{r.hidden && !r.you ? <span className="tile" style={{ width: 34, height: 34 }}><Icon n="you" className="s" /></span> : <GlimHead cw={r.user.cw} size={34} />}
    <span className="grow small"><b>{r.user.handle}{r.you ? ' (you)' : ''}</b>{r.user.demo && !r.hidden && <span className="tiny faint"> · demo</span>}</span><b>{r.points.toLocaleString()}</b></div>)}</div>
}

// ---- Leaderboards (FR-CP-05) -----------------------------------------------------------------------
export function Boards() {
  const { account, manual } = useStore(); const nav = useNavigate(); const [scope, setScope] = useState<BoardScope>('week'); const [rows, setRows] = useState<BoardRow[] | null>(null); const [season, setSeason] = useState('')
  useEffect(() => { if (!account) return; setRows(null); social.leaderboard(scope, manual).then(setRows); social.seasons().then(s => setSeason(s.find(x => x.active)?.name ?? '')) }, [scope, account, manual])
  const mine = rows?.find(r => r.you)
  const ts = useTabSwipe(['week', 'season', 'all', 'friends', 'org'] as const, scope, setScope)
  return <div className="page col gap16" style={{ maxWidth: 680 }}>
    <BackBar title="Leaderboards" onBack={() => nav('/arena')} />
    <div className="tabs" role="tablist">{([['week', 'This week'], ['season', 'Season'], ['all', 'All time'], ['friends', 'Friends'], ['org', 'Parish']] as const).map(([k, t]) => <button key={k} role="tab" aria-selected={scope === k} className={scope === k ? 'on' : ''} onClick={() => ts.pick(k)}>{t}</button>)}</div>
    <div key={ts.key} {...ts.swipe} className={`col gap16 ${ts.cls}`}>{!account ? <NeedAccount what="leaderboards" /> : !rows ? <div className="skel" style={{ height: 300 }} /> : <>
      <div className="card row"><Glim pose="trophy" size={64} /><div className="grow"><p className="eyebrow">{scope === 'season' ? season : scope === 'all' ? 'Since the first season' : scope === 'org' ? 'Grace Parish Youth' : scope === 'friends' ? 'You and your connections' : 'Monday to Sunday'}</p><b className="disp">{mine ? `You are ${ord(mine.rank)} of ${rows.length}` : 'Not ranked yet'}</b><div className="tiny muted">{mine?.points.toLocaleString() ?? 0} verified points · ties share a place</div></div></div>
      <Rows rows={rows.slice(0, 50)} />
      {mine && mine.rank > 50 && <Rows rows={[mine]} />}</>}</div>
    <p className="hint"><Icon n="shield" />Hidden learners appear as “Hidden learner”. Change yours in You → Privacy. Only server-verified answers score.</p>
    <DemoNote />
  </div>
}

// ---- Private leagues ----------------------------------------------------------------------------------
export function Leagues() {
  const { account } = useStore(); const nav = useNavigate(); const [list, setList] = useState<PrivateLeague[] | null>(null); const [name, setName] = useState(''); const [note, setNote] = useState(''); const [code, setCode] = useState(''); const [err, setErr] = useState('')
  const load = () => social.my_leagues().then(setList)
  useEffect(() => { if (account) load() }, [account])
  if (!account) return <div className="page" style={{ maxWidth: 560 }}><BackBar title="Private leagues" onBack={() => nav('/arena')} /><NeedAccount what="private leagues" /></div>
  return <div className="page col gap16" style={{ maxWidth: 680 }}>
    <BackBar title="Private leagues" onBack={() => nav('/arena')} />
    <p className="muted">Your own season-long table with friends, a class or a parish. Same verified points as everywhere; nothing extra to earn.</p>
    {!list ? <div className="skel" style={{ height: 120 }} /> : list.map(l => <Link key={l.id} to={`/arena/leagues/${l.id}`} className="card row" style={{ color: 'inherit' }}><span className="tile"><Icon n="trophy" /></span><div className="grow"><b>{l.name}</b><div className="tiny muted">{l.members.length} members · code {l.code}</div></div><Icon n="chev" className="faint" /></Link>)}
    <div className="grid2">
      <form className="card col gap8" onSubmit={async e => { e.preventDefault(); const l = await social.create_league(name, note); setName(''); setNote(''); nav(`/arena/leagues/${l.id}`) }}><h3>Create a league</h3>
        <input className="field" value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="League name" aria-label="League name" />
        <input className="field" value={note} maxLength={120} onChange={e => setNote(e.target.value)} placeholder="Short note (optional)" aria-label="Note" />
        <button className="btn" disabled={!name.trim()}>Create and get invite link</button></form>
      <form className="card col gap8" onSubmit={e => { e.preventDefault(); nav(`/l/${code}`) }}><h3>Join with a code</h3>
        <input className="field" value={code} maxLength={6} onChange={e => { setErr(''); setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')) }} placeholder="P12CUP" aria-label="Invite code" style={{ letterSpacing: '.3em', textAlign: 'center' }} />
        {err && <p className="small" role="alert">{err}</p>}<button className="btn sec" disabled={code.length < 6}>Preview league</button></form></div>
    <DemoNote />
  </div>
}
export function LeagueTable() {
  const { id = '' } = useParams(); const nav = useNavigate(); const [l, setL] = useState<PrivateLeague | null>(null); const [rows, setRows] = useState<BoardRow[] | null>(null); const [copied, setCopied] = useState(false)
  useEffect(() => { social.my_leagues().then(x => setL(x.find(y => y.id === id) ?? null)); social.league_table(id).then(setRows) }, [id])
  if (!l || !rows) return <Loading />
  const link = `${location.origin}/l/${l.code}`
  return <div className="page col gap16" style={{ maxWidth: 680 }}>
    <BackBar title={l.name} onBack={() => nav('/arena/leagues')} />
    {l.note && <p className="muted">{l.note}</p>}
    <div className="card row wrap"><div className="grow"><p className="eyebrow">Invite link</p><b className="small" style={{ wordBreak: 'break-all' }}>{link}</b></div>
      <button className="btn sec sm" onClick={async () => { try { if (navigator.share) await navigator.share({ title: l.name, text: `Join my Rhemlo league “${l.name}”`, url: link }); else { await navigator.clipboard.writeText(link); setCopied(true) } } catch { /* cancelled */ } }}><Icon n="send" className="s" />{copied ? 'Copied' : 'Share'}</button></div>
    <Rows rows={rows} />
    <button className="btn link" style={{ color: 'var(--rh-incorrect)' }} onClick={async () => { await social.leave_private(l.id); nav('/arena/leagues') }}>Leave league</button>
    <DemoNote />
  </div>
}
export function JoinLeague() {
  const { code = '' } = useParams(); const nav = useNavigate(); const { account } = useStore(); const [l, setL] = useState<(PrivateLeague & { ownerUser?: PublicUser }) | null>(null); const [err, setErr] = useState('')
  useEffect(() => { if (account) social.league_preview(code).then(setL).catch(e => setErr(e.message)) }, [code, account])
  return <div className="page col gap16 center" style={{ maxWidth: 520, alignItems: 'center' }}>
    <BackBar title="League invite" onBack={() => nav('/arena')} />
    {!account ? <NeedAccount what="private leagues" /> : err ? <StateCard img="error" title="Invite not found" body={err} action={<button className="btn sec block" onClick={() => nav('/arena/leagues')}>Private leagues</button>} /> : !l ? <Loading /> : <>
      <Glim pose="trophy" size={130} /><p className="eyebrow">You are invited to</p><h1>{l.name}</h1>
      <p className="muted">Started by {l.ownerUser?.name ?? 'a learner'} · {l.members.length} member{l.members.length === 1 ? '' : 's'}{l.note ? ` · ${l.note}` : ''}</p>
      <div className="row wrap gap8" style={{ justifyContent: 'center' }}><span className="chip plain">Handle only</span><span className="chip plain">Leave any time</span><span className="chip plain">No extra points</span></div>
      <button className="btn block" onClick={async () => { const x = await social.join_league_code(code); nav(`/arena/leagues/${x.id}`) }}>Join league</button></>}
  </div>
}

// ---- Inbox (CP-12) ------------------------------------------------------------------------------------
export function Inbox() {
  const { account } = useStore(); const nav = useNavigate(); const [items, setItems] = useState<InboxItem[] | null>(null); const [answered, setAnswered] = useState<Record<string, string>>({})
  useEffect(() => { if (account) social.inbox().then(x => { setItems(x); social.mark_read(x.filter(i => !i.read).map(i => i.id)) }) }, [account])
  const ic: Record<InboxItem['kind'], [string, string]> = { system: ['info', ''], moderation: ['shield', 'red'], assignment: ['flag', 'apricot'], league: ['trophy', ''], consent: ['you', 'green'], dm: ['chat', ''] }
  return <div className="page col gap16" style={{ maxWidth: 640 }}>
    <div className="pagehead"><h1>Inbox</h1><Link to="/messages" className="btn sec sm"><Icon n="chat" className="s" />Messages</Link></div>
    {!account ? <NeedAccount what="your inbox" /> : !items ? <div className="skel" style={{ height: 200 }} /> : !items.length ? <StateCard img="caughtup" title="All caught up" body="Notices from your coach, leagues and safety team arrive here." /> :
      <div className="col gap8">{items.map(i => <div key={i.id} className="card row" role={i.link ? 'link' : undefined} tabIndex={i.link ? 0 : undefined} style={{ textAlign: 'left', color: 'inherit', alignItems: 'flex-start', cursor: i.link ? 'pointer' : undefined, borderColor: i.read ? undefined : 'var(--rh-action)' }}
        onClick={() => i.link && nav(i.link)} onKeyDown={e => { if (e.key === 'Enter' && i.link) nav(i.link) }}>
        <span className={`tile ${ic[i.kind][1]}`}><Icon n={ic[i.kind][0]} /></span><div className="grow"><b className="small">{i.title}</b><p className="small muted" style={{ margin: '2px 0' }}>{i.body}</p><span className="tiny faint">{new Date(i.at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          {i.action?.type === 'connection' && (answered[i.id] ? <p className="small" role="status">{answered[i.id]}</p> : <div className="row gap8 mt8">
            <button className="btn xs" onClick={async e => { e.stopPropagation(); await social.respond_connection(i.action!.user, true); setAnswered(a => ({ ...a, [i.id]: 'Connected. You can now see each other’s milestones.' })) }}>Accept</button>
            <button className="btn sec xs" onClick={async e => { e.stopPropagation(); await social.respond_connection(i.action!.user, false); setAnswered(a => ({ ...a, [i.id]: 'Declined.' })) }}>Decline</button></div>)}</div>
          {!i.read && <span className="chip">New</span>}</div>)}</div>}
    <DemoNote t="notices are generated for the demo" />
  </div>
}

// ---- Direct messages (FR-CP-08, safeguards 9.14) --------------------------------------------------------
const STICKERS = ['🙏', '🔥', '📖', '👏', '💯', '🌱', '✨', '🏆']
export function Messages() {
  const { account } = useStore(); const nav = useNavigate(); const [list, setList] = useState<Thread[] | null>(null)
  useEffect(() => { if (account) social.threads().then(setList) }, [account])
  return <div className="page col gap16" style={{ maxWidth: 640 }}>
    <BackBar title="Messages" onBack={() => nav('/inbox')} />
    {!account ? <NeedAccount what="messages" /> : !list ? <div className="skel" style={{ height: 200 }} /> : <div className="card list" style={{ padding: '2px 14px' }}>{list.map(t => <Link key={t.with.id} to={`/messages/${t.with.id}`} className="li" style={{ color: 'inherit' }}>
      <GlimHead cw={t.with.cw} size={40} /><span className="grow"><b className="small">{t.with.name}{t.with.role === 'coach' ? ' · Coach' : ''}</b><span className="tiny muted" style={{ display: 'block' }}>{t.last ? (t.last.deleted ? 'Message deleted' : t.last.sticker ?? t.last.text.slice(0, 60)) : 'Say hello'}</span></span>
      {t.last && <span className="tiny faint">{ago(t.last.at)}</span>}{t.unread > 0 && <span className="chip">{t.unread}</span>}</Link>)}</div>}
    <p className="hint"><Icon n="shield" />Under-18s message only their connections, after a guardian agrees. Who can message you is set in You → Privacy.</p>
    <DemoNote t="replies from demo people are simulated" />
  </div>
}
export function DMThread() {
  const { id = '' } = useParams(); const nav = useNavigate(); const [msgs, setMsgs] = useState<DM[] | null>(null); const [text, setText] = useState(''); const [can, setCan] = useState<{ ok: boolean; why?: string } | null>(null); const [err, setErr] = useState(''); const [rep, setRep] = useState(false); const [who, setWho] = useState<PublicUser | null>(null)
  const end = useRef<HTMLDivElement>(null); const myId = useStore(s => s.account?.userId)
  const reload = () => social.dm(id).then(setMsgs)
  useEffect(() => { reload(); social.can_message(id).then(setCan); social.threads().then(t => setWho(t.find(x => x.with.id === id)?.with ?? null)); const t = setInterval(reload, 3000); return () => clearInterval(t) }, [id]) // eslint-disable-line
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs?.length])
  if (!msgs || !can) return <Loading />
  const send = async (sticker?: string) => { setErr(''); try { await social.send_dm(id, sticker ? '' : text, sticker); setText(''); reload() } catch (e) { setErr((e as Error).message) } }
  return <div className="page col gap8" style={{ maxWidth: 680, minHeight: 'calc(100dvh - 80px)' }}>
    <BackBar title={who?.name ?? 'Message'} onBack={() => nav('/messages')} right={<button className="iconbtn" aria-label="Report or block" onClick={() => setRep(true)}><Icon n="shield" /></button>} />
    <div className="col gap8" style={{ flex: 1 }}>{msgs.map(m => { const mine = m.from === myId; return <div key={m.id} className="row" style={{ justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: '78%' }}><div className="small" style={{ padding: m.sticker ? 4 : '10px 14px', fontSize: m.sticker ? 40 : undefined, borderRadius: 16, background: m.sticker ? 'transparent' : mine ? 'var(--rh-raised)' : 'var(--rh-surface)', border: m.sticker ? 0 : '1.5px solid var(--rh-line)', fontStyle: m.deleted ? 'italic' : undefined, whiteSpace: 'pre-wrap' }}>{m.deleted ? 'Message deleted' : m.sticker ?? m.text}</div>
        <span className="tiny faint" style={{ padding: '0 4px' }}>{ago(m.at)}{mine && !m.deleted && <button className="btn link" style={{ minHeight: 24, padding: '0 6px', fontSize: 12 }} onClick={async () => { await social.delete_dm(m.id); reload() }}>Delete</button>}</span></div></div> })}<div ref={end} /></div>
    {!can.ok ? <p className="hint"><Icon n="lock" />{can.why}</p> : <>
      <div className="row gap4 wrap">{STICKERS.map(s => <button key={s} className="iconbtn" style={{ fontSize: 20 }} aria-label={`Send sticker ${s}`} onClick={() => send(s)}>{s}</button>)}</div>
      <form className="row gap8" style={{ position: 'sticky', bottom: 'calc(var(--rh-nav-h) + 8px)', background: 'var(--rh-bg)', paddingTop: 8 }} onSubmit={e => { e.preventDefault(); if (text.trim()) send() }}>
        <textarea className="field" rows={1} value={text} maxLength={2000} onChange={e => setText(e.target.value)} placeholder="Message" aria-label="Message" style={{ resize: 'none' }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim()) send() } }} />
        <button className="btn" type="submit" aria-label="Send" disabled={!text.trim()}><Icon n="send" /></button></form>
      <p className="tiny faint">{text.length.toLocaleString()} / 2,000</p></>}
    {err && <p className="small" role="alert" style={{ color: 'var(--rh-incorrect)' }}>{err}</p>}
    {rep && who && <ReportSheet kind="user" target={who.id} who={who} onClose={() => setRep(false)} onBlocked={() => nav('/messages')} />}
  </div>
}

// ---- Host rooms up to 100 (FR-CP-10) ----------------------------------------------------------------------
export function HostRoom() {
  const m = useManualData(); const nav = useNavigate(); const { account, done } = useStore()
  const [o, setO] = useState<RoomOptions>({ lessons: [], formats: ['mcq'], count: 15, seconds: 20, cap: 100 }); const [code, setCode] = useState('')
  if (!m) return <Loading />
  const cleared = m.lessons.filter(l => done[`${m.code}|${l.id}`])
  const tog = <T,>(a: T[], x: T) => a.includes(x) ? a.filter(y => y !== x) : [...a, x]
  return <div className="page col gap16" style={{ maxWidth: 680 }}>
    <BackBar title="Host a room" onBack={() => nav('/arena')} />
    {!account ? <NeedAccount what="hosted rooms" /> : <>
      <p className="muted">Run a live round for your class or parish. Up to 100 players; they join with the room code. Rooms never add league points.</p>
      <div className="card col gap8"><span className="lbl">Lessons</span><div className="row wrap gap8">{m.lessons.map(l => <button key={l.id} className="chip btnchip" aria-pressed={o.lessons.includes(l.id)} onClick={() => setO({ ...o, lessons: tog(o.lessons, l.id) })} title={niceTitle(l.title)}>L{l.n}</button>)}</div>
        <div className="row gap8"><button className="btn link xs" onClick={() => setO({ ...o, lessons: cleared.map(l => l.id) })}>Lessons I have cleared</button><button className="btn link xs" onClick={() => setO({ ...o, lessons: [] })}>Clear</button></div>
        <span className="lbl">Formats</span><div className="row gap8">{(['mcq', 'typed'] as const).map(f => <button key={f} className="chip btnchip" aria-pressed={o.formats.includes(f)} onClick={() => { const n = tog(o.formats, f); if (n.length) setO({ ...o, formats: n }) }}>{f === 'mcq' ? 'Multiple choice · 500' : 'Typed · 750'}</button>)}</div>
        <div className="row gap8 wrap"><label className="small grow">Questions <input type="number" className="field" min={5} max={50} value={o.count} onChange={e => setO({ ...o, count: Math.max(5, Math.min(50, +e.target.value || 5)) })} /></label>
          <label className="small grow">Seconds each <select className="field" value={o.seconds} onChange={e => setO({ ...o, seconds: +e.target.value })}>{[10, 15, 20, 30, 45, 60].map(s => <option key={s}>{s}</option>)}</select></label>
          <label className="small grow">Room size <input type="number" className="field" min={2} max={100} value={o.cap} onChange={e => setO({ ...o, cap: Math.max(2, Math.min(100, +e.target.value || 2)) })} /></label></div>
        <p className="tiny muted">Scoring: 500 for a right choice, 750 for a right typed answer, plus up to 250 for speed on the same question. Marking is the same as everywhere.</p>
        <button className="btn block" disabled={!o.lessons.length} onClick={async () => { const r = await social.create_room(m.code, o); nav(`/arena/room/${r.code}?host=1`) }}>Open room</button></div>
      <form className="card row gap8" onSubmit={e => { e.preventDefault(); nav(`/arena/room/${code}`) }}><input className="field grow" value={code} maxLength={5} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Room code" aria-label="Room code" /><button className="btn sec" disabled={code.length < 5}>Join</button></form></>}
    <DemoNote t="players in rooms are simulated" />
  </div>
}
export function RoomPlay() { return isDemo ? <DemoRoomPlay /> : <LiveRoom /> }

/** Live rooms, friendly matches and Quiz Night: the server keeps the clock, marks every answer and reveals together. */
function LiveRoom() {
  const { code = '' } = useParams(); const nav = useNavigate()
  const [room, setRoom] = useState<Room | null | undefined>(undefined); const [err, setErr] = useState(''); const [st, setSt] = useState<RoomState | null>(null)
  const [now, setNow] = useState(Date.now()); const [skew, setSkew] = useState(0); const [typed, setTyped] = useState(''); const [mine, setMine] = useState<Record<number, string>>({})
  const [rev, setRev] = useState<Record<number, RoomReveal>>({}); const [final, setFinal] = useState<{ name: string; score: number; correct: number; rank: number | null }[] | null>(null)
  const load = async () => { try { let r = await social.room(code); if (r && !r.amPlayer && r.status === 'lobby') r = await social.join_room(code); setRoom(r) } catch (e) { setErr((e as Error).message) } }
  useEffect(() => { load() }, [code]) // eslint-disable-line
  useEffect(() => { if (!room || room.status !== 'lobby') return; const t = setInterval(load, 2000); return () => clearInterval(t) }, [room?.status]) // eslint-disable-line
  useEffect(() => { if (!room?.id || room.status === 'lobby' || final) return
    const tick = async () => { try { const s = await social.room_state(room.id!); setSkew(Date.parse(s.server_time) - Date.now()); setSt(s) } catch (e) { setErr((e as Error).message) } }
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t) }, [room?.id, room?.status, final])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t) }, [])
  const at = now + skew, pos = st?.position ?? 0, closes = st?.closes_at ? Date.parse(st.closes_at) : 0, inReveal = !!st?.question && at >= closes
  useEffect(() => { if (!room?.id || !inReveal || rev[pos]) return; social.room_reveal(room.id, pos).then(r => { setRev(x => ({ ...x, [pos]: r })); play(r.mine?.is_correct ? 'correct' : 'wrong') }).catch(() => {}) }, [inReveal, pos]) // eslint-disable-line
  useEffect(() => { setTyped('') }, [pos])
  useEffect(() => { if (room?.id && st && st.position > st.question_count && !final) social.finish_room(room.id).then(f => { setFinal(f.standings ?? []); play('complete') }).catch(e => setErr((e as Error).message)) }, [st?.position]) // eslint-disable-line
  if (room === undefined && !err) return <Loading />
  if (!room) return <div className="page" style={{ maxWidth: 520 }}><BackBar title="Room" onBack={() => nav('/arena')} /><StateCard img="error" title="No room uses that code" body={err || 'Check the code with your host.'} /></div>
  const answer = async (opt: number | null, text: string | null) => { if (!st?.question || mine[pos] !== undefined) return
    setMine(m => ({ ...m, [pos]: text ?? st.question!.options![opt! - 1] })); const r = await social.answer_room(room.id!, pos, text, opt).catch(e => ({ accepted: false, reason: (e as Error).message }))
    if (!r.accepted) setErr(r.reason === 'question not open' ? 'That answer arrived after the question closed.' : r.reason ?? '') }
  if (final) return <div className="page col gap16 center" style={{ maxWidth: 560, alignItems: 'center' }}><Glim pose="champion" motion="cheer" once size={140} /><h1>{room.kind === 'duel' ? 'Match complete.' : 'Room complete.'}</h1>
    <div className="card list" style={{ width: '100%', padding: '2px 14px' }}>{final.map((p, k) => <div key={p.name + k} className="li"><b style={{ width: 24 }}>{p.rank ?? k + 1}</b><span className="grow small b">{p.name}</span><span className="tiny muted">{p.correct} right</span><b style={{ width: 60, textAlign: 'right' }}>{p.score.toLocaleString()}</b></div>)}</div>
    <p className="tiny muted">Rooms and friendly matches never add league points.</p><button className="btn block" onClick={() => nav('/arena')}>Back to Arena</button></div>
  if (room.status === 'lobby') return <div className="page col gap16 center" style={{ maxWidth: 560, alignItems: 'center' }}>
    <BackBar title={`Room ${room.code}`} onBack={() => nav('/arena')} /><Glim pose="announce" size={120} />
    <h1>{room.amHost ? 'Your room is open.' : `You joined ${room.hostName}’s ${room.kind === 'duel' ? 'match' : 'room'}.`}</h1>
    <p className="muted">{room.players} of {room.options.cap} players · {room.options.count} questions · {room.options.seconds}s each</p>
    {room.amHost && <div className="card center col gap8"><p className="eyebrow">Room code</p><b className="disp" style={{ fontSize: 40, lineHeight: '44px', letterSpacing: '.3em' }}>{room.code}</b></div>}
    <div className="row wrap gap8" style={{ justifyContent: 'center' }}>{(room.playerList ?? []).slice(0, 24).map(p => <span key={p.id} className="chip plain"><GlimHead cw={p.cw} size={22} />{p.handle}</span>)}</div>
    {room.amHost ? <button className="btn block" disabled={room.kind === 'duel' && (room.players ?? 0) < 2} onClick={async () => { try { setRoom(await social.start_room(room.id!)) } catch (e) { setErr((e as Error).message) } }}>{room.kind === 'duel' && (room.players ?? 0) < 2 ? 'Waiting for your friend…' : 'Start'}</button>
      : <p className="hint"><Icon n="clock" />Waiting for {room.hostName} to start.</p>}
    {err && <p className="small" role="alert" style={{ color: 'var(--rh-incorrect)' }}>{err}</p>}</div>
  if (!st) return <Loading />
  if (!st.question) return <div className="page col gap16 center" style={{ maxWidth: 560, alignItems: 'center' }}><Glim pose="announce" size={110} /><h2>Starting…</h2><p className="muted">Get ready. The first question opens in a moment.</p></div>
  const q = st.question, left = Math.max(0, Math.ceil((closes - at) / 1000)), r = rev[pos], picked = mine[pos]
  return <div className="page col gap16" style={{ maxWidth: room.amHost ? 960 : 640 }}>
    <div className="row between"><span className="chip lg">Q {pos} / {st.question_count}</span><Timer left={inReveal ? 0 : left} total={st.seconds} /><span className="chip lg plain"><Icon n="people" />{st.players.length}</span></div>
    <h2>{q.prompt.instruction}</h2>{(q.prompt.text || q.prompt.ref || q.prompt.title) && <div className="pcard">{q.prompt.text ?? q.prompt.ref ?? q.prompt.title}</div>}
    {q.format === 'mcq' && q.options ? <div className="grid2" style={{ gap: 10 }}>{q.options.map((o, k) => {
        const right = !!r && r.correct_option === k + 1, wrong = !!r && picked === o && !right
        return <button key={k} className={`opt ${picked === o ? 'sel' : ''}`} disabled={picked !== undefined || inReveal} onClick={() => answer(k + 1, null)} style={{ opacity: r && !right ? .55 : 1, borderColor: right ? 'var(--rh-correct)' : wrong ? 'var(--rh-incorrect)' : undefined }}>
          <b style={{ width: 22 }}>{'ABCDE'[k]}</b><span className="grow">{o}</span>{right && <Icon n="check" />}{r?.option_counts?.[k + 1] ? <span className="tiny muted">{r.option_counts[k + 1]}</span> : null}</button> })}</div>
      : <form className="row gap8" onSubmit={e => { e.preventDefault(); if (typed.trim()) answer(null, typed) }}><input className="field" value={picked ?? typed} disabled={picked !== undefined || inReveal} onChange={e => setTyped(e.target.value)} placeholder={q.answer_kind === 'reference' ? 'e.g. Colossians 1:17' : q.answer_kind === 'lesson' ? 'Lesson number' : 'Type your answer'} aria-label="Your answer" autoComplete="off" spellCheck={false} /><button className="btn" disabled={!typed.trim() || picked !== undefined || inReveal}>Lock in</button></form>}
    {!inReveal && picked !== undefined && <p className="hint"><Icon n="lock" />Answer locked. Everyone sees the answer together when time is up.</p>}
    {inReveal && <div className="card col gap8"><p className="eyebrow">Answer</p>{r ? <><b>{r.answer}</b>
      <div className="row wrap gap8"><span className="chip ok">{r.answered ? Math.round(r.correct / r.answered * 100) : 0}% of the room right</span>{r.lesson && <span className="chip plain">Lesson {+r.lesson.slice(1)}</span>}{r.mine && <span className={`chip ${r.mine.is_correct ? 'ok' : 'bad'}`}>{r.mine.is_correct ? `+${r.mine.points}` : 'Not this time'}</span>}</div>
      {r.scripture?.filter(x => x.verses?.length).slice(0, 1).map(x => <p key={x.ref} className="small muted">{x.ref.replace(/\b\w/g, c => c.toUpperCase())} (KJV): {x.verses!.map(v => v.t).join(' ').slice(0, 320)}</p>)}</> : <div className="skel" style={{ height: 40 }} />}
      <div className="list">{st.players.slice(0, 5).map((p, k) => <div key={p.name + k} className="li small" style={{ background: p.me ? 'var(--rh-raised)' : undefined, borderRadius: 10 }}><b style={{ width: 24 }}>{k + 1}</b><span className="grow">{p.name}{p.me ? ' (you)' : ''}</span><b>{p.score.toLocaleString()}</b></div>)}</div>
      <p className="tiny muted">Next question in a moment.</p></div>}
    {err && <p className="small" role="alert" style={{ color: 'var(--rh-incorrect)' }}>{err}</p>}
  </div>
}

function DemoRoomPlay() {
  const { code = '' } = useParams(); const nav = useNavigate(); const host = new URLSearchParams(location.search).has('host'); const { profile } = useStore()
  const [room, setRoom] = useState<Room | null | undefined>(undefined); const [qs, setQs] = useState<LiveQ[] | null>(null); const [i, setI] = useState(-1)
  const [pick, setPick] = useState<string | null>(null); const [typed, setTyped] = useState(''); const [ms, setMs] = useState(0); const [reveal, setReveal] = useState(false); const [scores, setScores] = useState<Record<string, number>>({}); const [verse, setVerse] = useState('')
  useEffect(() => { social.room(code).then(r => { setRoom(r); if (r) roomQuestions(r.manual as never, r.options.lessons, r.options.count, r.code, r.options.formats).then(setQs) }) }, [code])
  const size = Math.max(1, (room?.options.cap ?? 30) - 1), { people, answers } = useRoom('room-' + code, Math.min(size, 99))
  const q = qs && i >= 0 ? qs[i] : null, secs = room?.options.seconds ?? 20
  const pts = (ok: boolean, t: number, isTyped?: boolean) => ok ? (isTyped ? 750 : 500) + Math.round(250 * Math.max(0, 1 - t / (secs * 1000))) : 0
  const settled = useRef(-1)
  const settle = () => { if (!q || reveal || settled.current === i) return; settled.current = i; setReveal(true); const opts = q.typed ? [q.answer, '—'] : q.options
    const as = answers(i, q.answer, opts); setScores(s => { const n = { ...s }; for (const a of as) n[a.p.handle] = (n[a.p.handle] ?? 0) + pts(same(a.value, q.answer), a.ms, q.typed)
      if (!host) { const mine = q.typed ? typed : pick ?? ''; const ok = !!mine && same(mine, q.answer); n.__you = (n.__you ?? 0) + pts(ok, ms || secs * 1000, q.typed); play(ok ? 'correct' : 'wrong') } return n })
    if (q.ref) readPassage(q.ref).then(p => setVerse(p ? p.verses.map(v => v.t).join(' ').slice(0, 320) : '')) }
  const left = useCountdown(secs, !!q && !reveal, settle)
  useEffect(() => { setPick(null); setTyped(''); setReveal(false); setVerse('') }, [i])
  if (room === undefined || (room && !qs)) return <Loading />
  if (!room) return <div className="page" style={{ maxWidth: 520 }}><BackBar title="Room" onBack={() => nav('/arena/host')} /><StateCard img="error" title="No room uses that code" body="Check the code with your host." /></div>
  const rows = Object.entries(scores).sort((a, b) => b[1] - a[1]), myRank = rows.findIndex(r => r[0] === '__you') + 1
  const board = rows.slice(0, 5).map(([h, s]) => ({ h: h === '__you' ? profile.handle + ' (you)' : h, s }))
  if (i < 0) return <div className="page col gap16 center" style={{ maxWidth: 560, alignItems: 'center' }}>
    <BackBar title={`Room ${room.code}`} onBack={() => nav('/arena')} /><Glim pose="announce" size={130} />
    <h1>{host ? 'Your room is open.' : `You joined ${room.hostName}’s room.`}</h1><p className="muted">{people.length + (host ? 0 : 1)} of {room.options.cap} players · {qs!.length} questions · {secs}s each · {room.options.formats.map(f => f === 'mcq' ? 'choice' : 'typed').join(' and ')}</p>
    {host && <div className="card center col gap8"><p className="eyebrow">Room code</p><b className="disp" style={{ fontSize: 40, lineHeight: '44px', letterSpacing: '.3em' }}>{room.code}</b></div>}
    <button className="btn block" onClick={() => setI(0)}>{host ? 'Start the first question' : 'Ready'}</button><DemoNote t="players in rooms are simulated" /></div>
  if (i >= qs!.length) return <div className="page col gap16 center" style={{ maxWidth: 560, alignItems: 'center' }}><Glim pose="champion" motion="cheer" once size={140} /><h1>Room complete.</h1>{!host && <p className="muted">You finished {ord(myRank)} of {rows.length}.</p>}
    <div className="card list" style={{ width: '100%', padding: '2px 14px' }}>{board.map((b, k) => <div key={b.h} className="li"><b style={{ width: 24 }}>{k + 1}</b><span className="grow small b">{b.h}</span><b>{b.s.toLocaleString()}</b></div>)}</div>
    <button className="btn block" onClick={() => nav('/arena')}>Back to Arena</button></div>
  const all = reveal ? answers(i, q!.answer, q!.typed ? [q!.answer, '—'] : q!.options) : [], pct = all.length ? Math.round(all.filter(a => same(a.value, q!.answer)).length / all.length * 100) : 0
  return <div className="page col gap16" style={{ maxWidth: host ? 960 : 640 }}>
    <div className="row between"><span className="chip lg">Q {i + 1} / {qs!.length}</span><Timer left={left} total={secs} /><span className="chip lg plain"><Icon n="people" />{people.length + (host ? 0 : 1)}</span></div>
    <h2>{q!.prompt}</h2>{q!.text && <div className="pcard">{q!.text}</div>}
    {q!.typed ? <form className="row gap8" onSubmit={e => { e.preventDefault(); if (typed.trim()) { setMs((secs - left) * 1000); setPick(typed) } }}><input className="field" value={typed} disabled={!!pick || reveal || host} onChange={e => setTyped(e.target.value)} placeholder={host ? 'Players type their answer' : 'Type your answer'} aria-label="Your answer" autoComplete="off" spellCheck={false} /><button className="btn" disabled={!typed.trim() || !!pick || reveal || host}>Lock in</button></form>
      : <Tiles q={q!} picked={host ? null : pick} reveal={reveal} big={host} onPick={o => { if (host) return; setPick(o); setMs((secs - left) * 1000) }} />}
    {!reveal && host && <button className="btn sec" onClick={settle}>Close question now</button>}
    {reveal && <div className="card col gap8"><p className="eyebrow">Answer</p><b>{q!.answer}</b>
      <div className="row wrap gap8"><span className="chip ok">{pct}% of the room right</span>{q!.lesson && <span className="chip plain">Lesson {+q!.lesson.slice(1)}</span>}{q!.typed && <span className="chip plain">Typed · 750</span>}</div>
      {verse && <p className="small muted">{q!.ref} (KJV): {verse}{verse.length >= 320 ? '…' : ''}</p>}
      <div className="list">{board.map((b, k) => <div key={b.h} className="li small"><b style={{ width: 24 }}>{k + 1}</b><span className="grow">{b.h}</span><b>{b.s.toLocaleString()}</b></div>)}</div>
      <button className="btn block" onClick={() => setI(i + 1)}>{i + 1 >= qs!.length ? 'Final results' : 'Next question'}</button></div>}
    {!reveal && !host && pick && <p className="hint"><Icon n="lock" />Answer locked. Waiting for the room.</p>}
  </div>
}

