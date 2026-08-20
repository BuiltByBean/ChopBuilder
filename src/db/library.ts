import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Exercise, PREntry } from './records'
import type {
  Checkpoint,
  Note,
  Player,
  PlayerCheckpoint,
  RecordingBlob,
  RecordingMeta,
  Session,
  StatusChange,
  Tombstone,
} from './drumline'

export type FileKind = 'pdf' | 'image' | 'audio' | 'other'

export interface Folder {
  id: string
  name: string
  /** null means the folder sits at the library root. */
  parentId: string | null
  createdAt: number
}

export interface ScoreFile {
  id: string
  folderId: string | null
  name: string
  kind: FileKind
  mime: string
  size: number
  blob: Blob
  createdAt: number
  /** Filled in after the PDF is first opened. */
  pageCount?: number
  /** Tempo this piece was last practised at, restored on reopen. */
  practiceBpm?: number
  /** Last time the piece was opened in the practice view. */
  lastPracticedAt?: number
}

interface ChopDB extends DBSchema {
  folders: {
    key: string
    value: Folder
    indexes: { byParent: string }
  }
  files: {
    key: string
    value: ScoreFile
    indexes: { byFolder: string }
  }
  exercises: {
    key: string
    value: Exercise
  }
  prs: {
    key: string
    value: PREntry
    indexes: { byExercise: string }
  }
  dlPlayers: {
    key: string
    value: Player
  }
  dlCheckpoints: {
    key: string
    value: Checkpoint
  }
  dlPlayerCheckpoints: {
    key: string
    value: PlayerCheckpoint
  }
  dlHistory: {
    key: string
    value: StatusChange
  }
  dlNotes: {
    key: string
    value: Note
  }
  dlSessions: {
    key: string
    value: Session
  }
  dlRecordings: {
    key: string
    value: RecordingMeta
  }
  dlRecordingBlobs: {
    key: string
    value: RecordingBlob
  }
  tombstones: {
    key: string
    value: Tombstone
  }
  /** Engine bookkeeping (sync watermarks). Lives HERE, not localStorage, so a
   *  wiped database also wipes the "already synced" markers and the next sync
   *  re-pulls everything instead of believing an empty device is current. */
  meta: {
    key: string
    value: { key: string; value: unknown }
  }
}

let dbp: Promise<IDBPDatabase<ChopDB>> | null = null

/** Single shared connection — records.ts uses it too. */
export const db = () => {
  if (!dbp) {
    dbp = openDB<ChopDB>('chopbuilder', 5, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          const folders = d.createObjectStore('folders', { keyPath: 'id' })
          // parentId is nullable, so root folders are stored with '' in the index.
          folders.createIndex('byParent', 'parentId')
          const files = d.createObjectStore('files', { keyPath: 'id' })
          files.createIndex('byFolder', 'folderId')
        }
        if (oldVersion < 2) {
          d.createObjectStore('exercises', { keyPath: 'id' })
          const prs = d.createObjectStore('prs', { keyPath: 'id' })
          prs.createIndex('byExercise', 'exerciseId')
        }
        if (oldVersion < 3) {
          // Drumline progress tracker. Checkpoints are seeded on first load
          // (see drumline.ts) rather than here, keeping the upgrade pure DDL.
          d.createObjectStore('dlPlayers', { keyPath: 'id' })
          d.createObjectStore('dlCheckpoints', { keyPath: 'id' })
          d.createObjectStore('dlPlayerCheckpoints', { keyPath: 'id' })
          d.createObjectStore('dlHistory', { keyPath: 'id' })
          d.createObjectStore('dlNotes', { keyPath: 'id' })
          d.createObjectStore('dlSessions', { keyPath: 'id' })
          d.createObjectStore('dlRecordings', { keyPath: 'id' })
          d.createObjectStore('dlRecordingBlobs', { keyPath: 'id' })
        }
        if (oldVersion < 4) {
          // Deletion markers so removals propagate through multi-device sync.
          d.createObjectStore('tombstones', { keyPath: 'id' })
        }
        if (oldVersion < 5) {
          d.createObjectStore('meta', { keyPath: 'key' })
        }
      },
      // A newer build in another tab/window wants to upgrade the schema and
      // this stale page is the blocker — reload so it comes back on the new
      // code (and the new version) instead of deadlocking the other context.
      blocking() {
        location.reload()
      },
      // The mirror case: an old page elsewhere holds the database open so OUR
      // upgrade can't run. Nothing to do but surface it — Diagnostics shows
      // the flag, and the app looks "empty" until that other page closes.
      blocked() {
        ;(window as { __dbBlocked?: boolean }).__dbBlocked = true
      },
    })
  }
  return dbp
}

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

export function kindOf(file: { type: string; name: string }): FileKind {
  const mime = file.type.toLowerCase()
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'].includes(ext))
    return 'image'
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'aiff'].includes(ext))
    return 'audio'
  return 'other'
}

// --- folders ---------------------------------------------------------------

export async function listFolders(): Promise<Folder[]> {
  return (await db()).getAll('folders')
}

export async function createFolder(name: string, parentId: string | null = null) {
  const folder: Folder = {
    id: uid(),
    name: name.trim() || 'Untitled folder',
    parentId,
    createdAt: Date.now(),
  }
  await (await db()).put('folders', folder)
  return folder
}

export async function renameFolder(id: string, name: string) {
  const d = await db()
  const f = await d.get('folders', id)
  if (!f) return
  await d.put('folders', { ...f, name: name.trim() || f.name })
}

export async function moveFolder(id: string, parentId: string | null) {
  const d = await db()
  const f = await d.get('folders', id)
  if (!f || id === parentId) return
  await d.put('folders', { ...f, parentId })
}

/** Removes a folder plus every descendant folder and all their files. */
export async function deleteFolderDeep(id: string) {
  const d = await db()
  const all = await d.getAll('folders')
  const doomed = new Set<string>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const f of all) {
      if (f.parentId && doomed.has(f.parentId) && !doomed.has(f.id)) {
        doomed.add(f.id)
        grew = true
      }
    }
  }
  const files = await d.getAll('files')
  const tx = d.transaction(['folders', 'files'], 'readwrite')
  for (const f of files) {
    if (f.folderId && doomed.has(f.folderId)) await tx.objectStore('files').delete(f.id)
  }
  for (const fid of doomed) await tx.objectStore('folders').delete(fid)
  await tx.done
}

// --- files -----------------------------------------------------------------

export async function listFiles(): Promise<ScoreFile[]> {
  return (await db()).getAll('files')
}

export async function addFile(file: File, folderId: string | null) {
  const rec: ScoreFile = {
    id: uid(),
    folderId,
    name: file.name,
    kind: kindOf(file),
    mime: file.type || 'application/octet-stream',
    size: file.size,
    blob: file,
    createdAt: Date.now(),
  }
  await (await db()).put('files', rec)
  return rec
}

export async function getFile(id: string) {
  return (await db()).get('files', id)
}

export async function renameFile(id: string, name: string) {
  const d = await db()
  const f = await d.get('files', id)
  if (!f) return
  await d.put('files', { ...f, name: name.trim() || f.name })
}

export async function moveFile(id: string, folderId: string | null) {
  const d = await db()
  const f = await d.get('files', id)
  if (!f) return
  await d.put('files', { ...f, folderId })
}

export async function setPageCount(id: string, pageCount: number) {
  const d = await db()
  const f = await d.get('files', id)
  if (!f || f.pageCount === pageCount) return
  await d.put('files', { ...f, pageCount })
}

/** Stamp a practice session: when it happened and the tempo it ran at. */
export async function setPracticeState(id: string, practiceBpm: number) {
  const d = await db()
  const f = await d.get('files', id)
  if (!f) return
  await d.put('files', { ...f, practiceBpm, lastPracticedAt: Date.now() })
}

export async function deleteFile(id: string) {
  await (await db()).delete('files', id)
}

// --- housekeeping ----------------------------------------------------------

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null
  const { usage = 0, quota = 0 } = await navigator.storage.estimate()
  return { usage, quota }
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}
