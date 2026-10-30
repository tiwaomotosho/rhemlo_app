// Live multiple-choice rounds shared by friendly matches, Quiz Night and the host screen.
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadItems } from '@/lib/data'
import { demoRnd, demoSkill, demoPeople } from '@/lib/backend/demo'
import { shuffleSeed, niceTitle } from '@/lib/engine'
import { normText } from '@/lib/grade'
import { play } from '@/lib/sound'
import type { Item, ManualCode } from '@/lib/types'
import type { PublicUser } from '@/lib/backend'
import { Icon, asset } from '@/ui/bits'

export interface LiveQ { u: string; prompt: string; text?: string; options: string[]; answer: string }
/** Choice questions from the given lessons, the same for everyone with the same seed. */
export async function liveQuestions(manual: ManualCode, lessons: string[], n: number, seed: string): Promise<LiveQ[]> {
  const lists = await Promise.all(lessons.map(l => loadItems(manual, l)))
  const pool = lists.flat().filter((i: Item) => i.a.text && i.d.length >= 3 && (i.f.includes('mcq')) && !['Q04', 'Q27', 'Q28', 'Q24', 'Q22'].includes(i.t) && (i.a.text.length < 140))
  const bySib = new Map<string, Item>(); for (const i of shuffleSeed(pool, seed)) if (!bySib.has(i.s)) bySib.set(i.s, i)
  return [...bySib.values()].slice(0, n).map(i => {
    const lesson = i.p.input.kind === 'lesson'
    const options = shuffleSeed([i.a.text!, ...i.d.slice(0, 3)], i.u + seed).map(o => lesson ? niceTitle(o) : o)
    return { u: i.u, prompt: i.p.instruction, text: i.p.text?.replace(/____/g, '_____') ?? i.p.ref, options, answer: lesson ? niceTitle(i.a.text!) : i.a.text! }
  })
}
export const same = (a: string, b: string) => normText(a) === normText(b)
const TILE = ['#7041D9', '#FFAA72', '#8DBF2F', '#E25C8B']
const TILE_FG = ['#fff', '#3B1D08', '#fff', '#fff']

export function Timer({ left, total }: { left: number; total: number }) {
  const C = 2 * Math.PI * 20
  return <div style={{ position: 'relative', width: 52, height: 52 }} role="timer" aria-label={`${left} seconds left`}><svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="20" fill="var(--rh-surface)" stroke="var(--rh-line)" strokeWidth="5" />
    <circle cx="26" cy="26" r="20" fill="none" stroke="var(--rh-apricot)" strokeWidth="5" strokeDasharray={`${(left / total) * C} ${C}`} transform="rotate(-90 26 26)" strokeLinecap="round" /></svg>
    <b className="disp" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 17 }}>{left}</b></div>
}

/** One question with coloured, lettered tiles (colour is never the only cue). */
export function Tiles({ q, picked, reveal, onPick, big }: { q: LiveQ; picked: string | null; reveal: boolean; onPick: (o: string) => void; big?: boolean }) {
  return <div className="grid2" style={{ gap: 10 }}>{q.options.map((o, i) => {
    const right = reveal && same(o, q.answer), wrong = reveal && picked === o && !right
    return <button key={o} disabled={!!picked || reveal} onClick={() => { play('tap'); onPick(o) }} aria-pressed={picked === o}
      style={{ minHeight: big ? 120 : 84, border: picked === o ? '3px solid var(--rh-text)' : '3px solid transparent', borderRadius: 18, padding: 12, textAlign: 'left', background: TILE[i], color: TILE_FG[i], boxShadow: `0 4px 0 rgba(0,0,0,.25)`, opacity: reveal && !right ? .45 : 1, display: 'flex', flexDirection: 'column', gap: 4, font: `800 ${big ? 22 : 15}px/1.25 var(--rh-font-display)` }}>
      <span style={{ fontSize: big ? 26 : 18 }}>{'ABCD'[i]} {right && '✓'}{wrong && '✕'}</span><span>{o}</span></button>
  })}</div>
}

/** Simulated room: each demo player answers by their own skill and speed. */
export function useRoom(seed: string, size: number) {
  const people = useMemo(() => { const base = demoPeople(); return Array.from({ length: size }, (_, i) => { const p = base[i % base.length]; return { ...p, handle: i < base.length ? p.handle : `${p.handle}${Math.floor(i / base.length) + 1}`, skill: demoSkill(p.id) } }) }, [size])
  const answers = (qi: number, correct: string, options: string[]) => people.map(p => {
    const ok = demoRnd(p.handle, seed, qi) < p.skill * .92; const wrong = options.filter(o => !same(o, correct))
    return { p, value: ok ? correct : wrong[Math.floor(demoRnd(p.handle, seed, qi, 'w') * wrong.length)], ms: 2500 + Math.floor(demoRnd(p.handle, seed, qi, 't') * 14000) }
  })
  return { people, answers }
}

export function Board({ rows, you }: { rows: { user: PublicUser | { handle: string; cw: string }; score: number; you?: boolean }[]; you?: string }) {
  return <div className="card list" style={{ padding: '2px 14px' }}>{rows.map((r, i) => <div key={r.user.handle + i} className="li" style={{ background: r.you ? 'var(--rh-raised)' : undefined, borderRadius: r.you ? 12 : 0, paddingLeft: r.you ? 8 : 4 }}>
    <b style={{ width: 24 }}>{i + 1}</b><img className="avatar" style={{ width: 34, height: 34 }} src={asset(`characters/glim/avatars/avatar-${r.user.cw}-64.png`)} alt="" /><span className="grow small b">{r.user.handle}{r.you ? ' (you)' : ''}</span><b>{r.score}</b></div>)}
    {you && <p className="tiny muted" style={{ padding: 8 }}>{you}</p>}</div>
}

export function useCountdown(seconds: number, running: boolean, onEnd: () => void) {
  const [left, setLeft] = useState(seconds); const end = useRef(onEnd); end.current = onEnd
  useEffect(() => { setLeft(seconds) }, [seconds, running])
  useEffect(() => { if (!running) return; const t = setInterval(() => setLeft(l => { if (l <= 1) { clearInterval(t); setTimeout(() => end.current(), 0); return 0 } if (l <= 4) play('tick'); return l - 1 }), 1000); return () => clearInterval(t) }, [running])
  return left
}
export const LiveBadge = ({ text }: { text: string }) => <span className="chip lg plain"><Icon n="radio" />{text}</span>
