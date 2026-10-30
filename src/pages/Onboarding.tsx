import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, type Goal, type Pace } from '@/lib/store'
import type { ManualCode } from '@/lib/types'
import { CW, Glim, Icon, asset } from '@/ui/bits'

const GOALS: [Goal, string, string][] = [
  ['recall', 'Recall it all', 'Hold every lesson, verse and outline securely.'],
  ['competition', 'Compete well', 'Sharpen speed and accuracy for quiz nights.'],
  ['habit', 'Build a habit', 'A calm daily rhythm that sticks.'],
]
const PACES: [Pace, number, string][] = [['light', 10, '10 questions · about 4 min'], ['steady', 20, '20 questions · about 8 min'], ['focused', 30, '30 questions · about 12 min']]
const MANUALS: [ManualCode, string, string][] = [['AD2627', 'Adult manual', 'Lessons 1–51 · 2026–27'], ['EN2627', 'Entry manual', 'Lessons 1–51 · 2026–27']]

export default function Onboarding() {
  const nav = useNavigate(); const finish = useStore(s => s.finishOnboarding); const set = useStore(s => s.set)
  const [step, setStep] = useState(0)
  const [name, setName] = useState(''); const [goal, setGoal] = useState<Goal>('recall'); const [pace, setPace] = useState<Pace>('steady')
  const [manual, setManual] = useState<ManualCode>('AD2627'); const [glim, setGlim] = useState('classic')
  const go = () => {
    const n = name.trim() || 'Friend'
    set({ sessionSize: PACES.find(p => p[0] === pace)![1] })
    finish({ name: n, handle: n.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14), goal, pace, glim }, manual)
    nav('/journey', { replace: true })
  }
  if (step === 0) return <div className="splash" style={{ background: 'var(--rh-bg)' }}>
    <img className="hero-img" src={asset('worlds/scenes/hero-sunrise/hero-sunrise-800.webp')} alt="" />
    <Glim pose="wave" size={160} cw="classic" motion="wave" once style={{ marginTop: -90 }} />
    <div className="col" style={{ alignItems: 'center', maxWidth: 440 }}>
      <h1 style={{ fontSize: 34, lineHeight: '38px' }}>Little quests.<br />Lasting light.</h1>
      <p className="muted">Memorise Scripture with short sittings, honest marking and a map that remembers where you are.</p>
    </div>
    <button className="btn block" style={{ maxWidth: 360 }} onClick={() => setStep(1)}>Get started</button>
    <p className="small muted" style={{ maxWidth: 360 }}>Your progress is saved on this device. No account needed to begin.</p>
  </div>

  return <div className="splash" style={{ justifyContent: 'flex-start', paddingTop: 28, maxWidth: 560, margin: '0 auto', textAlign: 'left', alignItems: 'stretch' }}>
    <div className="row"><button className="iconbtn" aria-label="Back" onClick={() => setStep(step - 1)}><Icon n="back" /></button>
      <div className="bar grow"><i className="s" style={{ width: `${(step / 3) * 100}%`, background: 'var(--rh-action)' }} /></div><span className="small muted">{step} of 3</span></div>
    {step === 1 && <>
      <div className="row"><Glim pose="point" size={96} /><div><h1>Who is studying?</h1><p className="muted">Glim will call you by name.</p></div></div>
      <label className="lbl" htmlFor="nm">First name</label>
      <input id="nm" className="field" value={name} onChange={e => setName(e.target.value)} autoComplete="off" autoCorrect="off" autoCapitalize="words" spellCheck={false} maxLength={24} placeholder="Your name" />
      <h3>What matters most?</h3>
      <div className="col">{GOALS.map(([k, t, d]) => <button key={k} className={`choice ${goal === k ? 'on' : ''}`} onClick={() => setGoal(k)}><div className="grow"><b>{t}</b><div className="small muted">{d}</div></div>{goal === k && <Icon n="check" />}</button>)}</div>
    </>}
    {step === 2 && <>
      <div className="row"><Glim pose="map" size={96} /><div><h1>Choose your manual</h1><p className="muted">You can switch later in You.</p></div></div>
      <div className="col">{MANUALS.map(([k, t, d]) => <button key={k} className={`choice ${manual === k ? 'on' : ''}`} onClick={() => setManual(k)}><div className="grow"><b>{t}</b><div className="small muted">{d}</div></div>{manual === k && <Icon n="check" />}</button>)}</div>
      <h3>How long is a sitting?</h3>
      <div className="col">{PACES.map(([k, , d]) => <button key={k} className={`choice ${pace === k ? 'on' : ''}`} onClick={() => setPace(k)}><div className="grow"><b style={{ textTransform: 'capitalize' }}>{k}</b><div className="small muted">{d}</div></div>{pace === k && <Icon n="check" />}</button>)}</div>
      <p className="hint"><Icon n="info" />Every sitting shows its length up front, and you can save and leave at any time.</p>
    </>}
    {step === 3 && <>
      <div className="row"><Glim pose="cheer" size={96} cw={glim} /><div><h1>Pick your Glim</h1><p className="muted">Same friend, your colours.</p></div></div>
      <div className="cwgrid">{CW.map(c => <button key={c} className={`cw ${glim === c ? 'on' : ''}`} onClick={() => setGlim(c)} aria-pressed={glim === c}><Glim pose="stand" size={256} cw={c} className="" style={{ width: 72, height: 72 }} />{c}</button>)}</div>
    </>}
    <div style={{ marginTop: 'auto', paddingTop: 12 }}>
      {step < 3 ? <button className="btn block" onClick={() => setStep(step + 1)}>Continue</button> : <button className="btn block" onClick={go}>Start my journey</button>}
    </div>
  </div>
}
