import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, isDemo, type Assignment, type Circle, type PublicUser, type Report } from '@/lib/backend'
import { loadItems } from '@/lib/data'
import { FOCUS, KIND_LABEL, niceTitle } from '@/lib/engine'
import { useStore } from '@/lib/store'
import type { Item } from '@/lib/types'
import { GlimHead, Icon, Loading, StateCard, asset, useManualData } from '@/ui/bits'
import { QuizNightPlay } from './Arena'

const DemoNote = () => isDemo ? <p className="tiny faint center"><Icon n="info" className="s" style={{ verticalAlign: 'middle' }} /> Demo server: learners and their numbers are simulated.</p> : null
function Gate({ role, children }: { role: string; children: React.ReactNode }) {
  const acc = useStore(s => s.account); const nav = useNavigate()
  if (acc?.role === role) return <>{children}</>
  return <div className="page" style={{ maxWidth: 520 }}><StateCard img="locked" title={role === 'coach' ? 'Coach workspace' : 'Content studio'} body={`This workspace is for ${role === 'coach' ? 'coaches of a circle' : 'content stewards'}. It is granted by your organisation, never by joining a circle.${isDemo ? ` In this demo, sign in as ${role === 'coach' ? 'femi' : 'ada'}@demo.rhemlo.app.` : ''}`}
    action={<button className="btn sec block" onClick={() => nav('/you')}>Back to You</button>} /></div>
}

// ---- Coach workspace (R46) ------------------------------------------------------------------------
export function Coach() { return <Gate role="coach"><CoachInner /></Gate> }
function CoachInner() {
  const m = useManualData(); const nav = useNavigate()
  const [g, setG] = useState<Circle | null>(null); const [rows, setRows] = useState<{ user: PublicUser; sittings: number; accuracy: number; secure: number; lastActive: number }[] | null>(null)
  const [title, setTitle] = useState(''); const [lessons, setLessons] = useState<string[]>([]); const [count, setCount] = useState(20); const [due, setDue] = useState(() => new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)); const [focus, setFocus] = useState<string[]>([]); const [saved, setSaved] = useState<Assignment | null>(null)
  useEffect(() => { api.my_groups().then(x => { setG(x[0] ?? null); if (x[0]) api.group_progress(x[0].id).then(setRows) }) }, [saved])
  if (!m || !g || !rows) return <Loading />
  const active = rows.filter(r => Date.now() - r.lastActive < 7 * 86400000).length, acc = rows.reduce((a, r) => a + r.accuracy, 0) / rows.length
  const assign = async () => { setSaved(await api.create_assignment(g.id, { title: title || `${lessons.length === 1 ? 'Lesson' : 'Lessons'} ${lessons.map(l => +l.slice(1)).join(', ')}`, lessons, count, due: Date.parse(due + 'T18:00'), focus })); setTitle(''); setLessons([]) }
  return <div className="page col gap16">
    <div className="pagehead"><div><p className="eyebrow">Coach workspace</p><h1>{g.name}</h1></div><button className="btn" onClick={() => nav('/coach/host')}><Icon n="radio" />Host Quiz Night</button></div>
    <div className="grid4">
      <div className="stat"><p className="eyebrow">Members</p><div className="v mt8">{rows.length}</div><div className="d">learners you coach</div></div>
      <div className="stat"><p className="eyebrow">Active</p><div className="v mt8">{active}</div><div className="d">studied in the last 7 days</div></div>
      <div className="stat"><p className="eyebrow">Accuracy</p><div className="v mt8">{Math.round(acc * 100)}%</div><div className="d">first-try correct · 30 days</div></div>
      <div className="stat"><p className="eyebrow">Shared goal</p><div className="v mt8">{g.goal.done}</div><div className="d">of {g.goal.target} sittings this week</div></div></div>
    <div className="withrail">
      <div className="card col"><div className="row between"><h3>Learners</h3><span className="tiny muted">Only learners in your circle. No private messages or answers.</span></div>
        <div className="lbars">{rows.sort((a, b) => b.sittings - a.sittings).map(r => <div key={r.user.id} className="r" style={{ gridTemplateColumns: '36px 1fr 70px 70px 80px' }}>
          <GlimHead cw={r.user.cw} size={32} /><b className="small">{r.user.handle}</b><span className="small">{r.sittings} sittings</span><span className="small">{Math.round(r.accuracy * 100)}%</span><span className="tiny muted">{r.lastActive ? new Date(r.lastActive).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—'}</span></div>)}</div></div>
      <div className="rail col gap16">
        <div className="card col gap8"><h3>Assign bounded practice</h3>
          <label className="lbl" htmlFor="at">Title</label><input id="at" className="field" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Lesson 7 memory verse" />
          <span className="lbl">Lessons</span><div className="row wrap gap8">{m.lessons.slice(0, 12).map(l => <button key={l.id} className="chip btnchip" aria-pressed={lessons.includes(l.id)} onClick={() => setLessons(x => x.includes(l.id) ? x.filter(y => y !== l.id) : [...x, l.id])}>L{l.n}</button>)}</div>
          <span className="lbl">Focus</span><div className="row wrap gap8">{Object.entries(FOCUS).slice(0, 4).map(([k, f]) => <button key={k} className="chip btnchip" aria-pressed={focus.includes(k)} onClick={() => setFocus(x => x.includes(k) ? x.filter(y => y !== k) : [...x, k])}>{f.label}</button>)}</div>
          <div className="row gap8"><div className="grow"><label className="lbl" htmlFor="ac">Questions</label><input id="ac" className="field" type="number" min={5} max={100} value={count} onChange={e => setCount(Math.max(5, Math.min(100, +e.target.value || 5)))} /></div>
            <div className="grow"><label className="lbl" htmlFor="ad">Due</label><input id="ad" className="field" type="date" value={due} onChange={e => setDue(e.target.value)} /></div></div>
          <button className="btn block" disabled={!lessons.length} onClick={assign}>Assign to circle</button>
          {saved && <p className="small" role="status" style={{ color: 'var(--rh-correct)' }}>Assigned “{saved.title}”. Members see it on their circle page.</p>}</div>
        <div className="card col gap8"><h3>Assignments</h3>{g.assignments.map(a => <div key={a.id} className="row small"><Icon n="flag" className="s" style={{ color: 'var(--rh-apricot-deep)' }} /><span className="grow">{a.title}</span><span className="tiny muted">{new Date(a.due).toLocaleDateString(undefined, { weekday: 'short' })}</span></div>)}</div>
      </div></div>
    <DemoNote />
  </div>
}
export function CoachHost() { return <Gate role="coach"><QuizNightPlay host /></Gate> }

// ---- Content studio (R47) ---------------------------------------------------------------------------
export function Steward() { return <Gate role="steward"><StewardInner /></Gate> }
function StewardInner() {
  const m = useManualData(); const [tab, setTab] = useState<'review' | 'reports' | 'pipeline'>('review'); const [lesson, setLesson] = useState('L01')
  const [items, setItems] = useState<Item[] | null>(null); const [marks, setMarks] = useState<Record<string, 'ok' | 'flag'>>({}); const [q, setQ] = useState<Report[] | null>(null)
  useEffect(() => { if (m) loadItems(m.code, lesson).then(x => setItems(x.slice(0, 40))) }, [m, lesson])
  useEffect(() => { api.moderation_queue().then(setQ) }, [tab])
  if (!m) return <Loading />
  const local = (() => { try { return JSON.parse(localStorage.getItem('rhemlo.reports') ?? '[]') as { u?: string; lesson?: string; why?: string; note: string; at: number }[] } catch { return [] } })()
  return <div className="page col gap16">
    <div className="pagehead"><div><p className="eyebrow">Content studio · {m.short}</p><h1>Approval stays separate from mastery.</h1></div><span className="chip ok"><Icon n="check" />{m.lessons.length} lessons approved</span></div>
    <div className="tabs" role="tablist" style={{ maxWidth: 480 }}>{([['review', 'Review items'], ['reports', 'Reports'], ['pipeline', 'Pipeline']] as const).map(([k, t]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>)}</div>
    {tab === 'review' && <><div className="row gap8"><label className="lbl" htmlFor="sl" style={{ margin: 0 }}>Lesson</label><select id="sl" className="mbtn" value={lesson} onChange={e => setLesson(e.target.value)}>{m.lessons.map(l => <option key={l.id} value={l.id}>{l.n} · {niceTitle(l.title)}</option>)}</select>
      <span className="tiny muted">{m.lessons.find(l => l.id === lesson)?.ic.toLocaleString()} generated questions · showing 40</span></div>
      {!items ? <div className="skel" style={{ height: 200 }} /> : <div className="card list" style={{ padding: '2px 14px' }}>{items.map(i => <div key={i.u} className="li" style={{ alignItems: 'flex-start' }}>
        <span className="chip" style={{ flex: 'none' }}>{i.t}</span><div className="grow"><b className="small">{i.p.instruction}</b><div className="tiny muted">{(i.p.text ?? i.p.ref ?? i.p.title ?? '').slice(0, 140)}</div><div className="tiny" style={{ color: 'var(--rh-correct)' }}>Answer: {(i.a.text ?? i.a.items?.join(' · ') ?? '').slice(0, 120)}</div><div className="tiny faint">{KIND_LABEL[i.t]} · {i.u}</div></div>
        <div className="col gap4">{marks[i.u] ? <span className={`chip ${marks[i.u] === 'ok' ? 'ok' : 'bad'}`}>{marks[i.u] === 'ok' ? 'Approved' : 'Flagged'}</span> : <><button className="btn sec xs" onClick={() => setMarks(x => ({ ...x, [i.u]: 'ok' }))}>Approve</button><button className="btn link" style={{ minHeight: 30, color: 'var(--rh-incorrect)' }} onClick={async () => { setMarks(x => ({ ...x, [i.u]: 'flag' })); await api.report('content', i.u, 'Flagged in review', '') }}>Flag</button></>}</div></div>)}</div>}</>}
    {tab === 'reports' && <div className="col gap8">{[...(q ?? []), ...local.map((r, k) => ({ id: `l${k}`, ref: 'ON-DEVICE', kind: 'content' as const, target: r.u ?? r.lesson ?? '', reason: r.why ?? 'Content error', note: r.note, at: r.at, state: 'open' as const }))].map(r => <div key={r.id} className="card row" style={{ alignItems: 'flex-start' }}>
      <span className={`tile ${r.kind === 'content' ? 'apricot' : 'red'}`}><Icon n={r.kind === 'content' ? 'book' : 'flag'} /></span><div className="grow"><b className="small">{r.reason}</b><div className="tiny muted">{r.kind} · {r.target} · {new Date(r.at).toLocaleString()}</div>{r.note && <p className="small mt8">“{r.note}”</p>}<div className="tiny faint">Ref {r.ref} · reporter hidden</div></div>
      {r.state === 'open' ? <button className="btn sec xs" onClick={async () => { await api.resolve_report(r.id); setQ(await api.moderation_queue()) }}>Resolve</button> : <span className="chip ok">Resolved</span>}</div>)}
      {!q?.length && !local.length && <StateCard img="caughtup" title="No open reports" body="Reports from learners and flagged items arrive here." />}</div>}
    {tab === 'pipeline' && <div className="col gap8">{(['AD2627', 'EN2627'] as const).map(code => <div key={code} className="card col gap8"><b>{code === 'AD2627' ? 'Adult 2026–2027 · KJV' : 'YAYA 2026–2027 · NKJV printed'}</b>
      <div className="row wrap gap8">{['Import', 'Parse', 'Generate', 'Review', 'Approve', 'Publish'].map((s, i) => <span key={s} className="chip ok"><Icon n="check" />{i + 1}. {s}</span>)}</div>
      <p className="tiny muted">48 lessons · {code === 'AD2627' ? '25,004' : '25,964'} questions · generator gen-1.0 · approved 21 Oct 2026 (owner confirmed every lesson reviewed)</p></div>)}
      <p className="hint"><Icon n="info" />Each step mirrors a command in the bundle’s CLI (`rhemlo.cli build`, `approve --all`). A new manual goes through the same steps before learners see it.</p></div>}
    <div className="row gap8"><img src={asset('characters/glim/avatars/avatar-meadow-64.png')} width={28} height={28} alt="" /><span className="tiny muted">Approval is a steward decision; learner mastery never changes it.</span></div>
    <DemoNote />
  </div>
}
