import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { VERSION } from './version'

// 练习类型
export type PracticeType = 'pitch_finding' | 'interval' | 'scale' | 'chord' | 'chord_progression'

// 练习统计
export interface PracticeStats {
  date: string
  count: number
  byType: Record<PracticeType, number>
  byDetail: Record<PracticeType, { name: string; count: number }[]>
}

// 音频设置
export interface AudioSettings {
  micEnabled: boolean
  inputGain: number
  confidenceThreshold: number
  sensitivity: number
  useAudioWorklet: boolean
  selectedAudioDevice: string
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
}

// 应用状态
export interface AppState {
  // UI 状态
  activeTab: string
  sidebarCollapsed: boolean
  settingsOpen: boolean
  fullscreenMode: boolean
  displayScale: number  // 显示缩放比例 (0.8 - 1.5)
  
  // 练习状态
  isPlaying: boolean
  score: { correct: number; total: number }
  
  // 音频状态
  audio: AudioSettings
  detectedPitch: string | null
  detectedCents: number | null
  
  // 练习设置
  practice: PracticeSettings
  
  // 节拍器
  metronome: MetronomeSettings
  
  // 统计数据
  practiceStats: PracticeStats[]
  
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
  setDetectedPitch: (pitch: string | null) => void
  setDetectedCents: (cents: number | null) => void
  
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
  
  // 统计操作
  addPracticeRecord: (type: PracticeType, detailName: string) => void
  loadPracticeStats: (stats: PracticeStats[]) => void
  
  // 重置
  resetSettings: () => void
}

// 初始状态
const initialState: AppState = {
  activeTab: 'practice',
  sidebarCollapsed: false,
  settingsOpen: false,
  fullscreenMode: false,
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
  
  practiceStats: [],
  
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
      toggleFullscreen: () => set((state) => ({ fullscreenMode: !state.fullscreenMode })),
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
      setDetectedPitch: (pitch) => set({ detectedPitch: pitch }),
      setDetectedCents: (cents) => set({ detectedCents: cents }),
      
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
      
      // 统计操作
      addPracticeRecord: (type, detailName) => set((state) => {
        const today = new Date().toISOString().split('T')[0]
        const existingDayIndex = state.practiceStats.findIndex(s => s.date === today)
        
        if (existingDayIndex >= 0) {
          const updatedStats = [...state.practiceStats]
          const dayStats = { ...updatedStats[existingDayIndex] }
          
          dayStats.count++
          dayStats.byType[type] = (dayStats.byType[type] || 0) + 1
          
          if (!dayStats.byDetail[type]) {
            dayStats.byDetail[type] = []
          }
          
          const detailIndex = dayStats.byDetail[type].findIndex(d => d.name === detailName)
          if (detailIndex >= 0) {
            dayStats.byDetail[type][detailIndex].count++
          } else {
            dayStats.byDetail[type].push({ name: detailName, count: 1 })
          }
          
          updatedStats[existingDayIndex] = dayStats
          return { practiceStats: updatedStats }
        } else {
          const newDay: PracticeStats = {
            date: today,
            count: 1,
            byType: { [type]: 1 } as Record<PracticeType, number>,
            byDetail: { [type]: [{ name: detailName, count: 1 }] } as Record<PracticeType, { name: string; count: number }[]>,
          }
          return { practiceStats: [newDay, ...state.practiceStats] }
        }
      }),
      
      loadPracticeStats: (stats) => set({ practiceStats: stats }),
      
      // 重置
      resetSettings: () => set({
        audio: initialState.audio,
        practice: initialState.practice,
        metronome: initialState.metronome,
      }),
    }),
    {
      name: 'fretmaster-store',
      partialize: (state) => ({
        displayScale: state.displayScale,
        audio: state.audio,
        practice: state.practice,
        metronome: state.metronome,
        practiceStats: state.practiceStats,
      }),
    }
  )
)

// 选择器 Hooks（优化性能）
export const useAudioSettings = () => useAppStore((state) => state.audio)
export const usePracticeSettings = () => useAppStore((state) => state.practice)
export const useMetronomeSettings = () => useAppStore((state) => state.metronome)
export const usePracticeStats = () => useAppStore((state) => state.practiceStats)
export const useScore = () => useAppStore((state) => state.score)
export const useIsPlaying = () => useAppStore((state) => state.isPlaying)
export const useVersion = () => useAppStore((state) => state.version)
export const useDisplayScale = () => useAppStore((state) => state.displayScale)
