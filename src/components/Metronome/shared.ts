import { useCallback, useRef } from 'react'
import { BPM_MAX, BPM_MIN, type Subdivision, type Timbre } from '../../audio/metronome'

const MARKINGS: [number, string][] = [
  [24, 'Larghissimo'],
  [40, 'Grave'],
  [60, 'Largo'],
  [72, 'Adagio'],
  [88, 'Andante'],
  [108, 'Moderato'],
  [132, 'Allegro'],
  [160, 'Vivace'],
  [200, 'Presto'],
  [BPM_MAX, 'Prestissimo'],
]

export function tempoName(bpm: number) {
  for (const [max, name] of MARKINGS) if (bpm <= max) return name
  return 'Prestissimo'
}

export const SUBDIVISIONS: { value: Subdivision; label: string; hint: string }[] = [
  { value: 1, label: '♩', hint: 'Quarter notes' },
  { value: 2, label: '♫', hint: 'Eighth notes' },
  { value: 3, label: '3', hint: 'Triplets' },
  { value: 4, label: '4', hint: 'Sixteenth notes' },
  { value: 6, label: '6', hint: 'Sextuplets' },
]

export const TIMBRES: { value: Timbre; label: string }[] = [
  { value: 'beep', label: 'Beep' },
  { value: 'wood', label: 'Wood' },
  { value: 'click', label: 'Click' },
  { value: 'cowbell', label: 'Cowbell' },
]

export const TEMPO_PRESETS = [60, 80, 100, 120, 140, 160, 180, 200, 240, 300]

/**
 * Drag vertically on a number to scrub the tempo — 4px of travel per BPM keeps
 * it precise enough to land on an exact number without fighting it.
 */
export function useDragTempo(current: () => number, onChange: (bpm: number) => void) {
  const start = useRef({ y: 0, bpm: 0 })

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      start.current = { y: e.clientY, bpm: current() }
    },
    [current],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const el = e.target as HTMLElement
      if (!el.hasPointerCapture?.(e.pointerId)) return
      const delta = Math.round((start.current.y - e.clientY) / 4)
      const next = Math.min(BPM_MAX, Math.max(BPM_MIN, start.current.bpm + delta))
      if (next !== current()) onChange(next)
    },
    [current, onChange],
  )

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const el = e.target as HTMLElement
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId)
  }, [])

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp }
}

/** Fills the range track up to the current value. */
export const rangeStyle = (value: number, min: number, max: number) =>
  ({ ['--pct' as string]: `${((value - min) / (max - min)) * 100}%` }) as React.CSSProperties
