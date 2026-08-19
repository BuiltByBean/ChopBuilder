import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  metronome,
  clampBpm,
  type BeatState,
  type MetronomeSettings,
  type TrainerConfig,
} from '../audio/metronome'

const STORAGE_KEY = 'chopbuilder:metronome'

const subscribe = (fn: () => void) => metronome.subscribe(fn)

let persistAttached = false

/** Restore the last session's tempo/sound so practice picks up where it left off. */
export function restoreMetronomeSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<MetronomeSettings>
      metronome.update({
        ...saved,
        // Never restore a half-finished tempo ramp.
        trainer: saved.trainer
          ? { ...metronome.settings.trainer, ...saved.trainer, enabled: false }
          : metronome.settings.trainer,
      })
    }
  } catch {
    /* corrupt or unavailable storage is not worth failing over */
  }
  // One app-wide persist subscription (guarded because StrictMode mounts twice).
  if (!persistAttached) {
    persistAttached = true
    metronome.subscribe(persistMetronomeSettings)
  }
}

export function persistMetronomeSettings() {
  try {
    const { bpm, beatsPerBar, subdivision, timbre, volume, subVolume, accents, trainer } =
      metronome.settings
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ bpm, beatsPerBar, subdivision, timbre, volume, subVolume, accents, trainer }),
    )
  } catch {
    /* ignore */
  }
}

export function useMetronome() {
  const settings = useSyncExternalStore(subscribe, () => metronome.settings)
  const running = useSyncExternalStore(subscribe, () => metronome.running)

  const update = useCallback((patch: Partial<MetronomeSettings>) => metronome.update(patch), [])
  const setBpm = useCallback((bpm: number) => metronome.update({ bpm: clampBpm(bpm) }), [])
  const nudge = useCallback(
    (delta: number) => metronome.update({ bpm: clampBpm(metronome.settings.bpm + delta) }),
    [],
  )
  const setTrainer = useCallback((patch: Partial<TrainerConfig>) => metronome.setTrainer(patch), [])
  const cycleAccent = useCallback((i: number) => metronome.cycleAccent(i), [])
  const toggle = useCallback(() => metronome.toggle(), [])
  const start = useCallback(() => metronome.start(), [])
  const stop = useCallback(() => metronome.stop(), [])
  const preview = useCallback((s: BeatState = 'accent') => metronome.preview(s), [])

  return { settings, running, update, setBpm, nudge, setTrainer, cycleAccent, toggle, start, stop, preview }
}

export interface BeatPulse {
  step: number
  beatIndex: number
  isBeat: boolean
  state: BeatState
  /** Increments on every click so animations can be re-keyed. */
  tick: number
}

/**
 * Polls the engine on rAF but only re-renders when the click actually changes,
 * so the beat lights stay in sync with the audio without a 60 fps render loop.
 */
export function useBeat(): BeatPulse {
  const [pulse, setPulse] = useState<BeatPulse>({
    step: -1,
    beatIndex: -1,
    isBeat: false,
    state: 'normal',
    tick: 0,
  })
  const last = useRef(-2)
  const tick = useRef(0)

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const v = metronome.readVisual()
      if (v.step !== last.current) {
        last.current = v.step
        tick.current += 1
        setPulse({
          step: v.step,
          beatIndex: v.beatIndex,
          isBeat: v.isBeat,
          state: v.state,
          tick: tick.current,
        })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return pulse
}

/** Averages recent taps into a tempo. Taps more than 2s apart start over. */
export function useTapTempo(onTempo: (bpm: number) => void) {
  const taps = useRef<number[]>([])
  const [count, setCount] = useState(0)

  const tap = useCallback(() => {
    const now = performance.now()
    const list = taps.current
    if (list.length && now - list[list.length - 1] > 2000) list.length = 0
    list.push(now)
    if (list.length > 6) list.shift()
    setCount(list.length)

    if (list.length >= 2) {
      const gaps: number[] = []
      for (let i = 1; i < list.length; i++) gaps.push(list[i] - list[i - 1])
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
      if (avg > 0) onTempo(clampBpm(60000 / avg))
    }
  }, [onTempo])

  const reset = useCallback(() => {
    taps.current = []
    setCount(0)
  }, [])

  return { tap, reset, count }
}
