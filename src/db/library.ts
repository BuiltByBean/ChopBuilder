import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

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
}

let dbp: Promise<IDBPDatabase<ChopDB>> | null = null

const db = () => {
  if (!dbp) {
    dbp = openDB<ChopDB>('chopbuilder', 1, {
      upgrade(d) {
        const folders = d.createObjectStore('folders', { keyPath: 'id' })
        // parentId is nullable, so root folders are stored with '' in the index.
        folders.createIndex('byParent', 'parentId')
        const files = d.createObjectStore('files', { keyPath: 'id' })
        files.createIndex('byFolder', 'folderId')
      },
    })
  }
  return dbp
}

const uid = () =>
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
