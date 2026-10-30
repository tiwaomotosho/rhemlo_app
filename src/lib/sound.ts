// Small synthesised sounds (no audio files). Off until the learner turns them on, and never the
// only signal: every sound duplicates a visible label.
import { useStore } from './store'

let ctx: AudioContext | null = null
const tone = (freq: number, at: number, dur: number, type: OscillatorType = 'sine', gain = .12) => {
  ctx ??= new AudioContext(); const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + at
  o.type = type; o.frequency.setValueAtTime(freq, t); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .015); g.gain.exponentialRampToValueAtTime(.0001, t + dur)
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + .02)
}
const SOUNDS: Record<string, () => void> = {
  correct: () => { tone(660, 0, .14, 'triangle'); tone(990, .09, .22, 'triangle') },
  wrong: () => { tone(330, 0, .18, 'sine', .09); tone(262, .12, .26, 'sine', .08) },
  complete: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .1, .3, 'triangle', .1)),
  tap: () => tone(880, 0, .05, 'square', .03),
  tick: () => tone(1200, 0, .03, 'square', .025),
}
export function play(name: keyof typeof SOUNDS) {
  if (!useStore.getState().prefs.sound) return
  try { SOUNDS[name]() } catch { /* audio unavailable */ }
}
