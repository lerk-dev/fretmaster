// 音乐理论工具函数
// 从 page.tsx 提取的核心音乐计算逻辑

// 音符名称数组
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
export const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

// 吉他标准调弦 (从高音弦到低音弦)
export const STANDARD_TUNING = ['E', 'B', 'G', 'D', 'A', 'E'] as const

// 音级到半音映射
export const INTERVAL_TO_SEMITONES: Record<string, number> = {
  '1': 0, 'b2': 1, '2': 2, 'b3': 3, '3': 4, '4': 5, '#4': 6, 'b5': 6, '5': 7, '#5': 8,
  'b6': 8, '6': 9, 'bb7': 9, 'b7': 10, '7': 11, 'b9': 13, '9': 14, '#9': 15,
  '11': 17, '#11': 18, 'b13': 20, '13': 21
}

// 获取音符索引 (0-11)
export function getNoteIndex(note: string): number {
  if (!note) return -1
  
  // 处理标准音符名
  const normalizedNote = note.replace('♯', '#').replace('♭', 'b')
  
  // 直接匹配
  const sharpIndex = NOTE_NAMES.indexOf(normalizedNote as any)
  if (sharpIndex !== -1) return sharpIndex
  
  const flatIndex = NOTE_NAMES_FLAT.indexOf(normalizedNote as any)
  if (flatIndex !== -1) return flatIndex
  
  // 尝试解析带八度的音符 (如 "C4", "C#4")
  const noteOnly = normalizedNote.replace(/[0-9]/g, '')
  const sharpIdx = NOTE_NAMES.indexOf(noteOnly as any)
  if (sharpIdx !== -1) return sharpIdx
  
  const flatIdx = NOTE_NAMES_FLAT.indexOf(noteOnly as any)
  if (flatIdx !== -1) return flatIdx
  
  return -1
}

// 频率转音符名
export function frequencyToNoteName(frequency: number): string | null {
  if (!frequency || frequency <= 0) return null
  
  // A4 = 440Hz, A4 的 MIDI 编号为 69
  const midiNote = 12 * Math.log2(frequency / 440) + 69
  const noteIndex = Math.round(midiNote) % 12
  const octave = Math.floor(Math.round(midiNote) / 12) - 1
  
  return NOTE_NAMES[noteIndex]
}

// 音符名转频率
export function noteNameToFrequency(noteName: string, octave: number = 4): number {
  const noteIndex = getNoteIndex(noteName)
  if (noteIndex === -1) return 0
  
  // A4 = 440Hz, A 的索引是 9
  const semitonesFromA4 = (octave - 4) * 12 + (noteIndex - 9)
  return 440 * Math.pow(2, semitonesFromA4 / 12)
}

// 获取指板上指定位置的音符
export function getNoteAtPosition(stringIndex: number, fret: number, tuning: readonly string[] = STANDARD_TUNING): string {
  if (stringIndex < 0 || stringIndex >= tuning.length) return ''
  
  const openNote = tuning[stringIndex]
  const openNoteIndex = getNoteIndex(openNote)
  if (openNoteIndex === -1) return ''
  
  const noteIndex = (openNoteIndex + fret) % 12
  return NOTE_NAMES[noteIndex]
}

// 计算两个音符之间的音程 (半音数)
export function getInterval(note1: string, note2: string): number {
  const idx1 = getNoteIndex(note1)
  const idx2 = getNoteIndex(note2)
  
  if (idx1 === -1 || idx2 === -1) return -1
  
  return (idx2 - idx1 + 12) % 12
}

// 音级转半音数
export function degreeToSemitone(degree: string): number | undefined {
  return INTERVAL_TO_SEMITONES[degree]
}

// 根据音级和根音生成正确的音名
export function getScaleNoteNames(rootNote: string, intervals: string[]): string[] {
  const rootIdx = getNoteIndex(rootNote)
  if (rootIdx === -1) return []
  
  const rootBaseName = rootNote.charAt(0)
  const baseNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
  const rootBaseIdx = baseNotes.indexOf(rootBaseName)
  
  if (rootBaseIdx === -1) return []
  
  return intervals.map(interval => {
    const match = interval.match(/^(b|#)?(\d+)$/)
    if (!match) return ''
    
    const degree = parseInt(match[2])
    
    const degreeToBaseIdx: Record<number, number> = {
      1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6,
      8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5
    }
    
    const baseNoteIdx = (rootBaseIdx + (degreeToBaseIdx[degree % 7 || 7] || 0)) % 7
    const baseNoteName = baseNotes[baseNoteIdx]
    
    const semitoneOffset = degreeToSemitone(interval)
    if (semitoneOffset === undefined) return ''
    
    const targetSemitone = (rootIdx + semitoneOffset) % 12
    
    const naturalSemitones: Record<string, number> = {
      'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
    }
    const naturalSemitone = naturalSemitones[baseNoteName]
    
    let diff = (targetSemitone - naturalSemitone + 12) % 12
    if (diff > 6) diff -= 12
    
    let accidentalStr = ''
    if (diff === 1) accidentalStr = '#'
    else if (diff === 2) accidentalStr = '##'
    else if (diff === -1) accidentalStr = 'b'
    else if (diff === -2) accidentalStr = 'bb'
    else if (diff > 2) {
      diff = diff - 12
      if (diff === -1) accidentalStr = 'b'
      else if (diff === -2) accidentalStr = 'bb'
    }
    
    return baseNoteName + accidentalStr
  })
}

// 计算音分差
export function calculateCentsDiff(frequency: number, targetFrequency: number): number {
  if (frequency <= 0 || targetFrequency <= 0) return 0
  return 1200 * Math.log2(frequency / targetFrequency)
}

// 标准化音分差到 -600 到 +600 范围
export function normalizeCents(cents: number): number {
  const centsMod = Math.abs(cents) % 1200
  return centsMod > 600 ? 1200 - centsMod : centsMod
}

// 判断是否在匹配阈值内
export function isWithinCentsThreshold(cents: number, threshold: number): boolean {
  const normalizedCents = normalizeCents(cents)
  return normalizedCents <= threshold
}
