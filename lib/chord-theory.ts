// ==================== SOLO 风格和弦理论系统 ====================
// 完整实现 SOLO 的 ChordToken 解析器、Unicode 变音符号、Function 系统

// ==================== 音符类型 ====================
export type NoteValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11

export enum Note {
  C = 0,
  C_SHARP = 1,
  D = 2,
  D_SHARP = 3,
  E = 4,
  F = 5,
  F_SHARP = 6,
  G = 7,
  G_SHARP = 8,
  A = 9,
  A_SHARP = 10,
  B = 11,
}

export enum NoteFlat {
  C = 0,
  D_FLAT = 1,
  D = 2,
  E_FLAT = 3,
  E = 4,
  F = 5,
  G_FLAT = 6,
  G = 7,
  A_FLAT = 8,
  A = 9,
  B_FLAT = 10,
  B = 11,
}

export const NOTE_NAMES: Record<number, string> = {
  [Note.C]: 'C',
  [Note.C_SHARP]: 'C#',
  [Note.D]: 'D',
  [Note.D_SHARP]: 'D#',
  [Note.E]: 'E',
  [Note.F]: 'F',
  [Note.F_SHARP]: 'F#',
  [Note.G]: 'G',
  [Note.G_SHARP]: 'G#',
  [Note.A]: 'A',
  [Note.A_SHARP]: 'A#',
  [Note.B]: 'B',
}

export const NOTE_NAMES_FLAT: Record<number, string> = {
  [NoteFlat.C]: 'C',
  [NoteFlat.D_FLAT]: 'Db',
  [NoteFlat.D]: 'D',
  [NoteFlat.E_FLAT]: 'Eb',
  [NoteFlat.E]: 'E',
  [NoteFlat.F]: 'F',
  [NoteFlat.G_FLAT]: 'Gb',
  [NoteFlat.G]: 'G',
  [NoteFlat.A_FLAT]: 'Ab',
  [NoteFlat.A]: 'A',
  [NoteFlat.B_FLAT]: 'Bb',
  [NoteFlat.B]: 'B',
}

export const NOTE_UNICODE_NAMES: Record<number, string> = {
  [Note.C]: 'C',
  [Note.C_SHARP]: 'C♯',
  [Note.D]: 'D',
  [Note.D_SHARP]: 'D♯',
  [Note.E]: 'E',
  [Note.F]: 'F',
  [Note.F_SHARP]: 'F♯',
  [Note.G]: 'G',
  [Note.G_SHARP]: 'G♯',
  [Note.A]: 'A',
  [Note.A_SHARP]: 'A♯',
  [Note.B]: 'B',
}

export const NOTE_UNICODE_NAMES_FLAT: Record<number, string> = {
  [NoteFlat.C]: 'C',
  [NoteFlat.D_FLAT]: 'D♭',
  [NoteFlat.D]: 'D',
  [NoteFlat.E_FLAT]: 'E♭',
  [NoteFlat.E]: 'E',
  [NoteFlat.F]: 'F',
  [NoteFlat.G_FLAT]: 'G♭',
  [NoteFlat.G]: 'G',
  [NoteFlat.A_FLAT]: 'A♭',
  [NoteFlat.A]: 'A',
  [NoteFlat.B_FLAT]: 'B♭',
  [NoteFlat.B]: 'B',
}

export const NATURAL_NOTES: number[] = [Note.C, Note.D, Note.E, Note.F, Note.G, Note.A, Note.B]

export function noteFromToneId(toneId: number, preferFlat: boolean = false): number {
  const normalizedToneId = ((toneId % 12) + 12) % 12
  return normalizedToneId
}

export function getNoteName(toneId: number, preferFlat: boolean = false, useUnicode: boolean = false): string {
  const names = preferFlat 
    ? (useUnicode ? NOTE_UNICODE_NAMES_FLAT : NOTE_NAMES_FLAT)
    : (useUnicode ? NOTE_UNICODE_NAMES : NOTE_NAMES)
  return names[toneId] ?? 'C'
}

export function noteFromString(noteStr: string): number | null {
  const normalized = noteStr.trim().toLowerCase()
  const noteMap: Record<string, number> = {
    'c': Note.C, 'c#': Note.C_SHARP, 'c♯': Note.C_SHARP, 'db': NoteFlat.D_FLAT, 'd♭': NoteFlat.D_FLAT,
    'd': Note.D, 'd#': Note.D_SHARP, 'd♯': Note.D_SHARP, 'eb': NoteFlat.E_FLAT, 'e♭': NoteFlat.E_FLAT,
    'e': Note.E, 'f': Note.F, 'f#': Note.F_SHARP, 'f♯': Note.F_SHARP, 'gb': NoteFlat.G_FLAT, 'g♭': NoteFlat.G_FLAT,
    'g': Note.G, 'g#': Note.G_SHARP, 'g♯': Note.G_SHARP, 'ab': NoteFlat.A_FLAT, 'a♭': NoteFlat.A_FLAT,
    'a': Note.A, 'a#': Note.A_SHARP, 'a♯': Note.A_SHARP, 'bb': NoteFlat.B_FLAT, 'b♭': NoteFlat.B_FLAT,
    'b': Note.B,
  }
  return noteMap[normalized] ?? null
}

export function isSharpNote(toneId: number): boolean {
  return [Note.C_SHARP, Note.D_SHARP, Note.F_SHARP, Note.G_SHARP, Note.A_SHARP].includes(toneId)
}

export function isFlatNote(toneId: number): boolean {
  return [NoteFlat.D_FLAT, NoteFlat.E_FLAT, NoteFlat.G_FLAT, NoteFlat.A_FLAT, NoteFlat.B_FLAT].includes(toneId)
}

export function isNaturalNote(toneId: number): boolean {
  return NATURAL_NOTES.includes(toneId)
}

export function getPreferredVisualNote(toneId: number, preferSharp: boolean = true): number {
  return toneId
}

// ==================== 和声功能枚举 (Function) ====================
export enum ChordFunction {
  I = 'I',
  II = 'II',
  III = 'III',
  IV = 'IV',
  IVm = 'IVm',
  V = 'V',
  Vdim = 'Vdim',
  VI = 'VI',
  VII = 'VII',
  NRD = 'NRD',
  Dim = 'Dim',
}

export const FUNCTION_DISPLAY_NAMES: Record<ChordFunction, string> = {
  [ChordFunction.I]: 'I',
  [ChordFunction.II]: 'II',
  [ChordFunction.III]: 'III',
  [ChordFunction.IV]: 'IV',
  [ChordFunction.IVm]: 'IVm',
  [ChordFunction.V]: 'V',
  [ChordFunction.Vdim]: 'Vdim',
  [ChordFunction.VI]: 'VI',
  [ChordFunction.VII]: 'VII',
  [ChordFunction.NRD]: 'NRD',
  [ChordFunction.Dim]: 'Dim',
}

export const FUNCTION_CHINESE_NAMES: Record<ChordFunction, string> = {
  [ChordFunction.I]: 'I级',
  [ChordFunction.II]: 'II级',
  [ChordFunction.III]: 'III级',
  [ChordFunction.IV]: 'IV级',
  [ChordFunction.IVm]: 'IVm级',
  [ChordFunction.V]: 'V级',
  [ChordFunction.Vdim]: 'Vdim级',
  [ChordFunction.VI]: 'VI级',
  [ChordFunction.VII]: 'VII级',
  [ChordFunction.NRD]: '非调内',
  [ChordFunction.Dim]: '减和弦',
}

// ==================== ChordToken 枚举 ====================
export enum ChordToken {
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
  E = 'E',
  F = 'F',
  G = 'G',
  FLAT = 'FLAT',
  SHARP = 'SHARP',
  SLASH = 'SLASH',
  MAJOR = 'MAJOR',
  MINOR = 'MINOR',
  DIMINISHED = 'DIMINISHED',
  AUGMENTED = 'AUGMENTED',
  SUS2 = 'SUS2',
  SUS4 = 'SUS4',
  ADD9 = 'ADD9',
  SIX = 'SIX',
  SEVEN = 'SEVEN',
  NINE = 'NINE',
  ELEVEN = 'ELEVEN',
  THIRTEEN = 'THIRTEEN',
  FLAT_FIVE = 'FLAT_FIVE',
  SHARP_FIVE = 'SHARP_FIVE',
  FLAT_SIX = 'FLAT_SIX',
  FLAT_NINE = 'FLAT_NINE',
  SHARP_NINE = 'SHARP_NINE',
  SHARP_ELEVEN = 'SHARP_ELEVEN',
  FLAT_THIRTEEN = 'FLAT_THIRTEEN',
  ALT = 'ALT',
}

export const ROOT_NOTE_TOKENS: ChordToken[] = [
  ChordToken.A, ChordToken.B, ChordToken.C, ChordToken.D, ChordToken.E, ChordToken.F, ChordToken.G
]

export const ACCIDENTAL_TOKENS: ChordToken[] = [ChordToken.FLAT, ChordToken.SHARP]

export function getChordTokenDisplayString(token: ChordToken): string {
  const displayMap: Record<ChordToken, string> = {
    [ChordToken.A]: 'A',
    [ChordToken.B]: 'B',
    [ChordToken.C]: 'C',
    [ChordToken.D]: 'D',
    [ChordToken.E]: 'E',
    [ChordToken.F]: 'F',
    [ChordToken.G]: 'G',
    [ChordToken.FLAT]: 'b',
    [ChordToken.SHARP]: '#',
    [ChordToken.SLASH]: '/',
    [ChordToken.MAJOR]: 'Maj',
    [ChordToken.MINOR]: 'm',
    [ChordToken.DIMINISHED]: 'dim',
    [ChordToken.AUGMENTED]: 'aug',
    [ChordToken.SUS2]: 'sus2',
    [ChordToken.SUS4]: 'sus4',
    [ChordToken.ADD9]: 'add9',
    [ChordToken.SIX]: '6',
    [ChordToken.SEVEN]: '7',
    [ChordToken.NINE]: '9',
    [ChordToken.ELEVEN]: '11',
    [ChordToken.THIRTEEN]: '13',
    [ChordToken.FLAT_FIVE]: 'b5',
    [ChordToken.SHARP_FIVE]: '#5',
    [ChordToken.FLAT_SIX]: 'b6',
    [ChordToken.FLAT_NINE]: 'b9',
    [ChordToken.SHARP_NINE]: '#9',
    [ChordToken.SHARP_ELEVEN]: '#11',
    [ChordToken.FLAT_THIRTEEN]: 'b13',
    [ChordToken.ALT]: 'alt',
  }
  return displayMap[token] ?? ''
}

export function getChordTokenUnicodeDisplayString(token: ChordToken): string {
  const display = getChordTokenDisplayString(token)
  return display
    .replace(/b/g, '♭')
    .replace(/#/g, '♯')
    .replace(/Maj/g, 'Δ')
    .replace(/dim7/g, '°7')
    .replace(/dim/g, '°')
    .replace(/aug/g, '+')
}

export function isRootToken(token: ChordToken): boolean {
  return ROOT_NOTE_TOKENS.includes(token)
}

// ==================== 和弦类型枚举 (ChordType) ====================
export enum ChordType {
  majorTriad = 'majorTriad',
  minorTriad = 'minorTriad',
  diminishedTriad = 'diminishedTriad',
  augmentedTriad = 'augmentedTriad',
  susTwoTriad = 'susTwoTriad',
  susFourTriad = 'susFourTriad',
  addNine = 'addNine',
  minorAddNine = 'minorAddNine',
  diminished = 'diminished',
  diminishedMajorSeven = 'diminishedMajorSeven',
  dominantNine = 'dominantNine',
  dominantNineFlatThirteen = 'dominantNineFlatThirteen',
  dominantNineSharpEleven = 'dominantNineSharpEleven',
  dominantSeven = 'dominantSeven',
  dominantSevenAlt = 'dominantSevenAlt',
  dominantSevenFlatFive = 'dominantSevenFlatFive',
  dominantSevenFlatNine = 'dominantSevenFlatNine',
  dominantSevenFlatNineFlatThirteen = 'dominantSevenFlatNineFlatThirteen',
  dominantSevenFlatFiveFlatNine = 'dominantSevenFlatFiveFlatNine',
  dominantSevenFlatFiveSharpNine = 'dominantSevenFlatFiveSharpNine',
  dominantSevenSharpFive = 'dominantSevenSharpFive',
  dominantSevenSharpNine = 'dominantSevenSharpNine',
  dominantSevenFlatThirteen = 'dominantSevenFlatThirteen',
  dominantSevenSharpEleven = 'dominantSevenSharpEleven',
  dominantSevenSharpFiveFlatNine = 'dominantSevenSharpFiveFlatNine',
  dominantSevenSharpFiveSharpNine = 'dominantSevenSharpFiveSharpNine',
  dominantThirteen = 'dominantThirteen',
  dominantThirteenFlatNine = 'dominantThirteenFlatNine',
  dominantThirteenSharpNine = 'dominantThirteenSharpNine',
  dominantThirteenSharpEleven = 'dominantThirteenSharpEleven',
  majorNine = 'majorNine',
  majorNineSharpEleven = 'majorNineSharpEleven',
  majorNineSharpFive = 'majorNineSharpFive',
  majorNineFlatSix = 'majorNineFlatSix',
  majorSeven = 'majorSeven',
  majorSevenSharpEleven = 'majorSevenSharpEleven',
  majorSevenSharpFive = 'majorSevenSharpFive',
  majorSevenFlatSix = 'majorSevenFlatSix',
  majorSevenSharpNine = 'majorSevenSharpNine',
  majorThirteen = 'majorThirteen',
  majorThirteenSharpEleven = 'majorThirteenSharpEleven',
  majorThirteenSharpFive = 'majorThirteenSharpFive',
  minorEleven = 'minorEleven',
  minorMajorNine = 'minorMajorNine',
  minorMajorSeven = 'minorMajorSeven',
  minorMajorThirteen = 'minorMajorThirteen',
  minorNine = 'minorNine',
  minorSeven = 'minorSeven',
  minorSevenFlatFive = 'minorSevenFlatFive',
  minorSevenFlatFiveNatNine = 'minorSevenFlatFiveNatNine',
  minorSevenFlatSix = 'minorSevenFlatSix',
  minorSix = 'minorSix',
  minorSixNine = 'minorSixNine',
  minorThirteen = 'minorThirteen',
  nineSusFour = 'nineSusFour',
  sevenSusFour = 'sevenSusFour',
  sevenSusFourFlatNine = 'sevenSusFourFlatNine',
  six = 'six',
  sixNine = 'sixNine',
  susFourFlatNine = 'susFourFlatNine',
  thirteenSusFour = 'thirteenSusFour',
  thirteenSusFourFlatNine = 'thirteenSusFourFlatNine',
}

export function chordTypeToTokens(chordType: ChordType): ChordToken[] {
  const tokenMap: Record<ChordType, ChordToken[]> = {
    [ChordType.majorTriad]: [],
    [ChordType.minorTriad]: [ChordToken.MINOR],
    [ChordType.diminishedTriad]: [ChordToken.DIMINISHED],
    [ChordType.augmentedTriad]: [ChordToken.AUGMENTED],
    [ChordType.susTwoTriad]: [ChordToken.SUS2],
    [ChordType.susFourTriad]: [ChordToken.SUS4],
    [ChordType.addNine]: [ChordToken.ADD9],
    [ChordType.minorAddNine]: [ChordToken.MINOR, ChordToken.ADD9],
    [ChordType.diminished]: [ChordToken.DIMINISHED, ChordToken.SEVEN],
    [ChordType.diminishedMajorSeven]: [ChordToken.DIMINISHED, ChordToken.MAJOR, ChordToken.SEVEN],
    [ChordType.dominantNine]: [ChordToken.NINE],
    [ChordType.dominantNineFlatThirteen]: [ChordToken.NINE, ChordToken.FLAT_THIRTEEN],
    [ChordType.dominantNineSharpEleven]: [ChordToken.NINE, ChordToken.SHARP_ELEVEN],
    [ChordType.dominantSeven]: [ChordToken.SEVEN],
    [ChordType.dominantSevenAlt]: [ChordToken.SEVEN, ChordToken.ALT],
    [ChordType.dominantSevenFlatFive]: [ChordToken.SEVEN, ChordToken.FLAT_FIVE],
    [ChordType.dominantSevenFlatNine]: [ChordToken.SEVEN, ChordToken.FLAT_NINE],
    [ChordType.dominantSevenFlatNineFlatThirteen]: [ChordToken.SEVEN, ChordToken.FLAT_NINE, ChordToken.FLAT_THIRTEEN],
    [ChordType.dominantSevenFlatFiveFlatNine]: [ChordToken.SEVEN, ChordToken.FLAT_FIVE, ChordToken.FLAT_NINE],
    [ChordType.dominantSevenFlatFiveSharpNine]: [ChordToken.SEVEN, ChordToken.FLAT_FIVE, ChordToken.SHARP_NINE],
    [ChordType.dominantSevenSharpFive]: [ChordToken.SEVEN, ChordToken.SHARP_FIVE],
    [ChordType.dominantSevenSharpNine]: [ChordToken.SEVEN, ChordToken.SHARP_NINE],
    [ChordType.dominantSevenFlatThirteen]: [ChordToken.SEVEN, ChordToken.FLAT_THIRTEEN],
    [ChordType.dominantSevenSharpEleven]: [ChordToken.SEVEN, ChordToken.SHARP_ELEVEN],
    [ChordType.dominantSevenSharpFiveFlatNine]: [ChordToken.SEVEN, ChordToken.SHARP_FIVE, ChordToken.FLAT_NINE],
    [ChordType.dominantSevenSharpFiveSharpNine]: [ChordToken.SEVEN, ChordToken.SHARP_FIVE, ChordToken.SHARP_NINE],
    [ChordType.dominantThirteen]: [ChordToken.THIRTEEN],
    [ChordType.dominantThirteenFlatNine]: [ChordToken.THIRTEEN, ChordToken.FLAT_NINE],
    [ChordType.dominantThirteenSharpNine]: [ChordToken.THIRTEEN, ChordToken.SHARP_NINE],
    [ChordType.dominantThirteenSharpEleven]: [ChordToken.THIRTEEN, ChordToken.SHARP_ELEVEN],
    [ChordType.majorNine]: [ChordToken.MAJOR, ChordToken.NINE],
    [ChordType.majorNineSharpEleven]: [ChordToken.MAJOR, ChordToken.NINE, ChordToken.SHARP_ELEVEN],
    [ChordType.majorNineSharpFive]: [ChordToken.MAJOR, ChordToken.NINE, ChordToken.SHARP_FIVE],
    [ChordType.majorNineFlatSix]: [ChordToken.MAJOR, ChordToken.NINE, ChordToken.FLAT_SIX],
    [ChordType.majorSeven]: [ChordToken.MAJOR, ChordToken.SEVEN],
    [ChordType.majorSevenSharpEleven]: [ChordToken.MAJOR, ChordToken.SEVEN, ChordToken.SHARP_ELEVEN],
    [ChordType.majorSevenSharpFive]: [ChordToken.MAJOR, ChordToken.SEVEN, ChordToken.SHARP_FIVE],
    [ChordType.majorSevenFlatSix]: [ChordToken.MAJOR, ChordToken.SEVEN, ChordToken.FLAT_SIX],
    [ChordType.majorSevenSharpNine]: [ChordToken.MAJOR, ChordToken.SEVEN, ChordToken.SHARP_NINE],
    [ChordType.majorThirteen]: [ChordToken.MAJOR, ChordToken.THIRTEEN],
    [ChordType.majorThirteenSharpEleven]: [ChordToken.MAJOR, ChordToken.THIRTEEN, ChordToken.SHARP_ELEVEN],
    [ChordType.majorThirteenSharpFive]: [ChordToken.MAJOR, ChordToken.THIRTEEN, ChordToken.SHARP_FIVE],
    [ChordType.minorEleven]: [ChordToken.MINOR, ChordToken.ELEVEN],
    [ChordType.minorMajorNine]: [ChordToken.MINOR, ChordToken.MAJOR, ChordToken.NINE],
    [ChordType.minorMajorSeven]: [ChordToken.MINOR, ChordToken.MAJOR, ChordToken.SEVEN],
    [ChordType.minorMajorThirteen]: [ChordToken.MINOR, ChordToken.MAJOR, ChordToken.THIRTEEN],
    [ChordType.minorNine]: [ChordToken.MINOR, ChordToken.NINE],
    [ChordType.minorSeven]: [ChordToken.MINOR, ChordToken.SEVEN],
    [ChordType.minorSevenFlatFive]: [ChordToken.MINOR, ChordToken.SEVEN, ChordToken.FLAT_FIVE],
    [ChordType.minorSevenFlatFiveNatNine]: [ChordToken.MINOR, ChordToken.SEVEN, ChordToken.FLAT_FIVE, ChordToken.NINE],
    [ChordType.minorSevenFlatSix]: [ChordToken.MINOR, ChordToken.SEVEN, ChordToken.FLAT_SIX],
    [ChordType.minorSix]: [ChordToken.MINOR, ChordToken.SIX],
    [ChordType.minorSixNine]: [ChordToken.MINOR, ChordToken.SIX, ChordToken.NINE],
    [ChordType.minorThirteen]: [ChordToken.MINOR, ChordToken.THIRTEEN],
    [ChordType.nineSusFour]: [ChordToken.NINE, ChordToken.SUS4],
    [ChordType.sevenSusFour]: [ChordToken.SEVEN, ChordToken.SUS4],
    [ChordType.sevenSusFourFlatNine]: [ChordToken.SEVEN, ChordToken.SUS4, ChordToken.FLAT_NINE],
    [ChordType.six]: [ChordToken.SIX],
    [ChordType.sixNine]: [ChordToken.SIX, ChordToken.NINE],
    [ChordType.susFourFlatNine]: [ChordToken.SUS4, ChordToken.FLAT_NINE],
    [ChordType.thirteenSusFour]: [ChordToken.THIRTEEN, ChordToken.SUS4],
    [ChordType.thirteenSusFourFlatNine]: [ChordToken.THIRTEEN, ChordToken.SUS4, ChordToken.FLAT_NINE],
  }
  return tokenMap[chordType] ?? []
}

export function chordTypeFromTokens(tokens: ChordToken[]): ChordType | null {
  const tokenStr = tokens.map(t => t).join(',')
  for (const [type, typeTokens] of Object.entries(
    Object.fromEntries(
      Object.values(ChordType).map(t => [t, chordTypeToTokens(t as ChordType)])
    )
  )) {
    if ((typeTokens as ChordToken[]).join(',') === tokenStr) {
      return type as ChordType
    }
  }
  return null
}

export function getChordTypeDisplayString(chordType: ChordType, minorSymbol: string = 'm', minor7flat5Symbol: string = 'ø7'): string {
  let display = chordType.toString()
    .replace('majorTriad', '')
    .replace('minorTriad', 'minor_symbol')
    .replace('diminishedTriad', 'dim')
    .replace('augmentedTriad', 'aug')
    .replace('susTwoTriad', 'sus2')
    .replace('susFourTriad', 'sus4')
    .replace('addNine', 'add9')
    .replace('minorAddNine', 'minor_symboladd9')
    .replace('diminished', 'dim7')
    .replace('diminishedMajorSeven', 'dimMaj7')
    .replace('dominantNine', '9')
    .replace('dominantNineFlatThirteen', '9b13')
    .replace('dominantNineSharpEleven', '9#11')
    .replace('dominantSeven', '7')
    .replace('dominantSevenAlt', '7alt')
    .replace('dominantSevenFlatFive', '7b5')
    .replace('dominantSevenFlatNine', '7b9')
    .replace('dominantSevenFlatNineFlatThirteen', '7b9b13')
    .replace('dominantSevenFlatFiveFlatNine', '7b5b9')
    .replace('dominantSevenFlatFiveSharpNine', '7b5#9')
    .replace('dominantSevenSharpFive', '7#5')
    .replace('dominantSevenSharpNine', '7#9')
    .replace('dominantSevenFlatThirteen', '7b13')
    .replace('dominantSevenSharpEleven', '7#11')
    .replace('dominantSevenSharpFiveFlatNine', '7#5b9')
    .replace('dominantSevenSharpFiveSharpNine', '7#5#9')
    .replace('dominantThirteen', '13')
    .replace('dominantThirteenFlatNine', '13b9')
    .replace('dominantThirteenSharpNine', '13#9')
    .replace('dominantThirteenSharpEleven', '13#11')
    .replace('majorNine', 'Maj9')
    .replace('majorNineSharpEleven', 'Maj9#11')
    .replace('majorNineSharpFive', 'Maj9#5')
    .replace('majorNineFlatSix', 'Maj9b6')
    .replace('majorSeven', 'Maj7')
    .replace('majorSevenSharpEleven', 'Maj7#11')
    .replace('majorSevenSharpFive', 'Maj7#5')
    .replace('majorSevenFlatSix', 'Maj7b6')
    .replace('majorSevenSharpNine', 'Maj7#9')
    .replace('majorThirteen', 'Maj13')
    .replace('majorThirteenSharpEleven', 'Maj13#11')
    .replace('majorThirteenSharpFive', 'Maj13#5')
    .replace('minorEleven', 'minor_symbol11')
    .replace('minorMajorNine', 'minor_symbolMaj9')
    .replace('minorMajorSeven', 'minor_symbolMaj7')
    .replace('minorMajorThirteen', 'minor_symbolMaj13')
    .replace('minorNine', 'minor_symbol9')
    .replace('minorSeven', 'minor_symbol7')
    .replace('minorSevenFlatFive', 'minor_7_flat_5_symbol')
    .replace('minorSevenFlatFiveNatNine', 'minor_symbol9b5')
    .replace('minorSevenFlatSix', 'minor_symbol7b6')
    .replace('minorSix', 'minor_symbol6')
    .replace('minorSixNine', 'minor_symbol69')
    .replace('minorThirteen', 'minor_symbol13')
    .replace('nineSusFour', '9sus4')
    .replace('sevenSusFour', '7sus4')
    .replace('sevenSusFourFlatNine', '7sus4b9')
    .replace('six', '6')
    .replace('sixNine', '69')
    .replace('susFourFlatNine', 'sus4b9')
    .replace('thirteenSusFour', '13sus4')
    .replace('thirteenSusFourFlatNine', '13sus4b9')
  
  display = display.replace(/minor_symbol/g, minorSymbol)
  display = display.replace(/minor_7_flat_5_symbol/g, minor7flat5Symbol)
  
  return display
}

export function getChordTypeUnicodeDisplayString(chordType: ChordType): string {
  return getChordTypeDisplayString(chordType, 'm', 'ø7')
    .replace(/b/g, '♭')
    .replace(/#/g, '♯')
    .replace(/Maj/g, 'Δ')
    .replace(/dim7/g, '°7')
    .replace(/dim/g, '°')
    .replace(/aug/g, '+')
}

// ==================== 和弦音程定义 ====================
export const CHORD_INTERVALS: Record<ChordType, number[]> = {
  [ChordType.majorTriad]: [0, 4, 7],
  [ChordType.minorTriad]: [0, 3, 7],
  [ChordType.diminishedTriad]: [0, 3, 6],
  [ChordType.augmentedTriad]: [0, 4, 8],
  [ChordType.susTwoTriad]: [0, 2, 7],
  [ChordType.susFourTriad]: [0, 5, 7],
  [ChordType.addNine]: [0, 4, 7, 14],
  [ChordType.minorAddNine]: [0, 3, 7, 14],
  [ChordType.diminished]: [0, 3, 6, 9],
  [ChordType.diminishedMajorSeven]: [0, 3, 6, 11],
  [ChordType.dominantNine]: [0, 4, 7, 10, 14],
  [ChordType.dominantNineFlatThirteen]: [0, 4, 7, 10, 14, 20],
  [ChordType.dominantNineSharpEleven]: [0, 4, 7, 10, 14, 18],
  [ChordType.dominantSeven]: [0, 4, 7, 10],
  [ChordType.dominantSevenAlt]: [0, 4, 8, 10, 13, 15, 18, 21],
  [ChordType.dominantSevenFlatFive]: [0, 4, 6, 10],
  [ChordType.dominantSevenFlatNine]: [0, 4, 7, 10, 13],
  [ChordType.dominantSevenFlatNineFlatThirteen]: [0, 4, 7, 10, 13, 20],
  [ChordType.dominantSevenFlatFiveFlatNine]: [0, 4, 6, 10, 13],
  [ChordType.dominantSevenFlatFiveSharpNine]: [0, 4, 6, 10, 15],
  [ChordType.dominantSevenSharpFive]: [0, 4, 8, 10],
  [ChordType.dominantSevenSharpNine]: [0, 4, 7, 10, 15],
  [ChordType.dominantSevenFlatThirteen]: [0, 4, 7, 10, 20],
  [ChordType.dominantSevenSharpEleven]: [0, 4, 7, 10, 18],
  [ChordType.dominantSevenSharpFiveFlatNine]: [0, 4, 8, 10, 13],
  [ChordType.dominantSevenSharpFiveSharpNine]: [0, 4, 8, 10, 15],
  [ChordType.dominantThirteen]: [0, 4, 7, 10, 14, 21],
  [ChordType.dominantThirteenFlatNine]: [0, 4, 7, 10, 13, 14, 21],
  [ChordType.dominantThirteenSharpNine]: [0, 4, 7, 10, 15, 21],
  [ChordType.dominantThirteenSharpEleven]: [0, 4, 7, 10, 14, 18, 21],
  [ChordType.majorNine]: [0, 4, 7, 11, 14],
  [ChordType.majorNineSharpEleven]: [0, 4, 7, 11, 14, 18],
  [ChordType.majorNineSharpFive]: [0, 4, 8, 11, 14],
  [ChordType.majorNineFlatSix]: [0, 4, 7, 11, 14, 20],
  [ChordType.majorSeven]: [0, 4, 7, 11],
  [ChordType.majorSevenSharpEleven]: [0, 4, 7, 11, 18],
  [ChordType.majorSevenSharpFive]: [0, 4, 8, 11],
  [ChordType.majorSevenFlatSix]: [0, 4, 7, 11, 20],
  [ChordType.majorSevenSharpNine]: [0, 4, 7, 11, 15],
  [ChordType.majorThirteen]: [0, 4, 7, 11, 14, 21],
  [ChordType.majorThirteenSharpEleven]: [0, 4, 7, 11, 14, 18, 21],
  [ChordType.majorThirteenSharpFive]: [0, 4, 8, 11, 14, 21],
  [ChordType.minorEleven]: [0, 3, 7, 10, 14, 17],
  [ChordType.minorMajorNine]: [0, 3, 7, 11, 14],
  [ChordType.minorMajorSeven]: [0, 3, 7, 11],
  [ChordType.minorMajorThirteen]: [0, 3, 7, 11, 14, 21],
  [ChordType.minorNine]: [0, 3, 7, 10, 14],
  [ChordType.minorSeven]: [0, 3, 7, 10],
  [ChordType.minorSevenFlatFive]: [0, 3, 6, 10],
  [ChordType.minorSevenFlatFiveNatNine]: [0, 3, 6, 10, 14],
  [ChordType.minorSevenFlatSix]: [0, 3, 7, 10, 20],
  [ChordType.minorSix]: [0, 3, 7, 9],
  [ChordType.minorSixNine]: [0, 3, 7, 9, 14],
  [ChordType.minorThirteen]: [0, 3, 7, 10, 14, 21],
  [ChordType.nineSusFour]: [0, 5, 7, 10, 14],
  [ChordType.sevenSusFour]: [0, 5, 7, 10],
  [ChordType.sevenSusFourFlatNine]: [0, 5, 7, 10, 13],
  [ChordType.six]: [0, 4, 7, 9],
  [ChordType.sixNine]: [0, 4, 7, 9, 14],
  [ChordType.susFourFlatNine]: [0, 5, 7, 13],
  [ChordType.thirteenSusFour]: [0, 5, 7, 10, 14, 21],
  [ChordType.thirteenSusFourFlatNine]: [0, 5, 7, 10, 13, 14, 21],
}

// ==================== 和弦类 ====================
export interface ParsedChord {
  rootNote: number
  chordType: ChordType
  slashRootNote: number | null
  function: ChordFunction | null
  scaleTypeOverride: string | null
  isNewChord: boolean
}

// ==================== ChordToken 解析器 ====================
export class ChordTokenizer {
  private static readonly ROOT_NOTE_PATTERN = /^[A-Ga-g]/
  private static readonly ACCIDENTAL_PATTERN = /^[#♯b♭]/
  private static readonly NUMBER_PATTERN = /^\d+/
  
  static tokenize(chordString: string): ChordToken[] {
    const tokens: ChordToken[] = []
    let remaining = chordString.trim()
    
    while (remaining.length > 0) {
      const result = this.nextToken(remaining)
      if (result.token) {
        tokens.push(result.token)
      }
      remaining = result.remaining
      if (!result.token && remaining.length > 0) {
        remaining = remaining.slice(1)
      }
    }
    
    return tokens
  }
  
  private static nextToken(str: string): { token: ChordToken | null; remaining: string } {
    if (str.length === 0) {
      return { token: null, remaining: '' }
    }
    
    const firstChar = str[0].toUpperCase()
    const firstTwoChars = str.slice(0, 2).toLowerCase()
    const firstThreeChars = str.slice(0, 3).toLowerCase()
    const firstFourChars = str.slice(0, 4).toLowerCase()
    
    if (ROOT_NOTE_TOKENS.map(t => getChordTokenDisplayString(t)).includes(firstChar)) {
      const token = Object.values(ChordToken).find(t => getChordTokenDisplayString(t) === firstChar)
      if (token) {
        return { token, remaining: str.slice(1) }
      }
    }
    
    if (firstChar === '/') {
      return { token: ChordToken.SLASH, remaining: str.slice(1) }
    }
    
    if (firstChar === 'b' || firstChar === '♭') {
      return { token: ChordToken.FLAT, remaining: str.slice(1) }
    }
    
    if (firstChar === '#' || firstChar === '♯') {
      return { token: ChordToken.SHARP, remaining: str.slice(1) }
    }
    
    if (firstFourChars === 'maj7' || firstFourChars === 'maj9' || firstFourChars === 'maj13' || firstFourChars === 'majΔ') {
      return { token: ChordToken.MAJOR, remaining: str.slice(3) }
    }
    
    if (firstThreeChars === 'maj' || firstThreeChars === 'Δ') {
      return { token: ChordToken.MAJOR, remaining: str.slice(3) }
    }
    
    if (firstThreeChars === 'min' || firstThreeChars === 'min') {
      return { token: ChordToken.MINOR, remaining: str.slice(3) }
    }
    
    if (firstChar === 'm' && str.length > 1 && !['a', 'i', 'n'].includes(str[1].toLowerCase())) {
      return { token: ChordToken.MINOR, remaining: str.slice(1) }
    }
    
    if (firstChar === '-' || firstChar === '−') {
      return { token: ChordToken.MINOR, remaining: str.slice(1) }
    }
    
    if (firstFourChars === 'dim7' || firstFourChars === '°7') {
      return { token: ChordToken.DIMINISHED, remaining: str.slice(3) }
    }
    
    if (firstThreeChars === 'dim' || firstChar === '°') {
      return { token: ChordToken.DIMINISHED, remaining: str.slice(firstChar === '°' ? 1 : 3) }
    }
    
    if (firstThreeChars === 'aug' || firstChar === '+') {
      return { token: ChordToken.AUGMENTED, remaining: str.slice(firstChar === '+' ? 1 : 3) }
    }
    
    if (firstFourChars === 'sus2') {
      return { token: ChordToken.SUS2, remaining: str.slice(4) }
    }
    
    if (firstFourChars === 'sus4' || firstThreeChars === 'sus') {
      return { token: ChordToken.SUS4, remaining: str.slice(firstThreeChars === 'sus' ? 3 : 4) }
    }
    
    if (firstFourChars === 'add9') {
      return { token: ChordToken.ADD9, remaining: str.slice(4) }
    }
    
    if (firstThreeChars === 'alt') {
      return { token: ChordToken.ALT, remaining: str.slice(3) }
    }
    
    if (firstThreeChars === 'b13' || firstThreeChars === '♭13') {
      return { token: ChordToken.FLAT_THIRTEEN, remaining: str.slice(3) }
    }
    
    if (firstThreeChars === '#11' || firstThreeChars === '♯11') {
      return { token: ChordToken.SHARP_ELEVEN, remaining: str.slice(3) }
    }
    
    if (firstTwoChars === '#9' || firstTwoChars === '♯9') {
      return { token: ChordToken.SHARP_NINE, remaining: str.slice(2) }
    }
    
    if (firstTwoChars === 'b9' || firstTwoChars === '♭9') {
      return { token: ChordToken.FLAT_NINE, remaining: str.slice(2) }
    }
    
    if (firstTwoChars === 'b6' || firstTwoChars === '♭6') {
      return { token: ChordToken.FLAT_SIX, remaining: str.slice(2) }
    }
    
    if (firstTwoChars === '#5' || firstTwoChars === '♯5') {
      return { token: ChordToken.SHARP_FIVE, remaining: str.slice(2) }
    }
    
    if (firstTwoChars === 'b5' || firstTwoChars === '♭5') {
      return { token: ChordToken.FLAT_FIVE, remaining: str.slice(2) }
    }
    
    if (firstTwoChars === '13') {
      return { token: ChordToken.THIRTEEN, remaining: str.slice(2) }
    }
    
    if (firstTwoChars === '11') {
      return { token: ChordToken.ELEVEN, remaining: str.slice(2) }
    }
    
    if (firstChar === '9') {
      return { token: ChordToken.NINE, remaining: str.slice(1) }
    }
    
    if (firstChar === '7') {
      return { token: ChordToken.SEVEN, remaining: str.slice(1) }
    }
    
    if (firstChar === '6') {
      return { token: ChordToken.SIX, remaining: str.slice(1) }
    }
    
    if (firstTwoChars === 'ø7' || firstTwoChars === 'ø') {
      return { token: ChordToken.MINOR, remaining: str.slice(0) }
    }
    
    return { token: null, remaining: str.slice(1) }
  }
}

// ==================== 和弦解析器 ====================
export class ChordParser {
  static parse(chordString: string): ParsedChord | null {
    const tokens = ChordTokenizer.tokenize(chordString)
    if (tokens.length === 0) {
      return null
    }
    
    let rootNote: number | null = null
    let slashRootNote: number | null = null
    let chordTypeTokens: ChordToken[] = []
    let hasSlash = false
    let slashNoteTokens: ChordToken[] = []
    
    let i = 0
    
    if (isRootToken(tokens[0])) {
      const rootToken = tokens[0]
      rootNote = this.tokenToNote(rootToken)
      i++
      
      if (i < tokens.length && ACCIDENTAL_TOKENS.includes(tokens[i])) {
        const accidental = tokens[i]
        rootNote = this.applyAccidental(rootNote, accidental)
        i++
      }
    }
    
    while (i < tokens.length && !hasSlash) {
      if (tokens[i] === ChordToken.SLASH) {
        hasSlash = true
        i++
        break
      }
      chordTypeTokens.push(tokens[i])
      i++
    }
    
    if (hasSlash && i < tokens.length) {
      if (isRootToken(tokens[i])) {
        slashRootNote = this.tokenToNote(tokens[i])
        i++
        
        if (i < tokens.length && ACCIDENTAL_TOKENS.includes(tokens[i])) {
          slashRootNote = this.applyAccidental(slashRootNote!, tokens[i])
        }
      }
    }
    
    if (rootNote === null) {
      return null
    }
    
    const chordType = this.inferChordType(chordTypeTokens)
    
    return {
      rootNote,
      chordType: chordType ?? ChordType.majorTriad,
      slashRootNote,
      function: null,
      scaleTypeOverride: null,
      isNewChord: false,
    }
  }
  
  private static tokenToNote(token: ChordToken): number {
    const noteMap: Partial<Record<ChordToken, number>> = {
      [ChordToken.A]: Note.A,
      [ChordToken.B]: Note.B,
      [ChordToken.C]: Note.C,
      [ChordToken.D]: Note.D,
      [ChordToken.E]: Note.E,
      [ChordToken.F]: Note.F,
      [ChordToken.G]: Note.G,
    }
    return noteMap[token] ?? Note.C
  }
  
  private static applyAccidental(note: number, accidental: ChordToken): number {
    const toneId = note
    if (accidental === ChordToken.SHARP) {
      return noteFromToneId(toneId + 1, false)
    } else if (accidental === ChordToken.FLAT) {
      return noteFromToneId(toneId - 1, true)
    }
    return note
  }
  
  private static inferChordType(tokens: ChordToken[]): ChordType | null {
    if (tokens.length === 0) {
      return ChordType.majorTriad
    }
    
    return chordTypeFromTokens(tokens)
  }
}

// ==================== Unicode 变音符号显示 ====================
export const UNICODE_ACCIDENTALS = {
  FLAT: '♭',
  SHARP: '♯',
  DOUBLE_FLAT: '𝄫',
  DOUBLE_SHARP: '𝄪',
  NATURAL: '♮',
}

export const UNICODE_CHORD_SYMBOLS = {
  MAJOR: 'Δ',
  MINOR: 'm',
  DIMINISHED: '°',
  DIMINISHED_7: '°7',
  HALF_DIMINISHED: 'ø',
  HALF_DIMINISHED_7: 'ø7',
  AUGMENTED: '+',
}

export function displayIntervalUnicode(interval: string): string {
  return interval
    .replace(/</g, '♭')
    .replace(/>/g, '♯')
    .replace(/b/g, '♭')
    .replace(/#/g, '♯')
}

export function displayChordUnicode(
  rootNote: number,
  chordType: ChordType,
  slashRootNote?: number | null,
  minorSymbol: string = 'm',
  minor7flat5Symbol: string = 'ø7'
): string {
  const rootStr = NOTE_UNICODE_NAMES[rootNote] ?? NOTE_NAMES[rootNote] ?? 'C'
  const typeStr = getChordTypeUnicodeDisplayString(chordType)
  const slashStr = slashRootNote != null ? `/${NOTE_UNICODE_NAMES[slashRootNote] ?? NOTE_NAMES[slashRootNote] ?? ''}` : ''
  
  return `${rootStr}${typeStr}${slashStr}`
}

export function displayChordStandard(
  rootNote: number,
  chordType: ChordType,
  slashRootNote?: number | null,
  minorSymbol: string = 'm',
  minor7flat5Symbol: string = 'm7b5'
): string {
  const rootStr = NOTE_NAMES[rootNote] ?? 'C'
  const typeStr = getChordTypeDisplayString(chordType, minorSymbol, minor7flat5Symbol)
  const slashStr = slashRootNote != null ? `/${NOTE_NAMES[slashRootNote] ?? ''}` : ''
  
  return `${rootStr}${typeStr}${slashStr}`
}

// ==================== 音程显示 ====================
export const INTERVAL_DISPLAY_NAMES: Record<string, { standard: string; unicode: string; chinese: string }> = {
  '1': { standard: '1', unicode: '1', chinese: '根音' },
  'b2': { standard: 'b2', unicode: '♭2', chinese: '小二度' },
  '2': { standard: '2', unicode: '2', chinese: '大二度' },
  'b3': { standard: 'b3', unicode: '♭3', chinese: '小三度' },
  '3': { standard: '3', unicode: '3', chinese: '大三度' },
  '4': { standard: '4', unicode: '4', chinese: '纯四度' },
  '#4': { standard: '#4', unicode: '♯4', chinese: '增四度' },
  'b5': { standard: 'b5', unicode: '♭5', chinese: '减五度' },
  '5': { standard: '5', unicode: '5', chinese: '纯五度' },
  '#5': { standard: '#5', unicode: '♯5', chinese: '增五度' },
  'b6': { standard: 'b6', unicode: '♭6', chinese: '小六度' },
  '6': { standard: '6', unicode: '6', chinese: '大六度' },
  'bb7': { standard: 'bb7', unicode: '𝄫7', chinese: '减七度' },
  'b7': { standard: 'b7', unicode: '♭7', chinese: '小七度' },
  '7': { standard: '7', unicode: '7', chinese: '大七度' },
  'b9': { standard: 'b9', unicode: '♭9', chinese: '小九度' },
  '9': { standard: '9', unicode: '9', chinese: '大九度' },
  '#9': { standard: '#9', unicode: '♯9', chinese: '增九度' },
  '11': { standard: '11', unicode: '11', chinese: '纯十一度' },
  '#11': { standard: '#11', unicode: '♯11', chinese: '增十一度' },
  'b13': { standard: 'b13', unicode: '♭13', chinese: '小十三度' },
  '13': { standard: '13', unicode: '13', chinese: '大十三度' },
}

export function getIntervalDisplayName(interval: string, useUnicode: boolean = true, language: 'zh' | 'en' = 'zh'): string {
  const info = INTERVAL_DISPLAY_NAMES[interval]
  if (!info) return interval
  
  if (language === 'zh') {
    return info.chinese
  }
  return useUnicode ? info.unicode : info.standard
}

// ==================== 导出便捷函数 ====================
export function parseChord(chordString: string): ParsedChord | null {
  return ChordParser.parse(chordString)
}

export function tokenizeChord(chordString: string): ChordToken[] {
  return ChordTokenizer.tokenize(chordString)
}

export function getChordNotes(rootNote: number, chordType: ChordType): number[] {
  const intervals = CHORD_INTERVALS[chordType] ?? []
  return intervals.map(interval => noteFromToneId(rootNote + interval, false))
}

export function formatChord(
  rootNote: number,
  chordType: ChordType,
  options?: {
    slashRootNote?: number | null
    useUnicode?: boolean
    minorSymbol?: string
    minor7flat5Symbol?: string
  }
): string {
  const { slashRootNote, useUnicode = true, minorSymbol = 'm', minor7flat5Symbol = 'ø7' } = options ?? {}
  
  if (useUnicode) {
    return displayChordUnicode(rootNote, chordType, slashRootNote, minorSymbol, minor7flat5Symbol)
  }
  return displayChordStandard(rootNote, chordType, slashRootNote, minorSymbol, minor7flat5Symbol)
}
