import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PHASE_NAMES, type Checkpoint } from '../db/drumline'
import { orderedCheckpoints, useDrumline } from '../state/useDrumline'
import { useToast } from '../state/useToast'
import { Sheet } from '../components/Sheet'
import { ConfirmModal } from '../components/Modal'
import { GateStar } from '../components/Drumline/common'
import { ArrowDown, ArrowUp, Back, ChevronRight, Plus, Trash } from '../components/icons'

const PHASES = [1, 2, 3, 4, 5, 6] as const

/**
 * The standards editor. Tap a row to rename, move phase, flag it as a gate,
 * retire it, or delete it outright. Every phase has its own "Add" so a new
 * standard lands where it belongs. Rows are thumb-sized on purpose — this
 * gets edited on a phone between reps.
 */
export function CheckpointsPage() {
  const checkpoints = useDrumline((s) => s.checkpoints)
  const moveCheckpoint = useDrumline((s) => s.moveCheckpoint)
  const [editing, setEditing] = useState<Checkpoint | { phase: Checkpoint['phase'] } | null>(null)
  const [showRetired, setShowRetired] = useState(false)

  const grouped = useMemo(() => {
    const ordered = orderedCheckpoints(checkpoints, true).filter((c) => showRetired || c.active)
    const byPhase = new Map<number, Checkpoint[]>()
    for (const c of ordered) byPhase.set(c.phase, [...(byPhase.get(c.phase) ?? []), c])
    return PHASES.map((phase) => ({ phase, rows: byPhase.get(phase) ?? [] }))
  }, [checkpoints, showRetired])

  const retiredCount = checkpoints.filter((c) => !c.active).length
  const activeCount = checkpoints.length - retiredCount

  return (
    <div className="dl-page cps-page">
      <div className="page-head">
        <Link to="/more" className="btn icon ghost" aria-label="Back to More">
          <Back size={18} />
        </Link>
        <h2 className="page-title">Checkpoints</h2>
        <span className="nav-spacer" />
        <span className="cps-count">{activeCount} active</span>
      </div>
      <p className="grid-hint">
        Tap a checkpoint to rename, retire or delete it. Arrows reorder inside a phase.
      </p>

      {grouped.map((g) => (
        <section key={g.phase} className="phase-block">
          <h4 className="section-label">
            Phase {g.phase} — {PHASE_NAMES[g.phase]}
          </h4>
          <div className="cp-rows">
            {g.rows.map((cp, i) => {
              return (
                <div key={cp.id} className={`cp-row edit${cp.active ? '' : ' retired'}${cp.gateFlag ? ' gate' : ''}`}>
                  <button className="cp-open" onClick={() => setEditing(cp)}>
                    <span className="cp-name">
                      {cp.gateFlag && <GateStar />}
                      {cp.name}
                      {!cp.active && <span className="bench-badge">Retired</span>}
                    </span>
                    <ChevronRight size={15} className="cp-caret" />
                  </button>
                  {cp.active && (
                    <span className="cp-tools">
                      <button
                        className="btn icon"
                        disabled={i === 0}
                        onClick={() => moveCheckpoint(cp.id, -1)}
                        aria-label="Move up"
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        className="btn icon"
                        disabled={i === g.rows.length - 1}
                        onClick={() => moveCheckpoint(cp.id, 1)}
                        aria-label="Move down"
                      >
                        <ArrowDown size={15} />
                      </button>
                    </span>
                  )}
                </div>
              )
            })}
            <button className="btn ghost cp-add" onClick={() => setEditing({ phase: g.phase })}>
              <Plus size={15} /> Add to Phase {g.phase}
            </button>
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
          initial={'id' in editing ? editing : undefined}
          phaseHint={'id' in editing ? undefined : editing.phase}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

export function CheckpointFormSheet({
  initial,
  phaseHint,
  onClose,
}: {
  initial?: Checkpoint
  /** Pre-selected phase for a new checkpoint. */
  phaseHint?: Checkpoint['phase']
  onClose: () => void
}) {
  const addCheckpoint = useDrumline((s) => s.addCheckpoint)
  const updateCheckpoint = useDrumline((s) => s.updateCheckpoint)
  const removeCheckpoint = useDrumline((s) => s.removeCheckpoint)
  const restoreCheckpoint = useDrumline((s) => s.restoreCheckpoint)
  const pcs = useDrumline((s) => s.pcs)
  const show = useToast((s) => s.show)

  const [name, setName] = useState(initial?.name ?? '')
  const [phase, setPhase] = useState<Checkpoint['phase']>(initial?.phase ?? phaseHint ?? 1)
  const [description, setDescription] = useState(initial?.description ?? '')
  const [gate, setGate] = useState(initial?.gateFlag ?? false)
  const [confirm, setConfirm] = useState(false)

  // How much history would go with it — decides whether delete asks first.
  const logged = initial
    ? Object.values(pcs).filter((pc) => pc.checkpointId === initial.id && pc.status !== 'not_started').length
    : 0

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const payload = { name: name.trim(), phase, description: description.trim(), gateFlag: gate }
    if (initial) {
      updateCheckpoint(initial.id, payload)
      show('Checkpoint saved')
    } else {
      addCheckpoint({ ...payload, active: true })
      show(`Added to Phase ${phase}`)
    }
    onClose()
  }

  const retire = () => {
    if (!initial) return
    const next = !initial.active
    updateCheckpoint(initial.id, { active: next })
    show(next ? 'Checkpoint restored' : 'Checkpoint retired — history kept', {
      label: 'Undo',
      fn: () => updateCheckpoint(initial.id, { active: !next }),
    })
    onClose()
  }

  const del = () => {
    if (!initial) return
    const snap = removeCheckpoint(initial.id)
    if (snap) {
      show(`Deleted — ${initial.name.slice(0, 28)}`, {
        label: 'Undo',
        fn: () => restoreCheckpoint(snap),
      })
    }
    onClose()
  }

  return (
    <Sheet
      title={initial ? 'Edit checkpoint' : `New checkpoint · Phase ${phase}`}
      onClose={onClose}
      footer={
        <div className="sheet-actions">
          <button type="button" className="btn tall ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="cp-form" className="btn tall primary" disabled={!name.trim()}>
            {initial ? 'Save' : 'Add'}
          </button>
        </div>
      }
    >
      <form id="cp-form" className="stack" onSubmit={save}>
        <div className="field">
          <label htmlFor="cp-name">Name</label>
          <textarea
            id="cp-name"
            className="input"
            rows={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={!initial}
            placeholder="What has to be true to pass"
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
          <p className="form-hint">{PHASE_NAMES[phase]}</p>
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
          <span className="switch-label">Phase gate ★ — the line moves on when everyone clears it</span>
        </label>

        {initial && (
          <div className="cp-danger">
            <button type="button" className="btn tall" onClick={retire}>
              {initial.active ? 'Retire' : 'Restore'}
            </button>
            <button
              type="button"
              className="btn tall ghost danger"
              onClick={() => (logged > 0 ? setConfirm(true) : del())}
            >
              <Trash size={15} /> Delete
            </button>
            <p className="form-hint">
              Retire hides it but keeps every status logged against it. Delete removes it and
              {logged > 0 ? ` the ${logged} status${logged === 1 ? '' : 'es'} logged` : ' its history'}.
            </p>
          </div>
        )}
      </form>

      {confirm && initial && (
        <ConfirmModal
          title="Delete this checkpoint?"
          body={`${logged} player status${logged === 1 ? '' : 'es'} and their log entries go with it. Retire keeps them.`}
          confirmText="Delete anyway"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false)
            del()
          }}
        />
      )}
    </Sheet>
  )
}
