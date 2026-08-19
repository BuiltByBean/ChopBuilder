import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  PHASE_NAMES,
  STATUS_LABEL,
  nextStatus,
  playerName,
  type Checkpoint,
  type Note,
  type NoteTag,
  NOTE_TAGS,
} from '../db/drumline'
import {
  fmtDay,
  fmtTime,
  frontierOf,
  orderedCheckpoints,
  progressOf,
  statusOf,
  tempoOf,
  useDrumline,
} from '../state/useDrumline'
import { usePrefs } from '../state/usePrefs'
import { useToast } from '../state/useToast'
import { NoteSheet } from '../components/Drumline/NoteSheet'
import { PassSheet, ProgressBar, StatusChip, GateStar } from '../components/Drumline/common'
import { PlayerFormSheet } from '../components/Drumline/PlayerForm'
import { Back, Check, Pencil, Plus } from '../components/icons'

/**
 * Player Detail — checkpoint list grouped by phase (tap a pill to advance it),
 * the auto-generated "work on this next", and the notes feed with unresolved
 * notes pinned on top.
 */
export function PlayerPage() {
  const { playerId = '' } = useParams()
  const players = useDrumline((s) => s.players)
  const checkpoints = useDrumline((s) => s.checkpoints)
  const pcs = useDrumline((s) => s.pcs)
  const notes = useDrumline((s) => s.notes)
  const history = useDrumline((s) => s.history)
  const setStatus = useDrumline((s) => s.setStatus)
  const undoStatus = useDrumline((s) => s.undoStatus)
  const setNoteResolved = useDrumline((s) => s.setNoteResolved)
  const updatePlayer = useDrumline((s) => s.updatePlayer)
  const rehearsalBpm = usePrefs((s) => s.rehearsalBpm)
  const show = useToast((s) => s.show)

  const [passFor, setPassFor] = useState<Checkpoint | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [editNote, setEditNote] = useState<Note | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [tagFilter, setTagFilter] = useState<NoteTag | null>(null)
  const [logOpen, setLogOpen] = useState(false)

  const player = players.find((p) => p.id === playerId)

  const phases = useMemo(() => {
    const ordered = orderedCheckpoints(checkpoints)
    const out: { phase: number; rows: Checkpoint[] }[] = []
    for (const c of ordered) {
      const last = out[out.length - 1]
      if (last && last.phase === c.phase) last.rows.push(c)
      else out.push({ phase: c.phase, rows: [c] })
    }
    return out
  }, [checkpoints])

  const playerNotes = useMemo(() => {
    const mine = notes.filter((n) => n.playerId === playerId)
    const filtered = tagFilter ? mine.filter((n) => n.tag === tagFilter) : mine
    return filtered.sort(
      (a, b) => Number(a.resolved) - Number(b.resolved) || b.createdAt - a.createdAt,
    )
  }, [notes, playerId, tagFilter])

  const playerLog = useMemo(
    () =>
      history
        .filter((h) => h.playerId === playerId)
        .sort((a, b) => b.at - a.at)
        .slice(0, 40),
    [history, playerId],
  )

  if (!player) {
    return (
      <div className="dl-page">
        <div className="empty">
          <h3>Player not found</h3>
          <Link to="/" className="btn">
            <Back size={16} /> Back to rehearsal
          </Link>
        </div>
      </div>
    )
  }

  const prog = progressOf(player, checkpoints, pcs)
  const frontier = frontierOf(player, checkpoints, pcs)
  const unresolved = notes.filter((n) => n.playerId === playerId && !n.resolved)
  const cpById = new Map(checkpoints.map((c) => [c.id, c]))

  const commit = (cp: Checkpoint, to: ReturnType<typeof nextStatus>, tempo: number | null = null) => {
    const change = setStatus(player.id, cp.id, to, { tempoPassed: tempo, bpm: rehearsalBpm })
    show(`${STATUS_LABEL[to]}${tempo ? ` @ ${tempo}` : ''} — ${cp.name.slice(0, 40)}`, {
      label: 'Undo',
      fn: () => undoStatus(change),
    })
  }

  const cycle = (cp: Checkpoint) => {
    const to = nextStatus(statusOf(pcs, player.id, cp.id))
    if (to === 'passed') setPassFor(cp)
    else commit(cp, to)
  }

  return (
    <div className="dl-page player-page">
      <header className="player-head">
        <Link to="/" className="btn icon ghost" aria-label="Back to rehearsal">
          <Back size={18} />
        </Link>
        <div className="player-id">
          <h2>
            {playerName(player)}
            {player.isSectionLeader && <span className="sl-badge">SL</span>}
            {!player.active && <span className="bench-badge">Benched</span>}
          </h2>
          <p className="player-sub">
            {player.instrument} · Grade {player.gradeLevel} · Year {player.yearsInProgram + 1}
          </p>
        </div>
        <button className="btn icon ghost" onClick={() => setEditOpen(true)} aria-label="Edit player">
          <Pencil size={17} />
        </button>
      </header>

      <div className="player-progress">
        <ProgressBar passed={prog.passed} total={prog.total} />
        <span className="progress-num">
          {prog.passed}/{prog.total}
        </span>
      </div>

      <section className="worknext card">
        <h4 className="section-label">Work on next</h4>
        {frontier ? (
          <p className="worknext-cp">
            <b>
              P{frontier.phase} · {frontier.name}
            </b>
            <StatusChip status={statusOf(pcs, player.id, frontier.id)} compact />
          </p>
        ) : (
          <p className="worknext-cp done">Every active checkpoint is passed. Raise the bar.</p>
        )}
        {unresolved.length > 0 && (
          <p className="worknext-notes">
            {unresolved.length} open note{unresolved.length === 1 ? '' : 's'} below
          </p>
        )}
      </section>

      {phases.map((ph) => (
        <section key={ph.phase} className="phase-block">
          <h4 className="section-label">
            Phase {ph.phase} — {PHASE_NAMES[ph.phase]}
          </h4>
          <div className="cp-rows">
            {ph.rows.map((cp) => {
              const st = statusOf(pcs, player.id, cp.id)
              const tempo = tempoOf(pcs, player.id, cp.id)
              return (
                <div key={cp.id} className={`cp-row${cp.gateFlag ? ' gate' : ''}`}>
                  <span className="cp-name">
                    {cp.gateFlag && <GateStar />}
                    {cp.name}
                    {st === 'passed' && tempo != null && (
                      <span className="cp-tempo">@ {tempo}</span>
                    )}
                  </span>
                  <StatusChip status={st} onClick={() => cycle(cp)} />
                </div>
              )
            })}
          </div>
        </section>
      ))}

      <section className="notes-block">
        <div className="notes-head">
          <h4 className="section-label">Notes</h4>
          <button className="btn sm" onClick={() => setNoteOpen(true)}>
            <Plus size={14} /> Note
          </button>
        </div>
        <div className="tag-filter">
          <button
            className={`filter-chip${tagFilter === null ? ' active' : ''}`}
            onClick={() => setTagFilter(null)}
          >
            All
          </button>
          {NOTE_TAGS.map((t) => (
            <button
              key={t}
              className={`filter-chip${tagFilter === t ? ' active' : ''}`}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
        {playerNotes.length === 0 && <p className="quiet-empty">No notes{tagFilter ? ' with this tag' : ' yet'}.</p>}
        <div className="note-list">
          {playerNotes.map((n) => (
            <article key={n.id} className={`note-card${n.resolved ? ' resolved' : ''}`}>
              <div className="note-top">
                <span className={`note-tag tag-${n.tag === 'Win' ? 'win' : 'std'}`}>{n.tag}</span>
                <span className="note-when">
                  {fmtDay(n.createdAt)} {fmtTime(n.createdAt)}
                  {n.bpm ? ` · ${n.bpm} BPM` : ''}
                </span>
                <button
                  className="btn icon xs"
                  onClick={() => setEditNote(n)}
                  aria-label="Edit note"
                  title="Edit"
                >
                  <Pencil size={13} />
                </button>
                <button
                  className={`btn icon xs resolve-btn${n.resolved ? ' on' : ''}`}
                  onClick={() => setNoteResolved(n.id, !n.resolved)}
                  aria-label={n.resolved ? 'Reopen note' : 'Resolve note'}
                  title={n.resolved ? 'Reopen' : 'Resolve'}
                >
                  <Check size={14} />
                </button>
              </div>
              <p className="note-body">{n.body}</p>
              {n.checkpointId && cpById.get(n.checkpointId) && (
                <p className="note-cp-link">→ {cpById.get(n.checkpointId)!.name}</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="log-block">
        <button className="btn ghost sm" onClick={() => setLogOpen((v) => !v)}>
          {logOpen ? 'Hide season log' : `Season log (${playerLog.length})`}
        </button>
        {logOpen && (
          <div className="log-list">
            {playerLog.length === 0 && <p className="quiet-empty">No status changes yet.</p>}
            {playerLog.map((h) => (
              <div key={h.id} className="log-row">
                <span className="log-when">{fmtDay(h.at)}</span>
                <span className="log-what">
                  {cpById.get(h.checkpointId)?.name ?? 'Checkpoint'}
                </span>
                <span className="log-change">
                  {STATUS_LABEL[h.from]} → <b>{STATUS_LABEL[h.to]}</b>
                  {h.tempoPassed ? ` @ ${h.tempoPassed}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {passFor && (
        <PassSheet
          player={player}
          checkpoint={passFor}
          onClose={() => setPassFor(null)}
          onSave={(tempo) => {
            commit(passFor, 'passed', tempo)
            setPassFor(null)
          }}
        />
      )}
      {noteOpen && <NoteSheet playerId={player.id} onClose={() => setNoteOpen(false)} />}
      {editNote && <NoteSheet edit={editNote} onClose={() => setEditNote(null)} />}
      {editOpen && (
        <PlayerFormSheet
          title={`Edit ${playerName(player)}`}
          initial={player}
          onClose={() => setEditOpen(false)}
          onSave={(input) => {
            updatePlayer(player.id, input)
            setEditOpen(false)
          }}
        />
      )}
    </div>
  )
}
