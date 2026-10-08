import { describe, it, expect } from 'vitest'
import { deduplicateStats, exportToCSV, exportToJSON } from '@/lib/export-utils'
import type { PracticeStats } from '@/lib/native-stats'

/**
 * 「时间戳缺失」是导出链路上最危险的输入形态。
 *
 * 缝隙（探针已证，修复前）：
 *   parseDbTimestamp 对空值/非法值回退成 `new Date()`，于是
 *   ① 模糊去重键 `t:${ts}|type|detail` 里的 ts 变成「当前毫秒」，
 *      一批无时间戳记录在同一毫秒内塌缩到同一个 key ⇒ **互相吞掉**。
 *      实测：3 条无时间戳记录导出后只剩 1 条。
 *   ② 排序 comparator 每被调用一次就取到一个全新的 now ⇒ 比较不可传递，
 *      同一批数据两次导出的顺序可能不同。
 *
 * ⚠️ 修复点刻意放在 export-utils（去重/排序层），**不动 parseDbTimestamp**：
 * 它的兜底语义已被 __tests__/stats-panel-export.test.ts 钉住，属于既定契约。
 */

const noTs = (over: Partial<PracticeStats> = {}): PracticeStats => ({
  exercise_type: 'scale',
  score: 80,
  duration: 60,
  notes: '-',
  ...over,
})

const withTs = (created_at: string, over: Partial<PracticeStats> = {}): PracticeStats =>
  noTs({ created_at, ...over })

describe('无时间戳记录：不得被互相去重吞掉', () => {
  it('3 条同类型同详情、时间戳全缺失 → 3 条全保留（修复前只剩 1 条）', () => {
    const input = [noTs({ score: 80 }), noTs({ score: 90 }), noTs({ score: 70 })]
    const out = deduplicateStats(input)
    expect(out).toHaveLength(3)
    expect(out.map((r) => r.score).sort((a, b) => a - b)).toEqual([70, 80, 90])
  })

  it('created_at / date 均为空串 → 同样不被吞', () => {
    const input = [
      noTs({ created_at: '', date: '', score: 1 }),
      noTs({ created_at: '', date: '', score: 2 }),
    ]
    expect(deduplicateStats(input)).toHaveLength(2)
  })

  it('两个字段全缺（undefined）→ 同样不被吞', () => {
    const input = [noTs({ score: 1 }), noTs({ score: 2 }), noTs({ score: 3 })]
    expect(deduplicateStats(input)).toHaveLength(3)
  })

  it('导出 CSV / JSON 时条数一致，摘要 totalSessions 反映真实条数', () => {
    const input = [noTs({ score: 1 }), noTs({ score: 2 }), noTs({ score: 3 })]
    const csv = exportToCSV(input, { format: 'csv', language: 'zh-CN' })
    // 表头 1 行 + 数据 3 行
    expect(csv.split('\n')).toHaveLength(4)

    const json = JSON.parse(exportToJSON(input, { format: 'json', language: 'zh-CN' }))
    expect(json.summary.totalSessions).toBe(3)
    expect(json.records).toHaveLength(3)
  })

  it('无时间戳但带 id 时，id 去重仍生效（不能借修复之名把去重整个关掉）', () => {
    const input = [noTs({ id: 7, score: 50 }), noTs({ id: 7, score: 99 })]
    const out = deduplicateStats(input)
    expect(out).toHaveLength(1)
    expect(out[0].score).toBe(50)
  })
})

describe('有真实时间戳时：去重语义必须原样保留', () => {
  it('同一秒内同类型同详情 → 仍视为重复，只留第一条', () => {
    const input = [
      withTs('2026-10-08 02:00:00', { score: 80 }),
      withTs('2026-10-08 02:00:00', { score: 90 }),
    ]
    const out = deduplicateStats(input)
    expect(out).toHaveLength(1)
    expect(out[0].score).toBe(80)
  })

  it('同一毫秒也仍是重复（毫秒级精度不放松）', () => {
    const input = [
      withTs('2026-10-08T02:00:00.000Z', { score: 80 }),
      withTs('2026-10-08T02:00:00.000Z', { score: 90 }),
    ]
    expect(deduplicateStats(input)).toHaveLength(1)
  })

  it('相隔足够远的两次同类型同详情 → 都保留', () => {
    const input = [
      withTs('2026-10-08 02:00:00', { score: 80 }),
      withTs('2026-10-08 03:00:00', { score: 90 }),
    ]
    expect(deduplicateStats(input)).toHaveLength(2)
  })

  it('时长区间重叠的相邻记录 → 后者被吞（min(duration) 判据不被修复破坏）', () => {
    // 倒序遍历下两条相隔 20s，各自的 duration 都 > 20s ⇒ 区间重叠 ⇒ 判重复
    const input = [
      withTs('2026-10-08 02:00:20', { score: 90, duration: 60 }),
      withTs('2026-10-08 02:00:00', { score: 80, duration: 60 }),
    ]
    expect(deduplicateStats(input)).toHaveLength(1)
  })
})

describe('排序稳定性', () => {
  it('同一批无时间戳记录连续两次去重，顺序必须一致', () => {
    const input = [
      noTs({ score: 1 }),
      noTs({ score: 2 }),
      noTs({ score: 3 }),
      noTs({ score: 4 }),
      noTs({ score: 5 }),
    ]
    const a = deduplicateStats(input).map((r) => r.score)
    const b = deduplicateStats(input).map((r) => r.score)
    expect(a).toEqual(b)
  })

  it('有 / 无时间戳混排：有时间的按倒序在前，无时间的沉到末尾', () => {
    const input = [
      noTs({ score: 99 }),
      withTs('2026-10-08 02:00:00', { score: 80 }),
      withTs('2026-10-09 02:00:00', { score: 90 }),
    ]
    const out = deduplicateStats(input)
    expect(out.map((r) => r.score)).toEqual([90, 80, 99])
  })
})
