import { useEffect } from 'react'
import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useStore } from '@/lib/store'
import { Icon, asset } from '@/ui/bits'
import Onboarding from '@/pages/Onboarding'
import Journey from '@/pages/Journey'
import Practice from '@/pages/Practice'
import Session from '@/pages/Session'
import { Arena, Circle } from '@/pages/Social'
import You from '@/pages/You'
import Progress from '@/pages/Progress'
import { Library, Reader } from '@/pages/Library'

const TABS = [['journey', 'Journey'], ['practice', 'Practice'], ['arena', 'Arena'], ['circle', 'Circle'], ['you', 'You']] as const

const SessionRoute = () => <Session key={useLocation().key} />

function Shell() {
  const { pathname } = useLocation()
  const active = pathname.startsWith('/library') || pathname.startsWith('/read') ? 'journey' : pathname.startsWith('/progress') ? 'you' : pathname.split('/')[1]
  return <div className="shell">
    <nav className="nav" aria-label="Main">
      <div className="brand"><img src={asset('brand/app-icons/icon-48.png')} alt="" />Rhemlo</div>
      {TABS.map(([k, label]) => <NavLink key={k} to={`/${k}`} className={active === k ? 'on' : ''} aria-current={active === k ? 'page' : undefined}><Icon n={k} />{label}</NavLink>)}
      <div className="foot small muted">Little quests.<br />Lasting light.</div>
    </nav>
    <main className="main"><Outlet /></main>
  </div>
}

export default function App() {
  const { onboarded, theme } = useStore()
  useEffect(() => {
    const el = document.documentElement
    if (theme === 'system') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', theme)
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#241B2E' : '#7041D9')
  }, [theme])
  if (!onboarded) return <Routes><Route path="*" element={<Onboarding />} /></Routes>
  return <Routes>
    <Route path="/session" element={<SessionRoute />} />
    <Route element={<Shell />}>
      <Route path="/journey" element={<Journey />} />
      <Route path="/practice" element={<Practice />} />
      <Route path="/arena" element={<Arena />} />
      <Route path="/circle" element={<Circle />} />
      <Route path="/you" element={<You />} />
      <Route path="/progress" element={<Progress />} />
      <Route path="/library" element={<Library />} />
      <Route path="/read/:id" element={<Reader />} />
    </Route>
    <Route path="*" element={<Navigate to="/journey" replace />} />
  </Routes>
}
