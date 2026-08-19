import { useEffect, type ReactNode } from 'react'
import { Close } from './icons'

interface SheetProps {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  /** Extra chip rendered next to the title (e.g. the BPM stamp). */
  meta?: ReactNode
}

/**
 * Bottom sheet — the tracker's primary capture surface. Anchored to the bottom
 * so every control is in thumb reach; on iOS the fixed positioning rides up
 * with the keyboard, which is exactly what a composer wants.
 */
export function Sheet({ title, onClose, children, meta }: SheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
