import { useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmModal, PromptModal } from '../components/Modal'
import { ChevronRight, Dots, Metro, Pencil, Plus, Trash, Trophy } from '../components/icons'
import { clampBpm } from '../audio/metronome'
import { useMetronome } from '../state/useMetronome'
import {
  annotateHistory,
  bestPR,
  historyFor,
  useRecords,
  type AnnotatedEntry,
} from '../state/useRecords'
import type { Exercise, PREntry } from '../db/records'

/** Classic chop builders to start from — renameable and deletable like any other. */
const STARTER_EXERCISES = [
  'Single Stroke Roll',
  'Double Stroke Roll',
  'Triple Stroke Roll',
  'Single Paradiddle',
  'Double Paradiddle',
  'Paradiddle-diddle',
  'Six Stroke Roll',
  'Flam Taps',
  'Swiss Army Triplets',
  'Inverted Doubles',
]

const DAY = 24 * 60 * 60 * 1000

const todayISO = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** "2026-08-19" → ms at local noon, so the stored day never shifts across timezones. */
const isoToMs = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12).getTime()
}

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

type Dialog =
  | { kind: 'add-exercise' }
  | { kind: 'rename-exercise'; id: string; name: string }
  | { kind: 'delete-exercise'; id: string; name: string; count: number }
  | { kind: 'log-pr'; exercise: Exercise }
  | { kind: 'delete-pr'; id: string; label: string }
  | null

export function RecordsPage() {
  const rec = useRecords()
  const { exercises, prs, loaded } = rec
  const { setBpm } = useMetronome()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!loaded) void rec.load()
  }, [loaded, rec.load])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(id)
  }, [toast])

  const sorted = useMemo(
    () =>
      [...exercises].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [exercises],
  )
  const recent30 = useMemo(
    () => prs.filter((p) => p.date >= Date.now() - 30 * DAY).length,
    [prs],
  )

  const practiceAt = (bpm: number) => {
    const t = clampBpm(bpm)
    setBpm(t)
    setToast(t === bpm ? `Metronome set to ${t} BPM` : `Metronome set to ${t} BPM (its max)`)
  }

  return (
    <div className="records">
      <div className="records-head">
        <div>
          <h2>Personal records</h2>
          <p className="records-sub">
            Your top tempo for each exercise — log it every time you push the number higher.
          </p>
        </div>
        <span style={{ flex: 1 }} />
        {exercises.length > 0 && (
          <button className="btn sm primary" onClick={() => setDialog({ kind: 'add-exercise' })}>
            <Plus size={14} /> Add exercise
          </button>
        )}
      </div>

      {exercises.length > 0 && (
        <div className="rec-stats">
          <span>
            <b>{exercises.length}</b> exercise{exercises.length === 1 ? '' : 's'}
          </span>
          <span>
            <b>{prs.length}</b> PR{prs.length === 1 ? '' : 's'} logged
          </span>
          <span>
            <b>{recent30}</b> in the last 30 days
          </span>
        </div>
      )}

      {loaded && exercises.length === 0 ? (
        <div className="empty">
          <Trophy size={38} />
          <h3>Track your top tempos</h3>
          <p>
            Keep a record for each exercise — singles, doubles, paradiddles — and log the date
            every time a new PR lands. The metronome tempo carries over automatically.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn primary"
              onClick={async () => {
                const n = await rec.addExercises(STARTER_EXERCISES)
                setToast(`Added ${n} starter exercises`)
              }}
            >
              <Trophy size={15} /> Add starter exercises
            </button>
            <button className="btn" onClick={() => setDialog({ kind: 'add-exercise' })}>
              <Plus size={15} /> Add your own
            </button>
          </div>
        </div>
      ) : (
        <div className="rec-list">
          {sorted.map((ex) => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              history={historyFor(prs, ex.id)}
              expanded={!!expanded[ex.id]}
              onToggle={() => setExpanded((s) => ({ ...s, [ex.id]: !s[ex.id] }))}
              onLog={() => setDialog({ kind: 'log-pr', exercise: ex })}
              onRename={() => setDialog({ kind: 'rename-exercise', id: ex.id, name: ex.name })}
              onDelete={(count) =>
                setDialog({ kind: 'delete-exercise', id: ex.id, name: ex.name, count })
              }
              onDeleteEntry={(p) =>
                setDialog({ kind: 'delete-pr', id: p.id, label: `${p.bpm} BPM on ${fmtDate(p.date)}` })
              }
              onPractice={practiceAt}
            />
          ))}
        </div>
      )}

      {dialog?.kind === 'add-exercise' && (
        <PromptModal
          title="Add exercise"
          label="Exercise name"
          initial=""
          confirmText="Add"
          onCancel={() => setDialog(null)}
          onConfirm={async (name) => {
            await rec.addExercise(name)
            setDialog(null)
            setToast('Exercise added')
          }}
        />
      )}
      {dialog?.kind === 'rename-exercise' && (
        <PromptModal
          title="Rename exercise"
          label="Exercise name"
          initial={dialog.name}
          onCancel={() => setDialog(null)}
          onConfirm={async (name) => {
            await rec.renameExercise(dialog.id, name)
            setDialog(null)
          }}
        />
      )}
      {dialog?.kind === 'delete-exercise' && (
        <ConfirmModal
          title={`Delete "${dialog.name}"?`}
          body={
            dialog.count > 0
              ? `This also deletes its ${dialog.count} logged PR${dialog.count > 1 ? 's' : ''}. This can't be undone.`
              : "This can't be undone."
          }
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            await rec.removeExercise(dialog.id)
            setDialog(null)
            setToast('Exercise deleted')
          }}
        />
      )}
      {dialog?.kind === 'delete-pr' && (
        <ConfirmModal
          title="Delete this entry?"
          body={`${dialog.label} will be removed from the history.`}
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            await rec.removePR(dialog.id)
            setDialog(null)
            setToast('Entry deleted')
          }}
        />
      )}
      {dialog?.kind === 'log-pr' && (
        <LogPRModal
          exercise={dialog.exercise}
          best={bestPR(historyFor(prs, dialog.exercise.id))}
          onCancel={() => setDialog(null)}
          onConfirm={async (bpm, date, note) => {
            const prev = bestPR(historyFor(prs, dialog.exercise.id))
            await rec.logPR({ exerciseId: dialog.exercise.id, bpm, date, note })
            setDialog(null)
            setExpanded((s) => ({ ...s, [dialog.exercise.id]: true }))
            setToast(
              !prev
                ? `First PR: ${dialog.exercise.name} at ${bpm} BPM`
                : bpm > prev.bpm
                  ? `New PR: ${dialog.exercise.name} at ${bpm} BPM (+${bpm - prev.bpm})`
                  : `Logged ${bpm} BPM for ${dialog.exercise.name}`,
            )
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

// --- exercise card -----------------------------------------------------------

function ExerciseCard({
  exercise,
  history,
  expanded,
  onToggle,
  onLog,
  onRename,
  onDelete,
  onDeleteEntry,
  onPractice,
}: {
  exercise: Exercise
  history: PREntry[]
  expanded: boolean
  onToggle: () => void
  onLog: () => void
  onRename: () => void
  onDelete: (entryCount: number) => void
  onDeleteEntry: (p: PREntry) => void
  onPractice: (bpm: number) => void
}) {
  const best = bestPR(history)
  const annotated = useMemo(() => annotateHistory(history), [history])

  return (
    <div className={`rec-card${expanded ? ' open' : ''}`}>
      <div
        className="rec-row"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onToggle()
        }}
        aria-expanded={expanded}
        title={expanded ? 'Hide history' : 'Show history'}
      >
        <ChevronRight size={14} className="rec-caret" />
        <div className="rec-title">
          <div className="rec-name">{exercise.name}</div>
          <div className="rec-meta">
            {best
              ? `PR set ${fmtDate(best.date)} · ${history.length} entr${history.length === 1 ? 'y' : 'ies'}`
              : 'No PR yet — go set one'}
          </div>
        </div>
        <Sparkline history={history} />
        <div className="rec-bpm">
          {best ? best.bpm : '—'}
          <span>BPM</span>
        </div>
        <button
          className="btn sm primary"
          onClick={(e) => {
            e.stopPropagation()
            onLog()
          }}
        >
          <Trophy size={14} /> <span className="log-label">Log PR</span>
        </button>
        <RowMenu onRename={onRename} onDelete={() => onDelete(history.length)} />
      </div>

      {expanded && (
        <div className="rec-body">
          {history.length === 0 ? (
            <p className="rec-none">
              Nothing logged yet. Prove a tempo on the metronome, then hit <b>Log PR</b>.
            </p>
          ) : (
            <>
              <div className="rec-body-head">
                <h4 className="section-label">History</h4>
                <span style={{ flex: 1 }} />
                {best && (
                  <button className="btn sm" onClick={() => onPractice(best.bpm)}>
                    <Metro size={14} /> Practice at {best.bpm} BPM
                  </button>
                )}
              </div>
              <HistoryChart points={annotated} />
              <div className="rec-entries">
                {annotated
                  .slice()
                  .reverse()
                  .map(({ entry, wasRecord, gain }) => (
                    <div className="rec-entry" key={entry.id}>
                      <span className="rec-entry-date">{fmtDate(entry.date)}</span>
                      <span className="rec-entry-bpm">{entry.bpm} BPM</span>
                      {wasRecord && (
                        <span className="delta">{gain === null ? 'first' : `+${gain}`}</span>
                      )}
                      {entry.note && <span className="rec-entry-note">{entry.note}</span>}
                      <span style={{ flex: 1 }} />
                      <button
                        className="btn ghost icon xs"
                        title={`Set metronome to ${entry.bpm} BPM`}
                        onClick={() => onPractice(entry.bpm)}
                      >
                        <Metro size={14} />
                      </button>
                      <button
                        className="btn ghost icon xs danger"
                        title="Delete entry"
                        onClick={() => onDeleteEntry(entry)}
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function RowMenu({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  return (
    <div className="tile-menu rec-menu" onClick={(e) => e.stopPropagation()}>
      <button
        className="btn ghost icon"
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
      >
        <Dots size={15} />
      </button>
      {open && (
        <div className="menu">
          <button onClick={onRename}>
            <Pencil size={14} /> Rename
          </button>
          <button className="danger" onClick={onDelete}>
            <Trash size={14} /> Delete
          </button>
        </div>
      )}
    </div>
  )
}

// --- charts ------------------------------------------------------------------

/** Tiny trend line for the collapsed row — shape only, no axes. */
function Sparkline({ history }: { history: PREntry[] }) {
  const W = 96
  const H = 28
  const PAD = 3
  if (history.length < 2) return <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" />

  const bpms = history.map((p) => p.bpm)
  const lo = Math.min(...bpms)
  const hi = Math.max(...bpms)
  const span = Math.max(hi - lo, 1)
  const pts = bpms
    .map((b, i) => {
      const x = PAD + (i / (bpms.length - 1)) * (W - PAD * 2)
      const y = H - PAD - ((b - lo) / span) * (H - PAD * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline points={pts} />
    </svg>
  )
}

/** Full history: BPM over time, with the entries that set a new record filled in. */
function HistoryChart({ points }: { points: AnnotatedEntry[] }) {
  const W = 640
  const H = 180
  const L = 46
  const R = 16
  const T = 14
  const B = 26

  const { pts, grid, xLabels } = useMemo(() => {
    // Same-day entries share a timestamp; a tiny per-index nudge keeps dots apart.
    const times = points.map((p, i) => p.entry.date + i)
    let x0 = times[0]
    let x1 = times[times.length - 1]
    if (x1 - x0 < DAY) {
      x0 -= 3 * DAY
      x1 += 3 * DAY
    }

    const bpms = points.map((p) => p.entry.bpm)
    let lo = Math.floor((Math.min(...bpms) - 4) / 10) * 10
    let hi = Math.ceil((Math.max(...bpms) + 4) / 10) * 10
    if (hi - lo < 20) {
      lo -= 5
      hi += 5
    }
    lo = Math.max(0, lo)

    let step = 100
    for (const s of [5, 10, 20, 25, 50, 100]) {
      if ((hi - lo) / s <= 5) {
        step = s
        break
      }
    }

    const X = (t: number) => L + ((t - x0) / (x1 - x0)) * (W - L - R)
    const Y = (b: number) => H - B - ((b - lo) / (hi - lo)) * (H - T - B)

    const pts = points.map((p, i) => ({
      x: X(times[i]),
      y: Y(p.entry.bpm),
      wasRecord: p.wasRecord,
      entry: p.entry,
    }))

    const grid: { y: number; label: number }[] = []
    for (let b = lo; b <= hi; b += step) grid.push({ y: Y(b), label: b })

    const first = points[0].entry.date
    const last = points[points.length - 1].entry.date
    const xLabels =
      first === last
        ? [{ x: (L + W - R) / 2, anchor: 'middle' as const, text: fmtDate(first) }]
        : [
            { x: L, anchor: 'start' as const, text: fmtDate(first) },
            { x: W - R, anchor: 'end' as const, text: fmtDate(last) },
          ]

    return { pts, grid, xLabels }
  }, [points])

  return (
    <svg
      className="rec-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="PR history over time"
    >
      {grid.map((g) => (
        <g key={g.label}>
          <line className="chart-grid" x1={L} y1={g.y} x2={W - R} y2={g.y} />
          <text className="chart-label" x={L - 8} y={g.y + 3} textAnchor="end">
            {g.label}
          </text>
        </g>
      ))}
      {xLabels.map((l) => (
        <text key={l.text + l.anchor} className="chart-label" x={l.x} y={H - 8} textAnchor={l.anchor}>
          {l.text}
        </text>
      ))}
      {pts.length > 1 && (
        <polyline
          className="chart-line"
          points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
        />
      )}
      {pts.map((p) => (
        <circle
          key={p.entry.id}
          className={`chart-dot${p.wasRecord ? ' record' : ''}`}
          cx={p.x}
          cy={p.y}
          r={4}
        >
          <title>
            {p.entry.bpm} BPM — {fmtDate(p.entry.date)}
            {p.entry.note ? ` — ${p.entry.note}` : ''}
          </title>
        </circle>
      ))}
    </svg>
  )
}

// --- log dialog ----------------------------------------------------------------

function LogPRModal({
  exercise,
  best,
  onCancel,
  onConfirm,
}: {
  exercise: Exercise
  best: PREntry | null
  onCancel: () => void
  onConfirm: (bpm: number, date: number, note: string) => void
}) {
  const { settings } = useMetronome()
  const [bpmStr, setBpmStr] = useState(String(settings.bpm))
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const bpm = Math.round(Number(bpmStr))
  const bpmOk = Number.isFinite(bpm) && bpm >= 10 && bpm <= 500
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && isoToMs(date) <= isoToMs(todayISO())
  const valid = bpmOk && dateOk

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-label={`Log PR for ${exercise.name}`}
    >
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) onConfirm(bpm, isoToMs(date), note)
        }}
      >
        <h3>Log PR — {exercise.name}</h3>
        <div className="field-row">
          <div className="field">
            <label htmlFor="pr-bpm">Tempo (BPM)</label>
            <input
              id="pr-bpm"
              ref={ref}
              className="input"
              type="number"
              min={10}
              max={500}
              value={bpmStr}
              onChange={(e) => setBpmStr(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="pr-date">Date</label>
            <input
              id="pr-date"
              className="input"
              type="date"
              max={todayISO()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <p className="pr-hint">
          {!bpmOk
            ? 'Enter a tempo between 10 and 500 BPM.'
            : !best
              ? 'Prefilled from the metronome — this will be the first entry.'
              : bpm > best.bpm
                ? `+${bpm - best.bpm} over your current ${best.bpm} BPM. New record.`
                : `Below your current PR of ${best.bpm} BPM — saves as a history point.`}
        </p>
        <div className="field">
          <label htmlFor="pr-note">Note (optional)</label>
          <input
            id="pr-note"
            className="input"
            placeholder="e.g. 2 minutes clean, matched grip"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!valid}>
            Save PR
          </button>
        </div>
      </form>
    </div>
  )
}
