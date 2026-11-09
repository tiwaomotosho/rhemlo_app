// Admin console (PRD 9.17: manuals publish/license/retire, seasons, organisations and access,
// guardian consents, moderation actions) and steward content verification (FR-IN-06..09).
import { useEffect, useState } from 'react'
import { useTabSwipe } from '@/ui/swipe'
import { useNavigate } from 'react-router-dom'
import { isDemo, social, type Anomaly, type CatalogueManual, type Consent, type Org, type PublicUser, type Sanction, type Season, type Verification } from '@/lib/backend'
import { loadItems, loadLesson } from '@/lib/data'
import { KIND_LABEL, niceTitle } from '@/lib/engine'
import { useStore } from '@/lib/store'
import type { Item } from '@/lib/types'
import { GlimHead, Icon, Loading, StateCard, useManualData } from '@/ui/bits'

const DemoNote = () => isDemo ? <p className="tiny faint center"><Icon n="info" className="s" style={{ verticalAlign: 'middle' }} /> Demo server: changes here stay in this browser and other people are simulated.</p> : null
const dt = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export function Admin() {
  const acc = useStore(s => s.account); const nav = useNavigate(); const [tab, setTab] = useState<'manuals' | 'seasons' | 'orgs' | 'consents' | 'moderation'>('manuals')
  const ts = useTabSwipe(['manuals', 'seasons', 'orgs', 'consents', 'moderation'] as const, tab, setTab)
  if (acc?.role !== 'admin') return <div className="page" style={{ maxWidth: 520 }}><StateCard img="locked" title="Admin console" body={`For platform administrators only.${isDemo ? ' In this demo, sign in as ola@demo.rhemlo.app.' : ''}`} action={<button className="btn sec block" onClick={() => nav('/you')}>Back to You</button>} /></div>
  return <div className="page col gap16">
    <div className="pagehead"><div><p className="eyebrow">Admin console</p><h1>Rhemlo administration</h1></div></div>
    <div className="tabs" role="tablist">{([['manuals', 'Manuals'], ['seasons', 'Seasons'], ['orgs', 'Organisations'], ['consents', 'Consents'], ['moderation', 'Moderation']] as const).map(([k, t]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => ts.pick(k)}>{t}</button>)}</div>
    <div key={ts.key} {...ts.swipe} className={ts.cls}>{tab === 'manuals' ? <Manuals /> : tab === 'seasons' ? <Seasons /> : tab === 'orgs' ? <Orgs /> : tab === 'consents' ? <Consents /> : <Moderation />}</div>
    <DemoNote />
  </div>
}

function Manuals() {
  const [list, setList] = useState<CatalogueManual[] | null>(null); const [sure, setSure] = useState<string | null>(null)
  const load = () => social.catalogue().then(setList); useEffect(() => { load() }, [])
  if (!list) return <div className="skel" style={{ height: 200 }} />
  const set = async (code: string, p: Partial<CatalogueManual>) => { await social.set_manual(code, p); setSure(null); load() }
  const tone = { published: 'ok', licensed: 'str', retired: 'plain', draft: 'due' } as const
  return <div className="col gap8">{list.map(m => <div key={m.code} className="card col gap8">
    <div className="row between wrap"><div><b>{m.title}</b><div className="tiny muted">{m.code} · {m.version} · {m.checksum}</div></div><span className={`chip ${tone[m.status]}`}>{m.status[0].toUpperCase() + m.status.slice(1)}{m.retiredAt ? ` · ${dt(m.retiredAt)}` : ''}</span></div>
    {m.status === 'licensed' && <p className="tiny muted">Licensed to {m.orgs.join(', ') || 'no organisation yet'}: learners outside those organisations see it locked.</p>}
    {m.status === 'retired' && <p className="tiny muted">Retired: read-only. Learners keep their history and exports; no new practice, leagues or rooms.</p>}
    <div className="row wrap gap8">
      {m.status !== 'published' && m.status !== 'retired' && <button className="btn sec xs" onClick={() => set(m.code, { status: 'published' })}>Publish to everyone</button>}
      {m.status === 'published' && <button className="btn sec xs" onClick={() => set(m.code, { status: 'licensed', orgs: ['o-lp12'] })}>Restrict to licensed organisations</button>}
      {m.status !== 'retired' ? <button className="btn link xs" style={{ color: 'var(--rh-incorrect)' }} onClick={() => setSure(m.code)}>Retire…</button> : <button className="btn link xs" onClick={() => set(m.code, { status: 'published', retiredAt: undefined })}>Restore</button>}</div>
    {sure === m.code && <div className="card lav col gap8"><b>Retire {m.code}?</b><p className="small">It becomes read-only for everyone at the end of its season. Progress and exports are kept; learners are told in their inbox.</p><div className="row gap8"><button className="btn sec grow" onClick={() => setSure(null)}>Cancel</button><button className="btn bad grow" onClick={() => set(m.code, { status: 'retired' })}>Retire manual</button></div></div>}
  </div>)}<p className="hint"><Icon n="info" />A new manual goes Import → Parse → Generate → Review → Approve → Publish in the content studio before it can be published here.</p></div>
}
function Seasons() {
  const [list, setList] = useState<Season[] | null>(null); const [n, setN] = useState<Season>({ id: '', name: '', from: '', to: '', active: false })
  const load = () => social.seasons().then(setList); useEffect(() => { load() }, [])
  if (!list) return <div className="skel" style={{ height: 120 }} />
  return <div className="col gap8">{list.map(s => <div key={s.id} className="card row"><span className="tile"><Icon n="calendar" /></span><div className="grow"><b>{s.name}</b><div className="tiny muted">{s.from} → {s.to}</div></div>{s.active ? <span className="chip ok">Active</span> : <button className="btn sec xs" onClick={async () => { await social.save_season({ ...s, active: true }); load() }}>Make active</button>}</div>)}
    <form className="card col gap8" onSubmit={async e => { e.preventDefault(); await social.save_season({ ...n, id: 's' + n.from.slice(0, 4) }); setN({ id: '', name: '', from: '', to: '', active: false }); load() }}><h3>New season</h3>
      <input className="field" placeholder="Season 2027–28" value={n.name} onChange={e => setN({ ...n, name: e.target.value })} aria-label="Season name" />
      <div className="row gap8"><input className="field" type="date" value={n.from} onChange={e => setN({ ...n, from: e.target.value })} aria-label="Starts" /><input className="field" type="date" value={n.to} onChange={e => setN({ ...n, to: e.target.value })} aria-label="Ends" /></div>
      <button className="btn" disabled={!n.name || !n.from || !n.to}>Add season</button><p className="tiny muted">Season leaderboards reset at the start date. Weekly leagues continue.</p></form></div>
}
function Orgs() {
  const [list, setList] = useState<Org[] | null>(null); const [cat, setCat] = useState<CatalogueManual[]>([]); const [name, setName] = useState('')
  const load = () => { social.orgs().then(setList); social.catalogue().then(setCat) }; useEffect(() => { load() }, [])
  if (!list) return <div className="skel" style={{ height: 120 }} />
  return <div className="col gap8">{list.map(o => <div key={o.id} className="card col gap8"><div className="row between"><div><b>{o.name}</b><div className="tiny muted">{o.region} · {o.members} members · join code {o.code}</div></div></div>
    <div className="row wrap gap8">{cat.filter(m => m.status !== 'retired').map(m => <button key={m.code} className="chip btnchip" aria-pressed={o.manuals.includes(m.code)} onClick={async () => { await social.save_org({ ...o, manuals: o.manuals.includes(m.code) ? o.manuals.filter(x => x !== m.code) : [...o.manuals, m.code] }); load() }}>{m.code}</button>)}</div>
    <p className="tiny muted">Selected manuals are available to every member. Coaches and stewards are granted per organisation.</p></div>)}
    <form className="card row gap8" onSubmit={async e => { e.preventDefault(); await social.save_org({ id: 'o-' + crypto.randomUUID().slice(0, 6), name, code: name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 14), manuals: ['AD2627', 'EN2627'], members: 0, region: 'Unassigned' }); setName(''); load() }}>
      <input className="field grow" value={name} onChange={e => setName(e.target.value)} placeholder="New organisation name" aria-label="Organisation name" /><button className="btn" disabled={!name.trim()}>Add</button></form></div>
}
function Consents() {
  const [list, setList] = useState<Consent[] | null>(null); const load = () => social.consents().then(setList); useEffect(() => { load() }, [])
  if (!list) return <div className="skel" style={{ height: 120 }} />
  if (!list.length) return <StateCard img="caughtup" title="No consent requests" body="Guardian requests for under-18 messaging arrive here." />
  return <div className="col gap8">{list.map(c => <div key={c.id} className="card row wrap"><span className="tile green"><Icon n="you" /></span><div className="grow"><b className="small">@{c.handle}</b><div className="tiny muted">Guardian {c.guardian} · {dt(c.at)}</div></div>
    {c.state === 'pending' ? <><button className="btn sec xs" onClick={async () => { await social.decide_consent(c.id, false); load() }}>Decline</button><button className="btn xs" onClick={async () => { await social.decide_consent(c.id, true); load() }}>Record consent</button></> : <span className={`chip ${c.state === 'granted' ? 'ok' : 'plain'}`}>{c.state}</span>}</div>)}
    <p className="hint"><Icon n="shield" />Live, consent is given by the guardian through the emailed link. Recording it here is for consent given on paper.</p></div>
}
function Moderation() {
  const [q, setQ] = useState(''); const [people, setPeople] = useState<(PublicUser & { sanctions: Sanction[] })[] | null>(null); const [sel, setSel] = useState<string | null>(null); const [reason, setReason] = useState(''); const [days, setDays] = useState(7)
  const load = () => social.people(q).then(setPeople); useEffect(() => { load() }, [q]) // eslint-disable-line
  const act = async (uid: string, k: Sanction['kind']) => { await social.sanction(uid, k, reason, ['mute', 'suspend'].includes(k) ? days : undefined); setReason(''); setSel(null); load() }
  return <div className="col gap8"><input className="field" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by handle or name" aria-label="Search people" />
    {!people ? <div className="skel" style={{ height: 200 }} /> : people.map(p => <div key={p.id} className="card col gap8"><div className="row"><GlimHead cw={p.cw} size={36} /><div className="grow"><b className="small">@{p.handle}</b><div className="tiny muted">{p.name} · {p.role}{p.demo ? ' · demo' : ''}</div></div>
      {p.sanctions.length > 0 && <span className="chip bad">{p.sanctions[p.sanctions.length - 1].kind}</span>}<button className="btn sec xs" onClick={() => setSel(sel === p.id ? null : p.id)}>Actions</button></div>
      {sel === p.id && <div className="col gap8"><input className="field" value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason the person will see" aria-label="Reason" />
        <label className="small">Days for mute or suspend <input type="number" className="field" min={1} max={365} value={days} onChange={e => setDays(+e.target.value || 1)} style={{ width: 90, display: 'inline-block' }} /></label>
        <div className="row wrap gap8">{([['warn', 'Warn'], ['mute', 'Mute'], ['suspend', 'Suspend'], ['remove', 'Remove content'], ['reset', 'Reset points'], ['ban', 'Ban']] as const).map(([k, t]) => <button key={k} className={`btn ${k === 'ban' ? 'bad' : 'sec'} xs`} disabled={!reason.trim()} onClick={() => act(p.id, k)}>{t}</button>)}</div>
        <p className="tiny muted">The person is told in their inbox, with the reason and how to appeal. Private study is never affected.</p>
        {p.sanctions.map(s => <div key={s.id} className="tiny muted">{dt(s.at)} · {s.kind}{s.until ? ` until ${dt(s.until)}` : ''} · “{s.reason}” · {s.by}</div>)}</div>}</div>)}</div>
}

// ---- Steward verification (FR-IN-06..09) ------------------------------------------------------------------
export function Verify() {
  const m = useManualData(); const [lesson, setLesson] = useState('L01'); const [items, setItems] = useState<Item[] | null>(null); const [src, setSrc] = useState<string>(''); const [vs, setVs] = useState<Record<string, Verification>>({})
  const [i, setI] = useState(0); const [fix, setFix] = useState(''); const [note, setNote] = useState(''); const [anoms, setAnoms] = useState<Anomaly[]>([]); const [view, setView] = useState<'items' | 'anomalies'>('items')
  useEffect(() => { if (!m) return; setItems(null); setI(0); loadItems(m.code, lesson).then(x => setItems(x.filter(y => y.a.text).slice(0, 120)))
    loadLesson(m.code, lesson).then(l => setSrc(l.sections.map(s => `${s.h ?? ''}\n${s.b.map(b => b.x ?? (b.i ?? []).join(' ')).join('\n')}`).join('\n\n'))); social.verifications(m.code).then(setVs); social.anomalies(m.code).then(setAnoms) }, [m, lesson])
  if (!m || !items) return <Loading />
  const it = items[i], done = items.filter(x => vs[x.u]).length
  const mark = async (state: Verification['state']) => { await social.verify(m.code, { u: it.u, state, note, correction: state === 'corrected' ? fix : undefined }); setVs(await social.verifications(m.code)); setFix(''); setNote(''); setI(Math.min(items.length - 1, i + 1)) }
  const needle = (it?.a.text ?? '').slice(0, 40), at = needle ? src.indexOf(needle) : -1
  return <div className="col gap16">
    <div className="row gap8 wrap"><select className="mbtn" value={lesson} onChange={e => setLesson(e.target.value)} aria-label="Lesson">{m.lessons.map(l => <option key={l.id} value={l.id}>{l.n} · {niceTitle(l.title)}</option>)}</select>
      <div className="seg" style={{ width: 240 }}><button className={view === 'items' ? 'on' : ''} onClick={() => setView('items')}>Items</button><button className={view === 'anomalies' ? 'on' : ''} onClick={() => setView('anomalies')}>Anomalies ({anoms.filter(a => a.state === 'open').length})</button></div>
      <span className="tiny muted">{done} of {items.length} verified · checksum {m.code === 'AD2627' ? 'sha256:9f1c…a73e' : 'sha256:41be…0d92'} · gen-1.0</span></div>
    {view === 'anomalies' ? <div className="col gap8">{anoms.map(a => <div key={a.id} className="card row wrap" style={{ alignItems: 'flex-start' }}><span className={`tile ${a.state === 'open' ? 'apricot' : 'green'}`}><Icon n={a.state === 'open' ? 'flag' : 'check'} /></span>
      <div className="grow"><b className="small">{a.kind} · Lesson {+a.lesson.slice(1)} · {a.where}</b><p className="small muted" style={{ margin: '2px 0' }}>{a.detail}</p><span className="tiny faint">Logged {dt(a.at)}</span></div>
      {a.state === 'open' ? <><button className="btn sec xs" onClick={async () => { await social.set_anomaly(a.id, 'kept'); setAnoms(await social.anomalies(m.code)) }}>Keep as printed</button><button className="btn xs" onClick={async () => { await social.set_anomaly(a.id, 'fixed'); setAnoms(await social.anomalies(m.code)) }}>Mark fixed</button></> : <span className="chip ok">{a.state === 'kept' ? 'Kept as printed' : 'Fixed'}</span>}</div>)}
      <p className="hint"><Icon n="info" />The manual is the authority: a printed typo is kept and graded as printed unless the publisher issues a correction.</p></div>
    : <div className="grid2" style={{ alignItems: 'start' }}>
      <div className="card col gap8" style={{ maxHeight: 520, overflow: 'auto' }}><p className="eyebrow">Source · printed manual</p>
        <div className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{at >= 0 ? <>{src.slice(Math.max(0, at - 400), at)}<mark>{src.slice(at, at + (it.a.text ?? '').length)}</mark>{src.slice(at + (it.a.text ?? '').length, at + 600)}</> : src.slice(0, 1400)}</div></div>
      <div className="card col gap8"><div className="row between"><p className="eyebrow">Item {i + 1} of {items.length}</p><span className="chip">{it.t} · {KIND_LABEL[it.t]}</span></div>
        <b>{it.p.instruction}</b>{(it.p.text || it.p.ref) && <div className="pcard small">{it.p.text ?? it.p.ref}</div>}
        <p className="small"><b>Expected:</b> {it.a.text}</p>{it.d.length > 0 && <p className="tiny muted">Options: {it.d.slice(0, 4).join(' · ')}</p>}
        {vs[it.u] && <span className={`chip ${vs[it.u].state === 'approved' ? 'ok' : vs[it.u].state === 'corrected' ? 'str' : 'bad'}`}>{vs[it.u].state} by {vs[it.u].by}{vs[it.u].correction ? `: “${vs[it.u].correction}”` : ''}</span>}
        <input className="field" value={fix} onChange={e => setFix(e.target.value)} placeholder="Correct expected answer (for Correct)" aria-label="Correction" />
        <input className="field" value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" />
        <div className="row gap8"><button className="btn grow" onClick={() => mark('approved')}>Approve</button><button className="btn sec grow" disabled={!fix.trim()} onClick={() => mark('corrected')}>Correct</button><button className="btn bad grow" onClick={() => mark('flagged')}>Flag</button></div>
        <div className="row between"><button className="btn link xs" disabled={!i} onClick={() => setI(i - 1)}>Previous</button><button className="btn link xs" onClick={() => setI(items.findIndex(x => !vs[x.u]) >= 0 ? items.findIndex(x => !vs[x.u]) : i)}>Next unverified</button><button className="btn link xs" disabled={i >= items.length - 1} onClick={() => setI(i + 1)}>Next</button></div>
        <p className="tiny muted">Every decision is versioned with your name and time. A correction ships in the next content version; learner answers already given are re-marked in their favour only.</p></div></div>}
  </div>
}
