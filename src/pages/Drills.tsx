// Study modes beyond the sitting (PRD 9.7): guided Learn cycle, matching, flashcards, discrimination
// drill picker and an optional memory palace for long ordered lists.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { loadItems, loadLesson } from '@/lib/data'
import { lessonOfKey, niceTitle, shuffleSeed } from '@/lib/engine'
import { normText } from '@/lib/grade'
import { lessonLevel } from '@/lib/mastery'
import { play } from '@/lib/sound'
import { useStore } from '@/lib/store'
import type { Item, Lesson, Manual } from '@/lib/types'
import { BackBar, Icon, Loading, useManualData } from '@/ui/bits'
import { useStart, verseRef } from './Journey'

// ---- Learn a lesson: the four-day cycle (PRD 6.3) --------------------------------------------------
export function LearnLesson() {
  const m = useManualData(); const { id = 'L01' } = useParams(); const nav = useNavigate(); const start = useStart(); const S = useStore()
  if (!m) return <Loading />
  const l = m.lessons.find(x => x.id === id) ?? m.lessons[0], key = `${m.code}|${l.id}`, done = S.learn[key] ?? [], read = !!S.readings[`${m.code}|read|${l.id}`]
  const lv = lessonLevel(m, l.id, S.cards, S.log, S.checks, read, done)
  const step = (id: string, title: string, sub: string, ic: string, go: () => void, ok: boolean) => <button className="cyc" onClick={go}><span className={`tile ${ok ? 'green' : ''}`}><Icon n={ok ? 'check' : ic} /></span><span className="grow"><span className="nm">{title}</span><span className="tiny muted" style={{ display: 'block' }}>{sub}</span></span>{ok ? <span className="chip ok">Done</span> : <Icon n="chev" className="faint" />}</button>
  const spec = (learnStep: string, extra: object) => ({ kind: 'learn' as const, manual: m.code, lessons: [l.id], title: `Lesson ${l.n} · Learn`, learnStep, count: 10, ...extra })
  return <div className="page col gap16" style={{ maxWidth: 640 }}>
    <BackBar title={`Learn Lesson ${l.n}`} onBack={() => nav('/practice')} />
    <div className="card lav col gap8"><p className="eyebrow">Lesson {l.n}</p><h2>{niceTitle(l.title)}</h2><p className="small muted">Memory verse {verseRef(l)} · Level {lv.level}: {lv.name}</p></div>
    {[['Day 1', 'Meaning and structure', [
      step('pretest', 'Pretest, cold', 'Five quick questions before reading. Getting some wrong helps you learn.', 'target', () => start(spec('pretest', { count: 5, formats: 'mcq' })), done.includes('pretest')),
      step('read', 'Read for meaning', 'Read the whole lesson once.', 'book', () => nav(`/library/${l.id}`), read),
      step('outline', 'Learn the outline', 'Outline points, titles and their order.', 'listn', () => start(spec('outline', { focus: ['outlines', 'lessons'], count: 8 })), done.includes('outline'))]],
    ['Day 2', 'Memory verse and section 1', [
      step('ladder', 'Memory verse ladder', 'Build, fade, fill, then the full verse.', 'ladder', () => nav(`/practice/memory/${l.id}`), !!S.ladder[key]?.q04),
      step('section1', 'Section 1 missing words', 'Exact words of the first outline point.', 'feather', () => start(spec('section1', { focus: ['sentences', 'spelling'], section: 'S1', count: 12 })), done.includes('section1'))]],
    ['Day 3', 'Section 2 and references', [
      step('section2', 'Section 2 missing words', 'Exact words of the second outline point.', 'feather', () => start(spec('section2', { focus: ['sentences', 'spelling'], section: 'S2', count: 12 })), done.includes('section2')),
      step('refs', 'References', 'Which reference supports which point, both ways.', 'bookmark', () => start(spec('refs', { focus: ['references'], count: 12 })), done.includes('refs'))]],
    ['Day 4', 'Lesson mastery check', [
      step('check', 'Mastery check · 25 questions', '98% raises the lesson to Verbatim. Two a week apart mark it Mastered.', 'flag', () => start({ kind: 'check', manual: m.code, lessons: [l.id], count: 25, title: `Lesson ${l.n} · Check`, learnStep: 'check' }), done.includes('check'))]],
    ].map(([d, t, steps]) => <div key={d as string} className="card col gap8"><div className="row between"><p className="eyebrow">{d as string}</p><span className="tiny muted">{t as string}</span></div>{steps as React.ReactNode[]}</div>)}
    <p className="hint"><Icon n="info" />Weekly: a quick-fire round across learned lessons. Every four weeks: a timed CBT mock. The planner schedules both.</p>
  </div>
}

// ---- Matching game ------------------------------------------------------------------------------------
type Pair = { l: string; r: string }
async function pairsFor(m: Manual, kind: string, lessons: string[], seed: string): Promise<Pair[]> {
  const ls = m.lessons.filter(x => lessons.includes(x.id))
  if (kind === 'number') return shuffleSeed(ls, seed).slice(0, 6).map(x => ({ l: `Lesson ${x.n}`, r: niceTitle(x.title) }))
  if (kind === 'verse') return shuffleSeed(ls, seed).slice(0, 6).map(x => ({ l: niceTitle(x.title), r: verseRef(x) }))
  const its = (await Promise.all(ls.map(x => loadItems(m.code, x.id)))).flat().filter(i => i.t === 'Q11' && i.p.ref && i.a.text && i.a.text.length < 90)
  const seen = new Set<string>(); return shuffleSeed(its, seed).filter(i => { const k = i.p.ref!; if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 6).map(i => ({ l: i.a.text!.replace(/\s*\(.*$/, ''), r: i.p.ref! }))
}
export function Matching() {
  const m = useManualData(); const nav = useNavigate(); const { done } = useStore()
  const [kind, setKind] = useState('number'); const [pairs, setPairs] = useState<Pair[] | null>(null); const [round, setRound] = useState(0)
  const [pickL, setPickL] = useState<number | null>(null); const [matched, setMatched] = useState<number[]>([]); const [bad, setBad] = useState<[number, number] | null>(null); const [moves, setMoves] = useState(0); const [t0, setT0] = useState(Date.now())
  const lessons = useMemo(() => { if (!m) return []; const d = m.lessons.filter(l => done[`${m.code}|${l.id}`]); return (d.length >= 6 ? d : m.lessons.slice(0, 12)).map(l => l.id) }, [m, done])
  useEffect(() => { if (!m) return; setPairs(null); setMatched([]); setMoves(0); setPickL(null); setT0(Date.now()); pairsFor(m, kind, lessons, kind + round + Date.now()).then(setPairs) }, [m, kind, round]) // eslint-disable-line
  const right = useMemo(() => pairs ? shuffleSeed(pairs.map((p, i) => ({ ...p, i })), 'r' + round + kind) : [], [pairs]) // eslint-disable-line
  if (!m) return <Loading />
  const tapR = (i: number) => { if (pickL === null || matched.includes(i)) return; setMoves(x => x + 1); if (i === pickL) { setMatched(x => [...x, i]); setPickL(null); play('correct') } else { setBad([pickL, i]); play('wrong'); setTimeout(() => { setBad(null); setPickL(null) }, 600) } }
  const finished = pairs && matched.length === pairs.length
  return <div className="page col gap16" style={{ maxWidth: 760 }}>
    <BackBar title="Matching" onBack={() => nav('/practice')} />
    <div className="seg">{([['number', 'Lesson ↔ number'], ['verse', 'Lesson ↔ memory verse'], ['refs', 'Point ↔ reference']] as const).map(([k, t]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{t}</button>)}</div>
    <p className="tiny muted">A warm-up from lessons you have cleared. It does not change your memory schedule.</p>
    {!pairs ? <div className="skel" style={{ height: 300 }} /> : finished ? <div className="card col center" style={{ alignItems: 'center' }}><h2>All matched</h2><p className="muted">{moves} taps · {Math.round((Date.now() - t0) / 1000)} seconds</p><button className="btn" onClick={() => setRound(r => r + 1)}>Next round</button></div> :
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="col gap8">{pairs.map((p, i) => <button key={i} className={`opt ${matched.includes(i) ? 'right' : pickL === i ? 'sel' : bad?.[0] === i ? 'wrong' : ''}`} disabled={matched.includes(i)} onClick={() => setPickL(i)}><span className="grow small">{p.l}</span></button>)}</div>
        <div className="col gap8">{right.map(p => <button key={p.i} className={`opt ${matched.includes(p.i) ? 'right' : bad?.[1] === p.i ? 'wrong' : ''}`} disabled={matched.includes(p.i) || pickL === null} onClick={() => tapR(p.i)}><span className="grow small">{p.r}</span></button>)}</div></div>}
  </div>
}

// ---- Flashcards -------------------------------------------------------------------------------------
export function Flashcards() {
  const m = useManualData(); const nav = useNavigate(); const S = useStore()
  const [cards, setCards] = useState<Item[] | null>(null); const [i, setI] = useState(0); const [flip, setFlip] = useState(false); const [tally, setTally] = useState([0, 0])
  useEffect(() => { if (!m) return; const ls = m.lessons.filter(l => S.done[`${m.code}|${l.id}`]).map(l => l.id); Promise.all((ls.length ? ls : ['L01']).map(l => loadItems(m.code, l))).then(x => setCards(shuffleSeed(x.flat().filter(it => ['Q05', 'Q07', 'Q09', 'Q10', 'Q12', 'Q29', 'Q31', 'Q14'].includes(it.t) && (it.a.text || it.a.items)), String(Date.now())).slice(0, 20))) }, [m?.code]) // eslint-disable-line
  if (!m || !cards) return <Loading />
  const c = cards[i]
  const rate = (knew: boolean) => { S.recordAnswer(m.code, c, knew, true, { mode: 'flashcard' }); setTally(t => [t[0] + (knew ? 1 : 0), t[1] + 1]); setFlip(false); setI(i + 1) }
  return <div className="page col gap16" style={{ maxWidth: 560 }}>
    <BackBar title="Flashcards" onBack={() => nav('/practice')} />
    {!c ? <div className="card col center" style={{ alignItems: 'center' }}><h2>Deck done</h2><p className="muted">You knew {tally[0]} of {tally[1]}. Self-rated cards count as assisted, so they move your schedule less than a typed answer.</p><Link className="btn" to="/practice">Back to Practice</Link></div> : <>
      <p className="tiny muted center">{i + 1} of {cards.length} · Lesson {+lessonOfKey(c.s).slice(1)}</p>
      <button className="card col center" style={{ minHeight: 260, justifyContent: 'center', alignItems: 'center', gap: 12, color: 'inherit' }} onClick={() => setFlip(!flip)} aria-label={flip ? 'Show the question' : 'Show the answer'}>
        <p className="eyebrow">{flip ? 'Answer' : 'Question'}</p>
        {!flip ? <><b className="disp" style={{ fontSize: 19 }}>{c.p.instruction}</b>{(c.p.text || c.p.ref || c.p.title || c.p.previous) && <p className="small">{c.p.text ?? c.p.ref ?? c.p.title ?? c.p.previous}</p>}</>
          : <b className="disp" style={{ fontSize: 22, color: 'var(--rh-action)' }}>{c.a.text ?? c.a.items?.join(' · ')}</b>}
        <span className="tiny faint">Tap to flip</span></button>
      {flip && <div className="row gap8"><button className="btn sec grow" onClick={() => rate(false)}>Not yet</button><button className="btn grow" onClick={() => rate(true)}>Knew it</button></div>}</>}
  </div>
}

// ---- Discrimination drill (confusable lessons) ---------------------------------------------------------
export function Discrimination() {
  const m = useManualData(); const nav = useNavigate(); const start = useStart(); const { log } = useStore()
  if (!m) return <Loading />
  const byTitle = new Map(m.lessons.map(l => [normText(l.title), l]))
  const counts = new Map<string, number>()
  for (const e of log) { if (e.ok || e.m !== m.code || !e.wrote || !['Q15', 'Q10', 'Q08', 'Q31', 'Q30', 'Q29'].includes(e.t)) continue
    const a = lessonOfKey(e.s), w = byTitle.get(normText(e.wrote)) ?? m.lessons.find(l => String(l.n) === e.wrote!.trim()); if (!w || w.id === a) continue
    const k = [a, w.id].sort().join('|'); counts.set(k, (counts.get(k) ?? 0) + 1) }
  const pairs = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  const fallback = m.lessons.slice(0, 12).flatMap((l, i, a) => i % 2 ? [] : a[i + 1] ? [[`${l.id}|${a[i + 1].id}`, 0] as [string, number]] : [])
  const name = (id: string) => { const l = m.lessons.find(x => x.id === id)!; return `L${l.n} ${niceTitle(l.title)}` }
  return <div className="page col gap16" style={{ maxWidth: 640 }}>
    <BackBar title="Discrimination drill" onBack={() => nav('/practice')} />
    <p className="small muted">Side-by-side practice for lessons that get mixed up: which lesson, shared references and outline points.</p>
    <p className="eyebrow">{pairs.length ? 'Lessons you have confused' : 'Neighbouring lessons'}</p>
    <div className="col gap8">{(pairs.length ? pairs : fallback).map(([k, n]) => { const [a, b] = k.split('|'); return <button key={k} className="card row" style={{ textAlign: 'left', color: 'inherit' }} onClick={() => start({ kind: 'discrimination', manual: m.code, lessons: [a, b], count: 16, title: `${name(a)} vs ${name(b)}` })}>
      <span className="tile apricot"><Icon n="scale" /></span><span className="grow small"><b>{name(a)}</b><br /><b>{name(b)}</b>{n ? <span className="tiny muted" style={{ display: 'block' }}>Mixed up {n} time{n === 1 ? '' : 's'}</span> : null}</span><Icon n="chev" className="faint" /></button> })}</div>
  </div>
}

// ---- Memory palace (optional, PRD 7: method of loci for long ordered lists) ------------------------------
export function Palace() {
  const m = useManualData(); const nav = useNavigate(); const S = useStore(); const [lid, setLid] = useState('L01'); const [lesson, setLesson] = useState<Lesson | null>(null); const [li, setLi] = useState(0); const [mode, setMode] = useState<'build' | 'walk'>('build'); const [ans, setAns] = useState<string[]>([]); const [shown, setShown] = useState(false)
  useEffect(() => { if (m) loadLesson(m.code, lid).then(l => { setLesson(l); setLi(0); setAns([]); setShown(false) }) }, [m, lid])
  if (!m || !lesson) return <Loading />
  const lists = lesson.sections.flatMap(s => s.b.filter(b => b.t === 'l' && (b.i?.length ?? 0) >= 4).map(b => ({ h: s.h, items: b.i!.map(x => x.replace(/\s*\(.*$/, '').replace(/\s+-\s.*$/, '')) })))
  const list = lists[li], key = `${m.code}|${lid}|${li}`, places: string[] = (S.prefs as unknown as { palace?: Record<string, string[]> }).palace?.[key] ?? []
  const setPlaces = (p: string[]) => S.set({ prefs: { ...S.prefs, palace: { ...((S.prefs as unknown as { palace?: Record<string, string[]> }).palace ?? {}), [key]: p } } as never })
  return <div className="page col gap16" style={{ maxWidth: 640 }}>
    <BackBar title="Memory palace" onBack={() => nav('/practice')} />
    <p className="small muted">For long ordered lists: put each item in a place you know well, in walking order. Optional, and it never changes your marks.</p>
    <div className="row gap8"><select className="field" value={lid} onChange={e => setLid(e.target.value)} aria-label="Lesson">{m.lessons.map(l => <option key={l.id} value={l.id}>L{l.n} · {niceTitle(l.title)}</option>)}</select></div>
    {!lists.length ? <p className="muted">This lesson has no list of four or more items.</p> : <>
      {lists.length > 1 && <div className="row wrap gap8">{lists.map((x, i) => <button key={i} className="chip btnchip" aria-pressed={li === i} onClick={() => { setLi(i); setAns([]); setShown(false) }}>{x.h || `List ${i + 1}`}</button>)}</div>}
      <div className="seg"><button className={mode === 'build' ? 'on' : ''} onClick={() => setMode('build')}>Build</button><button className={mode === 'walk' ? 'on' : ''} onClick={() => { setMode('walk'); setAns([]); setShown(false) }}>Walk and recall</button></div>
      {mode === 'build' ? <div className="col gap8">{list.items.map((it, i) => <div key={i} className="card col gap8" style={{ padding: 12 }}><b className="small">{i + 1}. {it}</b><input className="field" placeholder="A place, e.g. front door" value={places[i] ?? ''} onChange={e => { const p = [...places]; p[i] = e.target.value; setPlaces(p) }} aria-label={`Place for item ${i + 1}`} /></div>)}</div>
        : <div className="col gap8">{list.items.map((it, i) => <div key={i} className="card col gap8" style={{ padding: 12 }}><span className="tiny muted">{i + 1}. At the {places[i] || `place ${i + 1}`}…</span>
          <input className="field" value={ans[i] ?? ''} onChange={e => { const a = [...ans]; a[i] = e.target.value; setAns(a) }} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} aria-label={`Item ${i + 1}`} />
          {shown && <span className={`small b ${normText(ans[i] ?? '') === normText(it) ? 'okm' : ''}`} style={{ color: normText(ans[i] ?? '') === normText(it) ? undefined : 'var(--rh-incorrect)' }}>{normText(ans[i] ?? '') === normText(it) ? '✓ ' : '✗ '}{it}</span>}</div>)}
          <button className="btn block" onClick={() => setShown(true)}>Check my walk</button></div>}</>}
  </div>
}
