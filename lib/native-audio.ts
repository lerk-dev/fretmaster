import { isTauriEnv } from './utils'
import { logger } from './logger'

export const isTauri = (): boolean => {
  return isTauriEnv()
}

async function getInvoke() {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke
}

async function getListen() {
  const { listen } = await import('@tauri-apps/api/event')
  return listen
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

type UnlistenFn = () => void

const deviceMonitorState = {
  deviceChangeListener: null as UnlistenFn | null,
  devicePollInterval: null as NodeJS.Timeout | null,
  lastDevices: [] as AudioDeviceInfo[],
  monitorStarted: false,
}

export async function getAudioDevices(): Promise<AudioDeviceInfo[]> {
  if (!isTauri()) return []
  try {
    const invoke = await getInvoke()
    const devices = await invoke<AudioDeviceInfo[]>('get_audio_devices')
    deviceMonitorState.lastDevices = devices
    return devices
  } catch (error) {
    logger.error('Failed to get audio devices:', error)
    return []
  }
}

export async function listenDeviceChanges(callback: (event: DeviceChangeEvent) => void): Promise<UnlistenFn | null> {
  if (!isTauri()) return null

  try {
    const invoke = await getInvoke()
    const listen = await getListen()

    if (!deviceMonitorState.monitorStarted) {
      await invoke('start_device_monitor', { intervalMs: 1500 })
      deviceMonitorState.monitorStarted = true
    }

    deviceMonitorState.deviceChangeListener = await listen<DeviceChangeEvent>('audio-device-changed', (event) => {
      deviceMonitorState.lastDevices = event.payload.devices
      callback(event.payload)
    })
    return deviceMonitorState.deviceChangeListener
  } catch (error) {
    logger.warn('Tauri event-based monitoring unavailable, falling back to polling:', error)
    startDevicePolling(callback, 2000)
    return () => stopDevicePolling()
  }
}

export function unlistenDeviceChanges(): void {
  if (deviceMonitorState.deviceChangeListener) {
    deviceMonitorState.deviceChangeListener()
    deviceMonitorState.deviceChangeListener = null
  }
  stopDevicePolling()
  
  if (deviceMonitorState.monitorStarted && isTauri()) {
    getInvoke().then(invoke => invoke('stop_device_monitor')).catch(() => {})
    deviceMonitorState.monitorStarted = false
  }
}

export function startDevicePolling(callback: (event: DeviceChangeEvent) => void, intervalMs: number = 2000): void {
  if (!isTauri()) return
  
  getAudioDevices().then(() => {
    deviceMonitorState.devicePollInterval = setInterval(async () => {
      try {
        const invoke = await getInvoke()
        const newDevices = await invoke<AudioDeviceInfo[]>('get_audio_devices')
        
        const added = newDevices.filter(d => !deviceMonitorState.lastDevices.some(ld => ld.name === d.name))
        const removed = deviceMonitorState.lastDevices.filter(d => !newDevices.some(nd => nd.name === d.name)).map(d => d.name)
        
        if (added.length > 0 || removed.length > 0) {
          callback({ added, removed, devices: newDevices })
        }
        
        deviceMonitorState.lastDevices = newDevices
      } catch (error) {
        logger.error('Device polling error:', error)
      }
    }, intervalMs)
  })
}

export function stopDevicePolling(): void {
  if (deviceMonitorState.devicePollInterval) {
    clearInterval(deviceMonitorState.devicePollInterval)
    deviceMonitorState.devicePollInterval = null
  }
}

export async function startAudioCapture(deviceName?: string): Promise<void> {
  if (!isTauri()) throw new Error('Not in Tauri environment')
  try {
    const invoke = await getInvoke()
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
  if (!isTauri()) throw new Error('Not in Tauri environment')
  try {
    const invoke = await getInvoke()
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
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('stop_audio_capture')
  } catch (error) {
    console.error('Failed to stop audio capture:', error)
  }
}

export async function detectPitch(): Promise<PitchResult | null> {
  if (!isTauri()) return null
  try {
    const invoke = await getInvoke()
    return await invoke<PitchResult | null>('detect_pitch')
  } catch (error) {
    console.error('Failed to detect pitch:', error)
    return null
  }
}

export async function getLatencyMs(): Promise<number> {
  if (!isTauri()) return 0
  try {
    const invoke = await getInvoke()
    return await invoke<number>('get_latency_ms')
  } catch (error) {
    console.error('Failed to get latency:', error)
    return 0
  }
}

export async function getAudioStatus(): Promise<AudioStatus> {
  if (!isTauri()) {
    return { isCapturing: false, latencyMs: 0, bufferSize: 2048, sampleRate: 48000 }
  }
  try {
    const invoke = await getInvoke()
    return await invoke<AudioStatus>('get_audio_status')
  } catch (error) {
    console.error('Failed to get audio status:', error)
    return { isCapturing: false, latencyMs: 0, bufferSize: 2048, sampleRate: 48000 }
  }
}

export async function setBufferSize(size: number): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('set_buffer_size', { size })
  } catch (error) { console.error('Failed to set buffer size:', error) }
}

export async function setSampleRate(rate: number): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('set_sample_rate', { rate })
  } catch (error) { console.error('Failed to set sample rate:', error) }
}

export async function setNoiseSuppression(level: number): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('set_noise_suppression', { level })
  } catch (error) { console.error('Failed to set noise suppression:', error) }
}

export async function setFilters(filters: {
  highPass?: boolean
  lowPass?: boolean
  notch50?: boolean
  notch60?: boolean
}): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('set_audio_filters', { filters })
  } catch (error) { console.error('Failed to set filters:', error) }
}

export async function getDefaultAudioDevice(): Promise<AudioDeviceInfo | null> {
  if (!isTauri()) return null
  try {
    const invoke = await getInvoke()
    return await invoke<AudioDeviceInfo | null>('get_default_audio_device')
  } catch (error) {
    console.error('Failed to get default audio device:', error)
    return null
  }
}

export async function setPitchThreshold(threshold: number): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('set_pitch_threshold', { threshold })
  } catch (error) { console.error('Failed to set pitch threshold:', error) }
}

export async function setGain(gain: number): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('set_gain', { gain })
  } catch (error) { console.error('Failed to set gain:', error) }
}

export async function getAudioLevel(): Promise<{
  rms: number; db_spl: number; peak: number; is_voiced: boolean; noise_floor: number; snr_db: number
} | null> {
  if (!isTauri()) return null
  try {
    const invoke = await getInvoke()
    return await invoke('get_audio_level')
  } catch (error) { console.error('Failed to get audio level:', error); return null }
}

export interface PitchStreamEvent {
  pitch: PitchResult
  isNoteOnset: boolean
  agcGain: number
}

export async function startPitchStream(intervalMs?: number): Promise<void> {
  if (!isTauri()) throw new Error('Not in Tauri environment')
  try {
    const invoke = await getInvoke()
    await invoke('start_pitch_stream', { intervalMs })
  } catch (error) {
    console.error('Failed to start pitch stream:', error)
    throw error
  }
}

export async function stopPitchStream(): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('stop_pitch_stream')
  } catch (error) {
    console.error('Failed to stop pitch stream:', error)
  }
}

export async function isPitchStreamRunning(): Promise<boolean> {
  if (!isTauri()) return false
  try {
    const invoke = await getInvoke()
    return await invoke<boolean>('is_pitch_stream_running')
  } catch (error) {
    console.error('Failed to check pitch stream:', error)
    return false
  }
}

export async function listenPitchDetected(callback: (event: PitchStreamEvent) => void): Promise<UnlistenFn | null> {
  if (!isTauri()) return null
  try {
    const listen = await getListen()
    return await listen<PitchStreamEvent>('pitch-detected', (event) => {
      callback(event.payload)
    })
  } catch (error) {
    console.error('Failed to listen pitch detected:', error)
    return null
  }
}

export async function setAgcEnabled(enabled: boolean): Promise<void> {
  if (!isTauri()) return
  try {
    const invoke = await getInvoke()
    await invoke('set_agc_enabled', { enabled })
  } catch (error) { console.error('Failed to set AGC:', error) }
}

export async function isAgcEnabled(): Promise<boolean> {
  if (!isTauri()) return false
  try {
    const invoke = await getInvoke()
    return await invoke<boolean>('is_agc_enabled')
  } catch (error) { console.error('Failed to check AGC:', error); return false }
}

export async function getAgcGain(): Promise<number> {
  if (!isTauri()) return 1.0
  try {
    const invoke = await getInvoke()
    return await invoke<number>('get_agc_gain')
  } catch (error) { console.error('Failed to get AGC gain:', error); return 1.0 }
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
  startPitchStream,
  stopPitchStream,
  isPitchStreamRunning,
  listenPitchDetected,
  setAgcEnabled,
  isAgcEnabled,
  getAgcGain,
}
