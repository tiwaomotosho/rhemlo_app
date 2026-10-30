import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { loadLesson } from '@/lib/data'
import { useStore } from '@/lib/store'
import type { Lesson } from '@/lib/types'
import { Icon, Loading, useManualData } from '@/ui/bits'
import { useStart } from './Journey'

export function Library() {
  const m = useManualData(); const [q, setQ] = useState(''); const done = useStore(s => s.done)
  if (!m) return <Loading />
  const f = q.trim().toLowerCase()
  const rows = m.lessons.filter(l => !f || `${l.n} ${l.title} ${l.mv} ${l.bp} ${l.outline.join(' ')}`.toLowerCase().includes(f))
  return <div className="col" style={{ gap: 16 }}>
    <div><p className="eyebrow">Library</p><h1>{m.short ?? m.title}</h1></div>
    <input className="field" type="search" placeholder="Search lessons, verses, outlines" aria-label="Search the manual" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" spellCheck={false} />
    <div className="list">{rows.map(l => <Link key={l.id} to={`/read/${l.id}`} className="quest" style={{ color: 'inherit' }}>
      <span className="q-ico" style={done[`${m.code}|${l.id}`] ? { background: 'var(--rh-correct-bg)', color: 'var(--rh-correct)' } : undefined}>{done[`${m.code}|${l.id}`] ? <Icon n="check" /> : <b>{l.n}</b>}</span>
      <span className="grow"><b>{l.title}</b><div className="small muted">{l.mvp.split('”').pop()?.trim()} · {l.date.toLowerCase()}</div></span><Icon n="chev" /></Link>)}
      {!rows.length && <p className="muted">No lessons match “{q}”.</p>}</div>
  </div>
}

export function Reader() {
  const { id = 'L01' } = useParams(); const nav = useNavigate(); const m = useManualData(); const start = useStart(); const sessionSize = useStore(s => s.sessionSize)
  const [l, setL] = useState<Lesson | null>(null); const [big, setBig] = useState(() => { try { return localStorage.getItem('rhemlo.read') === 'big' } catch { return false } })
  useEffect(() => { if (m) { setL(null); loadLesson(m.code, id).then(setL).catch(() => nav('/library', { replace: true })); window.scrollTo(0, 0) } }, [m, id, nav])
  if (!m || !l) return <Loading text="Opening the lesson…" />
  const i = m.lessons.findIndex(x => x.id === id), prev = m.lessons[i - 1], nxt = m.lessons[i + 1]
  return <article className="col" style={{ gap: 16 }}>
    <div className="row"><button className="iconbtn" aria-label="Back to library" onClick={() => nav('/library')}><Icon n="back" /></button><div className="grow"><p className="eyebrow">Lesson {l.n} · {l.date.toLowerCase()}</p></div>
      <button className="btn ghost sm" aria-pressed={big} onClick={() => { setBig(!big); try { localStorage.setItem('rhemlo.read', big ? 'normal' : 'big') } catch { /* private mode */ } }}>Aa</button></div>
    <h1 style={{ fontSize: 30, lineHeight: '34px' }}>{l.title}</h1>
    <div className="mv"><p className="eyebrow">Memory verse</p><q>{l.mvp}</q>{l.bp && <p className="small muted" style={{ marginTop: 8 }}>Bible passage: {l.bp}</p>}</div>
    <div className="reader" style={big ? { fontSize: 21, lineHeight: '34px' } : undefined}>
      {l.sections.map(s => <section key={s.k}>{s.h && <h3>{s.h}</h3>}{s.b.map((b, j) => b.t === 'l' ? <ul key={j}>{b.i?.map(x => <li key={x}>{x}</li>)}</ul> : <p key={j}>{b.x}</p>)}</section>)}
    </div>
    {l.readings?.length > 0 && <div className="card"><h3>Daily readings</h3><div className="list" style={{ marginTop: 10 }}>{l.readings.map(r => <div key={r.d} className="row"><span className="pill">{r.d}</span><span>{r.r}</span></div>)}</div></div>}
    {l.assignment && <div className="card tint"><p className="eyebrow">Assignment</p><p>{l.assignment}</p></div>}
    <button className="btn block" onClick={() => start({ kind: 'quest', manual: m.code, lessons: [id], count: sessionSize, title: `Lesson ${l.n} · ${l.title}` })}>Practise this lesson</button>
    <div className="row">{prev && <Link className="btn ghost grow" to={`/read/${prev.id}`}>← {prev.n}</Link>}{nxt && <Link className="btn ghost grow" to={`/read/${nxt.id}`}>{nxt.n} →</Link>}</div>
  </article>
}
