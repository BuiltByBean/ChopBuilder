import { useMetronome, useBeat } from '../../state/useMetronome'

/**
 * One pad per beat in the bar. Clicking a pad cycles accent → normal → muted,
 * which is how you build a practice pattern (e.g. accent 1 and 3 only).
 */
export function BeatLights({ compact = false }: { compact?: boolean }) {
  const { settings, cycleAccent } = useMetronome()
  const beat = useBeat()

  return (
    <div className="beats" role="group" aria-label="Beats in the bar">
      {settings.accents.map((state, i) => {
        const lit = beat.isBeat && beat.beatIndex === i
        const subHit = !beat.isBeat && beat.beatIndex === i
        return (
          <button
            key={`${i}-${lit ? beat.tick : 'idle'}`}
            className={`beat${lit ? ' lit' : ''}${subHit ? ' subhit' : ''}`}
            data-state={state}
            onClick={() => cycleAccent(i)}
            title={`Beat ${i + 1} — ${state} (click to change)`}
            aria-label={`Beat ${i + 1}, ${state}`}
          >
            {i + 1}
            {settings.subdivision > 1 && !compact && (
              <span className="sub-pips">
                {Array.from({ length: settings.subdivision - 1 }, (_, k) => (
                  <i key={k} />
                ))}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
