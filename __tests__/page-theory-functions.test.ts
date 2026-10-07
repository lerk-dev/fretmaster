/**
 * lib/page-theory-functions.ts 的契约测试。
 *
 * 该模块是「乐理纯函数」的集散地（1173 行），大部分函数已被其他测试覆盖
 * （degree-system / voice-leading / chord-type-registry / pitch-match / scale-practice-logic /
 * song-chords / custom-chords-io）。本文件补的是此前**零直接覆盖**的那一批：
 *
 *   normalizeNoteName / findNoteIndexInArray / formatDegree / isEquivalentNote（八度场景）
 *   getNoteAtPosition / getNoteIndex / parseChord / normalizeChordType / formatChordName
 *   isAlteredChord / getBebopScaleForChordType / getSequenceWithFallback
 *   getScaleNoteNames / degreeToSemitone / findFirstIntervalOfType / findNearestIntervalInScale
 *   preferSharp / preferFlat
 *
 * 本轮修了一个真 bug：`isAlteredChord('m7b5')` 因 `'m7b5'.includes('7b5')` 误报为 true。
 */
import { describe, it, expect } from 'vitest'
import {
  normalizeNoteName,
  findNoteIndexInArray,
  formatDegree,
  isEquivalentNote,
  getNoteAtPosition,
  getNoteIndex,
  parseChord,
  normalizeChordType,
  formatChordName,
  getChordDisplayName,
  isAlteredChord,
  getBebopScaleForChordType,
  getSequenceWithFallback,
  getScaleNoteNames,
  degreeToSemitone,
  findFirstIntervalOfType,
  findNearestIntervalInScale,
  preferSharp,
  preferFlat,
  transposeChord,
  getChordDegrees,
  getScaleForChord,
  generateScaleSequence,
  generateChordSequence,
  getNoteDegreeInChord,
} from '@/lib/page-theory-functions'

const MAJOR = ['1', '2', '3', '4', '5', '6', '7']

// ------------------------------------------------ 基础音名工具

describe('normalizeNoteName', () => {
  it('把 ASCII 变音记号换成 Unicode', () => {
    expect(normalizeNoteName('F#')).toBe('F♯')
    expect(normalizeNoteName('Bb')).toBe('B♭')
    expect(normalizeNoteName('C')).toBe('C')
  })

  it('空串原样返回', () => {
    expect(normalizeNoteName('')).toBe('')
  })
})

describe('formatDegree', () => {
  it('度数里的变音记号也换 Unicode', () => {
    expect(formatDegree('b3')).toBe('♭3')
    expect(formatDegree('#4')).toBe('♯4')
    expect(formatDegree('5')).toBe('5')
  })
})

describe('findNoteIndexInArray', () => {
  it('精确匹配返回下标，找不到返回 -1', () => {
    expect(findNoteIndexInArray('D', ['C', 'D', 'E'])).toBe(1)
    expect(findNoteIndexInArray('X', ['C'])).toBe(-1)
  })
})

describe('getNoteIndex', () => {
  it('认 #/♯ 与 b/♭ 两种写法', () => {
    expect(getNoteIndex('C')).toBe(0)
    expect(getNoteIndex('C♯')).toBe(1)
    expect(getNoteIndex('Bb')).toBe(10)
  })

  it('无法识别返回 -1；空串返回 -1', () => {
    expect(getNoteIndex('zz')).toBe(-1)
    expect(getNoteIndex('')).toBe(-1)
  })
})

describe('getNoteAtPosition（标准调弦最低弦=E）', () => {
  it('空弦是 E，第 3 品是 G，第 12 品回到 E', () => {
    expect(getNoteAtPosition(0, 0)).toBe('E')
    expect(getNoteAtPosition(0, 3)).toBe('G')
    expect(getNoteAtPosition(0, 12)).toBe('E')
  })
})

describe('isEquivalentNote', () => {
  it('等音判定（不带八度）', () => {
    expect(isEquivalentNote('C#', 'Db')).toBe(true)
    expect(isEquivalentNote('C', 'D')).toBe(false)
    expect(isEquivalentNote('C', 'C')).toBe(true)
  })

  it('如实记录：带八度的等音当前判为不等（八度未被分离）', () => {
    // extractNoteName 的正则含 \d*，把八度一起留下，于是 'C♯4' !== 'D♭4'。
    // 当前所有调用点传的都是**不带八度**的音名（如 practice-mode-controls 的按钮答案），
    // 故不影响用户；此处仅钉住行为，避免将来无意改变。
    expect(isEquivalentNote('C#4', 'Db4')).toBe(false)
  })
})

// ------------------------------------------------ 和弦解析 / 显示

describe('parseChord', () => {
  it('拆出 root / type / bass', () => {
    expect(parseChord('C')).toEqual({ root: 'C', type: 'Major' })
    expect(parseChord('Cm7b5')).toEqual({ root: 'C', type: 'm7b5', bass: undefined })
    expect(parseChord('F#7♭9/G')).toEqual({ root: 'F#', type: '7♭9', bass: 'G' })
  })

  it('无法解析时兜底为 C Major', () => {
    expect(parseChord('x')).toEqual({ root: 'C', type: 'Major' })
  })
})

describe('normalizeChordType', () => {
  it('各种别名归一到项目内部键', () => {
    expect(normalizeChordType('m7♭5')).toBe('m7b5')
    expect(normalizeChordType('ø')).toBe('m7b5')
    expect(normalizeChordType('maj7')).toBe('Maj7')
    expect(normalizeChordType('Δ')).toBe('Maj7')
    expect(normalizeChordType('m')).toBe('Minor')
    expect(normalizeChordType('-')).toBe('Minor')
    expect(normalizeChordType('')).toBe('Major')
    expect(normalizeChordType('+')).toBe('Aug')
    expect(normalizeChordType('o7')).toBe('dim7')
  })

  it('未收录的输入原样返回', () => {
    expect(normalizeChordType('xyz')).toBe('xyz')
  })

  it('写法差异（大小写 / ♯# ♭b）也能归一到注册表键', () => {
    // 钉住修复：曲库里有 'Maj7#11' / 'Maj7#5'，注册表用 'maj7#11' / 'maj7#5'；
    // 不归一会让 getChordDegrees 找不到类型、退化成只弹根音。
    expect(normalizeChordType('Maj7#11')).toBe('maj7#11')
    expect(normalizeChordType('Maj7#5')).toBe('maj7#5')
    expect(normalizeChordType('maj7#11')).toBe('maj7#11')
    expect(normalizeChordType('M')).toBe('Minor')
  })
})

describe('formatChordName', () => {
  const t = (k: string) => k
  it('根音/后缀/低音都归一化为 ♯/♭；大三不带后缀', () => {
    expect(formatChordName({ root: 'C', type: 'Major' }, t)).toBe('C')
    expect(formatChordName({ root: 'D', type: 'm7' }, t)).toBe('Dm7')
    expect(formatChordName({ root: 'F#', type: '7b9' }, t)).toBe('F♯7♭9')
    expect(formatChordName({ root: 'C', type: 'Major', bass: 'G' }, t)).toBe('C/G')
  })

  it('getChordDisplayName 对写法不同的类型也能查到规范显示名', () => {
    // 钉住修复：原先直接以原文查 DISPLAY_NAMES，'Maj7#11' 查不到 → 显示原始类型字符串
    expect(getChordDisplayName('Maj7#11', 'chinese')).toBe('大七升十一和弦')
    expect(getChordDisplayName('Maj7#5', 'chinese')).toBe('大七升五和弦')
  })
})

// ------------------------------------------------ 变化和弦判定（本轮修复）

describe('isAlteredChord', () => {
  it('变化属和弦为 true', () => {
    for (const t of ['7alt', '7#5', '7b5', '7b9b13', 'aug7']) {
      expect(isAlteredChord(t), t).toBe(true)
    }
  })

  it('普通和弦为 false', () => {
    for (const t of ['Major', 'm7', 'Maj7', 'dim7', '7b9', '13#11']) {
      expect(isAlteredChord(t), t).toBe(false)
    }
  })

  it('半减七 m7b5 / m9b5 不是变化属和弦（钉住修复：子串误报）', () => {
    // 'm7b5'.includes('7b5') 曾让它误报为 altered，导致开启「强制自然五度」时
    // 半减七的特征音 b5 被替换成 5。
    expect(isAlteredChord('m7b5')).toBe(false)
    expect(isAlteredChord('m9b5')).toBe(false)
  })

  it('小调系都不是变化属和弦，但 maj7#5 仍是', () => {
    for (const t of ['m', 'm7', 'mMaj7', 'Minor']) {
      expect(isAlteredChord(t), t).toBe(false)
    }
    expect(isAlteredChord('maj7#5')).toBe(true)
  })
})

// ------------------------------------------------ bebop 音阶

describe('getBebopScaleForChordType', () => {
  it('按和弦类型给出对应 bebop 音阶与经过音位置', () => {
    expect(getBebopScaleForChordType('Major')).toMatchObject({ name: 'Bebop Major', passingToneIndices: [5] })
    expect(getBebopScaleForChordType('m7')).toMatchObject({ name: 'Bebop Dorian', passingToneIndices: [7] })
    expect(getBebopScaleForChordType('m7b5')).toMatchObject({ name: 'Bebop Dorian' })
    expect(getBebopScaleForChordType('mMaj7')).toMatchObject({ name: 'Bebop Tonic Minor', passingToneIndices: [5] })
    expect(getBebopScaleForChordType('7')).toMatchObject({ name: 'Bebop Dominant', passingToneIndices: [7] })
    expect(getBebopScaleForChordType('7b9b13')).toMatchObject({
      name: 'Bebop Dom7b9b13',
      passingToneIndices: [1, 5, 7],
    })
  })

  it('返回的音阶都是 8 音（7 音 + 1 个经过音）', () => {
    for (const t of ['Major', 'm7', 'm7b5', 'mMaj7', '7', '7b9b13', '6']) {
      const s = getBebopScaleForChordType(t)!
      expect(s.intervals, t).toHaveLength(8)
      expect(s.passingToneIndices.length, t).toBeGreaterThan(0)
      // 经过音下标必须落在音阶范围内
      for (const i of s.passingToneIndices) {
        expect(i, t).toBeGreaterThanOrEqual(0)
        expect(i, t).toBeLessThan(s.intervals.length)
      }
    }
  })
})

// ------------------------------------------------ 音级 / 音阶

describe('degreeToSemitone', () => {
  it('基本与延伸度数都覆盖', () => {
    expect(degreeToSemitone('1')).toBe(0)
    expect(degreeToSemitone('b3')).toBe(3)
    expect(degreeToSemitone('5')).toBe(7)
    expect(degreeToSemitone('b7')).toBe(10)
    expect(degreeToSemitone('9')).toBe(14)
    expect(degreeToSemitone('b13')).toBe(20)
    expect(degreeToSemitone('bb7')).toBe(9)
  })

  it('未知度数返回 undefined', () => {
    expect(degreeToSemitone('zzz')).toBeUndefined()
  })
})

describe('getScaleNoteNames', () => {
  it('按调内音级给出正确的音名（不是按半音硬套）', () => {
    expect(getScaleNoteNames('C', MAJOR)).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B'])
    expect(getScaleNoteNames('F', MAJOR)).toEqual(['F', 'G', 'A', 'Bb', 'C', 'D', 'E'])
    expect(getScaleNoteNames('D', ['1', '2', 'b3', '4', '5', '6', 'b7'])).toEqual(['D', 'E', 'F', 'G', 'A', 'B', 'C'])
  })

  it('B 大调用升号（E / B 不是 Fb / Cb）', () => {
    expect(getScaleNoteNames('B', MAJOR)).toEqual(['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'])
  })

  it('含蓝调音时给出降号变音', () => {
    expect(getScaleNoteNames('G', ['1', 'b3', '4', 'b5', '5', 'b7'])).toEqual(['G', 'Bb', 'C', 'Db', 'D', 'F'])
  })

  it('无法解析的音级产出空串（长度仍对齐）', () => {
    expect(getScaleNoteNames('C', ['1', '?', '5'])).toEqual(['C', '', 'G'])
  })
})

// ------------------------------------------------ 音程查找

describe('findFirstIntervalOfType / findNearestIntervalInScale', () => {
  it('找到同音级名的音程（变体也算，如 7 → b7）', () => {
    expect(findFirstIntervalOfType(MAJOR, '3')).toBe('3')
    expect(findFirstIntervalOfType(MAJOR, '7')).toBe('7')
    // 音阶里没有自然的 7 时，命中同音级名的 b7
    expect(findFirstIntervalOfType(['1', '2', '3', '4', '5', '6', 'b7'], '7')).toBe('b7')
    expect(findFirstIntervalOfType([], '3')).toBeNull()
  })

  it('缺 3 找 4 / 缺 5 找 4 / 缺 7 找 6', () => {
    expect(findNearestIntervalInScale(['1', '2', '4', '5', '6', 'b7'], '3')).toBe('4')
    expect(findNearestIntervalInScale(['1', '2', '3', '4', '6', '7'], '5')).toBe('4')
    expect(findNearestIntervalInScale(['1', '2', '3', '5', '6'], '7')).toBe('6')
  })

  it('空音阶兜底为 1', () => {
    expect(findNearestIntervalInScale([], '3')).toBe('1')
  })
})

// ------------------------------------------------ 升降号偏好

describe('preferSharp / preferFlat', () => {
  it('把音名转成统一的 Unicode 升降号形式', () => {
    expect(preferSharp('C#')).toBe('C♯')
    expect(preferSharp('Db')).toBe('C♯')
    expect(preferFlat('C♯')).toBe('D♭')
    expect(preferFlat('D♭')).toBe('D♭')
  })

  it('已是目标形式或无关音名时不变', () => {
    expect(preferSharp('B')).toBe('B')
    expect(preferFlat('C')).toBe('C')
    expect(preferSharp('F#')).toBe('F♯')
    expect(preferFlat('Gb')).toBe('G♭')
  })
})

// ------------------------------------------------ 序列兜底

describe('getSequenceWithFallback', () => {
  const sequences = { major: [1, 3, 5, 7], sus: [1, 4, 5, 7] } as never

  it('有对应类型时直接返回', () => {
    expect(getSequenceWithFallback(sequences, 'major')).toEqual([1, 3, 5, 7])
  })

  it('sus2 / augmented / altered 回退到 sus', () => {
    expect(getSequenceWithFallback(sequences, 'sus2')).toEqual([1, 4, 5, 7])
    expect(getSequenceWithFallback(sequences, 'augmented')).toEqual([1, 4, 5, 7])
    expect(getSequenceWithFallback(sequences, 'altered')).toEqual([1, 4, 5, 7])
  })

  it('diminishedMajorSeven 回退到 diminished（若存在）', () => {
    expect(getSequenceWithFallback({ major: [1, 3, 5], diminished: [1, 2, 3] } as never, 'diminishedMajorSeven'))
      .toEqual([1, 2, 3])
  })

  it('未知类型回退到 major；连 major 都没有时用内置 [1,3,5,7]', () => {
    expect(getSequenceWithFallback(sequences, 'nope')).toEqual([1, 3, 5, 7])
    expect(getSequenceWithFallback({} as never, 'nope')).toEqual([1, 3, 5, 7])
  })
})

// ------------------------------------------------ 和弦符号覆盖（和弦符号设置项）

describe('getChordDisplayName：和弦符号覆盖', () => {
  it('半减七 m7b5 按 minor7flat5Symbol 出三种写法', () => {
    // chinese 模式不应用覆盖（保持中文术语）
    expect(getChordDisplayName('m7b5', 'chinese', { minor7flat5Symbol: 'ø7' })).toBe('半减七和弦')
    expect(getChordDisplayName('m7b5', 'english', { minor7flat5Symbol: 'ø7' })).toBe('ø7')
    expect(getChordDisplayName('m7b5', 'english', { minor7flat5Symbol: 'half-dim' })).toBe('half-dim')
    expect(getChordDisplayName('m7b5', 'english', { minor7flat5Symbol: 'm7b5' })).toBe('m7b5')
  })

  it('半减九 m9b5 同样三种写法（ø9 / half-dim9 / m9b5）', () => {
    expect(getChordDisplayName('m9b5', 'english', { minor7flat5Symbol: 'ø7' })).toBe('ø9')
    expect(getChordDisplayName('m9b5', 'english', { minor7flat5Symbol: 'half-dim' })).toBe('half-dim9')
    expect(getChordDisplayName('m9b5', 'english', { minor7flat5Symbol: 'm7b5' })).toBe('m9b5')
  })

  it('小调系按 minorSymbol 生成对应符号（Minor 特例：min 才写 min）', () => {
    expect(getChordDisplayName('m7', 'english', { minorSymbol: '-' })).toBe('-7')
    expect(getChordDisplayName('m9', 'english', { minorSymbol: 'min' })).toBe('min9')
    expect(getChordDisplayName('mMaj7', 'english', { minorSymbol: 'm' })).toBe('mMaj7')
    expect(getChordDisplayName('madd9', 'english', { minorSymbol: 'min' })).toBe('minadd9')
    // 'Minor' 本身：传入 'm' 时直接写 'm'，传入 'min' 时写 'min'
    expect(getChordDisplayName('Minor', 'english', { minorSymbol: 'm' })).toBe('m')
    expect(getChordDisplayName('Minor', 'english', { minorSymbol: 'min' })).toBe('min')
  })

  it('属七降九 7b9 按 dominant7flat9Symbol 出三种写法', () => {
    expect(getChordDisplayName('7b9', 'english', { dominant7flat9Symbol: '7♭9' })).toBe('7♭9')
    expect(getChordDisplayName('7b9', 'english', { dominant7flat9Symbol: '7-9' })).toBe('7-9')
    expect(getChordDisplayName('7b9', 'english', { dominant7flat9Symbol: '7b9' })).toBe('7b9')
  })

  it('不传覆盖选项时保持表格里的规范显示名', () => {
    expect(getChordDisplayName('m7b5', 'english')).toBe('m7b5')
    expect(getChordDisplayName('m7', 'english')).toBe('m7')
    // 表格里 english 的 7b9 写法是 '7(b9)'（不传覆盖选项时用它）
    expect(getChordDisplayName('7b9', 'english')).toBe('7(b9)')
  })
})

// ------------------------------------------------ 等音（同音名的不同书写）

describe('isEquivalentNote：书写差异', () => {
  it('字符串不同但归一后同音名 → 相等（走名字相等分支，而非等价对表）', () => {
    expect(isEquivalentNote('C#', 'C♯')).toBe(true)
    expect(isEquivalentNote('Fb', 'F♭')).toBe(true)
  })
})

// ------------------------------------------------ 转调（根音 / 低音都要转）

describe('transposeChord：异常分支', () => {
  it('不成调的和弦名原样返回（根音匹配不上）', () => {
    expect(transposeChord('xyz', 'C', 'D')).toBe('xyz')
    expect(transposeChord('123', 'C', 'D')).toBe('123')
  })

  it('根音在音名表里查不到（如 Cb）时原样返回', () => {
    // normalizeNoteName('Cb') → 'C♭'，既不在 NOTES(♯) 也不在 NOTES_FLAT 里
    expect(transposeChord('Cb7', 'C', 'D')).toBe('Cb7')
  })

  it('斜杠和弦的低音查不到时不转低音，只转根音', () => {
    expect(transposeChord('C/Cb', 'C', 'D')).toBe('D/Cb')
  })

  it('正常斜杠和弦根音与低音一起转（C/G 在 C→D 时得 D/A）', () => {
    expect(transposeChord('C/G', 'C', 'D')).toBe('D/A')
  })

  it('起始调 / 目标调无法识别时原样返回', () => {
    expect(transposeChord('C', 'H', 'D')).toBe('C')
    expect(transposeChord('C', 'C', 'H')).toBe('C')
  })
})

// ------------------------------------------------ 音名生成（音级 → 音名）

describe('getScaleNoteNames：兜底与变音', () => {
  it('八度号（无半音定义）产出空串', () => {
    // '8' 能过 /^(b|#)?(\d+)$/，但 degreeToSemitone 未收录 → 该位为空串
    expect(getScaleNoteNames('C', ['1', '8', '5'])).toEqual(['C', '', 'G'])
  })

  it('G# 大调的 7 音是 F##（需要重升号）', () => {
    expect(getScaleNoteNames('G#', ['1', '2', '3', '4', '5', '6', '7']))
      .toEqual(['G#', 'A#', 'B#', 'C#', 'D#', 'E#', 'F##'])
  })

  it('D# 大调的三音是 F##（重升号分支）', () => {
    expect(getScaleNoteNames('D#', ['1', '3'])).toEqual(['D#', 'F##'])
  })

  it('重降号分支：Db 的 b2 是 Ebb', () => {
    expect(getScaleNoteNames('Db', ['b2'])).toEqual(['Ebb'])
  })

  it('差值过大（>2）时会先减 12 再取降号；减完不是 -1 时留纯音名', () => {
    // 探针穷举（root × 25 个音级）确认：diff ∈ {3,4,5,6} 时 diff-12 ∈ [-9,-6]，
    // 永远 ≠ -1，故这条 `if (diff === -1)` 是**死分支**（早先 `diff > 6` 已把 diff 压到 ≤6）。
    // 这里钉住可达的那半：结果是不带变音记号的音名。
    expect(getScaleNoteNames('A#', ['#6'])).toEqual(['F'])
  })
})

describe('getNoteDegreeInChord', () => {
  it('未知和弦类型返回 null（而不是硬套一个音级）', () => {
    expect(getNoteDegreeInChord('C', 'C', 'zzz')).toBeNull()
  })

  it('音符不在和弦内返回 null；在和弦内给出音级', () => {
    expect(getNoteDegreeInChord('D', 'C', 'Major')).toBeNull()
    expect(getNoteDegreeInChord('E', 'C', 'Major')).toBe('3')
  })
})

// ------------------------------------------------ bebop 音阶（未知和弦类型兜底）

describe('getBebopScaleForChordType：无数字类型走默认 Dominant', () => {
  it('sus4 / 未知类型都落到函数末尾的默认 Bebop Dominant', () => {
    // 不含 7/9/11/13/dominant/6、也不是小调或大七 —— 走最后的默认 return
    expect(getBebopScaleForChordType('sus4')).toMatchObject({ name: 'Bebop Dominant', passingToneIndices: [7] })
    expect(getBebopScaleForChordType('zzz')).toMatchObject({ name: 'Bebop Dominant' })
  })
})

// ------------------------------------------------ 音程查找（补全替换链）

describe('findFirstIntervalOfType：度数变体优先', () => {
  it('查 3 时优先 b3；查 4 时优先 b4', () => {
    expect(findFirstIntervalOfType(['1', 'b3', '5'], '3')).toBe('b3')
    expect(findFirstIntervalOfType(['1', 'b4', '5'], '4')).toBe('b4')
    // 没有变体时退回普通同名音级
    expect(findFirstIntervalOfType(['1', '3', '5'], '3')).toBe('3')
  })
})

describe('findNearestIntervalInScale：每个度数的完整替换链', () => {
  it('命中同音级时直接返回（不走替换）', () => {
    expect(findNearestIntervalInScale(['1', '3', '5'], '3')).toBe('3')
  })

  it('缺 3：先找 4，再找 2', () => {
    expect(findNearestIntervalInScale(['1', '2', '4'], '3')).toBe('4')
    expect(findNearestIntervalInScale(['1', '2', '5'], '3')).toBe('2')
  })

  it('缺 5：先找 4，再找 6；两者都没有则 break 后取首音', () => {
    expect(findNearestIntervalInScale(['1', '3', '6'], '5')).toBe('6')
    expect(findNearestIntervalInScale(['1', '2', '3'], '5')).toBe('1')
  })

  it('缺 7：先找 6，再找 1；两者都没有则取首音', () => {
    expect(findNearestIntervalInScale(['1', '2'], '7')).toBe('1')
    expect(findNearestIntervalInScale(['2', '3'], '7')).toBe('2')
  })
})

// ------------------------------------------------ 音阶序列生成（方向 / 首尾音兜底）

describe('generateScaleSequence', () => {
  const mkScale = (intervals: string[]) => ({ name: 'X', notes: [] as number[], intervals, formula: '' })

  it('首尾音不在音阶里时，down 方向把「除首音外」的部分倒序再首尾相接', () => {
    // startEndInterval 默认 '1'，而音阶里没有 '1' → indexOf === -1 分支
    expect(generateScaleSequence(mkScale(['2', '4', '6']), '1to1', 'down')).toEqual(['2', '6', '4', '2'])
  })

  it('首尾音不在音阶里时，up_down 方向走「先升后降」的兜底', () => {
    expect(generateScaleSequence(mkScale(['2', '4', '6']), '1to1', 'up_down'))
      .toEqual(['2', '4', '6', '2', '6', '4', '2'])
  })

  it('random 方向 + 首尾音不在音阶里：用 filter 剔除首尾音（而不是切片）', () => {
    const out = generateScaleSequence(mkScale(['2', '4', '6']), '1to1', 'random')
    expect(out[0]).toBe('1')
    expect(out[out.length - 1]).toBe('1')
    expect([...out.slice(1, -1)].sort()).toEqual(['2', '4', '6'])
  })

  it('未知 sequenceType 走最后的兜底：原序列尾部再接首音', () => {
    expect(generateScaleSequence(mkScale(['1', '3', '5']), '中不存在的类型', 'up'))
      .toEqual(['1', '3', '5', '1'])
  })

  it('3to3 / 5to5 / 7to7 取到对应首尾音（含最近音兜底）', () => {
    expect(generateScaleSequence(mkScale(['1', '3', '5']), '3to3', 'up')).toEqual(['3', '5', '1', '3'])
    expect(generateScaleSequence(mkScale(['1', '3', '5']), '5to5', 'up')).toEqual(['5', '1', '3', '5'])
    // 音阶里没有 7 → findNearestIntervalInScale 退到 '1'
    expect(generateScaleSequence(mkScale(['1', '3', '5']), '7to7', 'up')).toEqual(['1', '3', '5', '1'])
  })
})

// ------------------------------------------------ 和弦练习序列（低音旋转 / 演奏顺序）

describe('generateChordSequence', () => {
  const L3 = 'three_chord_tones_root_3rd_5th' // sequences.major = [1,3,5]

  it('未知等级返回空序列', () => {
    expect(generateChordSequence('C', 'Major', 'no-such-level', 'asc', 'root')).toEqual([])
  })

  it('指定低音（3rd）把该音级旋转到最前面', () => {
    expect(generateChordSequence('C', 'Major', L3, 'asc', '3rd')).toEqual(['3', '5', '1'])
    // 低音已在首位（1 → index 0）时不旋转
    expect(generateChordSequence('C', 'Major', L3, 'asc', '5th')).toEqual(['5', '1', '3'])
  })

  it('低音名不在映射表里时保持原顺序', () => {
    expect(generateChordSequence('C', 'Major', L3, 'asc', 'xyz')).toEqual(['1', '3', '5'])
    expect(generateChordSequence('C', 'Major', L3, 'asc', 'root')).toEqual(['1', '3', '5'])
  })

  it('desc 直接反转；random 是同一批音级的重排', () => {
    expect(generateChordSequence('C', 'Major', L3, 'desc', 'root')).toEqual(['5', '3', '1'])
    const rnd = generateChordSequence('C', 'Major', L3, 'random', 'root')
    expect([...rnd].sort()).toEqual(['1', '3', '5'])
  })
})

// ------------------------------------------------ 和弦音级（未知等级 / bebop 经过音）

describe('getChordDegrees：未知等级 + bebop 经过音', () => {
  it('未知等级（非 all、不在注册表里）→ 直接取和弦自身全部音级', () => {
    expect(getChordDegrees('Major', 'no-such-level')).toEqual(['1', '3', '5'])
  })

  it('未知等级 + forceNaturalFive：变化和弦的 #5/b5/b13/#11 换成自然 5', () => {
    // 7#5 是变化属和弦 → 开启 forceNaturalFive 后 #5 → 5
    const out = getChordDegrees('7#5', 'no-such-level', { forceNaturalFive: true })
    expect(out).not.toContain('#5')
    expect(out).toContain('5')
  })

  it('未知等级 + usePassingNoteBebopScale：按 bebop 音阶补经过音', () => {
    // Major → Bebop Major，经过音下标 5（'b6'）；5 音后面应插入 b6
    expect(getChordDegrees('Major', 'no-such-level', { usePassingNoteBebopScale: true }))
      .toEqual(['1', '3', '5', 'b6'])
  })

  it('未知等级 + endOnStartingInterval：首音补到末尾', () => {
    expect(getChordDegrees('Major', 'no-such-level', { endOnStartingInterval: true }))
      .toEqual(['1', '3', '5', '1'])
  })

  it('未知和弦类型退化成只弹根音', () => {
    expect(getChordDegrees('这不是和弦', 'no-such-level')).toEqual(['1'])
  })
})

// ------------------------------------------------ getScaleForChord：7b9 音阶选择

describe('getScaleForChord：7b9b13 与 7b9 的音阶选择', () => {
  it('7b9b13 固定 phrygianDominant（忽略 forceNaturalFive）', () => {
    expect(getScaleForChord('7b9b13')).toBe('phrygianDominant')
    expect(getScaleForChord('7b9b13', false)).toBe('phrygianDominant')
  })

  it('7b9 优先用用户偏好，其次由 forceNaturalFive 决定', () => {
    expect(getScaleForChord('7b9', undefined, 'diminishedWholeHalf')).toBe('diminishedWholeHalf')
    expect(getScaleForChord('7b9', undefined, 'diminishedHalfWhole')).toBe('diminishedHalfWhole')
    expect(getScaleForChord('7b9', false)).toBe('altered')
    expect(getScaleForChord('7b9', true)).toBe('phrygianDominant')
    expect(getScaleForChord('7b9', undefined)).toBe('phrygianDominant')
  })
})
