import { useEffect, useRef } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { MetronomePage } from './pages/MetronomePage'
import { LibraryPage } from './pages/LibraryPage'
import { PracticePage } from './pages/PracticePage'
import { RecordsPage } from './pages/RecordsPage'
import { RehearsalPage } from './pages/RehearsalPage'
import { PlayerPage } from './pages/PlayerPage'
import { SectionPage } from './pages/SectionPage'
import { SessionsPage } from './pages/SessionsPage'
import { RecordingsPage } from './pages/RecordingsPage'
import { MorePage } from './pages/MorePage'
import { RosterPage } from './pages/RosterPage'
import { CheckpointsPage } from './pages/CheckpointsPage'
import { BackupPage } from './pages/BackupPage'
import { LockScreen } from './components/LockScreen'
import { metronome } from './audio/metronome'
import { restoreMetronomeSettings, useBeat, useMetronome, useTapTempo } from './state/useMetronome'
import { useLibrary } from './state/useLibrary'
import { useDrumline } from './state/useDrumline'
import { usePrefs } from './state/usePrefs'
import { useToast } from './state/useToast'
import { Calendar, HeatGrid, Metro, MoreH, Pause, Play, Sticks } from './components/icons'

const isChopsPath = (p: string) =>
  p.startsWith('/metronome') || p.startsWith('/library') || p.startsWith('/progress') || p.startsWith('/practice')

export default function App() {
  const load = useLibrary((s) => s.load)
  const loaded = useLibrary((s) => s.loaded)
  const loadDrumline = useDrumline((s) => s.load)
  const locked = usePrefs((s) => s.locked)
  const { pathname } = useLocation()

  useEffect(() => {
    restoreMetronomeSettings()
    if (!loaded) void load()
    void loadDrumline()
    // Browsers gate audio behind a gesture; warming the context on the first
    // interaction means pressing play later starts instantly.
    const warm = () => metronome.unlock()
    window.addEventListener('pointerdown', warm, { once: true })
    window.addEventListener('keydown', warm, { once: true })
    return () => {
      window.removeEventListener('pointerdown', warm)
      window.removeEventListener('keydown', warm)
    }
  }, [load, loaded, loadDrumline])

  // New page → top of it.
  useEffect(() => {
    document.querySelector('.page')?.scrollTo(0, 0)
  }, [pathname])

  if (locked) return <LockScreen />

  return (
    <div className="app">
      <header className="nav">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Metro size={14} />
          </span>
          Chop<em>Builder</em>
        </Link>
        <nav className="nav-links top-nav">
          <TopLink to="/" label="Rehearsal" end />
          <TopLink to="/section" label="Section" />
          <TopLink to="/sessions" label="Sessions" />
          <TopLink to="/metronome" label="Metronome" />
          <TopLink to="/library" label="Library" />
          <TopLink to="/progress" label="Progress" />
          <TopLink to="/more" label="More" />
        </nav>
        <span className="nav-spacer" />
        {pathname !== '/metronome' && <MiniTransport />}
      </header>

      {isChopsPath(pathname) && <ChopsSubNav />}

      <main className="page">
        <Routes>
          <Route path="/" element={<RehearsalPage />} />
          <Route path="/player/:playerId" element={<PlayerPage />} />
          <Route path="/section" element={<SectionPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/recordings" element={<RecordingsPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/more/roster" element={<RosterPage />} />
          <Route path="/more/checkpoints" element={<CheckpointsPage />} />
          <Route path="/more/backup" element={<BackupPage />} />
          <Route path="/metronome" element={<MetronomePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/progress" element={<RecordsPage />} />
          <Route path="/practice/:fileId" element={<PracticePage />} />
          <Route path="*" element={<RehearsalPage />} />
        </Routes>
      </main>

      <TabBar pathname={pathname} />
      <ToastHost />
      <GlobalKeys />
      <KeepAwake />
      <KeyboardWatch />
      <RelockWatch />
    </div>
  )
}

function TopLink({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
      {label}
    </NavLink>
  )
}

/** Phone-width main navigation — five thumb-sized tabs pinned to the bottom. */
function TabBar({ pathname }: { pathname: string }) {
  const tabs = [
    { to: '/', label: 'Rehearsal', icon: <Sticks size={20} />, active: pathname === '/' || pathname.startsWith('/player') },
    { to: '/section', label: 'Section', icon: <HeatGrid size={20} />, active: pathname.startsWith('/section') },
    { to: '/sessions', label: 'Sessions', icon: <Calendar size={20} />, active: pathname.startsWith('/sessions') },
    { to: '/metronome', label: 'Chops', icon: <Metro size={20} />, active: isChopsPath(pathname) },
    { to: '/more', label: 'More', icon: <MoreH size={20} />, active: pathname.startsWith('/more') || pathname.startsWith('/recordings') },
  ]
  return (
    <nav className="tabbar" aria-label="Main">
      {tabs.map((t) => (
        <Link key={t.to} to={t.to} className={`tab${t.active ? ' active' : ''}`}>
          {t.icon}
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  )
}

/** On phones the top nav collapses, so the Chops pages get their own switcher. */
function ChopsSubNav() {
  return (
    <nav className="chops-subnav" aria-label="Chops">
      <NavLink to="/metronome" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
        Metronome
      </NavLink>
      <NavLink to="/library" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
        Music library
      </NavLink>
      <NavLink to="/progress" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
        Progress
      </NavLink>
    </nav>
  )
}

function ToastHost() {
  const toast = useToast((s) => s.toast)
  const dismiss = useToast((s) => s.dismiss)
  if (!toast) return null
  return (
    <div className="toast action-toast" role="status">
      {toast.msg}
      {toast.action && (
        <button
          className="toast-action"
          onClick={() => {
            toast.action?.fn()
            dismiss()
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  )
}

/**
 * Hold a screen wake lock while the click is running, a score is open, or
 * rehearsal mode is up — a display that sleeps mid-rep is the one thing this
 * app must never let happen. No-ops on browsers without the API.
 */
function KeepAwake() {
  const { running } = useMetronome()
  const { pathname } = useLocation()
  const active = running || pathname.startsWith('/practice') || pathname === '/'

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

/**
 * iOS re-parents fixed-bottom chrome onto the visual viewport when the
 * keyboard opens, floating it mid-screen. When the viewport shrinks past the
 * keyboard threshold we set `kb-open` on <html> and CSS hides the tab bar.
 * The activeElement check is the backstop against the class latching on.
 */
function KeyboardWatch() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const check = () => {
      const typing =
        document.activeElement instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) ||
          document.activeElement.isContentEditable)
      const shrunk = window.innerHeight - vv.height > 150
      document.documentElement.classList.toggle('kb-open', typing && shrunk)
    }
    const checkSoon = () => setTimeout(check, 60)
    vv.addEventListener('resize', check)
    window.addEventListener('resize', check)
    document.addEventListener('focusin', check)
    document.addEventListener('focusout', checkSoon)
    check()
    return () => {
      vv.removeEventListener('resize', check)
      window.removeEventListener('resize', check)
      document.removeEventListener('focusin', check)
      document.removeEventListener('focusout', checkSoon)
      document.documentElement.classList.remove('kb-open')
    }
  }, [])
  return null
}

/** Re-arm the PIN lock when the app has been in the background for a while. */
function RelockWatch() {
  const lockEnabled = usePrefs((s) => s.lockEnabled)
  const relock = usePrefs((s) => s.relock)
  const hiddenAt = useRef<number | null>(null)

  useEffect(() => {
    if (!lockEnabled) return
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now()
      } else if (hiddenAt.current && Date.now() - hiddenAt.current > 2 * 60_000) {
        relock()
        hiddenAt.current = null
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [lockEnabled, relock])

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
