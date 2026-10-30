import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { daysUntil, dueInfo, lessonDate, niceTitle, readinessGap, weekLesson } from '@/lib/engine'
import { day, lessonStats, manualStats, useStore, type SessionSpec } from '@/lib/store'
import type { ManualCode } from '@/lib/types'
import { BackBar, Icon, Loading, Sheet, StatPills, asset, useManualData } from '@/ui/bits'
import { useStart } from './Journey'
import { useWeakSpots } from './Practice'
import { useBadges } from './You'

const DAY = 86400000
export default function Progress() {
  const m = useManualData(); const { cards, history, activeDays, manual, set } = useStore(); const start = useStart(); const nav = useNavigate()
  const [win, setWin] = useState<7 | 30 | 365>(30); const weak = useWeakSpots(m); const badges = useBadges()
  if (!m) return <Loading />
  const since = Date.now() - win * DAY, hs = history.filter(h => h.at > since && h.manual === m.code)
  const answered = hs.reduce((a, h) => a + h.total, 0), right = hs.reduce((a, h) => a + h.right, 0)
  const days = activeDays.filter(d => new Date(d).getTime() > since).length
  const touched = m.lessons.filter(l => Object.keys(cards).some(k => k.startsWith(`${m.code}|${m.code}:${l.id}.`)))
  const upto = Math.max(8, touched.length ? touched[touched.length - 1].n : 8)
  const all = manualStats(cards, m, 1, upto), q1 = m.stages[0], g1 = readinessGap(m, q1.lessons, cards)
  const weeks = Array.from({ length: 7 }, (_, i) => { const hi = Date.now() - (6 - i) * 7 * DAY, lo = hi - 7 * DAY; const h = history.filter(x => x.at > lo && x.at <= hi && x.manual === m.code); const t = h.reduce((a, x) => a + x.total, 0); return { acc: t ? h.reduce((a, x) => a + x.right, 0) / t : 0, n: t } })
  const C = 2 * Math.PI * 50, seg = (n: number) => `${(all.total ? n / all.total : 0) * C} ${C}`
  const earned = badges.filter(b => b.got), nextB = badges.find(b => !b.got)
  return <div className="page col gap16">
    <div className="pagehead"><div><p className="eyebrow">Progress · {m.short}</p><h1>Find your next weak area.</h1></div><StatPills /></div>
    <div className="row wrap gap8 between">
      <div className="seg" style={{ minWidth: 220 }}>{(['AD2627', 'EN2627'] as ManualCode[]).map(c => <button key={c} className={manual === c ? 'on' : ''} onClick={() => set({ manual: c })}>{c === 'AD2627' ? 'Adult 26–27' : 'YAYA 26–27'}</button>)}</div>
      <div className="seg" style={{ minWidth: 260 }}>{([[7, '7 days'], [30, '30 days'], [365, 'Season']] as const).map(([v, t]) => <button key={v} className={win === v ? 'on' : ''} onClick={() => setWin(v)}>{t}</button>)}</div></div>
    <div className="grid4">
      <div className="stat"><p className="eyebrow">Secure items</p><div className="v mt8">{all.secure.toLocaleString()}</div><div className="d">of {all.total.toLocaleString()} eligible · Lessons 1–{upto}</div></div>
      <div className="stat"><p className="eyebrow">Recent accuracy</p><div className="v mt8">{answered ? Math.round(right / answered * 100) + '%' : '—'}</div><div className="d">first-try correct ÷ accepted · {win === 365 ? 'season' : `${win} days`}</div></div>
      <div className="stat"><p className="eyebrow">Study days</p><div className="v mt8">{days}</div><div className="d">qualifying days · {win === 365 ? 'season' : `${win} days`}</div></div>
      <div className="stat"><p className="eyebrow">Q1 test readiness</p><div className="v mt8" style={{ color: 'var(--rh-action)' }}>{Math.round(g1.readiness * 100)}%</div><div className="d">Lessons 1–12 · {Math.max(0, daysUntil(q1.date))} days left</div></div>
    </div>
    <div className="withrail">
      <div className="col gap16">
        <div className="card col"><p className="eyebrow">Spaced mastery · Lessons 1–{upto}</p>
          <div className="row gap20 wrap"><div className="donut"><svg viewBox="0 0 132 132" width="132" height="132"><g transform="rotate(-90 66 66)" fill="none" strokeWidth="16"><circle cx="66" cy="66" r="50" stroke="var(--rh-line)" />
            <circle cx="66" cy="66" r="50" stroke="var(--rh-apricot)" strokeDasharray={seg(all.secure + all.strengthening + all.learning)} /><circle cx="66" cy="66" r="50" stroke="var(--rh-action)" strokeDasharray={seg(all.secure + all.strengthening)} /><circle cx="66" cy="66" r="50" stroke="var(--rh-node-done)" strokeDasharray={seg(all.secure)} /></g></svg>
            <div className="c"><div><b>{Math.round(all.readiness * 100)}%</b><span className="tiny muted">Secure</span></div></div></div>
            <div className="col gap8 grow small" style={{ minWidth: 170 }}>{([['Secure', all.secure, 'var(--rh-node-done)'], ['Strengthening', all.strengthening, 'var(--rh-action)'], ['Learning', all.learning, 'var(--rh-apricot)'], ['Not started', all.notStarted, 'var(--rh-line2)']] as const).map(([t, n, c]) => <div key={t} className="row between"><span className="row gap8"><i style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{t}</span><b>{n.toLocaleString()}</b></div>)}</div></div>
          <p className="tiny muted">Secure means answered right on spaced reviews until the interval reaches 14 days. A Secure item can still become due.</p></div>
        <div className="card col"><div className="row between"><h3>Secure by lesson</h3><span className="tiny muted">share of each lesson’s points that are Secure</span></div>
          <div className="lbars">{m.lessons.filter(l => l.n <= upto).map(l => { const s = lessonStats(cards, m, l.id), p = Math.round(s.readiness * 100); return <div key={l.id} className="r"><b>L{l.n}</b><span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{niceTitle(l.title)}</span><div className="bar thin"><i style={{ width: `${p}%`, background: p >= 80 ? 'var(--rh-node-done)' : 'var(--rh-action)' }} /></div><span className="small b" style={{ textAlign: 'right' }}>{p}%</span></div> })}</div></div>
        <div className="card col"><div className="row between"><p className="eyebrow">Recent accuracy</p><span className="tiny muted">7 weeks</span></div>
          <div className="row" style={{ alignItems: 'flex-end', height: 110, gap: 8 }} role="img" aria-label={`Weekly accuracy: ${weeks.map(w => w.n ? Math.round(w.acc * 100) + '%' : 'no answers').join(', ')}`}>{weeks.map((w, i) => <div key={i} style={{ flex: 1, height: `${w.n ? Math.max(8, w.acc * 100) : 6}%`, borderRadius: '8px 8px 4px 4px', background: i === 6 ? 'var(--rh-action)' : 'var(--rh-raised)' }} title={w.n ? `${Math.round(w.acc * 100)}% of ${w.n}` : 'No answers'} />)}</div>
          <div className="row between tiny muted">{weeks.map((_, i) => <span key={i}>W{i + 1}</span>)}</div><p className="tiny muted">Correct ÷ accepted answers per week. Not mastery.</p></div>
      </div>
      <div className="rail col gap16">
        <div className="card col gap8"><h3>Weak spots</h3>{weak.length ? weak.map(w => <div key={w.key} className="row"><span className={`tile ${w.tone}`} style={{ width: 36, height: 36 }}><Icon n={w.ico} className="s" /></span><div><b className="small">{w.title}</b><div className="tiny muted">{w.sub}</div></div></div>) : <p className="small muted">Appears once you have a few answers in a lesson.</p>}
          <button className="btn block" disabled={!weak.length} onClick={() => start({ kind: 'target', manual: m.code, lessons: [...new Set(weak.flatMap(w => w.lessons))], focus: [...new Set(weak.flatMap(w => w.focus ?? []))], count: 20, title: 'Weak spots' })}>Practise weak spots</button></div>
        <button className="card row" style={{ textAlign: 'left', color: 'inherit' }} onClick={() => nav('/you')}><img src={asset(`emblems/badges/badge-${earned[0]?.k ?? 'target'}-128.webp`)} width={48} height={48} alt="" style={{ filter: earned.length ? undefined : 'grayscale(1)' }} /><div><b>{earned.length} badge{earned.length === 1 ? '' : 's'} earned</b><div className="tiny muted">{nextB ? `Next: ${nextB.name}` : 'All earned'}</div></div></button>
        <button className="card row" style={{ textAlign: 'left', color: 'inherit' }} onClick={() => nav('/journey/planner')}><span className="tile"><Icon n="calendar" /></span><div><b>Planner</b><div className="tiny muted">This week at a glance</div></div></button>
      </div>
    </div>
  </div>
}

// ---- Planner (R26) ---------------------------------------------------------------------------------
type Act = { label: string; tone: string; spec?: SessionSpec; min: number }
export function Planner() {
  const m = useManualData(); const nav = useNavigate(); const start = useStart(); const S = useStore(); const [pace, setPace] = useState(false)
  if (!m) return <Loading />
  const wl = weekLesson(m), sunday = lessonDate(wl.date) ?? new Date()
  const monday = new Date(sunday.getTime() + DAY); const nextL = m.lessons[m.lessons.indexOf(wl) + 1]; const prevL = m.lessons[m.lessons.indexOf(wl) - 1]
  const due = dueInfo(S.cards, m.code), size = S.sessionSize, mins = Math.round(size * .4)
  const cur = m.lessons.find(l => !S.done[`${m.code}|${l.id}`] && l.n <= wl.n) ?? wl // a learner who is behind recalls their current lesson
  const recall: SessionSpec = { kind: 'quest', manual: m.code, lessons: [cur.id], count: size, title: `Lesson ${cur.n} · Recall` }
  const review: SessionSpec | undefined = due.count ? { kind: 'review', manual: m.code, lessons: due.lessons.slice(0, 8), count: size, title: 'Due review' } : undefined
  const plan: Act[][] = [
    [{ label: `Recall L${cur.n}`, tone: 'str', spec: recall, min: mins }, { label: 'Reading', tone: 'plain', min: 3 }],
    [{ label: due.count ? `Review ${due.count}` : 'Review', tone: 'due', spec: review, min: 5 }, ...(prevL ? [{ label: `Check L${prevL.n}`, tone: 'plain', min: 10 }] : [])],
    [{ label: `Recall L${cur.n}`, tone: 'str', spec: recall, min: mins }],
    [{ label: due.count ? `Review ${due.count}` : 'Review', tone: 'due', spec: review, min: 5 }, { label: `Recall L${cur.n}`, tone: 'plain', spec: recall, min: mins }],
    [{ label: `Check L${wl.n}`, tone: 'str', min: 10 }, ...(S.arenaOptIn ? [{ label: 'Arena', tone: 'plain', min: 5 }] : [])],
    [{ label: 'Review', tone: 'due', spec: review, min: 5 }],
    [{ label: `Class: L${nextL?.n ?? wl.n}`, tone: 'plain', min: 0 }, ...(nextL ? [{ label: `Learn L${nextL.n}`, tone: 'plain', min: 5 }] : [])],
  ]
  const dates = plan.map((_, i) => new Date(monday.getTime() + i * DAY))
  const todayI = dates.findIndex(d => day(d.getTime()) === day()), ti = todayI < 0 ? (new Date().getDay() + 6) % 7 : todayI
  const today = plan[ti].filter(a => !a.label.startsWith('Class') && !a.label.startsWith('Arena'))
  const overdue = Object.entries(S.cards).filter(([k, c]) => k.startsWith(m.code + '|') && c.seen > 0 && c.due < Date.now() - 2 * DAY)
  const ovL = overdue.length ? overdue.map(([k]) => +(k.match(/:L(\d+)/)?.[1] ?? 0)).sort((a, b) => a - b)[0] : 0
  const planned = dates.filter(d => S.activeDays.includes(day(d.getTime()))).length
  const go = (a: Act) => a.spec ? start(a.spec) : a.label.startsWith('Reading') ? nav('/journey/readings') : a.label.startsWith('Learn') && nextL ? nav(`/library/${nextL.id}`) : a.label.startsWith('Check') ? nav(`/journey/check/${(a.label.includes(String(prevL?.n)) ? prevL : wl)?.id}`) : undefined
  return <div className="page col gap16">
    <div className="mobonly2"><BackBar title="Planner" onBack={() => nav('/journey')} /></div>
    <div className="pagehead"><div><p className="eyebrow">Planner · Lesson {wl.n} week</p><h1>This week</h1></div>
      <div className="row gap8 wrap"><span className="chip lg plain">Pace: {size <= 10 ? 'Quick' : size >= 40 ? 'Deep' : 'Steady'}</span><span className="chip lg plain">{S.prefs.planDays} days</span><button className="btn sec sm" onClick={() => setPace(true)}>Change pace</button></div></div>
    <div className="card col gap8 plan-mob">
      <div className="daydots">{dates.map((d, i) => { const did = S.activeDays.includes(day(d.getTime())); return <div key={i} className="daydot">{d.toLocaleDateString(undefined, { weekday: 'short' })}<i className={did ? 'done' : i === ti ? 'today' : ''}>{did ? <Icon n="check" /> : i === ti ? <Icon n="star" /> : i === 6 ? <Icon n="book" /> : '·'}</i></div> })}</div>
      <p className="tiny muted">Weekly consistency · {planned} of {S.prefs.planDays} planned days · Sunday is class day</p></div>
    <div className="wk7 plan-desk">{plan.map((acts, i) => <div key={i} className={`daycol ${i === ti ? 'today' : ''}`}><div className="dn">{dates[i].toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</div>
      {acts.map((a, j) => <button key={j} className={`chip ${a.tone}`} style={{ justifyContent: 'flex-start', cursor: a.spec ? 'pointer' : 'default', border: 0 }} onClick={() => go(a)}>{a.label}</button>)}</div>)}</div>
    <div className="grid-today">
      <div className="card col"><p className="eyebrow">Today · {dates[ti].toLocaleDateString(undefined, { weekday: 'long' })}</p>
        {today.map((a, i) => <button key={i} className="li row" style={{ border: 0, background: 'transparent', textAlign: 'left', color: 'inherit', padding: '6px 0' }} onClick={() => go(a)}>
          <span className={`tile ${a.tone === 'due' ? 'apricot' : a.label.startsWith('Learn') || a.label.startsWith('Reading') ? 'green' : ''}`}><Icon n={a.tone === 'due' ? 'refresh' : a.label.startsWith('Learn') || a.label.startsWith('Reading') ? 'book' : 'feather'} /></span>
          <span className="grow"><b>{a.label.replace(/^Recall L(\d+)/, 'Lesson $1 · Recall').replace(/^Review(.*)/, 'Due review')}</b><span className="tiny muted" style={{ display: 'block' }}>{a.spec ? `${a.spec.count} questions` : a.label.startsWith('Reading') ? 'Further reading · never graded' : a.label.startsWith('Check') ? 'Lesson mastery check · 25 questions' : 'Read the lesson'}</span></span><span className="small b">{a.min} min</span></button>)}
        {today.length ? <button className="btn block" onClick={() => go(today.find(a => a.spec) ?? today[0])}>Start today’s work</button> : null}</div>
      {overdue.length > 0 ? <div className="card row" style={{ borderStyle: 'dashed' }}><span className="tile"><Icon n="history" /></span><div><b>{overdue.length} overdue point{overdue.length === 1 ? '' : 's'} · Lesson {ovL}</b><div className="tiny muted">Kept visible, never deleted to tidy the plan. Still here whenever you are ready.</div></div></div>
        : <div className="card row"><span className="tile green"><Icon n="check" /></span><div><b>Nothing overdue</b><div className="tiny muted">Reviews are on schedule.</div></div></div>}
    </div>
    {pace && <Sheet label="Change pace" onClose={() => setPace(false)}><div className="col"><h2>Change pace</h2>
      <p className="lbl">Sitting length</p><div className="seg">{[10, 20, 40].map(n => <button key={n} className={size === n ? 'on' : ''} onClick={() => S.set({ sessionSize: n })}>{n}</button>)}</div>
      <p className="lbl mt8">Study days a week</p><div className="seg">{[3, 5, 7].map(n => <button key={n} className={S.prefs.planDays === n ? 'on' : ''} onClick={() => S.set({ prefs: { ...S.prefs, planDays: n } })}>{n}</button>)}</div>
      <p className="hint"><Icon n="info" />A slower pace spreads the same work over more days. Due review is never dropped to make the plan look tidy.</p>
      <button className="btn block" onClick={() => setPace(false)}>Done</button></div></Sheet>}
  </div>
}
