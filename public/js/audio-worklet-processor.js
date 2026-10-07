class PitchDetectionProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const processorOptions = options?.processorOptions || {};

    this.yinThreshold = processorOptions.threshold || 0.15;
    this.yinProbabilityCliff = processorOptions.probabilityCliff || 0.1;
    this.sampleRate = processorOptions.sampleRate || 48000;

    this.bufferSize = processorOptions.bufferSize || 2048;
    this.hopSize = processorOptions.hopSize || 512;
    this.inputBuffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;

    this.overlapBuffer = new Float32Array(this.bufferSize);
    this.overlapValid = false;

    this.frameCount = 0;
    this.lastDetectionTime = 0;
    this.detectionCount = 0;

    this.lastFrequency = null;
    this.lastProbability = 0;
    this.smoothingFactor = processorOptions.smoothingFactor || 0.3;

    // 起音（onset）检测参数 —— 与 lib/note-confirm.ts 的 ONSET_DEFAULTS 同源，三处保持一致。
    //
    // 原实现是 `diff > 0.15`（绝对 RMS 差 ≈ −16 dBFS）配 EMA 基线：
    //   ① 0.15 这个量级正常拨弦的帧间增量远达不到 ⇒ isNoteOnset 几乎恒为 false
    //      （Rust 侧同值，见 pipeline.rs 的 amplitude_diff_threshold）；
    //   ② EMA 基线在**稳态长音**下会慢慢追上当前电平，于是每过一个不应期就重新满足
    //      倍数条件 ⇒ 持音被反复判成起音。
    // 现在改成「相对**上一帧原始 RMS** 1.45 倍 + 绝对增量 ≥ 门限 × 0.5」双条件 + 不应期。
    // 绝对增量跟着门限缩放（而不是像 GuitarRun 那样写死 0.004）的理由见 lib/note-confirm.ts。
    this.lastAmplitude = null;
    this.onsetRelativeRatio = processorOptions.onsetRelativeRatio || 1.45;
    this.onsetGateDeltaRatio = processorOptions.onsetGateDeltaRatio || 0.5;
    this.onsetRefractoryMs = processorOptions.onsetRefractoryMs || 75;
    this.lastNoteOnsetTime = -Infinity;

    this.highPassCutoff = 35;
    this.lowPassCutoff = 4500;
    this.enableHighPass = true;
    this.enableLowPass = true;

    // 工频陷波：与 Rust 侧 preprocessor.rs（notch_freq_50=50 / notch_freq_60=60 / Q=15，默认开启）
    // 以及 lib/pitch-detection.ts 的 NOTCH_FREQS/NOTCH_Q 保持一致。
    // 50/60Hz 工频哼声落在贝斯音域内，会被 YIN 当成概率 0.9+ 的「稳定音高」并通过置信门限。
    this.notchFreqs = processorOptions.notchFreqs || [50, 60];
    this.notchQ = processorOptions.notchQ || 15;

    this.hpFilter = this._createBiquad('highpass', this.highPassCutoff, 0.707);
    this.lpFilter = this._createBiquad('lowpass', this.lowPassCutoff, 0.707);
    this.notchFilters = this.notchFreqs.map((f) => this._createBiquad('notch', f, this.notchQ));

    // 可检测频率带：与 lib/pitch-detection.ts 的 MIN_DETECT_FREQ / MAX_DETECT_FREQ 保持一致。
    // 下限原为写死的 70Hz —— 那会让 4/5 弦贝斯（最低 E1 41.20Hz / B0 30.87Hz）与
    // 七弦低 B（61.74Hz）在 web 默认路径下完全检不出来（应用明确支持这些乐器）。
    // 现在下限由页面按当前乐器推送（minDetectFreq）。**搜索下限本身就是工频哼声的护栏**：
    // 只要它高于 50/60Hz，哼声（含其谐波，它们同以 50/60Hz 为公共周期）就不在搜索范围内；
    // 所以吉他族保持 70Hz 级，只有贝斯/七弦才下探。
    // 注意：能否达到下限还受窗口长度约束 —— 可解析的最长周期是 halfBufferSize 个采样，
    // 所以贝斯需要 bufferSize >= 4096（2048 时最长周期 1024 采样 ≈ 46.9Hz）。
    this.minDetectFreq = processorOptions.minDetectFreq || 27.5;
    this.maxDetectFreq = 1400;

    this.octaveHistory = [];
    this.maxOctaveHistory = 5;

    this.strictProbabilityThreshold = 0.91;

    // 噪声底（RMS）。这是 EMA 的**运行时状态**，不是配置项：
    //   - processorOptions.noiseFloor：用户主动校准过的初值（见 lib/noise-calibration.ts），
    //     让门限一上来就对上当前房间，而不是等 EMA 从 0.0005 慢慢爬上去
    //     （向上爬的 alpha 是 0.0005，约需 20 秒）。
    //   - updateParams.noiseFloor：校准完成时的**一次性**覆盖。
    // 两者都只负责「设一个更好的起点」，之后 EMA 照常跟踪 —— 每一帧都下发会把 EMA 钉死，
    // 那样换房间/关空调后门限再也不会自适应，所以页面侧不这么做。
    const initialNoiseFloor = Number(processorOptions.noiseFloor);
    this.noiseFloor =
      Number.isFinite(initialNoiseFloor) && initialNoiseFloor > 0 ? initialNoiseFloor : 0.0005;

    this.port.onmessage = (event) => {
      const { type, data } = event.data;
      if (type === 'updateParams') {
        if (data.threshold !== undefined) this.yinThreshold = data.threshold;
        if (data.probabilityCliff !== undefined) this.yinProbabilityCliff = data.probabilityCliff;
        if (data.sampleRate !== undefined) {
          this.sampleRate = data.sampleRate;
          this.hpFilter = this._createBiquad('highpass', this.highPassCutoff, 0.707);
          this.lpFilter = this._createBiquad('lowpass', this.lowPassCutoff, 0.707);
          this.notchFilters = this.notchFreqs.map((f) => this._createBiquad('notch', f, this.notchQ));
        }
        if (data.hopSize !== undefined) this.hopSize = data.hopSize;
        if (data.minDetectFreq !== undefined) {
          this.minDetectFreq = Math.min(Math.max(data.minDetectFreq, 27.5), this.maxDetectFreq);
        }
        if (data.smoothingFactor !== undefined) this.smoothingFactor = data.smoothingFactor;
        // 用户校准出的环境噪声底：一次性覆盖 EMA 状态（传 null 表示清除、回到默认）
        if (data.noiseFloor !== undefined) {
          const nf = Number(data.noiseFloor);
          this.noiseFloor = Number.isFinite(nf) && nf > 0 ? nf : 0.0005;
        }
        if (data.strictProbability !== undefined) this.strictProbabilityThreshold = data.strictProbability;
        if (data.enableHighPass !== undefined) this.enableHighPass = data.enableHighPass;
        if (data.enableLowPass !== undefined) this.enableLowPass = data.enableLowPass;
        if (data.highPassCutoff !== undefined) {
          this.highPassCutoff = data.highPassCutoff;
          this.hpFilter = this._createBiquad('highpass', this.highPassCutoff, 0.707);
        }
        if (data.lowPassCutoff !== undefined) {
          this.lowPassCutoff = data.lowPassCutoff;
          this.lpFilter = this._createBiquad('lowpass', this.lowPassCutoff, 0.707);
        }
      }
    };
  }

  _createBiquad(type, freq, q) {
    const sr = this.sampleRate;
    const w0 = 2 * Math.PI * freq / sr;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * q);

    let b0, b1, b2, a0, a1, a2;

    if (type === 'highpass') {
      b0 = (1 + cosW0) / 2;
      b1 = -(1 + cosW0);
      b2 = (1 + cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
    } else if (type === 'notch') {
      b0 = 1;
      b1 = -2 * cosW0;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
    } else {
      b0 = (1 - cosW0) / 2;
      b1 = 1 - cosW0;
      b2 = (1 - cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
    }

    return {
      b0: b0 / a0, b1: b1 / a0, b2: b2 / a0,
      a1: a1 / a0, a2: a2 / a0,
      x1: 0, x2: 0, y1: 0, y2: 0
    };
  }

  _applyBiquad(filter, sample) {
    const y0 = filter.b0 * sample + filter.b1 * filter.x1 + filter.b2 * filter.x2
      - filter.a1 * filter.y1 - filter.a2 * filter.y2;
    filter.x2 = filter.x1;
    filter.x1 = sample;
    filter.y2 = filter.y1;
    filter.y1 = y0;
    return y0;
  }

  _prefilterBuffer(buffer) {
    const output = new Float32Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      let sample = buffer[i];
      if (this.enableHighPass) {
        sample = this._applyBiquad(this.hpFilter, sample);
      }
      if (this.enableLowPass) {
        sample = this._applyBiquad(this.lpFilter, sample);
      }
      for (let k = 0; k < this.notchFilters.length; k++) {
        sample = this._applyBiquad(this.notchFilters[k], sample);
      }
      output[i] = sample;
    }
    return output;
  }

  yinPitchDetection(audioBuffer, sampleRate, threshold) {
    const bufferSize = audioBuffer.length;
    const halfBufferSize = Math.floor(bufferSize / 2);

    const difference = new Float32Array(halfBufferSize);

    for (let tau = 0; tau < halfBufferSize; tau++) {
      let diff = 0;
      const limit = Math.min(halfBufferSize, bufferSize - tau);
      for (let i = 0; i < limit; i++) {
        const delta = audioBuffer[i] - audioBuffer[i + tau];
        diff += delta * delta;
      }
      difference[tau] = diff;
    }

    difference[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < halfBufferSize; tau++) {
      runningSum += difference[tau];
      if (runningSum > 0) {
        difference[tau] = difference[tau] * tau / runningSum;
      } else {
        difference[tau] = 1;
      }
    }

    // 搜索范围由构造函数里的 minDetectFreq / maxDetectFreq 决定（页面按乐器推送下限）
    const minTau = Math.floor(sampleRate / this.maxDetectFreq);
    const maxTau = Math.min(Math.floor(sampleRate / this.minDetectFreq), halfBufferSize - 1);

    let tauEstimate = -1;
    let minValue = threshold;
    // 诊断用：搜索区间内 CMND 的最小值。找不到 tau 时用它区分
    // 「信号本身没有周期性」（minDiff 远大于 threshold）与「搜索范围/逻辑出错」（minDiff 很小却没取到）。
    let minDiff = Infinity;

    for (let tau = Math.max(2, minTau); tau < maxTau; tau++) {
      if (difference[tau] < minDiff) minDiff = difference[tau];
      if (difference[tau] < minValue) {
        while (tau + 1 < maxTau && difference[tau + 1] < difference[tau]) {
          tau++;
        }
        tauEstimate = tau;
        minValue = difference[tau];
        break;
      }
    }

    if (tauEstimate === -1) {
      return { frequency: null, probability: 0, clarity: 0, minDiff, minTau, maxTau, tau: null };
    }

    let betterTau = tauEstimate;
    if (tauEstimate > 0 && tauEstimate < halfBufferSize - 1) {
      const alpha = difference[tauEstimate - 1];
      const beta = difference[tauEstimate];
      const gamma = difference[tauEstimate + 1];
      const denominator = alpha - 2 * beta + gamma;
      if (Math.abs(denominator) > 0.0001) {
        const p = 0.5 * (alpha - gamma) / denominator;
        betterTau = tauEstimate + p;
      }
    }

    const frequency = sampleRate / betterTau;
    const probability = 1 - difference[tauEstimate];

    let clarity = 0;
    if (tauEstimate > 0) {
      clarity = difference[tauEstimate - 1] - difference[tauEstimate];
    }

    const correctedResult = this._octaveCorrection(frequency, tauEstimate, difference, halfBufferSize, sampleRate, minTau, maxTau);

    return {
      frequency: correctedResult.frequency,
      probability: correctedResult.probability,
      clarity: correctedResult.clarity || clarity,
      minDiff,
      minTau,
      maxTau,
      tau: tauEstimate
    };
  }

  _octaveCorrection(frequency, tau, difference, halfSize, sampleRate, minTau, maxTau) {
    if (tau < minTau * 2) {
      return { frequency, probability: 1 - difference[tau] };
    }

    const octaveTau = Math.round(tau / 2);
    if (octaveTau < minTau || octaveTau >= maxTau) {
      return { frequency, probability: 1 - difference[tau] };
    }

    const octaveVal = difference[octaveTau];
    const currentVal = difference[tau];
    const octaveProbability = 1 - octaveVal;
    const currentProbability = 1 - currentVal;

    if (octaveVal < this.yinThreshold * 0.8 && this._verifyOctaveRelationship(tau, octaveTau)) {
      const octaveFreq = sampleRate / octaveTau;

      if (this.octaveHistory.length >= 2) {
        const recentOctaves = this.octaveHistory.slice(-3);
        const avgOctave = recentOctaves.reduce((a, b) => a + b, 0) / recentOctaves.length;
        const currentOctave = Math.floor(12 * Math.log2(frequency / 440) / 12 + 4);
        const octaveOctave = Math.floor(12 * Math.log2(octaveFreq / 440) / 12 + 4);

        if (Math.abs(octaveOctave - avgOctave) < Math.abs(currentOctave - avgOctave)) {
          this.octaveHistory.push(Math.floor(12 * Math.log2(octaveFreq / 440) / 12 + 4));
          if (this.octaveHistory.length > this.maxOctaveHistory) this.octaveHistory.shift();
          return { frequency: octaveFreq, probability: octaveProbability, clarity: octaveProbability };
        }
      }

      if (octaveProbability > currentProbability * 0.9) {
        this.octaveHistory.push(Math.floor(12 * Math.log2(octaveFreq / 440) / 12 + 4));
        if (this.octaveHistory.length > this.maxOctaveHistory) this.octaveHistory.shift();
        return { frequency: octaveFreq, probability: octaveProbability, clarity: octaveProbability };
      }
    }

    this.octaveHistory.push(Math.floor(12 * Math.log2(frequency / 440) / 12 + 4));
    if (this.octaveHistory.length > this.maxOctaveHistory) this.octaveHistory.shift();

    return { frequency, probability: currentProbability };
  }

  _verifyOctaveRelationship(tau, octaveTau) {
    return Math.abs(octaveTau * 2 - tau) <= 2;
  }

  calculateRMS(buffer, length) {
    let sum = 0;
    const len = length || buffer.length;
    for (let i = 0; i < len; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / len);
  }

  /**
   * 起音检测：本帧是否是一次新的拨弦。
   *
   * 等价实现见 lib/note-confirm.ts 的 detectOnset()（TS 回退路径用）与
   * src-tauri/src/audio/pipeline.rs 的 detect_amplitude_diff()。三处改动必须同步。
   *
   * ⚠️ 两条容易"顺手优化错"的地方，改之前先读 lib/note-confirm.ts 的模块注释：
   *  1. 基线是**上一帧的原始 RMS**，不是 EMA。用 EMA 会让稳态长音被反复判成起音。
   *  2. 绝对增量下限要**跟着噪声门缩放**，不能照抄 GuitarRun 的 0.004
   *     （那配的是它 0.007 起的门限；我们门限下限 0.0008，照抄会让轻弹判不出起音）。
   *
   * @param {number} rms  本帧 RMS
   * @param {number} gate 当前噪声门限（RMS）
   * @param {number} now  本帧时刻（秒，与 currentTime 同源）
   * @returns {boolean}
   */
  _detectAmplitudeDiff(rms, gate, now) {
    const prev = this.lastAmplitude;
    const minDelta = gate * this.onsetGateDeltaRatio;

    const isOnset =
      prev !== null &&
      rms >= gate &&
      rms > prev * this.onsetRelativeRatio &&
      rms - prev > minDelta &&
      now - this.lastNoteOnsetTime >= this.onsetRefractoryMs / 1000;

    this.lastAmplitude = rms;
    if (isOnset) this.lastNoteOnsetTime = now;
    return isOnset;
  }

  smoothFrequency(newFreq, newProb) {
    if (newFreq === null) {
      this.lastFrequency = null;
      return null;
    }

    if (this.lastFrequency === null) {
      this.lastFrequency = newFreq;
      this.lastProbability = newProb;
      return newFreq;
    }

    const centsDiff = 1200 * Math.abs(Math.log2(newFreq / this.lastFrequency));

    if (centsDiff > 50) {
      this.lastFrequency = newFreq;
      this.lastProbability = newProb;
      return newFreq;
    }

    const effectiveSmoothing = this.smoothingFactor * (1 - newProb * 0.5);

    const smoothedFreq = this.lastFrequency * effectiveSmoothing + newFreq * (1 - effectiveSmoothing);
    this.lastFrequency = smoothedFreq;
    this.lastProbability = newProb;

    return smoothedFreq;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input[0]) {
      return true;
    }

    const inputChannel = input[0];
    const outputChannel = output[0];

    outputChannel.set(inputChannel);

    const inputLength = inputChannel.length;

    for (let i = 0; i < this.bufferSize - inputLength; i++) {
      this.inputBuffer[i] = this.inputBuffer[i + inputLength];
    }

    for (let i = 0; i < inputLength; i++) {
      this.inputBuffer[this.bufferSize - inputLength + i] = inputChannel[i];
    }

    this.bufferIndex += inputLength;

    if (this.bufferIndex >= this.hopSize) {
      this.bufferIndex = 0;

      const energy = this.calculateRMS(this.inputBuffer, this.bufferSize);

      // 噪声底跟踪：下降快、上升极慢。
      // 原实现用 Math.min(energy, noiseFloor) 只允许下降，且初值 0.003 长期不收敛，
      // 门限恒为 max(0.003, 0.003*2.5)=0.0075(≈-42dBFS)，导致轻弹直接进不了检测。
      const nfAlpha = energy < this.noiseFloor ? 0.05 : 0.0005;
      this.noiseFloor += (energy - this.noiseFloor) * nfAlpha;
      // 门限 = 噪声底 1.5 倍（原 2.5），绝对下限 0.0008(≈-62dBFS)。
      // 系数由 2.5 降到 1.5 的依据（.workbuddy/tools/scan-sensitivity.cjs 的
      // 「底噪 × 信号幅度 → 检出率 + 误检率」矩阵）：
      //   门限一旦被环境底噪抬起来，可检出的最轻信号约在「门限 +10dB」处断崖。
      //   ×2.5 时底噪 -42dBFS → 门限 -34dBFS → 轻于 -24dBFS 就检不出（用户表现为
      //   「要弹得比较响才有反应」）；×1.5 后同一底噪下可检到 -34dBFS，宽松约 10dB。
      //   同期实测误检率（纯底噪被判成音高）仍为 0%，故不引入噪声误触发。
      const adaptiveThreshold = Math.max(0.0008, this.noiseFloor * 1.5);

      // 起音检测必须排在噪声门**之前**：门限以下的帧也要更新 lastAmplitude，
      // 否则「从门限下升上来」的那一帧永远判不出起音 —— 它的上一帧已经被下面 return 掉了，
      // lastAmplitude 会一直停在最后一次有声帧的电平上。
      // 前端 app/page.tsx 与 lib/note-confirm.ts 依赖这个信号（rawFrequency + isNoteOnset）。
      const now = currentTime;
      const isNoteOnset = this._detectAmplitudeDiff(energy, adaptiveThreshold, now);

      if (energy < adaptiveThreshold) {
        this.lastFrequency = null;
        this.octaveHistory = [];
        this.port.postMessage({
          type: 'pitchDetected',
          data: {
            frequency: null,
            probability: 0,
            clarity: 0,
            energy: energy,
            hasSignal: false
          }
        });
        return true;
      }

      const filteredBuffer = this._prefilterBuffer(this.inputBuffer);

      const result = this.yinPitchDetection(
        filteredBuffer,
        this.sampleRate,
        this.yinThreshold
      );

      if (result.frequency !== null && result.probability < this.yinProbabilityCliff) {
        this.port.postMessage({
          type: 'pitchDetected',
          data: {
            frequency: null,
            probability: 0,
            clarity: 0,
            energy: energy,
            hasSignal: true,
            rejectedBy: 'probabilityCliff',
            minDiff: result.minDiff,
            band: [result.minTau, result.maxTau]
          }
        });
        return true;
      }

      const smoothedFreq = this.smoothFrequency(result.frequency, result.probability);

      this.port.postMessage({
        type: 'pitchDetected',
        data: {
          frequency: smoothedFreq,
          probability: result.probability,
          clarity: result.clarity,
          energy: energy,
          hasSignal: true,
          rawFrequency: result.frequency,
          isNoteOnset: isNoteOnset,
          strictProbability: result.probability >= this.strictProbabilityThreshold,
          noiseFloor: this.noiseFloor,
          // 诊断：本次 YIN 在搜索区间内的最小 CMND 与 tau（频率为 null 时是定位「为何检不到」的关键）
          minDiff: result.minDiff,
          tau: result.tau,
          band: [result.minTau, result.maxTau],
          yinThreshold: this.yinThreshold,
          minDetectFreq: this.minDetectFreq
        }
      });

      this.detectionCount++;
      if (this.detectionCount % 50 === 0) {
        const interval = now - this.lastDetectionTime;
        this.lastDetectionTime = now;

        this.port.postMessage({
          type: 'debug',
          data: {
            detectionCount: this.detectionCount,
            avgInterval: interval ? (interval * 1000 / 50).toFixed(1) + 'ms' : 'N/A',
            hasSignal: energy >= adaptiveThreshold,
            amplitude: energy.toFixed(4),
            frequency: smoothedFreq ? smoothedFreq.toFixed(1) : 'null',
            probability: result.probability.toFixed(2),
            bufferSize: this.bufferSize,
            hopSize: this.hopSize,
            theoreticalLatency: (this.hopSize / this.sampleRate * 1000).toFixed(1) + 'ms',
            noiseFloor: this.noiseFloor.toFixed(6),
            filtering: `HP:${this.enableHighPass ? this.highPassCutoff + 'Hz' : 'off'} LP:${this.enableLowPass ? this.lowPassCutoff + 'Hz' : 'off'}`
          }
        });
      }
    }

    return true;
  }
}

registerProcessor('pitch-detection-processor', PitchDetectionProcessor);
