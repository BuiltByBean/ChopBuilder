/**
 * Drives the metronome's scheduling wake-ups.
 *
 * This lives in a worker on purpose: Chrome throttles setInterval on a hidden
 * tab to roughly once a second, then once a minute, which would leave the
 * scheduler unable to queue clicks in time and wreck the beat the moment you
 * switch tabs. Worker timers keep running at full rate, so the metronome holds
 * tempo while you're reading something else.
 */
let timer: ReturnType<typeof setInterval> | null = null

self.onmessage = (e: MessageEvent<{ type: 'start' | 'stop'; interval?: number }>) => {
  if (e.data.type === 'start') {
    if (timer !== null) clearInterval(timer)
    timer = setInterval(() => self.postMessage('tick'), e.data.interval ?? 25)
  } else if (e.data.type === 'stop') {
    if (timer !== null) clearInterval(timer)
    timer = null
  }
}
