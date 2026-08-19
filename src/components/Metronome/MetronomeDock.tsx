import { useCallback } from 'react'
import { BPM_MIN, BPM_MAX, metronome, type Subdivision } from '../../audio/metronome'
import { useMetronome, useTapTempo } from '../../state/useMetronome'
import { BeatLights } from './BeatLights'
import { SUBDIVISIONS, TIMBRES, rangeStyle, useDragTempo } from './shared'
import { Close, Pause, Play, Trend, Volume } from '../icons'

/** The metronome as it appears next to sheet music — same engine, tighter layout. */
export function MetronomeDock({ onHide }: { onHide: () => void }) {
  const { settings, running, update, setBpm, nudge, setTrainer, toggle, preview } = useMetronome()
  const { tap } = useTapTempo(setBpm)
  const drag = useDragTempo(
    useCallback(() => metronome.settings.bpm, []),
    setBpm,
  )
  const t = settings.trainer

  return (
    <aside className="dock" aria-label="Metronome">
      <div className="dock-head">
        <h3>Metronome</h3>
        <button className="btn ghost icon" onClick={onHide} title="Hide metronome panel">
          <Close size={15} />
        </button>
      </div>

      <div className="dock-body">
        <div className="dock-tempo">
          <b
            {...drag}
            title="Drag up or down to change the tempo"
            role="spinbutton"
            aria-label="Tempo in beats per minute"
            aria-valuenow={settings.bpm}
            aria-valuemin={BPM_MIN}
            aria-valuemax={BPM_MAX}
          >
            {settings.bpm}
          </b>
          <span>BPM</span>
        </div>

        <input
          type="range"
          min={BPM_MIN}
          max={BPM_MAX}
          value={settings.bpm}
          style={rangeStyle(settings.bpm, BPM_MIN, BPM_MAX)}
          onChange={(e) => setBpm(Number(e.target.value))}
          aria-label="Tempo slider"
        />

        <div className="dock-row">
          <button className="btn sm" onClick={() => nudge(-5)}>
            −5
          </button>
          <button className="btn sm" onClick={() => nudge(-1)}>
            −1
          </button>
          <button className="btn sm" onClick={() => nudge(1)}>
            +1
          </button>
          <button className="btn sm" onClick={() => nudge(5)}>
            +5
          </button>
        </div>

        <BeatLights compact />

        <div className="dock-row">
          <button
            className={`btn primary${running ? ' ghost' : ''}`}
            onClick={toggle}
            style={{ flex: 1, height: 42 }}
          >
            {running ? <Pause size={16} /> : <Play size={16} />}
            {running ? 'Stop' : 'Start'}
          </button>
          <button className="btn" onClick={tap} style={{ height: 42 }}>
            Tap
          </button>
        </div>

        <div className="field">
          <label htmlFor="d-beats">Beats per bar</label>
          <select
            id="d-beats"
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
          <div className="seg" style={{ width: '100%' }}>
            {SUBDIVISIONS.map((s) => (
              <button
                key={s.value}
                aria-pressed={settings.subdivision === s.value}
                title={s.hint}
                onClick={() => update({ subdivision: s.value as Subdivision })}
                style={{ flex: 1 }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Click sound</label>
          <select
            className="input"
            value={settings.timbre}
            onChange={(e) => {
              update({ timbre: e.target.value as never })
              if (!running) preview('accent')
            }}
          >
            {TIMBRES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="d-vol">
            <Volume size={11} /> Volume — {Math.round(settings.volume * 100)}%
          </label>
          <input
            id="d-vol"
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
          <label className="switch">
            <input
              type="checkbox"
              checked={t.enabled}
              onChange={(e) => setTrainer({ enabled: e.target.checked })}
            />
            <span className="track" />
            <span className="switch-label">
              <Trend size={11} /> Trainer +{t.amount}/{t.everyBars} bars → {t.targetBpm}
            </span>
          </label>
        </div>
      </div>
    </aside>
  )
}
