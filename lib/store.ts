import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { VERSION } from './version'
import { InstrumentType } from './practice-suggestions'
import { CustomSong } from './custom-song-editor'
import { logger } from './logger'
import type { PianoKeyboardStyle } from './piano-keyboard-style'

/**
 * 给底层 Storage 包一层 300ms 写入合并（debounce）。
 *
 * 导出仅为可测（零行为变化）：它是 `persist` 的实际落盘通道，
 * 「写太频」与「写丢失」两类问题都藏在这里，而通过 zustand 内部 `persist.getOptions()`
 * 去够 storage 在 vitest 下取不到，所以直接导出这个纯函数用假 Storage 单测。
 *
 * ⚠️ 已知语义（测试已钉住，改动前先想清楚）：
 *  - 单槽合并：只保留**最后一次**待写值，同一窗口内先写的会被丢弃（当前只有一个 key，无影响）；
 *  - 定时器句柄在闭包里，模块级单例 —— 因此整个应用共享一条 300ms 队列；
 *  - **没有 beforeunload / visibilitychange 兜底冲刷**：页面在写入后 300ms 内被关闭
 *    （或刷新）时，最后一次设置变更会丢。见 __tests__/store-persist.test.ts 的说明。
 */
export function debounceStorage(storage: Storage): Storage {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingData: string | null = null
  let pendingKey: string | null = null

  return {
    getItem: storage.getItem.bind(storage),
    setItem: (key: string, value: string) => {
      pendingKey = key
      pendingData = value
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        if (pendingKey && pendingData) {
          storage.setItem(pendingKey, pendingData)
          pendingKey = null
          pendingData = null
        }
        timer = null
      }, 300)
    },
    removeItem: storage.removeItem.bind(storage),
    get length() { return storage.length },
    clear: storage.clear.bind(storage),
    key: storage.key.bind(storage),
  }
}

// 练习类型
export type PracticeType = 'pitch_finding' | 'interval' | 'scale' | 'chord' | 'chord_progression'

// 音频设置
export interface AudioSettings {
  micEnabled: boolean
  inputGain: number
  confidenceThreshold: number
  sensitivity: number
  useAudioWorklet: boolean
  selectedAudioDevice: string
  pitchAlgorithm: 'standard' | 'solo'  // 音高识别算法：standard=标准YIN, solo=SOLO FFT加速版
  // Windows 版本专用设置
  bufferSize?: number  // 缓冲区大小 (256, 512, 1024, 2048, 4096)
  sampleRate?: number  // 采样率 (44100, 48000, 96000, 192000)
  noiseSuppression?: number  // 噪音抑制级别 (0-100)
  enableHighPass?: boolean  // 高通滤波
  enableLowPass?: boolean  // 低通滤波
  enableNotch50?: boolean  // 50Hz 陷波
  enableNotch60?: boolean  // 60Hz 陷波
  // 桌面端音频后端（默认 wasapi_shared；独占/ASIO 不可用时会回退）
  audioBackend?: 'wasapi_shared' | 'wasapi_exclusive' | 'asio'
  /**
   * 用户主动校准出的环境噪声底（RMS，见 lib/noise-calibration.ts）。
   * `undefined` = 从未校准过，worklet 用它内置的默认值 0.0005。
   *
   * 注意它是**测量值而不是偏好**：`resetSettings` 会随 audio slice 一起清掉
   * （与其余音频设置同语义）。清掉只是回到「自动跟踪」状态，不影响可用性。
   */
  noiseFloor?: number
  /**
   * 用户**主动**把「音频输入」关掉的标记（桌面端默认开的反例证据）。
   *
   * 为什么要单独一个字段：产品语义是「桌面端**默认开**，不需要每次开启；
   * 关闭才需要记住」（2026-10-02 用户确认「跨会话记住」）。但 `micEnabled`
   * 的默认值是 false —— 它无法区分「用户主动关了」和「从没碰过开关」。
   * 只看 micEnabled 的话，默认开没法实现（会把「没碰过」误判成「想关」）。
   *
   * 读写约定：只经 `setMicUserPreference(enabled)` 写入（`micEnabled=enabled`
   * 与 `micUserDisabled=!enabled` 同步落盘）；`setMicEnabled` 不动它（仅用于
   * 启动恢复时把 UI 对齐成默认开，语义上不是用户选择）。
   * Web 路径不读它（浏览器需要用户手势授权，不存在默认开）。
   */
  micUserDisabled?: boolean
}

export type FullscreenModeType = 'windowed' | 'fullscreen'

export interface AudioDeviceState {
  devices: MediaDeviceInfo[]
  initializing: boolean
  error: string | null
}

// Focus模式设置
export interface FocusModeSettings {
  enabled: boolean
  enableWakeLock: boolean
  enableFullscreen: boolean
  fullscreenMode: FullscreenModeType  // 全屏模式：窗口全屏 或 真全屏
  showTimer: boolean
  showProgress: boolean
  dimBackground: boolean
  hideDistractions: boolean
  targetDuration: number
}

export type ThemeMode =
  | 'dark'
  | 'light'
  | 'forest-dark'
  | 'forest-light'
  | 'ocean-dark'
  | 'ocean-light'
  | 'sunset-dark'
  | 'sunset-light'
  | 'monochrome-dark'
  | 'monochrome-light'
  | 'rose-dark'
  | 'rose-light'
  | 'midnight-dark'
  | 'midnight-light'
  | 'sand-dark'
  | 'sand-light'
  | 'celadon-dark'
  | 'celadon-light'
  | 'lavender-dark'
  | 'lavender-light'
  | 'carbon-dark'
  | 'carbon-light'

// 主题风格（不含明暗）
export type ThemeStyle = 'classic' | 'forest' | 'ocean' | 'sunset' | 'monochrome' | 'rose' | 'midnight' | 'sand' | 'celadon' | 'lavender' | 'carbon'
// 明暗模式
export type ThemeBrightness = 'dark' | 'light'

// 从 ThemeMode 拆解出风格与明暗
export const parseTheme = (theme: ThemeMode): { style: ThemeStyle; brightness: ThemeBrightness } => {
  const brightness: ThemeBrightness = theme === 'light' || theme.endsWith('-light') ? 'light' : 'dark'
  if (theme.startsWith('forest')) return { style: 'forest', brightness }
  if (theme.startsWith('ocean')) return { style: 'ocean', brightness }
  if (theme.startsWith('sunset')) return { style: 'sunset', brightness }
  if (theme.startsWith('monochrome')) return { style: 'monochrome', brightness }
  if (theme.startsWith('rose')) return { style: 'rose', brightness }
  if (theme.startsWith('midnight')) return { style: 'midnight', brightness }
  if (theme.startsWith('sand')) return { style: 'sand', brightness }
  if (theme.startsWith('celadon')) return { style: 'celadon', brightness }
  if (theme.startsWith('lavender')) return { style: 'lavender', brightness }
  if (theme.startsWith('carbon')) return { style: 'carbon', brightness }
  return { style: 'classic', brightness }
}

// 由风格 + 明暗组合成 ThemeMode
export const composeTheme = (style: ThemeStyle, brightness: ThemeBrightness): ThemeMode => {
  if (style === 'classic') return brightness
  return `${style}-${brightness}` as ThemeMode
}

// 判断 ThemeMode 是否为浅色（用于 sonner 等组件主题适配）
export const isLightTheme = (theme: ThemeMode): boolean => {
  return theme === 'light' || theme.endsWith('-light')
}
export type ChordScaleDisplayMode = 'chinese' | 'english' | 'english_short' | 'jazz'
export type NoteAccidentalDisplay = 'sharp' | 'flat' | 'mixed'
/** 指板显示方案：classic = 经典实心色块；guitarrun = GuitarRun 风格圆点霓虹皮肤 */
export type FretboardStyle = 'classic' | 'guitarrun' | 'trainer'

export interface UserSettings {
  instrument: InstrumentType
  language: 'zh-CN' | 'en'
  theme: ThemeMode
  chordScaleDisplay: ChordScaleDisplayMode
  noteAccidentalDisplay: NoteAccidentalDisplay
  showPracticeSuggestion: boolean
  fretboardStyle: FretboardStyle
  /** 钢琴键盘样式：classic = 整键底色高亮；musmath = 键面留白 + 音级色标 */
  pianoKeyboardStyle: PianoKeyboardStyle
}

// Premium功能状态
export interface PremiumFeatures {
  customChordProgressions: boolean
  customTunings: boolean
  advancedLevels: boolean
}

// 收藏状态
export interface FavoritesState {
  levelFavorites: string[]
  songFavorites: string[]
}

// 练习设置
export interface PracticeSettings {
  practiceTime: number
  fretCount: number
  autoNextDelay: number
  cooldownEnabled: boolean
  cooldownDuration: number
  referenceFrequency: number
  // 限制练习（Limitation Exercises）
  fretZoneEnabled: boolean  // 5品区限制开关
  fretZoneStart: number  // 5品区起点品数（0-based）
  fretZoneSize: number  // 5品区宽度（默认5）
  octaveShiftEnabled: boolean  // 八度切换开关
  octaveShiftMode: 'up' | 'down' | 'random'  // 八度方向
  weaknessWeightedEnabled: boolean  // 弱点加权出题开关
}

// 节拍器设置
export interface MetronomeSettings {
  enabled: boolean
  bpm: number
  sound: boolean
  flash: boolean
  visualize?: boolean
}

// 反馈音设置
export interface FeedbackSoundSettings {
  enabled: boolean
  correctSound: boolean
  wrongSound: boolean
}

// 和弦符号显示设置
export interface ChordSymbolSettings {
  minorSymbol: 'm' | '-' | 'min'  // 小调和弦符号
  minor7flat5Symbol: 'm7b5' | 'ø7' | 'half-dim'  // 半减七和弦符号
  dominant7flat9Symbol: '7b9' | '7♭9' | '7-9'  // 属七降九和弦符号
  useUnicode: boolean  // 使用 Unicode 符号 (♯, ♭, Δ, ø, °)
  useJazzNotation: boolean  // 使用爵士乐记谱法
  // 七降九音阶选择（SevenFlatNineScaleChoice）—— 7b9 和弦对应的音阶
  sevenFlatNineScaleChoice: 'altered' | 'diminishedWholeHalf' | 'diminishedHalfWhole'
}

// 音程练习设置
export interface IntervalPracticeSettings {
  selectedIntervals: number[]
  rootMode: 'fixed' | 'random'
  rootNote: string
  findRootFirst: boolean
  addRootBack: boolean
  direction: 'up' | 'down' | 'random' | 'either'
  randomizeOrder: boolean
  practiceDuration: number
  /** ⚠️ 已弃用：辅助开关不再持久化（页面不再写回、hook 初值恒 false）。
   * 字段保留只为兼容 persist 的旧数据，**不要**再拿它当初值。 */
  showFretboard: boolean
  fretboardDuration: number
  autoAdvance: boolean
}

// 和弦进行练习设置
export interface ChordProgressionSettings {
  selectedSongId: string
  selectedLevelId: string
  progressionKey: string
  playOrder: 'asc' | 'desc' | 'random'
  shouldRepeat: boolean
  shouldVoiceLead: boolean
  randomizeKeyOnRepeat: boolean
  /** ⚠️ 已弃用（同 `IntervalPracticeSettings.showFretboard`）：
   * 三个辅助显隐开关都不再持久化，字段保留仅为兼容旧 persist 数据。 */
  showFretboard: boolean
  showKeyboard: boolean
  showStructure: boolean
  songSortOption: 'titleAsc' | 'titleDesc' | 'styleAsc' | 'styleDesc'
}

// 音阶练习设置
export interface ScalePracticeSettings {
  scaleKey: string
  isScaleKeyRandom: boolean
  selectedScaleCategory: string
  selectedScales: string[]
  scaleDirection: 'up' | 'down' | 'up_down' | 'random'
  scaleRootMovement: 'static' | 'random' | 'upSemiTone' | 'downSemiTone' | 'circleOfFifths' | 'circleOfFourths'
  scalePracticeSequence: string
}

// 应用状态
export interface AppState {
  // UI 状态
  activeTab: string
  sidebarCollapsed: boolean
  settingsOpen: boolean
  isFullscreen: boolean
  displayScale: number
  
  // 练习状态
  isPlaying: boolean
  score: { correct: number; total: number }
  
  // 音频状态
  audio: AudioSettings
  audioDevice: AudioDeviceState
  detectedPitch: string | null
  detectedCents: number | null
  
  // 练习设置
  practice: PracticeSettings
  
  // 节拍器
  metronome: MetronomeSettings
  
  // 反馈音
  feedbackSound: FeedbackSoundSettings
  
  // 和弦符号显示
  chordSymbols: ChordSymbolSettings
  
  // 音阶练习设置
  scalePractice: ScalePracticeSettings
  
  // 音程练习设置
  intervalPractice: IntervalPracticeSettings
  
  // 和弦进行练习设置
  chordProgression: ChordProgressionSettings
  
  // Focus模式
  focusMode: FocusModeSettings
  
  // 用户设置
  user: UserSettings
  
  // Premium功能
  premium: PremiumFeatures
  
  // 自定义歌曲
  customSongs: CustomSong[]
  
  // 收藏
  favorites: FavoritesState
  
  // 当前练习建议
  currentPracticeSuggestion: string | null

  // 版本号
  version: string
}

// 操作
export interface AppActions {
  // UI 操作
  setActiveTab: (tab: string) => void
  toggleSidebar: () => void
  setSettingsOpen: (open: boolean) => void
  toggleFullscreen: () => void
  setFullscreen: (fullscreen: boolean) => void
  setDisplayScale: (scale: number) => void
  
  // 练习操作
  setIsPlaying: (playing: boolean) => void
  setScore: (score: { correct: number; total: number } | ((prev: { correct: number; total: number }) => { correct: number; total: number })) => void
  incrementScore: (correct: boolean) => void
  resetScore: () => void
  
  // 音频操作
  setMicEnabled: (enabled: boolean) => void
  /**
   * 用户**显式**开/关「音频输入」（设置页开关、M 快捷键）。与 `setMicEnabled` 的区别：
   * 本 action 同步落 `micUserDisabled=!enabled` —— 这是「用户偏好」，桌面端启动恢复
   * 靠它区分「主动关了」（记住关）与「从没碰过」（默认开）。
   */
  setMicUserPreference: (enabled: boolean) => void
  setInputGain: (gain: number) => void
  setConfidenceThreshold: (threshold: number) => void
  setSensitivity: (sensitivity: number) => void
  setUseAudioWorklet: (use: boolean) => void
  setSelectedAudioDevice: (deviceId: string) => void
  setPitchAlgorithm: (algorithm: 'standard' | 'solo') => void
  // Windows 版本音频设置操作
  setBufferSize: (size: number) => void
  setSampleRate: (rate: number) => void
  setNoiseSuppression: (level: number) => void
  setEnableHighPass: (enabled: boolean) => void
  setEnableLowPass: (enabled: boolean) => void
  setEnableNotch50: (enabled: boolean) => void
  setEnableNotch60: (enabled: boolean) => void
  setDetectedPitch: (pitch: string | null) => void
  setDetectedCents: (cents: number | null) => void
  
  // 音频设备操作
  setAudioDevices: (devices: MediaDeviceInfo[]) => void
  setAudioInitializing: (initializing: boolean) => void
  setAudioError: (error: string | null) => void
  setAudioBackend: (backend: 'wasapi_shared' | 'wasapi_exclusive' | 'asio') => void
  /** 写入校准出的环境噪声底；传 null 清除（回到 worklet 内置默认） */
  setNoiseFloor: (floor: number | null) => void
  
  // 练习设置操作
  setPracticeTime: (time: number) => void
  setFretCount: (count: number) => void
  setAutoNextDelay: (delay: number) => void
  setCooldownEnabled: (enabled: boolean) => void
  setCooldownDuration: (duration: number) => void
  setReferenceFrequency: (freq: number) => void
  // 限制练习操作
  setFretZoneEnabled: (enabled: boolean) => void
  setFretZoneStart: (start: number) => void
  setFretZoneSize: (size: number) => void
  setOctaveShiftEnabled: (enabled: boolean) => void
  setOctaveShiftMode: (mode: 'up' | 'down' | 'random') => void
  setWeaknessWeightedEnabled: (enabled: boolean) => void
  
  // 节拍器操作
  setMetronomeEnabled: (enabled: boolean) => void
  setMetronomeBpm: (bpm: number) => void
  setMetronomeSound: (sound: boolean) => void
  setMetronomeFlash: (flash: boolean) => void
  setMetronomeVisualize: (visualize: boolean) => void
  setMetronomeSettings: (settings: Partial<MetronomeSettings>) => void
  
  // 反馈音操作
  setFeedbackSoundEnabled: (enabled: boolean) => void
  setCorrectSoundEnabled: (enabled: boolean) => void
  setWrongSoundEnabled: (enabled: boolean) => void
  
  // 和弦符号设置操作
  setChordSymbolSettings: (settings: Partial<ChordSymbolSettings>) => void
  
  // 音阶练习设置操作
  setScalePracticeSettings: (settings: Partial<ScalePracticeSettings>) => void
  
  // 音程练习设置操作
  setIntervalPracticeSettings: (settings: Partial<IntervalPracticeSettings>) => void
  
  // 和弦进行练习设置操作
  setChordProgressionSettings: (settings: Partial<ChordProgressionSettings>) => void
  
  // Focus模式操作
  setFocusModeEnabled: (enabled: boolean) => void
  setFocusModeSettings: (settings: Partial<FocusModeSettings>) => void
  setFullscreenMode: (mode: FullscreenModeType) => void
  
  // 用户设置操作
  setInstrument: (instrument: InstrumentType) => void
  setLanguage: (language: 'zh-CN' | 'en') => void
  setTheme: (theme: ThemeMode) => void
  setChordScaleDisplay: (display: ChordScaleDisplayMode) => void
  setNoteAccidentalDisplay: (display: NoteAccidentalDisplay) => void
  setFretboardStyle: (style: FretboardStyle) => void
  setPianoKeyboardStyle: (style: PianoKeyboardStyle) => void
  setShowPracticeSuggestion: (show: boolean) => void
  setCurrentPracticeSuggestion: (suggestion: string | null) => void
  
  // Premium操作
  setPremiumFeature: (feature: keyof PremiumFeatures, enabled: boolean) => void
  
  // 自定义歌曲操作
  addCustomSong: (song: CustomSong) => void
  updateCustomSong: (id: string, song: Partial<CustomSong>) => void
  deleteCustomSong: (id: string) => void
  loadCustomSongs: (songs: CustomSong[]) => void
  
  // 收藏操作
  toggleLevelFavorite: (id: string) => void
  toggleSongFavorite: (id: string) => void
  
  // 重置
  resetSettings: () => void

}

/**
 * 把旧命名方案的练习等级 id 映射到当前方案。
 * 背景：早期 page.tsx 自带一份等级数据，id 形如 `voice_led_voice_led_structure_1`；
 * 现已统一到 lib/practice-levels 的 `voice_led_structure_1` 命名。
 * 此函数用于把老用户已保存的「当前等级」与「等级收藏」迁到新 id，避免失效。
 * 返回 null 表示该等级已被合并掉（调用方应回退到默认值）。
 */
export function remapLegacyLevelId(id: string): string | null {
  const explicit: Record<string, string> = {
    'chord_scales_chord_scale': 'chord_scale',
    'chord_scales_chord_scale_3rd_to_3rd': 'chord_scale_3rd_to_3rd',
    'chord_scales_chord_scale_5th_to_5th': 'chord_scale_5th_to_5th',
    'chord_scales_chord_scale_7th_to_7th': 'chord_scale_7th_to_7th',
    'chord_scales_chord_scale_random_starting_chord_tone': 'chord_scale_random_chord_tone',
    'chord_scales_chord_scale_random_starting_scale_tone': 'chord_scale_random_scale_tone',
    'four_chord_tones_root_3rd_5th_7th_random_inversions': 'four_chord_tones_random_inversions',
    'melodic_5th_to_9th_melodic_structure_10_random_inversions': 'melodic_structure_10_random_inversions',
    'melodic_5th_to_9th_melodic_structure_6': 'melodic_structure_6',
    'melodic_5th_to_9th_melodic_structure_7': 'melodic_structure_7',
    'melodic_5th_to_9th_melodic_structure_8': 'melodic_structure_8',
    'melodic_5th_to_9th_melodic_structure_9': 'melodic_structure_9',
    'melodic_root_to_5th_melodic_structure_1': 'melodic_structure_1',
    'melodic_root_to_5th_melodic_structure_2': 'melodic_structure_2',
    'melodic_root_to_5th_melodic_structure_3': 'melodic_structure_3',
    'melodic_root_to_5th_melodic_structure_4': 'melodic_structure_4',
    'melodic_root_to_5th_melodic_structure_5_random_inversions': 'melodic_structure_5_random_inversions',
    'passing_note_scales_passing_note_scale': 'passing_note_scale',
    'passing_note_scales_passing_note_scale_3rd_to_3rd': 'passing_note_scale_3rd_to_3rd',
    'passing_note_scales_passing_note_scale_5th_to_5th': 'passing_note_scale_5th_to_5th',
    'passing_note_scales_passing_note_scale_6th7th_to_6th7th': 'passing_note_scale_6th_7th_to_6th_7th',
    'passing_note_scales_passing_note_scale_random_starting_chord_tone': 'passing_note_scale_random_chord_tone',
    'suspended_suspended_2_resolution': 'suspended_2_resolution',
    'suspended_suspended_4_resolution': 'suspended_4_resolution',
    'three_chord_tones_root_3rd_5th_random_inversions': 'three_chord_tones_random_inversions',
    'voice_led_voice_led_structure_1': 'voice_led_structure_1',
    'voice_led_voice_led_structure_2': 'voice_led_structure_2',
    'voice_led_voice_led_structure_3': 'voice_led_structure_3',
    'voice_led_voice_led_structure_4': 'voice_led_structure_4',
    'voice_led_voice_led_structure_5': 'voice_led_structure_5',
  }
  const hit = explicit[id]
  if (hit) return hit
  // 兜底：多数改名只是去掉了重复的分类前缀
  for (const prefix of [
    'voice_led_',
    'melodic_root_to_5th_',
    'melodic_5th_to_9th_',
    'suspended_',
    'chord_scales_',
    'passing_note_scales_',
  ]) {
    if (id.startsWith(prefix)) {
      const stripped = id.slice(prefix.length)
      if (stripped !== id) return stripped
    }
  }
  return null
}

/** 已被合并掉的旧等级（无法映射，回退默认等级） */
const REMOVED_LEGACY_LEVEL_IDS: string[] = [
  'four_chord_tones_3rd_5th_7th_root_3rd',
  'four_chord_tones_5th_7th_root_3rd_5th',
  'four_chord_tones_7th_root_3rd_5th_7th',
]

// 初始状态
const initialState: AppState = {
  activeTab: 'practice',
  sidebarCollapsed: false,
  settingsOpen: false,
  isFullscreen: false,
  displayScale: 1,
  
  isPlaying: false,
  score: { correct: 0, total: 0 },
  
  audio: {
    micEnabled: false,
    inputGain: 1,
    confidenceThreshold: 0.8,
    sensitivity: 0.5,
    useAudioWorklet: true,
    selectedAudioDevice: '',
    pitchAlgorithm: 'solo',  // 默认使用SOLO算法
    // Windows 版本默认值 - SOLO 默认参数
    bufferSize: 2048,        // SOLO 默认缓冲区大小
    sampleRate: 48000,       // SOLO 默认采样率
    noiseSuppression: 70,    // Windows 最佳实践：较高噪音抑制
    enableHighPass: true,    // Windows 最佳实践：启用高通滤波
    enableLowPass: true,     // Windows 最佳实践：启用低通滤波
    enableNotch50: true,     // Windows 最佳实践：启用50Hz陷波(亚洲/欧洲)
    enableNotch60: false,    // 北美用户可手动启用60Hz陷波
    audioBackend: 'wasapi_shared',
    // 「音频输入默认开」的反例证据：用户从未主动关过 ⇒ false（Tauri 启动恢复用）
    micUserDisabled: false,
  },
  
  audioDevice: {
    devices: [],
    initializing: false,
    error: null,
  },
  
  detectedPitch: null,
  detectedCents: null,
  
  practice: {
    practiceTime: 300,
    fretCount: 15,
    autoNextDelay: 0,
    cooldownEnabled: false,
    cooldownDuration: 1000,
    referenceFrequency: 440,
    // 限制练习默认配置
    fretZoneEnabled: false,
    fretZoneStart: 0,
    fretZoneSize: 5,
    octaveShiftEnabled: false,
    octaveShiftMode: 'random',
    weaknessWeightedEnabled: false,
  },
  
  metronome: {
    enabled: false,
    bpm: 80,
    sound: true,
    flash: false,
  },
  
  feedbackSound: {
    enabled: true,
    correctSound: true,
    wrongSound: true,
  },
  
  chordSymbols: {
    minorSymbol: 'm',  // SOLO 默认使用 'm'
    minor7flat5Symbol: 'ø7',  // SOLO 默认使用爵士符号 ø7
    dominant7flat9Symbol: '7b9',  // SOLO 默认使用 7b9
    useUnicode: true,  // SOLO 默认使用 Unicode 符号
    useJazzNotation: true,  // SOLO 默认使用爵士乐记谱法
    sevenFlatNineScaleChoice: 'altered',  // SOLO 默认 7b9 用 Altered 音阶
  },
  
  scalePractice: {
    scaleKey: 'C',
    isScaleKeyRandom: false,
    selectedScaleCategory: 'pentatonic',
    selectedScales: ['minor_pentatonic'],
    scaleDirection: 'up',
    scaleRootMovement: 'static',
    scalePracticeSequence: '1to1',
  },
  
  intervalPractice: {
    selectedIntervals: [0, 7],
    rootMode: 'fixed',
    rootNote: 'C',
    findRootFirst: false,
    addRootBack: false,
    direction: 'up',
    randomizeOrder: true,
    practiceDuration: 5,
    showFretboard: false,
    fretboardDuration: 3,
    autoAdvance: false,
  },
  
  chordProgression: {
    selectedSongId: '',
    selectedLevelId: 'three_chord_tones_root_3rd_5th',
    progressionKey: 'C',
    playOrder: 'asc',
    shouldRepeat: false,
    shouldVoiceLead: false,
    randomizeKeyOnRepeat: false,
    showFretboard: false,
    showKeyboard: false,
    showStructure: false,
    songSortOption: 'titleAsc',
  },
  
  focusMode: {
    enabled: false,
    enableWakeLock: true,
    enableFullscreen: true,
    fullscreenMode: 'windowed',  // 默认使用窗口全屏
    showTimer: true,
    showProgress: true,
    dimBackground: true,
    hideDistractions: true,
    targetDuration: 0,
  },
  
  user: {
    instrument: 'six_string_guitar',
    language: 'zh-CN',
    theme: 'dark' as ThemeMode,
    chordScaleDisplay: 'chinese' as ChordScaleDisplayMode,
    noteAccidentalDisplay: 'sharp' as NoteAccidentalDisplay,
    showPracticeSuggestion: true,
    fretboardStyle: 'classic' as FretboardStyle,
    pianoKeyboardStyle: 'classic' as PianoKeyboardStyle,
  },
  
  premium: {
    customChordProgressions: true,  // Web版本默认开放
    customTunings: true,
    advancedLevels: true,
  },
  
  customSongs: [],
  
  favorites: {
    levelFavorites: [],
    songFavorites: [],
  },
  
  currentPracticeSuggestion: null,

  version: VERSION,
}

/**
 * 把持久化的 state 迁移到当前版本（zustand persist 的 migrate 回调）。
 * 抽为导出的纯函数以便测试 —— 迁移出错不会抛异常、只会让老用户静默失效。
 */
export function migratePersistedState(persistedState: any, version: number): any {
  try {
    if (!persistedState || typeof persistedState !== 'object') {
      return initialState
    }
    if (!persistedState.focusMode) {
      persistedState.focusMode = initialState.focusMode
    } else {
      if (persistedState.focusMode.fullscreenMode === undefined) {
        persistedState.focusMode.fullscreenMode = 'windowed'
      }
      if (persistedState.focusMode.enabled === undefined) {
        persistedState.focusMode.enabled = false
      }
      if (persistedState.focusMode.enableWakeLock === undefined) {
        persistedState.focusMode.enableWakeLock = true
      }
      if (persistedState.focusMode.enableFullscreen === undefined) {
        persistedState.focusMode.enableFullscreen = true
      }
    }
    if (!persistedState.user) {
      persistedState.user = initialState.user
    } else {
      if (persistedState.user.language === undefined || persistedState.user.language === 'zh') {
        persistedState.user.language = 'zh-CN'
      }
      if (persistedState.user.instrument === undefined) {
        persistedState.user.instrument = initialState.user.instrument
      }
      if (persistedState.user.theme === undefined) {
        persistedState.user.theme = 'dark'
      }
      if (persistedState.user.chordScaleDisplay === undefined) {
        persistedState.user.chordScaleDisplay = 'chinese'
      }
      if (persistedState.user.noteAccidentalDisplay === undefined) {
        persistedState.user.noteAccidentalDisplay = 'sharp'
      }
      if (persistedState.user.showPracticeSuggestion === undefined) {
        persistedState.user.showPracticeSuggestion = initialState.user.showPracticeSuggestion
      }
      // 嵌套字段不会随顶层浅合并补默认值 ⇒ 老 blob 必须在这里补齐，否则永久 undefined
      if (persistedState.user.fretboardStyle === undefined) {
        persistedState.user.fretboardStyle = 'classic'
      }
      if (persistedState.user.pianoKeyboardStyle === undefined) {
        persistedState.user.pianoKeyboardStyle = 'classic'
      }
    }
    // audio.micUserDisabled：2026-10-02 新增（「桌面端音频输入默认开」语义）。
    // 老 blob 的 audio 对象整体浅覆盖 initialState.audio ⇒ 嵌套新字段必须在这里补齐。
    // ⚠️ 老 blob 里 micEnabled=false 分不清「主动关」还是「从没开」，统一按
    // 「从未主动关」处理 ⇒ 升级后享受默认开 —— 与本次产品诉求方向一致。
    if (persistedState.audio && persistedState.audio.micUserDisabled === undefined) {
      persistedState.audio.micUserDisabled = false
    }
    if (persistedState.fullscreenMode !== undefined) {
      persistedState.isFullscreen = persistedState.fullscreenMode
      delete persistedState.fullscreenMode
    }

    // v1 -> v2：练习等级 id 统一到 lib/practice-levels 命名方案。
    // 把老用户已选等级与等级收藏从旧 id 迁到新 id（已被合并掉的等级回退默认）。
    if (version < 2) {
      const DEFAULT_LEVEL_ID = 'single_chord_tones_root'
      if (persistedState.chordProgression && typeof persistedState.chordProgression.selectedLevelId === 'string') {
        const oldId = persistedState.chordProgression.selectedLevelId
        if (REMOVED_LEGACY_LEVEL_IDS.includes(oldId)) {
          persistedState.chordProgression.selectedLevelId = DEFAULT_LEVEL_ID
        } else {
          const mapped = remapLegacyLevelId(oldId)
          if (mapped) persistedState.chordProgression.selectedLevelId = mapped
        }
      }
      if (persistedState.favorites && Array.isArray(persistedState.favorites.levelFavorites)) {
        persistedState.favorites.levelFavorites = persistedState.favorites.levelFavorites
          .map((id: string) => (REMOVED_LEGACY_LEVEL_IDS.includes(id) ? null : (remapLegacyLevelId(id) ?? id)))
          .filter((id: string | null): id is string => !!id)
      }
    }

    return persistedState
  } catch (error) {
    logger.error('Store migration failed, resetting to defaults:', error)
    return initialState
  }
}

export const storePartialize = (state: AppState) => ({
  displayScale: state.displayScale,
  audio: state.audio,
  practice: state.practice,
  metronome: state.metronome,
  feedbackSound: state.feedbackSound,
  focusMode: state.focusMode,
  user: state.user,
  premium: state.premium,
  customSongs: state.customSongs,
  favorites: state.favorites,
  chordSymbols: state.chordSymbols,
  scalePractice: state.scalePractice,
  intervalPractice: state.intervalPractice,
  chordProgression: state.chordProgression,
})

// 创建 Store
export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, _get) => ({
      ...initialState,
      
      // UI 操作
      setActiveTab: (tab) => set({ activeTab: tab }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      toggleFullscreen: () => set((state) => ({ isFullscreen: !state.isFullscreen })),
      setFullscreen: (fullscreen) => set({ isFullscreen: fullscreen }),
      setDisplayScale: (scale) => set({ displayScale: scale }),
      
      // 练习操作
      setIsPlaying: (playing) => set({ isPlaying: playing }),
      setScore: (scoreOrUpdater) => {
        if (typeof scoreOrUpdater === 'function') {
          set((state) => ({ score: scoreOrUpdater(state.score) }))
        } else {
          set({ score: scoreOrUpdater })
        }
      },
      incrementScore: (correct) => set((state) => ({
        score: {
          correct: state.score.correct + (correct ? 1 : 0),
          total: state.score.total + 1,
        },
      })),
      resetScore: () => set({ score: { correct: 0, total: 0 } }),
      
      // 音频操作
      setMicEnabled: (enabled) => set((state) => ({ audio: { ...state.audio, micEnabled: enabled } })),
      // 只写 micEnabled 的话，「主动关」与「从没碰过」无法区分 ⇒ 桌面端永远实现不了默认开
      setMicUserPreference: (enabled) =>
        set((state) => ({
          audio: { ...state.audio, micEnabled: enabled, micUserDisabled: !enabled },
        })),
      setInputGain: (gain) => set((state) => ({ audio: { ...state.audio, inputGain: gain } })),
      setConfidenceThreshold: (threshold) => set((state) => ({ audio: { ...state.audio, confidenceThreshold: threshold } })),
      setSensitivity: (sensitivity) => set((state) => ({ audio: { ...state.audio, sensitivity } })),
      setUseAudioWorklet: (use) => set((state) => ({ audio: { ...state.audio, useAudioWorklet: use } })),
      setSelectedAudioDevice: (deviceId) => set((state) => ({ audio: { ...state.audio, selectedAudioDevice: deviceId } })),
      setPitchAlgorithm: (algorithm) => set((state) => ({ audio: { ...state.audio, pitchAlgorithm: algorithm } })),
      // Windows 版本音频设置 - P1 Fix: Added input validation
      setBufferSize: (size) => set((state) => {
        const validSizes = [256, 512, 1024, 2048, 4096]
        const validSize = validSizes.includes(size) ? size : 2048
        return { audio: { ...state.audio, bufferSize: validSize } }
      }),
      setSampleRate: (rate) => set((state) => {
        const validRates = [44100, 48000, 96000, 192000]
        const validRate = validRates.includes(rate) ? rate : 48000
        return { audio: { ...state.audio, sampleRate: validRate } }
      }),
      setNoiseSuppression: (level) => set((state) => ({
        audio: { ...state.audio, noiseSuppression: Math.max(0, Math.min(100, level)) }
      })),
      setEnableHighPass: (enabled) => set((state) => ({ audio: { ...state.audio, enableHighPass: enabled } })),
      setEnableLowPass: (enabled) => set((state) => ({ audio: { ...state.audio, enableLowPass: enabled } })),
      setEnableNotch50: (enabled) => set((state) => ({ audio: { ...state.audio, enableNotch50: enabled } })),
      setEnableNotch60: (enabled) => set((state) => ({ audio: { ...state.audio, enableNotch60: enabled } })),
      setDetectedPitch: (pitch) => set({ detectedPitch: pitch }),
      setDetectedCents: (cents) => set({ detectedCents: cents }),
      
      setAudioDevices: (devices) => set((state) => ({ audioDevice: { ...state.audioDevice, devices } })),
      setAudioInitializing: (initializing) => set((state) => ({ audioDevice: { ...state.audioDevice, initializing } })),
      setAudioError: (error) => set((state) => ({ audioDevice: { ...state.audioDevice, error } })),
      setAudioBackend: (backend) => set((state) => ({ audio: { ...state.audio, audioBackend: backend } })),
      setNoiseFloor: (floor) => set((state) => ({ audio: { ...state.audio, noiseFloor: floor ?? undefined } })),
      
      // 练习设置操作
      setPracticeTime: (time) => set((state) => ({ practice: { ...state.practice, practiceTime: time } })),
      setFretCount: (count) => set((state) => ({ practice: { ...state.practice, fretCount: count } })),
      setAutoNextDelay: (delay) => set((state) => ({ practice: { ...state.practice, autoNextDelay: delay } })),
      setCooldownEnabled: (enabled) => set((state) => ({ practice: { ...state.practice, cooldownEnabled: enabled } })),
      setCooldownDuration: (duration) => set((state) => ({ practice: { ...state.practice, cooldownDuration: duration } })),
      setReferenceFrequency: (freq) => set((state) => ({ practice: { ...state.practice, referenceFrequency: freq } })),
      // 限制练习操作
      setFretZoneEnabled: (enabled) => set((state) => ({ practice: { ...state.practice, fretZoneEnabled: enabled } })),
      setFretZoneStart: (start) => set((state) => ({
        practice: { ...state.practice, fretZoneStart: Math.max(0, Math.min(state.practice.fretCount - state.practice.fretZoneSize, start)) }
      })),
      setFretZoneSize: (size) => set((state) => ({
        practice: { ...state.practice, fretZoneSize: Math.max(2, Math.min(state.practice.fretCount, size)) }
      })),
      setOctaveShiftEnabled: (enabled) => set((state) => ({ practice: { ...state.practice, octaveShiftEnabled: enabled } })),
      setOctaveShiftMode: (mode) => set((state) => ({ practice: { ...state.practice, octaveShiftMode: mode } })),
      setWeaknessWeightedEnabled: (enabled) => set((state) => ({ practice: { ...state.practice, weaknessWeightedEnabled: enabled } })),
      
      // 节拍器操作
      setMetronomeEnabled: (enabled) => set((state) => ({ metronome: { ...state.metronome, enabled } })),
      setMetronomeBpm: (bpm) => set((state) => ({ metronome: { ...state.metronome, bpm } })),
      setMetronomeSound: (sound) => set((state) => ({ metronome: { ...state.metronome, sound } })),
      setMetronomeFlash: (flash) => set((state) => ({ metronome: { ...state.metronome, flash } })),
      setMetronomeVisualize: (visualize) => set((state) => ({ metronome: { ...state.metronome, visualize } })),
      setMetronomeSettings: (settings) => set((state) => ({ metronome: { ...state.metronome, ...settings } })),
      
      // 反馈音操作
      setFeedbackSoundEnabled: (enabled) => set((state) => ({ feedbackSound: { ...state.feedbackSound, enabled } })),
      setCorrectSoundEnabled: (enabled) => set((state) => ({ feedbackSound: { ...state.feedbackSound, correctSound: enabled } })),
      setWrongSoundEnabled: (enabled) => set((state) => ({ feedbackSound: { ...state.feedbackSound, wrongSound: enabled } })),
      
      // 和弦符号设置操作
      setChordSymbolSettings: (settings) => set((state) => ({ chordSymbols: { ...state.chordSymbols, ...settings } })),
      
      // 音阶练习设置操作
      setScalePracticeSettings: (settings) => set((state) => ({ scalePractice: { ...state.scalePractice, ...settings } })),
      
      // 音程练习设置操作
      setIntervalPracticeSettings: (settings) => set((state) => ({ intervalPractice: { ...state.intervalPractice, ...settings } })),
      
      // 和弦进行练习设置操作
      setChordProgressionSettings: (settings) => set((state) => ({ chordProgression: { ...state.chordProgression, ...settings } })),
      
      // Focus模式操作
      setFocusModeEnabled: (enabled) => set((state) => ({ focusMode: { ...state.focusMode, enabled } })),
      setFocusModeSettings: (settings) => set((state) => ({ focusMode: { ...state.focusMode, ...settings } })),
      setFullscreenMode: (mode) => set((state) => ({ focusMode: { ...state.focusMode, fullscreenMode: mode } })),
      
      // 用户设置操作
      setInstrument: (instrument) => set((state) => ({ user: { ...state.user, instrument } })),
      setLanguage: (language) => set((state) => ({ user: { ...state.user, language } })),
      setTheme: (theme) => set((state) => ({ user: { ...state.user, theme } })),
      setChordScaleDisplay: (chordScaleDisplay) => set((state) => ({ user: { ...state.user, chordScaleDisplay } })),
      setNoteAccidentalDisplay: (noteAccidentalDisplay) => set((state) => ({ user: { ...state.user, noteAccidentalDisplay } })),
      setFretboardStyle: (fretboardStyle) => set((state) => ({ user: { ...state.user, fretboardStyle } })),
      setPianoKeyboardStyle: (pianoKeyboardStyle) => set((state) => ({ user: { ...state.user, pianoKeyboardStyle } })),
      setShowPracticeSuggestion: (show) => set((state) => ({ user: { ...state.user, showPracticeSuggestion: show } })),
      setCurrentPracticeSuggestion: (suggestion) => set({ currentPracticeSuggestion: suggestion }),
      
      // Premium操作
      setPremiumFeature: (feature, enabled) => set((state) => ({ premium: { ...state.premium, [feature]: enabled } })),
      
      // 自定义歌曲操作
      addCustomSong: (song) => set((state) => ({ customSongs: [...state.customSongs, song] })),
      updateCustomSong: (id, songUpdate) => set((state) => ({
        customSongs: state.customSongs.map(s => s.id === id ? { ...s, ...songUpdate, updatedAt: Date.now() } : s)
      })),
      deleteCustomSong: (id) => set((state) => ({ customSongs: state.customSongs.filter(s => s.id !== id) })),
      loadCustomSongs: (songs) => set({ customSongs: songs }),
      
      // 收藏操作
      toggleLevelFavorite: (id) => set((state) => {
        const isFav = state.favorites.levelFavorites.includes(id)
        return {
          favorites: {
            ...state.favorites,
            levelFavorites: isFav
              ? state.favorites.levelFavorites.filter(fId => fId !== id)
              : [...state.favorites.levelFavorites, id]
          }
        }
      }),
      toggleSongFavorite: (id) => set((state) => {
        const isFav = state.favorites.songFavorites.includes(id)
        return {
          favorites: {
            ...state.favorites,
            songFavorites: isFav
              ? state.favorites.songFavorites.filter(fId => fId !== id)
              : [...state.favorites.songFavorites, id]
          }
        }
      }),
      
      // 重置
      //
      // 🚨 「恢复**所有**设置」是 UI 对用户的承诺（`reset_settings_hint` 文案），
      //    所以凡是「用户在设置弹窗里能改、且被持久化」的顶层字段都必须回默认。
      //    此前只回 6 个 slice，漏掉了两个同样是顶层、同样可改、同样会被存下来的：
      //      - `displayScale`（显示缩放滑杆）
      //      - `chordSymbols`（和弦符号 m / m7b5 / 7b9 / Unicode 的显示偏好）
      //    用户在设置里改过这两个之后点「重置」，它们**静默保留** —— 宣称与行为不符。
      //
      // 有意**不**重置的（避免「重置设置」顺手清掉用户数据 / 练习进度）：
      //      - `premium` / `customSongs` / `favorites`：用户资产，不是设置
      //      - `scalePractice` / `intervalPractice` / `chordProgression`：
      //        练习进度与配置的混合体，重置设置不应抹掉进度（如需请另给「清空进度」入口）
      resetSettings: () => set({
        audio: initialState.audio,
        practice: initialState.practice,
        metronome: initialState.metronome,
        feedbackSound: initialState.feedbackSound,
        focusMode: initialState.focusMode,
        user: initialState.user,
        displayScale: initialState.displayScale,
        chordSymbols: initialState.chordSymbols,
      }),

    }),
    {
      name: 'fretmaster-store',
      version: 2,
      storage: createJSONStorage(() => debounceStorage(localStorage)),
      partialize: (state) => storePartialize(state),
      migrate: migratePersistedState,
    }
  )
)

// 选择器 Hooks（优化性能）
export const useAudioSettings = () => useAppStore((state) => state.audio)
export const usePracticeSettings = () => useAppStore((state) => state.practice)
export const useMetronomeSettings = () => useAppStore((state) => state.metronome)
export const useFeedbackSoundSettings = () => useAppStore((state) => state.feedbackSound)
export const useScore = () => useAppStore((state) => state.score)
export const useIsPlaying = () => useAppStore((state) => state.isPlaying)
export const useDisplayScale = () => useAppStore((state) => state.displayScale)
export const useUser = () => useAppStore((state) => state.user)
export const useFretboardStyle = () => useAppStore((state) => state.user.fretboardStyle)
export const usePianoKeyboardStyle = () => useAppStore((state) => state.user.pianoKeyboardStyle)
export const useChordSymbols = () => useAppStore((state) => state.chordSymbols)
