/**
 * 自定义歌曲编辑器（lib/custom-song-editor.ts）的契约测试。
 *
 * 该模块此前零测试，而它承担「自定义歌曲」的解析 / 序列化 / 移调：
 *  - chordToSymbol ↔ parseChordSymbol 往返（用户「导出文本 → 粘贴导入」走的就是它）
 *  - transposeSong 的正确性（乐理核心；UI 的「重置移调」会传 -transposeValue，
 *    点十余次加号后就是 -13 之类的值）
 */
import { describe, it, expect } from 'vitest'
import {
  CHORD_TYPES,
  ROOT_NOTES,
  createChord,
  createEmptySong,
  chordToSymbol,
  parseChordSymbol,
  validateSong,
  exportSongToJSON,
  importSongFromJSON,
  exportSongToSimpleFormat,
  importSongFromSimpleFormat,
  duplicateSong,
  transposeSong,
  type ChordViewModel,
  type CustomSong,
  type RootNote,
  type ChordType,
} from '@/lib/custom-song-editor'

const ROOTS = ROOT_NOTES.map((r) => r.id)

/** 等音 → 半音值：用于「音高还原」断言，避免因升降号写法不同而误判 */
const PITCH: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

function songWith(chords: ChordViewModel[], extra: Partial<CustomSong> = {}): CustomSong {
  return { ...createEmptySong(), name: 'Test Song', key: 'CMajor', chords, ...extra }
}

function chord(rootNote: RootNote, chordType: ChordType = 'Major', bass?: RootNote): ChordViewModel {
  return { id: `c_${rootNote}_${chordType}_${bass ?? ''}`, rootNote, chordType, bass, beats: 4 }
}

describe('transposeSong', () => {
  it('semitones=0 与 ±12 的整数倍都不改变和弦', () => {
    const s = songWith([chord('C', 'm7', 'E')])
    for (const n of [0, 12, -12, 24, -24]) {
      const t = transposeSong(s, n)
      expect(t.chords[0].rootNote, `n=${n}`).toBe('C')
      expect(t.chords[0].bass, `n=${n}`).toBe('E')
    }
  })

  it('向下超过一个八度时不得产生 undefined（JS 负数取模的坑）', () => {
    const s = songWith([chord('C', 'm7', 'E')])
    for (const n of [-13, -15, -25, -37]) {
      const t = transposeSong(s, n)
      expect(t.chords[0].rootNote, `n=${n} root`).toBeTruthy()
      expect(t.chords[0].bass, `n=${n} bass`).toBeTruthy()
      expect(ROOTS, `n=${n}`).toContain(t.chords[0].rootNote)
    }
  })

  it('移调后再反向移调，音高必须还原（比等音级，不比字符串）', () => {
    // ⚠️ 不能用字符串比较：移调按起点风格在「升号表 / 降号表」间切换，等音写法可能漂移
    //    （Db +1 → D，D -1 → C#），这是既有的近似行为，不是本轮的修复目标。
    for (const root of ROOTS) {
      for (const n of [1, 2, 5, 7, 11, -1, -5, -7, -11, -13, 15]) {
        const there = transposeSong(songWith([chord(root, 'm7')]), n)
        const back = transposeSong(there, -n)
        expect(PITCH[back.chords[0].rootNote], `root=${root} n=${n}`).toBe(PITCH[root])
      }
    }
  })

  it('slash bass 跟着一起移调', () => {
    const t = transposeSong(songWith([chord('C', 'Major', 'E')]), 2)
    expect(t.chords[0].rootNote).toBe('D')
    expect(t.chords[0].bass).toBe('F#')
  })

  it('起点决定记谱风格：升号音走升号表、降号音走降号表', () => {
    // C +1 → C#（升号表）
    expect(transposeSong(songWith([chord('C', 'Major')]), 1).chords[0].rootNote).toBe('C#')
    // Db +2 → Eb 而不是 D#（降号表）；而 Db +1 是自然音 D，两表都有
    expect(transposeSong(songWith([chord('Db', 'Major')]), 2).chords[0].rootNote).toBe('Eb')
    expect(transposeSong(songWith([chord('Bb', 'Major')]), 3).chords[0].rootNote).toBe('Db')
  })

  it('不改动入参（返回新对象与新和弦数组）', () => {
    const s = songWith([chord('C', 'Major')])
    const t = transposeSong(s, 3)
    expect(s.chords[0].rootNote).toBe('C')
    expect(t).not.toBe(s)
    expect(t.chords[0]).not.toBe(s.chords[0])
  })
})

describe('chordToSymbol ↔ parseChordSymbol 往返', () => {
  it('全部和弦类型 × 中英两种写法都能往返', () => {
    for (const ct of CHORD_TYPES) {
      for (const mode of ['english', 'chinese'] as const) {
        const symbol = chordToSymbol(chord('C', ct.id), mode)
        const parsed = parseChordSymbol(symbol)
        expect(parsed?.chordType, `type=${ct.id} mode=${mode} symbol="${symbol}"`).toBe(ct.id)
        expect(parsed?.rootNote).toBe('C')
      }
    }
  })

  it('根音含升降号时也能往返', () => {
    for (const root of ['C#', 'Db', 'F#', 'Gb', 'A#', 'Bb'] as RootNote[]) {
      for (const type of ['Major', 'm7b5', '13#11', '6add9'] as ChordType[]) {
        const symbol = chordToSymbol(chord(root, type))
        const parsed = parseChordSymbol(symbol)
        expect(parsed?.rootNote, `root=${root} type=${type} symbol="${symbol}"`).toBe(root)
        expect(parsed?.chordType, `root=${root} type=${type} symbol="${symbol}"`).toBe(type)
      }
    }
  })

  it('slash 和弦的解析', () => {
    expect(parseChordSymbol('C/E')).toMatchObject({ rootNote: 'C', chordType: 'Major', bass: 'E' })
    expect(parseChordSymbol('Cm7/G')).toMatchObject({ rootNote: 'C', chordType: 'm7', bass: 'G' })
    expect(parseChordSymbol('F#m7b5/A')).toMatchObject({ rootNote: 'F#', chordType: 'm7b5', bass: 'A' })
  })

  it('类型名本身含斜杠时不再被误当成 slash bass（6add9 / m6add9）', () => {
    expect(parseChordSymbol('C6/9')).toMatchObject({ chordType: '6add9', bass: undefined })
    expect(parseChordSymbol('Cm6/9')).toMatchObject({ chordType: 'm6add9', bass: undefined })
    expect(parseChordSymbol('C6/9/E')).toMatchObject({ chordType: '6add9', bass: 'E' })
  })

  it('用 id 写法（6add9 / m6add9）也能识别', () => {
    expect(parseChordSymbol('C6add9')?.chordType).toBe('6add9')
    expect(parseChordSymbol('Cm6add9')?.chordType).toBe('m6add9')
  })

  it('非法或未知输入不抛异常；未知类型保持旧行为（降级为大三和弦）', () => {
    expect(() => parseChordSymbol('')).not.toThrow()
    expect(() => parseChordSymbol('H7')).not.toThrow()
    expect(parseChordSymbol('H7')).toBeNull() // H 不是合法根音
    expect(parseChordSymbol('Cxyz')?.chordType).toBe('Major') // 旧行为：降级
  })
})

describe('JSON 往返', () => {
  it('导出再导入保留名称 / 调号 / 和弦，但换新 id', () => {
    const s = songWith([chord('C', 'm7'), chord('F', 'Maj7')], { name: '我的歌', key: 'FMajor' })
    const back = importSongFromJSON(exportSongToJSON(s))
    expect(back).not.toBeNull()
    expect(back!.name).toBe('我的歌')
    expect(back!.key).toBe('FMajor')
    expect(back!.chords).toHaveLength(2)
    expect(back!.id).not.toBe(s.id)
  })

  it('非法 JSON / 缺字段返回 null 而不抛异常', () => {
    expect(importSongFromJSON('not json')).toBeNull()
    expect(importSongFromJSON('{"name":"x"}')).toBeNull() // 缺 chords
  })
})

describe('简单格式往返', () => {
  it('含 6/9 类和弦时不得丢和弦（曾经会丢）', () => {
    const s = songWith([chord('C', '6add9'), chord('F', 'm6add9'), chord('G', 'Major')], {
      name: 'S',
      key: 'CMajor',
    })
    const back = importSongFromSimpleFormat(exportSongToSimpleFormat(s))
    expect(back).not.toBeNull()
    expect(back!.chords).toHaveLength(3)
    expect(back!.chords.map((c) => c.chordType)).toEqual(['6add9', 'm6add9', 'Major'])
  })

  it('保留和弦的 beats 与歌曲名 / 调号', () => {
    const s = songWith(
      [{ ...chord('C', 'm7'), beats: 2 }, { ...chord('G', '7'), beats: 6 }],
      { name: 'T', key: 'GMajor' },
    )
    const back = importSongFromSimpleFormat(exportSongToSimpleFormat(s))!
    expect(back.name).toBe('T')
    expect(back.key).toBe('GMajor')
    expect(back.chords.map((c) => c.beats)).toEqual([2, 6])
  })

  it('格式非法返回 null', () => {
    expect(importSongFromSimpleFormat('只有一段')).toBeNull()
    expect(importSongFromSimpleFormat('a|b|')).toBeNull() // 没有任何有效和弦
  })
})

describe('validateSong / duplicateSong / 工厂函数', () => {
  it('validateSong：合法通过；缺名称 / 缺和弦 / 速度与拍数越界都报错', () => {
    expect(validateSong(songWith([chord('C')])).valid).toBe(true)
    expect(validateSong(songWith([chord('C')], { name: '  ' })).errors).toContain('歌曲名称不能为空')
    expect(validateSong(songWith([])).errors).toContain('至少需要一个和弦')
    expect(validateSong(songWith([chord('C')], { tempo: 500 })).errors.length).toBeGreaterThan(0)
    expect(validateSong(songWith([chord('C')], { beatsPerMeasure: 0 })).errors.length).toBeGreaterThan(0)
  })

  it('duplicateSong 生成新 id 与副本名，且不改动原对象', () => {
    const s = songWith([chord('C')], { name: '原名' })
    const copy = duplicateSong(s)
    expect(copy.id).not.toBe(s.id)
    expect(copy.name).toBe('原名 (副本)')
    expect(s.name).toBe('原名')
    expect(copy.chords).toEqual(s.chords)
    expect(duplicateSong(s, '指定名').name).toBe('指定名')
  })

  it('createEmptySong / createChord 返回合法默认值且 id 唯一', () => {
    expect(createEmptySong().id).not.toBe(createEmptySong().id)
    expect(createEmptySong().chords).toEqual([])
    const c1 = createChord()
    const c2 = createChord()
    expect(c1.id).not.toBe(c2.id)
    expect(c1.chordType).toBe('Major')
    expect(c1.beats).toBe(4)
  })
})

// ============================================================================
// 兜底守卫：解析不出类型名 / 导入非法结构 / 移调遇到不在音名表里的音
// ============================================================================
describe('parseChordSymbol 的类型名兜底', () => {
  it('根音后跟「无法识别且带斜杠」的后缀 → 整体返回 null（而不是降级成某个和弦）', () => {
    // '/xyz' 既不是 slash bass（步骤 2），也没有任何类型别名能前缀匹配（步骤 3），
    // 第 4 步的 legacy 正则要求斜杠后必须是音名 ⇒ 匹配失败 ⇒ 走到函数末尾的 return null
    expect(parseChordSymbol('C/xyz')).toBeNull()
    expect(parseChordSymbol('C/9')).toBeNull()
  })

  it('没有斜杠但类型名不认识时仍降级为 Major（向后兼容，与上面那条区分）', () => {
    const c = parseChordSymbol('Czzz')
    expect(c).not.toBeNull()
    expect(c!.chordType).toBe('Major')
  })
})

describe('importSongFromSimpleFormat 的异常兜底', () => {
  it('解析中途抛错 → 被 try/catch 兜住，返回 null 且不把异常抛给 UI', () => {
    // 该函数的 catch 是**裸 catch（不打日志）**；日志在隔壁 importSongFromJSON。
    // 用「有 split 方法但一调就抛」的替身，才能确证走的是 catch 而不是 parts.length<3 那条早退。
    const bad = { split: () => { throw new Error('boom') } } as unknown as string
    expect(() => importSongFromSimpleFormat(bad)).not.toThrow()
    expect(importSongFromSimpleFormat(bad)).toBeNull()
  })

  it('段数不足 3 → 直接返回 null（不进入解析）', () => {
    expect(importSongFromSimpleFormat('a|b')).toBeNull()
  })
})

describe('transposeSong 的未知音名', () => {
  it('音名不在升降两套表里 → 原样返回（不产生 undefined，也不抛错）', () => {
    const song = songWith([
      { ...createChord(), rootNote: 'E#' as unknown as RootNote, bass: 'Cb' as unknown as RootNote },
    ])
    const out = transposeSong(song, 2)
    expect(out.chords[0].rootNote).toBe('E#')
    expect(out.chords[0].bass).toBe('Cb')
  })
})
