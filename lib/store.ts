import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { VERSION } from './version'
import { InstrumentType } from './practice-suggestions'
import { CustomSong } from './custom-song-editor'
import { logger } from './logger'

function debounceStorage(storage: Storage): Storage {
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

export type ThemeMode = 'dark' | 'light'
export type ChordScaleDisplayMode = 'chinese' | 'english' | 'english_short' | 'jazz'

export interface UserSettings {
  instrument: InstrumentType
  language: 'zh-CN' | 'en'
  theme: ThemeMode
  chordScaleDisplay: ChordScaleDisplayMode
  showPracticeSuggestion: boolean
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
}

// 音程练习设置
export interface IntervalPracticeSettings {
  selectedIntervals: number[]
  rootMode: 'fixed' | 'random'
  rootNote: string
  findRootFirst: boolean
  addRootBack: boolean
  direction: 'up' | 'down' | 'random'
  randomizeOrder: boolean
  practiceDuration: number
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
  
  // 练习设置操作
  setPracticeTime: (time: number) => void
  setFretCount: (count: number) => void
  setAutoNextDelay: (delay: number) => void
  setCooldownEnabled: (enabled: boolean) => void
  setCooldownDuration: (duration: number) => void
  setReferenceFrequency: (freq: number) => void
  
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
  isLevelFavorite: (id: string) => boolean
  isSongFavorite: (id: string) => boolean
  
  // 重置
  resetSettings: () => void
}

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
    showPracticeSuggestion: true,
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

// 创建 Store
export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
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
      
      // 练习设置操作
      setPracticeTime: (time) => set((state) => ({ practice: { ...state.practice, practiceTime: time } })),
      setFretCount: (count) => set((state) => ({ practice: { ...state.practice, fretCount: count } })),
      setAutoNextDelay: (delay) => set((state) => ({ practice: { ...state.practice, autoNextDelay: delay } })),
      setCooldownEnabled: (enabled) => set((state) => ({ practice: { ...state.practice, cooldownEnabled: enabled } })),
      setCooldownDuration: (duration) => set((state) => ({ practice: { ...state.practice, cooldownDuration: duration } })),
      setReferenceFrequency: (freq) => set((state) => ({ practice: { ...state.practice, referenceFrequency: freq } })),
      
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
      isLevelFavorite: (id) => get().favorites.levelFavorites.includes(id),
      isSongFavorite: (id) => get().favorites.songFavorites.includes(id),
      
      // 重置
      resetSettings: () => set({
        audio: initialState.audio,
        practice: initialState.practice,
        metronome: initialState.metronome,
        feedbackSound: initialState.feedbackSound,
        focusMode: initialState.focusMode,
        user: initialState.user,
      }),
    }),
    {
      name: 'fretmaster-store',
      version: 1,
      storage: createJSONStorage(() => debounceStorage(localStorage)),
      partialize: (state) => ({
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
      }),
      migrate: (persistedState: any, version) => {
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
            if (persistedState.user.language === 'zh') {
              persistedState.user.language = 'zh-CN'
            }
            if (persistedState.user.theme === undefined) {
              persistedState.user.theme = 'dark'
            }
            if (persistedState.user.chordScaleDisplay === undefined) {
              persistedState.user.chordScaleDisplay = 'chinese'
            }
          }
          if (persistedState.fullscreenMode !== undefined) {
            persistedState.isFullscreen = persistedState.fullscreenMode
            delete persistedState.fullscreenMode
          }
          return persistedState
        } catch (error) {
          logger.error('Store migration failed, resetting to defaults:', error)
          return initialState
        }
      },
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
export const useVersion = () => useAppStore((state) => state.version)
export const useDisplayScale = () => useAppStore((state) => state.displayScale)
export const useFavorites = () => useAppStore((state) => state.favorites)
export const useLevelFavorites = () => useAppStore((state) => state.favorites.levelFavorites)
export const useSongFavorites = () => useAppStore((state) => state.favorites.songFavorites)
export const useUser = () => useAppStore((state) => state.user)
