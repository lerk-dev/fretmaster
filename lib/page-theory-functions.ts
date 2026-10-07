// 乐理纯函数（从 app/page.tsx 抽出，逻辑未改动）

import { CHORD_TYPES, DISPLAY_NAMES, NOTES, NOTES_FLAT , SCALE_MODES } from "@/lib/page-theory-data"
import { ALL_PRACTICE_LEVELS, type PracticeLevel } from "@/lib/practice-levels"
import { getStringTuning } from "@/lib/string-tuning"


export function normalizeNoteName(note: string): string {
  if (!note) return note
  return note.replace(/#/g, '♯').replace(/b/g, '♭')
}

export function findNoteIndexInArray(note: string, arr: string[]): number {
  return arr.findIndex(n => n === note)
}


export function getChordDisplayName(
  chordType: string,
  displayMode: 'chinese' | 'english' | 'english_short' | 'jazz',
  chordSymbolOptions?: {
    minorSymbol?: 'm' | '-' | 'min'
    minor7flat5Symbol?: 'm7b5' | 'ø7' | 'half-dim'
    dominant7flat9Symbol?: '7b9' | '7♭9' | '7-9'
    useUnicode?: boolean
  }
): string {
  // 类型书写可能有大小写 / 变音记号差异（歌曲数据里的 'Maj7#11' vs 注册表的 'maj7#11'），
  // 直接以原文查表会落空、退回显示原始类型字符串；故先用 normalizeChordType 归一。
  const table = DISPLAY_NAMES[displayMode].chordTypes as Record<string, string>
  const displayKey = table[chordType] !== undefined ? chordType : normalizeChordType(chordType)
  const baseName = table[displayKey] || chordType
  // 中文模式不应用细粒度覆盖（保持中文术语）
  if (displayMode === 'chinese') return baseName
  // 仅对英文/爵士记谱应用覆盖
  // 半减七（m7b5 / m9b5）优先处理（否则会被小调分支覆盖）
  if ((chordType === 'm7b5' || chordType === 'm9b5') && chordSymbolOptions?.minor7flat5Symbol) {
    const sym = chordSymbolOptions.minor7flat5Symbol
    if (chordType === 'm7b5') {
      if (sym === 'ø7') return 'ø7'
      if (sym === 'half-dim') return 'half-dim'
      return 'm7b5'
    }
    if (chordType === 'm9b5') {
      if (sym === 'ø7') return 'ø9'
      if (sym === 'half-dim') return 'half-dim9'
      return 'm9b5'
    }
  }
  // 小调和弦（Minor / m6 / m7 / m9 / m11 / m13 / mMaj7 / madd9 等，不含 m7b5/m9b5）
  const minorPattern = /^(Minor|m6|m7|m9|m11|m13|mMaj7|madd9|m6add9)$/
  if (minorPattern.test(chordType) && chordSymbolOptions?.minorSymbol) {
    const sym = chordSymbolOptions.minorSymbol
    // 简化：根据 chordType 直接生成对应符号
    const map: Record<string, string> = {
      'Minor': sym === 'min' ? 'min' : sym,
      'm6': `${sym}6`,
      'm7': `${sym}7`,
      'm9': `${sym}9`,
      'm11': `${sym}11`,
      'm13': `${sym}13`,
      'mMaj7': `${sym}Maj7`,
      'madd9': `${sym}add9`,
      'm6add9': `${sym}6add9`,
    }
    if (map[chordType]) return map[chordType]
  }
  // 属七降九（7b9）
  if (chordType === '7b9' && chordSymbolOptions?.dominant7flat9Symbol) {
    const sym = chordSymbolOptions.dominant7flat9Symbol
    if (sym === '7♭9') return '7♭9'
    if (sym === '7-9') return '7-9'
    return '7b9'
  }
  return baseName
}

/**
 * 和弦对象 → 显示名。**这是"和弦怎么显示"的唯一真相源**。
 *
 * 规则（三条，缺一条就会出现"屏幕上和导出的文字不一样"）：
 *   1. 大三和弦省略后缀 —— C 而不是 CMajor（比较的是该显示模式下 Major 的名字；
 *      实测它并不总是空串：chinese='大三和弦'、english/english_short='Major'、jazz='Maj'）
 *   2. 音名归一化为 ♯/♭（C# → C♯）
 *   3. 低音/转位用 /低音 表示，低音也归一化
 *
 * 历史：这段逻辑曾在 app/page.tsx 的 getCurrentChordDisplay 与
 * lib/custom-chords-io 的导出里各写了一份，且**导出那份漏了归一化**，
 * 于是同一个和弦屏幕上显示 C♯m7、导出却是 C#m7。现在两处都调这里。
 */
export function formatChordShape(
  chord: { root: string; type: string; bass?: string },
  displayMode: Parameters<typeof getChordDisplayName>[1],
  chordSymbols?: Parameters<typeof getChordDisplayName>[2]
): string {
  const majorName = getChordDisplayName('Major', displayMode, chordSymbols)
  const typeName = getChordDisplayName(chord.type, displayMode, chordSymbols)
  const suffix = typeName === majorName ? '' : normalizeNoteName(typeName)
  return `${normalizeNoteName(chord.root)}${suffix}${chord.bass ? '/' + normalizeNoteName(chord.bass) : ''}`
}

// 获取音阶显示名称
export function getScaleDisplayName(scaleName: string, displayMode: 'chinese' | 'english' | 'english_short' | 'jazz'): string {
  const scaleTypes = DISPLAY_NAMES[displayMode].scaleTypes as Record<string, string>
  return scaleTypes[scaleName] || scaleName
}

// 将音程度数中的 # 和 b 转换为 ♯ 和 ♭
export function formatDegree(degree: string): string {
  return degree.replace(/#/g, '♯').replace(/b/g, '♭')
}


export const intervalToSemitones: Record<string, number> = {
  "1": 0, "b2": 1, "2": 2, "b3": 3, "3": 4, "4": 5, "#4": 6, "b5": 6, "5": 7, "#5": 8,
  "b6": 8, "6": 9, "bb7": 9, "#6": 10, "b7": 10, "7": 11,
  "b9": 1, "9": 2, "#9": 3, "11": 5, "#11": 6, "b13": 8, "13": 9
}

export const noteToSemitones: Record<string, number> = {
  "C": 0, "C#": 1, "C♯": 1, "Cb": 11, "C♭": 11, "Db": 1, "D♭": 1, "D": 2, "D#": 3, "D♯": 3, "Eb": 3, "E♭": 3, "E": 4, "F": 5,
  "F#": 6, "F♯": 6, "Gb": 6, "G♭": 6, "G": 7, "G#": 8, "G♯": 8, "Ab": 8, "A♭": 8, "A": 9, "A#": 10, "A♯": 10, "Bb": 10, "B♭": 10, "B": 11
}

// 检查两个音符是否为等音（如 C♯ = D♭） 标准化后比较
export function isEquivalentNote(note1: string, note2: string): boolean {
  if (note1 === note2) return true

  // 分离音符名和八度，并标准化为 ♯/♭ 形式
  const extractNoteName = (fullNote: string): string => {
    const match = fullNote.match(/^([CDEFGAB][#♯b♭]?\d*)/)
    return match ? normalizeNoteName(match[1]) : normalizeNoteName(fullNote)
  }

  const note1Name = extractNoteName(note1)
  const note2Name = extractNoteName(note2)

  if (note1Name === note2Name) return true

  // 定义等价的音符对（使用 ♯/♭ 统一形式）
  const equivalentPairs = [
    ['C♯', 'D♭'], ['D♯', 'E♭'], ['F♯', 'G♭'],
    ['G♯', 'A♭'], ['A♯', 'B♭'],
    ['C♯', 'D♭'], ['D♯', 'E♭'], ['F♯', 'G♭'],
    ['G♯', 'A♭'], ['A♯', 'B♭']
  ]

  for (const pair of equivalentPairs) {
    if ((note1Name === pair[0] && note2Name === pair[1]) ||
        (note1Name === pair[1] && note2Name === pair[0])) {
      return true
    }
  }

  return false
}

// ==================== 工具函数 ====================
/**
 * 某个品格位置的音名。
 *
 * @param tuning 该乐器的调弦（高音弦 → 低音弦，半音值）。
 *   **指板组件必须显式传自己的乐器调弦**（`INSTRUMENT_CONFIG[x].tuning`）；省略则回退到
 *   模块级全局 `lib/string-tuning.ts`，只给页面里那些拿不到乐器上下文的命令式调用用
 *   （点击处理 / 出题 / 答题判分 —— 那个全局由 `app/page.tsx` 渲染期按当前乐器写入）。
 *
 *   🚨 组件里省略它就等于埋雷：同一个指板会「分隔线数量」从乐器配置取、「行数 + 音名」
 *   从全局取；两个来源一旦不同步（单独挂载组件、或将来有人去掉渲染期那次写入），
 *   就会画出对不上的指板 —— 不报错，只是整体画错。见
 *   `__tests__/practice-fretboard-exercise.test.ts` 的「乐器自洽」一节。
 */
export function getNoteAtPosition(
  stringIndex: number,
  fret: number,
  tuning: number[] = getStringTuning(),
): string {
  const openNote = tuning[stringIndex]
  return NOTES[(openNote + fret) % 12]
}

export function getNoteIndex(note: string): number {
  if (!note) return -1
  const normalized = normalizeNoteName(note)
  const idx = NOTES.indexOf(normalized)
  if (idx !== -1) return idx
  return NOTES_FLAT.indexOf(normalized)
}

export function transposeChord(chord: string, fromKey: string, toKey: string): string {
  const fromIndex = getNoteIndex(fromKey)
  const toIndex = getNoteIndex(toKey)
  if (fromIndex === -1 || toIndex === -1) return chord

  const diff = (toIndex - fromIndex + 12) % 12

  // Extract root note（兼容 #/♯ 和 b/♭）
  const rootMatch = chord.match(/^([A-G][#♯b♭]?)/)
  if (!rootMatch) return chord

  const root = rootMatch[1]
  const rootIndex = getNoteIndex(root)
  if (rootIndex === -1) return chord

  const newRootIndex = (rootIndex + diff) % 12
  const newRoot = NOTES[newRootIndex]

  let transposed = chord.replace(/^([A-G][#♯b♭]?)/, newRoot)

  // 斜杠和弦（转位）的低音**也要一起转**。
  // 原实现只替换根音：'C/G' 在 C→D 时会得到 'D/G' —— 低音停在 G，音乐上是错的，
  // 应为 'D/A'。因为内置曲库目前没有斜杠和弦，这个错误此前不可见（潜在 bug）；
  // 唯一调用点是 lib/song-chords.ts 的转调路径，单测见 __tests__/song-chords.test.ts。
  transposed = transposed.replace(/\/([A-G][#♯b♭]?)$/, (whole, bass: string) => {
    const bassIndex = getNoteIndex(bass)
    if (bassIndex === -1) return whole
    return '/' + NOTES[(bassIndex + diff) % 12]
  })

  return transposed
}

export function parseChord(chord: string): { root: string; type: string; bass?: string } {
  const match = chord.match(/^([A-G][#♯b♭]?)(.*)$/)
  if (!match) return { root: "C", type: "Major" }

  const root = match[1]
  const rest = match[2]

  // Check for bass note
  const bassMatch = rest.match(/\/([A-G][#♯b♭]?)$/)
  const type = bassMatch ? rest.replace(bassMatch[0], "") : rest
  const bass = bassMatch ? bassMatch[1] : undefined

  return { root, type: type || "Major", bass }
}

// 规范化和弦类型符号 - 支持多种格式识别
export function normalizeChordType(type: string): string {
  const normalizedMap: Record<string, string> = {
    'm7b5': 'm7b5',
    'm7♭5': 'm7b5',
    'min7b5': 'm7b5',
    'minor7b5': 'm7b5',
    '-7b5': 'm7b5',
    'ø': 'm7b5',
    '7#9': '7#9',
    '7♯9': '7#9',
    '7b9': '7b9',
    '7♭9': '7b9',
    '7#11': '7#11',
    '7♯11': '7#11',
    'maj7': 'Maj7',
    'M7': 'Maj7',
    'Δ7': 'Maj7',
    'Δ': 'Maj7',
    'm7': 'm7',
    'min7': 'm7',
    '-7': 'm7',
    'dim7': 'dim7',
    'o7': 'dim7',
    'dim': 'Dim',
    'o': 'Dim',
    'aug': 'Aug',
    '+': 'Aug',
    'm': 'Minor',
    'min': 'Minor',
    '-': 'Minor',
    '': 'Major',
  }
  const direct = normalizedMap[type]
  if (direct !== undefined) return direct
  // 兜底：写法差异（大小写、♯/#、♭/b）也要能对上 —— 歌曲数据写的是 'Maj7#11'，
  // 而 CHORD_TYPES 注册表用 'maj7#11'。不归一会让 getChordDegrees 找不到该和弦、
  // 退化成只弹根音（`if (!chordType) return ["1"]`）。
  const canon = (s: string) => s.replace(/♯/g, '#').replace(/♭/g, 'b').toLowerCase()
  const want = canon(type)
  for (const [k, v] of Object.entries(normalizedMap)) {
    if (canon(k) === want) return v
  }
  const byName = CHORD_TYPES.find(ct => canon((ct as { name: string }).name) === want)
  return byName ? (byName as { name: string }).name : type
}

export function formatChordName(chord: { root: string; type: string; bass?: string }, _t: (key: string) => string): string {
  const normalizedType = normalizeChordType(chord.type)
  const chordType = CHORD_TYPES.find(ct => ct.symbol === normalizedType || ct.name === normalizedType || ct.symbol === chord.type || ct.name === chord.type)
  const typeSymbol = chordType ? chordType.symbol : chord.type

  let result = `${normalizeNoteName(chord.root)}${normalizeNoteName(typeSymbol)}`
  if (chord.bass) {
    result += `/${normalizeNoteName(chord.bass)}`
  }
  return result
}

// 判断和弦类型是否为变化属和弦
export function isAlteredChord(type: string): boolean {
  const normalizedType = normalizeChordType(type)
  // 小调系（Minor / m7 / m7b5 / m9b5 / mMaj7 …）不是变化**属**和弦，先行排除。
  // 否则 'm7b5' 会因子串 '7b5' 被误判 —— 半减七的 b5 是特征音，
  // 开启「强制自然五度」时不该被替换成 5（正则的 (?!aj) 让 'maj7' 不被当小调）。
  if (/^m(?!aj)/i.test(type) || /^m(?!aj)/i.test(normalizedType)) return false
  const alteredTypes = ['7alt', '7#5', '7b5', '7#5b9', '7#5#9', '7b5b9', '7b5#9', '7b9b13', 'aug7']
  return alteredTypes.some(t => type.includes(t) || normalizedType.includes(t))
}

export function getBebopScaleForChordType(type: string): { name: string; intervals: string[]; passingToneIndices: number[] } | null {
  const normalizedType = normalizeChordType(type)
  
  if (type.includes('m7b5') || type.includes('m9b5') || normalizedType.includes('minorSevenFlatFive')) {
    return {
      name: 'Bebop Dorian',
      intervals: ['1', '2', 'b3', '4', '5', '6', 'b7', '7'],
      passingToneIndices: [7]
    }
  }
  
  if (type.startsWith('m') || type.includes('min') || normalizedType.includes('minor')) {
    if (type.includes('Maj7') || type.includes('maj7') || type.includes('(maj7)')) {
      return {
        name: 'Bebop Tonic Minor',
        intervals: ['1', '2', 'b3', '4', '5', 'b6', '6', '7'],
        passingToneIndices: [5]
      }
    }
    return {
      name: 'Bebop Dorian',
      intervals: ['1', '2', 'b3', '4', '5', '6', 'b7', '7'],
      passingToneIndices: [7]
    }
  }
  
  if (type.includes('Maj') || type.includes('maj') || type === 'M7' || normalizedType.includes('majorSeven') || normalizedType.includes('majorNine') || normalizedType.includes('majorThirteen')) {
    return {
      name: 'Bebop Major',
      intervals: ['1', '2', '3', '4', '5', 'b6', '6', '7'],
      passingToneIndices: [5]
    }
  }
  
  if (type.includes('b9') && type.includes('b13')) {
    return {
      name: 'Bebop Dom7b9b13',
      intervals: ['1', 'b9', '3', '4', '5', 'b13', 'b7', '7'],
      passingToneIndices: [1, 5, 7]
    }
  }
  
  if (type.includes('7') || type.includes('9') || type.includes('11') || type.includes('13') || type.includes('dominant')) {
    return {
      name: 'Bebop Dominant',
      intervals: ['1', '2', '3', '4', '5', '6', 'b7', '7'],
      passingToneIndices: [7]
    }
  }
  
  if (type.includes('6') || type.includes('6/9')) {
    return {
      name: 'Bebop Major',
      intervals: ['1', '2', '3', '4', '5', 'b6', '6', '7'],
      passingToneIndices: [5]
    }
  }
  
  return {
    name: 'Bebop Dominant',
    intervals: ['1', '2', '3', '4', '5', '6', 'b7', '7'],
    passingToneIndices: [7]
  }
}

// Scale intervals 定义（与 Solo ScaleLibrary/scales_v2.json 一致，不含 bebop passing tones）
// sequence 数字作为 1-indexed 索引访问对应 scale 的 intervals
export const SCALE_INTERVALS: Record<string, string[]> = {
  major:           ['1', '2', '3', '4', '5', '6', '7'],
  dorian:          ['1', '2', 'b3', '4', '5', '6', 'b7'],
  phrygian:        ['1', 'b2', 'b3', '4', '5', 'b6', 'b7'],
  lydian:          ['1', '2', '3', '#4', '5', '6', '7'],
  mixolydian:      ['1', '2', '3', '4', '5', '6', 'b7'],
  aeolian:         ['1', '2', 'b3', '4', '5', 'b6', 'b7'],
  locrian:         ['1', 'b2', 'b3', '4', 'b5', 'b6', 'b7'],
  locrianNat2:     ['1', '2', 'b3', '4', 'b5', 'b6', 'b7'],
  locrianNat6:     ['1', 'b2', 'b3', '4', 'b5', '6', 'b7'],
  melodicMinor:    ['1', '2', 'b3', '4', '5', '6', '7'],
  dorianFlat2:     ['1', 'b2', 'b3', '4', '5', '6', 'b7'],
  lydianAugmented: ['1', '2', '3', '#4', '#5', '6', '7'],
  lydianDominant:  ['1', '2', '3', '#4', '5', '6', 'b7'],
  mixolydianFlat6: ['1', '2', '3', '4', '5', 'b6', 'b7'],
  altered:         ['1', 'b9', '#9', '3', 'b5', 'b13', 'b7'],
  harmonicMinor:   ['1', '2', 'b3', '4', '5', 'b6', '7'],
  phrygianDominant:['1', 'b9', '3', '4', '5', 'b13', 'b7'],
  lydianSharp9:    ['1', '#9', '3', '#4', '5', '6', '7'],
  harmonicMajor:   ['1', '2', '3', '4', '5', 'b6', '7'],
  ionianAugmented: ['1', '2', '3', '4', '#5', '6', '7'],
  diminishedHalfWhole: ['1', 'b9', '#9', '3', 'b5', '5', '13', 'b7'],
  diminishedWholeHalf: ['1', '2', 'b3', '4', 'b5', '#5', '6', '7'],
  wholeTone:       ['1', '2', '3', '#4', '#5', 'b7'],
}

// 根据 chord type 返回对应的 scale（与 Solo ScaleLibraryData.scaleNameForChordFunction 一致）
// forceNaturalFive: 关卡是否强制自然 5 音。变化属和弦在 false 时用 altered，true 时用 phrygianDominant
// sevenFlatNineScaleChoice: 用户偏好的 7b9 音阶（覆盖 forceNaturalFive 的默认行为）
// 注意：TS 不区分 function，这里取最常用的 function（如 m7→dorian，Maj7→major）
export function getScaleForChord(type: string, forceNaturalFive?: boolean, sevenFlatNineScaleChoice?: 'altered' | 'diminishedWholeHalf' | 'diminishedHalfWhole'): string {
  // 7b9b13 固定用 phrygianDominant（Solo 所有 function 一致）
  if (type === '7b9b13') return 'phrygianDominant'
  // 7b9 优先使用用户偏好（SevenFlatNineScaleChoice），其次用 forceNaturalFive 默认行为
  if (type === '7b9') {
    if (sevenFlatNineScaleChoice === 'diminishedWholeHalf') return 'diminishedWholeHalf'
    if (sevenFlatNineScaleChoice === 'diminishedHalfWhole') return 'diminishedHalfWhole'
    // 默认 altered vs phrygianDominant 由 forceNaturalFive 决定
    return forceNaturalFive === false ? 'altered' : 'phrygianDominant'
  }
  // 其他 altered dominants：forceNaturalFive=false→altered，true→phrygianDominant
  const alteredDominants = ['7alt', '7b5', '7#5', '7#9', '7#5b9', '7#5#9', '7b5b9', '7b5#9', 'aug7']
  if (alteredDominants.includes(type)) {
    return forceNaturalFive === false ? 'altered' : 'phrygianDominant'
  }
  // 普通属和弦（V function → mixolydian）
  if (['7', '9', '11', '13'].includes(type)) return 'mixolydian'
  if (['7#11', '9#11', '13#11'].includes(type)) return 'lydianDominant'
  if (['9b13'].includes(type)) return 'mixolydianFlat6'
  if (['7b13'].includes(type)) return 'phrygianDominant'
  // 13b9/13#9 用 diminishedHalfWhole（Solo 所有 function 一致）
  if (['13b9', '13#9'].includes(type)) return 'diminishedHalfWhole'
  // 大和弦（I function → major）
  if (['Maj7', 'Maj9', 'maj13'].includes(type)) return 'major'
  if (['maj7#11', 'maj9#11', 'maj13#11'].includes(type)) return 'lydian'
  if (['maj7#5', 'maj9#5', 'maj13#5'].includes(type)) return 'lydianAugmented'
  if (['maj7b6', 'maj9b6'].includes(type)) return 'harmonicMajor'
  if (['maj7#9'].includes(type)) return 'lydian' // Solo: line 295-297 (不是 lydianSharp9)
  if (['add9', '6', '6add9'].includes(type)) return 'major'
  // 小和弦（I/II function → dorian）
  if (['m7', 'm9', 'm11', 'm13'].includes(type)) return 'dorian'
  if (['m7b5', 'm9b5'].includes(type)) return 'locrian'
  if (['m7b5nat9'].includes(type)) return 'locrianNat2'
  if (['m7b6'].includes(type)) return 'dorian' // Solo: line 298-300 (不是 aeolian)
  if (['m6', 'm6add9'].includes(type)) return 'melodicMinor' // Solo: line 274 否定检查 → line 328 (不是 dorian)
  if (['mMaj7', 'mMaj9', 'mMaj13'].includes(type)) return 'melodicMinor'
  if (['madd9'].includes(type)) return 'dorian'
  // 减和弦
  if (['Dim', 'dim', 'dim7'].includes(type)) return 'diminishedWholeHalf'
  if (['dimMaj7'].includes(type)) return 'harmonicMinor' // Solo 算法选择
  // 增和弦
  if (['Aug', 'aug'].includes(type)) return 'wholeTone'
  // 挂留和弦
  if (['sus4', 'sus2'].includes(type)) return 'major'
  if (['7sus4', '9sus4', '13sus4'].includes(type)) return 'mixolydian'
  if (['7sus4b9', '13sus4b9'].includes(type)) return 'dorianFlat2' // Solo: line 317-320 (V function)
  if (['sus4b9'].includes(type)) return 'phrygian' // Solo: line 314-316
  // 三和弦
  if (['Major', ''].includes(type)) return 'major'
  if (['Minor', 'm', 'min', '-'].includes(type)) return 'dorian' // Solo 算法选择
  return 'major'
}

// 根据和弦类型返回对应的 sequence 类型（与 Solo 原版 Level.sequence() 一致）
// forceNaturalFive: 关卡是否强制自然 5 音。变化属和弦在 true 时用 dominant，false 时用 altered
// 此函数是 getChordDegrees 和 generateChordSequence 共用的唯一权威实现
export function getSequenceTypeForChord(type: string, forceNaturalFive?: boolean): string {
  // 变化属和弦系列（forceNaturalFive=true → dominant，false → altered）
  // 注意：aug7 与 7#5 等音等音程，Solo 中视为同一个 ChordType
  // 注意：7b9b13 不在此列 - Solo case 12 始终用 dominantSequence（不是 altered/dominant 二选一）
  const alteredDominants = ['7alt', '7b5', '7#5', '7b9', '7#9', '7#5b9', '7#5#9', '7b5b9', '7b5#9', 'aug7']
  if (alteredDominants.includes(type)) {
    return forceNaturalFive === false ? 'altered' : 'dominant'
  }
  // 普通属和弦系列（包含 7b9b13，Solo case 12 → dominantSequence）
  if (['7', '7#11', '7b13', '9', '9b13', '9#11', '11', '13', '13#11', '7b9b13'].includes(type)) return 'dominant'
  // 13b9、13#9 在 Solo 中使用 diminishedDominantSequence（case 52, 53）
  if (['13b9', '13#9'].includes(type)) return 'diminishedDominant'
  // 大和弦系列（包含大七、大九、大十三、add9）
  if (['Maj7', 'maj7#5', 'maj7#11', 'maj7b6', 'maj7#9', 'Maj9', 'maj9#11', 'maj9#5', 'maj9b6', 'maj13', 'maj13#11', 'maj13#5', 'add9'].includes(type)) return 'major'
  // 小和弦系列（包含小七、小九、小十一、小十三、m7b5、m7b6、mMaj7、madd9）
  if (['m7', 'm7b5', 'm7b5nat9', 'm7b6', 'mMaj7', 'mMaj9', 'mMaj13', 'm9', 'm9b5', 'm11', 'm13', 'madd9'].includes(type)) return 'minor'
  // 减和弦系列
  if (['Dim', 'dim', 'dim7'].includes(type)) return 'diminished'
  // 减大七和弦
  if (['dimMaj7'].includes(type)) return 'diminishedMajorSeven'
  // 增和弦系列（aug7 已在 altered dominants 中处理）
  if (['Aug', 'aug'].includes(type)) return 'augmented'
  // 挂留和弦系列（Solo case 40-46：susFourTriad, susFourFlatNine, nineSusFour, sevenSusFour, sevenSusFourFlatNine, thirteenSusFour, thirteenSusFourFlatNine）
  if (['sus4', '7sus4', '7sus4b9', 'sus4b9', '9sus4', '13sus4', '13sus4b9'].includes(type)) return 'sus'
  // 挂二和弦
  if (['sus2'].includes(type)) return 'sus2'
  // 六和弦系列（6add9 和 m6add9 在 Solo 中都属于 sixSequence，case 49 和 51）
  if (['6', '6add9', 'm6', 'm6add9'].includes(type)) return 'six'
  // 大三/小三三和弦（注意 normalizeChordType 会把 'm'、'min'、'-' 转为 'Minor'）
  if (type === 'Minor' || type === 'm' || type === 'min' || type === '-') return 'minor'
  if (type === 'Major' || type === '') return 'major'
  // 默认大调
  return 'major'
}

// 根据 sequence 类型获取实际序列，应用与 Solo 一致的回退逻辑：
// diminishedMajorSeven → diminished；sus2/augmented/altered → sus；最终回退到 major
export function getSequenceWithFallback(sequences: PracticeLevel['sequences'], seqType: string): number[] {
  const direct = sequences[seqType as keyof typeof sequences]
  if (direct) return direct
  const fallbackMap: Record<string, string> = {
    diminishedMajorSeven: 'diminished',
    sus2: 'sus',
    augmented: 'sus',
    altered: 'sus',
  }
  const fallbackKey = fallbackMap[seqType]
  if (fallbackKey && sequences[fallbackKey as keyof typeof sequences]) {
    return sequences[fallbackKey as keyof typeof sequences]!
  }
  return sequences.major || [1, 3, 5, 7]
}

/**
 * 把 level 的 sequence 数字（1-indexed 的音阶位置）映射成音级名。
 *
 * 越界位置按既有约定**跳过**（与 Solo ChangesWorkoutStepBuilder 一致）——例如
 * `[1,2,3,4,5,6,7,8]` 用在 7 音音阶上就该丢掉 8。
 *
 * 但如果位置**全部越界**，过滤结果会是空数组，而两个调用方拿到空序列都会**静默卡住**
 * （getChordDegrees → `if (currentStep >= degrees.length) return`；
 *  generateChordSequence → `if (chordExerciseSequence.length === 0) break`），
 * 界面不高亮、不匹配、也不报错。已确认的用户可达组合：
 *
 *   single_chord_tones_7th + Aug    —— 序列 [7]，但 wholeTone 只有 6 个音
 *   single_chord_tones_7th + dimMaj7 —— 序列 [8]，但 harmonicMinor 只有 7 个音
 *
 * 故仅在「兜底为空」时把位置夹到音阶最高音并按顺序去重。夹取结果在乐理上也正确：
 * wholeTone 的七音就是 b7、dimMaj7 的七音就是大七度 7。
 */
function sequenceNumbersToDegrees(sequenceNumbers: number[], scaleIntervals: string[]): string[] {
  const inRange = sequenceNumbers
    .filter(n => n >= 1 && n <= scaleIntervals.length)
    .map(n => scaleIntervals[n - 1])
  if (inRange.length > 0 || sequenceNumbers.length === 0) return inRange
  const clamped = sequenceNumbers.map(n => Math.min(Math.max(n, 1), scaleIntervals.length))
  return [...new Set(clamped)].map(n => scaleIntervals[n - 1])
}

export function getChordDegrees(type: string, level?: string, options?: {
  forceNaturalFive?: boolean,
  endOnStartingInterval?: boolean,
  usePassingNoteBebopScale?: boolean,
  sevenFlatNineScaleChoice?: 'altered' | 'diminishedWholeHalf' | 'diminishedHalfWhole'
}): string[] {
  const normalizedType = normalizeChordType(type)
  const chordType = CHORD_TYPES.find(ct => ct.name === normalizedType || ct.symbol === normalizedType || ct.name === type || ct.symbol === type)
  if (!chordType) return ["1"]
  
  if (level && level !== 'all') {
    const practiceLevel = ALL_PRACTICE_LEVELS.find(l => l.id === level)
    
    if (practiceLevel) {
      const seqType = getSequenceTypeForChord(type, options?.forceNaturalFive) as keyof typeof practiceLevel.sequences
      const degreeNumbers = getSequenceWithFallback(practiceLevel.sequences, seqType)

      // Solo 架构：sequence 数字作为 1-indexed 索引访问 chord type 对应 scale 的 intervals
      // 越界时跳过（与 Solo ChangesWorkoutStepBuilder 一致）
      const scaleName = getScaleForChord(type, options?.forceNaturalFive, options?.sevenFlatNineScaleChoice)
      const scaleIntervals = SCALE_INTERVALS[scaleName] || SCALE_INTERVALS.major
      const chordIntervals = chordType.intervals
      let intervals: string[] = sequenceNumbersToDegrees(degreeNumbers, scaleIntervals)

      // forceNaturalFive 已通过 scale 选择实现（phrygianDominant 包含自然 5），无需额外替换
      
      if (options?.usePassingNoteBebopScale) {
        const bebopScale = getBebopScaleForChordType(type)
        if (bebopScale) {
          const levelSequence = intervals
          const bebopIntervals: string[] = []
          
          for (const interval of levelSequence) {
            bebopIntervals.push(interval)
            
            const currentIdx = bebopScale.intervals.indexOf(interval)
            if (currentIdx !== -1 && currentIdx < bebopScale.intervals.length - 1) {
              const nextInterval = bebopScale.intervals[currentIdx + 1]
              if (bebopScale.passingToneIndices.includes(currentIdx + 1)) {
                bebopIntervals.push(nextInterval)
              }
            }
          }
          
          intervals = bebopIntervals
        }
      }

      const startingOption = practiceLevel.startingIntervalOption || 'first'
      const takeBeforeOrder = practiceLevel.takeStartingIntervalBeforeOrder

      if (startingOption === 'chordTone' && intervals.length > 0) {
        const chordToneSet = new Set(chordIntervals.map(s => semitonesToDegree(s, type)))
        const chordToneInSequence = intervals.filter(i => chordToneSet.has(i))
        if (chordToneInSequence.length > 0) {
          const startInterval = chordToneInSequence[Math.floor(Math.random() * chordToneInSequence.length)]
          if (takeBeforeOrder) {
            const idx = intervals.indexOf(startInterval)
            if (idx > 0) {
              intervals = [...intervals.slice(idx), ...intervals.slice(0, idx)]
            }
          }
        }
      } else if (startingOption === 'any' && intervals.length > 0) {
        const startIdx = Math.floor(Math.random() * intervals.length)
        if (takeBeforeOrder && startIdx > 0) {
          intervals = [...intervals.slice(startIdx), ...intervals.slice(0, startIdx)]
        }
      }
      
      if ((options?.endOnStartingInterval || practiceLevel.endOnStartingInterval) && intervals.length > 0) {
        intervals = [...intervals, intervals[0]]
      }
      
      return intervals
    }
    
    // 走到这里说明 level 既非空、又不是任何 ALL_PRACTICE_LEVELS.id、也不是 'all'，
    // 即「未知 level」→ 直接取和弦自身的全部音级。
    // 原实现在此调用 getIntervalsForLevel，但那个函数 150 余行的 switch 用的全是连字符短 id
    // （'single-root' / 'quad-root-3-5-7' …），全仓与 git 历史都确认从未有数据产生过它们，
    // 故已删除。删除前后的行为差异（仅限那些短 id）见 __tests__/voice-leading.test.ts。
    let intervals = chordType.intervals.map(i => semitonesToDegree(i, type))
    
    if (options?.forceNaturalFive && isAlteredChord(type)) {
      intervals = intervals.map(degree => {
        if (degree === '#5' || degree === 'b5' || degree === 'b13' || degree === '#11') {
          return '5'
        }
        return degree
      })
    }
    
    if (options?.usePassingNoteBebopScale) {
      const bebopScale = getBebopScaleForChordType(type)
      if (bebopScale) {
        const levelSequence = intervals
        const bebopIntervals: string[] = []
        
        for (const interval of levelSequence) {
          bebopIntervals.push(interval)
          
          const currentIdx = bebopScale.intervals.indexOf(interval)
          if (currentIdx !== -1 && currentIdx < bebopScale.intervals.length - 1) {
            const nextInterval = bebopScale.intervals[currentIdx + 1]
            if (bebopScale.passingToneIndices.includes(currentIdx + 1)) {
              bebopIntervals.push(nextInterval)
            }
          }
        }
        
        intervals = bebopIntervals
      }
    }
    
    if (options?.endOnStartingInterval && intervals.length > 0) {
      intervals = [...intervals, intervals[0]]
    }
    
    return intervals
  }
  
  if (type === 'dim7' || type === 'diminished7') {
    return ["1", "b3", "b5", "bb7"]
  }
  
  if (type === 'm7b5' || type === 'half-diminished') {
    return ["1", "b3", "b5", "b7"]
  }
  
  const extendedChordMap: Record<string, string[]> = {
    '9': ['1', '3', '5', 'b7', '9'],
    'Maj9': ['1', '3', '5', '7', '9'],
    'm9': ['1', 'b3', '5', 'b7', '9'],
    '7#9': ['1', '3', '5', 'b7', '#9'],
    '7b9': ['1', '3', '5', 'b7', 'b9'],
    '11': ['1', '3', '5', 'b7', '9', '11'],
    'm11': ['1', 'b3', '5', 'b7', '9', '11'],
    '7#11': ['1', '3', '5', 'b7', '9', '#11'],
    '13': ['1', '3', '5', 'b7', '9', '11', '13'],
    'm13': ['1', 'b3', '5', 'b7', '9', '11', '13'],
  }
  
  if (extendedChordMap[type]) {
    return extendedChordMap[type]
  }
  
  return chordType.intervals.map(interval => {
    return semitonesToDegree(interval, type)
  })
}

// Voice Leading: 找到与目标音最近的音级并重新排列
export function applyVoiceLeading(degrees: string[], chordRoot: string, previousNote: string | null): string[] {
  if (!previousNote || degrees.length === 0) return degrees
  
  const prevNoteIdx = getNoteIndex(previousNote)
  if (prevNoteIdx === -1) return degrees
  
  const rootIdx = getNoteIndex(chordRoot)
  if (rootIdx === -1) return degrees
  
  // 计算每个音级到前一个音的距离（考虑八度）
  let minDistance = Infinity
  let bestStartIdx = 0
  
  for (let i = 0; i < degrees.length; i++) {
    const semitone = intervalToSemitones[degrees[i]]
    if (semitone === undefined) continue
    
    // 计算音级对应的音高（半音值）
    const noteSemitone = (rootIdx + semitone) % 12
    
    // 计算距离（考虑最近的八度）
    const distanceUp = (noteSemitone - prevNoteIdx + 12) % 12
    const distanceDown = (prevNoteIdx - noteSemitone + 12) % 12
    const distance = Math.min(distanceUp, distanceDown)
    
    if (distance < minDistance) {
      minDistance = distance
      bestStartIdx = i
    }
  }
  
  // 从最近的音级开始重新排列
  if (bestStartIdx === 0) return degrees
  
  const reordered = [
    ...degrees.slice(bestStartIdx),
    ...degrees.slice(0, bestStartIdx)
  ]
  
  return reordered
}

// 将半音数转换为音级表示
export function semitonesToDegree(semitones: number, chordContext?: string): string {
  // 'Dim' / 'Minor' 都是项目内部的标准键（normalizeChordType 的输出），必须一并认
  const isDiminished = chordContext === 'diminished' || chordContext === 'dim7' || chordContext === 'dim' || chordContext === 'Dim' || chordContext === 'dimMaj7'
  const hasFlatFive = isDiminished || chordContext === 'm7b5' || chordContext === 'm9b5' || chordContext === 'm7b5nat9' || 
    chordContext === '7b5' || chordContext === '7b5b9' || chordContext === '7b5#9'
  // ⚠️ 不能只看 startsWith('m')：'maj7' 也以 m 开头，会被误判成小调（8 半音处就写成 b6 而非 #5）。
  // 另外 'Minor' 是项目标准键（normalizeChordType 的输出），也要认。
  const isMajorQuality = /^(maj|Maj|M7|Δ)/.test(chordContext || '')
  const isMinor = (!isMajorQuality && chordContext?.startsWith('m')) || chordContext?.startsWith('min') || chordContext?.startsWith('-') || chordContext === 'Minor' || 
    chordContext === 'minor' || chordContext === 'm7' || chordContext === 'm9' || chordContext === 'm11' || chordContext === 'm13' || 
    chordContext === 'mMaj7' || chordContext === 'm6' || chordContext === 'm7b5' || chordContext === 'm7b6' || 
    chordContext === 'm9b5' || chordContext === 'm7b5nat9' || chordContext === 'mMaj9' || chordContext === 'mMaj13' || 
    chordContext === 'madd9' || chordContext === 'm6/9'
  const hasSharpFive = chordContext === '7#5' || chordContext === '7#5b9' || chordContext === '7#5#9' || chordContext === '7alt' ||
    chordContext === 'aug' || chordContext === 'Aug' || chordContext === 'aug7' ||
    chordContext === 'maj7#5' || chordContext === 'maj9#5' || chordContext === 'maj13#5'
  const degreeMap: Record<number, string> = {
    0: "1",
    1: "b2",
    2: "2",
    3: "b3",
    4: "3",
    5: "4",
    6: hasFlatFive ? "b5" : "#4",
    7: "5",
    8: hasSharpFive ? "#5" : isMinor ? "b6" : "#5",
    9: isDiminished ? "bb7" : "6",
    10: "b7",
    11: "7",
    12: "1",
    13: "b9",
    14: "9",
    15: "#9",
    16: "3", // 12 + 4：八度 + 大三度（原写成 "#9"，与 15 半音重复，偏了一个全音）
    17: "11",
    18: "#11",
    19: "5", // 12 + 7：八度 + 纯五度（原写成 "b5"，差了一个八度又差半音）
    20: "b13",
    21: "13",
  }
  return degreeMap[semitones] || `${semitones}`
}

// 获取音符在和弦中的音级
export function getNoteDegreeInChord(note: string, chordRoot: string, chordType: string): string | null {
  const normalizedType = normalizeChordType(chordType)
  const chordTypeData = CHORD_TYPES.find(ct => ct.name === normalizedType || ct.symbol === normalizedType || ct.name === chordType || ct.symbol === chordType)
  if (!chordTypeData) return null

  const rootIdx = getNoteIndex(chordRoot)
  const noteIdx = getNoteIndex(note)
  const interval = (noteIdx - rootIdx + 12) % 12

  // 检查这个音程是否在和弦中
  if (!chordTypeData.intervals.includes(interval)) return null

  return semitonesToDegree(interval, chordType)
}

// 根据音级和根音生成正确的音名
// 例如：D Phrygian (1 b2 b3 4 5 b6 b7) 应该显示为 D, Eb, F, G, A, Bb, C 而不是 D, D#, F, G, A, A#, C
export function getScaleNoteNames(rootNote: string, intervals: string[]): string[] {
  const rootIdx = getNoteIndex(rootNote)
  const rootBaseName = rootNote.charAt(0) // 'C', 'D', 'E', 'F', 'G', 'A', 'B'
  const baseNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
  const rootBaseIdx = baseNotes.indexOf(rootBaseName)
  
  return intervals.map(interval => {
    // 解析音级，如 "b3", "#4", "5"
    const match = interval.match(/^(b|#)?(\d+)$/)
    if (!match) return ''
    
    const degree = parseInt(match[2]) // 1, 2, 3, 4, 5, 6, 7, etc.
    
    // 计算音级对应的基本音名（不考虑升降号）
    // 1=C, 2=D, 3=E, 4=F, 5=G, 6=A, 7=B
    const degreeToBaseIdx: Record<number, number> = {
      1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6,
      8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5
    }
    
    const baseNoteIdx = (rootBaseIdx + (degreeToBaseIdx[degree % 7 || 7] || 0)) % 7
    const baseNoteName = baseNotes[baseNoteIdx]
    
    // 计算目标音的半音数
    const semitoneOffset = degreeToSemitone(interval)
    if (semitoneOffset === undefined) return ''
    
    const targetSemitone = (rootIdx + semitoneOffset) % 12
    
    // 计算基本音名的自然半音数
    const naturalSemitones: Record<string, number> = {
      'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
    }
    const naturalSemitone = naturalSemitones[baseNoteName]
    
    // 计算需要的升降
    let diff = (targetSemitone - naturalSemitone + 12) % 12
    
    // 将 diff 转换为 -6 到 +6 范围
    if (diff > 6) diff -= 12
    
    // 生成音名
    let accidentalStr = ''
    if (diff === 1) accidentalStr = '#'
    else if (diff === 2) accidentalStr = '##'
    else if (diff === -1) accidentalStr = 'b'
    else if (diff === -2) accidentalStr = 'bb'
    else if (diff > 2) {
      // 如果差值太大，尝试从另一个方向计算
      diff = diff - 12
      if (diff === -1) accidentalStr = 'b'
    }
    
    return baseNoteName + accidentalStr
  })
}

// 音级到半音数的映射
export function degreeToSemitone(degree: string): number | undefined {
  const degreeMap: Record<string, number> = {
    '1': 0, 'b2': 1, '2': 2, '#2': 3, 'b3': 3, '3': 4, '4': 5,
    'b5': 6, '#4': 6, '5': 7, '#5': 8, 'b6': 8,
    '6': 9, 'bb7': 9, '#6': 10, 'b7': 10, '7': 11, 'maj7': 11,
    'b9': 13, '9': 14, '#9': 15, '11': 17, '#11': 18,
    'b13': 20, '13': 21
  }
  return degreeMap[degree]
}

/**
 * 音级标签 → 半音数的**兜底**表（**mod 12**）。
 *
 * 🚨 与上面 `degreeToSemitone()` 是**两套不同语义**的表，不要合并：
 *  - `degreeToSemitone()` 给**和弦级数**用，值是**复合音程**（`'9' → 14`、`'13' → 21`）；
 *  - 这张表给**音阶练习**用，值是 **0..11 的半音数**（`'9' → 2`、`'13' → 9`）。
 * 混用会让音阶练习整体高一个八度（表现为「目标音名对不上但音级看着没错」）。
 *
 * 它**不是**音阶练习的真相源：真相源是音阶自己的 `intervals[i] ↔ notes[i]` 对齐表。
 * 之所以保留，是因为 `generateScaleSequence` 在音阶 `intervals` 为空时会退化成用
 * `b5`/`b6` 这类写法合成标签 —— 那些标签不在 `intervals` 里，只能查这张表。
 */
export const SCALE_DEGREE_SEMITONE_FALLBACK: Record<string, number> = {
  '1': 0, 'b2': 1, '2': 2, 'b3': 3, '3': 4, '4': 5,
  '#4': 6, 'b5': 6, '5': 7, '#5': 8, 'b6': 8, '6': 9,
  '#6': 9, 'b7': 10, '7': 11,
  'b9': 1, '9': 2, '#9': 3, '11': 5, '#11': 6, 'b13': 8, '13': 9,
}

/**
 * 音阶练习：把练习序列里的**音级标签**解析成半音数（0..11）。
 *
 * 优先查音阶自身对齐表（`intervals.indexOf(degree)` → `notes[idx]`），查不到才回落兜底表。
 *
 * 🚨 为什么必须优先对齐表 —— 兜底表有两处会**静默出错**，都是实测出来的（见
 * `__tests__/scale-degree-semitone.test.ts` 的穷举用例，覆盖 76 个音阶）：
 *  ① 兜底表**缺** `#2`。含 `#2` 的音阶有 5 个（Altered / Lydian #9 / Lydian Augmented #2 /
 *     Diminished Half Whole / Augmented Scale），且都在可选列表里。查不到 ⇒ 返回 `undefined`
 *     ⇒ 调用方 `break` ⇒ **当前题永远不推进，也不报错**（表现为「弹对了没反应」）。
 *  ② 兜底表把 `#6` 记成 9，而 `Whole Tone` 与 `Augmented Scale` 里的 `#6` 是 **10**
 *     ⇒ 判定要求弹**低半音**的那个音。比 ① 更隐蔽：练习照常推进，只是判错。
 *
 * 返回 `undefined` 表示「这个标签两边都认不出」，调用方应当拒绝推进并告警，而不是当作 0。
 */
export function resolveScaleDegreeSemitone(
  scale: { intervals?: readonly string[] | null; notes?: readonly number[] | null },
  degree: string
): number | undefined {
  const intervals = scale?.intervals
  const notes = scale?.notes
  if (Array.isArray(intervals) && Array.isArray(notes)) {
    const idx = intervals.indexOf(degree)
    if (idx >= 0 && idx < notes.length) return notes[idx]
  }
  return SCALE_DEGREE_SEMITONE_FALLBACK[degree]
}

/**
 * 生成和弦练习序列（从 app/page.tsx 抽出，逻辑未改动）。
 *
 * - 序列号按 1-indexed 访问「和弦对应音阶」的 intervals，越界项跳过
 * - bass 非 root 时旋转序列，使指定音级排在最前
 * - order 为 desc 时反转、random 时 Fisher-Yates 洗牌
 *
 * 注：root 目前不参与计算，保留以维持调用点参数顺序。
 */
export function generateChordSequence(
  root: string,
  chordType: string,
  levelId: string,
  order: string,
  bass: string,
  sevenFlatNineScaleChoice?: 'altered' | 'diminishedWholeHalf' | 'diminishedHalfWhole'
): string[] {
  // 从 ALL_PRACTICE_LEVELS 获取练习模式
  const level = ALL_PRACTICE_LEVELS.find(l => l.id === levelId)
  if (!level) return []

  // 使用共用的 getSequenceTypeForChord 函数，与 getChordDegrees 保持一致
  // generateChordSequence 用于 chord_exercise tab，使用 level.forceNaturalFive
  const sequenceType = getSequenceTypeForChord(chordType, level.forceNaturalFive) as keyof typeof level.sequences
  let sequenceNumbers = getSequenceWithFallback(level.sequences, sequenceType)
  if (!sequenceNumbers.length) sequenceNumbers = [1]

  // Solo 架构：sequence 数字作为 1-indexed 索引访问 chord type 对应 scale 的 intervals
  // （越界跳过；全部越界时的兜底见 sequenceNumbersToDegrees —— 否则和弦练习会静默卡住）
  const scaleName = getScaleForChord(chordType, level.forceNaturalFive, sevenFlatNineScaleChoice)
  const scaleIntervals = SCALE_INTERVALS[scaleName] || SCALE_INTERVALS.major
  let sequence = sequenceNumbersToDegrees(sequenceNumbers, scaleIntervals)

  // 应用低音音符（旋转序列使指定音级排在最前）
  if (bass && bass !== "root") {
    const bassDegreeMap: Record<string, string> = {
      "3rd": "3", "5th": "5", "7th": "7",
      "b3": "b3", "b5": "b5", "bb7": "bb7", "#5": "#5"
    }
    const targetDegree = bassDegreeMap[bass]
    if (targetDegree) {
      const bassIdx = sequence.indexOf(targetDegree)
      if (bassIdx > 0) {
        sequence = [...sequence.slice(bassIdx), ...sequence.slice(0, bassIdx)]
      }
    }
  }

  // 应用演奏顺序
  if (order === "desc") {
    sequence = sequence.reverse()
  } else if (order === "random") {
    for (let i = sequence.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[sequence[i], sequence[j]] = [sequence[j], sequence[i]]
    }
  }

  return sequence
}

//
// 音程查找（从 app/page.tsx 抽出，逻辑未改动）——被音程练习与音阶/和弦度数逻辑共用
//

/**
 * 查找音阶中第一个出现的指定音程（如 '3'、'b3'、'#3'）。
 * blues 等特殊音阶优先返回对应度数的变音记号版本，找不到返回 null。
 */
export function findFirstIntervalOfType(intervals: string[], degree: string): string | null {
  // 特殊处理：对于blues音阶等特殊音阶，优先检查是否有对应度数的变音记号版本
  if (degree === '3') {
    for (let i = 0; i < intervals.length; i++) {
      if (intervals[i] === 'b3') return intervals[i]
    }
  } else if (degree === '4') {
    for (let i = 0; i < intervals.length; i++) {
      if (intervals[i] === 'b4') return intervals[i]
    }
  } else if (degree === '7') {
    for (let i = 0; i < intervals.length; i++) {
      if (intervals[i] === 'b7') return intervals[i]
    }
  }

  // 检查音阶中是否包含该度数的任何变体
  for (let i = 0; i < intervals.length; i++) {
    const intervalNumber = intervals[i].replace(/[^0-9]/g, '')
    if (intervalNumber === degree) {
      return intervals[i]
    }
  }

  return null
}

/**
 * 当音阶中缺少特定音程时，查找音阶中实际存在的最近音程（3→4/2、5→4/6、7→6/1）。
 * 都没找到时返回音阶第一个音程（音阶为空则返回 '1'）。
 */
export function findNearestIntervalInScale(intervals: string[], degree: string): string | null {
  // 首先尝试查找指定度数的音程
  const foundInterval = findFirstIntervalOfType(intervals, degree)
  if (foundInterval) return foundInterval

  // 如果没找到，根据音程类型选择最近的替代音程
  switch (degree) {
    case '3':
      // 3音缺失时，查找2音（优先）或4音
      for (let i = 0; i < intervals.length; i++) {
        const intervalNumber = intervals[i].replace(/[^0-9]/g, '')
        if (intervalNumber === '4') return intervals[i]
      }
      for (let i = 0; i < intervals.length; i++) {
        const intervalNumber = intervals[i].replace(/[^0-9]/g, '')
        if (intervalNumber === '2') return intervals[i]
      }
      break
    case '5':
      // 5音缺失时，查找4音或6音
      for (let i = 0; i < intervals.length; i++) {
        const intervalNumber = intervals[i].replace(/[^0-9]/g, '')
        if (intervalNumber === '4') return intervals[i]
      }
      for (let i = 0; i < intervals.length; i++) {
        const intervalNumber = intervals[i].replace(/[^0-9]/g, '')
        if (intervalNumber === '6') return intervals[i]
      }
      break
    case '7':
      // 7音缺失时，查找6音（优先）或1→1
      for (let i = 0; i < intervals.length; i++) {
        const intervalNumber = intervals[i].replace(/[^0-9]/g, '')
        if (intervalNumber === '6') return intervals[i]
      }
      for (let i = 0; i < intervals.length; i++) {
        const intervalNumber = intervals[i].replace(/[^0-9]/g, '')
        if (intervalNumber === '1') return intervals[i]
      }
      break
  }

  // 如果还是没找到，返回音阶中的第一个音程作为默认值
  return intervals.length > 0 ? intervals[0] : '1'
}

/** 音阶根音推进方式（与 store 的 scaleRootMovement 保持同一联合类型） */
export type ScaleRootMovement =
  | 'static'
  | 'random'
  | 'upSemiTone'
  | 'downSemiTone'
  | 'circleOfFifths'
  | 'circleOfFourths'

const SHARP_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'a', 'e', 'b', 'f♯', 'c♯', 'g♯', 'd♯']

const FLAT_KEYS = ['F', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'd', 'g', 'c', 'f', 'bb', 'eb']

const ENHARMONIC_MAP: Record<string, string> = {
  'C#': 'D♭', 'D♭': 'C#', 'C♯': 'D♭',
  'D#': 'E♭', 'E♭': 'D#', 'D♯': 'E♭',
  'F#': 'G♭', 'G♭': 'F#', 'F♯': 'G♭',
  'G#': 'A♭', 'A♭': 'G#', 'G♯': 'A♭',
  'A#': 'B♭', 'B♭': 'A#', 'A♯': 'B♭',
}

export const preferSharp = (note: string): string => {
  const normalized = normalizeNoteName(note)
  // 使用 normalized 进行匹配，避免传入 # 形式时无法命中 b 形式列表
  if (['D♭', 'E♭', 'G♭', 'A♭', 'B♭'].includes(normalized)) return normalizeNoteName(ENHARMONIC_MAP[normalized] || ENHARMONIC_MAP[note] || note)
  return normalized
}

export const preferFlat = (note: string): string => {
  const normalized = normalizeNoteName(note)
  // 使用 normalized 进行匹配（♯ 形式），避免传入 b 形式时无法命中
  if (['C♯', 'D♯', 'F♯', 'G♯', 'A♯'].includes(normalized)) return normalizeNoteName(ENHARMONIC_MAP[normalized] || ENHARMONIC_MAP[note] || note)
  return normalized
}

export const generateScaleSequence = (scale: typeof SCALE_MODES.basic[0], sequenceType: string, order: string) => {
  // 获取音阶的音级字符串数组
  let intervals: string[] = [...(scale.intervals || [])]
  
  // 如果没有 intervals，从 notes 转换
  if (intervals.length === 0) {
    const semitoneToDegree: Record<number, string> = {
      0: "1", 1: "b2", 2: "2", 3: "b3", 4: "3", 5: "4",
      6: "b5", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7"
    }
    intervals = scale.notes.map(i => semitoneToDegree[i] || String(i))
  }
  
  let startEndInterval = '1' // 默认使用1作为首尾音
  
  // 根据练习序列类型确定首尾音
  if (sequenceType === 'random') {
    const availableChordTones: string[] = []
    const thirdInterval = findFirstIntervalOfType(intervals, '3')
    if (thirdInterval) availableChordTones.push(thirdInterval)
    const fifthInterval = findFirstIntervalOfType(intervals, '5')
    if (fifthInterval) availableChordTones.push(fifthInterval)
    const seventhInterval = findFirstIntervalOfType(intervals, '7')
    if (seventhInterval) availableChordTones.push(seventhInterval)
    
    if (availableChordTones.length > 0) {
      startEndInterval = availableChordTones[Math.floor(Math.random() * availableChordTones.length)]
    } else {
      startEndInterval = '1'
    }
  } else if (sequenceType === '3to3') {
    const found = findFirstIntervalOfType(intervals, '3')
    startEndInterval = found || findNearestIntervalInScale(intervals, '3') || '1'
  } else if (sequenceType === '5to5') {
    const found = findFirstIntervalOfType(intervals, '5')
    startEndInterval = found || findNearestIntervalInScale(intervals, '5') || '1'
  } else if (sequenceType === '7to7') {
    const found = findFirstIntervalOfType(intervals, '7')
    startEndInterval = found || findNearestIntervalInScale(intervals, '7') || '1'
  }

  // 根据方向重新排列序列
  if (order === 'down') {
    const startEndIndex = intervals.indexOf(startEndInterval)
    if (startEndIndex !== -1) {
      const middleIntervals = [...intervals.slice(startEndIndex + 1), ...intervals.slice(0, startEndIndex)].reverse()
      intervals = [startEndInterval, ...middleIntervals, startEndInterval]
    } else {
      const middleIntervals = intervals.slice(1).reverse()
      intervals = [intervals[0], ...middleIntervals, intervals[0]]
    }
  } else if (order === 'up_down') {
    const startEndIndex = intervals.indexOf(startEndInterval)
    if (startEndIndex !== -1) {
      const ascendingMiddle = [...intervals.slice(startEndIndex + 1), ...intervals.slice(0, startEndIndex)]
      const descendingMiddle = [...ascendingMiddle].reverse()
      intervals = [startEndInterval, ...ascendingMiddle, startEndInterval, ...descendingMiddle, startEndInterval]
    } else {
      const ascendingMiddle = intervals.slice(1)
      const descendingMiddle = [...ascendingMiddle].reverse()
      intervals = [intervals[0], ...ascendingMiddle, intervals[0], ...descendingMiddle, intervals[0]]
    }
  } else if (order === 'random') {
    // 方向随机时，首尾音从1→1、3→3、5→5、7→7中随机选择，中间是音阶其他音的随机排列
    const availableStartEndTones: string[] = ['1'] // 1音始终可用
    const thirdInterval = findFirstIntervalOfType(intervals, '3')
    if (thirdInterval) availableStartEndTones.push(thirdInterval)
    const fifthInterval = findFirstIntervalOfType(intervals, '5')
    if (fifthInterval) availableStartEndTones.push(fifthInterval)
    const seventhInterval = findFirstIntervalOfType(intervals, '7')
    if (seventhInterval) availableStartEndTones.push(seventhInterval)
    
    // 从可用的首尾音中随机选择首尾音
    startEndInterval = availableStartEndTones[Math.floor(Math.random() * availableStartEndTones.length)]
    
    // 获取音阶中除首尾音外的其他音
    const startEndIndex = intervals.indexOf(startEndInterval)
    let otherIntervals: string[]
    if (startEndIndex !== -1) {
      otherIntervals = [...intervals.slice(0, startEndIndex), ...intervals.slice(startEndIndex + 1)]
    } else {
      otherIntervals = intervals.filter(i => i !== startEndInterval)
    }
    
    // 随机打乱中间音的顺序
    for (let i = otherIntervals.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[otherIntervals[i], otherIntervals[j]] = [otherIntervals[j], otherIntervals[i]]
    }
    
    // 构建最终序列：首尾音 + 随机排列的中间音 + 首尾音
    intervals = [startEndInterval, ...otherIntervals, startEndInterval]
  } else {
    if (sequenceType === '1to1' || sequenceType === '3to3' || sequenceType === '5to5' || sequenceType === '7to7' || sequenceType === 'random') {
      const startEndIndex = intervals.indexOf(startEndInterval)
      if (startEndIndex !== -1) {
        const middleIntervals = [...intervals.slice(startEndIndex + 1), ...intervals.slice(0, startEndIndex)]
        intervals = [startEndInterval, ...middleIntervals, startEndInterval]
      } else {
        intervals = [startEndInterval, ...intervals, startEndInterval]
      }
    } else {
      intervals = [...intervals, intervals[0]]
    }
  }
  
  return intervals
}

export const getNextKeyByMovement = (currentKey: string, movement: ScaleRootMovement): string => {
  const normalizedKey = normalizeNoteName(currentKey)
  const noteIndex = NOTES.indexOf(normalizedKey)
  if (noteIndex === -1) return normalizedKey

  const isSharpKey = SHARP_KEYS.includes(normalizedKey)
  const isFlatKey = FLAT_KEYS.includes(normalizedKey)
  const useSharps = isSharpKey || (!isFlatKey && Math.random() > 0.5)

  switch (movement) {
    case 'static':
      return normalizedKey
    case 'random':
      return NOTES[Math.floor(Math.random() * NOTES.length)]
    case 'upSemiTone': {
      const next = NOTES[(noteIndex + 1) % 12]
      return useSharps ? preferSharp(next) : preferFlat(next)
    }
    case 'downSemiTone': {
      const next = NOTES[(noteIndex - 1 + 12) % 12]
      return useSharps ? preferSharp(next) : preferFlat(next)
    }
    case 'circleOfFifths': {
      const next = NOTES[(noteIndex + 7) % 12]
      return preferSharp(next)
    }
    case 'circleOfFourths': {
      const next = NOTES[(noteIndex + 5) % 12]
      return preferFlat(next)
    }
      default:
        // 未知推进方式：返回**归一化后**的调名，与其它分支口径一致。
        // （原先返回原始入参 currentKey，未做 ♯/♭ 归一化 —— 同一个函数里两种口径。）
        // 该分支在类型上不可达，但 movement 来自持久化的 store，
        // 脏值或历史遗留值可能落到这里，故按归一化处理。
        return normalizedKey
    }
}

export const getKeyNote = (key: string): string => {
  // 提取音名部分（去掉小调标记 'm'），并标准化为 ♯/♭
  const rawNotePart = key.endsWith('m') ? key.slice(0, -1) : key
  const notePart = normalizeNoteName(rawNotePart)

  // 处理降号调性 (如 D♭ -> C♯, B♭ -> A♯)
  if (notePart.includes('♭')) {
    const flatIndex = findNoteIndexInArray(notePart, NOTES_FLAT)
    if (flatIndex !== -1) {
      return NOTES[flatIndex]
    }
  }

  return notePart
}
