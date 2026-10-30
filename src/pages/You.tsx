import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadManual } from '@/lib/data'
import { masteryOf, streakInfo, useStore, type Theme } from '@/lib/store'
import type { ManualCode } from '@/lib/types'
import { BackBar, CW, Glim, Icon, Loading, Sheet, StatPills, Toggle, asset, useManualData, useToast } from '@/ui/bits'
import { api, isDemo, type Outbox } from '@/lib/backend'
import { askPermission, canNotify, show } from '@/lib/notify'
import { signOut, syncNow } from '@/lib/sync'
import { play } from '@/lib/sound'
import { SignInSheet } from './Onboarding'

// ---- earned cosmetics (personal, never points or correctness) --------------------------------------
export function useBadges() {
  const { history, done, ladder, activeDays } = useStore(); const { streak } = streakInfo(activeDays)
  const cleared = Object.keys(done).length, verse = Object.values(ladder).some(l => l.q04)
  return [
    { k: 'seed', name: 'First quest', how: 'Finish a first sitting', got: history.length > 0 },
    { k: 'chapter', name: 'Chapter cleared', how: 'Clear a lesson on your map', got: cleared > 0 },
    { k: 'lantern', name: 'Verse secured', how: 'Reach full recall on a memory verse', got: verse },
    { k: 'flame', name: 'Week of light', how: 'Study 7 days in a row', got: streak >= 7 },
    { k: 'star', name: 'Spotless', how: 'Get every answer right in a sitting of 10+', got: history.some(h => h.total >= 10 && h.right === h.total) },
    { k: 'target', name: 'On target', how: 'Finish a target practice', got: history.some(h => h.kind === 'target') },
    { k: 'night', name: 'Night owl', how: 'Finish a sitting after 9 pm', got: history.some(h => new Date(h.at).getHours() >= 21) },
    { k: 'fair', name: 'Fair play', how: 'Finish a daily challenge', got: history.some(h => h.kind === 'daily') },
    { k: 'coop', name: 'Together', how: 'Complete a co-op quest (opens with friends)', got: false },
  ]
}
export function useStyles() {
  const { history, done, ladder, activeDays } = useStore(); const cleared = Object.keys(done).length
  return [
    { cw: 'classic', how: 'Always yours', got: true },
    { cw: 'twilight', how: 'Clear 3 chapters', got: cleared >= 3 },
    { cw: 'meadow', how: 'Study on 7 different days', got: activeDays.length >= 7 },
    { cw: 'rosewood', how: 'Reach full recall on a memory verse', got: Object.values(ladder).some(l => l.q04) },
    { cw: 'ocean', how: 'Answer 100 questions correctly', got: history.reduce((a, h) => a + h.right, 0) >= 100 },
    { cw: 'midnight', how: 'Finish a quarter check', got: history.some(h => h.kind === 'check' && (h.title ?? '').startsWith('Quarter')) },
  ]
}

export default function You() {
  const S = useStore(); const nav = useNavigate(); const badges = useBadges(); const styles = useStyles(); const [toast, say] = useToast()
  const [data, setData] = useState(false); const [signin, setSignin] = useState(false); const [busy, setBusy] = useState(false)
  const secure = Object.values(S.cards).filter(c => masteryOf(c) === 'secure').length
  return <div className="page col gap16" style={{ maxWidth: 760 }}>
    <div className="pagehead"><h1>You</h1><StatPills /></div>
    <div className="row gap16"><span className="card lav" style={{ padding: 6, borderRadius: 24 }}><Glim pose="wave" size={96} /></span>
      <div className="grow"><h2>{S.profile.handle || S.profile.name}</h2><p className="tiny muted">Joined {new Date(S.joined || Date.now()).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} · {S.prefs.keepPrivate ? 'Private profile' : 'Shared with friends'}</p>
        <span className="chip plain mt8"><img src={asset('emblems/tiers/tier-bronze-128.webp')} width={16} height={18} alt="" />{S.arenaOptIn ? 'League pending' : 'No league'}</span></div></div>
    {S.account ? <div className="card row"><span className="tile"><Icon n="cloud" /></span><div className="grow"><b className="small">{S.account.email}</b><div className="tiny muted">{S.account.role === 'learner' ? 'Learner' : S.account.role === 'coach' ? 'Coach' : 'Content steward'} · synced {new Date(S.account.lastSync).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}{isDemo ? ' · demo server' : ''}</div></div>
      <div className="col gap4"><button className="btn sec xs" disabled={busy} onClick={async () => { setBusy(true); await syncNow(); setBusy(false); say('Synced.') }}>Sync now</button><button className="btn link" style={{ minHeight: 30 }} onClick={async () => { await signOut(); nav('/', { replace: true }) }}>Sign out</button></div></div>
      : <div className="card row"><span className="tile"><Icon n="cloud" /></span><div className="grow"><b className="small">No account yet</b><div className="tiny muted">Progress is saved on this device only. Sign in to keep it on every device.</div></div><button className="btn xs" onClick={() => setSignin(true)}>Sign in</button></div>}
    {S.account && S.account.role !== 'learner' && <Link to={S.account.role === 'coach' ? '/coach' : '/steward'} className="card row" style={{ color: 'inherit' }}><span className="tile apricot"><Icon n={S.account.role === 'coach' ? 'people' : 'shield'} /></span><div className="grow"><b>{S.account.role === 'coach' ? 'Coach workspace' : 'Content studio'}</b><div className="tiny muted">{S.account.role === 'coach' ? 'Your circle, assignments and Quiz Night hosting' : 'Item review, reports and the manual pipeline'}</div></div><Icon n="chev" className="faint" /></Link>}
    <div className="grid3"><div className="stat center"><div className="v">{S.points.toLocaleString()}</div><div className="d">personal XP</div></div><div className="stat center"><div className="v">{secure}</div><div className="d">Secure items</div></div><div className="stat center"><div className="v">{S.activeDays.length}</div><div className="d">study days</div></div></div>
    <p className="eyebrow">Glim style</p>
    <div className="stylepick">{styles.map(s => <button key={s.cw} className={`${S.profile.glim === s.cw ? 'on' : ''} ${s.got ? '' : 'lock'}`} aria-pressed={S.profile.glim === s.cw} aria-label={`${s.cw}${s.got ? '' : ', locked: ' + s.how}`}
      onClick={() => s.got ? S.set({ profile: { ...S.profile, glim: s.cw } }) : say(`${s.cw[0].toUpperCase() + s.cw.slice(1)}: ${s.how}`)}>
      <img src={asset(`characters/glim/colorways/${s.cw}/glim-stand-256.webp`)} width={64} height={64} alt="" />{!s.got && <Icon n="lock" className="s lk" />}</button>)}</div>
    <p className="eyebrow">Badges · {badges.filter(b => b.got).length} of {badges.length}</p>
    <div className="badges">{badges.map(b => <button key={b.k} title={`${b.name}: ${b.how}`} aria-label={`${b.name}, ${b.got ? 'earned' : 'locked: ' + b.how}`} onClick={() => say(`${b.name} · ${b.got ? 'earned' : b.how}`)} style={{ border: 0, background: 'transparent', padding: 0 }}>
      <img src={b.got ? asset(`emblems/badges/badge-${b.k}-128.webp`) : asset(`emblems/badges/locked/badge-${b.k}-locked.png`)} alt="" /></button>)}</div>
    <p className="tiny muted">Cosmetics only. Nothing here buys points or correctness.</p>
    <div className="card list" style={{ padding: '2px 14px' }}>
      {([['sun', 'Appearance', 'Light, Dark or System · text size', '/you/appearance'], ['bell', 'Notifications', 'Gentle nudges and quiet hours', '/you/notifications'], ['download', 'Downloads', 'Offline lessons and sync', '/you/downloads'], ['key', 'Access & manuals', 'Your manuals and who grants them', '/you/access'], ['chart', 'Progress', 'Mastery and accuracy, defined', '/journey/progress']] as const).map(([i, t, d, to]) =>
        <Link key={to} to={to} className="li"><span className="tile" style={{ width: 38, height: 38 }}><Icon n={i} className="s" /></span><span className="grow"><b className="small">{t}</b><span className="tiny muted" style={{ display: 'block' }}>{d}</span></span><Icon n="chev" className="faint" /></Link>)}
      <div className="li"><span className="tile" style={{ width: 38, height: 38 }}><Icon n="clock" className="s" /></span><span className="grow"><b className="small">Sitting length</b><span className="tiny muted" style={{ display: 'block' }}>Every sitting has a real finish line</span></span>
        <div className="seg" style={{ width: 170 }}>{[10, 20, 40].map(n => <button key={n} className={S.sessionSize === n ? 'on' : ''} onClick={() => S.set({ sessionSize: n })}>{n}</button>)}</div></div>
      <button className="li" onClick={() => setData(true)}><span className="tile" style={{ width: 38, height: 38 }}><Icon n="cloud" className="s" /></span><span className="grow"><b className="small">Your data</b><span className="tiny muted" style={{ display: 'block' }}>Export, restore or erase what is on this device</span></span><Icon n="chev" className="faint" /></button>
    </div>
    {signin && <SignInSheet onClose={() => setSignin(false)} />}
    {data && <DataSheet onClose={() => setData(false)} onErase={() => nav('/', { replace: true })} />}
    {toast}
  </div>
}

function DataSheet({ onClose, onErase }: { onClose: () => void; onErase: () => void }) {
  const S = useStore(); const file = useRef<HTMLInputElement>(null); const [msg, setMsg] = useState(''); const [sure, setSure] = useState(false)
  const exportData = () => {
    const { profile, manual, theme, sessionSize, cards, done, ladder, history, points, activeDays, prefs, readings, joined } = S
    const url = URL.createObjectURL(new Blob([JSON.stringify({ v: 1, profile, manual, theme, sessionSize, cards, done, ladder, history, points, activeDays, prefs, readings, joined }, null, 1)], { type: 'application/json' }))
    Object.assign(document.createElement('a'), { href: url, download: `rhemlo-progress-${new Date().toISOString().slice(0, 10)}.json` }).click(); URL.revokeObjectURL(url); setMsg('Backup saved to your downloads.')
  }
  const importData = async (f?: File) => { if (!f) return; try { const d = JSON.parse(await f.text()); if (d.v !== 1 || !d.cards) throw 0; S.set({ ...d, onboarded: true }); setMsg('Progress restored.') } catch { setMsg('That file is not a Rhemlo backup.') } }
  return <Sheet label="Your data" onClose={onClose}><div className="col"><h2>Your data</h2>
    <p className="small muted">Everything lives in this browser. Export a backup before clearing site data or changing devices; accounts and sync come with the Rhemlo server.</p>
    <div className="row gap8"><button className="btn sec grow" onClick={exportData}><Icon n="download" className="s" />Export backup</button><button className="btn sec grow" onClick={() => file.current?.click()}><Icon n="cloud" className="s" />Restore</button></div>
    <input ref={file} type="file" accept="application/json" hidden onChange={e => importData(e.target.files?.[0])} />{msg && <p className="small" role="status">{msg}</p>}
    {!sure ? <button className="btn link" style={{ color: 'var(--rh-incorrect)' }} onClick={() => setSure(true)}>Erase all progress on this device…</button>
      : <div className="card lav col"><b>Erase everything on this device?</b><p className="small muted">This cannot be undone. Export a backup first if you might want it.</p><div className="row gap8"><button className="btn sec grow" onClick={() => setSure(false)}>Keep it</button><button className="btn bad grow" onClick={() => { S.reset(); onErase() }}>Erase</button></div></div>}
  </div></Sheet>
}

// ---- Appearance (R43) -------------------------------------------------------------------------------
export function Appearance() {
  const S = useStore(); const nav = useNavigate(); const p = S.prefs; const setP = (x: Partial<typeof p>) => S.set({ prefs: { ...p, ...x } })
  const card = (t: Theme, label: string) => <button className={`themecard ${S.theme === t ? 'on' : ''}`} aria-pressed={S.theme === t} onClick={() => S.set({ theme: t })}>
    <span className="pv"><img src={asset(`worlds/maps/meadow-${t === 'dark' ? 'night' : 'day'}/meadow-${t === 'dark' ? 'night' : 'day'}-480.webp`)} alt="" />{t === 'system' && <img src={asset('worlds/maps/meadow-night/meadow-night-480.webp')} alt="" style={{ clipPath: 'polygon(100% 0,100% 100%,0 100%)' }} />}</span>{label}</button>
  return <div className="page col gap16" style={{ maxWidth: 560 }}>
    <BackBar title="Appearance" onBack={() => nav('/you')} />
    <p className="eyebrow">Theme</p><div className="row gap8" style={{ alignItems: 'stretch' }}>{card('light', 'Light')}{card('dark', 'Dark')}{card('system', 'System')}</div>
    <p className="tiny muted">System follows your device. Your choice overrides it.</p>
    <p className="eyebrow">Reading</p>
    <div className="card list" style={{ padding: '2px 16px' }}>
      <div className="li"><b className="small grow">Text size</b><span className="small">A</span><input type="range" className="slider" style={{ width: 140 }} min={0.9} max={1.3} step={0.05} value={p.textScale} onChange={e => setP({ textScale: +e.target.value })} aria-label="Text size" /><span style={{ fontSize: 22 }}>A</span></div>
      <div className="li"><div className="grow"><b className="small">Reduce motion</b><div className="tiny muted">Removes travel, bounce and confetti</div></div><Toggle on={p.reduceMotion} onChange={v => setP({ reduceMotion: v })} label="Reduce motion" /></div>
      <div className="li" style={{ flexWrap: 'wrap' }}><div className="grow"><b className="small">Map world</b><div className="tiny muted">Which painting the Journey shows</div></div>
        <div className="seg" style={{ width: '100%' }}>{([['theme', 'Follow theme'], ['day', 'Always day'], ['night', 'Always night']] as const).map(([k, t]) => <button key={k} className={p.mapWorld === k ? 'on' : ''} onClick={() => setP({ mapWorld: k })}>{t}</button>)}</div></div>
    </div>
    <div className="card list" style={{ padding: '2px 16px' }}><div className="li"><div className="grow"><b className="small">Sounds</b><div className="tiny muted">Never the only signal · off until you choose</div></div><Toggle on={p.sound} onChange={v => { setP({ sound: v }); if (v) setTimeout(() => play('correct'), 50) }} label="Sounds" /></div></div>
  </div>
}

// ---- Notifications (R48) -------------------------------------------------------------------------
export function Notifications() {
  const S = useStore(); const nav = useNavigate(); const p = S.prefs; const n = p.notif; const setN = (k: keyof typeof n, v: boolean) => S.set({ prefs: { ...p, notif: { ...n, [k]: v } } })
  const [edit, setEdit] = useState(false); const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; const [msg, setMsg] = useState(''); const [out, setOut] = useState<Outbox[]>([])
  useEffect(() => { if (S.account) api.outbox().then(setOut).catch(() => {}) }, [S.account])
  return <div className="page col gap16" style={{ maxWidth: 560 }}>
    <BackBar title="Notifications" onBack={() => nav('/you')} />
    <div className="row"><img src={asset('illustrations/states/state-notify-256.webp')} width={84} height={84} alt="" /><p className="small muted">Gentle nudges only. Nothing here can block learning.</p></div>
    <div className="card list" style={{ padding: '2px 16px' }}>
      <div className="li"><div className="grow"><b className="small">Study reminder</b><div className="tiny muted">Daily at <input type="time" value={p.remindAt} onChange={e => S.set({ prefs: { ...p, remindAt: e.target.value } })} style={{ border: 0, background: 'transparent', font: 'inherit', color: 'inherit' }} aria-label="Reminder time" /> · {tz}</div></div><Toggle on={n.study} onChange={v => setN('study', v)} label="Study reminder" /></div>
      <div className="li"><div className="grow"><b className="small">Due review ready</b><div className="tiny muted">At most once a day</div></div><Toggle on={n.due} onChange={v => setN('due', v)} label="Due review ready" /></div>
      <div className="li"><div className="grow"><b className="small">Circle activity</b><div className="tiny muted">Daily digest only</div></div><Toggle on={n.circle} onChange={v => setN('circle', v)} label="Circle activity" /></div>
      <div className="li"><div className="grow"><b className="small">Quiz Night starting</b><div className="tiny muted">15 minutes before</div></div><Toggle on={n.quiz} onChange={v => setN('quiz', v)} label="Quiz Night starting" /></div>
      <div className="li"><div className="grow"><b className="small">League updates</b><div className="tiny muted">Weekly result only</div></div><Toggle on={n.league} onChange={v => setN('league', v)} label="League updates" /></div></div>
    <div className="card row"><Glim pose="sleep" size={56} still /><div className="grow"><b>Quiet hours</b><div className="tiny muted">{p.quiet[0]} – {p.quiet[1]}</div></div><button className="btn sec xs" onClick={() => setEdit(!edit)}>{edit ? 'Done' : 'Edit'}</button></div>
    {edit && <div className="row gap8"><input type="time" className="field" value={p.quiet[0]} onChange={e => S.set({ prefs: { ...p, quiet: [e.target.value, p.quiet[1]] } })} aria-label="Quiet from" /><input type="time" className="field" value={p.quiet[1]} onChange={e => S.set({ prefs: { ...p, quiet: [p.quiet[0], e.target.value] } })} aria-label="Quiet until" /></div>}
    <p className="eyebrow">Channel</p>
    <div className="seg">{([['inapp', 'In-app'], ['push', 'Browser push'], ['email', 'Email']] as const).map(([k, t]) => <button key={k} className={p.channel === k ? 'on' : ''} disabled={(k === 'push' && !canNotify()) || (k === 'email' && !S.account)}
      onClick={async () => { if (k === 'push') { const ok = await askPermission(); if (!ok) setMsg('Notifications are blocked in this browser. Allow them in the site settings, or keep in-app reminders.'); return } S.set({ prefs: { ...p, channel: k } }) }}>{t}</button>)}</div>
    <p className="tiny muted">{p.channel === 'push' ? 'Reminders arrive as browser notifications, even when Rhemlo is in another tab.' : p.channel === 'email' ? (isDemo ? 'Demo server: emails land in the outbox below instead of a real inbox.' : 'Reminders arrive by email.') : 'Reminders appear in the list below while Rhemlo is open.'}{!S.account && ' Email needs an account.'}</p>
    {msg && <p className="small" role="alert">{msg}</p>}
    <button className="btn sec" onClick={async () => { if (p.channel === 'push' && Notification.permission === 'granted') await show('Rhemlo', 'Your next little quest is ready.', 'test'); else if (p.channel === 'email' && S.account) { await api.email('Your next little quest is ready', 'A short sitting keeps your verses bright. Open Rhemlo when you are ready.'); setOut(await api.outbox()) } else S.set({ inbox: [{ id: crypto.randomUUID(), at: Date.now(), title: 'Rhemlo', body: 'Your next little quest is ready.' }, ...S.inbox] }) }}>Send a test reminder</button>
    {S.inbox.length > 0 && <><p className="eyebrow">In-app reminders</p><div className="card list" style={{ padding: '2px 14px' }}>{S.inbox.slice(0, 6).map(n => <div key={n.id} className="li"><Icon n="bell" className="s" /><span className="grow small"><b>{n.title}</b> · {n.body}</span><span className="tiny muted">{new Date(n.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span></div>)}</div></>}
    {out.length > 0 && <><p className="eyebrow">{isDemo ? 'Demo outbox' : 'Sent emails'}</p><div className="card list" style={{ padding: '2px 14px' }}>{out.slice(0, 6).map(o => <div key={o.id} className="li" style={{ alignItems: 'flex-start' }}><Icon n="send" className="s" /><span className="grow small"><b>{o.subject}</b><span className="tiny muted" style={{ display: 'block' }}>To {S.account?.email} · {o.body}</span></span></div>)}</div></>}
  </div>
}

// ---- Downloads & offline (R44) ----------------------------------------------------------------------
type Pack = { id: string; title: string; urls: string[]; questions: number }
export function Downloads() {
  const m = useManualData(); const nav = useNavigate(); const [state, setState] = useState<Record<string, 'none' | 'busy' | 'ok'>>({}); const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => { const a = () => setOnline(navigator.onLine); addEventListener('online', a); addEventListener('offline', a); return () => { removeEventListener('online', a); removeEventListener('offline', a) } }, [])
  const packs: Pack[] = m ? Object.entries(m.groups).map(([q, r]) => { const ls = m.lessons.filter(l => l.n >= r[0] && l.n <= r[1]); return { id: `${m.code}-q${q}`, title: `Quarter ${q} · Lessons ${r[0]}–${r[1]}`, questions: ls.reduce((a, l) => a + l.ic, 0), urls: [`/data/${m.code}/manual.json`, ...ls.flatMap(l => [`/data/${m.code}/lessons/${l.id}.json`, `/data/${m.code}/items/${l.id}.json`])] } }) : []
  useEffect(() => { if (!('caches' in window) || !packs.length) return; (async () => { const c = await caches.open('rhemlo-packs'); const st: Record<string, 'none' | 'ok'> = {}; for (const p of packs) st[p.id] = (await c.match(p.urls[p.urls.length - 1])) ? 'ok' : 'none'; setState(st) })() }, [m?.code]) // eslint-disable-line
  if (!m) return <Loading />
  const get = async (p: Pack) => { setState(s => ({ ...s, [p.id]: 'busy' })); try { const c = await caches.open('rhemlo-packs'); await c.addAll([...p.urls, '/data/bible/KJV.tsv.gz']); setState(s => ({ ...s, [p.id]: 'ok' })) } catch { setState(s => ({ ...s, [p.id]: 'none' })) } }
  const drop = async (p: Pack) => { const c = await caches.open('rhemlo-packs'); await Promise.all(p.urls.slice(1).map(u => c.delete(u))); setState(s => ({ ...s, [p.id]: 'none' })) }
  return <div className="page col gap16" style={{ maxWidth: 560 }}>
    <BackBar title="Downloads" onBack={() => nav('/you')} />
    {!online && <div className="card row" style={{ background: 'var(--rh-warning-bg)', borderColor: 'transparent' }}><img src={asset('illustrations/states/state-offline-256.webp')} width={64} height={64} alt="" /><div><b>No signal. Still your journey.</b><div className="tiny muted">Downloaded private practice works offline.</div></div></div>}
    <SyncCard />
    <p className="eyebrow">Download for private practice</p>
    {'caches' in window ? packs.map(p => <div key={p.id} className="card row"><span className="tile green"><Icon n="book" /></span><div className="grow"><b className="small">{p.title}</b><div className="tiny muted">{p.questions.toLocaleString()} questions · lesson text · KJV for context</div></div>
      {state[p.id] === 'ok' ? <button className="iconbtn" aria-label={`Remove ${p.title}`} onClick={() => drop(p)}><Icon n="trash" /></button> : <button className="btn sec xs" disabled={state[p.id] === 'busy'} onClick={() => get(p)}>{state[p.id] === 'busy' ? 'Saving…' : 'Download'}</button>}</div>)
      : <p className="small muted">This browser cannot store lessons for offline use.</p>}
    <p className="eyebrow">Not available offline</p>
    <div className="row wrap gap8">{[['arena', 'Ranked challenge'], ['people', 'Matches'], ['radio', 'Quiz Night'], ['circle', 'Chat']].map(([i, t]) => <span key={t} className="chip lg plain"><Icon n={i} />{t}</span>)}</div>
  </div>
}

// ---- Access & manuals (R45) -------------------------------------------------------------------------
export function Access() {
  const S = useStore(); const nav = useNavigate(); const [titles, setTitles] = useState<Record<string, string>>({})
  useEffect(() => { Promise.all((['AD2627', 'EN2627'] as ManualCode[]).map(c => loadManual(c))).then(ms => setTitles(Object.fromEntries(ms.map(m => [m.code, `${m.short} · ${m.lessons.length} lessons · ${m.bible}`])))) }, [])
  return <div className="page col gap16" style={{ maxWidth: 560 }}>
    <BackBar title="Access & manuals" onBack={() => nav('/you')} />
    <div style={{ display: 'grid', placeItems: 'center' }}><img src={asset('emblems/items/item-chest-open-128.webp')} width={110} height={110} alt="" /></div>
    <h2 className="center">Your manuals</h2><p className="small muted center">Each manual keeps its own progress. Switching never mixes them.</p>
    {(['AD2627', 'EN2627'] as ManualCode[]).map(c => <div key={c} className="card row"><span className="spine" style={{ background: c === 'AD2627' ? '#7041D9' : '#FFAA72' }}><Icon n="book" /></span>
      <div className="grow"><b>{c === 'AD2627' ? 'Adult 2026–2027' : 'YAYA 2026–2027'}</b><div className="tiny muted">{titles[c] ?? c}</div><span className="chip ok mt8">Available</span></div>
      {S.manual === c ? <span className="chip">In use</span> : <button className="btn sec xs" onClick={() => S.set({ manual: c })}>Switch</button>}</div>)}
    <p className="hint"><Icon n="info" />Both manuals are open to everyone on this device. Publisher permission is recorded. Organisation-provided and retired manuals appear here with who grants them. Joining a circle never grants manual access.</p>
  </div>
}

function SyncCard() {
  const { account } = useStore(); const [busy, setBusy] = useState(false)
  if (!account) return <div className="card col gap8"><div className="row between"><b>Saved on this device</b><span className="chip ok"><Icon n="check" />Saved</span></div><p className="tiny muted">Sign in from You to keep your progress on every device.</p></div>
  return <div className="card col gap8"><div className="row between"><b>Up to date</b><button className="btn xs" disabled={busy || !navigator.onLine} onClick={async () => { setBusy(true); await syncNow(); setBusy(false) }}>{navigator.onLine ? 'Retry sync' : 'Offline'}</button></div>
    <p className="tiny muted">Saved on this device · last synced {new Date(account.lastSync).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}{isDemo ? ' · demo server' : ''}</p></div>
}
