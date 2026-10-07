'use client'

// 设置面板的「音频与输入」折叠段（从 app/page.tsx 抽出，内容未改动）
// 含：反馈音效 / 音频输入设备（Web 与 Tauri 两条分支）/ MIDI

import { Mic, Piano, Volume2 } from 'lucide-react'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { WindowsAudioSettings } from '@/components/windows-audio-settings'
import { formatNoisePercent, onsetGateFromNoiseFloor, CALIBRATION_SAMPLE_ROUNDS } from '@/lib/noise-calibration'

interface SettingsAudioSectionProps {
  t: (key: string) => string
  language: string
  /** 反馈音效 */
  feedbackSoundEnabled: boolean
  onFeedbackSoundEnabledChange: (v: boolean) => void
  correctSound: boolean
  onCorrectSoundChange: (v: boolean) => void
  wrongSound: boolean
  onWrongSoundChange: (v: boolean) => void
  /** 是否已完成客户端挂载（避免 SSR 不一致） */
  mounted: boolean
  /** 是否运行在 Tauri 桌面端 */
  isTauri: boolean
  /** 音频输入设备 */
  audioDevices: MediaDeviceInfo[]
  selectedAudioDevice: string
  onSelectedAudioDeviceChange: (v: string) => void
  /** 重新枚举音频设备（权限授予后调用） */
  onRefreshAudioDevices: (showNotification?: boolean) => Promise<void>
  micEnabled: boolean
  /** 麦克风开关：开启即启动，关闭需同时停止输入 */
  onMicToggle: (checked: boolean) => void
  audioInitializing: boolean
  audioError: string | null
  useAudioWorklet: boolean
  onUseAudioWorkletChange: (v: boolean) => void
  inputGain: number
  /** Slider 回传百分比数组 */
  onInputGainChange: (v: number[]) => void
  pitchAlgorithm: 'standard' | 'solo'
  onPitchAlgorithmChange: (v: 'standard' | 'solo') => void
  /** 识别置信度阈值（0.5~0.95）：页面侧「显示 + 练习匹配」共用的门槛 */
  confidenceThreshold: number
  onConfidenceThresholdChange: (v: number) => void
  /** 环境噪声校准：已校准的环境噪声底（undefined = 从未校准过） */
  noiseFloor?: number
  /** 校准进行中（倒计时或采样阶段） */
  noiseCalibrating: boolean
  /** 倒计时剩余秒数；null = 不在倒计时阶段 */
  noiseCalibrationCountdown: number | null
  /** 采样进度（已采轮数）；null = 不在采样阶段 */
  noiseCalibrationProgress: number | null
  onCalibrateNoiseFloor: () => void
  /** MIDI */
  midiEnabled: boolean
  onMidiEnabledChange: (v: boolean) => void
  midiDevices: WebMidi.MIDIInput[]
  selectedMidiDevice: string
  onSelectedMidiDeviceChange: (v: string) => void
}

export function SettingsAudioSection({
  t,
  language,
  feedbackSoundEnabled,
  onFeedbackSoundEnabledChange,
  correctSound,
  onCorrectSoundChange,
  wrongSound,
  onWrongSoundChange,
  mounted,
  isTauri,
  audioDevices,
  selectedAudioDevice,
  onSelectedAudioDeviceChange,
  onRefreshAudioDevices,
  micEnabled,
  onMicToggle,
  audioInitializing,
  audioError,
  useAudioWorklet,
  onUseAudioWorkletChange,
  inputGain,
  onInputGainChange,
  pitchAlgorithm,
  onPitchAlgorithmChange,
  confidenceThreshold,
  onConfidenceThresholdChange,
  noiseFloor,
  noiseCalibrating,
  noiseCalibrationCountdown,
  noiseCalibrationProgress,
  onCalibrateNoiseFloor,
  midiEnabled,
  onMidiEnabledChange,
  midiDevices,
  selectedMidiDevice,
  onSelectedMidiDeviceChange,
}: SettingsAudioSectionProps) {
  // 校准状态行：倒计时 → 采样 → 平时提示。这段文字一直在变，挂 aria-live 让读屏用户也跟得上。
  // 优先级固定：倒计时 > 采样进度 > 「请先开麦克风」> 一般说明。
  const calibrationStatus = noiseCalibrationCountdown !== null
    ? t('noise_calib_countdown').replace('{seconds}', String(noiseCalibrationCountdown))
    : noiseCalibrationProgress !== null
      ? t('noise_calib_sampling')
          .replace('{done}', String(noiseCalibrationProgress))
          .replace('{total}', String(CALIBRATION_SAMPLE_ROUNDS))
      : !micEnabled
        ? t('noise_calib_need_mic')
        : t('noise_calib_hint')

  return (
    <AccordionItem value="audio" className="border-b-0">
      <AccordionTrigger className="py-2 text-sm font-medium flex items-center gap-2 hover:no-underline">
        <span className="flex items-center gap-2">
          <Volume2 className="h-4 w-4" />
          {language === 'zh-CN' ? '音频与输入' : 'Audio & Input'}
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-3 pb-2">
    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
      <Volume2 className="h-3.5 w-3.5" />
      {t('feedback_sound')}
    </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{t('feedback_sound_enabled')}</span>
        <Switch checked={feedbackSoundEnabled} onCheckedChange={onFeedbackSoundEnabledChange} />
      </div>
      {feedbackSoundEnabled && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('correct_sound')}</span>
            <Switch checked={correctSound} onCheckedChange={onCorrectSoundChange} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('wrong_sound')}</span>
            <Switch checked={wrongSound} onCheckedChange={onWrongSoundChange} />
          </div>
        </>
      )}
    
    <Separator className="my-1" />
    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
      <Mic className="h-3.5 w-3.5" />
      {t('device_audio_input')}
    </div>
    
    {!mounted ? (
      <div className="space-y-2">
        <div className="h-20 animate-pulse bg-muted rounded-lg" />
      </div>
    ) : isTauri ? (
      <WindowsAudioSettings language={language as 'zh-CN' | 'en'} />
    ) : (
      <div className="space-y-2">
        
        {/* 权限请求提示 - 当没有设备或设备没有标签时显示 */}
        {(audioDevices.length === 0 || audioDevices.every(d => !d.label)) && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-600 dark:text-yellow-400">
            <p className="mb-2">{audioDevices.length === 0 ? t('mic_permission_needed_for_device') : t('mic_permission_needed_for_label')}</p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={async () => {
                try {
                  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
                    toast.error(t('browser_not_support_audio'))
                    return
                  }
                  toast.info(t('requesting_mic_permission'))
                  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                  stream.getTracks().forEach(track => track.stop())
                  // 刷新设备列表
                  await onRefreshAudioDevices(false)
                  // 检查是否成功获取设备
                  const devices = await navigator.mediaDevices.enumerateDevices()
                  const audioInputs = devices.filter(d => d.kind === 'audioinput')
                  if (audioInputs.length > 0 && audioInputs.some(d => d.label)) {
                    toast.success(t('mic_granted_with_label'))
                  } else if (audioInputs.length > 0) {
                    toast.warning(t('mic_granted_no_label'))
                  } else {
                    toast.warning(t('mic_no_input_device'))
                  }
                } catch (err: unknown) {
                  console.error('麦克风权限错误', err)
                  const error = err instanceof Error ? err : new Error(String(err))
                  if (error.name === 'NotAllowedError') {
                    toast.error(t('mic_permission_denied'))
                  } else if (error.name === 'NotFoundError') {
                    toast.error(t('mic_not_found'))
                  } else {
                    toast.error(`${t('mic_generic_error')} ${error.message || ''}`)
                  }
                }
              }}
            >
              {t('request_mic_permission')}
            </Button>
          </div>
        )}
        
        <Select value={selectedAudioDevice} onValueChange={onSelectedAudioDeviceChange}>
          <SelectTrigger>
            <SelectValue placeholder={t('hint_select_device')} />
          </SelectTrigger>
          <SelectContent>
            {audioDevices.map(device => (
              <SelectItem key={device.deviceId} value={device.deviceId}>
                {device.label || `Device ${device.deviceId.slice(0, 8)}...`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm text-muted-foreground">{t('device_audio_input')}</span>
            {micEnabled && (
              <span className="text-xs text-green-600 dark:text-green-500">
                {useAudioWorklet ? 'AudioWorklet' : 'ScriptProcessor'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {audioInitializing && (
              <span className="text-xs text-muted-foreground animate-pulse">
                {language === 'zh-CN' ? '初始化中...' : 'Initializing...'}
              </span>
            )}
            <Switch 
              checked={micEnabled} 
              disabled={audioInitializing}
              onCheckedChange={onMicToggle} 
            />
          </div>
        </div>
        {audioError && (
          <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
            {audioError}
          </div>
        )}
        <div className="flex items-center justify-between py-2 border-t border-border/50">
          <div className="flex flex-col">
            <span className="text-sm text-muted-foreground">
              {language === 'zh-CN' ? '使用 AudioWorklet' : 'Use AudioWorklet'}
            </span>
            <span className="text-xs text-muted-foreground/60">
              {language === 'zh-CN' ? '关闭则使用 ScriptProcessorNode' : 'Off to use ScriptProcessorNode'}
            </span>
          </div>
          <Switch
            checked={useAudioWorklet}
            disabled={micEnabled}
            onCheckedChange={(checked) => {
              onUseAudioWorkletChange(checked)
              logger.debug(`[音频模式] 切换为 ${checked ? 'AudioWorklet' : 'ScriptProcessorNode'}`)
            }}
          />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('device_gain')}</span>
            <span className="font-mono">{Math.round(inputGain * 100)}%</span>
          </div>
          <Slider
            value={[inputGain * 100]}
            onValueChange={onInputGainChange}
            min={0}
            max={200}
            step={10}
            disabled={!micEnabled}
          />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('device_pitch_algorithm')}</span>
          </div>
          <Select 
            value={pitchAlgorithm} 
            onValueChange={(value) => onPitchAlgorithmChange(value as 'standard' | 'solo')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="solo">{t('algorithm_solo')}</SelectItem>
              <SelectItem value="standard">{t('algorithm_standard')}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {language === 'zh-CN' 
              ? 'SOLO算法使用FFT加速，检测速度更快' 
              : 'SOLO algorithm uses FFT acceleration for faster detection'}
          </p>
        </div>
        {/* 识别置信度阈值：页面侧 `probability > confidenceThreshold` 同时管着「顶栏显示」
            与「练习匹配」两道关口（默认 0.8），此前只能在代码里改。 */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('device_confidence_threshold')}</span>
            <span className="font-mono">{confidenceThreshold.toFixed(2)}</span>
          </div>
          <Slider
            value={[Math.round(confidenceThreshold * 100)]}
            onValueChange={([v]) => onConfidenceThresholdChange(v / 100)}
            min={50}
            max={95}
            step={5}
          />
          <p className="text-xs text-muted-foreground">
            {language === 'zh-CN'
              ? '越低越容易识别（轻弹更易触发），误判也会变多'
              : 'Lower = easier to trigger (soft picking), higher = stricter'}
          </p>
        </div>
        {/* 环境噪声校准：主动量一次房间底噪，测量口径见 lib/noise-calibration.ts。
            量出的值作为 worklet/TS 噪声底的起点，避免换到嘈杂房间后的头十几秒门限偏低而误检。
            只出现在 Web 分支：桌面版走 Rust cpal，Web Audio 的 analyser 不在采集链路上。 */}
        <div className="space-y-2 rounded-lg border border-border/50 p-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('device_noise_calibration')}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {noiseFloor !== undefined ? formatNoisePercent(noiseFloor) : t('noise_calib_never')}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={!micEnabled || noiseCalibrating}
            onClick={onCalibrateNoiseFloor}
          >
            {noiseCalibrating ? t('noise_calib_running') : t('noise_calib_start')}
          </Button>
          <p className="text-xs text-muted-foreground min-h-4" role="status" aria-live="polite">
            {calibrationStatus}
          </p>
          {noiseFloor !== undefined && (
            <p className="text-xs text-muted-foreground/60">
              {t('noise_calib_gate').replace('{gate}', formatNoisePercent(onsetGateFromNoiseFloor(noiseFloor)))}
            </p>
          )}
        </div>
      </div>
    )}
    
    <Separator className="my-1" />
    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
      <Piano className="h-3.5 w-3.5" />
      {t('midi_support')}
    </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{t('midi_enable')}</span>
        <Switch checked={midiEnabled} onCheckedChange={onMidiEnabledChange} />
      </div>
      <Select value={selectedMidiDevice} onValueChange={onSelectedMidiDeviceChange} disabled={!midiEnabled}>
        <SelectTrigger>
          <SelectValue placeholder={t('midi_select_device')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="random">{t('random')}</SelectItem>
          {midiDevices.map(device => (
            <SelectItem key={device.id} value={device.id}>
              {device.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {midiDevices.length > 0 
          ? t('midi_device_detected').replace('{count}', String(midiDevices.length))
          : t('midi_device_none')
        }
      </p>
      </AccordionContent>
    </AccordionItem>
  )
}
