import { nativeAudio, isTauri, type AudioDeviceInfo, type PitchResult } from './native-audio'

export interface UseNativeAudioOptions {
  onPitchDetected?: (result: PitchResult) => void
  onError?: (error: Error) => void
  autoStart?: boolean
  deviceName?: string
}

export interface UseNativeAudioReturn {
  isNative: boolean
  isCapturing: boolean
  devices: AudioDeviceInfo[]
  currentDevice: AudioDeviceInfo | null
  lastPitch: PitchResult | null
  startCapture: (deviceName?: string) => Promise<void>
  stopCapture: () => Promise<void>
  refreshDevices: () => Promise<void>
}

export class NativeAudioManager {
  private isCapturing: boolean = false
  private devices: AudioDeviceInfo[] = []
  private currentDevice: AudioDeviceInfo | null = null
  private lastPitch: PitchResult | null = null
  private detectionInterval: NodeJS.Timeout | null = null
  private onPitchDetected?: (result: PitchResult) => void
  private onError?: (error: Error) => void

  constructor(options: UseNativeAudioOptions = {}) {
    this.onPitchDetected = options.onPitchDetected
    this.onError = options.onError
  }

  isNative(): boolean {
    return isTauri()
  }

  async refreshDevices(): Promise<void> {
    try {
      this.devices = await nativeAudio.getAudioDevices()
      this.currentDevice = await nativeAudio.getDefaultAudioDevice()
    } catch (error) {
      this.onError?.(error as Error)
    }
  }

  getDevices(): AudioDeviceInfo[] {
    return this.devices
  }

  getCurrentDevice(): AudioDeviceInfo | null {
    return this.currentDevice
  }

  getIsCapturing(): boolean {
    return this.isCapturing
  }

  getLastPitch(): PitchResult | null {
    return this.lastPitch
  }

  async startCapture(deviceName?: string): Promise<void> {
    if (this.isCapturing) {
      await this.stopCapture()
    }

    try {
      await nativeAudio.startAudioCapture(deviceName)
      this.isCapturing = true
      
      this.detectionInterval = setInterval(async () => {
        try {
          const pitch = await nativeAudio.detectPitch()
          if (pitch) {
            this.lastPitch = pitch
            this.onPitchDetected?.(pitch)
          }
        } catch (error) {
          console.error('Pitch detection error:', error)
        }
      }, 50)
    } catch (error) {
      this.isCapturing = false
      this.onError?.(error as Error)
      throw error
    }
  }

  async stopCapture(): Promise<void> {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval)
      this.detectionInterval = null
    }

    try {
      await nativeAudio.stopAudioCapture()
    } catch (error) {
      console.error('Error stopping capture:', error)
    }

    this.isCapturing = false
  }

  async setThreshold(threshold: number): Promise<void> {
    await nativeAudio.setPitchThreshold(threshold)
  }
}

export function createNativeAudioManager(options?: UseNativeAudioOptions): NativeAudioManager {
  return new NativeAudioManager(options)
}

export { nativeAudio, isTauri }
export type { AudioDeviceInfo, PitchResult }
