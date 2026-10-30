import { useEffect, useState } from 'react'
import { buildSession, dueInfo, FOCUS, weakAreas } from '@/lib/engine'
import { streakInfo, useStore } from '@/lib/store'
import type { Manual } from '@/lib/types'
import { Glim, Icon, Loading, Sheet, useManualData } from '@/ui/bits'
import { useStart } from './Journey'

const FOCUS_ICON: Record<string, string> = { verses: 'book', outlines: 'journey', references: 'star', sentences: 'info', spelling: 'check', listening: 'speaker' }

export default function Practice() {
  const m = useManualData()
  return m ? <Inner m={m} /> : <Loading />
}

function Inner({ m }: { m: Manual }) {
  const { cards, done, points, activeDays, sessionSize } = useStore(); const start = useStart()
  const [view, setView] = useState<'hub' | 'build'>('hub'); const [ladder, setLadder] = useState(false)
  const due = dueInfo(cards, m.code), { streak } = streakInfo(activeDays)
  const weak = weakAreas(cards, m.code).slice(0, 3)
  const started = m.lessons.filter(l => done[`${m.code}|${l.id}`] || Object.keys(cards).some(k => k.startsWith(`${m.code}|${m.code}:${l.id}.`)))
  if (view === 'build') return <Build m={m} onBack={() => setView('hub')} initial={started[started.length - 1]?.id ?? 'L01'} />
  const review = () => start({ kind: 'review', manual: m.code, lessons: due.lessons.slice(0, 6), count: sessionSize, title: 'Due review' })

  return <div className="col" style={{ gap: 18 }}>
    <div className="hero"><h1>Practice</h1><div className="chips"><span className="pill warn"><Icon n="flame" />{streak}</span><span className="pill gold"><Icon n="star" />{points.toLocaleString()}</span></div></div>
    <div className="desk2"><div className="col">
      <div className="card duecard row" style={{ gap: 14, alignItems: 'center' }}>
        <Glim pose={due.count ? 'stopwatch' : 'clap'} size={256} style={{ width: 84, height: 84 }} />
        <div className="grow col" style={{ gap: 4 }}><p className="eyebrow" style={{ color: 'var(--rh-apricot-deep)' }}>Due review</p>
          <h2>{due.count ? 'Bring it back into focus.' : 'All caught up.'}</h2>
          <p className="small muted">{due.count ? `${due.count} point${due.count === 1 ? '' : 's'} · ${due.range} · about ${due.minutes} min` : 'Reviews appear as your points come due.'}</p></div>
      </div>
      {due.count > 0 && <button className="btn block apricot" onClick={review}>Review {due.count} point{due.count === 1 ? '' : 's'}</button>}
      <div className="row" style={{ alignItems: 'stretch' }}>
        <button className="card tile2" onClick={() => setView('build')}><span className="q-ico"><Icon n="practice" /></span><b>Target practice</b><span className="small muted">Lessons, formats, 5–100</span></button>
        <button className="card tile2" onClick={() => setLadder(true)}><span className="q-ico" style={{ background: 'var(--rh-pistachio-bg)', color: 'var(--rh-pistachio-deep)' }}><Icon n="star" /></span><b>Memory ladder</b><span className="small muted">Build · Fade · Full recall</span></button>
      </div>
      <button className="quest" disabled={!started.length} onClick={() => start({ kind: 'daily', manual: m.code, lessons: started.slice(-12).map(l => l.id), count: 10, title: 'Daily challenge', ranked: false })}>
        <span className="q-ico"><Icon n="bolt" /></span><span className="grow"><b>Daily challenge</b><div className="small muted">{started.length ? '10 mixed questions · practice only until accounts open' : 'Finish a first quest to unlock'}</div></span><Icon n="chev" /></button>
    </div>
    <div className="col"><p className="eyebrow">Weak spots</p>
      {weak.length ? <div className="card list" style={{ padding: 4 }}>{weak.map(w => <button key={w.lesson} className="sheetrow" onClick={() => start({ kind: 'target', manual: m.code, lessons: [w.lesson], count: sessionSize, title: `Weak spot · Lesson ${w.n}` })}>
        <span className="q-ico" style={{ background: 'var(--rh-incorrect-bg)', color: 'var(--rh-incorrect)' }}><Icon n="target" /></span><span className="grow"><b>Lesson {w.n} · {m.lessons.find(l => l.id === w.lesson)?.title.toLowerCase()}</b><span className="small muted" style={{ display: 'block' }}>{Math.round(w.acc * 100)}% right · {w.seen} answers</span></span><Icon n="chev" /></button>)}</div>
        : <div className="card"><p className="small muted">Weak spots appear once you have a few answers in a lesson. They're measured from your own answers, never guessed.</p></div>}
    </div></div>
    {ladder && <LadderSheet m={m} initial={started[started.length - 1]?.id ?? 'L01'} onClose={() => setLadder(false)} />}
  </div>
}

function LadderSheet({ m, initial, onClose }: { m: Manual; initial: string; onClose: () => void }) {
  const [id, setId] = useState(initial); const start = useStart(); const lad = useStore(s => s.ladder[`${m.code}|${id}`]) ?? {}
  return <Sheet label="Memory ladder" onClose={onClose}><div className="col">
    <h2>Memory ladder</h2><p className="small muted">Build the verse from words, fade it to blanks, then type it whole. The full verse opens only after the first two are right.</p>
    <select className="field" value={id} onChange={e => setId(e.target.value)} aria-label="Lesson">{m.lessons.map(l => <option key={l.id} value={l.id}>{l.n} · {l.mv.slice(0, 44)}…</option>)}</select>
    <p className="small">{lad.q27 ? '✓' : '○'} Build · {lad.q28 ? '✓' : '○'} Fade · {lad.q04 ? '✓' : '○'} Full verse</p>
    <button className="btn block" onClick={() => { onClose(); start({ kind: 'ladder', manual: m.code, lessons: [id], count: 3, title: 'Memory ladder' }) }}>Climb</button></div></Sheet>
}

function Build({ m, onBack, initial }: { m: Manual; onBack: () => void; initial: string }) {
  const { cards, ladder, sessionSize } = useStore(); const start = useStart()
  const [sel, setSel] = useState<string[]>([initial]); const [focus, setFocus] = useState<string[]>([]); const [count, setCount] = useState(Math.max(5, sessionSize))
  const [pool, setPool] = useState<number | null>(null)
  const lessons = m.lessons.filter(l => sel.includes(l.id)).map(l => l.id)
  useEffect(() => {
    if (!lessons.length) { setPool(0); return }
    setPool(null); let on = true
    const t = setTimeout(() => buildSession({ kind: 'target', manual: m.code, lessons, count: 9999, focus, title: '' }, cards, ladder).then(r => on && setPool(r.items.length)), 200)
    return () => { on = false; clearTimeout(t) }
  }, [sel.join(), focus.join()]) // eslint-disable-line
  const tog = (arr: string[], set: (a: string[]) => void, k: string) => set(arr.includes(k) ? arr.filter(x => x !== k) : [...arr, k])
  const n = Math.min(count, pool ?? count)
  return <div className="col" style={{ gap: 16 }}>
    <div className="row"><button className="iconbtn" aria-label="Back" onClick={onBack}><Icon n="back" /></button><h2 className="grow center">Target practice</h2><span style={{ width: 48 }} /></div>
    <div><p className="eyebrow" style={{ marginBottom: 8 }}>Lessons</p><div className="chips">{m.lessons.map(l => <button key={l.id} className="chip" aria-pressed={sel.includes(l.id)} onClick={() => tog(sel, setSel, l.id)}>L{l.n}</button>)}</div>
      <div className="row" style={{ marginTop: 6 }}><button className="btn quiet sm" onClick={() => setSel(m.lessons.map(l => l.id))}>All</button><button className="btn quiet sm" onClick={() => setSel([])}>None</button></div></div>
    <div><p className="eyebrow" style={{ marginBottom: 8 }}>Focus</p><div className="chips">{Object.entries(FOCUS).map(([k, f]) => <button key={k} className="chip" aria-pressed={focus.includes(k)} onClick={() => tog(focus, setFocus, k)}><Icon n={FOCUS_ICON[k]} />{f.label}</button>)}</div></div>
    <div><div className="row" style={{ justifyContent: 'space-between' }}><label className="eyebrow" htmlFor="cnt">Question count</label><b style={{ fontSize: 28, color: 'var(--rh-action)' }}>{count}</b></div>
      <input id="cnt" className="slider" type="range" min={5} max={100} step={5} value={count} onChange={e => setCount(+e.target.value)} aria-valuetext={`${count} questions`} />
      <div className="row small muted" style={{ justifyContent: 'space-between' }}><span>5</span><span>100</span></div></div>
    <div className="card tint row"><Icon n="lock" /><div><b>Private practice · works offline</b><div className="small muted">Marked on this device. Not ranked.</div></div></div>
    <div className="card row" aria-live="polite"><Icon n="check" /><p className="small">{pool === null ? 'Counting eligible questions…' : pool === 0 ? 'Nothing matches yet. Pick a lesson or loosen the focus.' : pool >= count ? `${pool.toLocaleString()} eligible questions match. All ${count} will be unique.` : `Only ${pool.toLocaleString()} eligible question${pool === 1 ? '' : 's'} match, so this sitting will be ${pool} long. None repeat.`}</p></div>
    <button className="btn block" disabled={!pool} onClick={() => start({ kind: 'target', manual: m.code, lessons, count, focus, title: `Target · ${lessons.length} lesson${lessons.length === 1 ? '' : 's'}${focus.length ? ' · ' + focus.map(f => FOCUS[f].label).join(', ') : ''}` })}>Start {n} question{n === 1 ? '' : 's'}</button>
  </div>
}
