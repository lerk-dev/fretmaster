"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { useAppStore, useAudioSettings, usePracticeSettings, useMetronomeSettings, useScore, useIsPlaying, useDisplayScale, useUser, useChordSymbols } from "@/lib/store"
import { useChordExercise } from "@/hooks/use-chord-exercise"
import { useIntervalExercise } from "@/hooks/use-interval-exercise"
import { useStructureWindowDrag } from "@/hooks/use-structure-window-drag"
import { useFullscreen } from "@/hooks/use-fullscreen"
import { usePracticeStats } from "@/hooks/use-practice-stats"
import { usePracticeSession } from "@/hooks/use-practice-session"
import { useScaleExercise } from "@/hooks/use-scale-exercise"
import { usePracticeMatch } from "@/hooks/use-practice-match"
import { useChordLibrary } from "@/hooks/use-chord-library"
import { useSettingsIo } from "@/hooks/use-settings-io"
import { useGlobalShortcuts } from "@/hooks/use-global-shortcuts"
import { useAudioDeviceEnumeration } from "@/hooks/use-audio-device-enumeration"
import { useFeedbackSound } from "@/hooks/use-feedback-sound"
import { useMetronomeScheduler } from "@/hooks/use-metronome-scheduler"
import { useTuner } from "@/hooks/use-tuner"
import { useAudioInput, type DetectedPitchForMatch } from "@/hooks/use-audio-input"
import { logger } from "@/lib/logger"
import { SONG_PROGRESSIONS } from "@/lib/page-songs"
import { transposeSongChords } from "@/lib/song-chords"
import { filterAndGroupSongs } from "@/lib/song-filters"
import { setStringTuning } from "@/lib/string-tuning"
import type {
  StatsTimeRange,
} from "@/lib/page-stats-types"
import { getStatsByTimeRange as computeStatsByTimeRange } from "@/lib/stats-range"
import {
  NOTES,
  NOTES_FLAT,
} from "@/lib/page-theory-data"
import { resolveAvailableStringIndexes } from "@/lib/string-index"
import { shuffle } from "@/lib/interval-direction"
import {
  normalizeNoteName,
  formatDegree,
  getChordDegrees,
  getChordDisplayName,
  formatChordShape,
  getNoteAtPosition,
  parseChord,
  getScaleDisplayName,
  getScaleNoteNames,
  findNoteIndexInArray,
  preferSharp,
  preferFlat,
  getKeyNote,
} from "@/lib/page-theory-functions"
import { scaleDegreeLabels } from "@/lib/scale-degree-display"
import { getNoteButtonColor as computeNoteButtonColor } from "@/lib/fretboard-note-button-color"
import { ALL_PRACTICE_LEVELS, PRACTICE_MODE_GROUPS } from "@/lib/practice-levels"

// UI 层别名：沿用页面里的历史命名，数据统一来自 lib/practice-levels（唯一真相源）
const ALL_SOLO_LEVELS = ALL_PRACTICE_LEVELS
const LOCAL_PRACTICE_MODE_GROUPS = PRACTICE_MODE_GROUPS
import { resolveInstrumentConfig } from "@/lib/practice-suggestions"
import { recordPositionResult, getPositionWeight, loadPositionStats } from "@/lib/position-stats"
import { getTabFretboardFlag, type TabFretboardFlag } from "@/lib/tab-fretboard-toggle"
import { applyRootFontSize } from "@/lib/display-scale"
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
import type { AudioDeviceInfo } from '@/lib/native-audio'

const FRET_MARKERS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24]

/** 音阶练习「练习序列」里表示一弦三音（3NPS）的选项 id */
/**
 * 音级标签 → 半音（mod 12）的解析**已搬到** `lib/page-theory-functions.ts` 的
 * `resolveScaleDegreeSemitone()` —— 原先这里是第二个真相源（一份手写表），
 * 既和 lib 里的 `degreeToSemitone`（**复合音程**语义）容易混淆，也让「兜底表有洞」
 * 这个 bug 无法被测试覆盖。搬过去后由 `__tests__/scale-degree-semitone.test.ts` 穷举钉住。
 */

// 练习建议数据由 @/lib/practice-suggestions 的 PRACTICE_SUGGESTIONS 提供（按乐器 + 双语 + 分类）



// ==================== 主组件 ====================

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
  // 练习统计：状态、记录与「从服务器加载 / 落库」全在 usePracticeStats（同名解构，正文用法不变）
  const {
    practiceStats,
    practiceSessionStartTime,
    setPracticeSessionStartTime,
    practiceElapsedTime,
    setPracticeElapsedTime,
    scoreRef,
    recordPractice,
    recentRecords,
  } = usePracticeStats({ isTauri })
  const [statsTimeRange, setStatsTimeRange] = useState<StatsTimeRange>('today')
  const [highlightedFrets, setHighlightedFrets] = useState<Map<string, boolean>>(new Map())
  const practiceTime = practiceSettings.practiceTime
  const setPracticeTime = store.setPracticeTime
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
  // 自定义和弦库（增删 / 本地存取 / iReal 导入 / 导出）—— 实现在 hooks/use-chord-library.ts。
  // 调用点必须在 transposedChords（用 customChords 做移调）之前。
  const {
    customChords, setCustomChords,
    irealInput, setIrealInput,
    newChordRoot, setNewChordRoot,
    newChordType, setNewChordType,
    customChordName, setCustomChordName,
    addCustomChord, removeCustomChord, clearCustomChords,
    saveCustomChords, loadCustomChords, importIrealPro, exportCustomChords,
  } = useChordLibrary({ t, chordScaleDisplay, chordSymbols })
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
  
  
  // ==================== 音阶练习域（含一弦三音 3NPS）====================
  // 实现在 hooks/use-scale-exercise.ts：出题（generateScaleExercise / nextScaleExercise）、
  // 3NPS 把位装载与视图快照、连击记账。判定路径只经 refs 消费它；
  // setThreeNps* 三个 setter 不对外 —— 只有 hook 内部的装载函数会写。
  const {
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
  } = useScaleExercise({ tuning: instrumentConfig.tuning, fretCount, t })

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
  const handleMIDINoteInputRef = useRef<((note: string) => void) | null>(null)
  const generateNewTargetRef = useRef<(() => void) | null>(null)
  const nextChordRef = useRef<(() => void) | null>(null)
  const practiceCardRef = useRef<HTMLDivElement | null>(null)
  
  
  // 状态refs - 用于音高检测回调中获取最新状态
  const isPlayingRef = useRef(isPlaying)
  const activeTabRef = useRef(activeTab)
  const sensitivityRef = useRef(sensitivity)
  const confidenceThresholdRef = useRef(confidenceThreshold)
  const pitchAlgorithmRef = useRef(audioSettings.pitchAlgorithm)
  const targetNoteRef = useRef(targetNote)
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
  }, [isPlaying, activeTab, sensitivity, confidenceThreshold, targetNote, chordExerciseTargetChord, chordExerciseSequence, chordExerciseCurrentStep, currentIntervalExercise, currentChordIndex, chordDegreeCurrentStep, practiceLevel, findRootFirst, nextChordInfo, shouldVoiceLead, shouldRandomizeKeyOnRepeat, progressionRepeat, getLevelOptions, audioSettings.pitchAlgorithm, chordSymbols.sevenFlatNineScaleChoice, score, scoreRef, chordExerciseTargetChordRef, chordExerciseSequenceRef, chordExerciseCurrentStepRef, currentIntervalExerciseRef, addRootBack])

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
  const resetSettingsAction = useAppStore((s) => s.resetSettings)
  // 设置导入 / 导出 / 重置 —— 实现在 hooks/use-settings-io.ts（逐行搬出）。
  // 调用点必须留在收音域之后：resetSettings 要调 clearNoiseFloor（见 hook 头注释）。
  const { saveSettings, exportSettings, importSettings, resetSettings } = useSettingsIo({
    t,
    language, chordScaleDisplay, noteAccidentalDisplay, theme,
    practiceTime, fretCount, metronomeBpm, metronomeBeats, inputGain,
    cooldownEnabled, cooldownDuration, confidenceThreshold, sensitivity, customChords,
    setLanguage, setChordScaleDisplay, setNoteAccidentalDisplay, setTheme,
    setPracticeTime, setFretCount, setMetronomeBpm, setMetronomeBeatsPerMeasure,
    setInputGain, setCooldownEnabled, setCooldownDuration,
    setConfidenceThreshold, setSensitivity, setCustomChords,
    resetSettingsAction, clearNoiseFloor,
  })

  // 练习模式音高匹配 —— **唯一实现**，三条收音路径共用：
  // AudioWorklet（默认）/ ScriptProcessor 回退 / Tauri 原生。
  // 页面通过 processPracticeMatchRef 调用，避免长生命周期的音频回调捕获旧闭包。

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

  // 音频答题路径：五模式判定 + 计分/连击/推进 + 冷却。判定口径见 lib/answer-judge.ts 与
  // lib/pitch-match.ts；实现在 hooks/use-practice-match.ts（逐行搬出，deps 照实写全）。
  const { processPracticeMatch, handleMIDINoteInput, handleFretClick } = usePracticeMatch({
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
    isPlaying,
    activeTab,
    targetNote,
    currentIntervalExercise,
    findRootFirst,
    transposedChords,
    currentChordIndex,
    practiceLevel,
    getLevelOptions,
    scaleExerciseSequence,
    scaleExerciseCurrentStep,
    selectedScale,
    scaleKey,
    chordExerciseTargetChord,
    chordExerciseSequence,
    chordExerciseCurrentStep,
    nextScaleExercise,
    nextChordExercise,
    generateNewTarget,
    playFeedbackSound,
    triggerWrongFeedback,
    clearFretClickTimers,
    setHighlightedFrets,
    lastFretClickPositionRef,
    fretClickTimersRef,
    fretZoneEnabled,
    fretZoneStart,
    fretZoneSize,
    fretCount,
  })

  // 用 ref 接住（渲染期赋值）：长生命周期的音频回调（worklet / ScriptProcessor / Tauri）
  // 一律通过 `processPracticeMatchRef` 调用，避免捕获旧闭包。见上面声明处的说明。
  processPracticeMatchRef.current = processPracticeMatch

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

  // 更新 ref 以便在 startPitchDetection 中使用（不含 nextChord，它在后面定义）
  useEffect(() => {
    handleMIDINoteInputRef.current = handleMIDINoteInput
    nextChordExerciseRef.current = nextChordExercise
    generateNewTargetRef.current = generateNewTarget
    generateIntervalExerciseRef.current = generateIntervalExercise
    chordExerciseIsAnsweredRef.current = chordExerciseIsAnswered
    practiceAnswerModeRef.current = practiceAnswerMode
  }, [handleMIDINoteInput, nextChordExercise, generateNewTarget, chordExerciseIsAnswered, practiceAnswerMode, nextChordExerciseRef, generateIntervalExerciseRef, generateIntervalExercise, chordExerciseIsAnsweredRef])

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

  // ==================== 练习会话（开始 / 暂停 / 重置 / 计时 / 快照 / 会话统计 / 屏幕常亮）====================
  // 实现在 hooks/use-practice-session.ts。这里只接回页面真正要用的两项：
  //  · 剩余时间（时间条展示 + 拖拽改时长）与暂停态（按钮图标 / title 要看它）
  //  · 三个会话动作（开始/停止、暂停/恢复、重置）
  // 🚨 setIsPracticePaused 不接回：写入口只留 togglePausePractice 一个。
  const { timeLeft, setTimeLeft, isPracticePaused, togglePausePractice, togglePractice, resetPractice } = usePracticeSession({
    isPlaying, setIsPlaying, score, setScore, activeTab,
    practiceTime, pitchFindingTime, intervalPracticeDuration, showPracticeSuggestions,
    instrument: user.instrument, language,
    selectedIntervals, intervalDirection, intervalRandomizeOrder,
    practiceSessionStartTime, setPracticeSessionStartTime,
    practiceElapsedTime, setPracticeElapsedTime,
    scoreRef, recordPractice, setPracticeSummaryData, setShowPracticeSummary,
    generateNewTarget, generateChordExercise, generateScaleExercise,
    generateIntervalExerciseRef, clearFretClickTimers,
    noteConfirmStateRef, cooldownRef, isCoolingDownRef, scaleComboRef, scaleMaxComboRef,
    setHighlightedFrets, setHighlightedTargetPosition, setCurrentPracticeSuggestion,
    setCurrentIntervalExercise, setIntervalPracticeStep, setIntervalExerciseQueue,
    setIntervalCurrentQueueIndex, setScaleCombo, setScaleMaxCombo,
    setScaleExerciseSequence, setScaleExerciseCurrentStep, setNextScaleExerciseInfo,
    setCurrentChordIndex, setChordDegreeCurrentStep, setNextChordInfo,
    setNextChordExerciseInfo, setChordExerciseTargetChord, setChordExerciseSequence,
    setChordExerciseCurrentStep, setShowFretboard, setShowIntervalFretboard,
    setShowChordFretboard, setShowChordExerciseFretboard, setShowScaleFretboard,
  })

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

  // 全局键盘快捷键（含「专注模式下 Space/Esc 让位」的互斥约定）——
  // 实现在 hooks/use-global-shortcuts.ts（逐行搬出）。页面只负责把回调递进去。
  useGlobalShortcuts({
    activeTab,
    isFullscreen, setFullscreenMode,
    isPlaying, setIsPlaying,
    setHighlightedFrets, setHighlightedTargetPosition, setShowAllNotes,
    togglePractice,
    isTauri, setMicUserPreference,
    setShowShortcutsHelp, setSettingsOpen,
    handleTabChange, setTabFretboardFlag,
    generateNewTarget, generateIntervalExerciseRef,
    nextChordExercise, nextScaleExercise, nextChord,
    focusModeEnabled: focusMode?.enabled,
  })

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
  }, [setCustomChords])
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
  }, [setCustomChords])
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
