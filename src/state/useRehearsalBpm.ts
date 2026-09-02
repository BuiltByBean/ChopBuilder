import { useMetronome } from './useMetronome'

/**
 * The tempo to stamp on a note or status change: whatever the metronome is
 * clicking right now, or nothing. A stopped click means no stamp — a guess
 * on the record is worse than a blank.
 */
export function useRehearsalBpm(): number | null {
  const { settings, running } = useMetronome()
  return running ? settings.bpm : null
}
