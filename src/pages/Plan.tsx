// Planner and phase management (PRD 9.8) and study settings (10.3 "Settings").
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { daysUntil, niceTitle } from '@/lib/engine'
import { readinessFor } from '@/lib/mastery'
import { DEFAULT_PHASES, phaseAt, type Phase } from '@/lib/srs'
import { useStore } from '@/lib/store'
import type { Manual } from '@/lib/types'
import { BackBar, Icon, Toggle, useManualData, Loading } from '@/ui/bits'
import { nextMockDate } from './Mock'
import { useStart } from './Journey'

const DAY = 86400000
const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
/** Planned start date of every lesson from the phases' pace (FR-PL-02); buffer weeks pause new lessons. */
export function lessonPlan(m: Manual, phases: Phase[]) {
  const out: { id: string; n: number; start: number; phase: string }[] = []
  for (const p of phases.filter(x => !x.buffer && x.pace > 0)) {
    let t = Date.parse(p.from); const ls = m.lessons.filter(l => l.n >= p.lessons[0] && l.n <= p.lessons[1]); const step = 7 / p.pace * DAY
    for (const l of ls) { const buf = phases.find(b => b.buffer && t >= Date.parse(b.from) && t <= Date.parse(b.to) + DAY); if (buf) t = Date.parse(buf.to) + DAY; out.push({ id: l.id, n: l.n, start: t, phase: p.id }); t += step }
  }
  return out
}
export function PlanStatus({ m }: { m: Manual }) {
  const S = useStore(); const nav = useNavigate(); const start = useStart()
  const phases = S.prefs.phases, ph = phaseAt(phases), plan = lessonPlan(m, phases), now = Date.now()
  const due = plan.filter(x => x.start <= now), doneSet = new Set(Object.keys(S.done).filter(k => k.startsWith(m.code + '|')).map(k => k.split('|')[1]))
  const behind = due.filter(x => !doneSet.has(x.id)), ahead = plan.filter(x => x.start > now && doneSet.has(x.id)).length
  const status = behind.length ? `Behind by ${behind.length} lesson${behind.length === 1 ? '' : 's'}` : ahead ? `Ahead by ${ahead} lesson${ahead === 1 ? '' : 's'}` : 'On track'
  const nm = nextMockDate(S.mocks.filter(x => x.manual === m.code), phases)
  const forecast = m.stages.map(st => { const r = readinessFor(m, st.lessons, S.cards, S.checks).readiness, left = Math.max(0, daysUntil(st.date))
    const recent = new Set(S.log.filter(e => e.m === m.code && e.ok && e.at > now - 14 * DAY).map(e => e.s)).size, total = m.lessons.filter(l => l.n >= st.lessons[0] && l.n <= st.lessons[1]).reduce((a, l) => a + l.cc, 0) || 1
    return { st, r, proj: Math.min(1, r + (recent / 14 / total) * left * .5), left } })
  return <div className="col gap16">
    <div className="card col gap8" style={{ background: ph.retention >= .95 ? 'var(--rh-warning-bg)' : 'var(--rh-surface2)', borderColor: 'transparent' }}>
      <div className="row between wrap"><div><p className="eyebrow">Phase {ph.id} · {fmt(Date.parse(ph.from))} – {fmt(Date.parse(ph.to))}</p><h3>{ph.name}</h3></div><span className={`chip lg ${behind.length ? 'due' : 'ok'}`}>{status}</span></div>
      <p className="small">{ph.buffer ? 'Buffer week: new lessons pause, reviews continue.' : ph.pace ? `${ph.pace} new lesson${ph.pace === 1 ? '' : 's'} a week · desired retention ${Math.round(ph.retention * 100)}%.` : `Consolidation: no new lessons; reviews held at ${Math.round(ph.retention * 100)}% and mocks weekly.`}</p>
      {behind.length > 0 && <button className="btn sm" onClick={() => start({ kind: 'quest', manual: m.code, lessons: [behind[0].id], count: S.sessionSize, title: `Lesson ${behind[0].n} · Recall` })}>Catch up: Lesson {behind[0].n} Recall</button>}</div>
    <div className="grid2">
      <div className="card col gap8"><p className="eyebrow">Next mock</p><b className="disp">{nm <= now ? 'Due now' : new Date(nm).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</b><p className="tiny muted">Every four weeks while learning, weekly before each test.</p><button className="btn sec sm" onClick={() => nav('/practice/mock')}>Mock exam</button></div>
      <div className="card col gap8"><p className="eyebrow">Readiness forecast</p>{forecast.map(f => <div key={f.st.name} className="col gap4"><div className="row between small"><span>{f.st.name} · {f.left} days</span><b>{Math.round(f.r * 100)}% → {Math.round(f.proj * 100)}%</b></div><div className="bar thin"><i style={{ width: `${f.r * 100}%` }} /></div></div>)}<p className="tiny muted">Projected from your last two weeks of recall. A guide, not a promise.</p></div></div>
  </div>
}
export function Timeline({ m }: { m: Manual }) {
  const S = useStore(); const nav = useNavigate(); const [edit, setEdit] = useState(false)
  const phases = S.prefs.phases, plan = lessonPlan(m, phases), ph = phaseAt(phases)
  const setPh = (i: number, p: Partial<Phase>) => S.set({ prefs: { ...S.prefs, phases: phases.map((x, j) => j === i ? { ...x, ...p } : x) } })
  return <div className="card col gap8">
    <div className="row between"><h3>Calendar</h3><button className="btn sec xs" onClick={() => setEdit(!edit)}>{edit ? 'Done' : 'Edit dates'}</button></div>
    {edit ? <div className="col gap8">{phases.map((p, i) => <div key={p.id} className="card flat col gap8" style={{ padding: 12 }}><b className="small">{p.id} · {p.name}{p.buffer ? ' (buffer)' : ''}</b>
      <div className="row wrap gap8"><input type="date" className="field" style={{ width: 160 }} value={p.from} onChange={e => setPh(i, { from: e.target.value })} aria-label={`${p.name} start`} /><input type="date" className="field" style={{ width: 160 }} value={p.to} onChange={e => setPh(i, { to: e.target.value })} aria-label={`${p.name} end`} />
        {!p.buffer && <><label className="small">Pace <input type="number" step={.5} min={0} max={7} className="field" style={{ width: 80, display: 'inline-block' }} value={p.pace} onChange={e => setPh(i, { pace: +e.target.value })} /></label>
          <label className="small">Retention <select className="mbtn" value={p.retention} onChange={e => setPh(i, { retention: +e.target.value })}>{[.85, .9, .95, .97].map(r => <option key={r} value={r}>{Math.round(r * 100)}%</option>)}</select></label></>}</div></div>)}
      <div className="row gap8"><button className="btn sec xs" onClick={() => S.set({ prefs: { ...S.prefs, phases: [...phases, { id: `B${phases.length}`, name: 'Buffer week', from: new Date().toISOString().slice(0, 10), to: new Date(Date.now() + 6 * DAY).toISOString().slice(0, 10), lessons: [1, 51], pace: 0, retention: .9, buffer: true }] } })}>Add a buffer week</button>
        <button className="btn link" onClick={() => S.set({ prefs: { ...S.prefs, phases: DEFAULT_PHASES } })}>Reset to the PRD calendar</button></div>
      <p className="tiny muted">The plan recalculates as soon as dates change.</p></div>
      : <div className="list">{phases.map(p => <div key={p.id} className="li" style={{ background: p.id === ph.id ? 'var(--rh-surface2)' : undefined, borderRadius: 10, paddingLeft: 8 }}><b style={{ width: 34 }}>{p.id}</b><span className="grow small"><b>{p.name}</b><span className="tiny muted" style={{ display: 'block' }}>{fmt(Date.parse(p.from))} – {fmt(Date.parse(p.to))} · {p.buffer ? 'reviews only' : p.pace ? `L${p.lessons[0]}–${p.lessons[1]} · ${p.pace}/week` : 'consolidation'} · {Math.round(p.retention * 100)}%</span></span></div>)}</div>}
    <p className="eyebrow mt8">Lesson start dates · four-day cycle</p>
    <div className="list" style={{ maxHeight: 320, overflow: 'auto' }}>{plan.map(x => { const l = m.lessons.find(y => y.id === x.id)!; const done = !!S.done[`${m.code}|${x.id}`]; return <button key={x.id} className="li" onClick={() => nav(`/practice/learn/${x.id}`)}><span className={`tile ${done ? 'green' : ''}`} style={{ width: 30, height: 30, fontSize: 12 }}>{done ? <Icon n="check" className="s" /> : <b>{l.n}</b>}</span><span className="grow small">{niceTitle(l.title)}<span className="tiny muted" style={{ display: 'block' }}>Day 1 {fmt(x.start)} · check {fmt(x.start + 3 * DAY)}</span></span><Icon n="chev" className="faint" /></button> })}</div>
  </div>
}

export function StudySettings() {
  const S = useStore(); const nav = useNavigate(); const p = S.prefs; const set = (x: Partial<typeof p>) => S.set({ prefs: { ...p, ...x } })
  const m = useManualData(); if (!m) return <Loading />
  const num = (label: string, sub: string, v: number, k: keyof typeof p, min: number, max: number, step = 1) => <div className="li"><div className="grow"><b className="small">{label}</b><div className="tiny muted">{sub}</div></div><input type="number" className="field" style={{ width: 96, textAlign: 'center' }} min={min} max={max} step={step} value={v} onChange={e => set({ [k]: Math.max(min, Math.min(max, +e.target.value || min)) } as never)} aria-label={label} /></div>
  return <div className="page col gap16" style={{ maxWidth: 620 }}>
    <BackBar title="Study settings" onBack={() => nav('/you')} />
    <p className="eyebrow">Daily load</p>
    <div className="card list" style={{ padding: '2px 16px' }}>
      <div className="li"><div className="grow"><b className="small">Sitting length</b><div className="tiny muted">Questions per sitting (5–100)</div></div><input type="number" className="field" style={{ width: 96, textAlign: 'center' }} min={5} max={100} value={S.sessionSize} onChange={e => S.set({ sessionSize: Math.max(5, Math.min(100, +e.target.value || 5)) })} aria-label="Sitting length" /></div>
      {num('New points per day', 'Cap on brand-new items each day', p.newCap, 'newCap', 0, 300)}
      {num('Review cap per day', 'Spread the rest without breaking spacing', p.reviewCap, 'reviewCap', 20, 1000, 10)}
      {num('Pause new work when overdue exceeds', 'Catch-up mode turns on above this', p.overdueLimit, 'overdueLimit', 20, 1000, 10)}</div>
    <p className="eyebrow">Marking and help</p>
    <div className="card list" style={{ padding: '2px 16px' }}>
      <div className="li"><div className="grow"><b className="small">Adaptive help</b><div className="tiny muted">Step up after five quick right answers; offer help after three misses. Always told why.</div></div><Toggle on={p.adaptive} onChange={v => set({ adaptive: v })} label="Adaptive help" /></div>
      <div className="li"><div className="grow"><b className="small">Typing-slip override</b><div className="tiny muted">Up to three a day, logged, counts as assisted. Never in mocks or ranked play.</div></div><Toggle on={p.selfGrade} onChange={v => set({ selfGrade: v })} label="Typing-slip override" /></div>
      <div className="li"><div className="grow"><b className="small">Options per choice question</b><div className="tiny muted">3 to 5, default 4</div></div><div className="seg" style={{ width: 150 }}>{[3, 4, 5].map(n => <button key={n} className={p.mcqCount === n ? 'on' : ''} onClick={() => set({ mcqCount: n })}>{n}</button>)}</div></div></div>
    <p className="hint"><Icon n="info" />Marking never changes with these settings: spelling and hyphens always count; capitals and punctuation never do.</p>
    <p className="eyebrow">Dates and retention</p>
    <Link to="/journey/planner" className="card row" style={{ color: 'inherit' }}><span className="tile"><Icon n="calendar" /></span><div className="grow"><b className="small">Study calendar</b><div className="tiny muted">Phase dates, pace, buffer weeks and retention targets</div></div><Icon n="chev" className="faint" /></Link>
    <Link to="/you/notifications" className="card row" style={{ color: 'inherit' }}><span className="tile"><Icon n="bell" /></span><div className="grow"><b className="small">Study windows and reminders</b><div className="tiny muted">Reminder time, quiet hours, channels</div></div><Icon n="chev" className="faint" /></Link>
    <Link to="/journey/insights" className="card row" style={{ color: 'inherit' }}><span className="tile"><Icon n="download" /></span><div className="grow"><b className="small">Export your answers</b><div className="tiny muted">CSV or JSON for your own analysis</div></div><Icon n="chev" className="faint" /></Link>
  </div>
}
