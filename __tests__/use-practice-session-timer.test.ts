/**
 * hooks/use-practice-session.ts 的**倒计时**契约（审计 2026-10-31 第 6 项）。
 *
 * 这个 hook 此前零行为测试。这里只钉计时相关的三条性质，因为它们是「静默失效」的
 * 高发区：进度条看起来在动，但和真实时间不是一回事。
 *
 * ① 正常前台：每秒扣 1；
 * ② 🚨 后台被节流（时钟走了很多、回调只来一次）：剩余时间必须一次校正到真实值；
 * ③ 暂停不耗时间，恢复后从剩余量继续。
 *
 * 复现方式：`vi.setSystemTime()` 只推进**时钟**、不触发定时器，再让一个 tick 落地 ——
 * 这正是浏览器节流的形态。旧实现（每 tick `prev - 1`）在这种形态下会落后几十倍：
 * 设 5 分钟的练习 15 分钟还没结束，而记录统计的时长用的是墙钟 ⇒ 两个数据源矛盾。
 *
 * 测法沿用项目既有模式：`createRoot` + React 原生 `act`（`@testing-library/dom` 未安装）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { usePracticeSession, type UsePracticeSessionOptions } from '@/hooks/use-practice-session'
import { createNoteConfirmState } from '@/lib/note-confirm'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type Api = ReturnType<typeof usePracticeSession>

let api: Api | null = null
/** Probe 内部的播放状态（hook 的 setIsPlaying 会被计时归零 / stop 调用） */
let playing = false
/** 让用例能模拟「答题」（score 由页面持有，hook 只读） */
let probe: { setScore: (v: { correct: number; total: number }) => void } | null = null

function Probe({ options }: { options: UsePracticeSessionOptions }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [score, setScore] = useState({ correct: 0, total: 0 })
  // 会话计时 state 在生产里由 `usePracticeStats` 持有，这里必须同样由 Probe 持有：
  // 若沿用 makeOptions 里的 noop setter，hook 写入的起点/累计永远回不来，
  // 结算时长会恒为下限 1 秒（测不出计时逻辑）。
  const [practiceSessionStartTime, setPracticeSessionStartTime] = useState<number | null>(null)
  const [practiceElapsedTime, setPracticeElapsedTime] = useState(0)
  playing = isPlaying
  probe = { setScore }
  api = usePracticeSession({
    ...options,
    isPlaying, setIsPlaying, score, setScore,
    practiceSessionStartTime, setPracticeSessionStartTime,
    practiceElapsedTime, setPracticeElapsedTime,
  })
  return null
}

const mounted: Array<() => void> = []

function mount(overrides: Partial<UsePracticeSessionOptions> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(Probe, { options: makeOptions(overrides) })) })
  mounted.push(() => {
    try { act(() => root.unmount()) } catch { /* 已拆过 */ }
    container.remove()
    api = null
  })
}

afterEach(() => {
  for (const u of mounted.splice(0)) { try { u() } catch { /* 已拆过 */ } }
  vi.useRealTimers()
})

beforeEach(() => {
  vi.useFakeTimers()
  playing = false
})

const noop = () => {}

/** 一次性构造全部依赖（hook 的 options 很宽，这里只是把「与计时无关」的都填成空实现） */
function makeOptions(overrides: Partial<UsePracticeSessionOptions> = {}): UsePracticeSessionOptions {
  return {
    isPlaying: false,
    setIsPlaying: noop,
    score: { correct: 0, total: 0 },
    setScore: noop,
    activeTab: 'scale',
    practiceTime: 300,
    pitchFindingTime: 5,
    intervalPracticeDuration: 3,
    showPracticeSuggestions: false,
    instrument: 'six_string_guitar',
    language: 'zh-CN',
    selectedIntervals: [],
    intervalDirection: 'up',
    intervalRandomizeOrder: false,
    practiceSessionStartTime: null,
    setPracticeSessionStartTime: noop,
    practiceElapsedTime: 0,
    setPracticeElapsedTime: noop,
    scoreRef: { current: { correct: 0, total: 0 } },
    recordPractice: noop,
    setPracticeSummaryData: noop,
    setShowPracticeSummary: noop,
    generateNewTarget: noop,
    generateChordExercise: noop,
    generateScaleExercise: noop,
    generateIntervalExerciseRef: { current: null },
    clearFretClickTimers: noop,
    // 🚨 必须是真实对象：togglePractice 会调用 resetNoteConfirmState（写它的字段）
    noteConfirmStateRef: { current: createNoteConfirmState() },
    cooldownRef: { current: null },
    isCoolingDownRef: { current: false },
    scaleComboRef: { current: 0 },
    scaleMaxComboRef: { current: 0 },
    setHighlightedFrets: noop,
    setHighlightedTargetPosition: noop,
    setCurrentPracticeSuggestion: noop,
    setCurrentIntervalExercise: noop,
    setIntervalPracticeStep: noop,
    setIntervalExerciseQueue: noop,
    setIntervalCurrentQueueIndex: noop,
    setScaleCombo: noop,
    setScaleMaxCombo: noop,
    setScaleExerciseSequence: noop,
    setScaleExerciseCurrentStep: noop,
    setNextScaleExerciseInfo: noop,
    setCurrentChordIndex: noop,
    setChordDegreeCurrentStep: noop,
    setNextChordInfo: noop,
    setNextChordExerciseInfo: noop,
    setChordExerciseTargetChord: noop,
    setChordExerciseSequence: noop,
    setChordExerciseCurrentStep: noop,
    setShowFretboard: noop,
    setShowIntervalFretboard: noop,
    setShowChordFretboard: noop,
    setShowChordExerciseFretboard: noop,
    setShowScaleFretboard: noop,
    ...overrides,
  }
}

const start = () => act(() => { api!.togglePractice() })
/** 只推进时钟、**不**触发定时器（模拟后台节流），然后让一个 tick 落地 */
const throttle = (seconds: number) => {
  act(() => { vi.setSystemTime(Date.now() + seconds * 1000) })
  act(() => { vi.advanceTimersByTime(250) })
}
const runFor = (seconds: number) => act(() => { vi.advanceTimersByTime(seconds * 1000) })

describe('练习倒计时按墙钟走', () => {
  it('开始：剩余 = 时长（scale 用 practiceTime=300）', () => {
    mount()
    start()
    expect(api!.timeLeft).toBe(300)
  })

  it('前台每秒扣 1', () => {
    mount()
    start()
    runFor(1)
    expect(api!.timeLeft).toBe(299)
    runFor(9)
    expect(api!.timeLeft).toBe(290)
  })

  it('🚨 后台被节流：时钟走 200 秒只来一次 tick，剩余一次校正到 100', () => {
    mount()
    start()
    runFor(1)
    expect(api!.timeLeft).toBe(299)

    throttle(200)

    // 旧实现（每 tick 减 1）这里还是 298 —— 也就是「设 5 分钟练 15 分钟还没完」
    expect(api!.timeLeft).toBe(99)
  })

  it('🚨 节流跨过终点：会话必须结束（旧实现会一直不结束）', () => {
    mount()
    start()
    throttle(600)
    expect(api!.timeLeft).toBe(0)
    expect(playing, 'timeLeft 归零后必须停止播放').toBe(false)
  })

  it('暂停不耗时间：暂停期间时钟前进 120 秒，剩余不变；恢复后继续扣', () => {
    mount()
    start()
    runFor(30)
    expect(api!.timeLeft).toBe(270)

    act(() => { api!.togglePausePractice() })
    throttle(120)
    expect(api!.timeLeft, '暂停期间不该扣时间').toBe(270)

    act(() => { api!.togglePausePractice() })
    runFor(1)
    expect(api!.timeLeft).toBe(269)
  })

  it('外部改 timeLeft（重置 / 切换答题模式）后以新值为基准，不会被打回原值', () => {
    mount()
    start()
    runFor(100)
    expect(api!.timeLeft).toBe(200)

    // 组件层在「停止练习」时会把 timeLeft 改回完整时长
    act(() => { api!.setTimeLeft(300) })
    runFor(1)
    // 旧实现不会出问题（它只做 -1）；这里防的是「基准没跟着外部写入走」的实现
    expect(api!.timeLeft).toBe(299)
  })
})

describe('beforeunload 订阅不随 tick 增长（性能护栏）', () => {
  it('🚨 练习中 timeLeft 每秒变，但 beforeunload 监听器只挂一次（旧实现每秒 remove+add）', () => {
    let beforeunloadAdds = 0
    const origAdd = window.addEventListener.bind(window)
    const spy = vi
      .spyOn(window, 'addEventListener')
      .mockImplementation(((type: string, ...rest: unknown[]) => {
        if (type === 'beforeunload') beforeunloadAdds++
        ;(origAdd as (...a: unknown[]) => void)(type, ...rest)
      }) as never)

    mount()
    start()
    runFor(10) // 10 个 tick 秒：旧实现会重挂 10 次
    expect(beforeunloadAdds, 'beforeunload 订阅次数不得随练习时长增长').toBe(1)
    expect(api!.timeLeft, '时钟本身照常走').toBe(290)

    spy.mockRestore()
  })
})

describe('练习会话：停止时记录（时长走墙钟）', () => {
  it('开始后没有任何答题 ⇒ 不记录（避免「开始即停止」也计入统计）', () => {
    const recordPractice = vi.fn()
    mount({ recordPractice })

    act(() => { api!.togglePractice() })
    act(() => { api!.togglePractice() })

    expect(recordPractice).not.toHaveBeenCalled()
  })

  it('有答题 ⇒ 记录一条，时长至少 1 秒（且与墙钟一致）', () => {
    const recordPractice = vi.fn()
    mount({ recordPractice })

    act(() => { api!.togglePractice() })
    // 模拟答题（score 由页面持有，hook 只读）
    act(() => { probe!.setScore({ correct: 1, total: 2 }) })
    act(() => { api!.togglePractice() }) // 停止 ⇒ 结算

    expect(recordPractice).toHaveBeenCalledTimes(1)
    const [type, , opts] = recordPractice.mock.calls[0] as [string, string, { duration: number }]
    expect(type).toBe('scale') // activeTab='scale' ⇒ PracticeType 'scale'
    expect(opts.duration).toBeGreaterThanOrEqual(1)
  })
})

// ==================================================== 暂停 / 切 tab 的时长统计（2026-11-03）
/**
 * 记进 SQLite 的 `duration` 必须等于**真实活跃时长**（暂停段不计入）。
 *
 * 旧实现的 bug 是「扣反了」：`pausePractice` 累加的是活跃段秒数，而结算 effect
 * 把这个累计当成「暂停秒数」从墙钟里减去（`wall - elapsed`）。于是
 * 「活跃 10s、暂停 30s、再活跃 20s」的会话被记成 10s（墙钟 60 - 累计 50），
 * 暂停越长时长越短；而未暂停的会话恰好不受影响，所以问题长期没被发现。
 *
 * 另一条路径：切 tab 会调用 `resetPractice`，它原本在结算 effect 之前就把
 * `practiceElapsedTime` / `practiceSessionStartTime` 归零 ⇒ 本次会话被记成 1 秒。
 */
describe('练习会话：暂停与切 tab 不计入时长', () => {
  /** 最近一次 recordPractice 的 duration（秒） */
  const lastDuration = (mock: ReturnType<typeof vi.fn>) =>
    (mock.mock.calls[0][2] as { duration: number }).duration

  it('活跃 10s + 暂停 30s + 活跃 20s ⇒ 记录 30s（不是墙钟 60s）', () => {
    const recordPractice = vi.fn()
    mount({ recordPractice })

    start()
    act(() => { probe!.setScore({ correct: 1, total: 1 }) })
    runFor(10)                                  // 活跃段 1
    act(() => { api!.togglePausePractice() })   // 暂停
    runFor(30)                                  // 挂起 30s（时钟前进，计时器挂起）
    act(() => { api!.togglePausePractice() })   // 恢复
    runFor(20)                                  // 活跃段 2
    act(() => { api!.togglePractice() })        // 停止 ⇒ 结算

    expect(recordPractice).toHaveBeenCalledTimes(1)
    expect(lastDuration(recordPractice)).toBe(30)
  })

  it('暂停中直接停止 ⇒ 只记录已结束的活跃段（10s）', () => {
    const recordPractice = vi.fn()
    mount({ recordPractice })

    start()
    act(() => { probe!.setScore({ correct: 1, total: 1 }) })
    runFor(10)
    act(() => { api!.togglePausePractice() })
    runFor(30)                                  // 暂停期间流逝的时间不该计入
    act(() => { api!.togglePractice() })        // 暂停态下停止

    expect(recordPractice).toHaveBeenCalledTimes(1)
    expect(lastDuration(recordPractice)).toBe(10)
  })

  it('播放中切 tab（resetPractice）⇒ 记录本次会话时长，不被归零成 1 秒', () => {
    const recordPractice = vi.fn()
    mount({ recordPractice })

    start()
    act(() => { probe!.setScore({ correct: 1, total: 1 }) })
    runFor(45)
    act(() => { api!.resetPractice() })         // 页面 handleTabChange 的路径

    expect(recordPractice).toHaveBeenCalledTimes(1)
    expect(lastDuration(recordPractice)).toBe(45)
  })
})
