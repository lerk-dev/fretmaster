/**
 * `lib/pitch-detection.ts::SOLOYinAnalyser.difference()` 的能量项递推**数值回归**。
 *
 * 2026-10-10 全仓审查（P2-2）：
 *   YIN 的差分函数 d(τ) = Σ_{i=0}^{W-1}(x[i] − x[i+τ])² 可展开为
 *       d(τ) = E(0) + E(τ) − 2·acf(τ),   E(τ) = Σ_{i=τ}^{τ+W-1} x[i]²
 *   其中递推式为 E(τ) = E(τ−1) − x[τ−1]² + x[τ−1+W]²。
 *
 *   旧实现的加项写成 `buffer[halfN + tau]`，比正确的 `buffer[halfN - 1 + tau]`
 *   **多移一位** ⇒ 每个 E(τ) 都掺进 `x[W+τ]² − x[W]²` 的误差（W = halfN）。
 *   它不越界、不抛错，只在门限（0.15/0.2）边缘表现为「特定音高 / 大音量下偶发
 *   检不出或八度跳变」——正是最难复现、最容易被当成长笛/低频特性的那类怪象。
 *
 * 🚨 **独立 oracle**：不能拿实现自己的 d 去反解 acf（那是自证，永远通过）。
 *    这里用**朴素直接求和**独立实现一遍完整的 YIN（E(0)/E(τ) 全部现场求和，
 *    不递推），得到「数学上正确」的 d(τ) 序列；再把实现的 `yinBuffer` 归一化后的
 *    曲线与之对齐。错位一位会让整条曲线逐点偏移，直接可量。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { SOLOYinAnalyser, setMinDetectFreq, resetPitchDetectionState, MIN_DETECT_FREQ } from '@/lib/pitch-detection'

function priv<T>(obj: T): Record<string, any> {
  return obj as unknown as Record<string, any>
}

const SR = 44100

function sawLike(freq: number, n: number, amp = 0.6): Float32Array {
  const b = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    b[i] =
      amp *
      (Math.sin(2 * Math.PI * freq * t) +
        0.35 * Math.sin(6 * Math.PI * freq * t) +
        0.02 * Math.sin(2 * Math.PI * 1237.7 * t))
  }
  return b
}

/**
 * 独立、朴素、**完全不递推**的 YIN 差分函数（数学定义直译）。
 *   d(τ) = Σ_{i=0}^{W-1} (x[i] − x[i+τ])²,  W = halfN
 */
function referenceDifference(buffer: Float32Array, halfN: number): Float64Array {
  const d = new Float64Array(halfN)
  for (let tau = 0; tau < halfN; tau++) {
    let s = 0
    for (let i = 0; i < halfN; i++) {
      const diff = buffer[i] - buffer[i + tau]
      s += diff * diff
    }
    d[tau] = s
  }
  return d
}

/** 把 d 序列做 CMND（累积均值归一化差分），与实现同构 —— 仅供必要时对照 */
function cmnd(d: ArrayLike<number>): Float64Array {
  const out = new Float64Array(d.length)
  out[0] = 1
  let running = 0
  for (let tau = 1; tau < d.length; tau++) {
    running += d[tau]
    out[tau] = (d[tau] * tau) / running
  }
  return out
}
void cmnd

afterEach(() => {
  setMinDetectFreq(MIN_DETECT_FREQ)
  resetPitchDetectionState()
})

describe('SOLOYinAnalyser.difference：能量项递推的下标必须与直接定义一致（P2-2）', () => {
  it('实现的原始 d(τ) 必须与「朴素定义 d(τ)」逐点一致', () => {
    const size = 2048
    const buffer = sawLike(110, size)
    const halfN = size / 2

    const a = new SOLOYinAnalyser()
    a.setSampleRate(SR)
    ;(a as any).setAudioBufferSize(size)

    // 实现：difference() 填 yinBuffer（d 的原始值，未 CMND 归一化）
    ;(a as any).difference(buffer)
    const implD: Float32Array = priv(a).yinBuffer

    // oracle：朴素定义直译（完全不递推、不用 FFT）
    const refD = referenceDifference(buffer, halfN)

    // 🚨 判据取**原始 d**（不取 CMND）：CMND 的累积均值归一化会把局部的
    //    能量项误差压小（实测错位时 RAW maxAbs ≈ 0.19，而 CMND 只剩 ≈ 0.02），
    //    反而掩盖了错位。原始 d 上：正确实现与 oracle 差 ~4e-4（FFT 舍入量级），
    //    错位一位则高达 ~0.19 —— 相差 400 倍以上，阈值取 5e-3 两边都有充裕裕度。
    let maxAbs = 0
    let atTau = -1
    for (let tau = 1; tau < halfN; tau++) {
      const e = Math.abs(implD[tau] - refD[tau])
      if (e > maxAbs) {
        maxAbs = e
        atTau = tau
      }
    }

    expect(
      maxAbs,
      `实现原始 d(τ) 与朴素定义最大逐点差 = ${maxAbs.toFixed(6)} @τ=${atTau}（正确应 ≈ 4e-4）——` +
        ` E(τ) 递推下标与直接定义不一致（x[W+τ]² vs x[W−1+τ]²，W=halfN）`
    ).toBeLessThan(5e-3)
  })

  it('元证明：把加项改回 `halfN + tau`（旧错位）会让上面的比对明显失败', () => {
    // 本用例不复现实现，只证明「错位一位」在本数据上确实会产生可量差异，
    // 从而保证上一条断言的灵敏度不是空谈。
    const size = 2048
    const buffer = sawLike(110, size)
    const halfN = size / 2

    const acf = new Float64Array(halfN)
    for (let tau = 0; tau < halfN; tau++) {
      let s = 0
      for (let i = 0; i < halfN; i++) s += buffer[i] * buffer[i + tau]
      acf[tau] = s
    }
    const wrongE = new Float64Array(halfN)
    for (let i = 0; i < halfN; i++) wrongE[0] += buffer[i] * buffer[i]
    for (let tau = 1; tau < halfN; tau++) {
      wrongE[tau] = wrongE[tau - 1] - buffer[tau - 1] * buffer[tau - 1] + buffer[halfN + tau] * buffer[halfN + tau]
    }
    const correctE = new Float64Array(halfN)
    for (let i = 0; i < halfN; i++) correctE[0] += buffer[i] * buffer[i]
    for (let tau = 1; tau < halfN; tau++) {
      correctE[tau] = correctE[tau - 1] - buffer[tau - 1] * buffer[tau - 1] + buffer[halfN - 1 + tau] * buffer[halfN - 1 + tau]
    }

    const dCorrect = new Float64Array(halfN)
    const dWrong = new Float64Array(halfN)
    for (let tau = 0; tau < halfN; tau++) {
      dCorrect[tau] = correctE[0] + correctE[tau] - 2 * acf[tau]
      dWrong[tau] = correctE[0] + wrongE[tau] - 2 * acf[tau]
    }
    let maxDiff = 0
    for (let tau = 1; tau < halfN; tau++) maxDiff = Math.max(maxDiff, Math.abs(dCorrect[tau] - dWrong[tau]))

    // correctE 重构的 d 必须与朴素定义自洽（证明 correctE 才是对的）
    const refD = referenceDifference(buffer, halfN)
    let selfErr = 0
    for (let tau = 1; tau < halfN; tau++) selfErr = Math.max(selfErr, Math.abs(dCorrect[tau] - refD[tau]))
    expect(selfErr, `correctE 重构的 d 与朴素定义差 ${selfErr}（应≈0）`).toBeLessThan(1e-3)
    // 错位造成的原始 d 差异必须远超上一条断言的 5e-3 阈值
    expect(maxDiff, `错位递推造成的原始 d 差异仅 ${maxDiff} —— 判据不灵敏`).toBeGreaterThan(5e-2)
  })
})
