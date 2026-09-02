import { useMemo, useRef, useState } from 'react'
import {
  STATUSES,
  STATUS_LABEL,
  instrumentGroup,
  nextStatus,
  playerName,
  type CheckStatus,
  type Checkpoint,
  type Player,
  type StatusChange,
} from '../../db/drumline'
import { absentIds, stableOrder, statusOf, tempoOf, useDrumline } from '../../state/useDrumline'
import { useRehearsalBpm } from '../../state/useRehearsalBpm'
import { useToast } from '../../state/useToast'
import { Sheet } from '../Sheet'
import { GateStar, StatusChip } from './common'

/**
 * One checkpoint, the whole line. The after-a-rep surface: "everyone passed
 * except the two tenors" is one tap on Everyone → Passed and two taps back.
 * Every tap writes immediately; closing the sheet offers a single Undo that
 * reverts the lot.
 */
export function AssessSheet({ cp, onClose }: { cp: Checkpoint; onClose: () => void }) {
  const players = useDrumline((s) => s.players)
  const notes = useDrumline((s) => s.notes)
  const pcs = useDrumline((s) => s.pcs)
  const setStatus = useDrumline((s) => s.setStatus)
  const undoStatus = useDrumline((s) => s.undoStatus)
  const rehearsalBpm = useRehearsalBpm()
  const show = useToast((s) => s.show)

  const [tempo, setTempo] = useState(rehearsalBpm ? String(rehearsalBpm) : '')
  const changes = useRef<StatusChange[]>([])

  const roster = useMemo(() => stableOrder(players.filter((p) => p.active)), [players])
  // Today's roll call: absent players sit out of "Everyone" and the count.
  const absent = useMemo(() => absentIds(notes), [notes])
  const present = useMemo(() => roster.filter((p) => !absent.has(p.id)), [roster, absent])
  const groups = useMemo(() => {
    const out: { name: string; members: Player[] }[] = []
    for (const p of roster) {
      const g = instrumentGroup(p.instrument)
      const last = out[out.length - 1]
      if (last && last.name === g) last.members.push(p)
      else out.push({ name: g, members: [p] })
    }
    return out
  }, [roster])

  const tempoValue = () => {
    const n = Number(tempo)
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null
  }

  // Reads the store directly so a burst of "Everyone" taps sees each write.
  const apply = (p: Player, to: CheckStatus) => {
    if (statusOf(useDrumline.getState().pcs, p.id, cp.id) === to) return
    const change = setStatus(p.id, cp.id, to, {
      tempoPassed: to === 'passed' ? tempoValue() : null,
      bpm: rehearsalBpm,
    })
    changes.current.push(change)
  }

  const applyAll = (to: CheckStatus) => {
    for (const p of present) apply(p, to)
  }

  const close = () => {
    const made = changes.current
    if (made.length > 0) {
      show(`${made.length} status${made.length === 1 ? '' : 'es'} changed`, {
        label: 'Undo all',
        fn: () => {
          for (const c of [...made].reverse()) undoStatus(c)
        },
      })
    }
    onClose()
  }

  const passed = present.filter((p) => statusOf(pcs, p.id, cp.id) === 'passed').length

  return (
    <Sheet
      title="Assess the line"
      onClose={close}
      meta={
        <span className="bpm-stamp">
          {passed}/{present.length} passed
        </span>
      }
      footer={
        <div className="sheet-actions">
          <button className="btn tall primary" onClick={close}>
            Done
          </button>
        </div>
      }
    >
      <p className="sheet-sub">
        {cp.gateFlag && <GateStar size={12} />}
        P{cp.phase} · {cp.name}
      </p>

      <div className="assess-all">
        <span className="assess-all-label">
          Everyone{absent.size > 0 ? ` here (${absent.size} absent)` : ''}
        </span>
        <div className="seg assess-seg">
          {STATUSES.map((s) => (
            <button key={s} className={`st-${s}`} onClick={() => applyAll(s)} title={STATUS_LABEL[s]}>
              {s === 'not_started' ? 'Not yet' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="field assess-tempo">
        <label htmlFor="assess-bpm">Clean at (BPM) — stamped on every Passed</label>
        <input
          id="assess-bpm"
          className="input"
          type="number"
          inputMode="numeric"
          min={20}
          max={400}
          placeholder="optional"
          value={tempo}
          onChange={(e) => setTempo(e.target.value)}
        />
      </div>

      {groups.map((g) => (
        <section key={g.name} className="assess-group">
          <h5 className="section-label">{g.name}</h5>
          <div className="cp-rows">
            {g.members.map((p) => {
              const st = statusOf(pcs, p.id, cp.id)
              const t = tempoOf(pcs, p.id, cp.id)
              const out = absent.has(p.id)
              return (
                <div key={p.id} className={`cp-row assess-row${out ? ' absent' : ''}`}>
                  <span className="cp-name">
                    {playerName(p)}
                    {st === 'passed' && t != null && <span className="cp-tempo">@ {t}</span>}
                  </span>
                  {out ? (
                    <span className="st-chip absent-chip">Absent</span>
                  ) : (
                    <StatusChip status={st} onClick={() => apply(p, nextStatus(st))} />
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </Sheet>
  )
}
