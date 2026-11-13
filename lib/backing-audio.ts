// 伴奏音色（#5）：鼓 + 贝斯的**合成**版本。
//
// 为什么不加载采样：
//  ① 离线/静态导出环境下要多带一堆音频文件，而这里只需要「有没有律动」，音色够用即可；
//  ② 合成器完全由参数控制，音量/力度/时值都统一走 `masterGain × velocity`，
//     不会出现「采样峰值不同导致某件鼓特别响」这类问题。
//
// 🚨 所有函数都接收**音频时钟时刻** `when`（`AudioContext.currentTime` 的时间轴），
// 由 `hooks/use-metronome-scheduler.ts` 的 lookahead 提前排程 —— 不要在内部用
// `ctx.currentTime` 立即发声，那会让鼓/贝斯与节拍器逐拍漂移。
import { logger } from '@/lib/logger'
import type { DrumInstrument } from '@/lib/style-patterns'

/** 噪声源长度（秒）：打一次军鼓/踩镲最多用几十毫秒，1 秒足够，且只需生成一次。 */
const NOISE_SECONDS = 1
const noiseByContext = new WeakMap<BaseAudioContext, AudioBuffer>()

/** 每个 ctx 只生成一次白噪声（军鼓 / 踩镲 / ride 共用）。 */
function getNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseByContext.get(ctx)
  if (cached) return cached
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  noiseByContext.set(ctx, buffer)
  return buffer
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0))

/**
 * 排一记鼓。
 * @param when        音频时钟时刻（秒）
 * @param velocity    hit 表里的力度（0..1）
 * @param masterGain  伴奏音量百分比换算出的总增益（0..1）
 */
export function scheduleDrumHit(
  ctx: BaseAudioContext,
  when: number,
  instrument: DrumInstrument,
  velocity: number,
  masterGain: number
): void {
  const level = clamp01(velocity) * clamp01(masterGain)
  if (level <= 0) return

  if (instrument === 'kick') {
    // 底鼓：正弦从 150Hz 掉到 45Hz，听感就是「咚」
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, when)
    osc.frequency.exponentialRampToValueAtTime(45, when + 0.09)
    osc.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(level * 0.9, when)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.18)
    osc.start(when)
    osc.stop(when + 0.2)
    return
  }

  if (instrument === 'snare') {
    // 军鼓 = 噪声（高频）+ 一点 180Hz 鼓腔共鸣
    const noise = ctx.createBufferSource()
    noise.buffer = getNoiseBuffer(ctx)
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()
    filter.type = 'highpass'
    filter.frequency.setValueAtTime(1500, when)
    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(level * 0.5, when)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.16)
    noise.start(when)
    noise.stop(when + 0.18)

    const body = ctx.createOscillator()
    const bodyGain = ctx.createGain()
    body.type = 'triangle'
    body.frequency.setValueAtTime(180, when)
    body.connect(bodyGain)
    bodyGain.connect(ctx.destination)
    bodyGain.gain.setValueAtTime(level * 0.15, when)
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.08)
    body.start(when)
    body.stop(when + 0.1)
    return
  }

  if (instrument === 'hat') {
    // 踩镲：高通噪声，极短
    const noise = ctx.createBufferSource()
    noise.buffer = getNoiseBuffer(ctx)
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()
    filter.type = 'highpass'
    filter.frequency.setValueAtTime(6000, when)
    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(level * 0.3, when)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05)
    noise.start(when)
    noise.stop(when + 0.06)
    return
  }

  // ride：带通噪声 + 较长衰减，比踩镲「金属、绵长」
  const noise = ctx.createBufferSource()
  noise.buffer = getNoiseBuffer(ctx)
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(8000, when)
  filter.Q.setValueAtTime(1.2, when)
  noise.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  gain.gain.setValueAtTime(level * 0.24, when)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.28)
  noise.start(when)
  noise.stop(when + 0.3)
}

/**
 * 排一个贝斯音。
 * @param midi        音高（C4 = 60）
 * @param durationSec 时值（秒），由 hit 的 lengthSubs 换算
 */
export function scheduleBassNote(
  ctx: BaseAudioContext,
  when: number,
  midi: number,
  durationSec: number,
  velocity: number,
  masterGain: number
): void {
  const level = clamp01(velocity) * clamp01(masterGain)
  if (level <= 0 || !Number.isFinite(midi)) return
  try {
    const osc = ctx.createOscillator()
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(440 * Math.pow(2, (midi - 69) / 12), when)
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(700, when)
    osc.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    const sustain = Math.max(0.08, durationSec)
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.linearRampToValueAtTime(level * 0.5, when + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + sustain)
    osc.start(when)
    osc.stop(when + sustain + 0.02)
  } catch (error) {
    logger.debug('伴奏贝斯发声失败（已忽略）', error)
  }
}
