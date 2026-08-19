import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  INSTRUMENTS,
  playerName,
  positionName,
  type Instrument,
  type Player,
} from '../db/drumline'
import { useDrumline } from '../state/useDrumline'
import { useToast } from '../state/useToast'
import { PlayerFormSheet } from '../components/Drumline/PlayerForm'
import { Sheet } from '../components/Sheet'
import { Back, Minus, Pencil, Plus, UserPlus, Users } from '../components/icons'

/** Roster management — add the line once, bench without losing history. */
export function RosterPage() {
  const players = useDrumline((s) => s.players)
  const addPlayer = useDrumline((s) => s.addPlayer)
  const updatePlayer = useDrumline((s) => s.updatePlayer)
  const show = useToast((s) => s.show)

  const [adding, setAdding] = useState(false)
  const [building, setBuilding] = useState(false)
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
        <button className="btn" onClick={() => setBuilding(true)}>
          <Users size={15} /> Build line
        </button>
        <button className="btn primary" onClick={() => setAdding(true)}>
          <UserPlus size={15} /> Add player
        </button>
      </div>

      {sorted.length === 0 && (
        <p className="quiet-empty">
          No players yet. Add them one by one — or use Build line to create the whole battery by
          position ("Snare 1", "Bass 2"…) with no names stored at all.
        </p>
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
      {building && <BuildLineSheet onClose={() => setBuilding(false)} />}
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

/**
 * Build the whole battery in one go, no names required — pick how many of
 * each drum and every player is created as a position label. Rename any of
 * them later from this page.
 */
function BuildLineSheet({ onClose }: { onClose: () => void }) {
  const addPlayer = useDrumline((s) => s.addPlayer)
  const show = useToast((s) => s.show)
  const [snares, setSnares] = useState(0)
  const [tenors, setTenors] = useState(0)
  const [basses, setBasses] = useState(0)
  const [cymbals, setCymbals] = useState(0)

  const total = snares + tenors + basses + cymbals

  const build = () => {
    const addOne = (instrument: Instrument) => {
      // getState so each new label sees the players added just before it.
      const current = useDrumline.getState().players
      addPlayer({
        firstName: positionName(current, instrument),
        lastInitial: '',
        instrument,
        gradeLevel: 9,
        yearsInProgram: 0,
        isSectionLeader: false,
        active: true,
      })
    }
    for (let i = 0; i < snares; i++) addOne('Snare')
    for (let i = 0; i < tenors; i++) addOne('Tenors')
    for (let i = 0; i < basses; i++) addOne(`Bass ${i + 1}` as Instrument)
    for (let i = 0; i < cymbals; i++) addOne('Cymbals')
    show(`Added ${total} player${total === 1 ? '' : 's'}`)
    onClose()
  }

  return (
    <Sheet title="Build line" onClose={onClose}>
      <p className="sheet-sub">
        Creates position players — "Snare 1", "Bass 2" — with no names stored. Edit any of them
        later to add a name, grade, or section-leader flag.
      </p>
      <div className="stack">
        <CountRow label="Snares" value={snares} max={9} onChange={setSnares} />
        <CountRow label="Tenors" value={tenors} max={9} onChange={setTenors} />
        <CountRow label="Bass drums" value={basses} max={5} onChange={setBasses} />
        <CountRow label="Cymbals" value={cymbals} max={9} onChange={setCymbals} />
        <div className="sheet-actions">
          <button type="button" className="btn tall ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn tall primary" disabled={total === 0} onClick={build}>
            Add {total || ''} player{total === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </Sheet>
  )
}

function CountRow({
  label,
  value,
  max,
  onChange,
}: {
  label: string
  value: number
  max: number
  onChange: (n: number) => void
}) {
  return (
    <div className="count-row">
      <span className="count-label">{label}</span>
      <div className="count-ctrl">
        <button
          className="btn icon tall"
          disabled={value <= 0}
          onClick={() => onChange(value - 1)}
          aria-label={`Fewer ${label}`}
        >
          <Minus size={16} />
        </button>
        <span className="count-num">{value}</span>
        <button
          className="btn icon tall"
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          aria-label={`More ${label}`}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  )
}
