'use client'

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { Activity, Zap, Filter } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/lib/store'
import { getEffectiveAudioSettings } from '@/lib/audio-settings-effective'
import { nativeAudio, type AudioDeviceInfo, type PitchResult, type DeviceChangeEvent } from '@/lib/native-audio'
import { toast } from 'sonner'

interface WindowsAudioSettingsProps {
  language: 'zh-CN' | 'en'
}

export const WindowsAudioSettings = memo(function WindowsAudioSettings({ language }: WindowsAudioSettingsProps) {
  // 🚨 P3-10：改为精确订阅 —— 原来 `useAppStore()` 全量订阅让本组件跟着整个 store 重渲染
  //    （练习中 20Hz 的音高 state 更新会把这一整块设置面板连同 9 个 Setter 一起重算）。
  //    `audio` 由 store 在写入时整体换引用，精确订阅它即可。
  const audioSettingsRaw = useAppStore((s) => s.audio)
  const audioSettings = audioSettingsRaw || {}
  const setMicUserPreference = useAppStore((s) => s.setMicUserPreference)
  const setSelectedAudioDevice = useAppStore((s) => s.setSelectedAudioDevice)
  const setAudioBackend = useAppStore((s) => s.setAudioBackend)
  const setBufferSize = useAppStore((s) => s.setBufferSize)
  const setSampleRate = useAppStore((s) => s.setSampleRate)
  const setNoiseSuppression = useAppStore((s) => s.setNoiseSuppression)
  const setEnableHighPass = useAppStore((s) => s.setEnableHighPass)
  const setEnableLowPass = useAppStore((s) => s.setEnableLowPass)
  const setEnableNotch50 = useAppStore((s) => s.setEnableNotch50)
  const setEnableNotch60 = useAppStore((s) => s.setEnableNotch60)
  const setInputGain = useAppStore((s) => s.setInputGain)
  // 音频设置的「有效值」（旧持久化缺字段时兜底）—— 显示与推送共用，唯一真相源
  const eff = getEffectiveAudioSettings(audioSettingsRaw)
  
  const [devices, setDevices] = useState<AudioDeviceInfo[]>([])
  const [lastPitch, setLastPitch] = useState<PitchResult | null>(null)
  const [latency, setLatency] = useState(0)
  const [isInitializing, setIsInitializing] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  // 实际生效的后端（可能因设备不支持而回退，与用户所选不同）
  const [activeBackend, setActiveBackend] = useState<string>('')
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  // P3-9：`isCapturing` / `isInitializing` 都是 **state**，在 `await` 期间不会更新
  // （闭包捕获旧值）⇒ 纯靠它们做守卫挡不住「双击/连点」。必须再加一个**同步**互斥 ref，
  // 置位于首个 await 之前、在 finally 释放，封住异步窗口内的重入。
  const startingRef = useRef(false)
  // 使用 store 中的 micEnabled 作为音频启用状态，避免组件卸载后状态丢失
  const isCapturing = audioSettings.micEnabled
  
  const t = useCallback((key: string) => {
    const translations: Record<string, Record<string, string>> = {
      'zh-CN': {
        'audio_device': '音频输入设备',
        'buffer_size': '缓冲区大小',
        'sample_rate': '采样率',
        'noise_suppression': '噪音抑制',
        'high_pass_filter': '高通滤波',
        'low_pass_filter': '低通滤波',
        'notch_50hz': '50Hz 陷波',
        'notch_60hz': '60Hz 陷波',
        'enable_audio': '启用音频输入',
        'latency': '延迟',
        'detected_note': '检测到的音符',
        'confidence': '置信度',
        'volume': '音量',
        'refresh_devices': '刷新设备',
        'small_buffer': '小 (低延迟)',
        'medium_buffer': '中 (平衡)',
        'large_buffer': '大 (稳定)',
        'audio_active': '音频输入已启用',
        'audio_inactive': '音频输入已停止',
        'no_device': '未选择设备',
        'audio_backend': '音频后端',
        'backend_shared': 'WASAPI 共享 (兼容)',
        'backend_exclusive': 'WASAPI 独占 (低延迟)',
        'backend_asio': 'ASIO (最低延迟)',
      },
      'en': {
        'audio_device': 'Audio Input Device',
        'buffer_size': 'Buffer Size',
        'sample_rate': 'Sample Rate',
        'noise_suppression': 'Noise Suppression',
        'high_pass_filter': 'High Pass Filter',
        'low_pass_filter': 'Low Pass Filter',
        'notch_50hz': '50Hz Notch',
        'notch_60hz': '60Hz Notch',
        'enable_audio': 'Enable Audio Input',
        'latency': 'Latency',
        'detected_note': 'Detected Note',
        'confidence': 'Confidence',
        'volume': 'Volume',
        'refresh_devices': 'Refresh Devices',
        'small_buffer': 'Small (Low Latency)',
        'medium_buffer': 'Medium (Balanced)',
        'large_buffer': 'Large (Stable)',
        'audio_active': 'Audio Input Active',
        'audio_inactive': 'Audio Input Stopped',
        'no_device': 'No device selected',
        'audio_backend': 'Audio Backend',
        'backend_shared': 'WASAPI Shared (Compatible)',
        'backend_exclusive': 'WASAPI Exclusive (Low Latency)',
        'backend_asio': 'ASIO (Lowest Latency)',
      }
    }
    return translations[language]?.[key] || key
  }, [language])
  
  // 加载设备列表
  // 注意：不依赖 store（Zustand store 引用是稳定的），避免 store 变化导致 useEffect 重复执行引发竞态
  const loadDevices = useCallback(async () => {
    try {
      const deviceList = await nativeAudio.getAudioDevices()
      setDevices(deviceList)
      const currentSelected = useAppStore.getState().audio?.selectedAudioDevice
      if (!currentSelected && deviceList.length > 0) {
        const defaultDevice = deviceList.find(d => d.isDefault) || deviceList[0]
        useAppStore.getState().setSelectedAudioDevice(defaultDevice.name)
      }
    } catch (error) {
      console.error('Failed to load audio devices:', error)
      toast.error(language === 'zh-CN' ? '加载音频设备失败' : 'Failed to load audio devices')
    }
  }, [language])

  useEffect(() => {
    try {
      loadDevices()
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err))
      console.error('[WindowsAudioSettings] Init error:', error.message)
      setInitError(error.message)
    }
  }, [loadDevices])
  
  // 清理定时器
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [])
  
  // 启动音频捕获
  const startAudio = useCallback(async () => {
    // P3-9：同步互斥必须在**首个 await 之前**（state 守卫在 await 窗口内是失效的）
    if (startingRef.current) return
    if (isCapturing || isInitializing) return
    
    // 检查是否选择了设备
    if (!audioSettings.selectedAudioDevice) {
      toast.error(language === 'zh-CN' ? '请先选择音频设备' : 'Please select an audio device first')
      return
    }
    
    startingRef.current = true
    setIsInitializing(true)
    try {
      await nativeAudio.startAudioCaptureWithBackend(
        audioSettings.selectedAudioDevice,
        audioSettings.sampleRate || 48000,
        audioSettings.audioBackend || 'wasapi_shared'
      )
      // 用户显式开：同步落偏好（micUserDisabled=false），桌面端重启后据此恢复采集
      setMicUserPreference(true)
      toast.success(t('audio_active'))

      // 读取实际生效的后端：独占/ASIO 失败时后端会自动回退，这里让用户看得见
      try {
        const status = await nativeAudio.getAudioStatus()
        setActiveBackend(status.backend)
      } catch { /* 忽略：仅用于显示 */ }
      
      // 开始检测音高
      // 这里不再做「先清旧句柄」的防御：`stopAudio` 已同步清 interval，且上面的
      // 同步互斥封住了重入 ⇒ 旧句柄不可能存活（铁律 14：同一量不做两份判定）。
      intervalRef.current = setInterval(async () => {
        try {
          const pitch = await nativeAudio.detectPitch()
          if (pitch) {
            setLastPitch(pitch)
          }
          const lat = await nativeAudio.getLatencyMs()
          setLatency(lat)
        } catch (error) {
          console.error('Pitch detection error:', error)
        }
      }, 50)
    } catch (error) {
      console.error('Failed to start audio:', error)
      toast.error(language === 'zh-CN' ? '启动音频失败: ' + error : 'Failed to start audio: ' + error)
    } finally {
      // 无论成功/失败都释放互斥（失败路径不释放 ⇒ 永久锁死，正是「再点没反应」的成因）
      startingRef.current = false
      setIsInitializing(false)
    }
  }, [isCapturing, isInitializing, audioSettings.selectedAudioDevice, audioSettings.sampleRate, audioSettings.audioBackend, language, t, setMicUserPreference])
  
  // 停止音频捕获 - 使用 ref 避免依赖循环
  const stopAudio = useCallback(async () => {
    try {
      // 清除定时器
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      await nativeAudio.stopAudioCapture()
      // 用户显式关：同步落偏好（micUserDisabled=true），桌面端重启后不会再默认开
      setMicUserPreference(false)
      setLastPitch(null)
      setActiveBackend('')
      toast.success(t('audio_inactive'))
    } catch (error) {
      console.error('Failed to stop audio:', error)
    }
  }, [t, setMicUserPreference])
  
  // 使用 ref 存储 stopAudio 以避免依赖循环
  const stopAudioRef = useRef(stopAudio)
  useEffect(() => {
    stopAudioRef.current = stopAudio
  }, [stopAudio])
  
  // 切换音频状态
  const toggleAudio = useCallback(async () => {
    if (isCapturing) {
      await stopAudio()
    } else {
      await startAudio()
    }
  }, [isCapturing, startAudio, stopAudio])
  
  // 处理设备变化 - 使用 ref 避免依赖循环
  const handleDeviceChange = useCallback((event: DeviceChangeEvent) => {
    setDevices(event.devices)

    // 静默更新设备列表，不弹出"检测到新设备"提示（Rust device_monitor 启动时会 emit 所有设备作为 added 事件，易误报）

    if (event.removed.length > 0) {
      // 如果当前使用的设备被移除，停止音频捕获
      const currentSelected = useAppStore.getState().audio?.selectedAudioDevice
      if (currentSelected && event.removed.includes(currentSelected)) {
        // 使用 ref 调用 stopAudio 避免依赖循环
        stopAudioRef.current()
        toast.error(language === 'zh-CN' ? '当前音频设备已断开，音频输入已停止' : 'Current audio device disconnected, audio input stopped')
        // 清除设备选择
        useAppStore.getState().setSelectedAudioDevice('')
      }
    }

    // 如果有默认设备且当前没有选择设备，自动选择
    const currentSelected = useAppStore.getState().audio?.selectedAudioDevice
    if (!currentSelected && event.devices.length > 0) {
      const defaultDevice = event.devices.find(d => d.isDefault) || event.devices[0]
      useAppStore.getState().setSelectedAudioDevice(defaultDevice.name)
    }
  }, [language])
  
  // 启动设备热插拔检测（使用 Rust 后端事件驱动）
  useEffect(() => {
    let unlisten: (() => void) | null = null
    let cancelled = false

    nativeAudio.listenDeviceChanges(handleDeviceChange).then((fn) => {
      if (!fn) return
      if (cancelled) {
        // 组件在 promise 落地前已卸载：此时清理函数已经跑过，必须在这里补注销，
        // 否则 Tauri 事件监听器与 Rust device_monitor（每 1.5s 一发）会一直挂着
        fn()
        return
      }
      unlisten = fn
    })

    return () => {
      cancelled = true
      if (unlisten) unlisten()
      nativeAudio.unlistenDeviceChanges()
    }
  }, [handleDeviceChange])
  
  // 缓冲区大小选项 - SOLO 默认使用 2048
  const bufferOptions = [
    { value: 256, label: language === 'zh-CN' ? '256 (超低延迟)' : '256 (Ultra Low Latency)' },
    { value: 512, label: language === 'zh-CN' ? '512 (低延迟)' : '512 (Low Latency)' },
    { value: 1024, label: language === 'zh-CN' ? '1024 (推荐)' : '1024 (Recommended)' },
    { value: 2048, label: language === 'zh-CN' ? '2048 (SOLO默认)' : '2048 (SOLO Default)' },
    { value: 4096, label: language === 'zh-CN' ? '4096 (稳定)' : '4096 (Stable)' },
  ]
  
  // 采样率选项 - SOLO 默认使用 48000
  const sampleRateOptions = [
    { value: 44100, label: '44.1 kHz' },
    { value: 48000, label: language === 'zh-CN' ? '48 kHz (SOLO默认)' : '48 kHz (SOLO default)' },
    { value: 96000, label: '96 kHz' },
    { value: 192000, label: '192 kHz' },
  ]

  // 音频后端：WASAPI 共享/独占、ASIO。
  // 这三种后端都是 Windows 专属实现（Rust 侧 wasapi_exclusive 有 cfg(target_os = "windows") 门控），
  // macOS/Linux 的 Tauri 桌面版不显示该下拉，避免选了必回退的选项。
  const isWindows = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)
  const backendOptions = [
    { value: 'wasapi_shared', label: t('backend_shared') },
    ...(isWindows
      ? [
          { value: 'wasapi_exclusive', label: t('backend_exclusive') },
          { value: 'asio', label: t('backend_asio') },
        ]
      : []),
  ]
  
  return (
    <div className="space-y-4">
      {initError && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-600 dark:text-red-400">
          <p className="font-medium">{language === 'zh-CN' ? '音频初始化错误' : 'Audio Init Error'}</p>
          <p className="text-xs mt-1">{initError}</p>
        </div>
      )}
      {/* 设备选择 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t('audio_device')}</span>
          <Button variant="ghost" size="sm" onClick={loadDevices} disabled={isCapturing}>
            <Activity className="h-4 w-4 mr-1" />
            {t('refresh_devices')}
          </Button>
        </div>
        <Select 
          value={audioSettings.selectedAudioDevice} 
          onValueChange={setSelectedAudioDevice}
          disabled={isCapturing}
        >
          <SelectTrigger>
            <SelectValue placeholder={language === 'zh-CN' ? '选择设备' : 'Select Device'} />
          </SelectTrigger>
          <SelectContent>
            {devices.length === 0 && (
              <SelectItem value="__no_devices__" disabled>
                {language === 'zh-CN' ? '未找到音频设备' : 'No audio devices found'}
              </SelectItem>
            )}
            {devices.map(device => (
              <SelectItem key={device.name} value={device.name}>
                {device.name} {device.isDefault && (language === 'zh-CN' ? '（默认）' : '(Default)')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {/* 启用/停止音频 */}
      <div className="flex items-center justify-between py-2 border-t border-border/50">
        <div className="flex flex-col">
          <span className="text-sm font-medium">{t('enable_audio')}</span>
          {isCapturing && (
            <span className="text-xs text-green-500">
              {latency.toFixed(1)}ms {t('latency')}
              {activeBackend && ` · ${backendOptions.find(o => o.value === activeBackend)?.label ?? activeBackend}`}
            </span>
          )}
          {isCapturing && activeBackend === 'wasapi_shared'
            && (audioSettings.audioBackend === 'wasapi_exclusive' || audioSettings.audioBackend === 'asio') && (
            <span className="text-xs text-amber-500">
              {audioSettings.audioBackend === 'asio'
                ? (language === 'zh-CN'
                    // ASIO 回退几乎总是「本机没装 ASIO 驱动」——
                    // 注册表 HKLM\SOFTWARE\ASIO 下没有任何驱动项时，CPAL 枚举出来是空的。
                    // 直接说清原因 + 怎么办，比「所选后端不可用」有用得多。
                    // ⚠️ 注意：ASUS 主板自带的 AsIO2.dll / AsIO3.dll 是**华硕自己的驱动**，
                    //    **不是** Steinberg ASIO，实现不了 ASIO 接口（实测无 AsioInit 等导出）
                    //    ⇒ 装了华硕音频驱动 ≠ 有 ASIO 可用。
                    ? '未检测到 ASIO 驱动，已回退到共享模式（如 ASIO4ALL / 声卡厂商驱动）'
                    : 'No ASIO driver found, fell back to Shared (e.g. ASIO4ALL / vendor driver)')
                : (language === 'zh-CN'
                    ? '所选后端不可用，已回退到共享模式'
                    : 'Selected backend unavailable, fell back to Shared')}
            </span>
          )}
          {!isCapturing && !audioSettings.selectedAudioDevice && (
            <span className="text-xs text-amber-500">
              {t('no_device')}
            </span>
          )}
        </div>
        <Switch
          checked={isCapturing}
          disabled={isInitializing || !audioSettings.selectedAudioDevice}
          onCheckedChange={toggleAudio}
        />
      </div>
      
      {/* 音高检测显示 */}
      {isCapturing && lastPitch && (
        <div className="p-3 bg-muted rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('detected_note')}</span>
            <Badge variant="outline" className="font-mono text-lg">
              {lastPitch.note}{lastPitch.octave}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('confidence')}</span>
            <span className="text-sm font-mono">{(lastPitch.confidence.overall * 100).toFixed(1)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('volume')}</span>
            <span className="text-sm font-mono">{lastPitch.volume_db_spl.toFixed(1)} dB</span>
          </div>
        </div>
      )}
      
      <div className="border-t border-border/50 pt-4 space-y-4">
        <h5 className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4" />
          {language === 'zh-CN' ? '性能设置 (SOLO默认)' : 'Performance Settings (SOLO Default)'}
        </h5>
        
        {/* 音频后端（仅 Windows：WASAPI/ASIO 是 Windows 专属实现） */}
        {isWindows && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('audio_backend')}</span>
            <span className="font-mono text-xs">{backendOptions.find(o => o.value === (audioSettings.audioBackend || 'wasapi_shared'))?.label}</span>
          </div>
          <Select
            value={audioSettings.audioBackend || 'wasapi_shared'}
            onValueChange={(v) => setAudioBackend(v as 'wasapi_shared' | 'wasapi_exclusive' | 'asio')}
            disabled={isCapturing}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {backendOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {language === 'zh-CN'
              ? '独占/ASIO 延迟更低；设备不支持时自动回退到共享模式'
              : 'Exclusive/ASIO offer lower latency; auto-falls back to Shared if unsupported'}
          </p>
        </div>
        )}
        
        {/* 缓冲区大小 */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('buffer_size')}</span>
            <span className="font-mono">{eff.bufferSize}</span>
          </div>
          <Select 
            value={String(eff.bufferSize)} 
            onValueChange={(v) => {
              const n = Number(v)
              setBufferSize(n)
              // 立即送达后端：未采集时只落配置字段，采集时会重建流。
              // 此前这里只写 store、全仓零调用方 ⇒ 下拉是装饰品（铁律 22）。
              void nativeAudio.setBufferSize(n)
            }}
            disabled={isCapturing}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {bufferOptions.map(opt => (
                <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {/* 采样率 */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('sample_rate')}</span>
            <span className="font-mono">{(audioSettings.sampleRate || 48000) / 1000}kHz</span>
          </div>
          <Select 
            value={String(audioSettings.sampleRate || 48000)} 
            onValueChange={(v) => {
              const n = Number(v)
              setSampleRate(n)
              // 立即送达后端：未采集时只落配置字段，采集时会按它建流。
              // 🚨 此前这里只写 store、不调 nativeAudio ⇒ 下拉是**装饰品**
              // （铁律 #22：UI 写 store ≠ 到达后端），改了采样率桌面端毫无变化。
              // 对照组是上面的 bufferSize —— 它已经这么做了。
              void nativeAudio.setSampleRate(n)
            }}
            disabled={isCapturing}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sampleRateOptions.map(opt => (
                <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="border-t border-border/50 pt-4 space-y-4">
        <h5 className="text-sm font-medium flex items-center gap-2">
          <Filter className="h-4 w-4" />
          {language === 'zh-CN' ? '滤波器设置 (最佳方案)' : 'Filter Settings (Best Practice)'}
        </h5>
        
        {/* 噪音抑制 */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('noise_suppression')}</span>
            <span className="font-mono">{eff.noiseSuppression}%</span>
          </div>
          <Slider
            value={[eff.noiseSuppression]}
            onValueChange={([v]) => {
              setNoiseSuppression(v)
              // 立即生效：Rust 映射为「噪声门相对底噪的倍数」（0 档=门关闭）
              void nativeAudio.setNoiseSuppression(v)
            }}
            min={0}
            max={100}
            step={10}
          />
        </div>
        
        {/* 滤波器开关 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('high_pass_filter')}</span>
            <Switch 
              checked={eff.highPass} 
              onCheckedChange={(checked) => {
                setEnableHighPass(checked)
                // setFilters 是整体接口：每次发全量 4 开关（顺带修复任何漂移）
                void nativeAudio.setFilters({ highPass: checked, lowPass: eff.lowPass, notch50: eff.notch50, notch60: eff.notch60 })
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('low_pass_filter')}</span>
            <Switch 
              checked={eff.lowPass} 
              onCheckedChange={(checked) => {
                setEnableLowPass(checked)
                void nativeAudio.setFilters({ highPass: eff.highPass, lowPass: checked, notch50: eff.notch50, notch60: eff.notch60 })
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('notch_50hz')}</span>
            <Switch 
              checked={eff.notch50} 
              onCheckedChange={(checked) => {
                setEnableNotch50(checked)
                void nativeAudio.setFilters({ highPass: eff.highPass, lowPass: eff.lowPass, notch50: checked, notch60: eff.notch60 })
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('notch_60hz')}</span>
            <Switch 
              checked={eff.notch60} 
              onCheckedChange={(checked) => {
                setEnableNotch60(checked)
                void nativeAudio.setFilters({ highPass: eff.highPass, lowPass: eff.lowPass, notch50: eff.notch50, notch60: checked })
              }}
            />
          </div>
        </div>
      </div>
      
      {/* 输入增益 */}
      <div className="border-t border-border/50 pt-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{language === 'zh-CN' ? '输入增益' : 'Input Gain'}</span>
          <span className="font-mono">{Math.round(eff.inputGain * 100)}%</span>
        </div>
        <Slider
          value={[eff.inputGain * 100]}
          onValueChange={([v]) => {
            setInputGain(v / 100)
            // 立即生效（面板百分比 ÷100 = Rust 的增益倍率）
            void nativeAudio.setGain(v / 100)
          }}
          min={0}
          max={200}
          step={10}
        />
      </div>
    </div>
  )
})
