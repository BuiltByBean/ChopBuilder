import { useMemo } from 'react'
import { instrumentGroup, playerName, type Player } from '../../db/drumline'
import { absentIds, stableOrder, useDrumline } from '../../state/useDrumline'
import { Sheet } from '../Sheet'
import { Check, Close } from '../icons'

/**
 * Roll call — the first thirty seconds of rehearsal. Every active player is a
 * toggle; tap the ones who aren't here. An absence is an Attendance note for
 * today (born resolved), so it shows up in the day's session and syncs like
 * everything else. Tapping again takes it back.
 */
export function RollCallSheet({ onClose }: { onClose: () => void }) {
  const players = useDrumline((s) => s.players)
  const notes = useDrumline((s) => s.notes)
  const setAbsent = useDrumline((s) => s.setAbsent)

  const absent = useMemo(() => absentIds(notes), [notes])
  const roster = useMemo(() => stableOrder(players.filter((p) => p.active)), [players])
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

  const here = roster.length - absent.size

  return (
    <Sheet
      title="Roll call"
      onClose={onClose}
      meta={
        <span className={`bpm-stamp${absent.size ? ' warn' : ''}`}>
          {absent.size ? `${absent.size} absent` : `${here}/${roster.length} here`}
        </span>
      }
      footer={
        <div className="sheet-actions">
          <button className="btn tall primary" onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      <p className="sheet-sub">Tap anyone who isn't here. Tap again if they show up late.</p>
      {groups.map((g) => (
        <section key={g.name} className="roll-group">
          <h5 className="section-label">{g.name}</h5>
          <div className="roll-grid">
            {g.members.map((p) => {
              const out = absent.has(p.id)
              return (
                <button
                  key={p.id}
                  className={`roll-chip${out ? ' out' : ''}`}
                  aria-pressed={out}
                  onClick={() => setAbsent(p.id, !out)}
                >
                  {out ? <Close size={13} /> : <Check size={13} />}
                  <span>{playerName(p)}</span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </Sheet>
  )
}
