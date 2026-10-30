import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { dueInfo, daysUntil, niceTitle, readinessGap } from '@/lib/engine'
import { day, lessonStats, streakInfo, useStore, type SessionSpec } from '@/lib/store'
import type { LessonMeta, Manual, ManualCode } from '@/lib/types'
import { Glim, Icon, Loading, Sheet, asset, useManualData } from '@/ui/bits'

type Anchors = Record<string, { nodes_norm: [number, number][] }>
const WORLDS = [['meadow', 'The Meadow'], ['autumn', 'Harvest Hills'], ['coast', 'The Coast'], ['summit', 'The Summit']]
let anchorCache: Promise<Anchors> | null = null
const getAnchors = () => (anchorCache ??= fetch('/assets/worlds/maps/anchors.json').then(r => r.json()))

/** n points at equal arc length along the polyline (bottom = first lesson). */
const RATIO = 2.0 // the map card is taller than the square painting; the painting is cropped to its centre column
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

const verseRef = (l: LessonMeta) => l.mvp.split('”').pop()?.trim() || l.bp
const niceDate = (d: string) => d.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()).replace(/(\d)(St|Nd|Rd|Th)\b/g, (_, n, x) => n + x.toLowerCase())

function JourneyInner({ m }: { m: Manual }) {
  const { cards, done, points, activeDays, sessionSize, theme, draft, history, manual } = useStore(); const set = useStore(s => s.set)
  const start = useStart(); const nav = useNavigate()
  const [anchors, setAnchors] = useState<Anchors | null>(null); const [open, setOpen] = useState<LessonMeta | 'stage' | null>(null)
  useEffect(() => { getAnchors().then(setAnchors) }, [])
  const isDone = (l: LessonMeta) => !!done[`${m.code}|${l.id}`]
  const groups = Object.entries(m.groups).map(([q, r]) => ({ q: +q, lessons: m.lessons.filter(l => l.n >= r[0] && l.n <= r[1]) })).filter(g => g.lessons.length)
  const curIdx = Math.max(0, groups.findIndex(g => g.lessons.some(l => !isDone(l))))
  const [qi, setQi] = useState<number | null>(null); const gi = qi ?? curIdx
  const g = groups[gi] ?? groups[0]
  const cur = m.lessons.find(l => !isDone(l)) ?? m.lessons[m.lessons.length - 1]
  const banner = g.lessons.find(l => !isDone(l)) ?? g.lessons[g.lessons.length - 1]
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  const world = WORLDS[(g.q - 1) % 4], mapKey = `${world[0]}-${dark ? 'night' : 'day'}`
  const pos = useMemo(() => anchors ? spread(anchors[mapKey].nodes_norm, g.lessons.length + 1) : [], [anchors, mapKey, g])
  const allDone = g.lessons.every(isDone)
  const { streak } = streakInfo(activeDays)
  const due = dueInfo(cards, m.code)
  const q1 = m.stages[0], fin = m.stages[1]
  const gap = readinessGap(m, q1.lessons, cards), gapF = readinessGap(m, fin.lessons, cards)
  const qStats = lessonStats(cards, m, cur.id)
  const today = day(); const sitToday = history.filter(h => day(h.at) === today)
  const qsToday = sitToday.reduce((a, h) => a + h.total, 0), ladderToday = sitToday.filter(h => h.kind === 'ladder').length
  const reviewSpec: SessionSpec = { kind: 'review', manual: m.code, lessons: due.lessons.slice(0, 6), count: sessionSize, title: 'Due review' }
  const quests = [
    { ico: 'bolt', t: 'Return to due items', sub: due.count ? `${due.count} ready` : 'All caught up', p: due.count ? 0 : 1, tag: due.count ? '' : 'Done', go: () => due.count && start(reviewSpec) },
    { ico: 'journey', t: 'Complete one meaningful sitting', sub: `${sessionSize} questions`, p: Math.min(1, qsToday / sessionSize), tag: `${Math.min(qsToday, sessionSize)}/${sessionSize}`, go: () => start({ kind: 'quest', manual: m.code, lessons: [cur.id], count: sessionSize, title: `Lesson ${cur.n} · ${cur.title}` }) },
    { ico: 'star', t: 'Climb a memory ladder rung', sub: `Lesson ${cur.n} · ${verseRef(cur)}`, p: Math.min(1, ladderToday), tag: `${Math.min(ladderToday, 1)}/1`, go: () => start({ kind: 'ladder', manual: m.code, lessons: [cur.id], count: 3, title: `Memory ladder · ${verseRef(cur)}` }) },
  ]

  return <div className="col" style={{ gap: 16 }}>
    <div className="hero">
      <label className="pill" style={{ minHeight: 44, padding: '0 12px', background: 'var(--rh-surface)', border: '1.5px solid var(--rh-line2)' }}><Icon n="book" />
        <select aria-label="Manual" value={manual} onChange={e => set({ manual: e.target.value as ManualCode })} style={{ font: 'inherit', background: 'transparent', color: 'inherit', border: 0, appearance: 'none', paddingRight: 4 }}>
          <option value="AD2627">Adult 2026–27</option><option value="EN2627">Entry 2026–27</option></select><span aria-hidden>▾</span></label>
      <div className="chips"><span className="pill warn"><Icon n="flame" />{streak}</span><span className="pill gold"><Icon n="star" />{points.toLocaleString()}</span></div>
    </div>

    <div className="desk2">
      <div>
        <button className="banner" style={{ width: '100%', border: 0, textAlign: 'left', color: 'inherit' }} onClick={() => setOpen(banner)}>
          <div><p className="eyebrow">Quarter {g.q} · Chapter {g.lessons.indexOf(banner) + 1} of {g.lessons.length}</p><h2>{niceTitle(banner.title)}</h2>
            <p className="small" style={{ opacity: .9 }}>{niceDate(banner.date)} · Memory verse {verseRef(banner)}</p></div>
          <span className="iconbtn" style={{ background: 'rgba(255,255,255,.2)', color: '#fff' }}><Icon n="book" /></span></button>
        <div className="mapwrap" style={{ aspectRatio: `1 / ${RATIO}` }}>
          <img className="map" style={{ width: `${RATIO * 100}%`, left: `${(1 - RATIO) * 50}%` }} alt={`Painted map of ${world[1]}`} src={asset(`worlds/maps/${mapKey}/${mapKey}-800.webp`)} srcSet={`${asset(`worlds/maps/${mapKey}/${mapKey}-480.webp`)} 480w, ${asset(`worlds/maps/${mapKey}/${mapKey}-800.webp`)} 800w, ${asset(`worlds/maps/${mapKey}/${mapKey}-1254.webp`)} 1254w`} sizes="(max-width:760px) 100vw, 640px" />
          <div className="qpick" role="group" aria-label="Quarter">{groups.map((x, i) => <button key={x.q} aria-pressed={i === gi} className={i === gi ? 'on' : ''} onClick={() => setQi(i)}>Q{x.q}</button>)}</div>
          {g.lessons.map((l, i) => {
            const p = pos[i]; if (!p) return null
            const prevDone = i === 0 ? (gi === 0 || groups[gi - 1].lessons.every(isDone)) : isDone(g.lessons[i - 1])
            const d = isDone(l), isCur = !d && prevDone && l.id === (g.lessons.find(x => !isDone(x))?.id)
            const rev = d && lessonStats(cards, m, l.id).due > 0
            const cls = d ? (rev ? 'review' : 'done') : isCur ? 'current' : ''
            return <div key={l.id}>
              <button className={`node ${cls}`} style={{ left: `${p[0] * 100}%`, top: `${p[1] * 100}%` }} onClick={() => setOpen(l)} aria-label={`Lesson ${l.n}, ${l.title}, ${d ? (rev ? 'review due' : 'done') : isCur ? 'current' : prevDone ? 'next' : 'locked'}`}>
                {d && !rev ? <Icon n="check" /> : isCur ? <Icon n="star" /> : !prevDone ? <Icon n="lock" /> : l.n}
              </button>
              {isCur && <button className="nlabel go" style={{ left: `${p[0] > .55 ? p[0] * 100 - 20 : p[0] * 100 + 20}%`, top: `${p[1] * 100 + 6}%`, pointerEvents: 'auto', border: '1.5px solid var(--rh-line2)', minHeight: 36 }} onClick={() => start({ kind: 'quest', manual: m.code, lessons: [l.id], count: sessionSize, title: `Lesson ${l.n} · ${l.title}` })}>Continue quest</button>}
              {isCur && <Glim pose="point" size={84} className="mapglim" style={{ left: `${p[0] > 0.55 ? p[0] * 100 - 17 : p[0] * 100 + 17}%`, top: `${p[1] * 100 - 2}%` }} />}
            </div>
          })}
          {pos[g.lessons.length] && <button className={`node stage ${allDone ? '' : 'locked'}`} style={{ left: `${pos[g.lessons.length][0] * 100}%`, top: `${pos[g.lessons.length][1] * 100}%` }} onClick={() => setOpen('stage')} aria-label={`Quarter ${g.q} check${allDone ? '' : ', locked'}`}><Icon n={allDone ? 'gift' : 'lock'} /></button>}
        </div>

        <div className="dock"><div className="card glass">
          {due.count ? <>
            <span className="q-ico" style={{ width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'var(--rh-apricot-bg)', color: 'var(--rh-apricot-deep)' }}><Icon n="clock" /></span>
            <div className="grow"><b>{due.count} point{due.count === 1 ? '' : 's'} to revisit</b><div className="small muted">Due review · {due.range} · {due.minutes} min</div></div>
            <button className="btn sm" onClick={() => start(reviewSpec)}>Review</button></> :
            <><Glim pose="clap" size={256} style={{ width: 48, height: 48 }} /><div className="grow"><b>Nothing due right now</b><div className="small muted">Reviews appear here as your points come due.</div></div></>}
        </div></div>
      </div>

      <div className="col">
        <div className="card tint col" style={{ gap: 10 }}>
          <div className="row"><Icon n="clock" /><div className="grow"><p className="eyebrow">Countdown</p><b>Quarter 1 test · {new Date(q1.date + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</b></div><span className="pill">{Math.max(0, daysUntil(q1.date))} days</span></div>
          <div className="bar"><i className="s" style={{ width: `${Math.min(100, gap.readiness / 0.95 * 100)}%` }} /></div>
          <p className="small muted">Readiness {Math.round(gap.readiness * 100)}% of the 95% target — {Math.round(gap.gap * 100)} points to go.</p>
          <div className="row small muted"><span>Finale · 1 Jul 2027</span><span className="grow" style={{ textAlign: 'right' }}>{Math.max(0, daysUntil(fin.date))} days · {Math.round(gapF.readiness * 100)}% ready</span></div>
        </div>

        <div className="card dq col">
          <div className="row"><Glim pose="idle" size={256} style={{ width: 56, height: 56 }} /><div><p className="eyebrow">Daily quests</p><h2>One small quest.</h2></div></div>
          {quests.map(q => <button key={q.t} className="dq-row" onClick={q.go}>
            <span className="q-ico"><Icon n={q.ico} /></span><span className="grow"><span className="row" style={{ justifyContent: 'space-between' }}><b>{q.t}</b><span className="small muted">{q.tag}</span></span><span className="small muted">{q.sub}</span>
              <span className="bar" style={{ height: 6, marginTop: 6 }}><i className="s" style={{ width: `${q.p * 100}%` }} /></span></span></button>)}
          <p className="small muted">Quests reward useful learning only. Opening screens earns nothing.</p>
        </div>
        {draft && <button className="btn ghost block" onClick={() => nav('/session')}>Resume “{draft.spec.title}” · {draft.index} of {draft.queue.length}</button>}
        <p className="small muted">Lesson {cur.n} is {qStats.readiness ? Math.round(qStats.readiness * 100) + '% secure' : 'new'}. <Link to="/library">Read the manual</Link></p>
      </div>
    </div>

    {open && open !== 'stage' && <ChapterSheet m={m} l={open} unlocked={open.n === 1 || isDone(open) || m.lessons.filter(x => x.n < open.n).every(isDone) || open.id === cur.id} onClose={() => setOpen(null)} />}
    {open === 'stage' && <Sheet label="Quarter check" onClose={() => setOpen(null)}>
      <div className="col"><div className="row"><Glim pose="trophy" size={256} style={{ width: 84, height: 84 }} /><div><p className="eyebrow">Quarter {g.q}</p><h2>Quarter check</h2></div></div>
        {allDone ? <><p>A mixed check across all {g.lessons.length} lessons. Marking is exactly the same as everywhere else.</p>
          <button className="btn block" onClick={() => start({ kind: 'target', manual: m.code, lessons: g.lessons.map(x => x.id), count: 30, title: `Quarter ${g.q} check` })}>Start 30 questions</button></> :
          <p className="muted">Clear every lesson in this quarter to open the check. You can still practise any lesson you have started from Practice.</p>}</div></Sheet>}
  </div>
}

function Row({ ico, t, sub, state, onClick }: { ico: string; t: string; sub: string; state: 'next' | 'done' | 'lock' | 'open'; onClick?: () => void }) {
  return <button className="sheetrow" disabled={state === 'lock'} onClick={onClick}>
    <span className="q-ico"><Icon n={ico} /></span><span className="grow"><b>{t}</b><span className="small muted" style={{ display: 'block' }}>{sub}</span></span>
    {state === 'next' && <span className="pill" style={{ background: 'var(--rh-raised)', color: 'var(--rh-action)' }}>Next</span>}
    {state === 'done' && <Icon n="check" className="" />}{state === 'lock' && <Icon n="lock" />}{state === 'open' && <Icon n="chev" />}
  </button>
}

function ChapterSheet({ m, l, unlocked, onClose }: { m: Manual; l: LessonMeta; unlocked: boolean; onClose: () => void }) {
  const { cards, ladder, done, sessionSize } = useStore(); const start = useStart(); const nav = useNavigate()
  const st = lessonStats(cards, m, l.id); const lad = ladder[`${m.code}|${l.id}`] ?? {}
  const seen = Object.entries(cards).filter(([k, c]) => k.startsWith(`${m.code}|${m.code}:${l.id}.`) && c.seen > 0).length
  const isDone = !!done[`${m.code}|${l.id}`]
  const go = (spec: SessionSpec) => { onClose(); start(spec) }
  return <Sheet label={`Lesson ${l.n}`} onClose={onClose}>
    <div className="col" style={{ gap: 10 }}>
      <p className="eyebrow">Chapter {l.n} · {niceDate(l.date)}</p><h2>{niceTitle(l.title)}</h2>
      <p className="small muted">Memory verse · {verseRef(l)} · Bible passage · {l.bp}</p>
      <Row ico="book" t="Learn" sub="Read the lesson" state="open" onClick={() => { onClose(); nav(`/read/${l.id}`) }} />
      <Row ico="star" t="Recall" sub={`${seen} of ${l.ic} questions`} state={!unlocked ? 'lock' : isDone ? 'done' : 'next'} onClick={() => go({ kind: 'quest', manual: m.code, lessons: [l.id], count: sessionSize, title: `Lesson ${l.n} · ${niceTitle(l.title)}` })} />
      <Row ico="clock" t="Review" sub={seen ? (st.due ? `${st.due} due` : 'Nothing due yet') : 'Unlocks after Recall'} state={!seen ? 'lock' : st.due ? 'open' : 'done'} onClick={() => st.due && go({ kind: 'review', manual: m.code, lessons: [l.id], count: sessionSize, title: `Review · Lesson ${l.n}` })} />
      <Row ico="gift" t="Check" sub="Lesson mastery check" state={isDone ? 'open' : 'lock'} onClick={() => go({ kind: 'target', manual: m.code, lessons: [l.id], count: 20, title: `Check · Lesson ${l.n}` })} />
      <p className="small muted">Memory ladder: {lad.q27 ? '✓' : '○'} build · {lad.q28 ? '✓' : '○'} fade · {lad.q04 ? '✓' : '○'} full verse.</p>
      {unlocked ? <>
        <button className="btn block" onClick={() => go({ kind: 'quest', manual: m.code, lessons: [l.id], count: sessionSize, title: `Lesson ${l.n} · ${niceTitle(l.title)}` })}>Start {sessionSize} questions</button>
        <div className="row"><button className="btn ghost grow" onClick={() => go({ kind: 'ladder', manual: m.code, lessons: [l.id], count: 3, title: `Memory ladder · Lesson ${l.n}` })}>Memory ladder</button>
          <button className="btn quiet grow" onClick={() => { onClose(); nav(`/read/${l.id}`) }}>Read the lesson first</button></div></> :
        <><p className="muted">Finish the previous lesson to open this quest. Reading is always open.</p><button className="btn ghost block" onClick={() => { onClose(); nav(`/read/${l.id}`) }}>Read lesson {l.n}</button></>}
    </div></Sheet>
}
