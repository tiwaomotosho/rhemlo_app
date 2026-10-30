import { Link } from 'react-router-dom'
import { daysUntil, readinessGap } from '@/lib/engine'
import { day, lessonStats, manualStats, streakInfo, useStore } from '@/lib/store'
import { Glim, Icon, Loading, Segments, useManualData } from '@/ui/bits'

export default function Progress() {
  const m = useManualData(); const { cards, history, activeDays, sessionSize, profile } = useStore()
  if (!m) return <Loading />
  const all = manualStats(cards, m), { streak } = streakInfo(activeDays), set = new Set(activeDays)
  const last14 = Array.from({ length: 14 }, (_, i) => day(Date.now() - (13 - i) * 86400000))
  const stages = m.stages.map(st => ({ st, g: readinessGap(m, st.lessons, cards), left: daysUntil(st.date) }))
  const plan = stages.map(({ st, g, left }) => {
    const need = Math.max(0, Math.ceil(0.95 * g.total) - g.secure), days = Math.max(1, left)
    return { st, g, left, need, perDay: Math.ceil(need / days) }
  })
  return <div className="col" style={{ gap: 18 }}>
    <div className="hero"><div><p className="eyebrow">You · Progress</p><h1>How it's going, {profile.name}</h1></div><Glim pose="read" size={256} style={{ width: 72, height: 72 }} /></div>
    <div className="desk2"><div className="col">
      <div className="card col"><h3>Mastery across the manual</h3><Segments s={all.secure} t={all.strengthening} l={all.learning} total={all.total} />
        <p className="small muted">“Secure” means answered right on spaced reviews at least four times in a row. Marking never changes with streaks or difficulty.</p></div>
      <div className="card col"><h3>Last 14 days</h3><div className="dots" aria-label="Active days">{last14.map(d => <i key={d} className={set.has(d) ? 'on' : ''} title={d} />)}</div><p className="small muted">{streak} day streak · {activeDays.length} active days in total</p></div>
      <div className="card col"><h3>Recent sittings</h3>{history.length ? <div className="list">{history.slice(0, 8).map(h => <div key={h.id} className="row"><span className="pill">{h.kind}</span><span className="grow small">{h.lesson ?? 'mixed'} · {new Date(h.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span><b>{h.right}/{h.total}</b></div>)}</div> : <p className="muted">No sittings yet. Your first quest starts on the Journey.</p>}</div>
    </div>
    <div className="col">
      <div className="card tint col"><h3>Planner</h3><p className="small muted">Based on today's date and your secure cards. A guide, not a promise.</p>
        {plan.map(p => <div key={p.st.name} className="col" style={{ gap: 6 }}><div className="row"><b className="grow">{p.st.name}</b><span className="pill">{Math.max(0, p.left)} days</span></div>
          <div className="bar"><i className="s" style={{ width: `${Math.min(100, p.g.readiness / .95 * 100)}%` }} /></div>
          <p className="small">{p.need === 0 ? 'At the 95% target. Keep reviews going to hold it.' : `${p.need.toLocaleString()} more cards to secure → about ${p.perDay} a day. A ${sessionSize}-question sitting moves roughly ${Math.round(sessionSize * .6)} of them.`}</p></div>)}
      </div>
      <div className="list">{m.lessons.filter(l => lessonStats(cards, m, l.id).total && Object.keys(cards).some(k => k.startsWith(`${m.code}|${m.code}:${l.id}.`))).slice(0, 12).map(l => { const s = lessonStats(cards, m, l.id); return <div key={l.id} className="card col" style={{ gap: 8, padding: 12 }}><div className="row"><b className="grow">{l.n} · {l.title.toLowerCase()}</b><span className="small muted">{Math.round(s.readiness * 100)}%</span></div><Segments s={s.secure} t={s.strengthening} l={s.learning} total={s.total} /></div> })}</div>
      <Link to="/you" className="btn ghost block"><Icon n="back" />Back to You</Link>
    </div></div>
  </div>
}
