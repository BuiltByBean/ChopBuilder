import { useEffect, useRef, useState } from 'react'
import {
  STATUS_LABEL,
  playerName,
  type CheckStatus,
  type Checkpoint,
  type Player,
} from '../../db/drumline'
import { usePrefs } from '../../state/usePrefs'
import { Sheet } from '../Sheet'
import { Star } from '../icons'

/** Status chip — the tap target that cycles a checkpoint's state. */
export function StatusChip({
  status,
  onClick,
  compact = false,
}: {
  status: CheckStatus
  onClick?: () => void
  compact?: boolean
}) {
  const label = STATUS_LABEL[status]
  if (!onClick) {
    return <span className={`st-chip st-${status}${compact ? ' compact' : ''}`}>{label}</span>
  }
  return (
    <button
      className={`st-chip st-${status}${compact ? ' compact' : ''}`}
      onClick={onClick}
      aria-label={`Status: ${label}. Tap to advance.`}
    >
      {label}
    </button>
  )
}

export function ProgressBar({ passed, total }: { passed: number; total: number }) {
  const pct = total ? Math.round((passed / total) * 100) : 0
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={passed}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}

export function GateStar({ size = 12 }: { size?: number }) {
  return <Star size={size} className="gate-star" />
}

/**
 * "Passed — at what tempo?" prompt. One tap to skip, so passing a checkpoint
 * that has no tempo standard costs nothing.
 */
export function PassSheet({
  player,
  checkpoint,
  onSave,
  onClose,
}: {
  player: Player
  checkpoint: Checkpoint
  onSave: (tempo: number | null) => void
  onClose: () => void
}) {
  const rehearsalBpm = usePrefs((s) => s.rehearsalBpm)
  const [value, setValue] = useState(rehearsalBpm ? String(rehearsalBpm) : '')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const tempo = () => {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null
  }

  return (
    <Sheet title={`${playerName(player)} passed`} onClose={onClose}>
      <p className="sheet-sub">{checkpoint.name}</p>
      <form
        className="pass-form"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(tempo())
        }}
      >
        <div className="field">
          <label htmlFor="pass-bpm">Clean at (BPM)</label>
          <input
            id="pass-bpm"
            ref={ref}
            className="input big-input"
            type="number"
            inputMode="numeric"
            min={20}
            max={400}
            placeholder="—"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn tall ghost" onClick={() => onSave(null)}>
            Skip tempo
          </button>
          <button type="submit" className="btn tall primary">
            Save
          </button>
        </div>
      </form>
    </Sheet>
  )
}
