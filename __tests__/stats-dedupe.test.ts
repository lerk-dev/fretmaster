/**
 * deduplicateStats：相邻 duration 时间窗去重 **不得误杀合法短会话**
 *
 * 背景：duration 的语义是「本次会话耗时」（hooks/use-practice-stats.ts 注释明确），
 * 且会话结束时才写一条。原实现用 `max(prev.duration, cur.duration)` 做时间窗基准：
 *   记录1 和弦转换 C，duration 60s，结束于 T
 *   记录2 和弦转换 C，duration 20s，结束于 T+25s   ← 合法：一次短练习
 *   判断：gap(25) < max(60,20)=60  →  记录2 被判为重复并删除
 * 而按注释本来想表达的是「这条自己声称耗时 X，却距上一条不到 X 秒 —— 不可能」，
 * 基准应当是**当前记录自己的** duration。现改为 `cur.duration`。
 */
import { describe, it, expect } from 'vitest'
import { deduplicateStats } from '@/lib/export-utils'
import type { PracticeStats } from '@/lib/stats-api'

const rec = (o: Partial<PracticeStats> & { created_at: string }): PracticeStats => ({
  exercise_type: 'chord_progression',
  score: 100,
  duration: 60,
  notes: '练习项目: C 和弦',
  ...o,
})

describe('deduplicateStats：duration 时间窗去重', () => {
  it('长会话后紧跟一条更短的会话（间隔小于前者 duration）应保留两条', () => {
    const stats = [
      rec({ id: 1, created_at: '2026-09-18 00:01:00', duration: 60 }),
      rec({ id: 2, created_at: '2026-09-18 00:01:25', duration: 20 }),
    ]
    // 旧实现 max(60,20)=60 → 25 < 60 → 误删；现在基准 20 → 25 > 20 → 保留
    expect(deduplicateStats(stats)).toHaveLength(2)
  })

  it('真重复（间隔小于本条自己声称的 duration）仍应被去掉', () => {
    const stats = [
      rec({ id: 1, created_at: '2026-09-18 00:01:00', duration: 60 }),
      rec({ id: 2, created_at: '2026-09-18 00:01:01', duration: 60 }),
    ]
    expect(deduplicateStats(stats)).toHaveLength(1)
  })

  it('详情不同则不受时间窗影响', () => {
    const stats = [
      rec({ id: 1, created_at: '2026-09-18 00:01:00', duration: 60 }),
      rec({ id: 2, created_at: '2026-09-18 00:01:01', duration: 60, notes: '练习项目: G 和弦' }),
    ]
    expect(deduplicateStats(stats)).toHaveLength(2)
  })

  it('类型不同则不受时间窗影响', () => {
    const stats = [
      rec({ id: 1, created_at: '2026-09-18 00:01:00', duration: 60 }),
      rec({ id: 2, created_at: '2026-09-18 00:01:01', duration: 60, exercise_type: 'scale' }),
    ]
    expect(deduplicateStats(stats)).toHaveLength(2)
  })

  it('pitch_finding 完全不应用时间窗（每答对一题一条，duration 是会话累计）', () => {
    const stats = [
      rec({ id: 1, created_at: '2026-09-18 00:01:00', duration: 600, exercise_type: 'pitch_finding' }),
      rec({ id: 2, created_at: '2026-09-18 00:01:03', duration: 600, exercise_type: 'pitch_finding' }),
    ]
    expect(deduplicateStats(stats)).toHaveLength(2)
  })

  it('同一秒内同类型同详情仍按「不可能完成两次」去重', () => {
    const stats = [
      rec({ id: 1, created_at: '2026-09-18 00:01:00', duration: 60 }),
      rec({ id: 2, created_at: '2026-09-18 00:01:00', duration: 60 }),
    ]
    expect(deduplicateStats(stats)).toHaveLength(1)
  })
})
