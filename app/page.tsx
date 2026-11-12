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
import { transposeSongChords, clampChordIndex } from "@/lib/song-chords"
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
import { effectiveFretboardIntervals } from "@/lib/interval-index"
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
import {
  enumerateTargetPositions,
  buildTour,
  attributeHit,
  nextTargetNote,
  cellKey,
  type CellPos,
} from "@/lib/single-note-tour"
import { guitarPositionToMidi } from "@/lib/guitar-sound"
import { applyRootFontSize } from "@/lib/display-scale"
import { themeBackgroundColor } from "@/lib/theme-colors"
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
import { MobileNav } from "@/components/mobile-nav"
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

const FRET_MARKERS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24]

/** 单音全指板配置的本地存储键（见页面里的持久化 effect） */
const SINGLE_NOTE_STORAGE_KEY = 'fretmaster.single-note.v1'

/** 单音全指板：位置提示方式（无提示 / 精确到弦品） */
type SingleNotePrompt = 'none' | 'exact'

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
  const agcEnabled = user.agcEnabled
  const setAgcEnabled = store.setAgcEnabled
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

  // 手机底部导航：**只放 5 个练习页**（高频操作）。
  // 教程/乐理/统计是低频浏览，折进「更多」——8 个平铺在 390px 宽上每个只剩 ~48px，
  // 短名被 truncate 成「和…」「教…」，点击目标也太小（2026-10-19）。
  const bottomNavItems = useMemo(() => [
    { id: "practice", label: t('nav_practice'), Icon: Target, shortLabel: t('nav_short_practice') },
    { id: "interval", label: t('nav_interval'), Icon: Activity, shortLabel: t('nav_short_interval') },
    { id: "chord_exercise", label: t('nav_chord_exercise'), Icon: Guitar, shortLabel: t('nav_short_chord_exercise') },
    { id: "chord", label: t('nav_chord'), Icon: ListMusic, shortLabel: t('nav_short_chord') },
    { id: "scale", label: t('nav_scale'), Icon: Music, shortLabel: t('nav_short_scale') },
  ], [t])

  /** 折叠进「更多」面板的页面（桌面侧栏仍逐个列出，不受影响） */
  const bottomFoldedItems = useMemo(() => [
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
  useEffect(() => {
    highlightedTargetPositionRef.current = highlightedTargetPosition
  }, [highlightedTargetPosition])

  /**
   * 逐位置掌握度统计：记录一次判定（找音练习三路径共用：指板点击 / 音频 / MIDI / 按钮）。
   *
   * 🚨 点击位置必须**由调用方显式传入**，不能再塞进一个共享 ref 里等下游消费：
   *    点击后会延迟 100ms 才走 handleMIDINoteInput，期间如果麦克风/其它路径先跑了一次，
   *    就会把 ref 里的位置「偷走」，导致连点时位置记到别的格子上、单音模式还会多记一次命中。
   *    音频路径没有位置信息 ⇒ 回退到当前高亮目标位置（与旧行为一致）。
   */
  const recordPositionStat = useCallback((isCorrect: boolean, pos?: CellPos) => {
    const target = pos ?? highlightedTargetPositionRef.current
    if (!target) return
    recordPositionResult(user.instrument, target.stringIndex, target.fret, isCorrect)
  }, [user.instrument])

  // 切换乐器时加载该乐器的位置统计（幂等）；同时预取当前乐器
  useEffect(() => {
    loadPositionStats(user.instrument).catch(e => logger.error('加载位置统计失败', e))
  }, [user.instrument])
  
  // 找音练习建议
  const [showPracticeSuggestions, setShowPracticeSuggestions] = useState(false)
  const [currentPracticeSuggestion, setCurrentPracticeSuggestion] = useState<string>("")

  // ==================== 单音全指板（找音练习子模式）====================
  // 目标音固定，一轮内要弹到它在品域内的所有落点；可提示位置、可随机换音、可连线。
  // 配置走本地 state（与 pitchFindingTime / showAllNotes 同级），不写 store。
  const [singleNoteEnabled, setSingleNoteEnabled] = useState(false)
  const [singleNoteNote, setSingleNoteNote] = useState('E')
  const [singleNoteRandomNote, setSingleNoteRandomNote] = useState(true)
  const [singleNotePrompt, setSingleNotePrompt] = useState<SingleNotePrompt>('exact')
  const [singleNoteQuota, setSingleNoteQuota] = useState<number | 'all'>('all')
  const [singleNoteShowLines, setSingleNoteShowLines] = useState(true)
  /** 本轮已命中次数（= 进度分子，达到配额后换轮） */
  const [singleNoteHits, setSingleNoteHits] = useState(0)
  /** 本轮已找到的位置，按弹奏顺序（连线按这个顺序画） */
  const [singleNoteFound, setSingleNoteFound] = useState<CellPos[]>([])
  /** 本轮已跳过（按不到）的位置：不计进度、不画连线，但不再作为提示目标 */
  const [singleNoteSkipped, setSingleNoteSkipped] = useState<CellPos[]>([])
  /** 最近一次命中的八度（E2 / E3 …），短暂显示后自动消失；seq 用于同八度连续命中时重新计时 */
  const [singleNoteLastHit, setSingleNoteLastHit] = useState<{ octave: number; seq: number } | null>(null)
  /** 已经练过的音，用于「随机换音」时 12 个音不重复 */
  const singleNoteSeenRef = useRef<string[]>([])
  /** 本轮开始时刻（ms）：一轮跑完时用来报「用时 x.x 秒」 */
  const singleNoteRoundStartedAtRef = useRef(Date.now())
  /** 「这一层已找完、已落到相邻八度」提示的节流时刻（避免连续拨弦刷屏） */
  const singleNoteOctaveHintAtRef = useRef(0)
  /** 自动循环：一轮结束后按 C→C♯→…→B 顺序换下一个音（与「随机换音」互斥） */
  const [singleNoteCycle, setSingleNoteCycle] = useState(false)
  /** 一轮小结：留在界面上直到用户关掉或开始下一轮（toast 太短，等于看完就没了） */
  const [singleNoteSummary, setSingleNoteSummary] = useState<{
    found: number
    skipped: number
    seconds: number
    missedFrets: number[]
  } | null>(null)

  // 配置持久化：刷新后不用每次重设。放 localStorage（纯界面偏好），不进 store 以免污染设置导入导出。
  // 只在客户端挂载后读一次 —— 静态导出会预渲染，直接读 window 会在构建期炸。
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SINGLE_NOTE_STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as Record<string, unknown>
      if (typeof saved.enabled === 'boolean') setSingleNoteEnabled(saved.enabled)
      // 🚨 只判 `typeof` 不够：被手改过 / 旧版本写坏的存储值会让「目标音」变成一个
      //    不在 NOTES 里的字符串（枚举出 0 个落点、整轮空转）或配额为 0/负数/小数
      //    （一轮永远推不完）。这里按真实取值域校验，非法值一律回退默认。
      if (typeof saved.note === 'string' && NOTES.includes(saved.note)) setSingleNoteNote(saved.note)
      if (typeof saved.randomNote === 'boolean') setSingleNoteRandomNote(saved.randomNote)
      if (typeof saved.cycle === 'boolean') setSingleNoteCycle(saved.cycle)
      if (saved.prompt === 'none' || saved.prompt === 'exact') setSingleNotePrompt(saved.prompt)
      if (
        saved.quota === 'all' ||
        (typeof saved.quota === 'number' && Number.isInteger(saved.quota) && saved.quota > 0)
      ) setSingleNoteQuota(saved.quota)
      if (typeof saved.showLines === 'boolean') setSingleNoteShowLines(saved.showLines)
    } catch {
      // 旧版本/被手改坏的存储值：忽略，继续用默认值
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SINGLE_NOTE_STORAGE_KEY,
        JSON.stringify({
          enabled: singleNoteEnabled,
          note: singleNoteNote,
          randomNote: singleNoteRandomNote,
          cycle: singleNoteCycle,
          prompt: singleNotePrompt,
          quota: singleNoteQuota,
          showLines: singleNoteShowLines,
        }),
      )
    } catch {
      // 隐私模式下 localStorage 可能不可写：不影响练习
    }
  }, [
    singleNoteEnabled,
    singleNoteNote,
    singleNoteRandomNote,
    singleNoteCycle,
    singleNotePrompt,
    singleNoteQuota,
    singleNoteShowLines,
  ])

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
    deleteRecord,
    clearAllRecords,
  } = usePracticeStats({ isTauri })
  const [statsTimeRange, setStatsTimeRange] = useState<StatsTimeRange>('today')
  const [highlightedFrets, setHighlightedFrets] = useState<Map<string, boolean>>(new Map())
  const practiceTime = practiceSettings.practiceTime
  const setPracticeTime = store.setPracticeTime
  const fretCount = practiceSettings.fretCount
  const setFretCount = store.setFretCount
  const fretZoneEnabled = practiceSettings.fretZoneEnabled
  const setFretZoneEnabled = store.setFretZoneEnabled
  const fretZoneStart = practiceSettings.fretZoneStart
  const fretZoneSize = practiceSettings.fretZoneSize
  const octaveShiftEnabled = practiceSettings.octaveShiftEnabled
  const setOctaveShiftEnabled = store.setOctaveShiftEnabled
  const octaveShiftMode = practiceSettings.octaveShiftMode
  const weaknessWeightedEnabled = practiceSettings.weaknessWeightedEnabled
  const setWeaknessWeightedEnabled = store.setWeaknessWeightedEnabled
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

  // 和弦列表变短后钳制索引：删除自定义和弦 / 切换歌曲 / 导入设置都会换掉整份列表，
  // 而 currentChordIndex 是独立 state ⇒ 越界后当前和弦空白、判定无候选，练习静默卡住。
  useEffect(() => {
    const clamped = clampChordIndex(currentChordIndex, transposedChords.length)
    if (clamped !== currentChordIndex) setCurrentChordIndex(clamped)
  }, [transposedChords, currentChordIndex])
  
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

  /**
   * 关闭成绩单：全屏里做完练习时**顺带退出全屏**。
   * 否则关掉弹窗后会停在一个没有内容的全屏页，用户还以为卡住了。
   * 「再练一次」不走这里（要留在全屏继续练）。
   */
  const closePracticeSummary = useCallback(() => {
    setShowPracticeSummary(false)
    if (isFullscreen) setFullscreenMode(false)
  }, [isFullscreen, setFullscreenMode])

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

  // MIDI note-on 按 (音名, 八度) 调用；八度参与「上行/下行」与单音落点判定。
  const handleMIDINoteInputRef = useRef<((note: string, octave?: number) => void) | null>(null)
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
    added: { name: string }[],
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
    // 🚨 必须是 `isTauri || isTauriEnv()`，不能只看 state（2026-10-31 实测）：
    //    `isTauri` 的初始值是 false，要等挂载后的 effect 才翻转；而打包后的桌面端
    //    第一次渲染就落进下面的 Web 分支 ⇒ `getUserMedia` ⇒ **启动即弹系统麦克风权限框**
    //    （实测：`tauri.localhost 想要使用麦克风` 盖在整个应用上）。
    //    `isTauriEnv()` 是同步判定（含 `tauri.localhost` 主机名兜底），首帧就是对的。
    if (isTauri || isTauriEnv()) {
      let unlisten: (() => void) | null = null
      let cancelled = false

      void (async () => {
        const m = await import('@/lib/native-audio')
        if (cancelled) return
        // 双保险：Rust 已在 setup 常驻启动，这里再 ensure 一次（幂等），
        // 以防运行在「setup 未覆盖」的旧二进制上。
        // 启动失败不能静默：热插拔从此不工作，用户只会觉得「插了设备没反应」，
        // 而控制台没有任何线索。
        await m.ensureDeviceMonitor().catch((err) => {
          logger.warn("设备监控启动失败，热插拔将不生效:", err)
        })
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
              added.map(id => ({ name: id })),
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

  /**
   * 单音全指板：为某个音构建「一轮」。
   *   · `tour`  —— 本轮要弹的位置顺序（就近排序，连线最顺）；
   *   · `total` —— 本轮需要命中的次数（次数上限与位置总数取较小值）。
   * 空弦/品域/弦选择/品数任一变化都会重建，因此不做缓存，按需现算（6 弦 × 24 品，成本可忽略）。
   * 范围**固定跟着指板当前显示的品数**（练习设置里的 fretCount）：显示 12 品就弹 12 品内
   * 所有该音，15 品就 15 品内全部。不再另设「品域」上限——两个上限互相打架时，
   * 「全部」其实只覆盖了前半段，用户以为弹完了其实没弹到。
   */
  const buildSingleNoteRoundFor = useCallback((note: string) => {
    // 🚨 调弦必须显式传下去：`getNoteAtPosition` 默认读全局调弦，而全局调弦是靠渲染期
    //    `setStringTuning` 写的 —— 换乐器（不同调弦、同弦数）时本回调的身份不会变，
    //    按旧调弦枚举出来的落点会残留一整轮。
    const positions = enumerateTargetPositions({
      targetNote: note,
      maxFret: fretCount,
      allowedStringIndexes: resolveAvailableStringIndexes(selectedStrings, STRING_COUNT),
      tuning: resolveInstrumentConfig(user.instrument).tuning,
    })
    // 八度梯子：空弦组 → 4弦2品 → 2弦5品 → 5弦7品 → 3弦9品 → 1弦12品 → 下一把位……
    const tour = buildTour(positions, 'octave')
    const total =
      singleNoteQuota === 'all' ? tour.length : Math.min(singleNoteQuota, tour.length)
    return { tour, total }
  }, [fretCount, selectedStrings, STRING_COUNT, singleNoteQuota, user.instrument])

  /** 当前音的一轮（仅用于渲染进度与位置校验；未开启时为空） */
  const singleNoteRound = useMemo(
    () =>
      singleNoteEnabled
        ? buildSingleNoteRoundFor(singleNoteNote)
        : { tour: [] as CellPos[], total: 0 },
    [singleNoteEnabled, buildSingleNoteRoundFor, singleNoteNote],
  )

  /**
   * 当前该弹的位置 = tour 里**第一个既没找到、也没跳过**的落点。
   * 🚨 不能用 `tour[hits]` 当下标：无提示模式下用户可以任意顺序弹，跳过的位置也不算进度。
   */
  const singleNotePromptPos = useMemo(() => {
    if (!singleNoteEnabled) return null
    const foundKeys = new Set(singleNoteFound.map(cellKey))
    const skippedKeys = new Set(singleNoteSkipped.map(cellKey))
    return (
      singleNoteRound.tour.find(
        (p) => !foundKeys.has(cellKey(p)) && !skippedKeys.has(cellKey(p)),
      ) ?? null
    )
  }, [singleNoteEnabled, singleNoteRound, singleNoteFound, singleNoteSkipped])

  /** 已找到位置集合（key = 弦-品）：位置地图与配色层共用 */
  const singleNoteFoundKeys = useMemo(
    () => new Set(singleNoteFound.map(cellKey)),
    [singleNoteFound],
  )

  /** 已跳过（放弃）位置集合：位置地图上画成灰色，与「还没找到」区分 */
  const singleNoteSkippedKeys = useMemo(
    () => new Set(singleNoteSkipped.map(cellKey)),
    [singleNoteSkipped],
  )

  /**
   * 连线落点（按巡游顺序，只取已找到的）。
   * 相邻两点若在本轮巡游里**跨过了没找到的位置**，这一段走虚线 —— 一眼能看出缺口在哪。
   */
  const singleNotePath = useMemo(() => {
    if (!singleNoteEnabled) return undefined
    const tour = singleNoteRound.tour
    const indexOf = new Map(tour.map((p, i) => [cellKey(p), i]))
    const found = tour.filter(p => singleNoteFoundKeys.has(cellKey(p)))
    return found.map((p, i) => {
      const prev = found[i - 1]
      const gap = !!prev && (indexOf.get(cellKey(p))! - indexOf.get(cellKey(prev))!) > 1
      return { ...p, dashed: gap }
    })
  }, [singleNoteEnabled, singleNoteRound, singleNoteFoundKeys])

  /** 命中后短暂显示的八度标签（1.6s 后自动消失） */
  useEffect(() => {
    if (!singleNoteLastHit) return
    const timer = setTimeout(() => setSingleNoteLastHit(null), 1600)
    return () => clearTimeout(timer)
  }, [singleNoteLastHit])

  /**
   * 单音全指板配置变更。
   * 🚨 与「限制品区 / 八度切换 / 弱点加权」互斥：这三项都会改写出题位置，
   * 和「固定音 + 固定 tour」同时开启会互相抢题，所以开启时一并关掉。
   */
  const handleSingleNoteChange = useCallback(
    (patch: Partial<{
      enabled: boolean
      note: string
      randomNote: boolean
      cycle: boolean
      prompt: SingleNotePrompt
      quota: number | 'all'
      showLines: boolean
    }>) => {
      if (patch.enabled === true) {
        setFretZoneEnabled(false)
        setOctaveShiftEnabled(false)
        setWeaknessWeightedEnabled(false)
        // 按钮答题是从「高亮的目标位置」反推答案，单音模式下没有唯一位置 ⇒ 强制指板模式
        if (practiceAnswerMode === 'buttons') setPracticeAnswerMode('fretboard')
      }
      if (patch.enabled !== undefined) setSingleNoteEnabled(patch.enabled)
      if (patch.note !== undefined) setSingleNoteNote(patch.note)
      if (patch.randomNote !== undefined) setSingleNoteRandomNote(patch.randomNote)
      if (patch.cycle !== undefined) setSingleNoteCycle(patch.cycle)
      // 「随机换音」与「自动循环」互斥（都只管下一轮换什么音）
      if (patch.randomNote === true) setSingleNoteCycle(false)
      if (patch.cycle === true) setSingleNoteRandomNote(false)
      if (patch.prompt !== undefined) setSingleNotePrompt(patch.prompt)
      if (patch.quota !== undefined) setSingleNoteQuota(patch.quota)
      if (patch.showLines !== undefined) setSingleNoteShowLines(patch.showLines)
      // 改了会影响本轮内容的配置 ⇒ 视作重新开始，把「随机换音练过哪些音」的记录也清掉，
      // 否则改一次设置后下一轮仍会被很久以前的记录影响（连续跳过好几个音）。
      const restartsRound =
        patch.enabled !== undefined ||
        patch.note !== undefined ||
        patch.randomNote !== undefined ||
        patch.prompt !== undefined ||
        patch.quota !== undefined
      if (restartsRound) singleNoteSeenRef.current = []
      if (patch.enabled === false) {
        // 退出时清掉本模式的运行时痕迹，避免残留高亮/连线
        setSingleNoteHits(0)
        setSingleNoteFound([])
        setSingleNoteSkipped([])
        setSingleNoteLastHit(null)
      }
    },
    [practiceAnswerMode, setFretZoneEnabled, setOctaveShiftEnabled, setWeaknessWeightedEnabled],
  )

  /**
   * 答题方式切换。
   * 🚨 切到「辨音（按钮答题）」时必须顺手关掉单音全指板：按钮答题是从「唯一的高亮目标位置」
   *    反推答案，而单音模式一整轮只有一个音名、多个落点 ⇒ 两者同时开就是死局
   *    （单音强制指板模式，按钮面板却已经切过来了）。
   */
  const handlePracticeAnswerModeChange = useCallback(
    (mode: "fretboard" | "buttons") => {
      if (mode === 'buttons' && singleNoteEnabled) handleSingleNoteChange({ enabled: false })
      setPracticeAnswerMode(mode)
    },
    [singleNoteEnabled, handleSingleNoteChange],
  )

  const generateNewTarget = useCallback(() => {
    // 单音全指板：目标音固定，只按当前位置推进；首题/重开一轮都从这里进
    if (singleNoteEnabled) {
      const { tour } = buildSingleNoteRoundFor(singleNoteNote)
      setSingleNoteHits(0)
      setSingleNoteFound([])
      setSingleNoteSkipped([])
      setTargetNote(singleNoteNote)
      previousTargetRef.current = singleNoteNote
      setHighlightedTargetPosition(singleNotePrompt === 'exact' ? (tour[0] ?? null) : null)
      // 这是「显式开始新一轮」（按 P 开始练习 / 开始按钮）⇒ 重置本轮计时并送走上一轮小结。
      // 🚨 `restartSingleNoteRound` 里**不能**这么做（否则小结刚出现就被盖掉）。
      singleNoteRoundStartedAtRef.current = Date.now()
      setSingleNoteSummary(null)
      return
    }
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
  }, [STRING_COUNT, selectedStrings, fretCount, fretZoneEnabled, weaknessWeightedEnabled, octaveShiftEnabled, intervalRootMode, fretZoneStart, fretZoneSize, user.instrument, octaveShiftMode, setRootNote, singleNoteEnabled, singleNoteNote, singleNotePrompt, buildSingleNoteRoundFor])

  /**
   * 重开一轮：清空本轮的找到/跳过记录，切到 `nextNote`，并按提示方式点亮第一格。
   */
  const restartSingleNoteRound = useCallback(
    (nextNote: string) => {
      const nextRound = buildSingleNoteRoundFor(nextNote)
      setSingleNoteHits(0)
      setSingleNoteFound([])
      setSingleNoteSkipped([])
      setSingleNoteNote(nextNote)
      setTargetNote(nextNote)
      previousTargetRef.current = nextNote
      setHighlightedTargetPosition(singleNotePrompt === 'exact' ? (nextRound.tour[0] ?? null) : null)
      singleNoteRoundStartedAtRef.current = Date.now()
      // 🚨 这里**不要**清 `singleNoteSummary`：一轮结束时先 set 小结、紧接着就调本函数开下一轮，
      //    清掉等于用户永远看不到小结（本轮成绩被下一轮覆盖）。小结留到
      //    「下一轮首次命中/跳过」或用户点 ✕ 时再退场。
    },
    [buildSingleNoteRoundFor, singleNotePrompt],
  )

  /**
   * 一轮跑完（配额已满 / 位置全被找到或跳过）：先把小结留在界面上，再按换音策略开下一轮。
   * `summary` 由调用方传入 —— 调用瞬间 setState 还没落地，闭包里的数组是上一帧的。
   */
  const finishSingleNoteRound = useCallback(
    (summary: { found: CellPos[]; skipped: CellPos[] }) => {
      const seconds = Math.max(0, (Date.now() - singleNoteRoundStartedAtRef.current) / 1000)
      const { tour } = buildSingleNoteRoundFor(singleNoteNote)
      const doneKeys = new Set([...summary.found, ...summary.skipped].map(cellKey))
      // 漏掉的把位：本轮该找却没找到也没跳过（配额模式下最容易出现）
      const missedFrets = [...new Set(
        tour.filter((p) => !doneKeys.has(cellKey(p))).map((p) => p.fret),
      )].sort((a, b) => a - b)
      setSingleNoteSummary({
        found: summary.found.length,
        skipped: summary.skipped.length,
        seconds,
        missedFrets,
      })
      // 换音策略：随机换音 > 自动循环（C→B）> 同音重来
      if (singleNoteRandomNote) {
        const seen = [...singleNoteSeenRef.current, singleNoteNote]
        const next = nextTargetNote(singleNoteNote, seen, true)
        // 12 个音都练过 ⇒ 重新开始计
        singleNoteSeenRef.current = seen.length >= NOTES.length ? [next] : seen
        restartSingleNoteRound(next)
        return
      }
      if (singleNoteCycle) {
        const index = findNoteIndexInArray(singleNoteNote, NOTES)
        const next = NOTES[(index + 1) % NOTES.length]
        restartSingleNoteRound(next)
        return
      }
      restartSingleNoteRound(singleNoteNote)
    },
    [singleNoteRandomNote, singleNoteCycle, singleNoteNote, restartSingleNoteRound, buildSingleNoteRoundFor],
  )

  /**
   * 单音全指板：命中后的结算与推进（由 usePracticeMatch 在计分后回调）。
   *
   * 返回 `true` 表示本模式已自行推进，钩子不再调用默认的 `generateNewTarget`。
   * 🚨 音频路径没有位置信息，只能「猜」：优先当前提示位置，其次用检测到的八度去匹配
   *    本轮里还没去过的同八度位置（见下面的落点归属）。`exact` 提示下的麦克风练习
   *    因此只是引导 —— 真正的严格校验只在点指板时发生。
   */
  const advanceSingleNote = useCallback(
    (payload: { via: 'audio' | 'click'; position?: CellPos; octave?: number }): boolean => {
      if (!singleNoteEnabled) return false
      const { tour, total } = buildSingleNoteRoundFor(singleNoteNote)
      const foundKeys = new Set(singleNoteFound.map(cellKey))
      const skippedKeys = new Set(singleNoteSkipped.map(cellKey))
      const octaveOf = (p: CellPos): number | null => {
        const midi = guitarPositionToMidi(p.stringIndex, p.fret)
        return midi === null ? null : Math.floor(midi / 12) - 1
      }

      // 落点归属（唯一「猜」的一步）统一走 lib/single-note-tour.ts 的 attributeHit。
      // 🚨 无提示模式下也必须把「弹对的位置」算出来：麦克风拿不到弦品，但拿得到八度，
      //    用八度在本轮剩余位置里落一个，弹对才有反馈（否则指板上永远不亮）。
      const playedPos = attributeHit({
        tour,
        found: singleNoteFound,
        skipped: singleNoteSkipped,
        prompt: singleNotePrompt,
        promptPos: singleNotePromptPos,
        position: payload.position,
        octave: payload.octave,
        octaveOf,
      })

      // 🚨 已找到的格子重复命中 ⇒ 幂等返回：不重复计数、不重复写八度标签。
      //    无提示模式下没有「当前目标」可拦，用户点同一个已点过的格子（或麦克风再响一次）
      //    以前会无条件 hits+1，可以靠反复点同一格把配额刷满、提前结束一轮。
      if (playedPos && foundKeys.has(cellKey(playedPos))) return true

      // 新一轮的第一次动作 ⇒ 上一轮小结退场（它只在「一轮结束到下一轮开始」之间可见）
      if (singleNoteSummary) setSingleNoteSummary(null)

      if (playedPos && !foundKeys.has(cellKey(playedPos))) {
        setSingleNoteFound((prev) => [...prev, playedPos!])
      }
      if (playedPos) {
        // 逐位置掌握度：以前只有普通练习写，单音模式的位置从来没进过统计（热力图始终是空的）
        recordPositionResult(user.instrument, playedPos.stringIndex, playedPos.fret, true)
        // 落点靠「相邻八度」兜底 ⇒ 这一层已经找完了，给一句轻提示（1.2s 内不重复，避免刷屏）
        if (
          singleNotePrompt === 'none' &&
          payload.octave !== undefined &&
          octaveOf(playedPos) !== payload.octave &&
          Date.now() - singleNoteOctaveHintAtRef.current > 1200
        ) {
          singleNoteOctaveHintAtRef.current = Date.now()
          toast.info(t('single_note_octave_fallback'))
        }
      }
      // 八度标签：有落点用落点的八度，没有（'none' 音频）就用检测到的八度
      const hitOctave = playedPos ? octaveOf(playedPos) : (payload.octave ?? null)
      if (hitOctave !== null) {
        setSingleNoteLastHit((prev) => ({ octave: hitOctave, seq: (prev?.seq ?? 0) + 1 }))
      }

      const nextHits = singleNoteHits + 1
      const nextFound =
        playedPos && !foundKeys.has(cellKey(playedPos))
          ? [...singleNoteFound, playedPos]
          : singleNoteFound
      // 「覆盖完所有位置」也结束一轮：配额 = all 且用户跳过若干位置时，光靠次数永远推不完
      const covered = new Set([
        ...foundKeys,
        ...skippedKeys,
        ...(playedPos ? [cellKey(playedPos)] : []),
      ]).size
      if (nextHits >= Math.max(1, total) || covered >= tour.length) {
        finishSingleNoteRound({ found: nextFound, skipped: singleNoteSkipped })
        return true
      }

      setSingleNoteHits(nextHits)
      if (singleNotePrompt === 'exact') {
        const nextFoundKeys = new Set(nextFound.map(cellKey))
        const nextPos = tour.find((p) => !nextFoundKeys.has(cellKey(p)) && !skippedKeys.has(cellKey(p))) ?? null
        setHighlightedTargetPosition(nextPos)
      } else {
        setHighlightedTargetPosition(null)
      }
      return true
    },
    [
      singleNoteEnabled,
      buildSingleNoteRoundFor,
      singleNoteNote,
      singleNotePrompt,
      singleNoteHits,
      singleNotePromptPos,
      singleNoteFound,
      singleNoteSkipped,
      singleNoteSummary,
      finishSingleNoteRound,
      user.instrument,
      t,
    ],
  )

  /**
   * 「跳过」：当前提示位置按不到（缺角 / 超出舒适把位）时放弃它。
   * 不计进度、不画连线，只是把它从提示队列里移除；位置全部跳过则视作一轮结束。
   */
  const skipSingleNotePosition = useCallback(() => {
    if (!singleNoteEnabled) return
    const pos = singleNotePromptPos
    if (!pos) return
    const nextSkipped = [...singleNoteSkipped, pos]
    // 跳过也是「新一轮的第一次动作」⇒ 上一轮小结退场
    if (singleNoteSummary) setSingleNoteSummary(null)
    // 跳过也算一次「这个位置没掌握」：写进逐位置统计，热力图才看得出哪些把位总被放弃
    recordPositionResult(user.instrument, pos.stringIndex, pos.fret, false)
    const foundKeys = new Set(singleNoteFound.map(cellKey))
    const skippedKeys = new Set(nextSkipped.map(cellKey))
    const { tour } = buildSingleNoteRoundFor(singleNoteNote)
    const remaining = tour.filter(p => !foundKeys.has(cellKey(p)) && !skippedKeys.has(cellKey(p)))
    if (remaining.length === 0) {
      finishSingleNoteRound({ found: singleNoteFound, skipped: nextSkipped })
      return
    }
    setSingleNoteSkipped(nextSkipped)
    setHighlightedTargetPosition(singleNotePrompt === 'exact' ? remaining[0] : null)
  }, [
    singleNoteEnabled,
    singleNotePromptPos,
    singleNoteSkipped,
    singleNoteFound,
    singleNoteSummary,
    buildSingleNoteRoundFor,
    singleNoteNote,
    singleNotePrompt,
    finishSingleNoteRound,
    user.instrument,
  ])

  /**
   * 单音全指板 + 精确提示：点击指板时校验位置。
   * 未开启 / 非精确提示 ⇒ 恒为 true（= 只校验音名，行为与旧版一致）。
   */
  const isPracticePositionAllowed = useCallback(
    (pos: CellPos): boolean => {
      if (!singleNoteEnabled || singleNotePrompt !== 'exact') return true
      // 本轮已结束或没有位置可提示：不拦截（避免把最后一题卡死）
      if (!singleNotePromptPos) return true
      return singleNotePromptPos.stringIndex === pos.stringIndex && singleNotePromptPos.fret === pos.fret
    },
    [singleNoteEnabled, singleNotePrompt, singleNotePromptPos],
  )

  /**
   * 单音全指板的配置变化 ⇒ 重开一轮（目标音 / 品域 / 次数 / 提示方式 / 弦选择）。
   * 放在这里而不是 render 期，避免「改一个下拉就把指板点亮位置改掉」的渲染副作用。
   */
  useEffect(() => {
    if (!singleNoteEnabled) return
    const { tour } = buildSingleNoteRoundFor(singleNoteNote)
    setSingleNoteHits(0)
    setSingleNoteFound([])
    setSingleNoteSkipped([])
    setTargetNote(singleNoteNote)
    previousTargetRef.current = singleNoteNote
    setHighlightedTargetPosition(singleNotePrompt === 'exact' ? (tour[0] ?? null) : null)
    singleNoteRoundStartedAtRef.current = Date.now()
  }, [singleNoteEnabled, singleNoteNote, singleNoteQuota, singleNotePrompt, selectedStrings, buildSingleNoteRoundFor])

  // 单音全指板的「空格 = 跳过 / Enter = 重开本轮」接在 hooks/use-global-shortcuts.ts 里
  // （页面不许再开第二个 window keydown，见 __tests__/shortcuts-help-dialog.test.ts 的护栏）。

  // 音频答题路径：五模式判定 + 计分/连击/推进 + 冷却。判定口径见 lib/answer-judge.ts 与
  // lib/pitch-match.ts；实现在 hooks/use-practice-match.ts（逐行搬出，deps 照实写全）。
  const { processPracticeMatch, handleMIDINoteInput, handleFretClick } = usePracticeMatch({
    runtime: {
      isPlayingRef, activeTabRef, sensitivityRef, confidenceThresholdRef,
      practiceAnswerModeRef, isPlaying, activeTab,
    },
    audio: {
      isCoolingDownRef, cooldownRef, noteConfirmStateRef,
    },
    practice: {
      targetNoteRef, targetNote, generateNewTargetRef, generateNewTarget,
      onPracticeCorrect: advanceSingleNote,
      isPracticePositionAllowed,
      // 单音全指板：整轮只找一个音，用户要连续弹多个位置 ⇒ 不要 800ms 冷却
      // （冷却期收音链路整帧丢弃，第二下拨弦的起音信号会丢，表现为「第二个音很久才响应」）。
      hitCooldownMs: singleNoteEnabled ? 0 : undefined,
    },
    interval: {
      currentIntervalExerciseRef, currentIntervalExercise, setCurrentIntervalExercise, setIntervalPracticeStep,
      generateIntervalExerciseRef, findRootFirstRef, findRootFirst, addRootBackRef,
    },
    scale: {
      scaleKeyRef, scaleKey, selectedScaleRef, selectedScale,
      scaleExerciseSequenceRef, scaleExerciseSequence, scaleExerciseCurrentStepRef, scaleExerciseCurrentStep,
      setScaleExerciseCurrentStep, nextScaleExerciseRef, nextScaleExercise, scaleComboRef,
      scaleMaxComboRef, setScaleCombo, setScaleMaxCombo,
    },
    chord: {
      chordExerciseTargetChordRef, chordExerciseTargetChord, chordExerciseSequenceRef, chordExerciseSequence,
      chordExerciseCurrentStepRef, chordExerciseCurrentStep, chordExerciseIsAnsweredRef, setChordExerciseIsAnswered,
      setChordExerciseCurrentStep, nextChordExerciseRef, nextChordExercise, transposedChords,
      getTransposedChordsRef, currentChordIndexRef, currentChordIndex, nextChordRef,
      chordDegreeCurrentStepRef, setChordDegreeCurrentStep, practiceLevelRef, practiceLevel,
      getLevelOptions, levelOptionsRef, shouldVoiceLeadRef, nextChordInfoRef,
      lastChordNoteRef, chordExerciseOrder,
    },
    actions: {
      recordPositionStat, setScore, triggerCorrectFeedback, triggerWrongFeedback,
      playFeedbackSound, setHighlightedFrets, clearFretClickTimers,
      fretClickTimersRef, fretZoneEnabled, fretZoneStart, fretZoneSize,
      fretCount,
    },
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
    // 单音全指板的「无提示 / 把位提示」本来就没有精确位置，重新生成只会死循环
    if (singleNoteEnabled) return
    if (!highlightedTargetPosition) {
      logger.debug('辨音模式安全网：highlightedTargetPosition 为 null，重新生成目标')
      generateNewTarget()
    }
  }, [activeTab, practiceAnswerMode, highlightedTargetPosition, generateNewTarget, singleNoteEnabled])

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
    // 单音全指板：空格 = 跳过当前提示位置，Enter = 重开本轮（见 hooks/use-global-shortcuts.ts）
    singleNoteActive: singleNoteEnabled,
    onSingleNoteSkip: skipSingleNotePosition,
    onSingleNoteRestart: () => restartSingleNoteRound(singleNoteNote),
  })

  // 指板标注的音程集合 = 用户选中 ∪ 当前题显示的音程（含 down/random/either 方向的互补音程，
  // 否则下行题的目标度数格不标注、与题面符号矛盾 —— 见 lib/interval-index.ts 的注释）。
  // 仅影响指板/配色层的「度数标注」；interval-controls 的勾选框仍用原始 selectedIntervals。
  const fretboardIntervals = useMemo(
    () =>
      effectiveFretboardIntervals(
        selectedIntervals,
        currentIntervalExercise?.currentIntervalDisplay
      ),
    [selectedIntervals, currentIntervalExercise]
  )

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
          chordExerciseTargetChord, rootNote, selectedIntervals: fretboardIntervals,
          scaleKey, selectedScale, scaleExerciseSequence,
          transposedChords, currentChordIndex,
          threeNpsTarget, threeNpsCellKeys, nextThreeNpsCells,
          singleNoteTarget: singleNoteEnabled ? singleNoteNote : undefined,
          singleNoteFoundKeys: singleNoteEnabled ? singleNoteFoundKeys : undefined,
          singleNoteSkippedKeys: singleNoteEnabled ? singleNoteSkippedKeys : undefined,
          // 无提示：未找到的落点一个都不画（画出来就等于把答案圈在指板上）
          singleNoteHideUnfound: singleNoteEnabled && singleNotePrompt === 'none',
        },
        note,
        stringIndex,
        fret,
      ),
    [activeTab, highlightedFrets, targetNote, showAllNotes, isPlaying, chordExerciseTargetChord, rootNote, fretboardIntervals, scaleKey, selectedScale, currentChordIndex, practiceAnswerMode, highlightedTargetPosition, fretZoneEnabled, fretZoneStart, fretZoneSize, fretCount, scaleExerciseSequence, transposedChords, threeNpsTarget, threeNpsCellKeys, nextThreeNpsCells, singleNoteEnabled, singleNoteNote, singleNotePrompt, singleNoteFoundKeys, singleNoteSkippedKeys]
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

  // 桌面版：主题切换时把 WebView 底色同步成当前主题的底色。
  // 真全屏把客户区拉满整块屏幕，过扫描区露的就是 WebView 底色 ——
  // 不同步的话「浅色主题 + 真全屏」会露出深色边（此前该值还写死成另一个色号）。
  useEffect(() => {
    if (!isTauri) return
    void import("@/lib/native-window").then((m) => m.setWebViewBackgroundColor(themeBackgroundColor(theme)))
  }, [isTauri, theme])

  // AGC 开关必须真的到达 Rust（铁律 22：UI 写 store ≠ 到达后端）。
  // 这里同时覆盖两件事：启动时把持久化值同步一次（上次关掉后重启不会又开着），
  // 以及用户切换开关时立刻生效（Rust 的 agc_enabled 默认 true）。
  useEffect(() => {
    if (!isTauri) return
    void import("@/lib/native-audio")
      .then((m) => m.setAgcEnabled(agcEnabled))
      .catch((err) => logger.warn("同步 AGC 开关失败:", err))
  }, [isTauri, agcEnabled])

  return (
    <OnboardingProvider t={t}>
    <TooltipProvider>
      <div
        data-display-scale-root
        className="app-canvas app-height bg-background flex flex-col relative overflow-hidden"
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
          agcEnabled={agcEnabled}
          onAgcEnabledChange={setAgcEnabled}
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
          showAccuracy={user.showAccuracy}
          showTimer={user.showTimer}
        />

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden h-0 min-h-0">
          {/* Sidebar */}
          <aside
            data-onboarding="practice-tabs"
            className={cn(
              "app-sidebar border-r border-border/50 bg-card hidden md:flex flex-col",
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
                      : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
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
            
            <div className="mt-auto p-2 border-t border-border/40">
              <button
                onClick={() => setSidebarCollapsed()}
                className="w-full flex items-center justify-center p-2 rounded-lg text-muted-foreground hover:bg-secondary/70 hover:text-foreground transition-colors"
                aria-label={sidebarCollapsed ? t('btn_expand_sidebar') : t('btn_collapse_sidebar')}
                title={sidebarCollapsed ? t('btn_expand_sidebar') : t('btn_collapse_sidebar')}
              >
                {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
            </div>
          </aside>

          {/* Main Area */}
          <main className="flex-1 overflow-auto min-h-0 p-2 sm:p-4 pb-20 sm:pb-6">
            {/*
              内容列宽按视口分级（2026-10-19 比例修正）。
              原先固定 `max-w-4xl`（896px）⇒ 1920 屏上只占主区 53%、两侧各留 ~400px 空白，
              指板被压成窄条、设置项挤成小方块。现在按断点递进：
                基准 864 / lg 1024 / xl 1152 / 2xl 1312 / ≥1920 1408。
              小屏（< lg）仍是「撑满可用宽度」，行为不变。
            */}
            <div className="max-w-4xl lg:max-w-[60rem] xl:max-w-[66rem] 2xl:max-w-[72rem] mx-auto space-y-3 sm:space-y-4">
              {/* Control Panel - 统计/乐理页面不显示（依赖场景，无练习需控制） */}
              {activeTab !== "stats" && activeTab !== "theory" && (
              <Card
                ref={practiceCardRef}
                tabIndex={0}
                className={cn(
                  "outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                  // 练习进行中给整张练习卡一圈很轻的呼吸描边（视觉上「正在练」），
                  // 只读状态用 .practice-live 的 ::after，不参与命中测试。
                  isPlaying && "practice-live",
                )}
                role="region"
                aria-label={t('fretboard_title')}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <h2 className="section-title text-lg lg:text-xl font-semibold leading-none">
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
                        className="press-scale"
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
                {/* key 随页签变化 ⇒ 控制面板重新挂载并播放一次轻抬入场动画
                    （只影响控制区，指板与得分状态不受影响） */}
                <CardContent key={activeTab} className="tab-panel-in px-6 pt-0 pb-3">
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
                      onPracticeAnswerModeChange={handlePracticeAnswerModeChange}
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
                      singleNote={{
                        enabled: singleNoteEnabled,
                        note: singleNoteNote,
                        randomNote: singleNoteRandomNote,
                        cycle: singleNoteCycle,
                        prompt: singleNotePrompt,
                        quota: singleNoteQuota,
                        showLines: singleNoteShowLines,
                        done: singleNoteHits,
                        total: singleNoteRound.total,
                        // 跳过只对「有提示」的模式有意义：'none' 下没有当前目标可跳
                        canSkip: singleNotePrompt !== 'none' && singleNotePromptPos !== null,
                        lastHit: singleNoteLastHit,
                      }}
                      onSingleNoteChange={handleSingleNoteChange}
                      onSingleNoteSkip={skipSingleNotePosition}
                    />
                  )}

                  {/* 单音全指板：一轮小结。toast 2.5s 就消失，等于看完就没了 ⇒ 留成可关闭的小条 */}
                  {activeTab === "practice" && singleNoteEnabled && singleNoteSummary && (
                    <div className="flex items-start gap-2 rounded-md border border-border/40 bg-card/40 px-2.5 py-1.5 text-xs">
                      <div className="flex-1 space-y-0.5">
                        <div className="font-medium tabular-nums">
                          {t('single_note_round_done')
                            .replace('{found}', String(singleNoteSummary.found))
                            .replace('{skipped}', String(singleNoteSummary.skipped))
                            .replace('{seconds}', singleNoteSummary.seconds.toFixed(1))}
                        </div>
                        {singleNoteSummary.missedFrets.length > 0 && (
                          <div className="text-muted-foreground">
                            {t('single_note_missed_frets').replace('{frets}', singleNoteSummary.missedFrets.join(', '))}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => setSingleNoteSummary(null)}
                        aria-label={t('practice_summary_close')}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
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


              {/* 正误反馈：小型浮动胶囊（右上角）
                  原先这里是 `fixed inset-0` 居中大圆 + animate-pulse/bounce ——
                  正好落在指板中央，弹对一次就遮一次指板，动效也很跳。现在收成右上角
                  一枚轻量胶囊：不铺满整屏、不盖指板，只做一次 280ms 的柔和落位。
                  找音练习已有格子内反馈，仍然跳过；单音全指板是例外 ——
                  它只有在「弹了个别的音」时才需要这个胶囊（弹对靠格子点亮）。 */}
              {(activeTab !== 'practice' || (singleNoteEnabled && showWrongFeedback)) && (showCorrectFeedback || showWrongFeedback) && (
                <div className="fixed top-16 right-3 sm:top-20 sm:right-6 z-[100] pointer-events-none flex flex-col items-end gap-1.5">
                  {showCorrectFeedback && activeTab !== 'practice' && (
                    <div
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                      className="feedback-toast feedback-toast--correct"
                    >
                      <span className="feedback-toast__icon">
                        <Check className="h-4 w-4" />
                      </span>
                      <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                        {correctFeedbackNote ? formatNoteByAccidentalSetting(correctFeedbackNote) : ''}
                      </span>
                    </div>
                  )}
                  {showWrongFeedback && (
                    <div
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                      className="feedback-toast feedback-toast--wrong"
                    >
                      <span className="feedback-toast__icon">
                        <X className="h-4 w-4" />
                      </span>
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                        {wrongFeedbackNote ? formatNoteByAccidentalSetting(wrongFeedbackNote) : ''}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {showPracticeSummary && (
                <PracticeSummaryDialog
                  open={showPracticeSummary}
                  onOpenChange={(open) => !open && closePracticeSummary()}
                  onClose={closePracticeSummary}
                  data={practiceSummaryData}
                  onPracticeAgain={() => {
                    // 「再练一次」留在当前显示模式（全屏就继续全屏）
                    setShowPracticeSummary(false)
                    togglePractice()
                  }}
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
                    selectedIntervals={fretboardIntervals}
                    scaleKey={scaleKey}
                    selectedScale={selectedScale}
                    scaleExerciseSequence={scaleExerciseSequence}
                    transposedChords={transposedChords}
                    currentChordIndex={currentChordIndex}
                    chordExerciseTargetChord={chordExerciseTargetChord}
                    FRET_MARKERS={FRET_MARKERS}
                    targetNote={targetNote}
                    singleNoteTarget={singleNoteEnabled ? singleNoteNote : undefined}
                    singleNoteFound={singleNoteEnabled ? singleNoteFound : undefined}
                    singleNoteSkipped={singleNoteEnabled ? singleNoteSkipped : undefined}
                    singleNoteHideUnfound={singleNoteEnabled && singleNotePrompt === 'none'}
                    connectPoints={singleNoteEnabled && singleNoteShowLines ? singleNotePath : undefined}
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
                  selectedIntervals={fretboardIntervals}
                  scaleKey={scaleKey}
                  selectedScale={selectedScale}
                  scaleExerciseSequence={scaleExerciseSequence}
                  transposedChords={transposedChords}
                  currentChordIndex={currentChordIndex}
                  chordExerciseTargetChord={chordExerciseTargetChord}
                  targetNote={targetNote}
                  singleNoteTarget={singleNoteEnabled ? singleNoteNote : undefined}
                  connectPoints={singleNoteEnabled && singleNoteShowLines ? singleNotePath : undefined}
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
              {/* 未开始练习时不渲染题目卡：此前这三块在 `activeTab` 命中时就挂载，
                  即便内部内容全空也会留下一个空卡片（用户反馈「提示没了但框还在」）。
                  interval 早就是 `isPlaying` 门控，这里与之对齐。 */}
              {activeTab === "chord" && isPlaying && (
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
              {activeTab === "scale" && isPlaying && (
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
              {activeTab === "chord_exercise" && isPlaying && (
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
                  onDeleteRecord={deleteRecord}
                  onClearAllRecords={clearAllRecords}
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

        {/* 手机底部导航：5 个练习页 + 「更多」（教程/乐理/统计折叠在内） */}
        <MobileNav
          items={bottomNavItems}
          foldedItems={bottomFoldedItems}
          activeTab={activeTab}
          onSelect={handleTabChange}
          moreLabel={t('nav_more')}
          ariaLabel={t('nav_main_menu')}
        />

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
            chordDegreeCurrentStep={chordDegreeCurrentStep}
            chordExerciseTargetChord={chordExerciseTargetChord}
            chordExerciseSequence={chordExerciseSequence}
            chordExerciseCurrentStep={chordExerciseCurrentStep}
            nextChordExerciseInfo={nextChordExerciseInfo}
            scaleExerciseSequence={scaleExerciseSequence}
            scaleExerciseCurrentStep={scaleExerciseCurrentStep}
            scaleKey={scaleKey}
            selectedScale={selectedScale}
            nextScaleExerciseInfo={nextScaleExerciseInfo}
            threeNps={threeNpsView}
            nextThreeNps={nextThreeNpsView}
            currentIntervalExercise={currentIntervalExercise}
            intervalDirection={intervalDirection}
            intervalExerciseQueue={intervalExerciseQueue}
            intervalCurrentQueueIndex={intervalCurrentQueueIndex}
            score={score}
            timeLeft={timeLeft}
            practiceTime={practiceTime}
            formatTime={formatTime}
            showAccuracy={user.showAccuracy}
            showTimer={user.showTimer}
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
            selectedIntervals={fretboardIntervals}
            threeNpsTarget={threeNpsTarget}
            threeNpsCellKeys={threeNpsCellKeys}
            nextThreeNpsCells={nextThreeNpsCells}
            singleNoteTarget={singleNoteEnabled ? singleNoteNote : undefined}
            singleNoteFound={singleNoteEnabled ? singleNoteFound : undefined}
            singleNoteSkipped={singleNoteEnabled ? singleNoteSkipped : undefined}
            singleNoteHideUnfound={singleNoteEnabled && singleNotePrompt === 'none'}
            connectPoints={singleNoteEnabled && singleNoteShowLines ? singleNotePath : undefined}
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
