import { useMemo, useState } from 'react'
import { playerName, type Session } from '../db/drumline'
import {
  fmtDayYear,
  fmtTime,
  localNoon,
  notesForSession,
  orderedCheckpoints,
  statusOf,
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

function toDateInput(ts: number): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function fromDateInput(v: string): number {
  const [y, m, d] = v.split('-').map(Number)
  return localNoon(new Date(y, (m ?? 1) - 1, d ?? 1))
}

function SessionFormSheet({ initial, onClose }: { initial?: Session; onClose: () => void }) {
  const sessions = useDrumline((s) => s.sessions)
  const players = useDrumline((s) => s.players)
  const checkpoints = useDrumline((s) => s.checkpoints)
  const pcs = useDrumline((s) => s.pcs)
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

  const [date, setDate] = useState(toDateInput(initial?.date ?? Date.now()))
  const [duration, setDuration] = useState(initial?.durationMinutes ? String(initial.durationMinutes) : '')
  const [focus, setFocus] = useState(initial?.focus ?? suggestion)
  const [tempo, setTempo] = useState(initial?.tempoAchieved ? String(initial.tempoAchieved) : '')
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
