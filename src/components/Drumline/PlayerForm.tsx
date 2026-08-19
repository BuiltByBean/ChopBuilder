import { useState } from 'react'
import { INSTRUMENTS, type Instrument, type Player } from '../../db/drumline'
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
 * Add/edit a player. Deliberately only first name + last initial — the app
 * holds notes about minors and stores nothing more identifying than that.
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
  const [firstName, setFirstName] = useState(initial?.firstName ?? '')
  const [lastInitial, setLastInitial] = useState(initial?.lastInitial ?? '')
  const [instrument, setInstrument] = useState<Instrument>(initial?.instrument ?? 'Snare')
  const [grade, setGrade] = useState<9 | 10 | 11 | 12>(initial?.gradeLevel ?? 9)
  const [years, setYears] = useState(String(initial?.yearsInProgram ?? 0))
  const [sl, setSl] = useState(initial?.isSectionLeader ?? false)
  const [active, setActive] = useState(initial?.active ?? true)

  const ready = firstName.trim().length > 0 && lastInitial.trim().length > 0

  return (
    <Sheet title={title} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (!ready) return
          const y = Number(years)
          onSave({
            firstName: firstName.trim(),
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
            <label htmlFor="pf-first">First name</label>
            <input
              id="pf-first"
              className="input"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoFocus={!initial}
              autoComplete="off"
            />
          </div>
          <div className="field initial-field">
            <label htmlFor="pf-last">Last initial</label>
            <input
              id="pf-last"
              className="input"
              value={lastInitial}
              maxLength={1}
              onChange={(e) => setLastInitial(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

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
          <button type="submit" className="btn tall primary" disabled={!ready}>
            Save
          </button>
        </div>
      </form>
    </Sheet>
  )
}
