import { create } from 'zustand'
import * as api from '../db/records'
import type { Exercise, PREntry } from '../db/records'

interface RecordsState {
  exercises: Exercise[]
  prs: PREntry[]
  loaded: boolean

  load: () => Promise<void>
  addExercise: (name: string) => Promise<void>
  addExercises: (names: string[]) => Promise<number>
  renameExercise: (id: string, name: string) => Promise<void>
  removeExercise: (id: string) => Promise<void>

  logPR: (input: { exerciseId: string; bpm: number; date: number; note?: string }) => Promise<void>
  removePR: (id: string) => Promise<void>
}

export const useRecords = create<RecordsState>((set, get) => ({
  exercises: [],
  prs: [],
  loaded: false,

  load: async () => {
    const [exercises, prs] = await Promise.all([api.listExercises(), api.listPRs()])
    set({ exercises, prs, loaded: true })
  },

  addExercise: async (name) => {
    const ex = await api.createExercise(name)
    set((s) => ({ exercises: [...s.exercises, ex] }))
  },

  addExercises: async (names) => {
    const added = await api.createExercises(names)
    set((s) => ({ exercises: [...s.exercises, ...added] }))
    return added.length
  },

  renameExercise: async (id, name) => {
    await api.renameExercise(id, name)
    set((s) => ({
      exercises: s.exercises.map((e) => (e.id === id ? { ...e, name: name.trim() || e.name } : e)),
    }))
  },

  removeExercise: async (id) => {
    await api.deleteExerciseDeep(id)
    set((s) => ({
      exercises: s.exercises.filter((e) => e.id !== id),
      prs: s.prs.filter((p) => p.exerciseId !== id),
    }))
  },

  logPR: async (input) => {
    const entry = await api.addPR(input)
    set((s) => ({ prs: [...s.prs, entry] }))
  },

  removePR: async (id) => {
    await api.deletePR(id)
    set((s) => ({ prs: s.prs.filter((p) => p.id !== id) }))
  },
}))

/** Entries for one exercise, oldest first (same-day entries keep log order). */
export function historyFor(prs: PREntry[], exerciseId: string): PREntry[] {
  return prs
    .filter((p) => p.exerciseId === exerciseId)
    .sort((a, b) => a.date - b.date || a.createdAt - b.createdAt)
}

/** The standing record: highest BPM ever logged, most recent one on ties. */
export function bestPR(history: PREntry[]): PREntry | null {
  let best: PREntry | null = null
  for (const p of history) if (!best || p.bpm >= best.bpm) best = p
  return best
}

export interface AnnotatedEntry {
  entry: PREntry
  /** True when this entry beat everything logged before it — a new PR at the time. */
  wasRecord: boolean
  /** BPM gained over the previous record; null for the very first entry. */
  gain: number | null
}

/** Walks the history and marks where each new record landed. */
export function annotateHistory(history: PREntry[]): AnnotatedEntry[] {
  let max = -Infinity
  return history.map((entry) => {
    const wasRecord = entry.bpm > max
    const gain = wasRecord && max !== -Infinity ? entry.bpm - max : null
    if (wasRecord) max = entry.bpm
    return { entry, wasRecord, gain }
  })
}
