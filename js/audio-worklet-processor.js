// AudioWorklet处理器 - 用于实时音高检测
class PitchDetectionProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        // 音高检测参数
        this.audioBufferSize = 4096;  // 音频缓冲区大小
        this.sampleRate = sampleRate;  // 使用正确的采样率
        this.buffer = new Float32Array(this.audioBufferSize);
        this.bufferIndex = 0;
        this.isBufferFull = false;

        // YIN算法参数
        this.threshold = 0.15;
        this.probabilityCliff = 0.1;

        // 音高检测状态
        this.lastPitch = null;
        this.pitchBuffer = [];
        this.pitchBufferSize = 3;  // 音高缓冲区大小
        
        // 处理音频数据
        this.port.onmessage = (event) => {
            const { type, data } = event.data;
            
            switch (type) {
                case 'updateConfig':
                    this.threshold = data.threshold || this.threshold;
                    this.probabilityCliff = data.probabilityCliff || this.probabilityCliff;
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
        
        // 使用YIN算法检测音高
        const yinResult = this.yinAlgorithm(this.buffer);
        
        if (yinResult && yinResult.frequency > 0) {
            // 应用滤波和稳定性检查
            const filteredPitch = this.applyFilter(yinResult);
            
            if (filteredPitch) {
                // 发送检测结果到主线程
                this.port.postMessage({
                    type: 'pitchDetected',
                    data: {
                        frequency: filteredPitch.frequency,
                        probability: filteredPitch.probability,
                        timestamp: currentTime  // AudioWorklet全局可用currentTime
                    }
                });
            }
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
        
        // 寻找第一个低于阈值的tau
        let tauEstimate = -1;
        for (let tau = 1; tau < halfN; tau++) {
            if (d[tau] < this.threshold) {
                tauEstimate = tau;
                break;
            }
        }
        
        if (tauEstimate === -1) return null;
        
        // 抛物线插值
        let betterTau = tauEstimate;
        if (tauEstimate > 0 && tauEstimate < halfN - 1) {
            const s0 = d[tauEstimate - 1];
            const s1 = d[tauEstimate];
            const s2 = d[tauEstimate + 1];
            const denom = (s0 + s2 - 2 * s1);
            if (denom !== 0) {
                const delta = (s0 - s2) / (2 * denom);
                betterTau = tauEstimate + delta;
            }
        }
        
        const frequency = this.sampleRate / betterTau;
        const probability = Math.max(0, Math.min(1, 1 - d[tauEstimate]));
        
        if (probability < this.probabilityCliff) return null;
        
        return { frequency, probability };
    }
    
    // 应用滤波和稳定性检查
    applyFilter(pitchResult) {
        if (!pitchResult) return null;
        
        // 添加到缓冲区
        this.pitchBuffer.push(pitchResult.frequency);
        if (this.pitchBuffer.length > this.pitchBufferSize) {
            this.pitchBuffer.shift();
        }

        // 如果缓冲区未满，返回null
        if (this.pitchBuffer.length < this.pitchBufferSize) return null;
        
        // 计算中位数以提高稳定性
        const sortedBuffer = [...this.pitchBuffer].sort((a, b) => a - b);
        const median = sortedBuffer[Math.floor(sortedBuffer.length / 2)];
        
        // 检查频率是否在合理范围内
        if (median < 50 || median > 2000) return null;
        
        return {
            frequency: median,
            probability: pitchResult.probability
        };
    }
    
    reset() {
        this.bufferIndex = 0;
        this.isBufferFull = false;
        this.pitchBuffer = [];
        this.lastPitch = null;
    }
}

// 注册处理器
registerProcessor('pitch-detection-processor', PitchDetectionProcessor);
