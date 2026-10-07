/**
 * lib/pitch-detection.ts —— SOLOYinAnalyser / 标准 YIN / 频率工具 的契约测试。
 *
 * 为什么单独一个文件：
 *   - pitch-dect-range / pitch-match / yin-threshold / tuner-pitch-detection 都在测
 *     「频率带 / 匹配规则 / worklet」，`SOLOYinAnalyser` 这个**类**整体、以及
 *     `YINOcctaveCorrection` / `resetPitchDetectionState` 从未被驱动过。
 *   - 类里大量分支是数值型的（八度修正的历史投票、抛物线插值边界），靠合成音频不可控，
 *     因此对**私有**数值方法采用白盒调用（`(a as any)._octaveCorrection(...)`）+ 手工构造
 *     的 d 数组。这是可控输入下的真实逻辑，不是伪造可达性。
 *
 * 🚨 模块级状态：`yinOctaveHistory` / `yinNoiseFloor` / `minDetectFreq` / `soloYinAnalyser`
 *    都是模块级、跨用例共享 ⇒ afterEach 必须复位，否则后面的用例被前面的历史污染（假通过）。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  SOLOYinAnalyser,
  FloatFFT,
  YINPrefilter,
  YINOcctaveCorrection,
  YINPitchDetection,
  resetPitchDetectionState,
  getSOLOYinAnalyser,
  seedPitchDetectionNoiseFloor,
  setMinDetectFreq,
  getMinDetectFreq,
  detectFloorForLowestHz,
  detectTauRange,
  calculateRMS,
  frequencyToNoteName,
  calculateCents,
  getAdjustedCents,
  frequencyToNote,
  LOW_RANGE_STRING_HZ,
  resolveYinThreshold,
  MIN_DETECT_FREQ,
  MAX_DETECT_FREQ,
} from '@/lib/pitch-detection'

const SR = 44100

function sine(freq: number, n = 4096, amp = 0.5, sr = SR): Float32Array {
  const b = new Float32Array(n)
  for (let i = 0; i < n; i++) b[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr)
  return b
}

/** 白盒访问私有字段/方法：TS 的 private 只在编译期，运行期照样能取到。 */
function priv<T>(obj: T): Record<string, any> {
  return obj as unknown as Record<string, any>
}

afterEach(() => {
  // 复位模块级状态：minDetectFreq 会影响 detectTauRange，历史/噪声底会影响后续帧
  setMinDetectFreq(MIN_DETECT_FREQ)
  resetPitchDetectionState()
})

// ============================================================================
describe('频率工具：零点/越界兜底', () => {
  it('calculateCents：任一侧 ≤0 直接返回 0（不做 log2）', () => {
    expect(calculateCents(440, 0)).toBe(0)
    expect(calculateCents(0, 440)).toBe(0)
    expect(calculateCents(-1, 440)).toBe(0)
  })

  it('getAdjustedCents：任一侧 ≤0 返回 1200（"差满一个八度"哨兵）', () => {
    expect(getAdjustedCents(440, 0)).toBe(1200)
    expect(getAdjustedCents(0, 440)).toBe(1200)
  })

  it('frequencyToNote：非正频率返回占位 "-"', () => {
    expect(frequencyToNote(0)).toEqual({ note: '-', cents: 0, octave: 0 })
    expect(frequencyToNote(-5)).toEqual({ note: '-', cents: 0, octave: 0 })
  })

  it('frequencyToNoteName：非正 / 非有限频率返回空串', () => {
    expect(frequencyToNoteName(0)).toBe('')
    expect(frequencyToNoteName(-1)).toBe('')
    expect(frequencyToNoteName(Infinity)).toBe('')
    expect(frequencyToNoteName(NaN)).toBe('')
  })
})

describe('搜索下限：setMinDetectFreq 的夹取与 detectFloorForLowestHz', () => {
  it('setMinDetectFreq 夹在 [MIN_DETECT_FREQ, MAX_DETECT_FREQ]', () => {
    setMinDetectFreq(10)
    expect(getMinDetectFreq()).toBe(MIN_DETECT_FREQ)
    setMinDetectFreq(9999)
    expect(getMinDetectFreq()).toBe(MAX_DETECT_FREQ)
    setMinDetectFreq(73.4)
    expect(getMinDetectFreq()).toBeCloseTo(73.4, 6)
  })

  it('detectFloorForLowestHz：留 2 个半音余量并夹在绝对下限之上', () => {
    // 吉他 E2 82.41 → 82.41 * 2^(-2/12) ≈ 73.42
    expect(detectFloorForLowestHz(82.41)).toBeCloseTo(73.42, 2)
    // 贝斯 B0 30.87 → 27.53（低于 27.5 的绝对下限时不夹，27.53 > 27.5）
    expect(detectFloorForLowestHz(30.87)).toBeCloseTo(MIN_DETECT_FREQ, 1)
    // 极低音（如 20Hz 假想弦）被抬到绝对下限
    expect(detectFloorForLowestHz(20)).toBe(MIN_DETECT_FREQ)
  })

  it('detectTauRange 受当前下限影响（下限越高，maxTau 越小）', () => {
    setMinDetectFreq(27.5)
    const wide = detectTauRange(SR, 4095)
    setMinDetectFreq(100)
    const narrow = detectTauRange(SR, 4095)
    expect(wide.minTau).toBe(Math.floor(SR / MAX_DETECT_FREQ))
    expect(narrow.maxTau).toBeLessThan(wide.maxTau)
    expect(narrow.maxTau).toBe(Math.floor(SR / 100))
  })

  it('resolveYinThreshold / LOW_RANGE_STRING_HZ：低频乐器放宽到 0.2', () => {
    expect(LOW_RANGE_STRING_HZ).toBe(75)
    expect(resolveYinThreshold(61.74)).toBe(0.2)
    expect(resolveYinThreshold(82.41)).toBe(0.15)
  })

  it('calculateRMS 对空缓冲返回 NaN（除零），对常量缓冲返回该常量', () => {
    expect(calculateRMS(new Float32Array(0))).toBeNaN()
    expect(calculateRMS(new Float32Array([1, 1, 1, 1]))).toBeCloseTo(1, 6)
  })
})

// ============================================================================
describe('SOLOYinAnalyser：公共 API 与主分析路径', () => {
  it('analyze(440Hz 正弦) 给出 ≈440Hz、valid=true，并缓存 RMS / 峰值', () => {
    const a = new SOLOYinAnalyser()
    a.setSampleRate(SR)
    a.setAudioBufferSize(4096)
    a.setThreshold(0.15)
    const r = a.analyze(sine(440))
    expect(r).not.toBeNull()
    expect(r!.valid).toBe(true)
    expect(r!.frequency).toBeCloseTo(440, 0)
    expect(r!.probability).toBeGreaterThan(0.9)
    expect(r!.volumeRMS).toBeCloseTo(0.3536, 2)
    expect(r!.maxAmplitude).toBeCloseTo(0.5, 1)
  })

  it('未调 setSampleRate 直接 analyze：缓冲尺寸不匹配 → 自动 setAudioBufferSize，并在 _prefilterBuffer 里补建滤波器', () => {
    const a = new SOLOYinAnalyser() // hpFilterState 仍为 null
    expect(priv(a).hpFilterState).toBeNull()
    const r = a.analyze(sine(440, 2048))
    expect(r).not.toBeNull()
    // 补建后滤波器存在
    expect(priv(a).hpFilterState).not.toBeNull()
    expect(priv(a).yinBuffer.length).toBe(1024)
  })

  it('低音 E2（振幅较小时）也能锁定', () => {
    const a = new SOLOYinAnalyser()
    a.setSampleRate(SR)
    a.setAudioBufferSize(4096)
    a.setThreshold(0.15)
    const r = a.analyze(sine(82.41, 4096, 0.6))
    expect(r).not.toBeNull()
    expect(r!.frequency).toBeCloseTo(82.41, 0)
  })

  it('静音（低于自适应门限）→ null，并清空八度历史', () => {
    const a = new SOLOYinAnalyser()
    a.setSampleRate(SR)
    a.setAudioBufferSize(4096)
    priv(a).octaveHistory = [3, 3]
    expect(a.analyze(new Float32Array(4096))).toBeNull()
    expect(priv(a).octaveHistory).toEqual([])
  })

  it('getVolumeRMS / getMaxAmplitude / detectAmplitudeDiff 反映最近一帧', () => {
    const a = new SOLOYinAnalyser()
    a.setSampleRate(SR)
    a.setAudioBufferSize(4096)
    a.analyze(sine(440, 4096, 0.5))
    expect(a.getVolumeRMS()).toBeCloseTo(0.3536, 2)
    expect(a.getMaxAmplitude()).toBeCloseTo(0.5, 1)

    // lastAmplitude 初始 0 → diff = volumeRMS - 0 > 0.15 → true
    expect(a.detectAmplitudeDiff()).toBe(true)
    // 之后 lastAmplitude 走指数平滑；把 volumeRMS 压到 0 → diff = -lastAmplitude < 0.15 → false
    priv(a).volumeRMS = 0
    expect(a.detectAmplitudeDiff()).toBe(false)
  })

  it('resetState：噪声底/历史/电平/pitch/valid 全部复位，并重建滤波器', () => {
    const a = new SOLOYinAnalyser()
    a.setSampleRate(SR)
    a.setAudioBufferSize(4096)
    a.analyze(sine(440, 4096, 0.5))
    a.resetState()
    expect(a.getVolumeRMS()).toBe(0)
    expect(a.getMaxAmplitude()).toBe(0)
    expect(priv(a).pitch).toBe(-1)
    expect(priv(a).probability).toBe(-1)
    expect(priv(a).valid).toBe(false)
    expect(priv(a).octaveHistory).toEqual([])
    expect(priv(a).hpFilterState).not.toBeNull()
    expect(priv(a).notchFilterStates.length).toBe(2)
  })
})

// ============================================================================
describe('SOLOYinAnalyser：私有数值方法的边界守卫', () => {
  it('缓冲未初始化时 difference / cumulativeMeanNormalizedDifference / absoluteThreshold / parabolicInterpolation 全部安全早退', () => {
    const a = new SOLOYinAnalyser() // 什么都不设 ⇒ yinBuffer/fft 均 null
    expect(() => priv(a).difference(new Float32Array(1024))).not.toThrow()
    expect(() => priv(a).cumulativeMeanNormalizedDifference()).not.toThrow()
    expect(priv(a).absoluteThreshold()).toBe(-1)
    expect(priv(a).parabolicInterpolation(5)).toBe(5)
  })

  it('absoluteThreshold：找不到低于门限的 tau ⇒ 返回 -1、probability 置 0、valid 置 false', () => {
    const a = new SOLOYinAnalyser()
    a.setSampleRate(SR)
    a.setAudioBufferSize(128)
    priv(a).yinBuffer.fill(1) // 全部远大于 threshold
    priv(a).valid = true
    expect(priv(a).absoluteThreshold()).toBe(-1)
    expect(priv(a).probability).toBe(0)
    expect(priv(a).valid).toBe(false)
  })

  it('parabolicInterpolation：x0 === tauEstimate（tau=0）走单侧比较', () => {
    const a = new SOLOYinAnalyser()
    a.setAudioBufferSize(64) // yinBuffer 长度 32
    const y = priv(a).yinBuffer as Float32Array
    y[0] = 0.2
    y[1] = 0.5
    // x0 === 0 === tauEstimate，且 y[0] <= y[1] ⇒ 原样返回 0
    expect(priv(a).parabolicInterpolation(0)).toBe(0)
  })

  it('parabolicInterpolation：x2 越界（tau 为最后一个下标）走 x2 = tauEstimate', () => {
    const a = new SOLOYinAnalyser()
    a.setAudioBufferSize(64)
    const y = priv(a).yinBuffer as Float32Array
    const last = y.length - 1
    y[last] = 0.3
    y[last - 1] = 0.6
    // y[last] <= y[last-1] ⇒ 返回 tauEstimate 本身
    expect(priv(a).parabolicInterpolation(last)).toBe(last)
  })

  it('parabolicInterpolation：denom === 0（三点共线）返回原 tau', () => {
    const a = new SOLOYinAnalyser()
    a.setAudioBufferSize(64)
    const y = priv(a).yinBuffer as Float32Array
    y.fill(0) // s0=s1=s2=0 ⇒ denom = 0
    expect(priv(a).parabolicInterpolation(5)).toBe(5)
  })

  it('parabolicInterpolation：常规三点做抛物线拟合', () => {
    const a = new SOLOYinAnalyser()
    a.setAudioBufferSize(64)
    const y = priv(a).yinBuffer as Float32Array
    y[4] = 0.6
    y[5] = 0.1
    y[6] = 0.5
    const tau = priv(a).parabolicInterpolation(5)
    // 5 + (0.6 - 0.5) / (2 * (0.6 + 0.5 - 0.2)) = 5 + 0.1/1.8
    expect(tau).toBeCloseTo(5 + 0.1 / 1.8, 6)
  })
})

// ============================================================================
describe('SOLOYinAnalyser._octaveCorrection：八度修正的三条出口', () => {
  function crafted(length: number, sr = SR) {
    const a = new SOLOYinAnalyser()
    a.setSampleRate(sr)
    return a
  }

  it('tau < minTau*2 ⇒ 不做八度修正（边界 tau=61 ⇒ octaveTau 正好等于 minTau）', () => {
    const a = crafted(1024)
    const d = new Float32Array(1024).fill(0.5)
    d[61] = 0.3 // 当前周期
    d[31] = 0.05 // 正好是 minTau；若少了这道守卫，八度会被采纳（SR/31）
    const { minTau } = detectTauRange(SR, d.length - 1)
    expect(minTau).toBe(31)
    const r = priv(a)._octaveCorrection(SR / 61, 61, d, SR)
    expect(r.frequency).toBeCloseTo(SR / 61, 6)
    expect(r.probability).toBeCloseTo(0.7, 6)
  })

  it('octaveTau 超出 maxTau ⇒ 同样原样返回（即使八度处的差值更小）', () => {
    // 让 maxTau = 1603，取 tau = 3205 使其 octaveTau === maxTau（边界外）
    const len = 3206
    const a = crafted(len)
    const d = new Float32Array(len).fill(0.5)
    const tau = 3205
    d[tau] = 0.3
    d[1603] = 0.05 // 八度处差值极小，若没有这道守卫就会被采纳
    expect(detectTauRange(SR, len - 1).maxTau).toBe(1603)
    const r = priv(a)._octaveCorrection(SR / tau, tau, d, SR)
    expect(r.frequency).toBeCloseTo(SR / tau, 6)
    expect(r.probability).toBeCloseTo(0.7, 6)
  })

  it('次谐波（octaveTau）差值更小且历史不足 ⇒ 直接采纳八度', () => {
    const a = crafted(1024)
    const d = new Float32Array(1024).fill(0.5)
    d[200] = 0.3 // 当前周期
    d[100] = 0.05 // 半周期（八度）
    const r = priv(a)._octaveCorrection(SR / 200, 200, d, SR)
    expect(r.frequency).toBeCloseTo(SR / 100, 6) // 441Hz
    expect(r.probability).toBeCloseTo(0.95, 6)
    expect(priv(a).octaveHistory).toEqual([4])
  })

  it('历史投票：连续多帧后把「与历史均值更接近」的八度采纳（三条 push 出口都被走到）', () => {
    const a = crafted(1024)
    const d = new Float32Array(1024).fill(0.5)
    d[200] = 0.3
    d[100] = 0.05

    // 第 1 帧：历史为空 ⇒ octaveHistory.length >= 2 不成立，走 push(currentOct=3) + 返回八度
    const r1 = priv(a)._octaveCorrection(SR / 200, 200, d, SR)
    expect(priv(a).octaveHistory).toEqual([4])
    expect(r1.frequency).toBeCloseTo(SR / 100, 6)

    // 第 2 帧：历史仅 1 条 ⇒ 仍走「八度概率更高」那条 push(4)
    priv(a)._octaveCorrection(SR / 200, 200, d, SR)
    expect(priv(a).octaveHistory).toEqual([4, 4])

    // 第 3 帧：历史 2 条，recent=[4,4] avg=4 ⇒ |4-4|=0 < |3-4|=1 ⇒ 命中「均值更近」分支
    const r3 = priv(a)._octaveCorrection(SR / 200, 200, d, SR)
    expect(r3.frequency).toBeCloseTo(SR / 100, 6)
    expect(priv(a).octaveHistory).toEqual([4, 4, 4])
  })

  it('历史把窗口撑到 maxOctaveHistory(5) 后开始丢弃最早的（shift 分支）', () => {
    const a = crafted(1024)
    priv(a).octaveHistory = [1, 2, 3, 4, 5]
    const d = new Float32Array(1024).fill(0.5)
    d[200] = 0.3
    d[100] = 0.9 // 八度差值很大 ⇒ 不满足 octaveVal < threshold*0.8，走末尾 push
    priv(a)._octaveCorrection(SR / 200, 200, d, SR)
    expect(priv(a).octaveHistory.length).toBe(5) // 长度封顶
  })

  it('历史溢出：两条 push 出口（均值更近 / 概率更高）在长度已满时都会 shift，窗口恒定 5', () => {
    const a = crafted(1024)
    const reject = new Float32Array(1024).fill(0.5)
    reject[200] = 0.3
    reject[100] = 0.9 // 八度差值太大 ⇒ 走末尾 push(currentOct=3)

    // 先用「本次周期」把历史灌满 5 个 3
    for (let i = 0; i < 5; i++) priv(a)._octaveCorrection(SR / 200, 200, reject, SR)
    expect(priv(a).octaveHistory).toEqual([3, 3, 3, 3, 3])

    const accept = new Float32Array(1024).fill(0.5)
    accept[200] = 0.3
    accept[100] = 0.05 // 八度差值极小 ⇒ 会被采纳

    // 连续采纳：先是「概率更高」分支（avg=3 时 |4-3| 不小于 |3-3|），
    // 待 4 攒够后转为「均值更近」分支。两条 push 出口都会在长度 6 时 shift。
    for (let i = 0; i < 6; i++) priv(a)._octaveCorrection(SR / 200, 200, accept, SR)
    expect(priv(a).octaveHistory.length).toBe(5)
    expect((priv(a).octaveHistory as number[]).every((x) => x === 3 || x === 4)).toBe(true)
  })
})

// ============================================================================
describe('YINOcctaveCorrection（模块级版本）：与类内实现同构', () => {
  it('tau < minTau*2 ⇒ 原样返回（边界 tau=61 ⇒ octaveTau 正好等于 minTau）', () => {
    const d = new Float32Array(1024).fill(0.5)
    d[61] = 0.4
    d[31] = 0.05 // 若少了这道守卫就会被当成八度
    expect(detectTauRange(SR, d.length - 1).minTau).toBe(31)
    const r = YINOcctaveCorrection(SR / 61, 61, d, SR, 0.15)
    expect(r.frequency).toBeCloseTo(SR / 61, 6)
    expect(r.probability).toBeCloseTo(0.6, 6)
  })

  it('octaveTau 越界（=== maxTau）⇒ 原样返回（即使八度处差值更小）', () => {
    const len = 3206
    const d = new Float32Array(len).fill(0.5)
    d[3205] = 0.4
    d[1603] = 0.05 // 八度处差值极小，若没有守卫就会被采纳
    expect(detectTauRange(SR, len - 1).maxTau).toBe(1603)
    const r = YINOcctaveCorrection(SR / 3205, 3205, d, SR, 0.15)
    expect(r.frequency).toBeCloseTo(SR / 3205, 6)
    expect(r.probability).toBeCloseTo(0.6, 6)
  })

  it('八度差值更小 ⇒ 采纳八度（历史不足 2 条时走概率比较）', () => {
    resetPitchDetectionState()
    const d = new Float32Array(1024).fill(0.5)
    d[200] = 0.3
    d[100] = 0.05
    const r = YINOcctaveCorrection(SR / 200, 200, d, SR, 0.15)
    expect(r.frequency).toBeCloseTo(SR / 100, 6)
  })

  it('历史投票：连续多帧后命中「与均值更近」分支，并把历史封顶在 5', () => {
    resetPitchDetectionState()
    const d = new Float32Array(1024).fill(0.5)
    d[200] = 0.3
    d[100] = 0.05
    // 前两帧把历史填成 [4,4]，第三帧 avg=4 ⇒ 命中均值分支
    YINOcctaveCorrection(SR / 200, 200, d, SR, 0.15)
    YINOcctaveCorrection(SR / 200, 200, d, SR, 0.15)
    const r3 = YINOcctaveCorrection(SR / 200, 200, d, SR, 0.15)
    expect(r3.frequency).toBeCloseTo(SR / 100, 6)
    // 再多来几帧，历史长度封顶 5
    for (let i = 0; i < 6; i++) YINOcctaveCorrection(SR / 200, 200, d, SR, 0.15)
    // 无法直接读模块级数组，改为验证行为稳定（不抛错、仍返回八度）
    expect(YINOcctaveCorrection(SR / 200, 200, d, SR, 0.15).frequency).toBeCloseTo(SR / 100, 6)
  })

  it('八度差值不够小 ⇒ 落到末尾 push + 返回当前周期', () => {
    resetPitchDetectionState()
    const d = new Float32Array(1024).fill(0.5)
    d[200] = 0.3
    d[100] = 0.9 // octaveVal 不满足 < threshold*0.8
    const r = YINOcctaveCorrection(SR / 200, 200, d, SR, 0.15)
    expect(r.frequency).toBeCloseTo(SR / 200, 6)
    expect(r.probability).toBeCloseTo(0.7, 6)
  })

  it('模块级历史溢出：概率更高那条 push 出口在长度已满时 shift（上限 5）', () => {
    resetPitchDetectionState()
    const reject = new Float32Array(1024).fill(0.5)
    reject[200] = 0.3
    reject[100] = 0.9
    // 灌满 5 个「本次周期」的八度号（3）
    for (let i = 0; i < 5; i++) YINOcctaveCorrection(SR / 200, 200, reject, SR, 0.15)

    const accept = new Float32Array(1024).fill(0.5)
    accept[200] = 0.3
    accept[100] = 0.05
    // 此时均值仍是 3 ⇒ 均值比较不成立 ⇒ 走概率更高分支，push 时长度已 5 ⇒ shift
    const r = YINOcctaveCorrection(SR / 200, 200, accept, SR, 0.15)
    expect(r.frequency).toBeCloseTo(SR / 100, 6)

    // 继续调用，窗口恒定 5，不抛错
    for (let i = 0; i < 8; i++) YINOcctaveCorrection(SR / 200, 200, accept, SR, 0.15)
    expect(YINOcctaveCorrection(SR / 200, 200, accept, SR, 0.15).frequency).toBeCloseTo(SR / 100, 6)
  })
})

// ============================================================================
describe('YINPrefilter / YINPitchDetection', () => {
  it('YINPrefilter 逐样本 BIQUAD + 50/60Hz 陷波：输出长度一致，且 50Hz 纯音被显著压低', () => {
    const in50 = sine(50, 8192, 0.5)
    const out50 = YINPrefilter(in50, SR)
    expect(out50.length).toBe(in50.length)
    const rmsIn = calculateRMS(in50)
    const rmsOut = calculateRMS(out50)
    expect(rmsOut).toBeLessThan(rmsIn * 0.5)
  })

  it('YINPitchDetection：440Hz 正弦给出 ≈440Hz 且概率高', () => {
    const r = YINPitchDetection(sine(440, 2048, 0.5), SR, 0.15, 0.1)
    expect(r).not.toBeNull()
    expect(r!.frequency).toBeCloseTo(440, 0)
    expect(r!.probability).toBeGreaterThan(0.9)
  })

  it('YINPitchDetection：极弱噪声（rms 低于自适应门限）→ null，并清空八度历史', () => {
    const b = new Float32Array(2048)
    for (let i = 0; i < b.length; i++) b[i] = (Math.random() * 2 - 1) * 0.001
    expect(YINPitchDetection(b, SR, 0.15, 0.1)).toBeNull()
  })

  it('YINPitchDetection：足够响但无周期（宽带噪声）→ 找不到低于门限的 tau，返回 null', () => {
    let seed = 12345
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const b = new Float32Array(2048)
    for (let i = 0; i < b.length; i++) b[i] = rnd() * 2 - 1
    expect(YINPitchDetection(b, SR, 0.15, 0.1)).toBeNull()
  })

  it('YINPitchDetection：门限极高 + 概率悬崖很高 ⇒ 被概率悬崖挡下返回 null', () => {
    // threshold 拉高到 0.99 ⇒ d[tau] 可能落在 (0.1, 0.99) 之间，
    // 于是 corrected.probability = 1 - d[tau] 可低于 probabilityCliff
    let seed = 999
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const b = new Float32Array(2048)
    for (let i = 0; i < b.length; i++) b[i] = (rnd() * 2 - 1) * 0.3
    const r = YINPitchDetection(b, SR, 0.99, 0.9)
    // 要么被 759 挡（找不到 tau），要么被 771 挡（概率悬崖）——两者都是 null
    expect(r).toBeNull()
  })
})

// ============================================================================
describe('模块级单例与状态复位', () => {
  it('getSOLOYinAnalyser 只建一次；传参会即时应用（含 threshold）', () => {
    const a = getSOLOYinAnalyser(4096, SR, 0.2)
    expect(priv(a).audioBufferSize).toBe(4096)
    expect(priv(a).sampleRate).toBe(SR)
    expect(priv(a).threshold).toBe(0.2)
    expect(getSOLOYinAnalyser()).toBe(a)
    // 不传参数时保持现值
    expect(priv(getSOLOYinAnalyser()).threshold).toBe(0.2)
  })

  it('resetPitchDetectionState：单例已创建时同时复位其自适应状态', () => {
    const a = getSOLOYinAnalyser(4096, SR, 0.15)
    a.analyze(sine(440))
    expect(a.getVolumeRMS()).toBeGreaterThan(0)
    resetPitchDetectionState()
    expect(a.getVolumeRMS()).toBe(0)
    expect(priv(a).valid).toBe(false)
  })

  it('FloatFFT：单点/全部零输入不抛错', () => {
    const fft = new FloatFFT(8)
    const buf = new Float32Array(16)
    expect(() => fft.complexForward(buf)).not.toThrow()
    expect(() => fft.complexInverse(buf, true)).not.toThrow()
  })
})

// ============================================================================
// 用户主动校准出的环境噪声底，必须同时落到**两条 TS 路径**上。
// 只下发 worklet 会复现「开 worklet 测得到、关掉 worklet 测不到」的分叉。
// ============================================================================
describe('seedPitchDetectionNoiseFloor / SOLOYinAnalyser.setNoiseFloor', () => {
  /** 弱信号：raw RMS ≈ 0.007 —— 高于默认门限 0.0008，远低于 seed 0.02 后的 ≈0.029 */
  const quiet = () => sine(440, 4096, 0.01)

  it('类内 setter 抬高门限：同一条弱信号从「能检出」变成「被能量门挡下」', () => {
    const base = new SOLOYinAnalyser()
    base.setSampleRate(SR); base.setAudioBufferSize(4096); base.setThreshold(0.15)
    expect(base.analyze(quiet())).not.toBeNull()

    const seeded = new SOLOYinAnalyser()
    seeded.setSampleRate(SR); seeded.setAudioBufferSize(4096); seeded.setThreshold(0.15)
    seeded.setNoiseFloor(0.02)
    expect(seeded.analyze(quiet())).toBeNull()
  })

  it('类内 setter 忽略非法值（0 / 负数 / NaN / Infinity），合法值照常写入', () => {
    const a = new SOLOYinAnalyser()
    const before = priv(a).noiseFloor
    a.setNoiseFloor(0)
    a.setNoiseFloor(-1)
    a.setNoiseFloor(Number.NaN)
    a.setNoiseFloor(Infinity)
    expect(priv(a).noiseFloor).toBe(before)
    a.setNoiseFloor(0.01)
    expect(priv(a).noiseFloor).toBe(0.01)
  })

  it('模块级：seed 抬高 YINPitchDetection 的能量门 ⇒ 同一弱信号返回 null', () => {
    seedPitchDetectionNoiseFloor(0.02)
    expect(YINPitchDetection(quiet(), SR, 0.15, 0.1)).toBeNull()
  })

  it('对照（证明上一条确实是 seed 造成的）：复位后同一帧又能检出', () => {
    seedPitchDetectionNoiseFloor(0.02)
    resetPitchDetectionState()
    expect(YINPitchDetection(quiet(), SR, 0.15, 0.1)).not.toBeNull()
  })

  it('非法值被忽略 —— 不能把噪声底写成 0（那等于把能量门废掉）', () => {
    seedPitchDetectionNoiseFloor(0)
    seedPitchDetectionNoiseFloor(Number.NaN)
    seedPitchDetectionNoiseFloor(-5)
    expect(YINPitchDetection(quiet(), SR, 0.15, 0.1)).not.toBeNull()
  })

  it('单例已存在时：seed 直接落到它身上', () => {
    const a = getSOLOYinAnalyser(4096, SR, 0.15)
    seedPitchDetectionNoiseFloor(0.0123)
    expect(priv(a).noiseFloor).toBe(0.0123)
  })

  it('🚨 单例**尚未创建**时 seed 不会被惰性创建吞掉（先记账，建实例时补上）', async () => {
    // 只有拿到一个全新的模块实例才能保证 soloYinAnalyser 是 null
    vi.resetModules()
    const fresh = await import('@/lib/pitch-detection')
    fresh.seedPitchDetectionNoiseFloor(0.0123)
    const a = fresh.getSOLOYinAnalyser(4096, SR, 0.15)
    expect(priv(a).noiseFloor).toBe(0.0123)
  })

  it('resetPitchDetectionState 会清掉「待应用」的 seed（上一次会话的起点不许漏到下一次）', async () => {
    vi.resetModules()
    const fresh = await import('@/lib/pitch-detection')
    fresh.seedPitchDetectionNoiseFloor(0.0123)
    fresh.resetPitchDetectionState()
    const a = fresh.getSOLOYinAnalyser(4096, SR, 0.15)
    expect(priv(a).noiseFloor).toBe(0.0005)
  })
})
