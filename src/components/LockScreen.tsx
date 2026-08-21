import { useEffect, useState } from 'react'
import { usePrefs } from '../state/usePrefs'
import { Lock, Metro } from './icons'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const

/** Full-screen PIN gate. Digits auto-submit from 4 entered onward. */
export function LockScreen() {
  const tryUnlock = usePrefs((s) => s.tryUnlock)
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)
  const [checking, setChecking] = useState(false)

  const attempt = async (value: string) => {
    setChecking(true)
    const ok = await tryUnlock(value)
    setChecking(false)
    if (!ok) {
      setShake(true)
      setPin('')
      window.setTimeout(() => setShake(false), 450)
    }
  }

  const press = (k: (typeof KEYS)[number]) => {
    if (checking || !k) return
    if (k === '⌫') {
      setPin((p) => p.slice(0, -1))
      return
    }
    const next = (pin + k).slice(0, 8)
    setPin(next)
    if (next.length >= 4) void attempt(next)
  }

  // Hardware keyboard works too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number])
      else if (e.key === 'Backspace') press('⌫')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="lock-screen">
      <div className={`lock-card${shake ? ' shake' : ''}`}>
        <span className="lock-mark">
          <Metro size={16} />
        </span>
        <h2>
          <Lock size={16} /> ChopBuilder
        </h2>
        <div className="pin-dots" aria-label="PIN entry">
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
            <i key={i} className={i < pin.length ? 'filled' : ''} />
          ))}
        </div>
        <div className="pin-pad">
          {KEYS.map((k, i) => (
            <button
              key={i}
              className="pin-key"
              disabled={!k || checking}
              onClick={() => press(k)}
              aria-label={k === '⌫' ? 'Delete digit' : k || undefined}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
