// 音高检测算法模块 - 从 app/page.tsx 提取
// 包含 YIN 算法、SOLO FFT 加速 YIN、频率转音符等工具函数
// ==================== 工具函数 ====================

/** 二阶（biquad）滤波器状态 */
interface BiquadState {
  b0: number; b1: number; b2: number; a1: number; a2: number
  x1: number; x2: number; y1: number; y2: number
}

// ==================== 能量门限（噪声底跟踪） ====================
// 与 public/js/audio-worklet-processor.js 保持一致：下降快、上升极慢。
// 历史 bug（已在 worklet 侧修掉、此处曾遗漏）：旧实现用
// `noiseFloor = alpha*noiseFloor + (1-alpha)*min(rms, noiseFloor)` —— min() 让它只降不升，
// 且初值 0.003 永远不收敛，于是门限恒为 max(0.003, 0.003*2.5) = 0.0075（≈-42dBFS），
// 轻弹（RMS < 0.0075）直接被丢，用户表现为「软拨弦检不出来」。
// 现在：噪声底双向跟踪（噪声变小快速跟随、信号变大极慢抬升），门限压到 0.0008（≈-62dBFS）。
// 纯底噪仍会被挡住 —— 挡住它的实际是 YIN 的 threshold/probabilityCliff，而不是这道能量门。
/**
 * 噪声底初值（RMS ≈ −66dBFS）。
 * 导出以便跨实现护栏（`__tests__/onset-gate.test.ts`）把它与 Rust 的
 * `noise_floor: 0.0005`、worklet 的 `: 0.0005` 钉在一起 —— 三处不一致会让
 * 同一台设备上三条收音路径的门限起点不同。
 */
export const NOISE_FLOOR_INIT = 0.0005
/** 当前帧能量低于噪声底（环境变安静）时的跟随速度 */
const NOISE_ALPHA_FAST = 0.05
/** 当前帧能量高于噪声底（有信号）时的抬升速度：极慢，避免把持续音当噪声底顶上去 */
const NOISE_ALPHA_SLOW = 0.0005
/** 门限绝对下限（≈-62dBFS）。导出理由同 `NOISE_FLOOR_INIT`。 */
export const ADAPTIVE_THRESHOLD_FLOOR = 0.0008

/** 与 worklet 同规则的噪声底更新 + 自适应门限 */
function updateNoiseFloor(prev: number, rms: number): number {
  const alpha = rms < prev ? NOISE_ALPHA_FAST : NOISE_ALPHA_SLOW
  return prev + (rms - prev) * alpha
}

function adaptiveThresholdOf(noiseFloor: number): number {
  // 系数 1.5（原 2.5）：与 worklet 侧保持同值。实测（.workbuddy/tools/scan-sensitivity.cjs）
  // 门限被环境底噪抬起后，可检出的最轻信号约在「门限 +10dB」断崖；×2.5 时底噪 -42dBFS
  // → 门限 -34dBFS → 轻于 -24dBFS 直接检不出（「要弹得响才有反应」）。×1.5 宽松约 10dB，
  // 而纯底噪的误检率仍为 0%。
  return Math.max(ADAPTIVE_THRESHOLD_FLOOR, noiseFloor * 1.5)
}

// ==================== 起音门限（与 Rust / worklet 同规则） ====================
// 同一条规则在项目里有**三处实现**，改动必须同步：
//   - Rust    src-tauri/src/audio/onset.rs 的 `OnsetDetector`（Tauri 桌面版）
//   - Web     public/js/audio-worklet-processor.js 的 `_detectAmplitudeDiff()`（worklet）
//   - Web回退  本文件的 `updateOnsetGate()`（ScriptProcessor，由 app/page.tsx 调用）
// 三处都是：底噪**首帧直接取该帧 RMS** → 之后「下降快 0.05 / 上升极慢 0.0005」
//        → 门限 = max(0.0008, 底噪 × 1.5)。
// 它与 `confirmNote()` 的多帧一致构成互补的两级（见 lib/note-confirm.ts 顶部注释）。
//
// 🚨 为什么**不**复用 YIN 的 `yinNoiseFloor`：起音吃的是**原始** RMS，而 YIN 的能量门
// 吃的是前置滤波（35Hz 高通 + 4.5kHz 低通 + 50/60Hz 陷波）之后的 RMS —— 两者电平不同
// （原始通常略高）。共用一份底噪会让门限偏松，恰好在「轻弹 + 高底噪」时先出问题。
// Rust 与 worklet 也都是各自独立跟踪，不是共用一个。
//
// 历史 bug（本次修）：ScriptProcessor 路径把门限**写死**成 0.001，完全不跟底噪走，
// 而 worklet / Tauri 都跟底噪走。环境噪声校准的上界是 0.025 ⇒ 两条原生路径门限
// max(0.0008, 0.0375) = 0.0375，回退路径仍是 0.001（**低 37 倍**）⇒ 环境噪声的起伏
// 就被判成「一次新的拨弦」⇒ `confirmNote()` 的确认记忆被反复清空 ⇒ 嘈杂房间里
// 回退路径**永远确认不了**任何音（表现为「怎么弹都没反应」）。
let onsetNoiseFloor = NOISE_FLOOR_INIT
let onsetNoiseFloorPrimed = false

/** 当前起音门限（RMS）。仅供诊断与测试；判定走 `updateOnsetGate()`。 */
export function getOnsetGate(): number {
    return adaptiveThresholdOf(onsetNoiseFloor)
}

/**
 * 用本帧**原始** RMS 推进起音底噪，返回这一帧应使用的起音门限。
 *
 * 顺序与 Rust 的 `OnsetDetector::update()` 一致：**先推进底噪再取门限**，
 * 即门限反映推进后的底噪。上升系数极小（0.0005），所以起音帧自身几乎不会把门限抬起来。
 *
 * @param rms 本帧**原始**输入实测 RMS。不要传 AGC / 前置滤波之后的电平 ——
 *            与 Rust、worklet 的口径一致，否则同一段音频三处结论不同。
 */
export function updateOnsetGate(rms: number): number {
    if (!onsetNoiseFloorPrimed) {
        onsetNoiseFloor = rms
        onsetNoiseFloorPrimed = true
    } else {
        onsetNoiseFloor = updateNoiseFloor(onsetNoiseFloor, rms)
    }
    return getOnsetGate()
}

// ==================== YIN 接受门限（CMND 上限）====================
// 收音路径历史上各用各的门限：worklet 由页面推 0.1、TS-YIN 默认 0.15（页面却传 0.1）、
// TS-SOLO 类内硬编码 0.2（页面推不进去）、Rust 0.12 —— 同一段音频结论不同。
// 页面侧的「低频目标」判定（原 computeLowFrequencyTarget）恒为 false 且方向也反了
// （给低频下发 0.05，而 YIN 的 threshold 越小越严格），该分支从未生效。现统一由此函数解析。
//
// ⚠️ 方向：threshold 是 CMND 的**上限**，**越小越严格**。
// 低频乐器需要更**宽松** —— 长周期信号在有限窗口内周期数少，CMND 天然偏高。
// 实测（.workbuddy/tools/scan-yin-threshold.cjs，峰值 0.05 的吉他式谐波，bufferSize 4096）：
//   七弦低 B 61.74Hz：0.05→71% · 0.1→84% · 0.15→89% · 0.2→89%
//   贝斯 E1  41.20Hz：0.05→79% · 0.1→84% · 0.15→89% · 0.2→89%
//   吉他 E2  82.41Hz：0.15 已达 100%（饱和，无需再放宽）
//   纯白噪（峰值 0.006~0.05）误检率在所有门限下**均为 0%** —— 能量门限与
//   probabilityCliff 才是挡住无音高信号的那道防线，放宽 threshold 不引入噪声误报。
export const LOW_RANGE_STRING_HZ = 75

/** 按乐器最低空弦频率解析 YIN 门限：低频乐器（贝斯 30.87/41.20、七弦低 B 61.74）放宽到 0.2 */
export function resolveYinThreshold(lowestStringHz: number): number {
    return lowestStringHz < LOW_RANGE_STRING_HZ ? 0.2 : 0.15
}

// ==================== 工频陷波 ====================
// 与 Rust 侧 src-tauri/src/audio/preprocessor.rs（notch_freq_50=50 / notch_freq_60=60 / Q=15，
// 默认开启）保持一致。50/60Hz 工频哼声（单线圈拾音器、笔记本电源、USB 音频接口很常见）
// 落在贝斯音域内，会被 YIN 当成一个概率 0.9+ 的「稳定音高」，进而通过 0.8 的置信门限
// 被判定为答对。仅靠降低搜索下限挡不住它，必须做陷波。
const NOTCH_FREQS = [50, 60]
const NOTCH_Q = 15

// ==================== 可检测频率带 ====================
// 与 worklet（public/js/audio-worklet-processor.js）保持一致。
// 历史缺陷：worklet 用 70Hz 下限，而应用支持 4/5 弦贝斯（最低 B0 30.87Hz）与七弦低 B（61.74Hz），
// 那些音在 web 默认路径下**完全检不出来**；TS 路径则相反 —— 完全没有限制，
// 于是 50/60Hz 工频哼声会被当成概率 0.9+ 的稳定音高。
// 现在统一为 27.5Hz（A0）~ 1400Hz（覆盖 24 品高把位 E6=1318.5Hz，同时避免锁到高次谐波）。
export const MIN_DETECT_FREQ = 27.5
export const MAX_DETECT_FREQ = 1400

/** 绝对搜索下限：默认用最宽的 27.5Hz，页面会按当前乐器收窄（见 detectFloorForTuning） */
let minDetectFreq = MIN_DETECT_FREQ

/**
 * 按当前乐器设置搜索下限（Hz）。页面在乐器变化时调用，并同步推给 worklet。
 * 为什么需要它：搜索下限本身就是**工频哼声的护栏** —— 只要下限高于 50/60Hz，
 * 哼声（含其谐波，它们同样以 50/60Hz 为公共周期）就不在搜索范围内，不可能被锁定。
 * 弹吉他时用 70Hz 级下限即可挡住哼声；只有贝斯/七弦这类真有 30~62Hz 音的乐器
 * 才需要下探，代价是那一档乐器上工频哼声可能被显示成一个低音（物理上无法与
 * 七弦低 B 61.74Hz / 60Hz 哼声区分，二者只差 49 音分）。
 */
export function setMinDetectFreq(hz: number): void {
  minDetectFreq = Math.min(Math.max(hz, MIN_DETECT_FREQ), MAX_DETECT_FREQ)
}

export function getMinDetectFreq(): number {
  return minDetectFreq
}

/**
 * 由乐器最低空弦频率推出检测下限：留 2 个半音余量（允许调低），并夹在绝对下限之上。
 * 举例：六弦吉他 E2 82.41 → 73.42Hz（高于 50/60Hz 工频，哼声被挡在搜索范围外）；
 * 五弦贝斯 B0 30.87 → 27.50Hz（这一档无法再靠下限挡工频，属物理限制）。
 */
export function detectFloorForLowestHz(lowestHz: number): number {
  return Math.max(MIN_DETECT_FREQ, lowestHz * Math.pow(2, -2 / 12))
}

/** 由采样率与可用缓冲长度推出搜索用的 tau 区间 */
export function detectTauRange(sampleRate: number, maxTauLimit: number): { minTau: number; maxTau: number } {
  const minTau = Math.max(2, Math.floor(sampleRate / MAX_DETECT_FREQ))
  const maxTau = Math.min(Math.floor(sampleRate / minDetectFreq), maxTauLimit)
  return { minTau, maxTau }
}

export function calculateRMS(buffer: Float32Array): number {
    let sum = 0;
    for(let i = 0; i < buffer.length; i++){
        sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
}

export function frequencyToNoteName(frequency: number): string {
    if (!frequency || frequency <= 0 || !isFinite(frequency)) {
        return '';
    }
    const A4 = 440;
    const semitones = Math.round(12 * Math.log2(frequency / A4));
    let noteIndex = (9 + semitones) % 12;
    if (noteIndex < 0) {
        noteIndex = noteIndex + 12;
    }
    const noteNames = [
        'C',
        'C♯',
        'D',
        'D♯',
        'E',
        'F',
        'F♯',
        'G',
        'G♯',
        'A',
        'A♯',
        'B'
    ];
    return noteNames[noteIndex];
}

export function calculateCents(detectedFreq: number, targetFreq: number): number {
    if (targetFreq <= 0 || detectedFreq <= 0) return 0;
    const cents = 1200 * Math.log2(detectedFreq / targetFreq);
    return Math.round(cents * 10) / 10;
}

export function getAdjustedCents(detectedFreq: number, targetFreq: number): number {
    if (targetFreq <= 0 || detectedFreq <= 0) return 1200;
    const cents = 1200 * Math.log2(detectedFreq / targetFreq);
    const centsMod = Math.abs(cents) % 1200;
    return centsMod > 600 ? 1200 - centsMod : centsMod;
}

export function frequencyToNote(frequency: number, referenceA4: number = 440): { note: string; cents: number; octave: number } {
    if (frequency <= 0) return {
        note: "-",
        cents: 0,
        octave: 0
    };
    const semitonesFromA4 = 12 * Math.log2(frequency / referenceA4);
    const roundedSemitones = Math.round(semitonesFromA4);
    const cents = Math.round((semitonesFromA4 - roundedSemitones) * 100);
    const noteIndex = ((roundedSemitones + 9) % 12 + 12) % 12;
    const octave = 4 + Math.floor((roundedSemitones + 9) / 12);
    const noteNames = [
        'C',
        'C♯',
        'D',
        'D♯',
        'E',
        'F',
        'F♯',
        'G',
        'G♯',
        'A',
        'A♯',
        'B'
    ];
    return {
        note: noteNames[noteIndex],
        cents: cents,
        octave: octave
    };
}

export class FloatFFT {
    private n: number;
    constructor(n: number) {
        this.n = n;
    }
    complexForward(data: Float32Array): void {
        const n = this.n;
        const m = Math.log2(n);
        for(let i = 0, j = 0; i < n - 1; i++){
            if (i < j) {
                const idx1 = i * 2, idx2 = j * 2;
                const tempRe = data[idx1], tempIm = data[idx1 + 1];
                data[idx1] = data[idx2];
                data[idx1 + 1] = data[idx2 + 1];
                data[idx2] = tempRe;
                data[idx2 + 1] = tempIm;
            }
            let k = n >> 1;
            while(k <= j){
                j -= k;
                k >>= 1;
            }
            j += k;
        }
        for(let l = 1; l <= m; l++){
            const le = 1 << l;
            const le2 = le >> 1;
            const sr = Math.cos(Math.PI / le2), si = -Math.sin(Math.PI / le2);
            
            
            // 旋转因子必须在 j 循环外持续递推。声明在 j 循环内会导致每轮重置为 (1,0)，
            // 蝶形运算退化为纯加减，FFT 不再是 DFT（原实现即此 bug，导致 SOLO 自相关全错）。
            let wr = 1.0, wi = 0.0;
            for(let j = 0; j < le2; j++){
                for(let i = j; i < n; i += le){
                    const ip = i + le2;
                    const idx1 = i * 2, idx2 = ip * 2;
                    const tr = wr * data[idx2] - wi * data[idx2 + 1];
                    const ti = wr * data[idx2 + 1] + wi * data[idx2];
                    data[idx2] = data[idx1] - tr;
                    data[idx2 + 1] = data[idx1 + 1] - ti;
                    data[idx1] += tr;
                    data[idx1 + 1] += ti;
                }
                const temp = wr * sr - wi * si;
                wi = wr * si + wi * sr;
                wr = temp;
            }
        }
    }
    complexInverse(data: Float32Array, scale: boolean): void {
        const n = this.n;
        for(let i = 0; i < n; i++){
            data[i * 2 + 1] = -data[i * 2 + 1];
        }
        this.complexForward(data);
        for(let i = 0; i < n; i++){
            const idx = i * 2;
            
            
            // IFFT(X) = conj(FFT(conj(X))) / n：两次共轭都只作用于虚部。
            // 原实现对实部也取负，导致结果整体符号翻转（ACF 变负、谷值变峰值）。
            data[idx + 1] = -data[idx + 1];
            if (scale) {
                data[idx] /= n;
                data[idx + 1] /= n;
            }
        }
    }
}

export class SOLOYinAnalyser {
    private sampleRate: number = 48000;
    private audioBufferSize: number = 2048;
    // 默认与 resolveYinThreshold 的常规值一致；低频乐器由调用方 setThreshold 放宽到 0.2。
    // （原为类内固定 0.2，页面推不进去 —— 三/四条路径门限不一致的根源之一）
    private threshold: number = 0.15;
    private yinBuffer: Float32Array | null = null;
    private audioBufferFFT: Float32Array | null = null;
    private kernel: Float32Array | null = null;
    private yinStyleACF: Float32Array | null = null;
    private fft: FloatFFT | null = null;
    private pitch: number = -1;
    private probability: number = -1;
    private valid: boolean = false;
    private volumeRMS: number = 0;
    private maxAmplitude: number = 0;
    private octaveHistory: number[] = [];
    private maxOctaveHistory: number = 5;
    private lastAmplitude: number = 0;
    private noiseFloor: number = NOISE_FLOOR_INIT;
    private hpFilterState: BiquadState | null = null;
    private lpFilterState: BiquadState | null = null;
    private notchFilterStates: BiquadState[] = [];
    private enableHighPass: boolean = true;
    private enableLowPass: boolean = true;
    private highPassCutoff: number = 35;
    private lowPassCutoff: number = 4500;
    setSampleRate(rate: number): void {
        this.sampleRate = rate;
        this._rebuildFilters();
    }
    /** 设置 YIN 接受门限（CMND 上限，越小越严格）。取值见 resolveYinThreshold */
    setThreshold(threshold: number): void {
        this.threshold = threshold;
    }
    /**
     * 用**主动校准**出的环境噪声底给自适应门限一个更好的起点。
     * 只设起点，运行时 EMA 照常跟踪（换房间后仍会自适应）。
     * 非法值直接忽略 —— 宁可保留现有估计，也不要写进 0/NaN 把门限钉死。
     */
    setNoiseFloor(floor: number): void {
        if (!Number.isFinite(floor) || floor <= 0) return;
        this.noiseFloor = floor;
    }
    private _createBiquad(type: 'highpass' | 'lowpass' | 'notch', freq: number, q: number) {
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
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
            x1: 0,
            x2: 0,
            y1: 0,
            y2: 0
        };
    }
    private _rebuildFilters(): void {
        this.hpFilterState = this._createBiquad('highpass', this.highPassCutoff, 0.707);
        this.lpFilterState = this._createBiquad('lowpass', this.lowPassCutoff, 0.707);
        this.notchFilterStates = NOTCH_FREQS.map((f) => this._createBiquad('notch', f, NOTCH_Q));
    }
    private _applyBiquad(filter: BiquadState, sample: number): number {
        const y0 = filter.b0 * sample + filter.b1 * filter.x1 + filter.b2 * filter.x2 - filter.a1 * filter.y1 - filter.a2 * filter.y2;
        filter.x2 = filter.x1;
        filter.x1 = sample;
        filter.y2 = filter.y1;
        filter.y1 = y0;
        return y0;
    }
    private _prefilterBuffer(buffer: Float32Array): Float32Array {
        if (!this.hpFilterState) this._rebuildFilters();
        const output = new Float32Array(buffer.length);
        for(let i = 0; i < buffer.length; i++){
            let sample = buffer[i];
            if (this.enableHighPass && this.hpFilterState) sample = this._applyBiquad(this.hpFilterState, sample);
            if (this.enableLowPass && this.lpFilterState) sample = this._applyBiquad(this.lpFilterState, sample);
            for(let k = 0; k < this.notchFilterStates.length; k++){
                sample = this._applyBiquad(this.notchFilterStates[k], sample);
            }
            output[i] = sample;
        }
        return output;
    }
    private _octaveCorrection(frequency: number, tau: number, yinBuffer: Float32Array, sampleRate: number): { frequency: number; probability: number } {
        const { minTau, maxTau } = detectTauRange(sampleRate, yinBuffer.length - 1);
        if (tau < minTau * 2) return {
            frequency,
            probability: 1 - yinBuffer[tau]
        };
        const octaveTau = Math.round(tau / 2);
        if (octaveTau < minTau || octaveTau >= maxTau) return {
            frequency,
            probability: 1 - yinBuffer[tau]
        };
        const octaveVal = yinBuffer[octaveTau];
        const currentVal = yinBuffer[tau];
        const octaveProb = 1 - octaveVal;
        const currentProb = 1 - currentVal;
        if (octaveVal < this.threshold * 0.8 && Math.abs(octaveTau * 2 - tau) <= 2) {
            const octaveFreq = sampleRate / octaveTau;
            if (this.octaveHistory.length >= 2) {
                const recent = this.octaveHistory.slice(-3);
                const avg = recent.reduce((a, b)=>a + b, 0) / recent.length;
                const currentOct = Math.floor(12 * Math.log2(frequency / 440) / 12 + 4);
                const octaveOct = Math.floor(12 * Math.log2(octaveFreq / 440) / 12 + 4);
                if (Math.abs(octaveOct - avg) < Math.abs(currentOct - avg)) {
                    this.octaveHistory.push(octaveOct);
                    if (this.octaveHistory.length > this.maxOctaveHistory) this.octaveHistory.shift();
                    return {
                        frequency: octaveFreq,
                        probability: octaveProb
                    };
                }
            }
            if (octaveProb > currentProb * 0.9) {
                this.octaveHistory.push(Math.floor(12 * Math.log2(octaveFreq / 440) / 12 + 4));
                if (this.octaveHistory.length > this.maxOctaveHistory) this.octaveHistory.shift();
                return {
                    frequency: octaveFreq,
                    probability: octaveProb
                };
            }
        }
        this.octaveHistory.push(Math.floor(12 * Math.log2(frequency / 440) / 12 + 4));
        if (this.octaveHistory.length > this.maxOctaveHistory) this.octaveHistory.shift();
        return {
            frequency,
            probability: currentProb
        };
    }
    detectAmplitudeDiff(): boolean {
        const diff = this.volumeRMS - this.lastAmplitude;
        this.lastAmplitude = this.lastAmplitude * 0.9 + this.volumeRMS * 0.1;
        return diff > 0.15;
    }
    setAudioBufferSize(size: number): void {
        this.audioBufferSize = size;
        const halfSize = Math.floor(size / 2);
        this.yinBuffer = new Float32Array(halfSize);
        this.audioBufferFFT = new Float32Array(size * 2);
        this.kernel = new Float32Array(size * 2);
        this.yinStyleACF = new Float32Array(size * 2);
        this.fft = new FloatFFT(size);
    }
    getVolumeRMS(): number {
        return this.volumeRMS;
    }
    /** 复位自适应状态（噪声底/八度历史/滤波器与上一帧电平），供重新开始收音时调用 */
    resetState(): void {
        this.noiseFloor = NOISE_FLOOR_INIT;
        this.octaveHistory = [];
        this.lastAmplitude = 0;
        this.volumeRMS = 0;
        this.maxAmplitude = 0;
        this.pitch = -1;
        this.probability = -1;
        this.valid = false;
        this._rebuildFilters();
    }
    getMaxAmplitude(): number {
        return this.maxAmplitude;
    }
    private calculateRMS(buffer: Float32Array): void {
        let sum = 0;
        for(let i = 0; i < buffer.length; i++){
            sum += buffer[i] * buffer[i];
        }
        this.volumeRMS = Math.sqrt(sum / buffer.length);
    }
    private calculateMaxAmplitude(buffer: Float32Array): void {
        let max = 0;
        for(let i = 0; i < buffer.length; i++){
            if (Math.abs(buffer[i]) > max) {
                max = Math.abs(buffer[i]);
            }
        }
        this.maxAmplitude = max;
    }
    private difference(buffer: Float32Array): void {
        if (!this.yinBuffer || !this.audioBufferFFT || !this.kernel || !this.yinStyleACF || !this.fft) {
            return;
        }
        const halfN = this.yinBuffer.length;
        const energyTerms = new Float32Array(halfN);
        for(let i = 0; i < halfN; i++){
            energyTerms[0] += buffer[i] * buffer[i];
        }
        for(let tau = 1; tau < halfN; tau++){
            energyTerms[tau] = energyTerms[tau - 1] - buffer[tau - 1] * buffer[tau - 1] + buffer[halfN + tau] * buffer[halfN + tau];
        }
        for(let i = 0; i < buffer.length; i++){
            this.audioBufferFFT[i * 2] = buffer[i];
            this.audioBufferFFT[i * 2 + 1] = 0;
        }
        this.fft.complexForward(this.audioBufferFFT);
        for(let i = 0; i < halfN; i++){
            this.kernel[i * 2] = buffer[halfN - 1 - i];
            this.kernel[i * 2 + 1] = 0;
            this.kernel[buffer.length + i * 2] = 0;
            this.kernel[buffer.length + i * 2 + 1] = 0;
        }
        this.fft.complexForward(this.kernel);
        for(let i = 0; i < buffer.length; i++){
            const idx = i * 2;
            const re1 = this.audioBufferFFT[idx];
            const im1 = this.audioBufferFFT[idx + 1];
            const re2 = this.kernel[idx];
            const im2 = this.kernel[idx + 1];
            this.yinStyleACF[idx] = re1 * re2 - im1 * im2;
            this.yinStyleACF[idx + 1] = re1 * im2 + im1 * re2;
        }
        this.fft.complexInverse(this.yinStyleACF, true);
        for(let tau = 0; tau < halfN; tau++){
            const acfValue = this.yinStyleACF[2 * (halfN - 1 + tau)];
            this.yinBuffer[tau] = energyTerms[0] + energyTerms[tau] - 2 * acfValue;
        }
    }
    private cumulativeMeanNormalizedDifference(): void {
        if (!this.yinBuffer) return;
        this.yinBuffer[0] = 1.0;
        let runningSum = 0;
        for(let tau = 1; tau < this.yinBuffer.length; tau++){
            runningSum += this.yinBuffer[tau];
            this.yinBuffer[tau] = this.yinBuffer[tau] * tau / runningSum;
        }
    }
    private absoluteThreshold(): number {
        if (!this.yinBuffer) return -1;
        const { minTau, maxTau } = detectTauRange(this.sampleRate, this.yinBuffer.length - 1);
        for(let tau = minTau; tau <= maxTau; tau++){
            if (this.yinBuffer[tau] < this.threshold) {
                while(tau + 1 <= maxTau && this.yinBuffer[tau + 1] < this.yinBuffer[tau]){
                    tau++;
                }
                this.probability = 1 - this.yinBuffer[tau];
                return tau;
            }
        }
        this.probability = 0;
        this.valid = false;
        return -1;
    }
    private parabolicInterpolation(tauEstimate: number): number {
        if (!this.yinBuffer) return tauEstimate;
        const x0 = tauEstimate < 1 ? tauEstimate : tauEstimate - 1;
        let x2 = tauEstimate + 1;
        if (x2 >= this.yinBuffer.length) {
            x2 = tauEstimate;
        }
        if (x0 === tauEstimate) {
            return this.yinBuffer[tauEstimate] <= this.yinBuffer[x2] ? tauEstimate : x2;
        }
        if (x2 === tauEstimate) {
            return this.yinBuffer[tauEstimate] <= this.yinBuffer[x0] ? tauEstimate : x0;
        }
        const s0 = this.yinBuffer[x0];
        const s1 = this.yinBuffer[tauEstimate];
        const s2 = this.yinBuffer[x2];
        const denom = s0 + s2 - 2 * s1;
        if (denom === 0) return tauEstimate;
        return tauEstimate + (s0 - s2) / (2 * denom);
    }
    analyze(buffer: Float32Array): { frequency: number; probability: number; valid: boolean; volumeRMS: number; maxAmplitude: number } | null {
        if (!this.yinBuffer || !this.fft || this.audioBufferSize !== buffer.length) {
            this.setAudioBufferSize(buffer.length);
        }
        const filteredBuffer = this._prefilterBuffer(buffer);
        this.calculateRMS(filteredBuffer);
        this.calculateMaxAmplitude(filteredBuffer);
        this.noiseFloor = updateNoiseFloor(this.noiseFloor, this.volumeRMS);
        const adaptiveThreshold = adaptiveThresholdOf(this.noiseFloor);
        if (this.volumeRMS < adaptiveThreshold) {
            this.octaveHistory = [];
            return null;
        }
        this.difference(filteredBuffer);
        this.cumulativeMeanNormalizedDifference();
        const tauEstimate = this.absoluteThreshold();
        if (tauEstimate === -1) {
            return null;
        }
        const betterTau = this.parabolicInterpolation(tauEstimate);
        const rawFrequency = this.sampleRate / betterTau;
        const corrected = this._octaveCorrection(rawFrequency, tauEstimate, this.yinBuffer!, this.sampleRate);
        this.pitch = corrected.frequency;
        this.probability = corrected.probability;
        this.valid = true;
        return {
            frequency: this.pitch,
            probability: this.probability,
            valid: this.valid,
            volumeRMS: this.volumeRMS,
            maxAmplitude: this.maxAmplitude
        };
    }
}

// SOLO算法实例（延迟初始化）
let soloYinAnalyser: SOLOYinAnalyser | null = null;

/**
 * 用户校准出的噪声底，若单例**还没创建**就先记在这里，
 * 等 `getSOLOYinAnalyser()` 建实例时补上（否则惰性创建会吞掉这次校准）。
 */
let pendingSoloNoiseFloor: number | null = null;

/**
 * 复位检测器的自适应状态（噪声底 / 八度历史）。
 *
 * 为什么需要：噪声底是**跨帧累加**的。持续大声输入时它会缓慢抬向信号电平，而门限是
 * floor×2.5 —— 抬到一定程度就会把**抬升它的那个信号本身**挡在门外。真实弹奏有音符间隙，
 * 间隙里 floor 会快速回落，所以平时不会出问题；但 TS 侧的 `yinNoiseFloor` 与 SOLO 单例
 * 是**模块级、进程级**的（worklet 每次开音频都会重建实例，天然复位），跨多次录音会话会
 * 累积。因此每次重新开始收音前复位一次。
 */
export function resetPitchDetectionState(): void {
    yinNoiseFloor = NOISE_FLOOR_INIT;
    yinOctaveHistory = [];
    // 起音底噪一并复位（含 primed 标志）—— 否则上一次会话（可能是另一个房间/另一台乐器）
    // 的电平会当成本次的首帧基线，门限从错误的起点开始爬。
    onsetNoiseFloor = NOISE_FLOOR_INIT;
    onsetNoiseFloorPrimed = false;
    // 待应用的校准值属于「上一次会话的起点」，跟着一起清掉。
    // 页面侧的顺序固定是 reset() → seed(floor)，所以清掉不会丢东西。
    pendingSoloNoiseFloor = null;
    if (soloYinAnalyser) {
        soloYinAnalyser.resetState();
    }
}

/**
 * 把用户主动校准出的环境噪声底下发给两条 **TS** 收音路径
 * （标准 YIN 的模块级 `yinNoiseFloor` + SOLO 单例 + 起音底噪 `updateOnsetGate` 的跟踪起点），
 * 以及 worklet 路径的对应消息。
 *
 * 为什么两条路径都要管：worklet 每次开音频都会重建实例（初值天然是干净的），
 * 而 TS 侧状态是**模块级/进程级**的；只给 worklet 下发而不给 TS 侧下发，就会复现
 * 「开 worklet 测得到、关掉 worklet 测不到」这类两条路径行为分叉的老问题。
 *
 * ⚠️ SOLO 单例是**惰性创建**的，而页面在 `startAudioInput` 一开始就下发了种子，
 * 那时单例往往还不存在。所以这里不能只在 `soloYinAnalyser` 已存在时才生效 ——
 * 否则选 SOLO 算法的用户拿到的永远是 `NOISE_FLOOR_INIT`，校准白做。
 *
 * 与 `resetPitchDetectionState()` 的区别：那个是「清空」，这个是「给一个更好的起点」，
 * 不会碰八度历史与上一帧幅度（校准期间用户正在弹/正在静音，清这些反而会引入瞬态）。
 */
export function seedPitchDetectionNoiseFloor(floor: number): void {
    if (!Number.isFinite(floor) || floor <= 0) return;
    yinNoiseFloor = floor;
    // 起音底噪同样给一个更好的起点 —— worklet 也是这么做的（`processorOptions.noiseFloor`）。
    // 🚨 必须**同时置 primed**：否则下一个音频帧会把种子整个覆盖掉，校准等于没给。
    // 置上之后走的是「从校准值继续 EMA 跟踪」，换房间/关空调仍会自适应。
    onsetNoiseFloor = floor;
    onsetNoiseFloorPrimed = true;
    if (soloYinAnalyser) {
        soloYinAnalyser.setNoiseFloor(floor);
    } else {
        pendingSoloNoiseFloor = floor;
    }
}

export function getSOLOYinAnalyser(bufferSize?: number, sampleRate?: number, threshold?: number): SOLOYinAnalyser {
    if (!soloYinAnalyser) {
        soloYinAnalyser = new SOLOYinAnalyser();
        // 补上「单例创建之前」收到的校准值：页面在 startAudioInput 一开始就 seed，
        // 而单例是在这里才惰性创建的 —— 不补的话 SOLO 算法永远从 NOISE_FLOOR_INIT 开始爬。
        if (pendingSoloNoiseFloor !== null) {
            soloYinAnalyser.setNoiseFloor(pendingSoloNoiseFloor);
        }
    }
    if (sampleRate !== undefined) {
        soloYinAnalyser.setSampleRate(sampleRate);
    }
    if (bufferSize !== undefined) {
        soloYinAnalyser.setAudioBufferSize(bufferSize);
    }
    if (threshold !== undefined) {
        soloYinAnalyser.setThreshold(threshold);
    }
    return soloYinAnalyser;
}

// ==================== 标准YIN算法（带八度修正 + 前置滤波） ====================
let yinOctaveHistory: number[] = [];


let yinNoiseFloor = NOISE_FLOOR_INIT;

export function YINPrefilter(buffer: Float32Array, sampleRate: number): Float32Array {
    const output = new Float32Array(buffer.length);
    const hpW0 = 2 * Math.PI * 35 / sampleRate;
    const hpCos = Math.cos(hpW0), hpSin = Math.sin(hpW0), hpAlpha = hpSin / 1.414;
    const hpA0 = 1 + hpAlpha;
    const hpB0 = (1 + hpCos) / 2 / hpA0, hpB1 = -(1 + hpCos) / hpA0, hpB2 = (1 + hpCos) / 2 / hpA0, hpA1 = -2 * hpCos / hpA0, hpA2 = (1 - hpAlpha) / hpA0;
    const lpW0 = 2 * Math.PI * 4500 / sampleRate;
    const lpCos = Math.cos(lpW0), lpSin = Math.sin(lpW0), lpAlpha = lpSin / 1.414;
    const lpA0 = 1 + lpAlpha;
    const lpB0 = (1 - lpCos) / 2 / lpA0, lpB1 = (1 - lpCos) / lpA0, lpB2 = (1 - lpCos) / 2 / lpA0, lpA1 = -2 * lpCos / lpA0, lpA2 = (1 - lpAlpha) / lpA0;
    let hpX1 = 0, hpX2 = 0, hpY1 = 0, hpY2 = 0;
    let lpX1 = 0, lpX2 = 0, lpY1 = 0, lpY2 = 0;
    // 工频陷波（50/60Hz，Q=15，与 Rust 前置滤波一致）
    const notches = NOTCH_FREQS.map((freq) => {
        const w0 = 2 * Math.PI * freq / sampleRate;
        const cos = Math.cos(w0), sin = Math.sin(w0);
        const alpha = sin / (2 * NOTCH_Q);
        const a0 = 1 + alpha;
        return { b0: 1 / a0, b1: -2 * cos / a0, b2: 1 / a0, a1: -2 * cos / a0, a2: (1 - alpha) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
    });
    for(let i = 0; i < buffer.length; i++){
        let s = buffer[i];
        const hpY0 = hpB0 * s + hpB1 * hpX1 + hpB2 * hpX2 - hpA1 * hpY1 - hpA2 * hpY2;
        hpX2 = hpX1;
        hpX1 = s;
        hpY2 = hpY1;
        hpY1 = hpY0;
        s = hpY0;
        const lpY0 = lpB0 * s + lpB1 * lpX1 + lpB2 * lpX2 - lpA1 * lpY1 - lpA2 * lpY2;
        lpX2 = lpX1;
        lpX1 = s;
        lpY2 = lpY1;
        lpY1 = lpY0;
        s = lpY0;
        for(let k = 0; k < notches.length; k++){
            const n = notches[k];
            const y0 = n.b0 * s + n.b1 * n.x1 + n.b2 * n.x2 - n.a1 * n.y1 - n.a2 * n.y2;
            n.x2 = n.x1;
            n.x1 = s;
            n.y2 = n.y1;
            n.y1 = y0;
            s = y0;
        }
        output[i] = s;
    }
    return output;
}

export function YINOcctaveCorrection(frequency: number, tau: number, d: Float32Array, sampleRate: number, threshold: number): { frequency: number; probability: number } {
    const { minTau, maxTau } = detectTauRange(sampleRate, d.length - 1);
    if (tau < minTau * 2) return {
        frequency,
        probability: 1 - d[tau]
    };
    const octaveTau = Math.round(tau / 2);
    if (octaveTau < minTau || octaveTau >= maxTau) return {
        frequency,
        probability: 1 - d[tau]
    };
    const octaveVal = d[octaveTau];
    const currentProb = 1 - d[tau];
    const octaveProb = 1 - octaveVal;
    if (octaveVal < threshold * 0.8 && Math.abs(octaveTau * 2 - tau) <= 2) {
        const octaveFreq = sampleRate / octaveTau;
        if (yinOctaveHistory.length >= 2) {
            const recent = yinOctaveHistory.slice(-3);
            const avg = recent.reduce((a, b)=>a + b, 0) / recent.length;
            const currentOct = Math.floor(12 * Math.log2(frequency / 440) / 12 + 4);
            const octaveOct = Math.floor(12 * Math.log2(octaveFreq / 440) / 12 + 4);
            if (Math.abs(octaveOct - avg) < Math.abs(currentOct - avg)) {
                yinOctaveHistory.push(octaveOct);
                if (yinOctaveHistory.length > 5) yinOctaveHistory.shift();
                return {
                    frequency: octaveFreq,
                    probability: octaveProb
                };
            }
        }
        if (octaveProb > currentProb * 0.9) {
            yinOctaveHistory.push(Math.floor(12 * Math.log2(octaveFreq / 440) / 12 + 4));
            if (yinOctaveHistory.length > 5) yinOctaveHistory.shift();
            return {
                frequency: octaveFreq,
                probability: octaveProb
            };
        }
    }
    yinOctaveHistory.push(Math.floor(12 * Math.log2(frequency / 440) / 12 + 4));
    if (yinOctaveHistory.length > 5) yinOctaveHistory.shift();
    return {
        frequency,
        probability: currentProb
    };
}

export function YINPitchDetection(float32AudioBuffer: Float32Array, sampleRate: number, threshold: number = 0.15, probabilityCliff: number = 0.1): { frequency: number; probability: number } | null {
    const filtered = YINPrefilter(float32AudioBuffer, sampleRate);
    const buffer = filtered;
    const N = buffer.length;
    const halfN = Math.floor(N / 2);
    const d = new Float32Array(halfN);
    let rms = 0;
    for(let i = 0; i < N; i++)rms += buffer[i] * buffer[i];
    rms = Math.sqrt(rms / N);
    yinNoiseFloor = updateNoiseFloor(yinNoiseFloor, rms);
    const adaptiveThreshold = adaptiveThresholdOf(yinNoiseFloor);
    if (rms < adaptiveThreshold) {
        yinOctaveHistory = [];
        return null;
    }
    for(let tau = 0; tau < halfN; tau++){
        let sum = 0;
        for(let i = 0; i < halfN; i++){
            const diff = buffer[i] - buffer[i + tau];
            sum += diff * diff;
        }
        d[tau] = sum;
    }
    let runningSum = 0;
    d[0] = 1;
    for(let tau = 1; tau < halfN; tau++){
        runningSum += d[tau];
        d[tau] = d[tau] * tau / runningSum;
    }
    const { minTau, maxTau } = detectTauRange(sampleRate, halfN - 1);
    let tauEstimate = -1;
    for(let tau = minTau; tau <= maxTau; tau++){
        if (d[tau] < threshold) {
            while(tau + 1 <= maxTau && d[tau + 1] < d[tau])tau++;
            tauEstimate = tau;
            break;
        }
    }
    if (tauEstimate === -1) return null;
    let betterTau = tauEstimate;
    if (tauEstimate > 0 && tauEstimate < halfN - 1) {
        const s0 = d[tauEstimate - 1], s1 = d[tauEstimate], s2 = d[tauEstimate + 1];
        const denom = s0 + s2 - 2 * s1;
        if (denom !== 0) {
            const delta = (s0 - s2) / (2 * denom);
            betterTau = tauEstimate + delta;
        }
    }
    const rawFrequency = sampleRate / betterTau;
    const corrected = YINOcctaveCorrection(rawFrequency, tauEstimate, d, sampleRate, threshold);
    if (corrected.probability < probabilityCliff) return null;
    return {
        frequency: corrected.frequency,
        probability: corrected.probability
    };
}
