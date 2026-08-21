import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  instrumentGroup,
  playerName,
  type Player,
} from '../db/drumline'
import {
  frontierOf,
  progressOf,
  rosterOrder,
  useDrumline,
} from '../state/useDrumline'
import { NoteSheet } from '../components/Drumline/NoteSheet'
import { NoteIcon, UserPlus } from '../components/icons'

/**
 * Rehearsal Mode — the landing screen. Standing in a parking lot with sticks
 * in hand: tap a player, type/speak, tap a tag. Done in under 5 seconds.
 * Long-press a tile to jump to that player's checkpoint list instead.
 */
export function RehearsalPage() {
  const loaded = useDrumline((s) => s.loaded)
  const players = useDrumline((s) => s.players)
  const checkpoints = useDrumline((s) => s.checkpoints)
  const pcs = useDrumline((s) => s.pcs)
  const notes = useDrumline((s) => s.notes)

  const [sheet, setSheet] = useState<{ playerId: string | null } | null>(null)

  const active = useMemo(() => players.filter((p) => p.active), [players])
  const ordered = useMemo(
    () => rosterOrder(active, checkpoints, pcs, notes),
    [active, checkpoints, pcs, notes],
  )

  const groups = useMemo(() => {
    const out: { name: string; members: Player[] }[] = []
    for (const p of ordered) {
      const g = instrumentGroup(p.instrument)
      const last = out[out.length - 1]
      if (last && last.name === g) last.members.push(p)
      else out.push({ name: g, members: [p] })
    }
    return out
  }, [ordered])

  const openNoteCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const n of notes)
      if (!n.resolved && n.playerId) map.set(n.playerId, (map.get(n.playerId) ?? 0) + 1)
    return map
  }, [notes])

  return (
    <div className="rehearsal">
      <h2 className="page-title rehearsal-title">Rehearsal</h2>
      <RehearsalBar onSectionNote={() => setSheet({ playerId: null })} />

      {loaded && active.length === 0 && (
        <div className="empty">
          <h3>No players yet</h3>
          <p>Add the line once and rehearsal mode becomes a tap-a-face note pad.</p>
          <Link to="/more/roster" className="btn primary">
            <UserPlus size={16} /> Set up the roster
          </Link>
        </div>
      )}

      {active.length > 0 && (
        <p className="grid-hint">Tap a player to log a note · hold to open their checkpoints</p>
      )}

      {groups.map((g) => (
        <section key={g.name} className="tile-section">
          <h4 className="section-label">{g.name}</h4>
          <div className="tile-grid">
            {g.members.map((p) => (
              <PlayerTile
                key={p.id}
                player={p}
                openNotes={openNoteCount.get(p.id) ?? 0}
                onNote={() => setSheet({ playerId: p.id })}
              />
            ))}
          </div>
        </section>
      ))}

      {sheet && <NoteSheet playerId={sheet.playerId} onClose={() => setSheet(null)} />}
    </div>
  )
}

/** The section note button + a shortcut to every note. Capture chrome only. */
function RehearsalBar({ onSectionNote }: { onSectionNote: () => void }) {
  const openNotes = useDrumline((s) => s.notes.filter((n) => !n.resolved).length)

  return (
    <div className="rehearsal-bar">
      <button className="btn tall section-note-btn" onClick={onSectionNote}>
        <NoteIcon size={16} />
        Section note
      </button>
      <Link to="/notes" className="btn icon tall notes-link" aria-label="All notes" title="All notes">
        <NoteIcon size={18} />
        {openNotes > 0 && <i className="icon-badge">{openNotes}</i>}
      </Link>
    </div>
  )
}

function PlayerTile({
  player,
  openNotes,
  onNote,
}: {
  player: Player
  openNotes: number
  onNote: () => void
}) {
  const navigate = useNavigate()
  const checkpoints = useDrumline((s) => s.checkpoints)
  const pcs = useDrumline((s) => s.pcs)

  const frontier = frontierOf(player, checkpoints, pcs)
  const prog = progressOf(player, checkpoints, pcs)
  const dotStatus = frontier
    ? pcs[`${player.id}|${frontier.id}`]?.status ?? 'not_started'
    : 'passed'
  const pct = prog.total > 0 ? Math.round((prog.passed / prog.total) * 100) : 0

  // A nameless bass's display name IS its instrument — a sub-line repeating
  // it verbatim is noise, not information.
  const name = playerName(player)
  let sub = player.instrument.startsWith('Bass') ? player.instrument : `Gr ${player.gradeLevel}`
  if (player.isSectionLeader) sub += ' · SL'
  if (sub === name) sub = ''

  // Long-press → player detail; tap → note sheet. Movement cancels (scrolling).
  const timer = useRef<number | null>(null)
  const longFired = useRef(false)
  const start = useRef<{ x: number; y: number } | null>(null)

  const clear = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }

  return (
    <button
      className="ptile"
      onPointerDown={(e) => {
        longFired.current = false
        start.current = { x: e.clientX, y: e.clientY }
        clear()
        timer.current = window.setTimeout(() => {
          longFired.current = true
          timer.current = null
          navigate(`/player/${player.id}`)
        }, 450)
      }}
      onPointerMove={(e) => {
        if (!start.current) return
        const dx = e.clientX - start.current.x
        const dy = e.clientY - start.current.y
        if (dx * dx + dy * dy > 144) clear()
      }}
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (longFired.current) {
          longFired.current = false
          return
        }
        onNote()
      }}
      aria-label={`${playerName(player)} — tap for a note, hold for detail`}
    >
      <span className={`pdot st-bg-${dotStatus}`} aria-hidden="true" />
      <span className="ptile-name">{name}</span>
      {sub && <span className="ptile-sub">{sub}</span>}
      <span className="ptile-bar" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </span>
      <span className="ptile-meta">
        <b>{prog.passed}</b>&thinsp;of&thinsp;{prog.total}
        {openNotes > 0 && <i className="note-badge">{openNotes}</i>}
      </span>
    </button>
  )
}
