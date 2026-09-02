import { create } from 'zustand'

/**
 * Small device-local preferences: the app lock. It stays in localStorage
 * because the lock must be readable synchronously at boot. The app is
 * dark-only by the owner's choice; the old sunlight mode is gone, and so is
 * the pinned rehearsal BPM — notes now stamp the live metronome's tempo
 * (see useRehearsalBpm).
 */

const LOCK_KEY = 'chopbuilder:lock'

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

async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

interface PrefsState {
  /** Whether a PIN is configured on this device. */
  lockEnabled: boolean
  /** Whether the lock screen is currently up. */
  locked: boolean

  setPin: (pin: string) => Promise<void>
  clearPin: () => void
  tryUnlock: (pin: string) => Promise<boolean>
  relock: () => void
}

const initialLock = readLock()
// Devices that were left in the retired sunlight mode come back dark, and a
// BPM pinned by the old rehearsal bar must not keep stamping every note.
try {
  localStorage.removeItem('chopbuilder:outdoor')
  localStorage.removeItem('chopbuilder:rehearsalBpm')
} catch {
  /* ignore */
}

export const usePrefs = create<PrefsState>((set, get) => ({
  lockEnabled: !!initialLock,
  locked: !!initialLock,

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
