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
