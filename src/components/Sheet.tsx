import { useEffect, type ReactNode } from 'react'
import { Close } from './icons'

interface SheetProps {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  /** Extra chip rendered next to the title (e.g. the BPM stamp). */
  meta?: ReactNode
}

/** Sheets can stack (a picker opens over the note sheet); Escape only closes the top one. */
const sheetStack: symbol[] = []

/**
 * Bottom sheet — the tracker's primary capture surface. Anchored to the bottom
 * so every control is in thumb reach; on iOS the fixed positioning rides up
 * with the keyboard, which is exactly what a composer wants.
 */
export function Sheet({ title, onClose, children, meta }: SheetProps) {
  useEffect(() => {
    const me = Symbol('sheet')
    sheetStack.push(me)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sheetStack[sheetStack.length - 1] === me) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      const i = sheetStack.indexOf(me)
      if (i !== -1) sheetStack.splice(i, 1)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true">
      <div className="sheet-backdrop" onMouseDown={onClose} />
      <div className="sheet">
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h3>{title}</h3>
          {meta}
          <button className="btn icon ghost sheet-x" onClick={onClose} aria-label="Close">
            <Close size={16} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
