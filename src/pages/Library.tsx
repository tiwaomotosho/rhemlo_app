import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { loadLesson, readInContext, readPassage } from '@/lib/data'
import { niceTitle } from '@/lib/engine'
import { typedRefs } from '@/lib/grade'
import { lessonStats, useStore } from '@/lib/store'
import type { Card, Lesson, Manual, ManualCode } from '@/lib/types'
import { BackBar, Icon, Loading, Sheet, useManualData } from '@/ui/bits'
import { useManualSwitch } from '@/ui/ManualSwitch'
import { api } from '@/lib/backend'
import { useStart, verseRef } from './Journey'
import { useSlide, useSwipe } from '@/ui/swipe'
import { lessonLevel } from '@/lib/mastery'

export function masteryChip(cards: Record<string, Card>, m: Manual, id: string): [string, string] {
  const s = lessonStats(cards, m, id)
  if (s.total && s.secure / s.total >= .6) return ['Secure', 'ok']
  if (s.secure + s.strengthening > 0) return ['Strengthening', 'str']
  if (s.learning > 0) return ['Learning', '']
  return ['Not started', 'plain']
}
const Approved = () => <span className="chip ok" title="Reviewed and approved by the content steward"><Icon n="check" />Approved</span>

/** Wrap printed references such as "(Psalm 119:105; Joshua 1:8)" as tappable links. */
function linkify(text: string, open: (r: string, el: HTMLElement) => void): ReactNode {
  const out: ReactNode[] = []; let last = 0
  for (const m of text.matchAll(/\(([^()]*?\d+\s*:\s*\d+[^()]*)\)/g)) {
    if (!typedRefs(m[1]).length) continue
    out.push(text.slice(last, m.index), '(')
    // each reference inside "(Jeremiah 23:23; Isaiah 55:9)" is its own link; "4:8; 5:1" inherits the book before it
    let book = ''
    m[1].split(/(;\s*)/).forEach((part, i) => {
      if (/^;\s*$/.test(part)) { out.push(part); return }
      const own = typedRefs(part)[0], ref = own ?? (book && /^\s*\d/.test(part) ? typedRefs(`${book} ${part}`)[0] : undefined)
      if (own) book = own.replace(/\s+\d.*$/, '')
      out.push(ref ? <button key={`${m.index}-${i}`} className="reflink" onClick={e => open(ref, e.currentTarget)}>{part}</button> : part)
    })
    out.push(')'); last = m.index! + m[0].length
  }
  out.push(text.slice(last)); return out
}

const outlineNo = (l: Lesson, s: Lesson['sections'][number]) => s.k === 'section' ? l.sections.filter(x => x.k === 'section').indexOf(s) + 1 : 0
function headOf(l: Lesson, s: Lesson['sections'][number]) {
  const n = outlineNo(l, s)
  return n ? `Outline ${n}: ${s.h}` : s.k === 'questions' ? 'Lesson questions' : s.h || (s.k === 'introduction' ? 'Introduction' : 'Conclusion')
}
/** Bullet points are sentences of the lesson too: each one counts. */
function statsOf(s: Lesson['sections'][number]) {
  let sentences = 0, bullets = 0, refs = 0
  for (const b of s.b) {
    if (b.t === 'l') { bullets += b.i?.length ?? 0; refs += (b.i ?? []).reduce((a, x) => a + typedRefs(x).length, 0) }
    else if (b.x) { sentences += b.x.split(/(?<=[.!?])\s+(?=[A-Z“"‘(])/).filter(Boolean).length; refs += typedRefs(b.x).length }
  }
  return { sentences: sentences + bullets, bullets, refs }
}

/** Read in context. Desktop: a floating card beside the reference that stays in view while you scroll.
 *  Phone and tablet: a peek drawer above the navigation that leaves the lesson readable; pull up for more verses. */
function VersePeek({ refText, anchor, onClose }: { refText: string; anchor: HTMLElement | null; onClose: () => void }) {
  const [span, setSpan] = useState(1); const [data, setData] = useState<Awaited<ReturnType<typeof readInContext>> | undefined>(undefined)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null); const box = useRef<HTMLDivElement>(null)
  const desk = matchMedia('(min-width:1024px)').matches
  useEffect(() => { let on = true; readInContext(refText, span).then(x => on && setData(x)); return () => { on = false } }, [refText, span])
  useEffect(() => {
    anchor?.classList.add('reflink-on')
    if (!desk && anchor) { const r = anchor.getBoundingClientRect(); if (r.bottom > innerHeight * .55) window.scrollBy(0, r.top - innerHeight * .3) } // keep the tapped verse above the drawer
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; addEventListener('keydown', k)
    return () => { anchor?.classList.remove('reflink-on'); removeEventListener('keydown', k) }
  }, [anchor, onClose, desk])
  useEffect(() => {
    if (!desk) return
    const place = () => { const h = box.current?.offsetHeight ?? 260, w = 380, r = anchor?.getBoundingClientRect()
      if (!r || r.bottom < 0 || r.top > innerHeight) { setPos({ top: 16, left: innerWidth - w - 24 }); return } // the reference scrolled away: dock top-right
      if (innerWidth >= 1200) { setPos({ top: Math.min(Math.max(16, r.top - 24), innerHeight - h - 16), left: innerWidth - w - 24 }); return } // beside the verse, over the context rail
      let top = r.bottom + 10; if (top + h > innerHeight - 16) top = Math.max(16, r.top - h - 10)
      setPos({ top, left: Math.min(Math.max(16, r.left - 40), innerWidth - w - 16) }) }
    place(); addEventListener('scroll', place, { passive: true }); addEventListener('resize', place)
    return () => { removeEventListener('scroll', place); removeEventListener('resize', place) }
  }, [anchor, desk, data, span])
  const body = data === undefined ? <div className="skel" style={{ height: 60 }} /> : data ? data.verses.map(v => <p key={v.n} className={`pv ${v.hit ? 'hit' : ''}`}><sup>{v.n}</sup>{v.t}</p>) : <p className="small muted">{refText} is not in the stored text.</p>
  const head = <div className="row between"><div><p className="eyebrow">Read in context · KJV</p><b className="disp">{refText}</b></div><button className="iconbtn" aria-label="Close" onClick={onClose}><Icon n="x" /></button></div>
  const more = <div className="row gap8"><button className="chip lg plain" onClick={() => setSpan(span >= 7 ? 1 : span + 3)}><Icon n={span >= 7 ? 'up' : 'down'} />{span >= 7 ? 'Less' : 'More verses'}</button><span className="tiny faint grow" style={{ textAlign: 'right' }}>Public domain · display only</span></div>
  if (desk) return <div ref={box} className="versepop" role="dialog" aria-label={`Read ${refText} in context`} style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}>{head}<div className="pvbody">{body}</div>{more}</div>
  return <div className={`versepeek ${span > 1 ? 'open' : ''}`} role="dialog" aria-label={`Read ${refText} in context`}>
    <button className="grab" aria-label={span > 1 ? 'Show less' : 'Show more verses'} onClick={() => setSpan(span > 1 ? 1 : 4)} />{head}<div className="pvbody">{body}</div>{more}</div>
}

function ManualCard() {
  const m = useManualData(); const [sheet, open] = useManualSwitch()
  if (!m) return null
  return <><button className="row" onClick={open} aria-label="Switch manual" style={{ width: '100%', border: 0, textAlign: 'left', padding: 16, borderRadius: 20, color: '#fff', background: 'linear-gradient(135deg,#7041D9,#9A70F0)', boxShadow: '0 4px 0 #4C27A8' }}>
    <span className="tile" style={{ background: 'rgba(255,255,255,.2)', color: '#fff', width: 46, height: 52 }}><Icon n="book" /></span>
    <span className="grow"><b className="disp" style={{ fontSize: 16 }}>{m.code === 'AD2627' ? 'Sunday School Student’s Manual' : 'YAYA Student’s Manual'}</b><span className="tiny" style={{ display: 'block', opacity: .9 }}>{m.short} · {m.lessons.length} lessons · {m.bible}</span></span><span className="chip" style={{ background: 'rgba(255,255,255,.22)', color: '#fff', height: 34 }}><Icon n="swap" />Switch</span></button>{sheet}</>
}

export function Library() {
  const m = useManualData(); const [q, setQ] = useState(''); const [quarter, setQuarter] = useState(1); const { cards, log, checks, readings, learn } = useStore()
  const slide = useSlide(); const qs = m ? Object.keys(m.groups).map(Number) : []
  const toQuarter = (n: number) => { if (!qs.includes(n) || n === quarter) return; slide.mark(n > quarter ? 'next' : 'prev'); setQuarter(n) }
  const swipe = useSwipe({ onLeft: () => toQuarter(quarter + 1), onRight: () => toQuarter(quarter - 1) })
  if (!m) return <Loading />
  const f = q.trim().toLowerCase(), range = m.groups[String(quarter)]
  const rows = m.lessons.filter(l => f ? `${l.n} ${l.title} ${l.mv} ${l.bp} ${l.outline.join(' ')} ${verseRef(l)}`.toLowerCase().includes(f) : l.n >= range[0] && l.n <= range[1])
  return <div className="page col gap16" style={{ maxWidth: 680 }}>
    <div className="pagehead"><h1>Library</h1><Link to="/library/index" className="btn sec sm"><Icon n="listn" className="s" />Index</Link></div>
    <ManualCard />
    <div className="fwrap"><Icon n="search" className="s" /><input className="field" style={{ paddingLeft: 42 }} type="search" placeholder="Search lessons, verses, references" aria-label="Search the manual" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" spellCheck={false} /></div>
    {!f && <div className="tabs" role="tablist">{Object.keys(m.groups).map(k => <button key={k} role="tab" aria-selected={quarter === +k} className={quarter === +k ? 'on' : ''} onClick={() => toQuarter(+k)}>Q{k}</button>)}</div>}
    <div key={slide.key} {...(f ? {} : swipe)} className={`card list ${f ? '' : slide.cls}`} style={{ padding: '2px 14px' }}>{rows.map(l => { const [t, c] = masteryChip(cards, m, l.id); return <Link key={l.id} to={`/library/${l.id}`} className="li">
      <span className={`lnum ${c}`}>{String(l.n).padStart(2, '0')}</span>
      <span className="grow"><b>{niceTitle(l.title)}</b><span className="row gap8 mt8"><Approved /><span className={`chip ${c}`}>{t}</span>{(() => { const lv = lessonLevel(m, l.id, cards, log, checks, !!readings[`${m.code}|read|${l.id}`], learn[`${m.code}|${l.id}`] ?? []); return lv.level > 0 && <span className={`chip ${lv.mastered ? 'ok' : 'plain'}`} title="Mastery level">{lv.mastered ? 'Mastered' : `L${lv.level} ${lv.name}`}</span> })()}</span></span><Icon n="chev" className="faint" /></Link> })}
      {!rows.length && <p className="muted" style={{ padding: 14 }}>No lessons match “{q}”.</p>}</div>
  </div>
}

/** "Acts 2:1-4; 41-47" or "Genesis 2:7-8, 15" -> one reference per part: later parts inherit the book and chapter before them. */
function passageParts(text: string) {
  let book = '', chap = ''
  return text.split(/\s*[;,]\s*/).filter(Boolean).map(p => {
    const full = p.match(/^(.*?\D)\s+(\d+):(.+)$/), cv = p.match(/^(\d+):(.+)$/)
    if (full) { book = full[1].trim(); chap = full[2]; return p.trim() }
    if (cv && book) { chap = cv[1]; return `${book} ${p.trim()}` }
    return book && chap ? `${book} ${chap}:${p.trim()}` : p.trim()
  })
}

/** The lesson's Bible passage in its own section: collapsed by default, the KJV text when opened. */
function BiblePassage({ refText }: { refText: string }) {
  const [open, setOpen] = useState(false)
  const [parts, setParts] = useState<{ ref: string; verses: { n: number; t: string }[] }[] | null>(null)
  useEffect(() => { if (open && !parts) Promise.all(passageParts(refText).map(readPassage)).then(x => setParts(x.filter(Boolean) as { ref: string; verses: { n: number; t: string }[] }[])) }, [open, parts, refText])
  return <section className="bpcard">
    <button className="bphead" aria-expanded={open} aria-controls="bp-body" onClick={() => setOpen(!open)}>
      <span className="grow" style={{ textAlign: 'left' }}><span className="eyebrow">Bible passage</span><b>{refText}</b></span>
      <span className="tiny">{open ? 'Hide' : 'Read'}</span><Icon n="chev" style={{ transform: `rotate(${open ? -90 : 90}deg)`, transition: 'transform .2s' }} /></button>
    {open && <div id="bp-body" className="bpbody">
      {!parts ? <div className="skel" style={{ height: 80 }} /> : !parts.length ? <p className="small muted">This passage could not be found in the KJV text.</p>
        : parts.map(p => <div key={p.ref}>{parts.length > 1 && <p className="tiny b muted" style={{ margin: '6px 0 2px' }}>{p.ref}</p>}
            <p className="bptext">{p.verses.map(v => <span key={v.n}><sup>{v.n}</sup>{v.t} </span>)}</p></div>)}
      <p className="tiny faint">King James Version · public domain · for reading; only what the manual prints is tested</p></div>}
  </section>
}

export function Reader() {
  const { id = 'L01' } = useParams(); const nav = useNavigate(); const m = useManualData(); const start = useStart()
  const { sessionSize, cards, readings, set, prefs } = useStore()
  const [l, setL] = useState<Lesson | null>(null); const [tab, setTab] = useState<'read' | 'outline' | 'refs'>('read')
  const [peek, setPeek] = useState<{ ref: string; el: HTMLElement | null } | null>(null)
  const [focus, setFocus] = useState<string[]>([]); const [size, setSize] = useState(false); const [report, setReport] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { if (m) { setL(null); setTab('read'); loadLesson(m.code, id).then(setL).catch(() => nav('/library', { replace: true })) } }, [m, id, nav])
  useEffect(() => { // Learn is done when the end of the lesson has been reached
    if (!l || !m || !end.current) return
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { const k = `${m.code}|read|${id}`; if (!useStore.getState().readings[k]) set({ readings: { ...useStore.getState().readings, [k]: true } }) } })
    io.observe(end.current); return () => io.disconnect()
  }, [l, m, id, set, tab])
  const openRef = (r: string, el?: HTMLElement) => setPeek({ ref: r, el: el ?? null })
  const inScope = useMemo(() => { if (!l) return []; const seen = new Set<string>(); const out: { r: string; where: string }[] = []
    const add = (r: string, where: string) => { if (!seen.has(r)) { seen.add(r); out.push({ r, where }) } }
    add(verseRef(l as never), 'Memory verse'); if (l.bp) add(l.bp, 'Bible passage')
    l.sections.forEach(s => s.b.forEach(b => [b.x ?? '', ...(b.i ?? [])].forEach(t => typedRefs(t).forEach(r => add(r, s.h || 'Introduction'))))); return out }, [l])
  const slide = useSlide()
  const idx = m ? m.lessons.findIndex(x => x.id === id) : -1
  const goLesson = (d: 1 | -1) => { const t = m?.lessons[idx + d]; if (!t) return; slide.mark(d > 0 ? 'next' : 'prev'); nav(`/library/${t.id}`) }
  const swipe = useSwipe({ onLeft: () => goLesson(1), onRight: () => goLesson(-1) })
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
    <article key={id} {...swipe} className={`lc col gap16 ${slide.cls}`} style={{ maxWidth: 640, margin: '0 auto', width: '100%', padding: undefined }}>
      <div className="topbar mobonly"><button className="iconbtn" aria-label="Back to library" onClick={() => nav('/library')}><Icon n="back" /></button><div className="t">Lesson {meta.n}</div>
        <button className="iconbtn" aria-pressed={size} aria-label="Larger text" onClick={() => setSize(!size)}><b className="disp">Tт</b></button></div>
      <div className="row gap8"><div className="tabs grow" role="tablist">{([['read', 'Read'], ['outline', 'Outline'], ['refs', 'References']] as const).map(([k, t]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>)}</div><span className="mobonly" /><Approved /></div>
      <p className="eyebrow">Lesson {meta.n} · {date}</p>
      <div className="row gap8 mobonly"><span className={`chip ${mc}`}>{mt}</span></div>
      <h1 style={{ fontSize: 32, lineHeight: '36px' }}>{niceTitle(l.title)}</h1>
      <div className="mvcard"><p className="eyebrow">Memory verse</p><q>{mvText}</q><p className="src"><button className="reflink" onClick={e => openRef(verseRef(meta), e.currentTarget)}>{verseRef(meta)}</button></p></div>
      {l.bp && <BiblePassage key={id} refText={l.bp} />}
      {tab === 'read' && <div className="reader" style={{ ['--rh-text-scale' as string]: scale }}>
        {l.sections.map((s, si) => <section key={s.k + si} className={`rsec ${s.k}`}><h2 className="rhead">{headOf(l, s)}</h2>{s.k === 'questions' && <p className="tiny muted" style={{ margin: '-6px 0 10px' }}>For class discussion · never graded</p>}
          {s.b.map((b, j) => b.t === 'l' ? <ol key={j} className={s.k === 'questions' ? 'qlist' : ''}>{b.i?.map((x, k) => <li key={k}>{linkify(x, openRef)}</li>)}</ol> : <p key={j}>{linkify(b.x ?? '', openRef)}</p>)}</section>)}
        {l.assignment && <div className="card lav" style={{ font: 'var(--rh-type-body)' }}><p className="eyebrow">Assignment · for reflection</p><p className="mt8">{l.assignment}</p><p className="tiny muted mt8">Never graded.</p></div>}
        <div ref={end} style={{ height: 1 }} />
        {readings[`${m.code}|read|${id}`] && <p className="small row gap8" style={{ color: 'var(--rh-correct)' }}><Icon n="check" className="s" />Learn step done for this chapter</p>}
      </div>}
      {tab === 'outline' && <div className="col gap8">
        {l.sections.map((s, si) => { const st = statsOf(s), num = outlineNo(l, s)
          if (s.k === 'questions') return <div key={s.k + si} className="card col gap8" style={{ borderStyle: 'dashed' }}><p className="eyebrow">Lesson questions · never graded</p>{s.b.flatMap(b => b.i ?? (b.x ? [b.x] : [])).map((x, k) => <div key={k} className="numrow"><span className="n">{k + 1}</span><span className="small">{x}</span></div>)}</div>
          return <div key={s.k + si} className="card col gap8"><div className="row"><span className={`tile ${num ? '' : 'green'}`} style={{ width: 48, height: 48 }}>{num ? <b className="disp" style={{ fontSize: 18 }}>{num}</b> : <Icon n={s.k === 'introduction' ? 'book' : 'flag'} />}</span>
            <div className="grow"><p className="eyebrow">{num ? `Outline ${num}` : s.k === 'introduction' ? 'Introduction' : 'Conclusion'}</p>{num ? <b className="disp">{niceTitle(s.h)}</b> : null}<div className="tiny muted">{st.sentences} sentence{st.sentences === 1 ? '' : 's'} · {st.refs} reference{st.refs === 1 ? '' : 's'}</div></div></div>
</div> })}
        {l.assignment && <div className="card lav"><p className="eyebrow">Assignment</p><p className="small mt8">{l.assignment}</p><p className="tiny muted mt8">A reflection card, never graded.</p></div>}</div>}
      {tab === 'refs' && <div className="col gap8"><div className="row gap8"><span className="chip lg">{inScope.length} in scope</span></div>
        <div className="card list" style={{ padding: '2px 14px' }}>{inScope.map(x => <button key={x.r} className="li" onClick={e => openRef(x.r, e.currentTarget)}><span className="tile apricot" style={{ width: 36, height: 36 }}><Icon n="bookmark" className="s" /></span><span className="grow"><b className="small">{x.r}</b><span className="tiny muted" style={{ display: 'block' }}>{x.where}</span></span><span className="chip ok">In scope</span></button>)}
          </div></div>}
      <div className="row between">{prev ? <Link className="btn link" to={`/library/${prev.id}`}>← Lesson {prev.n}</Link> : <span />}{nxt && <Link className="btn link" to={`/library/${nxt.id}`}>Lesson {nxt.n} →</Link>}</div>
      <div className="row gap8 mobonly" style={{ position: 'sticky', bottom: 'calc(var(--rh-nav-h) + 8px)' }}><button className="btn sec" onClick={() => setReport(true)}><Icon n="flag" className="s" />Report</button><button className="btn grow" onClick={() => start({ kind: 'quest', manual: m.code, lessons: [id], count: sessionSize, title: `Lesson ${meta.n} · Recall` })}>Practise lesson</button></div>
    </article>
    <aside className="lr" aria-label="Practice and context">
      <div className="card col gap8"><h3>Practise Lesson {meta.n}</h3><p className="tiny muted">{meta.ic.toLocaleString()} questions · this lesson only</p>
        <div className="row wrap gap8">{(['verses', 'outlines', 'references'] as const).map(k => <button key={k} className="chip btnchip" aria-pressed={focus.includes(k)} onClick={() => setFocus(f => f.includes(k) ? f.filter(x => x !== k) : [...f, k])}>{k === 'verses' ? 'Memory verse' : k === 'outlines' ? 'Outline' : 'References'}</button>)}</div>
        <button className="btn block" onClick={() => start({ kind: focus.length ? 'target' : 'quest', manual: m.code, lessons: [id], count: sessionSize, focus, title: `Lesson ${meta.n} · ${focus.length ? 'Target practice' : 'Recall'}` })}>Start {sessionSize} questions</button></div>
      <div className="card col gap8"><p className="eyebrow">Read in context · KJV</p><p className="small muted">Tap any purple reference in the lesson. The verse opens right beside it and stays in view as you scroll.</p><p className="tiny faint">Public domain · display only</p></div>
      <button className="btn sec block" onClick={() => setReport(true)}><Icon n="flag" className="s" />Report a content error</button>
      <div className="row gap8"><span className={`chip ${mc}`}>{mt}</span><span className="tiny muted">your mastery · separate from approval</span></div>
    </aside>
    {peek && <VersePeek key={peek.ref} refText={peek.ref} anchor={peek.el} onClose={() => setPeek(null)} />}
    {report && <Sheet label="Report a content error" onClose={() => setReport(false)}><ReportForm lesson={id} onClose={() => setReport(false)} /></Sheet>}
  </div>
}

function ReportForm({ lesson, onClose }: { lesson: string; onClose: () => void }) {
  const [txt, setTxt] = useState(''); const [sent, setSent] = useState(false)
  if (sent) return <div className="col"><h2>Thank you</h2><p className="muted">It reaches the content stewards, who check it against the printed manual. Reports never change grades.</p><button className="btn block" onClick={onClose}>Close</button></div>
  return <div className="col"><h2>Report a content error</h2><p className="small muted">Quote what looks wrong and where. A steward checks it against the printed manual.</p>
    <textarea className="field" rows={4} value={txt} onChange={e => setTxt(e.target.value)} aria-label="What looks wrong" />
    <button className="btn block" disabled={!txt.trim()} onClick={() => { try { const r = JSON.parse(localStorage.getItem('rhemlo.reports') ?? '[]'); r.push({ lesson, note: txt, at: Date.now() }); localStorage.setItem('rhemlo.reports', JSON.stringify(r)) } catch { /* */ } if (api.session()) void api.report('content', lesson, 'Content error', txt); setSent(true) }}>Send report</button></div>
}

// ---- Quarter outline tree (FR-RD-02) and reference index (FR-RD-03) ----------------------------------
export function RefIndex() {
  const m = useManualData(); const nav = useNavigate(); const [tab, setTab] = useState<'tree' | 'refs'>('tree'); const [q, setQ] = useState('')
  const [idx, setIdx] = useState<Map<string, Set<string>> | null>(null); const [open, setOpen] = useState<Record<string, boolean>>({})
  useEffect(() => {
    if (!m || tab !== 'refs' || idx) return
    Promise.all(m.lessons.map(l => loadLesson(m.code, l.id))).then(ls => {
      const map = new Map<string, Set<string>>()
      for (const l of ls) for (const s of l.sections) for (const b of s.b) for (const t of [b.x ?? '', ...(b.i ?? [])]) for (const x of t.matchAll(/\(([^()]*?\d+\s*:\s*\d+[^()]*)\)/g))
        for (const r of typedRefs(x[1])) { const k = r.replace(/\b[a-z]/g, c => c.toUpperCase()); if (!map.has(k)) map.set(k, new Set()); map.get(k)!.add(l.id) }
      setIdx(map)
    })
  }, [m, tab, idx])
  if (!m) return <Loading />
  const f = q.trim().toLowerCase()
  const refs = idx ? [...idx.entries()].filter(([k]) => !f || k.toLowerCase().includes(f)).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })) : []
  return <div className="page col gap16" style={{ maxWidth: 680 }}>
    <BackBar title="Manual index" onBack={() => nav('/library')} />
    <div className="tabs" role="tablist"><button role="tab" aria-selected={tab === 'tree'} className={tab === 'tree' ? 'on' : ''} onClick={() => setTab('tree')}>Outline tree</button><button role="tab" aria-selected={tab === 'refs'} className={tab === 'refs' ? 'on' : ''} onClick={() => setTab('refs')}>Reference index</button></div>
    {tab === 'tree' ? Object.entries(m.groups).map(([g, r]) => <div key={g} className="card col gap4"><button className="row between" style={{ border: 0, background: 'transparent', color: 'inherit', padding: 0 }} onClick={() => setOpen(o => ({ ...o, [g]: !o[g] }))} aria-expanded={open[g] !== false}><b>Quarter {g} · Lessons {r[0]}–{r[1]}</b><Icon n="chev" style={{ transform: open[g] !== false ? 'rotate(90deg)' : undefined }} /></button>
      {open[g] !== false && m.lessons.filter(l => l.n >= r[0] && l.n <= r[1]).map(l => <div key={l.id} style={{ paddingLeft: 8, borderLeft: '2px solid var(--rh-line)' }} className="mt8">
        <Link to={`/library/${l.id}`} className="small b" style={{ color: 'inherit' }}>{l.n}. {niceTitle(l.title)}</Link>
        <ol className="tiny muted" style={{ margin: '2px 0 0', paddingLeft: 22 }}>{l.outline.map((o, i) => <li key={i}>{o}</li>)}</ol></div>)}</div>)
      : <>
        <div className="fwrap"><Icon n="search" className="s" /><input className="field" style={{ paddingLeft: 42 }} type="search" placeholder="Book or reference, e.g. Romans 8" aria-label="Search references" value={q} onChange={e => setQ(e.target.value)} /></div>
        {!idx ? <div className="skel" style={{ height: 240 }} /> : <div className="card list" style={{ padding: '2px 14px' }}>{refs.slice(0, 300).map(([k, ls]) => <div key={k} className="li"><b className="small grow">{k}</b>
          <span className="row wrap gap4">{[...ls].map(id => <Link key={id} to={`/library/${id}`} className="chip">L{+id.slice(1)}</Link>)}</span></div>)}
          {refs.length > 300 && <p className="tiny muted" style={{ padding: 8 }}>{refs.length - 300} more · narrow the search</p>}{!refs.length && <p className="muted" style={{ padding: 14 }}>No reference matches “{q}”.</p>}</div>}
        <p className="tiny muted">Every reference the manual prints, with the lessons that cite it. Only what the manual prints is ever tested.</p></>}
  </div>
}
