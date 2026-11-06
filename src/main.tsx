import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>)

// keep the browser's install offer so You → Downloads can show an Install button
addEventListener('beforeinstallprompt', e => { e.preventDefault(); (window as unknown as { rhemloInstall?: Event }).rhemloInstall = e; dispatchEvent(new Event('rhemlo-installable')) })
if (import.meta.env.PROD && 'serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
