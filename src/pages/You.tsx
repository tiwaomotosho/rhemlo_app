import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { streakInfo, useStore, type Theme } from '@/lib/store'
import type { ManualCode } from '@/lib/types'
import { CW, Glim, Icon } from '@/ui/bits'

export default function You() {
  const S = useStore(); const nav = useNavigate(); const file = useRef<HTMLInputElement>(null); const [msg, setMsg] = useState(''); const [sure, setSure] = useState(false)
  const { streak } = streakInfo(S.activeDays)
  const exportData = () => {
    const { profile, manual, theme, sessionSize, cards, done, ladder, history, points, activeDays } = S
    const url = URL.createObjectURL(new Blob([JSON.stringify({ v: 1, profile, manual, theme, sessionSize, cards, done, ladder, history, points, activeDays }, null, 1)], { type: 'application/json' }))
    Object.assign(document.createElement('a'), { href: url, download: `rhemlo-progress-${new Date().toISOString().slice(0, 10)}.json` }).click(); URL.revokeObjectURL(url)
  }
  const importData = async (f?: File) => {
    if (!f) return
    try { const d = JSON.parse(await f.text()); if (d.v !== 1 || !d.cards) throw 0; S.set({ ...d, onboarded: true }); setMsg('Progress restored.') } catch { setMsg('That file is not a Rhemlo backup.') }
  }
  return <div className="col" style={{ gap: 18 }}>
    <div className="card tint row" style={{ gap: 16 }}><Glim pose="profile" size={256} style={{ width: 96, height: 96 }} /><div className="grow"><p className="eyebrow">You</p><h1>{S.profile.name}</h1><p className="small muted">@{S.profile.handle || 'friend'} · saved on this device</p></div></div>
    <div className="stat"><div className="card"><b>{S.points}</b><span className="small muted">XP</span></div><div className="card"><b>{streak}</b><span className="small muted">day streak</span></div><div className="card"><b>{S.history.length}</b><span className="small muted">sittings</span></div></div>
    <div className="desk2"><div className="col">
      <Link to="/progress" className="quest" style={{ color: 'inherit' }}><span className="q-ico"><Icon n="journey" /></span><span className="grow"><b>Progress &amp; planner</b><div className="small muted">Mastery, countdown and a daily pace</div></span><Icon n="chev" /></Link>
      <Link to="/library" className="quest" style={{ color: 'inherit' }}><span className="q-ico"><Icon n="book" /></span><span className="grow"><b>Library</b><div className="small muted">Read every lesson</div></span><Icon n="chev" /></Link>
      <div className="card col"><h3>Appearance</h3><div className="seg" role="group" aria-label="Theme">{(['system', 'light', 'dark'] as Theme[]).map(t => <button key={t} className={S.theme === t ? 'on' : ''} aria-pressed={S.theme === t} onClick={() => S.set({ theme: t })} style={{ textTransform: 'capitalize' }}>{t}</button>)}</div>
        <span className="lbl">Your Glim</span><div className="row wrap" style={{ gap: 8 }}>{CW.map(c => <button key={c} aria-label={c} aria-pressed={S.profile.glim === c} className={`cw ${S.profile.glim === c ? 'on' : ''}`} style={{ width: 84 }} onClick={() => S.set({ profile: { ...S.profile, glim: c } })}><Glim pose="stand" size={256} cw={c} style={{ width: 56, height: 56 }} />{c}</button>)}</div></div>
    </div><div className="col">
      <div className="card col"><h3>Study</h3>
        <span className="lbl">Manual</span><div className="seg">{(['AD2627', 'EN2627'] as ManualCode[]).map(c => <button key={c} className={S.manual === c ? 'on' : ''} onClick={() => S.set({ manual: c })}>{c === 'AD2627' ? 'Adult' : 'Entry'}</button>)}</div>
        <span className="lbl">Sitting length</span><div className="seg">{[10, 20, 30].map(n => <button key={n} className={S.sessionSize === n ? 'on' : ''} onClick={() => S.set({ sessionSize: n })}>{n}</button>)}</div>
        <p className="hint"><Icon n="info" />Progress for each manual is kept separately.</p></div>
      <div className="card col"><h3>Your data</h3><p className="small muted">Everything lives in this browser. Back it up before clearing site data or switching devices — accounts and sync come later.</p>
        <div className="row"><button className="btn ghost sm grow" onClick={exportData}>Export backup</button><button className="btn ghost sm grow" onClick={() => file.current?.click()}>Restore</button></div>
        <input ref={file} type="file" accept="application/json" hidden onChange={e => importData(e.target.files?.[0])} />{msg && <p className="small" role="status">{msg}</p>}
        {!sure ? <button className="btn quiet" onClick={() => setSure(true)}>Reset all progress…</button> : <div className="card tint col"><p><b>Erase everything on this device?</b> This cannot be undone.</p><div className="row"><button className="btn ghost sm grow" onClick={() => setSure(false)}>Keep it</button><button className="btn bad sm grow" onClick={() => { S.reset(); nav('/', { replace: true }) }}>Erase</button></div></div>}</div>
    </div></div>
  </div>
}
