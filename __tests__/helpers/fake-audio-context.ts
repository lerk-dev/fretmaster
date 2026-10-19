/**
 * 测试用的假 AudioContext（反馈音 / 吉他采样播放共用）。
 *
 * 为什么不是"随便一个 mock"：
 *  `__tests__/setup.ts` 里的全局 mock 只有 `createGain()` 且**没有**
 *  `setValueAtTime / linearRampToValueAtTime / exponentialRampToValueAtTime`，
 *  于是 `playFeedbackSound` 会在包络阶段抛异常、被自身 try/catch 吞掉 ——
 *  测试会"绿着"但什么都没验证。这里给全：
 *   · `oscillators` / `gains` / `bufferSources` / `filters` 分别记账，便于断言「走了哪条路径」；
 *   · `decodeAudioData` 返回带 `duration` 的假 buffer，采样播放逻辑才能算衰减时间；
 *   · `resume()` 是 spy（Tauri/WebView2 下需要显式唤醒，见 use-feedback-sound 注释）。
 *
 * 🚨 两个 hook 测试各写一份假 Context 会漂移（这个仓已经踩过多次），所以抽到这里。
 */

import { vi } from 'vitest'

export interface FakeOscillator {
  type: string
  frequency: { value: number }
  connect: () => void
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

export interface FakeGainNode {
  gain: {
    value: number
    setValueAtTime: ReturnType<typeof vi.fn>
    linearRampToValueAtTime: ReturnType<typeof vi.fn>
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
  }
  connect: () => void
}

export interface FakeBufferSource {
  buffer: { duration: number } | null
  playbackRate: { value: number }
  connect: () => void
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

export interface FakeBiquadFilter {
  type: string
  frequency: { value: number; setValueAtTime: ReturnType<typeof vi.fn> }
  Q: { value: number; setValueAtTime: ReturnType<typeof vi.fn> }
  connect: () => void
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  static reset() {
    FakeAudioContext.instances = []
  }

  state: string = 'running'
  currentTime = 0
  destination = {}
  oscillators: FakeOscillator[] = []
  gains: FakeGainNode[] = []
  bufferSources: FakeBufferSource[] = []
  filters: FakeBiquadFilter[] = []
  resume = vi.fn(() => Promise.resolve())
  /** 每个采样解码后返回 0.7s 的假 buffer（与真实产物一致） */
  decodeAudioData = vi.fn(async (_bytes: ArrayBuffer) => ({ duration: 0.7 }))

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

  createGain(): FakeGainNode {
    const gain: FakeGainNode = {
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: () => {},
    }
    this.gains.push(gain)
    return gain
  }

  createBufferSource(): FakeBufferSource {
    const source: FakeBufferSource = {
      buffer: null,
      playbackRate: { value: 1 },
      connect: () => {},
      start: vi.fn(),
      stop: vi.fn(),
    }
    this.bufferSources.push(source)
    return source
  }

  createBiquadFilter(): FakeBiquadFilter {
    const filter: FakeBiquadFilter = {
      type: '',
      frequency: { value: 0, setValueAtTime: vi.fn() },
      Q: { value: 0, setValueAtTime: vi.fn() },
      connect: () => {},
    }
    this.filters.push(filter)
    return filter
  }
}

const realAudioContext = (globalThis as Record<string, unknown>).AudioContext
const realWebkitAudioContext = (globalThis as Record<string, unknown>).webkitAudioContext

export function installFakeAudioContext(): void {
  ;(globalThis as Record<string, unknown>).AudioContext = FakeAudioContext
  ;(globalThis as Record<string, unknown>).webkitAudioContext = undefined
  if (typeof window !== 'undefined') {
    ;(window as unknown as Record<string, unknown>).AudioContext = FakeAudioContext
    ;(window as unknown as Record<string, unknown>).webkitAudioContext = undefined
  }
}

export function restoreFakeAudioContext(): void {
  ;(globalThis as Record<string, unknown>).AudioContext = realAudioContext
  ;(globalThis as Record<string, unknown>).webkitAudioContext = realWebkitAudioContext
  if (typeof window !== 'undefined') {
    ;(window as unknown as Record<string, unknown>).AudioContext = realAudioContext
    ;(window as unknown as Record<string, unknown>).webkitAudioContext = realWebkitAudioContext
  }
}
