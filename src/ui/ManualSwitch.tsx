import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadManual } from '@/lib/data'
import { useStore } from '@/lib/store'
import type { Manual, ManualCode } from '@/lib/types'
import { Icon, Sheet } from './bits'

const CODES: ManualCode[] = ['AD2627', 'EN2627']
const SPINE: Record<ManualCode, string> = { AD2627: '#7041D9', EN2627: '#FFAA72' }
export const manualLabel = (c: ManualCode) => c === 'AD2627' ? 'Adult 2026–27' : 'YAYA 2026–27'

/** Pick a manual. Each manual keeps its own progress, so the sheet says how far you are in each. */
export function ManualSheet({ onClose }: { onClose: () => void }) {
  const { manual, done, set } = useStore(); const nav = useNavigate(); const [ms, setMs] = useState<Manual[]>([])
  useEffect(() => { Promise.all(CODES.map(c => loadManual(c))).then(setMs) }, [])
  const pick = (c: ManualCode) => { if (c !== manual) set({ manual: c, flash: `Now studying ${manualLabel(c)}. Each manual keeps its own progress.` }); onClose() }
  return <Sheet label="Switch manual" onClose={onClose}><div className="col">
    <h2>Switch manual</h2><p className="small muted">Your progress in each manual is kept separately. Switching never mixes or loses it.</p>
    {CODES.map(c => { const m = ms.find(x => x.code === c); const cleared = Object.keys(done).filter(k => k.startsWith(c + '|')).length
      return <button key={c} className={`choice ${manual === c ? 'on' : ''}`} aria-pressed={manual === c} onClick={() => pick(c)}>
        <span className="spine" style={{ background: SPINE[c] }}><Icon n="book" /></span>
        <span className="grow"><b className="disp" style={{ fontSize: 16 }}>{manualLabel(c)}</b><span className="tiny muted" style={{ display: 'block' }}>{m ? `${m.lessons.length} lessons · ${m.bible}` : '…'} · {cleared ? `${cleared} lesson${cleared === 1 ? '' : 's'} cleared` : 'not started'}</span></span>
        {manual === c ? <span className="chip">In use</span> : <span className="chip plain"><Icon n="swap" />Switch</span>}</button> })}
    <button className="btn link" onClick={() => { onClose(); nav('/you/access') }}>Access &amp; manuals</button></div></Sheet>
}

export function useManualSwitch() {
  const [open, setOpen] = useState(false)
  return [open ? <ManualSheet onClose={() => setOpen(false)} /> : null, () => setOpen(true)] as const
}
