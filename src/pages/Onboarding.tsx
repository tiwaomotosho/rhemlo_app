import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DEFAULT_PREFS, useStore, type Goal as GoalT, type Pace as PaceT } from '@/lib/store'
import type { ManualCode } from '@/lib/types'
import { Glim, Icon, Sheet, Toggle, asset } from '@/ui/bits'
import { api, isDemo } from '@/lib/backend'
import { signIn, signUp, syncNow, redeemLink } from '@/lib/sync'

// The answers given during onboarding live here until the last step commits them.
type Draft = { goal: GoalT; name: string; handle: string; manual: ManualCode; size: number; keepPrivate: boolean; leagues: boolean; account?: boolean }
const KEY = 'rhemlo.join'
const read = (): Draft => { try { return { goal: 'recall', name: '', handle: '', manual: 'AD2627', size: 20, keepPrivate: true, leagues: false, ...JSON.parse(sessionStorage.getItem(KEY) ?? '{}') } } catch { return { goal: 'recall', name: '', handle: '', manual: 'AD2627', size: 20, keepPrivate: true, leagues: false } } }
const save = (d: Partial<Draft>) => { try { sessionStorage.setItem(KEY, JSON.stringify({ ...read(), ...d })) } catch { /* private mode */ } }
const isDark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches)

export function Welcome() {
  const nav = useNavigate(); const [signin, setSignin] = useState(false); const dark = isDark()
  const hero = dark ? 'worlds/maps/meadow-night/meadow-night-800.webp' : 'worlds/scenes/hero-sunrise/hero-sunrise-800.webp'
  const heroL = dark ? 'worlds/maps/meadow-night/meadow-night-1254.webp' : 'worlds/scenes/hero-sunrise/hero-sunrise-1254.webp'
  return <div className="wel">
    <div className="wel-mob">
      <div className="wel-hero"><img className="bg" src={asset(hero)} alt="" />
        <div className="wel-pill"><img src={asset('characters/glim/avatars/avatar-classic-64.png')} width={28} height={28} alt="" />Rhemlo</div>
        <Glim pose="wave" motion="wave" once size={220} cw="classic" className="wel-glim" /></div>
      <div className="wel-copy">
        <h1>Your next chapter starts here.</h1>
        <p className="muted">Learn your Sunday School manual word for word, one small quest at a time.</p>
        <button className="btn block" onClick={() => nav('/join/goal')}>Get started</button>
        <button className="btn sec block" onClick={() => setSignin(true)}>I already have an account</button>
        <p className="tiny faint">No app store needed. Works in your browser.</p>
      </div>
    </div>
    <div className="wel-desk">
      <div className="l">
        <div className="row"><Glim pose="read" size={60} still cw="classic" /><span className="disp" style={{ fontSize: 30 }}>Rhemlo</span></div>
        <h1>Little quests.<br /><span>Lasting light.</span></h1>
        <p className="muted" style={{ fontSize: 19, lineHeight: '30px', maxWidth: 480 }}>Master your Sunday School manual word for word through short quests, precise feedback, weekly leagues and Quiz Nights with your church.</p>
        <div className="row"><button className="btn" onClick={() => nav('/join/goal')}>Get started</button><button className="btn sec" onClick={() => setSignin(true)}>Sign in</button></div>
        <div className="row wrap gap8">{[['target', 'Exact recall'], ['lantern', 'Real stopping points'], ['fair', 'Private by default']].map(([b, t]) =>
          <span key={b} className="promise"><img src={asset(`emblems/badges/badge-${b}-128.webp`)} alt="" />{t}</span>)}</div>
      </div>
      <div className="r"><img src={asset(heroL)} alt="" />
        <div className="proof" style={{ left: '12%', top: '44%' }}><span className="tile green" style={{ width: 36, height: 36 }}><Icon n="check" /></span><div><b className="disp">That is the one.</b><div className="tiny muted">1 Timothy 4:8 · Secure</div></div></div>
        <div className="proof" style={{ right: '8%', top: '64%' }}><img src={asset('emblems/badges/badge-lantern-128.webp')} width={36} height={36} alt="" /><div><b className="disp">Quest complete.</b><div className="tiny muted">A good place to stop</div></div></div>
        <Glim pose="wave" motion="wave" once size={300} cw="classic" style={{ position: 'absolute', left: '38%', bottom: 0 }} />
      </div>
    </div>
    {signin && <SignInSheet onClose={() => setSignin(false)} />}
  </div>
}

function Stepper({ n, back }: { n: number; back: () => void }) {
  return <div className="stepper"><button className="iconbtn" aria-label="Back" onClick={back}><Icon n="back" /></button>
    <div className="bar thin" role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={n}><i style={{ width: `${(n / 4) * 100}%` }} /></div><span className="small b">{n}/4</span></div>
}

const GOALS: [GoalT, string, string, string][] = [
  ['recall', 'Build exact recall', 'Word-for-word memory of your manual', 'target'],
  ['competition', 'Prepare for competition', 'Quarter tests and the Finale', 'star'],
  ['habit', 'Grow a daily habit', 'A little each day, at your pace', 'seed'],
]
export function Goal() {
  const nav = useNavigate(); const [goal, setGoal] = useState(read().goal)
  return <div className="ob">
    <Stepper n={1} back={() => nav('/welcome')} />
    <div className="row" style={{ margin: '8px 0 16px' }}><Glim pose="think" size={110} /><div className="glimbubble">What brings you here?</div></div>
    <div className="col" role="radiogroup" aria-label="Your goal">{GOALS.map(([k, t, d, b]) =>
      <button key={k} role="radio" aria-checked={goal === k} className={`choice ${goal === k ? 'on' : ''}`} onClick={() => setGoal(k)}>
        <img src={asset(`emblems/badges/badge-${b}-128.webp`)} alt="" /><span className="grow"><b className="disp" style={{ fontSize: 16 }}>{t}</b><span className="small muted" style={{ display: 'block' }}>{d}</span></span>
        {goal === k && <span className="tile" style={{ width: 28, height: 28, borderRadius: 99, background: 'var(--rh-action)', color: 'var(--rh-action-fg)' }}><Icon n="check" className="s" /></span>}</button>)}</div>
    <p className="hint mt16"><Icon n="info" />Your goal shapes suggestions only. Marking is the same for everyone.</p>
    <div className="foot"><button className="btn block" onClick={() => { save({ goal }); nav('/join/account') }}>Continue</button></div>
  </div>
}

export function SignInSheet({ onClose }: { onClose: () => void }) {
  const nav = useNavigate(); const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [show, setShow] = useState(false)
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const go = async (e?: string, p?: string) => {
    setBusy(true); setErr('')
    try { await signIn(e ?? email, p ?? pw); nav('/journey', { replace: true }) } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  return <Sheet label="Sign in" onClose={onClose}><form className="col" onSubmit={e => { e.preventDefault(); go() }}>
    <div className="row"><Glim pose="peek" size={72} /><div><h2>Welcome back</h2><p className="small muted">Your progress follows your account.</p></div></div>
    <div><label className="lbl" htmlFor="si-e">Email</label><input id="si-e" className="field" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
    <div><label className="lbl" htmlFor="si-p">Password</label><div className="fwrap"><input id="si-p" className="field" type={show ? 'text' : 'password'} autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} required style={{ paddingRight: 52 }} />
      <button type="button" className="iconbtn" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)} style={{ position: 'absolute', right: 2, top: 2 }}><Icon n={show ? 'eyeoff' : 'eye'} /></button></div></div>
    {err && <p className="small" role="alert" style={{ color: 'var(--rh-incorrect)' }}>{err}</p>}
    <button className="btn block" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    {isDemo && <div className="card lav col gap8"><div className="row between"><b className="small">Demo accounts</b><span className="chip pend">Demo</span></div>
      {api.demoAccounts().map(a => <button key={a.email} type="button" className="li row" style={{ border: 0, background: 'transparent', textAlign: 'left', color: 'inherit', padding: '6px 0' }} disabled={busy} onClick={() => go(a.email, a.password)}>
        <span className="grow"><b className="small">{a.email}</b><span className="tiny muted" style={{ display: 'block' }}>{a.who}</span></span><span className="btn sec xs">Use</span></button>)}
      <p className="tiny muted">Password for all demo accounts: <b>{api.demoAccounts()[0]?.password}</b>. Demo people and their activity are simulated.</p></div>}
    <PasswordlessRow email={email} onDone={() => nav('/journey', { replace: true })} onErr={setErr} />
  </form></Sheet>
}

/** Magic link (demo: an on-screen outbox stands in for email) and passkey sign-in (WebAuthn, this device). */
function PasswordlessRow({ email, onDone, onErr }: { email: string; onDone: () => void; onErr: (m: string) => void }) {
  const [sent, setSent] = useState<{ email: string; token: string }[] | null>(null); const [busy, setBusy] = useState(false)
  const keys = (() => { try { return JSON.parse(localStorage.getItem('rhemlo.passkeys') ?? '{}') as Record<string, string> } catch { return {} } })()
  const link = async () => { if (!/.+@.+\..+/.test(email)) { onErr('Enter your email first.'); return } setBusy(true); onErr('')
    try { await api.sendLink(email); setSent(isDemo ? (JSON.parse(localStorage.getItem('rhemlo.demo.magic') ?? '[]') as { email: string; token: string }[]).filter(b => b.email === email.trim().toLowerCase()).slice(0, 1) : []) } catch (x) { onErr((x as Error).message) } finally { setBusy(false) } }
  const passkey = async () => {
    onErr(''); if (!window.PublicKeyCredential) { onErr('This browser does not support passkeys.'); return }
    const ids = Object.keys(keys); if (!ids.length) { onErr('No passkey on this device yet. Sign in once, then add one in You.'); return }
    try { const c = await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: ids.map(id => ({ id: Uint8Array.from(atob(id), ch => ch.charCodeAt(0)), type: 'public-key' as const })), userVerification: 'preferred', timeout: 60000 } }) as PublicKeyCredential | null
      const who = c && keys[btoa(String.fromCharCode(...new Uint8Array(c.rawId)))]; if (!who) throw new Error('That passkey is not linked to an account here.')
      await api.sendLink(who); const t = (JSON.parse(localStorage.getItem('rhemlo.demo.magic') ?? '[]') as { email: string; token: string }[]).find(b => b.email === who)!; await redeemLink(t.token); onDone()
    } catch (x) { onErr((x as Error).name === 'NotAllowedError' ? 'Passkey sign-in was cancelled.' : (x as Error).message) }
  }
  return <div className="col gap8">
    <div className="row gap8"><button type="button" className="btn sec grow" disabled={busy} onClick={link}><Icon n="send" className="s" />Email me a link</button>{isDemo && <button type="button" className="btn sec grow" onClick={passkey}><Icon n="key" className="s" />Use a passkey</button>}</div>
    {sent && (isDemo ? sent.map(s => <div key={s.token} className="card lav col gap8"><b className="small">Demo outbox · to {s.email}</b><p className="tiny muted">“Tap to sign in to Rhemlo. This link works once and expires in 15 minutes.”</p>
      <button type="button" className="btn xs" onClick={async () => { try { await redeemLink(s.token); onDone() } catch (x) { onErr((x as Error).message) } }}>Open sign-in link</button></div>) : <p className="small" role="status">Check your email for a sign-in link.</p>)}
  </div>
}

export function Account() {
  const nav = useNavigate(); const d = read(); const [name, setName] = useState(d.name); const [handle, setHandle] = useState(d.handle)
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [show, setShow] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [signin, setSignin] = useState(false)
  const clean = (h: string) => h.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20)
  const create = async () => {
    setBusy(true); setErr('')
    try { await signUp(email, pw, clean(handle) || name.toLowerCase().replace(/[^a-z0-9]/g, ''), name.trim()); save({ name: name.trim(), handle: clean(handle), account: true }); nav('/join/manual') }
    catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  return <div className="ob">
    <div className="topbar"><button className="iconbtn" aria-label="Back" onClick={() => nav('/join/goal')}><Icon n="back" /></button>{isDemo && <span className="chip pend" style={{ marginLeft: 'auto' }}>Demo server</span>}</div>
    <div className="row" style={{ alignItems: 'flex-end', marginBottom: 18 }}><Glim pose="read" size={92} /><div><h1>Create your account</h1><p className="small muted">Keep your progress on every device.</p></div></div>
    <form className="col gap16" onSubmit={e => { e.preventDefault(); create() }}>
      <div><label className="lbl" htmlFor="nm">First name</label><input id="nm" className="field" value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" maxLength={30} required /></div>
      <div><label className="lbl" htmlFor="em">Email</label><input id="em" className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></div>
      <div><label className="lbl" htmlFor="pw">Password</label><div className="fwrap"><input id="pw" className="field" type={show ? 'text' : 'password'} value={pw} minLength={8} onChange={e => setPw(e.target.value)} autoComplete="new-password" required style={{ paddingRight: 52 }} />
        <button type="button" className="iconbtn" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)} style={{ position: 'absolute', right: 2, top: 2 }}><Icon n={show ? 'eyeoff' : 'eye'} /></button></div>
        <p className="tiny muted mt8"><Icon n="key" className="s" style={{ verticalAlign: 'middle' }} /> Password managers and paste work here. At least 8 characters.</p></div>
      <div><label className="lbl" htmlFor="hd">Public handle (optional)</label><input id="hd" className="field" value={handle} onChange={e => setHandle(clean(e.target.value))} autoComplete="nickname" placeholder="e.g. tiwa_lamp" />
        <p className="tiny muted mt8">Never your email, phone or church.</p></div>
      {err && <p className="small" role="alert" style={{ color: 'var(--rh-incorrect)' }}>{err}</p>}
      <button className="btn block" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      <div className="row gap8"><span className="grow" style={{ height: 1, background: 'var(--rh-line)' }} /><span className="tiny muted">or</span><span className="grow" style={{ height: 1, background: 'var(--rh-line)' }} /></div>
      <button type="button" className="btn sec block" onClick={() => setSignin(true)}>I already have an account</button>
      <button type="button" className="btn link" onClick={() => { if (!name.trim()) { setErr('Add your first name so Glim can greet you.'); return } save({ name: name.trim(), handle: clean(handle) }); nav('/join/manual') }}>Continue without an account</button>
      <p className="tiny faint center">Without an account, progress stays on this device. You can create one later in You.</p>
    </form>
    {signin && <SignInSheet onClose={() => setSignin(false)} />}
  </div>
}

export function ManualPick() {
  const nav = useNavigate(); const [m, setM] = useState<ManualCode>(read().manual)
  const opts: [ManualCode, string, string, string, string][] = [
    ['AD2627', 'Adult 2026–2027', 'RCCG Sunday School Student’s Manual · AD2627', '48 lessons · KJV text', '#7041D9'],
    ['EN2627', 'YAYA 2026–2027', 'Young Adults & Youths · EN2627', '48 lessons · NKJV printed', '#FFAA72'],
  ]
  return <div className="ob">
    <Stepper n={2} back={() => nav('/join/account')} />
    <h1 className="mt8">Choose your manual</h1><p className="small muted">Each manual keeps its own progress.</p>
    <div className="col mt16" role="radiogroup" aria-label="Manual">{opts.map(([k, t, s, meta, c]) =>
      <button key={k} role="radio" aria-checked={m === k} className={`choice ${m === k ? 'on' : ''}`} onClick={() => setM(k)} style={{ alignItems: 'flex-start' }}>
        <span className="spine" style={{ background: c }}><Icon n="book" /></span>
        <span className="grow"><b className="disp" style={{ fontSize: 16 }}>{t}</b><span className="small muted" style={{ display: 'block' }}>{s}</span>
          <span className="row gap8 mt8"><span className="chip ok">Available</span><span className="tiny muted">{meta}</span></span></span></button>)}</div>
    <div className="foot"><button className="btn block" onClick={() => { save({ manual: m }); nav('/join/pace') }}>Continue with {m === 'AD2627' ? 'Adult' : 'YAYA'}</button></div>
  </div>
}

export function Pace() {
  const nav = useNavigate(); const d = read(); const finish = useStore(s => s.finishOnboarding); const set = useStore(s => s.set)
  const [size, setSize] = useState(d.size); const [priv, setPriv] = useState(d.keepPrivate); const [lg, setLg] = useState(d.leagues)
  const go = () => {
    const x = read(); const name = x.name || 'Friend'
    set({ sessionSize: size, prefs: { ...DEFAULT_PREFS, keepPrivate: priv, leagues: lg }, arenaOptIn: lg })
    const acct = useStore.getState().account
    finish({ name, handle: (acct ? api.session()?.user.handle : '') || x.handle || name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14), goal: x.goal, pace: size <= 10 ? 'light' : size >= 40 ? 'focused' : 'steady', glim: 'classic' }, x.manual)
    try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
    void syncNow()
    nav('/practice/session', { replace: true, state: { spec: { kind: 'quest', manual: x.manual, lessons: ['L01'], count: size, title: 'Lesson 1 · Recall' } } })
  }
  return <div className="ob">
    <Stepper n={3} back={() => nav('/join/manual')} />
    <h1 className="mt8">How long is a sitting?</h1><p className="small muted">Every sitting has a real finish line.</p>
    <div className="col mt16" role="radiogroup" aria-label="Sitting length">{([[10, 'Quick', 'About 4 minutes'], [20, 'Steady', 'About 8 minutes'], [40, 'Deep', 'About 16 minutes']] as const).map(([n, t, s]) =>
      <button key={n} role="radio" aria-checked={size === n} className={`choice ${size === n ? 'on' : ''}`} style={{ minHeight: 64 }} onClick={() => setSize(n)}>
        <b className="disp" style={{ fontSize: 24, width: 44 }}>{n}</b><span className="grow"><b className="disp">{t}</b><span className="small muted" style={{ display: 'block' }}>{s}</span></span>{n === 20 && <span className="chip plain">Default</span>}</button>)}</div>
    <p className="eyebrow mt24">Sharing</p>
    <div className="card mt8 list" style={{ padding: '4px 16px' }}>
      <div className="li"><div className="grow"><b>Keep my study private</b><div className="tiny muted">Recommended. Change any time.</div></div><Toggle on={priv} onChange={setPriv} label="Keep my study private" /></div>
      <div className="li"><div className="grow"><b>Join weekly leagues</b><div className="tiny muted">You can opt in from Arena later</div></div><Toggle on={lg} onChange={setLg} label="Join weekly leagues" /></div>
    </div>
    <div className="foot"><button className="btn block" onClick={go}>Start my first quest</button></div>
  </div>
}

/** Where an email sign-in link lands (live): finish signing in, then continue. */
export function AuthCallback() {
  const nav = useNavigate(); const [err, setErr] = useState('')
  useEffect(() => { const h = location.hash; history.replaceState(null, '', location.pathname); redeemLink(h).then(() => nav('/journey', { replace: true })).catch(e => setErr((e as Error).message)) }, []) // eslint-disable-line
  return <div className="ob col center" style={{ alignItems: 'center', gap: 12 }}><Glim pose={err ? 'peek' : 'read'} size={120} />
    {err ? <><h2>That link did not work</h2><p className="muted">{err}</p><button className="btn" onClick={() => nav('/welcome', { replace: true })}>Back to sign in</button></>
      : <><h2>Signing you in…</h2><p className="muted">One moment.</p></>}</div>
}
