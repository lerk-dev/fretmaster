/**
 * 收音两级前置滤波（lib/note-confirm.ts）的契约测试。
 *
 * 两级各自的核心不变量，以及**必须钉住的退化路径**：
 *   1. 起音用「上一帧原始 RMS」而非 EMA 基线 —— 稳态长音不得被反复判成起音。
 *      这条是本模块最容易"顺手优化错"的地方：把 prevRms 换成 EMA 基线，
 *      下面「稳态长音只起音一次」与「长音跨过不应期后不重新起音」两条会立刻变红。
 *   2. 多帧一致按**音级（音名）**比较 —— YIN 的八度抖动不得打断连续计数。
 *      改成绝对 MIDI 比较则同音高八度跳变会不停重置，`八度抖动` 用例变红。
 *   3. 退化为「每个音只计一次分」:即使起音从不触发，也不得对同一段连续同音重复放行。
 *   4. 多帧一致必须按**时间**（NOTE_CONFIRM_TARGET_MS）而不是固定帧数 —— 三条收音路径的
 *      帧间隔差 17 倍（worklet 10.7ms / Tauri 50ms / ScriptProcessor ~186ms），固定帧数会让
 *      回退路径的确认延迟放大成 ~0.5s。下面「三路径延迟同量级」一组钉住这条。
 */
import { describe, it, expect } from 'vitest'
import {
  ONSET_DEFAULTS,
  NOTE_CONFIRM_REQUIRED_FRAMES,
  NOTE_CONFIRM_TARGET_MS,
  NOTE_CONFIRM_MIN_FRAMES,
  NOTE_CONFIRM_WORKLET_FRAME_MS,
  requiredFramesForFrameMs,
  createOnsetState,
  detectOnset,
  createNoteConfirmState,
  resetNoteConfirmState,
  confirmNote,
} from '@/lib/note-confirm'
import { frequencyToNote } from '@/lib/pitch-detection'

/** A4 = 440Hz 系列频率（十二平均律），用于构造「同一个音」「高一个八度」等输入 */
const A4 = 440
const freq = (semitonesFromA4: number) => A4 * Math.pow(2, semitonesFromA4 / 12)
const A4_F = freq(0)
const A5_F = freq(12) // 高一个八度，音级相同
const C4_F = freq(-9)

describe('detectOnset —— 一级起音检测', () => {
  const GATE = 0.0008

  it('首帧永不判定为起音（没有上一帧可比）', () => {
    const s = createOnsetState()
    expect(detectOnset(0.05, GATE, 0, s)).toBe(false)
    expect(s.prevRms).toBe(0.05)
  })

  it('静音 → 强信号：判为起音', () => {
    const s = createOnsetState()
    detectOnset(0.0002, GATE, 0, s) // 底噪帧，先建立 prevRms
    expect(detectOnset(0.01, GATE, 11, s)).toBe(true)
  })

  it('🚨 稳态长音：只有第一帧是起音，之后跨过不应期也不再触发', () => {
    const s = createOnsetState()
    detectOnset(0.0002, GATE, 0, s)
    expect(detectOnset(0.01, GATE, 11, s)).toBe(true)

    // 持续 2 秒、每 10.67ms 一帧、电平完全稳定：一次都不该再起音
    let onsets = 0
    for (let i = 0; i < 190; i++) {
      if (detectOnset(0.01, GATE, 11 + (i + 1) * 10.67, s)) onsets += 1
    }
    expect(onsets).toBe(0)
  })

  it('🚨 长音带 ±1% 抖动也不得误判起音（相对条件挡不住，靠 1.45 倍才挡得住）', () => {
    const s = createOnsetState()
    detectOnset(0.0002, GATE, 0, s)
    detectOnset(0.01, GATE, 11, s)

    let onsets = 0
    for (let i = 0; i < 100; i++) {
      const jitter = 0.01 * (1 + (i % 2 === 0 ? 0.01 : 0))
      if (detectOnset(jitter, GATE, 11 + (i + 1) * 10.67, s)) onsets += 1
    }
    expect(onsets).toBe(0)
  })

  it('不应期内的第二次上升沿被抑制', () => {
    const s = createOnsetState()
    detectOnset(0.0002, GATE, 0, s)
    expect(detectOnset(0.01, GATE, 100, s)).toBe(true)
    // 回落到低电平，然后 50ms 后再次上升 —— 仍在 75ms 不应期内
    detectOnset(0.0002, GATE, 120, s)
    expect(detectOnset(0.01, GATE, 150, s)).toBe(false)
  })

  it('超出不应期后的第二次拨弦重新判为起音', () => {
    const s = createOnsetState()
    detectOnset(0.0002, GATE, 0, s)
    expect(detectOnset(0.01, GATE, 100, s)).toBe(true)
    detectOnset(0.0002, GATE, 150, s)
    expect(detectOnset(0.01, GATE, 200, s)).toBe(true)
  })

  it('低于噪声门：即使相对涨幅很大也不算起音', () => {
    const s = createOnsetState()
    detectOnset(0.0001, GATE, 0, s)
    // 0.0006 是 0.0001 的 6 倍，但仍在门限 0.0008 之下
    expect(detectOnset(0.0006, GATE, 11, s)).toBe(false)
  })

  it('缓变渐强（每帧 +10%）不算起音', () => {
    const s = createOnsetState()
    let rms = 0.001
    detectOnset(rms, GATE, 0, s)
    let onsets = 0
    for (let i = 0; i < 40; i++) {
      rms *= 1.1
      if (detectOnset(rms, GATE, (i + 1) * 10.67, s)) onsets += 1
    }
    expect(onsets).toBe(0)
  })

  it('绝对增量下限跟着门限缩放（同一信号在高低门限下结论不同）', () => {
    // 门限 0.0008 → 下限 0.0004；门限 0.007 → 下限 0.0035
    const low = createOnsetState()
    detectOnset(0.002, 0.0008, 0, low)
    expect(detectOnset(0.003, 0.0008, 11, low)).toBe(true) // 增量 0.001 > 0.0004

    const high = createOnsetState()
    detectOnset(0.002, 0.007, 0, high)
    expect(detectOnset(0.003, 0.007, 11, high)).toBe(false) // 增量 0.001 < 0.0035，且低于门限
  })

  it('ONSET_DEFAULTS 的三个系数就是被钉住的值（改动必须改这里）', () => {
    expect(ONSET_DEFAULTS).toEqual({
      relativeRatio: 1.45,
      gateDeltaRatio: 0.5,
      refractoryMs: 75,
    })
  })

  it('不应期边界：恰好等于 75ms 时算起音（>= 而非 >）', () => {
    const s = createOnsetState()
    detectOnset(0.0002, GATE, 0, s)
    detectOnset(0.01, GATE, 100, s)
    detectOnset(0.0002, GATE, 125, s)
    expect(detectOnset(0.01, GATE, 175, s)).toBe(true)
  })
})

describe('confirmNote —— 二级多帧一致', () => {
  it('连续不足 N 帧不放行', () => {
    const s = createNoteConfirmState()
    for (let i = 0; i < NOTE_CONFIRM_REQUIRED_FRAMES - 1; i++) {
      expect(confirmNote({ frequency: A4_F, isNoteOnset: false }, s)).toBe(false)
    }
  })

  it('恰好第 N 帧放行，且只放行一次', () => {
    const s = createNoteConfirmState()
    for (let i = 0; i < NOTE_CONFIRM_REQUIRED_FRAMES - 1; i++) {
      confirmNote({ frequency: A4_F, isNoteOnset: false }, s)
    }
    expect(confirmNote({ frequency: A4_F, isNoteOnset: false }, s)).toBe(true)
    // 同音继续：不得重复放行
    for (let i = 0; i < 10; i++) {
      expect(confirmNote({ frequency: A4_F, isNoteOnset: false }, s)).toBe(false)
    }
  })

  it('换音后需重新累计 N 帧', () => {
    const s = createNoteConfirmState()
    confirmNote({ frequency: A4_F, isNoteOnset: false }, s)
    confirmNote({ frequency: A4_F, isNoteOnset: false }, s)
    expect(confirmNote({ frequency: A4_F, isNoteOnset: false }, s)).toBe(true)

    expect(confirmNote({ frequency: C4_F, isNoteOnset: false }, s)).toBe(false)
    expect(s.stableFrames).toBe(1)
    confirmNote({ frequency: C4_F, isNoteOnset: false }, s)
    expect(confirmNote({ frequency: C4_F, isNoteOnset: false }, s)).toBe(true)
  })

  it('🚨 八度抖动不打断连续计数（按音级比较，不是绝对 MIDI）', () => {
    const s = createNoteConfirmState()
    confirmNote({ frequency: A4_F, isNoteOnset: false }, s)
    // 上一帧 A4，这一帧跳到 A5（音级相同、八度不同）——必须视为同一个音
    confirmNote({ frequency: A5_F, isNoteOnset: false }, s)
    expect(s.stableFrames).toBe(2)
    expect(confirmNote({ frequency: A5_F, isNoteOnset: false }, s)).toBe(true)
  })

  it('音级相同但走的是 frequencyToNote 的唯一真相源', () => {
    // 与 lib/pitch-detection 的口径一致：A4 与 A5 都解析为 A
    expect(frequencyToNote(A4_F).note).toBe('A')
    expect(frequencyToNote(A5_F).note).toBe('A')
  })

  it('起音清空确认记忆 → 同一个音可以再次被放行', () => {
    const s = createNoteConfirmState()
    for (let i = 0; i < NOTE_CONFIRM_REQUIRED_FRAMES; i++) {
      confirmNote({ frequency: A4_F, isNoteOnset: false }, s)
    }
    expect(s.firedNote).toBe('A')

    // 重新拨弦。注意：起音那一帧自己就计入 stableFrames（=1），
    // 所以之后只需再 requiredFrames - 1 帧就会放行。
    expect(confirmNote({ frequency: A4_F, isNoteOnset: true }, s)).toBe(false)
    expect(s.firedNote).toBeNull()
    expect(s.stableFrames).toBe(1)

    const after = []
    for (let i = 0; i < NOTE_CONFIRM_REQUIRED_FRAMES - 1; i++) {
      after.push(confirmNote({ frequency: A4_F, isNoteOnset: false }, s))
    }
    expect(after[after.length - 1]).toBe(true)
    expect(after.slice(0, -1).every((r) => r === false)).toBe(true)
  })

  it('契约：调用方必须先过噪声门/置信门（本函数不判频率是否可信）', () => {
    // 0.0002Hz 这种明显是垃圾的频率，frequencyToNote 也会给出一个合法音名并照常累计。
    // 三条收音路径都在调用前已按 hasSignal / probability 过滤，此处把这个前提钉住：
    // 若不先过滤，静音帧会被当成一个稳定的「音」从而放行。
    const s = createNoteConfirmState()
    const bogus = 0.0002
    expect(frequencyToNote(bogus).note).not.toBe('-')
    let fires = 0
    for (let i = 0; i < 10; i++) {
      if (confirmNote({ frequency: bogus, isNoteOnset: false }, s)) fires += 1
    }
    expect(fires).toBe(1)
  })

  it('🚨 退化为「每个音只计一次分」：起音从不触发也不会重复放行', () => {
    const s = createNoteConfirmState()
    let fires = 0
    for (let i = 0; i < 300; i++) {
      if (confirmNote({ frequency: A4_F, isNoteOnset: false }, s)) fires += 1
    }
    expect(fires).toBe(1)
  })

  it('无效频率（0 / 负数 / NaN）重置连续计数且不放行', () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      const s = createNoteConfirmState()
      confirmNote({ frequency: A4_F, isNoteOnset: false }, s)
      expect(confirmNote({ frequency: bad, isNoteOnset: false }, s)).toBe(false)
      expect(s.stableFrames).toBe(0)
      expect(s.sameNote).toBeNull()
    }
  })

  it('requiredFrames 可覆盖（FLOW 模式的 2 帧档）', () => {
    const s = createNoteConfirmState()
    expect(confirmNote({ frequency: A4_F, isNoteOnset: false, requiredFrames: 2 }, s)).toBe(false)
    expect(confirmNote({ frequency: A4_F, isNoteOnset: false, requiredFrames: 2 }, s)).toBe(true)
  })

  it('resetNoteConfirmState 清空全部三个字段', () => {
    const s = createNoteConfirmState()
    confirmNote({ frequency: A4_F, isNoteOnset: false }, s)
    resetNoteConfirmState(s)
    expect(s).toEqual({ sameNote: null, stableFrames: 0, firedNote: null })
  })

  it('音名比较对 ♯ 音级同样成立（C♯4 与 C♯5 视为同一音）', () => {
    const s = createNoteConfirmState()
    const cs4 = freq(-8)
    const cs5 = freq(4)
    confirmNote({ frequency: cs4, isNoteOnset: false }, s)
    confirmNote({ frequency: cs5, isNoteOnset: false }, s)
    expect(s.stableFrames).toBe(2)
    expect(s.sameNote).toBe('C♯')
  })
})

describe('两级串联 —— 与 GuitarRun 的等效行为矩阵', () => {
  const GATE = 0.0008
  /** worklet 默认 hop 512 / 48000Hz */
  const FRAME_MS = 512 / 48000 * 1000

  it('一次拨弦 → 只有一次放行；重新拨同一个音 → 再放行一次', () => {
    const onset = createOnsetState()
    const confirm = createNoteConfirmState()
    let t = 0
    const fires: number[] = []

    // 模拟真实链路：起音检测**每帧都跑**（它需要看到完整的 RMS 序列，
    // 包括门限以下的那些帧），但 confirmNote **只在本帧过门限时才调用**
    // —— 与 worklet 里 `energy < adaptiveThreshold` 提前 return 的行为一致。
    const frame = (rms: number, f: number) => {
      const isOnset = detectOnset(rms, GATE, t, onset)
      if (rms >= GATE && confirmNote({ frequency: f, isNoteOnset: isOnset }, confirm)) {
        fires.push(t)
      }
      t += FRAME_MS
    }

    // 静音 3 帧 → 第 1 次拨弦，持音 20 帧
    for (let i = 0; i < 3; i++) frame(0.0002, A4_F)
    for (let i = 0; i < 20; i++) frame(0.01, A4_F)
    // 松手静音 10 帧
    for (let i = 0; i < 10; i++) frame(0.0002, A4_F)
    // 第 2 次拨同一个音，持音 20 帧
    for (let i = 0; i < 20; i++) frame(0.01, A4_F)

    expect(fires.length).toBe(2)
    // 第一次：拨弦后第 (requiredFrames-1) 帧
    expect(fires[0]).toBeCloseTo(3 * FRAME_MS + (NOTE_CONFIRM_REQUIRED_FRAMES - 1) * FRAME_MS, 5)
    // 第二次应在第二次拨弦之后
    expect(fires[1]).toBeGreaterThan(33 * FRAME_MS)
  })

  it('拨弦瞬态（顶起一帧后回落）不产生放行', () => {
    const onset = createOnsetState()
    const confirm = createNoteConfirmState()
    let t = 0
    let fires = 0

    const frame = (rms: number, f: number) => {
      const isOnset = detectOnset(rms, GATE, t, onset)
      if (rms >= GATE && confirmNote({ frequency: f, isNoteOnset: isOnset }, confirm)) {
        fires += 1
      }
      t += FRAME_MS
    }

    for (let i = 0; i < 3; i++) frame(0.0002, A4_F)
    frame(0.01, A4_F)   // 瞬态只出现一帧
    for (let i = 0; i < 10; i++) frame(0.0002, A4_F)

    expect(fires).toBe(0)
  })

  it('不应期内的连续两帧瞬态合计只算一次起音（不会累计成一次放行）', () => {
    const onset = createOnsetState()
    const confirm = createNoteConfirmState()
    let t = 0
    let fires = 0

    const frame = (rms: number, f: number) => {
      const isOnset = detectOnset(rms, GATE, t, onset)
      if (rms >= GATE && confirmNote({ frequency: f, isNoteOnset: isOnset }, confirm)) {
        fires += 1
      }
      t += FRAME_MS
    }

    for (let i = 0; i < 3; i++) frame(0.0002, A4_F)
    frame(0.01, A4_F)   // 瞬态
    frame(0.0002, A4_F) // 立刻回落（不调用 confirmNote）
    frame(0.01, A4_F)   // 20ms 后再顶一帧 —— 仍在 75ms 不应期内
    for (let i = 0; i < 10; i++) frame(0.0002, A4_F)

    expect(fires).toBe(0)
  })
})

// ============================================================================
// 多帧一致的「时间口径」：三条收音路径的帧间隔差 17 倍，固定帧数会让回退路径
// 的确认延迟放大成 ~0.5s（120BPM 的练习 500ms/音根本计不上分）。
// ============================================================================

describe('requiredFramesForFrameMs —— 把目标时长换算成各路径的帧数', () => {
  it('三条真实路径的换算结果（与 app/page.tsx 的帧长度常量同源）', () => {
    expect(requiredFramesForFrameMs(NOTE_CONFIRM_WORKLET_FRAME_MS)).toBe(3) // worklet hop 512@48k
    expect(requiredFramesForFrameMs(50)).toBe(2) // Tauri startPitchStream(50)
    expect(requiredFramesForFrameMs((8192 / 48000) * 1000)).toBe(2) // ScriptProcessor @48k
    expect(requiredFramesForFrameMs((8192 / 44100) * 1000)).toBe(2) // ScriptProcessor @44.1k
  })

  it('帧比目标时长还粗时取下限（NOTE_CONFIRM_MIN_FRAMES），不会退化成 1 帧', () => {
    expect(NOTE_CONFIRM_MIN_FRAMES).toBe(2)
    expect(requiredFramesForFrameMs(100)).toBe(2)
    expect(requiredFramesForFrameMs(1000)).toBe(2)
  })

  it('帧很快时按时间换算（帧数随帧率上升，不设上限）', () => {
    expect(requiredFramesForFrameMs(1)).toBe(NOTE_CONFIRM_TARGET_MS) // 32
    expect(requiredFramesForFrameMs(0.1)).toBe(NOTE_CONFIRM_TARGET_MS * 10) // 320
  })

  it('非法帧间隔（0 / 负 / NaN / ±Infinity）回落 worklet 口径 3 帧', () => {
    for (const bad of [0, -0.5, Number.NaN, Infinity, -Infinity]) {
      expect(requiredFramesForFrameMs(bad)).toBe(3)
    }
  })

  it('NOTE_CONFIRM_REQUIRED_FRAMES 就是 worklet 口径（向后兼容的旧常量）', () => {
    expect(NOTE_CONFIRM_REQUIRED_FRAMES).toBe(3)
    expect(NOTE_CONFIRM_REQUIRED_FRAMES).toBe(
      requiredFramesForFrameMs(NOTE_CONFIRM_WORKLET_FRAME_MS)
    )
  })

  it('NOTE_CONFIRM_TARGET_MS 与旧口径等值（32 ≈ 3 × 10.67ms ⇒ worklet 行为不变）', () => {
    expect(NOTE_CONFIRM_TARGET_MS).toBe(32)
    expect(NOTE_CONFIRM_TARGET_MS).toBeCloseTo(3 * NOTE_CONFIRM_WORKLET_FRAME_MS, 0)
  })
})

describe('confirmNote —— 传入 frameMs 后按该路径的时间口径确认', () => {
  it('粗帧路径（50ms，Tauri）两帧即放行，不要求三帧', () => {
    const s = createNoteConfirmState()
    expect(confirmNote({ frequency: A4_F, isNoteOnset: false, frameMs: 50 }, s)).toBe(false)
    expect(confirmNote({ frequency: A4_F, isNoteOnset: false, frameMs: 50 }, s)).toBe(true)
  })

  it('最粗帧路径（~186ms，ScriptProcessor）也只要两帧', () => {
    const frameMs = (8192 / 44100) * 1000
    const s = createNoteConfirmState()
    expect(confirmNote({ frequency: A4_F, isNoteOnset: false, frameMs }, s)).toBe(false)
    expect(confirmNote({ frequency: A4_F, isNoteOnset: false, frameMs }, s)).toBe(true)
  })

  it('worklet 口径（10.67ms）仍旧要三帧 —— 行为与改动前完全一致', () => {
    const frameMs = NOTE_CONFIRM_WORKLET_FRAME_MS
    const s = createNoteConfirmState()
    expect(confirmNote({ frequency: A4_F, isNoteOnset: false, frameMs }, s)).toBe(false)
    expect(confirmNote({ frequency: A4_F, isNoteOnset: false, frameMs }, s)).toBe(false)
    expect(confirmNote({ frequency: A4_F, isNoteOnset: false, frameMs }, s)).toBe(true)
  })

  it('requiredFrames 优先于 frameMs（固定档位仍可强制覆盖）', () => {
    const s = createNoteConfirmState()
    // frameMs 只值 2 帧，但显式要 5 帧 ⇒ 必须等满 5 帧
    for (let i = 0; i < 4; i++) {
      expect(confirmNote({ frequency: A4_F, isNoteOnset: false, frameMs: 50, requiredFrames: 5 }, s)).toBe(false)
    }
    expect(confirmNote({ frequency: A4_F, isNoteOnset: false, frameMs: 50, requiredFrames: 5 }, s)).toBe(true)
  })

  it('frameMs 非法时按 worklet 口径处理（3 帧），不放宽也不收紧', () => {
    for (const bad of [0, -1, Number.NaN, Infinity]) {
      const s = createNoteConfirmState()
      expect(confirmNote({ frequency: A4_F, isNoteOnset: false, frameMs: bad }, s)).toBe(false)
      expect(confirmNote({ frequency: A4_F, isNoteOnset: false, frameMs: bad }, s)).toBe(false)
      expect(confirmNote({ frequency: A4_F, isNoteOnset: false, frameMs: bad }, s)).toBe(true)
    }
  })

  it('不传 frameMs 时等价于 worklet 口径（旧调用点行为不变）', () => {
    const a = createNoteConfirmState()
    const b = createNoteConfirmState()
    for (let i = 0; i < 3; i++) {
      const r1 = confirmNote({ frequency: A4_F, isNoteOnset: false }, a)
      const r2 = confirmNote({ frequency: A4_F, isNoteOnset: false, frameMs: NOTE_CONFIRM_WORKLET_FRAME_MS }, b)
      expect(r1).toBe(r2)
    }
  })
})

describe('🚨 三路径的墙钟确认延迟必须同量级（这是「固定 3 帧」暴露不出来的那条）', () => {
  /** 三条路径的真实帧间隔，与 app/page.tsx 的 AUDIO_WORKLET_HOP_SIZE /
   *  NATIVE_PITCH_INTERVAL_MS / SCRIPT_PROCESSOR_BUFFER_SIZE 同源。 */
  const PATHS = [
    { name: 'worklet', frameMs: (512 / 48000) * 1000 },
    { name: 'Tauri', frameMs: 50 },
    { name: 'ScriptProcessor', frameMs: (8192 / 44100) * 1000 },
  ]

  /** 从「同一个音稳定输入」到放行，花了多少墙钟毫秒。 */
  const latencyMs = (frameMs: number): number => {
    const s = createNoteConfirmState()
    for (let n = 1; n <= 50; n++) {
      if (confirmNote({ frequency: A4_F, isNoteOnset: false, frameMs }, s)) return n * frameMs
    }
    throw new Error('50 帧内未确认')
  }

  it('worklet 仍在 ~32ms 确认（改动不得改变它）', () => {
    expect(latencyMs((512 / 48000) * 1000)).toBeCloseTo(NOTE_CONFIRM_TARGET_MS, 0)
  })

  it('Tauri（50ms 帧）：≤ 120ms。固定 3 帧会是 150ms ⇒ 这条会红', () => {
    expect(latencyMs(50)).toBeLessThanOrEqual(120)
  })

  it('ScriptProcessor（~186ms 帧）：≤ 400ms。固定 3 帧会是 ~557ms ⇒ 这条会红', () => {
    const frameMs = (8192 / 44100) * 1000
    expect(latencyMs(frameMs)).toBeLessThanOrEqual(400)
    // 与旧实现的直接对照：旧的是 3 帧
    expect(latencyMs(frameMs)).toBeLessThan(3 * frameMs)
  })

  it('三条路径的延迟都在「毫秒级、肉眼不可分辨」的同一量级（最大 / 最小 < 15 倍）', () => {
    const ms = PATHS.map((p) => latencyMs(p.frameMs))
    const min = Math.min(...ms)
    const max = Math.max(...ms)
    // 帧率本身差 17 倍，但确认**帧数**降到 2 后，延迟比值必须远小于旧实现的 17 倍
    expect(max / min).toBeLessThan(15)
  })
})
