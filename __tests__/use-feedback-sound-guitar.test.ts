/**
 * useFeedbackSound 的**吉他采样接线**测试（与 `use-feedback-sound.test.ts` 互补）。
 *
 * 那个文件用真实的 `lib/guitar-sound`（jsdom 里 fetch 必然失败 ⇒ 永远走合成音），
 * 钉住的是「兜底路径不许坏」；本文件把该模块换成替身，钉住的是**接线本身**：
 *
 *  ① 采样可用时**不许**再创建振荡器（否则等于没换）；
 *  ② 采样不可用时必须退回原来的 880Hz / 220Hz（绝不静音）；
 *  ③ 调用参数：`muted` 必须等于「答错」，`midi` 原样透传（采样按它移调）；
 *  ④ 加载函数用的是**同一个共享 AudioContext**（不是每次新建）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'

vi.mock('@/lib/guitar-sound', () => ({
  ensureGuitarSamples: vi.fn(() => Promise.resolve()),
  playGuitarPluck: vi.fn(() => true),
}))

import { useFeedbackSound } from '@/hooks/use-feedback-sound'
import { ensureGuitarSamples, playGuitarPluck } from '@/lib/guitar-sound'
import { useAppStore } from '@/lib/store'
import { FakeAudioContext, installFakeAudioContext, restoreFakeAudioContext } from './helpers/fake-audio-context'
import { renderHook, unmountAllHooks } from './helpers/render-hook'

const setSoundSettings = (s: { enabled: boolean; correctSound: boolean; wrongSound: boolean }) => {
  act(() => {
    useAppStore.setState({ feedbackSound: s })
  })
}

beforeEach(() => {
  installFakeAudioContext()
  FakeAudioContext.reset()
  setSoundSettings({ enabled: true, correctSound: true, wrongSound: true })
  vi.mocked(playGuitarPluck).mockClear().mockReturnValue(true)
  vi.mocked(ensureGuitarSamples).mockClear()
})

afterEach(() => {
  unmountAllHooks()
  restoreFakeAudioContext()
  vi.restoreAllMocks()
})

describe('反馈音走真实吉他采样', () => {
  it('采样可用：不创建振荡器（否则等于没换成吉他）', () => {
    const { current } = renderHook(() => useFeedbackSound())
    act(() => current.playFeedbackSound(true, 64))

    const ctx = FakeAudioContext.instances[0]
    expect(ctx.oscillators, '采样已就绪时不该再有合成音').toHaveLength(0)
    expect(playGuitarPluck).toHaveBeenCalledTimes(1)
  })

  it('采样不可用：退回 880Hz 正弦 / 220Hz 锯齿（绝不静音）', () => {
    vi.mocked(playGuitarPluck).mockReturnValue(false)
    const { current } = renderHook(() => useFeedbackSound())

    act(() => current.playFeedbackSound(true, 64))
    act(() => current.playFeedbackSound(false, 64))

    const ctx = FakeAudioContext.instances[0]
    expect(ctx.oscillators).toHaveLength(2)
    expect(ctx.oscillators[0].frequency.value).toBe(880)
    expect(ctx.oscillators[0].type).toBe('sine')
    expect(ctx.oscillators[1].frequency.value).toBe(220)
    expect(ctx.oscillators[1].type).toBe('sawtooth')
  })

  it('参数：答错 → muted=true，答对 → muted=false，midi 原样透传', () => {
    const { current } = renderHook(() => useFeedbackSound())

    act(() => current.playFeedbackSound(true, 67))
    expect(playGuitarPluck).toHaveBeenLastCalledWith(expect.anything(), { midi: 67, muted: false })

    act(() => current.playFeedbackSound(false, 40))
    expect(playGuitarPluck).toHaveBeenLastCalledWith(expect.anything(), { midi: 40, muted: true })
  })

  it('不传 midi 时仍调用（midi 为 undefined，播放器内部用默认音高兜底）', () => {
    const { current } = renderHook(() => useFeedbackSound())
    act(() => current.playFeedbackSound(true))
    expect(playGuitarPluck).toHaveBeenLastCalledWith(expect.anything(), { midi: undefined, muted: false })
  })

  it('加载与播放共用同一个 AudioContext（避免耗尽实例配额）', () => {
    const { current } = renderHook(() => useFeedbackSound())
    act(() => current.playFeedbackSound(true, 64))
    act(() => current.playFeedbackSound(true, 65))

    expect(FakeAudioContext.instances).toHaveLength(1)
    const ctx = FakeAudioContext.instances[0]
    expect(ensureGuitarSamples).toHaveBeenCalled()
    for (const call of vi.mocked(ensureGuitarSamples).mock.calls) expect(call[0]).toBe(ctx)
    for (const call of vi.mocked(playGuitarPluck).mock.calls) expect(call[0]).toBe(ctx)
  })

  it('总开关关闭时既不加载也不播放', () => {
    // 🚨 不能 `const { current } = ...`：那会把 current 快照成"改设置之前"的渲染结果，
    // 拿旧回调去调，测的是旧状态（本用例第一版就踩了这个坑）。
    const result = renderHook(() => useFeedbackSound())
    setSoundSettings({ enabled: false, correctSound: true, wrongSound: true })

    act(() => result.current.playFeedbackSound(true, 64))

    expect(playGuitarPluck).not.toHaveBeenCalled()
    expect(ensureGuitarSamples).not.toHaveBeenCalled()
    expect(FakeAudioContext.instances).toHaveLength(0)
  })
})

describe('首次交互预热（让第一声就是吉他，而不是合成音）', () => {
  const pointerDown = () => act(() => {
    window.dispatchEvent(new Event('pointerdown'))
  })

  it('第一次 pointerdown 就创建 ctx 并开始加载采样', () => {
    renderHook(() => useFeedbackSound())
    expect(FakeAudioContext.instances, '挂载本身不该创建 AudioContext').toHaveLength(0)

    pointerDown()

    expect(FakeAudioContext.instances).toHaveLength(1)
    expect(ensureGuitarSamples).toHaveBeenCalledTimes(1)
    expect(vi.mocked(ensureGuitarSamples).mock.calls[0][0]).toBe(FakeAudioContext.instances[0])
  })

  it('之后的 pointerdown 不再重复加载（一次性监听）', () => {
    renderHook(() => useFeedbackSound())
    pointerDown()
    pointerDown()
    pointerDown()
    expect(ensureGuitarSamples).toHaveBeenCalledTimes(1)
    expect(FakeAudioContext.instances).toHaveLength(1)
  })

  it('音效总开关关闭时连预热都不做', () => {
    setSoundSettings({ enabled: false, correctSound: true, wrongSound: true })
    renderHook(() => useFeedbackSound())
    pointerDown()
    expect(FakeAudioContext.instances).toHaveLength(0)
    expect(ensureGuitarSamples).not.toHaveBeenCalled()
  })
})
