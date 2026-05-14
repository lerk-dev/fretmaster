import { describe, it, expect, beforeEach } from 'vitest'
import {
  Note,
  NoteFlat,
  noteFromString,
  getNoteName,
  parseChord,
  getChordNotes,
  formatChord,
  ChordType,
  ChordTokenizer,
  ChordParser,
  areEnharmonicEquivalent,
  normalizeNoteName,
  getNoteNameWithEnharmonicPreference,
  getEnharmonicGroup,
  ENHARMONIC_GROUPS,
  clearChordTheoryCache,
  getChordTypeDisplayString,
  getChordTypeUnicodeDisplayString,
  chordTypeToTokens,
} from '../lib/chord-theory'

describe('和弦理论系统', () => {
  beforeEach(() => {
    clearChordTheoryCache()
  })

  describe('音符解析', () => {
    it('应该正确解析基本音符', () => {
      expect(noteFromString('C')).toBe(0)
      expect(noteFromString('D')).toBe(2)
      expect(noteFromString('E')).toBe(4)
      expect(noteFromString('F')).toBe(5)
      expect(noteFromString('G')).toBe(7)
      expect(noteFromString('A')).toBe(9)
      expect(noteFromString('B')).toBe(11)
    })

    it('应该正确解析升号音符', () => {
      expect(noteFromString('C#')).toBe(1)
      expect(noteFromString('F#')).toBe(6)
      expect(noteFromString('G#')).toBe(8)
    })

    it('应该正确解析降号音符', () => {
      expect(noteFromString('Db')).toBe(1)
      expect(noteFromString('Gb')).toBe(6)
      expect(noteFromString('Ab')).toBe(8)
    })

    it('应该正确解析 Unicode 变音符号', () => {
      expect(noteFromString('C♯')).toBe(1)
      expect(noteFromString('D♭')).toBe(1)
      expect(noteFromString('F♯')).toBe(6)
      expect(noteFromString('G♭')).toBe(6)
    })

    it('应该对无效输入返回 null', () => {
      expect(noteFromString('')).toBeNull()
      expect(noteFromString('H')).toBeNull()
      expect(noteFromString('X#')).toBeNull()
    })
  })

  describe('音符名称获取', () => {
    it('应该正确返回默认音符名称', () => {
      expect(getNoteName(0)).toBe('C')
      expect(getNoteName(1)).toBe('C#')
      expect(getNoteName(3)).toBe('D#')
    })

    it('应该正确返回降号偏好名称', () => {
      expect(getNoteName(1, true)).toBe('Db')
      expect(getNoteName(3, true)).toBe('Eb')
      expect(getNoteName(6, true)).toBe('Gb')
    })

    it('应该正确返回 Unicode 名称', () => {
      expect(getNoteName(1, false, true)).toBe('C♯')
      expect(getNoteName(1, true, true)).toBe('D♭')
    })
  })

  describe('等音处理', () => {
    it('应该正确识别等音等价', () => {
      expect(areEnharmonicEquivalent(1, 1)).toBe(true)
      expect(areEnharmonicEquivalent(1, 13)).toBe(true)
      expect(areEnharmonicEquivalent(0, 12)).toBe(true)
      expect(areEnharmonicEquivalent(1, 2)).toBe(false)
    })

    it('应该正确处理负值等音', () => {
      expect(areEnharmonicEquivalent(-1, 11)).toBe(true)
      expect(areEnharmonicEquivalent(-12, 0)).toBe(true)
    })

    it('应该正确规范化音符名称', () => {
      expect(normalizeNoteName('Db')).toBe('Db')
      expect(normalizeNoteName('C#')).toBe('C#')
      expect(normalizeNoteName('c#')).toBe('C#')
    })

    it('应该正确根据上下文返回音符名称', () => {
      expect(getNoteNameWithEnharmonicPreference(1, null, true)).toBe('C#')
      expect(getNoteNameWithEnharmonicPreference(1, null, false)).toBe('Db')
    })

    it('应该根据调性上下文选择正确的等音', () => {
      const fKey = noteFromString('F')!
      expect(getNoteNameWithEnharmonicPreference(1, fKey, true)).toBe('Db')

      const gKey = noteFromString('G')!
      expect(getNoteNameWithEnharmonicPreference(1, gKey, true)).toBe('C#')
    })

    it('ENHARMONIC_GROUPS 应该包含 12 个音符组', () => {
      expect(ENHARMONIC_GROUPS).toHaveLength(12)
    })

    it('getEnharmonicGroup 应该正确处理越界值', () => {
      expect(getEnharmonicGroup(12).toneId).toBe(0)
      expect(getEnharmonicGroup(-1).toneId).toBe(11)
    })
  })

  describe('和弦 Tokenizer', () => {
    it('应该正确 tokenize 基本大三和弦', () => {
      const tokens = ChordTokenizer.tokenize('C')
      expect(tokens).toContain('C')
    })

    it('应该正确 tokenize 小三和弦', () => {
      const tokens = ChordTokenizer.tokenize('Cm')
      expect(tokens).toContain('C')
      expect(tokens).toContain('MINOR')
    })

    it('应该正确 tokenize 七和弦', () => {
      const tokens = ChordTokenizer.tokenize('C7')
      expect(tokens).toContain('C')
      expect(tokens).toContain('SEVEN')
    })

    it('应该正确 tokenize 变化和弦', () => {
      const tokens = ChordTokenizer.tokenize('C7b9')
      expect(tokens).toContain('C')
      expect(tokens).toContain('SEVEN')
      expect(tokens).toContain('FLAT_NINE')
    })

    it('应该正确 tokenize slash 和弦', () => {
      const tokens = ChordTokenizer.tokenize('C/E')
      expect(tokens).toContain('C')
      expect(tokens).toContain('SLASH')
      expect(tokens).toContain('E')
    })

    it('应该正确 tokenize 带变音记号的根音', () => {
      const tokens = ChordTokenizer.tokenize('F#m7')
      expect(tokens).toContain('F')
      expect(tokens).toContain('SHARP')
      expect(tokens).toContain('MINOR')
      expect(tokens).toContain('SEVEN')
    })
  })

  describe('和弦解析', () => {
    it('应该正确解析 C 大三和弦', () => {
      const chord = parseChord('C')
      expect(chord).not.toBeNull()
      expect(chord!.rootNote).toBe(0)
      expect(chord!.chordType).toBe(ChordType.majorTriad)
    })

    it('应该正确解析 Cm 小三和弦', () => {
      const chord = parseChord('Cm')
      expect(chord).not.toBeNull()
      expect(chord!.rootNote).toBe(0)
      expect(chord!.chordType).toBe(ChordType.minorTriad)
    })

    it('应该正确解析 C7 属七和弦', () => {
      const chord = parseChord('C7')
      expect(chord).not.toBeNull()
      expect(chord!.rootNote).toBe(0)
      expect(chord!.chordType).toBe(ChordType.dominantSeven)
    })

    it('应该正确解析 F#m7', () => {
      const chord = parseChord('F#m7')
      expect(chord).not.toBeNull()
      expect(chord!.rootNote).toBe(6)
      expect(chord!.chordType).toBe(ChordType.minorSeven)
    })

    it('应该正确解析 slash 和弦', () => {
      const chord = parseChord('C/E')
      expect(chord).not.toBeNull()
      expect(chord!.rootNote).toBe(0)
      expect(chord!.slashRootNote).toBe(4)
    })

    it('应该对无效和弦返回 null', () => {
      expect(parseChord('')).toBeNull()
      expect(parseChord('H')).toBeNull()
    })

    it('应该利用缓存提高性能', () => {
      const chord1 = parseChord('Cmaj7')
      const chord2 = parseChord('Cmaj7')
      expect(chord1).toEqual(chord2)
    })
  })

  describe('和弦音符计算', () => {
    it('应该正确计算 C 大三和弦的音符', () => {
      const notes = getChordNotes(0, ChordType.majorTriad)
      expect(notes).toEqual([0, 4, 7])
    })

    it('应该正确计算 C 小三和弦的音符', () => {
      const notes = getChordNotes(0, ChordType.minorTriad)
      expect(notes).toEqual([0, 3, 7])
    })

    it('应该正确计算 C7 和弦的音符', () => {
      const notes = getChordNotes(0, ChordType.dominantSeven)
      expect(notes).toEqual([0, 4, 7, 10])
    })

    it('应该正确计算转位后的音符', () => {
      const notes = getChordNotes(2, ChordType.majorTriad)
      expect(notes).toEqual([2, 6, 9])
    })

    it('应该利用缓存提高性能', () => {
      const notes1 = getChordNotes(0, ChordType.majorTriad)
      const notes2 = getChordNotes(0, ChordType.majorTriad)
      expect(notes1).toEqual(notes2)
    })
  })

  describe('和弦格式化', () => {
    it('应该正确格式化 C 大三和弦', () => {
      expect(formatChord(0, ChordType.majorTriad)).toBe('C')
    })

    it('应该正确格式化 C 小三和弦', () => {
      expect(formatChord(0, ChordType.minorTriad)).toBe('Cm')
    })

    it('应该正确格式化 C7 和弦', () => {
      expect(formatChord(0, ChordType.dominantSeven)).toBe('C7')
    })

    it('应该正确格式化 slash 和弦', () => {
      expect(formatChord(0, ChordType.majorTriad, { slashRootNote: 4 })).toBe('C/E')
    })

    it('应该支持 Unicode 输出', () => {
      expect(formatChord(0, ChordType.majorSeven, { useUnicode: true })).toBe('CΔ7')
    })

    it('应该支持标准输出', () => {
      expect(formatChord(0, ChordType.majorSeven, { useUnicode: false })).toBe('CMaj7')
    })
  })

  describe('和弦类型显示字符串', () => {
    it('应该正确返回 majorTriad 显示字符串', () => {
      expect(getChordTypeDisplayString(ChordType.majorTriad)).toBe('')
    })

    it('应该正确返回 minorTriad 显示字符串', () => {
      expect(getChordTypeDisplayString(ChordType.minorTriad)).toBe('m')
    })

    it('应该正确返回 diminishedTriad 显示字符串', () => {
      expect(getChordTypeDisplayString(ChordType.diminishedTriad)).toBe('dim')
    })

    it('应该正确返回 Unicode 显示字符串', () => {
      expect(getChordTypeUnicodeDisplayString(ChordType.majorSeven)).toBe('Δ7')
      expect(getChordTypeUnicodeDisplayString(ChordType.diminished)).toBe('°7')
    })
  })

  describe('chordTypeToTokens', () => {
    it('应该正确转换 majorTriad', () => {
      expect(chordTypeToTokens(ChordType.majorTriad)).toEqual([])
    })

    it('应该正确转换 minorTriad', () => {
      expect(chordTypeToTokens(ChordType.minorTriad)).toEqual(['MINOR'])
    })

    it('应该正确转换 dominantSeven', () => {
      expect(chordTypeToTokens(ChordType.dominantSeven)).toEqual(['SEVEN'])
    })
  })
})
