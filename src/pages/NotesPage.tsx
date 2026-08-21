import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { NOTE_TAGS, playerName, type Note, type NoteTag } from '../db/drumline'
import { fmtDay, fmtTime, useDrumline } from '../state/useDrumline'
import { NoteSheet } from '../components/Drumline/NoteSheet'
import { PickerField } from '../components/PickerSheet'
import { Check, Pencil } from '../components/icons'

type Scope = 'open' | 'resolved' | 'all'

/**
 * Every note in the app, newest first — the answer to "where did my note go".
 * One tap from the rehearsal bar. Player notes and section notes together,
 * filterable by tag, resolve/reopen inline.
 */
export function NotesPage() {
  const notes = useDrumline((s) => s.notes)
  const players = useDrumline((s) => s.players)
  const checkpoints = useDrumline((s) => s.checkpoints)
  const setNoteResolved = useDrumline((s) => s.setNoteResolved)

  const [scope, setScope] = useState<Scope>('open')
  const [tagFilter, setTagFilter] = useState<NoteTag | null>(null)
  const [whoFilter, setWhoFilter] = useState('')
  const [query, setQuery] = useState('')
  const [editNote, setEditNote] = useState<Note | null>(null)

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const cpById = useMemo(() => new Map(checkpoints.map((c) => [c.id, c])), [checkpoints])

  const openCount = useMemo(() => notes.filter((n) => !n.resolved).length, [notes])

  const list = useMemo(() => {
    let l = notes
    if (scope === 'open') l = l.filter((n) => !n.resolved)
    else if (scope === 'resolved') l = l.filter((n) => n.resolved)
    if (tagFilter) l = l.filter((n) => n.tag === tagFilter)
    if (whoFilter === 'section') l = l.filter((n) => n.playerId === null)
    else if (whoFilter) l = l.filter((n) => n.playerId === whoFilter)
    const q = query.trim().toLowerCase()
    if (q) l = l.filter((n) => n.body.toLowerCase().includes(q))
    return [...l].sort((a, b) => b.createdAt - a.createdAt)
  }, [notes, scope, tagFilter, whoFilter, query])

  return (
    <div className="dl-page">
      <div className="page-head">
        <h2 className="page-title">Notes</h2>
        <div className="seg scope-seg">
          {(['open', 'resolved', 'all'] as const).map((s) => (
            <button key={s} aria-pressed={scope === s} onClick={() => setScope(s)}>
              {s === 'open' ? `Open (${openCount})` : s === 'resolved' ? 'Resolved' : 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="note-search-row">
        <input
          className="input note-search"
          type="search"
          placeholder="Search notes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoCapitalize="off"
        />
        <div className="note-who">
          <PickerField
            id="note-who"
            label=""
            title="Whose notes?"
            value={whoFilter}
            groups={[
              { options: [{ value: 'section', label: 'Section notes' }] },
              {
                options: players
                  .filter((p) => p.active)
                  .map((p) => ({ value: p.id, label: playerName(p), meta: p.instrument })),
              },
            ]}
            onChange={setWhoFilter}
            noneLabel="Everyone"
          />
        </div>
      </div>

      <div className="tag-filter">
        <button
          className={`filter-chip${tagFilter === null ? ' active' : ''}`}
          onClick={() => setTagFilter(null)}
        >
          All tags
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

      {notes.length === 0 && (
        <p className="quiet-empty">
          Nothing here yet — notes save to this device. On the Rehearsal screen, tap a player (or
          Section note), type or dictate, pick a tag, Save. They all land here.
        </p>
      )}
      {notes.length > 0 && list.length === 0 && (
        <p className="quiet-empty">No {scope !== 'all' ? scope : ''} notes{tagFilter ? ` tagged ${tagFilter}` : ''}.</p>
      )}

      <div className="note-list">
        {list.map((n) => {
          const p = n.playerId ? byId.get(n.playerId) : null
          const cp = n.checkpointId ? cpById.get(n.checkpointId) : null
          return (
            <article key={n.id} className={`note-card${n.resolved ? ' resolved' : ''}`}>
              <div className="note-top">
                {p ? (
                  <Link to={`/player/${p.id}`} className="note-player">
                    {playerName(p)}
                  </Link>
                ) : (
                  <span className="note-player section">Section</span>
                )}
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
              {cp && <p className="note-cp-link">→ {cp.name}</p>}
            </article>
          )
        })}
      </div>

      {editNote && <NoteSheet edit={editNote} onClose={() => setEditNote(null)} />}
    </div>
  )
}
