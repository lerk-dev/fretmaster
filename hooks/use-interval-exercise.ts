import { useState, useCallback, useRef } from 'react'

import { NOTES, INTERVALS } from '@/lib/page-theory-data'
import { normalizeNoteName, getNoteIndex } from '@/lib/page-theory-functions'
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

  const generateIntervalExerciseQueue = useCallback(() => {
    if (selectedIntervals.length === 0) return []
    
    let effectiveIntervals = [...selectedIntervals]
    if (findRootFirst) {
      effectiveIntervals = effectiveIntervals.filter(idx => idx !== 0)
    }
    if (effectiveIntervals.length === 0) return []
    
    let queue = [...effectiveIntervals]
    
    if (intervalDirection === "down") {
      queue = queue.map(idx => {
        const interval = INTERVALS[idx]
        const downSemitones = (12 - interval.semitones) % 12
        const downIndex = INTERVALS.findIndex(i => i.semitones === downSemitones)
        return downIndex !== -1 ? downIndex : idx
      })
    } else if (intervalDirection === "random") {
      queue = queue.map(idx => {
        if (Math.random() > 0.5) {
          const interval = INTERVALS[idx]
          const downSemitones = (12 - interval.semitones) % 12
          const downIndex = INTERVALS.findIndex(i => i.semitones === downSemitones)
          return downIndex !== -1 ? downIndex : idx
        }
        return idx
      })
    } else if (intervalDirection === "either") {
      // Either 模式：上行与下行同时入队，每个音程产生两个条目
      const expanded: number[] = []
      queue.forEach(idx => {
        expanded.push(idx) // 上行
        const interval = INTERVALS[idx]
        const downSemitones = (12 - interval.semitones) % 12
        const downIndex = INTERVALS.findIndex(i => i.semitones === downSemitones)
        expanded.push(downIndex !== -1 ? downIndex : idx) // 下行
      })
      queue = expanded
    }
    
    if (intervalRandomizeOrder) {
      queue = queue.sort(() => Math.random() - 0.5)
    }
    
    return queue
  }, [selectedIntervals, intervalRandomizeOrder, intervalDirection, findRootFirst])

  const generateIntervalExercise = useCallback(() => {
    if (selectedIntervals.length === 0) return
    
    // 获取当前队列状态
    const currentQueue = intervalExerciseQueue
    const currentIndex = intervalCurrentQueueIndex
    
    let queue = currentQueue
    let nextIndex = currentIndex
    
    // 如果队列为空或已遍历完，重新生成队列
    if (queue.length === 0 || nextIndex >= queue.length) {
      queue = generateIntervalExerciseQueue()
      setIntervalExerciseQueue(queue)
      nextIndex = 0
      setIntervalCurrentQueueIndex(0)
    }
    
    if (queue.length === 0) return
    
    // 获取当前音程
    const intervalIndex = queue[nextIndex]
    const selectedInterval = INTERVALS[intervalIndex]
    
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
      answered: false
    })
    
    // 重置步骤到根音
    setIntervalPracticeStep("root")
    
    // 更新队列索引
    setIntervalCurrentQueueIndex(nextIndex + 1)

    // 不在此处记录练习统计 —— 仅在用户答对时记录（见 handleMIDINoteInput）
  }, [rootNote, intervalRootMode, selectedIntervals, findRootFirst, addRootBack, intervalExerciseQueue, intervalCurrentQueueIndex, generateIntervalExerciseQueue])

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
