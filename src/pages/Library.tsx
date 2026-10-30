import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { loadLesson } from '@/lib/data'
import { niceTitle } from '@/lib/engine'
import { typedRefs } from '@/lib/grade'
import { lessonStats, useStore } from '@/lib/store'
import type { Lesson, Manual } from '@/lib/types'
import { ContextSheet, Icon, Loading, useManualData } from '@/ui/bits'
import { useStart } from './Journey'

const title = niceTitle
export function masteryTag(cards: Parameters<typeof lessonStats>[0], m: Manual, id: string) {
  const s = lessonStats(cards, m, id)
  if (s.secure / Math.max(1, s.total) >= .6) return ['Secure', 'secure'] as const
  if (s.secure + s.strengthening > 0) return ['Strengthening', 'str'] as const
  if (s.learning > 0) return ['Learning', 'learn'] as const
  return ['Not started', ''] as const
}

export function Library() {
  const m = useManualData(); const [q, setQ] = useState(''); const [quarter, setQuarter] = useState(1); const { done, cards } = useStore()
  if (!m) return <Loading />
  const f = q.trim().toLowerCase(), qs = Object.entries(m.groups), range = m.groups[String(quarter)]
  const rows = m.lessons.filter(l => f ? `${l.n} ${l.title} ${l.mv} ${l.bp} ${l.outline.join(' ')}`.toLowerCase().includes(f) : l.n >= range[0] && l.n <= range[1])
  return <div className="col" style={{ gap: 16 }}>
    <h1>Library</h1>
    <div className="manualcard"><span className="ico"><Icon n="book" className="" /></span><div><b style={{ fontSize: 18, fontFamily: 'var(--rh-font-display)' }}>{m.title}</b><div className="small" style={{ opacity: .9 }}>{m.short} · {m.lessons.length} lessons · KJV</div></div></div>
    <input className="field" type="search" placeholder="Search lessons, verses, references" aria-label="Search the manual" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" spellCheck={false} />
    {!f && <div className="tabs" role="tablist">{qs.map(([k]) => <button key={k} role="tab" aria-selected={quarter === +k} className={quarter === +k ? 'on' : ''} onClick={() => setQuarter(+k)}>Q{k}</button>)}</div>}
    <div className="card list" style={{ padding: 4, gap: 0 }}>{rows.map(l => { const [t, c] = masteryTag(cards, m, l.id); return <Link key={l.id} to={`/read/${l.id}`} className="sheetrow" style={{ color: 'inherit' }}>
      <span className={`lnum ${done[`${m.code}|${l.id}`] ? 'done' : ''}`}>{l.n}</span>
      <span className="grow"><b>{title(l.title)}</b><span style={{ display: 'block', marginTop: 2 }}><span className={`tag ${c}`}>{t}</span> <span className="small muted">{l.mvp.split('”').pop()?.trim()}</span></span></span><Icon n="chev" /></Link> })}
      {!rows.length && <p className="muted" style={{ padding: 12 }}>No lessons match “{q}”.</p>}</div>
  </div>
}

export function Reader() {
  const { id = 'L01' } = useParams(); const nav = useNavigate(); const m = useManualData(); const start = useStart(); const { sessionSize, cards } = useStore()
  const [l, setL] = useState<Lesson | null>(null); const [tab, setTab] = useState<'read' | 'outline' | 'refs'>('read'); const [ref, setRef] = useState<string | null>(null)
  const [big, setBig] = useState(() => { try { return localStorage.getItem('rhemlo.read') === 'big' } catch { return false } })
  useEffect(() => { if (m) { setL(null); setTab('read'); loadLesson(m.code, id).then(setL).catch(() => nav('/library', { replace: true })); window.scrollTo(0, 0) } }, [m, id, nav])
  const refs = useMemo(() => { if (!l) return []; const txt = l.sections.map(s => s.b.map(b => b.x ?? b.i?.join(' ') ?? '').join(' ')).join(' ') + ' ' + l.bp; return [...new Set(typedRefs(txt))] }, [l])
  if (!m || !l) return <Loading text="Opening the lesson…" />
  const i = m.lessons.findIndex(x => x.id === id), prev = m.lessons[i - 1], nxt = m.lessons[i + 1], [tg, tc] = masteryTag(cards, m, id)
  return <article className="col" style={{ gap: 14 }}>
    <div className="row"><button className="iconbtn" aria-label="Back to library" onClick={() => nav('/library')}><Icon n="back" /></button><p className="grow center small" style={{ fontWeight: 800 }}>Lesson {l.n} · {l.date.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())}</p>
      <button className="iconbtn" aria-label="Text size" aria-pressed={big} onClick={() => { setBig(!big); try { localStorage.setItem('rhemlo.read', big ? 'normal' : 'big') } catch { /* private mode */ } }}><b>Aa</b></button></div>
    <div className="tabs" role="tablist">{([['read', 'Read'], ['outline', 'Outline'], ['refs', 'References']] as const).map(([k, t]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>)}</div>
    <div className="row"><span className={`tag ${tc}`}>{tg}</span></div>
    <h1 style={{ fontSize: 30, lineHeight: '34px' }}>{title(l.title)}</h1>
    <div className="mv"><p className="eyebrow">Memory verse</p><q>{l.mvp.slice(0, l.mvp.lastIndexOf('”') + 1)}</q><p className="small" style={{ marginTop: 8, color: 'var(--rh-apricot-deep)', fontWeight: 800 }}>{l.mvp.split('”').pop()?.trim()}</p></div>
    {tab === 'read' && <div className="reader" style={big ? { fontSize: 21, lineHeight: '34px' } : undefined}>
      {l.sections.map((s, si) => <section key={s.k + si}>{s.h && <p className="eyebrow" style={{ margin: '18px 0 8px' }}>{s.h}</p>}{s.b.map((b, j) => b.t === 'l' ? <ul key={j}>{b.i?.map(x => <li key={x}>{x}</li>)}</ul> : <p key={j}>{b.x}</p>)}</section>)}
      {l.readings?.length > 0 && <div className="card" style={{ font: 'var(--rh-type-body)' }}><h3>Daily readings</h3><div className="list" style={{ marginTop: 10 }}>{l.readings.map(r => <div key={r.d} className="row"><span className="pill">{r.d}</span><button className="refbtn" onClick={() => setRef(r.r)}>{r.r}</button></div>)}</div></div>}
      {l.assignment && <div className="card tint" style={{ font: 'var(--rh-type-body)', marginTop: 14 }}><p className="eyebrow">Assignment</p><p>{l.assignment}</p></div>}</div>}
    {tab === 'outline' && <div className="card col"><h3>Outline</h3><ol style={{ margin: 0, paddingLeft: 22 }}>{l.outline.map(o => <li key={o} style={{ padding: '4px 0' }}>{o}</li>)}</ol>
      <p className="eyebrow">Sections</p>{l.sections.filter(s => s.h).map((s, si) => <p key={s.k + si}>{s.h}</p>)}</div>}
    {tab === 'refs' && <div className="card col"><h3>{refs.length} references</h3><p className="small muted">Tap one to read it in the stored KJV.</p>
      <div className="chips">{refs.map(r => <button key={r} className="chip" onClick={() => setRef(r)}><Icon n="book" />{r}</button>)}</div></div>}
    <div className="row" style={{ justifyContent: 'space-between' }}>{prev ? <Link className="btn ghost sm" to={`/read/${prev.id}`}>← {prev.n}</Link> : <span />}{nxt && <Link className="btn ghost sm" to={`/read/${nxt.id}`}>{nxt.n} →</Link>}</div>
    <div className="stickybar"><button className="btn block" onClick={() => start({ kind: 'quest', manual: m.code, lessons: [id], count: sessionSize, title: `Lesson ${l.n} · ${title(l.title)}` })}>Practise lesson</button></div>
    {ref && <ContextSheet refs={[ref]} onClose={() => setRef(null)} />}
  </article>
}
