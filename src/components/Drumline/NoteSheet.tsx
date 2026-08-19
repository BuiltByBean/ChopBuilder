import { useCallback, useEffect, useRef, useState } from 'react'
import { NOTE_TAGS, playerName, type NoteTag } from '../../db/drumline'
import { orderedCheckpoints, useDrumline } from '../../state/useDrumline'
import { usePrefs } from '../../state/usePrefs'
import { useToast } from '../../state/useToast'
import { Sheet } from '../Sheet'
import { Mic } from '../icons'

/**
 * The 25-seconds-between-reps capture surface. Open → field is focused →
 * type or speak → tap a tag. The tag IS the save button; the sheet closes
 * itself and an undo toast covers mistakes. No confirmations, ever.
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

export function NoteSheet({
  playerId,
  defaultCheckpointId = null,
  onClose,
}: {
  /** null → a section-wide note. */
  playerId: string | null
  defaultCheckpointId?: string | null
  onClose: () => void
}) {
  const players = useDrumline((s) => s.players)
  const checkpoints = useDrumline((s) => s.checkpoints)
  const addNote = useDrumline((s) => s.addNote)
  const removeNote = useDrumline((s) => s.removeNote)
  const rehearsalBpm = usePrefs((s) => s.rehearsalBpm)
  const show = useToast((s) => s.show)

  const [body, setBody] = useState('')
  const [cpLink, setCpLink] = useState(defaultCheckpointId ?? '')
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const player = playerId ? players.find((p) => p.id === playerId) : null
  const title = player ? playerName(player) : 'Section note'

  useEffect(() => {
    areaRef.current?.focus()
  }, [])

  const appendSpoken = useCallback((text: string) => {
    if (!text) return
    setBody((b) => (b ? `${b.replace(/\s+$/, '')} ${text}` : text))
  }, [])
  const { supported, listening, toggle } = useSpeech(appendSpoken)

  const save = (tag: NoteTag) => {
    const trimmed = body.trim()
    if (!trimmed) return
    try {
      localStorage.setItem(LAST_TAG_KEY, tag)
    } catch {
      /* ignore */
    }
    const note = addNote({
      playerId,
      body: trimmed,
      tag,
      checkpointId: cpLink || null,
      bpm: rehearsalBpm,
    })
    show(`Saved — ${tag}`, { label: 'Undo', fn: () => removeNote(note.id) })
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Power path: Ctrl/Cmd+Enter re-uses the last tag.
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      let last: NoteTag = 'Technique'
      try {
        const raw = localStorage.getItem(LAST_TAG_KEY)
        if (raw && (NOTE_TAGS as readonly string[]).includes(raw)) last = raw as NoteTag
      } catch {
        /* ignore */
      }
      save(last)
    }
  }

  const ready = !!body.trim()

  return (
    <Sheet
      title={title}
      onClose={onClose}
      meta={rehearsalBpm ? <span className="bpm-stamp">@ {rehearsalBpm} BPM</span> : undefined}
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
            aria-label={listening ? 'Stop dictation' : 'Dictate note'}
            aria-pressed={listening}
          >
            <Mic size={20} />
          </button>
        )}
      </div>

      <div className="tag-grid" aria-label="Save with tag">
        {NOTE_TAGS.map((tag) => (
          <button
            key={tag}
            className={`tag-chip tag-${tag === 'Win' ? 'win' : 'std'}`}
            disabled={!ready}
            onClick={() => save(tag)}
          >
            {tag}
          </button>
        ))}
      </div>
      <p className="tag-hint">{ready ? 'Tap a tag to save' : 'Type or dictate, then tap a tag'}</p>

      {checkpoints.some((c) => c.active) && (
        <div className="field note-cp">
          <label htmlFor="note-cp">Link checkpoint (optional)</label>
          <select
            id="note-cp"
            className="input"
            value={cpLink}
            onChange={(e) => setCpLink(e.target.value)}
          >
            <option value="">None</option>
            {orderedCheckpoints(checkpoints).map((c) => (
              <option key={c.id} value={c.id}>
                P{c.phase} · {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </Sheet>
  )
}
