/**
 * `usePracticeMatch` 的 options 工厂 —— 分组重构换来的**可测性**。
 *
 * 分组前它是 75 个平铺参数，任何一条行为测试都要凭空构造 75 个 mock（等于没法测）。
 * 现在测试只写自己关心的那几项：
 *
 *   const opts = makeAnswerOptions({ chord: { chordExerciseTargetChord: { root: 'C', type: 'Major' } } })
 *
 * 其余全走这里的默认桩。默认值的选择原则：**尽量「什么都不发生」**
 * （isPlaying=false、activeTab='practice'、所有序列为空），这样测试里出现的每个副作用
 * 都是它自己显式打开的那一项，不会被默认值污染。
 *
 * ⚠️ 返回值类型钉成 `UsePracticeMatchOptions`：接口加字段时这里会 tsc 报错，
 *    不会静默漏桩（那会让新字段在测试里恒 undefined）。
 */
import { vi } from 'vitest'
import type { UsePracticeMatchOptions } from '@/hooks/use-practice-match'

type DeepPartial<T> = { [K in keyof T]?: Partial<T[K]> }

/** ref 的简写 */
const ref = <T>(v: T) => ({ current: v })

export function makeAnswerOptions(overrides: DeepPartial<UsePracticeMatchOptions> = {}): UsePracticeMatchOptions {
  const base: UsePracticeMatchOptions = {
    runtime: {
      isPlayingRef: ref(false),
      activeTabRef: ref('practice'),
      sensitivityRef: ref(0.5),
      confidenceThresholdRef: ref(0.8),
      practiceAnswerModeRef: ref('fretboard'),
      isPlaying: false,
      activeTab: 'practice',
    },
    audio: {
      isCoolingDownRef: ref(false),
      cooldownRef: ref(null),
      noteConfirmStateRef: ref(null),
    },
    practice: {
      targetNoteRef: ref(null),
      targetNote: '',
      generateNewTargetRef: ref(null),
      generateNewTarget: vi.fn(),
    },
    interval: {
      currentIntervalExerciseRef: ref(null),
      currentIntervalExercise: null,
      setCurrentIntervalExercise: vi.fn(),
      setIntervalPracticeStep: vi.fn(),
      generateIntervalExerciseRef: ref(null),
      findRootFirstRef: ref(false),
      findRootFirst: false,
      addRootBackRef: ref(false),
    },
    scale: {
      scaleKeyRef: ref('C'),
      scaleKey: 'C',
      selectedScaleRef: ref({ name: 'Major', notes: [0, 2, 4, 5, 7, 9, 11], intervals: ['1', '2', '3', '4', '5', '6', '7'] }),
      selectedScale: { name: 'Major', notes: [0, 2, 4, 5, 7, 9, 11], intervals: ['1', '2', '3', '4', '5', '6', '7'] },
      scaleExerciseSequenceRef: ref([]),
      scaleExerciseSequence: [],
      scaleExerciseCurrentStepRef: ref(0),
      scaleExerciseCurrentStep: 0,
      setScaleExerciseCurrentStep: vi.fn(),
      nextScaleExerciseRef: ref(null),
      nextScaleExercise: vi.fn(),
      scaleComboRef: ref(0),
      scaleMaxComboRef: ref(0),
      setScaleCombo: vi.fn(),
      setScaleMaxCombo: vi.fn(),
    },
    chord: {
      chordExerciseTargetChordRef: ref(null),
      chordExerciseTargetChord: null,
      chordExerciseSequenceRef: ref([]),
      chordExerciseSequence: [],
      chordExerciseCurrentStepRef: ref(0),
      chordExerciseCurrentStep: 0,
      chordExerciseIsAnsweredRef: ref(false),
      setChordExerciseIsAnswered: vi.fn(),
      setChordExerciseCurrentStep: vi.fn(),
      nextChordExerciseRef: ref(null),
      nextChordExercise: vi.fn(),
      transposedChords: [],
      getTransposedChordsRef: ref(null),
      currentChordIndexRef: ref(0),
      currentChordIndex: 0,
      nextChordRef: ref(null),
      chordDegreeCurrentStepRef: ref(0),
      setChordDegreeCurrentStep: vi.fn(),
      practiceLevelRef: ref('single_chord_tones_root'),
      practiceLevel: 'single_chord_tones_root',
      getLevelOptions: () => ({
        forceNaturalFive: false,
        endOnStartingInterval: false,
        usePassingNoteBebopScale: false,
        sevenFlatNineScaleChoice: 'altered' as const,
      }),
      levelOptionsRef: ref({
        forceNaturalFive: false,
        endOnStartingInterval: false,
        usePassingNoteBebopScale: false,
        sevenFlatNineScaleChoice: 'altered' as const,
      }),
      shouldVoiceLeadRef: ref(false),
      nextChordInfoRef: ref(null),
      lastChordNoteRef: ref(null),
    },
    actions: {
      recordPositionStat: vi.fn(),
      setScore: vi.fn(),
      triggerCorrectFeedback: vi.fn(),
      triggerWrongFeedback: vi.fn(),
      playFeedbackSound: vi.fn(),
      setHighlightedFrets: vi.fn(),
      clearFretClickTimers: vi.fn(),
      lastFretClickPositionRef: ref(null),
      fretClickTimersRef: ref([]),
      fretZoneEnabled: false,
      fretZoneStart: 0,
      fretZoneSize: 5,
      fretCount: 15,
    },
  }

  // 逐组浅合并（组内字段覆盖即可 —— 组本身没有嵌套结构）
  return {
    runtime: { ...base.runtime, ...(overrides.runtime ?? {}) },
    audio: { ...base.audio, ...(overrides.audio ?? {}) },
    practice: { ...base.practice, ...(overrides.practice ?? {}) },
    interval: { ...base.interval, ...(overrides.interval ?? {}) },
    scale: { ...base.scale, ...(overrides.scale ?? {}) },
    chord: { ...base.chord, ...(overrides.chord ?? {}) },
    actions: { ...base.actions, ...(overrides.actions ?? {}) },
  }
}
