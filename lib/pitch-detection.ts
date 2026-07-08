// 音高检测算法模块 - 从 app/page.tsx 提取
// 包含 YIN 算法、SOLO FFT 加速 YIN、频率转音符等工具函数

// ==================== 工具函数 ====================

export function calculateRMS(buffer: Float32Array): number {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i]
  }
  return Math.sqrt(sum / buffer.length)
}

// 频率转音符名（使用#符号以匹配NOTES数组）
export function frequencyToNoteName(frequency: number): string {
  if (!frequency || frequency <= 0 || !isFinite(frequency)) {
    return ''
  }

  const A4 = 440
  const semitones = Math.round(12 * Math.log2(frequency / A4))
  let noteIndex = (9 + semitones) % 12

  if (noteIndex < 0) {
    noteIndex = noteIndex + 12
  }

  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  return noteNames[noteIndex]
}

// 计算音分数(cents)
export function calculateCents(detectedFreq: number, targetFreq: number): number {
  if (targetFreq <= 0 || detectedFreq <= 0) return 0
  const cents = 1200 * Math.log2(detectedFreq / targetFreq)
  return Math.round(cents * 10) / 10
}

export function getAdjustedCents(detectedFreq: number, targetFreq: number): number {
  if (targetFreq <= 0 || detectedFreq <= 0) return 1200
  const cents = 1200 * Math.log2(detectedFreq / targetFreq)
  const centsMod = Math.abs(cents) % 1200
  return centsMod > 600 ? 1200 - centsMod : centsMod
}

// 从频率计算音符（带音分偏差）
export function frequencyToNote(frequency: number, referenceA4: number = 440): { note: string; cents: number; octave: number } {
  if (frequency <= 0) return { note: "-", cents: 0, octave: 0 }

  const semitonesFromA4 = 12 * Math.log2(frequency / referenceA4)
  const roundedSemitones = Math.round(semitonesFromA4)
  const cents = Math.round((semitonesFromA4 - roundedSemitones) * 100)

  const noteIndex = ((roundedSemitones + 9) % 12 + 12) % 12
  const octave = 4 + Math.floor((roundedSemitones + 9) / 12)

  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

  return {
    note: noteNames[noteIndex],
    cents: cents,
    octave: octave
  }
}

// ==================== FloatFFT（复数FFT） ====================

export class FloatFFT {
  private n: number

  constructor(n: number) {
    this.n = n
  }

  complexForward(data: Float32Array): void {
    const n = this.n
    const m = Math.log2(n)

    for (let i = 0, j = 0; i < n - 1; i++) {
      if (i < j) {
        const idx1 = i * 2, idx2 = j * 2
        const tempRe = data[idx1], tempIm = data[idx1 + 1]
        data[idx1] = data[idx2]
        data[idx1 + 1] = data[idx2 + 1]
        data[idx2] = tempRe
        data[idx2 + 1] = tempIm
      }
      let k = n >> 1
      while (k <= j) {
        j -= k
        k >>= 1
      }
      j += k
    }

    for (let l = 1; l <= m; l++) {
      const le = 1 << l
      const le2 = le >> 1
      const ur = 1.0, ui = 0.0
      const sr = Math.cos(Math.PI / le2), si = -Math.sin(Math.PI / le2)

      for (let j = 0; j < le2; j++) {
        let wr = ur, wi = ui
        for (let i = j; i < n; i += le) {
          const ip = i + le2
          const idx1 = i * 2, idx2 = ip * 2
          const tr = wr * data[idx2] - wi * data[idx2 + 1]
          const ti = wr * data[idx2 + 1] + wi * data[idx2]
          data[idx2] = data[idx1] - tr
          data[idx2 + 1] = data[idx1 + 1] - ti
          data[idx1] += tr
          data[idx1 + 1] += ti
        }
        const temp = wr * sr - wi * si
        wi = wr * si + wi * sr
        wr = temp
      }
    }
  }

  complexInverse(data: Float32Array, scale: boolean): void {
    const n = this.n

    for (let i = 0; i < n; i++) {
      data[i * 2 + 1] = -data[i * 2 + 1]
    }

    this.complexForward(data)

    for (let i = 0; i < n; i++) {
      const idx = i * 2
      data[idx] = -data[idx]
      data[idx + 1] = -data[idx + 1]
      if (scale) {
        data[idx] /= n
        data[idx + 1] /= n
      }
    }
  }
}

// ==================== SOLO YIN算法 - FFT加速版本 ====================

export class SOLOYinAnalyser {
  private sampleRate: number = 48000
  private audioBufferSize: number = 2048
  private threshold: number = 0.2
  private yinBuffer: Float32Array | null = null
  private audioBufferFFT: Float32Array | null = null
  private kernel: Float32Array | null = null
  private yinStyleACF: Float32Array | null = null
  private fft: FloatFFT | null = null
  private pitch: number = -1
  private probability: number = -1
  private valid: boolean = false
  private volumeRMS: number = 0
  private maxAmplitude: number = 0
  private octaveHistory: number[] = []
  private maxOctaveHistory: number = 5
  private lastAmplitude: number = 0
  private noiseFloor: number = 0.003
  private noiseAlpha: number = 0.995
  private hpFilterState: { b0: number; b1: number; b2: number; a1: number; a2: number; x1: number; x2: number; y1: number; y2: number } | null = null
  private lpFilterState: { b0: number; b1: number; b2: number; a1: number; a2: number; x1: number; x2: number; y1: number; y2: number } | null = null
  private enableHighPass: boolean = true
  private enableLowPass: boolean = true
  private highPassCutoff: number = 35
  private lowPassCutoff: number = 4500

  setSampleRate(rate: number): void {
    this.sampleRate = rate
    this._rebuildFilters()
  }

  private _createBiquad(type: 'highpass' | 'lowpass', freq: number, q: number) {
    const sr = this.sampleRate
    const w0 = 2 * Math.PI * freq / sr
    const cosW0 = Math.cos(w0)
    const sinW0 = Math.sin(w0)
    const alpha = sinW0 / (2 * q)
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number
    if (type === 'highpass') {
      b0 = (1 + cosW0) / 2; b1 = -(1 + cosW0); b2 = (1 + cosW0) / 2
      a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha
    } else {
      b0 = (1 - cosW0) / 2; b1 = 1 - cosW0; b2 = (1 - cosW0) / 2
      a0 = 1 + alpha; a1 = -2 * cosW0; a2 = 1 - alpha
    }
    return { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0, x1: 0, x2: 0, y1: 0, y2: 0 }
  }

  private _rebuildFilters(): void {
    this.hpFilterState = this._createBiquad('highpass', this.highPassCutoff, 0.707)
    this.lpFilterState = this._createBiquad('lowpass', this.lowPassCutoff, 0.707)
  }

  private _applyBiquad(filter: { b0: number; b1: number; b2: number; a1: number; a2: number; x1: number; x2: number; y1: number; y2: number }, sample: number): number {
    const y0 = filter.b0 * sample + filter.b1 * filter.x1 + filter.b2 * filter.x2 - filter.a1 * filter.y1 - filter.a2 * filter.y2
    filter.x2 = filter.x1; filter.x1 = sample; filter.y2 = filter.y1; filter.y1 = y0
    return y0
  }

  private _prefilterBuffer(buffer: Float32Array): Float32Array {
    if (!this.hpFilterState) this._rebuildFilters()
    const output = new Float32Array(buffer.length)
    for (let i = 0; i < buffer.length; i++) {
      let sample = buffer[i]
      if (this.enableHighPass && this.hpFilterState) sample = this._applyBiquad(this.hpFilterState, sample)
      if (this.enableLowPass && this.lpFilterState) sample = this._applyBiquad(this.lpFilterState, sample)
      output[i] = sample
    }
    return output
  }

  private _octaveCorrection(frequency: number, tau: number, yinBuffer: Float32Array, sampleRate: number): { frequency: number; probability: number } {
    const minTau = Math.floor(sampleRate / 1400)
    const maxTau = Math.min(Math.floor(sampleRate / 70), yinBuffer.length - 1)
    if (tau < minTau * 2) return { frequency, probability: 1 - yinBuffer[tau] }
    const octaveTau = Math.round(tau / 2)
    if (octaveTau < minTau || octaveTau >= maxTau) return { frequency, probability: 1 - yinBuffer[tau] }
    const octaveVal = yinBuffer[octaveTau]
    const currentVal = yinBuffer[tau]
    const octaveProb = 1 - octaveVal
    const currentProb = 1 - currentVal
    if (octaveVal < this.threshold * 0.8 && Math.abs(octaveTau * 2 - tau) <= 2) {
      const octaveFreq = sampleRate / octaveTau
      if (this.octaveHistory.length >= 2) {
        const recent = this.octaveHistory.slice(-3)
        const avg = recent.reduce((a, b) => a + b, 0) / recent.length
        const currentOct = Math.floor(12 * Math.log2(frequency / 440) / 12 + 4)
        const octaveOct = Math.floor(12 * Math.log2(octaveFreq / 440) / 12 + 4)
        if (Math.abs(octaveOct - avg) < Math.abs(currentOct - avg)) {
          this.octaveHistory.push(octaveOct)
          if (this.octaveHistory.length > this.maxOctaveHistory) this.octaveHistory.shift()
          return { frequency: octaveFreq, probability: octaveProb }
        }
      }
      if (octaveProb > currentProb * 0.9) {
        this.octaveHistory.push(Math.floor(12 * Math.log2(octaveFreq / 440) / 12 + 4))
        if (this.octaveHistory.length > this.maxOctaveHistory) this.octaveHistory.shift()
        return { frequency: octaveFreq, probability: octaveProb }
      }
    }
    this.octaveHistory.push(Math.floor(12 * Math.log2(frequency / 440) / 12 + 4))
    if (this.octaveHistory.length > this.maxOctaveHistory) this.octaveHistory.shift()
    return { frequency, probability: currentProb }
  }

  detectAmplitudeDiff(): boolean {
    const diff = this.volumeRMS - this.lastAmplitude
    this.lastAmplitude = this.lastAmplitude * 0.9 + this.volumeRMS * 0.1
    return diff > 0.15
  }

  setAudioBufferSize(size: number): void {
    this.audioBufferSize = size
    const halfSize = Math.floor(size / 2)
    this.yinBuffer = new Float32Array(halfSize)
    this.audioBufferFFT = new Float32Array(size * 2)
    this.kernel = new Float32Array(size * 2)
    this.yinStyleACF = new Float32Array(size * 2)
    this.fft = new FloatFFT(size)
  }

  getVolumeRMS(): number {
    return this.volumeRMS
  }

  getMaxAmplitude(): number {
    return this.maxAmplitude
  }

  private calculateRMS(buffer: Float32Array): void {
    let sum = 0
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i]
    }
    this.volumeRMS = Math.sqrt(sum / buffer.length)
  }

  private calculateMaxAmplitude(buffer: Float32Array): void {
    let max = 0
    for (let i = 0; i < buffer.length; i++) {
      if (Math.abs(buffer[i]) > max) {
        max = Math.abs(buffer[i])
      }
    }
    this.maxAmplitude = max
  }

  private difference(buffer: Float32Array): void {
    if (!this.yinBuffer || !this.audioBufferFFT || !this.kernel || !this.yinStyleACF || !this.fft) {
      return
    }

    const halfN = this.yinBuffer.length
    const energyTerms = new Float32Array(halfN)

    for (let i = 0; i < halfN; i++) {
      energyTerms[0] += buffer[i] * buffer[i]
    }

    for (let tau = 1; tau < halfN; tau++) {
      energyTerms[tau] = energyTerms[tau - 1] - buffer[tau - 1] * buffer[tau - 1] + buffer[halfN + tau] * buffer[halfN + tau]
    }

    for (let i = 0; i < buffer.length; i++) {
      this.audioBufferFFT[i * 2] = buffer[i]
      this.audioBufferFFT[i * 2 + 1] = 0
    }

    this.fft.complexForward(this.audioBufferFFT)

    for (let i = 0; i < halfN; i++) {
      this.kernel[i * 2] = buffer[halfN - 1 - i]
      this.kernel[i * 2 + 1] = 0
      this.kernel[buffer.length + i * 2] = 0
      this.kernel[buffer.length + i * 2 + 1] = 0
    }

    this.fft.complexForward(this.kernel)

    for (let i = 0; i < buffer.length; i++) {
      const idx = i * 2
      const re1 = this.audioBufferFFT[idx]
      const im1 = this.audioBufferFFT[idx + 1]
      const re2 = this.kernel[idx]
      const im2 = this.kernel[idx + 1]
      this.yinStyleACF[idx] = re1 * re2 - im1 * im2
      this.yinStyleACF[idx + 1] = re1 * im2 + im1 * re2
    }

    this.fft.complexInverse(this.yinStyleACF, true)

    for (let tau = 0; tau < halfN; tau++) {
      const acfValue = this.yinStyleACF[2 * (halfN - 1 + tau)]
      this.yinBuffer[tau] = energyTerms[0] + energyTerms[tau] - 2 * acfValue
    }
  }

  private cumulativeMeanNormalizedDifference(): void {
    if (!this.yinBuffer) return

    this.yinBuffer[0] = 1.0
    let runningSum = 0

    for (let tau = 1; tau < this.yinBuffer.length; tau++) {
      runningSum += this.yinBuffer[tau]
      this.yinBuffer[tau] = this.yinBuffer[tau] * tau / runningSum
    }
  }

  private absoluteThreshold(): number {
    if (!this.yinBuffer) return -1

    for (let tau = 2; tau < this.yinBuffer.length; tau++) {
      if (this.yinBuffer[tau] < this.threshold) {
        while (tau + 1 < this.yinBuffer.length && this.yinBuffer[tau + 1] < this.yinBuffer[tau]) {
          tau++
        }
        this.probability = 1 - this.yinBuffer[tau]
        return tau
      }
    }

    this.probability = 0
    this.valid = false
    return -1
  }

  private parabolicInterpolation(tauEstimate: number): number {
    if (!this.yinBuffer) return tauEstimate

    let x0 = tauEstimate < 1 ? tauEstimate : tauEstimate - 1
    let x2 = tauEstimate + 1

    if (x2 >= this.yinBuffer.length) {
      x2 = tauEstimate
    }

    if (x0 === tauEstimate) {
      return this.yinBuffer[tauEstimate] <= this.yinBuffer[x2] ? tauEstimate : x2
    }

    if (x2 === tauEstimate) {
      return this.yinBuffer[tauEstimate] <= this.yinBuffer[x0] ? tauEstimate : x0
    }

    const s0 = this.yinBuffer[x0]
    const s1 = this.yinBuffer[tauEstimate]
    const s2 = this.yinBuffer[x2]

    const denom = s0 + s2 - 2 * s1
    if (denom === 0) return tauEstimate

    return tauEstimate + (s0 - s2) / (2 * denom)
  }

  analyze(buffer: Float32Array): { frequency: number; probability: number; valid: boolean; volumeRMS: number; maxAmplitude: number } | null {
    if (!this.yinBuffer || !this.fft || this.audioBufferSize !== buffer.length) {
      this.setAudioBufferSize(buffer.length)
    }

    const filteredBuffer = this._prefilterBuffer(buffer)

    this.calculateRMS(filteredBuffer)
    this.calculateMaxAmplitude(filteredBuffer)

    this.noiseFloor = this.noiseAlpha * this.noiseFloor + (1 - this.noiseAlpha) * Math.min(this.volumeRMS, this.noiseFloor)
    const adaptiveThreshold = Math.max(0.003, this.noiseFloor * 2.5)
    if (this.volumeRMS < adaptiveThreshold) {
      this.octaveHistory = []
      return null
    }

    this.difference(filteredBuffer)
    this.cumulativeMeanNormalizedDifference()

    const tauEstimate = this.absoluteThreshold()

    if (tauEstimate === -1) {
      return null
    }

    const betterTau = this.parabolicInterpolation(tauEstimate)
    const rawFrequency = this.sampleRate / betterTau

    const corrected = this._octaveCorrection(rawFrequency, tauEstimate, this.yinBuffer!, this.sampleRate)
    this.pitch = corrected.frequency
    this.probability = corrected.probability
    this.valid = true

    return {
      frequency: this.pitch,
      probability: this.probability,
      valid: this.valid,
      volumeRMS: this.volumeRMS,
      maxAmplitude: this.maxAmplitude
    }
  }
}

// SOLO算法实例（延迟初始化）
let soloYinAnalyser: SOLOYinAnalyser | null = null

export function getSOLOYinAnalyser(bufferSize?: number, sampleRate?: number): SOLOYinAnalyser {
  if (!soloYinAnalyser) {
    soloYinAnalyser = new SOLOYinAnalyser()
  }
  if (sampleRate !== undefined) {
    soloYinAnalyser.setSampleRate(sampleRate)
  }
  if (bufferSize !== undefined) {
    soloYinAnalyser.setAudioBufferSize(bufferSize)
  }
  return soloYinAnalyser
}

// ==================== 标准YIN算法（带八度修正 + 前置滤波） ====================

let yinOctaveHistory: number[] = []
let yinLastAmplitude = 0
let yinNoiseFloor = 0.003
const YIN_NOISE_ALPHA = 0.995

export function YINPrefilter(buffer: Float32Array, sampleRate: number): Float32Array {
  const output = new Float32Array(buffer.length)
  const hpW0 = 2 * Math.PI * 35 / sampleRate
  const hpCos = Math.cos(hpW0), hpSin = Math.sin(hpW0), hpAlpha = hpSin / 1.414
  const hpA0 = 1 + hpAlpha
  const hpB0 = (1 + hpCos) / 2 / hpA0, hpB1 = -(1 + hpCos) / hpA0, hpB2 = (1 + hpCos) / 2 / hpA0, hpA1 = -2 * hpCos / hpA0, hpA2 = (1 - hpAlpha) / hpA0
  const lpW0 = 2 * Math.PI * 4500 / sampleRate
  const lpCos = Math.cos(lpW0), lpSin = Math.sin(lpW0), lpAlpha = lpSin / 1.414
  const lpA0 = 1 + lpAlpha
  const lpB0 = (1 - lpCos) / 2 / lpA0, lpB1 = (1 - lpCos) / lpA0, lpB2 = (1 - lpCos) / 2 / lpA0, lpA1 = -2 * lpCos / lpA0, lpA2 = (1 - lpAlpha) / lpA0
  let hpX1 = 0, hpX2 = 0, hpY1 = 0, hpY2 = 0
  let lpX1 = 0, lpX2 = 0, lpY1 = 0, lpY2 = 0
  for (let i = 0; i < buffer.length; i++) {
    let s = buffer[i]
    const hpY0 = hpB0 * s + hpB1 * hpX1 + hpB2 * hpX2 - hpA1 * hpY1 - hpA2 * hpY2
    hpX2 = hpX1; hpX1 = s; hpY2 = hpY1; hpY1 = hpY0
    s = hpY0
    const lpY0 = lpB0 * s + lpB1 * lpX1 + lpB2 * lpX2 - lpA1 * lpY1 - lpA2 * lpY2
    lpX2 = lpX1; lpX1 = s; lpY2 = lpY1; lpY1 = lpY0
    output[i] = lpY0
  }
  return output
}

export function YINOcctaveCorrection(frequency: number, tau: number, d: Float32Array, sampleRate: number, threshold: number): { frequency: number; probability: number } {
  const minTau = Math.floor(sampleRate / 1400)
  const maxTau = Math.min(Math.floor(sampleRate / 70), d.length - 1)
  if (tau < minTau * 2) return { frequency, probability: 1 - d[tau] }
  const octaveTau = Math.round(tau / 2)
  if (octaveTau < minTau || octaveTau >= maxTau) return { frequency, probability: 1 - d[tau] }
  const octaveVal = d[octaveTau]
  const currentProb = 1 - d[tau]
  const octaveProb = 1 - octaveVal
  if (octaveVal < threshold * 0.8 && Math.abs(octaveTau * 2 - tau) <= 2) {
    const octaveFreq = sampleRate / octaveTau
    if (yinOctaveHistory.length >= 2) {
      const recent = yinOctaveHistory.slice(-3)
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length
      const currentOct = Math.floor(12 * Math.log2(frequency / 440) / 12 + 4)
      const octaveOct = Math.floor(12 * Math.log2(octaveFreq / 440) / 12 + 4)
      if (Math.abs(octaveOct - avg) < Math.abs(currentOct - avg)) {
        yinOctaveHistory.push(octaveOct)
        if (yinOctaveHistory.length > 5) yinOctaveHistory.shift()
        return { frequency: octaveFreq, probability: octaveProb }
      }
    }
    if (octaveProb > currentProb * 0.9) {
      yinOctaveHistory.push(Math.floor(12 * Math.log2(octaveFreq / 440) / 12 + 4))
      if (yinOctaveHistory.length > 5) yinOctaveHistory.shift()
      return { frequency: octaveFreq, probability: octaveProb }
    }
  }
  yinOctaveHistory.push(Math.floor(12 * Math.log2(frequency / 440) / 12 + 4))
  if (yinOctaveHistory.length > 5) yinOctaveHistory.shift()
  return { frequency, probability: currentProb }
}

export function YINPitchDetection(float32AudioBuffer: Float32Array, sampleRate: number, threshold: number = 0.15, probabilityCliff: number = 0.1): { frequency: number; probability: number } | null {
  const filtered = YINPrefilter(float32AudioBuffer, sampleRate)
  const buffer = filtered
  const N = buffer.length
  const halfN = Math.floor(N / 2)
  const d = new Float32Array(halfN)

  let rms = 0
  for (let i = 0; i < N; i++) rms += buffer[i] * buffer[i]
  rms = Math.sqrt(rms / N)
  yinNoiseFloor = YIN_NOISE_ALPHA * yinNoiseFloor + (1 - YIN_NOISE_ALPHA) * Math.min(rms, yinNoiseFloor)
  const adaptiveThreshold = Math.max(0.003, yinNoiseFloor * 2.5)
  if (rms < adaptiveThreshold) {
    yinOctaveHistory = []
    return null
  }

  for (let tau = 0; tau < halfN; tau++) {
    let sum = 0
    for (let i = 0; i < halfN; i++) {
      const diff = buffer[i] - buffer[i + tau]
      sum += diff * diff
    }
    d[tau] = sum
  }

  let runningSum = 0
  d[0] = 1
  for (let tau = 1; tau < halfN; tau++) {
    runningSum += d[tau]
    d[tau] = d[tau] * tau / runningSum
  }

  let tauEstimate = -1
  for (let tau = 1; tau < halfN; tau++) {
    if (d[tau] < threshold) {
      while (tau + 1 < halfN && d[tau + 1] < d[tau]) tau++
      tauEstimate = tau
      break
    }
  }

  if (tauEstimate === -1) return null

  let betterTau = tauEstimate
  if (tauEstimate > 0 && tauEstimate < halfN - 1) {
    const s0 = d[tauEstimate - 1], s1 = d[tauEstimate], s2 = d[tauEstimate + 1]
    const denom = (s0 + s2 - 2 * s1)
    if (denom !== 0) {
      const delta = (s0 - s2) / (2 * denom)
      betterTau = tauEstimate + delta
    }
  }

  const rawFrequency = sampleRate / betterTau
  const corrected = YINOcctaveCorrection(rawFrequency, tauEstimate, d, sampleRate, threshold)

  if (corrected.probability < probabilityCliff) return null

  return { frequency: corrected.frequency, probability: corrected.probability }
}

// YINDetector 函数
export function YINDetector(config: { threshold?: number; probabilityCliff?: number } = {}) {
  const threshold = config.threshold || 0.15
  const probabilityCliff = config.probabilityCliff || 0.1
  return function(float32AudioBuffer: Float32Array) {
    return YINPitchDetection(float32AudioBuffer, 48000, threshold, probabilityCliff)
  }
}
