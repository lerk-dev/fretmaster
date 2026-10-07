import { describe, it, expect, beforeEach } from 'vitest'
import {
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

// ============================================================================
// 补充：ChordTokenizer 全符号分支 / ChordParser 的斜杠变音与无根音 / 缓存 LRU
// ============================================================================

describe('ChordTokenizer.nextToken：每个符号分支', () => {
  // [输入, 期望 token, 期望 remaining]
  const CASES: Array<[string, string | null, string]> = [
    ['', null, ''], // 空串早退
    ['b13', 'FLAT_THIRTEEN', ''],
    ['♭13', 'FLAT_THIRTEEN', ''],
    ['#11', 'SHARP_ELEVEN', ''],
    ['#9', 'SHARP_NINE', ''],
    ['b9', 'FLAT_NINE', ''],
    ['b6', 'FLAT_SIX', ''],
    ['#5', 'SHARP_FIVE', ''],
    ['b5', 'FLAT_FIVE', ''],
    ['♭7', 'FLAT', '7'], // firstChar 被 toUpperCase（'b'→'B'），故 'b' 分支只对 Unicode 降号成立
    ['#7', 'SHARP', '7'],
    ['♯7', 'SHARP', '7'],
    ['/', 'SLASH', ''],
    ['maj', 'MAJOR', ''],
    ['min', 'MINOR', ''],
    ['M7', 'MAJOR', '7'], // 大写 M + 数字 = 大和弦
    ['M', 'MAJOR', ''],
    ['-', 'MINOR', ''],
    ['°7', 'DIMINISHED', ''],
    ['°', 'DIMINISHED', ''],
    ['+', 'AUGMENTED', ''],
    ['sus2', 'SUS2', ''],
    ['sus4', 'SUS4', '4'],
    ['sus', 'SUS4', ''],
    ['13', 'THIRTEEN', ''],
    ['11', 'ELEVEN', ''],
    ['9', 'NINE', ''],
    ['6', 'SIX', ''],
    ['ø7', 'MINOR', ''],
  ]

  for (const [input, token, remaining] of CASES) {
    it('nextToken(' + JSON.stringify(input) + ') -> ' + String(token), () => {
      expect(ChordTokenizer.nextToken(input)).toEqual({ token, remaining })
    })
  }
})

describe('ChordTokenizer.nextToken：结构性不可达的分支（如实钉住现状）', () => {
  // 根因：`firstChar` 被 toUpperCase、firstTwoChars/ThreeChars/FourChars 被 toLowerCase。
  //  1) 以字母开头的类型串被「根音分支」（1368 行）先截走 —— 根音字母是 A~G，而 dim/aug/add9/alt
  //     恰好以 D/A 开头 ⇒ 永远先被当成根音 token。
  //  2) 'Δ' / 'ø' 这类**带大小写**的符号被 toLowerCase 后（'δ'）再也比不中字面量。
  // 结果：`tokenize('Cadd9')` 得到 ['C','A','D','D','NINE'] 这种垃圾序列（见下一条用例）。
  it('dim / aug / add9 / alt 被根音分支截走（不是 DIMINISHED / AUGMENTED / ADD9 / ALT）', () => {
    expect(ChordTokenizer.nextToken('dim7')).toEqual({ token: 'D', remaining: 'im7' })
    expect(ChordTokenizer.nextToken('dim')).toEqual({ token: 'D', remaining: 'im' })
    expect(ChordTokenizer.nextToken('aug')).toEqual({ token: 'A', remaining: 'ug' })
    expect(ChordTokenizer.nextToken('add9')).toEqual({ token: 'A', remaining: 'dd9' })
    expect(ChordTokenizer.nextToken('alt')).toEqual({ token: 'A', remaining: 'lt' })
  })

  it('Δ / ø 因大小写归一（Δ→δ、ø→Ø）永远比不中，落到最后的 null 兜底', () => {
    expect(ChordTokenizer.nextToken('Δ')).toEqual({ token: null, remaining: '' })
    expect(ChordTokenizer.nextToken('ø')).toEqual({ token: null, remaining: '' })
  })

  it('后果：Cadd9 解成一条无意义的 token 序列', () => {
    expect(ChordTokenizer.tokenize('Cadd9')).toEqual(['C', 'A', 'D', 'D', 'NINE'])
  })
})

describe('ChordTokenizer.tokenize：无法识别的字符被跳过', () => {
  it('未识别的字符直接丢弃（不产生 token，也不死循环）', () => {
    expect(ChordTokenizer.tokenize('C$$')).toEqual(['C'])
    expect(ChordTokenizer.tokenize('$$')).toEqual([])
  })
})

describe('ChordParser：斜杠变音 / 无根音', () => {
  it('斜杠低音带变音记号时也要应用', () => {
    const parsed = ChordParser.parse('C/G#')
    expect(parsed).not.toBeNull()
    expect(parsed!.rootNote).toBe(0) // C
    expect(parsed!.slashRootNote).toBe(8) // G#
  })

  it('首 token 不是根音（如 m7）时返回 null', () => {
    expect(ChordParser.parse('m7')).toBeNull()
  })

  it('applyAccidental：SHARP +1、FLAT -1、其它原样', () => {
    expect(ChordParser.applyAccidental(0, 'SHARP')).toBe(1)
    expect(ChordParser.applyAccidental(0, 'FLAT')).toBe(11)
    expect(ChordParser.applyAccidental(5, 'MAJOR')).toBe(5)
  })
})

describe('缓存：LRU 淘汰与命中', () => {
  beforeEach(() => {
    clearChordTheoryCache()
  })

  it('超过 MAX_CACHE_SIZE(1000) 时淘汰最早的一条', () => {
    // 1100 个互不相同的解析请求 → 必然触发淘汰分支
    for (let i = 0; i < 1100; i++) {
      parseChord('ZZ' + i)
    }
    // 淘汰后最早的键已不在缓存：再取一次仍可用（不抛错）
    expect(parseChord('ZZ0')).toBeNull()
  })

  it('formatChord 第二次相同参数命中缓存', () => {
    const a = formatChord(0, ChordType.majorTriad)
    const b = formatChord(0, ChordType.majorTriad)
    expect(a).toBe(b)
  })
})

describe('getNoteNameWithEnharmonicPreference：Unicode 输出', () => {
  it('给定调性上下文时输出 Unicode 变音记号', () => {
    expect(getNoteNameWithEnharmonicPreference(1, 0, true, true)).toBe('C♯')
  })

  it('无上下文时按 preferSharp 输出 Unicode', () => {
    expect(getNoteNameWithEnharmonicPreference(1, null, true, true)).toBe('C♯')
    expect(getNoteNameWithEnharmonicPreference(1, null, false, true)).toBe('D♭')
  })
})

describe('normalizeNoteName：无法解析时原样大写', () => {
  it('非音名输入 trim + 大写返回', () => {
    expect(normalizeNoteName(' xyz ')).toBe('XYZ')
    expect(normalizeNoteName('???')).toBe('???')
  })
})
