import { useMemo, useState } from 'react'
import { playerName, type Session } from '../db/drumline'
import {
  absentIds,
  fmtDay,
  fmtDayYear,
  fmtTime,
  fromDateInput,
  isAbsentNote,
  notesForSession,
  orderedCheckpoints,
  sameLocalDay,
  statusOf,
  toDateInput,
  useDrumline,
} from '../state/useDrumline'
import { useToast } from '../state/useToast'
import { Sheet } from '../components/Sheet'
import { ConfirmModal } from '../components/Modal'
import { ChevronRight, Plus, Trash } from '../components/icons'

/**
 * Session Log — one card per rehearsal. The new-session form pre-fills focus
 * from where the line actually is, and pulls last time's "next time" forward
 * so Sunday planning starts half done.
 */
export function SessionsPage() {
  const sessions = useDrumline((s) => s.sessions)
  const notes = useDrumline((s) => s.notes)
  const [formFor, setFormFor] = useState<Session | 'new' | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const ordered = useMemo(
    () => [...sessions].sort((a, b) => b.date - a.date || b.createdAt - a.createdAt),
    [sessions],
  )

  return (
    <div className="dl-page">
      <div className="page-head">
        <h2 className="page-title">Sessions</h2>
        <button className="btn primary" onClick={() => setFormFor('new')}>
          <Plus size={15} /> New session
        </button>
      </div>

      {ordered.length === 0 && (
        <p className="quiet-empty">No rehearsals logged yet. Start one after tonight's block.</p>
      )}

      <div className="session-list">
        {ordered.map((s) => {
          const linked = notesForSession(notes, s)
          const open = openId === s.id
          return (
            <article key={s.id} className={`session-card card${open ? ' open' : ''}`}>
              <button
                className="session-row"
                onClick={() => setOpenId(open ? null : s.id)}
                aria-expanded={open}
              >
                <ChevronRight size={15} className="session-caret" />
                <div className="session-main">
                  <span className="session-date">{fmtDayYear(s.date)}</span>
                  <span className="session-focus">{s.focus || 'No focus recorded'}</span>
                </div>
                <span className="session-meta">
                  {s.tempoAchieved ? `${s.tempoAchieved} BPM` : ''}
                  {s.durationMinutes ? ` · ${s.durationMinutes}m` : ''}
                  {linked.length ? ` · ${linked.length} notes` : ''}
                </span>
              </button>
              {open && <SessionDetail session={s} onEdit={() => setFormFor(s)} />}
            </article>
          )
        })}
      </div>

      {formFor && (
        <SessionFormSheet
          initial={formFor === 'new' ? undefined : formFor}
          onClose={() => setFormFor(null)}
        />
      )}
    </div>
  )
}

function SessionDetail({ session, onEdit }: { session: Session; onEdit: () => void }) {
  const notes = useDrumline((s) => s.notes)
  const players = useDrumline((s) => s.players)
  const removeSession = useDrumline((s) => s.removeSession)
  const show = useToast((s) => s.show)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const linked = useMemo(
    () => notesForSession(notes, session).sort((a, b) => a.createdAt - b.createdAt),
    [notes, session],
  )
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])

  return (
    <div className="session-body">
      {session.whatWorked && (
        <p className="session-field">
          <b>What worked:</b> {session.whatWorked}
        </p>
      )}
      {session.nextTime && (
        <p className="session-field">
          <b>Next time:</b> {session.nextTime}
        </p>
      )}
      {linked.length > 0 && (
        <div className="session-notes">
          <h5 className="section-label">Notes from that day</h5>
          {linked.map((n) => {
            const p = n.playerId ? byId.get(n.playerId) : null
            return (
              <p key={n.id} className="session-note">
                <span className="session-note-who">
                  {fmtTime(n.createdAt)} · {p ? playerName(p) : 'Section'} · {n.tag}
                </span>
                {n.body}
              </p>
            )
          })}
        </div>
      )}
      <div className="session-actions">
        <button className="btn sm ghost" onClick={onEdit}>
          Edit
        </button>
        <button className="btn sm ghost danger" onClick={() => setConfirmDelete(true)}>
          <Trash size={14} /> Delete
        </button>
      </div>
      {confirmDelete && (
        <ConfirmModal
          title="Delete this session?"
          body="Notes taken that day are kept — only the rehearsal entry itself goes away."
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            removeSession(session.id)
            setConfirmDelete(false)
            show('Session deleted')
          }}
        />
      )}
    </div>
  )
}

/**
 * What actually happened on a day, from the records the app already keeps:
 * passes logged, notes taken (wins called out), who was absent. Shown at the
 * top of the session form so the write-up starts from facts, not memory.
 */
function DayRecap({ day }: { day: number }) {
  const history = useDrumline((s) => s.history)
  const notes = useDrumline((s) => s.notes)
  const players = useDrumline((s) => s.players)
  const checkpoints = useDrumline((s) => s.checkpoints)

  const recap = useMemo(() => {
    const byId = new Map(players.map((p) => [p.id, p]))
    const cpById = new Map(checkpoints.map((c) => [c.id, c]))
    const passes = history.filter((h) => h.to === 'passed' && sameLocalDay(h.at, day))
    const dayNotes = notes.filter((n) => sameLocalDay(n.createdAt, day) && !isAbsentNote(n))
    const wins = dayNotes.filter((n) => n.tag === 'Win')
    const absent = [...absentIds(notes, day)]
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
    // Which checkpoints moved, most passes first.
    const perCp = new Map<string, number>()
    for (const h of passes) perCp.set(h.checkpointId, (perCp.get(h.checkpointId) ?? 0) + 1)
    const moved = [...perCp.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, n]) => ({ name: cpById.get(id)?.name ?? 'Checkpoint', n }))
    const players_ = new Set(passes.map((h) => h.playerId)).size
    return { passes: passes.length, players: players_, notes: dayNotes.length, wins: wins.length, absent, moved }
  }, [history, notes, players, checkpoints, day])

  const empty = recap.passes === 0 && recap.notes === 0 && recap.absent.length === 0
  return (
    <section className="recap card">
      <h5 className="section-label">Recap · {fmtDay(day)}</h5>
      {empty ? (
        <p className="quiet-empty">Nothing logged that day yet.</p>
      ) : (
        <>
          <div className="recap-stats">
            <span>
              <b>{recap.passes}</b> pass{recap.passes === 1 ? '' : 'es'}
              {recap.players > 0 && ` · ${recap.players} player${recap.players === 1 ? '' : 's'}`}
            </span>
            <span>
              <b>{recap.notes}</b> note{recap.notes === 1 ? '' : 's'}
              {recap.wins > 0 && ` · ${recap.wins} win${recap.wins === 1 ? '' : 's'}`}
            </span>
            <span className={recap.absent.length ? 'warn' : ''}>
              <b>{recap.absent.length}</b> absent
            </span>
          </div>
          {recap.moved.length > 0 && (
            <ul className="recap-list">
              {recap.moved.map((m) => (
                <li key={m.name}>
                  <b>{m.n}</b> passed · {m.name}
                </li>
              ))}
            </ul>
          )}
          {recap.absent.length > 0 && (
            <p className="recap-absent">Absent: {recap.absent.map((p) => playerName(p)).join(', ')}</p>
          )}
        </>
      )}
    </section>
  )
}

function SessionFormSheet({ initial, onClose }: { initial?: Session; onClose: () => void }) {
  const sessions = useDrumline((s) => s.sessions)
  const players = useDrumline((s) => s.players)
  const checkpoints = useDrumline((s) => s.checkpoints)
  const pcs = useDrumline((s) => s.pcs)
  const history = useDrumline((s) => s.history)
  const addSession = useDrumline((s) => s.addSession)
  const updateSession = useDrumline((s) => s.updateSession)
  const show = useToast((s) => s.show)

  // Suggest tonight's focus from the line's lowest incomplete checkpoint.
  const suggestion = useMemo(() => {
    const active = players.filter((p) => p.active)
    if (!active.length) return ''
    for (const cp of orderedCheckpoints(checkpoints)) {
      const passed = active.filter((p) => statusOf(pcs, p.id, cp.id) === 'passed').length
      if (passed < active.length) {
        return `Phase ${cp.phase} — ${cp.name} (${passed}/${active.length} passed)`
      }
    }
    return ''
  }, [players, checkpoints, pcs])

  const lastNextTime = useMemo(() => {
    const prev = [...sessions].sort((a, b) => b.date - a.date)[0]
    return prev?.nextTime ?? ''
  }, [sessions])

  // A new session's tempo starts at the fastest clean tempo logged today.
  const todaysTop = useMemo(() => {
    let top = 0
    for (const h of history)
      if (h.to === 'passed' && h.tempoPassed && sameLocalDay(h.at, Date.now()))
        top = Math.max(top, h.tempoPassed)
    return top
  }, [history])

  const [date, setDate] = useState(toDateInput(initial?.date ?? Date.now()))
  const [duration, setDuration] = useState(initial?.durationMinutes ? String(initial.durationMinutes) : '')
  const [focus, setFocus] = useState(initial?.focus ?? suggestion)
  const [tempo, setTempo] = useState(
    initial?.tempoAchieved ? String(initial.tempoAchieved) : todaysTop ? String(todaysTop) : '',
  )
  const [whatWorked, setWhatWorked] = useState(initial?.whatWorked ?? '')
  const [nextTime, setNextTime] = useState(initial?.nextTime ?? lastNextTime)

  const num = (v: string) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null
  }

  return (
    <Sheet title={initial ? 'Edit session' : 'New session'} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          const payload = {
            date: fromDateInput(date),
            durationMinutes: num(duration),
            focus: focus.trim(),
            tempoAchieved: num(tempo),
            whatWorked: whatWorked.trim(),
            nextTime: nextTime.trim(),
          }
          if (initial) updateSession(initial.id, payload)
          else addSession(payload)
          show(initial ? 'Session updated' : 'Session logged')
          onClose()
        }}
      >
        {date && <DayRecap day={fromDateInput(date)} />}
        <div className="form-row">
          <div className="field grow">
            <label htmlFor="ss-date">Date</label>
            <input
              id="ss-date"
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="ss-dur">Minutes</label>
            <input
              id="ss-dur"
              className="input num-input"
              type="number"
              inputMode="numeric"
              min={0}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="ss-tempo">Tempo</label>
            <input
              id="ss-tempo"
              className="input num-input"
              type="number"
              inputMode="numeric"
              min={0}
              value={tempo}
              onChange={(e) => setTempo(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="ss-focus">Focus</label>
          <input
            id="ss-focus"
            className="input"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="Phase 3 accent-tap, envelope drill rung 5"
          />
        </div>
        <div className="field">
          <label htmlFor="ss-worked">What worked</label>
          <textarea
            id="ss-worked"
            className="input"
            rows={2}
            value={whatWorked}
            onChange={(e) => setWhatWorked(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ss-next">Next time</label>
          <textarea
            id="ss-next"
            className="input"
            rows={2}
            value={nextTime}
            onChange={(e) => setNextTime(e.target.value)}
          />
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn tall ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn tall primary">
            Save
          </button>
        </div>
      </form>
    </Sheet>
  )
}
