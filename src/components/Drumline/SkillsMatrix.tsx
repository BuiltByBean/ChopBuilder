import { useState } from 'react'
import { playerName, type SectionName, type Skill } from '../../db/drumline'
import {
  activeSkills,
  rankingFor,
  sectionPlayers,
  sectionsOf,
  useDrumline,
} from '../../state/useDrumline'
import { useToast } from '../../state/useToast'
import { Sheet } from '../Sheet'
import { Pencil, Plus } from '../icons'

/**
 * Per-section forced ranking: every skill is a row, every rank a column, and
 * every active player in the section sits in exactly one slot — strongest at
 * 1, weakest at the end. No ties, no vague ratings; the last column IS the
 * "who needs the most work at this" answer.
 *
 * Reordering is tap-tap: tap a name (it arms), tap the slot it belongs in.
 * Everyone between shifts one place — same as pulling a card out of a stack
 * and sliding it back in somewhere else.
 */
export function SkillsMatrix() {
  const players = useDrumline((s) => s.players)
  const skills = useDrumline((s) => s.skills)
  const skillRanks = useDrumline((s) => s.skillRanks)
  const setSkillOrder = useDrumline((s) => s.setSkillOrder)

  const sections = sectionsOf(players)
  const [picked, setPicked] = useState<SectionName | null>(null)
  const [sel, setSel] = useState<{ skillId: string; playerId: string } | null>(null)
  const [manage, setManage] = useState<Skill | 'new' | null>(null)

  const section = picked && sections.includes(picked) ? picked : (sections[0] ?? null)
  const list = activeSkills(skills)

  if (!section) {
    return <p className="quiet-empty">Add players to the roster and the skills grid builds itself.</p>
  }

  const roster = sectionPlayers(players, section)
  const n = roster.length

  const move = (skillId: string, playerId: string, toIndex: number) => {
    const order = rankingFor(skillRanks, skillId, section, players).map((p) => p.id)
    const from = order.indexOf(playerId)
    if (from === -1 || from === toIndex) return
    order.splice(from, 1)
    order.splice(toIndex, 0, playerId)
    setSkillOrder(skillId, section, order)
  }

  return (
    <div className="skills-matrix">
      {sections.length > 1 && (
        <div className="seg section-seg">
          {sections.map((s) => (
            <button
              key={s}
              aria-pressed={s === section}
              onClick={() => {
                setPicked(s)
                setSel(null)
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {n < 2 ? (
        <p className="quiet-empty">
          Only one active player in {section} — ranking needs somebody to compare against.
        </p>
      ) : (
        <>
          <div className="sk-scroll">
            <table className="sk-table">
              <thead>
                <tr>
                  <th className="sk-corner" aria-label="Skill" />
                  {roster.map((_, i) => (
                    <th key={i} className={`sk-rank${i === n - 1 ? ' weak' : ''}`}>
                      {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((sk) => {
                  const ranked = rankingFor(skillRanks, sk.id, section, players)
                  return (
                    <tr key={sk.id}>
                      <th className="sk-skill">
                        <button className="sk-skill-btn" onClick={() => setManage(sk)}>
                          {sk.name}
                          <Pencil size={11} />
                        </button>
                      </th>
                      {ranked.map((p, i) => {
                        const armed = sel?.skillId === sk.id && sel.playerId === p.id
                        return (
                          <td key={p.id} className={i === n - 1 ? 'weak' : undefined}>
                            <button
                              className={`sk-cell${armed ? ' armed' : ''}`}
                              onClick={() => {
                                if (!sel || sel.skillId !== sk.id) {
                                  setSel({ skillId: sk.id, playerId: p.id })
                                } else if (sel.playerId === p.id) {
                                  setSel(null)
                                } else {
                                  move(sk.id, sel.playerId, i)
                                  setSel(null)
                                }
                              }}
                              aria-label={`${playerName(p)} — rank ${i + 1} of ${n} at ${sk.name}`}
                            >
                              {playerName(p)}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="sk-hint">
            1 = strongest · {n} = weakest. Tap a name, then tap the slot it belongs in.
          </p>
        </>
      )}

      <button className="btn sm ghost" onClick={() => setManage('new')}>
        <Plus size={14} /> Add skill
      </button>

      {manage && <SkillSheet skill={manage === 'new' ? null : manage} onClose={() => setManage(null)} />}
    </div>
  )
}

function SkillSheet({ skill, onClose }: { skill: Skill | null; onClose: () => void }) {
  const addSkill = useDrumline((s) => s.addSkill)
  const updateSkill = useDrumline((s) => s.updateSkill)
  const show = useToast((s) => s.show)
  const [name, setName] = useState(skill?.name ?? '')

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    if (skill) updateSkill(skill.id, { name: trimmed })
    else addSkill(trimmed)
    onClose()
  }

  const retire = () => {
    if (!skill) return
    updateSkill(skill.id, { active: false })
    show(`${skill.name} retired`, { label: 'Undo', fn: () => updateSkill(skill.id, { active: true }) })
    onClose()
  }

  return (
    <Sheet title={skill ? 'Edit skill' : 'New skill'} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <div className="field">
          <label htmlFor="skill-name">Skill name</label>
          <input
            id="skill-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Tempo changes"
            autoFocus
          />
        </div>
        <div className="sheet-actions">
          {skill && (
            <button type="button" className="btn tall ghost danger" onClick={retire}>
              Retire
            </button>
          )}
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
