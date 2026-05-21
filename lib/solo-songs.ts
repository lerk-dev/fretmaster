// SOLO歌曲数据结构定义
// 与SOLO原版songs.json完全匹配

import { logger } from './logger'

// SOLO原版和弦结构
export interface SoloChord {
  beats: number
  function: string
  rootNote: string
  chordType: string
}

// SOLO原版歌曲结构
export interface SoloSongRaw {
  id: number
  name: string
  composer: string
  beatsPerMeasure: number
  beatSize: number
  tempo: number
  key: string
  chords: SoloChord[]
}

// SOLO原版数据结构
export interface SoloSongsData {
  songs: SoloSongRaw[]
}

// FretMaster使用的简化歌曲结构
export interface Song {
  id: number
  name: string
  composer: string
  beatsPerMeasure: number
  beatSize: number
  tempo: number
  key: string
  chords: string[]
  chordsDetailed: SoloChord[]
}

// rootNote映射：SOLO格式 -> 标准格式
const ROOT_NOTE_MAP: Record<string, string> = {
  'c': 'C',
  'cSharp': 'C#',
  'd': 'D',
  'eFlat': 'Eb',
  'e': 'E',
  'f': 'F',
  'fSharp': 'F#',
  'g': 'G',
  'aFlat': 'Ab',
  'a': 'A',
  'bFlat': 'Bb',
  'b': 'B',
  'dFlat': 'Db',
  'gFlat': 'Gb',
  'aSharp': 'A#',
  'dSharp': 'D#',
  'gSharp': 'G#',
  'cFlat': 'Cb',
  'fFlat': 'Fb',
  'eSharp': 'E#',
  'bSharp': 'B#',
}

// chordType映射：SOLO格式 -> 标准符号
const CHORD_TYPE_MAP: Record<string, string> = {
  'major': '',
  'majorSeven': 'Maj7',
  'majorNine': 'Maj9',
  'majorEleven': 'Maj11',
  'majorThirteen': 'Maj13',
  'majorSix': '6',
  'majorSixNine': '6/9',
  'minor': 'm',
  'minorSeven': 'm7',
  'minorNine': 'm9',
  'minorEleven': 'm11',
  'minorThirteen': 'm13',
  'minorSix': 'm6',
  'minorMajorSeven': 'mMaj7',
  'minorSevenFlatFive': 'm7b5',
  'minorNineFlatFive': 'm9b5',
  'dominantSeven': '7',
  'dominantNine': '9',
  'dominantEleven': '11',
  'dominantThirteen': '13',
  'dominantSevenFlatFive': '7b5',
  'dominantSevenSharpFive': '7#5',
  'dominantSevenFlatNine': '7b9',
  'dominantSevenSharpNine': '7#9',
  'dominantSevenSharpEleven': '7#11',
  'dominantSevenFlatThirteen': '7b13',
  'dominantSevenFlatNineFlatThirteen': '7b9b13',
  'dominantSevenSharpFiveFlatNine': '7#5b9',
  'dominantSevenSharpFiveSharpNine': '7#5#9',
  'dominantThirteenFlatNine': '13b9',
  'dominantThirteenSharpEleven': '13#11',
  'dominantSevenAlt': '7alt',
  'diminished': 'dim',
  'diminishedSeven': 'dim7',
  'augmented': 'aug',
  'augmentedSeven': 'aug7',
  'augmentedMajorSeven': 'augMaj7',
  'suspendedTwo': 'sus2',
  'suspendedFour': 'sus4',
  'dominantSevenSuspendedFour': '7sus4',
  'dominantNineSuspendedFour': '9sus4',
  'dominantElevenSuspendedFour': '11sus4',
  'addNine': 'add9',
  'minorAddNine': 'madd9',
  'majorSevenSharpFive': 'Maj7#5',
  'halfDiminished': 'm7b5',
}

// key映射：SOLO格式 -> 标准格式
const KEY_MAP: Record<string, string> = {
  'cMajor': 'C',
  'gMajor': 'G',
  'dMajor': 'D',
  'aMajor': 'A',
  'eMajor': 'E',
  'bMajor': 'B',
  'fSharpMajor': 'F#',
  'cSharpMajor': 'C#',
  'fMajor': 'F',
  'bFlatMajor': 'Bb',
  'eFlatMajor': 'Eb',
  'aFlatMajor': 'Ab',
  'dFlatMajor': 'Db',
  'gFlatMajor': 'Gb',
  'cFlatMajor': 'Cb',
  'aMinor': 'Am',
  'eMinor': 'Em',
  'bMinor': 'Bm',
  'fSharpMinor': 'F#m',
  'cSharpMinor': 'C#m',
  'gSharpMinor': 'G#m',
  'dSharpMinor': 'D#m',
  'dMinor': 'Dm',
  'gMinor': 'Gm',
  'cMinor': 'Cm',
  'fMinor': 'Fm',
  'bFlatMinor': 'Bbm',
  'eFlatMinor': 'Ebm',
  'aFlatMinor': 'Abm',
}

// 将SOLO的rootNote转换为标准格式
export function convertRootNote(rootNote: string): string {
  return ROOT_NOTE_MAP[rootNote] || rootNote.toUpperCase()
}

// 将SOLO的chordType转换为标准符号
export function convertChordType(chordType: string): string {
  return CHORD_TYPE_MAP[chordType] || chordType
}

// 将SOLO的key转换为标准格式
export function convertKey(key: string): string {
  return KEY_MAP[key] || key
}

// 将SOLO和弦转换为和弦符号
export function chordToSymbol(chord: SoloChord): string {
  const root = convertRootNote(chord.rootNote)
  const type = convertChordType(chord.chordType)
  return root + type
}

// 将SOLO歌曲转换为FretMaster格式
export function convertSoloSong(song: SoloSongRaw): Song {
  return {
    id: song.id,
    name: song.name,
    composer: song.composer,
    beatsPerMeasure: song.beatsPerMeasure,
    beatSize: song.beatSize,
    tempo: song.tempo,
    key: convertKey(song.key),
    chords: song.chords.map(chordToSymbol),
    chordsDetailed: song.chords.map(chord => ({
      ...chord,
      rootNote: convertRootNote(chord.rootNote),
    })),
  }
}

// 加载SOLO歌曲数据
let cachedSongs: Song[] | null = null

export async function loadSoloSongs(): Promise<Song[]> {
  if (cachedSongs) {
    return cachedSongs
  }
  
  try {
    const response = await fetch('/data/songs.json')
    const data: SoloSongsData = await response.json()
    cachedSongs = data.songs.map(convertSoloSong)
    return cachedSongs
  } catch (error) {
    logger.error('Failed to load songs:', error)
    return []
  }
}

// 同步获取已加载的歌曲（用于已加载后的场景）
export function getSoloSongs(): Song[] {
  return cachedSongs || []
}

// 预加载歌曲数据
export function preloadSoloSongs(): void {
  loadSoloSongs().catch((e) => logger.error('Failed to preload songs:', e))
}

// 默认导出空数组，实际使用时通过loadSoloSongs加载
export const SOLO_SONGS: Song[] = []
