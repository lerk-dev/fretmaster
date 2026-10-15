/**
 * #3 回归护栏：转位低音（`generateChordSequence` 的 bass 参数）对**所有和弦性质**都必须生效。
 *
 * ## 修前
 * 旋转只用自然音级字面量去找下标：`indexOf('3')` / `indexOf('5')` / `indexOf('7')`。
 * 但序列里的音级来自「和弦对应音阶」（`getScaleForChord`）：
 *   小调系走 dorian ⇒ 三音写作 **b3**；属七走 mixolydian ⇒ 七音写作 **b7**；
 *   减/半减走 locrian ⇒ 五音写作 **b5**；减七 ⇒ 七音写作 **bb7**。
 * 固定字面量让 `indexOf` 恒 **-1** ⇒ 旋转不生效 ⇒ 用户选了「第一转位」听到的仍是原位。
 *
 * ## 修后
 * 按**度数数字**定位（`3` / `b3` / `#3` 都算三音），找不到才放弃。
 *
 * 这里用 `four_chord_tones_root_3rd_5th_7th` 这个等级（序列 = 1 3 5 7，四个音都在），
 * 逐性质 × 逐低音穷举，而不是只测大三和弦 —— 后者恰好是修前唯一能过的组合。
 */
import { describe, it, expect } from 'vitest'
import { degreeToSemitone, generateChordSequence, getChordDegrees } from '@/lib/page-theory-functions'

/** 该等级的 sequences 是 [1,3,5,7]（major/minor/dominant/diminished 四类都是） */
const LEVEL = 'four_chord_tones_root_3rd_5th_7th'
const ORDER = 'asc'

/** 音级字符串 → 度数数字（`b3`→3、`bb7`→7、`#5`→5） */
const degreeNumber = (degree: string) => parseInt(degree.replace(/[^0-9]/g, ''), 10)

const seq = (chordType: string, bass: string) =>
  generateChordSequence('C', chordType, LEVEL, ORDER, bass)

/** 和弦自身音级表里「第 n 音」的半音（如 m7 的第 3 音 = b3 = 3 半音） */
function chordToneSemitone(chordType: string, n: number): number | undefined {
  const label = getChordDegrees(chordType).find((d) => degreeNumber(d) === n)
  return label === undefined ? undefined : degreeToSemitone(label)
}

describe('#3 转位：低音音级在小调 / 属七 / 减和弦里同样生效', () => {
  /**
   * `[和弦类型, bass 参数, 期望落在序列最前的音级]`。
   * 🚨 第三项是**序列里的实际拼写**，未必是 3/5/7 ——
   * dim7 的减七音在 whole-half 减音阶里拼作 `6`（同一音高）。
   */
  const CASES: Array<[string, '3rd' | '5th' | '7th', string]> = [
    // 大三和弦（修前唯一能过的组合，保留作对照）
    ['Major', '3rd', '3'],
    ['Major', '5th', '5'],
    // 小七：三音是 b3、七音是 b7（修前 indexOf('3')/indexOf('7') 恒 -1）
    ['m7', '3rd', 'b3'],
    ['m7', '5th', '5'],
    ['m7', '7th', 'b7'],
    // 小调和弦：三音是 b3
    ['Minor', '3rd', 'b3'],
    // 属七：七音是 b7
    ['7', '3rd', '3'],
    ['7', '5th', '5'],
    ['7', '7th', 'b7'],
    // 半减七：五音是 b5
    ['m7b5', '3rd', 'b3'],
    ['m7b5', '5th', 'b5'],
    ['m7b5', '7th', 'b7'],
    // 减七：三音 b3、五音 b5、七音在序列里写作 6（= 减七音 bb7 的音高）
    ['dim7', '3rd', 'b3'],
    ['dim7', '5th', 'b5'],
    ['dim7', '7th', '6'],
    // 大七：七音是自然 7
    ['Maj7', '7th', '7'],
  ]

  it.each(CASES)('%s + bass=%s ⇒ 序列以「%s」开头', (type, bass, expectedFirst) => {
    expect(seq(type, bass)[0], `${type} bass=${bass}`).toBe(expectedFirst)
  })

  it.each(CASES)('%s + bass=%s ⇒ 最前的音**音高**就是该和弦的第 %s 音', (type, bass) => {
    // 语义断言（不依赖拼写）：最前那个音的音高必须等于和弦自身音级表里 3/5/7 的半音。
    const n = bass === '3rd' ? 3 : bass === '5th' ? 5 : 7
    const want = chordToneSemitone(type, n)
    expect(want, `${type} 的和弦音级表里没有第 ${n} 音（用例前提不成立）`).not.toBeUndefined()
    const got = degreeToSemitone(seq(type, bass)[0])
    expect(got! % 12, `${type} bass=${bass} 的第一音音高不对：${seq(type, bass).join(' ')}`)
      .toBe(want! % 12)
  })

  it('旋转只换顺序：不比原位多一个音、也不丢一个音', () => {
    for (const [type, bass] of CASES) {
      const base = [...seq(type, 'root')].sort()
      const rotated = [...seq(type, bass)].sort()
      expect(rotated, `${type} bass=${bass} 的音级集合变了`).toEqual(base)
    }
  })

  it('bass=root（或空）不旋转，序列以根音开头', () => {
    for (const bass of ['root', '']) {
      for (const type of ['Major', 'm7', '7', 'dim7']) {
        const s = seq(type, bass)
        expect(s[0], `${type} bass=${bass}`).toBe('1')
      }
    }
  })

  it('兼容持久化数据里的「音级标签」形式（直接给 b3 / b5 / bb7）', () => {
    // 老数据里 bass 存的是音级标签本身（不是 3rd/5th/7th）—— 这条分支同样要能转，
    // 且按**音高**定位：dim7 的减七音在序列里写作 6，也要能转到它。
    expect(seq('m7', 'b3')[0]).toBe('b3')
    expect(seq('m7b5', 'b5')[0]).toBe('b5')
    expect(seq('7', 'b7')[0]).toBe('b7')
    expect(seq('dim7', 'bb7')[0], 'dim7 的减七音（拼作 6）').toBe('6')
  })

  it('序列里没有该度数时保持原样（不越界、不报错）', () => {
    // 等级 `single_chord_tones_root` 的序列是 [1] ⇒ 只有根音，任何低音都无处可转
    const single = generateChordSequence('C', 'm7', 'single_chord_tones_root', ORDER, '7th')
    expect(single).toEqual(['1'])
  })

  it('和弦类型未知时不抛异常（返回空序列，由上层决定如何提示）', () => {
    expect(() => generateChordSequence('C', '不存在的和弦', LEVEL, ORDER, '3rd')).not.toThrow()
  })
})
