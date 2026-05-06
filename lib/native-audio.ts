import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && !!(window as any).__TAURI__
}

export interface AudioDeviceInfo {
  name: string
  isDefault: boolean
  channels: number
  sampleRate: number
}

export interface PitchResult {
  note: string
  octave: number
  frequency: number
  cents: number
  confidence: {
    yin: number
    harmonic: number
    temporal: number
    overall: number
  }
  volume_db_spl: number
}

export interface AudioStatus {
  isCapturing: boolean
  latencyMs: number
  bufferSize: number
  sampleRate: number
}

export interface DeviceChangeEvent {
  added: AudioDeviceInfo[]
  removed: string[]
  devices: AudioDeviceInfo[]
}

let deviceChangeListener: UnlistenFn | null = null
let devicePollInterval: NodeJS.Timeout | null = null
let lastDevices: AudioDeviceInfo[] = []
let monitorStarted = false

export async function getAudioDevices(): Promise<AudioDeviceInfo[]> {
  if (!isTauri()) {
    return []
  }
  try {
    const devices = await invoke<AudioDeviceInfo[]>('get_audio_devices')
    lastDevices = devices
    return devices
  } catch (error) {
    console.error('Failed to get audio devices:', error)
    return []
  }
}

/**
 * 启动设备热插拔监控（Rust 后端事件驱动）
 * 优先使用 Tauri 事件，如果不可用则回退到前端轮询
 */
export async function listenDeviceChanges(callback: (event: DeviceChangeEvent) => void): Promise<UnlistenFn | null> {
  if (!isTauri()) return null

  // 1. 启动 Rust 后端设备监控线程（通过 Tauri 事件推送变化）
  try {
    if (!monitorStarted) {
      await invoke('start_device_monitor', { intervalMs: 1500 })
      monitorStarted = true
    }

    // 2. 监听后端推送的 audio-device-changed 事件
    deviceChangeListener = await listen<DeviceChangeEvent>('audio-device-changed', (event) => {
      lastDevices = event.payload.devices
      callback(event.payload)
    })
    return deviceChangeListener
  } catch (error) {
    console.warn('Tauri event-based monitoring unavailable, falling back to polling:', error)
    // 3. 回退：前端轮询
    startDevicePolling(callback, 2000)
    return () => stopDevicePolling()
  }
}

/**
 * 停止设备变化监听，同时停止后端监控线程
 */
export function unlistenDeviceChanges(): void {
  if (deviceChangeListener) {
    deviceChangeListener()
    deviceChangeListener = null
  }
  stopDevicePolling()
  
  // 停止 Rust 后端监控线程
  if (monitorStarted && isTauri()) {
    invoke('stop_device_monitor').catch(() => {})
    monitorStarted = false
  }
}

/**
 * 前端轮询方案（备用）
 */
export function startDevicePolling(callback: (event: DeviceChangeEvent) => void, intervalMs: number = 2000): void {
  if (!isTauri()) return
  
  getAudioDevices().then(() => {
    devicePollInterval = setInterval(async () => {
      try {
        const newDevices = await invoke<AudioDeviceInfo[]>('get_audio_devices')
        
        const added = newDevices.filter(d => !lastDevices.some(ld => ld.name === d.name))
        const removed = lastDevices.filter(d => !newDevices.some(nd => nd.name === d.name)).map(d => d.name)
        
        if (added.length > 0 || removed.length > 0) {
          const event: DeviceChangeEvent = {
            added,
            removed,
            devices: newDevices
          }
          callback(event)
        }
        
        lastDevices = newDevices
      } catch (error) {
        console.error('Device polling error:', error)
      }
    }, intervalMs)
  })
}

export function stopDevicePolling(): void {
  if (devicePollInterval) {
    clearInterval(devicePollInterval)
    devicePollInterval = null
  }
}

export async function startAudioCapture(deviceName?: string): Promise<void> {
  if (!isTauri()) {
    throw new Error('Not in Tauri environment')
  }
  try {
    await invoke('start_audio_capture', { deviceName })
  } catch (error) {
    console.error('Failed to start audio capture:', error)
    throw error
  }
}

export async function startAudioCaptureWithSampleRate(
  deviceName?: string,
  sampleRate?: number
): Promise<void> {
  if (!isTauri()) {
    throw new Error('Not in Tauri environment')
  }
  try {
    await invoke('start_audio_capture_with_sample_rate', { 
      deviceName, 
      sampleRate: sampleRate || 48000 
    })
  } catch (error) {
    console.error('Failed to start audio capture:', error)
    throw error
  }
}

export async function stopAudioCapture(): Promise<void> {
  if (!isTauri()) {
    return
  }
  try {
    await invoke('stop_audio_capture')
  } catch (error) {
    console.error('Failed to stop audio capture:', error)
  }
}

export async function detectPitch(): Promise<PitchResult | null> {
  if (!isTauri()) {
    return null
  }
  try {
    return await invoke<PitchResult | null>('detect_pitch')
  } catch (error) {
    console.error('Failed to detect pitch:', error)
    return null
  }
}

export async function getLatencyMs(): Promise<number> {
  if (!isTauri()) {
    return 0
  }
  try {
    return await invoke<number>('get_latency_ms')
  } catch (error) {
    console.error('Failed to get latency:', error)
    return 0
  }
}

export async function getAudioStatus(): Promise<AudioStatus> {
  if (!isTauri()) {
    return {
      isCapturing: false,
      latencyMs: 0,
      bufferSize: 2048,
      sampleRate: 48000
    }
  }
  try {
    return await invoke<AudioStatus>('get_audio_status')
  } catch (error) {
    console.error('Failed to get audio status:', error)
    return {
      isCapturing: false,
      latencyMs: 0,
      bufferSize: 2048,
      sampleRate: 48000
    }
  }
}

export async function setBufferSize(size: number): Promise<void> {
  if (!isTauri()) {
    return
  }
  try {
    await invoke('set_buffer_size', { size })
  } catch (error) {
    console.error('Failed to set buffer size:', error)
  }
}

export async function setSampleRate(rate: number): Promise<void> {
  if (!isTauri()) {
    return
  }
  try {
    await invoke('set_sample_rate', { rate })
  } catch (error) {
    console.error('Failed to set sample rate:', error)
  }
}

export async function setNoiseSuppression(level: number): Promise<void> {
  if (!isTauri()) {
    return
  }
  try {
    await invoke('set_noise_suppression', { level })
  } catch (error) {
    console.error('Failed to set noise suppression:', error)
  }
}

export async function setFilters(filters: {
  highPass?: boolean
  lowPass?: boolean
  notch50?: boolean
  notch60?: boolean
}): Promise<void> {
  if (!isTauri()) {
    return
  }
  try {
    await invoke('set_audio_filters', { filters })
  } catch (error) {
    console.error('Failed to set filters:', error)
  }
}

export async function getDefaultAudioDevice(): Promise<AudioDeviceInfo | null> {
  if (!isTauri()) return null
  try {
    return await invoke<AudioDeviceInfo | null>('get_default_audio_device')
  } catch (error) {
    console.error('Failed to get default audio device:', error)
    return null
  }
}

export async function setPitchThreshold(threshold: number): Promise<void> {
  if (!isTauri()) return
  try { await invoke('set_pitch_threshold', { threshold }) } catch (error) { console.error('Failed to set pitch threshold:', error) }
}

export async function setGain(gain: number): Promise<void> {
  if (!isTauri()) return
  try { await invoke('set_gain', { gain }) } catch (error) { console.error('Failed to set gain:', error) }
}

export async function getAudioLevel(): Promise<{
  rms: number; db_spl: number; peak: number; is_voiced: boolean; noise_floor: number; snr_db: number
} | null> {
  if (!isTauri()) return null
  try { return await invoke('get_audio_level') } catch (error) { console.error('Failed to get audio level:', error); return null }
}

export const nativeAudio = {
  getAudioDevices,
  getDefaultAudioDevice,
  startAudioCapture,
  startAudioCaptureWithSampleRate,
  stopAudioCapture,
  detectPitch,
  getLatencyMs,
  getAudioStatus,
  setBufferSize,
  setSampleRate,
  setNoiseSuppression,
  setFilters,
  setPitchThreshold,
  setGain,
  getAudioLevel,
  startDevicePolling,
  stopDevicePolling,
  listenDeviceChanges,
  unlistenDeviceChanges,
}

export default nativeAudio
