import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { useToast } from './state/useToast'
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

// Drop the splash curtain once React has committed; repeat loads in this
// session skip it entirely (index.html reads the flag before first paint).
// setTimeout, not rAF — rAF never fires in a hidden/background tab and the
// curtain must not outlive boot there.
window.setTimeout(() => {
  try {
    sessionStorage.setItem('chopbuilder.splash', '1')
  } catch {
    /* ignore */
  }
  document.documentElement.classList.add('app-ready')
  window.setTimeout(() => document.getElementById('splash')?.remove(), 300)
}, 0)

// Offline support: after the first visit the whole app loads from cache, so
// the metronome and your scores work in rehearsal rooms with no signal.
// Production only — a service worker in dev would fight Vite's module server.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        // The worker skipWaits + claims, so a new version takes control while
        // the old page is still up — surface it instead of leaving the user
        // on stale code until whenever they happen to relaunch.
        let hadController = !!navigator.serviceWorker.controller
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!hadController) {
            hadController = true // first install, nothing to reload
            return
          }
          useToast.getState().show('ChopBuilder updated', {
            label: 'Reload',
            fn: () => window.location.reload(),
          })
        })
        // iOS checks for SW updates lazily; nudge on every return to the app.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update()
        })
      })
      .catch(() => {
        /* http:// or blocked — the app still works online */
      })
  })
}
