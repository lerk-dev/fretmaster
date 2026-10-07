// ==================== SOLO 风格音阶和调式系统 ====================
// 完整实现 SOLO 的音阶类型、调式系统和和弦音阶选项

import { Note, noteFromToneId } from './chord-theory'
import { ChordType } from './chord-theory'

// ==================== 音阶类型枚举 ====================
export enum ScaleType {
  major = 'major',
  naturalMinor = 'naturalMinor',
  harmonicMinor = 'harmonicMinor',
  melodicMinor = 'melodicMinor',
  dorian = 'dorian',
  phrygian = 'phrygian',
  lydian = 'lydian',
  mixolydian = 'mixolydian',
  aeolian = 'aeolian',
  locrian = 'locrian',
  locrianNat6 = 'locrianNat6',
  ionianAugmented = 'ionianAugmented',
  dorianSharp4 = 'dorianSharp4',
  lydianAugmented = 'lydianAugmented',
  lydianDominant = 'lydianDominant',
  phrygianDominant = 'phrygianDominant',
  altered = 'altered',
  alteredDominantFlatFlat7 = 'alteredDominantFlatFlat7',
  diminishedHalfWhole = 'diminishedHalfWhole',
  diminishedWholeHalf = 'diminishedWholeHalf',
  wholeTone = 'wholeTone',
  majorPentatonic = 'majorPentatonic',
  minorPentatonic = 'minorPentatonic',
  blues = 'blues',
  bebopDominant = 'bebopDominant',
  bebopMajor = 'bebopMajor',
  bebopMinor = 'bebopMinor',
  lydianSharp9 = 'lydianSharp9',
  mixolydianFlat6 = 'mixolydianFlat6',
}

// ==================== 音阶音程定义 ====================
export const SCALE_INTERVALS: Record<ScaleType, number[]> = {
  [ScaleType.major]: [0, 2, 4, 5, 7, 9, 11],
  [ScaleType.naturalMinor]: [0, 2, 3, 5, 7, 8, 10],
  [ScaleType.harmonicMinor]: [0, 2, 3, 5, 7, 8, 11],
  [ScaleType.melodicMinor]: [0, 2, 3, 5, 7, 9, 11],
  [ScaleType.dorian]: [0, 2, 3, 5, 7, 9, 10],
  [ScaleType.phrygian]: [0, 1, 3, 5, 7, 8, 10],
  [ScaleType.lydian]: [0, 2, 4, 6, 7, 9, 11],
  [ScaleType.mixolydian]: [0, 2, 4, 5, 7, 9, 10],
  [ScaleType.aeolian]: [0, 2, 3, 5, 7, 8, 10],
  [ScaleType.locrian]: [0, 1, 3, 5, 6, 8, 10],
  [ScaleType.locrianNat6]: [0, 1, 3, 5, 6, 9, 10],
  [ScaleType.ionianAugmented]: [0, 2, 4, 5, 8, 9, 11],
  [ScaleType.dorianSharp4]: [0, 2, 3, 6, 7, 9, 10],
  [ScaleType.lydianAugmented]: [0, 2, 4, 6, 8, 9, 11],
  [ScaleType.lydianDominant]: [0, 2, 4, 6, 7, 9, 10],
  [ScaleType.phrygianDominant]: [0, 1, 4, 5, 7, 8, 10],
  [ScaleType.altered]: [0, 1, 3, 4, 6, 8, 10],
  [ScaleType.alteredDominantFlatFlat7]: [0, 1, 3, 4, 6, 8, 9],
  [ScaleType.diminishedHalfWhole]: [0, 1, 3, 4, 6, 7, 9, 10],
  [ScaleType.diminishedWholeHalf]: [0, 2, 3, 5, 6, 8, 9, 11],
  [ScaleType.wholeTone]: [0, 2, 4, 6, 8, 10],
  [ScaleType.majorPentatonic]: [0, 2, 4, 7, 9],
  [ScaleType.minorPentatonic]: [0, 3, 5, 7, 10],
  [ScaleType.blues]: [0, 3, 5, 6, 7, 10],
  [ScaleType.bebopDominant]: [0, 2, 4, 5, 7, 9, 10, 11],
  [ScaleType.bebopMajor]: [0, 2, 4, 5, 7, 8, 9, 11],
  [ScaleType.bebopMinor]: [0, 2, 3, 5, 7, 8, 10, 11],
  [ScaleType.lydianSharp9]: [0, 3, 4, 6, 7, 9, 11],
  [ScaleType.mixolydianFlat6]: [0, 2, 4, 5, 7, 8, 10],
}

// ==================== 音阶显示名称 ====================
export const SCALE_DISPLAY_NAMES: Record<ScaleType, { standard: string; unicode: string; chinese: string }> = {
  [ScaleType.major]: { standard: 'Major', unicode: 'Major', chinese: '大调' },
  [ScaleType.naturalMinor]: { standard: 'Natural Minor', unicode: 'Natural Minor', chinese: '自然小调' },
  [ScaleType.harmonicMinor]: { standard: 'Harmonic Minor', unicode: 'Harmonic Minor', chinese: '和声小调' },
  [ScaleType.melodicMinor]: { standard: 'Melodic Minor', unicode: 'Melodic Minor', chinese: '旋律小调' },
  [ScaleType.dorian]: { standard: 'Dorian', unicode: 'Dorian', chinese: '多利亚' },
  [ScaleType.phrygian]: { standard: 'Phrygian', unicode: 'Phrygian', chinese: '弗里几亚' },
  [ScaleType.lydian]: { standard: 'Lydian', unicode: 'Lydian', chinese: '利底亚' },
  [ScaleType.mixolydian]: { standard: 'Mixolydian', unicode: 'Mixolydian', chinese: '混合利底亚' },
  [ScaleType.aeolian]: { standard: 'Aeolian', unicode: 'Aeolian', chinese: '爱奥利亚' },
  [ScaleType.locrian]: { standard: 'Locrian', unicode: 'Locrian', chinese: '洛克里亚' },
  [ScaleType.locrianNat6]: { standard: 'Locrian #6', unicode: 'Locrian ♯6', chinese: '洛克里亚#6' },
  [ScaleType.ionianAugmented]: { standard: 'Ionian Augmented', unicode: 'Ionian Augmented', chinese: '增伊奥尼亚' },
  [ScaleType.dorianSharp4]: { standard: 'Dorian #4', unicode: 'Dorian ♯4', chinese: '多利亚#4' },
  [ScaleType.lydianAugmented]: { standard: 'Lydian Augmented', unicode: 'Lydian Augmented', chinese: '增利底亚' },
  [ScaleType.lydianDominant]: { standard: 'Lydian Dominant', unicode: 'Lydian Dominant', chinese: '利底亚属' },
  [ScaleType.phrygianDominant]: { standard: 'Phrygian Dominant', unicode: 'Phrygian Dominant', chinese: '弗里几亚属' },
  [ScaleType.altered]: { standard: 'Altered', unicode: 'Altered', chinese: '变化音阶' },
  [ScaleType.alteredDominantFlatFlat7]: { standard: 'Altered Dominant bb7', unicode: 'Altered Dominant 𝄫7', chinese: '变化属音阶bb7' },
  [ScaleType.diminishedHalfWhole]: { standard: 'Diminished H/W', unicode: 'Diminished H/W', chinese: '减音阶(半全)' },
  [ScaleType.diminishedWholeHalf]: { standard: 'Diminished W/H', unicode: 'Diminished W/H', chinese: '减音阶(全半)' },
  [ScaleType.wholeTone]: { standard: 'Whole Tone', unicode: 'Whole Tone', chinese: '全音阶' },
  [ScaleType.majorPentatonic]: { standard: 'Major Pentatonic', unicode: 'Major Pentatonic', chinese: '大调五声' },
  [ScaleType.minorPentatonic]: { standard: 'Minor Pentatonic', unicode: 'Minor Pentatonic', chinese: '小调五声' },
  [ScaleType.blues]: { standard: 'Blues', unicode: 'Blues', chinese: '布鲁斯' },
  [ScaleType.bebopDominant]: { standard: 'Bebop Dominant', unicode: 'Bebop Dominant', chinese: 'Bebop属音阶' },
  [ScaleType.bebopMajor]: { standard: 'Bebop Major', unicode: 'Bebop Major', chinese: 'Bebop大调' },
  [ScaleType.bebopMinor]: { standard: 'Bebop Minor', unicode: 'Bebop Minor', chinese: 'Bebop小调' },
  [ScaleType.lydianSharp9]: { standard: 'Lydian #9', unicode: 'Lydian ♯9', chinese: '利底亚#9' },
  [ScaleType.mixolydianFlat6]: { standard: 'Mixolydian b6', unicode: 'Mixolydian ♭6', chinese: '混合利底亚b6' },
}

// ==================== 音阶音程显示 ====================
export const SCALE_INTERVAL_DISPLAY: Record<ScaleType, string[]> = {
  [ScaleType.major]: ['1', '2', '3', '4', '5', '6', '7'],
  [ScaleType.naturalMinor]: ['1', '2', 'b3', '4', '5', 'b6', 'b7'],
  [ScaleType.harmonicMinor]: ['1', '2', 'b3', '4', '5', 'b6', '7'],
  [ScaleType.melodicMinor]: ['1', '2', 'b3', '4', '5', '6', '7'],
  [ScaleType.dorian]: ['1', '2', 'b3', '4', '5', '6', 'b7'],
  [ScaleType.phrygian]: ['1', 'b2', 'b3', '4', '5', 'b6', 'b7'],
  [ScaleType.lydian]: ['1', '2', '3', '#4', '5', '6', '7'],
  [ScaleType.mixolydian]: ['1', '2', '3', '4', '5', '6', 'b7'],
  [ScaleType.aeolian]: ['1', '2', 'b3', '4', '5', 'b6', 'b7'],
  [ScaleType.locrian]: ['1', 'b2', 'b3', '4', 'b5', 'b6', 'b7'],
  [ScaleType.locrianNat6]: ['1', 'b2', 'b3', '4', 'b5', '6', 'b7'],
  [ScaleType.ionianAugmented]: ['1', '2', '3', '4', '#5', '6', '7'],
  [ScaleType.dorianSharp4]: ['1', '2', 'b3', '#4', '5', '6', 'b7'],
  [ScaleType.lydianAugmented]: ['1', '2', '3', '#4', '#5', '6', '7'],
  [ScaleType.lydianDominant]: ['1', '2', '3', '#4', '5', '6', 'b7'],
  [ScaleType.phrygianDominant]: ['1', 'b2', '3', '4', '5', 'b6', 'b7'],
  [ScaleType.altered]: ['1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'],
  [ScaleType.alteredDominantFlatFlat7]: ['1', 'b2', 'b3', 'b4', 'b5', 'b6', 'bb7'],
  [ScaleType.diminishedHalfWhole]: ['1', 'b2', '#2', '3', '#4', '5', '6', 'b7'],
  [ScaleType.diminishedWholeHalf]: ['1', '2', 'b3', '4', 'b5', '#5', '6', '7'],
  [ScaleType.wholeTone]: ['1', '2', '3', '#4', '#5', 'b7'],
  [ScaleType.majorPentatonic]: ['1', '2', '3', '5', '6'],
  [ScaleType.minorPentatonic]: ['1', 'b3', '4', '5', 'b7'],
  [ScaleType.blues]: ['1', 'b3', '4', 'b5', '5', 'b7'],
  [ScaleType.bebopDominant]: ['1', '2', '3', '4', '5', '6', 'b7', '7'],
  [ScaleType.bebopMajor]: ['1', '2', '3', '4', '5', 'b6', '6', '7'],
  [ScaleType.bebopMinor]: ['1', '2', 'b3', '4', '5', 'b6', 'b7', '7'],
  [ScaleType.lydianSharp9]: ['1', '#9', '3', '#4', '5', '6', '7'],
  [ScaleType.mixolydianFlat6]: ['1', '2', '3', '4', '5', 'b6', 'b7'],
}

// ==================== 和弦音阶选项映射 ====================
export const CHORD_SCALE_OPTIONS: Record<ChordType, ScaleType[]> = {
  [ChordType.majorTriad]: [ScaleType.major, ScaleType.lydian, ScaleType.mixolydian],
  [ChordType.minorTriad]: [ScaleType.dorian, ScaleType.aeolian, ScaleType.phrygian],
  [ChordType.diminishedTriad]: [ScaleType.locrian],
  [ChordType.augmentedTriad]: [ScaleType.lydianAugmented, ScaleType.wholeTone],
  [ChordType.susTwoTriad]: [ScaleType.dorian, ScaleType.aeolian],
  [ChordType.susFourTriad]: [ScaleType.major, ScaleType.mixolydian],
  [ChordType.addNine]: [ScaleType.major, ScaleType.lydian],
  [ChordType.minorAddNine]: [ScaleType.dorian, ScaleType.aeolian],
  [ChordType.diminished]: [ScaleType.diminishedWholeHalf],
  [ChordType.diminishedMajorSeven]: [ScaleType.diminishedWholeHalf],
  [ChordType.dominantNine]: [ScaleType.mixolydian, ScaleType.lydianDominant],
  [ChordType.dominantNineFlatThirteen]: [ScaleType.mixolydianFlat6],
  [ChordType.dominantNineSharpEleven]: [ScaleType.lydianDominant],
  [ChordType.dominantSeven]: [ScaleType.mixolydian, ScaleType.lydianDominant],
  [ChordType.dominantSevenAlt]: [ScaleType.altered],
  [ChordType.dominantSevenFlatFive]: [ScaleType.lydianDominant, ScaleType.wholeTone],
  [ChordType.dominantSevenFlatNine]: [ScaleType.phrygianDominant, ScaleType.diminishedHalfWhole],
  [ChordType.dominantSevenFlatNineFlatThirteen]: [ScaleType.phrygianDominant],
  [ChordType.dominantSevenFlatFiveFlatNine]: [ScaleType.altered, ScaleType.diminishedHalfWhole],
  [ChordType.dominantSevenFlatFiveSharpNine]: [ScaleType.altered, ScaleType.diminishedHalfWhole],
  [ChordType.dominantSevenSharpFive]: [ScaleType.wholeTone, ScaleType.altered],
  [ChordType.dominantSevenSharpNine]: [ScaleType.diminishedHalfWhole],
  [ChordType.dominantSevenFlatThirteen]: [ScaleType.mixolydianFlat6, ScaleType.phrygianDominant],
  [ChordType.dominantSevenSharpEleven]: [ScaleType.lydianDominant],
  [ChordType.dominantSevenSharpFiveFlatNine]: [ScaleType.altered, ScaleType.phrygianDominant],
  [ChordType.dominantSevenSharpFiveSharpNine]: [ScaleType.altered],
  [ChordType.dominantThirteen]: [ScaleType.mixolydian, ScaleType.lydianDominant],
  [ChordType.dominantThirteenFlatNine]: [ScaleType.diminishedHalfWhole],
  [ChordType.dominantThirteenSharpNine]: [ScaleType.diminishedHalfWhole],
  [ChordType.dominantThirteenSharpEleven]: [ScaleType.lydianDominant],
  [ChordType.majorNine]: [ScaleType.major, ScaleType.lydian],
  [ChordType.majorNineSharpEleven]: [ScaleType.lydian],
  [ChordType.majorNineSharpFive]: [ScaleType.lydianAugmented],
  [ChordType.majorNineFlatSix]: [ScaleType.bebopMajor],
  [ChordType.majorSeven]: [ScaleType.major, ScaleType.lydian],
  [ChordType.majorSevenSharpEleven]: [ScaleType.lydian],
  [ChordType.majorSevenSharpFive]: [ScaleType.lydianAugmented],
  [ChordType.majorSevenFlatSix]: [ScaleType.bebopMajor],
  [ChordType.majorSevenSharpNine]: [ScaleType.lydianSharp9],
  [ChordType.majorThirteen]: [ScaleType.major, ScaleType.lydian],
  [ChordType.majorThirteenSharpEleven]: [ScaleType.lydian],
  [ChordType.majorThirteenSharpFive]: [ScaleType.lydianAugmented],
  [ChordType.minorEleven]: [ScaleType.dorian, ScaleType.aeolian],
  [ChordType.minorMajorNine]: [ScaleType.harmonicMinor, ScaleType.melodicMinor],
  [ChordType.minorMajorSeven]: [ScaleType.harmonicMinor, ScaleType.melodicMinor],
  [ChordType.minorMajorThirteen]: [ScaleType.melodicMinor],
  [ChordType.minorNine]: [ScaleType.dorian, ScaleType.aeolian],
  [ChordType.minorSeven]: [ScaleType.dorian, ScaleType.aeolian, ScaleType.phrygian],
  [ChordType.minorSevenFlatFive]: [ScaleType.locrian, ScaleType.locrianNat6],
  [ChordType.minorSevenFlatFiveNatNine]: [ScaleType.dorianSharp4],
  [ChordType.minorSevenFlatSix]: [ScaleType.aeolian],
  [ChordType.minorSix]: [ScaleType.dorian, ScaleType.melodicMinor],
  [ChordType.minorSixNine]: [ScaleType.dorian],
  [ChordType.minorThirteen]: [ScaleType.dorian],
  [ChordType.nineSusFour]: [ScaleType.mixolydian],
  [ChordType.sevenSusFour]: [ScaleType.mixolydian],
  [ChordType.sevenSusFourFlatNine]: [ScaleType.phrygianDominant],
  [ChordType.six]: [ScaleType.major, ScaleType.lydian],
  [ChordType.sixNine]: [ScaleType.major, ScaleType.lydian],
  [ChordType.susFourFlatNine]: [ScaleType.phrygianDominant],
  [ChordType.thirteenSusFour]: [ScaleType.mixolydian],
  [ChordType.thirteenSusFourFlatNine]: [ScaleType.phrygianDominant],
}

// ==================== 调式系统 ====================
export enum KeyType {
  major = 'major',
  minor = 'minor',
}

export interface Key {
  rootNote: Note
  type: KeyType
  isFlat: boolean
}

export function getScaleNotes(rootNote: Note, scaleType: ScaleType): Note[] {
  const intervals = SCALE_INTERVALS[scaleType] ?? []
  return intervals.map(interval => noteFromToneId(rootNote + interval, false))
}

export function getScaleDisplayName(scaleType: ScaleType, useUnicode: boolean = true, language: 'zh' | 'en' = 'zh'): string {
  const info = SCALE_DISPLAY_NAMES[scaleType]
  if (!info) return scaleType
  
  if (language === 'zh') {
    return info.chinese
  }
  return useUnicode ? info.unicode : info.standard
}

// ==================== 和弦音阶选项 ====================
export function getScaleOptionsForChord(chordType: ChordType): ScaleType[] {
  return CHORD_SCALE_OPTIONS[chordType] ?? [ScaleType.major]
}

// ==================== 音阶模式 ====================
export interface ScalePattern {
  type: ScaleType
  rootNote: Note
  notes: Note[]
  intervals: string[]
}
