import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles/global.css'

// HashRouter keeps deep links working when the built site is dropped on any
// static host without server-side rewrite rules.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </HashRouter>
  </StrictMode>,
)

// Offline support: after the first visit the whole app loads from cache, so
// the metronome and your scores work in rehearsal rooms with no signal.
// Production only — a service worker in dev would fight Vite's module server.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* http:// or blocked — the app still works online */
    })
  })
}
