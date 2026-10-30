import { Link } from 'react-router-dom'
import { daysUntil, readinessGap, weakAreas } from '@/lib/engine'
import { day, lessonStats, manualStats, streakInfo, useStore } from '@/lib/store'
import { Icon, Loading, Segments, useManualData } from '@/ui/bits'
import { useStart } from './Journey'

const WEEK = 7 * 86400000
export default function Progress() {
  const m = useManualData(); const { cards, history, activeDays, sessionSize, points } = useStore(); const start = useStart()
  if (!m) return <Loading />
  const all = manualStats(cards, m), { streak } = streakInfo(activeDays), set = new Set(activeDays)
  const weak = weakAreas(cards, m.code)[0]
  const now = Date.now()
  const weeks = Array.from({ length: 7 }, (_, i) => { const hi = now - (6 - i) * WEEK, lo = hi - WEEK; const h = history.filter(x => x.at > lo && x.at <= hi); const t = h.reduce((a, x) => a + x.total, 0); return { acc: t ? h.reduce((a, x) => a + x.right, 0) / t : 0, n: t } })
  // Monday-first week
  const dow = (new Date().getDay() + 6) % 7, monday = now - dow * 86400000
  const week = Array.from({ length: 7 }, (_, i) => day(monday + i * 86400000)); const planned = week.filter(d => set.has(d)).length
  const plan = m.stages.map(st => { const g = readinessGap(m, st.lessons, cards), left = daysUntil(st.date), need = Math.max(0, Math.ceil(.95 * g.total) - g.secure); return { st, g, left, need, perDay: Math.ceil(need / Math.max(1, left)) } })
  const C = 2 * Math.PI * 46, seg = (n: number) => (all.total ? n / all.total : 0) * C
  return <div className="col" style={{ gap: 16 }}>
    <div className="hero"><h1>Progress</h1><div className="chips"><span className="pill warn"><Icon n="flame" />{streak}</span><span className="pill gold"><Icon n="star" />{points.toLocaleString()}</span></div></div>
    <div className="desk2"><div className="col">
      <div className="card col"><p className="eyebrow">Spaced mastery · {m.short}</p>
        <div className="row" style={{ gap: 18 }}>
          <div className="donut" role="img" aria-label={`${Math.round(all.readiness * 100)} percent secure`}><svg viewBox="0 0 120 120" width="120" height="120"><g transform="rotate(-90 60 60)" fill="none" strokeWidth="14">
            <circle cx="60" cy="60" r="46" stroke="var(--rh-raised)" /><circle cx="60" cy="60" r="46" stroke="var(--rh-apricot)" strokeDasharray={`${seg(all.secure + all.strengthening + all.learning)} ${C}`} />
            <circle cx="60" cy="60" r="46" stroke="var(--rh-gold)" strokeDasharray={`${seg(all.secure + all.strengthening)} ${C}`} /><circle cx="60" cy="60" r="46" stroke="var(--rh-node-done)" strokeDasharray={`${seg(all.secure)} ${C}`} /></g></svg>
            <b><span>{Math.round(all.readiness * 100)}%<small>Secure</small></span></b></div>
          <div className="grow list" style={{ gap: 6, fontSize: 14 }}>{[['Secure', all.secure, 'var(--rh-node-done)'], ['Strengthening', all.strengthening, 'var(--rh-gold)'], ['Learning', all.learning, 'var(--rh-apricot)'], ['Not started', all.notStarted, 'var(--rh-raised)']].map(([l, n, c]) => <div key={l as string} className="row" style={{ gap: 8 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: c as string }} /><span className="grow">{l}</span><b>{(n as number).toLocaleString()}</b></div>)}</div></div>
        <p className="small muted">“Secure” means answered right on spaced reviews until the interval reaches 14 days. Marking never changes with streaks or difficulty.</p></div>
      <div className="card col"><div className="row"><p className="eyebrow grow">Recent accuracy</p><span className="small muted">7 weeks</span></div>
        <div className="wk" role="img" aria-label={`Weekly accuracy: ${weeks.map(w => w.n ? Math.round(w.acc * 100) + '%' : 'none').join(', ')}`}>{weeks.map((w, i) => <div key={i} className={i === 6 ? 'now' : ''} style={{ height: `${w.n ? Math.max(8, w.acc * 100) : 6}%` }} title={w.n ? `${Math.round(w.acc * 100)}% of ${w.n}` : 'No sittings'} />)}</div>
        <div className="row small muted" style={{ justifyContent: 'space-between' }}>{weeks.map((_, i) => <span key={i}>W{i + 1}</span>)}</div>
        <p className="small muted">Correct answers per week. Not mastery.</p></div>
      <div className="card row"><span className="q-ico" style={{ width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'var(--rh-incorrect-bg)', color: 'var(--rh-incorrect)' }}><Icon n="target" /></span>
        <div className="grow"><b>Next weak area</b><div className="small muted">{weak ? `Lesson ${weak.n} · ${Math.round(weak.acc * 100)}% right` : 'Shows once you have a few answers'}</div></div>
        <button className="btn sm" disabled={!weak} onClick={() => weak && start({ kind: 'target', manual: m.code, lessons: [weak.lesson], count: sessionSize, title: `Weak spot · Lesson ${weak.n}` })}>Practise</button></div>
    </div>
    <div className="col">
      <div className="card tint col"><h3>Planner</h3>
        <div className="row" style={{ justifyContent: 'space-between' }}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => <div key={d} className="daycirc">{d}<i className={set.has(week[i]) ? 'on' : i === dow ? 'now' : ''}>{set.has(week[i]) ? <Icon n="check" className="" /> : i === 6 ? '·' : ''}</i></div>)}</div>
        <p className="small muted">Weekly consistency · {planned} active day{planned === 1 ? '' : 's'} this week · Sunday is class day</p>
        {plan.map(p => <div key={p.st.name} className="col" style={{ gap: 6 }}><div className="row"><b className="grow">{p.st.name}</b><span className="pill">{Math.max(0, p.left)} days</span></div>
          <div className="bar"><i className="s" style={{ width: `${Math.min(100, p.g.readiness / .95 * 100)}%` }} /></div>
          <p className="small">{p.need === 0 ? 'At the 95% target. Keep reviews going to hold it.' : `${p.need.toLocaleString()} more points to secure → about ${p.perDay} a day. A ${sessionSize}-question sitting moves roughly ${Math.round(sessionSize * .6)} of them.`}</p></div>)}</div>
      <div className="card col"><h3>Recent sittings</h3>{history.length ? <div className="list">{history.slice(0, 6).map(h => <div key={h.id} className="row"><span className="pill">{h.kind}</span><span className="grow small">{h.lesson ?? 'mixed'} · {new Date(h.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span><b>{h.right}/{h.total}</b></div>)}</div> : <p className="muted">No sittings yet. Your first quest starts on the Journey.</p>}</div>
      <div className="list">{m.lessons.filter(l => Object.keys(cards).some(k => k.startsWith(`${m.code}|${m.code}:${l.id}.`))).slice(0, 12).map(l => { const s = lessonStats(cards, m, l.id); return <div key={l.id} className="card col" style={{ gap: 8, padding: 12 }}><div className="row"><b className="grow">{l.n} · {l.title.toLowerCase()}</b><span className="small muted">{Math.round(s.readiness * 100)}%</span></div><Segments s={s.secure} t={s.strengthening} l={s.learning} total={s.total} /></div> })}</div>
      <Link to="/you" className="btn ghost block"><Icon n="back" />Back to You</Link>
    </div></div>
  </div>
}
