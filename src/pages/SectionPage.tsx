import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  NOTE_TAGS,
  PHASE_NAMES,
  STATUS_LABEL,
  STATUSES,
  playerName,
  type CheckStatus,
  type Checkpoint,
  type Player,
} from '../db/drumline'
import {
  gateReports,
  orderedCheckpoints,
  rosterOrder,
  statusOf,
  useDrumline,
  weakestCheckpoints,
} from '../state/useDrumline'
import { usePrefs } from '../state/usePrefs'
import { useToast } from '../state/useToast'
import { Sheet } from '../components/Sheet'
import { GateStar } from '../components/Drumline/common'
import { Check } from '../components/icons'

/**
 * Section View — the reason the app exists. Checkpoints down, players across,
 * one glance says where the line stands. First column sticks while the player
 * columns scroll sideways.
 */
export function SectionPage() {
  const players = useDrumline((s) => s.players)
  const checkpoints = useDrumline((s) => s.checkpoints)
  const pcs = useDrumline((s) => s.pcs)
  const notes = useDrumline((s) => s.notes)
  const loaded = useDrumline((s) => s.loaded)

  const [cell, setCell] = useState<{ player: Player; cp: Checkpoint } | null>(null)

  const active = useMemo(() => players.filter((p) => p.active), [players])
  const cols = useMemo(
    () => rosterOrder(active, checkpoints, pcs, notes),
    [active, checkpoints, pcs, notes],
  )
  const rows = useMemo(() => orderedCheckpoints(checkpoints), [checkpoints])
  const gates = useMemo(() => gateReports(checkpoints, players, pcs), [checkpoints, players, pcs])
  const weakest = useMemo(
    () => weakestCheckpoints(checkpoints, players, pcs).slice(0, 5),
    [checkpoints, players, pcs],
  )

  if (loaded && active.length === 0) {
    return (
      <div className="dl-page">
        <div className="empty">
          <h3>Nothing to map yet</h3>
          <p>Add players to the roster and the section heatmap builds itself.</p>
          <Link to="/more/roster" className="btn primary">
            Open roster
          </Link>
        </div>
      </div>
    )
  }

  let lastPhase = 0

  return (
    <div className="dl-page section-page">
      <h2 className="page-title">Section</h2>

      <div className="heatwrap" role="grid" aria-label="Checkpoint heatmap">
        <table className="heatmap">
          <thead>
            <tr>
              <th className="hm-corner" aria-label="Checkpoint" />
              {cols.map((p) => (
                <th key={p.id} className="hm-col">
                  <Link to={`/player/${p.id}`} className="hm-player">
                    {p.firstName.slice(0, 9)} {p.lastInitial}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cp) => {
              const phaseHead = cp.phase !== lastPhase
              lastPhase = cp.phase
              return (
                <PhaseAwareRow
                  key={cp.id}
                  cp={cp}
                  cols={cols}
                  phaseHead={phaseHead}
                  onCell={(player) => setCell({ player, cp })}
                />
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="hm-legend">
        {STATUSES.map((s) => (
          <span key={s}>
            <i className={`st-bg-${s}`} /> {STATUS_LABEL[s]}
          </span>
        ))}
      </div>

      <section className="gate-block">
        <h4 className="section-label">Phase gates</h4>
        <div className="gate-list">
          {gates.map(({ gate, passed, blocking }) => (
            <div key={gate.id} className="gate-card card">
              <div className="gate-top">
                <span className="gate-name">
                  <GateStar size={13} />
                  P{gate.phase} · {gate.name}
                </span>
                <span className={`gate-count${blocking.length === 0 ? ' clear' : ''}`}>
                  {passed.length}/{passed.length + blocking.length}
                </span>
              </div>
              {blocking.length > 0 ? (
                <p className="gate-blockers">
                  {blocking.map((p, i) => (
                    <Link key={p.id} to={`/player/${p.id}`} className="blocker">
                      {playerName(p)}
                      {i < blocking.length - 1 ? ',' : ''}
                    </Link>
                  ))}
                </p>
              ) : (
                <p className="gate-blockers clear">Everyone through.</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="weak-block">
        <h4 className="section-label">Weakest checkpoints</h4>
        {weakest.length === 0 && <p className="quiet-empty">No players yet.</p>}
        <div className="weak-list">
          {weakest.map((w, i) => (
            <div key={w.checkpoint.id} className="weak-row">
              <span className="weak-rank">{i + 1}</span>
              <span className="weak-name">
                P{w.checkpoint.phase} · {w.checkpoint.name}
              </span>
              <span className="weak-count">{w.notPassed} not passed</span>
            </div>
          ))}
        </div>
      </section>

      <OpenNotes />

      {cell && (
        <SetStatusSheet player={cell.player} cp={cell.cp} onClose={() => setCell(null)} />
      )}
    </div>
  )
}

function PhaseAwareRow({
  cp,
  cols,
  phaseHead,
  onCell,
}: {
  cp: Checkpoint
  cols: Player[]
  phaseHead: boolean
  onCell: (p: Player) => void
}) {
  const pcs = useDrumline((s) => s.pcs)
  return (
    <>
      {phaseHead && (
        <tr className="hm-phase-row">
          <th className="hm-phase" colSpan={cols.length + 1}>
            Phase {cp.phase} — {PHASE_NAMES[cp.phase]}
          </th>
        </tr>
      )}
      <tr className={cp.gateFlag ? 'gate' : undefined}>
        <th className="hm-row-label">
          {cp.gateFlag && <GateStar size={11} />}
          <span>{cp.name}</span>
        </th>
        {cols.map((p) => {
          const st = statusOf(pcs, p.id, cp.id)
          return (
            <td key={p.id}>
              <button
                className={`hm-cell st-bg-${st}`}
                onClick={() => onCell(p)}
                aria-label={`${playerName(p)} — ${cp.name}: ${STATUS_LABEL[st]}`}
              />
            </td>
          )
        })}
      </tr>
    </>
  )
}

/** Tap a heatmap cell → set the status directly (with tempo when passing). */
function SetStatusSheet({
  player,
  cp,
  onClose,
}: {
  player: Player
  cp: Checkpoint
  onClose: () => void
}) {
  const pcs = useDrumline((s) => s.pcs)
  const setStatus = useDrumline((s) => s.setStatus)
  const undoStatus = useDrumline((s) => s.undoStatus)
  const rehearsalBpm = usePrefs((s) => s.rehearsalBpm)
  const show = useToast((s) => s.show)
  const [askTempo, setAskTempo] = useState(false)
  const [tempo, setTempo] = useState(rehearsalBpm ? String(rehearsalBpm) : '')

  const cur = statusOf(pcs, player.id, cp.id)

  const commit = (to: CheckStatus, tempoPassed: number | null = null) => {
    const change = setStatus(player.id, cp.id, to, { tempoPassed, bpm: rehearsalBpm })
    show(`${playerName(player)} — ${STATUS_LABEL[to]}`, {
      label: 'Undo',
      fn: () => undoStatus(change),
    })
    onClose()
  }

  return (
    <Sheet title={playerName(player)} onClose={onClose}>
      <p className="sheet-sub">
        {cp.gateFlag && <GateStar size={12} />}
        P{cp.phase} · {cp.name}
      </p>
      {!askTempo ? (
        <div className="status-pick">
          {STATUSES.map((s) => (
            <button
              key={s}
              className={`status-opt st-${s}${cur === s ? ' current' : ''}`}
              onClick={() => (s === 'passed' ? setAskTempo(true) : commit(s))}
            >
              {STATUS_LABEL[s]}
              {cur === s && <Check size={15} />}
            </button>
          ))}
        </div>
      ) : (
        <form
          className="pass-form"
          onSubmit={(e) => {
            e.preventDefault()
            const n = Number(tempo)
            commit('passed', Number.isFinite(n) && n > 0 ? Math.round(n) : null)
          }}
        >
          <div className="field">
            <label htmlFor="hm-bpm">Clean at (BPM)</label>
            <input
              id="hm-bpm"
              className="input big-input"
              type="number"
              inputMode="numeric"
              min={20}
              max={400}
              placeholder="—"
              value={tempo}
              onChange={(e) => setTempo(e.target.value)}
              autoFocus
            />
          </div>
          <div className="sheet-actions">
            <button type="button" className="btn tall ghost" onClick={() => commit('passed', null)}>
              Skip tempo
            </button>
            <button type="submit" className="btn tall primary">
              Passed
            </button>
          </div>
        </form>
      )}
    </Sheet>
  )
}

/**
 * Every note in one place: unresolved grouped by tag, with the resolved
 * history one tap away. This is where section-wide notes live after capture.
 */
function OpenNotes() {
  const notes = useDrumline((s) => s.notes)
  const players = useDrumline((s) => s.players)
  const setNoteResolved = useDrumline((s) => s.setNoteResolved)
  const [showResolved, setShowResolved] = useState(false)

  const open = useMemo(() => notes.filter((n) => !n.resolved), [notes])
  const resolved = useMemo(
    () => notes.filter((n) => n.resolved).sort((a, b) => b.createdAt - a.createdAt),
    [notes],
  )
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])

  const groups = useMemo(
    () =>
      NOTE_TAGS.map((tag) => ({
        tag,
        items: open.filter((n) => n.tag === tag).sort((a, b) => b.createdAt - a.createdAt),
      })).filter((g) => g.items.length > 0),
    [open],
  )

  const who = (n: { playerId: string | null }) => {
    const p = n.playerId ? byId.get(n.playerId) : null
    return p ? (
      <Link to={`/player/${p.id}`} className="note-player">
        {playerName(p)}
      </Link>
    ) : (
      <span className="note-player section">Section</span>
    )
  }

  return (
    <section className="open-notes">
      <h4 className="section-label">Notes</h4>
      {groups.length === 0 && <p className="quiet-empty">Nothing open. Clean slate.</p>}
      {groups.map((g) => (
        <div key={g.tag} className="open-group">
          <span className={`note-tag tag-${g.tag === 'Win' ? 'win' : 'std'}`}>
            {g.tag} · {g.items.length}
          </span>
          <div className="note-list">
            {g.items.map((n) => (
              <article key={n.id} className="note-card">
                <div className="note-top">
                  {who(n)}
                  <button
                    className="btn icon xs resolve-btn"
                    onClick={() => setNoteResolved(n.id, true)}
                    aria-label="Resolve note"
                    title="Resolve"
                  >
                    <Check size={14} />
                  </button>
                </div>
                <p className="note-body">{n.body}</p>
              </article>
            ))}
          </div>
        </div>
      ))}

      {resolved.length > 0 && (
        <button className="btn ghost sm" onClick={() => setShowResolved((v) => !v)}>
          {showResolved ? 'Hide resolved' : `Resolved (${resolved.length})`}
        </button>
      )}
      {showResolved && (
        <div className="note-list resolved-list">
          {resolved.map((n) => (
            <article key={n.id} className="note-card resolved">
              <div className="note-top">
                {who(n)}
                <span className={`note-tag tag-${n.tag === 'Win' ? 'win' : 'std'}`}>{n.tag}</span>
                <button
                  className="btn icon xs resolve-btn on"
                  onClick={() => setNoteResolved(n.id, false)}
                  aria-label="Reopen note"
                  title="Reopen"
                >
                  <Check size={14} />
                </button>
              </div>
              <p className="note-body">{n.body}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
