import { useCallback, useEffect } from 'react'
import { BPM_MAX, BPM_MIN, type Subdivision, type Timbre } from '../../audio/metronome'
import { metronome } from '../../audio/metronome'
import { useMetronome, useTapTempo } from '../../state/useMetronome'
import { BeatLights } from './BeatLights'
import { SUBDIVISIONS, TEMPO_PRESETS, TIMBRES, rangeStyle, tempoName, useDragTempo } from './shared'
import { Minus, Pause, Play, Plus, Trend, Volume } from '../icons'

const SCALE_TICKS = [20, 80, 140, 200, 260, 300]
/** Must match the range thumb size in global.css. */
const THUMB_PX = 13

export function MetronomeFull() {
  const { settings, running, update, setBpm, nudge, setTrainer, toggle, preview } = useMetronome()
  const { tap, count } = useTapTempo(setBpm)
  const drag = useDragTempo(
    useCallback(() => metronome.settings.bpm, []),
    setBpm,
  )

  // Arrow keys scrub the tempo on this page (the practice page uses them for
  // page turns instead, where the dock's buttons cover tempo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return
      const step = e.shiftKey ? 10 : 1
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault()
        nudge(step)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault()
        nudge(-step)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nudge])

  const t = settings.trainer
  const barsToTarget =
    t.amount > 0
      ? Math.ceil(Math.abs(t.targetBpm - settings.bpm) / t.amount) * Math.max(1, t.everyBars)
      : 0
  const minutesToTarget = (barsToTarget * settings.beatsPerBar * 60) / settings.bpm / 60

  return (
    <div className="metronome-shell">
      <section className="card">
        <div className="tempo-stage">
          <div className="tempo-side">
            <button className="nudge" onClick={() => nudge(-10)} aria-label="Decrease 10 BPM">
              −10
            </button>
            <button className="nudge" onClick={() => nudge(-1)} aria-label="Decrease 1 BPM">
              −1
            </button>
          </div>

          <div className="tempo-core">
            <div
              className="tempo-value"
              title="Drag up or down to change the tempo"
              role="spinbutton"
              tabIndex={0}
              aria-label="Tempo in beats per minute"
              aria-valuenow={settings.bpm}
              aria-valuemin={BPM_MIN}
              aria-valuemax={BPM_MAX}
              {...drag}
            >
              {settings.bpm}
            </div>
            <div className="tempo-meta">
              <span>BPM</span>
              <i />
              <span>{tempoName(settings.bpm)}</span>
            </div>
          </div>

          <div className="tempo-side right">
            <button className="nudge" onClick={() => nudge(1)} aria-label="Increase 1 BPM">
              +1
            </button>
            <button className="nudge" onClick={() => nudge(10)} aria-label="Increase 10 BPM">
              +10
            </button>
          </div>
        </div>

        <div className="tempo-slider">
          <input
            type="range"
            min={BPM_MIN}
            max={BPM_MAX}
            value={settings.bpm}
            style={rangeStyle(settings.bpm, BPM_MIN, BPM_MAX)}
            onChange={(e) => setBpm(Number(e.target.value))}
            aria-label="Tempo slider"
          />
          <div className="tempo-scale" aria-hidden="true">
            {SCALE_TICKS.map((v) => (
              <span
                key={v}
                style={{
                  // The thumb's centre only travels (track − thumb), so map ticks
                  // over that span rather than the full width or they drift by
                  // half a thumb at each end.
                  left: `calc(${THUMB_PX / 2}px + (100% - ${THUMB_PX}px) * ${
                    (v - BPM_MIN) / (BPM_MAX - BPM_MIN)
                  })`,
                }}
              >
                {v}
              </span>
            ))}
          </div>
        </div>

        <BeatLights />

        <div className="transport">
          <button
            className={`play-btn${running ? ' on' : ''}`}
            onClick={toggle}
            aria-label={running ? 'Stop metronome' : 'Start metronome'}
          >
            {running ? <Pause size={14} /> : <Play size={14} />}
            {running ? 'Stop' : 'Start'}
          </button>
          <button className="tap-btn" onClick={tap}>
            Tap
            <small>{count > 1 ? `${count}` : 'tempo'}</small>
          </button>
        </div>

        <div className="hint-bar">
          <span>
            <kbd>Space</kbd>start / stop
          </span>
          <span>
            <kbd>← →</kbd>±1 BPM
          </span>
          <span>
            <kbd>⇧ ← →</kbd>±10 BPM
          </span>
          <span>
            <kbd>T</kbd>tap
          </span>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Feel</h2>
          <div className="presets">
            {TEMPO_PRESETS.map((p) => (
              <button
                key={p}
                className={`preset${settings.bpm === p ? ' active' : ''}`}
                onClick={() => setBpm(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-grid">
          <div className="field">
            <label htmlFor="beats">Beats per bar</label>
            <select
              id="beats"
              className="input"
              value={settings.beatsPerBar}
              onChange={(e) => update({ beatsPerBar: Number(e.target.value) })}
            >
              {Array.from({ length: 16 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} / 4
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Subdivision</label>
            <div className="seg">
              {SUBDIVISIONS.map((s) => (
                <button
                  key={s.value}
                  aria-pressed={settings.subdivision === s.value}
                  title={s.hint}
                  onClick={() => update({ subdivision: s.value as Subdivision })}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Click sound</label>
            <div className="seg">
              {TIMBRES.map((s) => (
                <button
                  key={s.value}
                  aria-pressed={settings.timbre === s.value}
                  onClick={() => {
                    update({ timbre: s.value as Timbre })
                    if (!running) preview('accent')
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="vol">
              <Volume size={11} /> Volume — {Math.round(settings.volume * 100)}%
            </label>
            <input
              id="vol"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={settings.volume}
              style={rangeStyle(settings.volume, 0, 1)}
              onChange={(e) => update({ volume: Number(e.target.value) })}
            />
          </div>

          <div className="field">
            <label htmlFor="subvol">
              Subdivision level — {Math.round(settings.subVolume * 100)}%
            </label>
            <input
              id="subvol"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={settings.subVolume}
              style={rangeStyle(settings.subVolume, 0, 1)}
              onChange={(e) => update({ subVolume: Number(e.target.value) })}
              disabled={settings.subdivision === 1}
            />
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>
            <Trend size={12} /> Tempo trainer
          </h2>
          <label className="switch">
            <input
              type="checkbox"
              checked={t.enabled}
              onChange={(e) => setTrainer({ enabled: e.target.checked })}
            />
            <span className="track" />
            <span className="switch-label">{t.enabled ? 'Ramping' : 'Off'}</span>
          </label>
        </div>

        <div className="trainer-body">
          <div className="trainer-row">
            <div className="field">
              <label htmlFor="tr-amount">Speed up by</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn icon" onClick={() => setTrainer({ amount: Math.max(1, t.amount - 1) })}>
                  <Minus size={14} />
                </button>
                <input
                  id="tr-amount"
                  className="input"
                  type="number"
                  min={1}
                  max={50}
                  value={t.amount}
                  onChange={(e) => setTrainer({ amount: Math.max(1, Number(e.target.value) || 1) })}
                  style={{ textAlign: 'center' }}
                />
                <button className="btn icon" onClick={() => setTrainer({ amount: Math.min(50, t.amount + 1) })}>
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <div className="field">
              <label htmlFor="tr-bars">Every</label>
              <select
                id="tr-bars"
                className="input"
                value={t.everyBars}
                onChange={(e) => setTrainer({ everyBars: Number(e.target.value) })}
              >
                {[1, 2, 4, 8, 12, 16, 24, 32].map((n) => (
                  <option key={n} value={n}>
                    {n} bar{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="tr-target">Up to</label>
              <input
                id="tr-target"
                className="input"
                type="number"
                min={BPM_MIN}
                max={BPM_MAX}
                value={t.targetBpm}
                onChange={(e) => setTrainer({ targetBpm: Number(e.target.value) || BPM_MIN })}
              />
            </div>

            <div className="field">
              <label>When it gets there</label>
              <label className="switch" style={{ height: 38 }}>
                <input
                  type="checkbox"
                  checked={t.loop}
                  onChange={(e) => setTrainer({ loop: e.target.checked })}
                />
                <span className="track" />
                <span className="switch-label">{t.loop ? 'Loop back' : 'Hold tempo'}</span>
              </label>
            </div>
          </div>

          <p className="trainer-summary">
            Starting at <b>{settings.bpm}</b> BPM, climb <b>{t.amount}</b> BPM every{' '}
            <b>{t.everyBars}</b> bar{t.everyBars > 1 ? 's' : ''} until you reach{' '}
            <b>{Math.min(BPM_MAX, Math.max(BPM_MIN, t.targetBpm))}</b> BPM
            {barsToTarget > 0 && (
              <>
                {' '}
                — about <b>{barsToTarget}</b> bars ({minutesToTarget.toFixed(1)} min)
              </>
            )}
            .
          </p>
        </div>
      </section>
    </div>
  )
}
