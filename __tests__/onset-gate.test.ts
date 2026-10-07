/**
 * 起音门限的**跨实现**契约测试。
 *
 * 背景（本次修的 bug）：起音门限 `max(0.0008, 底噪 × 1.5)` 在项目里有三处实现 ——
 *   - Rust    `src-tauri/src/audio/onset.rs` 的 `OnsetDetector`（Tauri）
 *   - Web     `public/js/audio-worklet-processor.js`（worklet）
 *   - Web 回退 `lib/pitch-detection.ts` 的 `updateOnsetGate()`（ScriptProcessor，页面调用）
 * 前两处都跟着**各自跟踪的环境底噪**走，第三处（也就是本次修的）此前把门限**写死**成
 * 0.001，与底噪完全脱钩。环境噪声校准的上界是 0.025 ⇒ 两条原生路径门限 0.0375，
 * 回退路径 0.001（低 37 倍）⇒ 环境噪声的起伏被判成「一次新的拨弦」⇒
 * `confirmNote()` 的确认记忆被反复清空 ⇒ 嘈杂房间里回退路径**永远确认不了**任何音。
 *
 * 本文件做三件事，缺一不可：
 *   ① **先证明缝隙存在**（不是直接断言"修好了"）：同一段嘈杂房间的帧序列，写死门限
 *      会判出拨弦、新门限不会；同时真实拨弦在新门限下**仍然**触发（两半都咬住，
 *      否则「把门限抬到无穷大」也能让第一半通过）。
 *   ② 底噪推进规则（首帧 prime / 下降快 / 上升极慢 / 复位）的行为契约。
 *   ③ **跨实现护栏**：从 Rust 与 worklet 的**源码**里解析出常数与公式，与 TS 侧
 *      **实测出来**的值比对。护栏自带自测（把解析步骤换成常量就该红）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createOnsetState, detectOnset, ONSET_DEFAULTS } from '@/lib/note-confirm'
import {
  ADAPTIVE_THRESHOLD_FLOOR,
  NOISE_FLOOR_INIT,
  getOnsetGate,
  resetPitchDetectionState,
  seedPitchDetectionNoiseFloor,
  updateOnsetGate,
} from '@/lib/pitch-detection'

const ROOT = process.cwd()
const RUST_ONSET_REL = path.join('src-tauri', 'src', 'audio', 'onset.rs')
const WORKLET_REL = path.join('public', 'js', 'audio-worklet-processor.js')

// 每个用例都从干净的模块级状态开始（底噪与 primed 标志都会被清掉）
beforeEach(() => {
  resetPitchDetectionState()
})

// ---------------------------------------------------------------- ① 缝隙证明

/** 嘈杂房间：环境 RMS 在 0.02 附近抖动，偶发 ±60% 的起伏（键盘、椅子、空调）。 */
const NOISY_AMBIENT_RMS = [0.02, 0.032, 0.02, 0.033, 0.02, 0.031]

/** 按给定的门限函数跑一遍帧序列，返回判定为起音的帧下标。100ms 一帧以越过 75ms 不应期。 */
function onsetsOf(frames: number[], gateFor: (rms: number) => number): number[] {
  const state = createOnsetState()
  const hit: number[] = []
  frames.forEach((rms, i) => {
    if (detectOnset(rms, gateFor(rms), i * 100, state)) hit.push(i)
  })
  return hit
}

describe('① 缝隙证明：写死门限会把环境噪声判成拨弦', () => {
  it('同一段嘈杂环境帧：0.001(写死) 判出拨弦，跟底噪走的新门限不判', () => {
    const withHardcoded = onsetsOf(NOISY_AMBIENT_RMS, () => 0.001)
    const withAdaptive = onsetsOf(NOISY_AMBIENT_RMS, (rms) => updateOnsetGate(rms))

    expect(
      withHardcoded.length,
      '写死 0.001 时环境抖动应当被判成拨弦（若不是，说明这段帧序列没能复现 bug）'
    ).toBeGreaterThan(0)
    expect(
      withAdaptive,
      `跟底噪走之后环境抖动不该判成拨弦，实际判出：${JSON.stringify(withAdaptive)}`
    ).toEqual([])
  })

  it('挡住的机制是「绝对增量下限 = 门限 × 0.5」：帧间增量正好夹在两个门限之间', () => {
    resetPitchDetectionState()
    updateOnsetGate(NOISY_AMBIENT_RMS[0]) // prime：底噪 = 0.02
    const adaptiveGate = updateOnsetGate(NOISY_AMBIENT_RMS[1])

    const delta = NOISY_AMBIENT_RMS[1] - NOISY_AMBIENT_RMS[0] // 0.012
    const staleMinDelta = 0.001 * ONSET_DEFAULTS.gateDeltaRatio // 0.0005
    const liveMinDelta = adaptiveGate * ONSET_DEFAULTS.gateDeltaRatio

    expect(delta, '增量必须能过写死门限的增量下限（否则这段序列复现不出 bug）').toBeGreaterThan(
      staleMinDelta
    )
    expect(
      delta,
      '增量必须过不了跟底噪走的增量下限（这才是挡住它的那一条条件）'
    ).toBeLessThanOrEqual(liveMinDelta)
    // 记录量级：门限 0.001 → 下限 0.0005；底噪 0.02 → 门限 0.03 → 下限 0.015，差 30 倍
    expect(liveMinDelta / staleMinDelta).toBeGreaterThan(20)
  })

  it('两半都咬住：同一间屋子里**真实拨弦**在新门限下仍然触发起音', () => {
    const frames = [0.02, 0.02, 0.25, 0.2, 0.2] // 底噪 0.02，第 3 帧真弹一下
    const hit = onsetsOf(frames, (rms) => updateOnsetGate(rms))
    expect(hit, '真实拨弦被误挡了 —— 那不是修 bug，是把起音检测关掉了').toEqual([2])
  })
})

// ---------------------------------------------------------------- ② 底噪推进规则

describe('② 底噪推进规则（与 Rust `OnsetDetector` 同口径）', () => {
  it('首帧直接取该帧 RMS 作为底噪，不参与混合', () => {
    expect(updateOnsetGate(2.0)).toBeCloseTo(2.0 * 1.5, 12)
  })

  it('复位后 primed 标志被清掉：下一帧仍是「首帧」（不是与初值混合）', () => {
    updateOnsetGate(1.0)
    resetPitchDetectionState()
    expect(updateOnsetGate(3.0), '复位没有清掉 primed ⇒ 底噪从上次会话的残留值开始混').toBe(
      3.0 * 1.5
    )
  })

  it('复位后门限 = max(0.0008, 初值 × 1.5)；静止时由绝对下限 0.0008 顶着', () => {
    expect(getOnsetGate()).toBe(ADAPTIVE_THRESHOLD_FLOOR)
    expect(
      NOISE_FLOOR_INIT * 1.5,
      '初值 × 1.5 应当低于绝对下限，否则「静止时门限 = 0.0008」不再成立'
    ).toBeLessThan(ADAPTIVE_THRESHOLD_FLOOR)
  })

  it('下降快 / 上升极慢：同一幅度差，下降的位移是上升的 100 倍', () => {
    resetPitchDetectionState()
    updateOnsetGate(1.0) // prime 到 1.0
    const riseFloor = updateOnsetGate(2.0) / 1.5 // rms > 底噪
    const riseStep = riseFloor - 1.0

    resetPitchDetectionState()
    updateOnsetGate(1.0)
    const fallFloor = updateOnsetGate(0.0) / 1.5 // rms < 底噪
    const fallStep = 1.0 - fallFloor

    expect(riseStep).toBeCloseTo(1.0 * 0.0005, 12)
    expect(fallStep).toBeCloseTo(1.0 * 0.05, 12)
    expect(fallStep / riseStep).toBeCloseTo(100, 6)
  })

  it('底噪一旦被抬到信号电平之上，持续同电平的长音不会凭空造出起音', () => {
    // 长音稳态：prev 与 rms 相同 ⇒ 相对倍数条件恒不成立（这是「不用 EMA 基线」的理由）
    const hit = onsetsOf([0.02, 0.3, 0.3, 0.3, 0.3, 0.3], (rms) => updateOnsetGate(rms))
    expect(hit, '稳态长音被反复判成起音 ⇒ confirmNote 的确认记忆会被无限清空').toEqual([1])
  })

  it('环境噪声校准的种子必须给起音底噪一个起点（并置 primed，否则第一帧就冲掉）', () => {
    // 对照：没种子时首帧直接把底噪设成该帧电平
    expect(updateOnsetGate(0.5)).toBeCloseTo(0.75, 12)

    resetPitchDetectionState()
    seedPitchDetectionNoiseFloor(0.01)
    const gate = updateOnsetGate(0.5)
    expect(
      gate,
      '种子被第一帧整个覆盖了 ⇒ 用户白校准一次（worklet 用 processorOptions.noiseFloor 也是这个道理）'
    ).toBeCloseTo((0.01 + (0.5 - 0.01) * 0.0005) * 1.5, 12)
  })
})

// ---------------------------------------------------------------- ③ 跨实现护栏

/**
 * 从源码文本解析出「起音门限 = max(底噪 × ratio, floor)」的两个数，以及底噪的
 * 初值与两个跟踪系数。**从被契约方解析**，不写死形状 —— 对方改了数/改了写法
 * 就会跟着变（或解析失败当场报错），只有「对方新增字段而前端没跟」才需要人来看。
 */
export interface GateNumbers {
  ratio: number
  floor: number
  init: number
  alphaFast: number
  alphaSlow: number
}

export function parseRustGate(src: string): GateNumbers {
  const num = (re: RegExp, label: string): number => {
    const m = src.match(re)
    if (!m) throw new Error(`onset.rs 里没解析到「${label}」—— 写法变了？护栏需要同步：${re}`)
    return Number(m[1])
  }
  return {
    // pub fn gate(&self) -> f32 { (self.noise_floor * 1.5).max(0.0008) }
    ratio: num(/self\.noise_floor\s*\*\s*([\d.]+)/, 'ratio'),
    floor: num(/\.max\(\s*([\d.]+)\s*\)/, 'floor'),
    // noise_floor: 0.0005,
    init: num(/noise_floor:\s*([\d.]+)/, 'init'),
    // let alpha = if rms < self.noise_floor { 0.05 } else { 0.0005 };
    alphaFast: num(/if rms < self\.noise_floor\s*\{\s*([\d.]+)\s*\}/, 'alphaFast'),
    alphaSlow: num(/if rms < self\.noise_floor\s*\{\s*[\d.]+\s*\}\s*else\s*\{\s*([\d.]+)\s*\}/, 'alphaSlow'),
  }
}

export function parseWorkletGate(src: string): GateNumbers {
  const num = (re: RegExp, label: string): number => {
    const m = src.match(re)
    if (!m) throw new Error(`worklet 里没解析到「${label}」—— 写法变了？护栏需要同步：${re}`)
    return Number(m[1])
  }
  const gate = src.match(/Math\.max\(\s*([\d.]+)\s*,\s*this\.noiseFloor\s*\*\s*([\d.]+)\s*\)/)
  if (!gate) throw new Error('worklet 里没解析到 adaptiveThreshold 的门限公式 —— 写法变了？')
  return {
    floor: Number(gate[1]),
    ratio: Number(gate[2]),
    init: num(/initialNoiseFloor > 0 \? initialNoiseFloor : ([\d.]+)/, 'init'),
    // const nfAlpha = energy < this.noiseFloor ? 0.05 : 0.0005;
    alphaFast: num(/energy < this\.noiseFloor \? ([\d.]+) :/, 'alphaFast'),
    alphaSlow: num(/energy < this\.noiseFloor \? [\d.]+ : ([\d.]+)/, 'alphaSlow'),
  }
}

/** 从 TS 的**实际行为**里量出同一组数（除 init 外都不读常量，纯黑盒推出来的）。 */
function measureTsGate(): GateNumbers {
  resetPitchDetectionState()
  // gate = max(0.0008, 0.002 × ratio) = 0.003 ⇒ ratio 可量
  const ratio = updateOnsetGate(0.002) / 0.002

  resetPitchDetectionState()
  const floorAtRest = getOnsetGate()

  resetPitchDetectionState()
  updateOnsetGate(1.0)
  const alphaSlow = updateOnsetGate(2.0) / 1.5 - 1.0

  resetPitchDetectionState()
  updateOnsetGate(1.0)
  const alphaFast = 1.0 - updateOnsetGate(0.0) / 1.5

  return { ratio, floor: floorAtRest, init: NOISE_FLOOR_INIT, alphaFast, alphaSlow }
}

/** 逐字段带容差比对（这些数是从浮点行为里反推出来的，不能用严格相等）。 */
function expectGateClose(actual: GateNumbers, expected: GateNumbers, hint: string): void {
  for (const key of ['ratio', 'floor', 'init', 'alphaFast', 'alphaSlow'] as const) {
    expect(actual[key], `${hint}：${key} 不一致（实际 ${actual[key]} vs 期望 ${expected[key]}）`).toBeCloseTo(
      expected[key],
      12
    )
  }
}

describe('③ 跨实现护栏：三处起音门限必须同规则', () => {
  const rustSrc = fs.readFileSync(path.join(ROOT, RUST_ONSET_REL), 'utf8')
  const workletSrc = fs.readFileSync(path.join(ROOT, WORKLET_REL), 'utf8')

  it('护栏自测：解析步骤真的读了源码（每个字段都必须跟着动）', () => {
    const mutRust = rustSrc
      .replace('self.noise_floor * 1.5', 'self.noise_floor * 2.5')
      .replace('.max(0.0008)', '.max(0.0011)')
      .replace('noise_floor: 0.0005', 'noise_floor: 0.0007')
      .replace('{ 0.05 }', '{ 0.07 }')
      .replace('else { 0.0005 }', 'else { 0.0009 }')
    expect(mutRust, '替换没生效，下面的断言等于没测').not.toBe(rustSrc)
    expect(parseRustGate(mutRust), '有字段的解析是写死的（把某个 num() 换成常量就会露馅）').toEqual({
      ratio: 2.5,
      floor: 0.0011,
      init: 0.0007,
      alphaFast: 0.07,
      alphaSlow: 0.0009,
    })

    const mutWorklet = workletSrc
      .replace('Math.max(0.0008, this.noiseFloor * 1.5)', 'Math.max(0.0013, this.noiseFloor * 1.7)')
      .replace('initialNoiseFloor : 0.0005', 'initialNoiseFloor : 0.0008')
      .replace('? 0.05 : 0.0005', '? 0.06 : 0.0004')
    expect(mutWorklet, 'worklet 的替换没生效').not.toBe(workletSrc)
    expect(parseWorkletGate(mutWorklet)).toEqual({
      ratio: 1.7,
      floor: 0.0013,
      init: 0.0008,
      alphaFast: 0.06,
      alphaSlow: 0.0004,
    })
  })

  it('TS 侧实测出的数 = 常量（0.0008 / ×1.5 / 初值 0.0005 / 0.05 / 0.0005）', () => {
    const ts = measureTsGate()
    expect(ts.ratio).toBeCloseTo(1.5, 12)
    expect(ts.floor).toBeCloseTo(ADAPTIVE_THRESHOLD_FLOOR, 12)
    expect(ADAPTIVE_THRESHOLD_FLOOR).toBe(0.0008)
    expect(ts.init).toBe(NOISE_FLOOR_INIT)
    expect(NOISE_FLOOR_INIT).toBe(0.0005)
    expect(ts.alphaFast).toBeCloseTo(0.05, 12)
    expect(ts.alphaSlow).toBeCloseTo(0.0005, 12)
  })

  it('Rust（Tauri）与 TS 同规则', () => {
    const ts = measureTsGate()
    const rust = parseRustGate(rustSrc)
    expectGateClose(rust, ts, 'Rust 的门限公式/底噪跟踪与 TS 不一致 —— 同一段音频桌面版与网页版结论会不同')
  })

  it('worklet（Web 默认路径）与 TS 同规则', () => {
    const ts = measureTsGate()
    const worklet = parseWorkletGate(workletSrc)
    expectGateClose(worklet, ts, 'worklet 的门限公式与 TS 不一致')
  })

  it('起音判定参数（倍数 / 增量系数 / 不应期）三处一致', () => {
    const num = (src: string, re: RegExp, label: string): number => {
      const m = src.match(re)
      if (!m) throw new Error(`${label} 没解析到 —— 写法变了？`)
      return Number(m[1])
    }
    const rust = {
      relativeRatio: num(rustSrc, /relative_ratio:\s*([\d.]+)/, 'rust relative_ratio'),
      gateDeltaRatio: num(rustSrc, /gate_delta_ratio:\s*([\d.]+)/, 'rust gate_delta_ratio'),
      refractoryMs: num(rustSrc, /from_millis\((\d+)\)/, 'rust refractory'),
    }
    const worklet = {
      relativeRatio: num(workletSrc, /onsetRelativeRatio \|\| ([\d.]+)/, 'worklet relativeRatio'),
      gateDeltaRatio: num(workletSrc, /onsetGateDeltaRatio \|\| ([\d.]+)/, 'worklet gateDeltaRatio'),
      refractoryMs: num(workletSrc, /onsetRefractoryMs \|\| ([\d.]+)/, 'worklet refractoryMs'),
    }
    const ts = {
      relativeRatio: ONSET_DEFAULTS.relativeRatio,
      gateDeltaRatio: ONSET_DEFAULTS.gateDeltaRatio,
      refractoryMs: ONSET_DEFAULTS.refractoryMs,
    }
    expect(rust).toEqual(ts)
    expect(worklet).toEqual(ts)
  })
})

// -------------------------------------------- ④ 噪声门：回退路径必须与 worklet 同源
//
// 背景（本次修的第二个 bug）：worklet 用**同一个** `adaptiveThreshold` 干两件事 ——
// 起音判定（`_detectAmplitudeDiff`）与噪声门（`if (energy < adaptiveThreshold) return`），
// 两者都是本帧**原始** RMS。而 ScriptProcessor 回退路径只把起音门禁改成了跟底噪走
// （上一批），噪声门仍写着 `yinResult.frequency < 110 ? 0.001 : 0.002` —— 写死、
// 还多了一个 worklet 没有的频率分档。后果是**双向**的：
//   · 底噪低（未校准，门限 0.0008）⇒ 0.002 比 worklet 严格 2.5 倍 ⇒ 轻弹「开着测得到、关掉测不到」；
//   · 底噪高（校准到 0.02，门限 0.03）⇒ 0.002 比 worklet 宽松 15 倍 ⇒ 纯环境抖动被当成有信号。
// 修法是让噪声门也用 `getOnsetGate()`（原始 RMS 的自适应门限，与 worklet 同源同量）。

const PAGE_REL = path.join('app', 'page.tsx')

/**
 * 去掉注释后再扫源码。
 * 🚨 必须做：本文件的负向/正向断言都会被**说明性注释**绊倒 —— 修复后的代码里恰好留着
 * 「此前这里是 `0.001 : 0.002`」这种历史说明（刻意保留，讲清楚为什么不再写死）。
 */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
}

/** 页面源码（已剥注释）—— 所有「扫页面代码」的断言都必须用它。 */
export function readPageCode(): string {
  return stripComments(fs.readFileSync(path.join(ROOT, PAGE_REL), 'utf8'))
}

/**
 * 抽出 ScriptProcessor 练习路径里**噪声门**的比较右值（`if (energy < X)`）。
 * 锚点用 `YINPitchDetection(inputData` —— 那是该路径独有的调用，且噪声门紧跟在它之后。
 */
export function extractPracticeNoiseGate(src: string): string | null {
  const start = src.indexOf('YINPitchDetection(inputData')
  if (start < 0) return null
  const region = src.slice(start, start + 4000)
  const m = region.match(/if\s*\(\s*energy\s*<\s*(.+?)\)\s*\{/)
  return m ? m[1].trim() : null
}

describe('④ 噪声门：ScriptProcessor 回退路径必须与 worklet 同源', () => {
  const workletSrc = fs.readFileSync(path.join(ROOT, WORKLET_REL), 'utf8')

  /** worklet 的噪声门：从**对方源码**解析出的公式，喂进同一个底噪。 */
  const workletGateAt = (floor: number): number => {
    const w = parseWorkletGate(workletSrc)
    return Math.max(w.floor, floor * w.ratio)
  }

  /** TS 侧：把底噪种成同一个值，再**黑盒**读出实际门限（不读常量、不读源码）。 */
  const tsGateAt = (floor: number): number => {
    resetPitchDetectionState()
    seedPitchDetectionNoiseFloor(floor)
    return getOnsetGate()
  }

  it('护栏自测：判定步骤能认出写死的门限（换个常量名/字面量都要跟着变）', () => {
    const tail = 'yinResult = YINPitchDetection(inputData, sr, t, p)\n      if (energy < X) {'
    expect(extractPracticeNoiseGate(tail.replace('X', 'getOnsetGate()'))).toBe('getOnsetGate()')
    expect(extractPracticeNoiseGate(tail.replace('X', 'energyThreshold'))).toBe('energyThreshold')
    expect(extractPracticeNoiseGate(tail.replace('X', '0.002'))).toBe('0.002')
    expect(extractPracticeNoiseGate('没有那个锚点')).toBeNull()
  })

  it('练习路径的噪声门 = getOnsetGate()（此前是写死的 0.001 / 0.002）', () => {
    const gate = extractPracticeNoiseGate(readPageCode())
    expect(gate, '没解析到练习路径的噪声门（重构 / 改名了？护栏需要同步）').not.toBeNull()
    expect(
      gate,
      'ScriptProcessor 练习路径的噪声门不是跟底噪走的了 —— worklet 侧没有频率分档，' +
        '同一间屋子里两条路径会得出不同结论（默认底噪下差 2.5 倍，校准出高底噪后反过来差 15 倍）'
    ).toBe('getOnsetGate()')
  })

  it('同一个底噪下 TS 与 worklet 的噪声门完全相等', () => {
    for (const floor of [NOISE_FLOOR_INIT, 0.002, 0.02, 0.025]) {
      expect(
        tsGateAt(floor),
        `底噪 ${floor}：TS 与 worklet 的噪声门不同源`
      ).toBeCloseTo(workletGateAt(floor), 12)
    }
  })

  it('缝隙证明①（底噪低）：写死的 0.002 严格 2.5 倍 ⇒ 轻弹在回退路径上「开着测得到、关掉测不到」', () => {
    const quietFrame = 0.0015 // 本帧原始 RMS：轻弹
    const liveGate = tsGateAt(NOISE_FLOOR_INIT) // max(0.0008, 0.0005×1.5) = 0.0008

    expect(
      quietFrame,
      '这一帧必须过得了 worklet 的门，否则复现不出「开着测得到、关掉测不到」'
    ).toBeGreaterThanOrEqual(workletGateAt(NOISE_FLOOR_INIT))
    expect(quietFrame, '这一帧必须过不了写死的 0.002，否则这段输入复现不出 bug').toBeLessThan(0.002)
    expect(
      0.002 / liveGate,
      '写死的门限必须明显更严格 —— 否则这不是真缝隙（这条是「缝隙够不够宽」的量化）'
    ).toBeGreaterThan(2)
  })

  it('缝隙证明②（底噪高）：写死的 0.002 宽松 15 倍 ⇒ 纯环境抖动被当成有信号', () => {
    const calibratedFloor = 0.02 // 用户校准后的底噪（噪声校准上界 0.025）
    const liveGate = tsGateAt(calibratedFloor) // 0.03
    const ambientJitter = 0.004 // 纯环境抖动，没人拨弦

    expect(ambientJitter, '这一帧必须过不了两个活门限').toBeLessThan(liveGate)
    expect(ambientJitter).toBeLessThan(workletGateAt(calibratedFloor))
    expect(ambientJitter, '这一帧必须过得了写死的 0.002，否则复现不出反方向的 bug').toBeGreaterThan(
      0.002
    )
    expect(liveGate / 0.002, '活门限必须明显更严格').toBeGreaterThan(10)
  })
})
