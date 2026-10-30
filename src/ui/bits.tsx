import { createElement, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useStore, streakInfo } from '@/lib/store'
import { loadManual, readInContext } from '@/lib/data'
import type { Manual } from '@/lib/types'

export const CW = ['classic', 'twilight', 'meadow', 'rosewood', 'midnight', 'ocean']
export const asset = (p: string) => `/assets/${p}`

// ---- Glim: the asset pack's live rig (<rhemlo-glim rig>), with a static fallback -------------------
const ONCE: Record<string, number> = { wave: 1300, jump: 1500, cheer: 1300, pop: 1700, bounce: 1100, nudge: 1500 }
const reduced = () => (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.documentElement.classList.contains('reduce-motion')
export function Glim({ pose = 'idle', size = 160, cw, motion, once, still, className = '', style }: { pose?: string; size?: number; cw?: string; motion?: string; once?: boolean; still?: boolean; className?: string; style?: CSSProperties }) {
  const mine = useStore(s => s.profile.glim)
  const c = cw ?? mine ?? 'classic'
  const [m, setM] = useState(motion ?? 'auto')
  useEffect(() => {
    setM(motion ?? 'auto')
    if (once && motion) { const t = setTimeout(() => setM('breathe'), ONCE[motion] ?? 1300); return () => clearTimeout(t) }
  }, [motion, once, pose])
  const live = !still && typeof customElements !== 'undefined' && !!customElements.get('rhemlo-glim') && !reduced()
  return <span className={className} style={{ display: 'inline-block', width: size, height: size, lineHeight: 0, flex: 'none', ...style }} aria-hidden>
    {live ? createElement('rhemlo-glim', { rig: '', pose, colorway: c, motion: m, size })
      : <img width={size} height={size} alt="" src={asset(c === 'classic' ? `characters/glim/poses/square-256/glim-${pose}.webp` : `characters/glim/colorways/${c}/glim-${pose}-${size > 256 ? 512 : 256}.webp`)} />}
  </span>
}
export const GlimHead = ({ cw = 'classic', size = 44 }: { cw?: string; size?: number }) =>
  <img className="avatar" style={{ width: size, height: size }} src={asset(`characters/glim/avatars/avatar-${cw}-${size > 64 ? 128 : 64}.png`)} alt="" />

// ---- icons (24px stroke set) ------------------------------------------------------------------------
const P: Record<string, ReactNode> = {
  journey: <><path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Z" /><path d="M9 4v13.5M15 6.5V20" /></>,
  practice: <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12L13 2Z" />,
  arena: <><path d="M7.5 4h9v5.5a4.5 4.5 0 0 1-9 0V4Z" /><path d="M7.5 6H4.5a3 3 0 0 0 3.6 4M16.5 6h3a3 3 0 0 1-3.6 4M12 14v3.5M8 21h8M9.5 17.5h5" /></>,
  circle: <><circle cx="12" cy="7.5" r="2.6" /><circle cx="5.5" cy="9.5" r="2.1" /><circle cx="18.5" cy="9.5" r="2.1" /><path d="M7.5 19.5c0-2.8 2-5 4.5-5s4.5 2.2 4.5 5M2.5 18c0-2 1.3-3.6 3-3.9M21.5 18c0-2-1.3-3.6-3-3.9" /></>,
  you: <><circle cx="12" cy="12" r="9.5" /><circle cx="12" cy="10" r="3.2" /><path d="M6.5 18.5c1.2-2.3 3.2-3.5 5.5-3.5s4.3 1.2 5.5 3.5" /></>,
  book: <><path d="M3 5.5h6.5A2.5 2.5 0 0 1 12 8v12a2 2 0 0 0-2-2H3V5.5Z" /><path d="M21 5.5h-6.5A2.5 2.5 0 0 0 12 8v12a2 2 0 0 1 2-2h7V5.5Z" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  chart: <path d="M5 20V12M10 20V6M15 20v-9M20 20V4" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />, x: <path d="M6 6l12 12M18 6 6 18" />,
  star: <path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8L12 3Z" />,
  lock: <><rect x="5" y="11" width="14" height="9.5" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  refresh: <><path d="M20 12a8 8 0 0 1-14.2 5M4 12a8 8 0 0 1 14.2-5" /><path d="M18.5 3v4.2h-4.2M5.5 21v-4.2h4.2" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h12l-2 4 2 4H5" /></>,
  gift: <><rect x="3.5" y="8" width="17" height="4.5" rx="1.5" /><path d="M5 12.5V20h14v-7.5M12 8v12M12 8c-1.7-3.5-5.5-3-4.7 0 .4 1.2 2.7 1 4.7 0Zm0 0c1.7-3.5 5.5-3 4.7 0-.4 1.2-2.7 1-4.7 0Z" /></>,
  flame: <path d="M12 3c1 3.5 5 5.4 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .2 1.4 1 2 2 2-.5-3 0-5 1-8Z" />,
  feather: <><path d="M20 4c-7 0-12 4.5-12 11v5" /><path d="M8 15c6 0 11-4 12-11M8 12h6M8 20h0" /></>,
  puzzle: <path d="M9 3.5h3v2a1.8 1.8 0 1 0 3.6 0v-2H20v5h-2a1.8 1.8 0 1 0 0 3.6h2V20h-5v-2a1.8 1.8 0 1 0-3.6 0v2H4v-5h2a1.8 1.8 0 1 0 0-3.6H4V3.5h5Z" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeoff: <><path d="M3 3l18 18M10.6 6.2A9.6 9.6 0 0 1 12 6c5 0 8.5 4.5 9.5 6-.5.8-1.5 2.2-3 3.5M6.2 7.7C4.4 9 3.1 10.8 2.5 12c1 1.5 4.5 6 9.5 6 1.5 0 2.9-.4 4.1-1" /><path d="M9.9 10a3 3 0 0 0 4.2 4.1" /></>,
  letter: <path d="M5 20 11 4h2l6 16M7.5 14h9" />,
  keyboard: <><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></>,
  quote: <path d="M7 7h4v4c0 3-1.5 5-4 6M15 7h4v4c0 3-1.5 5-4 6" />,
  listn: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  bookmark: <path d="M6 3.5h12V21l-6-4-6 4V3.5Z" />,
  sprout: <><path d="M12 21v-9" /><path d="M12 12c0-4 3-7 8-7 0 5-3 7-8 7ZM12 14c0-3-2.5-5.5-7-5.5 0 4 2.5 5.5 7 5.5Z" /></>,
  scale: <><path d="M12 3v18M7 21h10M4 7h16" /><path d="m4 7-2.5 6a3 3 0 0 0 5 0L4 7ZM20 7l-2.5 6a3 3 0 0 0 5 0L20 7Z" /></>,
  wifi: <path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01" />,
  shield: <><path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.2 7.5 9.5 4.3-1.3 7.5-5 7.5-9.5V6L12 3Z" /><path d="m9 12 2 2 4-4" /></>,
  back: <path d="M19 12H5m6-6-6 6 6 6" />, chev: <path d="m9 5 7 7-7 7" />, down: <path d="m6 9 6 6 6-6" />, up: <path d="m6 15 6-6 6 6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.2" /></>,
  spell: <><path d="M3 15 6.5 5h1L11 15M4.2 11.5h5.6" /><path d="m13 16 3 3 6-7" /></>,
  speaker: <><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></>,
  play: <path d="M8 5v14l11-7L8 5Z" />, pause: <path d="M8 5v14M16 5v14" />,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  grip: <path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" />,
  sparkle: <path d="M12 2c.6 4.9 2.6 7 7.5 7.5-4.9.6-6.9 2.6-7.5 7.5-.6-4.9-2.6-6.9-7.5-7.5C9.4 9 11.4 6.9 12 2Z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z" /><path d="M10 21h4" /></>,
  download: <><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></>,
  cloud: <><path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.5a4.3 4.3 0 0 1-.5 8.5H7Z" /><path d="M12 15V10M9.5 12.5 12 10l2.5 2.5" /></>,
  send: <path d="m4 12 16-8-6 16-2.5-6.5L4 12Z" />, mute: <><path d="M4 9v6h4l5 4V5L8 9H4ZM17 9l5 6M22 9l-5 6" /></>,
  door: <><path d="M14 4H6v16h8M10 12h11M18 9l3 3-3 3" /></>,
  plus: <path d="M12 5v14M5 12h14" />, filter: <path d="M4 5h16l-6 8v6l-4-2v-4L4 5Z" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12 20 3M16 7l3 3" /></>, alert: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></>,
  people: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" /><circle cx="17" cy="9" r="2.5" /><path d="M16.5 14c3 0 5 2 5 5" /></>,
  radio: <><circle cx="12" cy="12" r="2" /><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9.5 9.5 0 0 0 0 13M18.5 5.5a9.5 9.5 0 0 1 0 13" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3 4v4.5h4.5M12 8v4l3 2" /></>,
  ladder: <path d="M7 3v18M17 3v18M7 7h10M7 12h10M7 17h10" />,
  swap: <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />,
  signout: <><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
}
export const Icon = ({ n, className = '', style }: { n: string; className?: string; style?: CSSProperties }) => <svg className={`icon ${className}`} style={style} viewBox="0 0 24 24" aria-hidden focusable="false">{P[n]}</svg>

// ---- small primitives ---------------------------------------------------------------------------------
export function Sheet({ onClose, children, label, wide }: { onClose: () => void; children: ReactNode; label: string; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    addEventListener('keydown', k, true); return () => { removeEventListener('keydown', k, true); prev?.focus?.() }
  }, [onClose])
  return <div className="scrim" onClick={onClose}><div ref={ref} tabIndex={-1} className="sheet" style={wide ? { maxWidth: 720 } : undefined} role="dialog" aria-modal aria-label={label} onClick={e => e.stopPropagation()}><div className="grab" />{children}</div></div>
}
export const Toggle = ({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) =>
  <button className="toggle" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} />
export function StatPills() {
  const { points, activeDays } = useStore(); const { streak } = streakInfo(activeDays)
  return <div className="row gap8"><span className="stat-pill" title={`${streak}-day study streak`}><Icon n="flame" className="flame" />{streak}</span><span className="stat-pill xp" title="Personal XP"><Icon n="star" className="star" />{points.toLocaleString()}</span></div>
}
export function useManualData() {
  const code = useStore(s => s.manual)
  const [m, setM] = useState<Manual | null>(null)
  useEffect(() => { let on = true; loadManual(code).then(x => on && setM(x)); return () => { on = false } }, [code])
  return m && m.code === code ? m : null
}
export const Loading = () => <div className="page col" aria-busy="true" aria-label="Loading">
  <div className="skel" style={{ height: 22, width: '40%' }} /><div className="skel" style={{ height: 90 }} /><div className="skel" style={{ height: 90 }} /></div>
export function StateCard({ img, title, body, action, tone }: { img?: string; title: string; body?: string; action?: ReactNode; tone?: 'error' }) {
  return <div className="card col" role={tone === 'error' ? 'alert' : undefined}>
    <div className="statecard">{img && <img src={asset(`illustrations/states/state-${img}-256.webp`)} alt="" />}<div><h3 style={tone === 'error' ? { color: 'var(--rh-incorrect)' } : undefined}>{title}</h3>{body && <p className="small muted mt8">{body}</p>}</div></div>{action}</div>
}
export function Mastery({ s, t, l, total, legend = true }: { s: number; t: number; l: number; total: number; legend?: boolean }) {
  const w = (n: number) => `${total ? (n / total) * 100 : 0}%`
  return <div><div className="bar stack" role="img" aria-label={`${s} secure, ${t} strengthening, ${l} learning, of ${total}`}><i className="s" style={{ width: w(s) }} /><i className="t" style={{ width: w(t) }} /><i className="l" style={{ width: w(l) }} /></div>
    {legend && <div className="row wrap tiny muted mt8" style={{ gap: 12 }}><span>● <b style={{ color: 'var(--rh-node-done)' }}>Secure</b> {s}</span><span>● <b style={{ color: 'var(--rh-action)' }}>Strengthening</b> {t}</span><span>● <b style={{ color: 'var(--rh-apricot-deep)' }}>Learning</b> {l}</span><span>Not started {Math.max(0, total - s - t - l)}</span></div>}</div>
}
export function ContextSheet({ refs, onClose }: { refs: string[]; onClose: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof readInContext>>[] | null>(null)
  useEffect(() => { Promise.all(refs.map(readInContext)).then(setData) }, [refs])
  return <Sheet label="Read in context" onClose={onClose}><div className="col"><p className="eyebrow">Read in context · KJV</p>
    {!data ? <div className="skel" style={{ height: 80 }} /> : data.map((d, i) => d ? <div key={i}><h3>{d.ref}</h3>{d.verses.map(v => <p key={v.n} className="row" style={{ alignItems: 'flex-start', padding: '6px 8px', borderRadius: 10, background: v.hit ? 'var(--rh-pistachio-bg)' : undefined }}><sup className="faint b">{v.n}</sup><span style={{ font: 'var(--rh-type-reader)' }}>{v.t}</span></p>)}</div> : <p key={i} className="muted">{refs[i]} is not in the stored text.</p>)}
    <p className="tiny faint">King James Version · public domain · display only</p>
    <button className="btn sec block" onClick={onClose}>Close</button></div></Sheet>
}
export function useToast() {
  const [t, setT] = useState('')
  useEffect(() => { if (!t) return; const x = setTimeout(() => setT(''), 2600); return () => clearTimeout(x) }, [t])
  return [t ? <div className="toast" role="status">{t}</div> : null, setT] as const
}
export const BackBar = ({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) =>
  <div className="topbar"><button className="iconbtn" aria-label="Back" onClick={onBack}><Icon n="back" /></button><div className="t">{title}</div><div style={{ minWidth: 48, display: 'flex', justifyContent: 'flex-end' }}>{right}</div></div>
