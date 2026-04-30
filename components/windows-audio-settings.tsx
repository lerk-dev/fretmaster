'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Mic, Activity, Zap, Filter, Volume2, Usb } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/lib/store'
import { nativeAudio, type AudioDeviceInfo, type PitchResult, type DeviceChangeEvent } from '@/lib/native-audio'
import { toast } from 'sonner'

interface WindowsAudioSettingsProps {
  language: 'zh-CN' | 'en'
}

export function WindowsAudioSettings({ language }: WindowsAudioSettingsProps) {
  const store = useAppStore()
  const audioSettings = store.audio
  
  const [devices, setDevices] = useState<AudioDeviceInfo[]>([])
  const [isCapturing, setIsCapturing] = useState(false)
  const [lastPitch, setLastPitch] = useState<PitchResult | null>(null)
  const [latency, setLatency] = useState(0)
  const [isInitializing, setIsInitializing] = useState(false)
  const [deviceChangeDetected, setDeviceChangeDetected] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const devicePollRef = useRef<NodeJS.Timeout | null>(null)
  
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
      }
    }
    return translations[language]?.[key] || key
  }, [language])
  
  // 加载设备列表
  const loadDevices = useCallback(async () => {
    try {
      const deviceList = await nativeAudio.getAudioDevices()
      setDevices(deviceList)
      // 如果没有选择设备但有默认设备，自动选择
      if (!audioSettings.selectedAudioDevice && deviceList.length > 0) {
        const defaultDevice = deviceList.find(d => d.isDefault) || deviceList[0]
        store.setSelectedAudioDevice(defaultDevice.name)
      }
    } catch (error) {
      console.error('Failed to load audio devices:', error)
      toast.error(language === 'zh-CN' ? '加载音频设备失败' : 'Failed to load audio devices')
    }
  }, [language, audioSettings.selectedAudioDevice, store])
  
  useEffect(() => {
    loadDevices()
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
    if (isCapturing || isInitializing) return
    
    // 检查是否选择了设备
    if (!audioSettings.selectedAudioDevice) {
      toast.error(language === 'zh-CN' ? '请先选择音频设备' : 'Please select an audio device first')
      return
    }
    
    setIsInitializing(true)
    try {
      await nativeAudio.startAudioCaptureWithSampleRate(
        audioSettings.selectedAudioDevice,
        audioSettings.sampleRate || 48000
      )
      setIsCapturing(true)
      toast.success(t('audio_active'))
      
      // 开始检测音高
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
      setIsInitializing(false)
    }
  }, [isCapturing, isInitializing, audioSettings.selectedAudioDevice, audioSettings.sampleRate, language, t])
  
  // 停止音频捕获
  const stopAudio = useCallback(async () => {
    if (!isCapturing) return
    
    try {
      // 清除定时器
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      await nativeAudio.stopAudioCapture()
      setIsCapturing(false)
      setLastPitch(null)
      toast.success(t('audio_inactive'))
    } catch (error) {
      console.error('Failed to stop audio:', error)
    }
  }, [isCapturing, t])
  
  // 切换音频状态
  const toggleAudio = useCallback(async () => {
    if (isCapturing) {
      await stopAudio()
    } else {
      await startAudio()
    }
  }, [isCapturing, startAudio, stopAudio])
  
  // 处理设备变化
  const handleDeviceChange = useCallback((event: DeviceChangeEvent) => {
    setDeviceChangeDetected(true)
    setDevices(event.devices)
    
    // 显示通知
    if (event.added.length > 0) {
      const names = event.added.map(d => d.name).join(', ')
      toast.success(language === 'zh-CN' ? `检测到新设备: ${names}` : `New device detected: ${names}`)
    }
    if (event.removed.length > 0) {
      const names = event.removed.join(', ')
      toast.warning(language === 'zh-CN' ? `设备已移除: ${names}` : `Device removed: ${names}`)
      
      // 如果当前使用的设备被移除，停止音频捕获
      if (event.removed.includes(audioSettings.selectedAudioDevice)) {
        if (isCapturing) {
          stopAudio()
          toast.error(language === 'zh-CN' ? '当前音频设备已断开，音频输入已停止' : 'Current audio device disconnected, audio input stopped')
        }
        // 清除设备选择
        store.setSelectedAudioDevice('')
      }
    }
    
    // 如果有默认设备且当前没有选择设备，自动选择
    if (!audioSettings.selectedAudioDevice && event.devices.length > 0) {
      const defaultDevice = event.devices.find(d => d.isDefault) || event.devices[0]
      store.setSelectedAudioDevice(defaultDevice.name)
    }
  }, [language, audioSettings.selectedAudioDevice, isCapturing, store, stopAudio])
  
  // 启动设备热插拔检测
  useEffect(() => {
    nativeAudio.startDevicePolling(handleDeviceChange, 2000)
    
    return () => {
      nativeAudio.stopDevicePolling()
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
    { value: 48000, label: '48 kHz (SOLO默认)' },
    { value: 96000, label: '96 kHz' },
    { value: 192000, label: '192 kHz' },
  ]
  
  return (
    <div className="space-y-4">
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
          onValueChange={store.setSelectedAudioDevice}
          disabled={isCapturing}
        >
          <SelectTrigger>
            <SelectValue placeholder={language === 'zh-CN' ? '选择设备' : 'Select Device'} />
          </SelectTrigger>
          <SelectContent>
            {devices.length === 0 && (
              <SelectItem value="" disabled>
                {language === 'zh-CN' ? '未找到音频设备' : 'No audio devices found'}
              </SelectItem>
            )}
            {devices.map(device => (
              <SelectItem key={device.name} value={device.name}>
                {device.name} {device.isDefault && '(Default)'}
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
        
        {/* 缓冲区大小 */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('buffer_size')}</span>
            <span className="font-mono">{audioSettings.bufferSize || 2048}</span>
          </div>
          <Select 
            value={String(audioSettings.bufferSize || 2048)} 
            onValueChange={(v) => store.setBufferSize(Number(v))}
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
            onValueChange={(v) => store.setSampleRate(Number(v))}
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
            <span className="font-mono">{audioSettings.noiseSuppression ?? 70}%</span>
          </div>
          <Slider
            value={[audioSettings.noiseSuppression ?? 70]}
            onValueChange={([v]) => store.setNoiseSuppression(v)}
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
              checked={audioSettings.enableHighPass ?? true} 
              onCheckedChange={store.setEnableHighPass}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('low_pass_filter')}</span>
            <Switch 
              checked={audioSettings.enableLowPass ?? true} 
              onCheckedChange={store.setEnableLowPass}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('notch_50hz')}</span>
            <Switch 
              checked={audioSettings.enableNotch50 ?? true} 
              onCheckedChange={store.setEnableNotch50}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('notch_60hz')}</span>
            <Switch 
              checked={audioSettings.enableNotch60 ?? false} 
              onCheckedChange={store.setEnableNotch60}
            />
          </div>
        </div>
      </div>
      
      {/* 输入增益 */}
      <div className="border-t border-border/50 pt-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{language === 'zh-CN' ? '输入增益' : 'Input Gain'}</span>
          <span className="font-mono">{Math.round((audioSettings.inputGain || 1) * 100)}%</span>
        </div>
        <Slider
          value={[audioSettings.inputGain * 100]}
          onValueChange={([v]) => store.setInputGain(v / 100)}
          min={0}
          max={200}
          step={10}
        />
      </div>
    </div>
  )
}
