import { db, uid } from './library'

export interface Exercise {
  id: string
  name: string
  createdAt: number
}

/** One logged tempo for an exercise — the history of these is the PR trail. */
export interface PREntry {
  id: string
  exerciseId: string
  bpm: number
  /** Day the tempo was hit, stored at local noon so timezone math never shifts the date. */
  date: number
  note?: string
  createdAt: number
}

// --- exercises ---------------------------------------------------------------

export async function listExercises(): Promise<Exercise[]> {
  return (await db()).getAll('exercises')
}

export async function createExercise(name: string): Promise<Exercise> {
  const ex: Exercise = { id: uid(), name: name.trim() || 'Untitled exercise', createdAt: Date.now() }
  await (await db()).put('exercises', ex)
  return ex
}

/** Batch insert for the starter pack; skips names that already exist. */
export async function createExercises(names: string[]): Promise<Exercise[]> {
  const d = await db()
  const have = new Set((await d.getAll('exercises')).map((e) => e.name.toLowerCase()))
  const fresh = names.filter((n) => !have.has(n.toLowerCase()))
  const now = Date.now()
  const added = fresh.map<Exercise>((name, i) => ({ id: uid(), name, createdAt: now + i }))
  const tx = d.transaction('exercises', 'readwrite')
  for (const ex of added) void tx.store.put(ex)
  await tx.done
  return added
}

export async function renameExercise(id: string, name: string) {
  const d = await db()
  const ex = await d.get('exercises', id)
  if (!ex) return
  await d.put('exercises', { ...ex, name: name.trim() || ex.name })
}

/** Removes an exercise together with every PR logged against it. */
export async function deleteExerciseDeep(id: string) {
  const d = await db()
  const doomed = await d.getAllFromIndex('prs', 'byExercise', id)
  const tx = d.transaction(['exercises', 'prs'], 'readwrite')
  for (const pr of doomed) void tx.objectStore('prs').delete(pr.id)
  void tx.objectStore('exercises').delete(id)
  await tx.done
}

// --- PR entries --------------------------------------------------------------

export async function listPRs(): Promise<PREntry[]> {
  return (await db()).getAll('prs')
}

export async function addPR(input: {
  exerciseId: string
  bpm: number
  date: number
  note?: string
}): Promise<PREntry> {
  const entry: PREntry = {
    id: uid(),
    exerciseId: input.exerciseId,
    bpm: Math.round(input.bpm),
    date: input.date,
    note: input.note?.trim() || undefined,
    createdAt: Date.now(),
  }
  await (await db()).put('prs', entry)
  return entry
}

export async function deletePR(id: string) {
  await (await db()).delete('prs', id)
}
