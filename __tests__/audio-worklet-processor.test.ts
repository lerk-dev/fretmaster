/**
 * AudioWorklet 音高检测处理器探针测试（任务 #23）
 *
 * public/js/audio-worklet-processor.js 运行在 AudioWorkletGlobalScope，
 * 这里用 stub 替代 AudioWorkletProcessor / registerProcessor / currentTime 后直接加载源码，
 * 驱动 process() 验证：
 * 1. updateParams 消息能修改检测门限（#23 接线：page.tsx 会在低频目标时推送 0.05/0.05）
 * 2. 中频（A2 110Hz）与低频（E2 82.41Hz）合成信号能被正确检测
 * 3. 纯静音不产生频率输出（能量门限仍然生效）
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WORKLET_PATH = resolve(process.cwd(), 'public/js/audio-worklet-processor.js')

interface PitchDetectedData {
  frequency: number | null
  probability: number
  clarity: number
  energy: number
  hasSignal: boolean
  [k: string]: unknown
}

interface Message {
  type: string
  data: PitchDetectedData
}

interface WorkletHarness {
  processor: any
  messages: Message[]
  /** 推进 worklet 的 currentTime（每帧调一次） */
  tick: () => void
}

const FRAME = 128
const SR = 48000

function loadProcessor(processorOptions: Record<string, unknown>): WorkletHarness {
  const src = readFileSync(WORKLET_PATH, 'utf8')
  const messages: Message[] = []

  class StubAudioWorkletProcessor {
    port = {
      onmessage: null as ((ev: { data: unknown }) => void) | null,
      postMessage: (msg: Message) => {
        messages.push(msg)
      },
    }
  }

  let clock = 0
  // ⚠️ currentTime 必须是**每次读取都得到新的原始数值**，不能用 Proxy 冒充。
  // 真实 AudioWorkletGlobalScope 里它是一个只读 double；而 Proxy 的 valueOf 虽然能参与
  // 算术，但一旦被存进状态（`this.lastNoteOnsetTime = now`）就存下了 Proxy 本身，
  // 之后 `now - this.lastNoteOnsetTime` 变成「同一个 Proxy 减自己」= 恒 0
  // ⇒ 不应期判定永远不通过、起音只能报出第一次。
  // 所以这里把它定义成 globalThis 上的 getter，让源码里的自由变量 currentTime
  // 走作用域链解析到它（不再作为 new Function 的形参传入）。
  Object.defineProperty(globalThis, 'currentTime', {
    configurable: true,
    get: () => clock,
  })

  const factory = new Function(
    'AudioWorkletProcessor',
    'registerProcessor',
    `${src}\n;return PitchDetectionProcessor;`
  )
  const Processor = factory(
    StubAudioWorkletProcessor,
    () => {}
  ) as new (opts: { processorOptions: Record<string, unknown> }) => any

  const processor = new Processor({ processorOptions })
  return {
    processor,
    messages,
    tick: () => {
      clock += FRAME / SR
    },
  }
}

/** 合成吉他谐波信号（基频 + 2/3/4 次衰减泛音） */
function synth(freq: number, amplitude: number, n: number): Float32Array {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    out[i] =
      amplitude *
      (Math.sin(2 * Math.PI * freq * t) * 1.0 +
        Math.sin(2 * Math.PI * freq * 2 * t) * 0.5 +
        Math.sin(2 * Math.PI * freq * 3 * t) * 0.33 +
        Math.sin(2 * Math.PI * freq * 4 * t) * 0.25)
  }
  return out
}

/** 在合成信号上叠加确定性伪随机底噪，模拟真实拾音环境（可复现） */
let noiseSeed = 99991
function withNoise(sig: Float32Array, rms: number): Float32Array {
  const out = new Float32Array(sig.length)
  const a = rms * Math.sqrt(3) // 均匀分布 [-a,a] 的 RMS = a/√3
  for (let i = 0; i < sig.length; i++) {
    noiseSeed = (noiseSeed * 1103515245 + 12345) & 0x7fffffff
    out[i] = sig[i] + ((noiseSeed / 0x7fffffff) * 2 - 1) * a
  }
  return out
}

/** 以 128 样本帧驱动 process()，返回期间收到的带有效频率的 pitchDetected 消息 */
function drive(h: WorkletHarness, signal: Float32Array) {
  h.messages.length = 0
  const frames = Math.floor(signal.length / FRAME)
  for (let f = 0; f < frames; f++) {
    const frame = signal.subarray(f * FRAME, (f + 1) * FRAME)
    h.processor.process([[frame]], [[new Float32Array(FRAME)]], {})
    h.tick()
  }
  return h.messages.filter((m) => m.type === 'pitchDetected' && m.data.frequency)
}

describe('AudioWorklet 音高检测处理器（探针）', () => {
  let h: WorkletHarness

  beforeAll(() => {
    h = loadProcessor({ sampleRate: SR, bufferSize: 2048, hopSize: 512 })
  })

  it('默认门限：threshold=0.15 / probabilityCliff=0.1', () => {
    expect(h.processor.yinThreshold).toBeCloseTo(0.15, 9)
    expect(h.processor.yinProbabilityCliff).toBeCloseTo(0.1, 9)
  })

  it('updateParams 消息能修改门限（#23 接线依赖此通道）', () => {
    h.processor.port.onmessage!({ data: { type: 'updateParams', data: { threshold: 0.05, probabilityCliff: 0.05 } } })
    expect(h.processor.yinThreshold).toBeCloseTo(0.05, 9)
    expect(h.processor.yinProbabilityCliff).toBeCloseTo(0.05, 9)
    h.processor.port.onmessage!({ data: { type: 'updateParams', data: { threshold: 0.1, probabilityCliff: 0.1 } } })
    expect(h.processor.yinThreshold).toBeCloseTo(0.1, 9)
    expect(h.processor.yinProbabilityCliff).toBeCloseTo(0.1, 9)
  })

  it('A2 110Hz（常规参数 0.1/0.1）能被正确检测', () => {
    drive(h, synth(110, 0.05, 2048)) // 预热一整窗，让噪声底/滤波器状态稳定
    const hits = drive(h, synth(110, 0.05, 2048 * 4))
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.some((m) => Math.abs(m.data.frequency! - 110) < 2)).toBe(true)
  })

  it('E2 82.41Hz（低频动态参数 0.05/0.05）能被正确检测', () => {
    h.processor.port.onmessage!({ data: { type: 'updateParams', data: { threshold: 0.05, probabilityCliff: 0.05 } } })
    drive(h, synth(82.41, 0.05, 2048))
    const hits = drive(h, synth(82.41, 0.05, 2048 * 4))
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.some((m) => Math.abs(m.data.frequency! - 82.41) < 2)).toBe(true)
  })

  it('纯静音不产生频率输出（能量门限仍生效）', () => {
    h.processor.port.onmessage!({ data: { type: 'updateParams', data: { threshold: 0.1, probabilityCliff: 0.1 } } })
    drive(h, new Float32Array(2048 * 6))
    const hits = drive(h, new Float32Array(2048 * 4))
    expect(hits.length).toBe(0)
  })

  /**
   * 回归：环境底噪抬起后的能量门限（noiseFloor × 1.5，原 2.5）
   *
   * 真实用户场景 —— 空调/风扇/声卡底噪让 noiseFloor 收敛到 ~0.008(-42dBFS) 后，
   * 旧系数 2.5 的门限是 0.02，轻拨（本用例 -33dBFS 峰值 0.022）整段被丢，
   * 用户表现为「要弹得比较响才有反应」。系数 1.5 后门限 0.012，该类轻拨可正常检出。
   * 量化依据见 .workbuddy/tools/scan-sensitivity.cjs 的「底噪 × 信号幅度」扫描矩阵。
   */
  it('环境底噪下的轻拨仍能越过能量门限（噪声底门限系数回归）', () => {
    const NF = 0.012 // 稳态底噪 ≈ -38dBFS
    const h2 = loadProcessor({ sampleRate: SR, bufferSize: 4096, hopSize: 512, minDetectFreq: 70 })
    h2.processor.port.onmessage!({ data: { type: 'updateParams', data: { threshold: 0.1, probabilityCliff: 0.1 } } })
    h2.processor.noiseFloor = NF

    // 峰值 0.022 的谐波信号叠加底噪后 RMS ≈ 0.020：
    //   > 1.5 × NF (0.018)  → 系数 1.5 时越过能量门限
    //   < 2.5 × NF (0.030)  → 系数 2.5 时整段被丢（旧行为，用户表现为「要弹得响」）
    const sig = withNoise(synth(196, 0.022, 2048 * 5), NF)
    h2.messages.length = 0
    const frames = Math.floor(sig.length / FRAME)
    for (let f = 0; f < frames; f++) {
      const frame = sig.subarray(f * FRAME, (f + 1) * FRAME)
      h2.processor.process([[frame]], [[new Float32Array(FRAME)]], {})
      h2.tick()
    }

    // 断言能量门限这一层（hasSignal），与下游 YIN/概率无关
    const withSignal = h2.messages.filter((m) => m.type === 'pitchDetected' && m.data.hasSignal)
    expect(withSignal.length).toBeGreaterThan(0)
  })
})

/**
 * 起音（onset）检测探针 —— isNoteOnset 这条信号此前**发了没人用**，现在被
 * lib/note-confirm.ts 的 confirmNote 消费（起音到达时清空多帧一致的确认记忆）。
 *
 * 这里钉住三件事，每一件都对应一个真实的错误实现：
 *  1. 静音里拨弦必须报出起音 —— 原实现 `diff > 0.15`（≈ −16dBFS）下恒为 false；
 *  2. 稳态长音不得反复报起音 —— 用 EMA 基线就会（每过一个不应期重新满足倍数条件）；
 *  3. 检测必须排在噪声门**之前** —— 否则门限以下的帧不更新基线，
 *     「响 → 静音 → 再响」的第二次拨弦判不出起音（基线还停在上一轮的有声电平）。
 */
describe('AudioWorklet 起音检测（探针）', () => {
  /** 逐帧驱动，返回「过了噪声门」的帧的 (频率, 起音标志) 序列 */
  function driveGatePassing(h: WorkletHarness, signal: Float32Array) {
    h.messages.length = 0
    const frames = Math.floor(signal.length / FRAME)
    for (let f = 0; f < frames; f++) {
      const frame = signal.subarray(f * FRAME, (f + 1) * FRAME)
      h.processor.process([[frame]], [[new Float32Array(FRAME)]], {})
      h.tick()
    }
    return h.messages
      .filter((m) => m.type === 'pitchDetected' && m.data.hasSignal)
      .map((m) => ({ onset: !!m.data.isNoteOnset, freq: m.data.frequency }))
  }

  function newHarness() {
    const g = loadProcessor({ sampleRate: SR, bufferSize: 2048, hopSize: 512, minDetectFreq: 70 })
    g.processor.port.onmessage!({ data: { type: 'updateParams', data: { threshold: 0.1, probabilityCliff: 0.1 } } })
    return g
  }

  /** 长期静音，把噪声底与基线压到最低 */
  const silence = (h: WorkletHarness) => driveGatePassing(h, new Float32Array(FRAME * 200))

  it('① 回归：静音后拨弦能报出起音（原 0.15 绝对阈值下恒为 false）', () => {
    const g = newHarness()
    silence(g)
    const seq = driveGatePassing(g, synth(110, 0.05, 2048 * 6))
    const onsets = seq.filter((s) => s.onset)
    expect(seq.length).toBeGreaterThan(0)
    expect(onsets.length).toBeGreaterThanOrEqual(1)
  })

  it('①b 起音只出现在这一拨的开头，不是每帧都报', () => {
    const g = newHarness()
    silence(g)
    const seq = driveGatePassing(g, synth(110, 0.05, 2048 * 6))
    const firstOnset = seq.findIndex((s) => s.onset)
    expect(firstOnset).toBeGreaterThanOrEqual(0)
    // 开头 4 帧内就应报出（hop 512 / 48000 ≈ 10.7ms ⇒ 约 43ms 内）
    expect(firstOnset).toBeLessThanOrEqual(4)
  })

  it('② 稳态长音不反复报起音（EMA 基线实现会在这里失败）', () => {
    const g = newHarness()
    silence(g)
    // 先充分预热，让 2048 窗被完整填满、RMS 进入平台期
    driveGatePassing(g, synth(110, 0.05, 2048 * 10))
    // 平台期再跑一大段：一次都不应再有起音
    const seq = driveGatePassing(g, synth(110, 0.05, 2048 * 20))
    expect(seq.length).toBeGreaterThan(0)
    expect(seq.filter((s) => s.onset).length).toBe(0)
  })

  it('🚨 ③ 检测在噪声门之前：响 → 长静音 → 再响，第二次拨弦仍报起音', () => {
    const g = newHarness()
    silence(g)
    const first = driveGatePassing(g, synth(110, 0.05, 2048 * 8))
    expect(first.filter((s) => s.onset).length).toBeGreaterThanOrEqual(1)

    // 长静音：若起音检测排在噪声门之后，这段静音不会更新基线，
    // 基线会一直停在上一轮的有声电平上
    silence(g)
    g.processor.port.onmessage!({ data: { type: 'updateParams', data: { threshold: 0.1, probabilityCliff: 0.1 } } })
    const second = driveGatePassing(g, synth(110, 0.05, 2048 * 8))
    expect(second.length).toBeGreaterThan(0)
    expect(second.filter((s) => s.onset).length).toBeGreaterThanOrEqual(1)
  })

  it('不应期生效：同一段内两次上升沿的间隔小于 75ms 时只报一次', () => {
    const g = newHarness()
    silence(g)
    // 一段 6 窗（≈256ms）的持续音，onset 数量必须远小于帧数
    const seq = driveGatePassing(g, synth(110, 0.05, 2048 * 6))
    expect(seq.filter((s) => s.onset).length).toBeLessThanOrEqual(2)
  })

  /**
   * 🚨 不应期的精确契约（直接驱动检测方法，绕开 2048 窗对电平的抹平）。
   *
   * 上面那条"一段持续音"的用例**咬不住去掉不应期**：拨弦的上升沿本身只有一次
   * （2048 窗把幅度变化摊到 4 个 hop 上，第 2 个 hop 的比值就掉到 1.41 < 1.45），
   * 之后平台期比值为 1.0 —— 全程本来就只报一次，删掉不应期也不会有第二次。
   * 所以这里用显式电平时序直接钉住：75ms 内必须被挡，超过才放行。
   */
  it('🚨 不应期：75ms 内的第二次上升沿被抑制，超过后放行（直接驱动检测方法）', () => {
    const g = newHarness()
    const GATE = 0.0008
    g.processor.lastAmplitude = null
    g.processor.lastNoteOnsetTime = -Infinity

    expect(g.processor._detectAmplitudeDiff(0.0002, GATE, 0)).toBe(false)     // 首帧只建立基线
    expect(g.processor._detectAmplitudeDiff(0.02, GATE, 0.01)).toBe(true)     // 第 1 次上升沿
    expect(g.processor._detectAmplitudeDiff(0.0002, GATE, 0.02)).toBe(false)  // 回落（低于门限）
    expect(g.processor._detectAmplitudeDiff(0.02, GATE, 0.05)).toBe(false)    // +40ms，仍在不应期内
    expect(g.processor._detectAmplitudeDiff(0.0002, GATE, 0.06)).toBe(false)
    expect(g.processor._detectAmplitudeDiff(0.02, GATE, 0.09)).toBe(true)     // +80ms，放行
  })

  /**
   * 🚨 从静音起的整段拨弦只能报**一次**起音。
   *
   * 这条是 EMA 基线实现的照妖镜：用 EMA 时基线会从 0 缓慢爬向信号电平，
   * 爬升过程持续约 100ms（> 75ms 不应期），于是在不应期刚过的那一刻
   * `rms > baseline × 1.45` 会重新成立 ⇒ 一次拨弦报出两次起音。
   * 帧间原始 RMS 比较没有这个问题（平台期比值为 1.0）。
   */
  it('🚨 整段拨弦只报一次起音（EMA 基线实现会报两次）', () => {
    const g = newHarness()
    silence(g)
    const seq = driveGatePassing(g, synth(110, 0.05, 2048 * 30))
    expect(seq.length).toBeGreaterThan(0)
    expect(seq.filter((s) => s.onset).length).toBe(1)
  })

  it('起音参数可经 processorOptions 覆盖（默认 1.45 / 0.5 / 75ms）', () => {
    const g = newHarness()
    expect(g.processor.onsetRelativeRatio).toBeCloseTo(1.45, 9)
    expect(g.processor.onsetGateDeltaRatio).toBeCloseTo(0.5, 9)
    expect(g.processor.onsetRefractoryMs).toBeCloseTo(75, 9)

    const g2 = loadProcessor({
      sampleRate: SR, bufferSize: 2048, hopSize: 512,
      onsetRelativeRatio: 2.0, onsetGateDeltaRatio: 0.25, onsetRefractoryMs: 40,
    })
    expect(g2.processor.onsetRelativeRatio).toBeCloseTo(2.0, 9)
    expect(g2.processor.onsetGateDeltaRatio).toBeCloseTo(0.25, 9)
    expect(g2.processor.onsetRefractoryMs).toBeCloseTo(40, 9)
  })

  it('死字段已清掉：minNoteInterval / amplitudeDiffThreshold 不再存在', () => {
    const g = newHarness()
    expect(g.processor.minNoteInterval).toBeUndefined()
    expect(g.processor.amplitudeDiffThreshold).toBeUndefined()
  })
})
