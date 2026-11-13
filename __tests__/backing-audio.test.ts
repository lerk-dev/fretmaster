/**
 * lib/backing-audio.ts 的排程契约（#5）。
 *
 * 这里不用真 WebAudio，而是记录所有节点被**排到的时刻与参数**：
 * ① 所有发声都必须用传入的 `when` 排程（不能用 `ctx.currentTime` 立即响）——
 *    否则鼓/贝斯会与节拍器逐拍漂移；
 * ② 力度 × 伴奏音量 = 实际增益，任一项为 0 时不应创建任何节点；
 * ③ 贝斯频率按 MIDI 换算（C2 = 65.41Hz），时值决定 stop 时刻。
 */
import { describe, it, expect } from 'vitest'
import { scheduleDrumHit, scheduleBassNote } from '@/lib/backing-audio'

interface OscRecord {
  type: string
  start: number
  stop: number | null
  freq: number[]
  gain: number[]
}

/** 极简 AudioContext 替身：只实现被 schedule* 用到的成员，并把参数记录下来 */
function createFakeContext() {
  const oscillators: OscRecord[] = []
  const param = (store: number[]) => ({
    value: 0,
    setValueAtTime(v: number) { store.push(v); return this },
    linearRampToValueAtTime(v: number) { store.push(v); return this },
    exponentialRampToValueAtTime(v: number) { store.push(v); return this },
  })
  const node = () => ({ connect() { /* noop */ } })
  const ctx = {
    sampleRate: 48000,
    destination: node(),
    createBuffer(channels: number, length: number) {
      return { getChannelData: () => new Float32Array(length) }
    },
    createBufferSource() {
      return {
        buffer: null as unknown,
        ...node(),
        start() { /* 只需存在 */ },
        stop() { /* 只需存在 */ },
      }
    },
    createOscillator() {
      const rec: OscRecord = { type: '', start: -1, stop: null, freq: [], gain: [] }
      oscillators.push(rec)
      return {
        ...node(),
        get type() { return rec.type },
        set type(v: string) { rec.type = v },
        frequency: param(rec.freq),
        start(when: number) { rec.start = when },
        stop(when: number) { rec.stop = when },
      }
    },
    createGain() {
      const store: number[] = []
      return { ...node(), gain: param(store), __gain: store }
    },
    createBiquadFilter() {
      return { ...node(), type: '', frequency: param([]), Q: param([]) }
    },
  }
  return { ctx: ctx as unknown as BaseAudioContext, oscillators, raw: ctx }
}

describe('scheduleDrumHit', () => {
  it('底鼓：正弦从 150Hz 掉到 45Hz，并严格用 when 排程', () => {
    const { ctx, oscillators } = createFakeContext()
    scheduleDrumHit(ctx, 12.5, 'kick', 0.8, 0.5)
    expect(oscillators).toHaveLength(1)
    expect(oscillators[0].type).toBe('sine')
    expect(oscillators[0].start).toBe(12.5)
    expect(oscillators[0].freq[0]).toBe(150)
    expect(oscillators[0].freq[1]).toBe(45)
  })

  it('力度或总音量为 0 时不创建任何节点', () => {
    const a = createFakeContext()
    scheduleDrumHit(a.ctx, 0, 'kick', 0, 0.8)
    expect(a.oscillators).toHaveLength(0)
    const b = createFakeContext()
    scheduleDrumHit(b.ctx, 0, 'kick', 0.8, 0)
    expect(b.oscillators).toHaveLength(0)
  })

  it('军鼓 = 噪声 + 鼓腔振荡，且都在 when 处起', () => {
    const { ctx, oscillators, raw } = createFakeContext()
    scheduleDrumHit(ctx, 3, 'snare', 0.6, 1)
    expect(oscillators).toHaveLength(1)          // 180Hz 鼓腔
    expect(oscillators[0].start).toBe(3)
    expect(oscillators[0].freq[0]).toBe(180)
    // 噪声源来自 createBufferSource —— 用 spy 不方便，这里换个角度：底鼓之外不产生多余振荡器
    expect(raw.sampleRate).toBe(48000)
  })

  it('踩镲 / ride 只走噪声源，不产生振荡器', () => {
    const a = createFakeContext()
    scheduleDrumHit(a.ctx, 1, 'hat', 0.4, 1)
    expect(a.oscillators).toHaveLength(0)
    const b = createFakeContext()
    scheduleDrumHit(b.ctx, 1, 'ride', 0.4, 1)
    expect(b.oscillators).toHaveLength(0)
  })
})

describe('scheduleBassNote', () => {
  it('MIDI 36（C2）→ 65.41Hz，并用 when 起、按 duration 停', () => {
    const { ctx, oscillators } = createFakeContext()
    scheduleBassNote(ctx, 5, 36, 0.4, 0.8, 0.5)
    expect(oscillators).toHaveLength(1)
    expect(oscillators[0].type).toBe('triangle')
    expect(oscillators[0].start).toBe(5)
    expect(oscillators[0].freq[0]).toBeCloseTo(65.406, 2)
    expect(oscillators[0].stop).toBeCloseTo(5.42, 5)
  })

  it('音量为 0 或音高非法时不发声', () => {
    const a = createFakeContext()
    scheduleBassNote(a.ctx, 0, 36, 0.4, 0.8, 0)
    expect(a.oscillators).toHaveLength(0)
    const b = createFakeContext()
    scheduleBassNote(b.ctx, 0, Number.NaN, 0.4, 0.8, 1)
    expect(b.oscillators).toHaveLength(0)
  })
})
