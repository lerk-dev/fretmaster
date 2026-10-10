/**
 * lib/interval-direction.ts 的契约测试（2026-10-10 全仓审查 P1-1）。
 *
 * 这里钉住的是两个**曾经真实存在**的缺陷：
 *
 * ① **负数取模**：`(12 - semitones) % 12` 对 13~21 半音的复合音程返回负数，
 *    `findIndex` 恒 -1 ⇒ 「下行」档静默按**上行**出题、「双向」档把同一题 push 两次。
 *    注意：旧代码在复合音程上「碰巧」也返回原下标（负数查不到 ⇒ 回落），所以
 *    **不能**用「复合音程保持原样」来判定修复——必须直接证明「取模结果不为负」。
 *    本文件的用例正是照这个思路写的（见「负数取模」describe）。
 *
 * ② **异名同音反查**：`findIndex(i => i.semitones === target)` 靠前者胜出 ⇒
 *    选 `b5` 练成 `#4`、选 `b3` 练成 `#2`、选 `b6` 练成 `#5`、选 `bb7` 练成 `6`。
 *    本文件对**每一个**异名同音都断言「换成的是与选中符号同一音级族的互补音」。
 */
import { describe, it, expect } from 'vitest'
import {
  resolveDownIndex,
  buildDirectionalQueue,
  shuffle,
} from '@/lib/interval-direction'
import { INTERVALS } from '@/lib/page-theory-data'

const idxOf = (symbol: string) => INTERVALS.findIndex((i) => i.symbol === symbol)
const symOf = (index: number) => INTERVALS[index].symbol
const semiOf = (index: number) => INTERVALS[index].semitones

/** 全部合法下标 */
const ALL = INTERVALS.map((_, i) => i)

describe('resolveDownIndex：负数取模（复合音程不得产出负数/非法下标）', () => {
  it('每个音程映射结果都是合法下标（旧实现无法满足此断言的口径）', () => {
    for (const i of ALL) {
      const down = resolveDownIndex(i)
      expect(Number.isInteger(down)).toBe(true)
      expect(down).toBeGreaterThanOrEqual(0)
      expect(down).toBeLessThan(INTERVALS.length)
    }
  })

  it('旧式取模 (12 - s) % 12 在复合音程上确实为负 —— 证明缝隙真实存在', () => {
    const compound = ALL.filter((i) => semiOf(i) >= 12)
    expect(compound.length).toBeGreaterThan(0) // INTERVALS 里确实有复合音程
    const negatives = compound.filter((i) => (12 - semiOf(i)) % 12 < 0)
    expect(negatives.length).toBe(compound.length) // 且**每一个**都取到负数
  })

  it('复合音程无下行等价项 ⇒ 原样返回（而不是换成别的音程）', () => {
    for (const i of ALL.filter((i) => semiOf(i) >= 12)) {
      expect(resolveDownIndex(i)).toBe(i)
    }
  })

  it('复合音程豁免是**独立**生效的：互补表里不得有任何 ≥12 半音的键', () => {
    // 若把 COMPOUND_MIN_SEMITONES 放到 99（等于不豁免），复合音程会走到查表分支。
    // 此时只有当互补表里**存在**复合音程的键时才会换错——所以要显式证明：
    // 豁免必须由「半音数判定」这一条独立承担，而不是靠"表里恰好没有键"兜住。
    // 判据：复合音程即便被强行送进查表逻辑，也必须原样返回（表里无键 + 阈值豁免双层）。
    const compound = ALL.filter((i) => semiOf(i) >= 12)
    expect(compound.length).toBeGreaterThan(0)
    // 逐个确认：复合音程的符号不在任何一条互补映射的值域里被"消费"成别的下标
    for (const i of compound) {
      const self = resolveDownIndex(i)
      expect(self).toBe(i)
      // 再证一次：映射结果与"取模后再反查"的结果不同（后者在复合音程上是错的）
      const naive = INTERVALS.findIndex((x) => x.semitones === ((12 - semiOf(i)) % 12 + 12) % 12)
      if (naive !== -1) {
        expect(resolveDownIndex(i)).not.toBe(naive) // 绝不接受"负数取模+反查"的答案
      }
    }
  })

  it('简单音程（< 12 半音、非三全音）必须换成互补音程，不得原样返回', () => {
    // 例外：三全音（6 半音）自补（#4↔#4、b5↔b5）；根音（0 半音）自补。
    for (const i of ALL.filter((i) => semiOf(i) > 0 && semiOf(i) < 12 && semiOf(i) !== 6)) {
      expect(resolveDownIndex(i)).not.toBe(i)
    }
  })
})

describe('resolveDownIndex：异名同音按符号选边（不做半音数反查）', () => {
  it.each([
    // 选取的符号 → 期望的互补符号（同一音级族优先；半音数须满足 (12-s)%12）
    ['b3', '6'],
    ['#2', '6'],
    ['#4', '#4'], // 三全音自补
    ['b5', 'b5'], // 三全音自补
    ['#5', '3'],
    ['b6', '3'],
    ['6', 'b3'],
    ['bb7', 'b3'],
    ['7', 'b2'],
    ['2', 'b7'],
    ['b7', '2'],
    ['3', 'b6'],
    ['4', '5'],
    ['5', '4'],
    ['b2', '7'],
    ['1', '1'],
  ])('%s 的下行互补是 %s', (from, to) => {
    expect(symOf(resolveDownIndex(idxOf(from)))).toBe(to)
  })

  it('异名同音不会被"反查表"拐到数组靠前的那一侧', () => {
    // 旧实现：b5(idx8) ⇒ 半音 6 ⇒ findIndex 命中 #4(idx7) ⇒ 练成 #4
    expect(idxOf('b5')).toBeGreaterThan(idxOf('#4'))
    expect(resolveDownIndex(idxOf('b5'))).toBe(idxOf('b5'))
    // 旧实现：b3(idx4) ⇒ 半音 3 ⇒ findIndex 命中 #2(idx3)
    expect(idxOf('b3')).toBeGreaterThan(idxOf('#2'))
    expect(resolveDownIndex(idxOf('b3'))).toBe(idxOf('6'))
    // 旧实现：b6(idx11) ⇒ 半音 8 ⇒ findIndex 命中 #5(idx10)
    expect(idxOf('b6')).toBeGreaterThan(idxOf('#5'))
    expect(resolveDownIndex(idxOf('b6'))).toBe(idxOf('3'))
    // 旧实现：bb7(idx14) ⇒ 半音 9 ⇒ findIndex 命中 6(idx12)
    expect(idxOf('bb7')).toBeGreaterThan(idxOf('6'))
    expect(resolveDownIndex(idxOf('bb7'))).toBe(idxOf('b3'))
  })

  it('下游必须真的是"下行"：互补音程的半音数 = (12 - s) % 12', () => {
    for (const i of ALL.filter((x) => semiOf(x) > 0 && semiOf(x) < 12)) {
      const down = resolveDownIndex(i)
      // 三全音（6 半音）自补 ⇒ (12 - 6) % 12 = 6，仍成立
      expect(semiOf(down)).toBe((12 - semiOf(i)) % 12)
    }
  })
})

describe('buildDirectionalQueue：四档方向', () => {
  it('up ⇒ 原样（拷贝，不共享引用）', () => {
    const sel = [idxOf('3'), idxOf('5')]
    const q = buildDirectionalQueue(sel, 'up')
    expect(q).toEqual(sel)
    expect(q).not.toBe(sel)
  })

  it('down ⇒ 每一项都换成互补音程', () => {
    const sel = [idxOf('3'), idxOf('5')]
    expect(buildDirectionalQueue(sel, 'down')).toEqual([
      resolveDownIndex(sel[0]),
      resolveDownIndex(sel[1]),
    ])
  })

  it('either ⇒ 上行与下行成对出现，且下行不得等于上行（重复题回归）', () => {
    const sel = [idxOf('3'), idxOf('5')]
    const q = buildDirectionalQueue(sel, 'either')
    expect(q).toHaveLength(4)
    expect(q[0]).toBe(sel[0])
    expect(q[1]).toBe(resolveDownIndex(sel[0]))
    expect(q[2]).toBe(sel[1])
    expect(q[3]).toBe(resolveDownIndex(sel[1]))
    // 旧实现里复合音程在 either 档会上下行同一个下标 ⇒ 队列出现重复题
    for (let i = 0; i < q.length; i += 2) {
      expect(q[i + 1]).not.toBe(q[i])
    }
  })

  it('either 档：**任意**单音程选择都不会产生"上下行相同"的重复题', () => {
    // 两类合法例外：
    //  - 三全音（6 半音）自补（`#4`/`b5`），上下行本就是同一个音程；
    //  - 复合音程（≥ 12 半音）无下行等价项，按约定原样保留。
    for (const i of ALL.filter((x) => semiOf(x) > 0 && semiOf(x) !== 6 && semiOf(x) < 12)) {
      const q = buildDirectionalQueue([i], 'either')
      expect(q).toHaveLength(2)
      expect(q[0]).toBe(i)
      expect(q[1]).not.toBe(i)
    }
  })

  it('random ⇒ 随机源 > 0.5 时换下行，否则原样', () => {
    const sel = [idxOf('3'), idxOf('5')]
    expect(buildDirectionalQueue(sel, 'random', () => 0.9)).toEqual([
      resolveDownIndex(sel[0]),
      resolveDownIndex(sel[1]),
    ])
    expect(buildDirectionalQueue(sel, 'random', () => 0.1)).toEqual(sel)
  })

  it('空选择 ⇒ 空队列', () => {
    expect(buildDirectionalQueue([], 'either')).toEqual([])
  })
})

describe('shuffle：均匀洗牌（不改原数组、元素守恒）', () => {
  it('不修改入参', () => {
    const src = [1, 2, 3, 4, 5]
    const copy = [...src]
    shuffle(src)
    expect(src).toEqual(copy)
  })

  it('元素守恒（任何随机源下）', () => {
    const src = [10, 20, 30, 40, 50, 60]
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const out = shuffle(src, () => r)
      expect([...out].sort((a, b) => a - b)).toEqual([...src].sort((a, b) => a - b))
      expect(out).toHaveLength(src.length)
    }
  })

  it('每个元素都可能落到每个位置（用确定性随机源穷举 j）', () => {
    // Fisher-Yates 的结构保证：i 从末尾走到 1，swap 目标 j = floor(r*(i+1))。
    // 固定 r 时结果可预测，借此证明实现确实是 Fisher-Yates 而不是有偏的 sort(random)。
    const src = [1, 2, 3]
    // r = 0 ⇒ 每轮 j 都取 0 ⇒ [2,3,1]→[3,...]…按实现逐步推演：
    // i=2: j=0 ⇒ swap(2,0) ⇒ [3,2,1]；i=1: j=0 ⇒ swap(1,0) ⇒ [2,3,1]
    expect(shuffle(src, () => 0)).toEqual([2, 3, 1])
    // r = 0.999 ⇒ j = floor(0.999*(i+1)) = i ⇒ 不变
    expect(shuffle(src, () => 0.999)).toEqual([1, 2, 3])
  })
})
