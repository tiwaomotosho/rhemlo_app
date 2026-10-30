import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { buildSession, KIND_LABEL, lessonOfKey, shuffleSeed } from '@/lib/engine'
import { loadItems, readInContext } from '@/lib/data'
import { gradeItem, type Grade } from '@/lib/grade'
import { day, useStore, type Draft, type SessionSpec } from '@/lib/store'
import type { Item, Response, SittingRecord } from '@/lib/types'
import { Glim, Icon, Loading, Sheet } from '@/ui/bits'

const OFF = { autoComplete: 'off', autoCorrect: 'off', autoCapitalize: 'off', spellCheck: false, 'data-lpignore': 'true', 'data-1p-ignore': 'true' } as const
const MIN = (n: number) => Math.max(1, Math.round(n * 0.4))

function Passage({ text }: { text: string }) {
  const parts = text.split('____'), many = parts.length > 2
  return <p className="passage">{parts.map((s, i) => <span key={i}>{s}{i < parts.length - 1 && <span className="gap" aria-label={`blank ${i + 1}`}>{many ? i + 1 : ''}</span>}</span>)}</p>
}

function Context({ item }: { item: Item }) {
  const p = item.p
  return <>
    {p.title && <p className="eyebrow">{p.lesson ? `Lesson ${p.lesson} · ` : ''}{p.title}</p>}
    {p.ref && item.t !== 'Q05' && <span className="pill" style={{ alignSelf: 'flex-start' }}><Icon n="book" />{p.ref}</span>}
    {p.text && <Passage text={p.text} />}
    {p.letters && <p className="passage" style={{ letterSpacing: '.06em' }}>{p.letters}</p>}
    {p.previous && <p className="passage"><span className="muted small">Previous item</span><br />{p.previous}</p>}
    {p.outline && <ol className="passage" style={{ margin: 0, paddingLeft: 36 }}>{p.outline.map(o => <li key={o}>{o}</li>)}</ol>}
    {p.speak && <button className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(p.speak!); u.lang = 'en-US'; u.rate = .92; speechSynthesis.speak(u) }}><Icon n="speaker" />Play</button>}
    {item.p.first_letter && <p className="hint"><Icon n="info" />Starts with “{item.p.first_letter}”.</p>}
  </>
}

function Answer({ item, locked, grade, onResponse, onEnter }: { item: Item; locked: boolean; grade: Grade | null; onResponse: (r: Response | null) => void; onEnter: () => void }) {
  const kind = item.p.input.kind, mcq = kind === 'choice' || !item.f.includes('typed')
  const [text, setText] = useState(''); const [vals, setVals] = useState<string[]>(() => Array(item.p.input.count ?? 1).fill(''))
  const [sel, setSel] = useState(''); const [chosen, setChosen] = useState<number[]>([]); const [pick, setPick] = useState<number | null>(null)
  const first = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  useEffect(() => { if (!locked) first.current?.focus({ preventScroll: true }) }, [locked])
  const options = useMemo(() => shuffleSeed([item.a.text ?? '', ...item.d].filter(Boolean), item.u), [item])
  const bank = item.p.bank ?? [], shuffled = item.p.shuffled ?? []
  const words = useMemo(() => (item.p.text ?? '').split(/\s+/).filter(Boolean), [item])
  const key = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); onEnter() } }

  useEffect(() => {
    if (mcq) onResponse(sel ? { kind: 'choice', value: sel } : null)
    else if (kind === 'fields') onResponse(vals.every(v => v.trim()) ? { kind: 'fields', values: vals } : null)
    else if (kind === 'order') onResponse(chosen.length === shuffled.length && shuffled.length ? { kind: 'order', values: chosen.map(i => shuffled[i]) } : null)
    else if (kind === 'word_bank') onResponse(chosen.length ? { kind: 'bank', values: chosen.map(i => bank[i]) } : null)
    else if (kind === 'spot_error') onResponse(pick !== null && text.trim() ? { kind: 'text', value: text } : null)
    else onResponse(text.trim() ? { kind: 'text', value: text } : null)
  }, [text, vals, sel, chosen, pick]) // eslint-disable-line

  const note = item.p.input.note
  const hint = note && <p className="hint"><Icon n="info" />{note}</p>

  if (mcq) return <div className="col" role="radiogroup" aria-label="Choices">{options.map((o, i) => {
    const right = locked && grade && o.trim().toLowerCase() === (item.a.text ?? '').trim().toLowerCase()
    return <button key={o} role="radio" aria-checked={sel === o} className={`opt ${sel === o ? 'sel' : ''}`} disabled={locked} onClick={() => setSel(o)}
      style={locked && right ? { borderColor: 'var(--rh-correct)', background: 'var(--rh-correct-bg)' } : undefined}><span className="k">{'ABCD'[i]}</span><span className="grow">{o}</span>{locked && right && <Icon n="check" />}</button>
  })}</div>

  if (kind === 'fields') return <div className="col" onKeyDown={key}>{vals.map((v, i) => <div key={i}><label className="lbl" htmlFor={`f${i}`}>{item.p.input.labels?.[i] ?? `Box ${i + 1}`}{locked && grade?.parts && <> — {grade.parts[i] ? 'correct' : 'not quite'}</>}</label>
    <input id={`f${i}`} ref={i === 0 ? first : undefined} className="field" value={v} readOnly={locked} {...OFF} enterKeyHint={i === vals.length - 1 ? 'done' : 'next'}
      style={locked && grade?.parts ? { borderColor: grade.parts[i] ? 'var(--rh-correct)' : 'var(--rh-incorrect)' } : undefined}
      onChange={e => setVals(vals.map((x, j) => j === i ? e.target.value : x))} /></div>)}{hint}</div>

  if (kind === 'order') return <div className="col">
    <div><span className="lbl">Your order</span><div className="col" style={{ gap: 8 }}>{chosen.length ? chosen.map((i, n) => <button key={i} className="opt sel" disabled={locked} onClick={() => setChosen(chosen.filter(x => x !== i))}><span className="k">{n + 1}</span><span className="grow">{shuffled[i]}</span></button>) : <div className="tray muted small">Tap the sentences below in the order they are printed.</div>}</div></div>
    <div className="col" style={{ gap: 8 }}>{shuffled.map((s, i) => !chosen.includes(i) && <button key={i} className="opt" disabled={locked} onClick={() => setChosen([...chosen, i])}><span className="grow">{s}</span></button>)}</div></div>

  if (kind === 'word_bank') return <div className="col">
    <div className="tray" aria-live="polite">{chosen.length ? chosen.map((i, n) => <button key={n} className="tile pick" disabled={locked} onClick={() => setChosen(chosen.filter((_, j) => j !== n))}>{bank[i]}</button>) : <span className="muted small">Tap the words in the order printed.</span>}</div>
    <div className="row wrap" style={{ gap: 8 }}>{bank.map((w, i) => <button key={i} className={`tile ${chosen.includes(i) ? 'used' : ''}`} disabled={locked || chosen.includes(i)} onClick={() => setChosen([...chosen, i])}>{w}</button>)}</div>{hint}</div>

  if (kind === 'spot_error') return <div className="col" onKeyDown={key}>
    <div className="wordline">{words.map((w, i) => <button key={i} className={pick === i ? 'pick' : ''} disabled={locked} onClick={() => { setPick(i); setText('') ; first.current?.focus() }}>{w}</button>)}</div>
    <div><label className="lbl" htmlFor="fix">{pick === null ? 'Tap the word first' : `Type “${words[pick]}” as printed`}</label>
      <input id="fix" ref={first} className="field" value={text} readOnly={locked} disabled={pick === null} {...OFF} onChange={e => setText(e.target.value)} /></div>{hint}</div>

  const long = kind === 'long_text'
  return <div className="col" onKeyDown={key}>
    <label className="lbl" htmlFor="ans">{kind === 'reference' ? 'Reference' : kind === 'lesson' ? 'Lesson number or title' : 'Your answer'}</label>
    {long ? <textarea id="ans" ref={first as never} className="field" rows={4} value={text} readOnly={locked} {...OFF} onChange={e => setText(e.target.value)} />
      : <input id="ans" ref={first} className="field" value={text} readOnly={locked} {...OFF} enterKeyHint="done" placeholder={kind === 'reference' ? ((item.p.input.count ?? 1) > 1 ? 'e.g. Col 1:17; Isa 55:9' : 'e.g. Col 1:17') : undefined} onChange={e => setText(e.target.value)} />}
    {hint}</div>
}

function ContextSheet({ refs, onClose }: { refs: string[]; onClose: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof readInContext>>[] | null>(null)
  useEffect(() => { Promise.all(refs.map(readInContext)).then(setData) }, [refs])
  return <Sheet label="Read in context" onClose={onClose}><div className="col"><p className="eyebrow">KJV</p>
    {!data ? <p className="muted">Loading…</p> : data.map((d, i) => d ? <div key={i}><h3>{d.ref}</h3>{d.verses.map(v => <p key={v.n} className={`ctxv ${v.hit ? 'hit' : ''}`}><sup>{v.n}</sup><span>{v.t}</span></p>)}</div> : <p key={i} className="muted">{refs[i]} is not available offline yet.</p>)}
    <button className="btn ghost block" onClick={onClose}>Close</button></div></Sheet>
}

export default function Session() {
  const loc = useLocation(); const nav = useNavigate(); const S = useStore()
  const spec0 = (loc.state as { spec?: SessionSpec } | null)?.spec
  const [items, setItems] = useState<Map<string, Item> | null>(null); const [draft, setDraft] = useState<Draft | null>(null)
  const [empty, setEmpty] = useState(false); const [resp, setResp] = useState<Response | null>(null)
  const [grade, setGrade] = useState<Grade | null>(null); const [ctx, setCtx] = useState(false); const [fin, setFin] = useState<SittingRecord | null>(null)
  const booted = useRef(false); const dRef = useRef<Draft | null>(null)
  const save = (d: Draft) => { dRef.current = d; setDraft(d); S.setDraft(d) }

  useEffect(() => {
    if (booted.current) return; booted.current = true
    ;(async () => {
      if (spec0) {
        const { items: its } = await buildSession(spec0, S.cards, S.ladder)
        if (!its.length) { setEmpty(true); return }
        setItems(new Map(its.map(i => [i.u, i])))
        save({ id: crypto.randomUUID(), spec: spec0, queue: its.map(i => i.u), index: 0, right: 0, startedAt: Date.now(), misses: [], again: [], answered: [] })
      } else if (S.draft) {
        const lists = await Promise.all(S.draft.spec.lessons.map(l => loadItems(S.draft!.spec.manual, l)))
        setItems(new Map(lists.flat().map(i => [i.u, i]))); save(S.draft)
      } else setEmpty(true)
    })()
  }, []) // eslint-disable-line

  const leave = useCallback(() => nav(fin ? '/journey' : '/journey', { replace: true }), [nav, fin])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !ctx) leave() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [leave, ctx])

  const item = draft && items ? items.get(draft.queue[draft.index]) : undefined
  const check = useCallback(() => {
    if (!item || !resp || grade || !draft) return
    const g = gradeItem(item, resp); setGrade(g)
    S.recordAnswer(draft.spec.manual, item, g.correct, false)
    if (g.correct && ['Q27', 'Q28', 'Q04'].includes(item.t)) S.markLadder(draft.spec.manual, lessonOfKey(item.s), item.t === 'Q27' ? 'q27' : item.t === 'Q28' ? 'q28' : 'q04')
    const retry = !g.correct && !draft.again.includes(item.u)
    save({ ...draft, right: draft.right + (g.correct ? 1 : 0), queue: retry ? [...draft.queue, item.u] : draft.queue, again: retry ? [...draft.again, item.u] : draft.again,
      misses: g.correct ? draft.misses : [...draft.misses, { u: item.u, wrote: g.wrote.join(' · '), expected: g.expected.join(' · ') }] })
  }, [item, resp, grade, draft]) // eslint-disable-line

  const next = useCallback(() => {
    const d = dRef.current; if (!d || !grade) return
    setGrade(null); setResp(null)
    if (d.index + 1 >= d.queue.length) {
      const total = d.queue.length - d.again.length
      const rec: SittingRecord = { id: d.id, at: Date.now(), manual: d.spec.manual, kind: d.spec.kind, lesson: d.spec.lessons.length === 1 ? d.spec.lessons[0] : undefined,
        total, right: Math.min(total, d.queue.slice(0, total).filter(u => !d.misses.some(m => m.u === u)).length), misses: d.misses, minutes: Math.max(1, Math.round((Date.now() - d.startedAt) / 60000)) }
      S.completeSitting(rec); setFin(rec); S.set({ activeDays: S.activeDays.includes(day()) ? S.activeDays : [...S.activeDays, day()] })
    } else save({ ...d, index: d.index + 1 })
  }, [grade]) // eslint-disable-line

  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Enter' && grade && (e.target as HTMLElement).tagName !== 'BUTTON') next() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [grade, next])

  if (!spec0 && !S.draft && !fin) return <Navigate to="/journey" replace />
  if (empty) return <div className="splash"><Glim pose="shrug" size={160} /><h2>Nothing to practise here yet</h2><p className="muted" style={{ maxWidth: 360 }}>There are no cards due or matching this choice. Try a quest from the Journey instead.</p><button className="btn" onClick={() => nav('/journey', { replace: true })}>Back to Journey</button></div>
  if (fin) return <Done rec={fin} spec={draft?.spec ?? spec0!} />
  if (!draft || !items || !item) return <Loading text="Setting up your sitting…" />

  const total = draft.queue.length, retrying = draft.queue.indexOf(item.u) < draft.index
  const refs = item.a.refs?.map(r => r.key) ?? (item.p.ref ? [item.p.ref] : [])
  return <div className="focus">
    <div className="ftop"><button className="iconbtn" aria-label="Save and leave" onClick={leave}><Icon n="x" /></button>
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={draft.index}><i className="s" style={{ width: `${(draft.index / total) * 100}%`, background: 'var(--rh-action)' }} /></div>
      <span className="small" style={{ fontWeight: 800, minWidth: 64, textAlign: 'right' }}>{draft.index + 1} of {total}</span></div>
    <div className="fbody">
      <div className="qtype"><span className="pill">{KIND_LABEL[item.t] ?? item.t}</span>{retrying && <span className="again">Again — you missed this one</span>}<span className="small muted grow" style={{ textAlign: 'right' }}>{draft.spec.title} · about {MIN(total)} min</span></div>
      {item.p.context && <p className="small muted">{item.p.context}</p>}
      <h1 className="prompt">{item.p.instruction}</h1>
      <Context item={item} />
      <Answer key={`${item.u}${draft.index}`} item={item} locked={!!grade} grade={grade} onResponse={setResp} onEnter={check} />
    </div>
    {!grade ? <div className="fbar"><div className="row"><button className="btn quiet" onClick={leave}>Save &amp; leave</button><button className="btn grow" disabled={!resp} onClick={check}>Check</button></div></div> :
      <div className={`fbar ${grade.correct ? 'good' : 'bad'}`} role="status" aria-live="polite"><div>
        <div className="head"><Glim pose={grade.correct ? 'cheer' : 'think'} size={256} style={{ width: 56, height: 56 }} />
          <Icon n={grade.correct ? 'check' : 'x'} className="big" /><h3 className="grow">{grade.correct ? 'Correct' : 'Not quite'}</h3>{grade.correct && <span className="xp">+10 XP</span>}</div>
        {!grade.correct && <div className="diff">
          <div className="ln w"><b>You wrote</b><span>{grade.wrote.join(' · ') || '—'}</span></div><div className="ln e"><b>Expected</b><span>{grade.expected.join(' · ')}</span></div></div>}
        {!grade.correct && draft.queue.lastIndexOf(item.u) > draft.index && <p className="small" style={{ marginBottom: 10 }}>You'll see this one again before the end.</p>}
        <div className="row">{refs.length > 0 && <button className="btn ghost sm" onClick={() => setCtx(true)}>Read {refs[0].length > 18 ? 'in context' : refs[0] + ' in context'}</button>}
          <button className={`btn grow ${grade.correct ? 'good' : 'bad'}`} onClick={next} autoFocus>{draft.index + 1 >= total ? 'Finish' : 'Continue'}</button></div>
      </div></div>}
    {ctx && <ContextSheet refs={refs.slice(0, 2)} onClose={() => setCtx(false)} />}
  </div>
}

function Done({ rec, spec }: { rec: SittingRecord; spec: SessionSpec }) {
  const nav = useNavigate(); const done = useStore(s => s.done); const pct = rec.total ? rec.right / rec.total : 0
  const cleared = (rec.kind === 'quest' || rec.kind === 'ladder') && rec.lesson && !!done[`${rec.manual}|${rec.lesson}`]
  return <div className="splash" style={{ justifyContent: 'flex-start', paddingTop: 32, maxWidth: 560, margin: '0 auto' }}>
    <Glim pose={pct >= .8 ? 'celebrate' : pct >= .5 ? 'cheer' : 'confident'} size={256} />
    <p className="eyebrow">Sitting complete</p><h1>{rec.right} of {rec.total} right</h1>
    <div className="stat" style={{ width: '100%' }}><div className="card"><b>+{rec.right * 10}</b><span className="small muted">XP</span></div><div className="card"><b>{Math.round(pct * 100)}%</b><span className="small muted">accuracy</span></div><div className="card"><b>{rec.minutes}</b><span className="small muted">min</span></div></div>
    {cleared && <span className="pill ok"><Icon n="check" />Lesson cleared — the next stop is open</span>}
    {rec.misses.length > 0 && <div className="card col" style={{ width: '100%', textAlign: 'left' }}><h3>Worth another look</h3>
      {rec.misses.slice(0, 6).map(m => <div key={m.u} className="diff" style={{ margin: 0 }}><div className="ln w"><b>You wrote</b><span>{m.wrote || '—'}</span></div><div className="ln e"><b>Expected</b><span>{m.expected}</span></div></div>)}
      <p className="small muted">These return in your reviews, sooner than the ones you got right.</p></div>}
    <div className="col" style={{ width: '100%' }}><button className="btn block" onClick={() => nav('/journey', { replace: true })}>Back to Journey</button>
      <button className="btn ghost block" onClick={() => nav('/session', { replace: true, state: { spec } })}>Another sitting</button></div>
  </div>
}
