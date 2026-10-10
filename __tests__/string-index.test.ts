/**
 * 「限制弦」的弦号 ↔ 行下标 唯一真相源契约。
 *
 * 这里守的是一条**真出过的 bug**（2026-10-10 用户报「限制弦的辨音模式有时候出不在
 * 该弦上的音，看不到该位置无法答题」）：
 *
 *   出题端 `generateNewTarget` 写 `STRING_COUNT - 弦号`（弦号 1 ⇒ 下标 N-1），
 *   渲染端两个指板组件写 `下标 + 1`（下标 i ⇒ 弦号 i+1）—— 两端**镜像相反**。
 *   于是「限制弦」里选中的弦被禁用、目标落在**没选**的弦上。
 *
 * 实测：6 弦 63 种选弦组合里 **56 种（88.9%）** 目标不可点；只有镜像自对称的
 * 7 种（{1,6}、{2,5}、{3,4}、…、全选）碰巧正确 —— 这就是用户说的「有时候」。
 *
 * 三层护栏：① 纯函数互逆；② **枚举所有子集**断言目标必落在选中集合（咬住 56/63）；
 * ③ 源码级接线（出题端与两个渲染端都必须走真相源，禁手写 `STRING_COUNT - ` / `+ 1`）。
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  stringNumberToIndex,
  stringIndexToNumber,
  resolveAvailableStringIndexes,
} from '@/lib/string-index'

/** 剥掉注释（判据锚点绝不能被注释里的示例命中 —— 源码护栏的老坑） */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1')

describe('string-index：弦号 ↔ 下标 唯一真相源', () => {
  it('基本映射：弦号 1 = 下标 0（最高音弦），弦号 N = 下标 N-1（最低音弦）', () => {
    expect(stringNumberToIndex(1)).toBe(0)
    expect(stringNumberToIndex(6)).toBe(5)
    expect(stringNumberToIndex(7)).toBe(6)
    expect(stringIndexToNumber(0)).toBe(1)
    expect(stringIndexToNumber(5)).toBe(6)
    expect(stringIndexToNumber(6)).toBe(7)
  })

  it('两函数互逆（1..7 弦穷举）', () => {
    for (let n = 1; n <= 7; n++) {
      expect(stringIndexToNumber(stringNumberToIndex(n))).toBe(n)
    }
    for (let i = 0; i <= 6; i++) {
      expect(stringNumberToIndex(stringIndexToNumber(i))).toBe(i)
    }
  })

  it('🔴 不能是镜像映射：弦号 1 绝不能映到下标 N-1', () => {
    // 这一条单独钉住「反着写」的写法（历史 bug 的形态）
    for (const n of [6, 7]) {
      expect(stringNumberToIndex(1)).not.toBe(n - 1)
    }
  })

  it('空集合 = 不限制弦 ⇒ 返回全部下标', () => {
    expect(resolveAvailableStringIndexes([], 6)).toEqual([0, 1, 2, 3, 4, 5])
    expect(resolveAvailableStringIndexes([], 7)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(resolveAvailableStringIndexes([], 4)).toEqual([0, 1, 2, 3])
  })

  it('选中集合 → 下标集合（具体实参，不是「长度对不对」）', () => {
    expect(resolveAvailableStringIndexes([1], 6)).toEqual([0])
    expect(resolveAvailableStringIndexes([6], 6)).toEqual([5])
    expect(resolveAvailableStringIndexes([2, 5], 6)).toEqual([1, 4])
    expect(resolveAvailableStringIndexes([3, 4], 6)).toEqual([2, 3])
    expect(resolveAvailableStringIndexes([1, 2, 3], 6)).toEqual([0, 1, 2])
    expect(resolveAvailableStringIndexes([1, 2, 3, 4, 5, 6], 6)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('越界项被丢弃；全越界 ⇒ 退回不限制（不产生空数组导致随机取到 undefined）', () => {
    expect(resolveAvailableStringIndexes([1, 99, 0, -3], 6)).toEqual([0])
    expect(resolveAvailableStringIndexes([99, 0, -1], 6)).toEqual([0, 1, 2, 3, 4, 5])
    // 去重
    expect(resolveAvailableStringIndexes([2, 2, 2], 6)).toEqual([1])
  })

  it('7 弦 / 4 弦乐器同样按「弦号 - 1」', () => {
    expect(resolveAvailableStringIndexes([7], 7)).toEqual([6])
    expect(resolveAvailableStringIndexes([1], 7)).toEqual([0])
    expect(resolveAvailableStringIndexes([4], 4)).toEqual([3])
    expect(resolveAvailableStringIndexes([1], 4)).toEqual([0])
  })
})

describe('🔴 限制弦出题：目标必须落在「选中」的弦上（枚举所有子集）', () => {
  /**
   * 这条用例直接复刻「出题端取下标 → 渲染端反解弦号 → 是否被启用」的判定链，
   * 对 6/7/4 弦乐器的**全部**非空选弦组合穷举。历史 bug 在此处 6 弦会红 56 次。
   */
  const enumerate = (n: number) => {
    const out: number[][] = []
    for (let mask = 1; mask < (1 << n); mask++) {
      const sel: number[] = []
      for (let s = 1; s <= n; s++) if (mask & (1 << (s - 1))) sel.push(s)
      out.push(sel)
    }
    return out
  }

  for (const N of [6, 7, 4]) {
    it(`${N} 弦：每个选弦组合都能取到「已启用」的目标行`, () => {
      const subsets = enumerate(N)
      expect(subsets.length).toBe((1 << N) - 1)

      for (const sel of subsets) {
        const idxs = resolveAvailableStringIndexes(sel, N)
        // 出题端只会从 idxs 里取一根弦
        expect(idxs.length).toBeGreaterThan(0)
        for (const i of idxs) {
          // 渲染端把下标反解成弦号，再问「这根弦启用了吗」
          const renderedNum = stringIndexToNumber(i)
          expect(
            sel.includes(renderedNum),
            `选[${sel}] ⇒ 目标行下标 ${i} ⇒ 弦号 ${renderedNum}（未被选中，会被禁用以至点不了）`,
          ).toBe(true)
          // 同时确认下标合法
          expect(i).toBeGreaterThanOrEqual(0)
          expect(i).toBeLessThan(N)
        }
      }
    })
  }

  it('单选任意一根弦都必须命中它自己（历史 bug 下单选 6 种全错）', () => {
    for (let s = 1; s <= 6; s++) {
      expect(resolveAvailableStringIndexes([s], 6)).toEqual([s - 1])
    }
  })
})

describe('源码级接线：出题端与渲染端必须共用真相源', () => {
  const PAGE = readFileSync('app/page.tsx', 'utf8')
  const PRACTICE_FB = readFileSync('components/practice-fretboard.tsx', 'utf8')
  const GUITARRUN_FB = readFileSync('components/guitarrun-fretboard.tsx', 'utf8')

  /** 抽取 generateNewTarget 函数体（起点锚唯一，非贪婪到依赖数组开头收尾） */
  const blockRe = /const generateNewTarget = useCallback\(\(\) => \{[\s\S]*?\n {2}\}, \[STRING_COUNT, selectedStrings, fretCount,/
  const matches = PAGE.match(new RegExp(blockRe.source, 'g')) ?? []
  const body = stripComments(PAGE.match(blockRe)?.[0] ?? '')

  it('能定位到 generateNewTarget（锚点唯一）', () => {
    expect(matches.length, 'generateNewTarget 锚点匹配次数必须为 1').toBe(1)
    expect(body.length).toBeGreaterThan(200)
  })

  it('generateNewTarget 走了真相源，且**没有**镜像写法 STRING_COUNT - 弦号', () => {
    expect(body).toContain('resolveAvailableStringIndexes(selectedStrings, STRING_COUNT)')
    // 剥注释后不得再出现 `STRING_COUNT - `（历史 bug 形态；注释里提到它是允许的）
    expect(body).not.toMatch(/STRING_COUNT\s*-\s*/)
  })

  it('两个指板组件都用 stringIndexToNumber 当弦号，禁 `下标 + 1`', () => {
    for (const [name, src] of [['practice-fretboard', PRACTICE_FB], ['guitarrun-fretboard', GUITARRUN_FB]] as const) {
      const code = stripComments(src)
      expect(code, `${name} 未使用真相源`).toContain('stringIndexToNumber(')
      expect(code, `${name} 仍手写 \`stringIndex + 1\` 当弦号`).not.toMatch(/stringIndex\s*\+\s*1/)
    }
  })
})
