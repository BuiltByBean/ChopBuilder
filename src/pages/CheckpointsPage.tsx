import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PHASE_NAMES, type Checkpoint } from '../db/drumline'
import { orderedCheckpoints, useDrumline } from '../state/useDrumline'
import { useToast } from '../state/useToast'
import { Sheet } from '../components/Sheet'
import { GateStar } from '../components/Drumline/common'
import { ArrowDown, ArrowUp, Back, Pencil, Plus } from '../components/icons'

const PHASES = [1, 2, 3, 4, 5, 6] as const

/** The standards editor: add, rename, reorder, retire — never delete. */
export function CheckpointsPage() {
  const checkpoints = useDrumline((s) => s.checkpoints)
  const moveCheckpoint = useDrumline((s) => s.moveCheckpoint)
  const [editing, setEditing] = useState<Checkpoint | 'new' | null>(null)
  const [showRetired, setShowRetired] = useState(false)

  const grouped = useMemo(() => {
    const ordered = orderedCheckpoints(checkpoints, true).filter(
      (c) => showRetired || c.active,
    )
    const out: { phase: number; rows: Checkpoint[] }[] = []
    for (const c of ordered) {
      const last = out[out.length - 1]
      if (last && last.phase === c.phase) last.rows.push(c)
      else out.push({ phase: c.phase, rows: [c] })
    }
    return out
  }, [checkpoints, showRetired])

  const retiredCount = checkpoints.filter((c) => !c.active).length

  return (
    <div className="dl-page">
      <div className="page-head">
        <Link to="/more" className="btn icon ghost" aria-label="Back to More">
          <Back size={18} />
        </Link>
        <h2 className="page-title">Checkpoints</h2>
        <span className="nav-spacer" />
        <button className="btn primary" onClick={() => setEditing('new')}>
          <Plus size={15} /> Add
        </button>
      </div>

      {grouped.map((g) => (
        <section key={g.phase} className="phase-block">
          <h4 className="section-label">
            Phase {g.phase} — {PHASE_NAMES[g.phase]}
          </h4>
          <div className="cp-rows">
            {g.rows.map((cp, i) => (
              <div key={cp.id} className={`cp-row edit${cp.active ? '' : ' retired'}`}>
                <span className="cp-name">
                  {cp.gateFlag && <GateStar />}
                  {cp.name}
                  {!cp.active && <span className="bench-badge">Retired</span>}
                </span>
                <span className="cp-tools">
                  <button
                    className="btn icon xs"
                    disabled={i === 0}
                    onClick={() => moveCheckpoint(cp.id, -1)}
                    aria-label="Move up"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    className="btn icon xs"
                    disabled={i === g.rows.length - 1}
                    onClick={() => moveCheckpoint(cp.id, 1)}
                    aria-label="Move down"
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    className="btn icon xs"
                    onClick={() => setEditing(cp)}
                    aria-label={`Edit ${cp.name}`}
                  >
                    <Pencil size={13} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}

      {retiredCount > 0 && (
        <button className="btn ghost sm" onClick={() => setShowRetired((v) => !v)}>
          {showRetired ? 'Hide retired' : `Show retired (${retiredCount})`}
        </button>
      )}

      {editing && (
        <CheckpointFormSheet
          initial={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function CheckpointFormSheet({
  initial,
  onClose,
}: {
  initial?: Checkpoint
  onClose: () => void
}) {
  const addCheckpoint = useDrumline((s) => s.addCheckpoint)
  const updateCheckpoint = useDrumline((s) => s.updateCheckpoint)
  const show = useToast((s) => s.show)

  const [name, setName] = useState(initial?.name ?? '')
  const [phase, setPhase] = useState<Checkpoint['phase']>(initial?.phase ?? 1)
  const [description, setDescription] = useState(initial?.description ?? '')
  const [gate, setGate] = useState(initial?.gateFlag ?? false)
  const [active, setActive] = useState(initial?.active ?? true)

  return (
    <Sheet title={initial ? 'Edit checkpoint' : 'Add checkpoint'} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          if (initial) {
            updateCheckpoint(initial.id, {
              name: name.trim(),
              phase,
              description: description.trim(),
              gateFlag: gate,
              active,
            })
            show('Checkpoint saved')
          } else {
            addCheckpoint({
              name: name.trim(),
              phase,
              description: description.trim(),
              gateFlag: gate,
              active,
            })
            show('Checkpoint added')
          }
          onClose()
        }}
      >
        <div className="field">
          <label htmlFor="cp-name">Name</label>
          <input
            id="cp-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={!initial}
          />
        </div>
        <div className="field">
          <label>Phase</label>
          <div className="seg">
            {PHASES.map((p) => (
              <button key={p} type="button" aria-pressed={phase === p} onClick={() => setPhase(p)}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="cp-desc">Description (optional)</label>
          <textarea
            id="cp-desc"
            className="input"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <label className="switch">
          <input type="checkbox" checked={gate} onChange={(e) => setGate(e.target.checked)} />
          <span className="track" />
          <span className="switch-label">Phase gate ★</span>
        </label>
        {initial && (
          <label className="switch">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span className="track" />
            <span className="switch-label">Active (off = retired, history kept)</span>
          </label>
        )}
        <div className="sheet-actions">
          <button type="button" className="btn tall ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn tall primary" disabled={!name.trim()}>
            Save
          </button>
        </div>
      </form>
    </Sheet>
  )
}
