import { nativeAudio, isTauri, type AudioDeviceInfo, type PitchResult, type PitchStreamEvent } from './native-audio'

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

type UnlistenFn = () => void

export class NativeAudioManager {
  private capturing: boolean = false
  private devices: AudioDeviceInfo[] = []
  private currentDevice: AudioDeviceInfo | null = null
  private lastPitch: PitchResult | null = null
  private detectionInterval: NodeJS.Timeout | null = null
  private pitchStreamListener: UnlistenFn | null = null
  private useEventStream: boolean = true
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
    return this.capturing
  }

  getLastPitch(): PitchResult | null {
    return this.lastPitch
  }

  async startCapture(deviceName?: string): Promise<void> {
    if (this.capturing) {
      await this.stopCapture()
    }

    try {
      await nativeAudio.startAudioCapture(deviceName)
      this.capturing = true

      if (this.useEventStream) {
        try {
          this.pitchStreamListener = await nativeAudio.listenPitchDetected((event: PitchStreamEvent) => {
            if (event.pitch && event.pitch.frequency > 0) {
              this.lastPitch = event.pitch
              this.onPitchDetected?.(event.pitch)
            }
          })
          await nativeAudio.startPitchStream(50)
        } catch (streamError) {
          console.warn('Event stream failed, falling back to polling:', streamError)
          this.useEventStream = false
          this._startPolling()
        }
      } else {
        this._startPolling()
      }
    } catch (error) {
      this.capturing = false
      this.onError?.(error as Error)
      throw error
    }
  }

  private _startPolling(): void {
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
  }

  async stopCapture(): Promise<void> {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval)
      this.detectionInterval = null
    }

    if (this.pitchStreamListener) {
      this.pitchStreamListener()
      this.pitchStreamListener = null
    }

    try {
      if (this.useEventStream) {
        await nativeAudio.stopPitchStream()
      }
    } catch (error) {
      console.error('Error stopping pitch stream:', error)
    }

    try {
      await nativeAudio.stopAudioCapture()
    } catch (error) {
      console.error('Error stopping capture:', error)
    }

    this.capturing = false
  }

  async setThreshold(threshold: number): Promise<void> {
    await nativeAudio.setPitchThreshold(threshold)
  }

  async setAgcEnabled(enabled: boolean): Promise<void> {
    await nativeAudio.setAgcEnabled(enabled)
  }

  async isAgcEnabled(): Promise<boolean> {
    return nativeAudio.isAgcEnabled()
  }
}

export function createNativeAudioManager(options?: UseNativeAudioOptions): NativeAudioManager {
  return new NativeAudioManager(options)
}

export { nativeAudio, isTauri }
export type { AudioDeviceInfo, PitchResult }
