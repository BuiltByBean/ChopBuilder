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
  /** Server origin; '' = the site the app is served from. */
  url: string
  /** Only needed if the server sets CHOP_KEY; blank for the keyless default. */
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
const PUSH_CHUNK = 800
const MARKS_ID = 'syncMarks'

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

/**
 * Watermarks live in the SAME IndexedDB as the data — never localStorage.
 * iOS can evict one storage area without the other; a surviving "synced up to
 * T" marker over an emptied database made the app sit on a blank roster while
 * the server held everything. Marks that die with the data mean an emptied
 * device restarts from since=0 and pulls it all back. (Old localStorage marks
 * are intentionally abandoned, forcing one full re-pull on every device.)
 */
let marks: Watermarks | null = null

async function loadMarks(): Promise<Watermarks> {
  if (marks) return marks
  const d = await db()
  const row = (await d.get('meta', MARKS_ID)) as { value?: Partial<Watermarks> } | undefined
  marks = { since: 0, pushedAt: 0, lastSyncAt: 0, ...(row?.value ?? {}) }
  try {
    localStorage.removeItem('chopbuilder:syncMarks')
  } catch {
    /* ignore */
  }
  return marks
}

async function saveMarks(next: Watermarks) {
  marks = next
  const d = await db()
  await d.put('meta', { key: MARKS_ID, value: next })
}

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'offline' | 'error' | 'noserver'

interface SyncState {
  url: string
  key: string
  status: SyncStatus
  lastSyncAt: number
  /** Human detail for the last error ("bad key", "HTTP 500"…). */
  detail: string
  setConfig: (patch: Partial<SyncConfig>) => void
}

// Sync is always on — one person, several devices, zero setup. Old configs
// may still carry an enabled flag; it's ignored.
const cfg0 = readJson<SyncConfig>(CFG_KEY, { url: '', key: '' })

export const useSync = create<SyncState>((set, get) => ({
  url: cfg0.url,
  key: cfg0.key,
  status: 'idle',
  lastSyncAt: 0,
  detail: '',

  setConfig: (patch) => {
    const next = { url: get().url, key: get().key, ...patch }
    next.url = next.url.trim().replace(/\/+$/, '')
    writeJson(CFG_KEY, next)
    set({ ...next, status: 'idle', detail: '' })
    scheduleSync(200)
  },
}))

/** After a backup import the device's contents changed wholesale — push and
 * pull everything again and let last-write-wins sort out the merge. */
export function resetSyncWatermarks() {
  void saveMarks({ since: 0, pushedAt: 0, lastSyncAt: marks?.lastSyncAt ?? 0 }).then(() =>
    scheduleSync(200),
  )
}

let timer: ReturnType<typeof setTimeout> | null = null
let syncing = false
let queued = false

export function scheduleSync(delay = 1500) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void syncNow('change')
  }, delay)
}

async function collectPush(pushedAt: number): Promise<SyncRow[]> {
  const d = await db()
  const out: SyncRow[] = []
  for (const store of SYNCED_STORES) {
    const rows = (await d.getAll(store)) as unknown as Record<string, unknown>[]
    for (const row of rows) {
      const up = effUpdated(row)
      if (up > pushedAt) {
        out.push({ id: String(row.id), store, updatedAt: up, data: row })
      }
    }
  }
  for (const t of await d.getAll('tombstones')) {
    if (t.updatedAt > pushedAt) {
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
    const m = await loadMarks()
    const t0 = Date.now()
    const push = await collectPush(m.pushedAt)
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
          // since: 0 — ALWAYS pull the full set. The data is a few dozen rows,
          // and an incremental watermark is the one piece of state that can go
          // wrong invisibly (it did: a surviving watermark over an emptied
          // database hid the roster). LWW apply makes the full pull idempotent.
          body: JSON.stringify({ since: 0, rows: chunk }),
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
    await saveMarks({ since: serverNow, pushedAt: t0, lastSyncAt: Date.now() })
    useSync.setState({ status: 'ok', lastSyncAt: Date.now(), detail: '' })
    if (changed > 0) await useDrumline.getState().reloadFromDb()
    beacon('sync', { reason, pulled: pulled.length, applied: changed })
  } catch (err) {
    useSync.setState({
      status: 'error',
      detail: err instanceof Error ? err.message : 'sync failed',
    })
    beacon('sync-error', { reason, error: useSync.getState().detail })
  } finally {
    syncing = false
    if (queued) {
      queued = false
      setTimeout(() => void syncNow('queued'), 150)
    }
  }
}

let initialized = false

/**
 * Report this device's state to the server (fire-and-forget) so remote
 * debugging doesn't depend on screenshots. Counts and statuses only —
 * no roster contents. Read back at GET /api/diag.
 */
function beacon(stage: string, extra: Record<string, unknown> = {}) {
  try {
    const s = useSync.getState()
    void fetch(`${s.url || ''}/api/diag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stage,
        build: __BUILD_TIME__,
        standalone:
          window.matchMedia('(display-mode: standalone)').matches ||
          (navigator as unknown as { standalone?: boolean }).standalone === true,
        status: s.status,
        detail: s.detail,
        dbBlocked: !!(window as { __dbBlocked?: boolean }).__dbBlocked,
        players: useDrumline.getState().players.length,
        marks,
        ua: navigator.userAgent.slice(0, 110),
        ...extra,
      }),
    }).catch(() => {})
  } catch {
    /* telemetry must never break the app */
  }
}

/** Wire the triggers once at app start: local changes, regaining network, tab return. */
export function initSync() {
  if (initialized) return
  initialized = true
  // Ask the browser not to evict our storage under disk pressure — losing the
  // database between rehearsals is exactly the failure this app can't have.
  try {
    void navigator.storage?.persist?.()?.catch(() => {})
  } catch {
    /* unsupported */
  }
  window.addEventListener(CHANGED_EVENT, () => scheduleSync())
  window.addEventListener('online', () => scheduleSync(300))
  // visibilitychange covers tab switches; pageshow catches iOS standalone
  // relaunches restored from a snapshot, where visibility never flips.
  window.addEventListener('pageshow', () => scheduleSync(400))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(400)
  })
  void loadMarks().then((m) => {
    if (m.lastSyncAt) useSync.setState({ lastSyncAt: m.lastSyncAt })
    beacon('boot')
  })
  scheduleSync(800)
}

export function syncDetailLine(state: SyncState): string {
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
