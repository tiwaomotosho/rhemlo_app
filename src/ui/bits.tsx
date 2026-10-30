import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from '@/lib/store'
import { loadManual } from '@/lib/data'
import type { Manual } from '@/lib/types'

export const CW = ['classic', 'twilight', 'meadow', 'rosewood', 'midnight', 'ocean']
export const asset = (p: string) => `/assets/${p}`

export function Glim({ pose = 'idle', size = 160, cw, className = '', style }: { pose?: string; size?: number; cw?: string; className?: string; style?: React.CSSProperties }) {
  const mine = useStore(s => s.profile.glim)
  const c = cw ?? mine ?? 'classic'
  return <img className={className} style={style} width={size} height={size} alt="" aria-hidden
    src={asset(`characters/glim/colorways/${c}/glim-${pose}-${size > 256 ? 512 : 256}.webp`)}
    onError={e => { const t = e.currentTarget; if (!t.dataset.f) { t.dataset.f = '1'; t.src = asset(`characters/glim/poses/square-256/glim-${pose}.webp`) } }} />
}

const P: Record<string, ReactNode> = {
  journey: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></>,
  practice: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r=".6" /></>,
  arena: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 20h8M10 17h4" /></>,
  circle: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" /><circle cx="17" cy="9" r="2.5" /><path d="M16.5 14c3 0 5 2 5 5" /></>,
  you: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />, x: <path d="M6 6l12 12M18 6 6 18" />,
  star: <path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8L12 3Z" />,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  flame: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .2 1.4 1 2 2 2-.5-3 0-5 1-8Z" />,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" /><path d="M4 21.5A2.5 2.5 0 0 1 6.5 19H20" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  back: <path d="m15 5-7 7 7 7" />, chev: <path d="m9 5 7 7-7 7" />, bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  gift: <><rect x="3" y="8" width="18" height="5" rx="1.5" /><path d="M5 13v8h14v-8M12 8v13M12 8c-2-4-6-3-5 0 .5 1.3 3 1 5 0Zm0 0c2-4 6-3 5 0-.5 1.3-3 1-5 0Z" /></>,
  speaker: <><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
}
export const Icon = ({ n, className = '' }: { n: string; className?: string }) => <svg className={`icon ${className}`} viewBox="0 0 24 24" aria-hidden>{P[n]}</svg>

export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose])
  return <div className="scrim" onClick={onClose}><div className="sheet" role="dialog" aria-modal aria-label={label} onClick={e => e.stopPropagation()}><div className="grab" />{children}</div></div>
}

export function useManualData() {
  const code = useStore(s => s.manual)
  const [m, setM] = useState<Manual | null>(null)
  useEffect(() => { let on = true; setM(null); loadManual(code).then(x => on && setM(x)); return () => { on = false } }, [code])
  return m
}

export const Loading = ({ text = 'Loading…' }: { text?: string }) => <div className="splash"><Glim pose="read" size={128} /><p className="muted">{text}</p></div>

export function Segments({ s, t, l, total }: { s: number; t: number; l: number; total: number }) {
  const w = (n: number) => `${total ? (n / total) * 100 : 0}%`
  return <><div className="bar" role="img" aria-label={`${s} secure, ${t} strengthening, ${l} learning of ${total}`}><i className="s" style={{ width: w(s) }} /><i className="t" style={{ width: w(t) }} /><i className="l" style={{ width: w(l) }} /></div>
    <div className="legend" style={{ marginTop: 8 }}><span><b style={{ background: 'var(--rh-node-done)' }} />Secure {s}</span><span><b style={{ background: 'var(--rh-gold)' }} />Strengthening {t}</span><span><b style={{ background: 'var(--rh-apricot)' }} />Learning {l}</span><span><b style={{ background: 'var(--rh-raised)' }} />Not started {Math.max(0, total - s - t - l)}</span></div></>
}
