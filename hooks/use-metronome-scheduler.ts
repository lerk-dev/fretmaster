'use client'

import { useEffect, useRef } from 'react'
import { getAudioContextClass } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { publishMetronomeBeat } from '@/lib/metronome-clock'

/**
 * useMetronomeScheduler —— 节拍器的**单一**调度器（#14）。
 *
 * ## 修的是什么
 * 修前是两套互不相干的 `setInterval`：
 *  - `app/page.tsx` 的 `setInterval(60000 / bpm)` 里 `createOscillator` + `start(ctx.currentTime)`
 *    ⇒ ① `setInterval` 不补偿回调耗时与主线程阻塞，误差**逐拍累积**；
 *      ② 以「当前时刻」立即排程，没有提前量，WebView 卡一下就直接丢拍；
 *      ③ 切 `metronomeSound` / `metronomeFlash` 会重建 interval ⇒ **相位跳变**。
 *  - `components/metronome-visualizer.tsx` 自己的另一个 `setInterval`
 *    ⇒ 启动时刻与漂移速率都与声音不同，圆点与「咔哒」逐渐错开。
 *
 * ## 改成什么
 * 标准 lookahead 调度（"A Tale of Two Clocks"）：**时间轴只有一个 —— 音频时钟**。
 *  - `setInterval(METRONOME_POLL_MS)` 只负责**轮询排程**，抖动不影响音准（25ms 抖动
 *    对 100ms 提前量毫无影响）；
 *  - 每轮把「音频时钟未来 `METRONOME_SCHEDULE_AHEAD_SEC` 秒内」的拍一次性排进音频线程
 *    （`oscillator.start(拍点时刻)`）⇒ 采样级精度，主线程再卡也不丢拍；
 *  - 可视化/闪光**不在**音频线程里做，而是在排程时换算成 `setTimeout`
 *    （延迟 = 拍点 − 当前音频时刻）。它锚定在音频时钟上 ⇒ 误差有界（几毫秒的
 *    setTimeout 抖动）、**永不累积**，而不是两套时钟各自漂移。
 *
 * ## 为什么返回值是 void
 * 拍事件通过 `lib/metronome-clock.ts` 广播，而不是 `setState` 返回给调用方：
 * 调用方是 `app/page.tsx`（5500+ 行），每拍 `setState` 会让它整树 reconcile，
 * 240BPM 下每秒 4 次，反而把主线程拖垮并砸到音频排程上。
 * 只有真正要画的那个小组件订阅时钟。
 */
export interface MetronomeSchedulerOptions {
  /** 节拍器总开关（`device_metronome`）。关闭时不出声、不闪光。 */
  enabled: boolean
  /** 是否正在练习 */
  isPlaying: boolean
  bpm: number
  /** 拍号：每小节几拍。第一拍为重音。 */
  beatsPerMeasure: number
  /**
   * 以下三个只经 ref 读取（**不进 deps**）：
   * 切换音效/闪光开关不得重建时钟 —— 这正是修前「相位跳变」的成因。
   * `visualize` 例外：它决定时钟是否需要运行（可视化单独开启时也要走拍），
   * 故参与「是否运行」的判定。开启/关闭可视化时重置相位是可接受的语义。
   */
  sound: boolean
  flash: boolean
  visualize: boolean
}

/** 排程提前量（秒）：每轮把音频时钟未来这段窗口内的拍一次排完 */
export const METRONOME_SCHEDULE_AHEAD_SEC = 0.1
/** 轮询间隔（毫秒）：只排程、不出声 ⇒ 抖动不影响音准 */
export const METRONOME_POLL_MS = 25
/** 起拍预留（秒）：给音频线程一点启动时间，避免第一拍因「时刻已过」被丢弃 */
const START_LEAD_SEC = 0.06
/** 重音（小节第一拍）与弱拍的音色 */
const ACCENT_FREQ = 1200
const WEAK_FREQ = 800
const ACCENT_GAIN = 0.5
const WEAK_GAIN = 0.3
const CLICK_DURATION_SEC = 0.1
/** 闪光持续时间（毫秒） */
const FLASH_MS = 100
/** 拍号兜底（与 `components/metronome-visualizer.tsx` 的 `safeBeats` 同口径） */
const DEFAULT_BEATS_PER_MEASURE = 4

function normalizeBeats(beatsPerMeasure: number): number {
  return Number.isFinite(beatsPerMeasure) && beatsPerMeasure >= 1
    ? Math.floor(beatsPerMeasure)
    : DEFAULT_BEATS_PER_MEASURE
}

export function useMetronomeScheduler({
  enabled,
  isPlaying,
  bpm,
  beatsPerMeasure,
  sound,
  flash,
  visualize,
}: MetronomeSchedulerOptions): void {
  // ── 实时值镜像 ─────────────────────────────────────────────────────────────
  // 排程循环是「排程一次、跑很久」，闭包里拿到的是启动那一刻的值；
  // 所以实时值必须走 ref，否则改 BPM 要重建时钟、切开关会相位跳变。
  // 用 effect（而不是渲染期赋值）同步：渲染期写 ref 在并发渲染下不安全。
  const enabledRef = useRef(enabled)
  const soundRef = useRef(sound)
  const flashRef = useRef(flash)
  const bpmRef = useRef(bpm)
  const beatsRef = useRef(DEFAULT_BEATS_PER_MEASURE)
  useEffect(() => {
    enabledRef.current = enabled
    soundRef.current = sound
    flashRef.current = flash
    bpmRef.current = bpm
    beatsRef.current = normalizeBeats(beatsPerMeasure)
  })

  const audioCtxRef = useRef<AudioContext | null>(null)
  /** 下一拍的音频时钟时刻（秒）。整个调度器的核心变量。 */
  const nextBeatTimeRef = useRef(0)
  /** 下一拍在小节内的 0-based 位置 */
  const beatInMeasureRef = useRef(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  /** 已排程的「可视化/闪光」回调，停止时必须全部清掉（否则会在停止后继续闪） */
  const pendingTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  // 三个「是否运行」的判据单独提出来当依赖：真正的 bpm 数值**不进 deps**，
  // 于是拖动速度滑块时时钟不重启、相位连续（拍间隔从下一拍起生效）。
  const bpmValid = Number.isFinite(bpm) && bpm > 0
  const beatsValid = Number.isFinite(beatsPerMeasure) && beatsPerMeasure >= 1

  useEffect(() => {
    const clearPendingTimers = () => {
      for (const id of pendingTimersRef.current) clearTimeout(id)
      pendingTimersRef.current.clear()
      const layer = document.getElementById('metronome-flash-layer')
      // 被清掉的定时器里可能有一个负责「把闪光层透明度还原」
      // ⇒ 这里必须手动还原，否则闪光层会永久亮着。
      if (layer) layer.style.opacity = '0'
    }

    // 可视化单独开启时也要走拍（修前可视化有独立时钟，与节拍器开关无关）。
    const wantClock = enabled || visualize
    if (!isPlaying || !wantClock || !bpmValid || !beatsValid) {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      clearPendingTimers()
      // 声音路径的显隐不依赖音频上下文：关闭时立刻释放，避免占用系统音频资源。
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {})
        audioCtxRef.current = null
      }
      return
    }

    /** 音频时钟（秒）。可视化单独开启时不需要音频上下文，退化为 wall clock。 */
    const now = () => (audioCtxRef.current ? audioCtxRef.current.currentTime : performance.now() / 1000)

    /** 排一记「咔哒」。`when` 是音频时钟时刻 —— 交给音频线程，精确到采样。 */
    const scheduleClick = (ctx: AudioContext, when: number, accent: boolean) => {
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)
      oscillator.frequency.value = accent ? ACCENT_FREQ : WEAK_FREQ
      oscillator.type = 'sine'
      gainNode.gain.setValueAtTime(accent ? ACCENT_GAIN : WEAK_GAIN, when)
      gainNode.gain.exponentialRampToValueAtTime(0.01, when + CLICK_DURATION_SEC)
      oscillator.start(when)
      oscillator.stop(when + CLICK_DURATION_SEC)
    }

    const flashOnce = () => {
      const layer = document.getElementById('metronome-flash-layer')
      if (!layer) return
      layer.style.opacity = '1'
      const id = setTimeout(() => {
        pendingTimersRef.current.delete(id)
        layer.style.opacity = '0'
      }, FLASH_MS)
      pendingTimersRef.current.add(id)
    }

    /** 一轮：把提前量窗口内的拍全部排好。窗口比一轮长 ⇒ 单轮主线程卡顿不会丢拍。 */
    const poll = () => {
      const ctx = audioCtxRef.current
      // 有音频上下文但它还没跑起来（autoplay policy）⇒ 本轮只尝试恢复，不排程，
      // 否则 `currentTime` 冻结会把整个提前量窗口的拍排在同一时刻、开唱时齐响。
      if (ctx && ctx.state !== 'running') {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {})
        return
      }
      const horizon = now() + METRONOME_SCHEDULE_AHEAD_SEC
      while (nextBeatTimeRef.current < horizon) {
        const when = nextBeatTimeRef.current
        const index = beatInMeasureRef.current
        if (ctx && enabledRef.current && soundRef.current) {
          try {
            scheduleClick(ctx, when, index === 0)
          } catch (error) {
            logger.debug('节拍器发声失败', error)
          }
        }
        // 视听一致：把拍事件挂在**音频时刻**上换算成 setTimeout 延迟。
        const delayMs = Math.max(0, (when - now()) * 1000)
        // 回调里要引用自己的 id 才能从 pending 集合里摘掉（集合不能无限增长）；
        // 回调是**之后**才执行的，那时 TDZ 早已结束，用 const 即可。
        const timerId = setTimeout(() => {
          pendingTimersRef.current.delete(timerId)
          publishMetronomeBeat(index)
          if (enabledRef.current && flashRef.current) flashOnce()
        }, delayMs)
        pendingTimersRef.current.add(timerId)

        beatInMeasureRef.current = (index + 1) % beatsRef.current
        nextBeatTimeRef.current += 60 / bpmRef.current
      }
    }

    // 需要出声才建音频上下文；纯可视化时用 wall clock，不白占一个音频实例。
    if (enabled && sound) {
      try {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          const AudioCtx = getAudioContextClass()
          audioCtxRef.current = new AudioCtx()
        }
        const ctx = audioCtxRef.current
        if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      } catch (error) {
        logger.debug('创建节拍器音频上下文失败（降级为静音节拍）', error)
      }
    }

    // 起拍：从**重音拍**开始（每次开始练习都重新数 1），并留一点启动余量。
    beatInMeasureRef.current = 0
    nextBeatTimeRef.current = now() + START_LEAD_SEC

    poll()
    pollRef.current = setInterval(poll, METRONOME_POLL_MS)

    return () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      clearPendingTimers()
    }
    // 🚨 deps 里只有「是否运行」的布尔判据 + bpm/拍号的有效性，
    // 没有 bpm / beatsPerMeasure / sound / flash 的**数值**：
    // 把数值放进来会让每一次拖动滑块都重启时钟（相位跳变，正是本次要修的 bug）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, enabled, visualize, bpmValid, beatsValid])

  // 卸载时释放音频上下文（与启动/停止无关，只做一次）。
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {})
        audioCtxRef.current = null
      }
    }
  }, [])
}
