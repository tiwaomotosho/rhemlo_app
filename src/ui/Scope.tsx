// Practice scope: which lessons every study mode draws from. Auto follows what you have started;
// otherwise a chosen set of quarters or individual lessons. Kept per manual.
import { useState } from 'react'
import { niceTitle } from '@/lib/engine'
import { useStore } from '@/lib/store'
import type { Manual } from '@/lib/types'
import { Icon, Sheet } from './bits'

export interface PracticeScope { quarters: string[]; lessons: string[] }
/** Lesson ids in scope, the current lesson within it, and a short label. */
export function useScope(m: Manual | null | undefined) {
  const { cards, done, prefs } = useStore()
  if (!m) return { ids: [] as string[], cur: undefined, label: '', custom: false, started: [] as string[] }
  const sc = prefs.scope?.[m.code]
  const started = m.lessons.filter(l => done[`${m.code}|${l.id}`] || Object.keys(cards).some(k => k.startsWith(`${m.code}|${m.code}:${l.id}.`))).map(l => l.id)
  const firstOpen = m.lessons.find(l => !done[`${m.code}|${l.id}`]) ?? m.lessons[0]
  let ids: string[], label: string
  if (sc?.lessons.length) { ids = m.lessons.filter(l => sc.lessons.includes(l.id)).map(l => l.id); label = ids.length === 1 ? `Lesson ${+ids[0].slice(1)}` : `${ids.length} chosen lessons` }
  else if (sc?.quarters.length) { ids = m.lessons.filter(l => sc.quarters.some(q => l.n >= m.groups[q][0] && l.n <= m.groups[q][1])).map(l => l.id); label = sc.quarters.length === Object.keys(m.groups).length ? 'Whole manual' : sc.quarters.map(q => `Q${q}`).join(' + ') }
  else { ids = started.length ? started : [firstOpen.id]; label = started.length ? `Lessons you have started (${started.length})` : `Lesson ${firstOpen.n}` }
  const curL = m.lessons.find(l => ids.includes(l.id) && !done[`${m.code}|${l.id}`]) ?? m.lessons.find(l => l.id === ids[0]) ?? firstOpen
  return { ids, cur: curL, label, custom: !!(sc?.lessons.length || sc?.quarters.length), started }
}

export function ScopeBar({ m }: { m: Manual }) {
  const sc = useScope(m); const [open, setOpen] = useState(false)
  return <>
    <button className="card row" style={{ textAlign: 'left', color: 'inherit', padding: '10px 14px' }} onClick={() => setOpen(true)} aria-label={`Practising from ${sc.label}. Change`}>
      <span className="tile" style={{ width: 36, height: 36 }}><Icon n="filter" className="s" /></span>
      <span className="grow"><span className="tiny muted" style={{ display: 'block' }}>Practising from</span><b className="small">{sc.label}</b></span>
      <span className="btn sec xs">Change</span></button>
    {open && <ScopeSheet m={m} onClose={() => setOpen(false)} />}
  </>
}

function ScopeSheet({ m, onClose }: { m: Manual; onClose: () => void }) {
  const S = useStore(); const cur = S.prefs.scope?.[m.code] ?? { quarters: [], lessons: [] }
  const [q, setQ] = useState<string[]>(cur.quarters); const [ls, setLs] = useState<string[]>(cur.lessons)
  const mode = ls.length ? 'lessons' : q.length ? 'quarters' : 'auto'
  const save = (v: PracticeScope) => { S.set({ prefs: { ...S.prefs, scope: { ...(S.prefs.scope ?? {}), [m.code]: v } } }); onClose() }
  const tog = (a: string[], x: string) => a.includes(x) ? a.filter(y => y !== x) : [...a, x]
  return <Sheet label="Practice scope" onClose={onClose}><div className="col">
    <h2>What to practise</h2><p className="small muted">Every study mode draws from this: quick-fire, repair, traps, listen, matching, flashcards and discrimination. Due review always includes everything due, and mocks keep their own scope.</p>
    <button className={`opt ${mode === 'auto' ? 'sel' : ''}`} onClick={() => { setQ([]); setLs([]) }}><span className="grow"><b className="small">Automatic</b><span className="tiny muted" style={{ display: 'block' }}>Lessons you have started. Grows as you go.</span></span></button>
    <p className="lbl mt8">Quarters</p>
    <div className="row wrap gap8">{Object.entries(m.groups).map(([k, r]) => <button key={k} className="chip btnchip" aria-pressed={q.includes(k) && !ls.length} onClick={() => { setLs([]); setQ(tog(q, k)) }}>Q{k} · L{r[0]}–{r[1]}</button>)}
      <button className="chip btnchip" aria-pressed={!ls.length && q.length === Object.keys(m.groups).length} onClick={() => { setLs([]); setQ(Object.keys(m.groups)) }}>Whole manual</button></div>
    <p className="lbl mt8">Or specific lessons</p>
    <div className="row wrap gap8" style={{ maxHeight: 220, overflow: 'auto' }}>{m.lessons.map(l => <button key={l.id} className="chip btnchip" title={niceTitle(l.title)} aria-pressed={ls.includes(l.id)} onClick={() => { setQ([]); setLs(tog(ls, l.id)) }}>L{l.n}</button>)}</div>
    <p className="hint"><Icon n="info" />Lessons you have not studied yet are fine to include: they start as new points. Strong and weak areas show up in Insights as you go.</p>
    <button className="btn block" onClick={() => save({ quarters: ls.length ? [] : q, lessons: ls })}>{mode === 'auto' ? 'Use automatic' : 'Save scope'}</button></div></Sheet>
}
