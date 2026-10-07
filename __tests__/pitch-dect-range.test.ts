/**
 * 音高检测链路的跨路径一致性回归测试
 *
 * 背景（本测试固化的三处已修缺陷）：
 *  1. TS 路径（ScriptProcessor 回退）的噪声底用 `min(rms, floor)` 只降不升、初值 0.003，
 *     门限恒为 0.0075(≈-42dBFS) → 轻弹直接检不出来。worklet 早已修掉，TS 侧漏了。
 *  2. TS 路径的 tau 搜索**没有任何范围限制** → 50/60Hz 工频哼声（含其谐波，它们同样以
 *     50/60Hz 为公共周期）会被当成概率 0.9+ 的稳定音高，足以通过 0.8 的置信门限。
 *  3. worklet 的搜索下限写死 70Hz → 应用明确支持的 4/5 弦贝斯（E1 41.20 / B0 30.87）
 *     与七弦低 B（61.74）在 web 默认路径下**完全检不出来**。
 *
 * 修法：三条路径统一「按乐器最低空弦推下限（detectFloorForLowestHz）」+ 50/60Hz 陷波，
 * 并把 worklet 窗口从 2048 提到 4096（2048 时最长可解析周期只有 1024 采样 ≈ 46.9Hz）。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  YINPitchDetection,
  getSOLOYinAnalyser,
  SOLOYinAnalyser,
  setMinDetectFreq,
  getMinDetectFreq,
  detectFloorForLowestHz,
  resetPitchDetectionState,
  MIN_DETECT_FREQ,
  MAX_DETECT_FREQ,
  detectTauRange,
} from '@/lib/pitch-detection'
import { INSTRUMENT_CONFIG } from '@/lib/practice-suggestions'

const SR = 48000
const FRAME = 128
// 与 app/page.tsx 里 AudioWorkletNode 的 processorOptions.bufferSize 一致
const WORKLET_BUFFER = 4096
const WORKLET_PATH = resolve(process.cwd(), 'public/js/audio-worklet-processor.js')

// ==================== 工具 ====================

interface WorkletHarness {
  processor: any
  messages: Array<{ type: string; data: any }>
  tick: () => void
}

function loadWorklet(opts: Record<string, unknown>): WorkletHarness {
  const src = readFileSync(WORKLET_PATH, 'utf8')
  const messages: Array<{ type: string; data: any }> = []
  class StubAudioWorkletProcessor {
    port = {
      onmessage: null as ((ev: { data: unknown }) => void) | null,
      postMessage: (msg: { type: string; data: any }) => { messages.push(msg) },
    }
  }
  let clock = 0
  const currentTime = new Proxy({}, {
    get: (_t, key): unknown => (key === 'valueOf' ? () => clock : undefined),
  }) as unknown as number
  const Processor: any = new Function(
    'AudioWorkletProcessor', 'registerProcessor', 'currentTime',
    `${src}\n;return PitchDetectionProcessor;`
  )(StubAudioWorkletProcessor, () => {}, currentTime)
  const processor = new Processor({ processorOptions: opts })
  return { processor, messages, tick: () => { clock += FRAME / SR } }
}

/** 吉他式谐波信号（基频 + 0.5/0.33/0.25 递减泛音） */
function synth(freq: number, amp: number, n: number, phase0 = 0): Float32Array {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = (i + phase0) / SR
    out[i] = amp * (
      Math.sin(2 * Math.PI * freq * t) +
      0.5 * Math.sin(2 * Math.PI * freq * 2 * t) +
      0.33 * Math.sin(2 * Math.PI * freq * 3 * t) +
      0.25 * Math.sin(2 * Math.PI * freq * 4 * t)
    )
  }
  return out
}

/** 工频哼声：基波 + 2/3 次谐波 + 少量白噪（真实哼声就带这两根谐波，只陷基波是挡不住的） */
function mainsHum(freq: number, amp: number, n: number, seed = 777): Float32Array {
  let st = seed
  const rnd = () => { st = (st * 1103515245 + 12345) & 0x7fffffff; return st / 0x3fffffff - 1 }
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    out[i] = amp * (
      Math.sin(2 * Math.PI * freq * t) +
      0.4 * Math.sin(2 * Math.PI * freq * 2 * t) +
      0.2 * Math.sin(2 * Math.PI * freq * 3 * t)
    ) + rnd() * 0.0005
  }
  return out
}

function whiteNoise(rms: number, n: number, seed = 12345): Float32Array {
  let st = seed
  const rnd = () => { st = (st * 1103515245 + 12345) & 0x7fffffff; return st / 0x3fffffff - 1 }
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = rnd()
  let s = 0
  for (let i = 0; i < n; i++) s += out[i] * out[i]
  const k = rms / Math.sqrt(s / n)
  for (let i = 0; i < n; i++) out[i] *= k
  return out
}

const cents = (det: number, truth: number) => 1200 * Math.log2(det / truth)

/** 取「检出频率」的中位数：末帧单点是取样噪声（worklet 逐帧原始估计有 ±10 音分抖动） */
function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function detectWorklet(sig: Float32Array, floor: number, thr = 0.05) {
  resetPitchDetectionState()
  const h = loadWorklet({ sampleRate: SR, bufferSize: WORKLET_BUFFER, hopSize: 512, minDetectFreq: floor })
  h.processor.port.onmessage!({ data: { type: 'updateParams', data: { threshold: thr, probabilityCliff: thr, minDetectFreq: floor } } })
  h.messages.length = 0
  const frames = Math.floor(sig.length / FRAME)
  for (let k = 0; k < frames; k++) {
    h.processor.process([[sig.subarray(k * FRAME, (k + 1) * FRAME)]], [[new Float32Array(FRAME)]], {})
    h.tick()
  }
  const hits = h.messages.filter((m) => m.type === 'pitchDetected')
  const withF = hits.filter((m) => m.data.frequency)
  return {
    hits: withF.length,
    total: hits.length,
    freq: median(withF.slice(-15).map((m) => m.data.rawFrequency as number).filter(Boolean)),
  }
}

function detectYin(sig: Float32Array, hop = 8192, thr = 0.05) {
  resetPitchDetectionState()
  const vals: number[] = []
  for (let k = 0; k < Math.floor(sig.length / hop); k++) {
    const r = YINPitchDetection(sig.subarray(k * hop, (k + 1) * hop), SR, thr, thr)
    if (r) vals.push(r.frequency)
  }
  return { hits: vals.length, freq: median(vals.slice(-15)) }
}

function detectSolo(sig: Float32Array, hop = 8192, thr = 0.2) {
  resetPitchDetectionState()
  const a: SOLOYinAnalyser = getSOLOYinAnalyser(hop, SR)
  void thr // SOLO 的接受门限是类内固定值（0.2），应用侧目前不动态下发
  const vals: number[] = []
  for (let k = 0; k < Math.floor(sig.length / hop); k++) {
    const r = a.analyze(sig.subarray(k * hop, (k + 1) * hop))
    if (r && r.valid) vals.push(r.frequency)
  }
  return { hits: vals.length, freq: median(vals.slice(-15)) }
}

const GUITAR_FLOOR = detectFloorForLowestHz(INSTRUMENT_CONFIG.six_string_guitar.lowestStringHz)
const BASS4_FLOOR = detectFloorForLowestHz(INSTRUMENT_CONFIG.four_string_bass.lowestStringHz)
const BASS5_FLOOR = detectFloorForLowestHz(INSTRUMENT_CONFIG.five_string_bass.lowestStringHz)

afterEach(() => {
  setMinDetectFreq(MIN_DETECT_FREQ) // 复位，避免污染其它测试文件
})

describe('检测下限按乐器最低空弦推导', () => {
  it('各乐器推得的下限应覆盖其最低音且不越界', () => {
    for (const [name, cfg] of Object.entries(INSTRUMENT_CONFIG)) {
      const floor = detectFloorForLowestHz(cfg.lowestStringHz)
      expect(floor, `${name} 下限不应高于自身最低空弦`).toBeLessThanOrEqual(cfg.lowestStringHz)
      expect(floor, `${name} 下限不应低于绝对下限`).toBeGreaterThanOrEqual(MIN_DETECT_FREQ)
      expect(floor).toBeLessThanOrEqual(MAX_DETECT_FREQ)
    }
  })

  it('贝斯与七弦的最低音必须显式标注（不能靠音级推导，同音级有多个八度）', () => {
    expect(INSTRUMENT_CONFIG.four_string_bass.lowestStringHz).toBeCloseTo(41.2, 1)   // E1
    expect(INSTRUMENT_CONFIG.five_string_bass.lowestStringHz).toBeCloseTo(30.87, 1)  // B0
    expect(INSTRUMENT_CONFIG.seven_string_guitar.lowestStringHz).toBeCloseTo(61.74, 1) // B1
    expect(INSTRUMENT_CONFIG.six_string_guitar.lowestStringHz).toBeCloseTo(82.41, 1)  // E2
  })

  it('吉他族下限应高于工频，贝斯族才会下探', () => {
    expect(GUITAR_FLOOR).toBeGreaterThan(60)      // 挡住 50/60Hz
    expect(BASS4_FLOOR).toBeLessThan(50)
    expect(BASS5_FLOOR).toBeLessThanOrEqual(30)
  })

  it('setMinDetectFreq 会被夹在绝对范围内', () => {
    setMinDetectFreq(1)
    expect(getMinDetectFreq()).toBe(MIN_DETECT_FREQ)
    setMinDetectFreq(99999)
    expect(getMinDetectFreq()).toBe(MAX_DETECT_FREQ)
    setMinDetectFreq(GUITAR_FLOOR)
    expect(getMinDetectFreq()).toBeCloseTo(GUITAR_FLOOR, 5)
  })
})

describe('贝斯档：低音必须可检出（原先 web 默认路径完全检不出来）', () => {
  it('五弦贝斯 B0 30.87Hz：三条路径都能检出', () => {
    setMinDetectFreq(BASS5_FLOOR)
    const f = 30.87
    const w = detectWorklet(synth(f, 0.05, WORKLET_BUFFER * 30), BASS5_FLOOR)
    const y = detectYin(synth(f, 0.05, 8192 * 14))
    const s = detectSolo(synth(f, 0.05, 8192 * 14))
    for (const [name, r] of [['worklet', w], ['TS-YIN', y], ['TS-SOLO', s]] as const) {
      expect(r.freq, `${name} 应检出 B0`).not.toBeNull()
      expect(Math.abs(cents(r.freq!, f)), `${name} B0 误差`).toBeLessThan(50)
    }
  }, 120000)

  it('四弦贝斯 E1 41.20Hz：三条路径都能检出', () => {
    setMinDetectFreq(BASS4_FLOOR)
    const f = 41.2
    const w = detectWorklet(synth(f, 0.05, WORKLET_BUFFER * 30), BASS4_FLOOR)
    const y = detectYin(synth(f, 0.05, 8192 * 14))
    const s = detectSolo(synth(f, 0.05, 8192 * 14))
    for (const [name, r] of [['worklet', w], ['TS-YIN', y], ['TS-SOLO', s]] as const) {
      expect(r.freq, `${name} 应检出 E1`).not.toBeNull()
      expect(Math.abs(cents(r.freq!, f)), `${name} E1 误差`).toBeLessThan(50)
    }
  }, 120000)

  it('七弦低 B 61.74Hz：三条路径都能检出（它是 60Hz 哼声的紧邻，仍须能分开）', () => {
    setMinDetectFreq(detectFloorForLowestHz(INSTRUMENT_CONFIG.seven_string_guitar.lowestStringHz))
    const f = 61.74
    const floor = detectFloorForLowestHz(INSTRUMENT_CONFIG.seven_string_guitar.lowestStringHz)
    const w = detectWorklet(synth(f, 0.05, WORKLET_BUFFER * 30), floor)
    const y = detectYin(synth(f, 0.05, 8192 * 14))
    const s = detectSolo(synth(f, 0.05, 8192 * 14))
    for (const [name, r] of [['worklet', w], ['TS-YIN', y], ['TS-SOLO', s]] as const) {
      expect(r.freq, `${name} 应检出 B1`).not.toBeNull()
      expect(Math.abs(cents(r.freq!, f)), `${name} B1 误差`).toBeLessThan(50)
    }
  }, 120000)
})

describe('吉他档：工频哼声不得被当成音高（含谐波的哼声也挡得住）', () => {
  it('50Hz / 60Hz 哼声：三条路径都不产生频率', () => {
    setMinDetectFreq(GUITAR_FLOOR)
    for (const humF of [50, 60]) {
      for (const amp of [0.004, 0.02]) {
        const w = detectWorklet(mainsHum(humF, amp, WORKLET_BUFFER * 30), GUITAR_FLOOR)
        const y = detectYin(mainsHum(humF, amp, 8192 * 14))
        const s = detectSolo(mainsHum(humF, amp, 8192 * 14))
        expect(w.freq, `worklet 不应把 ${humF}Hz(amp ${amp}) 哼声当音高`).toBeNull()
        expect(y.freq, `TS-YIN 不应把 ${humF}Hz(amp ${amp}) 哼声当音高`).toBeNull()
        expect(s.freq, `TS-SOLO 不应把 ${humF}Hz(amp ${amp}) 哼声当音高`).toBeNull()
      }
    }
  }, 180000)

  it('真音叠加 60Hz 哼声时，仍应报出真音而不是哼声', () => {
    setMinDetectFreq(detectFloorForLowestHz(INSTRUMENT_CONFIG.seven_string_guitar.lowestStringHz))
    const f = 61.74
    const n = 8192 * 14
    const mix = new Float32Array(n)
    const a = synth(f, 0.05, n), b = mainsHum(60, 0.02, n)
    for (let i = 0; i < n; i++) mix[i] = a[i] + b[i]
    const y = detectYin(mix)
    const s = detectSolo(mix)
    expect(y.freq).not.toBeNull()
    expect(s.freq).not.toBeNull()
    expect(Math.abs(cents(y.freq!, f))).toBeLessThan(50)
    expect(Math.abs(cents(s.freq!, f))).toBeLessThan(50)
  }, 120000)
})

describe('灵敏度：TS 路径不得比 worklet 低一档（-42dBFS 硬门限已修）', () => {
  it('轻拨（峰值 -54dBFS，RMS≈0.0017）三条路径都应检出', () => {
    setMinDetectFreq(GUITAR_FLOOR)
    const f = 110
    const amp = 0.002
    const w = detectWorklet(synth(f, amp, WORKLET_BUFFER * 30), GUITAR_FLOOR, 0.1)
    const y = detectYin(synth(f, amp, 8192 * 14), 8192, 0.1)
    const s = detectSolo(synth(f, amp, 8192 * 14))
    expect(w.freq, 'worklet 应检出轻拨').not.toBeNull()
    expect(y.freq, 'TS-YIN 应检出轻拨').not.toBeNull()
    expect(s.freq, 'TS-SOLO 应检出轻拨').not.toBeNull()
  }, 120000)

  it('静音与白噪不该被当成音高', () => {
    setMinDetectFreq(GUITAR_FLOOR)
    const silence = new Float32Array(8192 * 14)
    const noise = whiteNoise(0.01, 8192 * 14)
    expect(detectWorklet(silence, GUITAR_FLOOR).freq).toBeNull()
    expect(detectYin(silence).freq).toBeNull()
    expect(detectSolo(silence).freq).toBeNull()
    expect(detectWorklet(noise, GUITAR_FLOOR).freq).toBeNull()
    expect(detectYin(noise).freq).toBeNull()
    expect(detectSolo(noise).freq).toBeNull()
  }, 120000)
})

describe('吉他档：全音域精度', () => {
  it('E2~E5 误差应小于 20 音分（三条路径）', () => {
    setMinDetectFreq(GUITAR_FLOOR)
    for (const f of [82.41, 110.0, 146.83, 196.0, 246.94, 329.63, 659.26, 1318.51]) {
      const w = detectWorklet(synth(f, 0.05, WORKLET_BUFFER * 30), GUITAR_FLOOR)
      const y = detectYin(synth(f, 0.05, 8192 * 14))
      const s = detectSolo(synth(f, 0.05, 8192 * 14))
      expect(w.freq, `worklet ${f}Hz 应检出`).not.toBeNull()
      expect(y.freq, `TS-YIN ${f}Hz 应检出`).not.toBeNull()
      expect(s.freq, `TS-SOLO ${f}Hz 应检出`).not.toBeNull()
      expect(Math.abs(cents(w.freq!, f)), `worklet ${f}Hz 误差`).toBeLessThan(20)
      expect(Math.abs(cents(y.freq!, f)), `TS-YIN ${f}Hz 误差`).toBeLessThan(20)
      expect(Math.abs(cents(s.freq!, f)), `TS-SOLO ${f}Hz 误差`).toBeLessThan(20)
    }
  }, 300000)
})

describe('worklet 的搜索带与 TS 侧一致', () => {
  /** 驱动 worklet，取最后一帧 pitchDetected 里的诊断字段 band=[minTau,maxTau] */
  function workletBand(floor: number, bufferSize = WORKLET_BUFFER) {
    const h = loadWorklet({ sampleRate: SR, bufferSize, hopSize: 512, minDetectFreq: floor })
    h.processor.port.onmessage!({ data: { type: 'updateParams', data: { threshold: 0.1, probabilityCliff: 0.1, minDetectFreq: floor } } })
    h.messages.length = 0
    const sig = synth(110, 0.1, bufferSize * 4)
    for (let k = 0; k < Math.floor(sig.length / FRAME); k++) {
      h.processor.process([[sig.subarray(k * FRAME, (k + 1) * FRAME)]], [[new Float32Array(FRAME)]], {})
      h.tick()
    }
    const withBand = h.messages.filter((m) => m.type === 'pitchDetected' && m.data.band)
    return withBand.length ? (withBand[withBand.length - 1].data.band as [number, number]) : null
  }

  it('worklet 上报的 [minTau,maxTau] 应等于 detectTauRange（吉他档）', () => {
    setMinDetectFreq(GUITAR_FLOOR)   // detectTauRange 读的是模块级下限，先对齐
    const band = workletBand(GUITAR_FLOOR)
    expect(band).not.toBeNull()
    const expected = detectTauRange(SR, WORKLET_BUFFER / 2 - 1)
    expect(band![0]).toBe(expected.minTau)
    expect(band![1]).toBe(expected.maxTau)
  }, 120000)

  it('贝斯档应把 maxTau 放宽到能覆盖 B0（27.5Hz → tau≈1745）', () => {
    setMinDetectFreq(BASS5_FLOOR)
    const band = workletBand(BASS5_FLOOR)
    expect(band).not.toBeNull()
    const guitarBand = workletBand(GUITAR_FLOOR)
    expect(band![1]).toBeGreaterThan(guitarBand![1])           // 下限更低 → maxTau 更大
    // maxTau 由 floor(sr/下限) 得来，所以可解析的最低频率不高于（略高等于）下限
    expect(SR / band![1]).toBeGreaterThanOrEqual(BASS5_FLOOR)
    expect(SR / band![1]).toBeLessThan(BASS5_FLOOR * 1.01)     // 且不该比下限宽松太多
  }, 180000)
})

describe('前置滤波：工频陷波只吃工频，不动乐器音域', () => {
  /** 直接测 worklet 前置滤波链的幅度响应（dB） */
  function filterGainDb(freq: number): number {
    const h = loadWorklet({ sampleRate: SR, bufferSize: WORKLET_BUFFER, hopSize: 512 })
    const p = h.processor
    const n = 16384
    const buf = new Float32Array(n)
    for (let i = 0; i < n; i++) buf[i] = Math.sin(2 * Math.PI * freq * i / SR)
    const out = p._prefilterBuffer(buf)
    let si = 0, so = 0
    for (let i = n / 2; i < n; i++) { si += buf[i] * buf[i]; so += out[i] * out[i] }
    return 10 * Math.log10(so / si)
  }

  it('50/60Hz 应被显著衰减，乐器音域几乎无影响', () => {
    expect(filterGainDb(50)).toBeLessThan(-15)
    expect(filterGainDb(60)).toBeLessThan(-15)
    for (const f of [82.41, 110, 196, 440, 1000]) {
      expect(Math.abs(filterGainDb(f)), `${f}Hz 不应被明显衰减`).toBeLessThan(1)
    }
  }, 120000)
})
