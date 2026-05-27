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

    this.lastAmplitude = 0;
    this.amplitudeDiffThreshold = 0.15;
    this.lastNoteOnsetTime = 0;
    this.minNoteInterval = 0.08;

    this.highPassCutoff = 35;
    this.lowPassCutoff = 4500;
    this.enableHighPass = true;
    this.enableLowPass = true;

    this.hpFilter = this._createBiquad('highpass', this.highPassCutoff, 0.707);
    this.lpFilter = this._createBiquad('lowpass', this.lowPassCutoff, 0.707);

    this.octaveHistory = [];
    this.maxOctaveHistory = 5;

    this.strictProbabilityThreshold = 0.91;

    this.noiseFloor = 0.003;
    this.noiseAlpha = 0.995;

    this.port.onmessage = (event) => {
      const { type, data } = event.data;
      if (type === 'updateParams') {
        if (data.threshold !== undefined) this.yinThreshold = data.threshold;
        if (data.probabilityCliff !== undefined) this.yinProbabilityCliff = data.probabilityCliff;
        if (data.sampleRate !== undefined) {
          this.sampleRate = data.sampleRate;
          this.hpFilter = this._createBiquad('highpass', this.highPassCutoff, 0.707);
          this.lpFilter = this._createBiquad('lowpass', this.lowPassCutoff, 0.707);
        }
        if (data.hopSize !== undefined) this.hopSize = data.hopSize;
        if (data.smoothingFactor !== undefined) this.smoothingFactor = data.smoothingFactor;
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

    const minFreq = 70;
    const maxFreq = 1400;
    const minTau = Math.floor(sampleRate / maxFreq);
    const maxTau = Math.min(Math.floor(sampleRate / minFreq), halfBufferSize - 1);

    let tauEstimate = -1;
    let minValue = threshold;

    for (let tau = Math.max(2, minTau); tau < maxTau; tau++) {
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
      return { frequency: null, probability: 0, clarity: 0 };
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
      clarity: correctedResult.clarity || clarity
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

  _detectAmplitudeDiff(rms) {
    const diff = rms - this.lastAmplitude;
    this.lastAmplitude = this.lastAmplitude * 0.9 + rms * 0.1;
    return diff > this.amplitudeDiffThreshold;
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

      this.noiseFloor = this.noiseAlpha * this.noiseFloor + (1 - this.noiseAlpha) * Math.min(energy, this.noiseFloor);
      const adaptiveThreshold = Math.max(0.003, this.noiseFloor * 2.5);

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

      const isNoteOnset = this._detectAmplitudeDiff(energy);
      const now = currentTime;

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
            hasSignal: true
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
          noiseFloor: this.noiseFloor
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
