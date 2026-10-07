"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { savePracticeStats as saveToServer, getAllPracticeStats, PracticeStats as ServerPracticeStats } from "@/lib/stats-api"
import { deduplicateStats } from "@/lib/export-utils"
import { getLocalDateString, dbTimestampToLocalDate, getLocalDaysAgoStart } from "@/lib/utils"
import { useAppStore, useAudioSettings, usePracticeSettings, useMetronomeSettings, useScore, useIsPlaying, useDisplayScale, useUser, useChordSymbols } from "@/lib/store"
import { getEffectiveAudioSettings } from "@/lib/audio-settings-effective"
import { useChordExercise } from "@/hooks/use-chord-exercise"
import { useIntervalExercise } from "@/hooks/use-interval-exercise"
import { useStructureWindowDrag } from "@/hooks/use-structure-window-drag"
import { useFullscreen } from "@/hooks/use-fullscreen"
import { usePracticeStats } from "@/hooks/use-practice-stats"
import { useAudioDeviceEnumeration } from "@/hooks/use-audio-device-enumeration"
import { useFeedbackSound } from "@/hooks/use-feedback-sound"
import { logger } from "@/lib/logger"
import { SONG_PROGRESSIONS } from "@/lib/page-songs"
import { transposeSongChords, parseIrealPro, parseIrealUrl } from "@/lib/song-chords"
import { CUSTOM_CHORD_STORAGE_KEY, parseStoredCustomChords, buildCustomChordsExport } from "@/lib/custom-chords-io"
import { filterAndGroupSongs } from "@/lib/song-filters"
import { setStringTuning } from "@/lib/string-tuning"
import { resolveExpectedIntervalDegree } from "@/lib/interval-expected-degree"
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
  INTERVALS,
  SCALE_MODES,
} from "@/lib/page-theory-data"
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
  isEquivalentNote,
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
import { calculateRMS, frequencyToNoteName, frequencyToNote, getSOLOYinAnalyser, YINPitchDetection, setMinDetectFreq, getMinDetectFreq, detectFloorForLowestHz, resetPitchDetectionState, resolveYinThreshold, seedPitchDetectionNoiseFloor, updateOnsetGate, getOnsetGate } from "@/lib/pitch-detection"
import {
  runNoiseFloorCalibration,
  onsetGateFromNoiseFloor,
  formatNoisePercent,
} from "@/lib/noise-calibration"
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
import {
  createOnsetState,
  createNoteConfirmState,
  detectOnset,
  confirmNote,
  resetNoteConfirmState,
  type OnsetState,
  type NoteConfirmState,
} from "@/lib/note-confirm"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn, isTauriEnv, getAudioContextClass } from "@/lib/utils"
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
import { TRANSLATIONS } from '@/lib/i18n'

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

/**
 * ScriptProcessor 回退路径的起音门限**不再写死**。
 *
 * 此前这里是 `const SCRIPT_PROCESSOR_ONSET_GATE = 0.001`，而 worklet / Tauri 两条路径
 * 的门限都跟着各自跟踪的环境底噪走（`max(0.0008, 底噪 × 1.5)`）。校准出高底噪
 * （上界 0.025 ⇒ 门限 0.0375）后，回退路径的门限低了 37 倍 ⇒ 环境噪声的起伏被当成
 * 「一次新的拨弦」⇒ 多帧一致的确认记忆被反复清空 ⇒ 嘈杂房间里永不确认。
 * 现在统一走 `updateOnsetGate(energy)`：它与另两处**同规则**（见 lib/pitch-detection.ts
 * 的「起音门限」段），并且吃的是同一帧的**原始** RMS。
 */

// ==================== 各收音路径的帧长度（多帧一致按时间换算要用） ====================
// 🚨 三条路径的帧间隔差 17 倍，而 lib/note-confirm.ts 的多帧一致是按**时间**定的目标
// （NOTE_CONFIRM_TARGET_MS = 32ms）。所以每条路径都必须把自己的帧间隔报上去，
// 否则会按 worklet 口径算，回退路径上确认延迟被放大成 ~0.5s。
// 这三个常量与各自的实际用法**同源**（下面都直接引用它们），不要写第二份字面量。

/** AudioWorklet 的 hop 长度（与 public/js/audio-worklet-processor.js 的 hopSize 默认值一致）。 */
const AUDIO_WORKLET_HOP_SIZE = 512
/** ScriptProcessor 回退的缓冲区长度（createScriptProcessor 的第一个参数）。 */
const SCRIPT_PROCESSOR_BUFFER_SIZE = 8192
/** Tauri 原生流的出帧间隔（startPitchStream 的实参；Rust 侧据此 sleep）。 */
const NATIVE_PITCH_INTERVAL_MS = 50

/** 由「每帧采样数 + 采样率」算出该路径的帧间隔（ms）。采样率非法时返回 0（调用方回落 worklet 口径）。 */
const frameMsOf = (samplesPerFrame: number, sampleRate: number): number =>
  sampleRate > 0 ? (samplesPerFrame / sampleRate) * 1000 : 0

// 根据运行环境获取 AudioWorklet 模块的正确路径
// Tauri: 从根路径加载; Web子路径部署: 自动检测前缀
const getAudioWorkletModulePath = (): string => {
  if (typeof window === 'undefined') return '/js/audio-worklet-processor.js'
  if (isTauriEnv()) return '/js/audio-worklet-processor.js'
  const path = window.location.pathname
  const match = path.match(/^(\/[^/]+)\//)
  if (match) return match[1] + '/js/audio-worklet-processor.js'
  return '/js/audio-worklet-processor.js'
}

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

/**
 * 一次音高检测结果 —— 练习匹配器的输入。
 * 用对象参数而非位置参数：历史上这里有两份重复实现，签名分别是
 * (frequency, detectedNote, probability) 与 (detectedFreq, probability, detectedNote)，
 * 顺序相反、极易传错（现已统一为此接口，并只保留一份实现）。
 */
interface DetectedPitchForMatch {
  frequency: number
  note: string
  probability: number
  /**
   * 本帧是否为一次新的起音。三条收音路径都会提供：
   * worklet 用 data.isNoteOnset、Tauri 用 result.isNoteOnset、
   * ScriptProcessor 回退在页面内用 detectOnset() 现算。
   * 缺省 false —— 退化成「每个音只计一次分」，见 lib/note-confirm.ts 顶部说明。
   */
  isNoteOnset?: boolean
  /**
   * 未经平滑的原始频率，供多帧一致判定使用。
   * 平滑频率（frequency 字段）只用于显示，判定用它会把上一个音带进下一个音的起始帧。
   * worklet 路径在消息里已带 rawFrequency；没有时回退到 frequency。
   */
  rawFrequency?: number
  /**
   * 本路径的帧间隔（ms），交给多帧一致按**时间**换算帧数（见 lib/note-confirm.ts 的
   * `NOTE_CONFIRM_TARGET_MS`）。三条路径帧率差 17 倍（worklet 10.7ms / Tauri 50ms /
   * ScriptProcessor ~186ms），不报就会按 worklet 口径算，回退路径上确认延迟会放大成 ~0.5s。
   */
  frameMs?: number
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

  const t = useCallback((key: string) => {
    const lang = language || 'zh-CN'
    const translations = TRANSLATIONS[lang] as Record<string, string>
    return translations?.[key] || key
  }, [language])

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
    const stored = localStorage.getItem('fretmaster-stats-version')
    if (stored !== CACHE_VERSION) {
      localStorage.removeItem('fretmaster-stats')
      localStorage.setItem('fretmaster-stats-version', CACHE_VERSION)
      logger.info('已清除旧的统计数据缓存', { from: stored, to: CACHE_VERSION })
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
  const metronomeSound = metronomeSettings.sound
  const metronomeFlash = metronomeSettings.flash
  
  // 音频输入状态 - 从 Store 获取
  const micEnabled = audioSettings.micEnabled
  const setMicEnabled = store.setMicEnabled
  const setMicUserPreference = store.setMicUserPreference
  const setAudioInitializing = store.setAudioInitializing
  const setAudioError = store.setAudioError
  const selectedAudioDevice = audioSettings.selectedAudioDevice
  const setDetectedPitch = store.setDetectedPitch
  const setDetectedCents = store.setDetectedCents
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null)
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null)
  const inputGain = audioSettings.inputGain
  const setInputGain = store.setInputGain

  // ---- 环境噪声校准（P1）----
  // 「量一次房间」的用户触发流程，测量口径见 lib/noise-calibration.ts。
  // 结果写进 store 的 audio.noiseFloor（会随其它音频设置一起持久化），并在当下立刻
  // 下发给 worklet / TS 两条收音路径 —— 校准的意义就是「现在这间屋子」，
  // 等到下次重开麦克风才生效等于没校。
  const noiseFloor = audioSettings.noiseFloor
  const setNoiseFloor = store.setNoiseFloor
  const [noiseCalibrating, setNoiseCalibrating] = useState(false)
  /** 倒计时剩余秒数；null = 不在倒计时（未开始 / 已进入采样 / 已结束） */
  const [noiseCalibrationCountdown, setNoiseCalibrationCountdown] = useState<number | null>(null)
  /** 采样进度（已采轮数），仅采样阶段非 null */
  const [noiseCalibrationProgress, setNoiseCalibrationProgress] = useState<number | null>(null)
  /** 同一时刻只允许一次校准（重复点击 / 关麦竞态） */
  const noiseCalibratingRef = useRef(false)
  /** 校准的中止开关：关掉麦克风、离开页面时置 true */
  const noiseCalibrationAbortRef = useRef(false)
  
  // MIDI状态
  const [midiEnabled, setMidiEnabled] = useState(false)
  const [midiDevices, setMidiDevices] = useState<WebMidi.MIDIInput[]>([])
  const [selectedMidiDevice, setSelectedMidiDevice] = useState<string>("random")
  const [midiAccess, setMidiAccess] = useState<WebMidi.MIDIAccess | null>(null)
  
  // 设置状态 - 从 Store 获取
  const cooldownEnabled = practiceSettings.cooldownEnabled
  const setCooldownEnabled = store.setCooldownEnabled
  const cooldownDuration = practiceSettings.cooldownDuration
  const setCooldownDuration = store.setCooldownDuration
  const confidenceThreshold = audioSettings.confidenceThreshold
  const setConfidenceThreshold = store.setConfidenceThreshold
  const sensitivity = audioSettings.sensitivity
  const setSensitivity = store.setSensitivity

  // 调音器状态
  const [tunerOpen, setTunerOpen] = useState(false)
  const [tunerActive, setTunerActive] = useState(false)
  const [detectedNote, setDetectedNote] = useState<string>("-")
  const [detectedFrequency, setDetectedFrequency] = useState<number>(0)
  const [cents, setCents] = useState<number>(0)
  const referenceFrequency = practiceSettings.referenceFrequency
  const setReferenceFrequency = store.setReferenceFrequency
  const tunerAudioContextRef = useRef<AudioContext | null>(null)
  const tunerAnalyserRef = useRef<AnalyserNode | null>(null)
  const tunerStreamRef = useRef<MediaStream | null>(null)
  const tunerGainNodeRef = useRef<GainNode | null>(null)
  const tunerAnimationRef = useRef<number | null>(null)
  const tunerHistoryRef = useRef<{ frequency: number; note: string; cents: number }[]>([])
  // Tauri 调音器：pitch-detected 事件监听与 Rust 检测线程的拆除句柄（stopTuner 需要）
  const tunerUnlistenRef = useRef<(() => void) | null>(null)
  const tunerStreamRunningRef = useRef(false)

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
  const metronomeRef = useRef<NodeJS.Timeout | null>(null)
  const pitchDetectionRef = useRef<number | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const cooldownRef = useRef<NodeJS.Timeout | null>(null)
  const isCoolingDownRef = useRef(false)
  // 收音两级前置滤波的状态（详见 lib/note-confirm.ts）。
  // - onsetState 仅 ScriptProcessor 回退路径需要：另两条路径的起音由 worklet / Rust 算好发过来。
  // - confirmState 三条路径共用（都在 processPracticeMatch 里过这道门）。
  const onsetStateRef = useRef<OnsetState | null>(null)
  if (onsetStateRef.current === null) onsetStateRef.current = createOnsetState()
  const noteConfirmStateRef = useRef<NoteConfirmState | null>(null)
  if (noteConfirmStateRef.current === null) noteConfirmStateRef.current = createNoteConfirmState()
  const handleMIDINoteInputRef = useRef<((note: string) => void) | null>(null)
  const nextScaleExerciseRef = useRef<(() => void) | null>(null)
  const generateNewTargetRef = useRef<(() => void) | null>(null)
  const togglePracticeRef = useRef<(() => void) | null>(null)
  const nextChordRef = useRef<(() => void) | null>(null)
  const practiceCardRef = useRef<HTMLDivElement | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const handleAudioWorkletMessageRef = useRef<((message: { type: string; data: unknown }) => void) | null>(null)
  const [useAudioWorklet, setUseAudioWorklet] = useState(true)
  
  
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
        localStorage.removeItem('fretmaster-stats')
        localStorage.removeItem('fretmaster_stats_backup')
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
            localStorage.removeItem('fretmaster-stats')
            localStorage.removeItem('fretmaster_stats_backup')
          } else {
            localStorage.setItem('fretmaster-stats', JSON.stringify(newStats))
          }
        }
      } catch (e) {
        console.error('Failed to load stats:', e)
        // Tauri 环境失败时返回空统计，不读 localStorage 备份（避免历史脏数据导致"未练习却有记录"）
        if (!isTauri) {
          const savedStats = localStorage.getItem('fretmaster-stats')
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
        localStorage.setItem('fretmaster-stats', JSON.stringify(practiceStats))
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

  // ==================== 调音器功能 ====================
  // 启动调音器
  const startTuner = useCallback(async () => {
    // 若已有检测循环在跑（快速连点的情况），先取消，避免并存多条 rAF 检测链 / 事件监听
    if (tunerAnimationRef.current) {
      cancelAnimationFrame(tunerAnimationRef.current)
      tunerAnimationRef.current = null
    }
    if (tunerUnlistenRef.current) {
      tunerUnlistenRef.current()
      tunerUnlistenRef.current = null
    }
    tunerStreamRunningRef.current = false
    // 🚨 Web 路径才需要停掉「练习用的」MediaStream —— 调音器和练习共用同一个 AudioContext
    //    时会出现两条检测链抢同一个流。Tauri 路径**不能**在这里关 micEnabled：
    //    它是设置页「启用音频输入」的全局开关，调音器只是复用同一个 Rust 采集后端
    //    （下面 startAudioCapture 会重建采集，stopTuner 再停）。
    //    旧实现在这里无差别 `setMicEnabled(false)` ⇒ 用户从设置页开启音频后，
    //    只要碰过一次调音器，全局开关就被悄悄关掉，回练习/调音页完全没反应
    //    （Rust 采集已停、pipeline 守卫判定未采集而静默空转）。
    if (!isTauri && micEnabled) {
      await stopAudioInput()
      setMicEnabled(false)
    }
    if (isTauri) {
      // Tauri环境：Rust 原生音频 + 事件流（pitch-detected 每 50ms 一帧，替代每帧一次 IPC 的 rAF 轮询）
      try {
        const { startAudioCapture, listenPitchDetected, startPitchStream } = await import('@/lib/native-audio')

        await startAudioCapture(selectedAudioDevice || undefined)
        setTunerActive(true)
        toast.success(t('tuner_start'))

        const off = await listenPitchDetected((event) => {
          try {
            const result = event.pitch

            if (result && result.frequency > 0 && (result.confidence?.yin ?? 0) > confidenceThresholdRef.current) {
              const noteName = frequencyToNoteName(result.frequency)
              const noteResult = frequencyToNote(result.frequency, referenceFrequency)

              tunerHistoryRef.current.push({
                frequency: result.frequency,
                note: noteName || "-",
                cents: noteResult.cents
              })

              if (tunerHistoryRef.current.length > 5) {
                tunerHistoryRef.current.shift()
              }

              if (tunerHistoryRef.current.length >= 3) {
                const weights = [0.1, 0.2, 0.3, 0.4]
                let weightedFreq = 0
                let totalWeight = 0

                tunerHistoryRef.current.forEach((item, index) => {
                  const weight = weights[Math.min(index, weights.length - 1)]
                  weightedFreq += item.frequency * weight
                  totalWeight += weight
                })

                const smoothedFreq = weightedFreq / totalWeight
                const smoothedNote = frequencyToNoteName(smoothedFreq)
                const smoothedResult = frequencyToNote(smoothedFreq, referenceFrequency)

                setDetectedNote(smoothedNote || "-")
                setDetectedFrequency(Math.round(smoothedFreq))
                setCents(smoothedResult.cents)
              } else {
                setDetectedNote(noteName || "-")
                setDetectedFrequency(Math.round(result.frequency))
                setCents(noteResult.cents)
              }
            }
          } catch (e) {
            console.error('Native pitch event error:', e)
          }
        })

        tunerUnlistenRef.current = off
        await startPitchStream(NATIVE_PITCH_INTERVAL_MS)
        tunerStreamRunningRef.current = true
      } catch (err) {
        console.error('Failed to start native tuner:', err)
        toast.error(t('tuner_need_mic'))
      }
    } else {
      // Web环境：使用Web Audio API
      try {
        const constraints: MediaStreamConstraints = {
          audio: selectedAudioDevice 
            ? { 
                deviceId: { ideal: selectedAudioDevice },
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false
              }
            : {
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false
              }
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        tunerStreamRef.current = stream

        const audioContext = new (getAudioContextClass())({
          sampleRate: 48000,
          latencyHint: 'interactive'
        })
        tunerAudioContextRef.current = audioContext
        // Tauri WebView2 / autoplay policy 下 AudioContext 可能挂起，需显式 resume
        if (audioContext.state === 'suspended') {
          audioContext.resume().catch(() => {})
        }

        const source = audioContext.createMediaStreamSource(stream)
        
        const gainNode = audioContext.createGain()
        gainNode.gain.value = inputGain
        tunerGainNodeRef.current = gainNode
        
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 4096
        tunerAnalyserRef.current = analyser

        source.connect(gainNode)
        gainNode.connect(analyser)

        tunerHistoryRef.current = []
        
        setTunerActive(true)
        toast.success(t('tuner_start'))

        let isActive = true
        
        const detectPitch = () => {
          if (!isActive || !analyser || !audioContext) return

          const buffer = new Float32Array(analyser.fftSize)
          analyser.getFloatTimeDomainData(buffer)

          const currentAlgorithm = pitchAlgorithmRef.current
          // YIN 门限与练习路径同源（见 lib/pitch-detection 的 resolveYinThreshold）
          const yinThreshold = resolveYinThreshold(instrumentConfig.lowestStringHz)
          let yinResult: { frequency: number; probability: number } | null = null

          // 使用完整缓冲区（与练习模式一致），低频需要更多周期才能准确检测
          if (currentAlgorithm === 'solo') {
            const soloAnalyser = getSOLOYinAnalyser(buffer.length, audioContext.sampleRate, yinThreshold)
            const soloResult = soloAnalyser.analyze(buffer)
            if (soloResult && soloResult.valid) {
              yinResult = {
                frequency: soloResult.frequency,
                probability: soloResult.probability
              }
            }
          } else {
            yinResult = YINPitchDetection(buffer, audioContext.sampleRate, yinThreshold, 0.1)
          }

          if (!yinResult || !yinResult.frequency) {
            tunerAnimationRef.current = requestAnimationFrame(detectPitch)
            return
          }

          // 调音表是**独立**的收音路径：自己的 AudioContext + MediaStream + rAF 轮询，
          // 既不经过 worklet/ScriptProcessor，也没有环境噪声校准（底噪只有本模块级的初值）。
          // 所以这里保留固定阈值，**不要**照搬练习路径的 `getOnsetGate()` —— 那条门限
          // 反映的是练习流的环境底噪，与调音表这条流的房间噪声无关。
          const rms = calculateRMS(buffer)
          const energyThreshold = yinResult.frequency < 110 ? 0.001 : 0.002
          if (rms < energyThreshold) {
            tunerAnimationRef.current = requestAnimationFrame(detectPitch)
            return
          }

          // 谐波增强处理 - 针对低频（与练习模式一致）
          let detectedFreq = yinResult.frequency
          if (detectedFreq < 110) {
            const possibleFundamental = detectedFreq / 2
            let fundamentalResult: { frequency: number; probability: number } | null = null

            if (currentAlgorithm === 'solo') {
              const soloAnalyser2 = getSOLOYinAnalyser(buffer.length, audioContext.sampleRate, yinThreshold)
              const soloResult2 = soloAnalyser2.analyze(buffer)
              if (soloResult2 && soloResult2.valid) {
                fundamentalResult = {
                  frequency: soloResult2.frequency,
                  probability: soloResult2.probability
                }
              }
            } else {
              fundamentalResult = YINPitchDetection(buffer, audioContext.sampleRate, yinThreshold, 0.1)
            }

            if (fundamentalResult && fundamentalResult.frequency &&
                Math.abs(fundamentalResult.frequency - possibleFundamental) < 5) {
              detectedFreq = possibleFundamental
            }
          }

          if (detectedFreq > 0 && yinResult.probability > confidenceThresholdRef.current) {
            const noteName = frequencyToNoteName(detectedFreq)
            const result = frequencyToNote(detectedFreq, referenceFrequency)

            tunerHistoryRef.current.push({
              frequency: detectedFreq,
              note: noteName || "-",
              cents: result.cents
            })

            if (tunerHistoryRef.current.length > 5) {
              tunerHistoryRef.current.shift()
            }

            if (tunerHistoryRef.current.length >= 3) {
              const weights = [0.1, 0.2, 0.3, 0.4]
              let weightedFreq = 0
              let totalWeight = 0

              tunerHistoryRef.current.forEach((item, index) => {
                const weight = weights[Math.min(index, weights.length - 1)]
                weightedFreq += item.frequency * weight
                totalWeight += weight
              })

              const smoothedFreq = weightedFreq / totalWeight
              const smoothedNote = frequencyToNoteName(smoothedFreq)
              const smoothedResult = frequencyToNote(smoothedFreq, referenceFrequency)

              setDetectedNote(smoothedNote || "-")
              setDetectedFrequency(Math.round(smoothedFreq))
              setCents(smoothedResult.cents)
            } else {
              setDetectedNote(noteName || "-")
              setDetectedFrequency(Math.round(detectedFreq))
              setCents(result.cents)
            }
          }

          tunerAnimationRef.current = requestAnimationFrame(detectPitch)
        }

        tunerAnimationRef.current = requestAnimationFrame(detectPitch)
        
        return () => {
          isActive = false
        }
      } catch (err) {
        console.error('Failed to start tuner:', err)
        toast.error(t('tuner_need_mic'))
      }
    }
    // stopAudioInput 声明在本 hook 之后（TDZ）：deps 数组是立即求值的，加进来会在
    // 渲染期抛 "used before declaration"。而本函数体延迟执行（点调音器才跑），调用时
    // 它早已初始化，故省略该依赖是安全的。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTauri, micEnabled, setMicEnabled, selectedAudioDevice, t, referenceFrequency, inputGain, instrumentConfig.lowestStringHz])

  // 停止调音器
  const stopTuner = useCallback(async () => {
    if (tunerAnimationRef.current) {
      cancelAnimationFrame(tunerAnimationRef.current)
      tunerAnimationRef.current = null
    }

    if (isTauri) {
      // 拆除事件监听与 Rust 检测线程（事件驱动改造新增）
      if (tunerUnlistenRef.current) {
        tunerUnlistenRef.current()
        tunerUnlistenRef.current = null
      }
      if (tunerStreamRunningRef.current) {
        tunerStreamRunningRef.current = false
        try {
          const { stopPitchStream } = await import('@/lib/native-audio')
          await stopPitchStream()
        } catch (e) {
          console.error('Failed to stop pitch stream:', e)
        }
      }
      // 🚨 只在「设置里也没开音频输入」时才拆掉 Rust 采集。
      //    stopTuner 是「退出调音」，不是「关闭音频输入」—— 两者是不同层级的意图。
      //    旧实现无条件 stopAudioCapture() ⇒ 调音器一关，练习模式的收音也一起死，
      //    且 `pipeline.rs` 的 `if !is_capturing()` 守卫会让后续检测**静默空转**
      //    （不报错、只是没反应），正是用户看到的现象。
      //    调音器复用的是同一个采集后端，退出时把它留着交给练习模式继续用。
      if (!useAppStore.getState().audio.micEnabled) {
        try {
          const { stopAudioCapture } = await import('@/lib/native-audio')
          await stopAudioCapture()
        } catch (e) {
          console.error('Failed to stop native audio:', e)
        }
      }
    }

    if (tunerStreamRef.current) {
      tunerStreamRef.current.getTracks().forEach(track => track.stop())
      tunerStreamRef.current = null
    }

    if (tunerAudioContextRef.current) {
      tunerAudioContextRef.current.close()
      tunerAudioContextRef.current = null
    }

    tunerAnalyserRef.current = null
    tunerGainNodeRef.current = null
    setTunerActive(false)
    setDetectedNote("-")
    setDetectedFrequency(0)
    setCents(0)
    toast.success(t('tuner_stop'))
  }, [t, isTauri])

  // 切换调音器状态
  const toggleTuner = useCallback(() => {
    if (tunerActive) {
      stopTuner()
    } else {
      startTuner()
    }
  }, [tunerActive, startTuner, stopTuner])

  // 关闭调音器面板时停止调音
  useEffect(() => {
    if (!tunerOpen && tunerActive) {
      stopTuner()
    }
  }, [tunerOpen, tunerActive, stopTuner])

  const saveSettings = useCallback(() => {
    toast.success(t('save_success'))
  }, [t])

  // 单取 action：`store` 是 useAppStore.getState() 快照，引用会随 state 变化，
  // 放进 deps 会让本回调每次渲染都重建（并可能连锁触发下游）。
  const resetSettingsAction = useAppStore((s) => s.resetSettings)
  const resetSettings = useCallback(() => {
    resetSettingsAction()
    // 校准记录是 audio slice 的字段，会跟着一起回默认 ⇒ 运行中的收音链路也要回默认，
    // 否则会出现「设置已重置，门限却还按着之前那间屋子的底噪走」。
    // worklet 侧传 null 表示**清除**（内部回落到 0.0005，之后照常 EMA 跟踪）；
    // TS 侧 resetPitchDetectionState() 把模块级噪声底与 SOLO 单例一起复位
    // （它同时清掉 pendingSoloNoiseFloor 那笔账）。
    const node = audioWorkletNodeRef.current
    if (node) {
      node.port.postMessage({ type: 'updateParams', data: { noiseFloor: null } })
    }
    resetPitchDetectionState()
    toast.success(t('reset_settings_hint'))
  }, [resetSettingsAction, t])

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
  }, [language, chordScaleDisplay, noteAccidentalDisplay, theme, practiceTime, fretCount, metronomeBpm, inputGain, cooldownEnabled, cooldownDuration, confidenceThreshold, sensitivity, customChords, t])

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
        setMetronomeBpm(num(settings.metronomeBpm, 80))
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
  }, [setChordScaleDisplay, setConfidenceThreshold, setCooldownDuration, setCooldownEnabled, setFretCount, setInputGain, setLanguage, setMetronomeBpm, setNoteAccidentalDisplay, setPracticeTime, setSensitivity, setTheme, t])

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

  const metronomeAudioCtxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    return () => {
      if (metronomeAudioCtxRef.current) {
        metronomeAudioCtxRef.current.close()
        metronomeAudioCtxRef.current = null
      }
    }
  }, [])

  // 节拍器效果
  useEffect(() => {
    if (metronomeEnabled && isPlaying) {
      const interval = 60000 / metronomeBpm
      metronomeRef.current = setInterval(() => {
        if (metronomeSound) {
          try {
            if (!metronomeAudioCtxRef.current || metronomeAudioCtxRef.current.state === 'closed') {
              const AudioCtx = getAudioContextClass()
              metronomeAudioCtxRef.current = new AudioCtx()
            }
            const ctx = metronomeAudioCtxRef.current
            if (ctx.state === 'suspended') {
              ctx.resume().catch(() => {})
            }
            const oscillator = ctx.createOscillator()
            const gainNode = ctx.createGain()
            oscillator.connect(gainNode)
            gainNode.connect(ctx.destination)
            oscillator.frequency.value = 800
            oscillator.type = "sine"
            gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1)
            oscillator.start(ctx.currentTime)
            oscillator.stop(ctx.currentTime + 0.1)
          } catch (e) {
            console.error('Metronome audio error:', e)
          }
        }
        if (metronomeFlash) {
          const flashLayer = document.getElementById('metronome-flash-layer')
          if (flashLayer) {
            flashLayer.style.opacity = '1'
            setTimeout(() => {
              if (flashLayer) flashLayer.style.opacity = '0'
            }, 100)
          }
        }
      }, interval)
    } else {
      // 仅在节拍器关闭或停止练习时关闭 AudioContext，BPM 变化时不会触发此分支
      if (metronomeAudioCtxRef.current) {
        metronomeAudioCtxRef.current.close().catch(() => {})
        metronomeAudioCtxRef.current = null
      }
    }
    return () => {
      if (metronomeRef.current) clearInterval(metronomeRef.current)
    }
  }, [metronomeEnabled, isPlaying, metronomeBpm, metronomeSound, metronomeFlash])

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

  // 初始加载和监听设备变化（仅限 Web 版本）
  useEffect(() => {
    if (isTauri) return
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return

    // 请求权限并枚举设备
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
    
    // 初始加载时请求权限
    requestPermissionAndGetDevices()
    
    // 监听设备变化（插入/拔出USB音频设备）
    const handleDeviceChange = (() => {
      let debounceTimer: NodeJS.Timeout | null = null
      return async () => {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(async () => {
          await enumerateAudioDevices(true)
        }, 500)
      }
    })()
    
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
    }
  }, [enumerateAudioDevices, isTauri])

  // 当设置面板打开时，刷新设备列表
  useEffect(() => {
    if (isTauri) return
    if (settingsOpen && typeof navigator !== 'undefined' && navigator.mediaDevices) {
      enumerateAudioDevices(false)
    }
  }, [settingsOpen, enumerateAudioDevices, isTauri])

  // 初始化MIDI - 当开启开关时才申请权限
  useEffect(() => {
    if (!midiEnabled) return
    
    if (typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator) {
      navigator.requestMIDIAccess().then(access => {
        setMidiAccess(access)
        const inputs = Array.from(access.inputs.values()).filter(d => d.id)
        setMidiDevices(inputs)
        
        access.onstatechange = () => {
          const updatedInputs = Array.from(access.inputs.values()).filter(d => d.id)
          setMidiDevices(updatedInputs)
        }
      }).catch(err => {
        console.error('MIDI access denied:', err)
        toast.error(t('midi_device_none'))
        setMidiEnabled(false)
      })
    } else {
      toast.error(t('midi_device_none'))
      setMidiEnabled(false)
    }
  }, [midiEnabled, t])

  // MIDI消息处理
  useEffect(() => {
    if (!midiEnabled || !midiAccess) return
    
    const handleMIDIMessage = (event: WebMidi.MIDIMessageEvent) => {
      const [command, note, velocity] = event.data
      
      if (command === 144 && velocity > 0) {
        // Note on
        const noteName = NOTES[note % 12]
        setDetectedPitch(noteName)
        
        // 处理MIDI输入 - 使用ref避免循环依赖
        if (handleMIDINoteInputRef.current) {
          handleMIDINoteInputRef.current(noteName)
        }
      }
    }
    
    midiDevices.forEach(device => {
      if (selectedMidiDevice === 'random' || device.id === selectedMidiDevice) {
        device.onmidimessage = handleMIDIMessage
      }
    })
    
    return () => {
      midiDevices.forEach(device => {
        device.onmidimessage = null
      })
    }
  }, [midiEnabled, midiAccess, midiDevices, selectedMidiDevice, setDetectedPitch])

  // 音频输入处理

  /**
   * 把与 ScriptProcessor 路径一致的动态 YIN 参数推送给 worklet
   * （低频目标 threshold/cliff 0.05，其余 0.1）。带变更守卫，参数没变就不发消息。
   * #23：此前 worklet 的门限一直是硬编码默认值（threshold 0.15），低音弦的检测质量与
   * ScriptProcessor 路径不一致。
   */
  const workletYinParamsKeyRef = useRef('')
  // 音高检测下限随乐器变化：吉他族保持 70Hz 级（搜索下限本身就是工频哼声护栏），
  // 只有贝斯/七弦这类真有 30~62Hz 音的乐器才下探。TS 路径（ScriptProcessor 回退）与
  // worklet 共用这个值 —— 前者读模块级设置，后者由 syncWorkletYinParams 推送。
  useEffect(() => {
    const floor = detectFloorForLowestHz(instrumentConfig.lowestStringHz)
    setMinDetectFreq(floor)
    logger.debug('音高检测下限已按乐器设置', 'instrument:', user.instrument, 'lowestStringHz:', instrumentConfig.lowestStringHz, 'floor(Hz):', floor.toFixed(2))
    // 桌面端还要同步 YIN 门限（与 web 三条路径同源，见 lib/pitch-detection 的 resolveYinThreshold）：
    // Rust detector 默认 0.15，跨会话从不自动调整（只受 set_pitch_threshold 影响，此前零调用）
    // ⇒ 贝斯/七弦低 B 用户永远拿不到放宽后的 0.2（低频段 CMND 天然偏高，门限越紧越检不出）。
    // 本 effect 是唯一同步点（挂载 + 每次换乐器都跑）；detector 常驻 pipeline，与是否在采集无关。
    if (isTauri) {
      void import('@/lib/native-audio').then(({ setPitchThreshold }) =>
        setPitchThreshold(resolveYinThreshold(instrumentConfig.lowestStringHz))
      )
    }
  }, [instrumentConfig.lowestStringHz, user.instrument, isTauri])

  const syncWorkletYinParams = useCallback(() => {
    const node = audioWorkletNodeRef.current
    // 门限按乐器音域解析，与 TS 两条路径同源（见 lib/pitch-detection 的 resolveYinThreshold）
    const threshold = resolveYinThreshold(instrumentConfig.lowestStringHz)
    const probabilityCliff = 0.1
    const floor = getMinDetectFreq()
    const key = `${threshold}/${probabilityCliff}/${floor.toFixed(2)}`
    if (key === workletYinParamsKeyRef.current) return
    workletYinParamsKeyRef.current = key
    if (!node) return
    node.port.postMessage({ type: 'updateParams', data: { threshold, probabilityCliff, minDetectFreq: floor } })
  }, [instrumentConfig.lowestStringHz])

  /**
   * 把校准结果**立刻**下发给当前在跑的两条收音路径。
   *
   * - worklet：`updateParams.noiseFloor` 是一次性覆盖（之后 worklet 照常 EMA 跟踪）。
   *   页面**不会**每帧下发 —— 那会把 EMA 钉死，换房间 / 关空调后门限再也不能自适应。
   * - TS 路径（ScriptProcessor 回退）：`lib/pitch-detection` 的噪声底是**模块级/进程级**状态。
   *   只下发 worklet 会复现「开 worklet 测得到、关掉测不到」的双路径分叉（本项目踩过）。
   */
  const applyNoiseFloor = useCallback((floor: number) => {
    seedPitchDetectionNoiseFloor(floor)
    const node = audioWorkletNodeRef.current
    if (node) {
      node.port.postMessage({ type: 'updateParams', data: { noiseFloor: floor } })
    }
  }, [])

  /**
   * 用户主动校准环境噪声底：倒计时 3 秒 → 采样 1 秒（50 帧）→ 取 85 百分位。
   * 测量口径见 `lib/noise-calibration.ts`（只借竞品 GuitarRun 的**测量方法**，
   * 门限仍用本项目的 `max(0.0008, 底噪 × 1.5)`，不是它的 ×3.2）。
   *
   * 采样点选在 `analyser`：链路是 `source → gain → analyser → worklet/scriptProcessor`，
   * 与检测器看到的是**同一条链路、同一个增益**，所以量出来的值可以和门限直接比较。
   *
   * 失败一律「如实报错 + 让用户重试」，**不悄悄回落默认值** —— 那会让用户以为量准了。
   */
  const calibrateNoiseFloor = useCallback(async () => {
    if (noiseCalibratingRef.current) return
    if (isTauriEnv()) {
      // 桌面版走 Rust cpal，Web Audio 的 analyser 不在链路上，量不到真实底噪
      toast.info(t('noise_calib_tauri_unsupported'))
      return
    }
    const analyser = analyserNode
    if (!analyser) {
      toast.error(t('noise_calib_need_mic'))
      return
    }

    noiseCalibratingRef.current = true
    noiseCalibrationAbortRef.current = false
    setNoiseCalibrating(true)
    try {
      let frame = new Float32Array(analyser.fftSize)
      const result = await runNoiseFloorCalibration({
        readFrame: () => {
          // fftSize 理论上不变，但切设备后可能重建 analyser；长度不符就重取，避免抛错
          if (frame.length !== analyser.fftSize) frame = new Float32Array(analyser.fftSize)
          analyser.getFloatTimeDomainData(frame)
          return calculateRMS(frame)
        },
        sleep: (ms) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms) }),
        // 倒计时阶段报 3/2/1，进入采样时报 0（UI 用它切换成「采样中」）
        onCountdown: (s) => setNoiseCalibrationCountdown(s > 0 ? s : null),
        onProgress: (sampled) => setNoiseCalibrationProgress(sampled),
        isCancelled: () => noiseCalibrationAbortRef.current,
      })

      if (!result) {
        toast.error(t('noise_calib_failed'))
        return
      }

      setNoiseFloor(result.noiseFloor)
      applyNoiseFloor(result.noiseFloor)
      logger.debug(
        '[噪声校准] 完成',
        `noiseFloor=${result.noiseFloor.toFixed(6)}`,
        `raw=${result.raw.toFixed(6)}`,
        `samples=${result.sampleCount}`,
        `gate=${onsetGateFromNoiseFloor(result.noiseFloor).toFixed(6)}`
      )
      toast.success(
        t('noise_calib_done')
          .replace('{noise}', formatNoisePercent(result.noiseFloor))
          .replace('{gate}', formatNoisePercent(onsetGateFromNoiseFloor(result.noiseFloor)))
      )
    } catch (err) {
      console.error('噪声校准失败:', err)
      toast.error(t('noise_calib_failed'))
    } finally {
      setNoiseCalibrating(false)
      setNoiseCalibrationCountdown(null)
      setNoiseCalibrationProgress(null)
      noiseCalibratingRef.current = false
    }
  }, [analyserNode, setNoiseFloor, applyNoiseFloor, t])

  // 卸载时中止未完成的校准（否则定时器会在组件消失后继续跑，最后 setState 到已卸载组件）
  useEffect(() => () => { noiseCalibrationAbortRef.current = true }, [])

  const startAudioInput = useCallback(async () => {
    // Tauri 环境使用 Rust cpal 直接采集，不走 getUserMedia（避免 WebView2 权限弹窗）
    if (isTauriEnv()) {
      logger.warn('Tauri 环境应使用 native audio，startAudioInput 已阻止')
      return
    }
    // 复位检测器的自适应状态（噪声底跨帧累积，且 TS 路径是模块级/进程级状态）
    resetPitchDetectionState()
    // 复位后如果用户之前校准过房间，就把它当作本次会话的起点，而不是让 EMA 从 0.0005
    // 慢慢爬（上升 alpha 是 0.0005，约需 20 秒）—— 那 20 秒正是换房间后误检最多的时候。
    if (noiseFloor !== undefined) {
      seedPitchDetectionNoiseFloor(noiseFloor)
    }
    if (tunerActive) {
      stopTuner()
    }
    if (audioContext) {
      return
    }
    logger.debug('startAudioInput: 开始初始化音频...')
    setAudioInitializing(true)
    setAudioError(null)
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
        const isHttps = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        const errorMsg = language === 'zh-CN' 
          ? isHttps 
            ? '浏览器不支持音频输入，请更换浏览器（Chrome/Firefox/Edge）'
            : '音频输入需要 HTTPS 安全连接。请使用 HTTPS 地址访问，或下载桌面版应用'
          : isHttps 
            ? 'Browser does not support audio input. Please try Chrome/Firefox/Edge'
            : 'Audio input requires HTTPS. Please use HTTPS URL or download the desktop app'
        toast.error(errorMsg)
        setAudioError(errorMsg)
        throw new Error(errorMsg)
      }

      try {
        const { needsUserInteractionForAudio, handleIOSAudioUnlock } = await import('@/lib/ios-compat')
        if (needsUserInteractionForAudio()) {
          await handleIOSAudioUnlock()
        }
      } catch {
        // iOS compat not available, continue
      }
      // 音频约束 - 与原HTML文件一致
      //
      // `latency` 是 Chrome 的实验性约束，不在标准 `MediaTrackConstraints` 里。
      // 用交叉类型补齐，而不是 `@ts-ignore` —— 后者会连这一整段里**其它真正的类型错误**
      // 一起吞掉（比如哪天 `sampleRate` 拼错也不会报错）。
      const audioConstraints: MediaTrackConstraints & { latency?: number } = {
        deviceId: selectedAudioDevice ? { ideal: selectedAudioDevice } : undefined,
        sampleRate: 48000,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        latency: 0.01
      }
      const constraints: MediaStreamConstraints = { audio: audioConstraints }
      let stream: MediaStream
      logger.debug('startAudioInput: 正在调用 getUserMedia...')
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        logger.debug('startAudioInput: getUserMedia 成功')
      } catch (permissionErr: unknown) {
        console.error('startAudioInput: getUserMedia 失败:', permissionErr)
        const err = permissionErr as { name?: string; message?: string }
        let errorMsg = ''
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errorMsg = language === 'zh-CN'
            ? '麦克风权限被拒绝。请在浏览器设置中允许访问麦克风，然后刷新页面重试。'
            : 'Microphone permission denied. Please allow microphone access in browser settings and refresh the page.'
        } else if (err.name === 'NotFoundError') {
          errorMsg = language === 'zh-CN'
            ? '未找到麦克风设备。请检查麦克风是否已连接。'
            : 'No microphone found. Please check if your microphone is connected.'
        } else if (err.name === 'NotReadableError') {
          errorMsg = language === 'zh-CN'
            ? '麦克风被其他应用程序占用。请关闭其他使用麦克风的应用后重试。'
            : 'Microphone is being used by another application. Please close other apps using the microphone and try again.'
        } else {
          errorMsg = language === 'zh-CN'
            ? `无法访问麦克风: ${err.message || '未知错误'}`
            : `Cannot access microphone: ${err.message || 'Unknown error'}`
        }
        toast.error(errorMsg)
        setAudioError(errorMsg)
        throw permissionErr
      }
      mediaStreamRef.current = stream
      
      // 创建 AudioContext - 与原HTML文件一致，固定48000采样率
      const ctx = new (getAudioContextClass())({
        sampleRate: 48000,
        latencyHint: 'interactive'
      })
      const source = ctx.createMediaStreamSource(stream)
      
      const gainNode = ctx.createGain()
      gainNode.gain.value = inputGain
      gainNodeRef.current = gainNode
      
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 4096
      
      // 尝试使用 AudioWorklet，如果不支持则回退到 ScriptProcessorNode
      let useWorklet = useAudioWorklet && !!ctx.audioWorklet
      logger.debug('startAudioInput: 检查 AudioWorklet 支持...', 'useAudioWorklet:', useAudioWorklet, 'ctx.audioWorklet:', !!ctx.audioWorklet)
      if (useAudioWorklet && ctx.audioWorklet) {
        try {
          // 加载 AudioWorklet 处理器
          logger.debug('startAudioInput: 正在加载 AudioWorklet 模块...')
          const workletPath = getAudioWorkletModulePath()
          await ctx.audioWorklet.addModule(workletPath)
          logger.debug('startAudioInput: AudioWorklet 模块加载成功, path:', workletPath)
          
          // 创建 AudioWorkletNode
          const workletNode = new AudioWorkletNode(ctx, 'pitch-detection-processor', {
            processorOptions: {
              sampleRate: ctx.sampleRate,
              // 4096（原 2048）：YIN 可解析的最长周期是 halfBufferSize 个采样，
              // 2048 只能到 ~46.9Hz，贝斯 E1(41.2)/B0(30.9) 与七弦低 B(61.7，tau=777>684 上限) 都够不到。
              // hopSize 不变，因此检测刷新率/延迟不变（仍是 512/48000 ≈ 10.7ms 一帧）。
              bufferSize: 4096,
              hopSize: 512,
              // 用户主动校准过的环境噪声底，作为 worklet 的初值。
              // undefined 时 worklet 自己回落到 0.0005 并由 EMA 慢慢爬 —— 那是「没校准过」的正常路径。
              noiseFloor,
            }
          })
          audioWorkletNodeRef.current = workletNode
          
          // 推送初始动态 YIN 参数（低频目标判定），此后由消息处理器在目标变化时同步
          syncWorkletYinParams()
          
          // 设置消息处理 - 使用 ref 确保始终调用最新的回调
          workletNode.port.onmessage = (event) => {
            if (handleAudioWorkletMessageRef.current) {
              handleAudioWorkletMessageRef.current(event.data)
            }
          }
          
          // 连接音频节点（不连接到扬声器，避免音频反馈）
          source.connect(gainNode)
          gainNode.connect(analyser)
          analyser.connect(workletNode)
          
          useWorklet = true
          logger.debug('AudioWorklet 初始化成功')
        } catch (workletError) {
          console.warn('AudioWorklet 初始化失败，回退到 ScriptProcessorNode:', workletError)
          setUseAudioWorklet(false)
        }
      }
      
      // 如果不使用 AudioWorklet，使用 ScriptProcessorNode
      if (!useWorklet) {
        // 性能优化：增大缓冲区减少回调频率（从4096增加到8192）
        // ⚠️ 这个长度决定了本路径的帧间隔（~186ms @44.1k），多帧一致的帧数由它换算
        //    （见 frameMsOf(SCRIPT_PROCESSOR_BUFFER_SIZE, …)）。改动此处会让确认延迟跟着变。
        const scriptProcessor = ctx.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1)
        scriptProcessorRef.current = scriptProcessor
        
        source.connect(gainNode)
        gainNode.connect(analyser)
        analyser.connect(scriptProcessor)
        // ScriptProcessorNode 需要连接到 destination 才能触发 onaudioprocess
        // 但我们创建一个静音的 gain 节点来避免声音输出
        const silentGain = ctx.createGain()
        silentGain.gain.value = 0
        scriptProcessor.connect(silentGain)
        silentGain.connect(ctx.destination)
        
        startPitchDetectionWithNodes(analyser, ctx, scriptProcessor)
      }
      
      setAudioContext(ctx)
      setAnalyserNode(analyser)
      setAudioError(null)
      
      const modeText = useWorklet ? 'AudioWorklet' : 'ScriptProcessorNode'
      logger.debug(`%c[音频模式] 当前使用: ${modeText}`, 'color: #00ff00; font-size: 14px; font-weight: bold;')
      logger.debug(`[音频模式] useWorklet: ${useWorklet}, useAudioWorklet状态 ${useAudioWorklet}`)
      
      toast.success(language === 'zh-CN' ? 
        (useWorklet ? '音频输入已启用(AudioWorklet)' : '音频输入已启用(ScriptProcessor)') : 
        (useWorklet ? 'Audio input started (AudioWorklet)' : 'Audio input started (ScriptProcessor)'))
    } catch (err) {
      console.error('Failed to start audio input:', err)
      setMicEnabled(false)
      throw err
    } finally {
      setAudioInitializing(false)
    }
    // startPitchDetectionWithNodes 声明在本 hook 之后（TDZ）：deps 数组是立即求值的，
    // 加进来会在渲染期抛 "used before declaration"。而本函数体延迟执行（点麦才跑），
    // 调用时它早已初始化，故省略该依赖是安全的。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noiseFloor, tunerActive, audioContext, setAudioInitializing, setAudioError, stopTuner, selectedAudioDevice, inputGain, useAudioWorklet, language, syncWorkletYinParams, setMicEnabled])

  // 处理 AudioWorklet 消息


  // 更新 AudioWorklet 消息处理函数的 ref
  const handleAudioWorkletMessage = useCallback((message: { type: string; data: unknown }) => {
    const { type, data } = message

    // 练习目标变化时同步动态 YIN 参数到 worklet（低频目标用更宽松的门限）
    syncWorkletYinParams()
    
    if (type === 'pitchDetected') {
      const pitchData = data as { 
        frequency: number | null
        probability: number
        clarity: number
        energy: number
        hasSignal: boolean
        /** YIN 原始频率（未经 smoothFrequency 平滑）；判定用它、显示用 frequency */
        rawFrequency?: number | null
        /** worklet 的 _detectAmplitudeDiff 结果，作为多帧一致的起音信号 */
        isNoteOnset?: boolean
      }
      
      
      // 处理音高检测结果 - 使用与 ScriptProcessorNode 相同的逻辑
      if (pitchData.frequency && pitchData.hasSignal && pitchData.probability > (confidenceThresholdRef.current || 0.8)) {
        const detectedNote = frequencyToNoteName(pitchData.frequency)
        if (detectedNote) {
          setDetectedPitch(detectedNote)
          
          // 如果正在练习，处理匹配逻辑
          if (isPlayingRef.current && !isCoolingDownRef.current) {
            processPracticeMatchRef.current({
              frequency: pitchData.frequency,
              note: detectedNote,
              probability: pitchData.probability,
              isNoteOnset: pitchData.isNoteOnset,
              rawFrequency: pitchData.rawFrequency ?? undefined,
              frameMs: frameMsOf(AUDIO_WORKLET_HOP_SIZE, audioContextRef.current?.sampleRate ?? 0)
            })
          }
        }
      }
    } else if (type === 'debug') {
      logger.debug('AudioWorklet Debug:', data)
    }
  }, [setDetectedPitch, syncWorkletYinParams])

  // 更新 AudioWorklet 消息处理函数的 ref
  useEffect(() => {
    handleAudioWorkletMessageRef.current = handleAudioWorkletMessage
  }, [handleAudioWorkletMessage])

  const stopAudioInput = useCallback(() => {
    // 关麦会拆掉 analyser 所在的链路 ⇒ 正在跑的校准必须中止，否则它会在静默中
    // 采到一堆「读不到帧」的无效样本，最后报一个假的「环境很安静」结果。
    // （中止后 runNoiseFloorCalibration 返回 null，UI 提示重试。）
    noiseCalibrationAbortRef.current = true
    // 停止 AudioWorkletNode
    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.port.onmessage = null
      audioWorkletNodeRef.current.disconnect()
      audioWorkletNodeRef.current = null
    }
    
    // 停止 ScriptProcessorNode
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.onaudioprocess = null
      scriptProcessorRef.current.disconnect()
      scriptProcessorRef.current = null
    }
    // 停止增益节点
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect()
      gainNodeRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }
    if (audioContext) {
      audioContext.close().catch(() => {})
      setAudioContext(null)
    }
    if (pitchDetectionRef.current) {
      cancelAnimationFrame(pitchDetectionRef.current)
      pitchDetectionRef.current = null
    }
    // 清理冷却期
    if (cooldownRef.current) {
      clearTimeout(cooldownRef.current)
      cooldownRef.current = null
    }
    isCoolingDownRef.current = false
    setAnalyserNode(null)
    setMicEnabled(false)
    setDetectedPitch(null)
    setDetectedCents(null)
  }, [audioContext, setDetectedCents, setDetectedPitch, setMicEnabled])

  // 组件卸载时释放全部音频资源。
  // 原实现只在用户主动停止/关面板时释放，切换路由或 HMR 会导致麦克风持续被占用
  // （录音指示灯常亮）以及 AudioContext 泄漏。
  const audioContextRef = useRef<AudioContext | null>(null)
  useEffect(() => {
    audioContextRef.current = audioContext
  }, [audioContext])

  useEffect(() => {
    return () => {
      // 主音频链路
      if (pitchDetectionRef.current) {
        cancelAnimationFrame(pitchDetectionRef.current)
        pitchDetectionRef.current = null
      }
      if (cooldownRef.current) {
        clearTimeout(cooldownRef.current)
        cooldownRef.current = null
      }
      if (audioWorkletNodeRef.current) {
        audioWorkletNodeRef.current.port.onmessage = null
        audioWorkletNodeRef.current.disconnect()
        audioWorkletNodeRef.current = null
      }
      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.onaudioprocess = null
        scriptProcessorRef.current.disconnect()
        scriptProcessorRef.current = null
      }
      if (gainNodeRef.current) {
        gainNodeRef.current.disconnect()
        gainNodeRef.current = null
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
        mediaStreamRef.current = null
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
        audioContextRef.current = null
      }
      // 调音器链路
      if (tunerAnimationRef.current) {
        cancelAnimationFrame(tunerAnimationRef.current)
        tunerAnimationRef.current = null
      }
      if (tunerStreamRef.current) {
        tunerStreamRef.current.getTracks().forEach(track => track.stop())
        tunerStreamRef.current = null
      }
      if (tunerAudioContextRef.current) {
        tunerAudioContextRef.current.close().catch(() => {})
        tunerAudioContextRef.current = null
      }
    }
  }, [])

  // 当 micEnabled 为 true 时自动启动音频输入（仅限 Web 版本）
  useEffect(() => {
    if (isTauri) return
    if (micEnabled && !audioContext) {
      logger.debug('useEffect: 开始启动音频输入...')
      toast.info(language === 'zh-CN' ? '正在请求麦克风权限...' : 'Requesting microphone permission...')
      startAudioInput().catch(err => {
        console.error('自动启动音频输入失败:', err)
        setMicEnabled(false)
      })
    }
  }, [micEnabled, audioContext, startAudioInput, language, isTauri, setMicEnabled])

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

      if (matched) {
        logger.debug('找音练习匹配成功:', note, '音分差:', adjustedCents.toFixed(1))
        isCoolingDownRef.current = true
        triggerCorrectFeedback(note)
        setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
        recordPositionStat(true)
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
      })

      if (matchedIndex !== null) {
        const matchedInterval = intervals[matchedIndex]
        logger.debug('音程练习匹配成功:', matchedInterval, '音分差:', minCents.toFixed(1))
        triggerCorrectFeedback(note)
        const newCompletedIntervals = [...exercise.completedIntervals, matchedIndex]

        if (newCompletedIntervals.length >= intervals.length) {
          setCurrentIntervalExercise({ ...exercise, completedIntervals: newCompletedIntervals, answered: true })
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
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
        const nextStep = step + 1
        if (nextStep >= sequence.length) {
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
          if (nextScaleExerciseRef.current) {
            nextScaleExerciseRef.current()
          }
        } else {
          setScaleExerciseCurrentStep(nextStep)
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
        }
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
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
          if (nextChordExerciseRef.current) {
            nextChordExerciseRef.current()
          }
        } else {
          // 继续下一个音，不设置 answered 状态
          setChordExerciseCurrentStep(nextStep)
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
        }
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
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
          if (nextChordInfoRef.current && nextChordRef.current) {
            nextChordRef.current()
          }
        } else {
          setChordDegreeCurrentStep(nextStep)
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
        }
        cooldownRef.current = setTimeout(() => {
          isCoolingDownRef.current = false
          cooldownRef.current = null
        }, 800)
      }
    } else if (currentActiveTab === 'tuner') {
      // 调音表模式 - 只显示音高，不需要答题逻辑
    }
  }, [triggerCorrectFeedback, setScore, recordPositionStat, currentIntervalExerciseRef, setCurrentIntervalExercise, generateIntervalExerciseRef, setIntervalPracticeStep, chordExerciseTargetChordRef, chordExerciseSequenceRef, chordExerciseCurrentStepRef, chordExerciseIsAnsweredRef, setChordExerciseIsAnswered, nextChordExerciseRef, setChordExerciseCurrentStep])

  const processPracticeMatchRef = useRef(processPracticeMatch)
  useEffect(() => { processPracticeMatchRef.current = processPracticeMatch }, [processPracticeMatch])

  // Tauri 环境：应用启动时把「音频输入」恢复到用户偏好对应的状态
  //
  // 产品语义（2026-10-02 用户确认）：**默认开** —— 「应该直接启用音频输入，
  // 不需要我每次开启，关闭才需要每次关闭」，且选择「跨会话记住」。
  // ⇒ 有效意图 = `micEnabled || micUserDisabled !== true`
  //    （`micUserDisabled` 只有用户在设置页/M 键**显式关**才会置 true；
  //      从没碰过开关 = 默认开。关了的跨会话记住，不会再默认开。）
  //
  // 🚨 这里曾经是一个**静默失效**的根因（用户报「启用音频输入后点开始练习，
  //    弹任何音都没反应，调音也无效」）：
  //
  //    旧实现 `if (micEnabled) return // 已启用则跳过` 把两个不同层级的东西当成一个：
  //      · `micEnabled`      = **持久化的用户意图**（写在 store 里，跨会话保留）
  //      · Rust 采集在不在跑 = **进程级运行时状态**（每次启动应用都归零）
  //    于是：用户开过一次音频 → `micEnabled=true` 被持久化 →
  //    下次启动应用时 store 恢复 true ⇒ 这里直接 return ⇒ **采集从未启动**，
  //    但界面与练习检测都以为「已启用」（`micEnabled` 为 true、练习 effect 照常
  //    startPitchStream）⇒ Rust 侧 `is_capturing()` 为 false ⇒ `pipeline.rs` 的
  //    `if !pipeline.is_capturing()` 守卫让检测线程静默空转（不报错、只是没反应）。
  //
  //    正确判据必须是**真实运行状态**：先问 Rust「你现在在采集吗」，
  //    只有它说没在采集、而用户意图是「开」时，才去启动采集。
  useEffect(() => {
    if (!isTauri) return

    let cancelled = false
    const restoreAudio = async () => {
      try {
        const { getAudioStatus, stopAudioCapture, ensureCaptureRunning, setNoiseSuppression, setFilters, setGain, setBufferSize } = await import('@/lib/native-audio')

        // ① 先读**真实状态**（不要相信 micEnabled 这个意图标志）
        let actuallyCapturing = false
        try {
          const status = await getAudioStatus()
          actuallyCapturing = !!status.isCapturing
        } catch {
          // 读不到状态时按「未采集」处理：宁可多启动一次（start 是幂等的），
          // 也不要因为读失败就永远不启动采集。
          actuallyCapturing = false
        }
        if (cancelled) return

        // ①.5 把**落盘的音频设置**同步到后端（preprocessor / capture gain 都是**进程级状态**）：
        //      Rust 每次启动一律回到编译期默认值（例如 60Hz 陷波默认**开**、噪声门倍数默认
        //      1.5），而设置页显示的是 store 落盘值（默认 60Hz 陷波**关**）⇒ 不主动对齐就是
        //      「界面显示 A、后端实际跑 B」，用户拖过控件才偶然一致。
        //      同步与「采集开没开」无关（preprocessor 常驻 pipeline），所以放在意图分支
        //      **之前**：哪怕这次意图是「关」，下次开采集时设置也已经是正确的。
        //      `bufferSize` 同属此列：它是 capture 的配置字段，起流时按它设置固定缓冲
        //      （Rust 每次启动回到 DEFAULT_BUFFER_SIZE），不同步就是「设置页显示 2048、
        //      流实际用别的」（此前的真机实测是设 4096 用 1024）。
        //      独立 try/catch：同步失败最坏只是设置晚一次生效，绝不能让采集恢复陪葬。
        try {
          const effAudio = getEffectiveAudioSettings(useAppStore.getState().audio)
          await setNoiseSuppression(effAudio.noiseSuppression)
          await setFilters({
            highPass: effAudio.highPass,
            lowPass: effAudio.lowPass,
            notch50: effAudio.notch50,
            notch60: effAudio.notch60,
          })
          await setGain(effAudio.inputGain)
          await setBufferSize(effAudio.bufferSize)
        } catch (syncErr) {
          console.error('[Tauri] 同步音频设置失败:', syncErr)
        }

        // ② 有效意图：显式开过，或从未主动关过（默认开）。
        //    首次默认开生效时把 UI 开关也对齐成「开」（setMicEnabled 不动 micUserDisabled，
        //    那不是用户选择）。
        const micWanted = micEnabled || audioSettings.micUserDisabled !== true
        if (micWanted && !micEnabled) {
          store.setMicEnabled(true)
        }

        // ③ 有效意图是「关」（用户显式关过，跨会话记住）⇒ 若 Rust 侧还在采集
        //    （例如异常遗留），把它停掉对齐。
        if (!micWanted) {
          if (actuallyCapturing) {
            await stopAudioCapture()
          }
          return
        }

        // ④ 意图是「开」且真的还没在采集 ⇒ 恢复采集（这正是旧实现漏掉的一步）。
        //    设备挑选（已保存 → 系统默认 → 第一个）收敛在 ensureCaptureRunning 唯一一份。
        const r = await ensureCaptureRunning({
          selectedDevice: audioSettings.selectedAudioDevice || undefined,
          sampleRate: audioSettings.sampleRate || 48000,
          backend: audioSettings.audioBackend || 'wasapi_shared',
        })
        if (cancelled) {
          // 如果已被取消（用户手动停止），立即停止捕获
          await stopAudioCapture()
          return
        }
        if (r.started && r.device) {
          store.setSelectedAudioDevice(r.device)
          logger.info('[Tauri] 已按保存的意图恢复音频输入:', r.device)
        }
      } catch (err) {
        console.error('[Tauri] 恢复音频输入失败:', err)
      }
    }
    restoreAudio()
    return () => { cancelled = true }
    // 🚨 依赖数组刻意只放 [isTauri]：
    //    本 effect 的职责是「启动时对齐一次」。若把 micEnabled 放进依赖，
    //    用户在设置页开关一次就会触发这里重新读状态并与设置页自己的启停竞态
    //    （设置页 startAudio 已经负责启动采集了）。
    //    首帧的 micEnabled 值是 store 恢复后的持久化值，正是我们要用的那个。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTauri])

  // Tauri 环境：练习模式音高检测 —— 事件驱动
  // WindowsAudioSettings 启用音频后，Rust 后端持续采集；练习进行时启动 Rust 检测线程，
  // 由它按 interval 检测并 emit「pitch-detected」事件，前端订阅处理。
  // （替代原 50ms × async IPC 轮询：省去每秒 ~20 次 Tauri invoke 往返，CPU 与延迟双降）
  useEffect(() => {
    if (!isTauri) return
    if (!micEnabled || !isPlaying || tunerActive) return

    let isActive = true
    let unlisten: (() => void) | null = null
    let stopStream: (() => Promise<void>) | null = null
    let lastDisplayedNote: string | null = null
    let lastDisplayUpdateTime = 0
    const DISPLAY_THROTTLE_MS = 50

    const start = async () => {
      const { listenPitchDetected, startPitchStream, stopPitchStream } = await import('@/lib/native-audio')

      // 动态 import 是异步的：若在等待期间 effect 已被清理（isActive=false），
      // 就不能再订阅/启动流——那时 cleanup 早已执行完，会留下无法回收的监听器与 Rust 线程。
      if (!isActive) return
      stopStream = stopPitchStream

      const off = await listenPitchDetected((event) => {
        if (!isActive) return

        try {
          const result = event.pitch
          if (!result || result.frequency <= 0) return

          // 与 Web 路径对齐：使用 YIN probability（confidence.yin）而非 overall
          // overall = 0.5*yin + 0.25*harmonic + 0.25*temporal，前 ~400ms temporal 未累积会偏低
          // yin probability 单次好检测即可达 0.85-0.99，与 Web AudioWorklet 路径行为一致
          const prob = result.confidence?.yin ?? 0
          const currentConfidenceThreshold = confidenceThresholdRef.current
          if (prob <= currentConfidenceThreshold) return

          const detectedFreq = result.frequency
          const detectedNote = frequencyToNoteName(detectedFreq)
          if (!detectedNote) return

          // 节流更新音高显示
          const now = Date.now()
          if (now - lastDisplayUpdateTime >= DISPLAY_THROTTLE_MS && detectedNote !== lastDisplayedNote) {
            setDetectedPitch(detectedNote)
            lastDisplayUpdateTime = now
            lastDisplayedNote = detectedNote
          }

          // 复用 Web 版的练习匹配逻辑
          // isNoteOnset 是 PitchStreamEvent 的兄弟字段（不在 pitch 里），由 Rust 的
          // detect_amplitude_diff 算出 —— 此前前端从未读取过它。
          processPracticeMatchRef.current({
            frequency: detectedFreq,
            note: detectedNote,
            probability: prob,
            isNoteOnset: event.isNoteOnset,
            rawFrequency: detectedFreq,
            frameMs: NATIVE_PITCH_INTERVAL_MS
          })
        } catch (e) {
          console.error('Tauri 练习模式音高事件处理错误:', e)
        }
      })

      if (!isActive) {
        off?.()
        return
      }
      unlisten = off

      await startPitchStream(NATIVE_PITCH_INTERVAL_MS)
      // startPitchStream 期间被清理：立即停掉，避免孤儿线程
      if (!isActive) {
        await stopPitchStream().catch(() => {})
      }
    }

    start()

    return () => {
      isActive = false
      if (unlisten) {
        unlisten()
        unlisten = null
      }
      // 停止 Rust 检测线程（捕获不停，由 WindowsAudioSettings 管理）
      stopStream?.()
    }
  }, [isTauri, micEnabled, isPlaying, tunerActive, setDetectedPitch])

  // 实际的音高检测逻辑 - 完全按照原HTML文件的processAudio实现
  const runPitchDetection = useCallback((analyser: AnalyserNode, ctx: AudioContext, scriptProcessor: ScriptProcessorNode) => {
    logger.debug('音高检测已启动，使用 ScriptProcessorNode，sampleRate:', ctx.sampleRate)
    
    // 性能优化：防抖和节流变量
    let lastPitchUpdateTime = 0
    let lastDetectedPitch: string | null = null
    const PITCH_UPDATE_INTERVAL = 50 // 音高更新间隔 50ms
    
    // 使用 ScriptProcessorNode 的 onaudioprocess 事件处理音频
    scriptProcessor.onaudioprocess = (event) => {
      // 检查是否需要停止
      if (!scriptProcessorRef.current) {
        logger.debug('音高检测已停止')
        return
      }
      
      // 检查是否在冷却期内
      if (isCoolingDownRef.current) return
      
      // 获取输入音频数据
      const inputData = event.inputBuffer.getChannelData(0)
      const sampleRate = ctx.sampleRate

      // 起音检测必须跑在下面两个提前 return **之前**：
      // 门限以下的帧也要更新 prevRms，否则「从门限下升上来」的那一帧永远判不出起音
      // （worklet 侧同样把它放在噪声门之前，见 audio-worklet-processor.js 的 process()）。
      //
      // 门限由 `updateOnsetGate(energy)` 从本帧**原始** RMS 推进的环境底噪算出，与
      // worklet / Rust 同规则（`max(0.0008, 底噪 × 1.5)`），所以同一间屋子三条路径
      // 的门限一致。此前这里写死 0.001，与校准后的底噪脱钩（见文件上方注释）。
      const energy = calculateRMS(inputData)
      const isNoteOnset = detectOnset(
        energy,
        updateOnsetGate(energy),
        performance.now(),
        onsetStateRef.current!
      )
      
      // 获取当前状态
      const currentPitchAlgorithm = pitchAlgorithmRef.current
      
      // YIN 门限：按乐器音域解析（低频乐器 0.2 / 其余 0.15），与 worklet 路径同源。
      // 此前这里按「目标音是否 <110Hz」判定并给低频下发 0.05 —— 该判定恒为 false，
      // 且方向相反（threshold 越小越严格），从未生效。
      const yinParams = {
        threshold: resolveYinThreshold(instrumentConfig.lowestStringHz),
        probabilityCliff: 0.1,
      }
      
      // 根据设置选择算法
      let yinResult: { frequency: number; probability: number } | null = null
      
      if (currentPitchAlgorithm === 'solo') {
        // 使用SOLO FFT加速算法
        const soloAnalyser = getSOLOYinAnalyser(inputData.length, sampleRate, yinParams.threshold)
        const soloResult = soloAnalyser.analyze(inputData)
        if (soloResult && soloResult.valid) {
          yinResult = {
            frequency: soloResult.frequency,
            probability: soloResult.probability
          }
        }
      } else {
        // 使用标准YIN算法（使用实际采样率，避免 44100 设备偏高 1.46 半音）
        yinResult = YINPitchDetection(inputData, sampleRate, yinParams.threshold, yinParams.probabilityCliff)
      }
      
      if (!yinResult || !yinResult.frequency) {
        return
      }
      
      // 噪声门：与 worklet 的 `adaptiveThreshold` 是**同一个值、同一个量**。
      // worklet 用这一个值同时干两件事 —— 起音判定与噪声门（`if (energy < adaptiveThreshold) return`），
      // 两者都吃本帧的**原始** RMS；所以这里也必须用 `getOnsetGate()`（上面起音检测刚推进过的那个门限），
      // 而不是另立一个阈值 —— 那条老写法是按**检测频率**分档的两个字面量，worklet 侧没有这个分档：
      //       const energyThreshold = yinResult.frequency < 110 ? 0.001 : 0.002
      //       if (energy < energyThreshold) {
      // 于是两条 Web 路径的灵敏度不一致，且方向随底噪翻转：
      //   · 底噪低（未校准 ⇒ 门限 0.0008）时这个字面量更严格 ⇒ 轻弹「开着 worklet 测得到、关掉测不到」；
      //   · 底噪高（校准到 0.02 ⇒ 门限 0.03）时它更宽松 ⇒ 纯环境抖动被当成有信号送进匹配。
      // 护栏见 __tests__/onset-gate.test.ts 的 ④（双向缝隙证明 + 源码解析）。
      if (energy < getOnsetGate()) {
        return
      }
      
      // 谐波增强处理 - 特别针对低频（与原文件一致）
      let detectedFreq = yinResult.frequency
      if (detectedFreq < 110) {
        const possibleFundamental = detectedFreq / 2
        let fundamentalResult: { frequency: number; probability: number } | null = null
        
        if (currentPitchAlgorithm === 'solo') {
          const soloAnalyser2 = getSOLOYinAnalyser(inputData.length, sampleRate, yinParams.threshold)
          const soloResult = soloAnalyser2.analyze(inputData)
          if (soloResult && soloResult.valid) {
            fundamentalResult = {
              frequency: soloResult.frequency,
              probability: soloResult.probability
            }
          }
        } else {
          fundamentalResult = YINPitchDetection(inputData, sampleRate, yinParams.threshold, yinParams.probabilityCliff)
        }
        
        if (fundamentalResult && fundamentalResult.frequency &&
            Math.abs(fundamentalResult.frequency - possibleFundamental) < 5) {
          detectedFreq = possibleFundamental
        }
      }
      
      const now = Date.now()
      
      // 获取检测到的音符用于显示
      const detectedNote = frequencyToNoteName(detectedFreq)
      
      // 性能优化：节流更新音高显示（每50ms更新一次，且音高有变化时）
      if (now - lastPitchUpdateTime >= PITCH_UPDATE_INTERVAL && detectedNote !== lastDetectedPitch) {
        setDetectedPitch(detectedNote)
        lastPitchUpdateTime = now
        lastDetectedPitch = detectedNote
      }
      
      // 调用共用的练习匹配逻辑（Web 和 Tauri 两条路径共用）
      processPracticeMatchRef.current({
        frequency: detectedFreq,
        note: detectedNote,
        probability: yinResult.probability,
        isNoteOnset,
        rawFrequency: detectedFreq,
        frameMs: frameMsOf(SCRIPT_PROCESSOR_BUFFER_SIZE, sampleRate)
      })
    }
  }, [instrumentConfig.lowestStringHz, setDetectedPitch])


  // 直接使用节点启动音高检测（用于避免React状态延迟）
  const startPitchDetectionWithNodes = useCallback((analyser: AnalyserNode, ctx: AudioContext, scriptProcessor: ScriptProcessorNode) => {
    logger.debug('startPitchDetectionWithNodes 被调用')
    runPitchDetection(analyser, ctx, scriptProcessor)
  }, [runPitchDetection])

  // ==================== 练习逻辑 ====================

  // 生成新的目标音符
  const previousTargetRef = useRef<string | null>(null)

  const generateNewTarget = useCallback(() => {
    // 总是生成指板位置（在 fretboard 模式下不会被使用，但确保 buttons 模式下始终有值）
    const allStrings = Array.from({ length: STRING_COUNT }, (_, i) => i + 1)
    const availableStrings = selectedStrings.length > 0 ? selectedStrings : allStrings

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
      const hasAlternatives = availableStrings.length * (maxFret - minFret + 1) > 1
      const candidates: { si: number; fret: number; weight: number }[] = []
      for (const s of availableStrings) {
        const si = STRING_COUNT - s
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
        const randomStringNum = availableStrings[Math.floor(Math.random() * availableStrings.length)]
        stringIndex = STRING_COUNT - randomStringNum
        baseFret = Math.floor(Math.random() * (maxFret - minFret + 1)) + minFret
      }
    } else {
      const randomStringNum = availableStrings[Math.floor(Math.random() * availableStrings.length)]
      stringIndex = STRING_COUNT - randomStringNum
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
      // 打乱顺序，找到第一个在品区内的位置
      candidateOffsets.sort(() => Math.random() - 0.5)
      for (const offset of candidateOffsets) {
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
      case "practice":
        // 辨音模式下通过按钮答题，不自动匹配（使用 ref 避免闭包延迟）
        if (practiceAnswerModeRef.current === "buttons") break
        // 逐位置掌握度统计：指板点击路径优先用点击位置，否则用目标位置
        recordPositionStat(note === targetNote)
        if (note === targetNote) {
          setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
          // 音高识别统计改为按会话记录，不在此处累加 —— 见 pitchFindingSession 统计 effect
          generateNewTarget()
        } else {
          setScore(prev => ({ ...prev, total: prev.total + 1 }))
        }
        break
      case "interval":
        // Handle interval practice
        if (!currentIntervalExercise || currentIntervalExercise.answered) break
        
        const exercise = currentIntervalExercise
        const intervals = exercise.currentIntervalDisplay.split(' ')
        const rootNote = exercise.rootNote

        // 检查弹对的音符是哪个音级
        let matchedIndex: number | null = null

        for (let idx = 0; idx < intervals.length; idx++) {
          const interval = intervals[idx]
          // 跳过已经完成的音级（按索引）
          if (exercise.completedIntervals.includes(idx)) continue
          // 先找根音模式：根音未完成时只接受根音
          const rootCompleted = intervals.some((intv, i) => intv === '1' && exercise.completedIntervals.includes(i))
          if (findRootFirst && !rootCompleted && interval !== '1') continue

          // 计算该音程对应的目标音符
          const intervalObj = interval === '1'
            ? { semitones: 0, symbol: '1' }
            : exercise.allIntervals.find(i => i.symbol === interval)

          if (!intervalObj) continue

          const rootIdx = getNoteIndex(rootNote)
          const targetIndex = (rootIdx + intervalObj.semitones) % 12
          const targetNoteName = NOTES[targetIndex]

          if (isEquivalentNote(note, targetNoteName)) {
            matchedIndex = idx
            break
          }
        }

        if (matchedIndex !== null) {
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
          // 答错了
          setScore(prev => ({ ...prev, total: prev.total + 1 }))
        }
        break
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
          const noteIdx = getNoteIndex(note)
          const interval = (noteIdx - rootIdx + 12) % 12

          // 用 getChordDegrees 获取当前和弦在该 level 下的音级字符串数组
          // 然后把音级字符串转成半音数，判断当前音符是否匹配
          // 注意：level.sequences 存的是序列数字（1,2,3,5），不是半音数，不能直接用
          // 如果开启 voice leading 则应用（与 audio 路径一致）
          let degrees = getChordDegrees(currentChord.type, practiceLevel, getLevelOptions())
          if (shouldVoiceLeadRef.current && lastChordNoteRef.current) {
            degrees = applyVoiceLeading(degrees, currentChord.root, lastChordNoteRef.current)
          }
          const validSemitones = degrees
            .map(d => intervalToSemitones[d])
            .filter((s): s is number => s !== undefined)
          const isCorrect = validSemitones.includes(interval)

          if (isCorrect) {
            // 完成当前和弦，记录最后一个音用于 voice leading（与 audio 路径一致）
            lastChordNoteRef.current = note
            setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
          } else {
            setScore(prev => ({ ...prev, total: prev.total + 1 }))
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
          
          const playedNoteIdx = getNoteIndex(note)
          
          if (playedNoteIdx === targetNoteIdx) {
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
              setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
              // 统计已改为会话级记录：会话结束时统一在 useEffect 中记录

              nextScaleExercise()
            } else {
              // 继续下一个音
              setScaleExerciseCurrentStep(nextStep)
              setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
            }
          } else {
            // 答错了
            scaleComboRef.current = 0
            setScaleCombo(0)
            setScore(prev => ({ ...prev, total: prev.total + 1 }))
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
          const degreeToSemitone: Record<string, number> = {
            "1": 0, "b2": 1, "2": 2, "#2": 3,
            "b9": 1, "9": 2, "#9": 3,
            "b3": 3, "3": 4, "4": 5, "#4": 6, "b5": 6, "5": 7, "#5": 8,
            "b6": 8, "6": 9, "#6": 10, "7": 11, "b7": 10, "maj7": 11, "bb7": 9,
            "b13": 8, "13": 9, "11": 5, "#11": 6
          }
          const semitone = degreeToSemitone[currentDegree]
          if (semitone === undefined) break

          const targetNoteIdx = (rootIdx + semitone) % 12
          const playedNoteIdx = getNoteIndex(note)

          if (playedNoteIdx === targetNoteIdx) {
            // 答对了
            const nextStep = chordExerciseCurrentStep + 1
            if (nextStep >= chordExerciseSequence.length) {
              // 完成当前和弦，使用预览的下一题
              setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
              // 统计已改为会话级记录：会话结束时统一在 useEffect 中记录

              nextChordExercise()
            } else {
              // 继续下一个音
              setChordExerciseCurrentStep(nextStep)
              setScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }))
            }
          } else {
            // 答错了
            setScore(prev => ({ ...prev, total: prev.total + 1 }))
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
      let isCorrect = false
      
      switch (activeTab) {
        case "practice":
          // 找音练习：点击的音等于目标音
          isCorrect = clickedNote === targetNote
          // 逐位置统计：暂存点击位置，供随后 handleMIDINoteInput 记录
          lastFretClickPositionRef.current = { stringIndex, fret }
          break
          
        case "chord_exercise":
          // 和弦练习：点击的音是当前需要答的音
          if (chordExerciseTargetChord && chordExerciseSequence.length > 0) {
            const currentDegree = chordExerciseSequence[chordExerciseCurrentStep]
            const noteIdx = getNoteIndex(clickedNote)
            const rootIdx = getNoteIndex(chordExerciseTargetChord.root)
            const normalizedType = normalizeChordType(chordExerciseTargetChord.type)
            const chordType = CHORD_TYPES.find(ct => ct.name === normalizedType || ct.symbol === normalizedType || ct.name === chordExerciseTargetChord.type)
            if (chordType && currentDegree) {
              const degreeToSemitone: Record<string, number> = {
                "1": 0, "b2": 1, "2": 2, "#2": 3,
                "b9": 1, "9": 2, "#9": 3, "b3": 3, "3": 4, "4": 5, "#4": 6, "b5": 6, "5": 7, "#5": 8,
                "b6": 8, "6": 9, "#6": 10, "7": 11, "b7": 10, "maj7": 11, "bb7": 9,
                "b13": 8, "13": 9, "11": 5, "#11": 6
              }
              const targetInterval = degreeToSemitone[currentDegree]
              const clickedInterval = (noteIdx - rootIdx + 12) % 12
              isCorrect = clickedInterval === targetInterval
            }
          }
          break
          
        case "scale":
          // 音阶练习：点击的音是当前需要答的音
          if (scaleExerciseSequence.length > 0) {
            const currentDegree = scaleExerciseSequence[scaleExerciseCurrentStep]
            const noteIdx = getNoteIndex(clickedNote)
            // 🚨 与 MIDI 路径共用真相源 `resolveScaleTargetNoteIndex`，**禁止**再手写
            // 「半音 → 音级标签」反查表：音级标签是**异名同音**的（#4/b5、#5/b6、#2/b3…），
            // 反查表只能表达其中一侧，另一侧永远比不上 ⇒ 弹对了判错。
            // 实测（76 个音阶穷举）22 个音阶受影响，含最常用的 Lydian（#4 被反查成 b5）
            // 与 Blues（#4）；Whole Tone 的 #4/#5/#6 三个音全错。
            // 正向比较（标签 → 半音 → 音名下标）从根上不需要「选哪一侧」。
            // 与 MIDI 路径共用 `lib/scale-target-note.ts` 这一个真相源。
            const targetNoteIdx = resolveScaleTargetNoteIndex(selectedScale, currentDegree, scaleKey)
            if (targetNoteIdx === undefined) {
              logger.warn('[scale] 未知音级标签，练习无法推进', currentDegree, selectedScale.name)
              break
            }
            isCorrect = noteIdx === targetNoteIdx
          }
          break
          
        case "interval":
          // 音程练习：点击的音 = 序列里当前该弹的那个音级
          // （含「回弹根音」收尾的 1；推导见 lib/interval-expected-degree.ts）
          if (currentIntervalExercise) {
            const noteIdx = getNoteIndex(clickedNote)
            const rootIdx = getNoteIndex(currentIntervalExercise.rootNote)
            const clickedInterval = (noteIdx - rootIdx + 12) % 12
            const expectedDegree = resolveExpectedIntervalDegree(
              currentIntervalExercise.currentIntervalDisplay,
              currentIntervalExercise.completedIntervals,
              findRootFirst,
            )
            const expectedSemitone = expectedDegree === null
              ? undefined
              : expectedDegree === '1'
                ? 0
                : currentIntervalExercise.interval?.semitones % 12
            isCorrect = expectedSemitone !== undefined && clickedInterval === expectedSemitone
          }
          break
          
        case "chord":
          // 和弦转换练习：点击的音在当前和弦中
          {
            const chords = transposedChords
            const currentChord = chords[currentChordIndex]
            if (currentChord) {
              const noteIdx = getNoteIndex(clickedNote)
              const rootIdx = getNoteIndex(currentChord.root)
              const normalizedType = normalizeChordType(currentChord.type)
              const chordType = CHORD_TYPES.find(ct => ct.name === normalizedType || ct.symbol === normalizedType || ct.name === currentChord.type || ct.symbol === currentChord.type)
              if (chordType) {
                const interval = (noteIdx - rootIdx + 12) % 12
                isCorrect = chordType.intervals.includes(interval)
              }
            }
          }
          break
      }
      
      setHighlightedFrets(prev => new Map(prev).set(key, isCorrect))
      
      if (isCorrect) {
        triggerCorrectFeedback(clickedNote)
      } else {
        triggerWrongFeedback(clickedNote)
      }

      playFeedbackSound(isCorrect)
      
      setTimeout(() => {
        setHighlightedFrets(prev => {
          const next = new Map(prev)
          next.delete(key)
          return next
        })
      }, 500)
      
      setTimeout(() => {
        handleMIDINoteInput(clickedNote)
      }, 100)
    }
  }, [isPlaying, handleMIDINoteInput, activeTab, targetNote, chordExerciseTargetChord, chordExerciseSequence, chordExerciseCurrentStep, scaleExerciseSequence, scaleExerciseCurrentStep, scaleKey, selectedScale, currentIntervalExercise, currentChordIndex, playFeedbackSound, findRootFirst, fretZoneEnabled, fretZoneStart, fretZoneSize, fretCount, triggerCorrectFeedback, triggerWrongFeedback, transposedChords])

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
      setPracticeElapsedTime(prev => prev + (Date.now() - (practiceSessionStartTime || Date.now())) / 1000)
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
        // 使用函数式更新避免依赖循环
        setIntervalExerciseQueue(() => {
          if (selectedIntervals.length === 0) return []
          let queue = [...selectedIntervals]
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
            // Either 模式：上行与下行同时入队
            const expanded: number[] = []
            queue.forEach(idx => {
              expanded.push(idx)
              const interval = INTERVALS[idx]
              const downSemitones = (12 - interval.semitones) % 12
              const downIndex = INTERVALS.findIndex(i => i.semitones === downSemitones)
              expanded.push(downIndex !== -1 ? downIndex : idx)
            })
            queue = expanded
          }
          if (intervalRandomizeOrder) {
            queue = queue.sort(() => Math.random() - 0.5)
          }
          return queue
        })
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
    }
  }, [isPlaying, setScore, practiceTime, activeTab, generateNewTarget, setIntervalPracticeStep, setIsPlaying, setPracticeSessionStartTime, setPracticeElapsedTime, pitchFindingTime, showPracticeSuggestions, user.instrument, language, intervalPracticeDuration, setIntervalExerciseQueue, setIntervalCurrentQueueIndex, selectedIntervals, intervalDirection, intervalRandomizeOrder, generateIntervalExerciseRef, generateChordExercise, generateScaleExercise])

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
  }, [isFullscreen, isPlaying, togglePractice, activeTab, generateNewTarget, generateIntervalExercise, nextChordExercise, nextScaleExercise, nextChord, micEnabled, handleTabChange, setFullscreenMode, setIsPlaying, setMicUserPreference, isTauri, setSettingsOpen, generateIntervalExerciseRef, setTabFretboardFlag])

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
      localStorage.setItem(CUSTOM_CHORD_STORAGE_KEY, JSON.stringify(data))
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
          beatsPerMeasure={4}
          language={language as 'zh-CN' | 'en'}
        />
      </div>
    </TooltipProvider>
    </OnboardingProvider>
  )
}
