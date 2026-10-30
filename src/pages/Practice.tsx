import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { buildSession, categoryOf, dueInfo, FOCUS, lessonOfKey, weakAreas } from '@/lib/engine'
import { loadItems } from '@/lib/data'
import { useStore } from '@/lib/store'
import type { Item, Manual } from '@/lib/types'
import { BackBar, Glim, Icon, Loading, StatPills, useManualData } from '@/ui/bits'
import { useStart, verseRef } from './Journey'

const FOCUS_ICON: Record<string, string> = { verses: 'quote', outlines: 'listn', references: 'bookmark', sentences: 'letter', spelling: 'spell', listening: 'speaker' }
const CAT_LABEL: Record<string, [string, string, string]> = { refs: ['References', 'bookmark', 'apricot'], outline: ['Outline', 'listn', 'green'], verse: ['Memory verse', 'quote', ''], sentences: ['Key sentences', 'letter', ''] }

/** Weak spots measured only from this learner's own answers. */
export function useWeakSpots(m: Manual | null) {
  const { cards, history } = useStore()
  return useMemo(() => {
    if (!m) return []
    const per: Record<string, { seen: number; right: number; lesson: string; cat: string }> = {}
    for (const k in cards) if (k.startsWith(m.code + '|')) { const s = k.split('|')[1], l = lessonOfKey(s), c = categoryOf(s), id = `${l}|${c}`; const e = (per[id] ??= { seen: 0, right: 0, lesson: l, cat: c }); e.seen += cards[k].seen; e.right += cards[k].right }
    const spots: { key: string; title: string; sub: string; ico: string; tone: string; lessons: string[]; focus?: string[] }[] = Object.values(per).filter(v => v.seen >= 4 && v.right / v.seen < .85).sort((a, b) => a.right / a.seen - b.right / b.seen).slice(0, 3)
      .map(v => ({ key: v.lesson + v.cat, title: `${CAT_LABEL[v.cat][0]} · Lesson ${+v.lesson.slice(1)}`, sub: `${Math.round(v.right / v.seen * 100)}% right · ${v.seen} answers`, ico: CAT_LABEL[v.cat][1], tone: CAT_LABEL[v.cat][2], lessons: [v.lesson], focus: v.cat === 'refs' ? ['references'] : v.cat === 'outline' ? ['outlines'] : v.cat === 'verse' ? ['verses'] : ['sentences'] }))
    const since = Date.now() - 7 * 86400000
    const spell = history.filter(h => h.at > since && h.manual === m.code).flatMap(h => h.misses.filter(x => x.t === 'Q26' || x.t === 'Q01' || x.t === 'Q06').map(x => x.expected)).filter((x, i, a) => a.indexOf(x) === i)
    if (spell.length) spots.unshift({ key: 'spell', title: spell.slice(0, 2).map(s => `“${s}”`).join(', '), sub: `${spell.length} spelling miss${spell.length === 1 ? '' : 'es'} this week`, ico: 'spell', tone: 'red', lessons: [...new Set(Object.keys(cards).filter(k => k.startsWith(m.code + '|')).map(k => lessonOfKey(k.split('|')[1])))].slice(-6), focus: ['spelling'] })
    return spots.slice(0, 3)
  }, [m, cards, history])
}

export default function Practice() {
  const m = useManualData(); const { cards, done, sessionSize } = useStore(); const start = useStart(); const nav = useNavigate()
  const weak = useWeakSpots(m)
  if (!m) return <Loading />
  const due = dueInfo(cards, m.code)
  const cur = m.lessons.find(l => !done[`${m.code}|${l.id}`]) ?? m.lessons[0]
  return <div className="page col gap16" style={{ maxWidth: 760 }}>
    <div className="pagehead"><h1>Practice</h1><StatPills /></div>
    <div className="card col" style={{ background: 'var(--rh-apricot-bg)', borderColor: 'transparent' }}>
      <div className="row" style={{ alignItems: 'center' }}><Glim pose={due.count ? 'stopwatch' : 'clap'} size={84} />
        <div className="grow"><p className="eyebrow" style={{ color: 'var(--rh-apricot-deep)' }}>Due review</p><h2 style={{ fontSize: 19 }}>{due.count ? 'Bring it back into focus.' : 'All caught up.'}</h2>
          <p className="tiny muted">{due.count ? `${due.count} point${due.count === 1 ? '' : 's'} · ${due.range} · about ${due.minutes} min` : 'Next items return when they are due.'}</p></div></div>
      {due.count > 0 && <button className="btn apricot block" onClick={() => start({ kind: 'review', manual: m.code, lessons: due.lessons.slice(0, 8), count: sessionSize, title: 'Due review' })}>Review {due.count} point{due.count === 1 ? '' : 's'}</button>}
    </div>
    <div className="grid2">
      <Link to="/practice/build" className="card col gap8" style={{ color: 'inherit', minHeight: 130 }}><span className="tile"><Icon n="filter" /></span><b className="disp" style={{ fontSize: 16 }}>Target practice</b><span className="tiny muted">Lessons, formats, 5–100</span></Link>
      <Link to={`/practice/memory/${cur.id}`} className="card col gap8" style={{ color: 'inherit', minHeight: 130 }}><span className="tile green"><Icon n="ladder" /></span><b className="disp" style={{ fontSize: 16 }}>Memory ladder</b><span className="tiny muted">Build · Fade · Full recall</span></Link>
    </div>
    <p className="eyebrow mt8">Weak spots</p>
    {weak.length ? <div className="card list" style={{ padding: '2px 14px' }}>{weak.map(w => <button key={w.key} className="li" onClick={() => start({ kind: 'target', manual: m.code, lessons: w.lessons, count: sessionSize, focus: w.focus, title: w.key === 'spell' ? 'Spelling traps' : w.title })}>
      <span className={`tile ${w.tone}`} style={{ width: 38, height: 38 }}><Icon n={w.ico} className="s" /></span><span className="grow"><b className="small">{w.title}</b><span className="tiny muted" style={{ display: 'block' }}>{w.sub}</span></span><Icon n="chev" className="faint" /></button>)}</div>
      : <div className="card statecard"><Glim pose="search" size={72} /><div><b>No weak spots yet</b><p className="tiny muted mt8">They appear once you have a few answers in a lesson, measured from your own answers, never guessed.</p></div></div>}
    <button className="card row" style={{ textAlign: 'left', color: 'inherit' }} onClick={() => nav('/arena/challenge')}><span className="tile gold"><Icon n="arena" /></span><span className="grow"><b>Daily challenge</b><span className="tiny muted" style={{ display: 'block' }}>10 questions from lessons you have cleared</span></span><Icon n="chev" className="faint" /></button>
  </div>
}

export function TargetBuilder() {
  const m = useManualData(); const nav = useNavigate(); const { cards, ladder, sessionSize, done } = useStore(); const start = useStart()
  const [sel, setSel] = useState<string[] | null>(null); const [more, setMore] = useState(false)
  const [focus, setFocus] = useState<string[]>([]); const [count, setCount] = useState(Math.max(5, sessionSize)); const [pool, setPool] = useState<number | null>(null)
  const lessons = sel ?? (m ? [(m.lessons.find(l => !done[`${m.code}|${l.id}`]) ?? m.lessons[0]).id] : [])
  useEffect(() => {
    if (!m) return; if (!lessons.length) { setPool(0); return }
    setPool(null); let on = true
    const t = setTimeout(() => buildSession({ kind: 'target', manual: m.code, lessons, count: 9999, focus, title: '' }, cards, ladder).then(r => on && setPool(r.items.length)), 150)
    return () => { on = false; clearTimeout(t) }
  }, [m, lessons.join(), focus.join()]) // eslint-disable-line
  if (!m) return <Loading />
  const tog = (arr: string[], k: string) => arr.includes(k) ? arr.filter(x => x !== k) : [...arr, k]
  const shown = more ? m.lessons : m.lessons.slice(0, 8), n = Math.min(count, pool ?? count)
  return <div className="page col gap16" style={{ maxWidth: 640 }}>
    <BackBar title="Target practice" onBack={() => nav('/practice')} />
    <div><p className="eyebrow">Lessons</p><div className="row wrap gap8 mt8">{shown.map(l => <button key={l.id} className="chip btnchip" aria-pressed={lessons.includes(l.id)} onClick={() => setSel(tog(lessons, l.id))}>L{l.n}</button>)}
      {!more && <button className="chip btnchip plain" onClick={() => setMore(true)}>+{m.lessons.length - 8}</button>}</div>
      <div className="row gap8 mt8"><button className="btn link" onClick={() => setSel(m.lessons.map(l => l.id))}>All lessons</button><button className="btn link" onClick={() => setSel([])}>Clear</button></div></div>
    <div><p className="eyebrow">Focus</p><div className="row wrap gap8 mt8">{Object.entries(FOCUS).map(([k, f]) => <button key={k} className="chip btnchip" aria-pressed={focus.includes(k)} onClick={() => setFocus(tog(focus, k))}><Icon n={FOCUS_ICON[k]} />{f.label}</button>)}</div></div>
    <div><div className="row between"><label className="eyebrow" htmlFor="cnt">Question count</label><b className="disp" style={{ fontSize: 30, color: 'var(--rh-action)' }}>{count}</b></div>
      <input id="cnt" className="slider" type="range" min={5} max={100} step={1} value={count} onChange={e => setCount(+e.target.value)} aria-valuetext={`${count} questions`} />
      <div className="row between tiny muted"><span>5</span><input aria-label="Exact question count" type="number" min={5} max={100} value={count} onChange={e => setCount(Math.max(5, Math.min(100, +e.target.value || 5)))} className="field" style={{ width: 84, minHeight: 36, padding: '4px 10px', fontSize: 14, textAlign: 'center' }} /><span>100</span></div></div>
    <div className="card lav row"><Icon n="lock" style={{ color: 'var(--rh-correct)' }} /><div><b>Private practice · works offline</b><div className="tiny muted">Marked on this device. Not ranked.</div></div></div>
    <div className="card flat row" aria-live="polite"><Icon n={pool !== null && pool < count ? 'filter' : 'check'} style={{ color: pool !== null && pool < count ? 'var(--rh-apricot-deep)' : 'var(--rh-action)' }} />
      <p className="small">{pool === null ? 'Counting eligible questions…' : pool === 0 ? 'Nothing matches yet. Pick a lesson or loosen the focus.' : pool >= count ? `${pool.toLocaleString()} eligible questions match. All ${count} will be unique.` : <><b>Only {pool} questions match.</b> You asked for {count}. Add lessons or formats, or start with {pool} unique questions.</>}</p></div>
    <button className="btn block" disabled={!pool} onClick={() => start({ kind: 'target', manual: m.code, lessons, count: n, focus, title: `Target practice · ${lessons.length === 1 ? `Lesson ${+lessons[0].slice(1)}` : `${lessons.length} lessons`}` })}>Start {n} question{n === 1 ? '' : 's'}</button>
  </div>
}

const RUNGS = [['Q27', 'Build', 'Tap the words in order', 'puzzle', 'q27'], ['Q28', 'Fade', 'Recall the faded words', 'eyeoff', 'q28'], ['Q06', 'Fill', 'One missing word at a time', 'letter', 'q06'], ['Q04', 'Full recall', 'Type the whole verse', 'keyboard', 'q04']] as const
export function MemoryLadder() {
  const m = useManualData(); const nav = useNavigate(); const { id = 'L01' } = useParams(); const lad = useStore(s => s.ladder[`${s.manual}|${id}`]) ?? {}; const start = useStart()
  const [items, setItems] = useState<Item[] | null>(null)
  useEffect(() => { if (m) loadItems(m.code, id).then(setItems) }, [m, id])
  if (!m || !items) return <Loading />
  const l = m.lessons.find(x => x.id === id) ?? m.lessons[0]
  const has = (k: string) => (lad as Record<string, boolean | undefined>)[k]
  const open = (t: string) => t === 'Q27' || (t === 'Q28' && has('q27')) || (t === 'Q06' && has('q27')) || (t === 'Q04' && has('q27') && has('q28'))
  const next = RUNGS.find(r => !has(r[4]) && open(r[0])) ?? RUNGS[3]
  const run = (t: string, name: string) => { const its = items.filter(i => i.t === t && i.s.endsWith('.MV')).slice(0, t === 'Q06' ? 3 : 1); const pick = its.length ? its : items.filter(i => i.t === t).slice(0, 1)
    start({ kind: 'ladder', manual: m.code, lessons: [id], only: pick.map(i => i.u), count: pick.length, title: `Memory ladder · ${name}` }) }
  return <div className="page col gap16" style={{ maxWidth: 560 }}>
    <BackBar title="Memory ladder" onBack={() => nav('/practice')} right={<select aria-label="Lesson" className="mbtn" value={id} onChange={e => nav(`/practice/memory/${e.target.value}`, { replace: true })} style={{ maxWidth: 90 }}>{m.lessons.map(x => <option key={x.id} value={x.id}>L{x.n}</option>)}</select>} />
    <div className="card lav"><p className="eyebrow">Memory verse · Lesson {l.n}</p><p className="mt8" style={{ font: '700 17px/27px var(--rh-font-body)' }}>{l.mv}</p><p className="tiny b mt8" style={{ color: 'var(--rh-action)' }}>{verseRef(l)} · {m.bible}</p></div>
    <div className="col gap8">{RUNGS.map(([t, name, sub, ic, k], i) => { const ok = has(k), op = open(t), isNext = next[0] === t
      return <button key={t} className="card row" disabled={!op} onClick={() => run(t, name)} style={{ marginLeft: i * 12, textAlign: 'left', color: 'inherit', background: ok ? 'var(--rh-correct-bg)' : undefined, borderColor: isNext && !ok ? 'var(--rh-action)' : ok ? 'var(--rh-correct-line)' : undefined, borderWidth: isNext && !ok ? 2 : undefined, opacity: op ? 1 : .75 }}>
        <span className={`tile ${ok ? 'green' : ''}`}><Icon n={ic} /></span><span className="grow"><b className="disp">{name}</b><span className="tiny muted" style={{ display: 'block' }}>{sub} · {t}</span></span>
        {ok ? <Icon n="check" style={{ color: 'var(--rh-correct)' }} /> : !op ? <Icon n="lock" className="faint" /> : isNext ? <span className="chip">Next</span> : <Icon n="chev" className="faint" />}</button> })}</div>
    <div className="row" style={{ alignItems: 'flex-end' }}><Glim pose="point" size={72} /><p className="glimbubble small" style={{ fontWeight: 600 }}>Full recall opens after Build and Fade are correct for this verse.</p></div>
    <button className="btn block" onClick={() => run(next[0], next[1])}>Start {next[1]}</button>
  </div>
}
