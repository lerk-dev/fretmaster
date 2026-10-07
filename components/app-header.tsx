// 顶栏：品牌 · 得分/计时/检测音高 · 快捷键 · 调音器 · 设置抽屉（练习/节拍器/音频/显示/数据/帮助）
"use client"

import { memo } from 'react'
import { Guitar, Keyboard, Settings, Timer } from 'lucide-react'
import { Accordion } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ErrorBoundary } from '@/components/error-boundary'
import { TunerSheet } from '@/components/tuner-sheet'
import { SettingsDataSection, SettingsHelpSection } from '@/components/settings-data-help-sections'
import { SettingsMetronomeSection } from '@/components/settings-metronome-section'
import { SettingsPracticeSection } from '@/components/settings-practice-section'
import { SettingsAudioSection } from '@/components/settings-audio-section'
import { SettingsDisplaySection } from '@/components/settings-display-section'
import { VERSION, BUILD_DATE_LOCAL } from '@/lib/version'
import { cn } from '@/lib/utils'
import { InstrumentType } from '@/lib/practice-suggestions'
import { useAppStore, useScore, useIsPlaying, useAudioSettings, useMetronomeSettings, useFeedbackSoundSettings, usePracticeSettings, useUser, useChordSymbols, useDisplayScale } from '@/lib/store'

interface AppHeaderProps {
  /** 翻译函数 */
  t: (key: string) => string
  formatTime: (seconds: number) => string
  /** 剩余时间（秒） */
  timeLeft: number
  /** 客户端已挂载（避免 SSR 差异） */
  mounted: boolean
  /** 是否桌面版（Tauri） */
  isTauri: boolean
  /** 调音器：检测到的音名 */
  detectedNote: string
  /** 调音器：检测到的频率 */
  detectedFrequency: number
  /** 调音器：音分偏差 */
  cents: number
  /** 调音器是否在工作 */
  tunerActive: boolean
  /** 调音器面板是否打开 */
  tunerOpen: boolean
  onTunerOpenChange: (v: boolean) => void
  toggleTuner: () => void
  handleReferenceFrequencyChange: (v: number[]) => void
  /** 打开快捷键帮助 */
  onShowShortcutsHelpChange: (v: boolean) => void
  /** MIDI 输入开关 */
  midiEnabled: boolean
  onMidiEnabledChange: (v: boolean) => void
  /** 可用 MIDI 设备 */
  midiDevices: WebMidi.MIDIInput[]
  /** 已选 MIDI 设备 */
  selectedMidiDevice: string
  onSelectedMidiDeviceChange: (v: string) => void
  /** 使用 AudioWorklet 检测 */
  useAudioWorklet: boolean
  onUseAudioWorkletChange: (v: boolean) => void
  /** 环境噪声校准：已校准的环境噪声底（undefined = 从未校准，走 EMA 默认初值） */
  noiseFloor?: number
  /** 校准进行中（倒计时或采样阶段） */
  noiseCalibrating: boolean
  /** 倒计时剩余秒数；null = 不在倒计时阶段 */
  noiseCalibrationCountdown: number | null
  /** 采样进度（已采轮数）；null = 不在采样阶段 */
  noiseCalibrationProgress: number | null
  /** 触发一次环境噪声校准（3 秒倒计时 → 采样 1 秒） */
  onCalibrateNoiseFloor: () => void
  enumerateAudioDevices: (showNotification?: boolean) => Promise<void>
  stopAudioInput: () => void
  handlePracticeTimeChange: (v: number[]) => void
  handleFretCountChange: (v: number[]) => void
  handleCooldownDurationChange: (v: number[]) => void
  handleMetronomeBpmChange: (v: number[]) => void
  handleInputGainChange: (v: number[]) => void
  saveSettings: () => void
  resetSettings: () => void
  exportSettings: () => void
  importSettings: (file: File) => void
}

/**
 * 顶栏（从 app/page.tsx 原样搬出，行为不变）。
品牌区 · 得分/计时/检测音高状态 · 快捷键入口 · 调音器入口 · 设置抽屉（6 个设置分区 + 构建号）。

store 派生值由组件内同名局部变量自取（与页面里的 hook/selector 一致），页面本地 state 与回调走 props。
 */
export const AppHeader = memo(function AppHeader({
  t,
  formatTime,
  timeLeft,
  mounted,
  isTauri,
  detectedNote,
  detectedFrequency,
  cents,
  tunerActive,
  tunerOpen,
  onTunerOpenChange,
  toggleTuner,
  handleReferenceFrequencyChange,
  onShowShortcutsHelpChange,
  midiEnabled,
  onMidiEnabledChange,
  midiDevices,
  selectedMidiDevice,
  onSelectedMidiDeviceChange,
  useAudioWorklet,
  onUseAudioWorkletChange,
  noiseFloor,
  noiseCalibrating,
  noiseCalibrationCountdown,
  noiseCalibrationProgress,
  onCalibrateNoiseFloor,
  enumerateAudioDevices,
  stopAudioInput,
  handlePracticeTimeChange,
  handleFretCountChange,
  handleCooldownDurationChange,
  handleMetronomeBpmChange,
  handleInputGainChange,
  saveSettings,
  resetSettings,
  exportSettings,
  importSettings,
}: AppHeaderProps) {
// store 派生值：与页面用同一套 hook / selector，正文里的名字保持不变
  const store = useAppStore.getState()
  const score = useScore()
  const isPlaying = useIsPlaying()
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const focusMode = useAppStore((s) => s.focusMode)
  const detectedPitch = useAppStore((s) => s.detectedPitch)
  const detectedCents = useAppStore((s) => s.detectedCents)
  const audioDevice = useAppStore((s) => s.audioDevice)
  const audioSettings = useAudioSettings()
  const metronomeSettings = useMetronomeSettings()
  const feedbackSoundSettings = useFeedbackSoundSettings()
  const practiceSettings = usePracticeSettings()
  const user = useUser()
  const chordSymbols = useChordSymbols()
  const displayScale = useDisplayScale()

  const language = user.language
  const audioDevices = audioDevice.devices
  const audioInitializing = audioDevice.initializing
  const audioError = audioDevice.error
  const inputGain = audioSettings.inputGain
  const micEnabled = audioSettings.micEnabled
  const selectedAudioDevice = audioSettings.selectedAudioDevice
  const metronomeEnabled = metronomeSettings.enabled
  const metronomeBpm = metronomeSettings.bpm
  const metronomeSound = metronomeSettings.sound
  const metronomeFlash = metronomeSettings.flash
  const theme = user.theme
  const chordScaleDisplay = user.chordScaleDisplay
  const noteAccidentalDisplay = user.noteAccidentalDisplay
  const practiceTime = practiceSettings.practiceTime
  const fretCount = practiceSettings.fretCount
  const cooldownEnabled = practiceSettings.cooldownEnabled
  const cooldownDuration = practiceSettings.cooldownDuration
  const fretZoneEnabled = practiceSettings.fretZoneEnabled
  const fretZoneStart = practiceSettings.fretZoneStart
  const fretZoneSize = practiceSettings.fretZoneSize
  const octaveShiftEnabled = practiceSettings.octaveShiftEnabled
  const octaveShiftMode = practiceSettings.octaveShiftMode
  const weaknessWeightedEnabled = practiceSettings.weaknessWeightedEnabled
  const referenceFrequency = practiceSettings.referenceFrequency

  // store action 简写（页面里是 const setXxx = store.setXxx）
  const setLanguage = store.setLanguage
  const setTheme = store.setTheme
  const setChordScaleDisplay = store.setChordScaleDisplay
  const setNoteAccidentalDisplay = store.setNoteAccidentalDisplay
  const setFretboardStyle = store.setFretboardStyle
  const setPianoKeyboardStyle = store.setPianoKeyboardStyle
  const setSettingsOpen = store.setSettingsOpen
  const setDisplayScale = store.setDisplayScale
  const setFretZoneEnabled = store.setFretZoneEnabled
  const setFretZoneStart = store.setFretZoneStart
  const setFretZoneSize = store.setFretZoneSize
  const setOctaveShiftEnabled = store.setOctaveShiftEnabled
  const setOctaveShiftMode = store.setOctaveShiftMode
  const setWeaknessWeightedEnabled = store.setWeaknessWeightedEnabled
  const setMetronomeEnabled = store.setMetronomeEnabled
  const setMetronomeSound = store.setMetronomeSound
  const setMetronomeFlash = store.setMetronomeFlash
  const setCooldownEnabled = store.setCooldownEnabled
  const setMicEnabled = store.setMicEnabled
  const setSelectedAudioDevice = store.setSelectedAudioDevice

  return (
<header className="border-b border-border/50 bg-card sticky top-0 z-50 shadow-sm">
  <div className="container mx-auto px-4 h-14 flex items-center justify-between">
    {/* 左：logo + 标题。窄屏（≈360px）练习中时右组（得分/计时/三个按钮）约 250px，
        标题块必须能收缩，否则**整组控件被挤出屏幕右缘**（真机实测：设置按钮落在 x=370→402，
        父级 `overflow-hidden` 直接裁掉 ⇒ 练习中根本点不到设置）。
        `min-w-0` + `truncate` 让它优雅退让，而不是把别人挤出去。 */}
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Guitar className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0">
        <h1 className="text-base font-semibold text-foreground truncate">FretMaster</h1>
        <p className="text-2xs text-muted-foreground truncate">{t('app_title').replace('🎸 ', '')}</p>
      </div>
    </div>
    
    {/* 右：窄屏收紧间距（gap-1.5 = 6px vs 桌面 12px），把省下的 24px 留给设置按钮 */}
    <div className="flex items-center gap-1.5 sm:gap-3">
      {/* Score display */}
      {isPlaying && (
        <div className="flex items-center gap-2" role="status" aria-live="polite" aria-label={t('score_aria_label').replace('{correct}', String(score.correct)).replace('{total}', String(score.total))}>
          <Badge variant="outline" className="font-mono tabular-nums text-xs">
            {score.correct}/{score.total}
          </Badge>
          {score.total > 0 && (
            <Badge variant={score.correct / score.total >= 0.7 ? "default" : "secondary"} className="tabular-nums text-xs">
              {Math.round((score.correct / score.total) * 100)}%
            </Badge>
          )}
        </div>
      )}

      {/* Timer */}
      {isPlaying && practiceTime > 0 && (
        <Badge variant="outline" className="font-mono tabular-nums gap-1 text-xs" role="status" aria-live="off" aria-label={t('time_left_aria_label').replace('{time}', formatTime(timeLeft))}>
          <Timer className="h-3 w-3" />
          {formatTime(timeLeft)}
        </Badge>
      )}

      {/* Detected Pitch */}
      {detectedPitch && (
        <div className="flex items-center gap-2" role="status" aria-live="polite">
          <Badge variant="outline" className="font-mono text-xs bg-primary/10">
            {detectedPitch}
          </Badge>
          {detectedCents !== null && (
            <Badge
              variant="outline"
              className={cn(
                "font-mono tabular-nums text-xs",
                detectedCents <= 15 ? "bg-green-500/20 text-green-400" :
                detectedCents <= 35 ? "bg-amber-500/20 text-amber-400" :
                "bg-red-500/20 text-red-400"
              )}
            >
              {detectedCents < 0 ? '' : '+'}{detectedCents.toFixed(0)}¢
            </Badge>
          )}
        </div>
      )}
      
      {/* Keyboard Shortcuts Button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        onClick={() => onShowShortcutsHelpChange(true)}
        title={t('keyboard_shortcuts')}
        aria-label={t('keyboard_shortcuts')}
      >
        <Keyboard className="h-4 w-4" />
      </Button>

      {/* Tuner */}
      <TunerSheet
        open={tunerOpen}
        onOpenChange={onTunerOpenChange}
        detectedNote={detectedNote}
        detectedFrequency={detectedFrequency}
        cents={cents}
        tunerActive={tunerActive}
        onToggleTuner={toggleTuner}
        referenceFrequency={referenceFrequency}
        onReferenceFrequencyChange={handleReferenceFrequencyChange}
        t={t}
      />

      {/* Settings */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetTrigger asChild>
          <div data-onboarding="settings">
            <Button variant="ghost" size="icon" className="h-8 w-8" title={t('nav_settings')} aria-label={t('nav_settings')}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </SheetTrigger>
        <SheetContent className="w-80 overflow-y-auto">
          <SheetHeader className="px-4">
            <SheetTitle>{t('nav_settings')}</SheetTitle>
          </SheetHeader>
          
          <ErrorBoundary>
          <Accordion type="multiple" defaultValue={["practice","audio","display","data"]} className="py-4 px-4">
            <SettingsPracticeSection
              t={t}
              language={language}
              instrument={user.instrument}
              onInstrumentChange={(v) => store.setInstrument(v as InstrumentType)}
              practiceTime={practiceTime}
              onPracticeTimeChange={handlePracticeTimeChange}
              fretCount={fretCount}
              onFretCountChange={handleFretCountChange}
              cooldownEnabled={cooldownEnabled}
              onCooldownEnabledChange={setCooldownEnabled}
              cooldownDuration={cooldownDuration}
              onCooldownDurationChange={handleCooldownDurationChange}
              fretZoneEnabled={fretZoneEnabled}
              onFretZoneEnabledChange={setFretZoneEnabled}
              fretZoneStart={fretZoneStart}
              onFretZoneStartChange={(v) => setFretZoneStart(v)}
              fretZoneSize={fretZoneSize}
              onFretZoneSizeChange={(v) => setFretZoneSize(v)}
              octaveShiftEnabled={octaveShiftEnabled}
              onOctaveShiftEnabledChange={setOctaveShiftEnabled}
              octaveShiftMode={octaveShiftMode}
              onOctaveShiftModeChange={setOctaveShiftMode}
              weaknessWeightedEnabled={weaknessWeightedEnabled}
              onWeaknessWeightedEnabledChange={setWeaknessWeightedEnabled}
            />
            
            <SettingsMetronomeSection
              t={t}
              enabled={metronomeEnabled}
              onEnabledChange={setMetronomeEnabled}
              bpm={metronomeBpm}
              onBpmChange={handleMetronomeBpmChange}
              sound={metronomeSound}
              onSoundChange={setMetronomeSound}
              flash={metronomeFlash}
              onFlashChange={setMetronomeFlash}
              visualize={metronomeSettings.visualize ?? false}
              onVisualizeChange={(v) => store.setMetronomeSettings({ ...metronomeSettings, visualize: v })}
            />
            
            <SettingsAudioSection
              t={t}
              language={language}
              feedbackSoundEnabled={feedbackSoundSettings.enabled}
              onFeedbackSoundEnabledChange={store.setFeedbackSoundEnabled}
              correctSound={feedbackSoundSettings.correctSound}
              onCorrectSoundChange={store.setCorrectSoundEnabled}
              wrongSound={feedbackSoundSettings.wrongSound}
              onWrongSoundChange={store.setWrongSoundEnabled}
              mounted={mounted}
              isTauri={isTauri}
              audioDevices={audioDevices}
              selectedAudioDevice={selectedAudioDevice}
              onSelectedAudioDeviceChange={setSelectedAudioDevice}
              onRefreshAudioDevices={enumerateAudioDevices}
              micEnabled={micEnabled}
              onMicToggle={(checked) => {
                if (checked) {
                  // 直接启动音频输入，不通过 useEffect
                  setMicEnabled(true)
                } else {
                  setMicEnabled(false)
                  stopAudioInput()
                }
              }}
              audioInitializing={audioInitializing}
              audioError={audioError}
              useAudioWorklet={useAudioWorklet}
              onUseAudioWorkletChange={onUseAudioWorkletChange}
              noiseFloor={noiseFloor}
              noiseCalibrating={noiseCalibrating}
              noiseCalibrationCountdown={noiseCalibrationCountdown}
              noiseCalibrationProgress={noiseCalibrationProgress}
              onCalibrateNoiseFloor={onCalibrateNoiseFloor}
              inputGain={inputGain}
              onInputGainChange={handleInputGainChange}
              pitchAlgorithm={audioSettings.pitchAlgorithm}
              onPitchAlgorithmChange={(v) => store.setPitchAlgorithm(v)}
              confidenceThreshold={audioSettings.confidenceThreshold}
              onConfidenceThresholdChange={store.setConfidenceThreshold}
              midiEnabled={midiEnabled}
              onMidiEnabledChange={onMidiEnabledChange}
              midiDevices={midiDevices}
              selectedMidiDevice={selectedMidiDevice}
              onSelectedMidiDeviceChange={onSelectedMidiDeviceChange}
            />
            
            <SettingsDisplaySection
              t={t}
              language={language}
              fullscreenMode={focusMode?.fullscreenMode}
              onFullscreenModeChange={(v) => store.setFullscreenMode(v)}
              onSelectLanguage={(lang) => {
                setLanguage(lang)
                setChordScaleDisplay(lang === 'zh-CN' ? 'chinese' : 'english')
              }}
              theme={theme}
              onThemeChange={setTheme}
              displayScale={displayScale}
              onDisplayScaleChange={setDisplayScale}
              chordScaleDisplay={chordScaleDisplay}
              onChordScaleDisplayChange={setChordScaleDisplay}
              noteAccidentalDisplay={noteAccidentalDisplay}
              onNoteAccidentalDisplayChange={setNoteAccidentalDisplay}
              fretboardStyle={user.fretboardStyle}
              onFretboardStyleChange={setFretboardStyle}
              pianoKeyboardStyle={user.pianoKeyboardStyle}
              onPianoKeyboardStyleChange={setPianoKeyboardStyle}
              chordSymbols={chordSymbols}
              onChordSymbolChange={store.setChordSymbolSettings}
            />
            
            <SettingsDataSection
              t={t}
              onSave={saveSettings}
              onReset={resetSettings}
              onExport={exportSettings}
              onImport={importSettings}
            />

            <SettingsHelpSection t={t} language={language} />

            <div className="pt-2 border-t border-border/30">
              <div className="flex items-center justify-between text-xs text-muted-foreground/50">
                <span>Build</span>
                <span className="font-mono">v{VERSION} ({BUILD_DATE_LOCAL})</span>
              </div>
            </div>
          </Accordion>
          </ErrorBoundary>
        </SheetContent>
      </Sheet>
    </div>
  </div>
</header>
  )
})
