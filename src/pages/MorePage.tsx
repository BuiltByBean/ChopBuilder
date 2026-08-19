import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePrefs } from '../state/usePrefs'
import { useToast } from '../state/useToast'
import { Sheet } from '../components/Sheet'
import {
  AudioIcon,
  ChevronRight,
  Download,
  Lock,
  Metro,
  Sliders,
  Sun,
  Users,
} from '../components/icons'

/** Everything that isn't rehearsal-speed: setup, backup, lock, display. */
export function MorePage() {
  const outdoor = usePrefs((s) => s.outdoor)
  const toggleOutdoor = usePrefs((s) => s.toggleOutdoor)
  const lockEnabled = usePrefs((s) => s.lockEnabled)
  const [pinSheet, setPinSheet] = useState<'set' | 'clear' | null>(null)

  return (
    <div className="dl-page">
      <h2 className="page-title">More</h2>

      <div className="more-list">
        <Link to="/more/roster" className="more-row card">
          <Users size={18} />
          <span className="more-label">
            Roster
            <small>Players, instruments, bench</small>
          </span>
          <ChevronRight size={15} className="more-caret" />
        </Link>
        <Link to="/more/checkpoints" className="more-row card">
          <Sliders size={18} />
          <span className="more-label">
            Checkpoints
            <small>Rename, reorder, add, retire</small>
          </span>
          <ChevronRight size={15} className="more-caret" />
        </Link>
        <Link to="/recordings" className="more-row card">
          <AudioIcon size={18} />
          <span className="more-label">
            Recordings
            <small>Baselines and A/B playback</small>
          </span>
          <ChevronRight size={15} className="more-caret" />
        </Link>
        <Link to="/more/backup" className="more-row card">
          <Download size={18} />
          <span className="more-label">
            Backup
            <small>JSON export / import</small>
          </span>
          <ChevronRight size={15} className="more-caret" />
        </Link>
        <Link to="/metronome" className="more-row card">
          <Metro size={18} />
          <span className="more-label">
            Chops
            <small>Metronome, music library, personal records</small>
          </span>
          <ChevronRight size={15} className="more-caret" />
        </Link>
      </div>

      <section className="pref-block card">
        <h4 className="section-label">Display</h4>
        <label className="switch pref-row">
          <input type="checkbox" checked={outdoor} onChange={toggleOutdoor} />
          <span className="track" />
          <span className="switch-label">
            <Sun size={15} /> Sunlight mode (high contrast)
          </span>
        </label>
      </section>

      <section className="pref-block card">
        <h4 className="section-label">App lock</h4>
        <p className="pref-note">
          The tracker holds coaching notes about minors — the PIN keeps a passed-around phone out
          of them. If you forget it, the only way back in is clearing the site's data.
        </p>
        {lockEnabled ? (
          <div className="pref-actions">
            <button className="btn" onClick={() => setPinSheet('set')}>
              <Lock size={15} /> Change PIN
            </button>
            <button className="btn ghost danger" onClick={() => setPinSheet('clear')}>
              Remove lock
            </button>
          </div>
        ) : (
          <button className="btn primary" onClick={() => setPinSheet('set')}>
            <Lock size={15} /> Set a PIN
          </button>
        )}
      </section>

      <section className="pref-block card">
        <h4 className="section-label">Privacy</h4>
        <p className="pref-note">
          First name + last initial only. No photos of students. Recordings and notes never leave
          this device — the manual JSON export is the only way data moves anywhere.
        </p>
      </section>

      {pinSheet && <PinSheet mode={pinSheet} onClose={() => setPinSheet(null)} />}
    </div>
  )
}

function PinSheet({ mode, onClose }: { mode: 'set' | 'clear'; onClose: () => void }) {
  const setPin = usePrefs((s) => s.setPin)
  const clearPin = usePrefs((s) => s.clearPin)
  const tryUnlock = usePrefs((s) => s.tryUnlock)
  const lockEnabled = usePrefs((s) => s.lockEnabled)
  const show = useToast((s) => s.show)

  const [current, setCurrent] = useState('')
  const [pin, setPinVal] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  const needCurrent = lockEnabled

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (needCurrent) {
      const ok = await tryUnlock(current)
      if (!ok) {
        setError('Current PIN is wrong.')
        return
      }
    }
    if (mode === 'clear') {
      clearPin()
      show('App lock removed')
      onClose()
      return
    }
    if (!/^\d{4,8}$/.test(pin)) {
      setError('PIN must be 4–8 digits.')
      return
    }
    if (pin !== confirm) {
      setError("PINs don't match.")
      return
    }
    await setPin(pin)
    show('App lock is on')
    onClose()
  }

  return (
    <Sheet title={mode === 'clear' ? 'Remove lock' : lockEnabled ? 'Change PIN' : 'Set a PIN'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => void submit(e)}>
        {needCurrent && (
          <div className="field">
            <label htmlFor="pin-cur">Current PIN</label>
            <input
              id="pin-cur"
              className="input big-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoFocus
            />
          </div>
        )}
        {mode === 'set' && (
          <>
            <div className="field">
              <label htmlFor="pin-new">New PIN (4–8 digits)</label>
              <input
                id="pin-new"
                className="input big-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPinVal(e.target.value)}
                autoFocus={!needCurrent}
              />
            </div>
            <div className="field">
              <label htmlFor="pin-confirm">Repeat it</label>
              <input
                id="pin-confirm"
                className="input big-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          </>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="sheet-actions">
          <button type="button" className="btn tall ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn tall primary">
            {mode === 'clear' ? 'Remove' : 'Save'}
          </button>
        </div>
      </form>
    </Sheet>
  )
}
