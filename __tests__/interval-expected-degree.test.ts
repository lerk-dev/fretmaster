/**
 * lib/interval-expected-degree.ts 的契约测试。
 *
 * 它是「音程练习点击路径」的唯一期望音级来源：点击指板/钢琴时先问它
 * 「现在该点哪个音级」，再据此给红/绿反馈。
 *
 * 最要紧的两条（2026-10-07 的 bug 家族）：
 *  ① 回弹根音那一拍必须是根音 1（此前硬用本题目音程 ⇒ 点对了也判错）；
 *  ② 先找根音模式在根音未弹出前只认根音，弹出后不得再被挡住。
 */
import { describe, it, expect } from 'vitest'
import { resolveExpectedIntervalDegree } from '@/lib/interval-expected-degree'

describe('resolveExpectedIntervalDegree：点击路径的期望音级', () => {
  describe('不先找根音', () => {
    it('无回弹：唯一音级就是目标，弹完即无期待', () => {
      expect(resolveExpectedIntervalDegree('b3', [], false)).toBe('b3')
      expect(resolveExpectedIntervalDegree('b3', [0], false)).toBeNull()
    })

    it('有回弹：先目标音程、再根音（用户 2026-10-07 报的场景）', () => {
      expect(resolveExpectedIntervalDegree('b3 1', [], false)).toBe('b3')
      expect(resolveExpectedIntervalDegree('b3 1', [0], false)).toBe('1')
      expect(resolveExpectedIntervalDegree('b3 1', [0, 1], false)).toBeNull()
    })
  })

  describe('先找根音', () => {
    const display = '1 b3 1'

    it('根音未完成时只认根音（哪怕后面还有音级）', () => {
      expect(resolveExpectedIntervalDegree(display, [], true)).toBe('1')
    })

    it('按顺序推进：根音 → 音程 → 回弹根音', () => {
      expect(resolveExpectedIntervalDegree(display, [0], true)).toBe('b3')
      expect(resolveExpectedIntervalDegree(display, [0, 1], true)).toBe('1')
      expect(resolveExpectedIntervalDegree(display, [0, 1, 2], true)).toBeNull()
    })

    it('根音完成后不再被「只认根音」挡住', () => {
      expect(resolveExpectedIntervalDegree('1 b3', [0], true)).toBe('b3')
    })

    it('只要串里有根音，根音未弹出前一律只认根音（优先于「第一个未完成项」）', () => {
      // 根音不在首位时两者才会分歧：顺序推进会给 'b3'，而「先找根音」必须先给根音。
      // 正常出题时根音固定在首位（"1 X"），所以这条锁的是非法/未来数据的确定性行为。
      expect(resolveExpectedIntervalDegree('b3 1', [], true)).toBe('1')
      expect(resolveExpectedIntervalDegree('b3 1', [0], true)).toBe('1')
      // 根音弹出后才放开
      expect(resolveExpectedIntervalDegree('b3 1', [1], true)).toBe('b3')
      expect(resolveExpectedIntervalDegree('b3 1', [0, 1], true)).toBeNull()
    })
  })

  describe('边界', () => {
    it('完成下标越界或重复，不影响判定', () => {
      expect(resolveExpectedIntervalDegree('3', [9, 9], false)).toBe('3')
      expect(resolveExpectedIntervalDegree('3 1', [0, 0], false)).toBe('1')
    })

    it('先找根音但串里根本没有根音（异常数据）→ 退化为顺序推进，不永远只认根音', () => {
      expect(resolveExpectedIntervalDegree('b3', [], true)).toBe('b3')
      expect(resolveExpectedIntervalDegree('b3', [0], true)).toBeNull()
    })
  })
})
