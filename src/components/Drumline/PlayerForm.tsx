import { useState } from 'react'
import { INSTRUMENTS, positionName, type Instrument, type Player } from '../../db/drumline'
import { useDrumline } from '../../state/useDrumline'
import { Sheet } from '../Sheet'

export interface PlayerInput {
  firstName: string
  lastInitial: string
  instrument: Instrument
  gradeLevel: 9 | 10 | 11 | 12
  yearsInProgram: number
  isSectionLeader: boolean
  active: boolean
}

const GRADES = [9, 10, 11, 12] as const

/**
 * Add/edit a player. Names are optional and deliberately minimal — first name
 * + last initial at most. Left blank, the player is auto-labelled by position
 * ("Snare 1", "Bass 2"), so a line can be run with no student names stored.
 */
export function PlayerFormSheet({
  title,
  initial,
  onSave,
  onClose,
}: {
  title: string
  initial?: Player
  onSave: (input: PlayerInput) => void
  onClose: () => void
}) {
  const players = useDrumline((s) => s.players)
  const [firstName, setFirstName] = useState(initial?.firstName ?? '')
  const [lastInitial, setLastInitial] = useState(initial?.lastInitial ?? '')
  const [instrument, setInstrument] = useState<Instrument>(initial?.instrument ?? 'Snare')
  const [grade, setGrade] = useState<9 | 10 | 11 | 12>(initial?.gradeLevel ?? 9)
  const [years, setYears] = useState(String(initial?.yearsInProgram ?? 0))
  const [sl, setSl] = useState(initial?.isSectionLeader ?? false)
  const [active, setActive] = useState(initial?.active ?? true)

  // What a blank name becomes; when editing, this player's own name isn't "taken".
  const others = initial ? players.filter((p) => p.id !== initial.id) : players
  const autoLabel = positionName(others, instrument)

  return (
    <Sheet title={title} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          const y = Number(years)
          const name = firstName.trim() || autoLabel
          onSave({
            firstName: name,
            lastInitial: lastInitial.trim().slice(0, 1).toUpperCase(),
            instrument,
            gradeLevel: grade,
            yearsInProgram: Number.isFinite(y) && y >= 0 ? Math.round(y) : 0,
            isSectionLeader: sl,
            active,
          })
        }}
      >
        <div className="form-row">
          <div className="field grow">
            <label htmlFor="pf-first">Name or label</label>
            <input
              id="pf-first"
              className="input"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder={autoLabel}
              autoFocus={!initial}
              autoComplete="off"
            />
          </div>
          <div className="field initial-field">
            <label htmlFor="pf-last">Initial</label>
            <input
              id="pf-last"
              className="input"
              value={lastInitial}
              maxLength={1}
              onChange={(e) => setLastInitial(e.target.value)}
              autoComplete="off"
              placeholder="—"
            />
          </div>
        </div>
        <p className="form-hint">Both optional — leave blank to label this player "{autoLabel}".</p>

        <div className="field">
          <label htmlFor="pf-inst">Instrument</label>
          <select
            id="pf-inst"
            className="input"
            value={instrument}
            onChange={(e) => setInstrument(e.target.value as Instrument)}
          >
            {INSTRUMENTS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Grade</label>
          <div className="seg">
            {GRADES.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={grade === g}
                onClick={() => setGrade(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="form-row">
          <div className="field grow">
            <label htmlFor="pf-years">Years in program</label>
            <input
              id="pf-years"
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              max={12}
              value={years}
              onChange={(e) => setYears(e.target.value)}
            />
          </div>
          <label className="switch pf-switch">
            <input type="checkbox" checked={sl} onChange={(e) => setSl(e.target.checked)} />
            <span className="track" />
            <span className="switch-label">Section leader</span>
          </label>
        </div>

        {initial && (
          <label className="switch">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span className="track" />
            <span className="switch-label">Active (off = benched, history kept)</span>
          </label>
        )}

        <div className="sheet-actions">
          <button type="button" className="btn tall ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn tall primary">
            Save
          </button>
        </div>
      </form>
    </Sheet>
  )
}
