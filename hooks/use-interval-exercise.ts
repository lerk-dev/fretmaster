import { useState, useCallback, useRef } from 'react'

import { NOTES, INTERVALS } from '@/lib/page-theory-data'
import { normalizeNoteName, getNoteIndex } from '@/lib/page-theory-functions'
import { buildDirectionalQueueEntries, shuffle, type DirectionalQueueEntry } from '@/lib/interval-direction'
import { useAppStore } from '@/lib/store'

/**
 * 音程练习：页面级 state / ref 容器与出题逻辑。
 *
 * 从 app/page.tsx 原样搬出，逐行搬运、逻辑未改动：
 * - state：17 个 useState（含两段分散在页面里的音程状态块）
 * - ref：3 个 useRef（出题回调 ref、当前题目 ref、倒计时边沿检测 ref）
 * - 逻辑：generateIntervalExerciseQueue / generateIntervalExercise / toggleInterval
 *
 * 依赖说明：state 初值取自 store.intervalPractice.*（与页面同源，此处直接 getState()）；
 * 出题不再记录统计（统计在用户答对时由 handleMIDINoteInput 触发），
 * 原先依赖数组里的 recordPractice 是从未调用的遗留项，已剔除。
 * 页面通过解构接回同名变量，因此页面正文一行都不用改。
 */
export function useIntervalExercise() {
  const store = useAppStore.getState()

  // 音程状态
  const [rootNote, setRootNote] = useState(normalizeNoteName(store.intervalPractice.rootNote))
  const [selectedIntervals, setSelectedIntervals] = useState<number[]>(store.intervalPractice.selectedIntervals)
  const [intervalRootMode, setIntervalRootMode] = useState<"fixed" | "random">(store.intervalPractice.rootMode)
  const [findRootFirst, setFindRootFirst] = useState(store.intervalPractice.findRootFirst)
  const [addRootBack, setAddRootBack] = useState(store.intervalPractice.addRootBack)
  const [intervalPracticeStep, setIntervalPracticeStep] = useState<"root" | "interval">("root")
  const [currentIntervalExercise, setCurrentIntervalExercise] = useState<{
    rootNote: string;
    interval: { name: string; symbol: string; semitones: number };
    targetNote: string;
    allIntervals: { name: string; symbol: string; semitones: number }[];
    currentIntervalDisplay: string;
    completedIntervals: number[];
    answered: boolean;
    /**
     * 这道题该按哪个方向判（上行 / 下行）。
     * 🚨 必须**逐题**记录：`either`/`random` 下同一音程上下行都会出现，
     * 只看设置里的方向没法知道当前这题要求往哪边走。拿不到（外部注入队列）则省略，
     * 判定侧退回「只看音级」。
     */
    direction?: 'up' | 'down';
  } | null>(null)

  // 音程练习状态
  // 「显示指板」是**辅助**开关（铁律 18：先用它辅助、再关掉凭记忆找音）⇒ 不跨会话记住：
  // 从 store 取初值 ⇒ 上次会话的 true 被恢复 ⇒ 下次进来答案直接摆着（2026-10-02 真机确证）。
  const [showIntervalFretboard, setShowIntervalFretboard] = useState(false)
  const [showIntervalKeyboard, setShowIntervalKeyboard] = useState(false)
  const [intervalPracticeDuration, setIntervalPracticeDuration] = useState(store.intervalPractice.practiceDuration)
  const [intervalRandomizeOrder, setIntervalRandomizeOrder] = useState(store.intervalPractice.randomizeOrder)
  const [intervalDirection, setIntervalDirection] = useState<"up" | "down" | "random" | "either">(store.intervalPractice.direction)
  const [intervalFretboardDuration, setIntervalFretboardDuration] = useState(store.intervalPractice.fretboardDuration)
  const [intervalAutoAdvance, setIntervalAutoAdvance] = useState(store.intervalPractice.autoAdvance)
  const [intervalTimeLeft, setIntervalTimeLeft] = useState(0) // 剩余时间（秒）
  const [intervalExerciseQueue, setIntervalExerciseQueue] = useState<number[]>([]) // 音程练习队列
  const [intervalCurrentQueueIndex, setIntervalCurrentQueueIndex] = useState(0) // 当前队列索引

  const generateIntervalExerciseRef = useRef<(() => void) | null>(null)
  const currentIntervalExerciseRef = useRef(currentIntervalExercise)
  const prevIntervalTimeLeftRef = useRef(intervalTimeLeft)
  /**
   * 生成队列时的**设置指纹**（选中音程 / 方向 / 先找根音 / 打乱）。
   *
   * 队列只在「空 / 耗尽」时重建，于是练习途中改设置会出现：取消勾选的音程照样出、
   * 改了方向却还在按旧方向出题 —— 一直要到整轮跑完才生效（用户能直接看到
   * 「刚取消的大六度又出现了」）。指纹不同就重建队列、从新队列头出题。
   *
   * 初始 `null` = 队列不是本 hook 生成的（外部注入，如重置/单测），一律信任。
   */
  const queueSignatureRef = useRef<string | null>(null)

  /**
   * 当前队列每一题的**方向**（与 `intervalExerciseQueue` 一一对应）。
   *
   * 用 `queue` 的**数组身份**做归属校验：页面重置/单测注入会直接
   * `setIntervalExerciseQueue([])` 或塞一个新数组，这时身份对不上 ⇒ 视为「没有方向」，
   * 判定退回只看音级（不会拿上一轮的旧方向去卡新队列）。
   */
  const queueDirectionsRef = useRef<{
    queue: number[]
    directions: Array<'up' | 'down'>
  } | null>(null)

  const buildQueueSignature = useCallback(() => (
    `${[...selectedIntervals].sort((a, b) => a - b).join(',')}` +
    `|${intervalDirection}|${findRootFirst ? '1' : '0'}|${intervalRandomizeOrder ? '1' : '0'}`
  ), [selectedIntervals, intervalDirection, findRootFirst, intervalRandomizeOrder])

  const buildIntervalQueueEntries = useCallback((): DirectionalQueueEntry[] => {
    if (selectedIntervals.length === 0) return []

    let effectiveIntervals = [...selectedIntervals]
    if (findRootFirst) {
      effectiveIntervals = effectiveIntervals.filter(idx => idx !== 0)
    }
    if (effectiveIntervals.length === 0) return []

    // 方向映射 / 洗牌的唯一真相源在 lib/interval-direction.ts：
    // 旧实现用 (12 - s) % 12 + 半音数反查，对复合音程取到负数、且异名同音判错边
    // （2026-10-10 全仓审查 P1-1）。此处只负责「先找根音过滤」与编排。
    // 🚨 用 entries 版本：每道题要带自己的方向，判定上下行时才知道该往哪边比。
    let entries = buildDirectionalQueueEntries(effectiveIntervals, intervalDirection)

    if (intervalRandomizeOrder) {
      entries = shuffle(entries)
    }

    return entries
  }, [selectedIntervals, intervalRandomizeOrder, intervalDirection, findRootFirst])

  const generateIntervalExerciseQueue = useCallback(() => {
    const entries = buildIntervalQueueEntries()
    const queue = entries.map((entry) => entry.index)
    // 与 queue **同一个数组对象**记下方向，供 generateIntervalExercise 用身份校验取回
    queueDirectionsRef.current = { queue, directions: entries.map((entry) => entry.direction) }
    return queue
  }, [buildIntervalQueueEntries])

  const generateIntervalExercise = useCallback(() => {
    if (selectedIntervals.length === 0) return
    
    // 获取当前队列状态
    const currentQueue = intervalExerciseQueue
    const currentIndex = intervalCurrentQueueIndex
    
    let queue = currentQueue
    let nextIndex = currentIndex

    // 队列为空 / 已遍历完 / **设置已变**（见 queueSignatureRef 注释）⇒ 重建队列
    const signature = buildQueueSignature()
    const queueStale = queueSignatureRef.current !== null && queueSignatureRef.current !== signature

    if (queue.length === 0 || nextIndex >= queue.length || queueStale) {
      queue = generateIntervalExerciseQueue()
      setIntervalExerciseQueue(queue)
      queueSignatureRef.current = signature
      nextIndex = 0
      setIntervalCurrentQueueIndex(0)
    }
    
    if (queue.length === 0) return
    
    // 获取当前音程
    const intervalIndex = queue[nextIndex]
    const selectedInterval = INTERVALS[intervalIndex]
    // 本题方向：只有在队列是我们自己生成的时候才可信（见 queueDirectionsRef 注释）
    const directionPlan = queueDirectionsRef.current
    const questionDirection = directionPlan && directionPlan.queue === queue
      ? directionPlan.directions[nextIndex]
      : undefined
    
    // 随机选择根音
    let exerciseRoot = rootNote
    if (intervalRootMode === "random") {
      exerciseRoot = NOTES[Math.floor(Math.random() * NOTES.length)]
      setRootNote(exerciseRoot)
    }
    
    // 获取选中的音程对象
    const selectedIntervalObjects = selectedIntervals.map(i => INTERVALS[i])
    
    // 计算目标音符
    const rootIdx = getNoteIndex(exerciseRoot)
    const targetIndex = (rootIdx + selectedInterval.semitones) % 12
    const targetNoteName = NOTES[targetIndex]
    
    // 构建当前题目显示的音程
    // 先找根音模式: "1 3" (根音 + 音程)
    // 不先找根音模式: "3" (仅音程)
    const currentIntervalDisplay = findRootFirst ? `1 ${selectedInterval.symbol}` : selectedInterval.symbol
    // 回弹根音 = 弹完音程后**回到根音**，只该补一个「1」：
    //   不先找根音 → "X" + " 1" = "X 1"；先找根音 → "1 X" + " 1" = "1 X 1"
    // 旧实现写成 ` ${symbol} 1`，把目标音程又拼了一遍 ⇒ "b3 b3 1"（2026-10-07 用户报）。
    const rootBackDisplay = addRootBack ? ' 1' : ''
    
    setCurrentIntervalExercise({
      rootNote: exerciseRoot,
      interval: selectedInterval,
      targetNote: targetNoteName,
      allIntervals: selectedIntervalObjects,
      currentIntervalDisplay: currentIntervalDisplay + rootBackDisplay,
      completedIntervals: [] as number[],
      answered: false,
      direction: questionDirection,
    })
    
    // 重置步骤到根音
    setIntervalPracticeStep("root")
    
    // 更新队列索引
    setIntervalCurrentQueueIndex(nextIndex + 1)

    // 不在此处记录练习统计 —— 仅在用户答对时记录（见 handleMIDINoteInput）
  }, [rootNote, intervalRootMode, selectedIntervals, findRootFirst, addRootBack, intervalExerciseQueue, intervalCurrentQueueIndex, generateIntervalExerciseQueue, buildQueueSignature])

  const toggleInterval = (index: number) => {
    setSelectedIntervals(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    )
  }
  return {
    rootNote,
    setRootNote,
    selectedIntervals,
    setSelectedIntervals,
    intervalRootMode,
    setIntervalRootMode,
    findRootFirst,
    setFindRootFirst,
    addRootBack,
    setAddRootBack,
    intervalPracticeStep,
    setIntervalPracticeStep,
    currentIntervalExercise,
    setCurrentIntervalExercise,
    showIntervalFretboard,
    setShowIntervalFretboard,
    showIntervalKeyboard,
    setShowIntervalKeyboard,
    intervalPracticeDuration,
    setIntervalPracticeDuration,
    intervalRandomizeOrder,
    setIntervalRandomizeOrder,
    intervalDirection,
    setIntervalDirection,
    intervalFretboardDuration,
    setIntervalFretboardDuration,
    intervalAutoAdvance,
    setIntervalAutoAdvance,
    intervalTimeLeft,
    setIntervalTimeLeft,
    intervalExerciseQueue,
    setIntervalExerciseQueue,
    intervalCurrentQueueIndex,
    setIntervalCurrentQueueIndex,
    generateIntervalExerciseRef,
    currentIntervalExerciseRef,
    prevIntervalTimeLeftRef,
    generateIntervalExerciseQueue,
    generateIntervalExercise,
    toggleInterval,
  }
}
