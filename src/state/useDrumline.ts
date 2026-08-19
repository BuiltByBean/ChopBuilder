import { create } from 'zustand'
import * as api from '../db/drumline'
import {
  INSTRUMENTS,
  pcId,
  playerName,
  statusRank,
  uid,
  type CheckStatus,
  type Checkpoint,
  type Note,
  type NoteTag,
  type Player,
  type PlayerCheckpoint,
  type RecordingMeta,
  type Session,
  type StatusChange,
} from '../db/drumline'

/**
 * All tracker state lives in memory and mirrors IndexedDB. Writes are
 * optimistic: state updates immediately, persistence runs behind it — nothing
 * in the rehearsal flow ever waits on a disk write.
 */

const persist = (p: Promise<unknown>) => {
  void p.catch((err) => console.error('drumline persist failed', err))
}

interface DrumlineState {
  loaded: boolean
  players: Player[]
  checkpoints: Checkpoint[]
  /** Keyed `${playerId}|${checkpointId}`; a missing entry reads as Not Started. */
  pcs: Record<string, PlayerCheckpoint>
  history: StatusChange[]
  notes: Note[]
  sessions: Session[]
  recordings: RecordingMeta[]

  load: () => Promise<void>

  addPlayer: (input: Omit<Player, 'id' | 'createdAt'>) => Player
  updatePlayer: (id: string, patch: Partial<Omit<Player, 'id'>>) => void

  setStatus: (
    playerId: string,
    checkpointId: string,
    to: CheckStatus,
    opts?: { tempoPassed?: number | null; bpm?: number | null },
  ) => StatusChange
  undoStatus: (change: StatusChange) => void

  addNote: (input: {
    playerId: string | null
    body: string
    tag: NoteTag
    checkpointId?: string | null
    bpm?: number | null
  }) => Note
  removeNote: (id: string) => void
  setNoteResolved: (id: string, resolved: boolean) => void

  addCheckpoint: (input: Omit<Checkpoint, 'id' | 'createdAt' | 'sortOrder'>) => void
  updateCheckpoint: (id: string, patch: Partial<Omit<Checkpoint, 'id'>>) => void
  moveCheckpoint: (id: string, dir: -1 | 1) => void

  addSession: (input: Omit<Session, 'id' | 'createdAt'>) => Session
  updateSession: (id: string, patch: Partial<Omit<Session, 'id'>>) => void
  removeSession: (id: string) => void

  addRecording: (meta: Omit<RecordingMeta, 'id' | 'createdAt'>, blob: Blob) => RecordingMeta
  removeRecording: (id: string) => void

  reloadAfterImport: () => Promise<void>
}

export const useDrumline = create<DrumlineState>((set, get) => ({
  loaded: false,
  players: [],
  checkpoints: [],
  pcs: {},
  history: [],
  notes: [],
  sessions: [],
  recordings: [],

  load: async () => {
    if (get().loaded) return
    const data = await api.loadAll()
    const pcs: Record<string, PlayerCheckpoint> = {}
    for (const pc of data.playerCheckpoints) pcs[pc.id] = pc
    set({
      loaded: true,
      players: data.players,
      checkpoints: data.checkpoints,
      pcs,
      history: data.history,
      notes: data.notes,
      sessions: data.sessions,
      recordings: data.recordings,
    })
  },

  addPlayer: (input) => {
    const p: Player = { ...input, id: uid(), createdAt: Date.now() }
    set((s) => ({ players: [...s.players, p] }))
    persist(api.putPlayer(p))
    return p
  },

  updatePlayer: (id, patch) => {
    const cur = get().players.find((p) => p.id === id)
    if (!cur) return
    const next = { ...cur, ...patch }
    set((s) => ({ players: s.players.map((p) => (p.id === id ? next : p)) }))
    persist(api.putPlayer(next))
  },

  setStatus: (playerId, checkpointId, to, opts = {}) => {
    const key = pcId(playerId, checkpointId)
    const prev = get().pcs[key]
    const from: CheckStatus = prev?.status ?? 'not_started'
    const tempoPassed =
      to === 'passed' ? (opts.tempoPassed ?? prev?.tempoPassed ?? null) : (prev?.tempoPassed ?? null)
    const next: PlayerCheckpoint = {
      id: key,
      playerId,
      checkpointId,
      status: to,
      tempoPassed,
      lastUpdated: Date.now(),
    }
    const change: StatusChange = {
      id: uid(),
      playerId,
      checkpointId,
      from,
      to,
      tempoPassed: to === 'passed' ? tempoPassed : null,
      bpm: opts.bpm ?? null,
      at: Date.now(),
    }
    set((s) => ({ pcs: { ...s.pcs, [key]: next }, history: [...s.history, change] }))
    persist(api.putPlayerCheckpoint(next))
    persist(api.putHistory(change))
    return change
  },

  /** Reverts one status change and removes it from the log — the undo toast's job. */
  undoStatus: (change) => {
    const key = pcId(change.playerId, change.checkpointId)
    const cur = get().pcs[key]
    if (!cur) return
    const reverted: PlayerCheckpoint = {
      ...cur,
      status: change.from,
      tempoPassed: change.to === 'passed' ? null : cur.tempoPassed,
      lastUpdated: Date.now(),
    }
    set((s) => ({
      pcs: { ...s.pcs, [key]: reverted },
      history: s.history.filter((h) => h.id !== change.id),
    }))
    persist(api.putPlayerCheckpoint(reverted))
    persist(api.deleteHistory(change.id))
  },

  addNote: (input) => {
    const n: Note = {
      id: uid(),
      playerId: input.playerId,
      body: input.body.trim(),
      tag: input.tag,
      checkpointId: input.checkpointId ?? null,
      bpm: input.bpm ?? null,
      createdAt: Date.now(),
      resolved: false,
      resolvedAt: null,
    }
    set((s) => ({ notes: [...s.notes, n] }))
    persist(api.putNote(n))
    return n
  },

  removeNote: (id) => {
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }))
    persist(api.deleteNote(id))
  },

  setNoteResolved: (id, resolved) => {
    const cur = get().notes.find((n) => n.id === id)
    if (!cur) return
    const next: Note = { ...cur, resolved, resolvedAt: resolved ? Date.now() : null }
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? next : n)) }))
    persist(api.putNote(next))
  },

  addCheckpoint: (input) => {
    const maxOrder = Math.max(0, ...get().checkpoints.map((c) => c.sortOrder))
    const c: Checkpoint = { ...input, id: uid(), sortOrder: maxOrder + 10, createdAt: Date.now() }
    set((s) => ({ checkpoints: [...s.checkpoints, c] }))
    persist(api.putCheckpoint(c))
  },

  updateCheckpoint: (id, patch) => {
    const cur = get().checkpoints.find((c) => c.id === id)
    if (!cur) return
    const next = { ...cur, ...patch }
    set((s) => ({ checkpoints: s.checkpoints.map((c) => (c.id === id ? next : c)) }))
    persist(api.putCheckpoint(next))
  },

  /** Swaps sort order with the neighbour inside the same phase. */
  moveCheckpoint: (id, dir) => {
    const all = get().checkpoints
    const cur = all.find((c) => c.id === id)
    if (!cur) return
    const phaseList = all
      .filter((c) => c.phase === cur.phase)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const i = phaseList.findIndex((c) => c.id === id)
    const other = phaseList[i + dir]
    if (!other) return
    const a = { ...cur, sortOrder: other.sortOrder }
    const b = { ...other, sortOrder: cur.sortOrder }
    set((s) => ({
      checkpoints: s.checkpoints.map((c) => (c.id === a.id ? a : c.id === b.id ? b : c)),
    }))
    persist(api.putCheckpoint(a))
    persist(api.putCheckpoint(b))
  },

  addSession: (input) => {
    const s: Session = { ...input, id: uid(), createdAt: Date.now() }
    set((st) => ({ sessions: [...st.sessions, s] }))
    persist(api.putSession(s))
    return s
  },

  updateSession: (id, patch) => {
    const cur = get().sessions.find((s) => s.id === id)
    if (!cur) return
    const next = { ...cur, ...patch }
    set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? next : x)) }))
    persist(api.putSession(next))
  },

  removeSession: (id) => {
    set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) }))
    persist(api.deleteSession(id))
  },

  addRecording: (meta, blob) => {
    const rec: RecordingMeta = { ...meta, id: uid(), createdAt: Date.now() }
    set((s) => ({ recordings: [...s.recordings, rec] }))
    persist(api.putRecording(rec, blob))
    return rec
  },

  removeRecording: (id) => {
    set((s) => ({ recordings: s.recordings.filter((r) => r.id !== id) }))
    persist(api.deleteRecording(id))
  },

  reloadAfterImport: async () => {
    set({ loaded: false })
    await get().load()
  },
}))

// --- derived helpers ----------------------------------------------------------

export function statusOf(
  pcs: Record<string, PlayerCheckpoint>,
  playerId: string,
  checkpointId: string,
): CheckStatus {
  return pcs[pcId(playerId, checkpointId)]?.status ?? 'not_started'
}

export function tempoOf(
  pcs: Record<string, PlayerCheckpoint>,
  playerId: string,
  checkpointId: string,
): number | null {
  return pcs[pcId(playerId, checkpointId)]?.tempoPassed ?? null
}

/** Active checkpoints in teaching order: phase, then sort order. */
export function orderedCheckpoints(checkpoints: Checkpoint[], includeInactive = false) {
  return checkpoints
    .filter((c) => includeInactive || c.active)
    .sort((a, b) => a.phase - b.phase || a.sortOrder - b.sortOrder)
}

export function progressOf(
  player: Player,
  checkpoints: Checkpoint[],
  pcs: Record<string, PlayerCheckpoint>,
) {
  const active = checkpoints.filter((c) => c.active)
  let passed = 0
  for (const c of active) if (statusOf(pcs, player.id, c.id) === 'passed') passed++
  return { passed, total: active.length }
}

/** The lowest-phase checkpoint not yet passed — "what to work on" starts here. */
export function frontierOf(
  player: Player,
  checkpoints: Checkpoint[],
  pcs: Record<string, PlayerCheckpoint>,
): Checkpoint | null {
  for (const c of orderedCheckpoints(checkpoints)) {
    if (statusOf(pcs, player.id, c.id) !== 'passed') return c
  }
  return null
}

const instrumentIndex = (p: Player) => INSTRUMENTS.indexOf(p.instrument)

/**
 * Default roster order: by instrument, then by how much the player needs
 * attention — fewest passed checkpoints first, unresolved notes as tiebreak.
 */
export function rosterOrder(
  players: Player[],
  checkpoints: Checkpoint[],
  pcs: Record<string, PlayerCheckpoint>,
  notes: Note[],
): Player[] {
  const openNotes = new Map<string, number>()
  for (const n of notes) {
    if (!n.resolved && n.playerId) openNotes.set(n.playerId, (openNotes.get(n.playerId) ?? 0) + 1)
  }
  return [...players].sort((a, b) => {
    const inst = instrumentIndex(a) - instrumentIndex(b)
    if (inst !== 0) return inst
    const pa = progressOf(a, checkpoints, pcs).passed
    const pb = progressOf(b, checkpoints, pcs).passed
    if (pa !== pb) return pa - pb
    const na = openNotes.get(a.id) ?? 0
    const nb = openNotes.get(b.id) ?? 0
    if (na !== nb) return nb - na
    return playerName(a).localeCompare(playerName(b))
  })
}

export interface GateReport {
  gate: Checkpoint
  passed: Player[]
  blocking: Player[]
}

export function gateReports(
  checkpoints: Checkpoint[],
  players: Player[],
  pcs: Record<string, PlayerCheckpoint>,
): GateReport[] {
  const active = players.filter((p) => p.active)
  return orderedCheckpoints(checkpoints)
    .filter((c) => c.gateFlag)
    .map((gate) => {
      const passed: Player[] = []
      const blocking: Player[] = []
      for (const p of active)
        (statusOf(pcs, p.id, gate.id) === 'passed' ? passed : blocking).push(p)
      return { gate, passed, blocking }
    })
}

export interface WeakSpot {
  checkpoint: Checkpoint
  /** 0 (nobody started) … 3 (everyone passed). */
  avg: number
  notPassed: number
}

/** Checkpoints ranked weakest-first across the active line. */
export function weakestCheckpoints(
  checkpoints: Checkpoint[],
  players: Player[],
  pcs: Record<string, PlayerCheckpoint>,
): WeakSpot[] {
  const active = players.filter((p) => p.active)
  if (!active.length) return []
  return orderedCheckpoints(checkpoints)
    .map((checkpoint) => {
      let sum = 0
      let notPassed = 0
      for (const p of active) {
        const st = statusOf(pcs, p.id, checkpoint.id)
        sum += statusRank(st)
        if (st !== 'passed') notPassed++
      }
      return { checkpoint, avg: sum / active.length, notPassed }
    })
    .sort((a, b) => a.avg - b.avg || b.notPassed - a.notPassed)
}

// --- dates ---------------------------------------------------------------------

/** Local noon for a calendar day — immune to DST/timezone edge math. */
export function localNoon(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime()
}

export function sameLocalDay(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

/** Notes taken on the same calendar day as the session — its rehearsal notes. */
export function notesForSession(notes: Note[], session: Session): Note[] {
  return notes.filter((n) => sameLocalDay(n.createdAt, session.date))
}

export function fmtDay(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function fmtDayYear(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
