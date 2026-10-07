/**
 * 噪声门限（pitch 检测前的信号压制）的**跨实现**契约测试。
 *
 * 背景（本次修的 bug，2026-10-03，用户报「必须较重的弹才能答对题，稍微轻一点就没有反应」）：
 *
 * pitch 检测在 Rust 侧走 `preprocessor.process()`（`pipeline.rs` 的
 * 「先 noise gate 再 AGC」），而 `preprocessor.rs` 的门限是
 * `max(noise_gate_threshold × 2.0, 底噪 × 3.0)`，默认 `noise_gate_threshold = 0.008`
 * ⇒ 底噪低时门限 ≈ **0.016**。
 *
 * 而 Web worklet 的门限是 `max(0.0008, 底噪 × 1.5)`（≈ -62dBFS）。
 * worklet 那边**已经修过**这个坑，`audio-worklet-processor.js:428-431` 的注释原话：
 *   「×2.5 时底噪 -42dBFS → 门限 -34dBFS → 轻于 -24dBFS 就检不出
 *     （用户表现为「要弹得比较响才有反应」）；×1.5 后同一底噪下可检到 -34dBFS」
 * —— 症状一字不差，但 **Rust 侧从未同步**，仍停在修复前的量级。
 *
 * 实测（`cargo test --release` 探针，底噪 0.0005）：
 *   极轻拨 RMS 0.002 → 输出 0.000031（保留 1.6%，衰减 -36.2dB，等于被压死）
 *   轻拨   RMS 0.008 → 保留 24.9%（-12.1dB）
 *   中拨   RMS 0.03  → 保留 99.8%
 *   Rust 门限比 worklet 高 **45.5dB**
 *
 * 本文件做三件事：
 *   ① **先证明缝隙存在**：同一段轻拨信号，修复前的门限会把它压死、对照门限不会；
 *      同时中拨/重拨在新门限下**仍然**几乎无损（否则「门限设成 0」也能让第一半通过）。
 *   ② 跨实现护栏：从 Rust 与 worklet 的**源码**里解析出常数与公式并比对
 *      （护栏自带自测，把解析换成常量就该红）。
 *   ③ `get_adaptive_threshold()`（设置页显示的诊断值）必须与**实际生效**的门限同一个来源
 *      —— 此前它返回 `0.15 + 底噪×3`，而 `process()` 用的是 `0.016`，
 *      用户在设置页看到的反馈是**假的**。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const RUST_PRE_REL = path.join('src-tauri', 'src', 'audio', 'preprocessor.rs')
const WORKLET_REL = path.join('public', 'js', 'audio-worklet-processor.js')

/** 项目既定口径（worklet 侧 `adaptiveThreshold`，与 onset 门限同源） */
const GATE_FLOOR = 0.0008
const GATE_NOISE_RATIO = 1.5

/** 修复前 Rust 的口径，用来证明缝隙存在 */
const LEGACY_RUST_GATE = 0.016

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function rmsOf(samples: number[]): number {
  return Math.sqrt(samples.reduce((a, s) => a + s * s, 0) / samples.length)
}

/** 复刻 Rust `preprocessor.process()` 的噪声门（含 gain² 平滑） */
function applyRustGate(
  input: number[],
  gate: number,
): { output: number[]; attenuationDb: number } {
  const signalRms = rmsOf(input)
  if (signalRms >= gate) {
    return { output: input, attenuationDb: 0 }
  }
  const gain = gate > 0 ? Math.min(signalRms / gate, 1) : 0
  const smoothGain = gain * gain
  return {
    output: input.map((s) => s * smoothGain),
    attenuationDb: 20 * Math.log10(Math.max(smoothGain, 1e-12)),
  }
}

describe('轻拨弦可检出性：先证明缝隙存在', () => {
  // 轻拨：RMS 0.002（-54dBFS），正常手拨弱音就在这个量级
  const lightPluck = Array.from({ length: 4096 }, (_, i) =>
    0.002 * Math.SQRT2 * Math.sin((2 * Math.PI * 220 * i) / 48000),
  )

  it('修复前的 Rust 门限（0.016）会把轻拨弦压到几乎归零（这正是用户症状）', () => {
    const { output, attenuationDb } = applyRustGate(lightPluck, LEGACY_RUST_GATE)
    const outRms = rmsOf(output)
    // 衰减超过 30dB ⇒ 信号实质消失
    expect(attenuationDb).toBeLessThan(-30)
    expect(outRms).toBeLessThan(0.002 * 0.05)
  })

  it('对齐后的门限（worklet 口径）对轻拨弦几乎无损', () => {
    const gate = Math.max(GATE_FLOOR, 0.0005 * GATE_NOISE_RATIO)
    const { output, attenuationDb } = applyRustGate(lightPluck, gate)
    expect(attenuationDb).toBeGreaterThan(-1)
    expect(rmsOf(output)).toBeGreaterThan(0.002 * 0.7)
  })

  // 🚨 反向对照：门限若改成 0，第一半也会通过 ⇒ 必须证明**中拨/重拨**仍正常。
  it('反向对照：中拨与重拨在修复后门限下仍然几乎无损（防「门限设成 0」作弊）', () => {
    const gate = Math.max(GATE_FLOOR, 0.0005 * GATE_NOISE_RATIO)
    for (const rms of [0.03, 0.12]) {
      const sig = Array.from({ length: 4096 }, (_, i) =>
        rms * Math.SQRT2 * Math.sin((2 * Math.PI * 220 * i) / 48000),
      )
      const { attenuationDb } = applyRustGate(sig, gate)
      expect(attenuationDb).toBeGreaterThan(-1)
    }
  })

  it('反向对照：真正的环境噪声仍被压制（防「门限无脑归零」引入误检）', () => {
    // 底噪 0.0005 在修复后门限 0.0008 之下 ⇒ 仍应被压
    const noise = Array.from({ length: 4096 }, (_, i) =>
      0.0005 * Math.SQRT2 * Math.sin((2 * Math.PI * 60 * i) / 48000),
    )
    const gate = Math.max(GATE_FLOOR, 0.0005 * GATE_NOISE_RATIO)
    const { attenuationDb } = applyRustGate(noise, gate)
    expect(attenuationDb).toBeLessThan(-3)
  })
})

describe('跨实现护栏：Rust 门限必须与 worklet 同源', () => {
  let rustSrc: string
  let workletSrc: string

  beforeAll(() => {
    rustSrc = readSrc(RUST_PRE_REL)
    workletSrc = readSrc(WORKLET_REL)
  })

  it('Rust 源码里的绝对下限必须与 worklet 的 0.0008 一致', () => {
    // worklet 侧：Math.max(0.0008, this.noiseFloor * 1.5)
    const m = /Math\.max\(\s*([0-9.]+)\s*,\s*[\w.]+\s*\*\s*([0-9.]+)\s*\)/.exec(workletSrc)
    expect(m, 'worklet 里解析不到 adaptiveThreshold 公式').not.toBeNull()
    const workletFloor = Number(m![1])
    const workletRatio = Number(m![2])
    expect(workletFloor).toBeCloseTo(GATE_FLOOR, 6)
    expect(workletRatio).toBeCloseTo(GATE_NOISE_RATIO, 6)

    // Rust 侧必须引用同一个下限，而不是自己写一个更大的常量
    const floorConst = /GATE_FLOOR:\s*f32\s*=\s*([0-9.]+)/.exec(rustSrc)
    expect(floorConst, 'Rust 里找不到 GATE_FLOOR 常量').not.toBeNull()
    expect(Number(floorConst![1])).toBeCloseTo(workletFloor, 6)
  })

  it('Rust 源码里的底噪倍数默认值必须与 worklet 一致', () => {
    const m = /GATE_NOISE_RATIO:\s*f32\s*=\s*([0-9.]+)/.exec(rustSrc)
    expect(m, 'Rust 里找不到 GATE_NOISE_RATIO 常量').not.toBeNull()
    expect(Number(m![1])).toBeCloseTo(GATE_NOISE_RATIO, 6)
    // 默认倍数来自该常量（滑块调过时会被 gate_noise_ratio 覆盖，
    // 但初值必须来自常量，否则「默认档」就与 worklet 分叉了）
    expect(rustSrc).toMatch(/gate_noise_ratio:\s*GATE_NOISE_RATIO/)
  })

  it('Rust 的实际门限公式必须用这两个常量，且**不再乘 2.0**', () => {
    // 修复前：`max(self.config.noise_gate_threshold * 2.0, self.noise_floor_est * 3.0)`
    // 修复后必须走单一真相源，且不再有那个把门限抬高一倍的 ×2.0
    const gateFn = /pub fn gate\(&self\)\s*->\s*f32\s*\{[^}]*\}/.exec(rustSrc)
    expect(gateFn, 'Rust 里找不到 gate() 单一真相源').not.toBeNull()
    const body = gateFn![0]
    expect(body).toContain('GATE_FLOOR')
    expect(body).toContain('gate_noise_ratio')
    // 旧的 `noise_gate_threshold * 2.0` / `底噪 * 3.0` 不得复活
    expect(body).not.toMatch(/noise_gate_threshold\s*\*\s*2\.0/)
    expect(body).not.toMatch(/noise_floor_est\s*\*\s*3\.0/)
  })

  it('process() 的门限必须调用 gate()，不能自己再算一份（铁律 14：唯一真相源）', () => {
    const processFn = /pub fn process\(&mut self[^)]*\)\s*->\s*Vec<f32>\s*\{[\s\S]*?\n {4}\}/.exec(rustSrc)
    expect(processFn, 'Rust 里找不到 process()').not.toBeNull()
    const body = processFn![0]
    expect(body, 'process() 仍在自己算门限').toMatch(/self\.gate\(\)/)
    expect(body).not.toMatch(/adaptive_threshold\s*=\s*\(self\.config/)
  })

  it('诊断接口 get_adaptive_threshold() 必须返回 gate()，不能另报一个假值', () => {
    const diagFn = /pub fn get_adaptive_threshold\(&self\)\s*->\s*f32\s*\{[^}]*\}/.exec(rustSrc)
    expect(diagFn, 'Rust 里找不到 get_adaptive_threshold()').not.toBeNull()
    expect(diagFn![0]).toContain('self.gate()')
    // 旧实现里的 `base = 0.15` 是与实际生效值无关的假值
    expect(diagFn![0]).not.toMatch(/base\s*=\s*0\.15/)
  })

  it('降噪滑块必须映射到「门限倍数」，不能写那个已不参与门限的绝对阈值', () => {
    const setter = /pub fn set_noise_suppression_level\(&mut self[^)]*\)\s*\{[^}]*\}/.exec(rustSrc)
    expect(setter, 'Rust 里找不到 set_noise_suppression_level()').not.toBeNull()
    const body = setter![0]
    expect(body).toContain('gate_noise_ratio')
    // 写成 noise_gate_threshold 会让滑块变成死设置（该字段已不参与门限计算）
    expect(body).not.toContain('noise_gate_threshold')
  })

  it('enable_noise_gate 为 false 时（降噪 0 档）门完全不生效', () => {
    // 语义契约：0 档 = 不压制。这样「降噪」滑块最低档是安全的，
    // 不会像旧实现那样 0.002 起步仍压着弱信号。
    const setter = /pub fn set_noise_suppression_level\(&mut self[^)]*\)\s*\{[^}]*\}/.exec(rustSrc)!
    expect(setter[0]).toMatch(/enable_noise_gate\s*=\s*level\s*>\s*0\.0/)
  })
})
