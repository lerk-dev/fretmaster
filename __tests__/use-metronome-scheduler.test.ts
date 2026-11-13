/**
 * useMetronomeScheduler —— 节拍器单一调度器的契约测试（#14 的核心）。
 *
 * 修前是两套互不相干的 `setInterval`（page.tsx 里发声、可视化组件里画圆点），
 * 误差逐拍累积、且切开关会重建定时器导致相位跳变。现在只有一个调度器：
 *  · `setInterval(25ms)` 只负责**轮询排程**，抖动不影响音准；
 *  · 真正的拍点用 `oscillator.start(音频时刻)` 交给音频线程（采样级精度）；
 *  · 可视/闪光按「拍点 − 当前音频时刻」换算成 `setTimeout`，锚定在音频时钟上
 *    ⇒ 误差有界、不累积。
 *
 * 测试用接管的假 AudioContext（唯一能观测「排在第几秒、什么音色」的窗口）+
 * 同步推进的假时钟/假定时器。断言的都是**可观测后果**：
 * 咔哒排在哪一刻、重音在第几拍、拍事件广播的先后与小节位置。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useMetronomeScheduler, type MetronomeSchedulerOptions } from '@/hooks/use-metronome-scheduler'
import { getMetronomeBeat, resetMetronomeClock, subscribeMetronomeBeat } from '@/lib/metronome-clock'

/** 假 AudioContext：记录每一次「咔哒」被排在音频时钟的哪一刻、什么音色 */
const audio = vi.hoisted(() => {
  interface Click { freq: number; gain: number; start: number; stop: number }
  /** 伴奏音符（鼓/贝斯）：带 setValueAtTime 频率的振荡器 —— 咔哒只用 frequency.value。 */
  interface Tone { type: string; freqs: number[]; gain: number; start: number; stop: number }
  interface Noise { start: number; stop: number }
  const state = {
    currentTime: 0,
    /** 'running' | 'suspended' | 'closed' */
    ctxState: 'running' as string,
    /** resume() 是否真的让上下文进入 running（真实环境里是异步且可能不生效） */
    autoResume: true,
    clicks: [] as Click[],
    tones: [] as Tone[],
    noises: [] as Noise[],
    resumeCalls: 0,
    closeCalls: 0,
    createCalls: 0,
  }
  let draftGain = 0
  class FakeAudioContext {
    destination = {}
    sampleRate = 48000
    get state() { return state.ctxState }
    get currentTime() { return state.currentTime }
    constructor() {
      state.createCalls += 1
      // 新建的上下文有自己的 state：上一个被 close 掉（'closed'）不应该污染新实例。
      // 这让「停止 → 重新开始」能创建出一个可用的上下文（真实环境同样如此）。
      if (state.ctxState === 'closed') state.ctxState = state.autoResume ? 'running' : 'suspended'
    }
    resume() {
      state.resumeCalls += 1
      // 真实的 resume 是异步的，且**可能不生效**（autoplay policy）⇒ 用开关模拟两种情形
      if (state.autoResume) state.ctxState = 'running'
      return Promise.resolve()
    }
    close() {
      state.closeCalls += 1
      state.ctxState = 'closed'
      return Promise.resolve()
    }
    createOscillator() {
      const freqs: number[] = []
      const osc = {
        frequency: {
          value: 0,
          setValueAtTime(v: number) { freqs.push(v) },
          exponentialRampToValueAtTime(v: number) { freqs.push(v) },
        },
        type: '',
        connect() {},
        start(when: number) {
          // 咔哒用 frequency.value 直接赋值；伴奏用 setValueAtTime ⇒ 以此区分两类节点
          if (freqs.length === 0) {
            state.clicks.push({ freq: osc.frequency.value, gain: draftGain, start: when, stop: 0 })
          } else {
            state.tones.push({ type: osc.type, freqs: [...freqs], gain: draftGain, start: when, stop: 0 })
          }
        },
        stop(when: number) {
          const list = freqs.length > 0 ? state.tones : state.clicks
          const last = list[list.length - 1]
          if (last) last.stop = when
        },
      }
      return osc
    }
    createGain() {
      const gain = {
        gain: {
          setValueAtTime(v: number) { draftGain = v },
          linearRampToValueAtTime(v: number) { draftGain = Math.max(draftGain, v) },
          exponentialRampToValueAtTime() {},
        },
        connect() {},
      }
      return gain
    }
    // ---- 伴奏（#5）需要的节点 ----
    createBuffer(_channels: number, length: number) {
      return { getChannelData: () => new Float32Array(length) }
    }
    createBufferSource() {
      return {
        buffer: null as unknown,
        connect() {},
        start(when: number) { state.noises.push({ start: when, stop: 0 }) },
        stop(when: number) {
          const last = state.noises[state.noises.length - 1]
          if (last) last.stop = when
        },
      }
    }
    createBiquadFilter() {
      return {
        type: '',
        frequency: { value: 0, setValueAtTime() {} },
        Q: { value: 0, setValueAtTime() {} },
        connect() {},
      }
    }
  }
  return { state, FakeAudioContext }
})

vi.mock('@/lib/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils')>()
  return { ...actual, getAudioContextClass: () => audio.FakeAudioContext }
})

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null
let published: { seq: number; index: number; countIn: boolean }[] = []
let unsubscribe: (() => void) | null = null

const BASE: MetronomeSchedulerOptions = {
  enabled: true,
  isPlaying: true,
  bpm: 60,
  beatsPerMeasure: 4,
  sound: true,
  flash: false,
  visualize: false,
  volume: 100,
  countIn: false,
}

function Harness(props: MetronomeSchedulerOptions) {
  useMetronomeScheduler(props)
  return null
}

function mount(props: Partial<MetronomeSchedulerOptions> = {}) {
  const merged = { ...BASE, ...props }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(createElement(Harness as never, merged as never))
  })
  const rerender = (next: Partial<MetronomeSchedulerOptions>) => {
    act(() => {
      root!.render(createElement(Harness as never, { ...merged, ...next } as never))
    })
  }
  /**
   * 推进 n 毫秒：音频时钟与假定时器**同步**前进。
   * 音频时钟不能只靠 `vi.advanceTimersByTime` 推进 —— 它由假 AudioContext 提供，
   * 必须显式 +Δ，否则排程循环会认为「还没到下一拍的窗口」而什么都不做。
   */
  const runMs = (totalMs: number) => {
    const chunk = 25
    for (let elapsed = 0; elapsed < totalMs; elapsed += chunk) {
      audio.state.currentTime += chunk / 1000
      act(() => {
        vi.advanceTimersByTime(chunk)
      })
    }
  }
  const unmount = () => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
  }
  return { rerender, runMs, unmount }
}

beforeEach(() => {
  vi.useFakeTimers()
  audio.state.currentTime = 0
  audio.state.ctxState = 'running'
  audio.state.autoResume = true
  audio.state.clicks = []
  audio.state.tones = []
  audio.state.noises = []
  audio.state.resumeCalls = 0
  audio.state.closeCalls = 0
  audio.state.createCalls = 0
  published = []
  act(() => resetMetronomeClock())
  unsubscribe = subscribeMetronomeBeat((beat) => {
    published.push({ seq: beat.seq, index: beat.index, countIn: beat.countIn })
  })
})
afterEach(() => {
  if (unsubscribe) unsubscribe()
  unsubscribe = null
  vi.useRealTimers()
  act(() => resetMetronomeClock())
  document.body.innerHTML = ''
})

describe('useMetronomeScheduler', () => {
  describe('排程：音频时钟上的 lookahead', () => {
    it('首拍立即排进音频时钟（有提前量，不是「当前时刻」），其后按 BPM 等间隔', () => {
      const p = mount({ bpm: 60 })
      p.runMs(1100)
      expect(audio.state.clicks).toHaveLength(2)
      const [first, second] = audio.state.clicks
      // 有提前量：排的时刻严格晚于「排程那一刻」的 currentTime(0)
      expect(first.start, '首拍必须有提前量').toBeGreaterThan(0)
      expect(second.start - first.start, '两拍间隔 = 60/bpm').toBeCloseTo(1, 5)
      p.unmount()
    })

    it('bpm=120 时间隔 0.5 秒', () => {
      const p = mount({ bpm: 120 })
      p.runMs(1200)
      expect(audio.state.clicks.length).toBeGreaterThanOrEqual(3)
      for (let i = 1; i < audio.state.clicks.length; i++) {
        expect(audio.state.clicks[i].start - audio.state.clicks[i - 1].start).toBeCloseTo(0.5, 5)
      }
      p.unmount()
    })

    it('拖动 BPM 不重启时钟：间隔从下一拍起生效，相位连续（不回到「现在 + 提前量」）', () => {
      const p = mount({ bpm: 60 })
      p.runMs(1100) // 已排 2 拍，nextBeatTime ≈ 2.06
      const before = audio.state.clicks[audio.state.clicks.length - 1].start
      p.rerender({ bpm: 120 }) // 提速
      p.runMs(1200)
      const after = audio.state.clicks[audio.state.clicks.length - 1]
      // 若时钟被重建，下一拍会落在「重排那一刻 + 0.06」，与 before 的间隔会是个零头；
      // 相位连续则应严格是 0.5 的整数倍关系。
      const gap = after.start - before
      expect(gap % 0.5, `间隔 ${gap} 应是 0.5 的整数倍`).toBeCloseTo(0, 5)
      expect(gap).toBeGreaterThanOrEqual(0.5)
      p.unmount()
    })

    it('单轮把提前量窗口内的多拍一次排完（主线程卡顿不丢拍）', () => {
      // 极快 BPM + 长时间不推进音频时钟：窗口内该排的拍必须都排上
      const p = mount({ bpm: 240 }) // 一拍 0.25s，窗口 0.1s ⇒ 窗口内通常 1 拍
      p.runMs(1050)
      const starts = audio.state.clicks.map((c) => c.start)
      // 每 0.25s 一拍，1.05 秒 + 提前量 ⇒ 至少 4 拍
      expect(starts.length).toBeGreaterThanOrEqual(4)
      for (let i = 1; i < starts.length; i++) {
        expect(starts[i] - starts[i - 1]).toBeCloseTo(0.25, 5)
      }
      p.unmount()
    })
  })

  describe('重音（第一拍强）', () => {
    it('4 拍制：第 1 拍 1200Hz/0.5，其余 800Hz/0.3', () => {
      const p = mount({ bpm: 60, beatsPerMeasure: 4 })
      p.runMs(4100)
      const sig = audio.state.clicks.map((c) => [c.freq, c.gain])
      expect(sig.slice(0, 5)).toEqual([
        [1200, 0.5],
        [800, 0.3],
        [800, 0.3],
        [800, 0.3],
        [1200, 0.5],
      ])
      p.unmount()
    })

    it('3 拍制：重音每 3 拍一次', () => {
      const p = mount({ bpm: 60, beatsPerMeasure: 3 })
      p.runMs(3200)
      const freqs = audio.state.clicks.map((c) => c.freq)
      expect(freqs.slice(0, 4)).toEqual([1200, 800, 800, 1200])
      p.unmount()
    })
  })

  describe('拍事件广播（可视化的唯一来源）', () => {
    it('按音频时刻广播，且小节位置由排程器计算（0 起、拍号循环）', () => {
      const p = mount({ bpm: 60, beatsPerMeasure: 3 })
      p.runMs(3200)
      expect(published.map((b) => b.index)).toEqual([0, 1, 2, 0])
      // seq 单调递增（用于可视化判断「是否新的一拍」）
      expect(published.map((b) => b.seq)).toEqual([1, 2, 3, 4])
      p.unmount()
    })

    it('广播时机锚定音频时刻：拍点在 0.06s 时，约 60ms 后才广播（不是立刻）', () => {
      const p = mount({ bpm: 60 })
      p.runMs(50)
      expect(published, '50ms 时首拍还没到').toHaveLength(0)
      p.runMs(25)
      expect(published, '约 60ms 后首拍到达').toHaveLength(1)
      expect(published[0].index).toBe(0)
      p.unmount()
    })
  })

  describe('声音 / 闪光开关不重建时钟（修「相位跳变」）', () => {
    it('切 flash 后拍序继续，不从小节头重来', () => {
      const p = mount({ bpm: 120, beatsPerMeasure: 4 })
      p.runMs(600) // 约 2 拍
      const countBefore = published.length
      expect(countBefore).toBeGreaterThanOrEqual(2)
      p.rerender({ flash: true })
      p.runMs(500)
      // 若时钟被重建，重排后第一个 index 会是 0；相位连续则**不是** 0
      const resumed = published.slice(countBefore).map((b) => b.index)
      expect(resumed.length).toBeGreaterThan(0)
      expect(resumed[0], '切开关后不应重置到重音拍').not.toBe(0)
      p.unmount()
    })

    it('切 sound 同理（关掉声音后可视化仍继续走拍）', () => {
      const p = mount({ bpm: 120, beatsPerMeasure: 4 })
      p.runMs(600)
      const countBefore = published.length
      const clicksBefore = audio.state.clicks.length
      p.rerender({ sound: false })
      p.runMs(600)
      expect(audio.state.clicks.length, '关掉声音后不再排咔哒').toBe(clicksBefore)
      const resumed = published.slice(countBefore).map((b) => b.index)
      expect(resumed.length).toBeGreaterThan(0)
      expect(resumed[0], '关掉声音不应重置相位').not.toBe(0)
      expect(audio.state.closeCalls, '切开关不得关掉音频上下文').toBe(0)
      p.unmount()
    })
  })

  describe('运行条件与守卫', () => {
    it('enabled=false 且 visualize=false 时什么都不做', () => {
      const p = mount({ enabled: false, visualize: false })
      p.runMs(1500)
      expect(published).toHaveLength(0)
      expect(audio.state.clicks).toHaveLength(0)
      p.unmount()
    })

    it('可视化单独开启时也走拍，但不出声（节拍器总开关是关的）', () => {
      const p = mount({ enabled: false, visualize: true })
      p.runMs(1500)
      expect(published.length).toBeGreaterThanOrEqual(1)
      expect(audio.state.clicks, '总开关关闭 ⇒ 不出声').toHaveLength(0)
      p.unmount()
    })

    it('isPlaying=false 时停止广播', () => {
      const p = mount({ bpm: 120 })
      p.runMs(600)
      const count = published.length
      expect(count).toBeGreaterThan(0)
      p.rerender({ isPlaying: false })
      p.runMs(2000)
      expect(published, '停止后不得再广播').toHaveLength(count)
      p.rerender({ isPlaying: true })
      p.runMs(600)
      expect(published.length, '重新开始后继续广播').toBeGreaterThan(count)
      p.unmount()
    })

    it('bpm 非法（0 / NaN / Infinity）时不起时钟、不崩', () => {
      for (const bad of [0, -60, Number.NaN, Number.POSITIVE_INFINITY]) {
        const p = mount({ bpm: bad })
        p.runMs(1500)
        expect(published, `bpm=${bad} 不应广播`).toHaveLength(0)
        expect(audio.state.clicks, `bpm=${bad} 不应发声`).toHaveLength(0)
        p.unmount()
      }
    })

    it('拍号非法（0 / NaN）时不起时钟（交给 store 的 clampMetronomeBeats 收敛）', () => {
      for (const bad of [0, -1, Number.NaN]) {
        const p = mount({ beatsPerMeasure: bad })
        p.runMs(1500)
        expect(published, `beatsPerMeasure=${bad} 不应广播`).toHaveLength(0)
        p.unmount()
      }
    })

    it('音频上下文处于 suspended 时不排程，只尝试 resume（避免「正拍齐响」）', () => {
      audio.state.ctxState = 'suspended'
      audio.state.autoResume = false // 模拟 resume 没生效（autoplay policy 下很常见）
      const p = mount({ bpm: 60 })
      p.runMs(300)
      expect(audio.state.resumeCalls, '应尝试恢复').toBeGreaterThan(0)
      expect(audio.state.clicks, '未恢复前不得排程').toHaveLength(0)
      expect(published, '未恢复前也不应广播拍事件').toHaveLength(0)
      p.unmount()
    })
  })

  describe('清理', () => {
    it('停止后不会再有迟到的闪光/广播定时器（pending 定时器被清掉）', () => {
      const p = mount({ bpm: 60, flash: true })
      p.runMs(25)
      // 此刻首拍已排程但广播定时器尚未到期
      p.rerender({ isPlaying: false })
      p.runMs(500)
      expect(published, '停止后不得再有迟到的广播').toHaveLength(0)
      p.unmount()
    })

    it('卸载时关闭音频上下文', () => {
      const p = mount({ bpm: 60 })
      p.runMs(100)
      const before = audio.state.closeCalls
      p.unmount()
      expect(audio.state.closeCalls).toBeGreaterThan(before)
    })
  })
})

describe('lib/metronome-clock', () => {
  it('退订后不再收到广播（重复退订不报错）', () => {
    const seen: number[] = []
    const off = subscribeMetronomeBeat((b) => seen.push(b.seq))
    act(() => resetMetronomeClock())
    expect(seen.length).toBe(1)
    off()
    off() // 幂等
    act(() => resetMetronomeClock())
    expect(seen.length, '退订后不应再收到').toBe(1)
  })

  it('单个订阅者抛异常不影响其他订阅者（一个画错的可视化不许拖垮发声）', () => {
    const seen: number[] = []
    const offBad = subscribeMetronomeBeat(() => {
      throw new Error('boom')
    })
    const offGood = subscribeMetronomeBeat((b) => seen.push(b.seq))
    expect(() => act(() => resetMetronomeClock())).not.toThrow()
    expect(seen.length).toBe(1)
    offBad()
    offGood()
  })

  it('快照在同一拍内引用稳定（useSyncExternalStore 要求 getSnapshot 可缓存）', () => {
    const a = getMetronomeBeat()
    expect(getMetronomeBeat()).toBe(a)
    act(() => resetMetronomeClock())
    expect(getMetronomeBeat()).not.toBe(a)
  })

  describe('预备拍与独立音量（#2）', () => {
    it('开启预备拍：先数满一小节（拍号 4 ⇒ 4 拍），之后回到正式小节', () => {
      const p = mount({ bpm: 60, beatsPerMeasure: 4, countIn: true })
      // 4 拍预备 + 至少 2 拍正式，共 6 拍 ≈ 6 秒
      p.runMs(6200)
      const countInBeats = published.filter((b) => b.countIn)
      const normalBeats = published.filter((b) => !b.countIn)
      expect(countInBeats, '预备拍数量应等于拍号').toHaveLength(4)
      expect(countInBeats.map((b) => b.index)).toEqual([0, 1, 2, 3])
      expect(normalBeats.length, '预备结束后应继续正式小节').toBeGreaterThanOrEqual(2)
      p.unmount()
    })

    it('关闭预备拍：一拍预备都没有', () => {
      const p = mount({ bpm: 60, beatsPerMeasure: 4, countIn: false })
      p.runMs(3200)
      expect(published.some((b) => b.countIn)).toBe(false)
      p.unmount()
    })

    it('独立音量：50% 时每次 click 的增益是 100% 的一半', () => {
      const pFull = mount({ bpm: 60, volume: 100 })
      pFull.runMs(1100)
      const fullGain = audio.state.clicks[0].gain
      pFull.unmount()

      audio.state.clicks = []
      published = []
      act(() => resetMetronomeClock())
      const pHalf = mount({ bpm: 60, volume: 50 })
      pHalf.runMs(1100)
      const halfGain = audio.state.clicks[0].gain
      pHalf.unmount()
      expect(halfGain).toBeCloseTo(fullGain * 0.5, 6)
    })

    it('音量为 0：仍然广播拍点（可视化不断），但不发声', () => {
      const p = mount({ bpm: 60, volume: 0 })
      p.runMs(1100)
      expect(audio.state.clicks).toHaveLength(0)
      expect(published.length, '静音也要继续走拍').toBeGreaterThanOrEqual(2)
      p.unmount()
    })
  })
})

describe('风格伴奏（#5）', () => {
  const accompaniment = {
    enabled: true,
    styleId: 'rock' as const,
    volume: 100,
    chord: { root: 'C', type: 'Major' },
  }

  it('节拍器关着、只有伴奏开着：照样建时钟并出声（鼓 + 贝斯），但没有咔哒', () => {
    const p = mount({ enabled: false, sound: false, visualize: false, bpm: 60, accompaniment })
    p.runMs(1100)
    expect(audio.state.clicks, '节拍器总开关关闭 ⇒ 无咔哒').toHaveLength(0)
    // rock 第 1 拍：kick + hat + 贝斯
    expect(audio.state.noises.length, '踩镲走噪声源').toBeGreaterThan(0)
    const bass = audio.state.tones.find((t) => t.type === 'triangle')
    expect(bass, '应有贝斯（三角波）').toBeTruthy()
    expect(bass!.freqs[0], 'C2 = 65.41Hz').toBeCloseTo(65.406, 2)
    p.unmount()
  })

  it('鼓点排在「拍点 + 拍内偏移」上（rock 1& 的踩镲 = 拍头 + 1/2 拍）', () => {
    const p = mount({ bpm: 120, accompaniment })
    p.runMs(700)
    const first = audio.state.clicks[0].start // 第 1 拍的音频时刻（含提前量）
    // rock：第 1 拍 sub 2 有踩镲 → first + 0.25s（120BPM 一拍 0.5s）
    expect(audio.state.noises.some((n) => Math.abs(n.start - (first + 0.25)) < 1e-6)).toBe(true)
    p.unmount()
  })

  it('swing：后半拍推迟到 2/3 拍处（与直音的 1/2 拍差 1/6 拍）', () => {
    const straight = mount({ bpm: 120, accompaniment })
    straight.runMs(700)
    const straightFirst = audio.state.clicks[0].start
    expect(audio.state.noises.some((n) => Math.abs(n.start - (straightFirst + 0.25)) < 1e-6)).toBe(true)
    straight.unmount()

    audio.state.clicks = []
    audio.state.noises = []
    published = []
    act(() => resetMetronomeClock())
    const swung = mount({ bpm: 120, accompaniment: { ...accompaniment, styleId: 'swing' } })
    swung.runMs(1100)
    const swungFirst = audio.state.clicks[0].start
    // swing 第 2 拍后半拍的 ride：拍点 0.5s + 2/3 拍（0.3333s）
    expect(audio.state.noises.some((n) => Math.abs(n.start - (swungFirst + 0.5 + 0.5 * (2 / 3))) < 1e-6)).toBe(true)
    swung.unmount()
  })

  it('预备拍期间不出伴奏（数拍只有咔哒，没有律动）', () => {
    const p = mount({ bpm: 60, beatsPerMeasure: 4, countIn: true, accompaniment })
    p.runMs(3800) // 4 拍预备尚未结束
    expect(audio.state.noises, '预备拍不应有鼓').toHaveLength(0)
    expect(audio.state.tones, '预备拍不应有贝斯/底鼓').toHaveLength(0)
    p.runMs(1500) // 进入正式小节
    expect(audio.state.noises.length, '正式小节开始出鼓').toBeGreaterThan(0)
    p.unmount()
  })

  it('伴奏音量按百分比缩放鼓点增益（50% ⇒ 一半）', () => {
    const full = mount({ bpm: 60, accompaniment })
    full.runMs(700)
    const fullKick = audio.state.tones.find((t) => t.type === 'sine')!
    full.unmount()

    audio.state.clicks = []
    audio.state.tones = []
    audio.state.noises = []
    published = []
    act(() => resetMetronomeClock())
    const half = mount({ bpm: 60, accompaniment: { ...accompaniment, volume: 50 } })
    half.runMs(700)
    const halfKick = audio.state.tones.find((t) => t.type === 'sine')!
    expect(halfKick.gain).toBeCloseTo(fullKick.gain * 0.5, 6)
    half.unmount()
  })
})
