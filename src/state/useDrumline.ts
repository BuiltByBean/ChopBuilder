import { create } from 'zustand'
import * as api from '../db/drumline'
import {
  INSTRUMENTS,
  instrumentGroup,
  pcId,
  playerName,
  skillRankId,
  statusRank,
  uid,
  type CheckStatus,
  type Checkpoint,
  type Note,
  type NoteTag,
  type Player,
  type PlayerCheckpoint,
  type RecordingMeta,
  type SectionName,
  type Session,
  type Skill,
  type SkillRank,
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
  skills: Skill[]
  /** Keyed `${skillId}|${section}`. */
  skillRanks: Record<string, SkillRank>

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
    /** Backdate for notes typed up after the rehearsal; defaults to now. */
    createdAt?: number
    /** Born resolved — roll-call absences are a record, not a to-do. */
    resolved?: boolean
  }) => Note
  /** Roll call: mark a player absent (or present again) for a calendar day. */
  setAbsent: (playerId: string, absent: boolean, day?: number) => void
  removeNote: (id: string) => void
  setNoteResolved: (id: string, resolved: boolean) => void
  updateNote: (id: string, patch: Partial<Omit<Note, 'id'>>) => void
  /** Puts a deleted note back exactly as it was — the delete toast's Undo. */
  restoreNote: (n: Note) => void

  addCheckpoint: (input: Omit<Checkpoint, 'id' | 'createdAt' | 'sortOrder'>) => Checkpoint
  updateCheckpoint: (id: string, patch: Partial<Omit<Checkpoint, 'id'>>) => void
  moveCheckpoint: (id: string, dir: -1 | 1) => void
  /**
   * Hard delete: the checkpoint and every status/log row about it. Returns a
   * snapshot so the undo toast can put it all back. Retiring is the gentle
   * option — this is for standards the coach never wants to see again.
   */
  removeCheckpoint: (id: string) => CheckpointSnapshot | null
  restoreCheckpoint: (snap: CheckpointSnapshot) => void

  addSession: (input: Omit<Session, 'id' | 'createdAt'>) => Session
  updateSession: (id: string, patch: Partial<Omit<Session, 'id'>>) => void
  removeSession: (id: string) => void

  addRecording: (meta: Omit<RecordingMeta, 'id' | 'createdAt'>, blob: Blob) => RecordingMeta
  removeRecording: (id: string) => void

  addSkill: (name: string) => void
  updateSkill: (id: string, patch: Partial<Omit<Skill, 'id'>>) => void
  /** Replace the full order for one skill × section (rank 1 first). */
  setSkillOrder: (skillId: string, section: SectionName, order: string[]) => void

  /** Re-read every store from IndexedDB — after a sync pull or a backup import. */
  reloadFromDb: () => Promise<void>
}

export interface CheckpointSnapshot {
  checkpoint: Checkpoint
  pcs: PlayerCheckpoint[]
  history: StatusChange[]
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
  skills: [],
  skillRanks: {},

  load: async () => {
    if (get().loaded) return
    const data = await api.loadAll()
    const pcs: Record<string, PlayerCheckpoint> = {}
    for (const pc of data.playerCheckpoints) pcs[pc.id] = pc
    const skillRanks: Record<string, SkillRank> = {}
    for (const r of data.skillRanks) skillRanks[r.id] = r
    set({
      loaded: true,
      players: data.players,
      checkpoints: data.checkpoints,
      pcs,
      history: data.history,
      notes: data.notes,
      sessions: data.sessions,
      recordings: data.recordings,
      skills: data.skills,
      skillRanks,
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
      createdAt: input.createdAt ?? Date.now(),
      resolved: !!input.resolved,
      resolvedAt: input.resolved ? (input.createdAt ?? Date.now()) : null,
    }
    set((s) => ({ notes: [...s.notes, n] }))
    persist(api.putNote(n))
    return n
  },

  setAbsent: (playerId, absent, day = Date.now()) => {
    const existing = get().notes.filter(
      (n) => n.playerId === playerId && isAbsentNote(n) && sameLocalDay(n.createdAt, day),
    )
    if (absent) {
      if (existing.length > 0) return
      // Stamped at local noon of the day so it attaches to that day's session
      // whether roll was taken at 3pm or typed up the next morning.
      const at = sameLocalDay(day, Date.now()) ? Date.now() : localNoon(new Date(day))
      get().addNote({ playerId, body: ABSENT_BODY, tag: 'Attendance', createdAt: at, resolved: true })
    } else {
      for (const n of existing) get().removeNote(n.id)
    }
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

  updateNote: (id, patch) => {
    const cur = get().notes.find((n) => n.id === id)
    if (!cur) return
    const next: Note = { ...cur, ...patch }
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? next : n)) }))
    persist(api.putNote(next))
  },

  restoreNote: (n) => {
    set((s) => ({ notes: [...s.notes.filter((x) => x.id !== n.id), n] }))
    persist(api.putNote(n))
  },

  addCheckpoint: (input) => {
    // New rows land at the end of their own phase, not the end of the list.
    const maxOrder = Math.max(
      0,
      ...get()
        .checkpoints.filter((c) => c.phase === input.phase)
        .map((c) => c.sortOrder),
    )
    const c: Checkpoint = { ...input, id: uid(), sortOrder: maxOrder + 10, createdAt: Date.now() }
    set((s) => ({ checkpoints: [...s.checkpoints, c] }))
    persist(api.putCheckpoint(c))
    return c
  },

  removeCheckpoint: (id) => {
    const checkpoint = get().checkpoints.find((c) => c.id === id)
    if (!checkpoint) return null
    const pcs = Object.values(get().pcs).filter((pc) => pc.checkpointId === id)
    const history = get().history.filter((h) => h.checkpointId === id)
    set((s) => {
      const next = { ...s.pcs }
      for (const pc of pcs) delete next[pc.id]
      return {
        checkpoints: s.checkpoints.filter((c) => c.id !== id),
        pcs: next,
        history: s.history.filter((h) => h.checkpointId !== id),
      }
    })
    persist(api.deleteCheckpoint(id))
    for (const pc of pcs) persist(api.deletePlayerCheckpoint(pc.id))
    for (const h of history) persist(api.deleteHistory(h.id))
    return { checkpoint, pcs, history }
  },

  restoreCheckpoint: (snap) => {
    set((s) => {
      const next = { ...s.pcs }
      for (const pc of snap.pcs) next[pc.id] = pc
      return {
        checkpoints: [...s.checkpoints.filter((c) => c.id !== snap.checkpoint.id), snap.checkpoint],
        pcs: next,
        history: [...s.history, ...snap.history].sort((a, b) => a.at - b.at),
      }
    })
    persist(api.putCheckpoint(snap.checkpoint))
    for (const pc of snap.pcs) persist(api.putPlayerCheckpoint(pc))
    for (const h of snap.history) persist(api.putHistory(h))
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

  addSkill: (name) => {
    const maxOrder = Math.max(0, ...get().skills.map((s) => s.sortOrder))
    const skill: Skill = {
      id: uid(),
      name: name.trim(),
      sortOrder: maxOrder + 10,
      active: true,
      createdAt: Date.now(),
    }
    set((s) => ({ skills: [...s.skills, skill] }))
    persist(api.putSkill(skill))
  },

  updateSkill: (id, patch) => {
    const cur = get().skills.find((s) => s.id === id)
    if (!cur) return
    const next = { ...cur, ...patch }
    set((s) => ({ skills: s.skills.map((x) => (x.id === id ? next : x)) }))
    persist(api.putSkill(next))
  },

  setSkillOrder: (skillId, section, order) => {
    const id = skillRankId(skillId, section)
    const row: SkillRank = { id, skillId, section, order }
    set((s) => ({ skillRanks: { ...s.skillRanks, [id]: row } }))
    persist(api.putSkillRank(row))
  },

  reloadFromDb: async () => {
    set({ loaded: false })
    await get().load()
  },
}))

// --- attendance -------------------------------------------------------------------

/**
 * An absence is an Attendance note whose body is exactly "Absent" — no new
 * store, no migration, and it syncs, exports and lands in the day's session
 * like any other note. Born resolved so it never counts as an open note.
 */
export const ABSENT_BODY = 'Absent'
export const isAbsentNote = (n: Note) => n.tag === 'Attendance' && n.body === ABSENT_BODY

/** Players marked absent on a calendar day (defaults to today). */
export function absentIds(notes: Note[], day = Date.now()): Set<string> {
  const out = new Set<string>()
  for (const n of notes)
    if (n.playerId && isAbsentNote(n) && sameLocalDay(n.createdAt, day)) out.add(n.playerId)
  return out
}

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

const byLabel = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/**
 * Stable roster order for the tap grids: instrument, then name — "Snare 10"
 * after "Snare 2". Tiles must never move under a thumb mid-rehearsal, so this
 * deliberately ignores progress and open notes (see rosterOrder for that).
 */
export function stableOrder(players: Player[]): Player[] {
  return [...players].sort(
    (a, b) => instrumentIndex(a) - instrumentIndex(b) || byLabel.compare(playerName(a), playerName(b)),
  )
}

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

// --- skills ranking -------------------------------------------------------------

/** Sections that actually have active players, in instrument order. */
export function sectionsOf(players: Player[]): SectionName[] {
  const seen: SectionName[] = []
  for (const p of [...players.filter((x) => x.active)].sort(
    (a, b) => INSTRUMENTS.indexOf(a.instrument) - INSTRUMENTS.indexOf(b.instrument),
  )) {
    const g = instrumentGroup(p.instrument)
    if (!seen.includes(g)) seen.push(g)
  }
  return seen
}

/** Active players of one section, roster-stable order (instrument, then label). */
export function sectionPlayers(players: Player[], section: SectionName): Player[] {
  return stableOrder(players.filter((p) => p.active && instrumentGroup(p.instrument) === section))
}

/**
 * The effective ranking for a skill × section: the stored order minus anyone
 * who left the section, plus newcomers appended at the bottom. The stored row
 * never blocks roster changes — it just remembers the coach's last ordering.
 */
export function rankingFor(
  skillRanks: Record<string, SkillRank>,
  skillId: string,
  section: SectionName,
  players: Player[],
): Player[] {
  const inSection = sectionPlayers(players, section)
  const byId = new Map(inSection.map((p) => [p.id, p]))
  const stored = skillRanks[skillRankId(skillId, section)]?.order ?? []
  const out: Player[] = []
  for (const id of stored) {
    const p = byId.get(id)
    if (p) {
      out.push(p)
      byId.delete(id)
    }
  }
  for (const p of inSection) if (byId.has(p.id)) out.push(p)
  return out
}

/** Has the coach actually ordered this skill × section, or is it still the roster default? */
export const isRanked = (
  skillRanks: Record<string, SkillRank>,
  skillId: string,
  section: SectionName,
) => !!skillRanks[skillRankId(skillId, section)]

/**
 * 1-based rank of a player in a skill within their section — null when the
 * section is a solo, or when nobody has ranked it yet (an unranked section
 * would otherwise read as "rank 1 at everything" for whoever sorts first).
 */
export function rankOf(
  skillRanks: Record<string, SkillRank>,
  skillId: string,
  player: Player,
  players: Player[],
): { rank: number; of: number } | null {
  const section = instrumentGroup(player.instrument)
  if (!isRanked(skillRanks, skillId, section)) return null
  const list = rankingFor(skillRanks, skillId, section, players)
  if (list.length < 2) return null
  const i = list.findIndex((p) => p.id === player.id)
  return i === -1 ? null : { rank: i + 1, of: list.length }
}

export const activeSkills = (skills: Skill[]) =>
  skills.filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder)

// --- progress over time ---------------------------------------------------------

export interface WeekPoint {
  /** Local noon of the week's Monday. */
  weekStart: number
  passes: number
}

/**
 * Passes logged per week (last `weeks`, oldest first) from the append-only
 * status history — the "are we actually moving" strip.
 */
export function passesPerWeek(history: StatusChange[], weeks = 8): WeekPoint[] {
  const now = new Date()
  const day = (now.getDay() + 6) % 7 // Monday = 0
  const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day, 12).getTime()
  const WEEK = 7 * 24 * 3600 * 1000
  const out: WeekPoint[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    out.push({ weekStart: thisMonday - i * WEEK, passes: 0 })
  }
  for (const h of history) {
    if (h.to !== 'passed') continue
    for (const w of out) {
      if (h.at >= w.weekStart - 12 * 3600 * 1000 && h.at < w.weekStart + WEEK - 12 * 3600 * 1000) {
        w.passes++
        break
      }
    }
  }
  return out
}

// --- dates ---------------------------------------------------------------------

/** Local noon for a calendar day — immune to DST/timezone edge math. */
export function localNoon(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime()
}

/** ts → the yyyy-mm-dd form a native date input wants. */
export function toDateInput(ts: number): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** yyyy-mm-dd → local-noon timestamp of that day. */
export function fromDateInput(v: string): number {
  const [y, m, d] = v.split('-').map(Number)
  return localNoon(new Date(y, (m ?? 1) - 1, d ?? 1))
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
