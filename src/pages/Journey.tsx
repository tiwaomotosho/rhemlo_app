import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { daysUntil, readinessGap } from '@/lib/engine'
import { lessonStats, manualStats, streakInfo, useStore, type SessionSpec } from '@/lib/store'
import type { LessonMeta, Manual } from '@/lib/types'
import { Glim, Icon, Loading, Sheet, Segments, asset, useManualData } from '@/ui/bits'

type Anchors = Record<string, { nodes_norm: [number, number][] }>
const WORLDS = [['meadow', 'The Meadow'], ['autumn', 'Harvest Hills'], ['coast', 'The Coast'], ['summit', 'The Summit']]
let anchorCache: Promise<Anchors> | null = null
const getAnchors = () => (anchorCache ??= fetch('/assets/worlds/maps/anchors.json').then(r => r.json()))

/** n points at equal arc length along the polyline (bottom = first lesson). */
const RATIO = 1.7 // the map card is taller than the square painting; the painting is cropped to its centre column
function spread(src: [number, number][], n: number) {
  const pts = src.map(([x, y]) => [RATIO * x - (RATIO - 1) / 2, y] as [number, number])
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], (p[1] - pts[i][1]) * RATIO)), total = seg.reduce((a, b) => a + b, 0)
  return Array.from({ length: n }, (_, k) => {
    let d = n === 1 ? 0 : (k / (n - 1)) * total, i = 0
    while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++ }
    const t = seg[i] ? Math.min(1, d / seg[i]) : 0
    return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t] as [number, number]
  })
}

export function useStart() {
  const nav = useNavigate()
  return (spec: SessionSpec) => nav('/session', { state: { spec } })
}

export default function Journey() {
  const m = useManualData()
  if (!m) return <Loading text="Opening your map…" />
  return <JourneyInner m={m} />
}

function JourneyInner({ m }: { m: Manual }) {
  const { cards, done, profile, points, activeDays, sessionSize, theme, draft, ladder } = useStore()
  const start = useStart(); const nav = useNavigate()
  const [anchors, setAnchors] = useState<Anchors | null>(null); const [open, setOpen] = useState<LessonMeta | 'stage' | null>(null)
  useEffect(() => { getAnchors().then(setAnchors) }, [])
  const isDone = (l: LessonMeta) => !!done[`${m.code}|${l.id}`]
  const groups = Object.entries(m.groups).map(([q, r]) => ({ q: +q, lessons: m.lessons.filter(l => l.n >= r[0] && l.n <= r[1]) })).filter(g => g.lessons.length)
  const curIdx = Math.max(0, groups.findIndex(g => g.lessons.some(l => !isDone(l))))
  const [qi, setQi] = useState<number | null>(null); const gi = qi ?? curIdx
  const g = groups[gi] ?? groups[0]
  const cur = m.lessons.find(l => !isDone(l)) ?? m.lessons[m.lessons.length - 1]
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  const world = WORLDS[(g.q - 1) % 4], mapKey = `${world[0]}-${dark ? 'night' : 'day'}`
  const pos = useMemo(() => anchors ? spread(anchors[mapKey].nodes_norm, g.lessons.length + 1) : [], [anchors, mapKey, g])
  const allDone = g.lessons.every(isDone)
  const { streak, today } = streakInfo(activeDays)
  const stats = manualStats(cards, m)
  const q1 = m.stages[0], fin = m.stages[1]
  const gap = readinessGap(m, q1.lessons, cards), gapF = readinessGap(m, fin.lessons, cards)
  const dueLessons = [...new Set(Object.entries(cards).filter(([k, c]) => k.startsWith(m.code + '|') && c.seen > 0 && c.due <= Date.now()).map(([k]) => k.match(/:(L\d+)/)?.[1]).filter(Boolean) as string[])]
  const qStats = lessonStats(cards, m, cur.id)

  return <div className="col" style={{ gap: 18 }}>
    <div className="hero">
      <div><p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>Hello, {profile.name || 'Friend'}</h1></div>
      <div className="chips"><span className={`pill ${today ? 'warn' : ''}`}><Icon n="flame" className="" />{streak} day{streak === 1 ? '' : 's'}</span><span className="pill gold"><Icon n="star" />{points} XP</span></div>
    </div>

    <div className="desk2">
      <div>
        <div className="banner"><div><p className="eyebrow">Quarter {g.q} · {world[1]}</p><h2>Lessons {g.lessons[0].n}–{g.lessons[g.lessons.length - 1].n}</h2></div>
          <div className="row" style={{ gap: 4 }}>
            <button className="iconbtn" style={{ color: '#fff' }} aria-label="Previous quarter" disabled={gi === 0} onClick={() => setQi(gi - 1)}><Icon n="back" /></button>
            <button className="iconbtn" style={{ color: '#fff' }} aria-label="Next quarter" disabled={gi >= groups.length - 1} onClick={() => setQi(gi + 1)}><Icon n="chev" /></button></div></div>
        <div className="mapwrap" style={{ aspectRatio: `1 / ${RATIO}` }}>
          <img className="map" style={{ width: `${RATIO * 100}%`, left: `${(1 - RATIO) * 50}%` }} alt={`Painted map of ${world[1]}`} src={asset(`worlds/maps/${mapKey}/${mapKey}-800.webp`)} srcSet={`${asset(`worlds/maps/${mapKey}/${mapKey}-480.webp`)} 480w, ${asset(`worlds/maps/${mapKey}/${mapKey}-800.webp`)} 800w, ${asset(`worlds/maps/${mapKey}/${mapKey}-1254.webp`)} 1254w`} sizes="(max-width:760px) 100vw, 640px" />
          {g.lessons.map((l, i) => {
            const p = pos[i]; if (!p) return null
            const prevDone = i === 0 ? (gi === 0 || groups[gi - 1].lessons.every(isDone)) : isDone(g.lessons[i - 1])
            const d = isDone(l), isCur = !d && prevDone && l.id === (g.lessons.find(x => !isDone(x))?.id)
            const due = d && lessonStats(cards, m, l.id).due > 0
            const cls = d ? (due ? 'review' : 'done') : isCur ? 'current' : ''
            return <div key={l.id}>
              <button className={`node ${cls}`} style={{ left: `${p[0] * 100}%`, top: `${p[1] * 100}%` }} onClick={() => setOpen(l)} aria-label={`Lesson ${l.n}, ${l.title}, ${d ? (due ? 'review due' : 'done') : isCur ? 'current' : prevDone ? 'next' : 'locked'}`}>
                {d && !due ? <Icon n="check" /> : isCur ? <Icon n="star" /> : !prevDone ? <Icon n="lock" /> : l.n}
              </button>
              {isCur && <span className="nlabel" style={{ left: `${p[0] * 100}%`, top: `${p[1] * 100}%` }}>Lesson {l.n}</span>}
              {isCur && <Glim pose="point" size={256} className="mapglim" style={{ left: `${p[0] > 0.55 ? p[0] * 100 - 17 : p[0] * 100 + 17}%`, top: `${p[1] * 100 + 2}%` }} />}
            </div>
          })}
          {pos[g.lessons.length] && <button className={`node stage ${allDone ? '' : 'locked'}`} style={{ left: `${pos[g.lessons.length][0] * 100}%`, top: `${pos[g.lessons.length][1] * 100}%` }} onClick={() => setOpen('stage')} aria-label={`Quarter ${g.q} check${allDone ? '' : ', locked'}`}><Icon n={allDone ? 'gift' : 'lock'} /></button>}
        </div>

        <div className="dock"><div className="card glass">
          {dueLessons.length ? <>
            <Glim pose="stopwatch" size={256} style={{ width: 48, height: 48 }} />
            <div className="grow"><b>{stats.due} card{stats.due === 1 ? '' : 's'} due for review</b><div className="small muted">About {Math.max(2, Math.round(Math.min(stats.due, sessionSize) * 0.4))} min · wrong answers come back</div></div>
            <button className="btn sm" onClick={() => start({ kind: 'review', manual: m.code, lessons: dueLessons.slice(0, 6), count: sessionSize, title: 'Due review' })}>Review</button></> :
            <><Glim pose="clap" size={256} style={{ width: 48, height: 48 }} /><div className="grow"><b>Nothing due right now</b><div className="small muted">Reviews appear here as your cards come due.</div></div></>}
        </div></div>
      </div>

      <div className="col">
        <div className="card tint col" style={{ gap: 10 }}>
          <div className="row"><Icon n="clock" /><div className="grow"><p className="eyebrow">Countdown</p><b>Quarter 1 test · {new Date(q1.date + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</b></div><span className="pill">{Math.max(0, daysUntil(q1.date))} days</span></div>
          <div className="bar"><i className="s" style={{ width: `${Math.min(100, gap.readiness / 0.95 * 100)}%` }} /></div>
          <p className="small muted">Readiness {Math.round(gap.readiness * 100)}% of the 95% target — {Math.round(gap.gap * 100)} points to go.</p>
          <div className="row small muted"><span>Finale · 1 Jul 2027</span><span className="grow" style={{ textAlign: 'right' }}>{Math.max(0, daysUntil(fin.date))} days · {Math.round(gapF.readiness * 100)}% ready</span></div>
        </div>

        <h3>Today's quests</h3>
        <div className="list">
          <button className="quest" onClick={() => start({ kind: 'quest', manual: m.code, lessons: [cur.id], count: sessionSize, title: `Lesson ${cur.n} · ${cur.title}` })}>
            <span className="q-ico"><Icon n="journey" /></span><span className="grow"><b>Continue Lesson {cur.n}</b><div className="small muted">{sessionSize} questions · {qStats.readiness ? Math.round(qStats.readiness * 100) + '% secure' : 'new'}</div></span><Icon n="chev" /></button>
          <button className="quest" onClick={() => start({ kind: 'ladder', manual: m.code, lessons: [cur.id], count: 3, title: `Memory ladder · ${cur.mvp.split('”').pop()?.trim() || cur.bp}` })}>
            <span className="q-ico"><Icon n="star" /></span><span className="grow"><b>Memory verse ladder</b><div className="small muted">Build it, fade it, then say it · {ladder[`${m.code}|${cur.id}`]?.q04 ? 'complete' : 'about 3 min'}</div></span><Icon n="chev" /></button>
          <button className="quest" disabled={!dueLessons.length} onClick={() => start({ kind: 'review', manual: m.code, lessons: dueLessons.slice(0, 6), count: sessionSize, title: 'Due review' })}>
            <span className="q-ico"><Icon n="bolt" /></span><span className="grow"><b>Clear your reviews</b><div className="small muted">{stats.due ? `${stats.due} due` : 'All caught up'}</div></span><Icon n="chev" /></button>
        </div>
        {draft && <button className="btn ghost block" onClick={() => nav('/session')}>Resume “{draft.spec.title}” · {draft.index} of {draft.queue.length}</button>}
        <Link to="/library" className="btn ghost block">Read the manual</Link>
      </div>
    </div>

    {open && open !== 'stage' && <ChapterSheet m={m} l={open} unlocked={open.n === 1 || isDone(open) || m.lessons.filter(x => x.n < open.n).every(isDone) || open.id === cur.id} onClose={() => setOpen(null)} />}
    {open === 'stage' && <Sheet label="Quarter check" onClose={() => setOpen(null)}>
      <div className="col"><div className="row"><Glim pose="trophy" size={256} style={{ width: 84, height: 84 }} /><div><p className="eyebrow">Quarter {g.q}</p><h2>Quarter check</h2></div></div>
        {allDone ? <><p>A mixed check across all {g.lessons.length} lessons. Marking is exactly the same as everywhere else.</p>
          <button className="btn block" onClick={() => start({ kind: 'target', manual: m.code, lessons: g.lessons.map(x => x.id), count: 30, title: `Quarter ${g.q} check` })}>Start · 30 questions</button></> :
          <p className="muted">Clear every lesson in this quarter to open the check. You can still practise any lesson you have started from Practice.</p>}</div></Sheet>}
  </div>
}

function ChapterSheet({ m, l, unlocked, onClose }: { m: Manual; l: LessonMeta; unlocked: boolean; onClose: () => void }) {
  const { cards, ladder, sessionSize } = useStore(); const start = useStart(); const nav = useNavigate()
  const st = lessonStats(cards, m, l.id); const lad = ladder[`${m.code}|${l.id}`] ?? {}
  return <Sheet label={`Lesson ${l.n}`} onClose={onClose}>
    <div className="col">
      <p className="eyebrow">Lesson {l.n} · {l.date.toLowerCase()}</p><h2>{l.title}</h2>
      <div className="mv"><p className="eyebrow">Memory verse</p><q>{l.mvp}</q></div>
      <div><p className="eyebrow">Outline</p><ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>{l.outline.map(o => <li key={o}>{o}</li>)}</ol></div>
      <Segments s={st.secure} t={st.strengthening} l={st.learning} total={st.total} />
      <p className="small muted">Ladder: {lad.q27 ? '✓' : '○'} build · {lad.q28 ? '✓' : '○'} fade · {lad.q04 ? '✓' : '○'} full verse — the full verse opens after build and fade are right.</p>
      {unlocked ? <>
        <button className="btn block" onClick={() => { onClose(); start({ kind: 'quest', manual: m.code, lessons: [l.id], count: sessionSize, title: `Lesson ${l.n} · ${l.title}` }) }}>Start quest · {sessionSize}</button>
        <div className="row"><button className="btn ghost grow" onClick={() => { onClose(); start({ kind: 'ladder', manual: m.code, lessons: [l.id], count: 3, title: `Memory ladder · Lesson ${l.n}` }) }}>Memory ladder</button>
          <button className="btn ghost grow" onClick={() => { onClose(); nav(`/read/${l.id}`) }}>Read</button></div></> :
        <><p className="muted">Finish the lesson before this one to open its quest. Reading is always open.</p><button className="btn ghost block" onClick={() => { onClose(); nav(`/read/${l.id}`) }}>Read lesson {l.n}</button></>}
    </div></Sheet>
}
