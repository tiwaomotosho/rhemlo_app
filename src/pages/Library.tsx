import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { loadLesson, readInContext } from '@/lib/data'
import { niceTitle } from '@/lib/engine'
import { typedRefs } from '@/lib/grade'
import { lessonStats, useStore } from '@/lib/store'
import type { Card, Lesson, Manual, ManualCode } from '@/lib/types'
import { ContextSheet, Icon, Loading, Sheet, useManualData } from '@/ui/bits'
import { useStart, verseRef } from './Journey'

export function masteryChip(cards: Record<string, Card>, m: Manual, id: string): [string, string] {
  const s = lessonStats(cards, m, id)
  if (s.total && s.secure / s.total >= .6) return ['Secure', 'ok']
  if (s.secure + s.strengthening > 0) return ['Strengthening', 'str']
  if (s.learning > 0) return ['Learning', '']
  return ['Not started', 'plain']
}
const Approved = () => <span className="chip ok" title="Reviewed and approved by the content steward"><Icon n="check" />Approved</span>

/** Wrap printed references such as "(Psalm 119:105; Joshua 1:8)" as tappable links. */
function linkify(text: string, open: (r: string) => void): ReactNode {
  const out: ReactNode[] = []; let last = 0
  for (const m of text.matchAll(/\(([^()]*?\d+\s*:\s*\d+[^()]*)\)/g)) {
    const refs = typedRefs(m[1]); if (!refs.length) continue
    out.push(text.slice(last, m.index)); out.push(<button key={m.index} className="reflink" onClick={() => open(refs[0])}>({m[1]})</button>); last = m.index! + m[0].length
  }
  out.push(text.slice(last)); return out
}

function ManualCard() {
  const m = useManualData(); const set = useStore(s => s.set); const code = useStore(s => s.manual)
  if (!m) return null
  return <button className="row" onClick={() => set({ manual: (code === 'AD2627' ? 'EN2627' : 'AD2627') as ManualCode })} aria-label="Switch manual" style={{ width: '100%', border: 0, textAlign: 'left', padding: 16, borderRadius: 20, color: '#fff', background: 'linear-gradient(135deg,#7041D9,#9A70F0)', boxShadow: '0 4px 0 #4C27A8' }}>
    <span className="tile" style={{ background: 'rgba(255,255,255,.2)', color: '#fff', width: 46, height: 52 }}><Icon n="book" /></span>
    <span className="grow"><b className="disp" style={{ fontSize: 16 }}>{m.code === 'AD2627' ? 'Sunday School Student’s Manual' : 'YAYA Student’s Manual'}</b><span className="tiny" style={{ display: 'block', opacity: .9 }}>{m.short} · {m.lessons.length} lessons · {m.bible}</span></span><Icon n="refresh" /></button>
}

export function Library() {
  const m = useManualData(); const [q, setQ] = useState(''); const [quarter, setQuarter] = useState(1); const { cards } = useStore()
  if (!m) return <Loading />
  const f = q.trim().toLowerCase(), range = m.groups[String(quarter)]
  const rows = m.lessons.filter(l => f ? `${l.n} ${l.title} ${l.mv} ${l.bp} ${l.outline.join(' ')} ${verseRef(l)}`.toLowerCase().includes(f) : l.n >= range[0] && l.n <= range[1])
  return <div className="page col gap16" style={{ maxWidth: 680 }}>
    <div className="pagehead"><h1>Library</h1><Icon n="search" className="faint" /></div>
    <ManualCard />
    <div className="fwrap"><Icon n="search" className="s" /><input className="field" style={{ paddingLeft: 42 }} type="search" placeholder="Search lessons, verses, references" aria-label="Search the manual" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" spellCheck={false} /></div>
    {!f && <div className="tabs" role="tablist">{Object.keys(m.groups).map(k => <button key={k} role="tab" aria-selected={quarter === +k} className={quarter === +k ? 'on' : ''} onClick={() => setQuarter(+k)}>Q{k}</button>)}</div>}
    <div className="card list" style={{ padding: '2px 14px' }}>{rows.map(l => { const [t, c] = masteryChip(cards, m, l.id); return <Link key={l.id} to={`/library/${l.id}`} className="li">
      <span className="tile" style={{ background: c === 'ok' || c === 'str' ? 'var(--rh-pistachio-bg)' : 'var(--rh-raised)', color: c === 'ok' || c === 'str' ? 'var(--rh-pistachio-deep)' : 'var(--rh-action)' }}><b className="disp">{l.n}</b></span>
      <span className="grow"><b>{niceTitle(l.title)}</b><span className="row gap8 mt8"><Approved /><span className={`chip ${c}`}>{t}</span></span></span><Icon n="chev" className="faint" /></Link> })}
      {!rows.length && <p className="muted" style={{ padding: 14 }}>No lessons match “{q}”.</p>}</div>
  </div>
}

export function Reader() {
  const { id = 'L01' } = useParams(); const nav = useNavigate(); const m = useManualData(); const start = useStart()
  const { sessionSize, cards, readings, set, prefs } = useStore()
  const [l, setL] = useState<Lesson | null>(null); const [tab, setTab] = useState<'read' | 'outline' | 'refs'>('read')
  const [ref, setRef] = useState<string | null>(null); const [side, setSide] = useState<string | null>(null); const [sideText, setSideText] = useState<string>('')
  const [focus, setFocus] = useState<string[]>([]); const [size, setSize] = useState(false); const [report, setReport] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { if (m) { setL(null); setTab('read'); loadLesson(m.code, id).then(setL).catch(() => nav('/library', { replace: true })) } }, [m, id, nav])
  useEffect(() => { // Learn is done when the end of the lesson has been reached
    if (!l || !m || !end.current) return
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { const k = `${m.code}|read|${id}`; if (!useStore.getState().readings[k]) set({ readings: { ...useStore.getState().readings, [k]: true } }) } })
    io.observe(end.current); return () => io.disconnect()
  }, [l, m, id, set, tab])
  const openRef = (r: string) => { if (matchMedia('(min-width:1024px)').matches) { setSide(r); setSideText(''); readInContext(r).then(x => setSideText(x ? x.verses.filter(v => v.hit).map(v => v.t).join(' ') : 'Not in the stored text.')) } else setRef(r) }
  const inScope = useMemo(() => { if (!l) return []; const seen = new Set<string>(); const out: { r: string; where: string }[] = []
    const add = (r: string, where: string) => { if (!seen.has(r)) { seen.add(r); out.push({ r, where }) } }
    add(verseRef(l as never), 'Memory verse'); if (l.bp) add(l.bp, 'Bible passage')
    l.sections.forEach(s => s.b.forEach(b => [b.x ?? '', ...(b.i ?? [])].forEach(t => typedRefs(t).forEach(r => add(r, s.h || 'Introduction'))))); return out }, [l])
  if (!m || !l) return <Loading />
  const i = m.lessons.findIndex(x => x.id === id), meta = m.lessons[i], prev = m.lessons[i - 1], nxt = m.lessons[i + 1]
  const q = +(Object.entries(m.groups).find(([, r]) => meta.n >= r[0] && meta.n <= r[1])?.[0] ?? 1), qr = m.groups[String(q)]
  const [mt, mc] = masteryChip(cards, m, id)
  const scale = size ? 1.18 : prefs.textScale
  const date = meta.date.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()).replace(/(\d)(St|Nd|Rd|Th)/g, (_, a, b) => a + b.toLowerCase())
  const mvText = l.mvp.slice(0, l.mvp.lastIndexOf('”') + 1) || l.mv
  return <div className="lib3">
    <nav className="ll" aria-label="Lessons this quarter"><p className="eyebrow" style={{ padding: '0 10px 8px' }}>Quarter {q}</p>
      {m.lessons.filter(x => x.n >= qr[0] && x.n <= qr[1]).map(x => <Link key={x.id} to={`/library/${x.id}`} className={`lessonlink ${x.id === id ? 'on' : ''}`}><span className="n">{x.n}</span>{niceTitle(x.title)}</Link>)}</nav>
    <article className="lc col gap16" style={{ maxWidth: 640, margin: '0 auto', width: '100%', padding: undefined }}>
      <div className="topbar mobonly"><button className="iconbtn" aria-label="Back to library" onClick={() => nav('/library')}><Icon n="back" /></button><div className="t">Lesson {meta.n}</div>
        <button className="iconbtn" aria-pressed={size} aria-label="Larger text" onClick={() => setSize(!size)}><b className="disp">Tт</b></button></div>
      <div className="row gap8"><div className="tabs grow" role="tablist">{([['read', 'Read'], ['outline', 'Outline'], ['refs', 'References']] as const).map(([k, t]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>)}</div><span className="mobonly" /><Approved /></div>
      <p className="eyebrow">Lesson {meta.n} · {date}</p>
      <div className="row gap8 mobonly"><span className={`chip ${mc}`}>{mt}</span></div>
      <h1 style={{ fontSize: 32, lineHeight: '36px' }}>{niceTitle(l.title)}</h1>
      <div className="mvcard"><p className="eyebrow">Memory verse</p><q>{mvText}</q><p className="src">{verseRef(meta)} · Bible passage {l.bp}</p></div>
      {tab === 'read' && <div className="reader" style={{ ['--rh-text-scale' as string]: scale }}>
        {l.sections.map((s, si) => <section key={s.k + si}>{s.h && <p className="eyebrow" style={{ margin: '22px 0 10px' }}>{s.h}</p>}{s.b.map((b, j) => b.t === 'l' ? <ul key={j}>{b.i?.map((x, k) => <li key={k}>{linkify(x, openRef)}</li>)}</ul> : <p key={j}>{linkify(b.x ?? '', openRef)}</p>)}</section>)}
        {l.assignment && <div className="card lav" style={{ font: 'var(--rh-type-body)' }}><p className="eyebrow">Assignment · for reflection</p><p className="mt8">{l.assignment}</p><p className="tiny muted mt8">Never graded.</p></div>}
        <div ref={end} style={{ height: 1 }} />
        {readings[`${m.code}|read|${id}`] && <p className="small row gap8" style={{ color: 'var(--rh-correct)' }}><Icon n="check" className="s" />Learn step done for this chapter</p>}
      </div>}
      {tab === 'outline' && <div className="col gap8">
        {l.sections.filter(s => s.h).map((s, si) => { const sentences = s.b.reduce((a, b) => a + (b.x ? b.x.split(/(?<=[.!?])\s+/).length : 0), 0), nrefs = s.b.reduce((a, b) => a + typedRefs([b.x ?? '', ...(b.i ?? [])].join(' ')).length, 0)
          const list = s.b.find(b => b.t === 'l')
          return <Fragment key={s.k + si}><div className="card row"><span className="tile" style={{ width: 48, height: 48 }}><b className="disp" style={{ fontSize: 18 }}>{si + 1}</b></span><div><b className="disp">{s.h}</b><div className="tiny muted">{sentences} sentences · {nrefs} references</div></div></div>
            {list && <div className="card col gap8"><p className="eyebrow">Point {si + 1} · {s.h}</p>{list.i!.map((x, k) => <div key={k} className="numrow"><span className="n">{k + 1}</span><span className="small">{x.replace(/\s*\(.*?\)\s*$/, '')}</span></div>)}</div>}</Fragment> })}
        {l.assignment && <div className="card lav"><p className="eyebrow">Assignment</p><p className="small mt8">{l.assignment}</p><p className="tiny muted mt8">A reflection card, never graded.</p></div>}</div>}
      {tab === 'refs' && <div className="col gap8"><div className="row gap8"><span className="chip lg">{inScope.length} in scope</span><span className="chip lg plain">{meta.readings.length} further readings</span></div>
        <div className="card list" style={{ padding: '2px 14px' }}>{inScope.map(x => <button key={x.r} className="li" onClick={() => openRef(x.r)}><span className="tile apricot" style={{ width: 36, height: 36 }}><Icon n="bookmark" className="s" /></span><span className="grow"><b className="small">{x.r}</b><span className="tiny muted" style={{ display: 'block' }}>{x.where}</span></span><span className="chip ok">In scope</span></button>)}
          {meta.readings.map(r => <button key={r.d} className="li" onClick={() => openRef(r.r)}><span className="tile" style={{ width: 36, height: 36 }}><Icon n="bookmark" className="s" /></span><span className="grow"><b className="small">{r.r}</b><span className="tiny muted" style={{ display: 'block' }}>{r.d} reading</span></span><span className="chip plain">Not graded</span></button>)}</div></div>}
      <div className="row between">{prev ? <Link className="btn link" to={`/library/${prev.id}`}>← Lesson {prev.n}</Link> : <span />}{nxt && <Link className="btn link" to={`/library/${nxt.id}`}>Lesson {nxt.n} →</Link>}</div>
      <div className="row gap8 mobonly" style={{ position: 'sticky', bottom: 'calc(var(--rh-nav-h) + 8px)' }}><button className="btn sec" onClick={() => setReport(true)}><Icon n="flag" className="s" />Report</button><button className="btn grow" onClick={() => start({ kind: 'quest', manual: m.code, lessons: [id], count: sessionSize, title: `Lesson ${meta.n} · Recall` })}>Practise lesson</button></div>
    </article>
    <aside className="lr" aria-label="Practice and context">
      <div className="card col gap8"><h3>Practise Lesson {meta.n}</h3><p className="tiny muted">{meta.ic.toLocaleString()} questions · this lesson only</p>
        <div className="row wrap gap8">{(['verses', 'outlines', 'references'] as const).map(k => <button key={k} className="chip btnchip" aria-pressed={focus.includes(k)} onClick={() => setFocus(f => f.includes(k) ? f.filter(x => x !== k) : [...f, k])}>{k === 'verses' ? 'Memory verse' : k === 'outlines' ? 'Outline' : 'References'}</button>)}</div>
        <button className="btn block" onClick={() => start({ kind: focus.length ? 'target' : 'quest', manual: m.code, lessons: [id], count: sessionSize, focus, title: `Lesson ${meta.n} · ${focus.length ? 'Target practice' : 'Recall'}` })}>Start {sessionSize} questions</button></div>
      <div className="card col gap8"><p className="eyebrow">Read in context · KJV</p>{side ? <><b className="small">{side}</b><p className="small muted">{sideText || '…'}</p></> : <p className="small muted">Tap a reference in the lesson to read it here.</p>}<p className="tiny faint">Public domain · display only</p></div>
      <button className="btn sec block" onClick={() => setReport(true)}><Icon n="flag" className="s" />Report a content error</button>
      <div className="row gap8"><span className={`chip ${mc}`}>{mt}</span><span className="tiny muted">your mastery · separate from approval</span></div>
    </aside>
    {ref && <ContextSheet refs={[ref]} onClose={() => setRef(null)} />}
    {report && <Sheet label="Report a content error" onClose={() => setReport(false)}><ReportForm lesson={id} onClose={() => setReport(false)} /></Sheet>}
  </div>
}

function ReportForm({ lesson, onClose }: { lesson: string; onClose: () => void }) {
  const [txt, setTxt] = useState(''); const [sent, setSent] = useState(false)
  if (sent) return <div className="col"><h2>Thank you</h2><p className="muted">Saved on this device. It reaches the content stewards when the Rhemlo server is connected. Reports never change grades.</p><button className="btn block" onClick={onClose}>Close</button></div>
  return <div className="col"><h2>Report a content error</h2><p className="small muted">Quote what looks wrong and where. A steward checks it against the printed manual.</p>
    <textarea className="field" rows={4} value={txt} onChange={e => setTxt(e.target.value)} aria-label="What looks wrong" />
    <button className="btn block" disabled={!txt.trim()} onClick={() => { try { const r = JSON.parse(localStorage.getItem('rhemlo.reports') ?? '[]'); r.push({ lesson, note: txt, at: Date.now() }); localStorage.setItem('rhemlo.reports', JSON.stringify(r)) } catch { /* */ } setSent(true) }}>Send report</button></div>
}
