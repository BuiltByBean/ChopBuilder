import { create } from 'zustand'
import { db } from '../db/library'
import { CHANGED_EVENT, SYNCED_STORES, effUpdated, type SyncedStore } from '../db/drumline'
import { useDrumline } from '../state/useDrumline'

/**
 * Multi-device sync, same shape as the Flipping app's engine: offline-first,
 * every mutation stamps updatedAt, and one POST both pushes local changes and
 * pulls everyone else's. Conflicts resolve last-write-wins on updatedAt; the
 * pull watermark (`since`) is SERVER time so device clock skew can't hide
 * rows. Recordings never sync — audio stays on the device that captured it.
 */

export interface SyncRow {
  id: string
  store: SyncedStore
  updatedAt: number
  deleted?: boolean
  data: Record<string, unknown> | null
}

interface SyncConfig {
  enabled: boolean
  /** Server origin; '' = the site the app is served from. */
  url: string
  key: string
}

interface Watermarks {
  /** Server time of the newest row we've pulled. */
  since: number
  /** Client time of the last successful push — rows newer than this get pushed. */
  pushedAt: number
  lastSyncAt: number
}

const CFG_KEY = 'chopbuilder:syncConfig'
const WM_KEY = 'chopbuilder:syncMarks'
const PUSH_CHUNK = 800

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

let marks: Watermarks = readJson(WM_KEY, { since: 0, pushedAt: 0, lastSyncAt: 0 })

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'ok' | 'offline' | 'error' | 'noserver'

interface SyncState {
  enabled: boolean
  url: string
  key: string
  status: SyncStatus
  lastSyncAt: number
  /** Human detail for the last error ("bad key", "HTTP 500"…). */
  detail: string
  setConfig: (patch: Partial<SyncConfig>) => void
}

const cfg0 = readJson<SyncConfig>(CFG_KEY, { enabled: false, url: '', key: '' })

export const useSync = create<SyncState>((set, get) => ({
  enabled: cfg0.enabled,
  url: cfg0.url,
  key: cfg0.key,
  status: cfg0.enabled ? 'idle' : 'off',
  lastSyncAt: marks.lastSyncAt,
  detail: '',

  setConfig: (patch) => {
    const next = { enabled: get().enabled, url: get().url, key: get().key, ...patch }
    next.url = next.url.trim().replace(/\/+$/, '')
    writeJson(CFG_KEY, next)
    set({ ...next, status: next.enabled ? 'idle' : 'off', detail: '' })
    if (next.enabled) scheduleSync(200)
  },
}))

/** After a backup import the device's contents changed wholesale — push and
 * pull everything again and let last-write-wins sort out the merge. */
export function resetSyncWatermarks() {
  marks = { since: 0, pushedAt: 0, lastSyncAt: marks.lastSyncAt }
  writeJson(WM_KEY, marks)
  scheduleSync(200)
}

let timer: ReturnType<typeof setTimeout> | null = null
let syncing = false
let queued = false

export function scheduleSync(delay = 1500) {
  if (!useSync.getState().enabled) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void syncNow('change')
  }, delay)
}

async function collectPush(): Promise<SyncRow[]> {
  const d = await db()
  const out: SyncRow[] = []
  for (const store of SYNCED_STORES) {
    const rows = (await d.getAll(store)) as unknown as Record<string, unknown>[]
    for (const row of rows) {
      const up = effUpdated(row)
      if (up > marks.pushedAt) {
        out.push({ id: String(row.id), store, updatedAt: up, data: row })
      }
    }
  }
  for (const t of await d.getAll('tombstones')) {
    if (t.updatedAt > marks.pushedAt) {
      out.push({ id: t.rowId, store: t.store, updatedAt: t.updatedAt, deleted: true, data: null })
    }
  }
  return out
}

/** Write one pulled row into IDB if it's newer than what we hold. */
async function applyRow(r: SyncRow): Promise<boolean> {
  const d = await db()
  const store = r.store
  if (!SYNCED_STORES.includes(store)) return false
  const local = (await d.get(store, r.id)) as Record<string, unknown> | undefined
  if (local && effUpdated(local) >= r.updatedAt) return false
  if (r.deleted) {
    if (!local) return false
    await d.delete(store, r.id)
    return true
  }
  if (!r.data || typeof r.data !== 'object') return false
  await d.put(store, { ...r.data, id: r.id, updatedAt: r.updatedAt } as never)
  return true
}

export async function syncNow(reason: string): Promise<void> {
  const s = useSync.getState()
  if (!s.enabled) return
  if (!navigator.onLine) {
    useSync.setState({ status: 'offline', detail: '' })
    return
  }
  if (syncing) {
    queued = true
    return
  }
  syncing = true
  useSync.setState({ status: 'syncing', detail: '' })
  try {
    const t0 = Date.now()
    const push = await collectPush()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (s.key) headers['X-Chop-Key'] = s.key
    const endpoint = `${s.url || ''}/api/sync`

    let pulled: SyncRow[] = []
    let serverNow = 0
    let sent = 0
    do {
      const chunk = push.slice(sent, sent + PUSH_CHUNK)
      sent += chunk.length
      // Parking-lot networks hang more often than they fail — never let a
      // wedged request lock the engine.
      const ctrl = new AbortController()
      const kill = setTimeout(() => ctrl.abort(), 15_000)
      let res: Response
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({ since: marks.since || 0, rows: chunk }),
          signal: ctrl.signal,
        })
      } finally {
        clearTimeout(kill)
      }
      if (res.status === 404 || res.status === 501 || res.status === 503) {
        useSync.setState({ status: 'noserver', detail: `HTTP ${res.status}` })
        return
      }
      if (res.status === 401) {
        useSync.setState({ status: 'error', detail: 'Wrong sync key' })
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { now: number; rows: SyncRow[] }
      pulled = body.rows ?? []
      serverNow = typeof body.now === 'number' ? body.now : Date.now()
      // Pulls repeat per chunk against the same watermark — applying is
      // idempotent (LWW), so just apply the last response's rows below.
    } while (sent < push.length)

    let changed = 0
    for (const r of pulled) {
      if (await applyRow(r)) changed++
    }
    marks = { since: serverNow, pushedAt: t0, lastSyncAt: Date.now() }
    writeJson(WM_KEY, marks)
    useSync.setState({ status: 'ok', lastSyncAt: marks.lastSyncAt, detail: '' })
    if (changed > 0) await useDrumline.getState().reloadFromDb()
  } catch (err) {
    useSync.setState({
      status: 'error',
      detail: err instanceof Error ? err.message : 'sync failed',
    })
  } finally {
    syncing = false
    if (queued) {
      queued = false
      setTimeout(() => void syncNow('queued'), 150)
    }
  }
}

let initialized = false

/** Wire the triggers once at app start: local changes, regaining network, tab return. */
export function initSync() {
  if (initialized) return
  initialized = true
  window.addEventListener(CHANGED_EVENT, () => scheduleSync())
  window.addEventListener('online', () => scheduleSync(300))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(400)
  })
  scheduleSync(800)
}

export function syncDetailLine(state: SyncState): string {
  if (!state.enabled) return 'Off — this device only'
  switch (state.status) {
    case 'syncing':
      return 'Syncing…'
    case 'offline':
      return 'Offline — will sync when back online'
    case 'noserver':
      return 'No sync server reachable here'
    case 'error':
      return `Sync error — will retry (${state.detail})`
    default: {
      if (!state.lastSyncAt) return 'Not synced yet'
      const m = Math.round((Date.now() - state.lastSyncAt) / 60000)
      return m < 1 ? 'Synced just now' : m < 60 ? `Synced ${m}m ago` : `Synced ${Math.round(m / 60)}h ago`
    }
  }
}
