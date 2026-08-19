import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { INSTRUMENTS, playerName, type Player } from '../db/drumline'
import { useDrumline } from '../state/useDrumline'
import { useToast } from '../state/useToast'
import { PlayerFormSheet } from '../components/Drumline/PlayerForm'
import { Back, Pencil, UserPlus } from '../components/icons'

/** Roster management — add the line once, bench without losing history. */
export function RosterPage() {
  const players = useDrumline((s) => s.players)
  const addPlayer = useDrumline((s) => s.addPlayer)
  const updatePlayer = useDrumline((s) => s.updatePlayer)
  const show = useToast((s) => s.show)

  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Player | null>(null)

  const sorted = useMemo(
    () =>
      [...players].sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          INSTRUMENTS.indexOf(a.instrument) - INSTRUMENTS.indexOf(b.instrument) ||
          playerName(a).localeCompare(playerName(b)),
      ),
    [players],
  )

  return (
    <div className="dl-page">
      <div className="page-head">
        <Link to="/more" className="btn icon ghost" aria-label="Back to More">
          <Back size={18} />
        </Link>
        <h2 className="page-title">Roster</h2>
        <span className="nav-spacer" />
        <button className="btn primary" onClick={() => setAdding(true)}>
          <UserPlus size={15} /> Add player
        </button>
      </div>

      {sorted.length === 0 && (
        <p className="quiet-empty">No players yet. Add the line — it takes a minute.</p>
      )}

      <div className="roster-list">
        {sorted.map((p) => (
          <button key={p.id} className={`roster-row card${p.active ? '' : ' benched'}`} onClick={() => setEditing(p)}>
            <span className="roster-name">
              {playerName(p)}
              {p.isSectionLeader && <span className="sl-badge">SL</span>}
              {!p.active && <span className="bench-badge">Benched</span>}
            </span>
            <span className="roster-meta">
              {p.instrument} · Gr {p.gradeLevel} · Yr {p.yearsInProgram + 1}
            </span>
            <Pencil size={14} className="roster-pencil" />
          </button>
        ))}
      </div>

      {adding && (
        <PlayerFormSheet
          title="Add player"
          onClose={() => setAdding(false)}
          onSave={(input) => {
            const p = addPlayer(input)
            show(`${playerName(p)} added`)
            setAdding(false)
          }}
        />
      )}
      {editing && (
        <PlayerFormSheet
          title={`Edit ${playerName(editing)}`}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(input) => {
            updatePlayer(editing.id, input)
            show('Saved')
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
