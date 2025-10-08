// AudioWorklet处理器 - 用于实时音高检测
class PitchDetectionProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        // 音高检测参数
        this.audioBufferSize = 4096;  // 音频缓冲区大小 - 匹配ScriptProcessorNode
        this.sampleRate = sampleRate;  // 使用正确的采样率
        this.buffer = new Float32Array(this.audioBufferSize);
        this.bufferIndex = 0;
        this.isBufferFull = false;

        // YIN算法参数 - 优化低频检测
        this.threshold = 0.1;
        this.probabilityCliff = 0.1;
        this.lowFreqThreshold = 0.05;
        this.lowFreqProbabilityCliff = 0.05;
        this.isLowFrequencyTarget = false;

        // 低频检测优化参数
        this.minFrequency = 70;   // 最低检测频率
        this.maxFrequency = 1000; // 最高检测频率

        // 音高检测状态 - 添加信号检测
        this.lastPitch = null;
        this.signalThreshold = 0.01; // 信号强度阈值
        this.minRMS = 0.005; // 最小RMS值
        
        // 处理音频数据
        this.port.onmessage = (event) => {
            const { type, data } = event.data;
            
            switch (type) {
                case 'updateConfig':
                    this.threshold = data.threshold || this.threshold;
                    this.probabilityCliff = data.probabilityCliff || this.probabilityCliff;
                    if (data.isLowFrequencyTarget !== undefined) {
                        this.isLowFrequencyTarget = data.isLowFrequencyTarget;
                        // 动态调整参数
                        if (this.isLowFrequencyTarget) {
                            this.threshold = this.lowFreqThreshold;
                            this.probabilityCliff = this.lowFreqProbabilityCliff;
                        }
                    }
                    break;
                case 'reset':
                    this.reset();
                    break;
            }
        };
    }
    
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (!input || input.length === 0) return true;

        const inputChannel = input[0];
        if (!inputChannel) return true;

        // 调试：定期发送音频信号强度到主线程
        if (Math.random() < 0.01) { // 1%概率发送调试信息
            let sum = 0;
            for (let i = 0; i < Math.min(100, inputChannel.length); i++) {
                sum += Math.abs(inputChannel[i]);
            }
            const avgAmplitude = sum / Math.min(100, inputChannel.length);
            this.port.postMessage({
                type: 'debug',
                data: {
                    amplitude: avgAmplitude,
                    hasSignal: avgAmplitude > 0.001,
                    bufferSize: this.audioBufferSize,
                    bufferIndex: this.bufferIndex
                }
            });
        }

        // 收集音频数据到缓冲区
        for (let i = 0; i < inputChannel.length; i++) {
            this.buffer[this.bufferIndex] = inputChannel[i];
            this.bufferIndex++;

            if (this.bufferIndex >= this.audioBufferSize) {
                this.bufferIndex = 0;
                this.isBufferFull = true;

                // 执行音高检测
                this.detectPitch();
            }
        }

        return true; // 保持处理器活跃
    }
    
    detectPitch() {
        if (!this.isBufferFull) return;

        // 计算信号强度 (RMS)
        let sumSquares = 0;
        for (let i = 0; i < this.buffer.length; i++) {
            sumSquares += this.buffer[i] * this.buffer[i];
        }
        const rms = Math.sqrt(sumSquares / this.buffer.length);

        // 如果信号太弱，不进行音高检测
        if (rms < this.minRMS) {
            this.port.postMessage({
                type: 'signalDebug',
                data: {
                    rms: rms,
                    hasSignal: false,
                    message: '信号太弱，跳过音高检测'
                }
            });
            return;
        }

        // 使用YIN算法检测音高
        const yinResult = this.yinAlgorithm(this.buffer);

        // 直接发送原始结果，不做任何过滤
        if (yinResult && yinResult.frequency > 0) {
            // 将频率转换为最接近的音符
            const A4 = 440;
            const semitonesFromA4 = 12 * Math.log2(yinResult.frequency / A4);
            const noteNumber = Math.round(semitonesFromA4 + 69);
            const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            const detectedNote = noteNames[(noteNumber - 1) % 12];

            // 额外检查：过滤掉可能的误检测
            if (rms < 0.02 && yinResult.frequency > 300) {
                // 信号弱但频率高，可能是误检测
                this.port.postMessage({
                    type: 'signalDebug',
                    data: {
                        rms: rms,
                        frequency: yinResult.frequency,
                        hasSignal: false,
                        message: '信号弱但频率高，可能是误检测'
                    }
                });
                return;
            }

            // 直接输出原始检测结果
            this.port.postMessage({
                type: 'pitchDetected',
                data: {
                    frequency: yinResult.frequency,
                    probability: yinResult.probability,
                    timestamp: currentTime,
                    detectedNote: detectedNote,
                    isRaw: true,  // 标记为原始结果
                    rms: rms      // 添加信号强度信息
                }
            });
        }
    }
    
    // YIN算法实现
    yinAlgorithm(buffer) {
        const N = buffer.length;
        const halfN = Math.floor(N / 2);
        const d = new Float32Array(halfN);
        
        // 计算差分函数
        for (let tau = 0; tau < halfN; tau++) {
            let sum = 0;
            for (let i = 0; i < N - tau; i++) {
                const delta = buffer[i] - buffer[i + tau];
                sum += delta * delta;
            }
            d[tau] = sum;
        }
        
        // 累积均值归一化
        let runningSum = 0;
        d[0] = 1;
        for (let tau = 1; tau < halfN; tau++) {
            runningSum += d[tau];
            if (runningSum !== 0) {
                d[tau] = d[tau] * tau / runningSum;
            } else {
                d[tau] = 1;
            }
        }
        
        // 寻找全局最小值，而不仅仅是第一个低于阈值的点
        let tauMin = 1;
        let minValue = d[1];
        for (let tau = 1; tau < halfN; tau++) {
            if (d[tau] < minValue) {
                minValue = d[tau];
                tauMin = tau;
            }
        }

        // 确保最小值低于阈值
        if (minValue >= this.threshold) return null;

        // 改进的抛物线插值
        let betterTau = tauMin;
        if (tauMin > 1 && tauMin < halfN - 1) {
            const s0 = d[tauMin - 1];
            const s1 = d[tauMin];
            const s2 = d[tauMin + 1];
            const a = 0.5 * s0 - s1 + 0.5 * s2;
            const b = 0.5 * s2 - 0.5 * s0;

            if (a !== 0) {
                const delta = -b / (2 * a);
                // 限制插值范围，避免过度外推
                if (Math.abs(delta) <= 1) {
                    betterTau = tauMin + delta;
                }
            }
        }

        // 确保tau在合理范围内
        betterTau = Math.max(1, Math.min(halfN - 1, betterTau));

        const frequency = this.sampleRate / betterTau;
        const probability = Math.max(0, Math.min(1, 1 - minValue));

        // 频率范围检查
        if (frequency < this.minFrequency || frequency > this.maxFrequency) {
            return null;
        }

        // 低频检测优化（特别是F音区域：174Hz, 349Hz, 698Hz）
        if (frequency > 150 && frequency < 400) {
            // 对于低频，使用更严格的概率要求
            if (probability < this.probabilityCliff * 1.2) return null;
        }

        if (probability < this.probabilityCliff) return null;

        return { frequency, probability };
    }
    
  
    reset() {
        this.bufferIndex = 0;
        this.isBufferFull = false;
        this.lastPitch = null;
    }
}

// 注册处理器
registerProcessor('pitch-detection-processor', PitchDetectionProcessor);
