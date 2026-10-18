import { useCallback } from 'react'
import { logger } from '@/lib/logger'
import { confirmNote } from '@/lib/note-confirm'
import { evaluatePitchMatch, findBestIntervalMatch, targetSemitoneOf } from '@/lib/pitch-match'
import { scoreDeltaFor } from '@/lib/answer-judge'
import {
  noteToSemitones,
  intervalToSemitones,
  resolveScaleDegreeSemitone,
  getChordDegrees,
  applyVoiceLeading,
} from '@/lib/page-theory-functions'
import type { DetectedPitchForMatch } from '@/hooks/use-audio-input'
import type { NoteConfirmState } from '@/lib/note-confirm'

/**
 * usePracticeMatch —— 音频答题路径（processPracticeMatch）的唯一真相源。
 *
 * 五个模式（practice / interval / scale / chord_exercise / chord）的判定 + 计分 + 推进 + 冷却。
 * 判定口径在 `lib/answer-judge.ts`（计分/统计）与 `lib/pitch-match.ts`（音分差匹配）——
 * 本 hook 只是它们的音频侧消费者，**不许在这里手写候选循环或自算 delta**。
 *
 * ## 三条答题路径的共享约定（勿改形态）
 *
 * 音频（本 hook）/ MIDI（页面 handleMIDINoteInput）/ 点击（页面 handleFretClick）三条路径
 * 共用同一批 ref：冷却（cooldownRef / isCoolingDownRef）、多帧确认（noteConfirmStateRef）、
 * 音阶连击（scaleComboRef / scaleMaxComboRef）。它们必须与收音链路**共用同一份**
 * （冷却期与多帧确认的记忆不能各建一份），故只能经 options 传进来 —— ref 身份恒定。
 *
 * ## 与逐字原文的差异
 *
 * 1. 原函数尾部有一段 `eslint-disable-next-line react-hooks/exhaustive-deps` + 只列了一半的
 *    deps。已删除，deps **照实写全**（45 项）—— 所有 ref/setter 身份恒定，写全只影响
 *    useCallback 的重建频率，无行为差异（同 C2 修掉 startAudioInput 的「deps 谎言」）。
 * 2. `cooldownRef` 的 800ms 冷却、各分支的推进目标全部逐字保留。
 *
 * 调用点必须在 `useAudioInput` **之后**：noteConfirmStateRef / cooldownRef / isCoolingDownRef
 * 来自它的返回值（C2 的装配顺序，护栏 hooks-deps-safety.test.ts）。
 */

export interface UsePracticeMatchOptions {
  // ---- 运行时镜像（身份恒定，回调经 ref 读最新值） ----
  isPlayingRef: { current: boolean }
  activeTabRef: { current: string }
  sensitivityRef: { current: number }
  confidenceThresholdRef: { current: number }
  /** 冷却 / 多帧确认：必须与收音链路共用**同一份**（同对象），见文件头 */
  isCoolingDownRef: { current: boolean }
  cooldownRef: { current: ReturnType<typeof setTimeout> | null }
  noteConfirmStateRef: { current: NoteConfirmState | null }
  practiceAnswerModeRef: { current: 'fretboard' | 'buttons' }
  targetNoteRef: { current: string | null }
  generateNewTargetRef: { current: (() => void) | null }
  currentIntervalExerciseRef: { current: IntervalExercise | null }
  findRootFirstRef: { current: boolean }
  addRootBackRef: { current: boolean }
  scaleKeyRef: { current: string }
  scaleExerciseSequenceRef: { current: string[] }
  scaleExerciseCurrentStepRef: { current: number }
  selectedScaleRef: { current: { name: string; notes: number[]; intervals: string[] } }
  scaleComboRef: { current: number }
  scaleMaxComboRef: { current: number }
  nextScaleExerciseRef: { current: (() => void) | null }
  chordExerciseTargetChordRef: { current: { root: string; type: string } | null }
  chordExerciseSequenceRef: { current: string[] }
  chordExerciseCurrentStepRef: { current: number }
  chordExerciseIsAnsweredRef: { current: boolean }
  nextChordExerciseRef: { current: (() => void) | null }
  /** chord 分支跑完一道题时调的「下一题」（页面 nextChord） */
  nextChordRef: { current: (() => void) | null }
  currentChordIndexRef: { current: number }
  chordDegreeCurrentStepRef: { current: number }
  practiceLevelRef: { current: string }
  levelOptionsRef: { current: LevelOptions }
  shouldVoiceLeadRef: { current: boolean }
  nextChordInfoRef: { current: { index: number; root: string; type: string; bass?: string; degrees: string[] } | null }
  lastChordNoteRef: { current: string | null }
  getTransposedChordsRef: { current: (() => { root: string; type: string }[]) | null }
  generateIntervalExerciseRef: { current: (() => void) | null }

  // ---- 动作 / setter ----
  recordPositionStat: (isCorrect: boolean) => void
  setScore: (fn: (prev: { correct: number; total: number }) => { correct: number; total: number }) => void
  setCurrentIntervalExercise: (v: IntervalExercise | null) => void
  setIntervalPracticeStep: (v: 'root' | 'interval') => void
  setScaleCombo: (v: number) => void
  setScaleMaxCombo: (v: number) => void
  setScaleExerciseCurrentStep: (v: number) => void
  setChordExerciseIsAnswered: (v: boolean) => void
  setChordExerciseCurrentStep: (v: number) => void
  setChordDegreeCurrentStep: (v: number) => void
  triggerCorrectFeedback: (note: string) => void
}

/** 音程题的形状（与 use-interval-exercise 的 useState 泛型逐字一致） */
interface IntervalExercise {
  rootNote: string
  interval: { name: string; symbol: string; semitones: number }
  targetNote: string
  allIntervals: { name: string; symbol: string; semitones: number }[]
  currentIntervalDisplay: string
  completedIntervals: number[]
  answered: boolean
}

/** 出题的 level 选项（页面 getLevelOptions 的返回形状） */
interface LevelOptions {
  forceNaturalFive: boolean
  endOnStartingInterval: boolean
  usePassingNoteBebopScale: boolean
  sevenFlatNineScaleChoice: 'altered' | 'diminishedWholeHalf' | 'diminishedHalfWhole'
}

export function usePracticeMatch(options: UsePracticeMatchOptions) {
  const {
    isPlayingRef,
    activeTabRef,
    sensitivityRef,
    confidenceThresholdRef,
    isCoolingDownRef,
    cooldownRef,
    noteConfirmStateRef,
    practiceAnswerModeRef,
    targetNoteRef,
    generateNewTargetRef,
    currentIntervalExerciseRef,
    setCurrentIntervalExercise,
    setIntervalPracticeStep,
    generateIntervalExerciseRef,
    findRootFirstRef,
    addRootBackRef,
    scaleKeyRef,
    scaleExerciseSequenceRef,
    scaleExerciseCurrentStepRef,
    selectedScaleRef,
    scaleComboRef,
    scaleMaxComboRef,
    setScaleCombo,
    setScaleMaxCombo,
    setScaleExerciseCurrentStep,
    nextScaleExerciseRef,
    chordExerciseTargetChordRef,
    chordExerciseSequenceRef,
    chordExerciseCurrentStepRef,
    chordExerciseIsAnsweredRef,
    setChordExerciseIsAnswered,
    setChordExerciseCurrentStep,
    nextChordExerciseRef,
    nextChordRef,
    currentChordIndexRef,
    chordDegreeCurrentStepRef,
    setChordDegreeCurrentStep,
    practiceLevelRef,
    levelOptionsRef,
    shouldVoiceLeadRef,
    nextChordInfoRef,
    lastChordNoteRef,
    getTransposedChordsRef,
    recordPositionStat,
    setScore,
    triggerCorrectFeedback,
  } = options

  const processPracticeMatch = useCallback(({ frequency, note, probability, isNoteOnset, rawFrequency, frameMs }: DetectedPitchForMatch) => {
    const currentIsPlaying = isPlayingRef.current
    const currentActiveTab = activeTabRef.current
    const currentSensitivity = sensitivityRef.current || 0.5
    const currentConfidenceThreshold = confidenceThresholdRef.current || 0.8

    if (!currentIsPlaying || !note) return
    if (isCoolingDownRef.current) return

    // 两级前置滤波：起音清空记忆 + 连续 N 帧同音才放行（见 lib/note-confirm.ts）。
    // 位置很关键 —— 必须排在冷却检查**之后**：confirmNote 一旦放行就会写入 firedNote，
    // 若此时才因冷却被挡掉，这次放行就被白白吃掉，同一个音要等到换音或下次起音才能再放行。
    if (!confirmNote(
      { frequency: rawFrequency ?? frequency, isNoteOnset: !!isNoteOnset, frameMs },
      noteConfirmStateRef.current!
    )) return

    // 根据练习模式处理 - 完全按照原HTML的processAudio逻辑
    if (currentActiveTab === 'practice') {
      // 找音练习 - 辨音模式下通过按钮答题，不自动匹配（与 Web 路径一致）
      if (practiceAnswerModeRef.current === 'buttons') return
      // 找音练习 - 使用音分差匹配
      const currentTargetNote = targetNoteRef.current
      if (!currentTargetNote) return

      const targetSemitone = noteToSemitones[currentTargetNote] || 0

      // 判定逻辑见 lib/pitch-match.ts（行为等价矩阵见 __tests__/pitch-match.test.ts）
      const { matched, adjustedCents } = evaluatePitchMatch({
        frequency,
        probability,
        targetSemitone,
        // 找音练习只需命中"这个音"，没有根音/其他音级之分 → degree 传 null（门限 25）
        degree: null,
        sensitivity: currentSensitivity,
        confidenceThreshold: currentConfidenceThreshold,
      })

      // 🚨 计分与逐位置统计都必须**命中/未命中各记一次**。
      //    口径见 `lib/answer-judge.ts::scoreDeltaFor`（答错也进分母）与
      //    `recordPositionStat(isCorrect)`（它记的是「这一次判定」）。
      //    此前这里写成 `if (matched) { recordPositionStat(true); setScore(+1/+1) }` ——
      //    两个后果都是静默的：Mic 用户的正确率恒 100%（分母只有命中），
      //    且逐位置掌握度永远不会出现「未掌握」。而 MIDI 路径两条都记（见
      //    `handleMIDINoteInput` 的 practice 分支）⇒ 同一件事两种统计口径。
      recordPositionStat(matched)
      const practiceDelta = scoreDeltaFor(matched)
      setScore(prev => ({ correct: prev.correct + practiceDelta.correct, total: prev.total + practiceDelta.total }))
      if (matched) {
        logger.debug('找音练习匹配成功:', note, '音分差:', adjustedCents.toFixed(1))
        isCoolingDownRef.current = true
        triggerCorrectFeedback(note)
        if (generateNewTargetRef.current) {
          generateNewTargetRef.current()
        }
        cooldownRef.current = setTimeout(() => {
          isCoolingDownRef.current = false
          cooldownRef.current = null
        }, 800)
      }
    } else if (currentActiveTab === 'interval') {
      // 音程练习 - 使用音分差匹配
      const exercise = currentIntervalExerciseRef.current
      if (!exercise || exercise.answered) return

      const rootNoteValue = exercise.rootNote

      // 使用 currentIntervalDisplay（先找根音模式包含 '1'）以与点击/MIDI 路径一致
      const intervals = exercise.currentIntervalDisplay.split(' ')

      // 候选里挑"最准的一个"的逻辑见 lib/pitch-match.ts 的 findBestIntervalMatch
      const { matchedIndex, bestCents: minCents } = findBestIntervalMatch({
        frequency,
        probability,
        rootSemitone: noteToSemitones[rootNoteValue] || 0,
        degrees: intervals,
        completedIndexes: exercise.completedIntervals,
        findRootFirst: findRootFirstRef.current,
        sensitivity: currentSensitivity,
        confidenceThreshold: currentConfidenceThreshold,
        // 候选半音优先取题目自带的音级表 —— 与 MIDI / 点击路径同一来源
        allIntervals: exercise.allIntervals,
      })

      if (matchedIndex !== null) {
        const matchedInterval = intervals[matchedIndex]
        logger.debug('音程练习匹配成功:', matchedInterval, '音分差:', minCents.toFixed(1))
        triggerCorrectFeedback(note)
        const newCompletedIntervals = [...exercise.completedIntervals, matchedIndex]

        if (newCompletedIntervals.length >= intervals.length) {
          setCurrentIntervalExercise({ ...exercise, completedIntervals: newCompletedIntervals, answered: true })
          const delta = scoreDeltaFor(true)
          setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
          if (addRootBackRef.current && matchedInterval !== '1') {
            setIntervalPracticeStep('root')
          } else if (generateIntervalExerciseRef.current) {
            generateIntervalExerciseRef.current()
          }
        } else {
          setCurrentIntervalExercise({ ...exercise, completedIntervals: newCompletedIntervals })
          if (findRootFirstRef.current && matchedInterval === '1') {
            setIntervalPracticeStep('interval')
          } else if (addRootBackRef.current && matchedInterval !== '1') {
            setIntervalPracticeStep('root')
          }
        }
      } else {
        // 答错了 —— 口径见 `lib/answer-judge.ts::scoreDeltaFor`（答错也进分母）。
        // 音程模式只在**整题完成**时计正分（与 MIDI 路径一致），未命中则记一次失败。
        const delta = scoreDeltaFor(false)
        setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
      }
    } else if (currentActiveTab === 'scale') {
      // 音阶练习 - 使用音分差匹配
      const sequence = scaleExerciseSequenceRef.current
      const step = scaleExerciseCurrentStepRef.current
      const key = scaleKeyRef.current

      if (sequence.length === 0 || step >= sequence.length) return

      const currentDegree = sequence[step]
      // 🚨 与点击 / MIDI 两条路径共用同一个真相源。这里原先直接用 `intervalToSemitones`，
      // 那张表**缺 `#2` 和 `maj7`** ⇒ 含它们的音阶（Altered / Lydian #9 /
      // Lydian Augmented #2 / Diminished Half Whole / Augmented Scale）解析出
      // `undefined` ⇒ 下面 `return` ⇒ **弹对了没反应，且不报错**。
      // 另外它对 `#6` 记的是 9，而 Whole Tone / Augmented Scale 里的 `#6` 是 10
      // ⇒ 要求弹低半音的那个音（练习照常推进，只是判错，比上面更隐蔽）。
      const semitone = resolveScaleDegreeSemitone(selectedScaleRef.current, currentDegree)
      if (semitone === undefined) return

      const targetSemitone = targetSemitoneOf(noteToSemitones[key] || 0, semitone)

      const { matched, adjustedCents } = evaluatePitchMatch({
        frequency,
        probability,
        targetSemitone,
        degree: currentDegree,
        sensitivity: currentSensitivity,
        confidenceThreshold: currentConfidenceThreshold,
      })

      if (matched) {
        logger.debug('音阶练习匹配成功:', note, '度数:', currentDegree, '音分差:', adjustedCents.toFixed(1))
        triggerCorrectFeedback(note)
        // 连击：与 MIDI 路径**同一口径**（ref 记账 + 同步 state，供一弦三音面板显示）。
        // 此前只有 MIDI 路径记账 ⇒ 用麦克风做音阶练习时连击恒为 0、最高连击恒为 0。
        scaleComboRef.current += 1
        setScaleCombo(scaleComboRef.current)
        if (scaleComboRef.current > scaleMaxComboRef.current) {
          scaleMaxComboRef.current = scaleComboRef.current
          setScaleMaxCombo(scaleComboRef.current)
        }
        const nextStep = step + 1
        if (nextStep >= sequence.length) {
          const delta = scoreDeltaFor(true)
          setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
          if (nextScaleExerciseRef.current) {
            nextScaleExerciseRef.current()
          }
        } else {
          setScaleExerciseCurrentStep(nextStep)
          const delta = scoreDeltaFor(true)
          setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
        }
      } else {
        // 答错了 —— 连击归零 + 计一次失败（与 MIDI 路径同一口径）
        scaleComboRef.current = 0
        setScaleCombo(0)
        const delta = scoreDeltaFor(false)
        setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
      }
    } else if (currentActiveTab === 'chord_exercise') {
      // 和弦练习 - 使用音分差匹配
      const targetChord = chordExerciseTargetChordRef.current
      const sequence = chordExerciseSequenceRef.current
      const step = chordExerciseCurrentStepRef.current

      if (!targetChord || sequence.length === 0 || step >= sequence.length) return
      if (chordExerciseIsAnsweredRef.current) return

      const currentDegree = sequence[step]
      const semitone = intervalToSemitones[currentDegree]
      if (semitone === undefined) return

      const targetSemitone = targetSemitoneOf(noteToSemitones[targetChord.root] || 0, semitone)

      const { matched, adjustedCents, matchThreshold } = evaluatePitchMatch({
        frequency,
        probability,
        targetSemitone,
        degree: currentDegree,
        sensitivity: currentSensitivity,
        confidenceThreshold: currentConfidenceThreshold,
      })

      if (matched) {
        logger.debug('和弦练习音高匹配成功:', note, '音分差:', adjustedCents.toFixed(1), '阈值:', matchThreshold.toFixed(1))
        triggerCorrectFeedback(note)

        const nextStep = step + 1
        if (nextStep >= sequence.length) {
          // 完成整个和弦，设置 answered 状态
          setChordExerciseIsAnswered(true)
          chordExerciseIsAnsweredRef.current = true
          const delta = scoreDeltaFor(true)
          setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
          if (nextChordExerciseRef.current) {
            nextChordExerciseRef.current()
          }
        } else {
          // 继续下一个音，不设置 answered 状态
          setChordExerciseCurrentStep(nextStep)
          const delta = scoreDeltaFor(true)
          setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
        }
      } else {
        // 答错了 —— 口径见 `lib/answer-judge.ts::scoreDeltaFor`（答错也进分母）
        const delta = scoreDeltaFor(false)
        setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
      }
    } else if (currentActiveTab === 'chord') {
      // 和弦转换练习 - 使用音分差匹配
      const chords = getTransposedChordsRef.current ? getTransposedChordsRef.current() : []
      const currentChord = chords[currentChordIndexRef.current]
      if (!currentChord) return

      // 获取和弦音级，如果开启 voice leading 则应用（与 Web 路径一致）
      let degrees = getChordDegrees(currentChord.type, practiceLevelRef.current, levelOptionsRef.current)
      if (shouldVoiceLeadRef.current && lastChordNoteRef.current) {
        degrees = applyVoiceLeading(degrees, currentChord.root, lastChordNoteRef.current)
      }
      const currentStep = chordDegreeCurrentStepRef.current
      if (currentStep >= degrees.length) return

      const currentDegree = degrees[currentStep]
      if (!currentDegree) return

      const semitone = intervalToSemitones[currentDegree]
      if (semitone === undefined) return

      const targetSemitone = targetSemitoneOf(noteToSemitones[currentChord.root] || 0, semitone)

      const { matched, adjustedCents } = evaluatePitchMatch({
        frequency,
        probability,
        targetSemitone,
        degree: currentDegree,
        sensitivity: currentSensitivity,
        confidenceThreshold: currentConfidenceThreshold,
      })

      if (matched) {
        logger.debug('和弦转换练习匹配成功:', note, '度数:', currentDegree, '音分差:', adjustedCents.toFixed(1))
        isCoolingDownRef.current = true
        triggerCorrectFeedback(note)
        const nextStep = currentStep + 1
        if (nextStep >= degrees.length) {
          // 完成当前和弦，记录最后一个音用于 voice leading（与 Web 路径一致）
          lastChordNoteRef.current = note
          const delta = scoreDeltaFor(true)
          setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
          if (nextChordInfoRef.current && nextChordRef.current) {
            nextChordRef.current()
          }
        } else {
          setChordDegreeCurrentStep(nextStep)
          const delta = scoreDeltaFor(true)
          setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
        }
        cooldownRef.current = setTimeout(() => {
          isCoolingDownRef.current = false
          cooldownRef.current = null
        }, 800)
      } else {
        // 答错了 —— 口径见 `lib/answer-judge.ts::scoreDeltaFor`（答错也进分母）
        const delta = scoreDeltaFor(false)
        setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
      }
    } else if (currentActiveTab === 'tuner') {
      // 调音表模式 - 只显示音高，不需要答题逻辑
    }
  }, [isPlayingRef, activeTabRef, sensitivityRef, confidenceThresholdRef, isCoolingDownRef, cooldownRef, noteConfirmStateRef, practiceAnswerModeRef, targetNoteRef, generateNewTargetRef, currentIntervalExerciseRef, setCurrentIntervalExercise, setIntervalPracticeStep, generateIntervalExerciseRef, findRootFirstRef, addRootBackRef, scaleKeyRef, scaleExerciseSequenceRef, scaleExerciseCurrentStepRef, selectedScaleRef, scaleComboRef, scaleMaxComboRef, setScaleCombo, setScaleMaxCombo, setScaleExerciseCurrentStep, nextScaleExerciseRef, chordExerciseTargetChordRef, chordExerciseSequenceRef, chordExerciseCurrentStepRef, chordExerciseIsAnsweredRef, setChordExerciseIsAnswered, setChordExerciseCurrentStep, nextChordExerciseRef, nextChordRef, currentChordIndexRef, chordDegreeCurrentStepRef, setChordDegreeCurrentStep, practiceLevelRef, levelOptionsRef, shouldVoiceLeadRef, nextChordInfoRef, lastChordNoteRef, getTransposedChordsRef, recordPositionStat, setScore, triggerCorrectFeedback])
  return { processPracticeMatch }
}
