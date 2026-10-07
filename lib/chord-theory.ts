//  ==================== SOLO 风格和弦理论系统 ====================
//  完整实现 SOLO 的 ChordToken 解析器、Unicode 变音符号、Function 系统
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

export interface EnharmonicGroup {
  toneId: number
  sharpName: string
  flatName: string
  unicodeSharp: string
  unicodeFlat: string
}

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

// 用「const 对象 + 联合类型」表达字符串枚举语义：
// 运行时行为与 string enum 一致（成员值即字面量，无反向映射），
// 但类型上允许直接使用字面量，便于跨模块传递与序列化。
export const ChordToken = {
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  E: 'E',
  F: 'F',
  G: 'G',
  FLAT: 'FLAT',
  SHARP: 'SHARP',
  SLASH: 'SLASH',
  MAJOR: 'MAJOR',
  MINOR: 'MINOR',
  DIMINISHED: 'DIMINISHED',
  AUGMENTED: 'AUGMENTED',
  SUS2: 'SUS2',
  SUS4: 'SUS4',
  ADD9: 'ADD9',
  SIX: 'SIX',
  SEVEN: 'SEVEN',
  NINE: 'NINE',
  ELEVEN: 'ELEVEN',
  THIRTEEN: 'THIRTEEN',
  FLAT_FIVE: 'FLAT_FIVE',
  SHARP_FIVE: 'SHARP_FIVE',
  FLAT_SIX: 'FLAT_SIX',
  FLAT_NINE: 'FLAT_NINE',
  SHARP_NINE: 'SHARP_NINE',
  SHARP_ELEVEN: 'SHARP_ELEVEN',
  FLAT_THIRTEEN: 'FLAT_THIRTEEN',
  ALT: 'ALT',
} as const
export type ChordToken = (typeof ChordToken)[keyof typeof ChordToken]

// 用「const 对象 + 联合类型」表达字符串枚举语义：
// 运行时行为与 string enum 一致（成员值即字面量，无反向映射），
// 但类型上允许直接使用字面量，便于跨模块传递与序列化。
export const ChordType = {
  majorTriad: 'majorTriad',
  minorTriad: 'minorTriad',
  diminishedTriad: 'diminishedTriad',
  augmentedTriad: 'augmentedTriad',
  susTwoTriad: 'susTwoTriad',
  susFourTriad: 'susFourTriad',
  addNine: 'addNine',
  minorAddNine: 'minorAddNine',
  diminished: 'diminished',
  diminishedMajorSeven: 'diminishedMajorSeven',
  dominantNine: 'dominantNine',
  dominantNineFlatThirteen: 'dominantNineFlatThirteen',
  dominantNineSharpEleven: 'dominantNineSharpEleven',
  dominantSeven: 'dominantSeven',
  dominantSevenAlt: 'dominantSevenAlt',
  dominantSevenFlatFive: 'dominantSevenFlatFive',
  dominantSevenFlatNine: 'dominantSevenFlatNine',
  dominantSevenFlatNineFlatThirteen: 'dominantSevenFlatNineFlatThirteen',
  dominantSevenFlatFiveFlatNine: 'dominantSevenFlatFiveFlatNine',
  dominantSevenFlatFiveSharpNine: 'dominantSevenFlatFiveSharpNine',
  dominantSevenSharpFive: 'dominantSevenSharpFive',
  dominantSevenSharpNine: 'dominantSevenSharpNine',
  dominantSevenFlatThirteen: 'dominantSevenFlatThirteen',
  dominantSevenSharpEleven: 'dominantSevenSharpEleven',
  dominantSevenSharpFiveFlatNine: 'dominantSevenSharpFiveFlatNine',
  dominantSevenSharpFiveSharpNine: 'dominantSevenSharpFiveSharpNine',
  dominantThirteen: 'dominantThirteen',
  dominantThirteenFlatNine: 'dominantThirteenFlatNine',
  dominantThirteenSharpNine: 'dominantThirteenSharpNine',
  dominantThirteenSharpEleven: 'dominantThirteenSharpEleven',
  majorNine: 'majorNine',
  majorNineSharpEleven: 'majorNineSharpEleven',
  majorNineSharpFive: 'majorNineSharpFive',
  majorNineFlatSix: 'majorNineFlatSix',
  majorSeven: 'majorSeven',
  majorSevenSharpEleven: 'majorSevenSharpEleven',
  majorSevenSharpFive: 'majorSevenSharpFive',
  majorSevenFlatSix: 'majorSevenFlatSix',
  majorSevenSharpNine: 'majorSevenSharpNine',
  majorThirteen: 'majorThirteen',
  majorThirteenSharpEleven: 'majorThirteenSharpEleven',
  majorThirteenSharpFive: 'majorThirteenSharpFive',
  minorEleven: 'minorEleven',
  minorMajorNine: 'minorMajorNine',
  minorMajorSeven: 'minorMajorSeven',
  minorMajorThirteen: 'minorMajorThirteen',
  minorNine: 'minorNine',
  minorSeven: 'minorSeven',
  minorSevenFlatFive: 'minorSevenFlatFive',
  minorSevenFlatFiveNatNine: 'minorSevenFlatFiveNatNine',
  minorSevenFlatSix: 'minorSevenFlatSix',
  minorSix: 'minorSix',
  minorSixNine: 'minorSixNine',
  minorThirteen: 'minorThirteen',
  nineSusFour: 'nineSusFour',
  sevenSusFour: 'sevenSusFour',
  sevenSusFourFlatNine: 'sevenSusFourFlatNine',
  six: 'six',
  sixNine: 'sixNine',
  susFourFlatNine: 'susFourFlatNine',
  thirteenSusFour: 'thirteenSusFour',
  thirteenSusFourFlatNine: 'thirteenSusFourFlatNine',
} as const
export type ChordType = (typeof ChordType)[keyof typeof ChordType]

export interface ChordSymbolConfig {
  minorSymbol: 'm' | '-' | 'min'
  minor7flat5Symbol: 'm7b5' | 'ø7' | 'half-dim'
  dominant7flat9Symbol: '7b9' | '7♭9' | '7-9'
  useUnicode: boolean
  useJazzNotation: boolean
}

export interface ParsedChord {
  rootNote: number
  chordType: ChordType
  slashRootNote: number | null
  function: ChordFunction | null
  scaleTypeOverride: string | null
  isNewChord: boolean
}

export const NOTE_NAMES: Record<number, string> = {
    [0]: 'C',
    [1]: 'C#',
    [2]: 'D',
    [3]: 'D#',
    [4]: 'E',
    [5]: 'F',
    [6]: 'F#',
    [7]: 'G',
    [8]: 'G#',
    [9]: 'A',
    [10]: 'A#',
    [11]: 'B'
};

export const NOTE_NAMES_FLAT: Record<number, string> = {
    [0]: 'C',
    [1]: 'Db',
    [2]: 'D',
    [3]: 'Eb',
    [4]: 'E',
    [5]: 'F',
    [6]: 'Gb',
    [7]: 'G',
    [8]: 'Ab',
    [9]: 'A',
    [10]: 'Bb',
    [11]: 'B'
};

export const NOTE_UNICODE_NAMES: Record<number, string> = {
    [0]: 'C',
    [1]: 'C♯',
    [2]: 'D',
    [3]: 'D♯',
    [4]: 'E',
    [5]: 'F',
    [6]: 'F♯',
    [7]: 'G',
    [8]: 'G♯',
    [9]: 'A',
    [10]: 'A♯',
    [11]: 'B'
};

export const NOTE_UNICODE_NAMES_FLAT: Record<number, string> = {
    [0]: 'C',
    [1]: 'D♭',
    [2]: 'D',
    [3]: 'E♭',
    [4]: 'E',
    [5]: 'F',
    [6]: 'G♭',
    [7]: 'G',
    [8]: 'A♭',
    [9]: 'A',
    [10]: 'B♭',
    [11]: 'B'
};

export function noteFromToneId(toneId: number, _preferFlat: boolean = false): number {
    const normalizedToneId = (toneId % 12 + 12) % 12;
    return normalizedToneId;
}

export function getNoteName(toneId: number, preferFlat: boolean = false, useUnicode: boolean = false): string {
    const names = preferFlat ? useUnicode ? NOTE_UNICODE_NAMES_FLAT : NOTE_NAMES_FLAT : useUnicode ? NOTE_UNICODE_NAMES : NOTE_NAMES;
    return names[toneId] ?? 'C';
}

export function noteFromString(noteStr: string): number | null {
    const normalized = noteStr.trim().toLowerCase();
    const noteMap: Record<string, number> = {
        'c': 0,
        'c#': 1,
        'c♯': 1,
        'db': 1,
        'd♭': 1,
        'd': 2,
        'd#': 3,
        'd♯': 3,
        'eb': 3,
        'e♭': 3,
        'e': 4,
        'f': 5,
        'f#': 6,
        'f♯': 6,
        'gb': 6,
        'g♭': 6,
        'g': 7,
        'g#': 8,
        'g♯': 8,
        'ab': 8,
        'a♭': 8,
        'a': 9,
        'a#': 10,
        'a♯': 10,
        'bb': 10,
        'b♭': 10,
        'b': 11
    };
    return noteMap[normalized] ?? null;
}

export const ENHARMONIC_GROUPS: EnharmonicGroup[] = [
    {
        toneId: 0,
        sharpName: 'C',
        flatName: 'C',
        unicodeSharp: 'C',
        unicodeFlat: 'C'
    },
    {
        toneId: 1,
        sharpName: 'C#',
        flatName: 'Db',
        unicodeSharp: 'C♯',
        unicodeFlat: 'D♭'
    },
    {
        toneId: 2,
        sharpName: 'D',
        flatName: 'D',
        unicodeSharp: 'D',
        unicodeFlat: 'D'
    },
    {
        toneId: 3,
        sharpName: 'D#',
        flatName: 'Eb',
        unicodeSharp: 'D♯',
        unicodeFlat: 'E♭'
    },
    {
        toneId: 4,
        sharpName: 'E',
        flatName: 'E',
        unicodeSharp: 'E',
        unicodeFlat: 'E'
    },
    {
        toneId: 5,
        sharpName: 'F',
        flatName: 'F',
        unicodeSharp: 'F',
        unicodeFlat: 'F'
    },
    {
        toneId: 6,
        sharpName: 'F#',
        flatName: 'Gb',
        unicodeSharp: 'F♯',
        unicodeFlat: 'G♭'
    },
    {
        toneId: 7,
        sharpName: 'G',
        flatName: 'G',
        unicodeSharp: 'G',
        unicodeFlat: 'G'
    },
    {
        toneId: 8,
        sharpName: 'G#',
        flatName: 'Ab',
        unicodeSharp: 'G♯',
        unicodeFlat: 'A♭'
    },
    {
        toneId: 9,
        sharpName: 'A',
        flatName: 'A',
        unicodeSharp: 'A',
        unicodeFlat: 'A'
    },
    {
        toneId: 10,
        sharpName: 'A#',
        flatName: 'Bb',
        unicodeSharp: 'A♯',
        unicodeFlat: 'B♭'
    },
    {
        toneId: 11,
        sharpName: 'B',
        flatName: 'B',
        unicodeSharp: 'B',
        unicodeFlat: 'B'
    }
];

export function getEnharmonicGroup(toneId: number): EnharmonicGroup {
    const normalized = (toneId % 12 + 12) % 12;
    return ENHARMONIC_GROUPS[normalized];
}

export function areEnharmonicEquivalent(noteA: number, noteB: number): boolean {
    return (noteA % 12 + 12) % 12 === (noteB % 12 + 12) % 12;
}

export function normalizeNoteName(noteStr: string): string {
    const toneId = noteFromString(noteStr);
    if (toneId === null) return noteStr.trim().toUpperCase();
    const group = getEnharmonicGroup(toneId);
    if (noteStr.includes('b') || noteStr.includes('♭')) {
        return group.flatName;
    }
    return group.sharpName;
}

export function getNoteNameWithEnharmonicPreference(
  toneId: number,
  contextKey: number | null = null,
  preferSharp: boolean = true,
  useUnicode: boolean = false
): string {
    const normalized = (toneId % 12 + 12) % 12;
    const group = ENHARMONIC_GROUPS[normalized];
    if (contextKey !== null) {
        const keyNormalized = (contextKey % 12 + 12) % 12;
        const keyGroup = ENHARMONIC_GROUPS[keyNormalized];
        const keyName = keyGroup.sharpName;
        
        
        // 必须同时看升/降两种拼写：keyGroup.sharpName 永远不含 'Bb'/'Eb' 等，
        // 原实现只拿 sharpName 去匹配降号调列表，导致除 F 调外所有降号调都被判成升号调。
        const SHARP_KEY_TONICS = [
            'G',
            'D',
            'A',
            'E',
            'B',
            'F#',
            'C#'
        ];
        const FLAT_KEY_TONICS = [
            'F',
            'Bb',
            'Eb',
            'Ab',
            'Db',
            'Gb',
            'Cb'
        ];
        const preferSharpForContext = FLAT_KEY_TONICS.includes(keyGroup.flatName) && !SHARP_KEY_TONICS.includes(keyName) ? false : true;
        if (useUnicode) {
            return preferSharpForContext ? group.unicodeSharp : group.unicodeFlat;
        }
        return preferSharpForContext ? group.sharpName : group.flatName;
    }
    if (useUnicode) {
        return preferSharp ? group.unicodeSharp : group.unicodeFlat;
    }
    return preferSharp ? group.sharpName : group.flatName;
}

export const ROOT_NOTE_TOKENS: ChordToken[] = [
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G"
];

export const ACCIDENTAL_TOKENS: ChordToken[] = [
    "FLAT",
    "SHARP"
];

export function getChordTokenDisplayString(token: ChordToken): string {
    const displayMap = {
        ["A"]: 'A',
        ["B"]: 'B',
        ["C"]: 'C',
        ["D"]: 'D',
        ["E"]: 'E',
        ["F"]: 'F',
        ["G"]: 'G',
        ["FLAT"]: 'b',
        ["SHARP"]: '#',
        ["SLASH"]: '/',
        ["MAJOR"]: 'Maj',
        ["MINOR"]: 'm',
        ["DIMINISHED"]: 'dim',
        ["AUGMENTED"]: 'aug',
        ["SUS2"]: 'sus2',
        ["SUS4"]: 'sus4',
        ["ADD9"]: 'add9',
        ["SIX"]: '6',
        ["SEVEN"]: '7',
        ["NINE"]: '9',
        ["ELEVEN"]: '11',
        ["THIRTEEN"]: '13',
        ["FLAT_FIVE"]: 'b5',
        ["SHARP_FIVE"]: '#5',
        ["FLAT_SIX"]: 'b6',
        ["FLAT_NINE"]: 'b9',
        ["SHARP_NINE"]: '#9',
        ["SHARP_ELEVEN"]: '#11',
        ["FLAT_THIRTEEN"]: 'b13',
        ["ALT"]: 'alt'
    };
    return displayMap[token] ?? '';
}

export function isRootToken(token: ChordToken): boolean {
    return ROOT_NOTE_TOKENS.includes(token);
}

export function chordTypeToTokens(chordType: ChordType): ChordToken[] {
    const tokenMap: Record<ChordType, string[]> = {
        ["majorTriad"]: [],
        ["minorTriad"]: [
            "MINOR"
        ],
        ["diminishedTriad"]: [
            "DIMINISHED"
        ],
        ["augmentedTriad"]: [
            "AUGMENTED"
        ],
        ["susTwoTriad"]: [
            "SUS2"
        ],
        ["susFourTriad"]: [
            "SUS4"
        ],
        ["addNine"]: [
            "ADD9"
        ],
        ["minorAddNine"]: [
            "MINOR",
            "ADD9"
        ],
        ["diminished"]: [
            "DIMINISHED",
            "SEVEN"
        ],
        ["diminishedMajorSeven"]: [
            "DIMINISHED",
            "MAJOR",
            "SEVEN"
        ],
        ["dominantNine"]: [
            "NINE"
        ],
        ["dominantNineFlatThirteen"]: [
            "NINE",
            "FLAT_THIRTEEN"
        ],
        ["dominantNineSharpEleven"]: [
            "NINE",
            "SHARP_ELEVEN"
        ],
        ["dominantSeven"]: [
            "SEVEN"
        ],
        ["dominantSevenAlt"]: [
            "SEVEN",
            "ALT"
        ],
        ["dominantSevenFlatFive"]: [
            "SEVEN",
            "FLAT_FIVE"
        ],
        ["dominantSevenFlatNine"]: [
            "SEVEN",
            "FLAT_NINE"
        ],
        ["dominantSevenFlatNineFlatThirteen"]: [
            "SEVEN",
            "FLAT_NINE",
            "FLAT_THIRTEEN"
        ],
        ["dominantSevenFlatFiveFlatNine"]: [
            "SEVEN",
            "FLAT_FIVE",
            "FLAT_NINE"
        ],
        ["dominantSevenFlatFiveSharpNine"]: [
            "SEVEN",
            "FLAT_FIVE",
            "SHARP_NINE"
        ],
        ["dominantSevenSharpFive"]: [
            "SEVEN",
            "SHARP_FIVE"
        ],
        ["dominantSevenSharpNine"]: [
            "SEVEN",
            "SHARP_NINE"
        ],
        ["dominantSevenFlatThirteen"]: [
            "SEVEN",
            "FLAT_THIRTEEN"
        ],
        ["dominantSevenSharpEleven"]: [
            "SEVEN",
            "SHARP_ELEVEN"
        ],
        ["dominantSevenSharpFiveFlatNine"]: [
            "SEVEN",
            "SHARP_FIVE",
            "FLAT_NINE"
        ],
        ["dominantSevenSharpFiveSharpNine"]: [
            "SEVEN",
            "SHARP_FIVE",
            "SHARP_NINE"
        ],
        ["dominantThirteen"]: [
            "THIRTEEN"
        ],
        ["dominantThirteenFlatNine"]: [
            "THIRTEEN",
            "FLAT_NINE"
        ],
        ["dominantThirteenSharpNine"]: [
            "THIRTEEN",
            "SHARP_NINE"
        ],
        ["dominantThirteenSharpEleven"]: [
            "THIRTEEN",
            "SHARP_ELEVEN"
        ],
        ["majorNine"]: [
            "MAJOR",
            "NINE"
        ],
        ["majorNineSharpEleven"]: [
            "MAJOR",
            "NINE",
            "SHARP_ELEVEN"
        ],
        ["majorNineSharpFive"]: [
            "MAJOR",
            "NINE",
            "SHARP_FIVE"
        ],
        ["majorNineFlatSix"]: [
            "MAJOR",
            "NINE",
            "FLAT_SIX"
        ],
        ["majorSeven"]: [
            "MAJOR",
            "SEVEN"
        ],
        ["majorSevenSharpEleven"]: [
            "MAJOR",
            "SEVEN",
            "SHARP_ELEVEN"
        ],
        ["majorSevenSharpFive"]: [
            "MAJOR",
            "SEVEN",
            "SHARP_FIVE"
        ],
        ["majorSevenFlatSix"]: [
            "MAJOR",
            "SEVEN",
            "FLAT_SIX"
        ],
        ["majorSevenSharpNine"]: [
            "MAJOR",
            "SEVEN",
            "SHARP_NINE"
        ],
        ["majorThirteen"]: [
            "MAJOR",
            "THIRTEEN"
        ],
        ["majorThirteenSharpEleven"]: [
            "MAJOR",
            "THIRTEEN",
            "SHARP_ELEVEN"
        ],
        ["majorThirteenSharpFive"]: [
            "MAJOR",
            "THIRTEEN",
            "SHARP_FIVE"
        ],
        ["minorEleven"]: [
            "MINOR",
            "ELEVEN"
        ],
        ["minorMajorNine"]: [
            "MINOR",
            "MAJOR",
            "NINE"
        ],
        ["minorMajorSeven"]: [
            "MINOR",
            "MAJOR",
            "SEVEN"
        ],
        ["minorMajorThirteen"]: [
            "MINOR",
            "MAJOR",
            "THIRTEEN"
        ],
        ["minorNine"]: [
            "MINOR",
            "NINE"
        ],
        ["minorSeven"]: [
            "MINOR",
            "SEVEN"
        ],
        ["minorSevenFlatFive"]: [
            "MINOR",
            "SEVEN",
            "FLAT_FIVE"
        ],
        ["minorSevenFlatFiveNatNine"]: [
            "MINOR",
            "SEVEN",
            "FLAT_FIVE",
            "NINE"
        ],
        ["minorSevenFlatSix"]: [
            "MINOR",
            "SEVEN",
            "FLAT_SIX"
        ],
        ["minorSix"]: [
            "MINOR",
            "SIX"
        ],
        ["minorSixNine"]: [
            "MINOR",
            "SIX",
            "NINE"
        ],
        ["minorThirteen"]: [
            "MINOR",
            "THIRTEEN"
        ],
        ["nineSusFour"]: [
            "NINE",
            "SUS4"
        ],
        ["sevenSusFour"]: [
            "SEVEN",
            "SUS4"
        ],
        ["sevenSusFourFlatNine"]: [
            "SEVEN",
            "SUS4",
            "FLAT_NINE"
        ],
        ["six"]: [
            "SIX"
        ],
        ["sixNine"]: [
            "SIX",
            "NINE"
        ],
        ["susFourFlatNine"]: [
            "SUS4",
            "FLAT_NINE"
        ],
        ["thirteenSusFour"]: [
            "THIRTEEN",
            "SUS4"
        ],
        ["thirteenSusFourFlatNine"]: [
            "THIRTEEN",
            "SUS4",
            "FLAT_NINE"
        ]
    };
    return (tokenMap[chordType] ?? []) as ChordToken[];
}

const chordTypeTokenMap = new Map<string, ChordType>(Object.values(ChordType).map((t)=>{
    const tokens = chordTypeToTokens(t);
    return [
        tokens.map((tk)=>tk).join(','),
        t
    ];
}));

export function chordTypeFromTokens(tokens: ChordToken[]): ChordType | null {
    const tokenStr = tokens.map((t)=>t).join(',');
    return chordTypeTokenMap.get(tokenStr) ?? null;
}

// 和弦类型 → 显示字符串的精确映射。
// 原实现用链式 .replace：短名会先于长名命中（例如 'minorSeven' 抢先替换 'minorSevenFlatFive' 的前缀、
// 'dominantThirteen' 抢先替换 'dominantThirteenFlatNine'），导致 20+ 个和弦名显示错乱。改为查表彻底消除顺序依赖。
const CHORD_TYPE_DISPLAY = {
    ["majorTriad"]: '',
    ["minorTriad"]: 'minor_symbol',
    ["diminishedTriad"]: 'dim',
    ["augmentedTriad"]: 'aug',
    ["susTwoTriad"]: 'sus2',
    ["susFourTriad"]: 'sus4',
    ["addNine"]: 'add9',
    ["minorAddNine"]: 'minor_symboladd9',
    ["diminished"]: 'dim7',
    ["diminishedMajorSeven"]: 'dimMaj7',
    ["dominantNine"]: '9',
    ["dominantNineFlatThirteen"]: '9b13',
    ["dominantNineSharpEleven"]: '9#11',
    ["dominantSeven"]: '7',
    ["dominantSevenAlt"]: '7alt',
    ["dominantSevenFlatFive"]: '7b5',
    ["dominantSevenFlatNine"]: '7b9',
    ["dominantSevenFlatNineFlatThirteen"]: '7b9b13',
    ["dominantSevenFlatFiveFlatNine"]: '7b5b9',
    ["dominantSevenFlatFiveSharpNine"]: '7b5#9',
    ["dominantSevenSharpFive"]: '7#5',
    ["dominantSevenSharpNine"]: '7#9',
    ["dominantSevenFlatThirteen"]: '7b13',
    ["dominantSevenSharpEleven"]: '7#11',
    ["dominantSevenSharpFiveFlatNine"]: '7#5b9',
    ["dominantSevenSharpFiveSharpNine"]: '7#5#9',
    ["dominantThirteen"]: '13',
    ["dominantThirteenFlatNine"]: '13b9',
    ["dominantThirteenSharpNine"]: '13#9',
    ["dominantThirteenSharpEleven"]: '13#11',
    ["majorNine"]: 'Maj9',
    ["majorNineSharpEleven"]: 'Maj9#11',
    ["majorNineSharpFive"]: 'Maj9#5',
    ["majorNineFlatSix"]: 'Maj9b6',
    ["majorSeven"]: 'Maj7',
    ["majorSevenSharpEleven"]: 'Maj7#11',
    ["majorSevenSharpFive"]: 'Maj7#5',
    ["majorSevenFlatSix"]: 'Maj7b6',
    ["majorSevenSharpNine"]: 'Maj7#9',
    ["majorThirteen"]: 'Maj13',
    ["majorThirteenSharpEleven"]: 'Maj13#11',
    ["majorThirteenSharpFive"]: 'Maj13#5',
    ["minorEleven"]: 'minor_symbol11',
    ["minorMajorNine"]: 'minor_symbolMaj9',
    ["minorMajorSeven"]: 'minor_symbolMaj7',
    ["minorMajorThirteen"]: 'minor_symbolMaj13',
    ["minorNine"]: 'minor_symbol9',
    ["minorSeven"]: 'minor_symbol7',
    ["minorSevenFlatFive"]: 'minor_7_flat_5_symbol',
    ["minorSevenFlatFiveNatNine"]: 'minor_symbol9b5',
    ["minorSevenFlatSix"]: 'minor_symbol7b6',
    ["minorSix"]: 'minor_symbol6',
    ["minorSixNine"]: 'minor_symbol69',
    ["minorThirteen"]: 'minor_symbol13',
    ["nineSusFour"]: '9sus4',
    ["sevenSusFour"]: '7sus4',
    ["sevenSusFourFlatNine"]: '7sus4b9',
    ["six"]: '6',
    ["sixNine"]: '69',
    ["susFourFlatNine"]: 'sus4b9',
    ["thirteenSusFour"]: '13sus4',
    ["thirteenSusFourFlatNine"]: '13sus4b9'
};

export function getChordTypeDisplayString(chordType: ChordType, minorSymbol: string = 'm', minor7flat5Symbol: string = 'ø7'): string {
    return (CHORD_TYPE_DISPLAY[chordType] ?? chordType.toString()).replace(/minor_symbol/g, minorSymbol).replace(/minor_7_flat_5_symbol/g, minor7flat5Symbol);
}

export function getChordTypeUnicodeDisplayString(chordType: ChordType, minorSymbol: string = 'm', minor7flat5Symbol: string = 'ø7'): string {
    return getChordTypeDisplayString(chordType, minorSymbol, minor7flat5Symbol).replace(/b/g, '♭').replace(/#/g, '♯').replace(/Maj/g, 'Δ').replace(/dim7/g, '°7').replace(/dim/g, '°').replace(/aug/g, '+');
}

export const CHORD_INTERVALS: Record<ChordType, number[]> = {
    ["majorTriad"]: [
        0,
        4,
        7
    ],
    ["minorTriad"]: [
        0,
        3,
        7
    ],
    ["diminishedTriad"]: [
        0,
        3,
        6
    ],
    ["augmentedTriad"]: [
        0,
        4,
        8
    ],
    ["susTwoTriad"]: [
        0,
        2,
        7
    ],
    ["susFourTriad"]: [
        0,
        5,
        7
    ],
    ["addNine"]: [
        0,
        4,
        7,
        14
    ],
    ["minorAddNine"]: [
        0,
        3,
        7,
        14
    ],
    ["diminished"]: [
        0,
        3,
        6,
        9
    ],
    ["diminishedMajorSeven"]: [
        0,
        3,
        6,
        11
    ],
    ["dominantNine"]: [
        0,
        4,
        7,
        10,
        14
    ],
    ["dominantNineFlatThirteen"]: [
        0,
        4,
        7,
        10,
        14,
        20
    ],
    ["dominantNineSharpEleven"]: [
        0,
        4,
        7,
        10,
        14,
        18
    ],
    ["dominantSeven"]: [
        0,
        4,
        7,
        10
    ],
    
    // 7alt = 1 3 ♭7 ♭9 ♯9 ♯11 ♭13。原值 [0,4,8,10,13,15,18,21] 同时含 ♭13(8) 与自然 13(21)，自相矛盾。
    ["dominantSevenAlt"]: [
        0,
        4,
        10,
        13,
        15,
        18,
        20
    ],
    ["dominantSevenFlatFive"]: [
        0,
        4,
        6,
        10
    ],
    ["dominantSevenFlatNine"]: [
        0,
        4,
        7,
        10,
        13
    ],
    ["dominantSevenFlatNineFlatThirteen"]: [
        0,
        4,
        7,
        10,
        13,
        20
    ],
    ["dominantSevenFlatFiveFlatNine"]: [
        0,
        4,
        6,
        10,
        13
    ],
    ["dominantSevenFlatFiveSharpNine"]: [
        0,
        4,
        6,
        10,
        15
    ],
    ["dominantSevenSharpFive"]: [
        0,
        4,
        8,
        10
    ],
    ["dominantSevenSharpNine"]: [
        0,
        4,
        7,
        10,
        15
    ],
    ["dominantSevenFlatThirteen"]: [
        0,
        4,
        7,
        10,
        20
    ],
    ["dominantSevenSharpEleven"]: [
        0,
        4,
        7,
        10,
        18
    ],
    ["dominantSevenSharpFiveFlatNine"]: [
        0,
        4,
        8,
        10,
        13
    ],
    ["dominantSevenSharpFiveSharpNine"]: [
        0,
        4,
        8,
        10,
        15
    ],
    ["dominantThirteen"]: [
        0,
        4,
        7,
        10,
        14,
        21
    ],
    
    // 13♭9 = 1 3 5 ♭7 ♭9 13。原值同时含 ♭9(13) 与 ♮9(14)，会产生 D♭ 与 D 并存。
    ["dominantThirteenFlatNine"]: [
        0,
        4,
        7,
        10,
        13,
        21
    ],
    ["dominantThirteenSharpNine"]: [
        0,
        4,
        7,
        10,
        15,
        21
    ],
    ["dominantThirteenSharpEleven"]: [
        0,
        4,
        7,
        10,
        14,
        18,
        21
    ],
    ["majorNine"]: [
        0,
        4,
        7,
        11,
        14
    ],
    ["majorNineSharpEleven"]: [
        0,
        4,
        7,
        11,
        14,
        18
    ],
    ["majorNineSharpFive"]: [
        0,
        4,
        8,
        11,
        14
    ],
    ["majorNineFlatSix"]: [
        0,
        4,
        7,
        11,
        14,
        20
    ],
    ["majorSeven"]: [
        0,
        4,
        7,
        11
    ],
    ["majorSevenSharpEleven"]: [
        0,
        4,
        7,
        11,
        18
    ],
    ["majorSevenSharpFive"]: [
        0,
        4,
        8,
        11
    ],
    ["majorSevenFlatSix"]: [
        0,
        4,
        7,
        11,
        20
    ],
    ["majorSevenSharpNine"]: [
        0,
        4,
        7,
        11,
        15
    ],
    ["majorThirteen"]: [
        0,
        4,
        7,
        11,
        14,
        21
    ],
    ["majorThirteenSharpEleven"]: [
        0,
        4,
        7,
        11,
        14,
        18,
        21
    ],
    ["majorThirteenSharpFive"]: [
        0,
        4,
        8,
        11,
        14,
        21
    ],
    ["minorEleven"]: [
        0,
        3,
        7,
        10,
        14,
        17
    ],
    ["minorMajorNine"]: [
        0,
        3,
        7,
        11,
        14
    ],
    ["minorMajorSeven"]: [
        0,
        3,
        7,
        11
    ],
    ["minorMajorThirteen"]: [
        0,
        3,
        7,
        11,
        14,
        21
    ],
    ["minorNine"]: [
        0,
        3,
        7,
        10,
        14
    ],
    ["minorSeven"]: [
        0,
        3,
        7,
        10
    ],
    ["minorSevenFlatFive"]: [
        0,
        3,
        6,
        10
    ],
    ["minorSevenFlatFiveNatNine"]: [
        0,
        3,
        6,
        10,
        14
    ],
    ["minorSevenFlatSix"]: [
        0,
        3,
        7,
        10,
        20
    ],
    ["minorSix"]: [
        0,
        3,
        7,
        9
    ],
    ["minorSixNine"]: [
        0,
        3,
        7,
        9,
        14
    ],
    ["minorThirteen"]: [
        0,
        3,
        7,
        10,
        14,
        21
    ],
    ["nineSusFour"]: [
        0,
        5,
        7,
        10,
        14
    ],
    ["sevenSusFour"]: [
        0,
        5,
        7,
        10
    ],
    ["sevenSusFourFlatNine"]: [
        0,
        5,
        7,
        10,
        13
    ],
    ["six"]: [
        0,
        4,
        7,
        9
    ],
    ["sixNine"]: [
        0,
        4,
        7,
        9,
        14
    ],
    ["susFourFlatNine"]: [
        0,
        5,
        7,
        13
    ],
    ["thirteenSusFour"]: [
        0,
        5,
        7,
        10,
        14,
        21
    ],
    
    // 13sus4♭9 = 1 4 5 ♭7 ♭9 13。同上，去掉与 ♭9 冲突的 ♮9(14)。
    ["thirteenSusFourFlatNine"]: [
        0,
        5,
        7,
        10,
        13,
        21
    ]
};

export class ChordTokenizer {
    static ROOT_NOTE_PATTERN = /^[A-Ga-g]/;
    static ACCIDENTAL_PATTERN = /^[#♯b♭]/;
    static NUMBER_PATTERN = /^\d+/;
    static tokenize(chordString: string): ChordToken[] {
        const tokens: ChordToken[] = [];
        let remaining = chordString.trim();
        while(remaining.length > 0){
            const result = this.nextToken(remaining);
            if (result.token) {
                tokens.push(result.token);
            }
            remaining = result.remaining;
            if (!result.token && remaining.length > 0) {
                remaining = remaining.slice(1);
            }
        }
        return tokens;
    }
    static nextToken(str: string): { token: ChordToken | null; remaining: string } {
        if (str.length === 0) {
            return {
                token: null,
                remaining: ''
            };
        }
        const firstChar = str[0].toUpperCase();
        const firstTwoChars = str.slice(0, 2).toLowerCase();
        const firstThreeChars = str.slice(0, 3).toLowerCase();
        const firstFourChars = str.slice(0, 4).toLowerCase();
        if (firstThreeChars === 'b13' || firstThreeChars === '♭13') {
            return {
                token: "FLAT_THIRTEEN",
                remaining: str.slice(3)
            };
        }
        if (firstThreeChars === '#11' || firstThreeChars === '♯11') {
            return {
                token: "SHARP_ELEVEN",
                remaining: str.slice(3)
            };
        }
        if (firstTwoChars === '#9' || firstTwoChars === '♯9') {
            return {
                token: "SHARP_NINE",
                remaining: str.slice(2)
            };
        }
        if (firstTwoChars === 'b9' || firstTwoChars === '♭9') {
            return {
                token: "FLAT_NINE",
                remaining: str.slice(2)
            };
        }
        if (firstTwoChars === 'b6' || firstTwoChars === '♭6') {
            return {
                token: "FLAT_SIX",
                remaining: str.slice(2)
            };
        }
        if (firstTwoChars === '#5' || firstTwoChars === '♯5') {
            return {
                token: "SHARP_FIVE",
                remaining: str.slice(2)
            };
        }
        if (firstTwoChars === 'b5' || firstTwoChars === '♭5') {
            return {
                token: "FLAT_FIVE",
                remaining: str.slice(2)
            };
        }
        if (firstChar === 'b' || firstChar === '♭') {
            return {
                token: "FLAT",
                remaining: str.slice(1)
            };
        }
        if (firstChar === '#' || firstChar === '♯') {
            return {
                token: "SHARP",
                remaining: str.slice(1)
            };
        }
        if (ROOT_NOTE_TOKENS.map((t)=>getChordTokenDisplayString(t)).includes(firstChar)) {
            const token = Object.values(ChordToken).find((t)=>getChordTokenDisplayString(t) === firstChar);
            if (token) {
                return {
                    token,
                    remaining: str.slice(1)
                };
            }
        }
        if (firstChar === '/') {
            return {
                token: "SLASH",
                remaining: str.slice(1)
            };
        }
        if (firstFourChars === 'maj7' || firstFourChars === 'maj9' || firstFourChars === 'maj13' || firstFourChars === 'majΔ') {
            return {
                token: "MAJOR",
                remaining: str.slice(3)
            };
        }
        if (firstThreeChars === 'maj' || firstThreeChars === 'Δ') {
            return {
                token: "MAJOR",
                remaining: str.slice(3)
            };
        }
        if (firstThreeChars === 'min') {
            return {
                token: "MINOR",
                remaining: str.slice(3)
            };
        }
        
        
        // 大/小调必须按原始大小写区分：M=major, m=minor。
        // 原实现用已 toUpperCase 的 firstChar 判定，导致 'm7' 命中 M+数字 分支被当作 majorSeven。
        if (str[0] === 'M' && str.length > 1 && /^[0-9]/.test(str.slice(1))) {
            return {
                token: "MAJOR",
                remaining: str.slice(1)
            };
        }
        if (str[0] === 'm' && str.length > 1) {
            return {
                token: "MINOR",
                remaining: str.slice(1)
            };
        }
        if (str[0] === 'M' && str.length === 1) {
            return {
                token: "MAJOR",
                remaining: str.slice(1)
            };
        }
        if (str[0] === 'm' && str.length === 1) {
            return {
                token: "MINOR",
                remaining: str.slice(1)
            };
        }
        if (firstChar === '-' || firstChar === '−') {
            return {
                token: "MINOR",
                remaining: str.slice(1)
            };
        }
        if (firstFourChars === 'dim7' || firstFourChars === '°7') {
            return {
                token: "DIMINISHED",
                remaining: str.slice(3)
            };
        }
        if (firstThreeChars === 'dim' || firstChar === '°') {
            return {
                token: "DIMINISHED",
                remaining: str.slice(firstChar === '°' ? 1 : 3)
            };
        }
        if (firstThreeChars === 'aug' || firstChar === '+') {
            return {
                token: "AUGMENTED",
                remaining: str.slice(firstChar === '+' ? 1 : 3)
            };
        }
        if (firstFourChars === 'sus2') {
            return {
                token: "SUS2",
                remaining: str.slice(4)
            };
        }
        if (firstFourChars === 'sus4' || firstThreeChars === 'sus') {
            return {
                token: "SUS4",
                remaining: str.slice(firstThreeChars === 'sus' ? 3 : 4)
            };
        }
        if (firstFourChars === 'add9') {
            return {
                token: "ADD9",
                remaining: str.slice(4)
            };
        }
        if (firstThreeChars === 'alt') {
            return {
                token: "ALT",
                remaining: str.slice(3)
            };
        }
        if (firstTwoChars === '13') {
            return {
                token: "THIRTEEN",
                remaining: str.slice(2)
            };
        }
        if (firstTwoChars === '11') {
            return {
                token: "ELEVEN",
                remaining: str.slice(2)
            };
        }
        if (firstChar === '9') {
            return {
                token: "NINE",
                remaining: str.slice(1)
            };
        }
        if (firstChar === '7') {
            return {
                token: "SEVEN",
                remaining: str.slice(1)
            };
        }
        if (firstChar === '6') {
            return {
                token: "SIX",
                remaining: str.slice(1)
            };
        }
        if (firstTwoChars === 'ø7') {
            return {
                token: "MINOR",
                remaining: str.slice(2)
            };
        }
        if (firstChar === 'ø') {
            return {
                token: "MINOR",
                remaining: str.slice(1)
            };
        }
        return {
            token: null,
            remaining: str.slice(1)
        };
    }
}

export class ChordParser {
    static parse(chordString: string): ParsedChord | null {
        const tokens = ChordTokenizer.tokenize(chordString);
        if (tokens.length === 0) {
            return null;
        }
        let rootNote = null;
        let slashRootNote = null;
        const chordTypeTokens = [];
        let hasSlash = false;
        let i = 0;
        if (isRootToken(tokens[0])) {
            const rootToken = tokens[0];
            rootNote = this.tokenToNote(rootToken);
            i++;
            if (i < tokens.length && ACCIDENTAL_TOKENS.includes(tokens[i])) {
                const accidental = tokens[i];
                rootNote = this.applyAccidental(rootNote, accidental);
                i++;
            }
        }
        while(i < tokens.length && !hasSlash){
            if (tokens[i] === "SLASH") {
                hasSlash = true;
                i++;
                break;
            }
            chordTypeTokens.push(tokens[i]);
            i++;
        }
        if (hasSlash && i < tokens.length) {
            if (isRootToken(tokens[i])) {
                slashRootNote = this.tokenToNote(tokens[i]);
                i++;
                if (i < tokens.length && ACCIDENTAL_TOKENS.includes(tokens[i])) {
                    slashRootNote = this.applyAccidental(slashRootNote, tokens[i]);
                }
            }
        }
        if (rootNote === null) {
            return null;
        }
        const chordType = this.inferChordType(chordTypeTokens as ChordToken[]);
        return {
            rootNote,
            chordType: chordType ?? "majorTriad",
            slashRootNote,
            function: null,
            scaleTypeOverride: null,
            isNewChord: false
        };
    }
    static tokenToNote(token: ChordToken): number {
        const noteMap: Record<string, number> = {
            ["A"]: 9,
            ["B"]: 11,
            ["C"]: 0,
            ["D"]: 2,
            ["E"]: 4,
            ["F"]: 5,
            ["G"]: 7
        };
        return noteMap[token] ?? 0;
    }
    static applyAccidental(note: number, accidental: ChordToken): number {
        const toneId = note;
        if (accidental === "SHARP") {
            return noteFromToneId(toneId + 1, false);
        } else if (accidental === "FLAT") {
            return noteFromToneId(toneId - 1, true);
        }
        return note;
    }
    static inferChordType(tokens: ChordToken[]): ChordType | null {
        if (tokens.length === 0) {
            return "majorTriad";
        }
        return chordTypeFromTokens(tokens);
    }
}

export function displayChordUnicode(
  rootNote: number,
  chordType: ChordType,
  slashRootNote?: number | null,
  minorSymbol: string = 'm',
  minor7flat5Symbol: string = 'ø7'
): string {
    const rootStr = NOTE_UNICODE_NAMES[rootNote] ?? NOTE_NAMES[rootNote] ?? 'C';
    const typeStr = getChordTypeUnicodeDisplayString(chordType, minorSymbol, minor7flat5Symbol);
    const slashStr = slashRootNote != null ? `/${NOTE_UNICODE_NAMES[slashRootNote] ?? NOTE_NAMES[slashRootNote] ?? ''}` : '';
    return `${rootStr}${typeStr}${slashStr}`;
}

export function displayChordStandard(
  rootNote: number,
  chordType: ChordType,
  slashRootNote?: number | null,
  minorSymbol: string = 'm',
  minor7flat5Symbol: string = 'm7b5'
): string {
    const rootStr = NOTE_NAMES[rootNote] ?? 'C';
    const typeStr = getChordTypeDisplayString(chordType, minorSymbol, minor7flat5Symbol);
    const slashStr = slashRootNote != null ? `/${NOTE_NAMES[slashRootNote] ?? ''}` : '';
    return `${rootStr}${typeStr}${slashStr}`;
}

// ==================== 缓存系统 ====================
const chordParseCache = new Map<string, ParsedChord | null>();

const chordNotesCache = new Map<string, number[]>();

const chordDisplayCache = new Map<string, string>();

const MAX_CACHE_SIZE = 1000;

function setCacheWithLRU<K, V>(map: Map<K, V>, key: K, value: V, maxSize: number = MAX_CACHE_SIZE): void {
    if (map.size >= maxSize) {
        const firstKey = map.keys().next().value;
        if (firstKey !== undefined) {
            map.delete(firstKey);
        }
    }
    map.set(key, value);
}

export function parseChord(chordString: string): ParsedChord | null {
    const cached = chordParseCache.get(chordString);
    if (cached !== undefined) return cached;
    const result = ChordParser.parse(chordString);
    setCacheWithLRU(chordParseCache, chordString, result);
    return result;
}

export function getChordNotes(rootNote: number, chordType: ChordType): number[] {
    const cacheKey = `${rootNote}-${chordType}`;
    const cached = chordNotesCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const intervals = CHORD_INTERVALS[chordType] ?? [];
    const result = intervals.map((interval)=>noteFromToneId(rootNote + interval, false));
    setCacheWithLRU(chordNotesCache, cacheKey, result);
    return result;
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
    const { slashRootNote = null, useUnicode = true, minorSymbol = 'm', minor7flat5Symbol = 'ø7' } = options ?? {};
    const cacheKey = `${rootNote}-${chordType}-${slashRootNote}-${useUnicode}-${minorSymbol}-${minor7flat5Symbol}`;
    const cached = chordDisplayCache.get(cacheKey);
    if (cached !== undefined) return cached;
    let result;
    if (useUnicode) {
        result = displayChordUnicode(rootNote, chordType, slashRootNote, minorSymbol, minor7flat5Symbol);
    } else {
        result = displayChordStandard(rootNote, chordType, slashRootNote, minorSymbol, minor7flat5Symbol);
    }
    setCacheWithLRU(chordDisplayCache, cacheKey, result);
    return result;
}

export function clearChordTheoryCache() {
    chordParseCache.clear();
    chordNotesCache.clear();
    chordDisplayCache.clear();
}
