export type RootNote = 
  | 'C' | 'C#' | 'Db' | 'D' | 'D#' | 'Eb' | 'E' | 'F' | 'F#' | 'Gb' 
  | 'G' | 'G#' | 'Ab' | 'A' | 'A#' | 'Bb' | 'B'

export type ChordType = 
  | 'Major' | 'Minor' | 'Dim' | 'Aug' | '6' | 'm6' | '7' | 'Maj7' 
  | 'm7' | 'm7b5' | 'dim7' | 'mMaj7' | 'aug7' | '7b5' | '7#5' | 'maj7#5'
  | '9' | 'Maj9' | 'm9' | 'm9b5' | '7#9' | '7b9' | '9#11' | '11' | 'm11'
  | '13' | '13b9' | '13#11' | 'sus2' | 'sus4' | '7sus4' | '9sus4'
  | 'add9' | 'madd9' | '6add9' | 'm6add9'

export type KeyType = 
  | 'CMajor' | 'GMajor' | 'DMajor' | 'AMajor' | 'EMajor' | 'BMajor' | 'F#Major' | 'C#Major'
  | 'FMajor' | 'BbMajor' | 'EbMajor' | 'AbMajor' | 'DbMajor' | 'GbMajor' | 'CbMajor'
  | 'AMinor' | 'EMinor' | 'BMinor' | 'F#Minor' | 'C#Minor' | 'G#Minor' | 'D#Minor' | 'A#Minor'
  | 'DMinor' | 'GMinor' | 'CMinor' | 'FMinor' | 'BbMinor' | 'EbMinor' | 'AbMinor'

export interface ChordViewModel {
  id: string
  rootNote: RootNote
  chordType: ChordType
  bass?: RootNote
  beats: number
  function?: string
}

export interface CustomSong {
  id: string
  name: string
  composer: string
  beatsPerMeasure: number
  beatSize: number
  tempo: number
  key: string
  chords: ChordViewModel[]
  createdAt: number
  updatedAt: number
}

export interface CustomSongPreset {
  id: string
  name: string
  nameZh: string
  chords: Array<{
    rootNote: RootNote
    chordType: ChordType
    bass?: RootNote
    beats: number
    function?: string
  }>
  key: string
}

export const CHORD_TYPES: Array<{ id: ChordType; name: string; nameZh: string; category: string }> = [
  { id: 'Major', name: 'Major', nameZh: '大三', category: 'triads' },
  { id: 'Minor', name: 'Minor', nameZh: '小三', category: 'triads' },
  { id: 'Dim', name: 'Dim', nameZh: '减三', category: 'triads' },
  { id: 'Aug', name: 'Aug', nameZh: '增三', category: 'triads' },
  { id: '6', name: '6', nameZh: '大六', category: 'sixth' },
  { id: 'm6', name: 'm6', nameZh: '小六', category: 'sixth' },
  { id: '7', name: '7', nameZh: '属七', category: 'seventh' },
  { id: 'Maj7', name: 'Maj7', nameZh: '大七', category: 'seventh' },
  { id: 'm7', name: 'm7', nameZh: '小七', category: 'seventh' },
  { id: 'm7b5', name: 'm7b5', nameZh: '半减七', category: 'seventh' },
  { id: 'dim7', name: 'dim7', nameZh: '减七', category: 'seventh' },
  { id: 'mMaj7', name: 'mMaj7', nameZh: '小大七', category: 'seventh' },
  { id: 'aug7', name: 'aug7', nameZh: '增七', category: 'seventh' },
  { id: '7b5', name: '7b5', nameZh: '属七降五', category: 'seventh' },
  { id: '7#5', name: '7#5', nameZh: '属七升五', category: 'seventh' },
  { id: 'maj7#5', name: 'maj7#5', nameZh: '大七升五', category: 'seventh' },
  { id: '9', name: '9', nameZh: '属九', category: 'ninth' },
  { id: 'Maj9', name: 'Maj9', nameZh: '大九', category: 'ninth' },
  { id: 'm9', name: 'm9', nameZh: '小九', category: 'ninth' },
  { id: 'm9b5', name: 'm9b5', nameZh: '小九降五', category: 'ninth' },
  { id: '7#9', name: '7#9', nameZh: '属七升九', category: 'ninth' },
  { id: '7b9', name: '7b9', nameZh: '属七降九', category: 'ninth' },
  { id: '9#11', name: '9#11', nameZh: '属九升十一', category: 'ninth' },
  { id: '11', name: '11', nameZh: '属十一', category: 'eleventh' },
  { id: 'm11', name: 'm11', nameZh: '小十一', category: 'eleventh' },
  { id: '13', name: '13', nameZh: '属十三', category: 'thirteenth' },
  { id: '13b9', name: '13b9', nameZh: '属十三降九', category: 'thirteenth' },
  { id: '13#11', name: '13#11', nameZh: '属十三升十一', category: 'thirteenth' },
  { id: 'sus2', name: 'sus2', nameZh: '挂二', category: 'suspended' },
  { id: 'sus4', name: 'sus4', nameZh: '挂四', category: 'suspended' },
  { id: '7sus4', name: '7sus4', nameZh: '属七挂四', category: 'suspended' },
  { id: '9sus4', name: '9sus4', nameZh: '属九挂四', category: 'suspended' },
  { id: 'add9', name: 'add9', nameZh: '加九', category: 'added' },
  { id: 'madd9', name: 'madd9', nameZh: '小加九', category: 'added' },
  { id: '6add9', name: '6/9', nameZh: '大六加九', category: 'added' },
  { id: 'm6add9', name: 'm6/9', nameZh: '小六加九', category: 'added' },
]

export const ROOT_NOTES: Array<{ id: RootNote; name: string; isSharp: boolean; isFlat: boolean }> = [
  { id: 'C', name: 'C', isSharp: false, isFlat: false },
  { id: 'C#', name: 'C#', isSharp: true, isFlat: false },
  { id: 'Db', name: 'Db', isSharp: false, isFlat: true },
  { id: 'D', name: 'D', isSharp: false, isFlat: false },
  { id: 'D#', name: 'D#', isSharp: true, isFlat: false },
  { id: 'Eb', name: 'Eb', isSharp: false, isFlat: true },
  { id: 'E', name: 'E', isSharp: false, isFlat: false },
  { id: 'F', name: 'F', isSharp: false, isFlat: false },
  { id: 'F#', name: 'F#', isSharp: true, isFlat: false },
  { id: 'Gb', name: 'Gb', isSharp: false, isFlat: true },
  { id: 'G', name: 'G', isSharp: false, isFlat: false },
  { id: 'G#', name: 'G#', isSharp: true, isFlat: false },
  { id: 'Ab', name: 'Ab', isSharp: false, isFlat: true },
  { id: 'A', name: 'A', isSharp: false, isFlat: false },
  { id: 'A#', name: 'A#', isSharp: true, isFlat: false },
  { id: 'Bb', name: 'Bb', isSharp: false, isFlat: true },
  { id: 'B', name: 'B', isSharp: false, isFlat: false },
]

export const KEYS: Array<{ id: KeyType; name: string; nameZh: string; isMajor: boolean }> = [
  { id: 'CMajor', name: 'C Major', nameZh: 'C大调', isMajor: true },
  { id: 'GMajor', name: 'G Major', nameZh: 'G大调', isMajor: true },
  { id: 'DMajor', name: 'D Major', nameZh: 'D大调', isMajor: true },
  { id: 'AMajor', name: 'A Major', nameZh: 'A大调', isMajor: true },
  { id: 'EMajor', name: 'E Major', nameZh: 'E大调', isMajor: true },
  { id: 'BMajor', name: 'B Major', nameZh: 'B大调', isMajor: true },
  { id: 'F#Major', name: 'F# Major', nameZh: 'F#大调', isMajor: true },
  { id: 'C#Major', name: 'C# Major', nameZh: 'C#大调', isMajor: true },
  { id: 'FMajor', name: 'F Major', nameZh: 'F大调', isMajor: true },
  { id: 'BbMajor', name: 'Bb Major', nameZh: 'Bb大调', isMajor: true },
  { id: 'EbMajor', name: 'Eb Major', nameZh: 'Eb大调', isMajor: true },
  { id: 'AbMajor', name: 'Ab Major', nameZh: 'Ab大调', isMajor: true },
  { id: 'DbMajor', name: 'Db Major', nameZh: 'Db大调', isMajor: true },
  { id: 'GbMajor', name: 'Gb Major', nameZh: 'Gb大调', isMajor: true },
  { id: 'CbMajor', name: 'Cb Major', nameZh: 'Cb大调', isMajor: true },
  { id: 'AMinor', name: 'A Minor', nameZh: 'A小调', isMajor: false },
  { id: 'EMinor', name: 'E Minor', nameZh: 'E小调', isMajor: false },
  { id: 'BMinor', name: 'B Minor', nameZh: 'B小调', isMajor: false },
  { id: 'F#Minor', name: 'F# Minor', nameZh: 'F#小调', isMajor: false },
  { id: 'C#Minor', name: 'C# Minor', nameZh: 'C#小调', isMajor: false },
  { id: 'G#Minor', name: 'G# Minor', nameZh: 'G#小调', isMajor: false },
  { id: 'D#Minor', name: 'D# Minor', nameZh: 'D#小调', isMajor: false },
  { id: 'A#Minor', name: 'A# Minor', nameZh: 'A#小调', isMajor: false },
  { id: 'DMinor', name: 'D Minor', nameZh: 'D小调', isMajor: false },
  { id: 'GMinor', name: 'G Minor', nameZh: 'G小调', isMajor: false },
  { id: 'CMinor', name: 'C Minor', nameZh: 'C小调', isMajor: false },
  { id: 'FMinor', name: 'F Minor', nameZh: 'F小调', isMajor: false },
  { id: 'BbMinor', name: 'Bb Minor', nameZh: 'Bb小调', isMajor: false },
  { id: 'EbMinor', name: 'Eb Minor', nameZh: 'Eb小调', isMajor: false },
  { id: 'AbMinor', name: 'Ab Minor', nameZh: 'Ab小调', isMajor: false },
]

export const CHORD_FUNCTIONS = [
  { id: 'I', name: 'I', nameZh: 'I' },
  { id: 'ii', name: 'ii', nameZh: 'ii' },
  { id: 'iii', name: 'iii', nameZh: 'iii' },
  { id: 'IV', name: 'IV', nameZh: 'IV' },
  { id: 'V', name: 'V', nameZh: 'V' },
  { id: 'vi', name: 'vi', nameZh: 'vi' },
  { id: 'vii', name: 'vii°', nameZh: 'vii°' },
  { id: 'II', name: 'II', nameZh: 'II' },
  { id: 'III', name: 'III', nameZh: 'III' },
  { id: 'VI', name: 'VI', nameZh: 'VI' },
  { id: 'VII', name: 'VII', nameZh: 'VII' },
]

export const COMMON_PROGRESSIONS: CustomSongPreset[] = [
  {
    id: 'ii-v-i-major',
    name: 'ii-V-I (Major)',
    nameZh: 'ii-V-I (大调)',
    key: 'CMajor',
    chords: [
      { rootNote: 'D', chordType: 'm7', beats: 4, function: 'ii' },
      { rootNote: 'G', chordType: '7', beats: 4, function: 'V' },
      { rootNote: 'C', chordType: 'Maj7', beats: 4, function: 'I' },
    ],
  },
  {
    id: 'ii-v-i-minor',
    name: 'ii-V-I (Minor)',
    nameZh: 'ii-V-I (小调)',
    key: 'CMinor',
    chords: [
      { rootNote: 'D', chordType: 'm7b5', beats: 4, function: 'ii' },
      { rootNote: 'G', chordType: '7', beats: 4, function: 'V' },
      { rootNote: 'C', chordType: 'm7', beats: 4, function: 'i' },
    ],
  },
  {
    id: 'i-vi-ii-v',
    name: 'I-vi-ii-V',
    nameZh: 'I-vi-ii-V',
    key: 'CMajor',
    chords: [
      { rootNote: 'C', chordType: 'Maj7', beats: 4, function: 'I' },
      { rootNote: 'A', chordType: 'm7', beats: 4, function: 'vi' },
      { rootNote: 'D', chordType: 'm7', beats: 4, function: 'ii' },
      { rootNote: 'G', chordType: '7', beats: 4, function: 'V' },
    ],
  },
  {
    id: 'i-iv-v-blues',
    name: 'I-IV-V (Blues)',
    nameZh: 'I-IV-V (布鲁斯)',
    key: 'CMajor',
    chords: [
      { rootNote: 'C', chordType: '7', beats: 4, function: 'I' },
      { rootNote: 'F', chordType: '7', beats: 4, function: 'IV' },
      { rootNote: 'C', chordType: '7', beats: 4, function: 'I' },
      { rootNote: 'G', chordType: '7', beats: 4, function: 'V' },
      { rootNote: 'F', chordType: '7', beats: 4, function: 'IV' },
      { rootNote: 'C', chordType: '7', beats: 4, function: 'I' },
    ],
  },
  {
    id: 'rhythm-changes',
    name: 'Rhythm Changes A',
    nameZh: 'Rhythm Changes A段',
    key: 'BbMajor',
    chords: [
      { rootNote: 'Bb', chordType: 'Maj7', beats: 4, function: 'I' },
      { rootNote: 'G', chordType: '7', beats: 4, function: 'VI' },
      { rootNote: 'C', chordType: 'm7', beats: 4, function: 'ii' },
      { rootNote: 'C', chordType: 'm7', beats: 4, function: 'ii' },
      { rootNote: 'C', chordType: 'm7', beats: 4, function: 'ii' },
      { rootNote: 'F', chordType: '7', beats: 4, function: 'V' },
      { rootNote: 'Bb', chordType: 'Maj7', beats: 4, function: 'I' },
      { rootNote: 'Bb', chordType: 'Maj7', beats: 4, function: 'I' },
    ],
  },
  {
    id: 'circle-of-fifths',
    name: 'Circle of Fifths',
    nameZh: '五度圈',
    key: 'CMajor',
    chords: [
      { rootNote: 'C', chordType: 'Maj7', beats: 4, function: 'I' },
      { rootNote: 'F', chordType: 'Maj7', beats: 4, function: 'IV' },
      { rootNote: 'Bb', chordType: 'Maj7', beats: 4, function: 'VII' },
      { rootNote: 'Eb', chordType: 'Maj7', beats: 4, function: 'III' },
      { rootNote: 'Ab', chordType: 'Maj7', beats: 4, function: 'VI' },
      { rootNote: 'Db', chordType: 'Maj7', beats: 4, function: 'II' },
      { rootNote: 'Gb', chordType: 'Maj7', beats: 4, function: 'V' },
      { rootNote: 'B', chordType: 'Maj7', beats: 4, function: 'VII' },
      { rootNote: 'E', chordType: 'Maj7', beats: 4, function: 'III' },
      { rootNote: 'A', chordType: 'Maj7', beats: 4, function: 'VI' },
      { rootNote: 'D', chordType: 'Maj7', beats: 4, function: 'II' },
      { rootNote: 'G', chordType: 'Maj7', beats: 4, function: 'V' },
    ],
  },
]

export function createEmptySong(): CustomSong {
  return {
    id: `song_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: '',
    composer: '',
    beatsPerMeasure: 4,
    beatSize: 4,
    tempo: 120,
    key: 'CMajor',
    chords: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function createChord(): ChordViewModel {
  return {
    id: `chord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    rootNote: 'C',
    chordType: 'Major',
    beats: 4,
  }
}

export function chordToSymbol(chord: ChordViewModel, displayMode: 'chinese' | 'english' = 'english'): string {
  const root = chord.rootNote
  const typeInfo = CHORD_TYPES.find(t => t.id === chord.chordType)
  const typeName = displayMode === 'chinese' ? typeInfo?.nameZh : typeInfo?.name
  const bass = chord.bass ? `/${chord.bass}` : ''
  
  if (chord.chordType === 'Major') {
    return `${root}${bass}`
  }
  
  return `${root}${typeName}${bass}`
}

export function parseChordSymbol(symbol: string): ChordViewModel | null {
  const match = symbol.trim().match(/^([A-G][#b]?)(.*)$/)
  if (!match) return null

  const root = match[1] as RootNote
  const rest = match[2]

  const make = (chordType: ChordType, bass?: string): ChordViewModel => ({
    id: `chord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    rootNote: root,
    chordType,
    bass: bass as RootNote | undefined,
    beats: 4,
  })

  // 1) 无类型后缀 → 大三和弦
  if (!rest) return make('Major')

  // 2) 只有 slash bass（如 "C/E"）
  const bassOnly = rest.match(/^\/\s*([A-G][#b]?)$/)
  if (bassOnly) return make('Major', bassOnly[1])

  // 3) 类型名本身可能含 '/'（CHORD_TYPES 里 6add9 的英文名就是 '6/9'）——
  //    必须按「最长前缀」先匹配已知类型，再解析剩余 '/bass'。
  //    否则 'C6/9' 会被当成 root=C + bass=9（9 不是音名）而整个解析失败，
  //    使「导出简单格式 → 粘贴导入」时这类和弦静默丢失。
  const byAliasLength = [...CHORD_TYPES].sort((a, b) =>
    Math.max(b.name.length, b.nameZh.length, b.id.length) -
    Math.max(a.name.length, a.nameZh.length, a.id.length))
  for (const t of byAliasLength) {
    for (const alias of [t.name, t.nameZh, t.id]) {
      if (!alias || !rest.toLowerCase().startsWith(alias.toLowerCase())) continue
      const tail = rest.slice(alias.length)
      if (!tail) return make(t.id)
      const bm = tail.match(/^\/\s*([A-G][#b]?)$/)
      if (bm) return make(t.id, bm[1])
    }
  }

  // 4) 兜底：与旧实现一致（未识别的类型名降级为 Major），保持向后兼容
  const legacy = rest.match(/^([^/]*)(?:\/\s*([A-G][#b]?))?$/)
  if (legacy) {
    const typeStr = legacy[1]
    const found = CHORD_TYPES.find(t =>
      t.name.toLowerCase() === typeStr.toLowerCase() ||
      t.nameZh === typeStr ||
      t.id.toLowerCase() === typeStr.toLowerCase())
    return make(found ? found.id : 'Major', legacy[2])
  }

  return null
}

export function validateSong(song: CustomSong): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!song.name.trim()) {
    errors.push('歌曲名称不能为空')
  }
  
  if (song.chords.length === 0) {
    errors.push('至少需要一个和弦')
  }
  
  if (song.tempo < 40 || song.tempo > 300) {
    errors.push('速度应在40-300 BPM之间')
  }
  
  if (song.beatsPerMeasure < 1 || song.beatsPerMeasure > 16) {
    errors.push('每小节拍数应在1-16之间')
  }
  
  return {
    valid: errors.length === 0,
    errors,
  }
}

export function exportSongToJSON(song: CustomSong): string {
  return JSON.stringify(song, null, 2)
}

export function importSongFromJSON(json: string): CustomSong | null {
  try {
    const data = JSON.parse(json)
    if (!data.name || !Array.isArray(data.chords)) {
      return null
    }
    return {
      ...createEmptySong(),
      ...data,
      id: `song_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  } catch (e) {
    console.error('Failed to import song from JSON:', e)
    return null
  }
}

export function exportSongToSimpleFormat(song: CustomSong): string {
  const chordSymbols = song.chords.map(c => {
    const symbol = chordToSymbol(c)
    return `${symbol}:${c.beats}`
  })
  return `${song.name}|${song.key}|${chordSymbols.join(',')}`
}

export function importSongFromSimpleFormat(text: string): CustomSong | null {
  try {
    const parts = text.split('|')
    if (parts.length < 3) return null
    
    const [name, key, chordsStr] = parts
    const chords = chordsStr.split(',').map(chordDef => {
      const [symbol, beatsStr] = chordDef.split(':')
      const chord = parseChordSymbol(symbol.trim())
      if (chord) {
        chord.beats = parseInt(beatsStr) || 4
      }
      return chord
    }).filter(Boolean) as ChordViewModel[]
    
    if (chords.length === 0) return null
    
    return {
      ...createEmptySong(),
      name,
      key: key || 'CMajor',
      chords,
    }
  } catch {
    return null
  }
}

export function duplicateSong(song: CustomSong, newName?: string): CustomSong {
  return {
    ...song,
    id: `song_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: newName || `${song.name} (副本)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function transposeSong(song: CustomSong, semitones: number): CustomSong {
  const notes: RootNote[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const flatNotes: RootNote[] = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
  
  const transposeNote = (note: RootNote): RootNote => {
    const isFlat = note.includes('b') && !note.includes('#')
    const noteList = isFlat ? flatNotes : notes
    const index = noteList.indexOf(note)
    if (index === -1) return note
    // ⚠️ 必须把取模结果再规正到 0..11：JS 的 % 对负数返回负值，原来
    // `(index + semitones + 12) % 12` 在 semitones <= -13 时会得到负下标，
    // noteList[负数] === undefined，于是 rootNote / bass 变成 undefined
    // （UI 的「重置移调」会传 -transposeValue，点十余次加号后就会触发）。
    const newIndex = ((index + semitones) % 12 + 12) % 12
    return noteList[newIndex]
  }
  
  return {
    ...song,
    chords: song.chords.map(chord => ({
      ...chord,
      rootNote: transposeNote(chord.rootNote),
      bass: chord.bass ? transposeNote(chord.bass) : undefined,
    })),
    updatedAt: Date.now(),
  }
}
