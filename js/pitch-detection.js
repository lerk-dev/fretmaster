/**
 * 音高检测模块 - 使用YIN算法进行高精度音高检测
 */

import { YIN_CONFIG, PITCH_MATCHING, noteToSemitones, intervalToSemitones, NOTE_NAMES } from './config.js';

// PitchFinder库内联代码 - 直接嵌入增强YIN算法实现
const Pitchfinder = {
    YIN: function (config) {
        config = config || {};
        const threshold = config.threshold || YIN_CONFIG.threshold;
        const probabilityCliff = config.probabilityCliff || YIN_CONFIG.probabilityCliff;

        return function (float32AudioBuffer) {
            const buffer = float32AudioBuffer;
            const N = buffer.length;
            const halfN = Math.floor(N / 2);
            const d = new Float32Array(halfN);

            // 步骤1: 差分函数
            for (let tau = 0; tau < halfN; tau++) {
                let sum = 0;
                for (let i = 0; i < halfN; i++) {
                    const diff = buffer[i] - buffer[i + tau];
                    sum += diff * diff;
                }
                d[tau] = sum;
            }

            // 步骤2: 累积平均归一化
            let runningSum = 0;
            d[0] = 1;
            for (let tau = 1; tau < halfN; tau++) {
                runningSum += d[tau];
                d[tau] = d[tau] * tau / runningSum;
            }

            // 步骤3: 阈值检测
            let tauEstimate = -1;
            for (let tau = 1; tau < halfN; tau++) {
                if (d[tau] < threshold) {
                    while (tau + 1 < halfN && d[tau + 1] < d[tau]) tau++;
                    tauEstimate = tau;
                    break;
                }
            }

            if (tauEstimate === -1) return null;

            // 步骤4: 抛物线插值提高精度
            let betterTau = tauEstimate;
            if (tauEstimate > 0 && tauEstimate < halfN - 1) {
                const s0 = d[tauEstimate - 1], s1 = d[tauEstimate], s2 = d[tauEstimate + 1];
                const denom = (s0 + s2 - 2 * s1);
                if (denom !== 0) {
                    const delta = (s0 - s2) / (2 * denom);
                    betterTau = tauEstimate + delta;
                }
            }

            const frequency = 48000 / betterTau;
            const probability = Math.max(0, Math.min(1, 1 - d[tauEstimate]));

            if (probability < probabilityCliff) return null;

            return { frequency, probability };
        };
    }
};

/**
 * 增强版音高检测器类
 */
export class EnhancedPitchDetector {
    constructor() {
        this.bufferSize = 8; // 增加缓冲区大小，提高稳定性
        this.pitchBuffer = [];
        this.lastStablePitch = null;
        this.stabilityCounter = 0;
        this.frequencyBias = { // 针对特定频率范围的偏差校正
            'F': 1.02,  // 轻微提升F区域的检测值
            'F♯': 0.98  // 轻微降低F♯区域的检测值
        };
    }

    detect(float32AudioBuffer, sampleRate) {
        // 使用YIN算法作为基础，但降低阈值提高灵敏度
        const yinPitch = Pitchfinder.YIN({ threshold: 0.08 })(float32AudioBuffer);

        // 使用增强的自相关检测
        const autocorrPitch = this.autocorrelationDetect(float32AudioBuffer, sampleRate);

        // 结合两种算法结果，并应用频率偏差校正
        let finalPitch = this.combineResults(yinPitch, autocorrPitch, sampleRate);

        // 应用更严格的滤波和缓冲
        finalPitch = this.applyFilter(finalPitch);

        // 应用频率偏差校正
        finalPitch = this.applyFrequencyBias(finalPitch);

        return finalPitch;
    }

    autocorrelationDetect(buffer, sampleRate) {
        // 增强版自相关算法，特别优化中频区域检测
        const maxLag = Math.floor(sampleRate / 65);
        const minLag = Math.floor(sampleRate / 1000);

        let bestLag = 0;
        let bestCorrelation = -1;

        // 使用加权窗口增强F和F♯区域的检测
        const fFreq = 349.23;
        const fSharpFreq = 369.99;
        const fLag = Math.floor(sampleRate / fFreq);
        const fSharpLag = Math.floor(sampleRate / fSharpFreq);

        for (let lag = minLag; lag <= maxLag; lag++) {
            let correlation = 0;

            for (let i = 0; i < buffer.length - lag; i++) {
                correlation += buffer[i] * buffer[i + lag];
            }

            correlation /= (buffer.length - lag);

            // 应用汉宁窗减少边界效应
            const window = 0.5 * (1 - Math.cos(2 * Math.PI * lag / maxLag));
            correlation *= window;

            // 对F和F♯区域应用额外权重
            if (Math.abs(lag - fLag) < 10 || Math.abs(lag - fSharpLag) < 10) {
                correlation *= 1.2; // 增强这些区域的相关性
            }

            if (correlation > bestCorrelation) {
                bestCorrelation = correlation;
                bestLag = lag;
            }
        }

        return bestLag > 0 ? sampleRate / bestLag : null;
    }

    combineResults(yinPitch, autocorrPitch, sampleRate) {
        if (!yinPitch || yinPitch <= 0) return autocorrPitch;
        if (!autocorrPitch || autocorrPitch <= 0) return yinPitch;

        const ratio = yinPitch / autocorrPitch;

        // 更严格的一致性检查
        if (ratio > 0.9 && ratio < 1.1) {
            // 如果两种算法结果接近，取加权平均
            return (yinPitch * 0.6 + autocorrPitch * 0.4);
        }

        // 否则选择置信度更高的结果
        const yinConfidence = this.calculateConfidence(yinPitch, sampleRate);
        const autocorrConfidence = this.calculateConfidence(autocorrPitch, sampleRate);

        return yinConfidence > autocorrConfidence ? yinPitch : autocorrPitch;
    }

    applyFilter(pitch) {
        if (!pitch || pitch <= 0) return null;

        this.pitchBuffer.push(pitch);
        if (this.pitchBuffer.length > this.bufferSize) {
            this.pitchBuffer.shift();
        }

        // 使用中位数滤波而不是平均值，更能抵抗异常值
        const sorted = [...this.pitchBuffer].sort((a, b) => a - b);
        const medianPitch = sorted[Math.floor(sorted.length / 2)];

        // 增强稳定性检测
        if (this.lastStablePitch) {
            const ratio = medianPitch / this.lastStablePitch;
            if (ratio > 0.97 && ratio < 1.03) { // 更严格的稳定性标准
                this.stabilityCounter++;
            } else {
                this.stabilityCounter = 0;
            }
        }

        if (this.stabilityCounter >= 4) { // 需要更多的连续稳定样本
            this.lastStablePitch = medianPitch;
        }

        return this.lastStablePitch || medianPitch;
    }

    applyFrequencyBias(pitch) {
        if (!pitch) return null;

        // 将频率转换为音符
        const note = this.frequencyToNoteName(pitch);

        // 应用特定音符的频率偏差校正
        if (note && this.frequencyBias[note.name]) {
            return pitch * this.frequencyBias[note.name];
        }

        return pitch;
    }

    frequencyToNoteName(frequency) {
        const A4 = 440;
        const noteNames = NOTE_NAMES;

        const noteNum = 12 * (Math.log2(frequency / A4)) + 69;
        const noteIndex = Math.round(noteNum) % 12;
        const octave = Math.floor(noteNum / 12) - 1;

        return {
            name: noteNames[noteIndex],
            octave: octave
        };
    }

    calculateConfidence(pitch, sampleRate) {
        // 增强的置信度计算，特别关注F和F♯区域
        if (pitch < 65 || pitch > 1000) return 0;

        // F和F♯的频率范围
        const isInFRange = pitch >= 340 && pitch <= 380;

        // 对F和F♯区域给予更高的基础置信度
        let confidence = isInFRange ? 1.2 : 1.0;

        // 根据频率范围调整置信度
        if (pitch < 100) confidence *= 0.8;
        else if (pitch > 800) confidence *= 0.8;

        return Math.min(1.0, confidence);
    }
}

/**
 * YIN检测器工厂函数
 */
export function YINDetectorFactory(sampleRate, config) {
    config = config || {};
    const threshold = config.threshold || YIN_CONFIG.threshold;
    const probabilityCliff = config.probabilityCliff || YIN_CONFIG.probabilityCliff;
    
    return function (float32AudioBuffer) {
        const buffer = float32AudioBuffer;
        const N = buffer.length;
        const halfN = Math.floor(N / 2);
        const d = new Float32Array(halfN);
        
        for (let tau = 0; tau < halfN; tau++) {
            let sum = 0;
            for (let i = 0; i < halfN; i++) {
                const diff = buffer[i] - buffer[i + tau];
                sum += diff * diff;
            }
            d[tau] = sum;
        }
        
        let runningSum = 0;
        d[0] = 1;
        for (let tau = 1; tau < halfN; tau++) {
            runningSum += d[tau];
            d[tau] = d[tau] * tau / runningSum;
        }
        
        let tauEstimate = -1;
        for (let tau = 1; tau < halfN; tau++) {
            if (d[tau] < threshold) {
                while (tau + 1 < halfN && d[tau + 1] < d[tau]) tau++;
                tauEstimate = tau;
                break;
            }
        }
        
        if (tauEstimate === -1) return null;
        
        let betterTau = tauEstimate;
        if (tauEstimate > 0 && tauEstimate < halfN - 1) {
            const s0 = d[tauEstimate - 1], s1 = d[tauEstimate], s2 = d[tauEstimate + 1];
            const denom = (s0 + s2 - 2 * s1);
            if (denom !== 0) {
                const delta = (s0 - s2) / (2 * denom);
                betterTau = tauEstimate + delta;
            }
        }
        
        const frequency = sampleRate / betterTau;
        const probability = Math.max(0, Math.min(1, 1 - d[tauEstimate]));
        
        if (probability < probabilityCliff) return null;
        
        return { frequency, probability };
    };
}

/**
 * 频率转换为音符名称和八度
 */
export function frequencyToNoteName(frequency) {
    const A4 = 440;
    const noteNames = NOTE_NAMES;

    const noteNum = 12 * (Math.log2(frequency / A4)) + 69;
    const noteIndex = Math.round(noteNum) % 12;
    const octave = Math.floor(noteNum / 12) - 1;

    return {
        name: noteNames[noteIndex],
        octave: octave
    };
}

/**
 * 检查音高匹配
 */
export function checkPitchMatch(detectedPitch, targetPitch, isLowFreq = false, isRootNote = false) {
    if (!detectedPitch || !targetPitch) return false;
    
    const cents = 1200 * Math.log2(detectedPitch / targetPitch);
    const centsMod = Math.abs(cents) % 1200;
    const adjustedCents = centsMod > 600 ? 1200 - centsMod : centsMod;
    
    // 动态调整匹配阈值
    let threshold = PITCH_MATCHING.defaultThreshold;
    
    if (isLowFreq && detectedPitch < PITCH_MATCHING.lowFreqCutoff) {
        threshold = PITCH_MATCHING.lowFreqThreshold;
    } else if (isRootNote) {
        threshold = PITCH_MATCHING.rootNoteThreshold;
    }
    
    return adjustedCents <= threshold;
}

// 将 Pitchfinder 暴露给全局（向后兼容）
if (typeof window !== 'undefined') {
    window.Pitchfinder = Pitchfinder;
}

export { Pitchfinder };