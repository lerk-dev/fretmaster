/**
 * useFeedbackSound 的冒烟断言（从 app/page.tsx 搬出 hooks/ 后的回归网）。
 *
 * 这个 hook 是逐行搬出来的、逻辑未改，所以断言的不是"新功能"，而是
 * **搬运过程中最容易出错的几件事**：
 *
 *  1) 正/错误音的两组常量被对调（880Hz/sine vs 220Hz/sawtooth）；
 *  2) 两个自动隐藏延时被对调或写错（正确 500ms、错误 600ms —— 刻意不对称）；
 *  3) `feedbackAudioCtxRef` 的"复用"语义丢失，退化成每次播放都新建 AudioContext。
 *     这正是该 ref 存在的唯一理由（注释明确：Chromium 限制约 6 个实例，
 *     超限后新建会抛异常 → 反馈音静默失效），所以必须有一条断言把它钉住。
 *
 * 之所以要替换 AudioContext：__tests__/setup.ts 里的全局 mock 的
 * `createGain()` 没有 `setValueAtTime` / `exponentialRampToValueAtTime`，
 * 会让 playFeedbackSound 在振荡器阶段抛异常并被自身 try/catch 吞掉 ——
 * 那样测试会"绿着"却什么都没验证。这里换成完整的假实现，并断言
 * `oscillator.start/stop` 真的被调用（等于"整条路径跑到底没抛异常"）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { useFeedbackSound } from '@/hooks/use-feedback-sound'
import { useAppStore } from '@/lib/store'
import { renderHook, unmountAllHooks } from './helpers/render-hook'

// renderHook 小工具已收敛到 __tests__/helpers/render-hook.ts
// （两个 hook 测试各抄一份会漂移；那边也有"为什么不引 @testing-library/react"的说明）

interface FakeOscillator {
  type: string
  frequency: { value: number }
  connect: () => void
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

interface FakeGain {
  gain: {
    value: number
    setValueAtTime: ReturnType<typeof vi.fn>
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
  }
  connect: () => void
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  static reset() {
    FakeAudioContext.instances = []
  }

  state: string = 'running'
  currentTime = 0
  destination = {}
  oscillators: FakeOscillator[] = []
  gains: FakeGain[] = []
  resume = vi.fn(() => Promise.resolve())

  constructor() {
    FakeAudioContext.instances.push(this)
  }

  createOscillator(): FakeOscillator {
    const osc: FakeOscillator = {
      type: '',
      frequency: { value: 0 },
      connect: () => {},
      start: vi.fn(),
      stop: vi.fn(),
    }
    this.oscillators.push(osc)
    return osc
  }

  createGain(): FakeGain {
    const gain: FakeGain = {
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: () => {},
    }
    this.gains.push(gain)
    return gain
  }
}

const realAudioContext = (globalThis as Record<string, unknown>).AudioContext
const realWebkitAudioContext = (globalThis as Record<string, unknown>).webkitAudioContext

function installFakeAudioContext() {
  ;(globalThis as Record<string, unknown>).AudioContext = FakeAudioContext
  ;(globalThis as Record<string, unknown>).webkitAudioContext = undefined
  if (typeof window !== 'undefined') {
    ;(window as unknown as Record<string, unknown>).AudioContext = FakeAudioContext
    ;(window as unknown as Record<string, unknown>).webkitAudioContext = undefined
  }
}

function restoreAudioContext() {
  ;(globalThis as Record<string, unknown>).AudioContext = realAudioContext
  ;(globalThis as Record<string, unknown>).webkitAudioContext = realWebkitAudioContext
  if (typeof window !== 'undefined') {
    ;(window as unknown as Record<string, unknown>).AudioContext = realAudioContext
    ;(window as unknown as Record<string, unknown>).webkitAudioContext = realWebkitAudioContext
  }
}

const setSoundSettings = (s: {
  enabled: boolean
  correctSound: boolean
  wrongSound: boolean
}) => {
  act(() => {
    useAppStore.setState({ feedbackSound: s })
  })
}

describe('useFeedbackSound', () => {
  beforeEach(() => {
    installFakeAudioContext()
    FakeAudioContext.reset()
    vi.useFakeTimers()
    setSoundSettings({ enabled: true, correctSound: true, wrongSound: true })
  })

  afterEach(() => {
    unmountAllHooks()
    vi.useRealTimers()
    restoreAudioContext()
  })

  it('初始状态：提示均不显示、音符为空、尚未创建 AudioContext', () => {
    const result = renderHook(() => useFeedbackSound())

    expect(result.current.showCorrectFeedback).toBe(false)
    expect(result.current.correctFeedbackNote).toBeNull()
    expect(result.current.showWrongFeedback).toBe(false)
    expect(result.current.wrongFeedbackNote).toBeNull()
    expect(result.current.feedbackAudioCtxRef.current).toBeNull()
    expect(FakeAudioContext.instances.length).toBe(0)
  })

  it('正确反馈：立即显示并带音符，500ms 后自动清空（499ms 时仍在）', () => {
    const result = renderHook(() => useFeedbackSound())

    act(() => result.current.triggerCorrectFeedback('A'))
    expect(result.current.showCorrectFeedback).toBe(true)
    expect(result.current.correctFeedbackNote).toBe('A')

    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(result.current.showCorrectFeedback).toBe(true)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.showCorrectFeedback).toBe(false)
    expect(result.current.correctFeedbackNote).toBeNull()
  })

  it('错误反馈：立即显示并带音符，600ms 后自动清空（599ms 时仍在）', () => {
    const result = renderHook(() => useFeedbackSound())

    act(() => result.current.triggerWrongFeedback('B'))
    expect(result.current.showWrongFeedback).toBe(true)
    expect(result.current.wrongFeedbackNote).toBe('B')

    act(() => {
      vi.advanceTimersByTime(599)
    })
    expect(result.current.showWrongFeedback).toBe(true)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.showWrongFeedback).toBe(false)
    expect(result.current.wrongFeedbackNote).toBeNull()
  })

  it('两种反馈互不干扰：正确提示不会点亮错误提示', () => {
    const result = renderHook(() => useFeedbackSound())

    act(() => result.current.triggerCorrectFeedback('C'))
    expect(result.current.showWrongFeedback).toBe(false)
    expect(result.current.wrongFeedbackNote).toBeNull()

    act(() => {
      vi.advanceTimersByTime(500)
    })
    act(() => result.current.triggerWrongFeedback('D'))
    expect(result.current.showCorrectFeedback).toBe(false)
    expect(result.current.correctFeedbackNote).toBeNull()
    expect(result.current.showWrongFeedback).toBe(true)
  })

  it('音效总开关关闭时不创建 AudioContext', () => {
    const result = renderHook(() => useFeedbackSound())
    setSoundSettings({ enabled: false, correctSound: true, wrongSound: true })

    act(() => result.current.playFeedbackSound(true))
    act(() => result.current.playFeedbackSound(false))

    expect(FakeAudioContext.instances.length).toBe(0)
  })

  it('单项开关分别门控正确音与错误音（关正确音不影响错误音）', () => {
    const result = renderHook(() => useFeedbackSound())
    // 不能用 FakeAudioContext.reset() 来"计数清零"——ref 里还持有已创建的实例，
    // 后续调用会走复用分支（这正是期望行为），实例数不会随 reset 归零。
    // 所以用增量判断「这次调用有没有新建」。
    const ctxCount = () => FakeAudioContext.instances.length

    setSoundSettings({ enabled: true, correctSound: false, wrongSound: true })
    act(() => result.current.playFeedbackSound(true))
    expect(ctxCount()).toBe(0) // 正确音被单项开关挡下，连 AudioContext 都不建

    act(() => result.current.playFeedbackSound(false))
    expect(ctxCount()).toBe(1) // 错误音放行 → 首次创建

    setSoundSettings({ enabled: true, correctSound: true, wrongSound: false })
    act(() => result.current.playFeedbackSound(false))
    expect(ctxCount()).toBe(1) // 错误音被挡下，且不新建
    expect(
      (result.current.feedbackAudioCtxRef.current as unknown as FakeAudioContext)?.oscillators
    ).toBe(FakeAudioContext.instances[0].oscillators)

    act(() => result.current.playFeedbackSound(true))
    expect(ctxCount()).toBe(1) // 正确音放行，但复用已有实例
    expect(FakeAudioContext.instances[0].oscillators.length).toBe(2)
  })

  it('正确音 = 880Hz 正弦、错误音 = 220Hz 锯齿，且完整走到 start/stop', () => {
    const result = renderHook(() => useFeedbackSound())

    act(() => result.current.playFeedbackSound(true))
    act(() => result.current.playFeedbackSound(false))

    expect(FakeAudioContext.instances.length).toBe(1)
    const ctx = FakeAudioContext.instances[0]
    expect(ctx.oscillators.length).toBe(2)

    const [correctOsc, wrongOsc] = ctx.oscillators
    expect(correctOsc.frequency.value).toBe(880)
    expect(correctOsc.type).toBe('sine')
    expect(wrongOsc.frequency.value).toBe(220)
    expect(wrongOsc.type).toBe('sawtooth')

    // start/stop 被调用 ⇒ 整条路径没在 setValueAtTime/Ramp 处抛异常被 try/catch 吞掉
    for (const osc of ctx.oscillators) {
      expect(osc.start).toHaveBeenCalledTimes(1)
      expect(osc.stop).toHaveBeenCalledTimes(1)
    }
    expect(ctx.gains.every((g) => g.gain.setValueAtTime.mock.calls.length === 1)).toBe(true)
    expect(
      ctx.gains.every((g) => g.gain.exponentialRampToValueAtTime.mock.calls.length === 1)
    ).toBe(true)
  })

  it('连续播放复用同一个 AudioContext（避免耗尽实例配额导致反馈音静默失效）', () => {
    const result = renderHook(() => useFeedbackSound())

    for (let i = 0; i < 10; i++) {
      act(() => result.current.playFeedbackSound(i % 2 === 0))
    }

    expect(FakeAudioContext.instances.length).toBe(1)
    expect(result.current.feedbackAudioCtxRef.current).toBe(FakeAudioContext.instances[0])
  })

  it('AudioContext 已 closed 时重建；suspended 时显式 resume', () => {
    const result = renderHook(() => useFeedbackSound())

    act(() => result.current.playFeedbackSound(true))
    const first = FakeAudioContext.instances[0]
    expect(FakeAudioContext.instances.length).toBe(1)

    act(() => {
      first.state = 'closed'
    })
    act(() => result.current.playFeedbackSound(true))
    expect(FakeAudioContext.instances.length).toBe(2)
    expect(result.current.feedbackAudioCtxRef.current).toBe(FakeAudioContext.instances[1])

    const second = FakeAudioContext.instances[1]
    act(() => {
      second.state = 'suspended'
    })
    act(() => result.current.playFeedbackSound(true))
    expect(second.resume).toHaveBeenCalled()
    expect(FakeAudioContext.instances.length).toBe(2)
  })
})
