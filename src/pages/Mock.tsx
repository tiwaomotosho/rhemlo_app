// CBT mock exam, built on common computer-based-testing conventions: candidate instructions, one
// question per screen, a question navigator with status, flag for review, a review screen before
// submitting, time warnings, automatic submission, answers saved as you go, resume after a refresh,
// no feedback until the end, then a score report with a breakdown (PRD 9.7, UX-IN-04, FR-AN-06).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { buildSession, KIND_LABEL, lessonOfKey, niceTitle, shuffleSeed } from '@/lib/engine'
import { loadItems, loadManual } from '@/lib/data'
import { gradeItem, normText } from '@/lib/grade'
import { useStore } from '@/lib/store'
import { phaseAt } from '@/lib/srs'
import { syncNow } from '@/lib/sync'
import type { Item, Manual, MockRecord } from '@/lib/types'
import { BackBar, Icon, Loading, Sheet, StatPills, useManualData } from '@/ui/bits'
import { Answer, blankAnswer, Prompt, toResponse, type AState } from './Session'

type Fmt = 'mixed' | 'typed' | 'mcq'
export interface MockSpec { manual: string; lessons: string[]; count: number; limitS: number; fmt: Fmt; title: string; assignment?: string }
interface MockDraft { spec: MockSpec; id: string; items: string[]; mcq: Record<string, boolean>; answers: Record<string, AState>; flags: string[]; i: number; startedAt: number; endsAt: number; shown: Record<string, number> }
const h = (s: string) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) } return x >>> 0 }
const fmtTime = (s: number) => { s = Math.max(0, Math.floor(s)); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
const PASS = .95
const CAP_TYPES: Record<string, { name: string; types: string[]; target: number; secs: number }> = {
  C1: { name: 'Context to scripture', types: ['Q12', 'Q24', 'Q37', 'Q34'], target: .95, secs: 10 },
  C2: { name: 'Missing words, right spelling', types: ['Q01', 'Q02', 'Q06', 'Q17', 'Q33'], target: .98, secs: 8 },
  C3: { name: 'Memory verse ↔ lesson', types: ['Q04', 'Q05', 'Q09', 'Q10', 'Q08', 'Q29', 'Q30', 'Q31'], target: .98, secs: 6 },
  C4: { name: 'Trap detection', types: ['Q23', 'Q33', 'Q36', 'Q32'], target: .95, secs: 15 },
}
export const capabilityOf = (t: string) => Object.entries(CAP_TYPES).find(([, c]) => c.types.includes(t))?.[0]

/** Next scheduled mock (FR-PL-04): every 4 weeks while learning, weekly in consolidation and finale prep. */
export function nextMockDate(mocks: MockRecord[], phases = useStore.getState().prefs.phases) {
  const last = mocks.length ? Math.max(...mocks.map(m => m.at)) : 0
  const p = phaseAt(phases), gap = p.retention >= .95 ? 7 : 28
  return last ? last + gap * 86400000 : Date.now()
}

// ---- setup ---------------------------------------------------------------------------------------
export function MockSetup() {
  const m = useManualData(); const nav = useNavigate(); const loc = useLocation(); const S = useStore()
  const pre = (loc.state ?? {}) as Partial<MockSpec>
  const [scope, setScope] = useState<string>(pre.lessons ? 'custom' : 'q1'); const [custom, setCustom] = useState<string[]>(pre.lessons ?? [])
  const [count, setCount] = useState(pre.count ?? 100); const [mins, setMins] = useState(pre.limitS ? Math.round(pre.limitS / 60) : 60); const [fmt, setFmt] = useState<Fmt>('mixed'); const [extra, setExtra] = useState(0)
  if (!m) return <Loading />
  const groups = Object.entries(m.groups)
  const lessons = scope === 'all' ? m.lessons.map(l => l.id) : scope === 'custom' ? custom : (() => { const r = m.groups[scope.slice(1)]; return m.lessons.filter(l => l.n >= r[0] && l.n <= r[1]).map(l => l.id) })()
  const draft = S.mockDraft as MockDraft | null
  const mine = S.mocks.filter(x => x.manual === m.code)
  const next = nextMockDate(mine)
  const spec: MockSpec = { manual: m.code, lessons, count, limitS: Math.round(mins * 60 * (1 + extra)), fmt, title: scope === 'all' ? 'Full manual' : scope === 'custom' ? `${lessons.length} lesson${lessons.length === 1 ? '' : 's'}` : `Quarter ${scope.slice(1)}`, assignment: pre.assignment }
  return <div className="page col gap16" style={{ maxWidth: 760 }}>
    <div className="pagehead"><div><p className="eyebrow">Practice · CBT simulator</p><h1>Mock exam</h1></div><StatPills /></div>
    {draft && <div className="card row" style={{ borderColor: 'var(--rh-action)' }}><Icon n="clock" /><div className="grow"><b>Exam in progress</b><div className="tiny muted">{draft.spec.title} · {fmtTime((draft.endsAt - Date.now()) / 1000)} left · {Object.keys(draft.answers).length} answered</div></div><button className="btn sm" onClick={() => nav('/practice/mock/exam')}>Resume</button></div>}
    <div className="card col gap16">
      <div><p className="eyebrow">Scope</p><div className="row wrap gap8 mt8">{groups.map(([q, r]) => <button key={q} className="chip btnchip" aria-pressed={scope === 'q' + q} onClick={() => setScope('q' + q)}>Quarter {q} · L{r[0]}–{r[1]}</button>)}
        <button className="chip btnchip" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>Full manual · all {m.lessons.length}</button><button className="chip btnchip" aria-pressed={scope === 'custom'} onClick={() => setScope('custom')}>Choose lessons</button></div>
        {scope === 'custom' && <div className="row wrap gap8 mt8">{m.lessons.map(l => <button key={l.id} className="chip btnchip" aria-pressed={custom.includes(l.id)} onClick={() => setCustom(c => c.includes(l.id) ? c.filter(x => x !== l.id) : [...c, l.id])}>L{l.n}</button>)}</div>}</div>
      <div className="grid2">
        <div><label className="lbl" htmlFor="mq">Questions</label><input id="mq" className="field" type="number" min={5} max={200} value={count} onChange={e => setCount(Math.max(5, Math.min(200, +e.target.value || 5)))} />
          <div className="row gap8 mt8">{[20, 50, 100].map(n => <button key={n} className="chip btnchip plain" onClick={() => { setCount(n); setMins(Math.round(n * .6)) }}>{n}</button>)}</div></div>
        <div><label className="lbl" htmlFor="mt">Time limit (minutes)</label><input id="mt" className="field" type="number" min={1} max={300} value={mins} onChange={e => setMins(Math.max(1, Math.min(300, +e.target.value || 1)))} />
          <p className="tiny muted mt8">Real exam pace: about 36 seconds a question ({Math.round(count * .6)} min for {count}).</p></div></div>
      <div><p className="eyebrow">Answer formats</p><div className="seg mt8">{([['mixed', 'Typed and choice'], ['typed', 'Typed only'], ['mcq', 'Choice only']] as const).map(([k, t]) => <button key={k} className={fmt === k ? 'on' : ''} onClick={() => setFmt(k)}>{t}</button>)}</div></div>
      <div><p className="eyebrow">Extra time (accommodation)</p><div className="seg mt8">{[0, .25, .5].map(x => <button key={x} className={extra === x ? 'on' : ''} onClick={() => setExtra(x)}>{x ? `+${x * 100}%` : 'None'}</button>)}</div></div>
      <p className="hint"><Icon n="eyeoff" />Like the real CBT: questions are mixed across your lessons, sources are hidden, and marks appear only after you submit.</p>
      <button className="btn block" disabled={!lessons.length || !!draft} onClick={() => nav('/practice/mock/intro', { state: spec })}>Continue to instructions</button>
    </div>
    <div className="card col gap8"><div className="row between"><h3>Mock history</h3><span className="tiny muted">Next scheduled mock: {next <= Date.now() ? 'due now' : new Date(next).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
      {mine.length ? <><MockChart mocks={mine} /><div className="list">{[...mine].reverse().slice(0, 8).map(x => <Link key={x.id} to={`/practice/mock/result/${x.id}`} className="li"><span className={`chip ${x.score >= PASS ? 'ok' : x.score >= .8 ? 'str' : 'due'}`}>{Math.round(x.score * 100)}%</span><span className="grow small"><b>{x.full ? 'Full manual' : `${x.lessons.length} lessons`}</b> · {x.total} questions · {Math.round(x.usedS / 60)} min</span><span className="tiny muted">{new Date(x.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span></Link>)}</div></>
        : <p className="small muted">No mocks yet. The planner schedules one every four weeks, and weekly before each test.</p>}</div>
  </div>
}

export function MockChart({ mocks }: { mocks: MockRecord[] }) {
  const last = mocks.slice(-12)
  return <div role="img" aria-label={`Mock scores: ${last.map(x => Math.round(x.score * 100) + '%').join(', ')}`} style={{ position: 'relative', height: 110, display: 'flex', alignItems: 'flex-end', gap: 6, padding: '0 2px', borderBottom: '1px solid var(--rh-line)' }}>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${PASS * 100}%`, borderTop: '2px dashed var(--rh-correct-line)' }}><span className="tiny" style={{ position: 'absolute', right: 0, top: -16, color: 'var(--rh-correct)' }}>95% target</span></div>
    {last.map(x => <div key={x.id} title={`${Math.round(x.score * 100)}% · ${new Date(x.at).toLocaleDateString()}`} style={{ flex: 1, maxWidth: 40, height: `${Math.max(4, x.score * 100)}%`, borderRadius: '6px 6px 2px 2px', background: x.score >= PASS ? 'var(--rh-node-done)' : 'var(--rh-action)' }} />)}
  </div>
}

// ---- candidate instructions ------------------------------------------------------------------------
export function MockIntro() {
  const loc = useLocation(); const nav = useNavigate(); const S = useStore(); const spec = loc.state as MockSpec | null; const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false)
  if (!spec) return <Navigate to="/practice/mock" replace />
  const begin = async () => {
    setBusy(true)
    const seed = crypto.randomUUID()
    const { items } = await buildSession({ kind: 'mock', manual: spec.manual as never, lessons: spec.lessons, count: spec.count, title: spec.title, formats: spec.fmt }, S.cards, S.ladder)
    // per-question format: mixed alternates where both exist; option order randomised per attempt
    const mcq: Record<string, boolean> = {}
    for (const it of items) mcq[it.u] = it.p.input.kind === 'choice' || (it.p.input.kind !== 'multi' && (!it.f.includes('typed') || (spec.fmt === 'mcq' && it.f.includes('mcq')) || (spec.fmt === 'mixed' && it.f.includes('mcq') && h(it.u + seed) % 2 === 0)))
    const now = Date.now()
    S.set({ mockDraft: { spec, id: seed, items: shuffleSeed(items.map(i => i.u), seed), mcq, answers: {}, flags: [], i: 0, startedAt: now, endsAt: now + spec.limitS * 1000, shown: {} } satisfies MockDraft })
    nav('/practice/mock/exam', { replace: true })
  }
  return <div className="page col gap16" style={{ maxWidth: 680 }}>
    <BackBar title="Instructions" onBack={() => nav('/practice/mock')} />
    <div className="card col gap8"><p className="eyebrow">Candidate</p><h2>{S.profile.name}{S.profile.handle ? ` · @${S.profile.handle}` : ''}</h2>
      <div className="grid2 small"><div><span className="muted">Exam</span><br /><b>{spec.title}</b></div><div><span className="muted">Manual</span><br /><b>{spec.manual === 'AD2627' ? 'Adult 2026–27' : 'YAYA 2026–27'}</b></div><div><span className="muted">Questions</span><br /><b>{spec.count}</b></div><div><span className="muted">Time allowed</span><br /><b>{fmtTime(spec.limitS)}</b></div></div></div>
    <div className="card col gap8"><h3>Rules</h3>
      {['The clock starts when you press Start exam and does not stop, even if you close the page.', 'Answer in any order. Use Next and Previous, or jump with the question navigator.', 'Flag any question to come back to it. Flags do not affect your score.', 'Nothing is marked until you submit. You will see your score and every answer afterwards.', 'Spelling and hyphens count. Capitals and punctuation do not.', 'At 10, 5 and 1 minute left you get a warning. At zero the exam is submitted for you.', 'Your answers are saved as you go. If the page closes, come back to Mock exam to resume.'].map((r, i) => <div key={i} className="numrow" style={{ alignItems: 'flex-start' }}><span className="n">{i + 1}</span><span className="small grow" style={{ paddingTop: 5 }}>{r}</span></div>)}</div>
    <div className="card col gap8"><h3>Keyboard</h3><div className="row wrap gap8 small">{[['N', 'next'], ['P', 'previous'], ['F', 'flag'], ['1–5', 'choose an option'], ['R', 'review screen']].map(([k, t]) => <span key={k}><span className="kbd">{k}</span>{t}</span>)}</div><p className="tiny muted">Letter shortcuts work when you are not typing in an answer box.</p></div>
    <label className="row" style={{ gap: 10 }}><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} style={{ width: 22, height: 22 }} /><span className="small b">I have read the instructions.</span></label>
    <button className="btn block" disabled={!ok || busy} onClick={begin}>{busy ? 'Preparing your exam…' : 'Start exam'}</button>
  </div>
}

// ---- exam ------------------------------------------------------------------------------------------
export function MockExam() {
  const S = useStore(); const nav = useNavigate(); const d0 = S.mockDraft as MockDraft | null
  const [d, setD] = useState<MockDraft | null>(d0); const [items, setItems] = useState<Map<string, Item> | null>(null); const [m, setM] = useState<Manual | null>(null)
  const [now, setNow] = useState(Date.now()); const [nav2, setNav2] = useState(false); const [review, setReview] = useState(false); const [confirm, setConfirm] = useState(false); const [warn, setWarn] = useState(''); const [size, setSize] = useState(1)
  const submitted = useRef(false); const warned = useRef<Set<number>>(new Set())
  useEffect(() => { if (!d) return; loadManual(d.spec.manual as never).then(setM); Promise.all(d.spec.lessons.map(l => loadItems(d.spec.manual as never, l))).then(ls => setItems(new Map(ls.flat().map(i => [i.u, i])))) }, []) // eslint-disable-line
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t) }, [])
  const update = useCallback((f: (x: MockDraft) => MockDraft) => setD(x => { if (!x) return x; const n = f(x); S.set({ mockDraft: n }); return n }), [S])
  const left = d ? (d.endsAt - now) / 1000 : 0
  const submit = useCallback(() => {
    if (!d || !items || submitted.current) return; submitted.current = true
    const res = mark(d, items, m); S.set({ mocks: [...S.mocks, res.rec], mockDraft: null, points: S.points + res.rec.right * 10 })
    for (const r of res.rows) { const it = items.get(r.u)!; S.recordAnswer(d.spec.manual as never, it, r.ok, false, { ms: r.ms, mcq: r.mcq, mode: 'mock', wrote: r.ok ? undefined : r.wrote.slice(0, 200), expected: r.ok ? undefined : r.expected.slice(0, 200) }) }
    try { sessionStorage.setItem(`rhemlo.mock.${res.rec.id}`, JSON.stringify(res.rows)) } catch { /* */ }
    void syncNow(); nav(`/practice/mock/result/${res.rec.id}`, { replace: true })
  }, [d, items, m, S, nav])
  useEffect(() => { // time warnings and automatic submission
    if (!d || !items) return
    for (const mm of [10, 5, 1]) if (left <= mm * 60 && left > mm * 60 - 2 && !warned.current.has(mm)) { warned.current.add(mm); setWarn(`${mm} minute${mm === 1 ? '' : 's'} left.`); setTimeout(() => setWarn(''), 6000) }
    if (left <= 0) submit()
  }, [left <= 0, Math.floor(left)]) // eslint-disable-line
  const it = d && items ? items.get(d.items[d.i]) : undefined
  useEffect(() => { if (it && d && !d.shown[it.u]) update(x => ({ ...x, shown: { ...x.shown, [it.u]: Date.now() } })) }, [it?.u]) // eslint-disable-line
  const go = useCallback((i: number) => update(x => ({ ...x, i: Math.max(0, Math.min(x.items.length - 1, i)) })), [update])
  const flag = useCallback(() => it && update(x => ({ ...x, flags: x.flags.includes(it.u) ? x.flags.filter(y => y !== it.u) : [...x.flags, it.u] })), [it, update])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || confirm) return
      const key = e.key.toLowerCase()
      if (key === 'n' || e.key === 'ArrowRight') go((d?.i ?? 0) + 1); else if (key === 'p' || e.key === 'ArrowLeft') go((d?.i ?? 0) - 1); else if (key === 'f') flag(); else if (key === 'r') setReview(true)
      else if (/^[1-5]$/.test(key)) document.querySelectorAll<HTMLButtonElement>('.exam .opt')[+key - 1]?.click()
    }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  }, [go, flag, d?.i, confirm])
  const options = useMemo(() => it && d ? shuffleSeed(it.p.input.kind === 'multi' ? [...(it.a.items ?? []), ...it.d] : [it.a.text ?? '', ...it.d].filter(Boolean), it.u + d.id) : [], [it?.u, d?.id]) // eslint-disable-line
  if (!d) return <Navigate to="/practice/mock" replace />
  if (!items || !it) return <div className="focus"><div className="fbody"><div className="skel" style={{ height: 40 }} /><div className="skel" style={{ height: 160 }} /></div></div>
  const a = d.answers[it.u] ?? blankAnswer(it), mcq = !!d.mcq[it.u]
  const answered = (u: string) => { const x = items.get(u)!, ans = d.answers[u]; return !!ans && !!toResponse(x, ans, !!d.mcq[u]) }
  const nAns = d.items.filter(answered).length
  const setA = (f: (a: AState) => AState) => update(x => ({ ...x, answers: { ...x.answers, [it.u]: f(x.answers[it.u] ?? blankAnswer(it)) } }))
  const low = left < 300
  const Grid = ({ onPick }: { onPick: (i: number) => void }) => <div className="navgrid" role="list" aria-label="Question navigator">{d.items.map((u, i) => {
    const st = i === d.i ? 'cur' : d.flags.includes(u) ? 'flag' : answered(u) ? 'ans' : ''
    return <button key={u} role="listitem" className={`qn ${st} ${d.flags.includes(u) ? 'flagged' : ''}`} aria-label={`Question ${i + 1}, ${answered(u) ? 'answered' : 'not answered'}${d.flags.includes(u) ? ', flagged' : ''}${i === d.i ? ', current' : ''}`} onClick={() => onPick(i)}>{i + 1}</button>
  })}</div>
  return <div className="exam" style={{ ['--rh-text-scale' as string]: size }}>
    <header className="exhead">
      <div className="grow"><b className="disp">Rhemlo CBT</b><div className="tiny muted">{d.spec.title} · {S.profile.name}</div></div>
      <div className={`extimer ${low ? 'low' : ''}`} role="timer" aria-label={`Time left ${fmtTime(left)}`}><Icon n="clock" className="s" />{fmtTime(left)}</div>
      <div className="row gap8"><button className="iconbtn" aria-label="Smaller text" onClick={() => setSize(s => Math.max(.9, s - .1))}><b>A−</b></button><button className="iconbtn" aria-label="Larger text" onClick={() => setSize(s => Math.min(1.4, s + .1))}><b>A+</b></button></div>
    </header>
    {warn && <div className="exwarn" role="alert"><Icon n="alert" className="s" />{warn}</div>}
    <div className="exbody">
      <main className="exq">
        <div className="row between"><b className="disp">Question {d.i + 1} of {d.items.length}</b><button className={`chip lg ${d.flags.includes(it.u) ? 'due' : 'plain'}`} aria-pressed={d.flags.includes(it.u)} onClick={flag}><Icon n="flag" />{d.flags.includes(it.u) ? 'Flagged' : 'Flag for review'}</button></div>
        <h1 className="qtitle mt16">{it.p.instruction}</h1>
        <div className="col gap16 mt16"><Prompt item={{ ...it, p: { ...it.p, context: undefined } }} cur={0} lessonsN={n => `L${n}`} />
          <Answer key={it.u + mcq} item={it} a={a} setA={setA} mcq={mcq} grade={null} setCur={() => {}} titleToN={t => m?.lessons.find(l => normText(l.title) === normText(t))?.n} options={options} /></div>
        <footer className="exfoot"><button className="btn sec" disabled={d.i === 0} onClick={() => go(d.i - 1)}><Icon n="back" className="s" />Previous</button>
          <button className="btn sec mobonly3" onClick={() => setNav2(true)}>{nAns}/{d.items.length}</button>
          {d.i < d.items.length - 1 ? <button className="btn" onClick={() => go(d.i + 1)}>Next<Icon n="chev" className="s" /></button> : <button className="btn" onClick={() => setReview(true)}>Review &amp; submit</button>}</footer>
      </main>
      <aside className="exnav"><div className="row between"><b className="small">Questions</b><span className="tiny muted">{nAns} of {d.items.length} answered</span></div>
        <Grid onPick={go} /><Legend /><button className="btn block" onClick={() => setReview(true)}>Review &amp; submit</button></aside>
    </div>
    {nav2 && <Sheet label="Question navigator" onClose={() => setNav2(false)}><div className="col"><div className="row between"><h3>Questions</h3><span className="tiny muted">{nAns} of {d.items.length} answered</span></div><Grid onPick={i => { go(i); setNav2(false) }} /><Legend /><button className="btn block" onClick={() => { setNav2(false); setReview(true) }}>Review &amp; submit</button></div></Sheet>}
    {review && <Sheet label="Review before submitting" wide onClose={() => setReview(false)}><div className="col">
      <h2>Review before submitting</h2>
      <div className="grid3"><div className="stat center"><div className="v">{nAns}</div><div className="d">answered</div></div><div className="stat center"><div className="v" style={{ color: 'var(--rh-incorrect)' }}>{d.items.length - nAns}</div><div className="d">not answered</div></div><div className="stat center"><div className="v" style={{ color: 'var(--rh-apricot-deep)' }}>{d.flags.length}</div><div className="d">flagged</div></div></div>
      <p className="small muted">Tap a number to go back to it. Time left: {fmtTime(left)}.</p>
      <Grid onPick={i => { go(i); setReview(false) }} /><Legend />
      <div className="row gap8"><button className="btn sec grow" onClick={() => setReview(false)}>Return to exam</button><button className="btn grow" onClick={() => setConfirm(true)}>Submit exam</button></div></div></Sheet>}
    {confirm && <Sheet label="Confirm submission" onClose={() => setConfirm(false)}><div className="col"><h2>Submit your exam?</h2>
      <p className="muted">{d.items.length - nAns ? `${d.items.length - nAns} question${d.items.length - nAns === 1 ? ' is' : 's are'} not answered and will be marked wrong. ` : 'Every question is answered. '}You cannot change answers after submitting.</p>
      <div className="row gap8"><button className="btn sec grow" onClick={() => setConfirm(false)}>Go back</button><button className="btn grow" onClick={submit}>Submit now</button></div></div></Sheet>}
  </div>
}
const Legend = () => <div className="row wrap gap8 tiny muted"><span><i className="qn ans sm" />Answered</span><span><i className="qn sm" />Not answered</span><span><i className="qn flagged sm" />Flagged</span><span><i className="qn cur sm" />Current</span></div>

interface Row { u: string; ok: boolean; mcq: boolean; wrote: string; expected: string; t: string; lesson: string; ms: number; unanswered: boolean }
function mark(d: MockDraft, items: Map<string, Item>, m: Manual | null): { rec: MockRecord; rows: Row[] } {
  const rows: Row[] = d.items.map(u => {
    const it = items.get(u)!, ans = d.answers[u], mcq = !!d.mcq[u], r = ans ? toResponse(it, ans, mcq) : null
    const g = r ? gradeItem(it, r) : { correct: false, wrote: [''], expected: [it.a.text ?? it.a.items?.join(' · ') ?? ''] }
    return { u, ok: g.correct, mcq, wrote: g.wrote.join(' · '), expected: g.expected.join(' · '), t: it.t, lesson: lessonOfKey(it.s), ms: d.shown[u] ? Math.min(600000, Date.now() - d.shown[u]) : 0, unanswered: !r }
  })
  const tally = (key: (r: Row) => string) => rows.reduce<Record<string, [number, number]>>((acc, r) => { const k = key(r); acc[k] ??= [0, 0]; acc[k][1]++; if (r.ok) acc[k][0]++; return acc }, {})
  const right = rows.filter(r => r.ok).length, usedS = Math.min(d.spec.limitS, (Date.now() - d.startedAt) / 1000)
  const full = !!m && d.spec.lessons.length >= m.lessons.length
  return { rows, rec: { id: d.id, at: Date.now(), manual: d.spec.manual, lessons: d.spec.lessons, count: d.items.length, limitS: d.spec.limitS, usedS, score: rows.length ? right / rows.length : 0, right, total: rows.length,
    byLesson: tally(r => r.lesson), byType: tally(r => r.t), byFormat: tally(r => r.mcq ? 'mcq' : 'typed'), full, assignment: d.spec.assignment } }
}

// ---- score report ------------------------------------------------------------------------------------
export function MockResult() {
  const { id = '' } = useParams(); const S = useStore(); const nav = useNavigate(); const m = useManualData()
  const rec = S.mocks.find(x => x.id === id)
  const [rows] = useState<Row[] | null>(() => { try { return JSON.parse(sessionStorage.getItem(`rhemlo.mock.${id}`) ?? 'null') } catch { return null } })
  const [items, setItems] = useState<Map<string, Item> | null>(null); const [only, setOnly] = useState(true)
  useEffect(() => { if (rec && rows) Promise.all(rec.lessons.map(l => loadItems(rec.manual as never, l))).then(ls => setItems(new Map(ls.flat().map(i => [i.u, i])))) }, [rec?.id]) // eslint-disable-line
  if (!rec) return <Navigate to="/practice/mock" replace />
  const pct = (x: [number, number]) => x[1] ? Math.round(x[0] / x[1] * 100) : 0
  const lessonName = (id: string) => { const l = m?.lessons.find(x => x.id === id); return l ? `L${l.n} · ${niceTitle(l.title)}` : id }
  const caps = Object.entries(CAP_TYPES).map(([k, c]) => { const t = Object.entries(rec.byType).filter(([q]) => c.types.includes(q)).reduce<[number, number]>((a, [, v]) => [a[0] + v[0], a[1] + v[1]], [0, 0]); return { k, ...c, t } })
  const misses = S.mocks.filter(x => x.id === rec.id) && rows ? rows.filter(r => !r.ok).map(r => r.u) : []
  return <div className="page col gap16" style={{ maxWidth: 920 }}>
    <BackBar title="Score report" onBack={() => nav('/practice/mock')} />
    <div className="card col gap8" style={{ alignItems: 'center', textAlign: 'center' }}>
      <p className="eyebrow">{rec.full ? 'Full-manual mock' : `${rec.lessons.length} lessons`} · {new Date(rec.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>
      <b className="disp" style={{ fontSize: 56, lineHeight: '60px', color: rec.score >= PASS ? 'var(--rh-correct)' : 'var(--rh-action)' }}>{Math.round(rec.score * 100)}%</b>
      <p className="muted">{rec.right} of {rec.total} correct · time used {fmtTime(rec.usedS)} of {fmtTime(rec.limitS)}</p>
      <span className={`chip lg ${rec.score >= PASS ? 'ok' : 'due'}`}>{rec.score >= PASS ? 'At the 95% target' : `${Math.ceil(PASS * rec.total) - rec.right} more correct to reach 95%`}</span></div>
    <div className="withrail"><div className="col gap16">
      <div className="card col"><h3>By lesson</h3><div className="lbars">{Object.entries(rec.byLesson).sort().map(([l, v]) => <div key={l} className="r" style={{ gridTemplateColumns: '1fr 120px 46px' }}><span className="small">{lessonName(l)}</span><div className="bar thin"><i style={{ width: `${pct(v)}%`, background: pct(v) >= 95 ? 'var(--rh-node-done)' : 'var(--rh-action)' }} /></div><span className="small b" style={{ textAlign: 'right' }}>{v[0]}/{v[1]}</span></div>)}</div></div>
      <div className="card col"><h3>By question type</h3><div className="lbars">{Object.entries(rec.byType).sort((a, b) => pct(a[1]) - pct(b[1])).map(([t, v]) => <div key={t} className="r" style={{ gridTemplateColumns: '1fr 120px 46px' }}><span className="small">{KIND_LABEL[t] ?? t}</span><div className="bar thin"><i style={{ width: `${pct(v)}%` }} /></div><span className="small b" style={{ textAlign: 'right' }}>{v[0]}/{v[1]}</span></div>)}</div></div>
    </div><div className="rail col gap16">
      <div className="card col gap8"><h3>Typed vs choice</h3>{Object.entries(rec.byFormat).map(([f, v]) => <div key={f} className="row between small"><span>{f === 'mcq' ? 'Multiple choice' : 'Typed'}</span><b>{pct(v)}% · {v[0]}/{v[1]}</b></div>)}<p className="tiny muted">A typed pass is stronger evidence than a choice pass.</p></div>
      <div className="card col gap8"><h3>Capabilities</h3>{caps.filter(c => c.t[1]).map(c => <div key={c.k} className="row between small"><span>{c.k} · {c.name}</span><span className={`chip ${c.t[0] / c.t[1] >= c.target ? 'ok' : 'due'}`}>{pct(c.t)}%</span></div>)}</div>
      {misses.length > 0 && <button className="btn block" onClick={() => nav('/practice/session', { state: { spec: { kind: 'target', manual: rec.manual, lessons: rec.lessons, only: misses, count: misses.length, title: 'Mock misses' } } })}>Practise my {misses.length} misses</button>}
    </div></div>
    {rows && items ? <div className="card col"><div className="row between"><h3>Every answer</h3><div className="seg" style={{ width: 220 }}><button className={only ? 'on' : ''} onClick={() => setOnly(true)}>Misses</button><button className={!only ? 'on' : ''} onClick={() => setOnly(false)}>All</button></div></div>
      <div className="list">{rows.map((r, i) => ({ r, i })).filter(x => !only || !x.r.ok).map(({ r, i }) => { const it = items.get(r.u); return <div key={r.u} className="li" style={{ alignItems: 'flex-start' }}>
        <span className={`tile ${r.ok ? 'green' : 'red'}`} style={{ width: 32, height: 32 }}><Icon n={r.ok ? 'check' : 'x'} className="s" /></span>
        <div className="grow small"><b>{i + 1}. {it?.p.instruction}</b>{it?.p.text && <div className="tiny muted">{it.p.text.slice(0, 160)}</div>}
          {!r.ok && <div className="mt8"><span className="muted">You: </span>{r.unanswered ? <i>not answered</i> : r.wrote}<br /><span className="muted">Expected: </span><b className="okm">{r.expected}</b></div>}
          <div className="tiny faint mt8">{lessonName(r.lesson)} · {KIND_LABEL[r.t] ?? r.t} · {r.mcq ? 'choice' : 'typed'}</div></div></div> })}</div></div>
      : <p className="small muted">The answer-by-answer review is available on the device that took the exam, straight after submitting.</p>}
  </div>
}
