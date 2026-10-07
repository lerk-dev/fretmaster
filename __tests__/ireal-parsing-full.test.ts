/**
 * iReal Pro 解析的**完整覆盖**测试。
 *
 * 前一轮只用了官方文档的第一个示例（`{C^7 |A-7 |D-9 |G7#5 }`）—— 那个例子恰好
 * 用空格分隔、且和弦质量都在映射表里，所以掩盖了两类问题：
 *   1. 官方「All valid qualities」全表有 72 个质量记号，映射表只覆盖了一部分；
 *   2. 官方文档第二个示例（A Walkin Thing 全曲）用的是**逗号分隔 + s/l 尺寸记号 +
 *      括号备用和弦**，解析器只按空白切分，这些都会变成脏 token。
 * 本文件把官方全表与全曲示例都作为基准。
 */
import { describe, it, expect } from 'vitest'
import { irealQualityToProjectType, extractIrealChords } from '@/lib/song-chords'
import { CHORD_TYPES } from '@/lib/page-theory-data'

/** 项目能识别的和弦类型（getChordDegrees / 显示层都以此为键） */
const VALID_TYPES = new Set(CHORD_TYPES.map((ct) => ct.name))

/** iReal Pro 官方文档 "All valid qualities" 全表（逐字抄录，勿改顺序） */
const OFFICIAL_QUALITIES = [
  '5', '2', 'add9', '+', 'o', 'h', 'sus', '^', '-',
  '^7', '-7', '7', '7sus', 'h7', 'o7', '^9', '^13', '6', '69', '^7#11',
  '^9#11', '^7#5', '-6', '-69', '-^7', '-^9', '-9', '-11', '-7b5', 'h9',
  '-b6', '-#5', '9', '7b9', '7#9', '7#11', '7b5', '7#5', '9#11', '9b5',
  '9#5', '7b13', '7#9#5', '7#9b5', '7#9#11', '7b9#11', '7b9b5', '7b9#5', '7b9#9', '7b9b13',
  '7alt', '13', '13#11', '13b9', '13#9', '7b9sus', '7susadd3', '9sus', '13sus', '7b13sus',
  '11', 'min13', 'min^11', 'min^13', 'maj13#11', 'maj7b5', 'maj7#9', 'min7b6', 'min9b6', 'maj(add4)',
  'min(add4)', '7(add13)',
]

/** 官方文档第二个示例：A Walkin Thing（全曲，未做百分号编码） */
const WALKIN_THING =
  '{*AT44D- D-/C |Bh7, Bb7(A7b9) |D-/A G-7 |D-/F sEh,A7,|Y|lD- D-/C |Bh7, Bb7(A7b9) |D-/A G-7 |' +
  'N1D-/F sEh,A7} Y|N2sD-,G-,lD- ][*BC-7 F7 |Bb^7 |C-7 F7 |Bb^7 n ||C-7 F7 |Bb^7 |B-7 E7 |A7,p,p,p,]' +
  '[*AD- D-/C |Bh7, Bb7(A7b9) |D-/A G-7 |D-/F sEh,A7,||lD- D-/C |Bh7, Bb7(A7b9) |D-/A G-7 |D-/F sEh,A7Z'

describe('iReal 质量记号：官方全表都必须映射到项目认识的和弦类型', () => {
  it('清单本身完整（72 项，防止我自己漏抄）', () => {
    expect(OFFICIAL_QUALITIES).toHaveLength(72)
    expect(new Set(OFFICIAL_QUALITIES).size).toBe(72) // 无重复
  })

  it('每个官方质量记号都映射到 VALID_TYPES 里的类型（不得原样透传）', () => {
    const bad = OFFICIAL_QUALITIES.filter((q) => !VALID_TYPES.has(irealQualityToProjectType(q))).map(
      (q) => `${q} → ${irealQualityToProjectType(q)}`
    )
    expect(bad).toEqual([])
  })

  it('关键等价关系（等音 / 与项目命名不同但同义）', () => {
    // b5 与 #11 等音、#5 与 b13 等音
    expect(irealQualityToProjectType('9b5')).toBe('9#11')
    expect(irealQualityToProjectType('9#5')).toBe('9b13')
    expect(irealQualityToProjectType('maj7b5')).toBe('maj7#11')
    // 项目用小调前缀 m/-，iReal 用 -
    expect(irealQualityToProjectType('-7b5')).toBe('m7b5')
    expect(irealQualityToProjectType('^13')).toBe('maj13') // 项目确实有 maj13
    expect(irealQualityToProjectType('69')).toBe('6add9')
    expect(irealQualityToProjectType('-69')).toBe('m6add9')
    expect(irealQualityToProjectType('min7b6')).toBe('m7b6')
  })
})

describe('iReal 全曲示例（A Walkin Thing）的解析', () => {
  const chords = extractIrealChords(WALKIN_THING)

  it('所有解析出的类型都是项目认识的和弦类型', () => {
    const bad = chords.filter((c) => !VALID_TYPES.has(c.type)).map((c) => `${c.root}${c.type}`)
    expect([...new Set(bad)]).toEqual([])
  })

  it('解析结果里没有任何 iReal 专有记号残留', () => {
    const leaked = chords.filter((c) => /[\^\-+ho]|^$/.test(c.type) && !VALID_TYPES.has(c.type))
    expect(leaked).toEqual([])
    // 类型里不应出现逗号 / 括号 / 尺寸记号
    expect(chords.filter((c) => /[(),sl]/.test(c.type)).map((c) => c.type)).toEqual([])
  })

  it('逗号分隔与 s/l 尺寸记号不会污染 token', () => {
    // `Bh7,` → B 半减；`sEh,A7,` → E 半减 + A7（s 是尺寸记号）
    expect(chords).toContainEqual({ root: 'B', type: 'm7b5' })
    expect(chords).toContainEqual({ root: 'E', type: 'm7b5' })
    // Bb^7 出现多次
    expect(chords.filter((c) => c.root === 'Bb' && c.type === 'Maj7').length).toBeGreaterThan(0)
  })

  it('括号里的「备用和弦」不会被当成独立和弦塞进来', () => {
    // `Bb7(A7b9)` 应解析出一个 Bb7，且不应多出一个 A7b9
    expect(chords.filter((c) => c.root === 'A' && c.type === '7b9')).toEqual([])
    expect(chords.filter((c) => c.root === 'Bb' && c.type === '7').length).toBeGreaterThan(0)
  })

  it('斜杠低音（转位）被保留', () => {
    expect(chords).toContainEqual({ root: 'D', type: 'Minor', bass: 'C' })
    expect(chords).toContainEqual({ root: 'D', type: 'Minor', bass: 'A' })
    expect(chords).toContainEqual({ root: 'D', type: 'Minor', bass: 'F' })
  })

  it('重复小节记号（x / r / p）与 No Chord（n）不会被当成和弦', () => {
    const roots = new Set(chords.map((c) => c.root))
    expect(roots.has('n')).toBe(false)
    expect(chords.every((c) => /^[A-G][#b]?$/.test(c.root))).toBe(true)
  })
})
