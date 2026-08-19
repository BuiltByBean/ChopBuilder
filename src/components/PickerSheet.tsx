import { useState } from 'react'
import { Sheet } from './Sheet'
import { Check, ChevronDown } from './icons'

export interface PickerOption {
  value: string
  label: string
  /** Small dimmed suffix, e.g. the instrument behind a player name. */
  meta?: string
}

export interface PickerGroup {
  label?: string
  options: PickerOption[]
}

/**
 * Themed replacement for `<select>`: an input-shaped trigger that opens a
 * sheet of 48px option rows (grouped, current value checked). Native select
 * popups ignore the app theme and are unusable in sunlight — nothing in the
 * app should ever open one.
 */
export function PickerField({
  id,
  label,
  title,
  value,
  groups,
  onChange,
  noneLabel,
}: {
  id: string
  label: string
  /** Sheet heading; defaults to the field label. */
  title?: string
  value: string
  groups: PickerGroup[]
  onChange: (value: string) => void
  /** When set, a "none" row (value '') is offered at the top. */
  noneLabel?: string
}) {
  const [open, setOpen] = useState(false)

  const all = groups.flatMap((g) => g.options)
  const selected = all.find((o) => o.value === value) ?? null
  const display = selected ? selected.label : (noneLabel ?? 'Choose…')

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <button
        id={id}
        type="button"
        className="input picker-btn"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <span className={selected ? 'picker-value' : 'picker-value placeholder'}>{display}</span>
        <ChevronDown size={15} className="picker-caret" />
      </button>
      {open && (
        <Sheet title={title ?? label} onClose={() => setOpen(false)}>
          <div className="picker-list">
            {noneLabel && (
              <button
                type="button"
                className={`picker-row${value === '' ? ' on' : ''}`}
                onClick={() => pick('')}
              >
                <span className="picker-row-label">{noneLabel}</span>
                {value === '' && <Check size={15} />}
              </button>
            )}
            {groups.map((g, gi) => (
              <div key={gi} className="picker-group">
                {g.label && <h5 className="section-label">{g.label}</h5>}
                {g.options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={`picker-row${o.value === value ? ' on' : ''}`}
                    onClick={() => pick(o.value)}
                  >
                    <span className="picker-row-label">
                      {o.label}
                      {o.meta && <small>{o.meta}</small>}
                    </span>
                    {o.value === value && <Check size={15} />}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  )
}
