import { db, uid } from './library'

/**
 * Drumline progress tracker — data model.
 *
 * Privacy stance (non-negotiable): first name + last initial only, no photos,
 * no contact info, nothing leaves the device except a manual JSON export.
 * Notes are coaching observations on technique/effort — the tag list is the
 * whole vocabulary on purpose.
 */

export const INSTRUMENTS = [
  'Snare',
  'Tenors',
  'Bass 1',
  'Bass 2',
  'Bass 3',
  'Bass 4',
  'Bass 5',
  'Cymbals',
] as const
export type Instrument = (typeof INSTRUMENTS)[number]

/** Display grouping: the five basses read as one section. */
export function instrumentGroup(i: Instrument): 'Snares' | 'Tenors' | 'Basses' | 'Cymbals' {
  if (i === 'Snare') return 'Snares'
  if (i === 'Tenors') return 'Tenors'
  if (i === 'Cymbals') return 'Cymbals'
  return 'Basses'
}

export const NOTE_TAGS = [
  'Technique',
  'Timing',
  'Marching',
  'Sound Quality',
  'Attitude/Effort',
  'Attendance',
  'Win',
] as const
export type NoteTag = (typeof NOTE_TAGS)[number]

export const STATUSES = ['not_started', 'working', 'close', 'passed'] as const
export type CheckStatus = (typeof STATUSES)[number]

export const STATUS_LABEL: Record<CheckStatus, string> = {
  not_started: 'Not started',
  working: 'Working',
  close: 'Close',
  passed: 'Passed',
}

export const statusRank = (s: CheckStatus) => STATUSES.indexOf(s)

export const nextStatus = (s: CheckStatus): CheckStatus =>
  STATUSES[(STATUSES.indexOf(s) + 1) % STATUSES.length]

export interface Player {
  id: string
  firstName: string
  lastInitial: string
  instrument: Instrument
  gradeLevel: 9 | 10 | 11 | 12
  yearsInProgram: number
  isSectionLeader: boolean
  /** Benched/archived players keep their whole history; they just leave the grids. */
  active: boolean
  createdAt: number
  /** Stamped on every write; drives last-write-wins sync. */
  updatedAt?: number
}

/** "Ty L." with an initial, or the bare label ("Snare 1") for no-name rosters. */
export const playerName = (p: Player) =>
  p.lastInitial ? `${p.firstName} ${p.lastInitial}.` : p.firstName

/**
 * Auto-label for a player added without a name: "Snare 1", "Tenors 2",
 * "Bass 3" — the next label that isn't already on the roster. Lets a line be
 * built entirely from positions, no student names stored at all.
 */
export function positionName(players: Player[], instrument: Instrument): string {
  const taken = new Set(players.map((p) => p.firstName.trim().toLowerCase()))
  if (instrument.startsWith('Bass')) {
    if (!taken.has(instrument.toLowerCase())) return instrument
    for (let n = 2; ; n++) {
      const name = `${instrument} (${n})`
      if (!taken.has(name.toLowerCase())) return name
    }
  }
  for (let n = 1; ; n++) {
    const name = `${instrument} ${n}`
    if (!taken.has(name.toLowerCase())) return name
  }
}

export interface Checkpoint {
  id: string
  name: string
  phase: 1 | 2 | 3 | 4 | 5 | 6
  description: string
  /** Phase gates are the "the section moves on when everyone clears this" rows. */
  gateFlag: boolean
  sortOrder: number
  active: boolean
  createdAt: number
  updatedAt?: number
}

/**
 * Junction row, keyed `${playerId}|${checkpointId}`. A missing row means
 * Not Started — rows are created lazily on the first status change so adding
 * a player or checkpoint never requires backfilling the matrix.
 */
export interface PlayerCheckpoint {
  id: string
  playerId: string
  checkpointId: string
  status: CheckStatus
  tempoPassed: number | null
  lastUpdated: number
  updatedAt?: number
}

export const pcId = (playerId: string, checkpointId: string) => `${playerId}|${checkpointId}`

/** Status changes are never destructive — every change appends one of these. */
export interface StatusChange {
  id: string
  playerId: string
  checkpointId: string
  from: CheckStatus
  to: CheckStatus
  tempoPassed: number | null
  /** Rehearsal tempo running when the change was logged. */
  bpm: number | null
  at: number
  updatedAt?: number
}

export interface Note {
  id: string
  /** null → a note about the whole section. */
  playerId: string | null
  body: string
  tag: NoteTag
  checkpointId: string | null
  /** Rehearsal tempo running when the note was taken. */
  bpm: number | null
  createdAt: number
  resolved: boolean
  resolvedAt: number | null
  updatedAt?: number
}

export interface Session {
  id: string
  /** Day of the rehearsal, stored at local noon so timezone math never shifts it. */
  date: number
  durationMinutes: number | null
  focus: string
  tempoAchieved: number | null
  whatWorked: string
  nextTime: string
  createdAt: number
  updatedAt?: number
}

export type SectionName = ReturnType<typeof instrumentGroup>

/**
 * A rankable skill — the comparison axes for the per-section forced ranking
 * ("who is weakest at marching in the snares"). Seeded from the note-tag
 * vocabulary so notes and rankings speak the same language.
 */
export interface Skill {
  id: string
  name: string
  sortOrder: number
  /** Retired skills keep their ranking history but leave the matrix. */
  active: boolean
  createdAt: number
  updatedAt?: number
}

/**
 * One row per skill × section: every active player in that section holds
 * exactly one slot, strongest first. No ties by design — a forced ranking is
 * what turns "he's kind of weak" into "he is 3rd of 3".
 */
export interface SkillRank {
  /** `${skillId}|${section}` */
  id: string
  skillId: string
  section: SectionName
  /** playerIds, rank 1 (strongest) first. */
  order: string[]
  updatedAt?: number
}

export const skillRankId = (skillId: string, section: SectionName) => `${skillId}|${section}`

const SEED_SKILLS = ['Technique', 'Timing', 'Marching', 'Sound Quality', 'Attitude/Effort']

/** Deterministic ids so seeds line up across devices (same trick as checkpoints). */
export function seedSkills(now: number): Skill[] {
  return SEED_SKILLS.map((name, i) => ({
    id: `sk-${String(i + 1).padStart(2, '0')}`,
    name,
    sortOrder: (i + 1) * 10,
    active: true,
    createdAt: now,
  }))
}

export interface RecordingMeta {
  id: string
  /** null → section-wide recording (the usual case). */
  playerId: string | null
  sessionId: string | null
  label: string
  isBaseline: boolean
  mime: string
  size: number
  createdAt: number
}

export interface RecordingBlob {
  id: string
  blob: Blob
}

// --- phases -----------------------------------------------------------------

export const PHASE_NAMES: Record<number, string> = {
  1: 'The Stroke',
  2: 'Time and Space',
  3: 'Two Heights',
  4: 'Diddles, Rolls, Flams',
  5: 'Marching Integration Ladder',
  6: 'Ensemble',
}

// --- seed checkpoints ---------------------------------------------------------

interface SeedRow {
  phase: 1 | 2 | 3 | 4 | 5 | 6
  name: string
  gate?: boolean
}

const SEED: SeedRow[] = [
  // Phase 1 — The Stroke
  { phase: 1, name: 'Grip and fulcrum, back fingers relaxed on the stick' },
  { phase: 1, name: 'Free stroke at full height, no stopping points in the stroke path' },
  { phase: 1, name: 'Free stroke at tap height (3"), wrist-led, real sound' },
  { phase: 1, name: 'Hand-to-hand sound match (left not quieter than right)' },
  { phase: 1, name: 'Consistent playing zone' },
  { phase: 1, name: '8-on-a-hand, full height, relaxed, at 120 BPM', gate: true },
  // Phase 2 — Time and Space
  { phase: 2, name: 'Can clap and count a figure correctly before playing it' },
  { phase: 2, name: 'Check pattern + 3 named variations, alone, at 75 BPM' },
  { phase: 2, name: '4–2–1 framework without internal clock failing' },
  { phase: 2, name: 'Locks to bass subdivision on syncopated figures' },
  { phase: 2, name: 'Holds time individually, unsupported by the section', gate: true },
  // Phase 3 — Two Heights
  { phase: 3, name: 'Downstroke (high→low) without added tension' },
  { phase: 3, name: 'Upstroke (low→high) with an actual lift' },
  { phase: 3, name: 'Taps with real sound quality' },
  { phase: 3, name: 'Accents matched hand to hand' },
  { phase: 3, name: 'Subito dynamic changes, both directions' },
  { phase: 3, name: 'Accent-tap patterns clean at 100 BPM', gate: true },
  // Phase 4 — Diddles, Rolls, Flams
  { phase: 4, name: 'RH diddles as free strokes (wrist sets up, fingers deliver)' },
  { phase: 4, name: 'LH diddles' },
  { phase: 4, name: 'Alternating diddles, no tempo sag inside the roll' },
  { phase: 4, name: 'Flams, right-hand lead — grace note low and close' },
  { phase: 4, name: 'Flams, left-hand lead' },
  { phase: 4, name: 'Paradiddles' },
  { phase: 4, name: 'Clean, matched, in time — speed is explicitly not the standard', gate: true },
  // Phase 5 — Marching Integration Ladder
  { phase: 5, name: 'Rung 1: Stationary, feet still' },
  { phase: 5, name: 'Rung 2: Marking time' },
  { phase: 5, name: 'Rung 3: Forward/backward straight line, warm-up material' },
  { phase: 5, name: 'Rung 4: Lateral motion and step-size changes' },
  { phase: 5, name: 'Rung 5: Envelope drill — direction changes, cadence not eighth notes' },
  { phase: 5, name: 'Rung 6: Envelope drill with show music' },
  { phase: 5, name: 'Rung 7: Actual drill' },
  {
    phase: 5,
    name: 'Sounds the same moving through a direction change as it does standing still',
    gate: true,
  },
  // Phase 6 — Ensemble
  { phase: 6, name: 'Plays a chunk clean with voices added one at a time' },
  { phase: 6, name: 'Plays with the section rather than near it' },
  { phase: 6, name: 'Holds up at performance distance/spread' },
]

/** Deterministic ids so re-imports and seeds line up across devices. */
export function seedCheckpoints(now: number): Checkpoint[] {
  return SEED.map((row, i) => ({
    id: `cp-${row.phase}-${String(i + 1).padStart(2, '0')}`,
    name: row.name,
    phase: row.phase,
    description: '',
    gateFlag: !!row.gate,
    sortOrder: (i + 1) * 10,
    active: true,
    createdAt: now,
  }))
}

// --- persistence -------------------------------------------------------------

/** Stores that participate in multi-device sync (recordings stay local — audio is heavy). */
export const SYNCED_STORES = [
  'dlPlayers',
  'dlCheckpoints',
  'dlPlayerCheckpoints',
  'dlHistory',
  'dlNotes',
  'dlSessions',
  'dlSkills',
  'dlSkillRanks',
] as const
export type SyncedStore = (typeof SYNCED_STORES)[number]

/** A deleted row leaves this marker behind so the deletion propagates to other devices. */
export interface Tombstone {
  /** `${store}:${rowId}` so one store can hold markers for every synced store. */
  id: string
  store: SyncedStore
  rowId: string
  updatedAt: number
}

/** Best-effort modification time for rows written before sync existed. */
export function effUpdated(row: Record<string, unknown>): number {
  for (const k of ['updatedAt', 'lastUpdated', 'resolvedAt', 'createdAt', 'at', 'date']) {
    const v = row[k]
    if (typeof v === 'number' && v > 0) return v
  }
  return 1
}

/** Fired after every local write so the sync engine can schedule a push. */
export const CHANGED_EVENT = 'chopbuilder:changed'
const signalChange = () => {
  try {
    window.dispatchEvent(new Event(CHANGED_EVENT))
  } catch {
    /* non-window context */
  }
}

async function putSynced<S extends SyncedStore>(
  store: S,
  row: { id: string; updatedAt?: number },
) {
  await (await db()).put(store, { ...row, updatedAt: Date.now() } as never)
  signalChange()
}

async function deleteSynced(store: SyncedStore, rowId: string) {
  const d = await db()
  const tx = d.transaction([store, 'tombstones'], 'readwrite')
  void tx.objectStore(store).delete(rowId)
  void tx
    .objectStore('tombstones')
    .put({ id: `${store}:${rowId}`, store, rowId, updatedAt: Date.now() })
  await tx.done
  signalChange()
}

export interface DrumlineData {
  players: Player[]
  checkpoints: Checkpoint[]
  playerCheckpoints: PlayerCheckpoint[]
  history: StatusChange[]
  notes: Note[]
  sessions: Session[]
  recordings: RecordingMeta[]
  skills: Skill[]
  skillRanks: SkillRank[]
}

export async function loadAll(): Promise<DrumlineData> {
  const d = await db()
  const [players, checkpoints, playerCheckpoints, history, notes, sessions, recordings, skills, skillRanks] =
    await Promise.all([
      d.getAll('dlPlayers'),
      d.getAll('dlCheckpoints'),
      d.getAll('dlPlayerCheckpoints'),
      d.getAll('dlHistory'),
      d.getAll('dlNotes'),
      d.getAll('dlSessions'),
      d.getAll('dlRecordings'),
      d.getAll('dlSkills'),
      d.getAll('dlSkillRanks'),
    ])
  // First run: seed the technique standards. Deactivating rows keeps them in
  // the store, so an empty store can only mean "never seeded". Seeds carry
  // updatedAt: 1 so a fresh device's defaults can never out-vote a real edit
  // (rename/reorder/retire) coming in from sync.
  let cps = checkpoints
  if (cps.length === 0) {
    cps = seedCheckpoints(Date.now()).map((c) => ({ ...c, updatedAt: 1 }))
    const tx = d.transaction('dlCheckpoints', 'readwrite')
    for (const c of cps) void tx.store.put(c)
    await tx.done
  }
  let sks = skills
  if (sks.length === 0) {
    sks = seedSkills(Date.now()).map((s) => ({ ...s, updatedAt: 1 }))
    const tx = d.transaction('dlSkills', 'readwrite')
    for (const s of sks) void tx.store.put(s)
    await tx.done
  }
  return {
    players,
    checkpoints: cps,
    playerCheckpoints,
    history,
    notes,
    sessions,
    recordings,
    skills: sks,
    skillRanks,
  }
}

export async function putPlayer(p: Player) {
  await putSynced('dlPlayers', p)
}
export async function putCheckpoint(c: Checkpoint) {
  await putSynced('dlCheckpoints', c)
}
export async function putCheckpoints(list: Checkpoint[]) {
  const d = await db()
  const now = Date.now()
  const tx = d.transaction('dlCheckpoints', 'readwrite')
  for (const c of list) void tx.store.put({ ...c, updatedAt: now })
  await tx.done
  signalChange()
}
export async function putPlayerCheckpoint(pc: PlayerCheckpoint) {
  await putSynced('dlPlayerCheckpoints', pc)
}
export async function putHistory(h: StatusChange) {
  await putSynced('dlHistory', h)
}
export async function deleteHistory(id: string) {
  await deleteSynced('dlHistory', id)
}
export async function putNote(n: Note) {
  await putSynced('dlNotes', n)
}
export async function deleteNote(id: string) {
  await deleteSynced('dlNotes', id)
}
export async function putSession(s: Session) {
  await putSynced('dlSessions', s)
}
export async function deleteSession(id: string) {
  await deleteSynced('dlSessions', id)
}
export async function putSkill(s: Skill) {
  await putSynced('dlSkills', s)
}
export async function putSkillRank(r: SkillRank) {
  await putSynced('dlSkillRanks', r)
}

export async function putRecording(meta: RecordingMeta, blob: Blob) {
  const d = await db()
  const tx = d.transaction(['dlRecordings', 'dlRecordingBlobs'], 'readwrite')
  void tx.objectStore('dlRecordings').put(meta)
  void tx.objectStore('dlRecordingBlobs').put({ id: meta.id, blob })
  await tx.done
}
export async function putRecordingMeta(meta: RecordingMeta) {
  await (await db()).put('dlRecordings', meta)
}
export async function getRecordingBlob(id: string): Promise<Blob | null> {
  const rec = await (await db()).get('dlRecordingBlobs', id)
  return rec?.blob ?? null
}
export async function deleteRecording(id: string) {
  const d = await db()
  const tx = d.transaction(['dlRecordings', 'dlRecordingBlobs'], 'readwrite')
  void tx.objectStore('dlRecordings').delete(id)
  void tx.objectStore('dlRecordingBlobs').delete(id)
  await tx.done
}

// --- backup ------------------------------------------------------------------

export interface BackupFile {
  app: 'chopbuilder'
  kind: 'backup'
  version: 3
  exportedAt: number
  data: DrumlineData & { exercises: unknown[]; prs: unknown[] }
  /** Present only in a full backup — recordings encoded as base64. */
  media?: { id: string; mime: string; dataB64: string }[]
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(r.error)
    r.onload = () => {
      // result looks like "data:<mime>;base64,<payload>"
      const s = r.result as string
      resolve(s.slice(s.indexOf(',') + 1))
    }
    r.readAsDataURL(blob)
  })
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime || 'application/octet-stream' })
}

export async function exportBackup(includeMedia: boolean): Promise<BackupFile> {
  const d = await db()
  const [data, exercises, prs] = await Promise.all([
    loadAll(),
    d.getAll('exercises'),
    d.getAll('prs'),
  ])
  const out: BackupFile = {
    app: 'chopbuilder',
    kind: 'backup',
    version: 3,
    exportedAt: Date.now(),
    data: { ...data, exercises, prs },
  }
  if (includeMedia) {
    const media: NonNullable<BackupFile['media']> = []
    for (const meta of data.recordings) {
      const blob = await getRecordingBlob(meta.id)
      if (blob) media.push({ id: meta.id, mime: meta.mime, dataB64: await blobToBase64(blob) })
    }
    out.media = media
  }
  return out
}

/** Replaces every tracker store (and PR data) with the backup's contents. */
export async function importBackup(file: BackupFile) {
  const d = await db()
  const stores = [
    'dlPlayers',
    'dlCheckpoints',
    'dlPlayerCheckpoints',
    'dlHistory',
    'dlNotes',
    'dlSessions',
    'dlSkills',
    'dlSkillRanks',
    'dlRecordings',
    'dlRecordingBlobs',
    'tombstones',
    'exercises',
    'prs',
  ] as const
  const tx = d.transaction(stores, 'readwrite')
  for (const s of stores) void tx.objectStore(s).clear()
  for (const p of file.data.players ?? []) void tx.objectStore('dlPlayers').put(p)
  for (const c of file.data.checkpoints ?? []) void tx.objectStore('dlCheckpoints').put(c)
  for (const pc of file.data.playerCheckpoints ?? [])
    void tx.objectStore('dlPlayerCheckpoints').put(pc)
  for (const h of file.data.history ?? []) void tx.objectStore('dlHistory').put(h)
  for (const n of file.data.notes ?? []) void tx.objectStore('dlNotes').put(n)
  for (const s of file.data.sessions ?? []) void tx.objectStore('dlSessions').put(s)
  for (const sk of file.data.skills ?? []) void tx.objectStore('dlSkills').put(sk)
  for (const r of file.data.skillRanks ?? []) void tx.objectStore('dlSkillRanks').put(r)
  const mediaIds = new Set((file.media ?? []).map((m) => m.id))
  for (const r of file.data.recordings ?? []) {
    // A data-only backup can't restore the audio itself; keep only rows whose
    // media came along, so the list never shows unplayable ghosts.
    if (mediaIds.has(r.id)) void tx.objectStore('dlRecordings').put(r)
  }
  for (const e of file.data.exercises ?? []) void tx.objectStore('exercises').put(e as never)
  for (const p of file.data.prs ?? []) void tx.objectStore('prs').put(p as never)
  await tx.done
  for (const m of file.media ?? []) {
    await (await db()).put('dlRecordingBlobs', { id: m.id, blob: base64ToBlob(m.dataB64, m.mime) })
  }
}

export { uid }
