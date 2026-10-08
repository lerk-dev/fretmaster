import { describe, it, expect } from 'vitest'
import { INTERVALS } from '@/lib/page-theory-data'
import {
  normalizeIntervalSymbol,
  intervalIndexBySymbol,
  resolveIntervalIndices,
} from '@/lib/interval-index'

/**
 * 护栏：音程符号 ⇄ INTERVALS 下标 的解析必须与「全链路按下标解读」保持一致。
 *
 * 背景：课程启动曾把**半音数**写进 `selectedIntervals`（该字段实为下标），
 * 实测 18 个课程音程里 14 个错位、12 个连目标音的半音位置都错。
 * 详见 lib/interval-index.ts 顶部注释。
 */
describe('interval-index（音程符号 → INTERVALS 下标）', () => {
  it('穷举：每个音程符号都能解析回它自己的下标，且下标解读回来仍是同一个符号', () => {
    INTERVALS.forEach((iv, idx) => {
      expect(intervalIndexBySymbol(iv.symbol), `${iv.symbol} 应解析到下标 ${idx}`).toBe(idx)
      // 关键是「下标解读」后再取符号：必须原样回来（这就是练习端实际做的事）
      expect(INTERVALS[intervalIndexBySymbol(iv.symbol)].symbol).toBe(iv.symbol)
    })
  })

  it('穷举：解析出的下标，其半音数必须等于该符号自身的半音数', () => {
    INTERVALS.forEach((iv) => {
      const idx = intervalIndexBySymbol(iv.symbol)
      expect(INTERVALS[idx].semitones).toBe(iv.semitones)
    })
  })

  it('异名同音不许混为一谈：b3 不得解析到 #2，反之亦然', () => {
    const iSharp2 = INTERVALS.findIndex((i) => i.symbol === '#2')
    const iFlat3 = INTERVALS.findIndex((i) => i.symbol === 'b3')
    expect(iSharp2).toBeGreaterThanOrEqual(0)
    expect(iFlat3).toBeGreaterThanOrEqual(0)
    expect(iSharp2).not.toBe(iFlat3)
    // 二者半音数相同 —— 正是这个「同半音」让半音数反查必然出错
    expect(INTERVALS[iSharp2].semitones).toBe(INTERVALS[iFlat3].semitones)

    expect(intervalIndexBySymbol('b3')).toBe(iFlat3)
    expect(intervalIndexBySymbol('#2')).toBe(iSharp2)
    expect(resolveIntervalIndices(['b3'])).toEqual([iFlat3])
    expect(resolveIntervalIndices(['#2'])).toEqual([iSharp2])
  })

  it('异名同音逐对穷举：#4/b5、#5/b6、6/bb7 各归其位', () => {
    const pairs: [string, string][] = [
      ['#4', 'b5'],
      ['#5', 'b6'],
      ['6', 'bb7'],
    ]
    for (const [a, b] of pairs) {
      const ia = intervalIndexBySymbol(a)
      const ib = intervalIndexBySymbol(b)
      expect(ia).toBeGreaterThanOrEqual(0)
      expect(ib).toBeGreaterThanOrEqual(0)
      expect(ia).not.toBe(ib)
      expect(INTERVALS[ia].symbol).toBe(a)
      expect(INTERVALS[ib].symbol).toBe(b)
      expect(INTERVALS[ia].semitones).toBe(INTERVALS[ib].semitones)
    }
  })

  it('Unicode 变体（♭ ♯）归一化后与 ASCII 等价', () => {
    expect(normalizeIntervalSymbol('♭3')).toBe('b3')
    expect(normalizeIntervalSymbol('♯4')).toBe('#4')
    expect(intervalIndexBySymbol('♭3')).toBe(intervalIndexBySymbol('b3'))
    expect(intervalIndexBySymbol('♯2')).toBe(intervalIndexBySymbol('#2'))
    expect(resolveIntervalIndices(['♭3', '♭5', '♭7'])).toEqual(
      resolveIntervalIndices(['b3', 'b5', 'b7'])
    )
  })

  it('未命中的符号被丢弃；全未命中返回空数组', () => {
    expect(intervalIndexBySymbol('不存在的音程')).toBe(-1)
    expect(resolveIntervalIndices(['b3', 'zzz'])).toEqual([
      INTERVALS.findIndex((i) => i.symbol === 'b3'),
    ])
    expect(resolveIntervalIndices(['zzz'])).toEqual([])
    expect(resolveIntervalIndices([])).toEqual([])
  })

  it('多个符号：结果按 INTERVALS 原顺序排列（与入参顺序无关），且去重', () => {
    const asc = resolveIntervalIndices(['b7', '3', '5'])
    const desc = resolveIntervalIndices(['5', 'b7', '3'])
    expect(asc).toEqual(desc)
    const positions = asc.map((i) => INTERVALS.findIndex((_, idx) => idx === i))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    // 去重
    expect(resolveIntervalIndices(['3', '3', '3'])).toEqual([
      INTERVALS.findIndex((i) => i.symbol === '3'),
    ])
  })

  it('反向锁：解析结果不得等于「把半音数当下标」的旧实现', () => {
    // 旧实现：INTERVALS.filter(symbol 命中).map(i => i.semitones)
    const legacy = (symbols: string[]) =>
      INTERVALS.filter((i) => symbols.includes(i.symbol)).map((i) => i.semitones)

    // 至少要有若干符号，旧实现会给出不同答案（否则这条护栏就抓不到回归）
    const symbols = INTERVALS.map((i) => i.symbol)
    const fixed = symbols.map((s) => intervalIndexBySymbol(s))
    const old = legacy(symbols)
    expect(fixed).not.toEqual(old)

    // 抽查几个用户可见的错位：3→b3、7→b6、5→#4
    expect(INTERVALS[legacy(['3'])[0]].symbol).toBe('b3')
    expect(INTERVALS[intervalIndexBySymbol('3')].symbol).toBe('3')
    expect(INTERVALS[legacy(['7'])[0]].symbol).toBe('b6')
    expect(INTERVALS[intervalIndexBySymbol('7')].symbol).toBe('7')
    expect(INTERVALS[legacy(['5'])[0]].symbol).toBe('#4')
    expect(INTERVALS[intervalIndexBySymbol('5')].symbol).toBe('5')
  })

  it('全量不变量：对 INTERVALS 全体符号，解析结果必须是 0..n-1 的一个排列', () => {
    const all = resolveIntervalIndices(INTERVALS.map((i) => i.symbol))
    expect(all).toEqual(INTERVALS.map((_, idx) => idx))
  })
})
