/**
 * 练习会话域 —— 从 `app/page.tsx` 抽出的**独立功能域**：一次练习从开始到结束的全生命周期。
 *
 * ## 这里装了什么
 *
 * - **会话控制**：`togglePractice`（开始/停止）、`togglePausePractice`（暂停/恢复）、
 *   `resetPractice`（切 tab 或点「重置」时的全量归零）。
 * - **计时**：`timeLeft` 每秒递减；归零时结束会话并弹出练习总结。
 * - **会话统计**：从「开始练习」到「结束练习」（停止 / 时间到 / 切走 tab）记为**一次**，
 *   结束时经 `recordPractice` 落一次 score/accuracy/duration（不再每答对一题记一次）。
 * - **状态快照**：`beforeunload` 时把 {tab, score, timeLeft, 暂停态} 写 localStorage，
 *   挂载时清掉超过 30 分钟的过期快照。
 * - **屏幕常亮**：练习进行中持有 WakeLock，释放也由本 hook 负责。
 *
 * ## 这里**不**装什么
 *
 * - **出题**：`generateNewTarget` / `generateChordExercise` / `generateScaleExercise` /
 *   `generateIntervalExerciseRef` 都由页面（或各自的练习域 hook）注入 —— 会话域只知道
 *   「该出题了」，不知道题目怎么算。
 * - **判对错**：`score` 由页面的 `processPracticeMatch`（→ `lib/answer-judge.ts`）写入，
 *   本 hook 只负责**归零**与**读快照**。
 * - **UI**：本 hook 不订阅 store、不渲染任何东西（与 `hooks/use-tuner.ts` 同一约定）。
 *
 * ## 三条不变量（有护栏）
 *
 * 1. **`pausePractice` 里 `Date.now()` 必须在 updater 之外取** —— 铁律 1：`setPracticeElapsedTime`
 *    的 updater 在 StrictMode 下会被双调用，两次 `Date.now()` 不同 ⇒ 暂停时长漂移，
 *    且**只在 dev 复现**（生产不复现，最难查的一类）。护栏 `setstate-updater-purity.test.ts`。
 * 2. **计时单位是【秒】** —— `practiceElapsedTime`（已结束活跃段的累计秒数）与
 *    `practiceSessionStartTime`（当前活跃段起点，暂停期间为 `null`）全程按秒计算。
 *    历史上这里按毫秒累加过，恢复后时长被放大 1000 倍。
 * 3. **`timeLeft` / `isPracticePaused` 的唯一写者是本 hook** —— 页面只**读**这两个值
 *    （时间条、暂停/恢复按钮的图标与 title）；`setIsPracticePaused` **刻意不暴露**，
 *    唯一的翻转入口是 `togglePausePractice`。多一条写路径就会多一种
 *    「暂停态与计时器不同步」的坏法（铁律 12：同一「量」不许两份判定）。
 *    （`setTimeLeft` 是唯一例外：时间条是可拖拽的，用户显式改时长必须直连 state。）
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { logger } from '@/lib/logger'
import { resetNoteConfirmState, type NoteConfirmState } from '@/lib/note-confirm'
import { buildDirectionalQueue, shuffle, type IntervalDirection } from '@/lib/interval-direction'
import { PRACTICE_SUGGESTIONS, type InstrumentType } from '@/lib/practice-suggestions'
import { PRACTICE_TYPE_LABELS } from '@/lib/practice-type-labels'
import type { PracticeType } from '@/lib/page-stats-types'

// tab → PracticeType 映射（chord tab 对应 chord_progression 类型）
const tabToPracticeType = (tab: string): PracticeType | null => {
  switch (tab) {
    case 'practice': return 'pitch_finding'
    case 'interval': return 'interval'
    case 'scale': return 'scale'
    case 'chord_exercise': return 'chord_exercise'
    case 'chord': return 'chord_progression'
    default: return null
  }
}

export interface UsePracticeSessionOptions {
  // ---------------- 播放状态与计分（store 绑定） ----------------
  isPlaying: boolean
  setIsPlaying: (v: boolean) => void
  score: { correct: number; total: number }
  setScore: (v: { correct: number; total: number }) => void
  activeTab: string

  // ---------------- 会话参数（设置 + 用户偏好） ----------------
  practiceTime: number
  pitchFindingTime: number
  intervalPracticeDuration: number
  showPracticeSuggestions: boolean
  instrument: InstrumentType
  language: string
  selectedIntervals: number[]
  intervalDirection: IntervalDirection
  intervalRandomizeOrder: boolean

  // ---------------- 会话统计（usePracticeStats 的出口） ----------------
  practiceSessionStartTime: number | null
  setPracticeSessionStartTime: (v: number | null) => void
  practiceElapsedTime: number
  /** 需要 updater 形态（暂停时 `prev + 本次活跃段秒数`） */
  setPracticeElapsedTime: (v: number | ((prev: number) => number)) => void
  scoreRef: { current: { correct: number; total: number } }
  recordPractice: (
    type: PracticeType,
    detailName: string,
    opts?: { score?: number; duration?: number; accuracy?: number }
  ) => void
  setPracticeSummaryData: (v: { correct: number; total: number; duration: number }) => void
  setShowPracticeSummary: (v: boolean) => void

  // ---------------- 各练习域的「出题」动作（页面提供） ----------------
  generateNewTarget: () => void
  generateChordExercise: () => void
  generateScaleExercise: () => void
  generateIntervalExerciseRef: { current: (() => void) | null }
  clearFretClickTimers: () => void

  // ---------------- 收音域返回的 ref ----------------
  // 🚨 这些 ref 的**身份恒定**，且与页面的 `processPracticeMatch` 共用同一份：
  //    「答完延迟」的两个定时器（冷却期）与多帧确认的记忆必须是同一条链路的。
  noteConfirmStateRef: { current: NoteConfirmState | null }
  cooldownRef: { current: ReturnType<typeof setTimeout> | null }
  isCoolingDownRef: { current: boolean }
  scaleComboRef: { current: number }
  scaleMaxComboRef: { current: number }

  // ---------------- 其他练习域的归零 setter ----------------
  // 说明：`resetPractice` 的职责就是「把所有练习域归零」，所以它天然要碰每个域的
  // setter —— 这不是耦合失控，而是这个动作的定义。类型按**本 hook 实际传入的值**收窄：
  // 只被传 `null` 的三个据此收窄为 `null`，避免反向依赖页面的内部对象形状。
  setHighlightedFrets: (v: Map<string, boolean>) => void
  setHighlightedTargetPosition: (v: { stringIndex: number; fret: number } | null) => void
  setCurrentPracticeSuggestion: (v: string) => void
  /** 只用于归零：本 hook 只传 `null` */
  setCurrentIntervalExercise: (v: null) => void
  setIntervalPracticeStep: (v: 'root' | 'interval') => void
  setIntervalExerciseQueue: (v: number[]) => void
  setIntervalCurrentQueueIndex: (v: number) => void
  setScaleCombo: (v: number) => void
  setScaleMaxCombo: (v: number) => void
  setScaleExerciseSequence: (v: string[]) => void
  setScaleExerciseCurrentStep: (v: number) => void
  /** 只用于归零：本 hook 只传 `null` */
  setNextScaleExerciseInfo: (v: null) => void
  setCurrentChordIndex: (v: number) => void
  setChordDegreeCurrentStep: (v: number) => void
  /** 只用于归零：本 hook 只传 `null` */
  setNextChordInfo: (v: null) => void
  /** 只用于归零：本 hook 只传 `null` */
  setNextChordExerciseInfo: (v: null) => void
  /** 只用于归零：本 hook 只传 `null` */
  setChordExerciseTargetChord: (v: null) => void
  setChordExerciseSequence: (v: string[]) => void
  setChordExerciseCurrentStep: (v: number) => void
  setShowFretboard: (v: boolean) => void
  setShowIntervalFretboard: (v: boolean) => void
  setShowChordFretboard: (v: boolean) => void
  setShowChordExerciseFretboard: (v: boolean) => void
  setShowScaleFretboard: (v: boolean) => void
}

export function usePracticeSession({
  isPlaying,
  setIsPlaying,
  score,
  setScore,
  activeTab,
  practiceTime,
  pitchFindingTime,
  intervalPracticeDuration,
  showPracticeSuggestions,
  instrument,
  language,
  selectedIntervals,
  intervalDirection,
  intervalRandomizeOrder,
  practiceSessionStartTime,
  setPracticeSessionStartTime,
  practiceElapsedTime,
  setPracticeElapsedTime,
  scoreRef,
  recordPractice,
  setPracticeSummaryData,
  setShowPracticeSummary,
  generateNewTarget,
  generateChordExercise,
  generateScaleExercise,
  generateIntervalExerciseRef,
  clearFretClickTimers,
  noteConfirmStateRef,
  cooldownRef,
  isCoolingDownRef,
  scaleComboRef,
  scaleMaxComboRef,
  setHighlightedFrets,
  setHighlightedTargetPosition,
  setCurrentPracticeSuggestion,
  setCurrentIntervalExercise,
  setIntervalPracticeStep,
  setIntervalExerciseQueue,
  setIntervalCurrentQueueIndex,
  setScaleCombo,
  setScaleMaxCombo,
  setScaleExerciseSequence,
  setScaleExerciseCurrentStep,
  setNextScaleExerciseInfo,
  setCurrentChordIndex,
  setChordDegreeCurrentStep,
  setNextChordInfo,
  setNextChordExerciseInfo,
  setChordExerciseTargetChord,
  setChordExerciseSequence,
  setChordExerciseCurrentStep,
  setShowFretboard,
  setShowIntervalFretboard,
  setShowChordFretboard,
  setShowChordExerciseFretboard,
  setShowScaleFretboard,
}: UsePracticeSessionOptions) {
  // ==================== 会话状态 ====================

  const [timeLeft, setTimeLeft] = useState(300)

  const [isPracticePaused, setIsPracticePaused] = useState(false)

  // ==================== refs（身份恒定：定时器与唤醒锁） ====================
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  /**
   * 倒计时的**基准**：`{ at: 时间戳, seconds: 那一刻的剩余秒数 }`。
   *
   * 🚨 为什么不是「每 tick 减 1」（审计 2026-10-31 第 6 项）：后台标签页 / 最小化窗口
   * 里浏览器会把 setInterval 节流到约 1 次/分钟（Chrome 与 WebView2 都会）。按 tick
   * 递减时 `timeLeft` 会落后真实时间几十倍 —— 设 5 分钟的练习 15 分钟还没结束，
   * 而会话结束时的统计时长用的是**墙钟**（`Date.now() - startTime`）⇒ 进度条与统计
   * 两个数据源互相矛盾。改成「基准 + 墙钟差」后，无论中间被节流多久，
   * 一次 tick 就能把剩余时间校正到真实值。
   */
  const countdownBaseRef = useRef<{ at: number; seconds: number } | null>(null)
  /** 上一次写出的剩余秒数（只用于「值没变就不 setState」，避免每 250ms 触发一次渲染） */
  const lastTickRef = useRef<number | null>(null)
  /** `timeLeft` 的镜像：让计时器 effect 不必把 `timeLeft` 放进 deps（否则每秒重建一次 interval） */
  const timeLeftRef = useRef(300)
  // 屏幕常亮的句柄：练习开始时申请、停止/卸载/页面隐藏时释放
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  // 快照字段的镜像：`savePracticeState` 身份恒定，不必随 timeLeft 每秒重建闭包。
  // effect 无 deps ⇒ 每次渲染后刷新镜像；事件回调（beforeunload）总在 commit 之后触发，
  // 读到的一定是最新的快照字段。
  const practiceStateSnapshotRef = useRef({ isPlaying, activeTab, score, timeLeft, isPracticePaused })
  useEffect(() => {
    practiceStateSnapshotRef.current = { isPlaying, activeTab, score, timeLeft, isPracticePaused }
  })

  // 🚨 性能：`savePracticeState` 的字段含 `timeLeft`（练习中每秒变一次）——
  // 旧实现 deps 跟着它变、订阅 effect 挂在 `[savePracticeState]` 上 ⇒ **每秒**
  // remove+add 一次 beforeunload 监听器，还每秒造一个新闭包（300 秒练习 ≈ 300 次无谓重挂）。
  // 改成「ref 镜像最新字段 + 身份恒定的回调 + 挂载一次订阅」：快照内容照旧是最新值。
  // 护栏：__tests__/use-practice-session-timer.test.ts「beforeunload 订阅不随 tick 增长」。
  const savePracticeState = useCallback(() => {
    const { isPlaying, activeTab, score, timeLeft, isPracticePaused } = practiceStateSnapshotRef.current
    if (typeof window === 'undefined' || !isPlaying) return
    const state = {
      activeTab,
      score,
      timeLeft,
      isPracticePaused,
      timestamp: Date.now(),
    }
    try {
      localStorage.setItem('fretmaster-practice-state', JSON.stringify(state))
    } catch (e) {
      logger.error('保存练习状态快照失败:', e)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleBeforeUnload = () => {
      savePracticeState()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [savePracticeState])

  // 清理过期的练习状态快照（超过 30 分钟视为失效）。
  // 原实现判断反了：删掉的是 30 分钟内的有效快照、反而留下过期数据。
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem('fretmaster-practice-state')
      if (saved) {
        const state = JSON.parse(saved)
        const age = Date.now() - (state?.timestamp ?? 0)
        if (age > 30 * 60 * 1000) {
          localStorage.removeItem('fretmaster-practice-state')
        }
      }
    } catch (e) {
      console.error('Failed to parse practice state:', e)
    }
  }, [])

  // ==================== 练习会话统计（统一会话级记录） ====================
  // 所有练习 tab 统一按"会话"统计：从开始练习到结束练习（停止/时间到/切Tab）记为一次。
  // 不再每答对一题就 +1，避免单次会话被记成几十次，且 score/accuracy 有真实意义。
  // pitch_finding → practice tab；chord_progression → chord tab；其他 tab 名与类型一致
  const sessionStartRef = useRef<number | null>(null)
  const sessionScoreRef = useRef<{ correct: number; total: number }>({ correct: 0, total: 0 })
  const sessionTabRef = useRef<PracticeType | null>(null)


  useEffect(() => {
    const currentType = tabToPracticeType(activeTab)

    // 会话开始：进入播放状态且在某个练习 tab
    if (isPlaying && currentType && sessionStartRef.current === null) {
      sessionStartRef.current = Date.now()
      sessionScoreRef.current = { correct: 0, total: 0 }
      sessionTabRef.current = currentType
    }

    // 会话进行中：持续记录最新分数（仅当仍在播放且在同一 tab 时更新，
    // 这样在会话结束的同一渲染周期里即使 score 被重置为 0，ref 仍保留最后一题的分数）
    if (isPlaying && currentType && sessionStartRef.current !== null && sessionTabRef.current === currentType) {
      sessionScoreRef.current = score
    }

    // 会话结束：播放停止，且之前确实有一个进行中的会话
    // 或者：切到非练习 tab（isPlaying 仍为 true 但 currentType 为 null）→ 也视为会话结束
    const sessionEnded = !isPlaying && sessionStartRef.current !== null
    const tabSwitchedAway = isPlaying && sessionStartRef.current !== null && !currentType
    if (sessionEnded || tabSwitchedAway) {
      const sessionScore = sessionScoreRef.current
      const sessionType = sessionTabRef.current
      sessionStartRef.current = null
      sessionTabRef.current = null
      // 会话时长 = 各【活跃段】之和，暂停段不计入：
      //   · practiceElapsedTime = 已结束活跃段的累计秒数（暂停时并入）
      //   · practiceSessionStartTime = 当前活跃段起点（暂停期间为 null）
      // 🚨 旧实现把 practiceElapsedTime 当成「已累计暂停秒数」从墙钟里扣（wall - elapsed），
      //    正好扣反：暂停 10s、活跃 20s 的会话被记成 10s，暂停越久时长反而越短。
      //    护栏 use-practice-session-timer.test.ts。
      const activeSec = practiceElapsedTime +
        (practiceSessionStartTime !== null ? (Date.now() - practiceSessionStartTime) / 1000 : 0)
      // 仅在用户实际有答题时才记录，避免"开始后立即停止"也被计入
      if (sessionType && sessionScore.total > 0) {
        const accuracy = Math.round((sessionScore.correct / sessionScore.total) * 100)
        const duration = Math.max(1, Math.round(activeSec))
        // detailName 用类型对应的中文名（唯一真相源 lib/practice-type-labels.ts，
        // 读侧 reloadStats 靠同一张表把 exercise_type 翻回 PracticeType）
        recordPractice(sessionType, PRACTICE_TYPE_LABELS[sessionType], { score: accuracy, duration, accuracy })
      }
      // 结算后清空计时，避免上一轮残留污染下一轮（下一轮开始时也会重置）
      setPracticeSessionStartTime(null)
      setPracticeElapsedTime(0)
    }
  }, [isPlaying, activeTab, score, recordPractice, practiceElapsedTime, practiceSessionStartTime, setPracticeSessionStartTime, setPracticeElapsedTime])

  /**
   * 外部改写剩余时间（重置 / 切换答题模式 / 恢复快照）——**返回给页面的就是它**。
   *
   * 🚨 必须同时重设倒计时基准：只 setState 的话，下一次 tick 会按**旧基准**把时间
   * 「拉回」原样（用户刚重置成 5 分钟，一秒后又跳回 3 分 20 秒）。
   * 反过来，靠「比较 ref 猜测是否被外部改过」的做法在批量更新下必然误判
   * （一次 act / 一次 React 批处理里 tick 会连续跑多次，state 镜像永远落后于
   * 上一次 tick 写出的值）—— 所以这里用**显式入口**而不是启发式判定。
   */
  const setTimeLeftAndResync = useCallback((next: number) => {
    // 🚨 `Date.now()` 必须在 updater 外面取（铁律 1：updater 必须纯）
    const now = Date.now()
    countdownBaseRef.current = { at: now, seconds: next }
    lastTickRef.current = next
    setTimeLeft(next)
  }, [])

  // `timeLeft` 的镜像（声明在计时器 effect **之前**：同一 commit 里 effect 按顺序执行，
  // 保证计时器读到的是本次渲染的最新值）
  useEffect(() => {
    timeLeftRef.current = timeLeft
  }, [timeLeft])

  // 计时器效果：按**墙钟**算剩余时间，暂停时挂起。
  //
  // 250ms 一跳（不是 1000ms）：跳得比显示精度密，被节流后也能在一秒内把秒数校正回来；
  // 每次只做一次减法与一次 setState（值没变就不 set）。
  useEffect(() => {
    if (!(isPlaying && practiceTime > 0) || isPracticePaused) return

    // （重新）开始计时 = 从当前的剩余秒数起算（首次开始、暂停恢复、改时长都走这里）
    countdownBaseRef.current = { at: Date.now(), seconds: timeLeftRef.current }
    lastTickRef.current = timeLeftRef.current

    const tick = () => {
      const base = countdownBaseRef.current
      if (!base) return
      const elapsed = Math.floor((Date.now() - base.at) / 1000)
      const remaining = Math.max(0, base.seconds - elapsed)
      if (remaining !== lastTickRef.current) {
        lastTickRef.current = remaining
        setTimeLeft(remaining)
      }
    }

    timerRef.current = setInterval(tick, 250)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [isPlaying, practiceTime, isPracticePaused])

  // 倒计时归零时结束会话。副作用独立成 effect、移出 state updater（并发渲染下不会被重复执行）。
  // 时长直接用 practiceTime：原实现用闭包里的 timeLeft 计算 elapsed，恒等于 1 秒。
  useEffect(() => {
    if (isPlaying && practiceTime > 0 && timeLeft === 0) {
      setIsPlaying(false)
      setPracticeSummaryData({
        correct: scoreRef.current.correct,
        total: scoreRef.current.total,
        duration: practiceTime,
      })
      setShowPracticeSummary(true)
    }
  }, [isPlaying, practiceTime, scoreRef, setIsPlaying, setPracticeSummaryData, setShowPracticeSummary, timeLeft])

  // 屏幕常亮功能
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && isPlaying) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
          logger.debug('屏幕常亮已启用')
        }
      } catch (err) {
        logger.debug('无法启用屏幕常亮:', err)
      }
    }

    const releaseWakeLock = () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release()
        wakeLockRef.current = null
        logger.debug('屏幕常亮已释放')
      }
    }

    if (isPlaying) {
      requestWakeLock()
    } else {
      releaseWakeLock()
    }

    // 页面可见性变化时重新请求
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isPlaying) {
        requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      releaseWakeLock()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isPlaying])

  // ==================== 会话控制 ====================
  // 开始/停止、暂停/恢复、重置。三者是 `isPlaying` × `isPracticePaused` × `timeLeft`
  // 这个三态机的**唯一**写入口；页面只通过返回值调用它们。
  const pausePractice = useCallback(() => {
    if (isPlaying && !isPracticePaused) {
      setIsPracticePaused(true)
      // 关闭当前活跃段：把本段秒数并入累计，并把起点置空（暂停期间不再计时）。
      // practiceElapsedTime 的单位是【秒】（见结算 effect 中的 `Math.round(activeSec)`）。
      // 原实现直接累加毫秒差，导致恢复后时长被放大 1000 倍。
      // 🚨 P3-1：`Date.now()` 必须在 updater **外面**取（铁律 1：updater 必须纯）。
      //    StrictMode 会双调用 updater，两次 `Date.now()` 不同 ⇒ 第二次的基准漂移，
      //    且这个漂移在 dev 下才出现、生产不复现（最难查的一类）。
      const now = Date.now()
      const segmentStart = practiceSessionStartTime ?? now
      const elapsedSeconds = (now - segmentStart) / 1000
      setPracticeElapsedTime(prev => prev + elapsedSeconds)
      setPracticeSessionStartTime(null)
    }
  }, [isPlaying, isPracticePaused, practiceSessionStartTime, setPracticeElapsedTime, setPracticeSessionStartTime])

  const resumePractice = useCallback(() => {
    if (isPlaying && isPracticePaused) {
      setIsPracticePaused(false)
      setPracticeSessionStartTime(Date.now())
    }
  }, [isPlaying, isPracticePaused, setPracticeSessionStartTime])

  const togglePausePractice = useCallback(() => {
    if (isPracticePaused) {
      resumePractice()
    } else {
      pausePractice()
    }
  }, [isPracticePaused, pausePractice, resumePractice])

  // 开始/停止练习
  const togglePractice = useCallback(() => {
    // 每一轮练习开始时清空收音确认记忆：上一轮遗留的 firedNote / stableFrames
    // 会挡住本轮第一个音（同一个音级要等到下次起音才能再放行）。
    resetNoteConfirmState(noteConfirmStateRef.current!)
    if (!isPlaying) {
      setScore({ correct: 0, total: 0 })
      // 连击随会话重置（一弦三音面板上的「连击 n×」）
      scaleComboRef.current = 0
      scaleMaxComboRef.current = 0
      setScaleCombo(0)
      setScaleMaxCombo(0)
      // 根据活动标签设置时长
      let timeInSeconds = practiceTime
      if (activeTab === "practice") {
        timeInSeconds = pitchFindingTime * 60
        // 显示练习建议
        if (showPracticeSuggestions) {
          const pool = PRACTICE_SUGGESTIONS[instrument] ?? PRACTICE_SUGGESTIONS.six_string_guitar
          const picked = pool[Math.floor(Math.random() * pool.length)]
          setCurrentPracticeSuggestion(language === "en" ? picked.text : picked.textZh)
        } else {
          setCurrentPracticeSuggestion("")
        }
      } else if (activeTab === "interval") {
        timeInSeconds = intervalPracticeDuration * 60
      }
      setTimeLeft(timeInSeconds)
      generateNewTarget()
      setIntervalPracticeStep("root")
      // 重置音程练习队列
      if (activeTab === "interval") {
        // 队列在 updater **外面**算好再 set（铁律 1：updater 必须纯——
        // random 方向与洗牌都含 Math.random，放进去会被 StrictMode 双调用成两份）。
        if (selectedIntervals.length === 0) {
          setIntervalExerciseQueue([])
        } else {
          let queue = buildDirectionalQueue(selectedIntervals, intervalDirection)
          if (intervalRandomizeOrder) queue = shuffle(queue)
          setIntervalExerciseQueue(queue)
        }
        setIntervalCurrentQueueIndex(0)
        // 延迟执行以等待状态更新
        setTimeout(() => {
          generateIntervalExerciseRef.current?.()
        }, 0)
      }
      if (activeTab === "chord_exercise") {
        generateChordExercise()
      }
      if (activeTab === "scale") {
        generateScaleExercise()
      }
      if (activeTab === "chord") {
        setCurrentChordIndex(0)
        setChordDegreeCurrentStep(0)
        setNextChordInfo(null)
      }
      setIsPlaying(true)
      setIsPracticePaused(false)
      setPracticeSessionStartTime(Date.now())
      setPracticeElapsedTime(0)
    } else {
      setIsPlaying(false)
      setIsPracticePaused(false)
      setHighlightedFrets(new Map())
      setHighlightedTargetPosition(null)
      // 🚨 这里**不要**清空 practiceSessionStartTime / practiceElapsedTime：
      //    结算 effect 还要用它们补上「停止瞬间才结束」的最后一段活跃时间。
      //    清空发生在 effect 内（记录之后），见上方会话统计 effect。
      // P3-2：结束练习时把「答完延迟」的两个定时器一并清掉 —— 否则它们仍会跑
      //（100ms 那条会走 handleMIDINoteInput 记分），把这一局结束后才到达的点击
      // 算进上一局。
      clearFretClickTimers()
    }
    // 🚨 豁免说明：`noteConfirmStateRef` / `scaleComboRef` / `scaleMaxComboRef` 是
    //    从页面注入的 ref（now props ⇒ ESLint 认不出「useRef 身份恒定」），
    //    写进 deps 只会让 `togglePractice` 跟着别人的 ref 换身份。
    //    与页面的 `processPracticeMatch` 用的是**同一份** ref（连击口径唯一）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, setScore, practiceTime, activeTab, generateNewTarget, setIntervalPracticeStep, setIsPlaying, setPracticeSessionStartTime, setPracticeElapsedTime, pitchFindingTime, showPracticeSuggestions, instrument, language, intervalPracticeDuration, setIntervalExerciseQueue, setIntervalCurrentQueueIndex, selectedIntervals, intervalDirection, intervalRandomizeOrder, generateIntervalExerciseRef, generateChordExercise, generateScaleExercise, clearFretClickTimers])


  // 重置练习
  const resetPractice = useCallback(() => {
    setIsPlaying(false)
    setIsPracticePaused(false)
    setScore({ correct: 0, total: 0 })
    setTimeLeft(practiceTime)
    setHighlightedFrets(new Map())
    setHighlightedTargetPosition(null)
    setIntervalPracticeStep("root")
    setCurrentIntervalExercise(null)
    // 切 tab / 点「重置」都会走到这里。若会话仍在进行（isPlaying=true），**不能**在
    // 结算 effect 之前把计时清零 —— 否则本次会话时长会被算成 0（下限 1 秒）。
    // 会话进行中由结算 effect 在记录后清空；只有本来就没在练习时才直接清。
    if (!isPlaying) {
      setPracticeSessionStartTime(null)
      setPracticeElapsedTime(0)
    }
    setShowFretboard(false)
    setShowIntervalFretboard(false)
    setShowChordFretboard(false)
    setShowChordExerciseFretboard(false)
    setShowScaleFretboard(false)
    setChordExerciseTargetChord(null)
    setChordExerciseSequence([])
    setChordExerciseCurrentStep(0)
    setScaleExerciseSequence([])
    setScaleExerciseCurrentStep(0)
    setIntervalPracticeStep("root")
    setChordDegreeCurrentStep(0)
    setNextChordInfo(null)
    setNextChordExerciseInfo(null)
    setNextScaleExerciseInfo(null)
    if (typeof window !== 'undefined') {
      localStorage.removeItem('fretmaster-practice-state')
    }
    if (cooldownRef.current) {
      clearTimeout(cooldownRef.current)
      cooldownRef.current = null
    }
    isCoolingDownRef.current = false
    // 同上：`cooldownRef` / `isCoolingDownRef` 是收音域返回的 ref，身份恒定。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, practiceTime, setChordExerciseCurrentStep, setChordExerciseSequence, setChordExerciseTargetChord, setCurrentIntervalExercise, setIntervalPracticeStep, setIsPlaying, setNextChordExerciseInfo, setPracticeElapsedTime, setPracticeSessionStartTime, setScore, setShowChordExerciseFretboard, setShowIntervalFretboard])

  // 只暴露页面真正要用的：两个只读值 + 剩余时间的显式改写 + 三个会话动作。
  // 🚨 刻意**不**返回 `setIsPracticePaused` / `pausePractice` / `resumePractice`：
  //    写入口只留 `togglePausePractice` 一个，多一条出口就多一种「暂停态与计时器
  //    不同步」的坏法（铁律 12：同一「量」不许两份判定）。
  return {
    timeLeft,
    /** 外部改写剩余时间（会同时重设倒计时基准，见 `setTimeLeftAndResync`） */
    setTimeLeft: setTimeLeftAndResync,
    isPracticePaused,
    togglePausePractice,
    togglePractice,
    resetPractice,
  }
}
