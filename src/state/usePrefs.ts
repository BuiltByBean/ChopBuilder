import { create } from 'zustand'

/**
 * Small device-local preferences: sunlight mode, the rehearsal BPM stamp, and
 * the app lock. All of it stays in localStorage — none of it is worth an IDB
 * round-trip and the lock must be readable synchronously at boot.
 */

const OUTDOOR_KEY = 'chopbuilder:outdoor'
const BPM_KEY = 'chopbuilder:rehearsalBpm'
const LOCK_KEY = 'chopbuilder:lock'

function readOutdoor(): boolean {
  try {
    return localStorage.getItem(OUTDOOR_KEY) === '1'
  } catch {
    return false
  }
}

function readBpm(): number | null {
  try {
    const raw = localStorage.getItem(BPM_KEY)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

interface LockConfig {
  salt: string
  hash: string
}

function readLock(): LockConfig | null {
  try {
    const raw = localStorage.getItem(LOCK_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LockConfig
    return parsed.salt && parsed.hash ? parsed : null
  } catch {
    return null
  }
}

function applyOutdoor(on: boolean) {
  const el = document.documentElement
  if (on) el.dataset.mode = 'outdoor'
  else delete el.dataset.mode
  // Keep the browser/OS chrome tint in step with the app's ground.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', on ? '#f2f3f1' : '#0a0b0d')
}

async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

interface PrefsState {
  outdoor: boolean
  rehearsalBpm: number | null
  /** Whether a PIN is configured on this device. */
  lockEnabled: boolean
  /** Whether the lock screen is currently up. */
  locked: boolean

  toggleOutdoor: () => void
  setRehearsalBpm: (bpm: number | null) => void
  setPin: (pin: string) => Promise<void>
  clearPin: () => void
  tryUnlock: (pin: string) => Promise<boolean>
  relock: () => void
}

const initialLock = readLock()
const initialOutdoor = readOutdoor()
applyOutdoor(initialOutdoor)

export const usePrefs = create<PrefsState>((set, get) => ({
  outdoor: initialOutdoor,
  rehearsalBpm: readBpm(),
  lockEnabled: !!initialLock,
  locked: !!initialLock,

  toggleOutdoor: () => {
    const next = !get().outdoor
    set({ outdoor: next })
    applyOutdoor(next)
    try {
      localStorage.setItem(OUTDOOR_KEY, next ? '1' : '0')
    } catch {
      /* ignore */
    }
  },

  setRehearsalBpm: (bpm) => {
    set({ rehearsalBpm: bpm })
    try {
      if (bpm) localStorage.setItem(BPM_KEY, String(bpm))
      else localStorage.removeItem(BPM_KEY)
    } catch {
      /* ignore */
    }
  },

  setPin: async (pin) => {
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    const hash = await hashPin(pin, salt)
    try {
      localStorage.setItem(LOCK_KEY, JSON.stringify({ salt, hash }))
    } catch {
      /* ignore */
    }
    set({ lockEnabled: true })
  },

  clearPin: () => {
    try {
      localStorage.removeItem(LOCK_KEY)
    } catch {
      /* ignore */
    }
    set({ lockEnabled: false, locked: false })
  },

  tryUnlock: async (pin) => {
    const cfg = readLock()
    if (!cfg) {
      set({ locked: false })
      return true
    }
    const ok = (await hashPin(pin, cfg.salt)) === cfg.hash
    if (ok) set({ locked: false })
    return ok
  },

  relock: () => {
    if (get().lockEnabled) set({ locked: true })
  },
}))
