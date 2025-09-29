/**
 * 应用配置和常量
 */

// 吉他标准调弦
export const standardTuning = ['E', 'B', 'G', 'D', 'A', 'E'];

// 所有可能的音级
export const intervals = ['1', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7'];

// 音级到半音距离的映射
export const intervalToSemitones = {
    '1': 0,
    '♭2': 1,
    '2': 2,
    '♯2': 3,
    '♭3': 3,
    '3': 4,
    '4': 5,
    '♭4': 4,
    '♯4': 6,
    '♭5': 6,
    '5': 7,
    '♯5': 8,
    '♭6': 8,
    '6': 9,
    '♯6': 11,
    '♭7': 10,
    '7': 11
};

// 音名到半音数的映射（C = 0）
export const noteToSemitones = {
    'C': 0, 'C♯': 1, 'D♭': 1, 'D': 2, 'D♯': 3, 'E♭': 3, 'E': 4,
    'F': 5, 'F♯': 6, 'G♭': 6, 'G': 7, 'G♯': 8, 'A♭': 8,
    'A': 9, 'A♯': 10, 'B♭': 10, 'B': 11
};

// 音阶类型定义
export const scaleTypes = {
    // 大调系列
    'major': { name: 'Major', intervals: ['1', '2', '3', '4', '5', '6', '7'] },
    'minor': { name: 'Minor', intervals: ['1', '2', '♭3', '4', '5', '♭6', '♭7'] },
    
    // 教会调式 (Church Modes)
    'ionian': { name: 'Ionian - 1 2 3 4 5 6 7', intervals: ['1', '2', '3', '4', '5', '6', '7'] },
    'dorian': { name: 'Dorian - 1 2 ♭3 4 5 6 ♭7', intervals: ['1', '2', '♭3', '4', '5', '6', '♭7'] },
    'phrygian': { name: 'Phrygian - 1 ♭2 ♭3 4 5 ♭6 ♭7', intervals: ['1', '♭2', '♭3', '4', '5', '♭6', '♭7'] },
    'lydian': { name: 'Lydian - 1 2 3 ♯4 5 6 7', intervals: ['1', '2', '3', '♯4', '5', '6', '7'] },
    'mixolydian': { name: 'Mixolydian - 1 2 3 4 5 6 ♭7', intervals: ['1', '2', '3', '4', '5', '6', '♭7'] },
    'aeolian': { name: 'Aeolian - 1 2 ♭3 4 5 ♭6 ♭7', intervals: ['1', '2', '♭3', '4', '5', '♭6', '♭7'] },
    'locrian': { name: 'Locrian - 1 ♭2 ♭3 4 ♭5 ♭6 ♭7', intervals: ['1', '♭2', '♭3', '4', '♭5', '♭6', '♭7'] },
    
    // 和声小调系列
    'harmonicMinor': { name: 'Harmonic Minor - 1 2 ♭3 4 5 ♭6 7', intervals: ['1', '2', '♭3', '4', '5', '♭6', '7'] },
    'dorianSharp2': { name: 'Dorian ♯2 - 1 ♯2 3 4 5 6 ♭7', intervals: ['1', '♯2', '3', '4', '5', '6', '♭7'] },
    'phrygianMajor': { name: 'Phrygian Major - 1 ♭2 3 4 5 ♭6 ♭7', intervals: ['1', '♭2', '3', '4', '5', '♭6', '♭7'] },
    'lydianSharp2': { name: 'Lydian ♯2 - 1 ♯2 3 ♯4 5 6 7', intervals: ['1', '♯2', '3', '♯4', '5', '6', '7'] },
    'mixolydianFlat6': { name: 'Mixolydian ♭6 - 1 2 3 4 5 ♭6 ♭7', intervals: ['1', '2', '3', '4', '5', '♭6', '♭7'] },
    'lydianFlat2': { name: 'Lydian ♭2 - 1 ♭2 3 ♯4 5 6 7', intervals: ['1', '♭2', '3', '♯4', '5', '6', '7'] },
    'superLocrianDiminished': { name: 'Super Locrian Diminished - 1 ♭2 ♭3 ♭4 ♭5 ♭6 6', intervals: ['1', '♭2', '♭3', '♭4', '♭5', '♭6', '6'] },
    
    // 旋律小调系列
    'melodicMinor': { name: 'Melodic Minor - 1 2 ♭3 4 5 6 7', intervals: ['1', '2', '♭3', '4', '5', '6', '7'] },
    'melodicMinorDescending': { name: 'Melodic Minor Descending - 1 ♭7 ♭6 5 4 ♭3 2 1', intervals: ['1', '♭7', '♭6', '5', '4', '♭3', '2', '1'] },
    'dorianFlat2': { name: 'Dorian ♭2 - 1 ♭2 ♭3 4 5 6 ♭7', intervals: ['1', '♭2', '♭3', '4', '5', '6', '♭7'] },
    'lydianAugmented': { name: 'Lydian Augmented - 1 2 3 ♯4 ♯5 6 7', intervals: ['1', '2', '3', '♯4', '♯5', '6', '7'] },
    'lydianFlat7': { name: 'Lydian ♭7 - 1 2 3 ♯4 5 6 ♭7', intervals: ['1', '2', '3', '♯4', '5', '6', '♭7'] },
    'aeolianFlat5': { name: 'Aeolian ♭5 - 1 2 ♭3 4 ♭5 ♭6 ♭7', intervals: ['1', '2', '♭3', '4', '♭5', '♭6', '♭7'] },
    'superLocrian': { name: 'Super Locrian - 1 ♭2 ♭3 ♭4 ♭5 ♭6 ♭7', intervals: ['1', '♭2', '♭3', '♭4', '♭5', '♭6', '♭7'] },
    
    // 五声音阶系列
    'majorPentatonic': { name: 'Major Pentatonic - 1 2 3 5 6', intervals: ['1', '2', '3', '5', '6'] },
    'minorPentatonic': { name: 'Minor Pentatonic - 1 ♭3 4 5 ♭7', intervals: ['1', '♭3', '4', '5', '♭7'] },
    'dorianPentatonic': { name: 'Dorian Pentatonic - 1 2 ♭3 5 6', intervals: ['1', '2', '♭3', '5', '6'] },
    'phrygianPentatonic': { name: 'Phrygian Pentatonic - 1 ♭2 4 5 ♭6', intervals: ['1', '♭2', '4', '5', '♭6'] },
    'mixolydianPentatonic': { name: 'Mixolydian Pentatonic - 1 2 3 5 ♭7', intervals: ['1', '2', '3', '5', '♭7'] },
    
    // 布鲁斯音阶系列
    'blues': { name: 'Blues - 1 ♭3 4 ♯4 5 ♭7', intervals: ['1', '♭3', '4', '♯4', '5', '♭7'] },
    'majorBlues': { name: 'Major Blues - 1 2 ♭3 3 5 6', intervals: ['1', '2', '♭3', '3', '5', '6'] },
    
    // 其他常见音阶
    'wholeTone': { name: 'Whole Tone - 1 2 3 ♯4 ♯5 ♯6', intervals: ['1', '2', '3', '♯4', '♯5', '♯6'] },
    'diminished': { name: 'Diminished (Half-Whole) - 1 ♭2 ♭3 3 ♯4 5 6 ♭7', intervals: ['1', '♭2', '♭3', '3', '♯4', '5', '6', '♭7'] },
    'diminishedWhole': { name: 'Diminished (Whole-Half) - 1 2 ♭3 ♯4 ♯5 6 7', intervals: ['1', '2', '♭3', '♯4', '♯5', '6', '7'] },
    'chromatic': { name: 'Chromatic - 1 ♭2 2 ♭3 3 4 ♯4 5 ♭6 6 ♭7 7', intervals: ['1', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7'] },
    
    // 异国风格音阶
    'arabic': { name: 'Arabic - 1 ♭2 3 4 5 ♭6 ♭7', intervals: ['1', '♭2', '3', '4', '5', '♭6', '♭7'] },
    'gypsy': { name: 'Gypsy - 1 ♭2 3 4 5 ♭6 7', intervals: ['1', '♭2', '3', '4', '5', '♭6', '7'] },
    'japanese': { name: 'Japanese - 1 ♭2 4 5 ♭6', intervals: ['1', '♭2', '4', '5', '♭6'] },
    'egyptian': { name: 'Egyptian - 1 2 4 5 ♭7', intervals: ['1', '2', '4', '5', '♭7'] },
    'hungarian': { name: 'Hungarian - 1 ♯2 3 ♯4 5 ♭6 7', intervals: ['1', '♯2', '3', '♯4', '5', '♭6', '7'] },
    'persian': { name: 'Persian - 1 ♭2 3 4 ♭5 ♭6 7', intervals: ['1', '♭2', '3', '4', '♭5', '♭6', '7'] },
    'byzantine': { name: 'Byzantine - 1 ♭2 3 4 5 ♭6 7', intervals: ['1', '♭2', '3', '4', '5', '♭6', '7'] },
    'enigmatic': { name: 'Enigmatic - 1 ♭2 3 ♯4 ♯5 ♯6 7', intervals: ['1', '♭2', '3', '♯4', '♯5', '♯6', '7'] },
    'neapolitan': { name: 'Neapolitan - 1 ♭2 ♭3 4 5 ♭6 7', intervals: ['1', '♭2', '♭3', '4', '5', '♭6', '7'] },
    'spanish': { name: 'Spanish - 1 ♭2 3 4 5 ♭6 ♭7', intervals: ['1', '♭2', '3', '4', '5', '♭6', '♭7'] }
};

// 和弦类型定义
export const chordTypes = {
    // 基础三和弦
    'major': { name: '大三和弦', intervals: ['1', '3', '5'] },
    'minor': { name: '小三和弦', intervals: ['1', '♭3', '5'] },
    'diminished': { name: '减三和弦', intervals: ['1', '♭3', '♭5'] },
    'augmented': { name: '增三和弦', intervals: ['1', '3', '♯5'] },
    
    // 六和弦
    'major6': { name: '大六和弦', intervals: ['1', '3', '5', '6'] },
    'minor6': { name: '小六和弦', intervals: ['1', '♭3', '5', '6'] },
    
    // 七和弦
    'dominant7': { name: '属七和弦', intervals: ['1', '3', '5', '♭7'] },
    'major7': { name: '大七和弦', intervals: ['1', '3', '5', '7'] },
    'minor7': { name: '小七和弦', intervals: ['1', '♭3', '5', '♭7'] },
    'minor7b5': { name: '半减七和弦', intervals: ['1', '♭3', '♭5', '♭7'] },
    'diminished7': { name: '减七和弦', intervals: ['1', '♭3', '♭5', '6'] },
    
    // 九和弦
    'dominant9': { name: '属九和弦', intervals: ['1', '3', '5', '♭7', '2'] },
    'major9': { name: '大九和弦', intervals: ['1', '3', '5', '7', '2'] },
    'minor9': { name: '小九和弦', intervals: ['1', '♭3', '5', '♭7', '2'] },
    'dominant7sharp9': { name: '属7♯9和弦', intervals: ['1', '3', '5', '♭7', '♯2'] },
    'dominant7flat9': { name: '属7♭9和弦', intervals: ['1', '3', '5', '♭7', '♭2'] },
    
    // 十一和弦
    'dominant11': { name: '属11和弦', intervals: ['1', '3', '5', '♭7', '2', '4'] },
    'minor11': { name: '小11和弦', intervals: ['1', '♭3', '5', '♭7', '2', '4'] },
    'dominant7sharp11': { name: '属7♯11和弦', intervals: ['1', '3', '5', '♭7', '♯4'] },
    
    // 十三和弦
    'dominant13': { name: '属13和弦', intervals: ['1', '3', '5', '♭7', '2', '6'] },
    'minor13': { name: '小13和弦', intervals: ['1', '♭3', '5', '♭7', '2', '6'] },
    
    // 挂留和弦
    'sus2': { name: '挂二和弦', intervals: ['1', '2', '5'] },
    'sus4': { name: '挂四和弦', intervals: ['1', '4', '5'] },
    
    // 加音和弦
    'add9': { name: '加九和弦', intervals: ['1', '3', '5', '2'] },
    'madd9': { name: '小加九和弦', intervals: ['1', '♭3', '5', '2'] },
    '6add9': { name: '六加九和弦', intervals: ['1', '3', '5', '6', '2'] },
    'm6add9': { name: '小六加九和弦', intervals: ['1', '♭3', '5', '6', '2'] }
};

// 默认状态
export const defaultState = {
    score: 0,
    correctCount: 0,
    totalCount: 0,
    accuracy: 0,
    rootNote: '',
    scaleType: '',
    chordType: '',
    currentIntervals: [],
    currentSequence: [],
    currentStep: 0,
    correctPositions: [],
    isCoolingDown: false,
    cooldownTimeout: null,
    cooldownDuration: 800,
    isAnswered: false,
    timeoutId: null,
    maxFret: 12,
    previousMaxFret: 12,
    isRecording: false,
    sensitivity: 0.5,
    confidenceThreshold: 0.5,
    noiseLevel: 0.001,
    minVolume: 0.001,
    microphoneInitialized: false,
    pitchBuffer: [],
    bufferSize: 3,
    zeroCrossingThreshold: 0.1,
    harmonicWeights: [1.0, 0.8, 0.6],
    nextExerciseInfo: '',
    nextExerciseIntervals: [],
    metronomeEnabled: false,
    metronomeTempo: 40,
    metronomeInterval: null
};

// 音符名称数组（用于显示）
export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

// 应用版本信息
export const APP_VERSION = '1.0.0';
export const APP_NAME = '吉他音阶与和弦练习工具';

// 音频配置
export const AUDIO_CONFIG = {
    sampleRate: 48000,
    fftSize: 4096,
    bufferSize: 4096,
    latencyHint: 'interactive'
};

// YIN算法参数
export const YIN_CONFIG = {
    threshold: 0.15,
    probabilityCliff: 0.1,
    lowFreqThreshold: 0.05,
    lowFreqProbabilityCliff: 0.05
};

// 匹配阈值配置
export const PITCH_MATCHING = {
    defaultThreshold: 15,
    rootNoteThreshold: 25,
    lowFreqThreshold: 35,
    lowFreqCutoff: 110
};