import { useEffect } from 'react'
import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useStore } from '@/lib/store'
import { GlimHead, Glim, Icon, useManualData } from '@/ui/bits'
import { Welcome, Account, Goal, ManualPick, Pace } from '@/pages/Onboarding'
import Journey, { Readings, StageCountdown, MasteryCheck } from '@/pages/Journey'
import Practice, { TargetBuilder, MemoryLadder } from '@/pages/Practice'
import Session, { Done } from '@/pages/Session'
import { Arena, ArenaRules, DailyChallenge, FriendlyMatch, LeagueView, MatchPlay, QuizNight, QuizNightPlay } from '@/pages/Arena'
import Circle, { CircleChat, CircleHome } from '@/pages/Circle'
import { Coach, CoachHost, Steward } from '@/pages/Roles'
import { isDemo } from '@/lib/backend'
import { startReminders } from '@/lib/notify'
import You, { Appearance, Notifications, Downloads, Access } from '@/pages/You'
import Progress, { Planner } from '@/pages/Progress'
import { Library, Reader } from '@/pages/Library'
import Guide from '@/pages/Guide'

const TABS = [['journey', 'Journey'], ['practice', 'Practice'], ['arena', 'Arena'], ['circle', 'Circle'], ['you', 'You']] as const

function Shell() {
  const { pathname } = useLocation(); const m = useManualData(); const cw = useStore(s => s.profile.glim); const role = useStore(s => s.account?.role)
  const top = pathname.split('/')[1]
  const active = top === 'library' ? 'journey' : top
  const sub = pathname.startsWith('/library') ? 'library' : pathname.startsWith('/journey/planner') ? 'planner' : pathname.startsWith('/journey/progress') ? 'progress' : pathname.startsWith('/coach') ? 'coach' : pathname.startsWith('/steward') ? 'steward' : ''
  return <div className="shell">
    <nav className="nav" aria-label="Main">
      <div className="brand"><GlimHead cw={cw} size={40} /><span className="word">Rhemlo</span></div>
      {TABS.map(([k, label]) => <NavLink key={k} to={`/${k}`} className={`nl ${active === k && !sub ? 'on' : ''}`} aria-current={active === k ? 'page' : undefined}><span className="ic"><Icon n={k} /></span>{label}</NavLink>)}
      <div className="navsep" /><p className="eyebrow sub">Journey</p>
      {([['library', 'Library', 'book', '/library'], ['planner', 'Planner', 'calendar', '/journey/planner'], ['progress', 'Progress', 'chart', '/journey/progress']] as const).map(([k, l, ic, to]) =>
        <NavLink key={k} to={to} className={`nl sub2 ${sub === k ? 'on' : ''}`} style={{ display: undefined }}><span className="ic"><Icon n={ic} /></span>{l}</NavLink>)}
      {(role === 'coach' || role === 'steward') && <><div className="navsep" /><p className="eyebrow sub">Workspace</p>
        <NavLink to={role === 'coach' ? '/coach' : '/steward'} className={`nl sub2 ${sub === role ? 'on' : ''}`}><span className="ic"><Icon n={role === 'coach' ? 'people' : 'shield'} /></span>{role === 'coach' ? 'Coach' : 'Content studio'}</NavLink></>}
      {isDemo && <span className="chip pend demochip" title="Demo server: other people and their activity are simulated">Demo server</span>}
      <NavLink to="/guide" className={`nl navhelp ${top === 'guide' ? 'on' : ''}`}><span className="ic"><Icon n="compass" /></span>Guide</NavLink>
      <NavLink to="/you/access" className="navfoot"><Glim pose="read" size={52} still /><div><b className="disp" style={{ fontSize: 14 }}>{m?.short.replace('–20', '–') ?? 'Manual'}</b><div className="tiny muted">{m ? `${m.lessons.length} lessons · ${m.bible}` : ''}</div></div></NavLink>
    </nav>
    <main className="main" id="main"><Outlet /></main>
  </div>
}

export default function App() {
  const { onboarded, theme, prefs } = useStore()
  useEffect(() => {
    const el = document.documentElement
    if (theme === 'system') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', theme)
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#241B2E' : '#FFF8EE')
    el.style.setProperty('--rh-text-scale', String(prefs.textScale))
    el.classList.toggle('reduce-motion', prefs.reduceMotion)
  }, [theme, prefs.textScale, prefs.reduceMotion])
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  useEffect(() => startReminders(), [])

  if (!onboarded) return <Routes>
    <Route path="/welcome" element={<Welcome />} />
    <Route path="/join/account" element={<Account />} />
    <Route path="/join/goal" element={<Goal />} />
    <Route path="/join/manual" element={<ManualPick />} />
    <Route path="/join/pace" element={<Pace />} />
    <Route path="*" element={<Navigate to="/welcome" replace />} />
  </Routes>
  return <Routes>
    <Route path="/practice/session" element={<SessionRoute />} />
    <Route element={<Shell />}>
      <Route path="/journey" element={<Journey />} />
      <Route path="/journey/planner" element={<Planner />} />
      <Route path="/journey/progress" element={<Progress />} />
      <Route path="/journey/readings" element={<Readings />} />
      <Route path="/journey/stages/:i" element={<StageCountdown />} />
      <Route path="/journey/check/:id" element={<MasteryCheck />} />
      <Route path="/library" element={<Library />} />
      <Route path="/library/:id" element={<Reader />} />
      <Route path="/practice" element={<Practice />} />
      <Route path="/practice/build" element={<TargetBuilder />} />
      <Route path="/practice/memory/:id" element={<MemoryLadder />} />
      <Route path="/practice/done/:id" element={<Done />} />
      <Route path="/arena" element={<Arena />} />
      <Route path="/arena/rules" element={<ArenaRules />} />
      <Route path="/arena/challenge" element={<DailyChallenge />} />
      <Route path="/arena/quiz-night" element={<QuizNight />} />
      <Route path="/arena/quiz-night/:room" element={<QuizNightPlay />} />
      <Route path="/arena/league" element={<LeagueView />} />
      <Route path="/arena/match/:id" element={<MatchPlay />} />
      <Route path="/circle/:id" element={<CircleHome />} />
      <Route path="/circle/:id/chat" element={<CircleChat />} />
      <Route path="/coach" element={<Coach />} />
      <Route path="/coach/host" element={<CoachHost />} />
      <Route path="/steward" element={<Steward />} />
      <Route path="/guide" element={<Guide />} />
      <Route path="/arena/match" element={<FriendlyMatch />} />
      <Route path="/circle" element={<Circle />} />
      <Route path="/you" element={<You />} />
      <Route path="/you/appearance" element={<Appearance />} />
      <Route path="/you/notifications" element={<Notifications />} />
      <Route path="/you/downloads" element={<Downloads />} />
      <Route path="/you/access" element={<Access />} />
    </Route>
    <Route path="*" element={<Navigate to="/journey" replace />} />
  </Routes>
}
const SessionRoute = () => <Session key={useLocation().key} />
