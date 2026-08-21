import { useCallback, useEffect, useRef, useState } from 'react'
import { NOTE_TAGS, playerName, type Note, type NoteTag } from '../../db/drumline'
import {
  fmtDay,
  fromDateInput,
  orderedCheckpoints,
  sameLocalDay,
  toDateInput,
  useDrumline,
} from '../../state/useDrumline'
import { usePrefs } from '../../state/usePrefs'
import { useToast } from '../../state/useToast'
import { Sheet } from '../Sheet'
import { PickerField } from '../PickerSheet'
import { Mic, Trash } from '../icons'

/**
 * The 25-seconds-between-reps capture surface. Open → field is focused →
 * type or speak → Save. Tags are a single-select row (your last tag comes
 * preselected, so a repeat note is type-then-save). Saving closes the sheet;
 * an undo toast covers mistakes. No confirmations, ever.
 *
 * Pass `edit` to reuse the same sheet for fixing an old note — everything
 * becomes editable, including which player it belongs to, and Delete lives
 * here too (undo toast, not a confirm).
 */

// Minimal typings for the Web Speech API (not in lib.dom).
interface SRAlternative {
  transcript: string
}
interface SRResult {
  isFinal: boolean
  0: SRAlternative
}
interface SREvent {
  resultIndex: number
  results: { length: number; [i: number]: SRResult }
}
interface SR {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SREvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
}

function speechCtor(): (new () => SR) | null {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SR) | null
}

function useSpeech(onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const recRef = useRef<SR | null>(null)
  const supported = !!speechCtor()

  const stop = useCallback(() => {
    recRef.current?.stop()
    recRef.current = null
    setListening(false)
  }, [])

  const toggle = useCallback(() => {
    if (recRef.current) {
      stop()
      return
    }
    const Ctor = speechCtor()
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = navigator.language || 'en-US'
    rec.continuous = true
    rec.interimResults = false
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal && r[0]) onText(r[0].transcript.trim())
      }
    }
    rec.onend = () => {
      recRef.current = null
      setListening(false)
    }
    rec.onerror = rec.onend
    try {
      rec.start()
      recRef.current = rec
      setListening(true)
    } catch {
      setListening(false)
    }
  }, [onText, stop])

  useEffect(() => stop, [stop])

  return { supported, listening, toggle }
}

const LAST_TAG_KEY = 'chopbuilder:lastNoteTag'

function readLastTag(): NoteTag | null {
  try {
    const raw = localStorage.getItem(LAST_TAG_KEY)
    return raw && (NOTE_TAGS as readonly string[]).includes(raw) ? (raw as NoteTag) : null
  } catch {
    return null
  }
}

export function NoteSheet({
  playerId = null,
  defaultCheckpointId = null,
  edit,
  onClose,
}: {
  /** null → a section-wide note. Ignored in edit mode. */
  playerId?: string | null
  defaultCheckpointId?: string | null
  /** Existing note to edit instead of capturing a new one. */
  edit?: Note
  onClose: () => void
}) {
  const players = useDrumline((s) => s.players)
  const checkpoints = useDrumline((s) => s.checkpoints)
  const addNote = useDrumline((s) => s.addNote)
  const removeNote = useDrumline((s) => s.removeNote)
  const updateNote = useDrumline((s) => s.updateNote)
  const restoreNote = useDrumline((s) => s.restoreNote)
  const rehearsalBpm = usePrefs((s) => s.rehearsalBpm)
  const show = useToast((s) => s.show)

  const [body, setBody] = useState(edit?.body ?? '')
  const [tag, setTag] = useState<NoteTag | null>(edit ? edit.tag : readLastTag())
  const [cpLink, setCpLink] = useState(edit ? (edit.checkpointId ?? '') : (defaultCheckpointId ?? ''))
  // For notes typed up after the fact — defaults to today, costs zero taps live.
  const [noteDate, setNoteDate] = useState(() => toDateInput(edit ? edit.createdAt : Date.now()))
  // Edit mode can move a note to another player (or to the whole section).
  const [notePlayer, setNotePlayer] = useState(edit ? (edit.playerId ?? '') : '')
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const player = playerId ? players.find((p) => p.id === playerId) : null
  const title = edit ? 'Edit note' : player ? playerName(player) : 'Section note'

  useEffect(() => {
    // Focus must happen inside the opening tap's gesture window — iOS refuses
    // to raise the keyboard for a focus() that arrives later (a delay here
    // once left the sheet keyboard-less entirely). preventScroll stops iOS
    // from panning the page to "reveal" the field; the docked sheet already
    // shows it, and sheet + keyboard now ease upward as one motion.
    areaRef.current?.focus({ preventScroll: true })
  }, [])

  // Buttons tapped mid-typing must not steal focus from the textarea — a
  // stolen focus drops the keyboard and the whole sheet bounces. preventDefault
  // on mousedown keeps focus put while the click still fires.
  const keepKeyboard = (e: React.MouseEvent) => e.preventDefault()

  const appendSpoken = useCallback((text: string) => {
    if (!text) return
    setBody((b) => (b ? `${b.replace(/\s+$/, '')} ${text}` : text))
  }, [])
  const { supported, listening, toggle } = useSpeech(appendSpoken)

  const ready = !!body.trim() && !!tag

  const save = () => {
    const trimmed = body.trim()
    if (!trimmed || !tag) return
    try {
      localStorage.setItem(LAST_TAG_KEY, tag)
    } catch {
      /* ignore */
    }
    // A changed date stamps the note at that day's local noon, so it sorts and
    // attaches to that day's session instead of "whenever I typed it up".
    const picked = noteDate ? fromDateInput(noteDate) : Date.now()

    if (edit) {
      const before = { ...edit }
      updateNote(edit.id, {
        body: trimmed,
        tag,
        checkpointId: cpLink || null,
        playerId: notePlayer || null,
        createdAt: sameLocalDay(picked, edit.createdAt) ? edit.createdAt : picked,
      })
      show('Note updated', { label: 'Undo', fn: () => updateNote(before.id, before) })
      onClose()
      return
    }

    const backdated = !sameLocalDay(picked, Date.now())
    const note = addNote({
      playerId,
      body: trimmed,
      tag,
      checkpointId: cpLink || null,
      bpm: rehearsalBpm,
      createdAt: backdated ? picked : Date.now(),
    })
    show(backdated ? `Saved to ${fmtDay(picked)} — ${tag}` : `Saved — ${tag}`, {
      label: 'Undo',
      fn: () => removeNote(note.id),
    })
    onClose()
  }

  const del = () => {
    if (!edit) return
    const copy = { ...edit }
    removeNote(edit.id)
    show('Note deleted', { label: 'Undo', fn: () => restoreNote(copy) })
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Power path: Ctrl/Cmd+Enter saves without leaving the keyboard.
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      save()
    }
  }

  const phaseGroups = (() => {
    const ordered = orderedCheckpoints(checkpoints)
    const groups: { label: string; options: { value: string; label: string }[] }[] = []
    for (const c of ordered) {
      const label = `Phase ${c.phase}`
      const last = groups[groups.length - 1]
      const opt = { value: c.id, label: c.name }
      if (last && last.label === label) last.options.push(opt)
      else groups.push({ label, options: [opt] })
    }
    return groups
  })()

  const metaBpm = edit ? edit.bpm : rehearsalBpm

  return (
    <Sheet
      title={title}
      onClose={onClose}
      meta={metaBpm ? <span className="bpm-stamp">@ {metaBpm} BPM</span> : undefined}
    >
      <div className="note-input-row">
        <textarea
          ref={areaRef}
          className="input note-area"
          rows={3}
          placeholder={player ? 'What did you see?' : 'What did the line do?'}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {supported && (
          <button
            className={`mic-btn${listening ? ' live' : ''}`}
            onClick={toggle}
            onMouseDown={keepKeyboard}
            aria-label={listening ? 'Stop dictation' : 'Dictate note'}
            aria-pressed={listening}
          >
            <Mic size={20} />
          </button>
        )}
      </div>

      <div className="tag-grid" role="radiogroup" aria-label="Tag">
        {NOTE_TAGS.map((t) => (
          <button
            key={t}
            role="radio"
            aria-checked={tag === t}
            className={`tag-chip${t === 'Win' ? ' tag-win' : ''}${tag === t ? ' on' : ''}`}
            onClick={() => setTag(tag === t ? null : t)}
            onMouseDown={keepKeyboard}
          >
            {t}
          </button>
        ))}
      </div>

      {edit && (
        <div className="note-cp">
          <PickerField
            id="note-player"
            label="About"
            title="Who is this note about?"
            value={notePlayer}
            groups={[
              {
                options: players
                  .filter((p) => p.active || p.id === edit.playerId)
                  .map((p) => ({ value: p.id, label: playerName(p), meta: p.instrument })),
              },
            ]}
            onChange={setNotePlayer}
            noneLabel="Whole section"
          />
        </div>
      )}

      <div className="form-row note-cp">
        {phaseGroups.length > 0 && (
          <div className="grow">
            <PickerField
              id="note-cp"
              label="Link checkpoint (optional)"
              title="Link a checkpoint"
              value={cpLink}
              groups={phaseGroups}
              onChange={setCpLink}
              noneLabel="None"
            />
          </div>
        )}
        <div className="field date-field">
          <label htmlFor="note-date">Rehearsal day</label>
          <input
            id="note-date"
            className="input"
            type="date"
            value={noteDate}
            max={toDateInput(Date.now())}
            onChange={(e) => setNoteDate(e.target.value)}
          />
        </div>
      </div>

      <div className="sheet-actions note-save-row">
        {edit && (
          <button className="btn tall ghost danger note-delete" onClick={del} onMouseDown={keepKeyboard}>
            <Trash size={15} />
          </button>
        )}
        <button className="btn tall primary" disabled={!ready} onClick={save} onMouseDown={keepKeyboard}>
          {ready ? (edit ? 'Save changes' : `Save — ${tag}`) : !body.trim() ? 'Type or dictate first' : 'Pick a tag'}
        </button>
      </div>
    </Sheet>
  )
}
