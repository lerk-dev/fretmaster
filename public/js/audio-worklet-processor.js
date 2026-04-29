// AudioWorklet Processor for Pitch Detection
// 在独立的音频线程中运行，避免阻塞主线程
// 优化版本：使用重叠缓冲区降低延迟

class PitchDetectionProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    
    // 从 options 中获取配置参数
    const processorOptions = options?.processorOptions || {};
    
    // YIN算法参数
    this.yinThreshold = processorOptions.threshold || 0.15;
    this.yinProbabilityCliff = processorOptions.probabilityCliff || 0.1;
    this.sampleRate = processorOptions.sampleRate || 48000;
    
    // 缓冲区设置 - 优化配置
    this.bufferSize = processorOptions.bufferSize || 2048;      // 分析窗口大小（保证低频检测精度）
    this.hopSize = processorOptions.hopSize || 512;             // 跳跃大小（控制响应速度）
    this.inputBuffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    
    // 重叠缓冲区 - 用于滑动窗口
    this.overlapBuffer = new Float32Array(this.bufferSize);
    this.overlapValid = false;
    
    // 调试信息
    this.frameCount = 0;
    this.lastDetectionTime = 0;
    this.detectionCount = 0;
    
    // 上一次检测结果（用于平滑）
    this.lastFrequency = null;
    this.lastProbability = 0;
    this.smoothingFactor = processorOptions.smoothingFactor || 0.3;
    
    // 监听来自主线程的消息
    this.port.onmessage = (event) => {
      const { type, data } = event.data;
      if (type === 'updateParams') {
        if (data.threshold !== undefined) this.yinThreshold = data.threshold;
        if (data.probabilityCliff !== undefined) this.yinProbabilityCliff = data.probabilityCliff;
        if (data.sampleRate !== undefined) this.sampleRate = data.sampleRate;
        if (data.hopSize !== undefined) this.hopSize = data.hopSize;
        if (data.smoothingFactor !== undefined) this.smoothingFactor = data.smoothingFactor;
      }
    };
  }

  // 优化的 YIN 音高检测算法实现
  yinPitchDetection(audioBuffer, sampleRate, threshold) {
    const bufferSize = audioBuffer.length;
    const halfBufferSize = Math.floor(bufferSize / 2);
    
    // 步骤1: 计算差分函数 - 优化版本
    const difference = new Float32Array(halfBufferSize);
    
    // 使用更高效的计算方式
    for (let tau = 0; tau < halfBufferSize; tau++) {
      let diff = 0;
      // 只计算前半部分，减少计算量
      const limit = Math.min(halfBufferSize, bufferSize - tau);
      for (let i = 0; i < limit; i++) {
        const delta = audioBuffer[i] - audioBuffer[i + tau];
        diff += delta * delta;
      }
      difference[tau] = diff;
    }
    
    // 步骤2: 累积均值归一化差分函数 (CMND)
    difference[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < halfBufferSize; tau++) {
      runningSum += difference[tau];
      // 避免除零
      if (runningSum > 0) {
        difference[tau] = difference[tau] * tau / runningSum;
      } else {
        difference[tau] = 1;
      }
    }
    
    // 步骤3: 绝对阈值检测 - 优化搜索范围
    // 根据吉他频率范围 (82Hz - 1319Hz) 限制搜索范围
    const minFreq = 70;   // 略低于最低音 E2 (82.4Hz)
    const maxFreq = 1400; // 略高于最高音 E6 (1318.5Hz)
    const minTau = Math.floor(sampleRate / maxFreq);
    const maxTau = Math.min(Math.floor(sampleRate / minFreq), halfBufferSize - 1);
    
    let tauEstimate = -1;
    let minValue = threshold;
    
    // 在有效范围内搜索
    for (let tau = Math.max(2, minTau); tau < maxTau; tau++) {
      if (difference[tau] < minValue) {
        // 继续寻找局部最小值
        while (tau + 1 < maxTau && difference[tau + 1] < difference[tau]) {
          tau++;
        }
        tauEstimate = tau;
        minValue = difference[tau];
        break;  // 找到第一个有效值就退出
      }
    }
    
    // 没有找到有效的tau
    if (tauEstimate === -1) {
      return { frequency: null, probability: 0, clarity: 0 };
    }
    
    // 步骤4: 抛物线插值提高精度
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
    
    // 计算频率
    const frequency = sampleRate / betterTau;
    
    // 计算概率（清晰度）
    const probability = 1 - difference[tauEstimate];
    
    // 计算清晰度（与概率悬崖相关）
    let clarity = 0;
    if (tauEstimate > 0) {
      clarity = difference[tauEstimate - 1] - difference[tauEstimate];
    }
    
    return { frequency, probability, clarity };
  }

  // 计算RMS能量 - 内联优化
  calculateRMS(buffer, length) {
    let sum = 0;
    const len = length || buffer.length;
    for (let i = 0; i < len; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / len);
  }

  // 平滑频率输出
  smoothFrequency(newFreq, newProb) {
    if (newFreq === null) {
      this.lastFrequency = null;
      return null;
    }
    
    // 如果上次没有有效值，直接使用新值
    if (this.lastFrequency === null) {
      this.lastFrequency = newFreq;
      this.lastProbability = newProb;
      return newFreq;
    }
    
    // 计算频率差异（以音分为单位）
    const centsDiff = 1200 * Math.abs(Math.log2(newFreq / this.lastFrequency));
    
    // 如果差异太大（超过50音分），可能是跳变，不进行平滑
    if (centsDiff > 50) {
      this.lastFrequency = newFreq;
      this.lastProbability = newProb;
      return newFreq;
    }
    
    // 根据概率调整平滑系数
    const effectiveSmoothing = this.smoothingFactor * (1 - newProb * 0.5);
    
    // 指数平滑
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
    
    // 将输入数据复制到输出（直通）
    outputChannel.set(inputChannel);
    
    // 使用重叠缓冲区策略
    // 1. 将新数据移入缓冲区（滑动窗口）
    const inputLength = inputChannel.length;
    
    // 移动缓冲区内容（向左移动 hopSize）
    for (let i = 0; i < this.bufferSize - inputLength; i++) {
      this.inputBuffer[i] = this.inputBuffer[i + inputLength];
    }
    
    // 添加新数据到缓冲区末尾
    for (let i = 0; i < inputLength; i++) {
      this.inputBuffer[this.bufferSize - inputLength + i] = inputChannel[i];
    }
    
    this.bufferIndex += inputLength;
    
    // 当累积足够的数据时进行音高检测
    // 使用 hopSize 控制检测频率
    if (this.bufferIndex >= this.hopSize) {
      this.bufferIndex = 0;
      
      // 计算能量
      const energy = this.calculateRMS(this.inputBuffer, this.bufferSize);
      
      // 能量阈值检测
      const energyThreshold = 0.003;
      if (energy < energyThreshold) {
        this.lastFrequency = null;  // 重置平滑
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
      
      // 执行YIN音高检测
      const result = this.yinPitchDetection(
        this.inputBuffer,
        this.sampleRate,
        this.yinThreshold
      );
      
      // 平滑频率输出
      const smoothedFreq = this.smoothFrequency(result.frequency, result.probability);
      
      // 发送检测结果到主线程
      this.port.postMessage({
        type: 'pitchDetected',
        data: {
          frequency: smoothedFreq,
          probability: result.probability,
          clarity: result.clarity,
          energy: energy,
          hasSignal: true,
          rawFrequency: result.frequency  // 也发送原始频率用于调试
        }
      });
      
      // 调试信息（每50次检测发送一次）
      this.detectionCount++;
      if (this.detectionCount % 50 === 0) {
        const now = currentTime;
        const interval = now - this.lastDetectionTime;
        this.lastDetectionTime = now;
        
        this.port.postMessage({
          type: 'debug',
          data: {
            detectionCount: this.detectionCount,
            avgInterval: interval ? (interval * 1000 / 50).toFixed(1) + 'ms' : 'N/A',
            hasSignal: energy >= energyThreshold,
            amplitude: energy.toFixed(4),
            frequency: smoothedFreq ? smoothedFreq.toFixed(1) : 'null',
            probability: result.probability.toFixed(2),
            bufferSize: this.bufferSize,
            hopSize: this.hopSize,
            theoreticalLatency: (this.hopSize / this.sampleRate * 1000).toFixed(1) + 'ms'
          }
        });
      }
    }
    
    return true;
  }
}

registerProcessor('pitch-detection-processor', PitchDetectionProcessor);
