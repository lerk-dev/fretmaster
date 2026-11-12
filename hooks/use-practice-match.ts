import { useCallback, useRef } from 'react'
import { logger } from '@/lib/logger'
import { confirmNote } from '@/lib/note-confirm'
import { evaluatePitchMatch, findBestIntervalMatch, targetSemitoneOf } from '@/lib/pitch-match'
import {
  scoreDeltaFor,
  judgeExpectation,
  buildSingleTargetExpectation,
  buildIntervalExpectation,
  buildChordMembershipExpectation,
  noteNameToPitchClass,
} from '@/lib/answer-judge'
import { CHORD_TYPES, DEGREE_TO_SEMITONE } from '@/lib/page-theory-data'
import { ALL_PRACTICE_LEVELS } from '@/lib/practice-levels'
import { resolveScaleTargetNoteIndex } from '@/lib/scale-target-note'
import { guitarPositionToMidi } from '@/lib/guitar-sound'
import { frequencyToNote } from '@/lib/pitch-detection'
import {
  noteToSemitones,
  intervalToSemitones,
  resolveScaleDegreeSemitone,
  getChordDegrees,
  applyVoiceLeading,
  getNoteIndex,
  getNoteAtPosition,
  normalizeChordType,
} from '@/lib/page-theory-functions'
import type { DetectedPitchForMatch } from '@/hooks/use-audio-input'
import type { NoteConfirmState } from '@/lib/note-confirm'
import type { CellPos } from '@/lib/single-note-tour'

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

/**
 * 答题域的依赖，按**域**分成 7 组。
 *
 * 为什么分组：C8 只做音频路径时是 45 项平铺，C9 并入 MIDI / 点击后涨到 75 项。
 * 75 个平铺参数有两个实际问题：
 *   ① 写测试要凭空构造 75 个 mock —— 等于没法测（这是分组的**主要**动机）；
 *   ② 读接口的人看不出哪些是一伙的（`chordExerciseXxxRef` 与 `chordExerciseXxx` 明明成对）。
 * 分组后可以用 `__tests__/answer-context-fixture.ts` 的工厂只覆盖用到的组，其余走默认桩。
 *
 * ⚠️ 函数体仍然用裸名字（`isPlayingRef` 而不是 `runtime.isPlayingRef`）——
 *    hook 顶部逐组解构，那里是**唯一**允许出现组名的地方。
 */
export interface UsePracticeMatchOptions {
  /** 全局运行状态：三条路径都要判「在不在练习 / 哪个 tab / 灵敏度与置信度 / 答题方式」 */
  runtime: AnswerRuntimeDeps
  /** 与收音链路**共用同一份**的 ref（冷却 / 多帧确认）—— 见文件头，不能各建一份 */
  audio: AnswerAudioDeps
  /** 找音练习 */
  practice: AnswerPracticeDeps
  /** 音程练习（含先找根音 / 回弹根音） */
  interval: AnswerIntervalDeps
  /** 音阶练习（含一弦三音连击记账） */
  scale: AnswerScaleDeps
  /** 和弦两条路径：chord_exercise（练习）与 chord（进行），共用 level 与 voice leading */
  chord: AnswerChordDeps
  /** 动作与落点：计分 / 反馈 / 点击高亮与定时器 / 品区限制 */
  actions: AnswerActionsDeps
}

export interface AnswerRuntimeDeps {
  isPlayingRef: { current: boolean }
  activeTabRef: { current: string }
  sensitivityRef: { current: number }
  confidenceThresholdRef: { current: number }
  practiceAnswerModeRef: { current: 'fretboard' | 'buttons' }
  isPlaying: boolean
  activeTab: string
}

export interface AnswerAudioDeps {
  isCoolingDownRef: { current: boolean }
  cooldownRef: { current: ReturnType<typeof setTimeout> | null }
  noteConfirmStateRef: { current: NoteConfirmState | null }
}

export interface AnswerPracticeDeps {
  targetNoteRef: { current: string | null }
  targetNote: string
  generateNewTargetRef: { current: (() => void) | null }
  generateNewTarget: () => void
  /**
   * 「单音全指板」精确提示：校验点击位置是否就是题目要求的位置。
   * 返回 false 时该次点击判错（页面不提供此回调 ⇒ 只校验音名，行为与旧版一致）。
   * 🚨 音频路径不调用它 —— 麦克风只能拿到音名，拿不到弦/品。
   */
  isPracticePositionAllowed?: (position: CellPos) => boolean
  /**
   * 找音命中后的自定义推进（单音全指板需要按「位置/次数」记账）。
   * 返回 true = 已自行推进，跳过默认的 `generateNewTarget`。
   */
  onPracticeCorrect?: (payload: {
    via: 'audio' | 'click'
    position?: CellPos
    /**
     * 音频命中时的绝对八度（YIN 检测，如 E2 = 2）。点击路径没有这个值。
     * 单音全指板用它把「弹响的八度」对到正确的落点；缺省时页面按当前提示位置记账。
     */
    octave?: number
  }) => boolean
  /**
   * 找音练习命中后的冷却时长（ms）。缺省 800。
   *
   * 🚨 「单音全指板」必须传 0：整轮都在弹同一个音名，用户就是要**连续**弹多个位置。
   *    800ms 冷却期间收音链路连帧都不往下送（`use-audio-input` 的
   *    `!isCoolingDownRef.current` 守卫），于是第二下拨弦的**起音信号被整帧丢掉**，
   *    表现为「弹完一个，第二个要等很久 / 干脆没反应」。
   *    去掉冷却不会重复计分：同一个音仍受 `confirmNote` 的 `firedNote` 锁约束
   *    （见 lib/note-confirm.ts + lib/note-release.ts）。
   */
  hitCooldownMs?: number
}

export interface AnswerIntervalDeps {
  currentIntervalExerciseRef: { current: IntervalExercise | null }
  currentIntervalExercise: IntervalExercise | null
  setCurrentIntervalExercise: (v: IntervalExercise | null) => void
  setIntervalPracticeStep: (v: 'root' | 'interval') => void
  generateIntervalExerciseRef: { current: (() => void) | null }
  findRootFirstRef: { current: boolean }
  findRootFirst: boolean
  addRootBackRef: { current: boolean }
}

export interface AnswerScaleDeps {
  scaleKeyRef: { current: string }
  scaleKey: string
  selectedScaleRef: { current: { name: string; notes: number[]; intervals: string[] } }
  selectedScale: { name: string; notes: number[]; intervals: string[] }
  scaleExerciseSequenceRef: { current: string[] }
  scaleExerciseSequence: string[]
  scaleExerciseCurrentStepRef: { current: number }
  scaleExerciseCurrentStep: number
  setScaleExerciseCurrentStep: (v: number) => void
  nextScaleExerciseRef: { current: (() => void) | null }
  nextScaleExercise: () => void
  scaleComboRef: { current: number }
  scaleMaxComboRef: { current: number }
  setScaleCombo: (v: number) => void
  setScaleMaxCombo: (v: number) => void
}

export interface AnswerChordDeps {
  chordExerciseTargetChordRef: { current: { root: string; type: string } | null }
  chordExerciseTargetChord: { root: string; type: string } | null
  chordExerciseSequenceRef: { current: string[] }
  chordExerciseSequence: string[]
  chordExerciseCurrentStepRef: { current: number }
  chordExerciseCurrentStep: number
  chordExerciseIsAnsweredRef: { current: boolean }
  setChordExerciseIsAnswered: (v: boolean) => void
  setChordExerciseCurrentStep: (v: number) => void
  nextChordExerciseRef: { current: (() => void) | null }
  nextChordExercise: () => void
  transposedChords: { root: string; type: string; bass?: string }[]
  getTransposedChordsRef: { current: (() => { root: string; type: string }[]) | null }
  currentChordIndexRef: { current: number }
  currentChordIndex: number
  nextChordRef: { current: (() => void) | null }
  chordDegreeCurrentStepRef: { current: number }
  setChordDegreeCurrentStep: (v: number) => void
  practiceLevelRef: { current: string }
  practiceLevel: string
  getLevelOptions: () => LevelOptions
  levelOptionsRef: { current: LevelOptions }
  shouldVoiceLeadRef: { current: boolean }
  nextChordInfoRef: { current: { index: number; root: string; type: string; bass?: string; degrees: string[] } | null }
  lastChordNoteRef: { current: string | null }
  /**
   * 和弦练习的琶音顺序（设置项 `chordExerciseOrder`）。
   * `asc` / `desc` 现在会**按实际音高**校验：下一个音必须比上一个弹对的音更高/更低；
   * `random` 不判方向。没有绝对音高（老硬件/MIDI 无八度）时自动退回只看音级。
   */
  chordExerciseOrder: 'asc' | 'desc' | 'random'
}

export interface AnswerActionsDeps {
  /**
   * 逐位置掌握度：`pos` 为**这一次判定对应的格子**。
   * 点击路径显式传入自己的位置；音频/MIDI 路径没有位置 ⇒ 省略，由页面回退到当前目标位置。
   * 🚨 不要再用「共享 ref + 下游消费」传递点击位置：点击后 100ms 才推进，
   *    期间别的路径一跑就会把位置偷走（连点记错位置、单音模式多记命中）。
   */
  recordPositionStat: (isCorrect: boolean, pos?: CellPos) => void
  setScore: (fn: (prev: { correct: number; total: number }) => { correct: number; total: number }) => void
  triggerCorrectFeedback: (note: string) => void
  triggerWrongFeedback: (note: string) => void
  /** 反馈音：第二个参数是点击位置的 MIDI 音高（采样按它移调） */
  playFeedbackSound: (isCorrect: boolean, midi?: number) => void
  setHighlightedFrets: (fn: (prev: Map<string, boolean>) => Map<string, boolean>) => void
  clearFretClickTimers: () => void
  fretClickTimersRef: { current: Array<ReturnType<typeof setTimeout>> }
  fretZoneEnabled: boolean
  fretZoneStart: number
  fretZoneSize: number
  fretCount: number
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
  /** 本题方向（由 use-interval-exercise 逐题写入）；缺省 = 不做方向判定 */
  direction?: 'up' | 'down'
}

/** 出题的 level 选项（页面 getLevelOptions 的返回形状） */
interface LevelOptions {
  forceNaturalFive: boolean
  endOnStartingInterval: boolean
  usePassingNoteBebopScale: boolean
  sevenFlatNineScaleChoice: 'altered' | 'diminishedWholeHalf' | 'diminishedHalfWhole'
}

/** 音名 + 八度 → 绝对 MIDI 音高（上下行判定用）。缺八度（老输入源）返回 null ⇒ 不做方向判定。 */
function midiFromNoteOctave(note: string, octave?: number): number | null {
  if (octave === undefined) return null
  const pitchClass = noteNameToPitchClass(note)
  return pitchClass < 0 ? null : 12 * (octave + 1) + pitchClass
}

/** 麦克风频率 → 最近的 MIDI 音高（A4 = 69）。 */
function frequencyToMidi(frequency: number): number | null {
  if (!Number.isFinite(frequency) || frequency <= 0) return null
  return Math.round(69 + 12 * Math.log2(frequency / 440))
}

/** 指板位置 → 绝对 MIDI 音高（点击路径的八度来源）。 */
function positionToMidi(position?: CellPos | null): number | null {
  if (!position) return null
  return guitarPositionToMidi(position.stringIndex, position.fret) ?? null
}

/** 音程题的题目指纹：换题（根音 / 音程串变化）后「根音基准」立即失效。 */
function intervalSignatureOf(exercise: IntervalExercise): string {
  return `${exercise.rootNote}|${exercise.currentIntervalDisplay}`
}

/**
 * 音程「相对上下行」判定（方案 B：不给根音定绝对八度）。
 *
 * 基准是**本题用户实际弹下的根音音高**。拿不到基准（没开先找根音 / 根音还没弹 /
 * 输入源没有八度）就**不判方向** —— 宁可退回「只看音级」，也不要凭空拒绝正确答案。
 *
 * 为什么要比八度：`down` 档的题目是**互补音程**（下行大三度 → 问六度，见
 * lib/interval-direction.ts），音级相同、八度不同。只比音级的话，用户在根音上方
 * 弹同一个音级也会算对 ⇒ 上下行形同虚设。
 */
function isIntervalDirectionOk(
  exercise: IntervalExercise,
  label: string,
  midi: number | null,
  root: { signature: string; midi: number } | null,
): boolean {
  const direction = exercise.direction
  // 没有逐题方向 / 根音本身没有上下之分（同度）/ 拿不到音高 ⇒ 不判
  if (!direction || label === '1' || midi === null) return true
  if (!root || root.signature !== intervalSignatureOf(exercise)) return true
  return direction === 'up' ? midi > root.midi : midi < root.midi
}

/** 和弦练习的题目指纹（目标和弦 + 音级序列）。换和弦后旧基准失效。 */
function chordExerciseSignatureOf(
  target: { root: string; type: string } | null,
  sequence: readonly string[],
): string {
  return target ? `${target.root}|${target.type}|${sequence.join(' ')}` : ''
}

/**
 * 和弦练习 asc / desc 的**音高**方向判定：与**上一个弹对的音**比较。
 *
 * 音级序列本身已按 asc/desc 排好（见 `generateChordSequence`），这里只补「八度也得对」：
 * 上行必须真的更高、下行必须真的更低。第一音没有基准 ⇒ 接受并成为基准；
 * `random` 不判方向；拿不到音高 ⇒ 不判。
 */
function isChordExerciseDirectionOk(
  order: 'asc' | 'desc' | 'random',
  midi: number | null,
  last: { signature: string; midi: number } | null,
  signature: string,
): boolean {
  if (order === 'random' || midi === null) return true
  if (!last || last.signature !== signature) return true
  return order === 'asc' ? midi > last.midi : midi < last.midi
}

export function usePracticeMatch(options: UsePracticeMatchOptions) {
  const { runtime, audio, practice, interval, scale, chord, actions } = options

  const {
    isPlayingRef, activeTabRef, sensitivityRef, confidenceThresholdRef,
    practiceAnswerModeRef, isPlaying, activeTab,
  } = runtime
  const {
    isCoolingDownRef, cooldownRef, noteConfirmStateRef,
  } = audio
  const {
    targetNoteRef, targetNote, generateNewTargetRef, generateNewTarget,
    isPracticePositionAllowed, onPracticeCorrect, hitCooldownMs,
  } = practice
  const {
    currentIntervalExerciseRef, currentIntervalExercise, setCurrentIntervalExercise, setIntervalPracticeStep,
    generateIntervalExerciseRef, findRootFirstRef, findRootFirst, addRootBackRef,
  } = interval
  const {
    scaleKeyRef, scaleKey, selectedScaleRef, selectedScale,
    scaleExerciseSequenceRef, scaleExerciseSequence, scaleExerciseCurrentStepRef, scaleExerciseCurrentStep,
    setScaleExerciseCurrentStep, nextScaleExerciseRef, nextScaleExercise, scaleComboRef,
    scaleMaxComboRef, setScaleCombo, setScaleMaxCombo,
  } = scale
  const {
    chordExerciseTargetChordRef, chordExerciseTargetChord, chordExerciseSequenceRef, chordExerciseSequence,
    chordExerciseCurrentStepRef, chordExerciseCurrentStep, chordExerciseIsAnsweredRef, setChordExerciseIsAnswered,
    setChordExerciseCurrentStep, nextChordExerciseRef, nextChordExercise, transposedChords,
    getTransposedChordsRef, currentChordIndexRef, currentChordIndex, nextChordRef,
    chordDegreeCurrentStepRef, setChordDegreeCurrentStep, practiceLevelRef, practiceLevel,
    getLevelOptions, levelOptionsRef, shouldVoiceLeadRef, nextChordInfoRef,
    lastChordNoteRef, chordExerciseOrder,
  } = chord
  const {
    recordPositionStat, setScore, triggerCorrectFeedback, triggerWrongFeedback,
    playFeedbackSound, setHighlightedFrets, clearFretClickTimers,
    fretClickTimersRef, fretZoneEnabled, fretZoneStart, fretZoneSize,
    fretCount,
  } = actions

  /**
   * 音程「相对上下行」的基准：**本题用户实际弹下的根音音高**。
   *
   * 用户选定的是方案 B（不给根音定绝对八度），所以基准只能来自「先找根音」时
   * 用户自己弹的那一次。没弹根音（未开启先找根音 / 根音还没弹）⇒ 没有基准，
   * 判定退回只看音级（与旧行为一致），不会凭空拒绝正确答案。
   * `signature` 用来区分题目：换题后旧基准立即失效。
   */
  const intervalRootMidiRef = useRef<{ signature: string; midi: number } | null>(null)
  /**
   * 和弦练习 asc/desc 的基准：**本题上一个弹对的音高**。
   * 同样带 `signature`，换和弦（目标和弦 / 音级序列变化）后旧基准不起作用。
   */
  const chordExerciseLastMidiRef = useRef<{ signature: string; midi: number } | null>(null)

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
        triggerCorrectFeedback(note)
        // 单音全指板：页面自行记账并决定是否换题；未提供回调时走默认换题。
        // 带上八度：同一音名在不同把位是不同八度，页面据此把「实际弹响的八度」对到正确的落点
        // （弱校验：对不上也照样计分，只是不点亮提示位置以外的地方）。
        const handled =
          onPracticeCorrect?.({ via: 'audio', octave: frequencyToNote(frequency).octave }) ?? false
        if (!handled && generateNewTargetRef.current) {
          generateNewTargetRef.current()
        }
        // 冷却 0 = 不设冷却（单音全指板：整轮同一个音名，必须能连续弹）。
        // 重复计分由 `confirmNote` 的 firedNote 锁挡住，见 practice.hitCooldownMs 的说明。
        const practiceCooldownMs = hitCooldownMs ?? 800
        if (practiceCooldownMs > 0) {
          isCoolingDownRef.current = true
          cooldownRef.current = setTimeout(() => {
            isCoolingDownRef.current = false
            cooldownRef.current = null
          }, practiceCooldownMs)
        }
      } else {
        // 找音练习弹了别的音：给一个轻量反馈（右上角胶囊）。
        // 之前这里是静默的 —— 单音全指板里用户分不清「弹错了」「弹了别的音」还是「没识别到」。
        // 只做视觉提示，不改判定、不加惩罚（计分已经在上面按 matched 记过）。
        triggerWrongFeedback(note)
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
        // 相对上下行：音级对了还要站在根音的正确一侧（拿不到基准时不判，见 isIntervalDirectionOk）
        const playedMidi = frequencyToMidi(frequency)
        if (!isIntervalDirectionOk(exercise, matchedInterval, playedMidi, intervalRootMidiRef.current)) {
          const delta = scoreDeltaFor(false)
          setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
          return
        }
        // 先找根音：用户弹下的根音音高就是本题「相对上下行」的基准
        if (matchedInterval === '1' && playedMidi !== null) {
          intervalRootMidiRef.current = { signature: intervalSignatureOf(exercise), midi: playedMidi }
        }
        logger.debug('音程练习匹配成功:', matchedInterval, '音分差:', minCents.toFixed(1))
        triggerCorrectFeedback(note)
        const newCompletedIntervals = [...exercise.completedIntervals, matchedIndex]

        if (newCompletedIntervals.length >= intervals.length) {
          setCurrentIntervalExercise({ ...exercise, completedIntervals: newCompletedIntervals, answered: true })
          const delta = scoreDeltaFor(true)
          setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
          // 整题完成（序列里的每个音级都已命中）就必须出新题。
          // 音频路径不按显示顺序匹配，「回弹根音」的 `1` 可能在音程之前就被弹掉；
          // 此时再等一个序列里已经不存在的根音，会让题目停在 answered=true 永远不推进。
          if (generateIntervalExerciseRef.current) {
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

      // asc / desc 的真方向：与上一个弹对的音比八度
      const chordSignature = chordExerciseSignatureOf(targetChord, sequence)
      const playedMidi = frequencyToMidi(frequency)
      const directionOk = isChordExerciseDirectionOk(
        chordExerciseOrder, playedMidi, chordExerciseLastMidiRef.current, chordSignature,
      )

      if (matched && directionOk) {
        logger.debug('和弦练习音高匹配成功:', note, '音分差:', adjustedCents.toFixed(1), '阈值:', matchThreshold.toFixed(1))
        triggerCorrectFeedback(note)
        // 记下这个音，作为下一音的「上行/下行」基准
        if (playedMidi !== null) {
          chordExerciseLastMidiRef.current = { signature: chordSignature, midi: playedMidi }
        }

        const nextStep = step + 1
        if (nextStep >= sequence.length) {
          // 完成整个和弦，设置 answered 状态
          chordExerciseLastMidiRef.current = null
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
  }, [isPlayingRef, activeTabRef, sensitivityRef, confidenceThresholdRef, isCoolingDownRef, cooldownRef, noteConfirmStateRef, practiceAnswerModeRef, targetNoteRef, generateNewTargetRef, onPracticeCorrect, hitCooldownMs, currentIntervalExerciseRef, setCurrentIntervalExercise, setIntervalPracticeStep, generateIntervalExerciseRef, findRootFirstRef, addRootBackRef, scaleKeyRef, scaleExerciseSequenceRef, scaleExerciseCurrentStepRef, selectedScaleRef, scaleComboRef, scaleMaxComboRef, setScaleCombo, setScaleMaxCombo, setScaleExerciseCurrentStep, nextScaleExerciseRef, chordExerciseTargetChordRef, chordExerciseSequenceRef, chordExerciseCurrentStepRef, chordExerciseIsAnsweredRef, setChordExerciseIsAnswered, setChordExerciseCurrentStep, nextChordExerciseRef, nextChordRef, currentChordIndexRef, chordDegreeCurrentStepRef, setChordDegreeCurrentStep, practiceLevelRef, levelOptionsRef, shouldVoiceLeadRef, nextChordInfoRef, lastChordNoteRef, getTransposedChordsRef, recordPositionStat, setScore, triggerCorrectFeedback, triggerWrongFeedback, chordExerciseOrder, intervalRootMidiRef, chordExerciseLastMidiRef])
  /**
   * MIDI / 指板点击 / 按钮 的统一入口。
   *
   * 🚨 参数顺序是 `(note, octave?, position?)`：`use-audio-input` 的 MIDI note-on
   * 按 `(noteName, octave)` 调用同一个 callback（见 `handleMIDINoteInputRef`），
   * 八度必须是第二个参数，否则会落到 position 上。
   */
  const handleMIDINoteInput = useCallback((note: string, octave?: number, position?: CellPos) => {
    logger.debug('handleMIDINoteInput 被调用', note, 'isPlaying:', isPlaying, 'activeTab:', activeTab)
    if (!isPlaying) {
      logger.debug('未在练习中，忽略输入')
      return
    }
    
    switch (activeTab) {
      case "practice": {
        // 辨音模式下通过按钮答题，不自动匹配（使用 ref 避免闭包延迟）
        if (practiceAnswerModeRef.current === "buttons") break

        // 🚨 半音比对，不用字符串相等：MIDI / 指板给的音名可能与目标音**异名同音**
        //    （目标 `C#`、弹的是 `Db`；或目标 `Cb`、弹的是 `B`）⇒ 字面量比较会判错。
        //    抽取前这里就是 `note === targetNote`。
        const practiceTargetIdx = getNoteIndex(targetNote)
        const practicePlayedIdx = noteNameToPitchClass(note)
        if (practiceTargetIdx < 0 || practicePlayedIdx < 0) break

        const practiceVerdict = judgeExpectation(
          buildSingleTargetExpectation({ label: targetNote, targetSemitone: practiceTargetIdx }),
          practicePlayedIdx,
        )
        // 点击路径传进来的位置（MIDI 设备/音频路径没有）。**只读参数，不读共享 ref**：
        // 点击后会延迟 100ms 才走到这里，用 ref 传位置会被这 100ms 里的其它路径偷走。
        const clickedPosition = position ?? null
        // 精确提示：音名对了但位置不对 ⇒ 判错（未提供回调时只看音名）
        const positionAllowed =
          !clickedPosition || !isPracticePositionAllowed || isPracticePositionAllowed(clickedPosition)
        const practiceHit = practiceVerdict.hit && positionAllowed
        // 逐位置掌握度统计：点击路径用点击位置，否则回退到页面记录的当前目标位置
        if (clickedPosition) recordPositionStat(practiceHit, clickedPosition)
        else recordPositionStat(practiceHit)
        const practiceDelta = scoreDeltaFor(practiceHit)
        setScore(prev => ({ correct: prev.correct + practiceDelta.correct, total: prev.total + practiceDelta.total }))
        // 音高识别统计改为按会话记录，不在此处累加 —— 见 pitchFindingSession 统计 effect
        if (practiceHit) {
          const handled = onPracticeCorrect?.({
            via: clickedPosition ? 'click' : 'audio',
            position: clickedPosition ?? undefined,
            // 音频 / MIDI 路径能拿到绝对八度；纯点击路径没有（页面按提示位置记账）
            ...(octave !== undefined ? { octave } : {}),
          }) ?? false
          if (!handled) generateNewTarget()
        }
        break
      }
      case "interval": {
        // Handle interval practice
        if (!currentIntervalExercise || currentIntervalExercise.answered) break

        const exercise = currentIntervalExercise
        const playedIdx = noteNameToPitchClass(note)
        if (playedIdx < 0) break

        // 🚨 「这一步该弹哪些音」交给 `lib/answer-judge.ts` —— 音频 / MIDI / 点击三条路径共用。
        //    抽取前这里是一段手写 for 循环，遍历**全部**未完成候选并 `break` 命中第一个匹配上的，
        //    于是在 display `"b3 1"`（回弹根音）里 step 0 弹根音也能推进；而点击路径的
        //    `resolveExpectedIntervalDegree` 判它是错的 ⇒ **点了显示红色、练习却悄悄前进了一步**。
        //    另外原来查题目自带的 `allIntervals` 时**没有取模**，复合音程会错开一个八度。
        const expectation = buildIntervalExpectation({
          display: exercise.currentIntervalDisplay,
          completedIndexes: exercise.completedIntervals,
          findRootFirst,
          rootSemitone: getNoteIndex(exercise.rootNote),
          strictOrder: true,
          allIntervals: exercise.allIntervals,
          fallbackSemitoneOf: (label) => DEGREE_TO_SEMITONE[label],
        })
        const verdict = judgeExpectation(expectation, playedIdx)
        const matchedIndex = verdict.matchedIndex
        const intervals = exercise.currentIntervalDisplay.split(' ')
        // 相对上下行：MIDI 有八度、点击有位置 ⇒ 两者都能拿到绝对音高
        const playedMidi = midiFromNoteOctave(note, octave) ?? positionToMidi(position)
        const directionOk = verdict.hit && matchedIndex !== null
          ? isIntervalDirectionOk(exercise, intervals[matchedIndex], playedMidi, intervalRootMidiRef.current)
          : false

        if (verdict.hit && matchedIndex !== null && directionOk) {
          const matchedInterval = intervals[matchedIndex]
          // 先找根音：用户弹下的根音音高就是本题「相对上下行」的基准
          if (matchedInterval === '1' && playedMidi !== null) {
            intervalRootMidiRef.current = { signature: intervalSignatureOf(exercise), midi: playedMidi }
          }
          // 添加到已完成列表
          const newCompletedIntervals = [...exercise.completedIntervals, matchedIndex]

          // 检查是否所有音程都弹对了
          if (newCompletedIntervals.length >= intervals.length) {
            // 完成题目
            setCurrentIntervalExercise({
              ...exercise,
              completedIntervals: newCompletedIntervals,
              answered: true
            })
            setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
            // 统计已改为会话级记录：会话结束时统一在 useEffect 中记录


            // 立即生成新题目（MIDI输入无需延迟）- 使用 ref 避免循环依赖
            setTimeout(() => {
              generateIntervalExerciseRef.current?.()
            }, 0)
          } else {
            // 部分完成
            setCurrentIntervalExercise({
              ...exercise,
              completedIntervals: newCompletedIntervals
            })
            
            // 如果是先找根音模式，完成根音后进入音程步骤
            if (findRootFirst && matchedInterval === '1') {
              setIntervalPracticeStep("interval")
            }
          }
        } else {
          // 答错了 —— 口径见 lib/answer-judge.ts::scoreDeltaFor（答错也要进分母）
          const delta = scoreDeltaFor(false)
          setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
        }
        break
      }
      case "chord":
        // Handle chord practice (和弦转换练习)
        {
          const chords = transposedChords
          const currentChord = chords[currentChordIndex]
          if (!currentChord) break

          const normalizedType = normalizeChordType(currentChord.type)
          const chordType = CHORD_TYPES.find(ct => ct.name === normalizedType || ct.symbol === normalizedType || ct.name === currentChord.type || ct.symbol === currentChord.type)
          if (!chordType) break

          // 从所有练习模式中查找
          const level = ALL_PRACTICE_LEVELS.find(l => l.id === practiceLevel)
          if (!level) break

          const rootIdx = getNoteIndex(currentChord.root)
          const noteIdx = noteNameToPitchClass(note)
          if (noteIdx < 0) break

          // 用 getChordDegrees 获取当前和弦在该 level 下的音级字符串数组
          // 然后把音级字符串转成半音数，判断当前音符是否匹配
          // 注意：level.sequences 存的是序列数字（1,2,3,5），不是半音数，不能直接用
          // 如果开启 voice leading 则应用（与 audio 路径一致）
          let degrees = getChordDegrees(currentChord.type, practiceLevel, getLevelOptions())
          if (shouldVoiceLeadRef.current && lastChordNoteRef.current) {
            degrees = applyVoiceLeading(degrees, currentChord.root, lastChordNoteRef.current)
          }

          // 🚨 音级 → 半音走 `DEGREE_TO_SEMITONE` 单一真相源；「哪些音算和弦内音」
          //    交给 `buildChordMembershipExpectation`（内部完成复合音程取模与八度去重）。
          //    抽取前这里是 `validSemitones.includes(interval)`：复合音程（9/11/13）
          //    不取模 ⇒ 含扩展音的和弦在这里必然判错。
          // 🚨 已知分叉（未收敛，改动前需确认产品语义）：本路径用 **level 的 voicing**
          //    （`degrees`），而点击路径用**完整和弦定义**（`chordType.intervals`）
          //    ⇒ 点击弹中任一和弦内音即绿，MIDI 只认当前 voicing。见 __tests__/answer-judge.test.ts。
          const expectation = buildChordMembershipExpectation({
            rootSemitone: rootIdx,
            intervals: degrees
              .map(d => DEGREE_TO_SEMITONE[d])
              .filter((s): s is number => s !== undefined),
          })
          const isCorrect = judgeExpectation(expectation, noteIdx).hit

          if (isCorrect) {
            // 完成当前和弦，记录最后一个音用于 voice leading（与 audio 路径一致）
            lastChordNoteRef.current = note
            const delta = scoreDeltaFor(true)
            setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
          } else {
            const delta = scoreDeltaFor(false)
            setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
          }
        }
        break
      case "scale":
        // 音阶练习处理
        {
          if (scaleExerciseSequence.length === 0) break
          
          const currentDegree = scaleExerciseSequence[scaleExerciseCurrentStep]
          
          // 🚨 音级 → 半音交给 `resolveScaleDegreeSemitone`：它优先查**当前音阶自己的对齐表**
          // （`intervals[i]` ↔ `notes[i]`），手写兜底表只在该标签不在音阶里时才用。
          // 为什么不能只手写表 —— 实测（`__tests__/scale-degree-semitone.test.ts` 穷举 76 个音阶）：
          //  ① 手写表缺 `#2`，而 Altered / Lydian #9 / Lydian Augmented #2 /
          //     Diminished Half Whole / Augmented Scale 都含它 ⇒ 查不到 ⇒ 返回 undefined
          //     ⇒ 下面 break ⇒ **当前题永远不推进**（表现为「弹对了没反应」）且不报错；
          //  ② 手写表把 `#6` 记成 9，而 Whole Tone / Augmented Scale 里的 `#6` 是 10
          //     ⇒ 要求弹低半音的那个音，练习照常推进但判定错 —— 比 ① 更隐蔽。
          const targetNoteIdx = resolveScaleTargetNoteIndex(selectedScale, currentDegree, scaleKey)
          if (targetNoteIdx === undefined) {
            logger.warn('[scale] 未知音级标签，练习无法推进', currentDegree, selectedScale.name)
            break
          }

          const playedNoteIdx = noteNameToPitchClass(note)
          if (playedNoteIdx < 0) break

          // 单目标判定（与点击路径同一 builder）。
          const scaleVerdict = judgeExpectation(
            buildSingleTargetExpectation({ label: currentDegree, targetSemitone: targetNoteIdx }),
            playedNoteIdx,
          )

          if (scaleVerdict.hit) {
            // 答对了
            const nextStep = scaleExerciseCurrentStep + 1
            // 连击：ref 记账 + 同步 state（一弦三音面板显示；普通音阶模式下不显示）
            scaleComboRef.current += 1
            setScaleCombo(scaleComboRef.current)
            if (scaleComboRef.current > scaleMaxComboRef.current) {
              scaleMaxComboRef.current = scaleComboRef.current
              setScaleMaxCombo(scaleComboRef.current)
            }
            if (nextStep >= scaleExerciseSequence.length) {
              // 完成当前序列，使用预览的下一题
              const delta = scoreDeltaFor(true)
              setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
              // 统计已改为会话级记录：会话结束时统一在 useEffect 中记录

              nextScaleExercise()
            } else {
              // 继续下一个音
              setScaleExerciseCurrentStep(nextStep)
              const delta = scoreDeltaFor(true)
              setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
            }
          } else {
            // 答错了
            scaleComboRef.current = 0
            setScaleCombo(0)
            const delta = scoreDeltaFor(false)
            setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
          }
        }
        break
      case "chord_exercise":
        // 和弦练习处理
        {
          if (!chordExerciseTargetChord || chordExerciseSequence.length === 0) break

          const currentDegree = chordExerciseSequence[chordExerciseCurrentStep]
          const normalizedType = normalizeChordType(chordExerciseTargetChord.type)
          const chordType = CHORD_TYPES.find(ct => ct.name === normalizedType || ct.symbol === normalizedType || ct.name === chordExerciseTargetChord.type)
          if (!chordType) break

          const rootIdx = getNoteIndex(chordExerciseTargetChord.root)
          // 🚨 音级 → 半音一律走 `DEGREE_TO_SEMITONE`（单一真相源）。
          //    这里原有一份内联 Record —— 全仓第六份「音级 → 半音」字面量，
          //    与 lib 里的几份各有各的洞（`#2`/`b4`/`bb7`/双变音记号覆盖不一致），
          //    正是「同一个量多处判定」的活证。详见 lib/degree-semitone.ts 头注释。
          const semitone = DEGREE_TO_SEMITONE[currentDegree]
          if (semitone === undefined) break

          const playedNoteIdx = noteNameToPitchClass(note)
          if (playedNoteIdx < 0) break

          // 单目标判定（与音阶、点击路径同一个 builder）。
          const exerciseVerdict = judgeExpectation(
            buildSingleTargetExpectation({
              label: currentDegree,
              targetSemitone: (rootIdx + semitone) % 12,
            }),
            playedNoteIdx,
          )

          // asc / desc 的真方向：与上一个弹对的音比八度（MIDI 有八度、点击有位置）
          const chordSignature = chordExerciseSignatureOf(chordExerciseTargetChord, chordExerciseSequence)
          const playedMidi = midiFromNoteOctave(note, octave) ?? positionToMidi(position)
          const directionOk = isChordExerciseDirectionOk(
            chordExerciseOrder, playedMidi, chordExerciseLastMidiRef.current, chordSignature,
          )

          if (exerciseVerdict.hit && directionOk) {
            // 答对了 —— 记下这个音，作为下一音的「上行/下行」基准
            if (playedMidi !== null) {
              chordExerciseLastMidiRef.current = { signature: chordSignature, midi: playedMidi }
            }
            const nextStep = chordExerciseCurrentStep + 1
            if (nextStep >= chordExerciseSequence.length) {
              // 完成当前和弦，使用预览的下一题
              chordExerciseLastMidiRef.current = null
              const delta = scoreDeltaFor(true)
              setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
              // 统计已改为会话级记录：会话结束时统一在 useEffect 中记录

              nextChordExercise()
            } else {
              // 继续下一个音
              setChordExerciseCurrentStep(nextStep)
              const delta = scoreDeltaFor(true)
              setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
            }
          } else {
            // 答错了
            const delta = scoreDeltaFor(false)
            setScore(prev => ({ correct: prev.correct + delta.correct, total: prev.total + delta.total }))
          }
        }
        break
    }
  }, [isPlaying, activeTab, recordPositionStat, targetNote, currentIntervalExercise, setScore, generateNewTarget, onPracticeCorrect, isPracticePositionAllowed, findRootFirst, setCurrentIntervalExercise, generateIntervalExerciseRef, setIntervalPracticeStep, transposedChords, currentChordIndex, practiceLevel, getLevelOptions, scaleExerciseSequence, scaleExerciseCurrentStep, selectedScale, scaleKey, nextScaleExercise, chordExerciseTargetChord, chordExerciseSequence, chordExerciseCurrentStep, nextChordExercise, setChordExerciseCurrentStep, scaleComboRef, scaleMaxComboRef, setScaleCombo, setScaleMaxCombo, setScaleExerciseCurrentStep, lastChordNoteRef, practiceAnswerModeRef, shouldVoiceLeadRef, chordExerciseOrder, intervalRootMidiRef, chordExerciseLastMidiRef])

  const handleFretClick = useCallback((stringIndex: number, fret: number) => {
    const clickedNote = getNoteAtPosition(stringIndex, fret)

    if (isPlaying) {
      // 限制练习 - 5品区: 品区外点击不响应（仅练习模式）
      if (fretZoneEnabled) {
        const minFret = fretZoneStart
        const maxFret = Math.min(fretCount, fretZoneStart + fretZoneSize - 1)
        if (fret < minFret || fret > maxFret) return
      }
      const key = `${stringIndex}-${fret}`
      
      // 判断答案是否正确（用于显示颜色）
      //
      // 🚨 本判定**只决定红/绿**，真正的状态推进在随后的 `handleMIDINoteInput(clickedNote)`。
      //    因此这里必须与那条路径用**同一套** builder —— 否则会出现「显示红色、练习却前进」
      //    （抽取前正是如此：本处用 `interval.semitones` 当期望半音，而 MIDI 路径遍历全部候选）。
      let isCorrect = false

      switch (activeTab) {
        case "practice": {
          // 找音练习：半音比对（异名同音也算对，如目标 `C#` 点 `Db`）
          const targetIdx = getNoteIndex(targetNote)
          const clickedIdx = noteNameToPitchClass(clickedNote)
          isCorrect =
            targetIdx >= 0 &&
            clickedIdx >= 0 &&
            judgeExpectation(
              buildSingleTargetExpectation({ label: targetNote, targetSemitone: targetIdx }),
              clickedIdx,
            ).hit
          // 单音全指板的「精确提示」：音名对了但没点要求的位置 ⇒ 红（真正推进在 100ms 后的
          // handleMIDINoteInput 里用同一条校验，两处结论必须一致）
          if (isCorrect && isPracticePositionAllowed && !isPracticePositionAllowed({ stringIndex, fret })) {
            isCorrect = false
          }
          // 逐位置统计：位置在 100ms 后的 handleMIDINoteInput 里随调用**显式**传下去
          break
        }

        case "chord_exercise": {
          // 和弦练习：与 MIDI 路径同一 builder
          if (chordExerciseTargetChord && chordExerciseSequence.length > 0) {
            const currentDegree = chordExerciseSequence[chordExerciseCurrentStep]
            const rootIdx = getNoteIndex(chordExerciseTargetChord.root)
            const clickedIdx = noteNameToPitchClass(clickedNote)
            // 音级 → 半音走 `DEGREE_TO_SEMITONE` 单一真相源（历史上全仓共六份内联表）
            const semitone = DEGREE_TO_SEMITONE[currentDegree]
            if (semitone !== undefined && rootIdx >= 0 && clickedIdx >= 0) {
              isCorrect = judgeExpectation(
                buildSingleTargetExpectation({
                  label: currentDegree,
                  targetSemitone: rootIdx + semitone,
                }),
                clickedIdx,
              ).hit
              // asc / desc 的真方向：与 MIDI 路径同一口径（基准由 100ms 后的
              // handleMIDINoteInput 写入，两处结论必须一致，否则「显示绿色却判错」）
              if (isCorrect) {
                isCorrect = isChordExerciseDirectionOk(
                  chordExerciseOrder,
                  positionToMidi({ stringIndex, fret }),
                  chordExerciseLastMidiRef.current,
                  chordExerciseSignatureOf(chordExerciseTargetChord, chordExerciseSequence),
                )
              }
            }
          }
          break
        }

        case "scale": {
          // 音阶练习：与 MIDI / 音频两条路径共用 `resolveScaleTargetNoteIndex` 这一个真相源。
          // 🚨 禁止再手写「半音 → 音级标签」反查表：音级标签是**异名同音**的
          //    （#4/b5、#5/b6、#2/b3…），反查表只能表达其中一侧，另一侧永远比不上 ⇒ 弹对了判错。
          //    正向比较（标签 → 半音 → 音名下标）从根上不需要「选哪一侧」。
          if (scaleExerciseSequence.length > 0) {
            const currentDegree = scaleExerciseSequence[scaleExerciseCurrentStep]
            const clickedIdx = noteNameToPitchClass(clickedNote)
            const targetNoteIdx = resolveScaleTargetNoteIndex(selectedScale, currentDegree, scaleKey)
            if (targetNoteIdx === undefined) {
              logger.warn('[scale] 未知音级标签，练习无法推进', currentDegree, selectedScale.name)
              break
            }
            isCorrect =
              clickedIdx >= 0 &&
              judgeExpectation(
                buildSingleTargetExpectation({ label: currentDegree, targetSemitone: targetNoteIdx }),
                clickedIdx,
              ).hit
          }
          break
        }

        case "interval": {
          // 音程练习：候选推导与音频 / MIDI 两条路径共用 `buildIntervalExpectation`。
          // 🚨 抽取前这里把 `currentIntervalExercise.interval?.semitones`（**本题目音程**）
          //    当成「当前期望半音」⇒ display 含多个不同音级时（如 `"3 5"`）必然判错；
          //    只有「恰好等于本题音程的那一个音级」才判得对。
          if (currentIntervalExercise) {
            const clickedIdx = noteNameToPitchClass(clickedNote)
            const expectation = buildIntervalExpectation({
              display: currentIntervalExercise.currentIntervalDisplay,
              completedIndexes: currentIntervalExercise.completedIntervals,
              findRootFirst,
              rootSemitone: getNoteIndex(currentIntervalExercise.rootNote),
              strictOrder: true,
              allIntervals: currentIntervalExercise.allIntervals,
              fallbackSemitoneOf: (label) => DEGREE_TO_SEMITONE[label],
            })
            const verdict = judgeExpectation(expectation, clickedIdx)
            isCorrect =
              clickedIdx >= 0 &&
              verdict.hit &&
              // 相对上下行：与 MIDI / 音频路径同一口径（基准由根音那次点击写入）
              isIntervalDirectionOk(
                currentIntervalExercise,
                verdict.matchedLabel ?? '',
                positionToMidi({ stringIndex, fret }),
                intervalRootMidiRef.current,
              )
          }
          break
        }

        case "chord": {
          // 和弦转换练习：与音频 / MIDI 两条路径同一 builder。
          // 🚨 这里原用 `chordType.intervals`（**和弦的完整定义**，弹中任一和弦内音即绿），
          //    而音频与 MIDI 两条路径用 `getChordDegrees(...)`（**当前 level 的 voicing**，
          //    并叠加 voice leading）⇒ 点击比实际推进宽松。现统一到 voicing 侧。
          const chords = transposedChords
          const currentChord = chords[currentChordIndex]
          if (currentChord) {
            const rootIdx = getNoteIndex(currentChord.root)
            const clickedIdx = noteNameToPitchClass(clickedNote)
            let degrees = getChordDegrees(currentChord.type, practiceLevel, getLevelOptions())
            if (shouldVoiceLeadRef.current && lastChordNoteRef.current) {
              degrees = applyVoiceLeading(degrees, currentChord.root, lastChordNoteRef.current)
            }
            if (rootIdx >= 0 && clickedIdx >= 0) {
              isCorrect = judgeExpectation(
                buildChordMembershipExpectation({
                  rootSemitone: rootIdx,
                  intervals: degrees
                    .map((d) => DEGREE_TO_SEMITONE[d])
                    .filter((s): s is number => s !== undefined),
                }),
                clickedIdx,
              ).hit
            }
          }
          break
        }
      }
      
      setHighlightedFrets(prev => new Map(prev).set(key, isCorrect))
      
      if (isCorrect) {
        triggerCorrectFeedback(clickedNote)
      } else {
        triggerWrongFeedback(clickedNote)
      }

      // 反馈音用**真实吉他采样**：把点击位置的音高一起传下去（采样按音高移调）
      playFeedbackSound(isCorrect, guitarPositionToMidi(stringIndex, fret) ?? undefined)

      // P3-2：先清掉上一轮遗留的两个定时器，再挂新的；句柄存入 ref 以便 stop/tab 切换时清理。
      clearFretClickTimers()
      fretClickTimersRef.current = [
        setTimeout(() => {
          setHighlightedFrets(prev => {
            const next = new Map(prev)
            next.delete(key)
            return next
          })
        }, 500),
        setTimeout(() => {
          // 🚨 位置**随调用传参**（不是共享 ref）：连点时每次点击都带着自己的格子推进，
          //    不会出现「A 的定时器消费了 B 的位置」。
          handleMIDINoteInput(clickedNote, undefined, { stringIndex, fret })
        }, 100),
      ]
    }
  }, [isPlaying, handleMIDINoteInput, activeTab, targetNote, isPracticePositionAllowed, chordExerciseTargetChord, chordExerciseSequence, chordExerciseCurrentStep, scaleExerciseSequence, scaleExerciseCurrentStep, scaleKey, selectedScale, currentIntervalExercise, currentChordIndex, playFeedbackSound, findRootFirst, fretZoneEnabled, fretZoneStart, fretZoneSize, fretCount, triggerCorrectFeedback, triggerWrongFeedback, transposedChords, clearFretClickTimers, practiceLevel, getLevelOptions, fretClickTimersRef, lastChordNoteRef, setHighlightedFrets, shouldVoiceLeadRef, chordExerciseOrder, intervalRootMidiRef, chordExerciseLastMidiRef])

  return { processPracticeMatch, handleMIDINoteInput, handleFretClick }
}
