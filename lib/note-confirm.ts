// 收音判定的两级前置滤波（从 app/page.tsx 的三条收音路径汇合处抽出的纯决策逻辑）。
//
// 背景：此前「一帧检出即判定命中」。YIN 在拨弦瞬态、换把位、临音余韵上都会短暂给出
// 能过门限的结果，单帧判定会把这类抖动当成用户弹对了。
//
// 两级滤波（两者都是竞品 GuitarRun 在用的做法，见根目录 guitarrun-pitch-analysis.md §3）：
//   1. 起音检测 detectOnset —— RMS 上升沿，用来知道「用户刚拨了一下」；
//   2. 多帧一致 confirmNote —— 连续 N 帧检出同一个音级才放行。
//
// 两级是**互补**的，缺任一级都还能退化成可接受的行为（见下），不是串联的单点故障：
//   - 只有多帧一致、起音从不触发 → 退化成「每个音级只计一次分」（firedNote 锁）。
//     因为我们命中后会立即换题，且被判定失败不计分，这仍然可用。
//   - 只有起音、没有多帧一致 → 回到「一次拨弦计一次分」，比单帧判定好，但仍会吃到瞬态。
//
// ⚠️ 两个刻意的口径决定，改动前先读：
//
// (1) **音级比较用音名，不用绝对 MIDI。** 我们的匹配口径本来就是音级
//     （getAdjustedCents 按八度回绕，见 lib/pitch-match.ts 顶部注释）。若这里按绝对
//     八度比较，YIN 在同音上的八度抖动会不断重置计数 ⇒ 永远确认不了。
//     音名走 frequencyToNote()（唯一真相源），不另建 ASCII 表。
//
// (2) **起音用「上一帧原始 RMS」做基线，不用 EMA 基线。** 直觉上 EMA 更稳，但实测推演
//     会发现它是错的：稳态长音下 EMA 会缓慢追上当前电平，于是每过一个不应期就重新满足
//     `rms > baseline × 1.45` ⇒ **持音会被反复判成起音**（帧间比较在同一场景下差值为 0，
//     恒不触发）。这一点与 GuitarRun 的做法一致（它同样用 prevRms）。

import { frequencyToNote } from '@/lib/pitch-detection'

// ==================== 一级：起音检测 ====================

export interface OnsetState {
  /** 上一帧的原始 RMS；null 表示还没有上一帧（首帧永不可能是起音） */
  prevRms: number | null
  /** 上次判定为起音的时刻（ms） */
  lastOnsetAt: number
}

export interface OnsetParams {
  /** 相对条件：当前 RMS 需超过上一帧的这个倍数（挡住缓变渐强与稳态抖动） */
  relativeRatio: number
  /** 绝对增量下限 = 噪声门 × 这个系数（跟着门限缩放，见 ONSET_DEFAULTS 注释） */
  gateDeltaRatio: number
  /** 不应期（ms）：一次拨弦的上升沿可能跨若干帧，防它被拆成多次起音 */
  refractoryMs: number
}

/**
 * 竞品 GuitarRun 的绝对增量是写死的 0.004（≈ −48 dBFS 的跳变），对应它自己的门限
 * `clamp(底噪×3.2, 0.007, 0.045)`（最低 0.007 ≈ −43 dBFS）。
 * **我们的门限下限低得多**（worklet 侧 `max(0.0008, 底噪×1.5)`，最低 0.0008 ≈ −62 dBFS），
 * 所以那个 0.004 直接搬过来会导致轻弹（RMS 0.001~0.003 量级）永远判不出起音。
 * 改成「门限 × 0.5」后它会自动跟着环境缩放：
 *   门限 0.0008 → 绝对增量下限 0.0004；门限 0.007 → 0.0035（≈ GuitarRun 的 0.004）。
 */
export const ONSET_DEFAULTS: OnsetParams = {
  relativeRatio: 1.45,
  gateDeltaRatio: 0.5,
  refractoryMs: 75,
}

export function createOnsetState(): OnsetState {
  return { prevRms: null, lastOnsetAt: -Infinity }
}

/**
 * 判定这一帧是否是一次**新的起音**。会就地更新 `state`（10ms 级热路径，不为每次调用分配对象）。
 *
 * @param rms   本帧 RMS
 * @param gate  当前噪声门限（RMS）。低于它一律不算起音 —— 否则纯底噪的相对波动会触发。
 * @param nowMs 本帧时刻（ms），与 `state.lastOnsetAt` 同源
 */
export function detectOnset(
  rms: number,
  gate: number,
  nowMs: number,
  state: OnsetState,
  params: OnsetParams = ONSET_DEFAULTS
): boolean {
  const prev = state.prevRms
  const minDelta = gate * params.gateDeltaRatio

  const isOnset =
    prev !== null &&
    rms >= gate &&
    rms > prev * params.relativeRatio &&
    rms - prev > minDelta &&
    nowMs - state.lastOnsetAt >= params.refractoryMs

  state.prevRms = rms
  if (isOnset) state.lastOnsetAt = nowMs
  return isOnset
}

// ==================== 二级：多帧一致 ====================

/**
 * 目标确认时长（ms）：「本音第一次被检出」到「放行」至少要跨越这么久。
 *
 * ⚠️ 为什么按**时间**而不是固定帧数：三条收音路径的帧间隔差 17 倍 ——
 *   worklet            hopSize 512 / 48000        ≈ 10.7ms
 *   Tauri              startPitchStream(50)        = 50ms（Rust 每 50ms 出一次结果）
 *   ScriptProcessor    createScriptProcessor(8192) ≈ 171~186ms（48k / 44.1k）
 * 固定「3 帧」只对 worklet 成立（32ms）。在 ScriptProcessor 回退路径上会变成 ~0.5s
 * 才能确认一个音 —— 120BPM 的练习（500ms/音）根本计不上分。竞品 GuitarRun 也是按时间
 * （2 帧 × 由 rAF 决定的 ~16.7ms ≈ 33ms）。
 *
 * 32ms 与旧口径（3 × 10.7ms）等价 ⇒ worklet 行为不变。
 * 改之前先跑 __tests__/note-confirm.test.ts。
 */
export const NOTE_CONFIRM_TARGET_MS = 32

/**
 * 帧再粗也至少要两帧：一帧就放行等于退回「单帧检出即命中」，把这级滤波抹掉。
 * 帧间隔大于目标时长时，确认延迟的下限就是帧长本身（ScriptProcessor 上 ~186ms）——
 * 那是粗帧路径的固有代价，不能靠调参绕过。
 */
export const NOTE_CONFIRM_MIN_FRAMES = 2

/** worklet 默认帧间隔（hopSize 512 @ 48000）。调用方没报 `frameMs` 时的兜底口径。 */
export const NOTE_CONFIRM_WORKLET_FRAME_MS = (512 / 48000) * 1000

/**
 * 把「目标确认时长」换算成某条路径实际需要的帧数。
 * @param frameMs 该路径的帧间隔（ms）。非法值（0 / 负 / NaN / Infinity）回落到 worklet 口径。
 */
export function requiredFramesForFrameMs(frameMs: number): number {
  const safe =
    Number.isFinite(frameMs) && frameMs > 0 ? frameMs : NOTE_CONFIRM_WORKLET_FRAME_MS
  return Math.max(NOTE_CONFIRM_MIN_FRAMES, Math.round(NOTE_CONFIRM_TARGET_MS / safe))
}

/** worklet 口径下的帧数（= 3）。保留此常量以兼容既有调用点与测试。 */
export const NOTE_CONFIRM_REQUIRED_FRAMES = requiredFramesForFrameMs(NOTE_CONFIRM_WORKLET_FRAME_MS)

export interface NoteConfirmState {
  /** 当前连续检出的音名 */
  sameNote: string | null
  /** 已连续多少帧 */
  stableFrames: number
  /** 已经放行过的音名，用于防止同一个音在一次拨弦内被重复计分 */
  firedNote: string | null
}

export function createNoteConfirmState(): NoteConfirmState {
  return { sameNote: null, stableFrames: 0, firedNote: null }
}

export function resetNoteConfirmState(state: NoteConfirmState): void {
  state.sameNote = null
  state.stableFrames = 0
  state.firedNote = null
}

export interface ConfirmNoteInput {
  /** 检测到的**原始**频率（未经平滑）。平滑是给眼睛看的，判定要的是这一刻真弹了什么 */
  frequency: number
  /** 本帧是否为起音（来自 detectOnset / worklet / Rust）；起音会清空上一轮的确认记忆 */
  isNoteOnset: boolean
  /**
   * 本路径的帧间隔（ms）。给了就按 `NOTE_CONFIRM_TARGET_MS` 换算成帧数，
   * 让三条帧率差 17 倍的路径拿到相同的**时间**滤波强度（见 `NOTE_CONFIRM_TARGET_MS` 注释）。
   * 缺省按 worklet 口径。
   */
  frameMs?: number
  /** 直接指定帧数。优先级最高（给 FLOW 的 2 帧档这类固定档位用）。 */
  requiredFrames?: number
}

/**
 * 判定这一帧是否可以放行给练习匹配。会就地更新 `state`。
 *
 * @returns true 表示「音已确认，可以计分」；调用方对同一段连续同音只会拿到一次 true。
 */
export function confirmNote(input: ConfirmNoteInput, state: NoteConfirmState): boolean {
  const requiredFrames =
    input.requiredFrames ??
    requiredFramesForFrameMs(input.frameMs ?? NOTE_CONFIRM_WORKLET_FRAME_MS)

  // 新起音：清空记忆。否则同一个音在长按期间无法被第二次计分。
  if (input.isNoteOnset) {
    resetNoteConfirmState(state)
  }

  const note = frequencyToNote(input.frequency).note
  if (!note || note === '-') {
    state.sameNote = null
    state.stableFrames = 0
    return false
  }

  if (state.sameNote === note) {
    state.stableFrames += 1
  } else {
    state.sameNote = note
    state.stableFrames = 1
  }

  if (state.stableFrames >= requiredFrames && state.firedNote !== note) {
    state.firedNote = note
    return true
  }
  return false
}
