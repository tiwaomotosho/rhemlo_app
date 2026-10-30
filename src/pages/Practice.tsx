import { useEffect, useMemo, useState } from 'react'
import { buildSession, FOCUS } from '@/lib/engine'
import { manualStats, useStore } from '@/lib/store'
import type { Manual } from '@/lib/types'
import { Glim, Icon, Loading, useManualData } from '@/ui/bits'
import { useStart } from './Journey'

export default function Practice() {
  const m = useManualData()
  return m ? <Inner m={m} /> : <Loading />
}

function Inner({ m }: { m: Manual }) {
  const { cards, ladder, done, sessionSize } = useStore(); const start = useStart()
  const started = m.lessons.filter(l => done[`${m.code}|${l.id}`] || Object.keys(cards).some(k => k.startsWith(`${m.code}|${m.code}:${l.id}.`)))
  const [from, setFrom] = useState(1); const [to, setTo] = useState(Math.max(1, started[started.length - 1]?.n ?? 1))
  const [focus, setFocus] = useState<string[]>([]); const [count, setCount] = useState(sessionSize)
  const [pool, setPool] = useState<number | null>(null); const [rung, setRung] = useState(started[started.length - 1]?.id ?? 'L01')
  const lessons = useMemo(() => m.lessons.filter(l => l.n >= Math.min(from, to) && l.n <= Math.max(from, to)).map(l => l.id), [m, from, to])
  const stats = manualStats(cards, m)
  const dueLessons = [...new Set(Object.entries(cards).filter(([k, c]) => k.startsWith(m.code + '|') && c.seen > 0 && c.due <= Date.now()).map(([k]) => k.match(/:(L\d+)/)?.[1]).filter(Boolean) as string[])]

  useEffect(() => {
    setPool(null); let on = true
    const t = setTimeout(() => buildSession({ kind: 'target', manual: m.code, lessons, count: 9999, focus, title: '' }, cards, ladder).then(r => on && setPool(r.items.length)), 200)
    return () => { on = false; clearTimeout(t) }
  }, [lessons, focus]) // eslint-disable-line
  const toggle = (k: string) => setFocus(f => f.includes(k) ? f.filter(x => x !== k) : [...f, k])
  const lo = Math.min(from, to), hi = Math.max(from, to)
  const sel = (v: number, set: (n: number) => void, label: string) => <label className="grow" style={{ minWidth: 200 }}><span className="lbl">{label}</span>
    <select className="field" value={v} onChange={e => set(+e.target.value)}>{m.lessons.map(l => <option key={l.id} value={l.n}>{l.n} · {l.title.toLowerCase()}</option>)}</select></label>

  return <div className="col" style={{ gap: 18 }}>
    <div className="hero"><div><p className="eyebrow">Practice</p><h1>Train what you choose</h1></div><Glim pose="stopwatch" size={256} style={{ width: 72, height: 72 }} /></div>
    <div className="desk2"><div className="col">
      <button className="quest" disabled={!stats.due} onClick={() => start({ kind: 'review', manual: m.code, lessons: dueLessons.slice(0, 6), count: sessionSize, title: 'Due review' })}>
        <span className="q-ico"><Icon n="clock" /></span><span className="grow"><b>Due review</b><div className="small muted">{stats.due ? `${stats.due} cards are due · wrong answers return` : 'Nothing due — come back as cards mature'}</div></span><Icon n="chev" /></button>
      <button className="quest" disabled={!started.length} onClick={() => start({ kind: 'daily', manual: m.code, lessons: started.slice(-12).map(l => l.id), count: 10, title: 'Daily challenge', ranked: false })}>
        <span className="q-ico"><Icon n="bolt" /></span><span className="grow"><b>Daily challenge</b><div className="small muted">{started.length ? '10 mixed questions from lessons you’ve started · practice only until accounts open' : 'Finish a first quest to unlock'}</div></span><Icon n="chev" /></button>
      <div className="card col"><h3>Memory ladder</h3><p className="small muted">Build the verse from words, fade it to blanks, then type it whole. The full verse opens only after the first two are right.</p>
        <div className="row"><select className="field grow" value={rung} onChange={e => setRung(e.target.value)} aria-label="Lesson">{m.lessons.map(l => <option key={l.id} value={l.id}>{l.n} · {l.mv.slice(0, 40)}…</option>)}</select>
          <button className="btn sm" onClick={() => start({ kind: 'ladder', manual: m.code, lessons: [rung], count: 3, title: 'Memory ladder' })}>Climb</button></div></div>
    </div>
    <div className="card col" style={{ gap: 14 }}>
      <h3>Target practice</h3>
      <div className="row wrap">{sel(from, setFrom, 'From lesson')}{sel(to, setTo, 'To lesson')}</div>
      <div><span className="lbl">Focus (optional)</span><div className="chips">{Object.entries(FOCUS).map(([k, f]) => <button key={k} className={`pill`} aria-pressed={focus.includes(k)} onClick={() => toggle(k)} style={{ minHeight: 40, border: focus.includes(k) ? '2px solid var(--rh-action)' : '2px solid transparent', background: focus.includes(k) ? 'var(--rh-surface2)' : undefined, cursor: 'pointer' }}>{focus.includes(k) && <Icon n="check" className="" />}{f.label}</button>)}</div></div>
      <div><span className="lbl">Length</span><div className="seg">{[10, 20, 30].map(n => <button key={n} className={count === n ? 'on' : ''} onClick={() => setCount(n)}>{n}</button>)}</div></div>
      <p className="small muted" aria-live="polite">{pool === null ? 'Counting…' : `${pool.toLocaleString()} distinct question${pool === 1 ? '' : 's'} in lessons ${lo}–${hi}${focus.length ? ' for this focus' : ''}.`}{pool !== null && pool < count && pool > 0 ? ` Only ${pool} available, so the sitting will be ${pool} long.` : ''}</p>
      <button className="btn block" disabled={!pool} onClick={() => start({ kind: 'target', manual: m.code, lessons, count, focus, title: `Lessons ${lo}–${hi}${focus.length ? ' · ' + focus.map(f => FOCUS[f].label).join(', ') : ''}` })}>Start · {Math.min(count, pool ?? count)} questions</button>
    </div></div>
  </div>
}
