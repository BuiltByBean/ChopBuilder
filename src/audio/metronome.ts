/**
 * ChopBuilder metronome engine.
 *
 * Timing uses the "two clocks" approach: a coarse setInterval wakes us up
 * regularly, and on each wake-up we schedule every click that falls inside the
 * next SCHEDULE_AHEAD window directly on the AudioContext clock. The audio
 * hardware clock is sample-accurate, so clicks land exactly where they should
 * even if the main thread stutters. Never schedule clicks from setInterval
 * itself — that drifts audibly within seconds.
 */

export const BPM_MIN = 20
export const BPM_MAX = 300

export type Timbre = 'beep' | 'wood' | 'click' | 'cowbell'
export type BeatState = 'accent' | 'normal' | 'mute'
/** Notes per beat. 3 = triplets, 4 = sixteenths, 6 = sextuplets. */
export type Subdivision = 1 | 2 | 3 | 4 | 6

const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD_S = 0.12

export interface TrainerConfig {
  enabled: boolean
  /** BPM added each time the bar interval elapses. */
  amount: number
  /** How many bars to hold before stepping up. */
  everyBars: number
  /** Ramp stops here. */
  targetBpm: number
  /** Return to the starting tempo once the target is reached. */
  loop: boolean
}

export interface MetronomeSettings {
  bpm: number
  beatsPerBar: number
  subdivision: Subdivision
  timbre: Timbre
  volume: number
  /** Relative level of the in-between subdivision notes (0 mutes them). */
  subVolume: number
  accents: BeatState[]
  trainer: TrainerConfig
}

/** A click that has been scheduled but has not been heard yet. */
interface QueuedNote {
  step: number
  time: number
  beatIndex: number
  isBeat: boolean
  state: BeatState
}

export interface VisualState {
  /** Step index within the bar, or -1 when stopped. */
  step: number
  beatIndex: number
  isBeat: boolean
  state: BeatState
  /** Rises to 1 on each beat and decays — drives the pulse animation. */
  energy: number
}

export const defaultAccents = (beats: number): BeatState[] =>
  Array.from({ length: beats }, (_, i) => (i === 0 ? 'accent' : 'normal'))

export const clampBpm = (n: number) =>
  Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(n)))

type Listener = () => void

class MetronomeEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null

  private ticker: Worker | null = null
  private fallbackTimer: number | null = null
  private nextNoteTime = 0
  private step = 0
  private barsElapsed = 0
  private trainerStartBpm = 0

  private queue: QueuedNote[] = []
  private listeners = new Set<Listener>()

  running = false
  settings: MetronomeSettings = {
    bpm: 120,
    beatsPerBar: 4,
    subdivision: 1,
    timbre: 'beep',
    volume: 0.85,
    subVolume: 0.45,
    accents: defaultAccents(4),
    trainer: {
      enabled: false,
      amount: 5,
      everyBars: 4,
      targetBpm: 180,
      loop: false,
    },
  }

  private visual: VisualState = {
    step: -1,
    beatIndex: -1,
    isBeat: false,
    state: 'normal',
    energy: 0,
  }

  // --- subscriptions -------------------------------------------------------

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    this.listeners.forEach((fn) => fn())
  }

  // --- audio graph ---------------------------------------------------------

  /**
   * Browsers only allow audio to start from a user gesture, so every entry
   * point that can make noise funnels through here first.
   */
  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      const ctx = new Ctor({ latencyHint: 'interactive' })
      const master = ctx.createGain()
      master.gain.value = this.settings.volume
      master.connect(ctx.destination)

      // One shared noise buffer feeds the wood/click timbres.
      const len = Math.floor(ctx.sampleRate * 0.2)
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1

      this.ctx = ctx
      this.master = master
      this.noise = buf
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  /** Warm the audio pipeline up on first interaction so start is instant. */
  unlock() {
    this.ensureContext()
  }

  get contextState(): AudioContextState | 'closed' {
    return this.ctx?.state ?? 'closed'
  }

  // --- click synthesis -----------------------------------------------------

  private scheduleClick(time: number, state: BeatState, isBeat: boolean) {
    const ctx = this.ctx!
    const master = this.master!
    if (state === 'mute') return

    const level = isBeat
      ? state === 'accent'
        ? 1
        : 0.62
      : this.settings.subVolume * 0.55
    if (level <= 0.001) return

    const g = ctx.createGain()
    g.connect(master)

    switch (this.settings.timbre) {
      case 'beep': {
        const osc = ctx.createOscillator()
        osc.type = isBeat ? 'triangle' : 'sine'
        osc.frequency.value =
          state === 'accent' && isBeat ? 1560 : isBeat ? 1040 : 780
        const dur = isBeat ? 0.055 : 0.032
        g.gain.setValueAtTime(0.0001, time)
        g.gain.exponentialRampToValueAtTime(level, time + 0.002)
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur)
        osc.connect(g)
        osc.start(time)
        osc.stop(time + dur + 0.02)
        break
      }
      case 'wood': {
        const src = ctx.createBufferSource()
        src.buffer = this.noise!
        const bp = ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.Q.value = 9
        bp.frequency.value =
          state === 'accent' && isBeat ? 2400 : isBeat ? 1700 : 1250
        const dur = isBeat ? 0.045 : 0.028
        g.gain.setValueAtTime(level, time)
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur)
        src.connect(bp)
        bp.connect(g)
        src.start(time)
        src.stop(time + dur + 0.02)
        break
      }
      case 'click': {
        const src = ctx.createBufferSource()
        src.buffer = this.noise!
        const hp = ctx.createBiquadFilter()
        hp.type = 'highpass'
        hp.frequency.value = state === 'accent' && isBeat ? 3800 : 2600
        const dur = isBeat ? 0.02 : 0.012
        g.gain.setValueAtTime(level, time)
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur)
        src.connect(hp)
        hp.connect(g)
        src.start(time)
        src.stop(time + dur + 0.02)
        break
      }
      case 'cowbell': {
        // Classic 808 cowbell: two detuned squares through a bandpass.
        const bp = ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.value = 810
        bp.Q.value = 2.4
        const base = state === 'accent' && isBeat ? 1.0 : 0.86
        const dur = isBeat ? (state === 'accent' ? 0.22 : 0.13) : 0.06
        for (const f of [587.33, 845.5]) {
          const osc = ctx.createOscillator()
          osc.type = 'square'
          osc.frequency.value = f * base
          osc.connect(bp)
          osc.start(time)
          osc.stop(time + dur + 0.02)
        }
        g.gain.setValueAtTime(level * 0.5, time)
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur)
        bp.connect(g)
        break
      }
    }
  }

  // --- scheduling ----------------------------------------------------------

  private get stepsPerBar() {
    return this.settings.beatsPerBar * this.settings.subdivision
  }

  private advance() {
    const secondsPerBeat = 60 / this.settings.bpm
    this.nextNoteTime += secondsPerBeat / this.settings.subdivision
    this.step++

    if (this.step >= this.stepsPerBar) {
      this.step = 0
      this.barsElapsed++
      this.applyTrainer()
    }
  }

  /** Ramp the tempo once a full bar interval has gone by. */
  private applyTrainer() {
    const t = this.settings.trainer
    if (!t.enabled || t.everyBars < 1) return
    if (this.barsElapsed % t.everyBars !== 0) return

    const target = clampBpm(t.targetBpm)
    const rising = target >= this.trainerStartBpm
    const next = clampBpm(this.settings.bpm + (rising ? t.amount : -t.amount))
    const reached = rising ? next >= target : next <= target

    // Always swap in a fresh settings object — subscribers compare by identity.
    if (reached) {
      this.settings = t.loop
        ? { ...this.settings, bpm: clampBpm(this.trainerStartBpm) }
        : { ...this.settings, bpm: target, trainer: { ...t, enabled: false } }
    } else {
      this.settings = { ...this.settings, bpm: next }
    }
    this.emit()
  }

  private tick = () => {
    const ctx = this.ctx
    if (!ctx || !this.running) return
    // Some browsers suspend the context when the tab is backgrounded; nudge it
    // back rather than silently dropping the beat.
    if (ctx.state === 'suspended') void ctx.resume()

    while (this.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      const sub = this.settings.subdivision
      const isBeat = this.step % sub === 0
      const beatIndex = Math.floor(this.step / sub)
      const state: BeatState = isBeat
        ? this.settings.accents[beatIndex] ?? 'normal'
        : 'normal'

      this.scheduleClick(this.nextNoteTime, state, isBeat)
      this.queue.push({
        step: this.step,
        time: this.nextNoteTime,
        beatIndex,
        isBeat,
        state,
      })
      this.advance()
    }
  }

  // --- transport -----------------------------------------------------------

  /** Wake-ups come from a worker so a hidden tab can't throttle the beat. */
  private startTicker() {
    if (this.ticker) {
      this.ticker.postMessage({ type: 'start', interval: LOOKAHEAD_MS })
      return
    }
    try {
      const w = new Worker(new URL('./tickerWorker.ts', import.meta.url), { type: 'module' })
      w.onmessage = () => this.tick()
      w.postMessage({ type: 'start', interval: LOOKAHEAD_MS })
      this.ticker = w
    } catch {
      // Worker blocked (rare CSP setups) — a main-thread timer still keeps
      // perfect time while the tab is visible.
      this.fallbackTimer = window.setInterval(this.tick, LOOKAHEAD_MS)
    }
  }

  private stopTicker() {
    this.ticker?.postMessage({ type: 'stop' })
    if (this.fallbackTimer !== null) {
      clearInterval(this.fallbackTimer)
      this.fallbackTimer = null
    }
  }

  start() {
    if (this.running) return
    const ctx = this.ensureContext()
    this.running = true
    this.step = 0
    this.barsElapsed = 0
    this.queue = []
    this.trainerStartBpm = this.settings.bpm
    // Small offset so the very first click is scheduled, not fired late.
    this.nextNoteTime = ctx.currentTime + 0.08
    this.tick()
    this.startTicker()
    this.emit()
  }

  stop() {
    if (!this.running) return
    this.running = false
    this.stopTicker()
    this.queue = []
    this.visual = {
      step: -1,
      beatIndex: -1,
      isBeat: false,
      state: 'normal',
      energy: 0,
    }
    this.emit()
  }

  toggle() {
    this.running ? this.stop() : this.start()
  }

  /** Audition the current sound without starting the transport. */
  preview(state: BeatState = 'accent') {
    const ctx = this.ensureContext()
    this.scheduleClick(ctx.currentTime + 0.01, state, true)
  }

  // --- settings ------------------------------------------------------------

  update(patch: Partial<MetronomeSettings>) {
    const prev = this.settings
    this.settings = { ...prev, ...patch }

    if (patch.bpm !== undefined) this.settings.bpm = clampBpm(patch.bpm)

    if (patch.beatsPerBar !== undefined && patch.accents === undefined) {
      const n = patch.beatsPerBar
      const old = prev.accents
      // Preserve what the user already set when the bar grows or shrinks.
      this.settings.accents = Array.from({ length: n }, (_, i) =>
        old[i] ?? (i === 0 ? 'accent' : 'normal'),
      )
      // Keep at least one accent so the bar still has a downbeat.
      if (!this.settings.accents.some((s) => s === 'accent')) {
        this.settings.accents[0] = 'accent'
      }
    }

    if (patch.volume !== undefined && this.master && this.ctx) {
      this.master.gain.setTargetAtTime(patch.volume, this.ctx.currentTime, 0.01)
    }

    // Tempo/meter changes mid-bar: drop anything already queued past the next
    // click so the new tempo takes effect immediately rather than a bar later.
    if (
      this.running &&
      (patch.bpm !== undefined ||
        patch.beatsPerBar !== undefined ||
        patch.subdivision !== undefined)
    ) {
      this.reschedule()
    }
    this.emit()
  }

  private reschedule() {
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    if (this.step >= this.stepsPerBar) this.step = 0
    this.queue = this.queue.filter((n) => n.time <= now + 0.03)
    if (this.nextNoteTime < now) this.nextNoteTime = now + 0.03
  }

  setTrainer(patch: Partial<TrainerConfig>) {
    const trainer = { ...this.settings.trainer, ...patch }
    if (patch.enabled) this.trainerStartBpm = this.settings.bpm
    this.settings = { ...this.settings, trainer }
    this.emit()
  }

  cycleAccent(index: number) {
    const order: BeatState[] = ['accent', 'normal', 'mute']
    const accents = [...this.settings.accents]
    const cur = accents[index] ?? 'normal'
    accents[index] = order[(order.indexOf(cur) + 1) % order.length]
    this.settings = { ...this.settings, accents }
    this.emit()
  }

  // --- visuals -------------------------------------------------------------

  /**
   * Called from a rAF loop. Pops notes whose scheduled time has arrived so the
   * lights flash in sync with what you actually hear, not when we queued it.
   */
  readVisual(): VisualState {
    const ctx = this.ctx
    if (!ctx || !this.running) return this.visual

    const now = ctx.currentTime
    let changed = false
    while (this.queue.length && this.queue[0].time <= now) {
      const n = this.queue.shift()!
      this.visual = {
        step: n.step,
        beatIndex: n.beatIndex,
        isBeat: n.isBeat,
        state: n.state,
        energy: n.isBeat ? (n.state === 'accent' ? 1 : 0.72) : 0.3,
      }
      changed = true
    }
    if (!changed) {
      this.visual = { ...this.visual, energy: Math.max(0, this.visual.energy - 0.045) }
    }
    return this.visual
  }
}

/** Single shared engine so audio survives navigation between pages. */
export const metronome = new MetronomeEngine()

// Handy for poking at timing from the dev console; stripped from production.
if (import.meta.env.DEV) {
  ;(window as unknown as { metronome: MetronomeEngine }).metronome = metronome
}
