/**
 * 度数体系：`degreeToSemitone` / `semitonesToDegree` / `getNoteDegreeInChord`。
 *
 * 为什么值得单独钉住：这三个函数是**和弦练习出题与判分的地基**（"该弹 3 音"、
 * "这个音是 b7"），此前完全没有测试。它们错了不会崩，只会安静地显示错音级 ——
 * 这正是本项目最怕的那类 bug。
 */
import { describe, it, expect } from 'vitest'
import {
  degreeToSemitone,
  semitonesToDegree,
  getNoteDegreeInChord,
  getChordDegrees,
} from '@/lib/page-theory-functions'

describe('degreeToSemitone —— 度数 → 半音（乐理真值）', () => {
  it.each([
    ['1', 0],
    ['b2', 1],
    ['2', 2],
    ['b3', 3],
    ['3', 4],
    ['4', 5],
    ['b5', 6],
    ['#4', 6], // 增四 = 减五，同音异名
    ['5', 7],
    ['#5', 8],
    ['b6', 8], // 增五 = 小六
    ['6', 9],
    ['bb7', 9], // 重降七 = 大六（减七和弦的七音写作 bb7）
    ['b7', 10],
    ['7', 11],
  ])('%s → %s 半音', (degree, semitone) => {
    expect(degreeToSemitone(degree)).toBe(semitone)
  })

  it('延伸音按「一个八度 + 音级」表示（9 = 14、11 = 17、13 = 21）', () => {
    expect(degreeToSemitone('b9')).toBe(13)
    expect(degreeToSemitone('9')).toBe(14)
    expect(degreeToSemitone('#9')).toBe(15) // 增九 = 小十度
    expect(degreeToSemitone('11')).toBe(17)
    expect(degreeToSemitone('#11')).toBe(18)
    expect(degreeToSemitone('b13')).toBe(20)
    expect(degreeToSemitone('13')).toBe(21)
  })

  it('未收录的写法返回 undefined（调用方需自行兜底）', () => {
    expect(degreeToSemitone('xyz')).toBeUndefined()
    expect(degreeToSemitone('')).toBeUndefined()
    expect(degreeToSemitone('1b')).toBeUndefined()
  })
})

describe('semitonesToDegree —— 半音 → 度数', () => {
  it.each([
    [0, '1'],
    [1, 'b2'],
    [2, '2'],
    [3, 'b3'],
    [4, '3'],
    [5, '4'],
    [7, '5'],
    [9, '6'],
    [10, 'b7'],
    [11, '7'],
    [12, '1'], // 八度回到同一音级
  ])('%s 半音 → %s', (semi, degree) => {
    expect(semitonesToDegree(semi)).toBe(degree)
  })

  it('5 音随和弦上下文取值：增五写成 #5、小调里写成 b6', () => {
    expect(semitonesToDegree(8, 'maj7#5')).toBe('#5')
    expect(semitonesToDegree(8, 'aug7')).toBe('#5')
    expect(semitonesToDegree(8, 'm7')).toBe('b6')
    expect(semitonesToDegree(8, 'Minor')).toBe('b6')
  })

  it('减五（6 半音）随上下文取 b5 或 #4', () => {
    expect(semitonesToDegree(6, 'm7b5')).toBe('b5')
    expect(semitonesToDegree(6, 'dim7')).toBe('b5')
    expect(semitonesToDegree(6, '7b5')).toBe('b5')
    expect(semitonesToDegree(6, 'Major')).toBe('#4') // 大三和弦里没有 6 半音，取增四写法
  })

  it('九度处随上下文取 6 或 bb7（减和弦的七音）', () => {
    expect(semitonesToDegree(9, 'dim7')).toBe('bb7')
    expect(semitonesToDegree(9, 'dim')).toBe('bb7')
    expect(semitonesToDegree(9, 'Major')).toBe('6')
  })

  it('延伸音区（13~21 半音）逐项正确', () => {
    expect(semitonesToDegree(13)).toBe('b9')
    expect(semitonesToDegree(14)).toBe('9')
    expect(semitonesToDegree(15)).toBe('#9')
    expect(semitonesToDegree(17)).toBe('11')
    expect(semitonesToDegree(18)).toBe('#11')
    expect(semitonesToDegree(20)).toBe('b13')
    expect(semitonesToDegree(21)).toBe('13')
  })

  it('16 / 19 半音分别是「八度 + 大三度」与「八度 + 纯五度」，不该标成 #9 / b5', () => {
    // 16 = 12 + 4：音级仍是 3；19 = 12 + 7：音级仍是 5。
    // 原实现在这两处写成 '#9'（与 15 半音重复，偏了一个全音）和 'b5'（差一个八度又差半音），
    // 属于数值笔误。虽然当前只有 0~11 的音程会进来（和弦 intervals 都在单八度内），
    // 但表本身是给「半音 → 度数」用的，留着错值迟早误导后来人。
    expect(semitonesToDegree(16)).toBe('3')
    expect(semitonesToDegree(19)).toBe('5')
  })

  it('与 degreeToSemitone 在「无歧义度数」上往返一致', () => {
    for (const deg of ['1', '2', '3', '4', '5', '6', '7', 'b9', '9', '11', '13']) {
      const semi = degreeToSemitone(deg)!
      expect(semitonesToDegree(semi), `${deg} 往返`).toBe(deg)
    }
  })
})

describe('getNoteDegreeInChord —— 音在指定和弦中的音级', () => {
  it('C 大三和弦', () => {
    expect(getNoteDegreeInChord('C', 'C', 'Major')).toBe('1')
    expect(getNoteDegreeInChord('E', 'C', 'Major')).toBe('3')
    expect(getNoteDegreeInChord('G', 'C', 'Major')).toBe('5')
  })

  it('C 小七和弦（三音、七音取小调写法）', () => {
    expect(getNoteDegreeInChord('Eb', 'C', 'm7')).toBe('b3')
    expect(getNoteDegreeInChord('Bb', 'C', 'm7')).toBe('b7')
  })

  it('C 减七和弦的七音写作 bb7', () => {
    expect(getNoteDegreeInChord('A', 'C', 'dim7')).toBe('bb7')
    expect(getNoteDegreeInChord('Eb', 'C', 'dim7')).toBe('b3')
  })

  it('C 半减七的五音写作 b5', () => {
    expect(getNoteDegreeInChord('Gb', 'C', 'm7b5')).toBe('b5')
  })

  it('C 增七和弦的升五音写作 #5', () => {
    expect(getNoteDegreeInChord('G#', 'C', '7#5')).toBe('#5')
  })

  it('不属于该和弦的音返回 null', () => {
    expect(getNoteDegreeInChord('D', 'C', 'Major')).toBeNull()
    expect(getNoteDegreeInChord('F', 'C', 'Major')).toBeNull()
  })

  it('等音写法都认得（C# 与 Db 同音）', () => {
    expect(getNoteDegreeInChord('C#', 'C', 'Major')).toBeNull() // 根音是 C，C# 不在和弦内
    expect(getNoteDegreeInChord('Db', 'C', 'Major')).toBeNull()
    // 三全音也**不在**大三和弦里（intervals 是 0/4/7），所以是 null 而不是 "#4"
    expect(getNoteDegreeInChord('F#', 'C', 'Major')).toBeNull()
    // 换成含三全音的和弦（7b5 的 intervals 含 6 半音），同一音就有了度数
    expect(getNoteDegreeInChord('F#', 'C', '7b5')).toBe('b5')
  })
})

describe('getChordDegrees —— 出题用的音级序列', () => {
  it('基本和弦至少含根音，且所有音级都能被 degreeToSemitone 识别', () => {
    for (const type of ['Major', 'Minor', 'm7', 'Maj7', 'dim7', 'm7b5', '7#5', 'sus4']) {
      const degrees = getChordDegrees(type)
      expect(degrees.length, `${type} 应至少有一个音级`).toBeGreaterThan(0)
      expect(degrees[0], `${type} 的首个音级应是根音`).toBe('1')
      for (const d of degrees) {
        expect(degreeToSemitone(d), `${type} 的音级「${d}」不认识`).not.toBeUndefined()
      }
    }
  })

  it('同一个和弦根音只出现一次（序列不重复根音）', () => {
    for (const type of ['Major', 'm7', 'Maj7', 'dim7']) {
      const degrees = getChordDegrees(type)
      expect(degrees.filter((d) => d === '1').length, `${type} 的根音重复了`).toBe(1)
    }
  })

  it('未知和弦类型回退为仅根音', () => {
    expect(getChordDegrees('这不是和弦')).toEqual(['1'])
  })
})
