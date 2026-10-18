import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { NOTES, SCALE_MODES } from '@/lib/page-theory-data'
import { generateScaleSequence, getNoteIndex, getNextKeyByMovement } from '@/lib/page-theory-functions'
import {
  isThreeNpsEligible,
  buildThreeNpsPositions,
  nextThreeNpsPositionIndex,
  threeNpsWindow,
  type ThreeNpsPosition,
  type ThreeNpsStep,
} from '@/lib/three-notes-per-string'
import type { ThreeNpsPreviewKind } from '@/lib/fretboard-cell-role'
import { createTranslator } from '@/lib/i18n'

export const THREE_NPS_SEQUENCE_ID = '3nps'

/** 音阶练习「下一题」的描述。一弦三音模式下额外带把位信息（Marathon 推进靠它） */
export type NextScaleExerciseInfo = {
  key: string
  scaleName: string
  sequence: string[]
  /** 一弦三音：下一题是「同一调同一音阶的下一个把位」时填这里 */
  threeNps?: {
    /** 0 起的把位下标（positions 数组下标） */
    positionIndex: number
    /** 显示用把位号（1 起） */
    position: number
    totalPositions: number
    /** 该把位起点的弦索引（0 = 最高音弦） */
    startStringIndex: number
    startFret: number
  } | null
}



/**
 * useScaleExercise —— 音阶练习域（含一弦三音 3NPS）的唯一真相源。
 *
 * 与 `use-interval-exercise` / `use-chord-exercise` 对齐的第三个练习域 hook。
 * 装的东西：
 * - 音阶选择 state（调 / 音阶 / 方向 / 根音移动 / 练习序列形态）
 * - 出题：generateScaleExercise / nextScaleExercise（3NPS 时按 Marathon 推进把位）
 * - 3NPS：把位装载（applyThreeNpsPosition）与四个视图快照（threeNpsView 等）
 * - 连击：scaleComboRef / scaleMaxComboRef —— 判定路径（音频 / MIDI）经 ref 记账再同步 state
 *   （updater 必须纯，铁律 3：不能在 setState updater 里更新 maxCombo）
 *
 * ## 判定路径怎么消费本域（勿改形态）
 *
 * 音频 / MIDI / 点击三条判定路径都**不直接 import 本 hook**，而是经页面解构出去的 refs
 * （scaleKeyRef / scaleExerciseSequenceRef / scaleExerciseCurrentStepRef / selectedScaleRef /
 * scaleComboRef / scaleMaxComboRef / nextScaleExerciseRef）—— ref 身份恒定，判定回调的
 * deps 不用跟着 state 变。换音阶不能重建判定回调（会打断正在跑的音频处理循环）。
 *
 * ## 有意改动（与逐字原文的差异）
 *
 * 1. 原页面的「合并镜像 effect」里 4 行音阶 ref 镜像拆成独立 effect（语义等价，
 *    见下方注释）；deps 相应收窄。
 * 2. `nextScaleExerciseRef.current = nextScaleExercise` 从页面的合并 ref effect 挪进来。
 * 3. 页面里 `setThreeNps*` 三个 setter 不再对外 —— 只有本 hook 内部的装载函数会写。
 */

export interface UseScaleExerciseOptions {
  /** 指板调弦（buildThreeNpsPositions 按它算每根弦的空弦音高） */
  tuning: number[]
  fretCount: number
  t: ReturnType<typeof createTranslator>
}

export function useScaleExercise(options: UseScaleExerciseOptions) {
  const { tuning, fretCount, t } = options

  // 音阶状态
  const [scaleKey, setScaleKey] = useState("C")
  const [isScaleKeyRandom, setIsScaleKeyRandom] = useState(false)
  const [selectedScaleCategory, setSelectedScaleCategory] = useState<keyof typeof SCALE_MODES>("pentatonic")
  const [selectedScale, setSelectedScale] = useState(SCALE_MODES.pentatonic[0])
  const [selectedScales, setSelectedScales] = useState<typeof SCALE_MODES.basic>([SCALE_MODES.pentatonic[0]])
  const [scaleDirection, setScaleDirection] = useState<"up" | "down" | "up_down" | "random">("up")
  const [scaleRootMovement, setScaleRootMovement] = useState<"static" | "random" | "upSemiTone" | "downSemiTone" | "circleOfFifths" | "circleOfFourths">("static")
  const [showScaleFretboard, setShowScaleFretboard] = useState(false)
  const [scalePracticeSequence, setScalePracticeSequence] = useState<string>("1to1")
  const [scaleExerciseSequence, setScaleExerciseSequence] = useState<string[]>([])
  const [scaleExerciseCurrentStep, setScaleExerciseCurrentStep] = useState(0)
  const [showScaleStructure, setShowScaleStructure] = useState(false)
  const [showScaleKeyboard, setShowScaleKeyboard] = useState(false)
  const [nextScaleExerciseInfo, setNextScaleExerciseInfo] = useState<NextScaleExerciseInfo | null>(null)
  // 一弦三音（3NPS）：当前把位指型 / 把位下标 / 连击。
  // 序列本身仍走 scaleExerciseSequence（音级标签），这样匹配路径不用改。
  const [threeNpsPositions, setThreeNpsPositions] = useState<ThreeNpsPosition[]>([])
  const [threeNpsPositionIndex, setThreeNpsPositionIndex] = useState(0)
  const [threeNpsSteps, setThreeNpsSteps] = useState<ThreeNpsStep[]>([])
  const [scaleCombo, setScaleCombo] = useState(0)
  const [scaleMaxCombo, setScaleMaxCombo] = useState(0)
  const nextScaleExerciseRef = useRef<(() => void) | null>(null)
  // 状态refs - 判定路径（音频 / MIDI / 点击）经 ref 读最新音阶状态
  const scaleKeyRef = useRef(scaleKey)
  const scaleExerciseSequenceRef = useRef(scaleExerciseSequence)
  const scaleExerciseCurrentStepRef = useRef(scaleExerciseCurrentStep)
  // 当前音阶对象也要进 ref：麦克风匹配回调需要它做「音级 → 半音」解析，
  // 但不能把它放进 useCallback 依赖 —— 换音阶会重建回调，打断正在跑的音频处理循环。
  const selectedScaleRef = useRef(selectedScale)
  // 一弦三音连击：用 ref 记账再同步进 state。
  // 不能在 setState updater 里更新 maxCombo —— updater 必须是纯函数（StrictMode 会双调用）。
  const scaleComboRef = useRef(0)
  const scaleMaxComboRef = useRef(0)
  // 音阶域 4 个 ref 的镜像。原先在页面的「合并镜像 effect」里（一次更新十几个 ref）；
  // 拆出来后按各自的 state 分开镜像 —— ref 镜像的正确性只要求「读取时是最新值」，
  // 分开镜像语义等价且 deps 更精确。
  useEffect(() => {
    scaleKeyRef.current = scaleKey
    scaleExerciseSequenceRef.current = scaleExerciseSequence
    scaleExerciseCurrentStepRef.current = scaleExerciseCurrentStep
    selectedScaleRef.current = selectedScale
  }, [scaleKey, scaleExerciseSequence, scaleExerciseCurrentStep, selectedScale])

  // ==================== 一弦三音（3NPS）====================
  // 练习序列选「一弦3音」时启用。算法来自 guitarrun.com 的 3NPS Marathon，
  // 生成器在 lib/three-notes-per-string.ts（含参考表与差分对照测试），
  // 逆向过程见 guitarrun-3nps-analysis.md。
  //
  // 关键设计：**序列仍然只用「音级标签」表达**（scaleExerciseSequence），
  // 匹配路径因此完全不用改；把位信息（弦/品）另存在 threeNpsSteps 里，只供显示与指板高亮。
  // Marathon 的推进也不需要单独的循环 —— 它只是「下一题 = 同一调同音阶的下一个把位」。
  const isThreeNpsMode = scalePracticeSequence === THREE_NPS_SEQUENCE_ID
  /** 一弦三音只支持七声音阶；从已选音阶里筛出可用的 */
  const threeNpsEligibleScales = useMemo(
    () => selectedScales.filter((s) => isThreeNpsEligible(s.notes)),
    [selectedScales]
  )
  const isThreeNpsActive = isThreeNpsMode && threeNpsEligibleScales.length > 0

  /** 生成某调 + 某音阶的七个把位（品数太小导致把所有音都截掉时返回空） */
  const buildThreeNpsFor = useCallback((
    key: string,
    scale: { name: string; notes: number[]; intervals: string[] }
  ): ThreeNpsPosition[] => {
    return buildThreeNpsPositions({
      rootPitchClass: getNoteIndex(key),
      intervals: scale.notes,
      degreeLabels: scale.intervals,
      tuning,
      maxFret: fretCount,
    })
  }, [tuning, fretCount])

  /** 把某个把位装载成当前题目：序列 = 该把位 35 步的音级标签（上行 + 下行） */
  const applyThreeNpsPosition = useCallback((
    positions: ThreeNpsPosition[],
    positionIndex: number
  ): ThreeNpsPosition | null => {
    if (positions.length === 0) return null
    const idx = Math.max(0, Math.min(positionIndex, positions.length - 1))
    const position = positions[idx]
    if (!position || position.steps.length === 0) return null
    setThreeNpsPositions(positions)
    setThreeNpsPositionIndex(idx)
    setThreeNpsSteps(position.steps)
    setScaleExerciseSequence(position.steps.map((s) => s.degreeLabel))
    setScaleExerciseCurrentStep(0)
    return position
  }, [])

  /**
   * 计算「下一题」。
   *
   * 一弦三音时优先**同一调、同一音阶的下一个把位** —— 这就是 Marathon；
   * 七个把位都跑完了才换调/换音阶并把位回 1（GuitarRun 的 `ye()` 也是跑到 7 才收尾）。
   */
  const computeNextScaleExerciseInfo = useCallback((
    key: string,
    scale: { name: string; notes: number[]; intervals: string[] },
    positionIndex: number
  ): NextScaleExerciseInfo => {
    if (isThreeNpsActive) {
      const positions = buildThreeNpsFor(key, scale)
      const nextIdx = nextThreeNpsPositionIndex(positionIndex, positions.length)
      if (nextIdx !== null) {
        const position = positions[nextIdx]
        const first = position.steps[0]
        return {
          key,
          scaleName: scale.name,
          sequence: position.steps.map((s) => s.degreeLabel),
          threeNps: {
            positionIndex: nextIdx,
            position: position.index,
            totalPositions: positions.length,
            startStringIndex: first.stringIndex,
            startFret: first.fret,
          },
        }
      }
      // 跑完七个把位 ⇒ 换调/换音阶，把位回到第一个可用把位
      const nextKey = isScaleKeyRandom
        ? NOTES[Math.floor(Math.random() * NOTES.length)]
        : getNextKeyByMovement(key, scaleRootMovement)
      const pool = threeNpsEligibleScales
      const nextScale = pool[Math.floor(Math.random() * pool.length)] ?? scale
      const nextPositions = buildThreeNpsFor(nextKey, nextScale)
      const firstPos = nextPositions[0]
      return {
        key: nextKey,
        scaleName: nextScale.name,
        sequence: firstPos ? firstPos.steps.map((s) => s.degreeLabel) : [],
        threeNps: firstPos
          ? {
              positionIndex: 0,
              position: firstPos.index,
              totalPositions: nextPositions.length,
              startStringIndex: firstPos.steps[0].stringIndex,
              startFret: firstPos.steps[0].fret,
            }
          : null,
      }
    }

    const nextKey = isScaleKeyRandom
      ? NOTES[Math.floor(Math.random() * NOTES.length)]
      : getNextKeyByMovement(key, scaleRootMovement)
    const nextScale = selectedScales[Math.floor(Math.random() * selectedScales.length)] ?? scale
    return {
      key: nextKey,
      scaleName: nextScale.name,
      sequence: generateScaleSequence(nextScale, scalePracticeSequence, scaleDirection),
    }
  }, [isThreeNpsActive, buildThreeNpsFor, threeNpsEligibleScales, isScaleKeyRandom, scaleRootMovement, selectedScales, scalePracticeSequence, scaleDirection])

  // 生成音阶练习序列 - 参考 F:\新建文件夹\吉他指板视觉化练习工具.html
  const generateScaleExercise = useCallback(() => {
    if (selectedScales.length === 0) return
    
    let currentKey = scaleKey
    if (isScaleKeyRandom) {
      currentKey = NOTES[Math.floor(Math.random() * NOTES.length)]
      setScaleKey(currentKey)
    }

    // 一弦三音：从七声音阶里选一个，装载第 1 个把位
    if (isThreeNpsActive) {
      const scale = threeNpsEligibleScales[Math.floor(Math.random() * threeNpsEligibleScales.length)]
      setSelectedScale(scale)
      const position = applyThreeNpsPosition(buildThreeNpsFor(currentKey, scale), 0)
      if (position) {
        setNextScaleExerciseInfo(computeNextScaleExerciseInfo(currentKey, scale, 0))
        return
      }
    }

    const randomScale = selectedScales[Math.floor(Math.random() * selectedScales.length)]
    setSelectedScale(randomScale)
    // 退出 3NPS（或 3NPS 不可用）时清掉把位快照，避免指板继续按旧把位高亮
    setThreeNpsPositions([])
    setThreeNpsSteps([])
    setThreeNpsPositionIndex(0)

    const intervals = generateScaleSequence(randomScale, scalePracticeSequence, scaleDirection)
    setScaleExerciseSequence(intervals)
    setScaleExerciseCurrentStep(0)

    setNextScaleExerciseInfo(computeNextScaleExerciseInfo(currentKey, randomScale, 0))

    // 不在此处记录练习统计 —— 仅在用户答对时记录（见 handleMIDINoteInput）
  }, [selectedScales, scalePracticeSequence, scaleDirection, isScaleKeyRandom, scaleKey, isThreeNpsActive, threeNpsEligibleScales, buildThreeNpsFor, applyThreeNpsPosition, computeNextScaleExerciseInfo])

  // 下一音阶练习
  const nextScaleExercise = useCallback(() => {
    if (nextScaleExerciseInfo) {
      setScaleKey(nextScaleExerciseInfo.key)
      const scale = selectedScales.find(s => s.name === nextScaleExerciseInfo.scaleName) || selectedScales[0]
      setSelectedScale(scale)

      if (isThreeNpsActive) {
        // 跑完 P7 时 threeNps 是 null ⇒ 换调换音阶、把位回到 0；否则就是「下一个把位」
        const targetIndex = nextScaleExerciseInfo.threeNps?.positionIndex ?? 0
        const position = applyThreeNpsPosition(buildThreeNpsFor(nextScaleExerciseInfo.key, scale), targetIndex)
        if (position) {
          // Marathon 收尾：上一题是最后一个把位，本题已经跨到新调/新音阶
          if (!nextScaleExerciseInfo.threeNps) {
            toast.success(t('three_nps_marathon_complete'))
          }
          setNextScaleExerciseInfo(computeNextScaleExerciseInfo(nextScaleExerciseInfo.key, scale, targetIndex))
          return
        }
      }

      setThreeNpsPositions([])
      setThreeNpsSteps([])
      setThreeNpsPositionIndex(0)
      setScaleExerciseSequence(nextScaleExerciseInfo.sequence)
      setScaleExerciseCurrentStep(0)

      setNextScaleExerciseInfo(computeNextScaleExerciseInfo(nextScaleExerciseInfo.key, scale, 0))
    } else {
      generateScaleExercise()
    }
  }, [nextScaleExerciseInfo, selectedScales, generateScaleExercise, isThreeNpsActive, buildThreeNpsFor, applyThreeNpsPosition, computeNextScaleExerciseInfo, t])

  // ==================== 一弦三音：视图快照 ====================
  /** 当前把位的「弦-品」索引 → 指板高亮查表 */
  const threeNpsCellKeys = useMemo(() => {
    const map = new Map<string, ThreeNpsStep>()
    if (!isThreeNpsActive) return map
    for (const step of threeNpsSteps) map.set(`${step.stringIndex}-${step.fret}`, step)
    return map
  }, [isThreeNpsActive, threeNpsSteps])

  /** 设置面板的把位按钮：数组下标（回传） + 把位号（显示）。把位号可能跳号（见 props 注释） */
  const threeNpsPositionOptions = useMemo(
    () => threeNpsPositions.map((p, i) => ({ index: i, position: p.index })),
    [threeNpsPositions]
  )

  /** 当前目标音（弦 + 品 + 音级）；非 3NPS 或已跑完时为 null */
  const threeNpsTarget = isThreeNpsActive ? (threeNpsSteps[scaleExerciseCurrentStep] ?? null) : null

  /** 给 ScaleSequenceDisplay 的只读快照（滑窗已在纯函数里算好） */
  const threeNpsView = useMemo(() => {
    if (!isThreeNpsActive) return null
    const position = threeNpsPositions[threeNpsPositionIndex]
    if (!position || threeNpsSteps.length === 0) return null
    const target = threeNpsSteps[scaleExerciseCurrentStep] ?? null
    const win = threeNpsWindow(threeNpsSteps, scaleExerciseCurrentStep)
    return {
      position: position.index,
      totalPositions: threeNpsPositions.length,
      combo: scaleCombo,
      maxCombo: scaleMaxCombo,
      direction: target?.direction ?? ('up' as const),
      isShift: !!target?.isShift,
      stepNow: scaleExerciseCurrentStep + 1,
      stepTotal: threeNpsSteps.length,
      target: target
        ? {
            label: target.degreeLabel,
            note: NOTES[target.pitchClass] ?? '',
            stringIndex: target.stringIndex,
            fret: target.fret,
            isRoot: target.isRoot,
          }
        : null,
      window: win.items.map((item) => ({
        label: item.item.degreeLabel,
        done: item.done,
        current: item.current,
      })),
    }
  }, [isThreeNpsActive, threeNpsPositions, threeNpsPositionIndex, threeNpsSteps, scaleExerciseCurrentStep, scaleCombo, scaleMaxCombo])

  /** 下一把位预览（Marathon 换把前先看一眼落点） */
  const nextThreeNpsView = isThreeNpsActive && nextScaleExerciseInfo?.threeNps
    ? {
        position: nextScaleExerciseInfo.threeNps.position,
        totalPositions: nextScaleExerciseInfo.threeNps.totalPositions,
        startStringIndex: nextScaleExerciseInfo.threeNps.startStringIndex,
        startFret: nextScaleExerciseInfo.threeNps.startFret,
      }
    : null

  /**
   * 指板上的「下一把位预览」：只在**当前把位已跑完、且下一把位已知**时给出。
   *
   * 为什么不常驻显示：GuitarRun 把预览绑在「换把倒计时」这个中断点上（`be()` 里给 5 拍排练时间），
   * 我们的一弦三音是切题式的、没有那个倒计时窗口。真正与之等价的时机只有一个 —— 当前把位
   * 35 步弹完、界面停在那里等「下一题」的时候。此时把下一把位画出来，正好承担了
   * 「换把前先看一眼落点」的作用；其余时刻显示会干扰对当前把位的辨认。
   */
  const nextThreeNpsCells = useMemo(() => {
    const map = new Map<string, ThreeNpsPreviewKind>()
    if (!isThreeNpsActive || threeNpsTarget) return map
    const next = nextScaleExerciseInfo?.threeNps
    if (!next) return map
    const position = buildThreeNpsFor(scaleKey, selectedScale)[next.positionIndex]
    if (!position) return map
    const startKey = `${next.startStringIndex}-${next.startFret}`
    for (const step of position.steps) {
      const key = `${step.stringIndex}-${step.fret}`
      map.set(key, key === startKey ? 'start' : step.isRoot ? 'root' : 'note')
    }
    return map
  }, [isThreeNpsActive, threeNpsTarget, nextScaleExerciseInfo, buildThreeNpsFor, scaleKey, selectedScale])

  /**
   * 在设置面板里手动选把位：直接装载该把位（序列重置到第 1 步）。
   * 「下一题」也一并跟着改，否则跑完当前把位会跳到「手动选之前」的那个把位。
   */
  const handleThreeNpsPositionChange = useCallback((positionIndex: number) => {
    const positions = buildThreeNpsFor(scaleKey, selectedScale)
    if (positions.length === 0) return
    const idx = Math.max(0, Math.min(positionIndex, positions.length - 1))
    if (!applyThreeNpsPosition(positions, idx)) return
    setNextScaleExerciseInfo(computeNextScaleExerciseInfo(scaleKey, selectedScale, idx))
  }, [buildThreeNpsFor, scaleKey, selectedScale, applyThreeNpsPosition, computeNextScaleExerciseInfo])
  // nextScaleExercise 声明在上面的 useCallback 里、判定回调在页面里声明得更早，
  // 经 ref 中转供判定路径调用（与 handleMIDINoteInputRef 同一手法）。
  useEffect(() => {
    nextScaleExerciseRef.current = nextScaleExercise
  }, [nextScaleExercise])

  return {
    scaleKey, setScaleKey,
    isScaleKeyRandom, setIsScaleKeyRandom,
    selectedScaleCategory, setSelectedScaleCategory,
    selectedScale, setSelectedScale,
    selectedScales, setSelectedScales,
    scaleDirection, setScaleDirection,
    scaleRootMovement, setScaleRootMovement,
    showScaleFretboard, setShowScaleFretboard,
    scalePracticeSequence, setScalePracticeSequence,
    scaleExerciseSequence, setScaleExerciseSequence,
    scaleExerciseCurrentStep, setScaleExerciseCurrentStep,
    showScaleStructure, setShowScaleStructure,
    showScaleKeyboard, setShowScaleKeyboard,
    nextScaleExerciseInfo, setNextScaleExerciseInfo,
    threeNpsPositionIndex,
    setScaleCombo,
    setScaleMaxCombo,
    isThreeNpsActive,
    threeNpsView, nextThreeNpsView,
    threeNpsCellKeys, threeNpsTarget,
    threeNpsPositionOptions, nextThreeNpsCells,
    handleThreeNpsPositionChange,
    generateScaleExercise, nextScaleExercise,
    nextScaleExerciseRef,
    scaleKeyRef, scaleExerciseSequenceRef, scaleExerciseCurrentStepRef,
    selectedScaleRef, scaleComboRef, scaleMaxComboRef,
  }
}
