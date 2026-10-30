import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { categoryOf, daysUntil, dueInfo, lessonDate, niceTitle, readinessGap, shortDate, weekLesson, type Category } from '@/lib/engine'
import { loadItems, loadLesson, readPassage } from '@/lib/data'
import { day, lessonStats, masteryOf, streakInfo, useStore, type SessionSpec } from '@/lib/store'
import type { LessonMeta, Manual, ManualCode } from '@/lib/types'
import { BackBar, Glim, Icon, Loading, Sheet, StatPills, asset, useManualData } from '@/ui/bits'

type Anchors = Record<string, { nodes_norm: [number, number][] }>
const WORLDS = [['meadow', 'The Meadow'], ['autumn', 'Harvest Hills'], ['coast', 'The Coast'], ['summit', 'The Summit']] as const
let anchorCache: Promise<Anchors> | null = null
const getAnchors = () => (anchorCache ??= fetch('/assets/worlds/maps/anchors.json').then(r => r.json()))
// The painting is shown zoomed so a quarter's 13 stops have room; the map scrolls vertically.
const S = 2.6, CX = 0.475
const toCanvas = ([x, y]: [number, number]) => [S * (x - CX) + 0.5, y] as [number, number]
function spread(src: [number, number][], n: number) {
  const pts = src.map(toCanvas)
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], (p[1] - pts[i][1]) * S)), total = seg.reduce((a, b) => a + b, 0)
  return Array.from({ length: n }, (_, k) => {
    let d = n === 1 ? 0 : (0.02 + 0.96 * k / (n - 1)) * total, i = 0
    while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++ }
    const t = seg[i] ? Math.min(1, d / seg[i]) : 0
    return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t] as [number, number]
  })
}
export const verseRef = (l: LessonMeta) => l.mvp.split('”').pop()?.trim() || l.bp
export const niceDate = (l: LessonMeta) => { const d = lessonDate(l.date); return d ? d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) : l.date }
export const quarterOf = (m: Manual, n: number) => +(Object.entries(m.groups).find(([, r]) => n >= r[0] && n <= r[1])?.[0] ?? 1)

export function useStart() {
  const nav = useNavigate()
  return (spec: SessionSpec) => nav('/practice/session', { state: { spec } })
}
const recallSpec = (m: Manual, l: LessonMeta, size: number): SessionSpec => ({ kind: 'quest', manual: m.code, lessons: [l.id], count: size, title: `Lesson ${l.n} · Recall` })

/** Everything the Journey needs to know about where the learner is. */
function useJourney(m: Manual) {
  const S2 = useStore()
  const isDone = (l: LessonMeta) => !!S2.done[`${m.code}|${l.id}`]
  const groups = Object.entries(m.groups).map(([q, r]) => ({ q: +q, lessons: m.lessons.filter(l => l.n >= r[0] && l.n <= r[1]) })).filter(g => g.lessons.length)
  const cur = m.lessons.find(l => !isDone(l)) ?? m.lessons[m.lessons.length - 1]
  const unlocked = (l: LessonMeta) => isDone(l) || l.id === cur.id
  const due = dueInfo(S2.cards, m.code)
  const today = day(), sitToday = S2.history.filter(h => day(h.at) === today && h.manual === m.code)
  const quests = [
    { id: 'sit', ico: 'feather', t: 'Complete one sitting', sub: `${S2.sessionSize} questions`, done: sitToday.some(h => h.total >= 10), spec: recallSpec(m, cur, S2.sessionSize) },
    { id: 'due', ico: 'refresh', t: 'Return to due items', sub: due.count ? `${due.count} ready` : 'Nothing waiting', done: due.count === 0 || sitToday.some(h => h.kind === 'review'), spec: due.count ? { kind: 'review', manual: m.code, lessons: due.lessons.slice(0, 8), count: S2.sessionSize, title: 'Due review' } as SessionSpec : null },
    { id: 'spell', ico: 'spell', t: 'Revisit one spelling pattern', sub: 'Spelling traps · 10 questions', done: sitToday.some(h => (h.title ?? '').includes('Spelling')), spec: { kind: 'target', manual: m.code, lessons: m.lessons.filter(l => isDone(l) || l.id === cur.id).slice(-6).map(l => l.id), count: 10, focus: ['spelling'], title: 'Spelling traps' } as SessionSpec },
  ]
  return { ...S2, isDone, groups, cur, unlocked, due, quests }
}

export default function Journey() {
  const m = useManualData()
  if (!m) return <Loading />
  return <JourneyInner m={m} />
}

function JourneyInner({ m }: { m: Manual }) {
  const J = useJourney(m); const { cards, sessionSize, theme, prefs, manual, set, draft, lastActive } = J
  const start = useStart(); const nav = useNavigate()
  const [anchors, setAnchors] = useState<Anchors | null>(null)
  const [sel, setSel] = useState<LessonMeta | 'stage' | null>(null)
  const [panel, setPanel] = useState<LessonMeta>(J.cur)
  const [sheet, setSheet] = useState<'quests' | 'list' | null>(null)
  const [back, setBack] = useState(() => { try { return !sessionStorage.getItem('rhemlo.wb') && lastActive > 0 && Date.now() - lastActive > 4 * 86400000 } catch { return false } })
  useEffect(() => { getAnchors().then(setAnchors) }, [])
  const curG = Math.max(0, J.groups.findIndex(g => g.lessons.some(l => l.id === J.cur.id)))
  const [qi, setQi] = useState<number | null>(null); const gi = qi ?? curG; const g = J.groups[gi]
  const dark = prefs.mapWorld === 'night' || (prefs.mapWorld === 'theme' && (theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)))
  const world = WORLDS[(g.q - 1) % 4], key = `${world[0]}-${dark ? 'night' : 'day'}`
  const pos = useMemo(() => anchors ? spread(anchors[key].nodes_norm, g.lessons.length + 1) : [], [anchors, key, g])
  const allDone = g.lessons.every(J.isDone)
  const scroller = useRef<HTMLDivElement>(null)
  // glide to the current stop (instant on first paint)
  useEffect(() => {
    const el = scroller.current; if (!el || !pos.length) return
    const i = g.lessons.findIndex(l => l.id === J.cur.id), p = pos[i >= 0 ? i : allDone ? g.lessons.length : 0]
    const h = el.scrollWidth * S
    el.style.scrollBehavior = 'auto'; el.scrollTop = Math.max(0, p[1] * h - el.clientHeight * 0.42); requestAnimationFrame(() => { el.style.scrollBehavior = '' })
  }, [pos.length, gi]) // eslint-disable-line
  const q1 = m.stages[0], gap = readinessGap(m, q1.lessons, cards)
  const doneQ = J.quests.filter(q => q.done).length
  const wl = weekLesson(m), dow = new Date().getDay(), reading = wl.readings[dow] ?? wl.readings[0]
  const open = (l: LessonMeta) => { setPanel(l); if (matchMedia('(min-width:640px) and (max-width:1023px)').matches) return; setSel(l) }

  if (back) return <WelcomeBack m={m} onDone={() => { try { sessionStorage.setItem('rhemlo.wb', '1') } catch { /* */ } setBack(false) }} />

  return <div className="jy">
    <div className="jy-head">
      <label className="mbtn manualpick"><Icon n="book" className="s" /><select aria-label="Manual" value={manual} onChange={e => set({ manual: e.target.value as ManualCode })}><option value="AD2627">Adult 26–27</option><option value="EN2627">YAYA 26–27</option></select><Icon n="down" className="s" /></label>
      <div className="grow" />
      <button className="stat-pill" style={{ border: 0 }} onClick={() => setSheet('quests')} aria-label={`Today's quests, ${doneQ} of 3 done`}><Icon n="sprout" className="s" style={{ color: 'var(--rh-pistachio-deep)' }} />{doneQ}/3</button>
      <StatPills />
    </div>
    <button className="jy-banner" onClick={() => setSel(J.cur)}>
      <div className="grow"><p className="eyebrow">Quarter {quarterOf(m, J.cur.n)} · Chapter {J.groups[curG].lessons.indexOf(J.cur) + 1} of {J.groups[curG].lessons.length}</p><h2>{niceTitle(J.cur.title)}</h2><p className="tiny" style={{ opacity: .9 }}>{niceDate(J.cur).replace(/^\w+, /, '')} · Memory verse {verseRef(J.cur)}</p></div>
      <span className="bk"><Icon n="book" /></span></button>
    <div className="jy-body">
      <div className="jy-mapcol">
        <div className="mapscroll" ref={scroller} aria-label={`Quest map, Quarter ${g.q}`}>
          <div className="mapcanvas" style={{ aspectRatio: `1 / ${S}` }}>
            <img className="paint" alt="" src={asset(`worlds/maps/${key}/${key}-1254.webp`)} style={{ width: `${S * 100}%`, left: `${(0.5 - S * CX) * 100}%` }} />
            {g.lessons.map((l, i) => {
              const p = pos[i]; if (!p) return null
              const d = J.isDone(l), isCur = l.id === J.cur.id, rev = d && lessonStats(cards, m, l.id).due > 0
              const cls = d ? (rev ? 'review' : 'done') : isCur ? 'current' : ''
              const state = d ? (rev ? 'review due' : 'done') : isCur ? 'current quest' : 'locked'
              return <div key={l.id}>
                <button className={`node ${cls}`} style={{ left: `${p[0] * 100}%`, top: `${p[1] * 100}%` }} onClick={() => open(l)} aria-label={`Lesson ${l.n}, ${niceTitle(l.title)}, ${state}`}>
                  <Icon n={d ? (rev ? 'refresh' : 'check') : isCur ? 'star' : 'lock'} /></button>
                <span className="nodetag" style={{ left: `${p[0] * 100}%`, top: `${p[1] * 100}%` }}>L{l.n}</span>
                {isCur && <>
                  <button className="bubble" style={{ left: `calc(${p[0] * 100}% - 44px)`, top: `${p[1] * 100}%` }} onClick={() => start(recallSpec(m, l, sessionSize))}>{draft ? 'Continue quest' : `Recall · ${sessionSize} questions`}</button>
                  <Glim pose="point" size={92} className="mapglim" style={{ left: `calc(${p[0] * 100}% + 26px)`, top: `${p[1] * 100}%` }} /></>}
              </div>
            })}
            {pos[g.lessons.length] && <><button className={`node stage ${allDone ? '' : 'locked'}`} style={{ left: `${pos[g.lessons.length][0] * 100}%`, top: `${pos[g.lessons.length][1] * 100}%` }} onClick={() => setSel('stage')} aria-label={`Quarter ${g.q} check, ${allDone ? 'open' : 'locked until every lesson is cleared'}`}><Icon n={allDone ? 'flag' : 'lock'} /></button>
              <span className="nodetag" style={{ left: `${pos[g.lessons.length][0] * 100}%`, top: `${pos[g.lessons.length][1] * 100}%` }}>Q{g.q} check</span></>}
          </div>
        </div>
        <div className="chap-float"><div className="card glass col gap8" style={{ padding: 16 }}>
          <p className="eyebrow">Quarter {quarterOf(m, J.cur.n)} · Chapter {J.groups[curG].lessons.indexOf(J.cur) + 1} of {J.groups[curG].lessons.length}</p>
          <h2 style={{ marginTop: -4 }}>{niceTitle(J.cur.title)}</h2><p className="tiny muted" style={{ marginTop: -6 }}>Memory verse · {verseRef(J.cur)}</p>
          <div className="row gap8"><Link className="btn sec sm grow" to={`/library/${J.cur.id}`}><Icon n="book" className="s" />Read lesson</Link><button className="btn sm grow" onClick={() => start(recallSpec(m, J.cur, sessionSize))}>Continue quest</button></div>
        </div></div>
        <div className="qswitch" role="group" aria-label="Quarter">{J.groups.map((x, i) => <button key={x.q} className={i === gi ? 'on' : ''} aria-pressed={i === gi} onClick={() => setQi(i)}>Q{x.q}</button>)}
          <button onClick={() => setSheet('list')} aria-label="List view of all lessons"><Icon n="listn" className="s" /></button></div>
        <div className="dock"><div className="card glass">
          {J.due.count ? <><span className="tile apricot"><Icon n="refresh" /></span>
            <div className="grow"><b className="disp">{J.due.count} point{J.due.count === 1 ? '' : 's'} to revisit</b><div className="tiny muted">Due review · {J.due.range} · {J.due.minutes} min</div></div>
            <button className="btn sm" onClick={() => start(J.quests[1].spec!)}>Review</button></> :
            <><Glim pose="clap" size={48} /><div className="grow"><b className="disp">Nothing due right now</b><div className="tiny muted">Reviews return here when they are ready.</div></div>
              {draft && <button className="btn sm apricot" onClick={() => nav('/practice/session')}>Continue quest</button>}</>}
        </div></div>
      </div>
      <aside className="jy-ctx" aria-label="Chapter and today">
        <div className="tabletpanel"><ChapterPanel m={m} l={panel} J={J} /></div>
        <div className="deskrail col gap16">
          <div className="card col gap8"><div className="row between"><p className="eyebrow">Today's quests</p><span className="chip str"><Icon n="sprout" />{doneQ} of 3</span></div>
            {J.quests.map(q => <button key={q.id} className="li row" style={{ border: 0, background: 'transparent', padding: '6px 0', textAlign: 'left', color: 'inherit' }} disabled={!q.spec} onClick={() => q.spec && start(q.spec)}>
              <span className={`tile ${q.done ? 'green' : ''}`} style={{ width: 34, height: 34, borderRadius: 10 }}><Icon n={q.done ? 'check' : q.ico} className="s" /></span><span className="small b">{q.t}</span></button>)}</div>
          <Link to="/journey/stages/0" className="card col gap8" style={{ color: 'inherit' }}><p className="eyebrow">Quarter 1 test</p>
            <div className="row" style={{ alignItems: 'flex-end' }}><b className="disp" style={{ fontSize: 34, lineHeight: '34px', color: 'var(--rh-action)' }}>{Math.max(0, daysUntil(q1.date))}</b><div className="tiny muted">days · {shortDate(new Date(q1.date + 'T00:00'))}<br />Lessons {q1.lessons[0]}–{q1.lessons[1]}</div></div>
            <div className="bar thin"><i style={{ width: `${Math.min(100, gap.readiness / .95 * 100)}%` }} /></div><p className="tiny muted">Readiness {Math.round(gap.readiness * 100)}% Secure · target 95%</p></Link>
          {reading && <Link to="/journey/readings" className="card col gap8" style={{ color: 'inherit', background: 'var(--rh-apricot-bg)', borderColor: 'transparent' }}>
            <p className="eyebrow" style={{ color: 'var(--rh-apricot-deep)' }}>Further reading · {reading.d}</p><b className="disp" style={{ fontSize: 17 }}>{reading.r}</b><Passage refText={reading.r} clamp /><p className="tiny muted">For devotion · never graded</p></Link>}
        </div>
      </aside>
    </div>
    {sel && sel !== 'stage' && <Sheet label={`Lesson ${sel.n}`} onClose={() => setSel(null)}><ChapterPanel m={m} l={sel} J={J} onGo={() => setSel(null)} /></Sheet>}
    {sel === 'stage' && <Sheet label="Quarter check" onClose={() => setSel(null)}><div className="col center" style={{ alignItems: 'center' }}>
      <img src={asset('emblems/tiers/tier-gold-256.webp')} width={96} height={110} alt="" /><p className="eyebrow">Quarter {g.q} · stage test</p><h2>Quarter check</h2>
      {allDone ? <><p className="muted">A mixed check across all {g.lessons.length} lessons. Marking is exactly the same as everywhere else.</p>
        <button className="btn block" onClick={() => start({ kind: 'check', manual: m.code, lessons: g.lessons.map(x => x.id), count: 30, title: `Quarter ${g.q} check` })}>Start 30 questions</button></> :
        <p className="muted">Opens when every lesson in this quarter is cleared ({g.lessons.filter(J.isDone).length} of {g.lessons.length} so far). Any started lesson can be practised from Practice.</p>}</div></Sheet>}
    {sheet === 'quests' && <Sheet label="Daily quests" onClose={() => setSheet(null)}><DailyQuests J={J} m={m} onGo={() => setSheet(null)} /></Sheet>}
    {sheet === 'list' && <Sheet label="All lessons" onClose={() => setSheet(null)}><h2>All lessons</h2><div className="list mt8">{m.lessons.map(l => { const d = J.isDone(l); return <button key={l.id} className="li" onClick={() => { setSheet(null); open(l) }}>
      <span className={`tile ${d ? 'green' : l.id === J.cur.id ? '' : ''}`} style={{ width: 36, height: 36 }}><Icon n={d ? 'check' : l.id === J.cur.id ? 'star' : 'lock'} className="s" /></span><span className="grow"><b>{l.n}. {niceTitle(l.title)}</b><span className="tiny muted" style={{ display: 'block' }}>{d ? 'Done' : l.id === J.cur.id ? 'Current quest' : 'Opens after the lesson before'}</span></span><Icon n="chev" /></button> })}</div></Sheet>}
  </div>
}

type JT = ReturnType<typeof useJourney>
function ChapterPanel({ m, l, J, onGo }: { m: Manual; l: LessonMeta; J: JT; onGo?: () => void }) {
  const start = useStart(); const nav = useNavigate(); const { cards, sessionSize, readings } = J
  const [words, setWords] = useState<number | null>(null)
  useEffect(() => { let on = true; loadLesson(m.code, l.id).then(x => on && setWords(x.sections.reduce((a, s) => a + s.b.reduce((b, k) => b + ((k.x ?? '') + ' ' + (k.i ?? []).join(' ')).split(/\s+/).filter(Boolean).length, 0), 0))); return () => { on = false } }, [m.code, l.id])
  const st = lessonStats(cards, m, l.id)
  const seen = Object.entries(cards).filter(([k, c]) => k.startsWith(`${m.code}|${m.code}:${l.id}.`) && c.seen > 0).length
  const open = J.unlocked(l), done = J.isDone(l), read = !!readings[`${m.code}|read|${l.id}`]
  const go = (s: SessionSpec) => { onGo?.(); start(s) }
  return <div className="col gap8">
    <p className="eyebrow">Chapter {l.n} · {lessonDate(l.date)?.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) ?? l.date}</p>
    <h2>{niceTitle(l.title)}</h2>
    <p className="small muted">Memory verse · {verseRef(l)} · Bible passage · {l.bp}</p>
    <div className="mt8">
      <button className="cyc" onClick={() => { onGo?.(); nav(`/library/${l.id}`) }}><span className="tile green"><Icon n="book" /></span><span className="grow"><span className="nm">Learn</span><span className="tiny muted" style={{ display: 'block' }}>Read the lesson{words ? ` · ${words} words` : ''}</span></span>{read ? <Icon n="check" style={{ color: 'var(--rh-correct)' }} /> : <Icon n="chev" className="faint" />}</button>
      <button className="cyc" disabled={!open} onClick={() => go(recallSpec(m, l, sessionSize))}><span className="tile"><Icon n="feather" /></span><span className="grow"><span className="nm">Recall</span><span className="tiny muted" style={{ display: 'block' }}>{seen} of {l.ic} questions</span></span>{!open ? <Icon n="lock" className="faint" /> : done ? <Icon n="check" style={{ color: 'var(--rh-correct)' }} /> : <span className="chip">Next</span>}</button>
      <button className="cyc" disabled={!seen || !st.due} onClick={() => go({ kind: 'review', manual: m.code, lessons: [l.id], count: sessionSize, title: `Lesson ${l.n} · Review` })}><span className="tile"><Icon n="refresh" /></span><span className="grow"><span className="nm">Review</span><span className="tiny muted" style={{ display: 'block' }}>{!seen ? 'Unlocks after Recall' : st.due ? `${st.due} due now` : 'Nothing due yet'}</span></span>{!seen ? <Icon n="lock" className="faint" /> : st.due ? <span className="chip due">Due</span> : <Icon n="check" style={{ color: 'var(--rh-correct)' }} />}</button>
      <button className="cyc" disabled={!done} onClick={() => { onGo?.(); nav(`/journey/check/${l.id}`) }}><span className="tile"><Icon n="flag" /></span><span className="grow"><span className="nm">Check</span><span className="tiny muted" style={{ display: 'block' }}>{done ? 'Lesson mastery check' : 'Opens after Recall is cleared'}</span></span>{done ? <Icon n="chev" className="faint" /> : <Icon n="lock" className="faint" />}</button>
    </div>
    {open ? <><button className="btn block mt8" onClick={() => go(recallSpec(m, l, sessionSize))}>Start {sessionSize} questions</button>
      <button className="btn link" onClick={() => { onGo?.(); nav(`/library/${l.id}`) }}>Read the lesson first</button></>
      : <><p className="hint mt8"><Icon n="lock" />Clear Lesson {l.n - 1 > 0 ? m.lessons[m.lessons.indexOf(l) - 1]?.n : 1} first. Reading is always open.</p><button className="btn sec block" onClick={() => { onGo?.(); nav(`/library/${l.id}`) }}>Read lesson</button></>}
  </div>
}

function DailyQuests({ J, m, onGo }: { J: JT; m: Manual; onGo: () => void }) {
  const start = useStart(); const nav = useNavigate(); const q1 = m.stages[0]
  return <div className="col">
    <div className="row"><Glim pose="cheer" size={84} /><div><p className="eyebrow">Daily quests · resets at midnight</p><h2>One small quest.</h2></div></div>
    {J.quests.map(q => <button key={q.id} className="card row" style={{ textAlign: 'left', color: 'inherit' }} disabled={!q.spec} onClick={() => { if (q.spec) { onGo(); start(q.spec) } }}>
      <span className={`tile ${q.done ? 'green' : 'apricot'}`}><Icon n={q.done ? 'check' : q.ico} /></span>
      <span className="grow"><span className="row between"><b>{q.t}</b><span className="tiny b muted">{q.done ? 'Done' : '0/1'}</span></span><span className="tiny muted" style={{ display: 'block' }}>{q.sub}</span>
        <span className="bar thin green mt8"><i style={{ width: q.done ? '100%' : '0%' }} /></span></span></button>)}
    <button className="card row" style={{ textAlign: 'left', color: 'inherit' }} onClick={() => { onGo(); nav('/journey/stages/0') }}><span className="tile"><Icon n="clock" /></span><span className="grow"><b>{q1.name}</b><span className="tiny muted" style={{ display: 'block' }}>{Math.max(0, daysUntil(q1.date))} days · Lessons {q1.lessons[0]}–{q1.lessons[1]}</span></span><Icon n="chev" /></button>
    <p className="tiny muted center">Quests reward useful learning only. Opening screens earns nothing.</p>
  </div>
}

function WelcomeBack({ m, onDone }: { m: Manual; onDone: () => void }) {
  const { cards, sessionSize } = useStore(); const start = useStart()
  const secure = Object.entries(cards).filter(([k, c]) => k.startsWith(m.code + '|') && masteryOf(c) === 'secure').length
  const due = dueInfo(cards, m.code)
  const lessons = [...new Set(Object.keys(cards).filter(k => k.startsWith(m.code + '|')).map(k => k.match(/:(L\d+)/)?.[1]).filter(Boolean) as string[])]
  return <div className="page col" style={{ alignItems: 'center', textAlign: 'center', maxWidth: 480, minHeight: 'calc(100dvh - 80px)', justifyContent: 'center' }}>
    <Glim pose="wave" motion="wave" once size={180} />
    <h1>Good to have you back.</h1><p className="muted">Your learning history is still here. Nothing was lost while you were away.</p>
    <div className="card col" style={{ width: '100%', textAlign: 'left' }}>
      <div className="row"><span className="tile apricot"><Icon n="refresh" /></span><div><b>A gentle restart</b><div className="tiny muted">10 questions from what you knew best</div></div></div>
      <div className="row"><span className="tile green"><Icon n="sprout" /></span><div><b>{secure} items still Secure</b><div className="tiny muted">Mastery evidence kept{due.count ? ` · ${due.count} are due` : ''}</div></div></div>
    </div>
    <button className="btn block" disabled={!lessons.length} onClick={() => { onDone(); start({ kind: 'restart', manual: m.code, lessons: lessons.slice(0, 8), count: 10, title: 'A gentle restart' }) }}>Start 10 questions</button>
    <button className="btn link" onClick={onDone}>Back to journey</button>
    <p className="tiny faint">{sessionSize}-question sittings stay your default.</p>
  </div>
}

function Passage({ refText, clamp }: { refText: string; clamp?: boolean }) {
  const [p, setP] = useState<Awaited<ReturnType<typeof readPassage>> | undefined>()
  useEffect(() => { let on = true; readPassage(refText).then(x => on && setP(x)); return () => { on = false } }, [refText])
  if (p === undefined) return <div className="skel" style={{ height: 48 }} />
  if (!p) return <p className="small muted">Open your Bible at {refText}.</p>
  return <p className="small" style={clamp ? { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : { font: 'var(--rh-type-reader)' }}>{p.verses.map(v => <span key={v.n}>{p.verses.length > 1 && <sup className="faint b">{v.n} </sup>}{v.t} </span>)}</p>
}

// ---- Further readings (devotional track) -------------------------------------------------------------
export function Readings() {
  const m = useManualData(); const nav = useNavigate(); const { readings, set } = useStore()
  if (!m) return <Loading />
  const l = weekLesson(m), dow = new Date().getDay(), today = l.readings[dow] ?? l.readings[0]
  const k = (d: string) => `${m.code}|${l.id}|${d}`
  return <div className="page col" style={{ maxWidth: 560 }}>
    <BackBar title="Further readings" onBack={() => nav('/journey')} right={<Icon n="calendar" className="faint" />} />
    {today && <div className="mvcard"><p className="eyebrow">{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow]} · Lesson {l.n} week</p><h2 className="mt8">{today.r}</h2><div className="mt8"><Passage refText={today.r} /></div><p className="tiny muted mt8">King James Version · public domain</p></div>}
    <div className="card list" style={{ padding: '4px 14px' }}>{l.readings.map((r, i) => <div key={r.d} className="li">
      <span className="chip plain" style={{ width: 52, justifyContent: 'center' }}>{r.d}</span><span className={`grow ${i === dow ? 'b' : ''}`}>{r.r}</span>
      {i === dow && <span className="chip due">Today</span>}
      <button className="iconbtn" aria-label={readings[k(r.d)] ? `Mark ${r.d} unread` : `Mark ${r.d} read`} aria-pressed={!!readings[k(r.d)]} onClick={() => { const n = { ...readings }; if (n[k(r.d)]) delete n[k(r.d)]; else n[k(r.d)] = true; set({ readings: n }) }}>
        {readings[k(r.d)] ? <Icon n="check" style={{ color: 'var(--rh-correct)' }} /> : <span style={{ width: 20, height: 20, borderRadius: 99, border: '2px solid var(--rh-line2)' }} />}</button></div>)}</div>
    <p className="hint"><Icon n="info" />Further readings are for devotion. They are never graded.</p>
  </div>
}

// ---- Stage countdown -------------------------------------------------------------------------------
export function StageCountdown() {
  const m = useManualData(); const nav = useNavigate(); const { i = '0' } = useParams(); const { cards, sessionSize } = useStore()
  if (!m) return <Loading />
  const st = m.stages[+i] ?? m.stages[0], g = readinessGap(m, st.lessons, cards), left = Math.max(0, daysUntil(st.date))
  const ls = m.lessons.filter(l => l.n >= st.lessons[0] && l.n <= st.lessons[1])
  const need = Math.max(0, Math.ceil(.95 * g.total) - g.secure), perDay = Math.ceil(need / Math.max(1, left)), sittings = Math.max(1, Math.ceil(perDay / Math.max(1, sessionSize * .6)))
  return <div className="page col" style={{ maxWidth: 560 }}>
    <BackBar title={st.name} onBack={() => nav('/journey')} />
    <div className="col center" style={{ alignItems: 'center', gap: 4 }}><Glim pose="trophy" size={150} /><b className="disp" style={{ fontSize: 64, lineHeight: '64px', color: 'var(--rh-action)' }}>{left}</b>
      <p className="muted">days to go · {new Date(st.date + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
    <div className="card col"><div className="row between"><b>Readiness · Lessons {st.lessons[0]}–{st.lessons[1]}</b><b style={{ color: 'var(--rh-action)' }}>{Math.round(g.readiness * 100)}%</b></div>
      <div className="bar"><i style={{ width: `${Math.min(100, g.readiness / .95 * 100)}%` }} /></div>
      <div className="row wrap gap8">{ls.map(l => { const r = lessonStats(cards, m, l.id).readiness; return <span key={l.id} className={`chip ${r >= .95 ? 'ok' : r >= .4 ? 'str' : r > 0 ? '' : 'plain'}`} title={`${Math.round(r * 100)}% secure`}>L{l.n}</span> })}</div>
      <p className="tiny muted">Readiness = share of this stage's points that are Secure. The target is 95%.</p></div>
    <div className="card row"><span className="tile"><Icon n="calendar" /></span><div className="grow"><b>Suggested pace</b><div className="tiny muted">{need === 0 ? 'At target — keep reviews going' : `${sittings} sitting${sittings === 1 ? '' : 's'} a day · ${need.toLocaleString()} points to secure`}</div></div><Link className="btn sec sm" to="/journey/planner">Plan</Link></div>
    <div className="card row"><span className="tile apricot"><Icon n="scale" /></span><div><b>Competition marking</b><div className="tiny muted">Spelling and hyphens count · capitals and punctuation do not</div></div></div>
  </div>
}

// ---- Lesson mastery check (R25) ---------------------------------------------------------------------
const CATS: [Category, string, string, string][] = [['verse', 'Memory verse', 'quote', 'green'], ['outline', 'Outline', 'listn', ''], ['refs', 'References', 'bookmark', 'apricot'], ['sentences', 'Key sentences', 'letter', '']]
export function MasteryCheck() {
  const m = useManualData(); const nav = useNavigate(); const { id = 'L01' } = useParams(); const { cards } = useStore(); const start = useStart()
  const [keys, setKeys] = useState<Record<Category, string[]> | null>(null)
  useEffect(() => { if (!m) return; loadItems(m.code, id).then(its => { const r: Record<Category, Set<string>> = { verse: new Set(), outline: new Set(), refs: new Set(), sentences: new Set() }; its.forEach(i => r[categoryOf(i.s)].add(i.s)); setKeys(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, [...v]])) as Record<Category, string[]>) }) }, [m, id])
  if (!m || !keys) return <Loading />
  const l = m.lessons.find(x => x.id === id)!, st = lessonStats(cards, m, id), pct = Math.round(st.readiness * 100)
  const C = 2 * Math.PI * 52, seg = (n: number) => `${(st.total ? n / st.total : 0) * C} ${C}`
  const stateOf = (ks: string[]) => { const cs = ks.map(k => cards[`${m.code}|${k}`]); const sec = cs.filter(c => masteryOf(c) === 'secure').length; return sec >= ks.length * .8 && ks.length ? ['Secure', ''] : cs.some(c => c && c.box >= 2) ? ['Strengthening', 'str'] : cs.some(c => c?.seen) ? ['Learning', 'due'] : ['Not started', 'plain'] }
  return <div className="page col" style={{ maxWidth: 560 }}>
    <BackBar title="Lesson mastery check" onBack={() => nav('/journey')} />
    <div className="col center" style={{ alignItems: 'center' }}>
      <div className="donut" style={{ width: 140, height: 140 }}><svg viewBox="0 0 140 140" width="140" height="140"><g transform="rotate(-90 70 70)" fill="none" strokeWidth="16">
        <circle cx="70" cy="70" r="52" stroke="var(--rh-line)" /><circle cx="70" cy="70" r="52" stroke="var(--rh-apricot)" strokeDasharray={seg(st.secure + st.strengthening + st.learning)} />
        <circle cx="70" cy="70" r="52" stroke="var(--rh-action)" strokeDasharray={seg(st.secure + st.strengthening)} /><circle cx="70" cy="70" r="52" stroke="var(--rh-node-done)" strokeDasharray={seg(st.secure)} /></g></svg>
        <div className="c"><div><b>{pct}%</b><span className="tiny muted">Secure</span></div></div></div>
      <h2>Lesson {l.n} · {niceTitle(l.title)}</h2><p className="small muted">A mixed check across the whole lesson. No whole-lesson retyping.</p></div>
    <div className="col gap8">{CATS.map(([k, t, ic, tone]) => { const [s, c] = stateOf(keys[k]); return <div key={k} className="card row" style={{ padding: 12 }}>
      <span className={`tile ${tone}`} style={{ width: 38, height: 38 }}><Icon n={ic} className="s" /></span><b className="grow">{t} ({keys[k].length})</b><span className={`chip ${c}`}>{s}</span></div> })}</div>
    <button className="btn block mt8" onClick={() => start({ kind: 'check', manual: m.code, lessons: [id], count: 25, title: `Lesson ${l.n} · Check` })}>Start 25 questions</button>
  </div>
}
