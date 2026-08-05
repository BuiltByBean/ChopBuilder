import { create } from 'zustand'
import * as api from '../db/library'
import type { Folder, ScoreFile } from '../db/library'

interface LibraryState {
  folders: Folder[]
  files: ScoreFile[]
  loaded: boolean
  /** null = the library root. */
  currentFolderId: string | null
  expanded: Record<string, boolean>

  load: () => Promise<void>
  openFolder: (id: string | null) => void
  toggleExpanded: (id: string) => void

  addFolder: (name: string, parentId?: string | null) => Promise<void>
  renameFolder: (id: string, name: string) => Promise<void>
  moveFolder: (id: string, parentId: string | null) => Promise<void>
  removeFolder: (id: string) => Promise<void>

  upload: (files: FileList | File[], folderId?: string | null) => Promise<number>
  renameFile: (id: string, name: string) => Promise<void>
  moveFile: (id: string, folderId: string | null) => Promise<void>
  removeFile: (id: string) => Promise<void>
  notePageCount: (id: string, pages: number) => Promise<void>
}

export const useLibrary = create<LibraryState>((set, get) => ({
  folders: [],
  files: [],
  loaded: false,
  currentFolderId: null,
  expanded: {},

  load: async () => {
    const [folders, files] = await Promise.all([api.listFolders(), api.listFiles()])
    set({ folders, files, loaded: true })
  },

  openFolder: (id) => set({ currentFolderId: id }),

  toggleExpanded: (id) =>
    set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } })),

  addFolder: async (name, parentId) => {
    const parent = parentId === undefined ? get().currentFolderId : parentId
    const folder = await api.createFolder(name, parent)
    set((s) => ({
      folders: [...s.folders, folder],
      expanded: parent ? { ...s.expanded, [parent]: true } : s.expanded,
    }))
  },

  renameFolder: async (id, name) => {
    await api.renameFolder(id, name)
    set((s) => ({
      folders: s.folders.map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f)),
    }))
  },

  moveFolder: async (id, parentId) => {
    // Refuse to drop a folder inside its own subtree.
    const { folders } = get()
    let walk: string | null = parentId
    while (walk) {
      if (walk === id) return
      walk = folders.find((f) => f.id === walk)?.parentId ?? null
    }
    await api.moveFolder(id, parentId)
    set((s) => ({ folders: s.folders.map((f) => (f.id === id ? { ...f, parentId } : f)) }))
  },

  removeFolder: async (id) => {
    await api.deleteFolderDeep(id)
    await get().load()
    if (get().currentFolderId === id) set({ currentFolderId: null })
  },

  upload: async (fileList, folderId) => {
    const target = folderId === undefined ? get().currentFolderId : folderId
    const arr = Array.from(fileList)
    const added: ScoreFile[] = []
    for (const f of arr) added.push(await api.addFile(f, target))
    set((s) => ({ files: [...s.files, ...added] }))
    return added.length
  },

  renameFile: async (id, name) => {
    await api.renameFile(id, name)
    set((s) => ({
      files: s.files.map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f)),
    }))
  },

  moveFile: async (id, folderId) => {
    await api.moveFile(id, folderId)
    set((s) => ({ files: s.files.map((f) => (f.id === id ? { ...f, folderId } : f)) }))
  },

  removeFile: async (id) => {
    await api.deleteFile(id)
    set((s) => ({ files: s.files.filter((f) => f.id !== id) }))
  },

  notePageCount: async (id, pages) => {
    await api.setPageCount(id, pages)
    set((s) => ({ files: s.files.map((f) => (f.id === id ? { ...f, pageCount: pages } : f)) }))
  },
}))

/** Root-relative path, e.g. "Snare Warmups / Rudiments". */
export function folderPath(folders: Folder[], id: string | null): Folder[] {
  const out: Folder[] = []
  let cur = id
  while (cur) {
    const f = folders.find((x) => x.id === cur)
    if (!f) break
    out.unshift(f)
    cur = f.parentId
  }
  return out
}

export function childFolders(folders: Folder[], parentId: string | null) {
  return folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

export function filesIn(files: ScoreFile[], folderId: string | null) {
  return files
    .filter((f) => f.folderId === folderId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

/** Total files inside a folder and everything beneath it. */
export function countDeep(folders: Folder[], files: ScoreFile[], id: string) {
  const ids = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const f of folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id)
        grew = true
      }
    }
  }
  return files.filter((f) => f.folderId && ids.has(f.folderId)).length
}
