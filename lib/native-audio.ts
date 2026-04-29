export interface AudioDeviceInfo {
  name: string
  isDefault: boolean
  channels: number
  sampleRate: number
}

export interface PitchResult {
  frequency: number
  note: string
  octave: number
  cents: number
  probability: number
  clarity: number
  volume_rms: number
  volume_db_spl: number
  max_amplitude: number
  timestamp: number
}

export interface AudioLevelInfo {
  rms: number
  db_spl: number
  peak: number
}

export interface NativeAudioAPI {
  getAudioDevices(): Promise<AudioDeviceInfo[]>
  getDefaultAudioDevice(): Promise<AudioDeviceInfo | null>
  startAudioCapture(deviceName?: string): Promise<void>
  startAudioCaptureWithSampleRate(deviceName?: string, sampleRate?: number): Promise<void>
  stopAudioCapture(): Promise<void>
  isCapturing(): Promise<boolean>
  detectPitch(): Promise<PitchResult | null>
  getSampleRate(): Promise<number>
  setSampleRate(sampleRate: number): Promise<void>
  getSupportedSampleRates(): Promise<number[]>
  getBufferSize(): Promise<number>
  clearBuffer(): Promise<void>
  setPitchThreshold(threshold: number): Promise<void>
  getAudioLevel(): Promise<AudioLevelInfo>
}

declare global {
  interface Window {
    __TAURI__?: {
      core: {
        invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>
      }
    }
  }
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!window.__TAURI__
}

class TauriAudioAPI implements NativeAudioAPI {
  private invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    if (!window.__TAURI__) {
      return Promise.reject(new Error('Tauri not available'))
    }
    return window.__TAURI__.core.invoke<T>(cmd, args)
  }

  async getAudioDevices(): Promise<AudioDeviceInfo[]> {
    return this.invoke<AudioDeviceInfo[]>('get_audio_devices')
  }

  async getDefaultAudioDevice(): Promise<AudioDeviceInfo | null> {
    return this.invoke<AudioDeviceInfo | null>('get_default_audio_device')
  }

  async startAudioCapture(deviceName?: string): Promise<void> {
    return this.invoke<void>('start_audio_capture', { deviceName })
  }

  async startAudioCaptureWithSampleRate(deviceName?: string, sampleRate?: number): Promise<void> {
    return this.invoke<void>('start_audio_capture_with_sample_rate', { deviceName, sampleRate })
  }

  async stopAudioCapture(): Promise<void> {
    return this.invoke<void>('stop_audio_capture')
  }

  async isCapturing(): Promise<boolean> {
    return this.invoke<boolean>('is_capturing')
  }

  async detectPitch(): Promise<PitchResult | null> {
    return this.invoke<PitchResult | null>('detect_pitch')
  }

  async getSampleRate(): Promise<number> {
    return this.invoke<number>('get_sample_rate')
  }

  async setSampleRate(sampleRate: number): Promise<void> {
    return this.invoke<void>('set_sample_rate', { sampleRate })
  }

  async getSupportedSampleRates(): Promise<number[]> {
    return this.invoke<number[]>('get_supported_sample_rates')
  }

  async getBufferSize(): Promise<number> {
    return this.invoke<number>('get_buffer_size')
  }

  async clearBuffer(): Promise<void> {
    return this.invoke<void>('clear_buffer')
  }

  async setPitchThreshold(threshold: number): Promise<void> {
    return this.invoke<void>('set_pitch_threshold', { threshold })
  }

  async getAudioLevel(): Promise<AudioLevelInfo> {
    return this.invoke<AudioLevelInfo>('get_audio_level')
  }
}

class WebAudioAPI implements NativeAudioAPI {
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private scriptProcessor: ScriptProcessorNode | null = null
  private buffer: Float32Array = new Float32Array(8192)
  private bufferIndex: number = 0
  private isRunning: boolean = false
  private sampleRate: number = 48000

  async getAudioDevices(): Promise<AudioDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter(d => d.kind === 'audioinput')
      .map(d => ({
        name: d.label || 'Unknown Device',
        isDefault: false,
        channels: 1,
        sampleRate: 48000,
      }))
  }

  async getDefaultAudioDevice(): Promise<AudioDeviceInfo | null> {
    return {
      name: 'Default Microphone',
      isDefault: true,
      channels: 1,
      sampleRate: 48000,
    }
  }

  async startAudioCapture(deviceName?: string): Promise<void> {
    return this.startAudioCaptureWithSampleRate(deviceName, undefined)
  }

  async startAudioCaptureWithSampleRate(deviceName?: string, sampleRate?: number): Promise<void> {
    if (sampleRate) {
      this.sampleRate = sampleRate
    }

    const constraints: MediaStreamConstraints = {
      audio: deviceName
        ? { deviceId: { exact: deviceName } }
        : {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
    }

    this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
    this.audioContext = new AudioContext({ sampleRate: this.sampleRate })
    
    const source = this.audioContext.createMediaStreamSource(this.mediaStream)
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 4096

    this.scriptProcessor = this.audioContext.createScriptProcessor(2048, 1, 1)
    
    this.scriptProcessor.onaudioprocess = (event) => {
      if (!this.isRunning) return
      
      const inputData = event.inputBuffer.getChannelData(0)
      
      for (let i = 0; i < inputData.length; i++) {
        this.buffer[this.bufferIndex] = inputData[i]
        this.bufferIndex = (this.bufferIndex + 1) % this.buffer.length
      }
    }

    source.connect(this.analyser)
    this.analyser.connect(this.scriptProcessor)
    this.scriptProcessor.connect(this.audioContext.destination)
    
    this.isRunning = true
  }

  async stopAudioCapture(): Promise<void> {
    this.isRunning = false
    
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect()
      this.scriptProcessor = null
    }
    
    if (this.analyser) {
      this.analyser.disconnect()
      this.analyser = null
    }
    
    if (this.audioContext) {
      await this.audioContext.close()
      this.audioContext = null
    }
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }
    
    this.bufferIndex = 0
  }

  async isCapturing(): Promise<boolean> {
    return this.isRunning
  }

  async detectPitch(): Promise<PitchResult | null> {
    if (!this.isRunning || !this.analyser) {
      return null
    }

    const buffer = this.buffer.slice()
    const result = this.yinPitchDetection(buffer, this.sampleRate)
    
    return result
  }

  private yinPitchDetection(buffer: Float32Array, sampleRate: number): PitchResult | null {
    const bufferSize = Math.min(buffer.length, 2048)
    const halfSize = bufferSize / 2
    const threshold = 0.15

    const yinBuffer = new Float32Array(halfSize)
    
    for (let tau = 1; tau < halfSize; tau++) {
      let sum = 0
      for (let j = 0; j < halfSize; j++) {
        const delta = buffer[j] - buffer[j + tau]
        sum += delta * delta
      }
      yinBuffer[tau] = sum
    }

    let runningSum = 0
    for (let tau = 1; tau < halfSize; tau++) {
      runningSum += yinBuffer[tau]
      yinBuffer[tau] *= tau / runningSum
    }

    let tau = 2
    while (tau < halfSize && yinBuffer[tau] > threshold) {
      tau++
    }

    if (tau === halfSize) return null

    while (tau + 1 < halfSize && yinBuffer[tau + 1] < yinBuffer[tau]) {
      tau++
    }

    const frequency = sampleRate / tau
    
    if (frequency < 60 || frequency > 2000) return null

    const probability = 1 - yinBuffer[tau]
    
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    const a4 = 440
    const a4Midi = 69
    const midiNote = 12 * Math.log2(frequency / a4) + a4Midi
    const midiRounded = Math.round(midiNote)
    const noteIndex = ((midiRounded % 12) + 12) % 12
    const octave = Math.floor(midiRounded / 12) - 1
    const cents = (midiNote - midiRounded) * 100

    const bufferArray = Array.from(buffer)
    const rms = Math.sqrt(bufferArray.reduce((sum, x) => sum + x * x, 0) / buffer.length)
    const dbSpl = rms > 0 ? 20 * Math.log10(rms) + 94 : -96
    const maxAmplitude = Math.max(...bufferArray.map(Math.abs))

    return {
      frequency,
      note: noteNames[noteIndex],
      octave,
      cents,
      probability,
      clarity: probability,
      volume_rms: rms,
      volume_db_spl: dbSpl,
      max_amplitude: maxAmplitude,
      timestamp: Date.now(),
    }
  }

  async getSampleRate(): Promise<number> {
    return this.sampleRate
  }

  async setSampleRate(sampleRate: number): Promise<void> {
    this.sampleRate = sampleRate
    if (this.isRunning) {
      const deviceName = this.mediaStream?.getAudioTracks()[0]?.label
      await this.stopAudioCapture()
      await this.startAudioCaptureWithSampleRate(deviceName, sampleRate)
    }
  }

  async getSupportedSampleRates(): Promise<number[]> {
    return [44100, 48000, 96000]
  }

  async getBufferSize(): Promise<number> {
    return this.buffer.length
  }

  async clearBuffer(): Promise<void> {
    this.buffer.fill(0)
    this.bufferIndex = 0
  }

  async setPitchThreshold(_threshold: number): Promise<void> {
    // Web implementation uses fixed threshold
  }

  async getAudioLevel(): Promise<AudioLevelInfo> {
    if (!this.isRunning || this.buffer.length === 0) {
      return { rms: 0, db_spl: -96, peak: 0 }
    }

    const bufferArray = Array.from(this.buffer)
    const rms = Math.sqrt(bufferArray.reduce((sum, x) => sum + x * x, 0) / this.buffer.length)
    const dbSpl = rms > 0 ? 20 * Math.log10(rms) + 94 : -96
    const peak = Math.max(...bufferArray.map(Math.abs))

    return {
      rms,
      db_spl: dbSpl,
      peak,
    }
  }
}

export function createAudioAPI(): NativeAudioAPI {
  if (isTauri()) {
    return new TauriAudioAPI()
  }
  return new WebAudioAPI()
}

export const nativeAudio = createAudioAPI()
