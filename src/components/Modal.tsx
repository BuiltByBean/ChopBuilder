import { useEffect, useRef, useState } from 'react'

interface PromptProps {
  title: string
  label?: string
  initial?: string
  confirmText?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

/** Small text-entry dialog — used for creating and renaming folders and files. */
export function PromptModal({
  title,
  label,
  initial = '',
  confirmText = 'Save',
  onConfirm,
  onCancel,
}: PromptProps) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault()
          if (value.trim()) onConfirm(value.trim())
        }}
      >
        <h3>{title}</h3>
        <div className="field">
          {label && <label htmlFor="prompt-input">{label}</label>}
          <input
            id="prompt-input"
            ref={ref}
            className="input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onCancel()}
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!value.trim()}>
            {confirmText}
          </button>
        </div>
      </form>
    </div>
  )
}

interface ConfirmProps {
  title: string
  body: string
  confirmText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  title,
  body,
  confirmText = 'Delete',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="modal">
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button className={`btn${danger ? ' danger' : ' primary'}`} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
