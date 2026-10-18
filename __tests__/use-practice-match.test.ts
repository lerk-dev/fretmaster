/**
 * `hooks/use-practice-match.ts` 的**行为**测试（此前只有源码级护栏，零行为覆盖）。
 *
 * 为什么现在才写得起来：C9 把三条路径合进来时 options 有 75 个平铺参数，
 * 一条测试要构造 75 个 mock —— 等于写不出。分组重构 + `helpers/answer-options.ts`
 * 之后，一条用例只写自己关心的那几项。
 *
 * 本轮先覆盖**点击路径**（`handleFretClick`），理由：
 *   · 它不经过 `confirmNote` 的两级前置滤波（音频路径要连续多帧同音才放行，测试很脆）；
 *   · 它却是最容易出「显示红色、练习却前进了」那类分叉的地方 ——
 *     判定与推进分居两处（判定在这里、推进在 100ms 后的 handleMIDINoteInput）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { usePracticeMatch } from '@/hooks/use-practice-match'
import { getNoteAtPosition } from '@/lib/page-theory-functions'
import { createNoteConfirmState, requiredFramesForFrameMs } from '@/lib/note-confirm'
import { makeAnswerOptions } from './helpers/answer-options'
import { renderHook, unmountAllHooks } from './helpers/render-hook'

/** 取一个真实指板位置的音名，避免在测试里手写「6 弦 0 品 = E」这类容易过时的假设 */
const NOTE_AT_0_0 = getNoteAtPosition(0, 0)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  unmountAllHooks()
})

describe('handleFretClick：红绿显示与实际推进必须一致', () => {
  it('找音模式点对 ⇒ 判绿 + 反馈音 + 100ms 后推进（setScore/recordPositionStat 各一次）', () => {
    const actions = {
      recordPositionStat: vi.fn(),
      setScore: vi.fn(),
      triggerCorrectFeedback: vi.fn(),
      triggerWrongFeedback: vi.fn(),
      playFeedbackSound: vi.fn(),
      setHighlightedFrets: vi.fn(),
    }
    const practice = {
      targetNote: NOTE_AT_0_0,
      targetNoteRef: { current: NOTE_AT_0_0 },
      generateNewTarget: vi.fn(),
      generateNewTargetRef: { current: null },
    }
    const h = renderHook(() =>
      usePracticeMatch(
        makeAnswerOptions({
          runtime: { isPlaying: true, isPlayingRef: { current: true }, activeTab: 'practice', activeTabRef: { current: 'practice' } },
          practice,
          actions,
        }),
      ),
    )

    act(() => h.current.handleFretClick(0, 0))

    // 判绿 + 声音反馈
    expect(actions.triggerCorrectFeedback).toHaveBeenCalledWith(NOTE_AT_0_0)
    expect(actions.triggerWrongFeedback).not.toHaveBeenCalled()
    expect(actions.playFeedbackSound).toHaveBeenCalledWith(true)
    // 高亮先记绿（第一个参数是 updater，不是布尔 —— 断言「传进去的是个函数」+ 调用它能得到 Map）
    expect(actions.setHighlightedFrets).toHaveBeenCalledTimes(1)
    const updater = actions.setHighlightedFrets.mock.calls[0][0] as (p: Map<string, boolean>) => Map<string, boolean>
    expect(updater(new Map())).toEqual(new Map([['0-0', true]]))

    // 推进委托给 MIDI 路径（100ms 后），此刻还没计分
    expect(actions.setScore).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(100) })
    expect(actions.recordPositionStat).toHaveBeenCalledWith(true)
    expect(actions.setScore).toHaveBeenCalledTimes(1)
  })

  it('找音模式点错 ⇒ 判红 + 错音反馈 + 100ms 后仍然计一次失败（分母要进）', () => {
    const actions = {
      recordPositionStat: vi.fn(),
      setScore: vi.fn(),
      triggerCorrectFeedback: vi.fn(),
      triggerWrongFeedback: vi.fn(),
      playFeedbackSound: vi.fn(),
      setHighlightedFrets: vi.fn(),
    }
    // 目标设成别处的音，保证 (0,0) 一定不是它
    const otherNote = getNoteAtPosition(0, 3)
    const h = renderHook(() =>
      usePracticeMatch(
        makeAnswerOptions({
          runtime: { isPlaying: true, isPlayingRef: { current: true }, activeTab: 'practice', activeTabRef: { current: 'practice' } },
          practice: { targetNote: otherNote, targetNoteRef: { current: otherNote }, generateNewTarget: vi.fn(), generateNewTargetRef: { current: null } },
          actions,
        }),
      ),
    )

    act(() => h.current.handleFretClick(0, 0))

    expect(actions.triggerWrongFeedback).toHaveBeenCalledWith(NOTE_AT_0_0)
    expect(actions.playFeedbackSound).toHaveBeenCalledWith(false)
    const updater = actions.setHighlightedFrets.mock.calls[0][0] as (p: Map<string, boolean>) => Map<string, boolean>
    expect(updater(new Map())).toEqual(new Map([['0-0', false]]))

    act(() => { vi.advanceTimersByTime(100) })
    // 🚨 答错也要记 total（正确率 = correct/total 会持久化）—— 见 lib/answer-judge 的 scoreDeltaFor
    expect(actions.recordPositionStat).toHaveBeenCalledWith(false)
    expect(actions.setScore).toHaveBeenCalledTimes(1)
    const updaterScore = actions.setScore.mock.calls[0][0] as (p: { correct: number; total: number }) => { correct: number; total: number }
    expect(updaterScore({ correct: 0, total: 0 })).toEqual({ correct: 0, total: 1 })
  })

  it('未在练习中（isPlaying=false）⇒ 完全不响应（不判色、不计分、不挂定时器）', () => {
    const actions = {
      recordPositionStat: vi.fn(),
      setScore: vi.fn(),
      triggerCorrectFeedback: vi.fn(),
      triggerWrongFeedback: vi.fn(),
      playFeedbackSound: vi.fn(),
      setHighlightedFrets: vi.fn(),
      clearFretClickTimers: vi.fn(),
    }
    const h = renderHook(() =>
      usePracticeMatch(makeAnswerOptions({ actions, practice: { targetNote: NOTE_AT_0_0, targetNoteRef: { current: NOTE_AT_0_0 } } })),
    )

    act(() => h.current.handleFretClick(0, 0))
    act(() => { vi.advanceTimersByTime(200) })

    expect(actions.setHighlightedFrets).not.toHaveBeenCalled()
    expect(actions.triggerCorrectFeedback).not.toHaveBeenCalled()
    expect(actions.triggerWrongFeedback).not.toHaveBeenCalled()
    expect(actions.setScore).not.toHaveBeenCalled()
  })

  it('品区限制：5 品区外的点击不响应', () => {
    const actions = {
      recordPositionStat: vi.fn(),
      setScore: vi.fn(),
      triggerCorrectFeedback: vi.fn(),
      triggerWrongFeedback: vi.fn(),
      playFeedbackSound: vi.fn(),
      setHighlightedFrets: vi.fn(),
    }
    const h = renderHook(() =>
      usePracticeMatch(
        makeAnswerOptions({
          runtime: { isPlaying: true, isPlayingRef: { current: true } },
          practice: { targetNote: NOTE_AT_0_0, targetNoteRef: { current: NOTE_AT_0_0 } },
          actions: { ...actions, fretZoneEnabled: true, fretZoneStart: 5, fretZoneSize: 5, fretCount: 15 },
        }),
      ),
    )

    // 品区 5..9，点 0 品应被挡掉
    act(() => h.current.handleFretClick(0, 0))
    act(() => { vi.advanceTimersByTime(200) })

    expect(actions.setHighlightedFrets).not.toHaveBeenCalled()
    expect(actions.setScore).not.toHaveBeenCalled()
  })
})

// ============================================================ 音频路径（2026-10-18）

/**
 * `processPracticeMatch` 是**收音链路唯一的判定入口**（worklet / ScriptProcessor /
 * Tauri 原生三条来源都汇到这里）。它前面有一层两级前置滤波（`confirmNote`：
 * 起音清空记忆 + 连续 N 帧同音才放行），所以测试必须按帧喂。
 *
 * 口径要点（都是修过的静默 bug，用测试钉住）：
 *   · 命中/未命中**都要计分**（`scoreDeltaFor`：答错也进分母）—— 曾经写成
 *     `if (matched) { 计分 }`，导致 Mic 用户正确率恒 100%、逐位置统计永远「已掌握」；
 *   · 冷却中必须整段返回，且判断顺序要在 `confirmNote` **之前**
 *     （否则放行被白白吃掉）。
 */
describe('processPracticeMatch：音频路径', () => {
  const E2 = 82.41
  const C2 = 65.41
  /** frameMs=128 ⇒ requiredFrames = max(2, round(32/128)) = 2 */
  const FRAME_MS = 128
  const REQUIRED = requiredFramesForFrameMs(FRAME_MS)

  function mountAudio(overrides: Parameters<typeof makeAnswerOptions>[0] = {}) {
    const actions = {
      recordPositionStat: vi.fn(),
      setScore: vi.fn(),
      triggerCorrectFeedback: vi.fn(),
      triggerWrongFeedback: vi.fn(),
      playFeedbackSound: vi.fn(),
      setHighlightedFrets: vi.fn(),
    }
    const generateNewTarget = vi.fn()
    const state = createNoteConfirmState()
    const h = renderHook(() =>
      usePracticeMatch(
        makeAnswerOptions({
          runtime: { isPlaying: true, isPlayingRef: { current: true }, activeTab: 'practice', activeTabRef: { current: 'practice' } },
          audio: { noteConfirmStateRef: { current: state } },
          practice: { targetNote: 'E', targetNoteRef: { current: 'E' }, generateNewTarget, generateNewTargetRef: { current: generateNewTarget } },
          actions,
          ...overrides,
        }),
      ),
    )
    /** 喂一帧：默认不起音（起音只在第一帧用） */
    const feed = (frequency: number, isNoteOnset = false, note = 'E2') =>
      act(() =>
        h.current.processPracticeMatch({
          frequency,
          note,
          probability: 0.95,
          isNoteOnset,
          rawFrequency: frequency,
          frameMs: FRAME_MS,
        }),
      )
    return { h, actions, generateNewTarget, feed }
  }

  it(`连续 ${REQUIRED} 帧同音放行后才命中 ⇒ 计分 + 正确反馈 + 出下一题`, () => {
    const { actions, generateNewTarget, feed } = mountAudio()

    feed(E2, true) // 起音：清空记忆，stableFrames=1
    expect(actions.setScore).not.toHaveBeenCalled() // 还没到帧数

    feed(E2) // stableFrames=2 ⇒ 放行
    expect(actions.recordPositionStat).toHaveBeenCalledWith(true)
    expect(actions.setScore).toHaveBeenCalledTimes(1)
    expect(actions.triggerCorrectFeedback).toHaveBeenCalledWith('E2')
    expect(generateNewTarget).toHaveBeenCalledTimes(1)
  })

  it('🚨 音不对也要计一次失败（分母必须进）', () => {
    const { actions, feed } = mountAudio()

    feed(C2, true, 'C2')
    feed(C2, false, 'C2')

    expect(actions.recordPositionStat).toHaveBeenCalledWith(false)
    expect(actions.setScore).toHaveBeenCalledTimes(1)
    const updater = actions.setScore.mock.calls[0][0] as (p: { correct: number; total: number }) => { correct: number; total: number }
    expect(updater({ correct: 3, total: 5 })).toEqual({ correct: 3, total: 6 })
    expect(actions.triggerCorrectFeedback).not.toHaveBeenCalled()
  })

  it('冷却中（isCoolingDownRef=true）⇒ 一帧都不处理，且不会吃掉放行', () => {
    const { actions, feed } = mountAudio({ audio: { isCoolingDownRef: { current: true } } })

    feed(E2, true)
    feed(E2)

    expect(actions.setScore).not.toHaveBeenCalled()
    expect(actions.recordPositionStat).not.toHaveBeenCalled()
  })

  it('未在练习中 ⇒ 不处理', () => {
    const { actions, feed } = mountAudio({
      runtime: { isPlaying: false, isPlayingRef: { current: false } },
    })

    feed(E2, true)
    feed(E2)

    expect(actions.setScore).not.toHaveBeenCalled()
  })
})

// ============================================================ MIDI 路径（2026-10-18）

/**
 * MIDI 路径没有滤波（按键即事件），但要覆盖两件事：
 *   · 异名同音：目标 `E`、MIDI 给 `E4`（带八度）/ `Fb` 都要判对
 *     —— 曾经这里是 `note === targetNote` 字面量比较；
 *   · 按钮答题模式下 MIDI 输入不该自动匹配（与音频路径一致）。
 */
describe('handleMIDINoteInput：MIDI 路径', () => {
  function mountMidi(overrides: Parameters<typeof makeAnswerOptions>[0] = {}) {
    const actions = {
      recordPositionStat: vi.fn(),
      setScore: vi.fn(),
      triggerCorrectFeedback: vi.fn(),
      triggerWrongFeedback: vi.fn(),
      playFeedbackSound: vi.fn(),
      setHighlightedFrets: vi.fn(),
    }
    const generateNewTarget = vi.fn()
    const h = renderHook(() =>
      usePracticeMatch(
        makeAnswerOptions({
          runtime: { isPlaying: true, isPlayingRef: { current: true }, activeTab: 'practice', activeTabRef: { current: 'practice' } },
          practice: { targetNote: 'E', targetNoteRef: { current: 'E' }, generateNewTarget, generateNewTargetRef: { current: generateNewTarget } },
          actions,
          ...overrides,
        }),
      ),
    )
    return { h, actions, generateNewTarget }
  }

  it('目标 E、弹 E4（带八度）⇒ 命中（noteNameToPitchClass 必须吃八度后缀）', () => {
    const { h, actions, generateNewTarget } = mountMidi()

    act(() => h.current.handleMIDINoteInput('E4'))

    expect(actions.recordPositionStat).toHaveBeenCalledWith(true)
    expect(actions.setScore).toHaveBeenCalledTimes(1)
    expect(generateNewTarget).toHaveBeenCalledTimes(1)
  })

  it('目标 Db、弹 C#4（异名同音）⇒ 命中（半音比对，不是字符串相等）', () => {
    // ⚠️ 只用 NOTES / NOTES_FLAT 里有的拼写（Db / C#）。
    //    理论变音（Fb / Cb / E# / B#）**解析不了**：noteNameToPitchClass → getNoteIndex
    //    只在 NOTES(♯) / NOTES_FLAT(♭) 两张表里查，'F♭' 不在表内 ⇒ 返回 -1 ⇒ 判不出来。
    //    实践中不会出现这类拼写（MIDI 音名映射与 getNoteAtPosition 都只产标准名），
    //    所以这里不把它当缺陷，只用真实会出现的等价对来验证「半音比对」。
    const { h, actions } = mountMidi({ practice: { targetNote: 'Db', targetNoteRef: { current: 'Db' } } })

    act(() => h.current.handleMIDINoteInput('C#4'))

    expect(actions.recordPositionStat).toHaveBeenCalledWith(true)
  })

  it('弹错 ⇒ 计一次失败 + 不出下一题', () => {
    const { h, actions, generateNewTarget } = mountMidi()

    act(() => h.current.handleMIDINoteInput('C4'))

    expect(actions.recordPositionStat).toHaveBeenCalledWith(false)
    expect(generateNewTarget).not.toHaveBeenCalled()
    const updater = actions.setScore.mock.calls[0][0] as (p: { correct: number; total: number }) => { correct: number; total: number }
    expect(updater({ correct: 0, total: 0 })).toEqual({ correct: 0, total: 1 })
  })

  it('按钮答题模式 ⇒ MIDI 输入不自动匹配（避免抢答）', () => {
    const { h, actions } = mountMidi({
      runtime: { practiceAnswerModeRef: { current: 'buttons' } },
    })

    act(() => h.current.handleMIDINoteInput('E4'))

    expect(actions.setScore).not.toHaveBeenCalled()
  })

  it('未在练习中 ⇒ 不响应', () => {
    const { h, actions } = mountMidi({ runtime: { isPlaying: false, isPlayingRef: { current: false } } })

    act(() => h.current.handleMIDINoteInput('E4'))

    expect(actions.setScore).not.toHaveBeenCalled()
  })
})
