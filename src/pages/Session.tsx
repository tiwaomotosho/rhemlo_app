import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { buildSession, KIND_LABEL, lessonOfKey, niceTitle, shuffleSeed } from '@/lib/engine'
import { loadItems, loadManual } from '@/lib/data'
import { gradeItem, normText, typedRefs, type Grade } from '@/lib/grade'
import { useStore, type Draft, type SessionSpec } from '@/lib/store'
import type { Item, Manual, Response, SittingRecord } from '@/lib/types'
import { ContextSheet, Glim, Icon, Sheet, StateCard, asset } from '@/ui/bits'

const OFF = { autoComplete: 'off', autoCorrect: 'off', autoCapitalize: 'off', spellCheck: false, 'data-lpignore': 'true', 'data-1p-ignore': 'true', 'data-form-type': 'other' } as const
const STANDING = 'Spelling and hyphens count. Capitals and punctuation do not.'
const BOOK_NAMES = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalm', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation']
const LADDER_NAME: Record<string, string> = { Q27: 'Build', Q28: 'Fade', Q06: 'Fill', Q04: 'Full recall' }
const label = (t: string) => LADDER_NAME[t] ?? KIND_LABEL[t] ?? t
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
const ctxShort = (c?: string) => { if (!c) return ''; const p = c.split(/\s*[·\u00b7]\s*/); return p.length > 2 ? `${p[0]} · ${p[p.length - 1]}` : c }

// ---- prompt pieces -----------------------------------------------------------------------------
function Blanks({ text, cur, src }: { text: string; cur: number; src?: string }) {
  const parts = text.split('____')
  return <div className="pcard">{parts.map((s, i) => <span key={i}>{s}{i < parts.length - 1 && <span className={`blank ${i === cur ? 'cur' : ''}`} aria-label={`blank ${i + 1}`} />}</span>)}{src && <span className="src">{src}</span>}</div>
}
function AudioCard({ text }: { text: string }) {
  const [on, setOn] = useState(false); const [rate, setRate] = useState(1); const [show, setShow] = useState(false)
  const play = () => { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en-GB'; u.rate = rate; u.onend = () => setOn(false); setOn(true); speechSynthesis.speak(u) }
  useEffect(() => () => speechSynthesis.cancel(), [])
  const bars = useMemo(() => Array.from({ length: 34 }, (_, i) => 30 + Math.round(60 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * .6)))), [])
  return <div className="pcard audio">
    <div className="row"><button className="play" aria-label={on ? 'Stop' : 'Play the sentence'} onClick={() => on ? (speechSynthesis.cancel(), setOn(false)) : play()}><Icon n={on ? 'pause' : 'play'} /></button>
      <div className={`wave ${on ? 'on' : ''}`} aria-hidden>{bars.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div></div>
    <div className="row wrap gap8"><button className="chip lg plain" onClick={() => setRate(r => r >= 1.2 ? .8 : +(r + .2).toFixed(1))}><Icon n="clock" />{rate}×</button>
      <button className="chip lg plain" onClick={play}><Icon n="undo" />Replay</button><button className="chip lg plain" aria-pressed={show} onClick={() => setShow(!show)}><Icon n="letter" />{show ? 'Hide text' : 'Show text'}</button></div>
    {show && <p className="small">{text}</p>}
  </div>
}

function Prompt({ item, cur, lessonsN }: { item: Item; cur: number; lessonsN: (n: number) => string }) {
  const p = item.p, t = item.t
  if (t === 'Q04') return <><div className="row"><Glim pose="celebrate" size={64} still /><div><b className="disp" style={{ fontSize: 17 }}>Full recall unlocked</b><div className="tiny muted">Build and Fade were right for this verse</div></div></div>
    <div className="pcard"><p className="eyebrow">Type the memory verse</p><b className="disp">{p.context?.split(/\s*[·\u00b7]\s*/)[0]} · {p.ref}</b></div></>
  if (t === 'Q07') return <div className="pcard"><p className="eyebrow">Lesson {p.lesson}</p><b className="disp">{p.title}</b></div>
  if (p.outline) return <div className="pcard col gap8">{p.outline.map((o, i) => <div key={o} className="numrow"><span className="n">{i + 1}</span><b>{o}</b></div>)}</div>
  if (p.speak) return <AudioCard text={p.speak} />
  if (p.letters) return <div className="letters" aria-label={`First letters: ${p.letters}`}>{p.letters.split(/\s+/).map((w, i) => <span key={i}>{w}</span>)}</div>
  if (p.previous) return <div className="pcard quote"><span className="tiny muted b">Previous item</span><br />{p.previous}</div>
  if (t === 'Q26' || t === 'Q27') return null
  return <>
    {p.lessons && <div className="row gap8">{p.lessons.map(n => <span key={n} className="chip">{lessonsN(n)}</span>)}</div>}
    {p.text && (p.text.includes('____') ? <Blanks text={p.text} cur={cur} src={p.ref} /> : <div className={`pcard ${t === 'Q15' ? 'quote' : ''}`}>{t === 'Q15' ? `“${p.text}”` : p.text}{p.ref && t !== 'Q05' && <span className="src">{p.ref}</span>}</div>)}
    {!p.text && p.ref && t !== 'Q10' && <span className="chip lg" style={{ alignSelf: 'flex-start' }}><Icon n="bookmark" />{p.ref}</span>}
    {p.title && t !== 'Q07' && <div className="pcard"><p className="eyebrow">Lesson {p.lesson}</p><b className="disp">{p.title}</b></div>}
  </>
}

// ---- answer area -------------------------------------------------------------------------------------
type AState = { text: string; vals: string[]; sel: string; chosen: number[]; pick: number | null; book: string; cv: string; typeRef: boolean; order: number[] }
function useAnswer(item: Item) {
  const n = item.p.input.count ?? 1
  return useState<AState>({ text: '', vals: Array(n).fill(''), sel: '', chosen: [], pick: null, book: '', cv: '', typeRef: false, order: (item.p.shuffled ?? []).map((_, i) => i) })
}
export function toResponse(item: Item, a: AState, mcq: boolean): Response | null {
  const k = item.p.input.kind
  if (mcq) return a.sel ? { kind: 'choice', value: a.sel } : null
  if (k === 'fields') return a.vals.every(v => v.trim()) ? { kind: 'fields', values: a.vals } : null
  if (k === 'order') return { kind: 'order', values: a.order.map(i => item.p.shuffled![i]) }
  if (k === 'word_bank') return a.chosen.length ? { kind: 'bank', values: a.chosen.map(i => item.p.bank![i]) } : null
  if (k === 'spot_error') return a.pick !== null && a.text.trim() ? { kind: 'text', value: a.text } : null
  if (k === 'reference') {
    if ((item.p.input.count ?? 1) > 1) return a.vals.every(v => v.trim()) ? { kind: 'text', value: a.vals.join('; ') } : null
    if (a.typeRef) return a.text.trim() ? { kind: 'text', value: a.text } : null
    return a.book.trim() && a.cv.trim() ? { kind: 'text', value: `${a.book.trim()} ${a.cv.trim()}` } : null
  }
  return a.text.trim() ? { kind: 'text', value: a.text } : null
}

function FieldBox({ id, label: lab, value, onChange, state, inputRef, onFocus, ...rest }: { id: string; label: string; value: string; onChange: (v: string) => void; state?: boolean; inputRef?: (e: HTMLInputElement | null) => void; onFocus?: () => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  return <div><label className="lbl" htmlFor={id}>{lab}</label><div className={`fwrap ${state === true ? 'ok' : state === false ? 'bad' : ''}`}>{state !== undefined && <Icon n={state ? 'check' : 'x'} className="s" />}
    <input id={id} ref={inputRef} className="field" value={value} readOnly={state !== undefined} onFocus={onFocus} onChange={e => onChange(e.target.value)} {...OFF} {...rest} /></div></div>
}

function Answer({ item, a, setA, mcq, grade, setCur, titleToN }: { item: Item; a: AState; setA: (f: (a: AState) => AState) => void; mcq: boolean; grade: Grade | null; setCur: (n: number) => void; titleToN: (t: string) => number | undefined }) {
  const k = item.p.input.kind, locked = !!grade, n = item.p.input.count ?? 1
  const refs = useRef<(HTMLInputElement | HTMLTextAreaElement | null)[]>([])
  useEffect(() => { if (!locked && matchMedia('(min-width:640px)').matches) refs.current[0]?.focus({ preventScroll: true }) }, [item.u, mcq]) // eslint-disable-line
  const options = useMemo(() => shuffleSeed([item.a.text ?? '', ...item.d].filter(Boolean), item.u), [item])
  const note = item.p.input.note && !mcq ? <p className="hint"><Icon n="spell" />{k === 'spot_error' ? 'Your device will not autocorrect here. That is on purpose.' : item.p.input.note.includes('reference picker') ? '“1 tim 4:8” and “1 Timothy 4:8” both work. Capitals and spacing are forgiven; numbers are not.' : item.p.input.note.replace(/^One box each, in order\. /, '')}</p> : null
  const right = (o: string) => normText(o) === normText(item.a.text ?? '')

  if (mcq) return <div className="col gap8" role="radiogroup" aria-label="Choices">{options.map((o, i) => {
    const st = locked ? (right(o) ? 'right' : a.sel === o ? 'wrong' : '') : a.sel === o ? 'sel' : ''
    const ln = k === 'lesson' ? titleToN(o) : undefined
    return <button key={o} role="radio" aria-checked={a.sel === o} className={`opt ${st}`} disabled={locked} onClick={() => setA(x => ({ ...x, sel: o }))}>
      <span className="k">{'ABCDEF'[i]}</span><span className="grow">{k === 'lesson' ? niceTitle(o) : o}</span>{ln && <span className="ln">L{ln}</span>}{st === 'right' && <Icon n="check" style={{ color: 'var(--rh-correct)' }} />}</button>
  })}{k === 'lesson' && <p className="hint"><Icon n="info" />Options come from easily-confused lessons.</p>}</div>

  if (k === 'fields') {
    const labels = item.p.input.labels ?? [], blanky = (item.p.text ?? '').includes('____')
    const ordered = item.a.ordered !== false
    const box = (i: number) => <FieldBox key={i} id={`f${i}`} label={blanky ? `Blank ${i + 1}` : labels[i] ?? `Item ${i + 1}`} value={a.vals[i]} state={locked ? grade?.parts?.[i] : undefined}
      inputRef={e => { refs.current[i] = e }} onFocus={() => setCur(i)} enterKeyHint={i === n - 1 ? 'done' : 'next'}
      onKeyDown={e => { if (e.key === 'Enter' && i < n - 1) { e.preventDefault(); refs.current[i + 1]?.focus() } }}
      onChange={v => setA(x => ({ ...x, vals: x.vals.map((y, j) => j === i ? v : y) }))} />
    return <div className="col">
      {!blanky && <p className="qsub">{ordered ? 'In order' : 'Any order'} · one per box</p>}
      {blanky ? <div className="blankgrid">{a.vals.map((_, i) => box(i))}</div> : item.t === 'Q13' || item.t === 'Q02' ? <div className="col gap8">{a.vals.map((_, i) => <div key={i} className="numrow"><span className="n">{i + 1}</span><div className="grow">{box(i)}</div></div>)}</div> : <div className="fields1">{a.vals.map((_, i) => box(i))}</div>}
      {note}</div>
  }

  if (k === 'order') {
    const sh = item.p.shuffled ?? []
    const move = (i: number, d: number) => setA(x => { const o = [...x.order]; const j = i + d; if (j < 0 || j >= o.length) return x; [o[i], o[j]] = [o[j], o[i]]; return { ...x, order: o } })
    return <div className="col gap8" role="list" aria-label="Sentences in your order">{a.order.map((si, i) => {
      const st = locked && grade?.parts ? (grade.parts[i] ? { borderColor: 'var(--rh-correct)', background: 'var(--rh-correct-bg)' } : { borderColor: 'var(--rh-incorrect)', background: 'var(--rh-incorrect-bg)' }) : undefined
      return <div key={si} role="listitem" className="ordrow" style={st} draggable={!locked}
        onDragStart={e => e.dataTransfer.setData('text/plain', String(i))} onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const from = +e.dataTransfer.getData('text/plain'); setA(x => { const o = [...x.order]; const [m] = o.splice(from, 1); o.splice(i, 0, m); return { ...x, order: o } }) }}>
        <Icon n="grip" className="grip s" /><span className="grow">{sh[si]}</span>
        {!locked && <span className="mv"><button aria-label={`Move sentence ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><Icon n="up" className="s" /></button><button aria-label={`Move sentence ${i + 1} down`} disabled={i === a.order.length - 1} onClick={() => move(i, 1)}><Icon n="down" className="s" /></button></span>}</div>
    })}<p className="tiny muted">Drag, or use the arrows. Check when the order matches the manual.</p></div>
  }

  if (k === 'word_bank') {
    const bank = item.p.bank ?? [], total = item.a.words?.length ?? 0
    return <div className="col">
      <div className="tray" aria-live="polite" aria-label="Your verse so far">{a.chosen.map((i, j) => <button key={j} className="wt in" disabled={locked} onClick={() => setA(x => ({ ...x, chosen: x.chosen.filter((_, q) => q !== j) }))}>{bank[i]}</button>)}{!locked && <span className="slot" aria-hidden />}</div>
      <div className="tools"><button className="chip lg plain" disabled={locked || !a.chosen.length} onClick={() => setA(x => ({ ...x, chosen: x.chosen.slice(0, -1) }))}><Icon n="undo" />Undo</button>
        <button className="chip lg plain" disabled={locked || !a.chosen.length} onClick={() => setA(x => ({ ...x, chosen: [] }))}><Icon n="trash" />Reset</button><span className="grow" /><span className="tiny muted">{a.chosen.length} of {total} words</span></div>
      <div className="pool">{bank.map((w, i) => <button key={i} className={`wt ${a.chosen.includes(i) ? 'used' : ''}`} disabled={locked || a.chosen.includes(i)} onClick={() => setA(x => ({ ...x, chosen: [...x.chosen, i] }))}>{w}</button>)}</div>
    </div>
  }

  if (k === 'spot_error') {
    const ws = (item.p.text ?? '').split(/\s+/).filter(Boolean)
    return <div className="col">
      <div className="pcard"><div className="wordline">{ws.map((w, i) => <button key={i} className={a.pick === i ? 'pick' : ''} aria-pressed={a.pick === i} disabled={locked} onClick={() => { setA(x => ({ ...x, pick: i, text: '' })); setTimeout(() => refs.current[0]?.focus(), 0) }}>{w}</button>)}</div></div>
      <FieldBox id="fix" label={a.pick === null ? 'Tap the misspelt word first' : `Correct spelling of “${ws[a.pick].replace(/[^\p{L}\p{N}'’-]/gu, '')}”`} value={a.text} disabled={a.pick === null} state={locked ? grade?.correct : undefined}
        inputRef={e => { refs.current[0] = e }} onChange={v => setA(x => ({ ...x, text: v }))} />{note}</div>
  }

  if (k === 'reference') {
    if (n > 1) return <div className="col">{a.vals.map((v, i) => <FieldBox key={i} id={`r${i}`} label={`Reference ${i + 1} of ${n}`} value={v} placeholder="e.g. Col 1:17" state={locked ? grade?.correct : undefined}
      inputRef={e => { refs.current[i] = e }} onChange={x => setA(s => ({ ...s, vals: s.vals.map((y, j) => j === i ? x : y) }))} />)}<p className="hint"><Icon n="info" />Any order. “1 tim 4:8” and “1 Timothy 4:8” both work.</p></div>
    if (a.typeRef) return <div className="col"><FieldBox id="ref" label="Reference" value={a.text} placeholder="e.g. 1 Tim 4:8" state={locked ? grade?.correct : undefined} inputRef={e => { refs.current[0] = e }} onChange={v => setA(x => ({ ...x, text: v }))} />
      {!locked && <button className="chip lg plain" style={{ alignSelf: 'flex-start' }} onClick={() => setA(x => ({ ...x, typeRef: false }))}><Icon n="book" />Use the book picker</button>}{note}</div>
    const q = a.book.trim().toLowerCase().replace(/\s+/g, ' ')
    const sugg = q ? BOOK_NAMES.filter(b => b.toLowerCase().startsWith(q) || b.toLowerCase().replace(' ', '').startsWith(q.replace(' ', ''))).slice(0, 4) : []
    return <div className="col">
      <div><label className="lbl" htmlFor="bk">Book</label><div className={`fwrap ${locked ? (grade?.correct ? 'ok' : 'bad') : ''}`}>{locked && <Icon n={grade?.correct ? 'check' : 'x'} className="s" />}
        <input id="bk" ref={e => { refs.current[0] = e }} className="field" value={a.book} readOnly={locked} {...OFF} placeholder="e.g. 1 Tim" onChange={e => setA(x => ({ ...x, book: e.target.value }))} /></div>
        {!locked && sugg.length > 0 && !BOOK_NAMES.includes(a.book) && <div className="refbook">{sugg.map(b => <button key={b} className="chip lg" onClick={() => { setA(x => ({ ...x, book: b })); setTimeout(() => refs.current[1]?.focus(), 0) }}>{b}</button>)}</div>}</div>
      <div><label className="lbl" htmlFor="cv">Chapter : Verse</label><input id="cv" ref={e => { refs.current[1] = e }} className="field" style={{ maxWidth: 200 }} value={a.cv} readOnly={locked} {...OFF} placeholder="4:8" inputMode="text" onChange={e => setA(x => ({ ...x, cv: e.target.value.replace(/[^\d:\-–,; ]/g, '') }))} /></div>
      {!locked && <button className="chip lg plain" style={{ alignSelf: 'flex-start' }} onClick={() => setA(x => ({ ...x, typeRef: true, text: [x.book, x.cv].filter(Boolean).join(' ') }))}><Icon n="keyboard" />Type instead</button>}
      {note}</div>
  }

  const long = k === 'long_text', exp = words(item.a.text ?? '')
  const lab = item.t === 'Q04' ? 'Your verse' : item.t === 'Q22' ? 'Your sentence' : k === 'lesson' ? 'Lesson number or title' : item.t === 'Q01' || item.t === 'Q06' || item.t === 'Q17' ? 'Your word' : 'Your answer'
  return <div className="col">
    {long ? <div><label className="lbl" htmlFor="ans">{lab}</label><div className={`fwrap ${locked ? (grade?.correct ? 'ok' : 'bad') : ''}`}>
      <textarea id="ans" ref={e => { refs.current[0] = e }} className="field" rows={4} value={a.text} readOnly={locked} {...OFF} onChange={e => setA(x => ({ ...x, text: e.target.value }))} /></div>
      <div className="row between tiny muted mt8"><span>{words(a.text)} of {exp} words</span><span>{item.t === 'Q04' ? 'Long typing: memory verses only' : item.t === 'Q22' ? '≤ 30-word sentences only' : ''}</span></div></div>
      : <FieldBox id="ans" label={lab} value={a.text} state={locked ? grade?.correct : undefined} inputRef={e => { refs.current[0] = e }} enterKeyHint="done" onChange={v => setA(x => ({ ...x, text: v }))} />}
    {note ?? <p className="hint"><Icon n="spell" />{STANDING}</p>}</div>
}

// ---- feedback helpers --------------------------------------------------------------------------------
const lev1 = (a: string, b: string) => { if (a === b || Math.abs(a.length - b.length) > 1) return false; let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; const x = a.slice(i), y = b.slice(i); return x.slice(1) === y || x === y.slice(1) || x.slice(1) === y.slice(1) || (x[0] === y[1] && x[1] === y[0] && x.slice(2) === y.slice(2)) }
function Marked({ t, o, bad }: { t: string; o: string; bad: boolean }) {
  const l = t.toLowerCase(), r = o.toLowerCase(); let i = 0; while (i < l.length && i < r.length && l[i] === r[i]) i++
  let j = 0; while (j < l.length - i && j < r.length - i && l[l.length - 1 - j] === r[r.length - 1 - j]) j++
  const mid = t.slice(i, t.length - j); if (!mid) return <>{t}</>
  return <>{t.slice(0, i)}<span className={bad ? 'mk' : 'okm'}>{mid}</span>{t.slice(t.length - j)}</>
}
function explain(w: string, e: string) {
  const a = normText(w), b = normText(e)
  if (a.length === b.length + 1) { let i = 0; while (a[i] === b[i]) i++; return `One extra “${a[i]}”.` }
  if (b.length === a.length + 1) { let i = 0; while (a[i] === b[i]) i++; return `One missing “${b[i]}”.` }
  return 'Two letters are swapped or changed.'
}
const PRAISE = ['Answer saved.', 'Saved. On to the next.', 'Answer saved. Nicely recalled.']

// ---- the sitting -----------------------------------------------------------------------------------
export default function Session() {
  const loc = useLocation(); const nav = useNavigate(); const S = useStore()
  const spec0 = (loc.state as { spec?: SessionSpec } | null)?.spec
  const [items, setItems] = useState<Map<string, Item> | null>(null); const [draft, setDraft] = useState<Draft | null>(null)
  const [empty, setEmpty] = useState<string | null>(null); const [manual, setManual] = useState<Manual | null>(null)
  const [grade, setGrade] = useState<Grade | null>(null); const [ctx, setCtx] = useState(false); const [forced, setForced] = useState(false)
  const [report, setReport] = useState(false); const [cur, setCur] = useState(0)
  const booted = useRef(false); const dRef = useRef<Draft | null>(null)
  const save = (d: Draft) => { dRef.current = d; setDraft(d); S.setDraft(d) }

  useEffect(() => {
    if (booted.current) return; booted.current = true
    ;(async () => {
      const spec = spec0 ?? S.draft?.spec; if (!spec) { setEmpty('none'); return }
      setManual(await loadManual(spec.manual))
      if (spec0) {
        const { items: its } = await buildSession(spec0, S.cards, S.ladder)
        if (!its.length) { setEmpty(spec0.kind); return }
        setItems(new Map(its.map(i => [i.u, i])))
        save({ id: crypto.randomUUID(), spec: spec0, queue: its.map(i => i.u), index: 0, right: 0, startedAt: Date.now(), misses: [], again: [], answered: [] })
      } else {
        const lists = await Promise.all(S.draft!.spec.lessons.map(l => loadItems(S.draft!.spec.manual, l)))
        setItems(new Map(lists.flat().map(i => [i.u, i]))); save(S.draft!)
      }
    })()
  }, []) // eslint-disable-line

  const item = draft && items ? items.get(draft.queue[draft.index]) : undefined
  const [a, setA] = useAnswerFor(item)
  const mcq = !!item && (item.p.input.kind === 'choice' || !item.f.includes('typed') || forced)
  const resp = item ? toResponse(item, a, mcq) : null
  const titleToN = useCallback((t: string) => manual?.lessons.find(l => normText(l.title) === normText(t))?.n, [manual])
  const leave = useCallback(() => nav('/journey', { replace: true }), [nav])

  const check = useCallback(() => {
    if (!item || !resp || grade || !draft) return
    const g = gradeItem(item, resp); setGrade(g)
    S.recordAnswer(draft.spec.manual, item, g.correct, forced)
    if (g.correct && ['Q27', 'Q28', 'Q04', 'Q06'].includes(item.t) && (item.t !== 'Q06' || draft.spec.kind === 'ladder')) S.markLadder(draft.spec.manual, lessonOfKey(item.s), item.t.toLowerCase() as 'q27')
    const retry = !g.correct && !draft.again.includes(item.u)
    save({ ...draft, right: draft.right + (g.correct ? 1 : 0), queue: retry ? [...draft.queue, item.u] : draft.queue, again: retry ? [...draft.again, item.u] : draft.again, answered: [...draft.answered, item.u],
      misses: g.correct ? draft.misses : [...draft.misses, { u: item.u, wrote: g.wrote.join(' · '), expected: g.expected.join(' · '), t: item.t }] })
  }, [item, resp, grade, draft, forced]) // eslint-disable-line

  const next = useCallback(() => {
    const d = dRef.current; if (!d || !grade) return
    setGrade(null); setForced(false); setCur(0)
    if (d.index + 1 >= d.queue.length) {
      const total = d.queue.length - d.again.length, firstTry = d.queue.slice(0, total)
      const missed = new Set(d.misses.map(m => m.u))
      const rec: SittingRecord = { id: d.id, at: Date.now(), manual: d.spec.manual, kind: d.spec.kind, lesson: d.spec.lessons.length === 1 ? d.spec.lessons[0] : undefined, title: d.spec.title,
        total, right: firstTry.filter(u => !missed.has(u)).length, misses: d.misses, minutes: Math.max(1, Math.round((Date.now() - d.startedAt) / 60000)) }
      S.completeSitting(rec); nav(`/practice/done/${d.id}`, { replace: true, state: { spec: d.spec } })
    } else save({ ...d, index: d.index + 1 })
  }, [grade]) // eslint-disable-line

  const stepBack = () => { // Q04 → back to the fade rung of the same verse, no penalty
    const d = dRef.current; if (!d || !item) return
    loadItems(d.spec.manual, lessonOfKey(item.s)).then(its => { const f = its.find(i => i.t === 'Q28' && i.s === item.s) ?? its.find(i => i.t === 'Q28'); if (!f) return
      setItems(m => new Map(m!).set(f.u, f)); const q = [...d.queue]; q[d.index] = f.u; save({ ...d, queue: q }) })
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (ctx || report) return
      if (e.key === 'Escape') { e.preventDefault(); leave(); return }
      const tag = (e.target as HTMLElement).tagName
      if (e.key === 'Enter' && !e.shiftKey) {
        if (grade && tag !== 'BUTTON') { e.preventDefault(); next() }
        else if (!grade && resp && tag !== 'TEXTAREA' && tag !== 'BUTTON') { e.preventDefault(); check() }
      }
      if (!grade && mcq && /^[1-6]$/.test(e.key) && tag !== 'INPUT' && tag !== 'TEXTAREA') { const btns = document.querySelectorAll<HTMLButtonElement>('.opt'); btns[+e.key - 1]?.click() }
    }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  }, [grade, next, check, resp, ctx, report, mcq, leave])

  if (!spec0 && !S.draft && !draft) return <Navigate to="/journey" replace />
  if (empty) return <div className="focus"><div className="fbody" style={{ justifyContent: 'center', paddingBottom: 40 }}>
    <StateCard img="caughtup" title={empty === 'review' ? 'No due review right now' : 'Nothing matches yet'} body={empty === 'review' ? 'Next items return when they are due. A quest keeps you moving meanwhile.' : 'No questions fit this choice. Add lessons or formats, or start a quest from the Journey.'}
      action={<button className="btn block" onClick={() => nav('/journey', { replace: true })}>Back to journey</button>} /></div></div>
  if (!draft || !items || !item) return <div className="focus"><div className="ftop"><div className="bar"><i style={{ width: 0 }} /></div></div><div className="fbody"><div className="skel" style={{ height: 28, width: '50%' }} /><div className="skel" style={{ height: 120 }} /><div className="skel" style={{ height: 56 }} /></div></div>

  const total = draft.queue.length, retrying = draft.queue.indexOf(item.u) < draft.index
  const refs = item.a.refs?.map(r => r.key) ?? (item.p.ref ? [item.p.ref] : [])
  const ladder = draft.spec.kind === 'ladder'
  const ctxText = ladder ? `Memory ladder · ${item.p.ref ?? ''}` : `${ctxShort(item.p.context) || draft.spec.title}${S.prefs.keepPrivate ? ' · Private practice' : ''}`
  const single = !!grade && !grade.correct && !grade.parts && grade.wrote.length === 1 && grade.expected.length === 1
  const near = single && item.p.input.kind !== 'reference' && lev1(normText(grade!.wrote[0]), normText(grade!.expected[0]))
  const refNear = single && item.p.input.kind === 'reference' && (() => { const w = typedRefs(grade!.wrote[0])[0], e = grade!.expected[0]; return !!w && w.split(':')[0] === e.split(':')[0] })()
  const title = !grade ? '' : grade.correct ? 'That is the one.' : near ? 'One spelling to fix.' : refNear ? 'Close. Check the verse.' : 'Not quite.'
  const willReturn = !grade?.correct && draft.queue.lastIndexOf(item.u) > draft.index
  return <div className="focus">
    <div className="ftop">
      <button className="iconbtn xbtn" aria-label="Save and leave" onClick={leave}><Icon n="x" /></button>
      <button className="btn sec sm saveleave" onClick={leave}><Icon n="x" className="s" />Save &amp; leave</button>
      <div className="bar" role="progressbar" aria-label="Sitting progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={draft.index + (grade ? 1 : 0)}><i style={{ width: `${((draft.index + (grade ? 1 : 0)) / total) * 100}%` }} /></div>
      <span className="cnt" aria-label={`Question ${draft.index + 1} of ${total}`}>{draft.index + 1}/{total}</span></div>
    <div className="fbody">
      <div className="qmeta"><span className="chip"><Icon n="feather" />{label(item.t)} · {item.t}</span>{retrying && <span className="chip due">Again</span>}<span className="ctx">{ctxText}</span></div>
      <h1 className="qtitle">{item.p.instruction}</h1>
      {(item.t === 'Q27' || item.t === 'Q25') && <p className="qsub">{item.t === 'Q27' ? 'Extra words are not part of the verse.' : 'Drag, or use Move up and Move down.'}</p>}
      <Prompt item={item} cur={cur} lessonsN={n => `L${n}`} />
      <Answer key={`${item.u}${draft.index}${forced}`} item={item} a={a} setA={setA} mcq={mcq} grade={grade} setCur={setCur} titleToN={titleToN} />
      {!grade && !forced && item.f.includes('mcq') && item.f.includes('typed') && item.d.length > 0 && <div className="row wrap gap8"><button className="chip lg plain" onClick={() => setForced(true)}><Icon n="listn" />Switch to choices</button><span className="tiny muted">for this item only · counts as assisted</span></div>}
      <div className="shortcuts"><span><span className="kbd">Tab</span>next blank</span><span><span className="kbd">Enter</span>check</span><span><span className="kbd">Esc</span>save &amp; leave</span>{mcq && <span><span className="kbd">1–4</span>choose</span>}</div>
    </div>
    {!grade ? <div className="fbar"><div className="in">
      {item.t === 'Q04' && <button className="btn sec" onClick={stepBack}>Step back</button>}
      <button className="btn" disabled={!resp} onClick={check}>Check answer</button></div></div> :
      <div className={`fb ${grade.correct ? 'good' : 'bad'}`} role="status" aria-live="polite"><div className="in">
        <div className="head">{grade.correct && <Glim pose="thumbs" motion="pop" once size={56} />}<Icon n={grade.correct ? 'check' : 'x'} className="hic" /><h3>{title}</h3>{grade.correct && <span className="xp"><Icon n="star" className="s" />+10 XP</span>}</div>
        {grade.correct ? <p className="small muted mt8">{item.t === 'Q27' ? 'Built in order. Fade unlocks next.' : item.t === 'Q28' ? 'All words correct. Full recall unlocks next.' : forced ? 'Answer saved as assisted.' : PRAISE[draft.index % PRAISE.length]}</p> : <>
          {grade.parts && grade.parts.length > 1 && item.p.input.kind !== 'order' ? <dl className="diffgrid">{grade.expected.map((e, i) => !grade.parts![i] && <FragmentRow key={i} k={item.p.input.labels?.[i] ?? `Box ${i + 1}`} w={grade.wrote[i] ?? ''} e={e} />)}</dl>
            : <dl className="diffgrid"><dt>You wrote</dt><dd>{single ? <Marked t={grade.wrote[0]} o={grade.expected[0]} bad /> : grade.wrote.join(' · ') || '—'}</dd><dt>Expected</dt><dd className="okm">{single ? <Marked t={grade.expected[0]} o={grade.wrote[0]} bad={false} /> : grade.expected.join(' · ')}</dd></dl>}
          <p className="small muted">{near ? `${explain(grade.wrote[0], grade.expected[0])} Spelling counts, so this ` : 'This '}{willReturn ? 'returns later in this sitting.' : 'comes back in your reviews.'}</p></>}
        <div className="acts">{refs.length > 0 && <button className="chip lg plain" onClick={() => setCtx(true)}><Icon n="book" />Read {refs[0].replace(/:.*$/, '').length > 20 ? 'in context' : `${refs[0].replace(/:.*$/, '')} in context`}</button>}
          {!grade.correct && <button className="chip lg plain" onClick={() => setReport(true)}><Icon n="flag" />Report</button>}</div>
        <button className={`btn block ${grade.correct ? 'good' : 'bad'}`} onClick={next} autoFocus>{grade.correct && <Icon n="check" className="s" />}{draft.index + 1 >= total ? 'Finish' : 'Next question'}</button>
      </div></div>}
    {ctx && <ContextSheet refs={refs.slice(0, 2)} onClose={() => setCtx(false)} />}
    {report && <ReportSheet item={item} onClose={() => setReport(false)} />}
  </div>
}
const FragmentRow = ({ k, w, e }: { k: string; w: string; e: string }) => <><dt>{k}</dt><dd><Marked t={w || '—'} o={e} bad /> → <span className="okm">{e}</span></dd></>
function useAnswerFor(item?: Item) {
  const fallback: Item = { u: '', t: '', f: [], p: { instruction: '', input: { kind: 'text' } }, a: {}, d: [], g: [], s: '', tg: '' }
  const [st, setSt] = useAnswer(item ?? fallback)
  const last = useRef(item?.u)
  useEffect(() => { if (item && item.u !== last.current) { last.current = item.u; const n = item.p.input.count ?? 1; setSt({ text: '', vals: Array(n).fill(''), sel: '', chosen: [], pick: null, book: '', cv: '', typeRef: false, order: (item.p.shuffled ?? []).map((_, i) => i) }) } }, [item, setSt])
  return [st, setSt] as const
}

function ReportSheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const [why, setWhy] = useState(''); const [note, setNote] = useState(''); const [sent, setSent] = useState(false)
  const submit = () => { try { const r = JSON.parse(localStorage.getItem('rhemlo.reports') ?? '[]'); r.push({ u: item.u, s: item.s, why, note, at: Date.now() }); localStorage.setItem('rhemlo.reports', JSON.stringify(r)) } catch { /* */ } setSent(true) }
  return <Sheet label="Report a content error" onClose={onClose}>{sent ? <div className="col center" style={{ alignItems: 'center' }}><img src={asset('illustrations/states/state-sent-256.webp')} width={120} alt="" /><h2>Thank you</h2>
    <p className="muted">Saved on this device as report {item.u.slice(2, 8).toUpperCase()}. It reaches the content stewards when the Rhemlo server is connected. A report never changes a grade.</p><button className="btn block" onClick={onClose}>Close</button></div>
    : <div className="col"><h2>Report a content error</h2><p className="small muted">What looks wrong with this question?</p>
      {['The expected answer is wrong', 'The question is unclear', 'A typo in the question', 'Something else'].map(w => <button key={w} className={`opt ${why === w ? 'sel' : ''}`} onClick={() => setWhy(w)}><span className="grow">{w}</span></button>)}
      <label className="lbl" htmlFor="rn">Details (optional)</label><textarea id="rn" className="field" rows={3} value={note} onChange={e => setNote(e.target.value)} />
      <button className="btn block" disabled={!why} onClick={submit}>Send report</button></div>}</Sheet>
}

// ---- Sitting complete (R24) -------------------------------------------------------------------------
const RET: Record<string, string> = { Q26: 'Spelling', Q05: 'Reference', Q09: 'Reference', Q12: 'Reference', Q24: 'Reference', Q01: 'Missing word', Q02: 'Missing words', Q06: 'Missing word', Q28: 'Fade', Q27: 'Build', Q04: 'Full verse', Q07: 'Outline', Q13: 'List', Q25: 'Order' }
export function Done() {
  const { id } = useParams(); const nav = useNavigate(); const loc = useLocation(); const { history, done } = useStore()
  const rec = history.find(h => h.id === id)
  if (!rec) return <Navigate to="/journey" replace />
  const spec = (loc.state as { spec?: SessionSpec } | null)?.spec
  const uniq = rec.misses.filter((m, i, a) => a.findIndex(x => x.u === m.u) === i)
  const pct = rec.total ? rec.right / rec.total : 0
  const cleared = (rec.kind === 'quest' || rec.kind === 'ladder') && rec.lesson && !!done[`${rec.manual}|${rec.lesson}`]
  const title = rec.kind === 'review' ? 'Review complete.' : rec.kind === 'quest' || rec.kind === 'ladder' ? 'Quest complete.' : 'Sitting complete.'
  const again = () => nav('/practice/session', { replace: true, state: { spec: { ...(spec ?? { manual: rec.manual, lessons: rec.lesson ? [rec.lesson] : [] }), kind: 'target', only: uniq.map(m => m.u), count: uniq.length, title: 'Review my misses' } } })
  return <div className="page" style={{ maxWidth: 1000 }}>
    <div className="donegrid">
      <div className="doneart"><div className="glow" /><Icon n="sparkle" className="sparkle" style={{ left: '18%', top: '18%', width: 26, height: 26 }} /><Icon n="sparkle" className="sparkle" style={{ right: '16%', top: '30%', width: 20, height: 20 }} /><Icon n="sparkle" className="sparkle" style={{ right: '22%', bottom: '22%', width: 24, height: 24 }} />
        <Glim pose={pct >= .5 ? 'celebrate' : 'thumbs'} motion={pct >= .5 ? 'jump' : undefined} once size={220} /></div>
      <div className="col gap16">
        <p className="eyebrow">{rec.title ?? 'Sitting'}</p>
        <h1 style={{ fontSize: 34, lineHeight: '38px' }}>{title}</h1>
        <p className="muted">Your progress is saved. This is a good place to stop.</p>
        <div className="grid3"><div className="stat"><div className="v" style={{ color: 'var(--rh-correct)' }}>{rec.right} / {rec.total}</div><div className="d">correct answers</div></div>
          <div className="stat"><div className="v" style={{ color: 'var(--rh-apricot-deep)' }}>{uniq.length}</div><div className="d">queued for review</div></div>
          <div className="stat"><div className="v" style={{ color: 'var(--rh-action)' }}>+{rec.right * 10}</div><div className="d">personal XP</div></div></div>
        {cleared && <div className="card row"><img src={asset('emblems/badges/badge-chapter-128.webp')} width={44} height={44} alt="" /><div><b>Lesson cleared</b><div className="tiny muted">The next stop on your map is open</div></div></div>}
        {uniq.length > 0 && <div className="card col gap8"><p className="eyebrow">Your misses</p>{uniq.slice(0, 6).map(m => { const t = m.t ?? ''; return <div key={m.u} className="row small" style={{ alignItems: 'flex-start' }}>
          <Icon n="x" className="s" style={{ color: 'var(--rh-incorrect)', marginTop: 2 }} /><span className="grow" style={{ overflowWrap: 'anywhere' }}>{(m.wrote || '—').slice(0, 60)} → <b>{m.expected.slice(0, 60)}</b></span><span className="tiny muted" style={{ whiteSpace: 'nowrap' }}>{RET[t] ?? 'Recall'} · returns today</span></div> })}</div>}
        <div className="row wrap gap8"><span className="chip ok"><Icon n="check" />Saved on this device</span><span className="chip">Private · not ranked</span></div>
        <div className="row wrap gap8"><button className="btn" onClick={() => nav('/journey')}>Done for now</button><button className="btn sec" disabled={!uniq.length} onClick={again}>Review my misses</button><button className="btn link" onClick={() => nav('/journey')}>Back to journey</button></div>
      </div>
    </div>
  </div>
}
