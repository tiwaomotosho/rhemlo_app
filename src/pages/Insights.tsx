// Insights (PRD 9.9 analytics, 9.19 readiness, 3.4 capability scorecard).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/backend'
import { KIND_LABEL, lessonOfKey, niceTitle } from '@/lib/engine'
import { wordDiff } from '@/lib/grade'
import { DIRECTIONS, readinessFor, scorecard, weakestPart } from '@/lib/mastery'
import { forecast } from '@/lib/srs'
import { day, useStore } from '@/lib/store'
import type { LogEntry } from '@/lib/types'
import { BackBar, Icon, Loading, StatPills, useManualData, useToast } from '@/ui/bits'
import { useStart } from './Journey'
import { MockChart } from './Mock'

const pct = (x: number) => `${Math.round(x * 100)}%`
const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
const TARGET_S: Record<string, number> = { Q05: 6, Q09: 6, Q10: 6, Q08: 6, Q29: 6, Q30: 6, Q31: 6, Q12: 10, Q24: 10, Q01: 8, Q02: 8, Q06: 8, Q17: 8, Q04: 45 }
function csv(rows: LogEntry[]) {
  const h = ['time', 'manual', 'lesson', 'type', 'correct', 'seconds', 'format', 'assisted', 'error', 'you wrote', 'expected', 'mode']
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  return [h.join(','), ...rows.map(e => [new Date(e.at).toISOString(), e.m, lessonOfKey(e.s), e.t, e.ok, (e.ms / 1000).toFixed(1), e.mcq ? 'choice' : 'typed', e.assisted, e.err, e.wrote, e.expected, e.mode].map(q).join(','))].join('\n')
}
const download = (name: string, text: string, type: string) => { const u = URL.createObjectURL(new Blob([text], { type })); Object.assign(document.createElement('a'), { href: u, download: name }).click(); URL.revokeObjectURL(u) }

export default function Insights() {
  const m = useManualData(); const S = useStore(); const nav = useNavigate(); const start = useStart(); const [toast, say] = useToast()
  const [fk, setFk] = useState(''); const [fl, setFl] = useState('')
  const log = useMemo(() => S.log.filter(e => m && e.m === m.code), [S.log, m])
  if (!m) return <Loading />
  const now = Date.now(), d7 = log.filter(e => e.at > now - 7 * 86400000 && e.mode !== 'mock'), d30 = log.filter(e => e.at > now - 30 * 86400000 && e.mode !== 'mock')
  const ret = (xs: LogEntry[]) => { const r = xs.filter(e => (S.cards[`${e.m}|${e.s}`]?.reps ?? 2) > 1); return r.length ? r.filter(e => e.ok).length / r.length : 0 }
  const due = Object.entries(S.cards).filter(([k, c]) => k.startsWith(m.code + '|') && c.seen && c.due <= now).length
  const sc = scorecard(S.log, m.code, S.mocks, S.checks)
  const stage = m.stages[now < Date.parse(m.stages[0].date) ? 0 : 1], rd = readinessFor(m, stage.lessons, S.cards, S.checks)
  const weakL = [...rd.below].sort((a, b) => a.r - b.r)[0], weakP = weakL ? weakestPart(S.log, m.code, [weakL.l.id]) : null
  // heatmap: lessons × directions, coloured by accuracy
  const lessonsSeen = m.lessons.filter(l => log.some(e => e.s.includes(`:${l.id}.`)))
  const cell = (lid: string, types: string[]) => { const xs = log.filter(e => e.s.includes(`:${lid}.`) && types.includes(e.t)); return xs.length ? xs.filter(e => e.ok).length / xs.length : -1 }
  // speed
  const byType = Object.entries(log.filter(e => e.ok && e.ms > 0).reduce<Record<string, number[]>>((a, e) => { (a[e.t] ??= []).push(e.ms / 1000); return a }, {})).map(([t, xs]) => ({ t, med: median(xs), n: xs.length, target: TARGET_S[t] })).sort((a, b) => b.n - a.n)
  const slow = [...new Set(log.filter(e => e.ok && TARGET_S[e.t] && e.ms / 1000 > TARGET_S[e.t] * 1.5).map(e => e.u))]
  // weak words
  const words = new Map<string, number>(); for (const e of log) if (!e.ok && e.wrote && e.expected && !e.mcq) for (const o of wordDiff(e.wrote, e.expected).ops) if (o.op === 'wrong' || o.op === 'missing') { const w = o.e ?? o.w; words.set(w, (words.get(w) ?? 0) + 1) }
  const weakWords = [...words.entries()].filter(([w]) => w.length > 2).sort((a, b) => b[1] - a[1]).slice(0, 14)
  // confusion pairs
  const titles = new Map(m.lessons.map(l => [l.title.toLowerCase(), l]))
  const conf = new Map<string, number>(); for (const e of log) { if (e.ok || !e.wrote || !['Q15', 'Q10', 'Q08', 'Q31', 'Q30', 'Q29'].includes(e.t)) continue; const w = titles.get(e.wrote.toLowerCase()) ?? m.lessons.find(l => String(l.n) === e.wrote!.trim()); const a = lessonOfKey(e.s); if (w && w.id !== a) { const k = [a, w.id].sort().join('|'); conf.set(k, (conf.get(k) ?? 0) + 1) } }
  const traps = Object.entries(log.filter(e => !e.ok && e.trap).reduce<Record<string, number>>((a, e) => { a[e.trap!] = (a[e.trap!] ?? 0) + 1; return a }, {}))
  const typed = log.filter(e => !e.mcq && e.mode !== 'flashcard'), mcq = log.filter(e => e.mcq)
  const fc = forecast(S.cards, m.code + '|', 30), fcMax = Math.max(1, ...fc)
  const errs = log.filter(e => !e.ok).filter(e => (!fk || e.err === fk) && (!fl || lessonOfKey(e.s) === fl)).reverse()
  const kinds = [...new Set(log.filter(e => !e.ok && e.err).map(e => e.err!))]
  const L = (id: string) => { const l = m.lessons.find(x => x.id === id); return l ? `L${l.n}` : id }
  const weekly = async () => {
    const body = `This week: ${d7.length} answers, ${pct(ret(d7))} retention, ${due} points due now. Readiness for ${stage.name}: ${pct(rd.readiness)} (target 95%). ${weakL ? `Weakest: Lesson ${weakL.l.n}${weakP ? `, ${weakP.part}` : ''}.` : ''}`
    if (api.session()) { await api.email('Your weekly Rhemlo report', body); say('Weekly report sent to your email outbox.') } else say('Sign in to receive the weekly report by email.')
  }
  return <div className="page col gap16">
    <div className="pagehead"><div><p className="eyebrow">Journey · Insights</p><h1>Where you stand, measured.</h1></div><StatPills /></div>
    <div className="grid4">
      <div className="stat"><p className="eyebrow">Due now</p><div className="v mt8">{due}</div><div className="d">points ready to revisit</div></div>
      <div className="stat"><p className="eyebrow">Retention · 7 days</p><div className="v mt8">{d7.length ? pct(ret(d7)) : '—'}</div><div className="d">reviews answered right · target 90%</div></div>
      <div className="stat"><p className="eyebrow">Retention · 30 days</p><div className="v mt8">{d30.length ? pct(ret(d30)) : '—'}</div><div className="d">reviews answered right</div></div>
      <div className="stat"><p className="eyebrow">{stage.name}</p><div className="v mt8" style={{ color: 'var(--rh-action)' }}>{pct(rd.readiness)}</div><div className="d">readiness · gap {pct(rd.gap)} to 95%</div></div></div>
    <div className="withrail"><div className="col gap16">
      <div className="card col"><div className="row between"><h3>Capability scorecard</h3><span className={`chip ${sc.finaleReady ? 'ok' : 'plain'}`}>{sc.finaleReady ? 'Finale-ready' : 'Not finale-ready yet'}</span></div>
        <div className="list">{sc.caps.map(c => <div key={c.k} className="li"><b style={{ width: 30 }}>{c.k}</b><span className="grow small">{c.name}{c.n ? <span className="tiny muted" style={{ display: 'block' }}>{c.k === 'C5' ? 'Medians at or under the speed targets' : c.k === 'C6' ? `Average latest mastery check ${pct(c.acc)} · target 98%` : `${pct(c.acc)} of ${c.n}${c.med ? ` · median ${c.med.toFixed(1)} s (target ${c.secs} s)` : ''}`}</span> : <span className="tiny muted" style={{ display: 'block' }}>Not enough answers yet</span>}</span><span className={`chip ${c.ok ? 'ok' : 'plain'}`}>{c.ok ? 'On target' : 'Building'}</span></div>)}</div>
        <p className="tiny muted">Finale rule: all six on target, in two full-manual mocks at least a week apart ({sc.fullMocksOnTarget} full-manual mock{sc.fullMocksOnTarget === 1 ? '' : 's'} at 95%+ so far).</p></div>
      <div className="card col"><h3>Heatmap</h3><p className="tiny muted">Lessons × retrieval directions, coloured by accuracy. Grey means not tried yet.</p>
        {lessonsSeen.length ? <div style={{ overflowX: 'auto' }}><table className="heat"><thead><tr><th />{Object.keys(DIRECTIONS).map(d => <th key={d} title={DIRECTIONS[d].name}>{d}</th>)}</tr></thead><tbody>{lessonsSeen.map(l => <tr key={l.id}><th>L{l.n}</th>{Object.values(DIRECTIONS).map((d, i) => { const a = cell(l.id, d.types); return <td key={i} title={a < 0 ? 'Not tried' : pct(a)} style={{ background: a < 0 ? 'var(--rh-surface2)' : `color-mix(in srgb, var(--rh-node-done) ${Math.round(a * 100)}%, var(--rh-incorrect-bg))` }}>{a < 0 ? '' : Math.round(a * 100)}</td> })}</tr>)}</tbody></table></div> : <p className="small muted">Answer a few questions to see it.</p>}
        <p className="tiny muted">{Object.entries(DIRECTIONS).map(([d, v]) => `${d} ${v.name}`).join(' · ')}</p></div>
      <div className="card col"><div className="row between"><h3>Answer speed</h3>{slow.length > 0 && <button className="btn sec xs" onClick={() => start({ kind: 'quickfire', manual: m.code, lessons: [...new Set(log.filter(e => slow.includes(e.u)).map(e => lessonOfKey(e.s)))], only: slow.slice(0, 20), count: Math.min(20, slow.length), perItem: 12, title: 'Fluency practice' })}>Fluency practice · {Math.min(20, slow.length)}</button>}</div>
        <p className="tiny muted">Median seconds for right answers. Slow-but-correct items are offered for fluency practice.</p>
        <div className="lbars">{byType.slice(0, 10).map(r => <div key={r.t} className="r" style={{ gridTemplateColumns: '1fr 120px 70px' }}><span className="small">{KIND_LABEL[r.t] ?? r.t}</span><div className="bar thin"><i style={{ width: `${Math.min(100, r.target ? r.target / Math.max(r.med, .1) * 100 : 60)}%`, background: !r.target || r.med <= r.target ? 'var(--rh-node-done)' : 'var(--rh-apricot)' }} /></div><span className="small b" style={{ textAlign: 'right' }}>{r.med.toFixed(1)} s{r.target ? ` / ${r.target}` : ''}</span></div>)}</div></div>
      <div className="card col"><div className="row between wrap"><h3>Error log</h3><div className="row gap8"><select className="mbtn" value={fk} onChange={e => setFk(e.target.value)} aria-label="Error type"><option value="">All errors</option>{kinds.map(k => <option key={k}>{k}</option>)}</select>
        <select className="mbtn" value={fl} onChange={e => setFl(e.target.value)} aria-label="Lesson"><option value="">All lessons</option>{lessonsSeen.map(l => <option key={l.id} value={l.id}>L{l.n}</option>)}</select></div></div>
        <div className="list">{errs.slice(0, 40).map((e, i) => <div key={i} className="li" style={{ alignItems: 'flex-start' }}><span className="chip bad" style={{ flex: 'none' }}>{e.err ?? 'wrong'}</span><div className="grow small"><b>{L(lessonOfKey(e.s))} · {KIND_LABEL[e.t] ?? e.t}</b>{e.wrote && <div><span className="muted">You: </span>{e.wrote}</div>}{e.expected && <div><span className="muted">Expected: </span><span className="okm b">{e.expected}</span></div>}</div><span className="tiny muted">{new Date(e.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span></div>)}
          {!errs.length && <p className="small muted" style={{ padding: 8 }}>No errors here.</p>}</div></div>
    </div><div className="rail col gap16">
      <div className="card col gap8"><h3>Gap to 95%</h3><p className="small">{rd.below.length ? `${rd.below.length} lesson${rd.below.length === 1 ? '' : 's'} below target${weakL ? `; weakest is Lesson ${weakL.l.n}${weakP ? `, especially ${weakP.part}` : ''}` : ''}.` : 'Every lesson in range is at target.'}</p>
        {weakL && <button className="btn block" onClick={() => start({ kind: 'target', manual: m.code, lessons: [weakL.l.id], focus: weakP ? [weakP.part] : undefined, count: S.sessionSize, title: `Gap · Lesson ${weakL.l.n}` })}>Practise Lesson {weakL.l.n}{weakP ? ` · ${weakP.part}` : ''}</button>}</div>
      <div className="card col gap8"><h3>Weak words</h3>{weakWords.length ? <div className="row wrap gap8">{weakWords.map(([w, n]) => <span key={w} className="chip lg plain">{w} · {n}</span>)}</div> : <p className="small muted">Words you get wrong most often appear here.</p>}</div>
      <div className="card col gap8"><h3>Confusion pairs</h3>{conf.size ? [...conf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => { const [a, b] = k.split('|'); return <div key={k} className="row between small"><span>{L(a)} ↔ {L(b)}</span><span className="chip due">{n}×</span></div> }) : <p className="small muted">None detected yet.</p>}
        <button className="btn sec block" onClick={() => nav('/practice/discrimination')}>Discrimination drill</button></div>
      <div className="card col gap8"><h3>Traps that still catch you</h3>{traps.length ? traps.sort((a, b) => b[1] - a[1]).map(([t, n]) => <div key={t} className="row between small"><span>{t.replace(/_/g, ' ')}</span><b>{n}</b></div>) : <p className="small muted">No trap misses recorded.</p>}</div>
      <div className="card col gap8"><h3>Typed vs choice</h3><div className="row between small"><span>Typed</span><b>{typed.length ? pct(typed.filter(e => e.ok).length / typed.length) : '—'} · {typed.length}</b></div><div className="row between small"><span>Multiple choice</span><b>{mcq.length ? pct(mcq.filter(e => e.ok).length / mcq.length) : '—'} · {mcq.length}</b></div><p className="tiny muted">Tracked separately; a typed pass counts as stronger evidence.</p></div>
      <div className="card col gap8"><h3>Next 30 days</h3><div className="row" style={{ alignItems: 'flex-end', height: 80, gap: 2 }} role="img" aria-label={`Expected reviews per day: ${fc.join(', ')}`}>{fc.map((n, i) => <div key={i} title={`${new Date(now + i * 86400000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}: ${n}`} style={{ flex: 1, height: `${Math.max(2, n / fcMax * 100)}%`, background: i === 0 ? 'var(--rh-apricot)' : 'var(--rh-raised)', borderRadius: 3 }} />)}</div><p className="tiny muted">Expected reviews per day. Today {fc[0]} · peak {fcMax}.</p></div>
      <div className="card col gap8"><h3>Mock history</h3>{S.mocks.filter(x => x.manual === m.code).length ? <MockChart mocks={S.mocks.filter(x => x.manual === m.code)} /> : <p className="small muted">No mocks yet.</p>}<button className="btn sec block" onClick={() => nav('/practice/mock')}>Mock exam</button></div>
      <div className="card col gap8"><h3>Your data</h3><div className="row gap8"><button className="btn sec xs grow" onClick={() => download(`rhemlo-answers-${day()}.csv`, csv(S.log), 'text/csv')}>Export CSV</button><button className="btn sec xs grow" onClick={() => download(`rhemlo-answers-${day()}.json`, JSON.stringify({ log: S.log, mocks: S.mocks, checks: S.checks }, null, 1), 'application/json')}>Export JSON</button></div>
        <button className="btn link" onClick={weekly}>Email me this week’s report</button></div>
    </div></div>
    <BackBar title="" onBack={() => nav('/journey')} />
    {toast}
  </div>
}
