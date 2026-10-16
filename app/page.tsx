"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { savePracticeStats as saveToServer, getAllPracticeStats, PracticeStats as ServerPracticeStats } from "@/lib/stats-api"
import { deduplicateStats } from "@/lib/export-utils"
import { getLocalDateString, dbTimestampToLocalDate, getLocalDaysAgoStart } from "@/lib/utils"
import { useAppStore, useAudioSettings, usePracticeSettings, useMetronomeSettings, useScore, useIsPlaying, useDisplayScale, useUser, useChordSymbols, clampMetronomeBpm, clampMetronomeBeats } from "@/lib/store"
import { useChordExercise } from "@/hooks/use-chord-exercise"
import { useIntervalExercise } from "@/hooks/use-interval-exercise"
import { useStructureWindowDrag } from "@/hooks/use-structure-window-drag"
import { useFullscreen } from "@/hooks/use-fullscreen"
import { usePracticeStats } from "@/hooks/use-practice-stats"
import { useAudioDeviceEnumeration } from "@/hooks/use-audio-device-enumeration"
import { useFeedbackSound } from "@/hooks/use-feedback-sound"
import { useMetronomeScheduler } from "@/hooks/use-metronome-scheduler"
import { useTuner } from "@/hooks/use-tuner"
import { useAudioInput, type DetectedPitchForMatch } from "@/hooks/use-audio-input"
import { logger } from "@/lib/logger"
import { SONG_PROGRESSIONS } from "@/lib/page-songs"
import { transposeSongChords, parseIrealPro, parseIrealUrl } from "@/lib/song-chords"
import { CUSTOM_CHORD_STORAGE_KEY, parseStoredCustomChords, buildCustomChordsExport } from "@/lib/custom-chords-io"
import { filterAndGroupSongs } from "@/lib/song-filters"
import { setStringTuning } from "@/lib/string-tuning"
import {
  buildIntervalExpectation,
  buildChordMembershipExpectation,
  buildSingleTargetExpectation,
  judgeExpectation,
  noteNameToPitchClass,
  scoreDeltaFor,
} from "@/lib/answer-judge"
import type {
  PracticeType,
  PracticeStats,
  StatsTimeRange,
} from "@/lib/page-stats-types"
import { getStatsByTimeRange as computeStatsByTimeRange } from "@/lib/stats-range"
import {
  NOTES,
  NOTES_FLAT,
  CHORD_TYPES,
  SCALE_MODES,
  DEGREE_TO_SEMITONE,
} from "@/lib/page-theory-data"
import { resolveAvailableStringIndexes } from "@/lib/string-index"
import { buildDirectionalQueue, shuffle } from "@/lib/interval-direction"
import {
  normalizeNoteName,
  getNoteIndex,
  formatDegree,
  getChordDegrees,
  getChordDisplayName,
  formatChordShape,
  getNoteAtPosition,
  noteToSemitones,
  intervalToSemitones,
  normalizeChordType,
  parseChord,
  getScaleDisplayName,
  applyVoiceLeading,
  getScaleNoteNames,
  findNoteIndexInArray,
  preferSharp,
  preferFlat,
  generateScaleSequence,
  getNextKeyByMovement,
  getKeyNote,
  resolveScaleDegreeSemitone,
} from "@/lib/page-theory-functions"
import { resolveScaleTargetNoteIndex } from "@/lib/scale-target-note"
import { scaleDegreeLabels } from "@/lib/scale-degree-display"
import { getNoteButtonColor as computeNoteButtonColor } from "@/lib/fretboard-note-button-color"
import { ALL_PRACTICE_LEVELS, PRACTICE_MODE_GROUPS } from "@/lib/practice-levels"

// UI 层别名：沿用页面里的历史命名，数据统一来自 lib/practice-levels（唯一真相源）
const ALL_SOLO_LEVELS = ALL_PRACTICE_LEVELS
const LOCAL_PRACTICE_MODE_GROUPS = PRACTICE_MODE_GROUPS
import { resolveInstrumentConfig, PRACTICE_SUGGESTIONS } from "@/lib/practice-suggestions"
import { recordPositionResult, getPositionWeight, loadPositionStats } from "@/lib/position-stats"
import {
  isThreeNpsEligible,
  buildThreeNpsPositions,
  nextThreeNpsPositionIndex,
  threeNpsWindow,
  type ThreeNpsPosition,
  type ThreeNpsStep,
} from "@/lib/three-notes-per-string"
import { evaluatePitchMatch, findBestIntervalMatch, targetSemitoneOf } from "@/lib/pitch-match"
import type { ThreeNpsPreviewKind } from "@/lib/fretboard-cell-role"
import { getTabFretboardFlag, type TabFretboardFlag } from "@/lib/tab-fretboard-toggle"
import { applyRootFontSize } from "@/lib/display-scale"
import { confirmNote, resetNoteConfirmState } from "@/lib/note-confirm"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn, isTauriEnv } from "@/lib/utils"
import { ShortcutsHelpDialog } from "@/components/shortcuts-help-dialog"
import { ChordExerciseLevelSelector } from "@/components/chord-exercise-level-selector"
import { ChordExerciseControls } from "@/components/chord-exercise-controls"
import { IntervalControls } from "@/components/interval-controls"
import { PracticeModeControls } from "@/components/practice-mode-controls"
import { AudioInputNotice } from "@/components/audio-input-notice"
import { ChordProgressionControls } from "@/components/chord-progression-controls"
import { ChordStructureWindow } from "@/components/chord-structure-window"
import { ScaleControls } from "@/components/scale-controls"
import { AppHeader } from "@/components/app-header"
import { FullscreenOverlay } from "@/components/fullscreen-overlay"
import { PracticeFretboard } from "@/components/practice-fretboard"
import { GuitarRunFretboard } from "@/components/guitarrun-fretboard"
import { StatsPanel } from "@/components/stats-panel"
import { ChordExerciseKeyboard } from "@/components/chord-exercise-keyboard"
import { ChordProgressionKeyboard } from "@/components/chord-progression-keyboard"
import { ScaleKeyboard } from "@/components/scale-keyboard"
import { ChordDegreesDisplay } from "@/components/chord-degrees-display"
import { ScaleSequenceDisplay } from "@/components/scale-sequence-display"
import { ChordExerciseQuestion } from "@/components/chord-exercise-question"
import { IntervalQuestion } from "@/components/interval-question"
import { SongInfoDialog } from "@/components/song-info-dialog"
import { LevelInfoDialog } from "@/components/level-info-dialog"
import { PracticeSummaryDialog } from "@/components/practice-summary-dialog"
import { LevelSelectorDialog } from "@/components/level-selector-dialog"
import { SongSelectorDialog } from "@/components/song-selector-dialog"
import { FocusMode } from "@/components/focus-mode"
import { CustomSongEditor } from "@/components/custom-song-editor-ui"
import { MetronomeVisualizer } from "@/components/metronome-visualizer"
import { PositionHeatmap } from "@/components/position-heatmap"
import { TheoryPanel } from "@/components/theory-panel"
import {
  OnboardingProvider,
  OnboardingOverlay,
} from "@/components/onboarding"
import {
  Guitar,
  Play,
  Pause,
  RotateCcw,
  Target,
  Music,
  ChevronLeft,
  ChevronRight,
  ListMusic,
  X,
  Check,
  Activity,
  Maximize2,
  BarChart3,
  GripVertical,
  Square,
  BookOpen,
} from "lucide-react"
import { toast } from "sonner"
import { createTranslator } from '@/lib/i18n'
import { STATS_STORAGE_KEYS, clearStatsStorage } from '@/lib/stats-storage-keys'
import type { AudioDeviceInfo } from '@/lib/native-audio'

const FRET_MARKERS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24]

/** 音阶练习「练习序列」里表示一弦三音（3NPS）的选项 id */
const THREE_NPS_SEQUENCE_ID = '3nps'

/**
 * 音级标签 → 半音（mod 12）的解析**已搬到** `lib/page-theory-functions.ts` 的
 * `resolveScaleDegreeSemitone()` —— 原先这里是第二个真相源（一份手写表），
 * 既和 lib 里的 `degreeToSemitone`（**复合音程**语义）容易混淆，也让「兜底表有洞」
 * 这个 bug 无法被测试覆盖。搬过去后由 `__tests__/scale-degree-semitone.test.ts` 穷举钉住。
 */

/** 音阶练习「下一题」的描述。一弦三音模式下额外带把位信息（Marathon 推进靠它） */
type NextScaleExerciseInfo = {
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


// 练习建议数据由 @/lib/practice-suggestions 的 PRACTICE_SUGGESTIONS 提供（按乐器 + 双语 + 分类）



// ==================== 主组件 ====================


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


export default function FretMasterPage() {
  // ==================== Zustand Store 状态 ====================
  // ⚠️ store 仅用于读取 actions 与挂载期初值（actions 引用在 store 生命周期内稳定）。
  // 不要通过 store.xxx 读取需要响应式更新的状态——那不会触发重渲染。
  // 需要响应式的状态必须用下方 selector 单独订阅。
  const store = useAppStore.getState()
  // 响应式订阅：仅以下字段变化才会重渲染主组件
  const activeTab = useAppStore((s) => s.activeTab)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const focusMode = useAppStore((s) => s.focusMode)
  const audioSettings = useAudioSettings()
  const practiceSettings = usePracticeSettings()
  const metronomeSettings = useMetronomeSettings()
  const storeScore = useScore()
  const storeIsPlaying = useIsPlaying()
  const user = useUser()
  const chordSymbols = useChordSymbols()

  // 根据所选乐器派生指板配置（弦数/调弦/品数）
  const instrumentConfig = resolveInstrumentConfig(user.instrument)
  const STRING_COUNT = instrumentConfig.stringCount

  const language = user.language
  const setLanguage = store.setLanguage
  const theme = user.theme
  const setTheme = store.setTheme
  
  const chordScaleDisplay = user.chordScaleDisplay
  const noteAccidentalDisplay = user.noteAccidentalDisplay
  const setChordScaleDisplay = store.setChordScaleDisplay
  const setNoteAccidentalDisplay = store.setNoteAccidentalDisplay

  // 🚨 不要再在这里手写一份查表实现（历史上这里是 `TRANSLATIONS` + `|| key` 的第三份拷贝，
  // 与 `lib/i18n.ts` 的 `createTranslator` 重复，各自腐烂）。统一走 `createTranslator`，
  // 顺带让 `translateOr` 拿到精确的缺键判据 `t.hasKey`。
  const t = useMemo(() => createTranslator(language), [language])

  // 侧边栏菜单 - useMemo缓存避免每次渲染重新创建
  const sidebarMenuItems = useMemo(() => [
    { id: "practice", label: t('nav_practice'), Icon: Target },
    { id: "interval", label: t('nav_interval'), Icon: Activity },
    { id: "chord_exercise", label: t('nav_chord_exercise'), Icon: Guitar },
    { id: "chord", label: t('nav_chord'), Icon: ListMusic },
    { id: "scale", label: t('nav_scale'), Icon: Music },
    { id: "theory", label: t('nav_theory'), Icon: BookOpen },
    { id: "stats", label: t('nav_stats'), Icon: BarChart3 },
  ], [t])

  // 底部导航菜单 - useMemo缓存避免每次渲染重新创建
  const bottomNavItems = useMemo(() => [
    { id: "practice", label: t('nav_practice'), Icon: Target, shortLabel: t('nav_short_practice') },
    { id: "interval", label: t('nav_interval'), Icon: Activity, shortLabel: t('nav_short_interval') },
    { id: "chord_exercise", label: t('nav_chord_exercise'), Icon: Guitar, shortLabel: t('nav_short_chord_exercise') },
    { id: "chord", label: t('nav_chord'), Icon: ListMusic, shortLabel: t('nav_short_chord') },
    { id: "scale", label: t('nav_scale'), Icon: Music, shortLabel: t('nav_short_scale') },
    { id: "theory", label: t('nav_theory'), Icon: BookOpen, shortLabel: t('nav_short_theory') },
    { id: "stats", label: t('nav_stats'), Icon: BarChart3, shortLabel: t('nav_short_stats') },
  ], [t])

  // 客户端挂载状态
  const [mounted, setMounted] = useState(false)
  
  // 检测是否在 Tauri 环境
  const [isTauri, setIsTauri] = useState(false)
  
  // 应用主题
  useEffect(() => {
    setMounted(true)
    setIsTauri(isTauriEnv())
    // 清除所有主题类，仅保留当前主题
    const allThemeClasses = ['light', 'dark', 'forest-light', 'forest-dark', 'ocean-light', 'ocean-dark', 'sunset-light', 'sunset-dark', 'monochrome-light', 'monochrome-dark', 'rose-light', 'rose-dark', 'midnight-light', 'midnight-dark', 'sand-light', 'sand-dark', 'celadon-light', 'celadon-dark', 'lavender-light', 'lavender-dark', 'carbon-light', 'carbon-dark']
    const html = document.documentElement
    allThemeClasses.forEach(cls => html.classList.remove(cls))
    html.classList.add(theme)
    // 同步更新 html/body 的 inline 背景色（与 layout.tsx pre-hydration 脚本保持一致）
    // 避免 overscroll/滚动边界露出深色底
    const themeBgMap: Record<string, string> = {
      'light': '#eeebe6', 'dark': '#101317',
      'forest-light': '#dbe5d6', 'forest-dark': '#0d1410',
      'ocean-light': '#d9e6f2', 'ocean-dark': '#0a1420',
      'sunset-light': '#f5e0d4', 'sunset-dark': '#1a0e0a',
      'monochrome-light': '#e8e8e8', 'monochrome-dark': '#0a0a0a',
      'rose-light': '#f0dce0', 'rose-dark': '#1a0d11',
      'midnight-light': '#dfe1f0', 'midnight-dark': '#080a1a',
      'sand-light': '#ede0c8', 'sand-dark': '#1a140d',
      'celadon-light': '#dce8e0', 'celadon-dark': '#0a1410',
      'lavender-light': '#e2dcec', 'lavender-dark': '#0f0a1a',
      'carbon-light': '#e0e0e0', 'carbon-dark': '#0a0a0a'
    }
    const bg = themeBgMap[theme] || '#101317'
    html.style.backgroundColor = bg
    if (document.body) {
      document.body.style.backgroundColor = bg
    }
  }, [theme])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    const isSecure = window.isSecureContext || window.location.protocol === 'https:' || isLocalhost
    const isTauriEnvCheck = isTauriEnv()
    if (!isSecure && !isTauriEnvCheck) {
      toast.error(language === 'zh-CN' 
        ? '⚠️ 当前使用 HTTP，麦克风功能不可用。请使用 HTTPS 访问。'
        : '⚠️ HTTP detected. Microphone requires HTTPS. Please use HTTPS.',
        { duration: 8000 }
      )
    }
  }, [language])

  // 核心状态 - 从 Store 获取
  const setActiveTab = store.setActiveTab
  const setSidebarCollapsed = store.toggleSidebar
  const setSettingsOpen = store.setSettingsOpen
  // 全屏：响应式订阅与切换处理由 useFullscreen 提供（传入 isTauri 决定是否走原生全屏）
  const {
    isFullscreen,
    handleToggleFullscreen,
    setFullscreenMode,
  } = useFullscreen(isTauri)
  const displayScale = useDisplayScale()

  // 专注模式：面板为浮动侧边形态（a3815f9a2）；「自动全屏」由 enableFullscreen 控制 ——
  // 进入 / 退出两侧都只在开关打开时动作（成对；关掉开关 = 完全不碰全屏状态，
  // 不打扰用户手动切换的全屏）。进入侧带 !isFullscreen 守卫防重复调用；
  // 全屏方向（窗口全屏 / 真全屏）由 useFullscreen 按 focusMode.fullscreenMode 分派。
  const prevFocusModeEnabled = useRef(focusMode?.enabled)
  useEffect(() => {
    if (focusMode?.enabled !== prevFocusModeEnabled.current) {
      prevFocusModeEnabled.current = focusMode?.enabled
      if (focusMode?.enableFullscreen) {
        if (focusMode?.enabled) {
          if (!isFullscreen) handleToggleFullscreen(true)
        } else if (isFullscreen) {
          handleToggleFullscreen(false)
        }
      }
    }
  }, [focusMode?.enabled, focusMode?.enableFullscreen, isFullscreen, handleToggleFullscreen])

  // html.fullscreen-mode 类的同步统一由 LayoutShell 负责（同时处理 body 样式），
  // 此处不再重复操作，避免三处维护同一状态导致不一致。

  // 练习模式状态
  const isPlaying = storeIsPlaying
  const setIsPlaying = store.setIsPlaying
  const score = storeScore
  const setScore = store.setScore
  
  // 找音练习状态
  const [targetNote, setTargetNote] = useState<string>("C")
  const [showAllNotes, setShowAllNotes] = useState(false)
  const [selectedStrings, setSelectedStrings] = useState<number[]>([1, 2, 3, 4, 5, 6]) // 默认选中所有弦（切换乐器时由 effect 重置）

  // 切换乐器时同步调弦（供 getNoteAtPosition 读取），并校正 selectedStrings
  // 注意：需在渲染期间同步更新，确保本次渲染的指板即使用新调弦
  setStringTuning(instrumentConfig.tuning)
  useEffect(() => {
    setSelectedStrings(prev => {
      const filtered = prev.filter(n => n <= STRING_COUNT)
      return filtered.length > 0
        ? filtered
        : Array.from({ length: STRING_COUNT }, (_, i) => i + 1)
    })
  }, [user.instrument, STRING_COUNT])
  
  // 找音练习新模式：指板点亮 + 音名按钮答题
  const [practiceAnswerMode, setPracticeAnswerMode] = useState<"fretboard" | "buttons">("fretboard") // 答题模式：指板点击或按钮选择
  const practiceAnswerModeRef = useRef<"fretboard" | "buttons">("fretboard") // 答题模式 ref，供音频检测回调使用
  const [highlightedTargetPosition, setHighlightedTargetPosition] = useState<{stringIndex: number, fret: number} | null>(null) // 高亮的目标位置
  const highlightedTargetPositionRef = useRef<{ stringIndex: number; fret: number } | null>(null) // 目标位置 ref，供音频/MIDI 回调读取
  // 指板点击路径暂存的位置（handleMIDINoteInput 消费后清除；音频/MIDI 直发时为 null，回退到目标位置）
  const lastFretClickPositionRef = useRef<{ stringIndex: number; fret: number } | null>(null)
  useEffect(() => {
    highlightedTargetPositionRef.current = highlightedTargetPosition
  }, [highlightedTargetPosition])

  // 逐位置掌握度统计：记录一次判定（找音练习三路径共用：指板点击 / 音频 / MIDI / 按钮）
  const recordPositionStat = useCallback((isCorrect: boolean) => {
    const pos = lastFretClickPositionRef.current ?? highlightedTargetPositionRef.current
    lastFretClickPositionRef.current = null
    if (!pos) return
    recordPositionResult(user.instrument, pos.stringIndex, pos.fret, isCorrect)
  }, [user.instrument])

  // 切换乐器时加载该乐器的位置统计（幂等）；同时预取当前乐器
  useEffect(() => {
    loadPositionStats(user.instrument).catch(e => logger.error('加载位置统计失败', e))
  }, [user.instrument])
  
  // 找音练习建议
  const [showPracticeSuggestions, setShowPracticeSuggestions] = useState(false)
  const [currentPracticeSuggestion, setCurrentPracticeSuggestion] = useState<string>("")

  // ==================== 统计模块状态 ====================
  // 练习统计：状态与记录逻辑由 usePracticeStats 提供（同名解构，正文用法不变）
  const {
    practiceStats,
    setPracticeStats,
    practiceSessionStartTime,
    setPracticeSessionStartTime,
    practiceElapsedTime,
    setPracticeElapsedTime,
    scoreRef,
    pendingSaveRef,
    recordPractice,
  } = usePracticeStats()
  const [statsTimeRange, setStatsTimeRange] = useState<StatsTimeRange>('today')
  const [highlightedFrets, setHighlightedFrets] = useState<Map<string, boolean>>(new Map())
  const practiceTime = practiceSettings.practiceTime
  const setPracticeTime = store.setPracticeTime
  const [timeLeft, setTimeLeft] = useState(300)
  const fretCount = practiceSettings.fretCount
  const setFretCount = store.setFretCount
  const fretZoneEnabled = practiceSettings.fretZoneEnabled
  const fretZoneStart = practiceSettings.fretZoneStart
  const fretZoneSize = practiceSettings.fretZoneSize
  const octaveShiftEnabled = practiceSettings.octaveShiftEnabled
  const octaveShiftMode = practiceSettings.octaveShiftMode
  const weaknessWeightedEnabled = practiceSettings.weaknessWeightedEnabled
  const [pitchFindingTime, setPitchFindingTime] = useState(5) // 找音练习时长（分钟）

  // 音程练习：state/ref 与出题回调均由 useIntervalExercise 提供（同名解构，正文用法不变）
  const {
    rootNote,
    setRootNote,
    selectedIntervals,
    intervalRootMode,
    setIntervalRootMode,
    findRootFirst,
    setFindRootFirst,
    addRootBack,
    setAddRootBack,
    setIntervalPracticeStep,
    currentIntervalExercise,
    setCurrentIntervalExercise,
    showIntervalFretboard,
    setShowIntervalFretboard,
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
    generateIntervalExercise,
    toggleInterval,
  } = useIntervalExercise()
  
  // 和弦进行状态
  const [selectedSong, setSelectedSong] = useState(SONG_PROGRESSIONS[0])
  const [customChords, setCustomChords] = useState<{ root: string; type: string; bass?: string }[]>([])
  const [currentChordIndex, setCurrentChordIndex] = useState(0)
  const [chordPlayOrder, setChordPlayOrder] = useState<"asc" | "desc" | "random">(store.chordProgression.playOrder)
  const [practiceLevel, setPracticeLevel] = useState(store.chordProgression.selectedLevelId)
  // 调性状态：存储音名（如 "E"），小调状态单独存储
  const isKeyMinor = (key: string): boolean => key.endsWith('m')
  const [progressionKey, setProgressionKey] = useState(normalizeNoteName(store.chordProgression.progressionKey || getKeyNote(SONG_PROGRESSIONS[0]?.key || "C")))
  const [isMinor, setIsMinor] = useState(isKeyMinor(SONG_PROGRESSIONS[0]?.key || "C"))
  const [progressionRepeat, setProgressionRepeat] = useState(store.chordProgression.shouldRepeat)
  const [shouldVoiceLead, setShouldVoiceLead] = useState(store.chordProgression.shouldVoiceLead)
  const [shouldRandomizeKeyOnRepeat, setShouldRandomizeKeyOnRepeat] = useState(store.chordProgression.randomizeKeyOnRepeat)
  const [songSortOption] = useState<'titleAsc' | 'titleDesc' | 'styleAsc' | 'styleDesc'>(store.chordProgression.songSortOption)
  
  // 获取转调后的和弦列表 - 使用useMemo缓存
  // 获取转调后的和弦列表 - 使用useMemo缓存（转调实现见 lib/song-chords.ts）
  const transposedChords = useMemo(
    () => transposeSongChords(customChords, selectedSong, progressionKey),
    [customChords, selectedSong, progressionKey]
  )
  
  const [levelForceNaturalFive, setLevelForceNaturalFive] = useState(true)
  const [levelEndOnStartingInterval, setLevelEndOnStartingInterval] = useState(false)
  const [levelUsePassingNoteBebopScale, setLevelUsePassingNoteBebopScale] = useState(false)

  const getLevelOptions = useCallback(() => ({
    forceNaturalFive: levelForceNaturalFive,
    endOnStartingInterval: levelEndOnStartingInterval,
    usePassingNoteBebopScale: levelUsePassingNoteBebopScale,
    sevenFlatNineScaleChoice: chordSymbols.sevenFlatNineScaleChoice,
  }), [levelForceNaturalFive, levelEndOnStartingInterval, levelUsePassingNoteBebopScale, chordSymbols.sevenFlatNineScaleChoice])
  const [isPracticePaused, setIsPracticePaused] = useState(false)
  const [irealInput, setIrealInput] = useState("")
  const [newChordRoot, setNewChordRoot] = useState("C")
  const [newChordType, setNewChordType] = useState("Major")
  const [newChordBass] = useState<string | undefined>(undefined)
  const [customChordName, setCustomChordName] = useState("")
  
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
  
  // 和弦转换练习状态
  const [showFretboard, setShowFretboard] = useState(false)
  // 「显示指板 / 结构」都是**辅助**开关（铁律 18：先用它辅助、再关掉凭记忆找音）：
  // 初值必须是 false —— 从 store 取会让「上次会话按过 ↑」在下次进来时把答案直接摆出来
  // （2026-10-02 真机确证：reload 后仍 checked）。
  const [showChordFretboard, setShowChordFretboard] = useState(false)
  const [showChordStructure, setShowChordStructure] = useState(false)
  const [nextChordInfo, setNextChordInfo] = useState<{index: number, root: string, type: string, bass?: string, degrees: string[]} | null>(null)
  const [chordDegreeCurrentStep, setChordDegreeCurrentStep] = useState(0)

  // 和弦练习状态
  // 和弦练习：state/ref 与出题回调均由 useChordExercise 提供（同名解构，正文用法不变）
  const {
    chordExerciseRoot,
    setChordExerciseRoot,
    chordExerciseTypes,
    setChordExerciseTypes,
    chordExerciseLevel,
    setChordExerciseLevel,
    chordExerciseOrder,
    setChordExerciseOrder,
    chordExerciseBass,
    setChordExerciseBass,
    showChordExerciseFretboard,
    setShowChordExerciseFretboard,
    chordExerciseCurrentStep,
    setChordExerciseCurrentStep,
    chordExerciseSequence,
    setChordExerciseSequence,
    chordExerciseTargetChord,
    setChordExerciseTargetChord,
    chordExerciseIsAnswered,
    setChordExerciseIsAnswered,
    nextChordExerciseInfo,
    setNextChordExerciseInfo,
    showChordExerciseStructure,
    setShowChordExerciseStructure,
    showChordExerciseLevelSelector,
    setShowChordExerciseLevelSelector,
    showChordExerciseKeyboard,
    setShowChordExerciseKeyboard,
    nextChordExerciseRef,
    chordExerciseIsAnsweredRef,
    chordExerciseTargetChordRef,
    chordExerciseSequenceRef,
    chordExerciseCurrentStepRef,
    generateChordExercise,
    nextChordExercise,
  } = useChordExercise()

  /**
   * 开关名 → setter 的对照表（**只写一次**）。
   *
   * 键必须是 `lib/tab-fretboard-toggle.ts` 的 `TAB_FRETBOARD_FLAG` 里的名字，
   * 由 `Record<TabFretboardFlag, …>` 在类型层钉住 —— 真相源加了一个 tab、这里漏了 setter，
   * `tsc` 当场报错，不会静默变成「那个 tab 按 ↑ 没反应」。
   */
  const SET_TAB_FRETBOARD = useMemo<Record<TabFretboardFlag, (v: boolean) => void>>(() => ({
    showFretboard: setShowFretboard,
    showIntervalFretboard: setShowIntervalFretboard,
    showChordExerciseFretboard: setShowChordExerciseFretboard,
    showChordFretboard: setShowChordFretboard,
    showScaleFretboard: setShowScaleFretboard,
  }), [setShowFretboard, setShowIntervalFretboard, setShowChordExerciseFretboard, setShowChordFretboard, setShowScaleFretboard])

  // 正确答案反馈状态
  // 反馈音与正误提示：由 useFeedbackSound 提供（同名解构，正文用法不变）
  const {
    showCorrectFeedback,
    correctFeedbackNote,
    showWrongFeedback,
    wrongFeedbackNote,
    playFeedbackSound,
    triggerCorrectFeedback,
    triggerWrongFeedback,
  } = useFeedbackSound()
  const [showPracticeSummary, setShowPracticeSummary] = useState(false)
  const [practiceSummaryData, setPracticeSummaryData] = useState<{correct: number, total: number, duration: number}>({correct: 0, total: 0, duration: 0})

  // 近期练习记录（从服务器加载，用于统计页展示）
  const [recentRecords, setRecentRecords] = useState<ServerPracticeStats[]>([])

  // 统计数据缓存版本：升级此版本号会自动清除旧的 localStorage 统计缓存
  // 用于修复历史脏数据（如重复记录、错误时区数据等）
  useEffect(() => {
    if (typeof window === 'undefined') return
    const CACHE_VERSION = 'v3-20260716'  // v3: 清除路由器清理后残留的本地缓存
    // P3-3：隐私模式 / 配额超限时 localStorage 读写会抛异常，而 error boundary 拦不住
    // effect 内抛出的异常 ⇒ 整条 effect 崩掉、后续初始化静默不执行。必须整体包 try/catch。
    try {
      const stored = localStorage.getItem(STATS_STORAGE_KEYS.version)
      if (stored !== CACHE_VERSION) {
        localStorage.removeItem(STATS_STORAGE_KEYS.stats)
        localStorage.setItem(STATS_STORAGE_KEYS.version, CACHE_VERSION)
        logger.info('已清除旧的统计数据缓存', { from: stored, to: CACHE_VERSION })
      }
    } catch (e) {
      console.warn('Failed to migrate stats cache version:', e)
    }
  }, [])

  // 和弦练习状态

  // 和弦转换练习状态
  const [showChordKeyboard, setShowChordKeyboard] = useState(false)

  // 乐曲选择弹窗状态
  const [showSongSelector, setShowSongSelector] = useState(false)
  const [songSearchQuery, setSongSearchQuery] = useState("")
  const [songSortBy, setSongSortBy] = useState<"title-asc" | "title-desc" | "style-asc" | "style-desc" | "composer-asc" | "composer-desc" | "year-asc" | "year-desc">("title-asc")
  const [selectedSongInfo, setSelectedSongInfo] = useState<typeof SONG_PROGRESSIONS[0] | null>(null)
  const [showSongInfoDialog, setShowSongInfoDialog] = useState(false)
  const [showCustomSongEditor, setShowCustomSongEditor] = useState(false)

  // 缓存歌曲分组结果 - 避免每次渲染重新计算
  const groupedSongs = useMemo(() => 
    filterAndGroupSongs(SONG_PROGRESSIONS, songSearchQuery, songSortBy),
    [songSearchQuery, songSortBy]
  )

  // 练习模式选择弹窗状态
  const [showLevelSelector, setShowLevelSelector] = useState(false)
  const [selectedLevelInfo, setSelectedLevelInfo] = useState<typeof ALL_PRACTICE_LEVELS[0] | null>(null)
  const [showLevelInfoDialog, setShowLevelInfoDialog] = useState(false)

  // 快捷键帮助状态
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)
  
  // 节拍器状态 - 从 Store 获取
  const metronomeEnabled = metronomeSettings.enabled
  const metronomeBpm = metronomeSettings.bpm
  const setMetronomeBpm = store.setMetronomeBpm
  const setMetronomeBeatsPerMeasure = store.setMetronomeBeatsPerMeasure
  const metronomeSound = metronomeSettings.sound
  const metronomeFlash = metronomeSettings.flash
  const metronomeBeats = metronomeSettings.beatsPerMeasure

  // 节拍器的**单一**调度器（#14）：由音频时钟 lookahead 排程，并把拍事件广播给可视化。
  // 放在这里（而不是页面下方的效果块里）是为了让声音与画面共用同一个时钟 —— 见 hook 注释。
  useMetronomeScheduler({
    enabled: metronomeEnabled,
    isPlaying,
    bpm: metronomeBpm,
    beatsPerMeasure: metronomeBeats,
    sound: metronomeSound,
    flash: metronomeFlash,
    visualize: metronomeSettings.visualize ?? false,
  })
  
  // 音频输入状态 - 从 Store 获取
  const micEnabled = audioSettings.micEnabled
  const setMicEnabled = store.setMicEnabled
  const setMicUserPreference = store.setMicUserPreference
  const setAudioInitializing = store.setAudioInitializing
  const setAudioError = store.setAudioError
  const selectedAudioDevice = audioSettings.selectedAudioDevice
  const setDetectedPitch = store.setDetectedPitch
  const setDetectedCents = store.setDetectedCents
  const inputGain = audioSettings.inputGain
  const setInputGain = store.setInputGain

  // ---- 环境噪声校准（P1）----
  // 「量一次房间」的用户触发流程，测量口径见 lib/noise-calibration.ts。
  // 结果写进 store 的 audio.noiseFloor（会随其它音频设置一起持久化），并在当下立刻
  // 下发给 worklet / TS 两条收音路径 —— 校准的意义就是「现在这间屋子」，
  // 等到下次重开麦克风才生效等于没校。
  const noiseFloor = audioSettings.noiseFloor
  const setNoiseFloor = store.setNoiseFloor
  
  // MIDI状态
  const [midiEnabled, setMidiEnabled] = useState(false)
  const [selectedMidiDevice, setSelectedMidiDevice] = useState<string>("random")
  
  // 设置状态 - 从 Store 获取
  const cooldownEnabled = practiceSettings.cooldownEnabled
  const setCooldownEnabled = store.setCooldownEnabled
  const cooldownDuration = practiceSettings.cooldownDuration
  const setCooldownDuration = store.setCooldownDuration
  const confidenceThreshold = audioSettings.confidenceThreshold
  const setConfidenceThreshold = store.setConfidenceThreshold
  const sensitivity = audioSettings.sensitivity
  const setSensitivity = store.setSensitivity

  const referenceFrequency = practiceSettings.referenceFrequency
  const setReferenceFrequency = store.setReferenceFrequency

  // 🚨 P3-2：`handleFretClick` 里两个「答完延迟清高亮 / 送 MIDI」的裸 `setTimeout`。
  //    用户点完 100ms 内就停止练习（或切 tab、答案模式）时，旧闭包仍按 `isPlaying=true`
  //    往下走 ⇒ 给已经结束的这局记分 +1、高亮状态被过期定时器改写。
  //    这里统一持有句柄：新一轮点击先清上一轮，组件卸载时也清。
  const fretClickTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const clearFretClickTimers = useCallback(() => {
    for (const timer of fretClickTimersRef.current) clearTimeout(timer)
    fretClickTimersRef.current = []
  }, [])
  // 卸载时清掉在途的点击定时器（否则会在已卸载组件上 setState）。
  useEffect(() => clearFretClickTimers, [clearFretClickTimers])

  // 浮动窗口拖动：state/ref 与拖拽回调均由 useStructureWindowDrag 提供（同名解构，正文用法不变）
  const {
    chordStructurePosition,
    setChordStructurePosition,
    scaleStructurePosition,
    setScaleStructurePosition,
    chordExerciseStructurePosition,
    setChordExerciseStructurePosition,
    dragRef,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
  } = useStructureWindowDrag()

  // Refs
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const handleMIDINoteInputRef = useRef<((note: string) => void) | null>(null)
  const nextScaleExerciseRef = useRef<(() => void) | null>(null)
  const generateNewTargetRef = useRef<(() => void) | null>(null)
  const togglePracticeRef = useRef<(() => void) | null>(null)
  const nextChordRef = useRef<(() => void) | null>(null)
  const practiceCardRef = useRef<HTMLDivElement | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  
  
  // 状态refs - 用于音高检测回调中获取最新状态
  const isPlayingRef = useRef(isPlaying)
  const activeTabRef = useRef(activeTab)
  const sensitivityRef = useRef(sensitivity)
  const confidenceThresholdRef = useRef(confidenceThreshold)
  const pitchAlgorithmRef = useRef(audioSettings.pitchAlgorithm)
  const targetNoteRef = useRef(targetNote)
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
  const currentChordIndexRef = useRef(currentChordIndex)
  const chordDegreeCurrentStepRef = useRef(chordDegreeCurrentStep)
  const practiceLevelRef = useRef(practiceLevel)
  const findRootFirstRef = useRef(findRootFirst)
  const addRootBackRef = useRef(addRootBack)
  const nextChordInfoRef = useRef(nextChordInfo)
  const getTransposedChordsRef = useRef<(() => { root: string; type: string }[]) | null>(null)
  const lastChordNoteRef = useRef<string | null>(null) // 用于 voice leading
  const shouldVoiceLeadRef = useRef(shouldVoiceLead)
  const shouldRandomizeKeyOnRepeatRef = useRef(shouldRandomizeKeyOnRepeat)
  const progressionRepeatRef = useRef(progressionRepeat)
  const levelOptionsRef = useRef(getLevelOptions())

  // ==================== 效果 ====================
  
  // 更新状态refs - 确保音高检测回调中能获取最新状态（合并为一个useEffect减少重渲染）
  useEffect(() => {
    isPlayingRef.current = isPlaying
    activeTabRef.current = activeTab
    sensitivityRef.current = sensitivity
    confidenceThresholdRef.current = confidenceThreshold
    pitchAlgorithmRef.current = audioSettings.pitchAlgorithm
    scoreRef.current = score
    targetNoteRef.current = targetNote
    scaleKeyRef.current = scaleKey
    scaleExerciseSequenceRef.current = scaleExerciseSequence
    scaleExerciseCurrentStepRef.current = scaleExerciseCurrentStep
    selectedScaleRef.current = selectedScale
    chordExerciseTargetChordRef.current = chordExerciseTargetChord
    chordExerciseSequenceRef.current = chordExerciseSequence
    chordExerciseCurrentStepRef.current = chordExerciseCurrentStep
    currentIntervalExerciseRef.current = currentIntervalExercise
    currentChordIndexRef.current = currentChordIndex
    chordDegreeCurrentStepRef.current = chordDegreeCurrentStep
    practiceLevelRef.current = practiceLevel
    findRootFirstRef.current = findRootFirst
    addRootBackRef.current = addRootBack
    nextChordInfoRef.current = nextChordInfo
    shouldVoiceLeadRef.current = shouldVoiceLead
    shouldRandomizeKeyOnRepeatRef.current = shouldRandomizeKeyOnRepeat
    progressionRepeatRef.current = progressionRepeat
    levelOptionsRef.current = getLevelOptions()
  }, [isPlaying, activeTab, sensitivity, confidenceThreshold, targetNote, scaleKey, scaleExerciseSequence, scaleExerciseCurrentStep, selectedScale, chordExerciseTargetChord, chordExerciseSequence, chordExerciseCurrentStep, currentIntervalExercise, currentChordIndex, chordDegreeCurrentStep, practiceLevel, findRootFirst, nextChordInfo, shouldVoiceLead, shouldRandomizeKeyOnRepeat, progressionRepeat, getLevelOptions, audioSettings.pitchAlgorithm, chordSymbols.sevenFlatNineScaleChoice, score, scoreRef, chordExerciseTargetChordRef, chordExerciseSequenceRef, chordExerciseCurrentStepRef, currentIntervalExerciseRef, addRootBack])

  const setIntervalPracticeSettings = store.setIntervalPracticeSettings
  useEffect(() => {
    setIntervalPracticeSettings({
      selectedIntervals,
      rootMode: intervalRootMode,
      rootNote,
      findRootFirst,
      addRootBack,
      direction: intervalDirection,
      randomizeOrder: intervalRandomizeOrder,
      practiceDuration: intervalPracticeDuration,
      fretboardDuration: intervalFretboardDuration,
      autoAdvance: intervalAutoAdvance,
    })
  }, [selectedIntervals, intervalRootMode, rootNote, findRootFirst, addRootBack, intervalDirection, intervalRandomizeOrder, intervalPracticeDuration, intervalFretboardDuration, intervalAutoAdvance, setIntervalPracticeSettings])

  const setChordProgressionSettings = store.setChordProgressionSettings
  useEffect(() => {
    setChordProgressionSettings({
      selectedLevelId: practiceLevel,
      progressionKey,
      playOrder: chordPlayOrder,
      shouldRepeat: progressionRepeat,
      shouldVoiceLead,
      randomizeKeyOnRepeat: shouldRandomizeKeyOnRepeat,
      songSortOption,
    })
  }, [practiceLevel, progressionKey, chordPlayOrder, progressionRepeat, shouldVoiceLead, shouldRandomizeKeyOnRepeat, songSortOption, setChordProgressionSettings])

  // 从服务器/SQLite加载统计数据
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Tauri 环境首次运行：清理历史 localStorage 备份，避免从 Web 版迁移或早期版本遗留的脏数据
    // 被错误加载（导致"未使用却显示练习记录"）
    // 仅首次运行执行（用 CLEANED_FLAG 标记），避免每次启动都清掉当次未保存的会话
    const CLEANED_FLAG = 'fretmaster-tauri-localstorage-cleaned'
    if (isTauri && !localStorage.getItem(CLEANED_FLAG)) {
      try {
        // P3-11：两个键名统一由 clearStatsStorage() 清理（历史上此处漏过一个键 ⇒ 留脏数据）
        clearStatsStorage()
        localStorage.setItem(CLEANED_FLAG, '1')
      } catch (e) {
        console.warn('Failed to clean legacy localStorage stats:', e)
      }
    }

    const loadStatsFromServer = async () => {
      try {
        const serverStats = await getAllPracticeStats()
        
        const newStats: PracticeStats = {
          daily: [],
          total: {
            count: 0,
            byType: {
              pitch_finding: 0,
              scale: 0,
              chord_exercise: 0,
              interval: 0,
              chord_progression: 0
            },
            byDetail: {
              pitch_finding: [],
              scale: [],
              chord_exercise: [],
              interval: [],
              chord_progression: []
            }
          }
        }
        
        const typeMapping: Record<string, PracticeType> = {
          '音高识别': 'pitch_finding',
          '音阶练习': 'scale',
          '和弦练习': 'chord_exercise',
          '音程练习': 'interval',
          '和弦进行': 'chord_progression'
        }
        
        // 先对服务器返回的数据去重，避免旧版本 bug 产生的脏数据
        // （同一秒内多条同类型记录、或时间差小于 duration 的重复记录）
        // 导致统计虚高（例如"今天没练习却显示练习了"）
        const dedupedServerStats = deduplicateStats(serverStats as ServerPracticeStats[])
        
        dedupedServerStats.forEach((record: ServerPracticeStats) => {
          // 使用 dbTimestampToLocalDate 正确解析 SQLite/ISO 时间戳为本地日期
          // 避免 SQLite 的 "YYYY-MM-DD HH:MM:SS" (UTC) 被错误解析为本地时间
          const date = record.created_at
            ? dbTimestampToLocalDate(record.created_at)
            : getLocalDateString(new Date())
          const type = typeMapping[record.exercise_type] || 'pitch_finding'
          const detailName = record.notes?.replace('练习项目: ', '') || record.exercise_type
          
          newStats.total.count += 1
          newStats.total.byType[type] = (newStats.total.byType[type] || 0) + 1
          
          const detailList = newStats.total.byDetail[type] || []
          const existingDetail = detailList.find(d => d.name === detailName)
          if (existingDetail) {
            existingDetail.count += 1
          } else {
            detailList.push({ name: detailName, count: 1 })
          }
          newStats.total.byDetail[type] = detailList
          
          let todayStats = newStats.daily.find(d => d.date === date)
          if (!todayStats) {
            todayStats = {
              date: date,
              totalCount: 0,
              byType: {
                pitch_finding: 0,
                scale: 0,
                chord_exercise: 0,
                interval: 0,
                chord_progression: 0
              },
              byDetail: {
                pitch_finding: [],
                scale: [],
                chord_exercise: [],
                interval: [],
                chord_progression: []
              }
            }
            newStats.daily.push(todayStats)
          }
          
          todayStats.totalCount += 1
          todayStats.byType[type] = (todayStats.byType[type] || 0) + 1
          
          const todayDetailList = todayStats.byDetail[type] || []
          const todayExistingDetail = todayDetailList.find(d => d.name === detailName)
          if (todayExistingDetail) {
            todayExistingDetail.count += 1
          } else {
            todayDetailList.push({ name: detailName, count: 1 })
          }
          todayStats.byDetail[type] = todayDetailList
        })
        
        // 只保留最近90天的数据
        newStats.daily = newStats.daily
          .filter(d => {
            // 使用本地时区解析日期，避免 UTC 偏移导致数据被误删
            const parts = d.date.split('-')
            if (parts.length !== 3) return false
            const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
            const ninetyDaysAgo = getLocalDaysAgoStart(90)
            return date >= ninetyDaysAgo
          })
          .sort((a, b) => b.date.localeCompare(a.date))
        
        setPracticeStats(newStats)
        
        // 保存去重后的近期记录（最多 50 条，按时间倒序），供统计页展示
        setRecentRecords(dedupedServerStats.slice(0, 50))

        // Tauri 环境以 SQLite 为唯一真相源，不写入 localStorage，避免历史脏数据污染
        if (!isTauri) {
          // 服务器记录为 0 时（例如管理员清空了数据库），同步清空 localStorage 旧缓存
          if (dedupedServerStats.length === 0) {
            clearStatsStorage()
          } else {
            localStorage.setItem(STATS_STORAGE_KEYS.stats, JSON.stringify(newStats))
          }
        }
      } catch (e) {
        console.error('Failed to load stats:', e)
        // Tauri 环境失败时返回空统计，不读 localStorage 备份（避免历史脏数据导致"未练习却有记录"）
        if (!isTauri) {
          const savedStats = localStorage.getItem(STATS_STORAGE_KEYS.stats)
          if (savedStats) {
            try {
              const stats = JSON.parse(savedStats)
              setPracticeStats(stats)
            } catch (e) {
              console.error('Failed to load stats from localStorage:', e)
            }
          }
        }
      }
    }
    
    loadStatsFromServer()
  }, [isTauri, setPracticeStats])

  const savePracticeState = useCallback(() => {
    if (typeof window === 'undefined' || !isPlaying) return
    const state = {
      activeTab,
      score: storeScore,
      timeLeft,
      isPracticePaused,
      timestamp: Date.now(),
    }
    try {
      localStorage.setItem('fretmaster-practice-state', JSON.stringify(state))
    } catch (e) {
      logger.error('保存练习状态快照失败:', e)
    }
  }, [isPlaying, activeTab, storeScore, timeLeft, isPracticePaused])

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

  // 待持久化的统计载荷。放在 ref 中，由 [practiceStats] 的 effect 统一落库，
  // 使 recordPractice 的 state updater 保持纯函数（并发渲染下不会重复保存）。

  // 练习统计持久化（副作用集中在此 effect）：
  // - 移出 state updater，避免并发渲染下 updater 重复执行导致重复保存
  // - localStorage 写入加 try-catch，避免配额超限抛异常中断后续的 saveToServer
  useEffect(() => {
    const payload = pendingSaveRef.current
    if (!payload || typeof window === 'undefined') return
    pendingSaveRef.current = null

    if (!isTauri) {
      try {
        localStorage.setItem(STATS_STORAGE_KEYS.stats, JSON.stringify(practiceStats))
      } catch (e) {
        logger.error('保存练习统计到 localStorage 失败（可能超出配额）:', e)
      }
    }

    saveToServer({
      exercise_type: payload.detailName,
      score: payload.score,
      duration: payload.duration,
      accuracy: payload.accuracy,
      notes: `练习项目: ${payload.detailName}`
    }).catch(err => console.error('保存到服务器失败:', err))
  }, [practiceStats, isTauri, pendingSaveRef])

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
      const startTime = sessionStartRef.current
      const sessionScore = sessionScoreRef.current
      const sessionType = sessionTabRef.current
      sessionStartRef.current = null
      sessionTabRef.current = null
      // 仅在用户实际有答题时才记录，避免"开始后立即停止"也被计入
      if (sessionType && sessionScore.total > 0) {
        const accuracy = Math.round((sessionScore.correct / sessionScore.total) * 100)
        // 扣除暂停时间：practiceElapsedTime 是已累计的暂停秒数；
        // 若当前正处于暂停中，还要再减去本次暂停已持续的时间。
        const pausedSec = practiceElapsedTime +
          (isPracticePaused && practiceSessionStartTime ? (Date.now() - practiceSessionStartTime) / 1000 : 0)
        const duration = Math.max(1, Math.round((Date.now() - startTime!) / 1000 - pausedSec))
        // detailName 用类型对应的中文名
        const detailNames: Record<PracticeType, string> = {
          pitch_finding: '找音练习',
          interval: '音程练习',
          scale: '音阶练习',
          chord_exercise: '和弦练习',
          chord_progression: '和弦进行',
        }
        recordPractice(sessionType, detailNames[sessionType], { score: accuracy, duration, accuracy })
      }
    }
  }, [isPlaying, activeTab, score, recordPractice, practiceElapsedTime, isPracticePaused, practiceSessionStartTime])

  // 按时间范围取统计（实现已搬到 lib/stats-range.ts，这里只做 practiceStats 绑定，
  // 保持对下游组件的 prop 签名不变：组件仍只传 range）
  const getStatsByTimeRange = useCallback(
    (range: StatsTimeRange) => computeStatsByTimeRange(practiceStats, range),
    [practiceStats]
  )

  // ==================== 浮动窗口拖动功能 ====================

  // 使用 requestAnimationFrame 节流状态更新

  // 添加全局拖动事件监听
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => handleDragMove(e)
    const handleMouseUp = () => handleDragEnd()
    const handleTouchMove = (e: TouchEvent) => handleDragMove(e)
    const handleTouchEnd = () => handleDragEnd()
    
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('touchmove', handleTouchMove)
    window.addEventListener('touchend', handleTouchEnd)
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleDragMove, handleDragEnd])


  const saveSettings = useCallback(() => {
    toast.success(t('save_success'))
  }, [t])

  // 导出设置
  const exportSettings = useCallback(() => {
    const settings = {
      language,
      chordScaleDisplay,
      noteAccidentalDisplay,
      // 🚨 原先漏了 theme：import 侧读 `settings.theme`，而 export 侧没写它
      // ⇒ 换设备/重装后主题永远被重置成 dark（界面静默变样，且无从回溯）。
      theme,
      practiceTime,
      fretCount,
      metronomeBpm,
      metronomeBeats,
      inputGain,
      cooldownEnabled,
      cooldownDuration,
      confidenceThreshold,
      sensitivity,
      customChords,
    }
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'fretmaster-settings.json'
    a.click()
    URL.revokeObjectURL(url)
    toast.success(t('export_settings'))
  }, [language, chordScaleDisplay, noteAccidentalDisplay, theme, practiceTime, fretCount, metronomeBpm, metronomeBeats, inputGain, cooldownEnabled, cooldownDuration, confidenceThreshold, sensitivity, customChords, t])

  // 导入设置
  const importSettings = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const settings = JSON.parse(e.target?.result as string)
        // 🚨 这里原先一律用 `||` 取缺省值，会把**合法的 0 / false 吞掉**：
        // `inputGain` 滑块 `min={0}`，导出 0 再导回就变成 1（`sensitivity` /
        // `confidenceThreshold` / `cooldownDuration` 同理），而用户完全看不出
        // 「设置没被还原」。改用「只认正确类型」的取值器：既不吃 0/false，
        // 也顺手挡掉手改 JSON 带来的 NaN / 错类型。
        const num = (v: unknown, fallback: number) =>
          typeof v === 'number' && Number.isFinite(v) ? v : fallback
        const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
        // 泛型 `<T extends string>` 是为了保住字面量联合类型（ThemeMode / 语言码…），
        // 否则返回值退化成 `string`、setter 不收。
        const str = <T extends string>(v: unknown, fallback: T): T =>
          typeof v === 'string' && v.length > 0 ? (v as T) : fallback

        setLanguage(str(settings.language, 'zh-CN'))
        setChordScaleDisplay(str(settings.chordScaleDisplay, settings.language === 'en' ? 'english' : 'chinese'))
        setNoteAccidentalDisplay(str(settings.noteAccidentalDisplay, 'sharp'))
        setTheme(str(settings.theme, 'dark'))
        setPracticeTime(num(settings.practiceTime, 60))
        setFretCount(num(settings.fretCount, 15))
        setMetronomeBpm(clampMetronomeBpm(num(settings.metronomeBpm, 80)))
        // 拍号（#14）：走 store 的白名单校验 —— 旧版导出的设置文件里没有这个字段，
        // 手改过的文件也可能塞进 0 / NaN（会让可视化算出 NaN 拍号），这里统一收敛。
        setMetronomeBeatsPerMeasure(clampMetronomeBeats(num(settings.metronomeBeats, 4)))
        setInputGain(num(settings.inputGain, 1))
        setCooldownEnabled(bool(settings.cooldownEnabled, false))
        setCooldownDuration(num(settings.cooldownDuration, 1000))
        setConfidenceThreshold(num(settings.confidenceThreshold, 0.8))
        setSensitivity(num(settings.sensitivity, 0.5))
        if (Array.isArray(settings.customChords)) setCustomChords(settings.customChords)
        toast.success(t('import_success'))
      } catch {
        toast.error(t('error_occurred'))
      }
    }
    reader.readAsText(file)
  }, [setChordScaleDisplay, setConfidenceThreshold, setCooldownDuration, setCooldownEnabled, setFretCount, setInputGain, setLanguage, setMetronomeBpm, setMetronomeBeatsPerMeasure, setNoteAccidentalDisplay, setPracticeTime, setSensitivity, setTheme, t])

  // 计时器效果：仅负责递减 timeLeft；暂停时挂起（原实现未把 isPracticePaused 纳入依赖）
  useEffect(() => {
    if (isPlaying && practiceTime > 0 && !isPracticePaused) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => (prev <= 1 ? 0 : prev - 1))
      }, 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
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
  }, [isPlaying, practiceTime, scoreRef, setIsPlaying, timeLeft])

  // 🚨 节拍器发声/闪光的效果块已整体抽到 `hooks/use-metronome-scheduler.ts`（#14）。
  // 抽走的理由不只是「太长」：修前这里是「`setInterval(60000/bpm)` 里直接 createOscillator」，
  // 是**声音自己的时钟**，而可视化组件另有一个时钟 —— 两者启动时刻与漂移速率都不同，
  // 圆点与「咔哒」会逐渐错开。现在只有一个调度器（音频时钟 lookahead），
  // 拍事件经 `lib/metronome-clock.ts` 广播给可视化。**不要**在这里重新起定时器。

  // 音程练习指板自动推进效果
  useEffect(() => {
    if (activeTab === "interval" && isPlaying && showIntervalFretboard && intervalAutoAdvance && currentIntervalExercise) {
      // 设置指板显示倒计时
      setIntervalTimeLeft(intervalFretboardDuration)
      
      const countdownInterval = setInterval(() => {
        setIntervalTimeLeft(prev => (prev <= 1 ? 0 : prev - 1))
      }, 1000)

      return () => {
        clearInterval(countdownInterval)
      }
    }
  }, [activeTab, isPlaying, showIntervalFretboard, intervalAutoAdvance, intervalFretboardDuration, currentIntervalExercise, setIntervalTimeLeft])

  // 指板倒计时归零 → 自动进入下一题（副作用独立于 updater；只认从 >0 落到 0 的边沿，
  // 因为 intervalTimeLeft 初值为 0，若只看 ===0 会在启动瞬间误触发一次生成）
  useEffect(() => {
    const prev = prevIntervalTimeLeftRef.current
    prevIntervalTimeLeftRef.current = intervalTimeLeft
    if (prev > 0 && intervalTimeLeft === 0 &&
        activeTab === "interval" && isPlaying && showIntervalFretboard && intervalAutoAdvance) {
      generateIntervalExerciseRef.current?.()
    }
  }, [activeTab, isPlaying, showIntervalFretboard, intervalAutoAdvance, intervalTimeLeft, prevIntervalTimeLeftRef, generateIntervalExerciseRef])

  // 音频输入设备的枚举与自动选择（实现见 hooks/use-audio-device-enumeration.ts）
  const { enumerateAudioDevices } = useAudioDeviceEnumeration()

  // 设备增删的**统一处理**（Web 与桌面共用）：
  //  · 当前正在用的设备被拔掉 ⇒ 停采集 + 清选择 + 提示（否则采集线程对着不存在的设备空转，
  //    练习中「怎么弹都没反应」且用户不知道为什么）
  //  · 新设备接入 ⇒ 提示（此前是静默的，用户只能自己去设置里刷新才发现）
  const handleGlobalDeviceChange = useCallback((
    added: AudioDeviceInfo[],
    removed: string[]
  ) => {
    const st = useAppStore.getState()
    const currentSelected = st.audio?.selectedAudioDevice

    if (currentSelected && removed.includes(currentSelected)) {
      // 用「运行时状态」而不是「持久化意图」判定该怎么关（铁律 19）：
      // 用户显式关过音频才写偏好，这里只是设备没了导致的降级。
      if (isTauri) {
        void import('@/lib/native-audio').then(m => m.stopAudioCapture()).catch(() => {})
      }
      st.setMicEnabled(false)
      st.setSelectedAudioDevice('')
      toast.error(
        language === 'zh-CN'
          ? '当前音频设备已断开，音频输入已停止'
          : 'Current audio device disconnected, audio input stopped'
      )
      return
    }

    if (added.length > 0) {
      const name = added[0]?.name
      toast.success(
        language === 'zh-CN'
          ? `检测到音频设备${name ? `：${name}` : ''}`
          : `Audio device detected${name ? `: ${name}` : ''}`
      )
    }

    // 原本没选设备（例如启动时设备还没插），现在有了 ⇒ 自动选上，用户直接能练
    if (!currentSelected && added.length > 0) {
      const preferred = added.find(d => d.name) ?? added[0]
      if (preferred?.name) st.setSelectedAudioDevice(preferred.name)
    }
  }, [language, isTauri])

  // ============================================================================
  // 设备热插拔检测 —— **全局**（两种形态），不依赖设置面板是否打开。
  //
  // 背景（2026-10-11）：此前只有 `WindowsAudioSettings`（桌面）与一段
  // `isTauri ? return` 的 Web effect 在管这件事，前者挂在 Radix `SheetContent` 下、
  // 抽屉一关子树即卸载 ⇒ 关掉设置后插拔声卡彻底无人察觉；且**两种形态都不给用户
  // 任何可见反馈**（Web 只在 logger.debug 里记一行，桌面明确注释「不弹提示」）。
  //
  // 现在：桌面端监控由 Rust `.setup()` 常驻启动，这里订阅事件；Web 端监听
  // `devicechange`。两边都走同一个处理函数，用户能看到「接入/断开」。
  // ============================================================================
  useEffect(() => {
    if (isTauri) {
      let unlisten: (() => void) | null = null
      let cancelled = false

      void (async () => {
        const m = await import('@/lib/native-audio')
        if (cancelled) return
        // 双保险：Rust 已在 setup 常驻启动，这里再 ensure 一次（幂等），
        // 以防运行在「setup 未覆盖」的旧二进制上。
        await m.ensureDeviceMonitor().catch(() => {})
        const fn = await m.listenDeviceChanges((event) => {
          // 启动快照不是真实插入：只更新列表，不弹提示（否则每次启动误报 N 个设备）
          if (event.isInitial) return
          handleGlobalDeviceChange(event.added, event.removed)
        })
        if (!fn) return
        if (cancelled) {
          fn()
          return
        }
        unlisten = fn
      })().catch(() => {})

      return () => {
        cancelled = true
        if (unlisten) unlisten()
      }
    }

    // ---- Web ----
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return

    const requestPermissionAndGetDevices = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(track => track.stop())
        await enumerateAudioDevices(false)
      } catch (err) {
        console.error('无法获取音频权限:', err)
        // 即使没有权限，也尝试枚举设备
        await enumerateAudioDevices(false)
      }
    }

    requestPermissionAndGetDevices()

    // `devicechange` 只告诉我们「列表变了」，不说是谁进谁出 ⇒ 自己跟上一份快照求差集。
    let lastIds: string[] | null = null
    const handleDeviceChange = (() => {
      let debounceTimer: NodeJS.Timeout | null = null
      return () => {
        if (debounceTimer) clearTimeout(debounceTimer)
        // USB 声卡插拔会连发多个事件，防抖聚合
        debounceTimer = setTimeout(async () => {
          const before = lastIds ?? []
          await enumerateAudioDevices(false)
          const after = (navigator.mediaDevices ? await navigator.mediaDevices.enumerateDevices() : [])
            .filter(d => d.kind === 'audioinput' && d.deviceId)
            .map(d => d.deviceId)
          lastIds = after

          // 首次（before 为空）不算变化，避免启动时误报
          if (before.length === 0) return
          const added = after.filter(id => !before.includes(id))
          const removed = before.filter(id => !after.includes(id))
          if (added.length > 0 || removed.length > 0) {
            handleGlobalDeviceChange(
              added.map(id => ({ name: id } as unknown as AudioDeviceInfo)),
              removed
            )
          }
        }, 500)
      }
    })()

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
    }
  }, [enumerateAudioDevices, isTauri, handleGlobalDeviceChange])

  // 当设置面板打开时，刷新设备列表
  useEffect(() => {
    if (isTauri) return
    if (settingsOpen && typeof navigator !== 'undefined' && navigator.mediaDevices) {
      enumerateAudioDevices(false)
    }
  }, [settingsOpen, enumerateAudioDevices, isTauri])

  // 🚨 先建空 ref：它镜像的 `processPracticeMatch` 声明在收音域**之后**，
  //    而收音域立刻就要用它（作为 option 传进去）⇒ 不能在声明处初始化。
  //    赋值写在 `processPracticeMatch` 定义之后的**渲染期**（不是 effect），
  //    保证任何音频回调都可能拿到的都不是 null。
  const processPracticeMatchRef = useRef<((input: DetectedPitchForMatch) => void) | null>(null)

  // ==================== 两条收音域的装配顺序 ====================
  // 调音器（`use-tuner`）与练习收音（`use-audio-input`）互相需要对方的一个动作：
  //   · `startAudioInput` 开麦前要先停掉调音器 —— 否则两条检测链抢同一个流
  //   · 调音器开播前要先停掉练习收音（`stopAudioInput`）
  // ⇒ 直接互相传函数必然有一侧 TDZ（options 对象是**立即求值**的）。
  // 做法：给调音器传一个**稳定**的壳（内部读 ref），ref 在 audio hook 之后才落值；
  // 反向依赖（`tunerActive` / `stopTuner` / `disposeTunerChain`）按正常顺序交给 audio hook。
  // 于是本文件里 `useTuner` 必须排在 `useAudioInput` **之前**。
  const stopAudioInputRef = useRef<() => void>(() => {})
  const stopPracticeAudio = useCallback(() => stopAudioInputRef.current(), [])

  // 调音器 —— 独立功能域（自己的 AudioContext + rAF，或 Tauri 的 Rust 事件流），
  // 实现见 hooks/use-tuner.ts。返回对象与原有局部变量同名同型，故正文零改动。
  const tuner = useTuner({
    isTauri,
    micEnabled,
    setMicEnabled,
    selectedAudioDevice,
    t,
    referenceFrequency,
    inputGain,
    lowestStringHz: instrumentConfig.lowestStringHz,
    pitchAlgorithm: audioSettings.pitchAlgorithm,
    confidenceThreshold,
    stopAudioInput: stopPracticeAudio,
  })
  const {
    tunerOpen,
    setTunerOpen,
    tunerActive,
    detectedNote,
    detectedFrequency,
    cents,
    stopTuner,
    toggleTuner,
  } = tuner

  // 练习收音：Web 设备图 / worklet / ScriptProcessor 回退 / 噪声校准 / MIDI / Tauri 原生流。
  // 实现见 hooks/use-audio-input.ts。页面仍是 store 的唯一入口 —— 本 hook 不订阅 store，
  // 设置与 action 一律按值传入（与 use-tuner 同一约定）。
  // 🚨 `processPracticeMatchRef` 由**本 hook 与下面的 processPracticeMatch 共用**：
  //    收音链路只认「确认了某个音」，判对错交给页面的 processPracticeMatch。
  const {
    useAudioWorklet,
    setUseAudioWorklet,
    midiDevices,
    noiseCalibrating,
    noiseCalibrationCountdown,
    noiseCalibrationProgress,
    calibrateNoiseFloor,
    clearNoiseFloor,
    stopAudioInput,
    cooldownRef,
    isCoolingDownRef,
    noteConfirmStateRef,
  } = useAudioInput({
    isTauri,
    language,
    t,
    instrumentName: user.instrument,
    instrumentConfig,
    confidenceThresholdRef,
    pitchAlgorithmRef,
    isPlayingRef,
    processMatchRef: processPracticeMatchRef,
    micEnabled,
    setMicEnabled,
    micUserDisabled: audioSettings.micUserDisabled,
    selectedAudioDevice,
    setSelectedAudioDevice: store.setSelectedAudioDevice,
    inputGain,
    noiseFloor,
    setNoiseFloor,
    sampleRate: audioSettings.sampleRate,
    audioBackend: audioSettings.audioBackend,
    setAudioInitializing,
    setAudioError,
    setDetectedPitch,
    setDetectedCents,
    midiEnabled,
    setMidiEnabled,
    selectedMidiDevice,
    handleMIDINoteInputRef,
    isPlaying,
    tunerActive,
    stopTuner,
    tunerDisposeChain: tuner.disposeTunerChain,
  })
  // 壳的落值：必须在 `useAudioInput` 声明之后（上面两处调用都靠它）。
  stopAudioInputRef.current = stopAudioInput

  // 重置设置 —— 摆在收音域之后，因为它要调用 hook 返回的 `clearNoiseFloor`。
  // （放在声明之前会让 deps 数组在渲染期读到未初始化的绑定 ⇒ TDZ。）
  const resetSettingsAction = useAppStore((s) => s.resetSettings)
  const resetSettings = useCallback(() => {
    resetSettingsAction()
    // 校准记录是 audio slice 的字段，会跟着一起回默认 ⇒ 运行中的收音链路也要回默认，
    // 否则会出现「设置已重置，门限却还按着之前那间屋子的底噪走」。
    // 两条路径（worklet 传 null + TS 侧 resetPitchDetectionState）的细节见
    // hooks/use-audio-input.ts::clearNoiseFloor。
    clearNoiseFloor()
    // P3-4：重置成功的提示必须用**结果**文案，不能复用按钮的前置说明
    //（`reset_settings_hint` 是「点击重置按钮将恢复…」，出现在成功 toast 里语义矛盾）。
    toast.success(t('settings_reset_done'))
  }, [resetSettingsAction, t, clearNoiseFloor])


  // 练习模式音高匹配 —— **唯一实现**，三条收音路径共用：
  // AudioWorklet（默认）/ ScriptProcessor 回退 / Tauri 原生。
  // 页面通过 processPracticeMatchRef 调用，避免长生命周期的音频回调捕获旧闭包。
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
    // 🚨 `cooldownRef` / `isCoolingDownRef` / `noteConfirmStateRef` 来自
    //    `hooks/use-audio-input.ts` 的 `useRef`，身份恒定 —— 它们必须与收音链路**共用
    //    同一份**（冷却期与多帧确认的记忆不能各建一份），故只能经返回值传进来。
    //    ESLint 认不出 hook 返回的 ref，这里显式豁免。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerCorrectFeedback, setScore, recordPositionStat, currentIntervalExerciseRef, setCurrentIntervalExercise, generateIntervalExerciseRef, setIntervalPracticeStep, chordExerciseTargetChordRef, chordExerciseSequenceRef, chordExerciseCurrentStepRef, chordExerciseIsAnsweredRef, setChordExerciseIsAnswered, nextChordExerciseRef, setChordExerciseCurrentStep])

  // 用 ref 接住（渲染期赋值）：长生命周期的音频回调（worklet / ScriptProcessor / Tauri）
  // 一律通过 `processPracticeMatchRef` 调用，避免捕获旧闭包。见上面声明处的说明。
  processPracticeMatchRef.current = processPracticeMatch

  // ==================== 练习逻辑 ====================

  // 生成新的目标音符
  const previousTargetRef = useRef<string | null>(null)

  const generateNewTarget = useCallback(() => {
    // 总是生成指板位置（在 fretboard 模式下不会被使用，但确保 buttons 模式下始终有值）
    // 🚨 弦号 → 行下标**一律**走唯一真相源（`lib/string-index.ts`）。
    // 历史坑：这里原写成 `STRING_COUNT - 弦号`（镜像映射），而渲染端
    // （practice-fretboard / guitarrun-fretboard）用 `下标 + 1` 当弦号 ⇒ 两端相反，
    // 「限制弦」里**选中的弦被禁用、目标落在没选的弦上**（6 弦 63 种组合里 56 种中招），
    // 表现为「出不在该弦上的音，看不到该位置无法答题」。护栏 string-index.test.ts。
    const availableIndexes = resolveAvailableStringIndexes(selectedStrings, STRING_COUNT)

    // 限制练习 - 5品区: 仅在指定品区范围内生成品数
    let minFret = 0
    let maxFret = fretCount
    if (fretZoneEnabled) {
      minFret = fretZoneStart
      maxFret = Math.min(fretCount, fretZoneStart + fretZoneSize - 1)
    }

    // 弱点加权出题：枚举品区内所有可用位置，按掌握度权重随机（正确率低的位置权重更高）
    // 常规模式：弦与品均匀随机
    let stringIndex: number
    let baseFret: number
    if (weaknessWeightedEnabled) {
      const prev = highlightedTargetPositionRef.current
      // 候选总数多于一个时才排除上次位置，避免连续重复
      const hasAlternatives = availableIndexes.length * (maxFret - minFret + 1) > 1
      const candidates: { si: number; fret: number; weight: number }[] = []
      for (const si of availableIndexes) {
        for (let f = minFret; f <= maxFret; f++) {
          if (prev && hasAlternatives && si === prev.stringIndex && f === prev.fret) continue
          candidates.push({ si, fret: f, weight: getPositionWeight(user.instrument, si, f) })
        }
      }
      if (candidates.length > 0) {
        const total = candidates.reduce((sum, c) => sum + c.weight, 0)
        let r = Math.random() * total
        let chosen = candidates[candidates.length - 1]
        for (const c of candidates) {
          r -= c.weight
          if (r <= 0) { chosen = c; break }
        }
        stringIndex = chosen.si
        baseFret = chosen.fret
      } else {
        stringIndex = availableIndexes[Math.floor(Math.random() * availableIndexes.length)]
        baseFret = Math.floor(Math.random() * (maxFret - minFret + 1)) + minFret
      }
    } else {
      stringIndex = availableIndexes[Math.floor(Math.random() * availableIndexes.length)]
      baseFret = Math.floor(Math.random() * (maxFret - minFret + 1)) + minFret
    }

    // 限制练习 - 八度切换: 在已有位置基础上向上下八度平移
    let randomFret = baseFret
    let noteAtPosition = getNoteAtPosition(stringIndex, randomFret)

    // 八度切换: 找到同弦上等价八度位置（±12 品）
    if (octaveShiftEnabled) {
      const candidateOffsets: number[] = []
      if (octaveShiftMode === 'up') candidateOffsets.push(12)
      else if (octaveShiftMode === 'down') candidateOffsets.push(-12)
      else { // random
        candidateOffsets.push(12, -12, 0)
      }
      // 打乱顺序，找到第一个在品区内的位置（P3-6：改用 Fisher-Yates，`sort(()=>Math.random()-0.5)`
      // 不是均匀洗牌 —— 部分排列概率系统性偏高且依赖引擎排序实现）。
      const shuffledOffsets = shuffle(candidateOffsets)
      for (const offset of shuffledOffsets) {
        const shiftedFret = baseFret + offset
        if (shiftedFret >= minFret && shiftedFret <= maxFret) {
          randomFret = shiftedFret
          noteAtPosition = getNoteAtPosition(stringIndex, randomFret)
          break
        }
      }
    }

    // 设置高亮位置（buttons 模式使用，fretboard 模式忽略）
    setHighlightedTargetPosition({ stringIndex, fret: randomFret })
    setTargetNote(noteAtPosition)
    previousTargetRef.current = noteAtPosition

    if (intervalRootMode === "random") {
      setRootNote(NOTES[Math.floor(Math.random() * NOTES.length)])
    }

    // 不在此处记录练习统计 —— 仅在用户答对时记录（见 handleMIDINoteInput）
  }, [STRING_COUNT, selectedStrings, fretCount, fretZoneEnabled, weaknessWeightedEnabled, octaveShiftEnabled, intervalRootMode, fretZoneStart, fretZoneSize, user.instrument, octaveShiftMode, setRootNote])

  // 生成音程练习队列

  // 生成音程练习题目

  // 辅助函数：生成音阶练习序列





  const formatNoteByAccidentalSetting = useCallback((note: string): string => {
    if (noteAccidentalDisplay === 'flat') return preferFlat(note)
    if (noteAccidentalDisplay === 'mixed') {
      // 混用模式：升降号交替显示，同一音符始终显示同一种
      const noteIndex = NOTES.indexOf(preferSharp(note))
      if (noteIndex === -1) return note
      // 使用音符索引决定升降号：C,D,E,F,G,A,B 用升号，其他用降号
      // 更合理的做法：F大调的降号调用降号，其他用升号
      const FLAT_KEYS_INDICES = [1, 3, 5, 8, 10] // Db, Eb, Gb, Ab, Bb 的索引
      return FLAT_KEYS_INDICES.includes(noteIndex) ? preferFlat(note) : preferSharp(note)
    }
    return preferSharp(note)
  }, [noteAccidentalDisplay])
  
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
      tuning: instrumentConfig.tuning,
      maxFret: fretCount,
    })
  }, [instrumentConfig.tuning, fretCount])

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

  // 处理MIDI音符输入
  const handleMIDINoteInput = useCallback((note: string) => {
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
        // 逐位置掌握度统计：指板点击路径优先用点击位置，否则用目标位置
        recordPositionStat(practiceVerdict.hit)
        const practiceDelta = scoreDeltaFor(practiceVerdict.hit)
        setScore(prev => ({ correct: prev.correct + practiceDelta.correct, total: prev.total + practiceDelta.total }))
        // 音高识别统计改为按会话记录，不在此处累加 —— 见 pitchFindingSession 统计 effect
        if (practiceVerdict.hit) generateNewTarget()
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

        if (verdict.hit && matchedIndex !== null) {
          const matchedInterval = intervals[matchedIndex]
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

          if (exerciseVerdict.hit) {
            // 答对了
            const nextStep = chordExerciseCurrentStep + 1
            if (nextStep >= chordExerciseSequence.length) {
              // 完成当前和弦，使用预览的下一题
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
  }, [isPlaying, activeTab, recordPositionStat, targetNote, currentIntervalExercise, setScore, generateNewTarget, findRootFirst, setCurrentIntervalExercise, generateIntervalExerciseRef, setIntervalPracticeStep, transposedChords, currentChordIndex, practiceLevel, getLevelOptions, scaleExerciseSequence, scaleExerciseCurrentStep, selectedScale, scaleKey, nextScaleExercise, chordExerciseTargetChord, chordExerciseSequence, chordExerciseCurrentStep, nextChordExercise, setChordExerciseCurrentStep])

  // 更新 ref 以便在 startPitchDetection 中使用（不含 nextChord，它在后面定义）
  useEffect(() => {
    handleMIDINoteInputRef.current = handleMIDINoteInput
    nextChordExerciseRef.current = nextChordExercise
    nextScaleExerciseRef.current = nextScaleExercise
    generateNewTargetRef.current = generateNewTarget
    generateIntervalExerciseRef.current = generateIntervalExercise
    chordExerciseIsAnsweredRef.current = chordExerciseIsAnswered
    practiceAnswerModeRef.current = practiceAnswerMode
  }, [handleMIDINoteInput, nextChordExercise, nextScaleExercise, generateNewTarget, chordExerciseIsAnswered, practiceAnswerMode, nextChordExerciseRef, generateIntervalExerciseRef, generateIntervalExercise, chordExerciseIsAnsweredRef])

  // 安全网：辨音模式下如果 highlightedTargetPosition 为 null，重新生成目标位置
  useEffect(() => {
    if (activeTab !== 'practice' || practiceAnswerMode !== 'buttons') return
    if (!highlightedTargetPosition) {
      logger.debug('辨音模式安全网：highlightedTargetPosition 为 null，重新生成目标')
      generateNewTarget()
    }
  }, [activeTab, practiceAnswerMode, highlightedTargetPosition, generateNewTarget])

  // 练习开始时自动聚焦到练习卡片
  useEffect(() => {
    if (isPlaying && practiceCardRef.current) {
      practiceCardRef.current.focus()
    }
  }, [isPlaying, activeTab])

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

  // 和弦转换练习：当前和弦变化时预生成下一题
  useEffect(() => {
    if (activeTab === "chord" && isPlaying) {
      const chords = customChords.length > 0 ? customChords : (selectedSong.chords || []).map(c => parseChord(c))
      if (chords.length === 0) return

      let nextIndex: number
      if (chordPlayOrder === "random") {
        nextIndex = Math.floor(Math.random() * chords.length)
      } else if (chordPlayOrder === "desc") {
        nextIndex = currentChordIndex === 0 ? chords.length - 1 : currentChordIndex - 1
      } else {
        nextIndex = (currentChordIndex + 1) % chords.length
      }

      const chord = chords[nextIndex]
      if (chord) {
        setNextChordInfo({
          index: nextIndex,
          root: chord.root,
          type: chord.type,
          bass: chord.bass,
          degrees: getChordDegrees(chord.type, practiceLevel, getLevelOptions())
        })
      }
    }
  }, [activeTab, isPlaying, currentChordIndex, customChords, selectedSong, chordPlayOrder, progressionKey, practiceLevel, getLevelOptions])

  // 处理指板点击
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
          // 逐位置统计：暂存点击位置，供随后 handleMIDINoteInput 记录
          lastFretClickPositionRef.current = { stringIndex, fret }
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
            isCorrect = clickedIdx >= 0 && judgeExpectation(expectation, clickedIdx).hit
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

      playFeedbackSound(isCorrect)

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
          handleMIDINoteInput(clickedNote)
        }, 100),
      ]
    }
  }, [isPlaying, handleMIDINoteInput, activeTab, targetNote, chordExerciseTargetChord, chordExerciseSequence, chordExerciseCurrentStep, scaleExerciseSequence, scaleExerciseCurrentStep, scaleKey, selectedScale, currentIntervalExercise, currentChordIndex, playFeedbackSound, findRootFirst, fretZoneEnabled, fretZoneStart, fretZoneSize, fretCount, triggerCorrectFeedback, triggerWrongFeedback, transposedChords, clearFretClickTimers, practiceLevel, getLevelOptions])

  const updateLevelOptions = useCallback((levelId: string) => {
    const level = ALL_SOLO_LEVELS.find(l => l.id === levelId)
    if (level) {
      setLevelForceNaturalFive(level.forceNaturalFive)
      setLevelEndOnStartingInterval(level.endOnStartingInterval || false)
      setLevelUsePassingNoteBebopScale(level.usePassingNoteBebopScale || false)
    } else {
      setLevelForceNaturalFive(true)
      setLevelEndOnStartingInterval(false)
      setLevelUsePassingNoteBebopScale(false)
    }
  }, [])

  useEffect(() => {
    updateLevelOptions(practiceLevel)
  }, [practiceLevel, updateLevelOptions])

  const pausePractice = useCallback(() => {
    if (isPlaying && !isPracticePaused) {
      setIsPracticePaused(true)
      // practiceElapsedTime 的单位是【秒】（见 recordPractice 中 *1000 的使用），
      // 原实现直接累加毫秒差，导致恢复后时长被放大 1000 倍。
      // 🚨 P3-1：`Date.now()` 必须在 updater **外面**取（铁律 1：updater 必须纯）。
      //    StrictMode 会双调用 updater，两次 `Date.now()` 不同 ⇒ 第二次的基准漂移，
      //    且这个漂移在 dev 下才出现、生产不复现（最难查的一类）。
      const now = Date.now()
      const sessionStart = practiceSessionStartTime ?? now
      const elapsedSeconds = (now - sessionStart) / 1000
      setPracticeElapsedTime(prev => prev + elapsedSeconds)
    }
  }, [isPlaying, isPracticePaused, practiceSessionStartTime, setPracticeElapsedTime])

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
          const pool = PRACTICE_SUGGESTIONS[user.instrument] ?? PRACTICE_SUGGESTIONS.six_string_guitar
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
      setPracticeSessionStartTime(null)
      // P3-2：结束练习时把「答完延迟」的两个定时器一并清掉 —— 否则它们仍会跑
      //（100ms 那条会走 handleMIDINoteInput 记分），把这一局结束后才到达的点击
      // 算进上一局。
      clearFretClickTimers()
    }
    // 同 `processPracticeMatch`：`noteConfirmStateRef` 是收音域返回的 ref，身份恒定。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, setScore, practiceTime, activeTab, generateNewTarget, setIntervalPracticeStep, setIsPlaying, setPracticeSessionStartTime, setPracticeElapsedTime, pitchFindingTime, showPracticeSuggestions, user.instrument, language, intervalPracticeDuration, setIntervalExerciseQueue, setIntervalCurrentQueueIndex, selectedIntervals, intervalDirection, intervalRandomizeOrder, generateIntervalExerciseRef, generateChordExercise, generateScaleExercise, clearFretClickTimers])

  // 保持 togglePractice 的最新引用，供课程练习启动等延迟调用使用
  togglePracticeRef.current = togglePractice

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
    setPracticeSessionStartTime(null)
    setPracticeElapsedTime(0)
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
  }, [practiceTime, setChordExerciseCurrentStep, setChordExerciseSequence, setChordExerciseTargetChord, setCurrentIntervalExercise, setIntervalPracticeStep, setIsPlaying, setNextChordExerciseInfo, setPracticeElapsedTime, setPracticeSessionStartTime, setScore, setShowChordExerciseFretboard, setShowIntervalFretboard])

  /**
   * 按 tab 设置「指板显隐」开关。
   *
   * 🚨 这是 ↑/↓ 键与真相源之间**唯一**的桥：开关名 → setter 的映射在这里写一份，
   * 而「哪个 tab 对应哪个开关」由 `lib/tab-fretboard-toggle.ts` 决定。
   * 因此新增练习 tab 时**只需**在真相源里加一行 + 这里加一个 setter，
   * 不会再出现「↑ 生效、↓ 漏改」这种半截分叉。
   */
  const setTabFretboardFlag = useCallback((tab: string, value: boolean) => {
    const flag = getTabFretboardFlag(tab)
    if (!flag) return
    SET_TAB_FRETBOARD[flag](value)
  }, [SET_TAB_FRETBOARD])

  // 处理标签切换 - 使用 useRef 避免依赖 isPlaying 变化
  const handleTabChange = useCallback((tabId: string) => {
    if (isPlayingRef.current) {
      resetPractice()
    }
    setActiveTab(tabId)
  }, [resetPractice, setActiveTab])

  // 键盘事件由全局 window 监听器统一处理（见下方 useEffect），避免 Card 聚焦时与全局处理器重复触发

  // 下一和弦
  const nextChord = useCallback(() => {
    // 重置和弦音步骤
    setChordDegreeCurrentStep(0)
    
    // 使用预生成的下一题信息
    if (nextChordInfo) {
      const chords = customChords.length > 0 ? customChords : (selectedSong.chords || []).map(c => parseChord(c))
      const nextIndex = nextChordInfo.index
      // 检测是否完成一轮（索引回到0且之前不是0）
      if (nextIndex === 0 && currentChordIndex === chords.length - 1) {
        // 统计已改为会话级记录：会话结束时统一在 useEffect 中记录
        // 如果开启随机转调，随机选择新的调
        if (shouldRandomizeKeyOnRepeat && progressionRepeat) {
          const allKeys = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
          const newKey = allKeys[Math.floor(Math.random() * allKeys.length)]
          setProgressionKey(newKey)
          logger.debug('随机转调到:', newKey)
        }
      }
      setCurrentChordIndex(nextIndex)
    } else {
      // 如果没有预览信息，重新计算
      const chords = customChords.length > 0 ? customChords : (selectedSong.chords || []).map(c => parseChord(c))
      if (chords.length === 0) return
      let nextIndex: number
      if (chordPlayOrder === "random") {
        nextIndex = Math.floor(Math.random() * chords.length)
        setCurrentChordIndex(nextIndex)
      } else if (chordPlayOrder === "desc") {
        nextIndex = currentChordIndex === 0 ? chords.length - 1 : currentChordIndex - 1
        // 检测是否完成一轮（倒序时，索引变为最后一个且之前是第一个）
        if (nextIndex === chords.length - 1 && currentChordIndex === 0) {
          // 统计已改为会话级记录：会话结束时统一在 useEffect 中记录
          // 如果开启随机转调，随机选择新的调
          if (shouldRandomizeKeyOnRepeat && progressionRepeat) {
            const allKeys = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
            const newKey = allKeys[Math.floor(Math.random() * allKeys.length)]
            setProgressionKey(newKey)
            logger.debug('随机转调到:', newKey)
          }
        }
        setCurrentChordIndex(nextIndex)
      } else {
        nextIndex = (currentChordIndex + 1) % chords.length
        // 检测是否完成一轮（正序时，索引变为0且之前是最后一个）
        if (nextIndex === 0 && currentChordIndex === chords.length - 1) {
          // 统计已改为会话级记录：会话结束时统一在 useEffect 中记录
          // 如果开启随机转调，随机选择新的调
          if (shouldRandomizeKeyOnRepeat && progressionRepeat) {
            const allKeys = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
            const newKey = allKeys[Math.floor(Math.random() * allKeys.length)]
            setProgressionKey(newKey)
            logger.debug('随机转调到:', newKey)
          }
        }
        setCurrentChordIndex(nextIndex)
      }
    }
  }, [nextChordInfo, customChords, selectedSong, chordPlayOrder, currentChordIndex, shouldRandomizeKeyOnRepeat, progressionRepeat])

  // 单独更新 nextChordRef（避免循环依赖）
  useEffect(() => {
    nextChordRef.current = nextChord
  }, [nextChord])

  // 键盘事件监听 - 全局快捷键
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 忽略输入框/可编辑元素中的按键，避免与文本输入冲突
      const target = event.target as HTMLElement | null
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return
      }
      // contenteditable 元素（如富文本编辑器）也跳过
      if (target && target.isContentEditable) {
        return
      }

      // 带系统修饰键的组合（Ctrl/Cmd/Alt）交给浏览器处理，
      // 避免劫持 Ctrl+P 打印、Ctrl+F 查找、Ctrl+S 保存、Ctrl+M 等系统快捷键
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return
      }

      // 🚨 专注模式下，Space / Escape 归 FocusMode 面板所有（P2-7）。
      //    两个 window 级 keydown 同时存活时：按 Space 既推进下一题**又**启停番茄钟、
      //    按 Esc 既退出专注模式**又**停止练习 —— `preventDefault()` 拦不住另一个监听器
      //    （它只挡浏览器默认行为，不挡同页其它 handler）。这里用「谁在场谁接管」的
      //    约定做互斥：专注模式开着 ⇒ 页面这侧的 Space/Esc 让位。
      //    （P/A/F 等其余快捷键不受影响，专注模式下仍可用。）
      if (focusMode?.enabled && (event.key === 'Escape' || event.key === ' ' || event.key === 'Spacebar')) {
        return
      }

      // ESC - 退出全屏或停止练习
      if (event.key === 'Escape') {
        event.preventDefault()
        if (isFullscreen) {
          setFullscreenMode(false)
        } else if (isPlaying) {
          setIsPlaying(false)
          setHighlightedFrets(new Map())
          setHighlightedTargetPosition(null)
        }
        return
      }

      // P - 开始/停止练习
      if (event.key === 'p' || event.key === 'P') {
        event.preventDefault()
        togglePractice()
        return
      }

      // F - 切换全屏模式（全局快捷键，不依赖练习状态，与快捷键说明一致）
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        setFullscreenMode(!isFullscreen)
        return
      }

      // M - 切换麦克风（用户显式选择 ⇒ 走偏好落盘，跨会话记住）
      if (event.key === 'm' || event.key === 'M') {
        event.preventDefault()
        const next = !useAppStore.getState().audio.micEnabled
        setMicUserPreference(next)
        if (isTauri) {
          // 🚨 只翻标志不碰 Rust ⇒ 会复刻「以为开了其实没开」的老 bug（另一扇门）。
          // 运行时对齐：开 ⇒ 确保采集在跑（ensureCaptureRunning 幂等：已在采集就不动）；
          // 关 ⇒ 停采集。pitch stream 由练习/调音 effect 依 micEnabled 自行启停，这里不管。
          import('@/lib/native-audio').then(({ stopAudioCapture, ensureCaptureRunning }) => {
            const a = useAppStore.getState().audio
            const job = next
              ? ensureCaptureRunning({
                  selectedDevice: a.selectedAudioDevice || undefined,
                  sampleRate: a.sampleRate || 48000,
                  backend: a.audioBackend || 'wasapi_shared',
                })
              : stopAudioCapture()
            job.catch((err) => console.error('[Tauri] M 键切换音频输入失败:', err))
          })
        }
        return
      }

      // H - 显示/隐藏快捷键帮助
      if (event.key === 'h' || event.key === 'H') {
        event.preventDefault()
        setShowShortcutsHelp(prev => !prev)
        return
      }

      // S - 打开设置
      if (event.key === 's' || event.key === 'S') {
        event.preventDefault()
        setSettingsOpen(true)
        return
      }

      // 1-5 - 切换标签页
      const tabKeys = ['1', '2', '3', '4', '5']
      const tabs = ['practice', 'interval', 'chord_exercise', 'chord', 'scale']
      if (tabKeys.includes(event.key)) {
        event.preventDefault()
        handleTabChange(tabs[parseInt(event.key) - 1])
        return
      }

      // 空格/右箭头/PageDown - 下一题（练习中）
      if ((event.key === ' ' || event.key === 'ArrowRight' || event.key === 'PageDown') && isPlaying) {
        event.preventDefault()
        if (activeTab === 'practice') {
          generateNewTarget()
        } else if (activeTab === 'interval') {
          generateIntervalExerciseRef.current?.()
        } else if (activeTab === 'chord_exercise') {
          nextChordExercise()
        } else if (activeTab === 'scale') {
          nextScaleExercise()
        } else if (activeTab === 'chord') {
          nextChord()
        }
        return
      }

      // 上箭头/PageUp - 显示指板（与快捷键说明一致）
      if ((event.key === 'ArrowUp' || event.key === 'PageUp') && isPlaying) {
        event.preventDefault()
        // 根据当前练习 tab 显示对应的指板（映射见唯一真相源 lib/tab-fretboard-toggle.ts）
        setTabFretboardFlag(activeTab, true)
        setShowAllNotes(true)
        return
      }

      // 下箭头 - 隐藏指板 / 下一题（与快捷键说明一致）
      // 练习中：隐藏指板并生成下一题；非练习中：仅隐藏指板
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        // 根据当前练习 tab 隐藏对应的指板（映射见唯一真相源 lib/tab-fretboard-toggle.ts）
        setTabFretboardFlag(activeTab, false)
        setShowAllNotes(false)
        // 练习中同时生成下一题
        if (isPlaying) {
          if (activeTab === 'practice') {
            generateNewTarget()
          } else if (activeTab === 'interval') {
            generateIntervalExerciseRef.current?.()
          } else if (activeTab === 'chord_exercise') {
            nextChordExercise()
          } else if (activeTab === 'scale') {
            nextScaleExercise()
          } else if (activeTab === 'chord') {
            nextChord()
          }
        }
        return
      }

      // Enter - 下一题（练习中）
      if (event.key === 'Enter' && isPlaying) {
        event.preventDefault()
        if (activeTab === 'practice') {
          generateNewTarget()
        } else if (activeTab === 'interval') {
          generateIntervalExerciseRef.current?.()
        } else if (activeTab === 'chord_exercise') {
          nextChordExercise()
        } else if (activeTab === 'scale') {
          nextScaleExercise()
        } else if (activeTab === 'chord') {
          nextChord()
        }
        return
      }

    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFullscreen, isPlaying, togglePractice, activeTab, generateNewTarget, generateIntervalExercise, nextChordExercise, nextScaleExercise, nextChord, micEnabled, handleTabChange, setFullscreenMode, setIsPlaying, setMicUserPreference, isTauri, setSettingsOpen, generateIntervalExerciseRef, setTabFretboardFlag, focusMode?.enabled])

  // 获取音符颜色
  // 获取音符颜色（判定已抽到 lib/fretboard-note-button-color.ts —— 那里可单测，
  // 并与 lib/fretboard-cell-role.ts 做「两套皮肤结论一致」的行为护栏）
  const getNoteButtonColor = useCallback(
    (note: string, stringIndex: number, fret: number) =>
      computeNoteButtonColor(
        {
          activeTab, isPlaying, showAllNotes, targetNote, practiceAnswerMode,
          highlightedTargetPosition, highlightedFrets,
          fretZoneEnabled, fretZoneStart, fretZoneSize, fretCount,
          chordExerciseTargetChord, rootNote, selectedIntervals,
          scaleKey, selectedScale, scaleExerciseSequence,
          transposedChords, currentChordIndex,
          threeNpsTarget, threeNpsCellKeys, nextThreeNpsCells,
        },
        note,
        stringIndex,
        fret,
      ),
    [activeTab, highlightedFrets, targetNote, showAllNotes, isPlaying, chordExerciseTargetChord, rootNote, selectedIntervals, scaleKey, selectedScale, currentChordIndex, practiceAnswerMode, highlightedTargetPosition, fretZoneEnabled, fretZoneStart, fretZoneSize, fretCount, scaleExerciseSequence, transposedChords, threeNpsTarget, threeNpsCellKeys, nextThreeNpsCells]
  )

  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // 切换音程选择

  // 添加自定义和弦
  const addCustomChord = () => {
    setCustomChords(prev => [...prev, { root: newChordRoot, type: newChordType, bass: newChordBass }])
  }

  // 移除自定义和弦
  const removeCustomChord = (index: number) => {
    setCustomChords(prev => prev.filter((_, i) => i !== index))
  }

  // 清空自定义和弦
  const clearCustomChords = () => {
    setCustomChords([])
  }

  // 保存自定义和弦序列到本地存储
  const saveCustomChords = () => {
    if (customChords.length === 0) {
      toast.error(t('custom_chord_empty'))
      return
    }
    const data = {
      name: customChordName || t('custom_chord_unnamed'),
      sequence: customChords
    }
    if (typeof window !== 'undefined') {
      // P3-3：配额超限（和弦序列可能很长）时必须捕获，否则抛异常冒泡到调用方
      // （onClick 之外还会经 React 事件系统重抛），用户侧表现为「点了没反应 + 控制台红字」。
      try {
        localStorage.setItem(CUSTOM_CHORD_STORAGE_KEY, JSON.stringify(data))
      } catch (e) {
        console.warn('Failed to persist custom chords:', e)
        toast.error(t('custom_chord_save_failed'))
        return
      }
    }
    toast.success(t('custom_chord_saved'))
  }

  // 从本地存储加载自定义和弦序列（解析与四种结果分类见 lib/custom-chords-io.ts）
  const loadCustomChords = () => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(CUSTOM_CHORD_STORAGE_KEY) : null
    const result = parseStoredCustomChords(raw)
    if (result.kind === 'loaded') {
      setCustomChords(result.sequence)
      setCustomChordName(result.name)
      toast.success(t('custom_chord_loaded'))
      return
    }
    if (result.kind === 'empty') {
      toast.error(t('custom_chord_empty_load'))
      return
    }
    if (result.kind === 'invalid') {
      toast.error(t('custom_chord_load_error'))
      return
    }
    toast.error(t('custom_chord_not_found'))
  }

  // 导入iReal Pro（解析实现见 lib/song-chords.ts）
  // irealbook:// URL 优先 —— 一次能拿到歌名与和弦进行；不是 URL 时回退到纯文本解析
  const importIrealPro = () => {
    const fromUrl = parseIrealUrl(irealInput)
    const chords = fromUrl ? fromUrl.chords : parseIrealPro(irealInput)
    if (chords.length > 0) {
      setCustomChords(chords)
      // URL 里带的歌名顺手用作序列名（纯文本导入没有这个信息）
      if (fromUrl?.title) setCustomChordName(fromUrl.title)
      toast.success(t('import_success'))
      setIrealInput("")
    } else {
      toast.error(t('error_occurred'))
    }
  }

  // 导出自定义和弦为简化格式（文本构造见 lib/custom-chords-io.ts 的 buildCustomChordsExport）
  const exportCustomChords = () => {
    if (customChords.length === 0) {
      toast.error(t('custom_chord_empty'))
      return
    }

    const { name, text } = buildCustomChordsExport(customChords, {
      name: customChordName,
      unnamedLabel: t('custom_chord_unnamed'),
      chordScaleDisplay,
      chordSymbols,
    })

    navigator.clipboard.writeText(text).then(() => {
      toast.success(t('export_success'))
    }).catch(() => {
      const blob = new Blob([text], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${name}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(t('export_success'))
    })
  }

  
  // 更新 getTransposedChordsRef
  useEffect(() => { getTransposedChordsRef.current = () => transposedChords }, [transposedChords])

  // 获取当前和弦显示
  const getCurrentChordDisplay = () => {
    const chords = transposedChords
    const chord = chords[currentChordIndex]
    if (!chord) return ""
    // 显示规则见 lib/page-theory-functions 的 formatChordShape（唯一真相源）
    return formatChordShape(chord, chordScaleDisplay, chordSymbols)
  }

  // 获取下一题和弦显示 - 使用预生成的信息
  const getNextChordDisplay = () => {
    if (nextChordInfo) {
      return nextChordInfo
    }
    return null
  }

  // Slider回调 - 必须在顶层调用，不能在JSX中内联useCallback
  const handleReferenceFrequencyChange = useCallback(([v]: number[]) => setReferenceFrequency(v), [setReferenceFrequency])
  const handlePracticeTimeChange = useCallback(([v]: number[]) => setPracticeTime(v), [setPracticeTime])
  const handleFretCountChange = useCallback(([v]: number[]) => setFretCount(v), [setFretCount])
  const handleCooldownDurationChange = useCallback(([v]: number[]) => setCooldownDuration(v), [setCooldownDuration])
  const handleMetronomeBpmChange = useCallback(([v]: number[]) => setMetronomeBpm(v), [setMetronomeBpm])
  const handleInputGainChange = useCallback(([v]: number[]) => setInputGain(v / 100), [setInputGain])

  // 弹窗回调 —— 提为 useCallback 以保持引用稳定，配合子组件的 React.memo 生效
  const handleShowLevelInfo = useCallback((level: typeof ALL_PRACTICE_LEVELS[0] | null) => {
    setSelectedLevelInfo(level)
    setShowLevelInfoDialog(true)
  }, [])
  const handleSelectSong = useCallback((song: typeof SONG_PROGRESSIONS[0]) => {
    setSelectedSong(song)
    if (song.key) {
      const songKey = song.key
      const notePart = songKey.endsWith('m') ? songKey.slice(0, -1) : songKey

      let normalizedKey = notePart
      if (notePart.includes('b') && !notePart.includes('#')) {
        const flatIndex = findNoteIndexInArray(notePart, NOTES_FLAT)
        if (flatIndex !== -1) {
          normalizedKey = NOTES[flatIndex]
        }
      }

      setProgressionKey(normalizedKey)
      setIsMinor(songKey.endsWith('m'))
    }
    setCustomChords([])
    setCurrentChordIndex(0)
    setShowSongSelector(false)
  }, [])
  const handleShowSongInfo = useCallback((song: typeof SONG_PROGRESSIONS[0]) => {
    setSelectedSongInfo(song)
    setShowSongInfoDialog(true)
  }, [])
  const handleEditCustomSong = useCallback(() => setShowCustomSongEditor(true), [])
  const handleCreateCustomSong = useCallback(() => {
    setSelectedSong({ name: '__custom__', composer: '', year: '', style: '', tempo: '', key: 'C', chords: [] })
    setCurrentChordIndex(0)
    setShowSongSelector(false)
  }, [])
  const handleSongInfoConfirm = useCallback((song: typeof SONG_PROGRESSIONS[0] | null) => {
    if (song) {
      setSelectedSong(song)
      if (song.key) {
        setProgressionKey(song.key)
      }
      setCustomChords([])
      setCurrentChordIndex(0)
    }
    setShowSongSelector(false)
  }, [])
  const handleLevelInfoConfirm = useCallback((level: typeof ALL_PRACTICE_LEVELS[0] | null) => {
    if (level) {
      setPracticeLevel(level.id)
    }
    setShowLevelSelector(false)
  }, [])

  // ==================== 渲染 ====================

  // 显示缩放：只改 `html` 根字号（rem 基准），**布局长度完全不参与缩放**。
  // 前两版（CSS zoom / 外层滚动容器 + transform: scale）都把视觉尺寸与布局尺寸绑定
  // ⇒ 放大后逻辑可用宽被压缩、标题被截、按钮出屏。详见 lib/display-scale.ts 头注释。
  useEffect(() => {
    return applyRootFontSize(displayScale)
  }, [displayScale])

  return (
    <OnboardingProvider t={t}>
    <TooltipProvider>
      <div
        data-display-scale-root
        className="app-height bg-background flex flex-col relative overflow-hidden"
        style={{ height: '100dvh' }}
      >
        {/* 节拍器闪烁层 */}
        <div 
          id="metronome-flash-layer"
          className="fixed inset-0 pointer-events-none z-[90] opacity-0 transition-opacity duration-100"
          style={{ backgroundColor: 'hsl(0 0% 100% / 0.3)' }}
        />
      {/* Header */}
        <AppHeader
          t={t}
          formatTime={formatTime}
          timeLeft={timeLeft}
          mounted={mounted}
          isTauri={isTauri}
          detectedNote={detectedNote}
          detectedFrequency={detectedFrequency}
          cents={cents}
          tunerActive={tunerActive}
          tunerOpen={tunerOpen}
          onTunerOpenChange={setTunerOpen}
          toggleTuner={toggleTuner}
          handleReferenceFrequencyChange={handleReferenceFrequencyChange}
          onShowShortcutsHelpChange={setShowShortcutsHelp}
          midiEnabled={midiEnabled}
          onMidiEnabledChange={setMidiEnabled}
          midiDevices={midiDevices}
          selectedMidiDevice={selectedMidiDevice}
          onSelectedMidiDeviceChange={setSelectedMidiDevice}
          useAudioWorklet={useAudioWorklet}
          onUseAudioWorkletChange={setUseAudioWorklet}
          noiseFloor={noiseFloor}
          noiseCalibrating={noiseCalibrating}
          noiseCalibrationCountdown={noiseCalibrationCountdown}
          noiseCalibrationProgress={noiseCalibrationProgress}
          onCalibrateNoiseFloor={calibrateNoiseFloor}
          enumerateAudioDevices={enumerateAudioDevices}
          stopAudioInput={stopAudioInput}
          handlePracticeTimeChange={handlePracticeTimeChange}
          handleFretCountChange={handleFretCountChange}
          handleCooldownDurationChange={handleCooldownDurationChange}
          handleMetronomeBpmChange={handleMetronomeBpmChange}
          handleInputGainChange={handleInputGainChange}
          saveSettings={saveSettings}
          resetSettings={resetSettings}
          exportSettings={exportSettings}
          importSettings={importSettings}
        />

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden h-0 min-h-0">
          {/* Sidebar */}
          <aside
            data-onboarding="practice-tabs"
            className={cn(
              "border-r border-border/50 bg-card hidden md:flex flex-col shadow-[2px_0_10px_rgba(0,0,0,0.03)]",
              sidebarCollapsed ? "w-14" : "w-56"
            )}
            style={{ transition: 'width 0.2s ease-in-out' }}
          >
            <div className="p-2 space-y-1" role="tablist" aria-label={t('nav_practice')}>
              {sidebarMenuItems.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => handleTabChange(mode.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm",
                    activeTab === mode.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  style={{ willChange: 'background-color, color' }}
                  title={mode.label}
                  role="tab"
                  aria-selected={activeTab === mode.id}
                  aria-label={mode.label}
                >
                  <mode.Icon className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && <span>{mode.label}</span>}
                </button>
              ))}
            </div>
            
            <div className="mt-auto p-2">
              <button
                onClick={() => setSidebarCollapsed()}
                className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-accent transition-colors"
                aria-label={sidebarCollapsed ? t('btn_expand_sidebar') : t('btn_collapse_sidebar')}
                title={sidebarCollapsed ? t('btn_expand_sidebar') : t('btn_collapse_sidebar')}
              >
                {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
            </div>
          </aside>

          {/* Main Area */}
          <main className="flex-1 overflow-auto min-h-0 p-2 sm:p-4 pb-20 sm:pb-6">
            <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4">
              {/* Control Panel - 统计/乐理页面不显示（依赖场景，无练习需控制） */}
              {activeTab !== "stats" && activeTab !== "theory" && (
              <Card
                ref={practiceCardRef}
                tabIndex={0}
                className="outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                role="region"
                aria-label={t('fretboard_title')}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold leading-none">
                      {activeTab === "practice" && t('nav_practice')}
                      {activeTab === "interval" && t('nav_interval')}
                      {activeTab === "chord_exercise" && t('nav_chord_exercise')}
                      {activeTab === "chord" && t('nav_chord')}
                      {activeTab === "scale" && t('nav_scale')}
                    </h2>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setFullscreenMode(true)}
                        title={t('fullscreen_mode')}
                        aria-label={t('fullscreen_mode')}
                      >
                        <Maximize2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => store.setFocusModeSettings({ enabled: !focusMode?.enabled })}
                        title={t('focus_mode')}
                        aria-label={t('focus_mode')}
                      >
                        <Target className="h-4 w-4" />
                      </Button>
                      {isPlaying && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={togglePausePractice}
                          title={isPracticePaused ? t('resume') : t('pause')}
                          aria-label={isPracticePaused ? t('resume') : t('pause')}
                        >
                          {isPracticePaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                        </Button>
                      )}
                      <Button
                        variant={isPlaying ? "destructive" : "default"}
                        size="sm"
                        onClick={togglePractice}
                        aria-label={isPlaying ? t('btn_stop') : t('btn_start')}
                      >
                        {isPlaying ? <Square className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                        {isPlaying ? t('btn_stop') : t('btn_start')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={resetPractice}
                        title={t('reset')}
                        aria-label={t('reset')}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-6 pt-0 pb-3">
                  {/* 音频输入未开启提示：练习模式识别依赖 micEnabled（store 默认 false），
                      而调音器走完全独立的音频链路 —— 用户无法从「调音器可用」推断出这条已开启 */}
                  {!isTauri && !micEnabled &&
                    ['practice', 'interval', 'chord_exercise', 'chord', 'scale'].includes(activeTab) && (
                      <AudioInputNotice t={t} onOpenSettings={() => setSettingsOpen(true)} />
                    )}
                  {/* Practice Mode Controls */}
                  {activeTab === "practice" && (
                    <PracticeModeControls
                      t={t}
                      practiceAnswerMode={practiceAnswerMode}
                      onPracticeAnswerModeChange={setPracticeAnswerMode}
                      formatNoteByAccidentalSetting={formatNoteByAccidentalSetting}
                      targetNote={targetNote}
                      stringCount={STRING_COUNT}
                      selectedStrings={selectedStrings}
                      onSelectedStringsChange={setSelectedStrings}
                      pitchFindingTime={pitchFindingTime}
                      onPitchFindingTimeChange={setPitchFindingTime}
                      showPracticeSuggestions={showPracticeSuggestions}
                      onShowPracticeSuggestionsChange={setShowPracticeSuggestions}
                      showAllNotes={showAllNotes}
                      onShowAllNotesChange={setShowAllNotes}
                      isPlaying={isPlaying}
                      onIsPlayingChange={setIsPlaying}
                      practiceTime={practiceTime}
                      timeLeft={timeLeft}
                      onTimeLeftChange={setTimeLeft}
                      highlightedTargetPosition={highlightedTargetPosition}
                      onHighlightedFretsChange={setHighlightedFrets}
                      onHighlightedTargetPositionChange={setHighlightedTargetPosition}
                      onScoreChange={setScore}
                      recordPositionStat={recordPositionStat}
                      generateNewTarget={generateNewTarget}
                      formatTime={formatTime}
                      currentPracticeSuggestion={currentPracticeSuggestion}
                    />
                  )}
                  
                  {/* Interval Controls */}
                  {activeTab === "interval" && (
                    <IntervalControls
                      t={t}
                      rootNote={rootNote}
                      onRootNoteChange={setRootNote}
                      intervalRootMode={intervalRootMode}
                      onIntervalRootModeChange={setIntervalRootMode}
                      findRootFirst={findRootFirst}
                      onFindRootFirstChange={setFindRootFirst}
                      addRootBack={addRootBack}
                      onAddRootBackChange={setAddRootBack}
                      showIntervalFretboard={showIntervalFretboard}
                      onShowIntervalFretboardChange={setShowIntervalFretboard}
                      intervalPracticeDuration={intervalPracticeDuration}
                      onIntervalPracticeDurationChange={setIntervalPracticeDuration}
                      intervalDirection={intervalDirection}
                      onIntervalDirectionChange={setIntervalDirection}
                      intervalAutoAdvance={intervalAutoAdvance}
                      onIntervalAutoAdvanceChange={setIntervalAutoAdvance}
                      intervalFretboardDuration={intervalFretboardDuration}
                      onIntervalFretboardDurationChange={setIntervalFretboardDuration}
                      intervalRandomizeOrder={intervalRandomizeOrder}
                      onIntervalRandomizeOrderChange={setIntervalRandomizeOrder}
                      selectedIntervals={selectedIntervals}
                      onToggleInterval={toggleInterval}
                      isPlaying={isPlaying}
                    />
                  )}
                  
                  {/* Chord Exercise Controls */}
                  {activeTab === "chord_exercise" && (
                    <ChordExerciseControls
                      t={t}
                      language={language}
                      root={chordExerciseRoot}
                      onRootChange={setChordExerciseRoot}
                      level={chordExerciseLevel}
                      onOpenLevelSelector={() => setShowChordExerciseLevelSelector(true)}
                      bass={chordExerciseBass}
                      onBassChange={setChordExerciseBass}
                      chordOrder={chordExerciseOrder}
                      onChordOrderChange={setChordExerciseOrder}
                      showFretboard={showChordExerciseFretboard}
                      onShowFretboardChange={setShowChordExerciseFretboard}
                      showKeyboard={showChordExerciseKeyboard}
                      onShowKeyboardChange={setShowChordExerciseKeyboard}
                      showStructure={showChordExerciseStructure}
                      onShowStructureChange={setShowChordExerciseStructure}
                      selectedTypes={chordExerciseTypes}
                      onSelectedTypesChange={setChordExerciseTypes}
                    />
                  )}

                  {/* Chord Progression Controls */}
                  {activeTab === "chord" && (
                    <ChordProgressionControls
                      t={t}
                      language={language}
                      selectedSong={selectedSong}
                      onShowSongSelectorChange={setShowSongSelector}
                      progressionKey={progressionKey}
                      onProgressionKeyChange={setProgressionKey}
                      isMinor={isMinor}
                      practiceLevel={practiceLevel}
                      onShowLevelSelectorChange={setShowLevelSelector}
                      chordPlayOrder={chordPlayOrder}
                      onChordPlayOrderChange={setChordPlayOrder}
                      progressionRepeat={progressionRepeat}
                      onProgressionRepeatChange={setProgressionRepeat}
                      shouldVoiceLead={shouldVoiceLead}
                      onShouldVoiceLeadChange={setShouldVoiceLead}
                      shouldRandomizeKeyOnRepeat={shouldRandomizeKeyOnRepeat}
                      onShouldRandomizeKeyOnRepeatChange={setShouldRandomizeKeyOnRepeat}
                      showChordFretboard={showChordFretboard}
                      onShowChordFretboardChange={setShowChordFretboard}
                      showChordStructure={showChordStructure}
                      onShowChordStructureChange={setShowChordStructure}
                      showChordKeyboard={showChordKeyboard}
                      onShowChordKeyboardChange={setShowChordKeyboard}
                      isPlaying={isPlaying}
                      nextChord={nextChord}
                      newChordRoot={newChordRoot}
                      onNewChordRootChange={setNewChordRoot}
                      newChordType={newChordType}
                      onNewChordTypeChange={setNewChordType}
                      addCustomChord={addCustomChord}
                      irealInput={irealInput}
                      onIrealInputChange={setIrealInput}
                      importIrealPro={importIrealPro}
                      customChords={customChords}
                      removeCustomChord={removeCustomChord}
                      customChordName={customChordName}
                      onCustomChordNameChange={setCustomChordName}
                      saveCustomChords={saveCustomChords}
                      loadCustomChords={loadCustomChords}
                      exportCustomChords={exportCustomChords}
                      clearCustomChords={clearCustomChords}
                    />
                  )}

                  {/* 和弦进行信息浮动窗口 */}
                  {activeTab === "chord" && showChordStructure && (
                    <ChordStructureWindow
                      t={t}
                      language={language}
                      showChordStructure={showChordStructure}
                      onShowChordStructureChange={setShowChordStructure}
                      chordStructurePosition={chordStructurePosition}
                      onChordStructurePositionChange={setChordStructurePosition}
                      dragRef={dragRef}
                      handleDragStart={handleDragStart}
                      progressionKey={progressionKey}
                      isMinor={isMinor}
                      selectedSong={selectedSong}
                      transposedChords={transposedChords}
                      currentChordIndex={currentChordIndex}
                    />
                  )}

                  {/* Scale Controls */}
                  {activeTab === "scale" && (
                    <ScaleControls
                      t={t}
                      language={language}
                      isScaleKeyRandom={isScaleKeyRandom}
                      onIsScaleKeyRandomChange={setIsScaleKeyRandom}
                      scaleKey={scaleKey}
                      onScaleKeyChange={setScaleKey}
                      selectedScaleCategory={selectedScaleCategory}
                      onSelectedScaleCategoryChange={setSelectedScaleCategory}
                      selectedScale={selectedScale}
                      onSelectedScaleChange={setSelectedScale}
                      scaleDirection={scaleDirection}
                      onScaleDirectionChange={setScaleDirection}
                      scaleRootMovement={scaleRootMovement}
                      onScaleRootMovementChange={setScaleRootMovement}
                      showScaleFretboard={showScaleFretboard}
                      onShowScaleFretboardChange={setShowScaleFretboard}
                      showScaleKeyboard={showScaleKeyboard}
                      onShowScaleKeyboardChange={setShowScaleKeyboard}
                      showScaleStructure={showScaleStructure}
                      onShowScaleStructureChange={setShowScaleStructure}
                      scalePracticeSequence={scalePracticeSequence}
                      onScalePracticeSequenceChange={setScalePracticeSequence}
                      selectedScales={selectedScales}
                      onSelectedScalesChange={setSelectedScales}
                      threeNpsActive={isThreeNpsActive}
                      threeNpsPositions={threeNpsPositionOptions}
                      threeNpsSelectedIndex={threeNpsPositionIndex}
                      onThreeNpsPositionChange={handleThreeNpsPositionChange}
                      threeNpsShortestScaleNoteCount={selectedScale.notes.length}
                    />
                  )}
                </CardContent>
              </Card>
              )}

              {/* 音阶结构浮动窗口（专注模式「隐藏干扰元素」时随 .focus-clean 收起） */}
              {activeTab === "scale" && showScaleStructure && (
                <div 
                  data-focus-distraction
                  className="fixed bottom-4 right-4 z-50 bg-card/95 backdrop-blur-sm border border-border/50 rounded-lg shadow-lg p-3 max-w-xs"
                  style={{ 
                    transform: `translate(${scaleStructurePosition.x}px, ${scaleStructurePosition.y}px)`,
                    cursor: dragRef.current.isDragging && dragRef.current.target === 'scale' ? 'grabbing' : 'default'
                  }}
                >
                  <div 
                    className="flex items-center justify-between mb-2 cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    role="button"
                    tabIndex={0}
                    aria-label={t('chord_structure_drag_hint')}
                    onMouseDown={(e) => handleDragStart(e, 'scale')}
                    onTouchStart={(e) => handleDragStart(e, 'scale')}
                    onKeyDown={(e) => {
                      const step = e.shiftKey ? 20 : 5
                      if (e.key === 'ArrowLeft') { e.preventDefault(); setScaleStructurePosition(p => ({ ...p, x: p.x - step })) }
                      else if (e.key === 'ArrowRight') { e.preventDefault(); setScaleStructurePosition(p => ({ ...p, x: p.x + step })) }
                      else if (e.key === 'ArrowUp') { e.preventDefault(); setScaleStructurePosition(p => ({ ...p, y: p.y - step })) }
                      else if (e.key === 'ArrowDown') { e.preventDefault(); setScaleStructurePosition(p => ({ ...p, y: p.y + step })) }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <h4 className="text-sm font-semibold">{normalizeNoteName(scaleKey)} {getScaleDisplayName(selectedScale.name, chordScaleDisplay)}</h4>
                    </div>
                    <button 
                      onClick={() => setShowScaleStructure(false)}
                      className="text-muted-foreground hover:text-foreground p-1 min-h-[28px] min-w-[28px] flex items-center justify-center"
                      aria-label={t('scale_structure_close_label')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('scale_formula')}:</span>
                      <span className="font-mono">{formatDegree(selectedScale.formula)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('scale_intervals')}:</span>
                      <span className="font-mono">{formatDegree(scaleDegreeLabels(selectedScale).join(', '))}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('scale_notes')}:</span>
                      <span className="font-mono">{getScaleNoteNames(scaleKey, scaleDegreeLabels(selectedScale)).join(', ')}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 和弦练习结构浮动窗口（专注模式「隐藏干扰元素」时随 .focus-clean 收起） */}
              {activeTab === "chord_exercise" && showChordExerciseStructure && chordExerciseTargetChord && (
                <div 
                  data-focus-distraction
                  className="fixed bottom-4 right-4 z-50 bg-card/95 backdrop-blur-sm border border-border/50 rounded-lg shadow-lg p-3 max-w-xs"
                  style={{ 
                    transform: `translate(${chordExerciseStructurePosition.x}px, ${chordExerciseStructurePosition.y}px)`,
                    cursor: dragRef.current.isDragging && dragRef.current.target === 'chordExercise' ? 'grabbing' : 'default'
                  }}
                >
                  <div 
                    className="flex items-center justify-between mb-2 cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    role="button"
                    tabIndex={0}
                    aria-label={t('chord_structure_drag_hint')}
                    onMouseDown={(e) => handleDragStart(e, 'chordExercise')}
                    onTouchStart={(e) => handleDragStart(e, 'chordExercise')}
                    onKeyDown={(e) => {
                      const step = e.shiftKey ? 20 : 5
                      if (e.key === 'ArrowLeft') { e.preventDefault(); setChordExerciseStructurePosition(p => ({ ...p, x: p.x - step })) }
                      else if (e.key === 'ArrowRight') { e.preventDefault(); setChordExerciseStructurePosition(p => ({ ...p, x: p.x + step })) }
                      else if (e.key === 'ArrowUp') { e.preventDefault(); setChordExerciseStructurePosition(p => ({ ...p, y: p.y - step })) }
                      else if (e.key === 'ArrowDown') { e.preventDefault(); setChordExerciseStructurePosition(p => ({ ...p, y: p.y + step })) }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <h4 className="text-sm font-semibold">{normalizeNoteName(chordExerciseTargetChord.root)} {normalizeNoteName(getChordDisplayName(chordExerciseTargetChord.type, chordScaleDisplay, chordSymbols))}</h4>
                    </div>
                    <button
                      onClick={() => setShowChordExerciseStructure(false)}
                      className="text-muted-foreground hover:text-foreground p-1 min-h-[28px] min-w-[28px] flex items-center justify-center"
                      aria-label={t('chord_exercise_structure_close_label')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('chord_type')}:</span>
                      <span className="font-mono">{getChordDisplayName(chordExerciseTargetChord.type, chordScaleDisplay, chordSymbols)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('chord_degrees')}:</span>
                      <span className="font-mono">{getChordDegrees(chordExerciseTargetChord.type).join(', ')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('current_step')}:</span>
                      <span className="font-mono">{chordExerciseSequence[chordExerciseCurrentStep] || '-'}</span>
                    </div>
                  </div>
                </div>
              )}


              {/* 正确答案反馈浮动窗口 */}
              {/* 找音练习已有品格内提示，跳过此遮挡性浮动层避免遮挡指板 */}
              {showCorrectFeedback && activeTab !== 'practice' && (
                <div
                  role="alert"
                  aria-live="assertive"
                  aria-atomic="true"
                  className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
                >
                  <div className="bg-green-500/90 backdrop-blur-sm rounded-full p-6 shadow-2xl animate-pulse">
                    <Check className="h-16 w-16 text-white" />
                  </div>
                  <div className="absolute mt-32 text-2xl font-bold text-green-500 animate-bounce">
                    ✓ {correctFeedbackNote ? formatNoteByAccidentalSetting(correctFeedbackNote) : ''}
                  </div>
                </div>
              )}

              {showWrongFeedback && activeTab !== 'practice' && (
                <div
                  role="alert"
                  aria-live="assertive"
                  aria-atomic="true"
                  className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
                >
                  <div className="bg-red-500/90 backdrop-blur-sm rounded-full p-6 shadow-2xl" style={{animation: 'shake 0.4s ease-in-out'}}>
                    <X className="h-16 w-16 text-white" />
                  </div>
                  <div className="absolute mt-32 text-2xl font-bold text-red-500">
                    ✗ {wrongFeedbackNote ? formatNoteByAccidentalSetting(wrongFeedbackNote) : ''}
                  </div>
                </div>
              )}

              {showPracticeSummary && (
                <PracticeSummaryDialog
                  open={showPracticeSummary}
                  onOpenChange={(open) => !open && setShowPracticeSummary(false)}
                  data={practiceSummaryData}
                  onPracticeAgain={togglePractice}
                  t={t}
                />
              )}

              {/* Fretboard - 根据模式显示/隐藏，统计/乐理页面不显示 */}
              {activeTab !== "stats" && activeTab !== "theory" &&
               (activeTab !== "chord" || showChordFretboard) &&
               (activeTab !== "scale" || showScaleFretboard) &&
               (activeTab !== "interval" || showIntervalFretboard) &&
               (activeTab !== "chord_exercise" || showChordExerciseFretboard) && (
                user.fretboardStyle !== 'classic' ? (
                  <GuitarRunFretboard
                    t={t}
                    formatNoteByAccidentalSetting={formatNoteByAccidentalSetting}
                    handleFretClick={handleFretClick}
                    showAllNotes={showAllNotes}
                    highlightedFrets={highlightedFrets}
                    selectedStrings={selectedStrings}
                    rootNote={rootNote}
                    selectedIntervals={selectedIntervals}
                    scaleKey={scaleKey}
                    selectedScale={selectedScale}
                    scaleExerciseSequence={scaleExerciseSequence}
                    transposedChords={transposedChords}
                    currentChordIndex={currentChordIndex}
                    chordExerciseTargetChord={chordExerciseTargetChord}
                    FRET_MARKERS={FRET_MARKERS}
                    targetNote={targetNote}
                    practiceAnswerMode={practiceAnswerMode}
                    highlightedTargetPosition={highlightedTargetPosition}
                    threeNpsTarget={threeNpsTarget}
                    threeNpsCellKeys={threeNpsCellKeys}
                    nextThreeNpsCells={nextThreeNpsCells}
                    // 两套「圆点皮肤」共用同一个组件，只有外观不同（skin 决定用 .gr-* 还是 .ft-*）
                    skin={user.fretboardStyle === 'trainer' ? 'trainer' : 'guitarrun'}
                  />
                ) : (
                <PracticeFretboard
                  t={t}
                  formatNoteByAccidentalSetting={formatNoteByAccidentalSetting}
                  handleFretClick={handleFretClick}
                  getNoteButtonColor={getNoteButtonColor}
                  showAllNotes={showAllNotes}
                  highlightedFrets={highlightedFrets}
                  selectedStrings={selectedStrings}
                  rootNote={rootNote}
                  selectedIntervals={selectedIntervals}
                  scaleKey={scaleKey}
                  selectedScale={selectedScale}
                  scaleExerciseSequence={scaleExerciseSequence}
                  transposedChords={transposedChords}
                  currentChordIndex={currentChordIndex}
                  chordExerciseTargetChord={chordExerciseTargetChord}
                  targetNote={targetNote}
                  practiceAnswerMode={practiceAnswerMode}
                  highlightedTargetPosition={highlightedTargetPosition}
                  threeNpsTarget={threeNpsTarget}
                  threeNpsCellKeys={threeNpsCellKeys}
                  nextThreeNpsCells={nextThreeNpsCells}
                  FRET_MARKERS={FRET_MARKERS}
                />
                )
              )}

              {/* 钢琴键盘显示 - 和弦练习 */}
              {activeTab === "chord_exercise" && showChordExerciseKeyboard && (
                <ChordExerciseKeyboard
                  chordExerciseRoot={chordExerciseRoot}
                  chordExerciseTypes={chordExerciseTypes}
                  chordExerciseLevel={chordExerciseLevel}
                  chordExerciseTargetChord={chordExerciseTargetChord}
                  chordExerciseCurrentStep={chordExerciseCurrentStep}
                  getLevelOptions={getLevelOptions}
                />
              )}

              {/* 钢琴键盘显示 - 和弦转换练习 */}
              {activeTab === "chord" && showChordKeyboard && (
                <ChordProgressionKeyboard
                  transposedChords={transposedChords}
                  currentChordIndex={currentChordIndex}
                  practiceLevel={practiceLevel}
                  chordDegreeCurrentStep={chordDegreeCurrentStep}
                  getLevelOptions={getLevelOptions}
                />
              )}

              {/* 钢琴键盘显示 - 音阶练习 */}
              {activeTab === "scale" && showScaleKeyboard && (
                <ScaleKeyboard
                  scaleKey={scaleKey}
                  selectedScale={selectedScale}
                  selectedScaleCategory={selectedScaleCategory}
                  scaleExerciseSequence={scaleExerciseSequence}
                  scaleExerciseCurrentStep={scaleExerciseCurrentStep}
                />
              )}

              {/* 和弦进行 - 显示要答题的和弦音级（度数）
                  🚨 **不能带 `!showChordFretboard`**：显示指板是**辅助**（课程文案明确要求
                  「先用『显示指板』辅助，再关闭它凭记忆找音」），题目区与指板必须**同屏**。
                  带上这个条件 ⇒ 一开指板题目区就被卸载，用户不知道要弹什么，直接没法练。 */}
              {activeTab === "chord" && (
                <ChordDegreesDisplay
                  t={t}
                  transposedChords={transposedChords}
                  currentChordIndex={currentChordIndex}
                  practiceLevel={practiceLevel}
                  chordDegreeCurrentStep={chordDegreeCurrentStep}
                  getLevelOptions={getLevelOptions}
                  getCurrentChordDisplay={getCurrentChordDisplay}
                  getNextChordDisplay={getNextChordDisplay}
                  nextChord={nextChord}
                />
              )}
              
              {/* 音阶练习 - 显示练习序列（与指板同屏，理由同上） */}
              {activeTab === "scale" && (
                <ScaleSequenceDisplay
                  t={t}
                  scaleKey={scaleKey}
                  selectedScale={selectedScale}
                  scaleExerciseSequence={scaleExerciseSequence}
                  scaleExerciseCurrentStep={scaleExerciseCurrentStep}
                  nextScaleExerciseInfo={nextScaleExerciseInfo}
                  threeNps={threeNpsView}
                  nextThreeNps={nextThreeNpsView}
                />
              )}
              
              {/* 和弦练习 - 显示当前题目（与指板同屏，理由同上） */}
              {activeTab === "chord_exercise" && (
                <ChordExerciseQuestion
                  t={t}
                  chordExerciseTargetChord={chordExerciseTargetChord}
                  chordExerciseSequence={chordExerciseSequence}
                  chordExerciseCurrentStep={chordExerciseCurrentStep}
                  nextChordExerciseInfo={nextChordExerciseInfo}
                />
              )}

              {/* 音程练习 - 显示当前题目（与指板同屏，理由同上） */}
              {activeTab === "interval" && isPlaying && currentIntervalExercise && (
                <IntervalQuestion
                  t={t}
                  currentIntervalExercise={currentIntervalExercise!}
                  rootNote={rootNote}
                  targetNote={targetNote}
                  intervalDirection={intervalDirection}
                  intervalExerciseQueue={intervalExerciseQueue}
                  intervalCurrentQueueIndex={intervalCurrentQueueIndex}
                  timeLeft={timeLeft}
                  formatTime={formatTime}
                />
              )}

              {/* 统计页面 */}
              {activeTab === "stats" && (
                <StatsPanel
                  t={t}
                  statsTimeRange={statsTimeRange}
                  onStatsTimeRangeChange={setStatsTimeRange}
                  getStatsByTimeRange={getStatsByTimeRange}
                  recentRecords={recentRecords}
                />
              )}

              {/* 指板掌握度热力图（逐位置统计） */}
              {activeTab === "stats" && (
                <PositionHeatmap instrument={user.instrument} fretCount={fretCount} language={language} />
              )}

              {/* 乐理知识面板 */}
              {activeTab === "theory" && (
                <TheoryPanel instrument={user.instrument} fretCount={fretCount} language={language} fretMarkers={FRET_MARKERS} />
              )}
            </div>
          </main>
        </div>

        {/* Mobile bottom navigation - 优化显示 */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border/50 p-1 pb-safe z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]" role="tablist" aria-label={t('nav_practice')}>
          <div className="flex justify-around overflow-x-auto">
            {bottomNavItems.map((mode) => (
              <button
                key={mode.id}
                onClick={() => handleTabChange(mode.id)}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg flex-1 min-w-[2.75rem]",
                  activeTab === mode.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground"
                )}
                style={{ willChange: 'background-color, color' }}
                role="tab"
                aria-selected={activeTab === mode.id}
                aria-label={mode.label}
              >
                <mode.Icon className="h-5 w-5" />
                <span className="text-2xs font-medium truncate max-w-full">{mode.shortLabel}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* 全屏模式覆盖层 */}
        {isFullscreen && (
          <FullscreenOverlay
            t={t}
            setFullscreenMode={setFullscreenMode}
            formatNoteByAccidentalSetting={formatNoteByAccidentalSetting}
            targetNote={targetNote}
            practiceAnswerMode={practiceAnswerMode}
            currentPracticeSuggestion={currentPracticeSuggestion}
            selectedStrings={selectedStrings}
            showAllNotes={showAllNotes}
            highlightedFrets={highlightedFrets}
            currentChordIndex={currentChordIndex}
            practiceLevel={practiceLevel}
            transposedChords={transposedChords}
            getCurrentChordDisplay={getCurrentChordDisplay}
            getNextChordDisplay={getNextChordDisplay}
            getLevelOptions={getLevelOptions}
            chordExerciseTargetChord={chordExerciseTargetChord}
            chordExerciseSequence={chordExerciseSequence}
            chordExerciseCurrentStep={chordExerciseCurrentStep}
            nextChordExerciseInfo={nextChordExerciseInfo}
            scaleExerciseSequence={scaleExerciseSequence}
            scaleExerciseCurrentStep={scaleExerciseCurrentStep}
            scaleKey={scaleKey}
            selectedScale={selectedScale}
            nextScaleExerciseInfo={nextScaleExerciseInfo}
            currentIntervalExercise={currentIntervalExercise}
            showFretboard={showFretboard}
            showIntervalFretboard={showIntervalFretboard}
            showChordFretboard={showChordFretboard}
            showChordExerciseFretboard={showChordExerciseFretboard}
            showScaleFretboard={showScaleFretboard}
            handleFretClick={handleFretClick}
            getNoteButtonColor={getNoteButtonColor}
            FRET_MARKERS={FRET_MARKERS}
            highlightedTargetPosition={highlightedTargetPosition}
            rootNote={rootNote}
            selectedIntervals={selectedIntervals}
            threeNpsTarget={threeNpsTarget}
            threeNpsCellKeys={threeNpsCellKeys}
            nextThreeNpsCells={nextThreeNpsCells}
          />
        )}

        {/* 快捷键帮助对话框 */}
        <ShortcutsHelpDialog
          open={showShortcutsHelp}
          onOpenChange={setShowShortcutsHelp}
          t={t}
        />

        {/* 乐曲选择弹窗 */}
        <SongSelectorDialog
          open={showSongSelector}
          onOpenChange={setShowSongSelector}
          groups={groupedSongs}
          sortBy={songSortBy}
          onSortByChange={setSongSortBy}
          searchQuery={songSearchQuery}
          onSearchQueryChange={setSongSearchQuery}
          selectedSongName={selectedSong.name}
          onSelectSong={handleSelectSong}
          onShowSongInfo={handleShowSongInfo}
          onEditCustomSong={handleEditCustomSong}
          onCreateCustomSong={handleCreateCustomSong}
          t={t}
        />

        {/* 乐曲信息弹窗 */}
        <SongInfoDialog
          open={showSongInfoDialog}
          onOpenChange={setShowSongInfoDialog}
          song={selectedSongInfo}
          onConfirm={handleSongInfoConfirm}
          t={t}
        />

        {/* 练习模式选择弹窗 */}
        <LevelSelectorDialog
          open={showLevelSelector}
          onOpenChange={setShowLevelSelector}
          selectedLevelId={practiceLevel}
          onSelectLevel={setPracticeLevel}
          onShowLevelInfo={handleShowLevelInfo}
          t={t}
        />

        {/* 练习模式详细信息弹窗 */}
        <LevelInfoDialog
          open={showLevelInfoDialog}
          onOpenChange={setShowLevelInfoDialog}
          level={selectedLevelInfo}
          onConfirm={handleLevelInfoConfirm}
          t={t}
        />

        {/* 和弦练习模式选择弹窗 */}
        <ChordExerciseLevelSelector
          open={showChordExerciseLevelSelector}
          onOpenChange={setShowChordExerciseLevelSelector}
          groups={LOCAL_PRACTICE_MODE_GROUPS}
          selectedLevelId={chordExerciseLevel}
          onSelectLevel={setChordExerciseLevel}
          onShowLevelInfo={handleShowLevelInfo}
          language={language}
          t={t}
        />

        {/* 新手教程覆盖层*/}
        <OnboardingOverlay />

        <Dialog open={showCustomSongEditor} onOpenChange={setShowCustomSongEditor}>
          <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden">
            <CustomSongEditor language={language as 'zh-CN' | 'en'} onClose={() => setShowCustomSongEditor(false)} />
          </DialogContent>
        </Dialog>

        {focusMode?.enabled && (
          <FocusMode
            language={language as 'zh-CN' | 'en'}
            isPlaying={isPlaying}
            score={{ correct: score.correct, total: score.total }}
            timeLeft={timeLeft}
            practiceTime={practiceTime}
          />
        )}

        <MetronomeVisualizer
          bpm={metronomeBpm}
          enabled={metronomeSettings.visualize ?? false}
          isPlaying={isPlaying}
          beatsPerMeasure={metronomeBeats}
          language={language as 'zh-CN' | 'en'}
        />
      </div>
    </TooltipProvider>
    </OnboardingProvider>
  )
}
