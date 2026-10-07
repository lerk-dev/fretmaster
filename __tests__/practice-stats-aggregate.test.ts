/**
 * 练习统计聚合的纯度与正确性。
 *
 * 原实现（hooks/use-practice-stats.ts 里的 setPracticeStats updater）是：
 *   const newStats = { ...prevStats }     // 只浅拷贝顶层
 *   newStats.total.count += 1             // ← newStats.total 与 prevStats.total 是同一个对象
 * 也就是 updater **会改写传入的旧 state**。两个后果：
 *  1) React 在 StrictMode 下双调用 updater 检测纯度 → 第二次读到已被改过的对象，
 *     同一次 recordPractice 被计两次；
 *  2) 被复用的嵌套对象（某天的条目等）身份不变，按它做 memo 的子树不会更新。
 * 而代码自己的注释却写着「updater 必须是纯函数」。
 *
 * 现在聚合逻辑抽成模块级纯函数 applyPracticeRecord，可以直接单测。
 */
import { describe, it, expect } from 'vitest'
import { applyPracticeRecord } from '@/hooks/use-practice-stats'
import type { PracticeStats, PracticeType } from '@/lib/page-stats-types'

const TYPES: PracticeType[] = ['pitch_finding', 'scale', 'chord_exercise', 'interval', 'chord_progression']

function emptyStats(): PracticeStats {
  const zero = () => TYPES.reduce((a, t) => ({ ...a, [t]: 0 }), {} as Record<PracticeType, number>)
  const empty = () => TYPES.reduce((a, t) => ({ ...a, [t]: [] }), {} as PracticeStats['total']['byDetail'])
  return { daily: [], total: { count: 0, byType: zero(), byDetail: empty() } }
}

function deepFreeze<T>(obj: T): T {
  Object.freeze(obj)
  for (const v of Object.values(obj as unknown as Record<string, unknown>)) {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v)
  }
  return obj
}

describe('applyPracticeRecord：纯函数（不得改写旧 state）', () => {
  it('输入被深冻结时仍能正常聚合（若改写旧 state 会抛 TypeError）', () => {
    const prev = deepFreeze(emptyStats())
    const next = applyPracticeRecord(prev, { type: 'scale', detailName: 'C 大调音阶', today: '2026-09-17' })

    expect(next.total.count).toBe(1)
    expect(next.total.byType.scale).toBe(1)
    expect(next.total.byDetail.scale).toEqual([{ name: 'C 大调音阶', count: 1 }])
    expect(next.daily).toHaveLength(1)
    expect(next.daily[0].totalCount).toBe(1)
    expect(next.daily[0].byDetail.scale).toEqual([{ name: 'C 大调音阶', count: 1 }])
  })

  it('连续两次记录后，第一次的结果快照必须保持原样', () => {
    const s0 = emptyStats()
    const s1 = applyPracticeRecord(s0, { type: 'scale', detailName: 'C 大调音阶', today: '2026-09-17' })
    const snapshot = JSON.parse(JSON.stringify(s1))
    const s2 = applyPracticeRecord(s1, { type: 'scale', detailName: 'C 大调音阶', today: '2026-09-17' })

    expect(s1).toEqual(snapshot)          // 旧快照未被第二次调用改写
    expect(s2.total.count).toBe(2)
    expect(s2.total.byDetail.scale).toEqual([{ name: 'C 大调音阶', count: 2 }])
    expect(s2.daily[0].totalCount).toBe(2)
    expect(s2.daily[0].byDetail.scale).toEqual([{ name: 'C 大调音阶', count: 2 }])
  })

  it('嵌套对象身份必须变化（否则 memo 子树不会更新）', () => {
    const s0 = emptyStats()
    const s1 = applyPracticeRecord(s0, { type: 'scale', detailName: 'C 大调音阶', today: '2026-09-17' })
    const s2 = applyPracticeRecord(s1, { type: 'scale', detailName: 'C 大调音阶', today: '2026-09-17' })

    expect(s2.total).not.toBe(s1.total)
    expect(s2.total.byDetail).not.toBe(s1.total.byDetail)
    expect(s2.total.byDetail.scale).not.toBe(s1.total.byDetail.scale)
    expect(s2.total.byDetail.scale[0]).not.toBe(s1.total.byDetail.scale[0])
    expect(s2.daily[0]).not.toBe(s1.daily[0])
    expect(s2.daily[0].byDetail).not.toBe(s1.daily[0].byDetail)
  })
})

describe('applyPracticeRecord：聚合正确性', () => {
  it('按类型 / 按详情 / 按天分别累计', () => {
    let s = emptyStats()
    s = applyPracticeRecord(s, { type: 'scale', detailName: 'C 大调音阶', today: '2026-09-17' })
    s = applyPracticeRecord(s, { type: 'chord_exercise', detailName: '根音+三音', today: '2026-09-17' })
    s = applyPracticeRecord(s, { type: 'scale', detailName: 'D 多里安音阶', today: '2026-09-17' })
    s = applyPracticeRecord(s, { type: 'scale', detailName: 'C 大调音阶', today: '2026-09-17' })

    expect(s.total.count).toBe(4)
    expect(s.total.byType.scale).toBe(3)
    expect(s.total.byType.chord_exercise).toBe(1)
    expect(s.total.byType.interval).toBe(0)
    expect(s.total.byDetail.scale).toEqual([
      { name: 'C 大调音阶', count: 2 },
      { name: 'D 多里安音阶', count: 1 },
    ])
    expect(s.total.byDetail.chord_exercise).toEqual([{ name: '根音+三音', count: 1 }])

    expect(s.daily).toHaveLength(1)
    expect(s.daily[0].date).toBe('2026-09-17')
    expect(s.daily[0].totalCount).toBe(4)
    expect(s.daily[0].byType.scale).toBe(3)
    expect(s.daily[0].byDetail.scale).toEqual([
      { name: 'C 大调音阶', count: 2 },
      { name: 'D 多里安音阶', count: 1 },
    ])
  })

  it('跨天：各自建条目，且 daily 按日期倒序', () => {
    let s = emptyStats()
    s = applyPracticeRecord(s, { type: 'scale', detailName: 'C 大调音阶', today: '2026-09-16' })
    s = applyPracticeRecord(s, { type: 'scale', detailName: 'C 大调音阶', today: '2026-09-17' })
    s = applyPracticeRecord(s, { type: 'scale', detailName: 'C 大调音阶', today: '2026-09-17' })

    expect(s.daily.map(d => [d.date, d.totalCount])).toEqual([
      ['2026-09-17', 2],
      ['2026-09-16', 1],
    ])
    expect(s.total.count).toBe(3)
  })

  it('超过 90 天的日期条目应被裁掉', () => {
    const old = new Date()
    old.setDate(old.getDate() - 200)
    const oldDate = `${old.getFullYear()}-${String(old.getMonth() + 1).padStart(2, '0')}-${String(old.getDate()).padStart(2, '0')}`

    let s = emptyStats()
    s = applyPracticeRecord(s, { type: 'scale', detailName: '很久以前', today: oldDate })
    expect(s.daily).toHaveLength(0)
    // 但累计总计不受影响（历史总量仍保留）
    expect(s.total.count).toBe(1)

    s = applyPracticeRecord(s, { type: 'scale', detailName: '今天', today: '2026-09-17' })
    expect(s.daily.map(d => d.date)).toEqual(['2026-09-17'])
  })
})
