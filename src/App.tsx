import { useEffect } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { MetronomePage } from './pages/MetronomePage'
import { LibraryPage } from './pages/LibraryPage'
import { PracticePage } from './pages/PracticePage'
import { RecordsPage } from './pages/RecordsPage'
import { metronome } from './audio/metronome'
import { restoreMetronomeSettings, useBeat, useMetronome, useTapTempo } from './state/useMetronome'
import { useLibrary } from './state/useLibrary'
import { Metro, Pause, Play } from './components/icons'

export default function App() {
  const load = useLibrary((s) => s.load)
  const loaded = useLibrary((s) => s.loaded)
  const { pathname } = useLocation()

  useEffect(() => {
    restoreMetronomeSettings()
    if (!loaded) void load()
    // Browsers gate audio behind a gesture; warming the context on the first
    // interaction means pressing play later starts instantly.
    const warm = () => metronome.unlock()
    window.addEventListener('pointerdown', warm, { once: true })
    window.addEventListener('keydown', warm, { once: true })
    return () => {
      window.removeEventListener('pointerdown', warm)
      window.removeEventListener('keydown', warm)
    }
  }, [load, loaded])

  return (
    <div className="app">
      <header className="nav">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Metro size={14} />
          </span>
          Chop<em>Builder</em>
        </Link>
        <nav className="nav-links">
          <NavLink to="/" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} end>
            Metronome
          </NavLink>
          <NavLink
            to="/library"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            Music library
          </NavLink>
          <NavLink
            to="/progress"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            Progress
          </NavLink>
        </nav>
        <span className="nav-spacer" />
        {pathname !== '/' && <MiniTransport />}
      </header>

      <main className="page">
        <Routes>
          <Route path="/" element={<MetronomePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/progress" element={<RecordsPage />} />
          <Route path="/practice/:fileId" element={<PracticePage />} />
          <Route path="*" element={<MetronomePage />} />
        </Routes>
      </main>

      <GlobalKeys />
      <KeepAwake />
    </div>
  )
}

/**
 * Hold a screen wake lock while the click is running or a score is open —
 * a display that sleeps mid-practice is the one thing a metronome app must
 * never let happen. No-ops on browsers without the API.
 */
function KeepAwake() {
  const { running } = useMetronome()
  const { pathname } = useLocation()
  const active = running || pathname.startsWith('/practice')

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let dead = false
    const acquire = () =>
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (dead) void l.release().catch(() => {})
          else lock = l
        })
        .catch(() => {
          /* denied (battery saver etc.) — nothing to do */
        })
    void acquire()
    // The lock is released automatically when the tab hides; take it back
    // when the user returns.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      dead = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => {})
    }
  }, [active])

  return null
}

/** Always-available transport so the metronome is one click away from any page. */
function MiniTransport() {
  const { settings, running, toggle } = useMetronome()
  const beat = useBeat()

  return (
    <div className={`mini-transport${running ? ' on' : ''}`}>
      <Metro size={14} className="mini-icon" />
      <span className="mini-bpm">
        {settings.bpm}
        <span>BPM</span>
      </span>
      <div className="mini-dots">
        {settings.accents.map((state, i) => (
          <span
            key={i}
            className={`mini-dot${running && beat.isBeat && beat.beatIndex === i ? ' lit' : ''}${
              state === 'accent' ? ' accent' : ''
            }`}
          />
        ))}
      </div>
      <button
        className={`btn icon${running ? '' : ' primary'}`}
        onClick={toggle}
        aria-label={running ? 'Stop metronome' : 'Start metronome'}
      >
        {running ? <Pause size={14} /> : <Play size={14} />}
      </button>
    </div>
  )
}

/** Space and T work anywhere; per-page keys handle the rest. */
function GlobalKeys() {
  const { setBpm, toggle } = useMetronome()
  const { tap } = useTapTempo(setBpm)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const typing =
        el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
      if (typing) return

      if (e.code === 'Space') {
        // A focused button would also fire its click on space.
        if (el.tagName === 'BUTTON' || el.tagName === 'A') return
        e.preventDefault()
        toggle()
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        tap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, tap])

  return null
}
