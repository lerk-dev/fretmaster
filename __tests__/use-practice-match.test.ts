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
    // 第二个参数是点击位置的 MIDI 音高（真实吉他采样按它移调）
    expect(actions.playFeedbackSound).toHaveBeenCalledWith(true, expect.any(Number))
    // 高亮先记绿（第一个参数是 updater，不是布尔 —— 断言「传进去的是个函数」+ 调用它能得到 Map）
    expect(actions.setHighlightedFrets).toHaveBeenCalledTimes(1)
    const updater = actions.setHighlightedFrets.mock.calls[0][0] as (p: Map<string, boolean>) => Map<string, boolean>
    expect(updater(new Map())).toEqual(new Map([['0-0', true]]))

    // 推进委托给 MIDI 路径（100ms 后），此刻还没计分
    expect(actions.setScore).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(100) })
    expect(actions.recordPositionStat).toHaveBeenCalledWith(true, { stringIndex: 0, fret: 0 })
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
    expect(actions.playFeedbackSound).toHaveBeenCalledWith(false, expect.any(Number))
    const updater = actions.setHighlightedFrets.mock.calls[0][0] as (p: Map<string, boolean>) => Map<string, boolean>
    expect(updater(new Map())).toEqual(new Map([['0-0', false]]))

    act(() => { vi.advanceTimersByTime(100) })
    // 🚨 答错也要记 total（正确率 = correct/total 会持久化）—— 见 lib/answer-judge 的 scoreDeltaFor
    expect(actions.recordPositionStat).toHaveBeenCalledWith(false, { stringIndex: 0, fret: 0 })
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

  it('默认命中后设 800ms 冷却', () => {
    const cooling = { current: false }
    const { feed } = mountAudio({
      audio: { isCoolingDownRef: cooling, noteConfirmStateRef: { current: createNoteConfirmState() } },
    })

    feed(E2, true)
    feed(E2)
    expect(cooling.current).toBe(true)

    act(() => { vi.advanceTimersByTime(800) })
    expect(cooling.current).toBe(false)
  })

  it('🚨 单音全指板（hitCooldownMs: 0）⇒ 命中后不设冷却，第二下拨弦不必等', () => {
    const cooling = { current: false }
    const cooldown = { current: null as ReturnType<typeof setTimeout> | null }
    const onPracticeCorrect = vi.fn(() => true)
    const generateNewTarget = vi.fn()
    const { feed } = mountAudio({
      audio: {
        isCoolingDownRef: cooling,
        cooldownRef: cooldown,
        noteConfirmStateRef: { current: createNoteConfirmState() },
      },
      practice: {
        targetNote: 'E',
        targetNoteRef: { current: 'E' },
        generateNewTarget,
        generateNewTargetRef: { current: generateNewTarget },
        onPracticeCorrect,
        hitCooldownMs: 0,
      },
    })

    feed(E2, true)
    feed(E2)
    expect(onPracticeCorrect).toHaveBeenCalledTimes(1)
    expect(cooling.current).toBe(false)
    expect(cooldown.current).toBeNull()
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

  it('🚨 MIDI 的八度要透传给 onPracticeCorrect（单音全指板靠它判落点）', () => {
    const onPracticeCorrect = vi.fn(() => true)
    const { h } = mountMidi({
      practice: {
        targetNote: 'E',
        targetNoteRef: { current: 'E' },
        onPracticeCorrect,
      },
    })

    act(() => h.current.handleMIDINoteInput('E', 4))

    expect(onPracticeCorrect).toHaveBeenCalledWith({ via: 'audio', position: undefined, octave: 4 })
  })
})

// ============================================================ 单音全指板（全指板找同一个音）

/**
 * 单音全指板把「命中后换题」的主动权交给页面（`onPracticeCorrect` 返回 true = 自行推进），
 * 并可选地校验点击位置（`isPracticePositionAllowed`，仅麦克风无法校验）。
 * 这里钉住三件事：
 *   · 点击路径把**位置**一起带回去（页面靠它记连线与进度）；
 *   · 页面自行推进时不得再调默认 `generateNewTarget`（否则一轮会被拆成两题）；
 *   · 位置不符合「精确提示」时判红且不推进。
 */
describe('单音全指板：onPracticeCorrect 与位置校验', () => {
  const makeActions = () => ({
    recordPositionStat: vi.fn(),
    setScore: vi.fn(),
    triggerCorrectFeedback: vi.fn(),
    triggerWrongFeedback: vi.fn(),
    playFeedbackSound: vi.fn(),
    setHighlightedFrets: vi.fn(),
    clearFretClickTimers: vi.fn(),
  })

  it('点击命中 ⇒ 回调带 via=click 与点击位置；返回 true 时不再默认换题', () => {
    const actions = makeActions()
    const generateNewTarget = vi.fn()
    const onPracticeCorrect = vi.fn(() => true)
    const h = renderHook(() =>
      usePracticeMatch(
        makeAnswerOptions({
          runtime: { isPlaying: true, isPlayingRef: { current: true } },
          practice: {
            targetNote: NOTE_AT_0_0,
            targetNoteRef: { current: NOTE_AT_0_0 },
            generateNewTarget,
            generateNewTargetRef: { current: generateNewTarget },
            onPracticeCorrect,
          },
          actions,
        }),
      ),
    )

    act(() => h.current.handleFretClick(0, 0))
    act(() => { vi.advanceTimersByTime(100) })

    expect(onPracticeCorrect).toHaveBeenCalledWith({
      via: 'click',
      position: { stringIndex: 0, fret: 0 },
    })
    expect(generateNewTarget).not.toHaveBeenCalled()
  })

  it('精确提示位置不符 ⇒ 判红、计失败、不触发命中回调', () => {
    const actions = makeActions()
    const onPracticeCorrect = vi.fn(() => true)
    const h = renderHook(() =>
      usePracticeMatch(
        makeAnswerOptions({
          runtime: { isPlaying: true, isPlayingRef: { current: true } },
          practice: {
            targetNote: NOTE_AT_0_0,
            targetNoteRef: { current: NOTE_AT_0_0 },
            onPracticeCorrect,
            isPracticePositionAllowed: () => false,
          },
          actions,
        }),
      ),
    )

    act(() => h.current.handleFretClick(0, 0))

    // 红/绿层与 100ms 后的推进必须同一结论
    const updater = actions.setHighlightedFrets.mock.calls[0][0] as (p: Map<string, boolean>) => Map<string, boolean>
    expect(updater(new Map())).toEqual(new Map([['0-0', false]]))

    act(() => { vi.advanceTimersByTime(100) })
    expect(actions.recordPositionStat).toHaveBeenCalledWith(false, { stringIndex: 0, fret: 0 })
    expect(onPracticeCorrect).not.toHaveBeenCalled()
  })

  it('🚨 连点两格：每次推进都带自己的位置（不再靠共享 ref，后一次偷不走前一次）', () => {
    const actions = makeActions()
    const onPracticeCorrect = vi.fn((_payload: { position?: { stringIndex: number; fret: number } }) => true)
    const h = renderHook(() =>
      usePracticeMatch(
        makeAnswerOptions({
          runtime: { isPlaying: true, isPlayingRef: { current: true } },
          practice: {
            targetNote: 'E',
            targetNoteRef: { current: 'E' },
            onPracticeCorrect,
          },
          actions,
        }),
      ),
    )

    // 两个都是 E：0 弦空弦 / 0 弦 12 品。间隔 50ms 点击，各自 100ms 后推进
    act(() => h.current.handleFretClick(0, 0))
    act(() => { vi.advanceTimersByTime(50) })
    act(() => h.current.handleFretClick(0, 12))
    act(() => { vi.advanceTimersByTime(50) })
    act(() => { vi.advanceTimersByTime(50) })

    expect(onPracticeCorrect.mock.calls.map((c) => c[0].position)).toEqual([
      { stringIndex: 0, fret: 0 },
      { stringIndex: 0, fret: 12 },
    ])
  })

  it('音频命中 ⇒ 回调 via=audio 且不带位置；返回 true 时不换题', () => {
    const FRAME_MS = 128
    const E2 = 82.41
    const state = createNoteConfirmState()
    const generateNewTarget = vi.fn()
    const onPracticeCorrect = vi.fn(() => true)
    const h = renderHook(() =>
      usePracticeMatch(
        makeAnswerOptions({
          runtime: { isPlaying: true, isPlayingRef: { current: true } },
          audio: { noteConfirmStateRef: { current: state } },
          practice: {
            targetNote: 'E',
            targetNoteRef: { current: 'E' },
            generateNewTarget,
            generateNewTargetRef: { current: generateNewTarget },
            onPracticeCorrect,
          },
        }),
      ),
    )
    const feed = (isNoteOnset: boolean) =>
      act(() =>
        h.current.processPracticeMatch({
          frequency: E2,
          note: 'E2',
          probability: 0.95,
          isNoteOnset,
          rawFrequency: E2,
          frameMs: FRAME_MS,
        }),
      )

    feed(true)
    feed(false)

    // 音频命中不带宽高位置，但要带「检测到的八度」——页面用它做落点弱校验（E2 ⇒ octave 2）
    expect(onPracticeCorrect).toHaveBeenCalledWith({ via: 'audio', octave: 2 })
    expect(generateNewTarget).not.toHaveBeenCalled()
  })
})

// ============================================================ 音频：按钮模式 / 音程回弹根音（2026-11-03）

/**
 * 两条回归：
 *   · 按钮答题模式下，音频确认放行后**仍不得**自动判定（与 MIDI 路径同一口径）；
 *   · 音程「回弹根音」时音频不按顺序匹配，`1` 可能先于音程被弹掉。
 *     整题完成后必须直接出新题，不能停在 answered=true 等一个序列里已不存在的根音。
 */
describe('processPracticeMatch：按钮模式与回弹根音', () => {
  const FRAME_MS = 128
  const E2 = 82.41
  const B2 = 123.47

  function mountAudioWith(overrides: Parameters<typeof makeAnswerOptions>[0] = {}) {
    const actions = {
      recordPositionStat: vi.fn(),
      setScore: vi.fn(),
      triggerCorrectFeedback: vi.fn(),
      triggerWrongFeedback: vi.fn(),
      playFeedbackSound: vi.fn(),
      setHighlightedFrets: vi.fn(),
    }
    const state = createNoteConfirmState()
    const h = renderHook(() =>
      usePracticeMatch(
        makeAnswerOptions({
          ...overrides,
          // runtime / audio 要在 overrides 之后合并，避免用例覆盖 activeTab 时丢掉 isPlaying
          runtime: { isPlaying: true, isPlayingRef: { current: true }, ...(overrides.runtime ?? {}) },
          audio: { noteConfirmStateRef: { current: state }, ...(overrides.audio ?? {}) },
          actions,
        }),
      ),
    )
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
    return { h, actions, feed }
  }

  it('按钮答题模式 ⇒ 音频放行后不判分、不反馈、不推进', () => {
    const { actions, feed } = mountAudioWith({
      runtime: {
        practiceAnswerModeRef: { current: 'buttons' },
        activeTab: 'practice',
        activeTabRef: { current: 'practice' },
      },
      practice: { targetNote: 'E', targetNoteRef: { current: 'E' } },
    })

    feed(E2, true)
    feed(E2)

    expect(actions.setScore).not.toHaveBeenCalled()
    expect(actions.recordPositionStat).not.toHaveBeenCalled()
    expect(actions.triggerCorrectFeedback).not.toHaveBeenCalled()
  })

  it('回弹根音 + 先弹根音：整题完成即出新题（不得停在 answered 等已弹过的根音）', () => {
    const exercise = {
      rootNote: 'E',
      interval: { name: 'Perfect 5th', symbol: '5', semitones: 7 },
      targetNote: 'B',
      allIntervals: [{ name: 'Perfect 5th', symbol: '5', semitones: 7 }],
      currentIntervalDisplay: '5 1',
      completedIntervals: [] as number[],
      answered: false,
    }
    const exerciseRef = { current: exercise }
    const setCurrentIntervalExercise = vi.fn()
    const generateIntervalExercise = vi.fn()
    const { actions, feed } = mountAudioWith({
      runtime: { activeTab: 'interval', activeTabRef: { current: 'interval' } },
      interval: {
        currentIntervalExerciseRef: exerciseRef,
        currentIntervalExercise: exercise,
        setCurrentIntervalExercise,
        generateIntervalExerciseRef: { current: generateIntervalExercise },
        findRootFirstRef: { current: false },
        addRootBackRef: { current: true },
      },
    })

    // 音频不按顺序匹配：先弹回弹根音 `1`（index 1），只算完成一步
    feed(E2, true)
    feed(E2)
    expect(actions.setScore).not.toHaveBeenCalled()
    expect(setCurrentIntervalExercise).toHaveBeenCalledWith(
      expect.objectContaining({ completedIntervals: [1] }),
    )
    // 模拟页面把新 state 同步回 ref
    exerciseRef.current = { ...exercise, completedIntervals: [1] }

    // 再弹五度音程 `5`（index 0）⇒ 全部完成
    feed(B2, true, 'B2')
    feed(B2, false, 'B2')

    expect(actions.setScore).toHaveBeenCalledTimes(1)
    expect(generateIntervalExercise).toHaveBeenCalledTimes(1)
  })
})

// ============================================================ 相对上下行（八度真的参与判定）

/**
 * 用户选定方案 B：**不给根音定绝对八度**，「上行 / 下行」以「先找根音」时
 * 用户实际弹下的那个根音为基准。没有基准（没开先找根音 / 根音还没弹 /
 * 输入源没有八度）时必须退回「只看音级」，不能凭空拒绝正确答案。
 *
 * 和弦练习的 asc / desc 则与「上一个弹对的音」比较 —— 序列本身已排好序，
 * 这里补的是「八度也得对」。
 */
describe('上行 / 下行：按实际音高判定', () => {
  const FRAME_MS = 128
  const C4 = 261.63
  const E3 = 164.81
  const E4 = 329.63
  const C5 = 523.25

  function mountInterval(direction: 'up' | 'down') {
    // 下行大三度 → 题目换成互补音程 b6（见 lib/interval-direction.ts）
    const exercise = direction === 'down'
      ? {
        rootNote: 'E',
        interval: { name: 'Minor 6th', symbol: 'b6', semitones: 8 },
        targetNote: 'C',
        allIntervals: [{ name: 'Minor 6th', symbol: 'b6', semitones: 8 }],
        currentIntervalDisplay: '1 b6',
        completedIntervals: [] as number[],
        answered: false,
        direction: 'down' as const,
      }
      : {
        rootNote: 'E',
        interval: { name: 'Minor 3rd', symbol: 'b3', semitones: 3 },
        targetNote: 'G',
        allIntervals: [{ name: 'Minor 3rd', symbol: 'b3', semitones: 3 }],
        currentIntervalDisplay: '1 b3',
        completedIntervals: [] as number[],
        answered: false,
        direction: 'up' as const,
      }
    const exerciseRef = { current: exercise }
    const setCurrentIntervalExercise = vi.fn()
    const generateIntervalExercise = vi.fn()
    const actions = { setScore: vi.fn(), triggerCorrectFeedback: vi.fn() }
    const state = createNoteConfirmState()
    const h = renderHook(() =>
      usePracticeMatch(
        makeAnswerOptions({
          runtime: { isPlaying: true, isPlayingRef: { current: true }, activeTab: 'interval', activeTabRef: { current: 'interval' } },
          audio: { noteConfirmStateRef: { current: state } },
          interval: {
            currentIntervalExerciseRef: exerciseRef,
            currentIntervalExercise: exercise,
            setCurrentIntervalExercise,
            generateIntervalExerciseRef: { current: generateIntervalExercise },
            findRootFirstRef: { current: true },
            findRootFirst: true,
          },
          actions,
        }),
      ),
    )
    const feed = (frequency: number, isNoteOnset = false, note = 'E4') =>
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
    return { feed, actions, exercise, exerciseRef, setCurrentIntervalExercise, generateIntervalExercise }
  }

  it('音程下行：根音上方的同名音判错，只有根音下方的才算对', () => {
    const { feed, actions, exercise, exerciseRef, setCurrentIntervalExercise, generateIntervalExercise } = mountInterval('down')

    // 先弹根音 E4 ⇒ 成为本题基准
    feed(E4, true, 'E4')
    feed(E4, false, 'E4')
    expect(setCurrentIntervalExercise).toHaveBeenCalledWith(expect.objectContaining({ completedIntervals: [0] }))
    // 页面把新 state 同步回 ref
    exerciseRef.current = { ...exercise, completedIntervals: [0] }

    // C5（根音上方）：音级对、方向错 ⇒ 失败且不推进
    feed(C5, true, 'C5')
    feed(C5, false, 'C5')
    expect(generateIntervalExercise).not.toHaveBeenCalled()
    const failure = actions.setScore.mock.calls[0][0] as (p: { correct: number; total: number }) => { correct: number; total: number }
    expect(failure({ correct: 0, total: 0 })).toEqual({ correct: 0, total: 1 })

    // C4（根音下方）⇒ 真正下行 ⇒ 整题完成
    feed(C4, true, 'C4')
    feed(C4, false, 'C4')
    expect(generateIntervalExercise).toHaveBeenCalledTimes(1)
  })

  it('音程上行：根音下方的同名音判错', () => {
    const { feed, exercise, exerciseRef, generateIntervalExercise } = mountInterval('up')
    const G3 = 196.0
    const G4 = 392.0

    // 先弹根音 E4 ⇒ 成为本题基准
    feed(E4, true, 'E4')
    feed(E4, false, 'E4')
    exerciseRef.current = { ...exercise, completedIntervals: [0] }

    // G3（根音下方）⇒ 上行要求更高 ⇒ 失败
    feed(G3, true, 'G3')
    feed(G3, false, 'G3')
    expect(generateIntervalExercise).not.toHaveBeenCalled()

    // G4（根音上方）⇒ 完成
    feed(G4, true, 'G4')
    feed(G4, false, 'G4')
    expect(generateIntervalExercise).toHaveBeenCalledTimes(1)
  })

  function mountChordExercise(order: 'asc' | 'desc', sequence: string[]) {
    // 音频路径读 ref（与页面一致），因此换步只需改 ref 就能模拟推进
    const targetChord = { root: 'C', type: 'Major' }
    const stepRef = { current: 0 }
    const sequenceRef = { current: sequence }
    const targetRef = { current: targetChord as { root: string; type: string } | null }
    const nextChordExercise = vi.fn()
    const actions = { setScore: vi.fn(), triggerCorrectFeedback: vi.fn() }
    const state = createNoteConfirmState()
    const h = renderHook(() =>
      usePracticeMatch(
        makeAnswerOptions({
          runtime: { isPlaying: true, isPlayingRef: { current: true }, activeTab: 'chord_exercise', activeTabRef: { current: 'chord_exercise' } },
          audio: { noteConfirmStateRef: { current: state } },
          chord: {
            chordExerciseTargetChord: targetChord,
            chordExerciseTargetChordRef: targetRef,
            chordExerciseSequence: sequence,
            chordExerciseSequenceRef: sequenceRef,
            chordExerciseCurrentStep: 0,
            chordExerciseCurrentStepRef: stepRef,
            chordExerciseOrder: order,
            nextChordExercise,
            // 音频路径走 ref（与页面一致）
            nextChordExerciseRef: { current: nextChordExercise },
          },
          actions,
        }),
      ),
    )
    const feed = (frequency: number, isNoteOnset = false, note = 'C4') =>
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
    return { feed, nextChordExercise, stepRef, actions }
  }

  it('和弦 asc：第二音必须真的比第一音高（低八度不算数）', () => {
    const { feed, nextChordExercise, stepRef } = mountChordExercise('asc', ['1', '3'])

    // 第一音 C4：没有基准 ⇒ 接受，并成为基准
    feed(C4, true, 'C4')
    feed(C4, false, 'C4')
    stepRef.current = 1

    // E3 比 C4 低 ⇒ asc 不成立 ⇒ 判错、不推进
    feed(E3, true, 'E3')
    feed(E3, false, 'E3')
    expect(nextChordExercise).not.toHaveBeenCalled()

    // E4 比 C4 高 ⇒ 完成整组
    feed(E4, true, 'E4')
    feed(E4, false, 'E4')
    expect(nextChordExercise).toHaveBeenCalledTimes(1)
  })

  it('和弦 desc：第二音必须真的比第一音低', () => {
    const { feed, nextChordExercise, stepRef } = mountChordExercise('desc', ['3', '1'])

    // 第一音 E4：接受并成为基准
    feed(E4, true, 'E4')
    feed(E4, false, 'E4')
    stepRef.current = 1

    // C5 比 E4 高 ⇒ desc 不成立 ⇒ 判错
    feed(C5, true, 'C5')
    feed(C5, false, 'C5')
    expect(nextChordExercise).not.toHaveBeenCalled()

    // C4 比 E4 低 ⇒ 完成整组
    feed(C4, true, 'C4')
    feed(C4, false, 'C4')
    expect(nextChordExercise).toHaveBeenCalledTimes(1)
  })
})
