/**
 * getStatsByTimeRange —— 从 app/page.tsx 搬到 lib/stats-range.ts 后的行为断言。
 *
 * 这块逻辑的价值全在**时间边界的时区处理**上（原代码注释反复警告过：
 * 曾经用 `new Date().toISOString().split('T')[0]` 取"今天"，
 * 在 UTC+8 凌晨 0-8 点会算成前一天，导致"今天"的统计显示错误）。
 * 搬成纯函数后可以不依赖组件、直接构造 daily 数据来钉住边界。
 *
 * 测试构造日期的方式：不硬编码 "昨天/7 天前" 的字面值，而是先用同一套
 * lib/utils 工具算出边界，再取「边界 +1 天」当作应在窗口内的样本、
 * 「边界 -1 天」当作应在窗口外的样本。这样任何一天跑都不会因跨月/跨年而漂。
 *
 * 关于 getLocalMonthsAgoStart 的月末夹取 —— 更正一条过时记录：
 * 本文件原注释称「`setMonth(getMonth() - 1)` 在 3/31 这类月末会向前溢出
 * （3/31 → 3/3），使"本月"窗口短几天，属既有行为」。那描述**已经过期**：
 * lib/utils.ts 的 getLocalMonthsAgoStart 已改为显式构造目标日期、超出目标月
 * 末时夹到最后一天（3/31 减一月 → 2/28，闰年 2/29）。对应断言在
 * local-date-utils.test.ts（「月末夹取」一节），此处不重复。
 */
import { describe, it, expect, vi } from 'vitest'
import { getStatsByTimeRange } from '@/lib/stats-range'
import {
  getLocalDateString,
  getLocalDayStart,
  getLocalDaysAgoStart,
  getLocalMonthsAgoStart,
} from '@/lib/utils'
import type { DailyStats, PracticeDetail, PracticeStats, PracticeType } from '@/lib/page-stats-types'

const TYPES: PracticeType[] = [
  'pitch_finding',
  'scale',
  'chord_exercise',
  'interval',
  'chord_progression',
]

const DAY_MS = 24 * 60 * 60 * 1000
const shift = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS)
const dateStr = (d: Date) => getLocalDateString(d)

const emptyByType = () =>
  TYPES.reduce((acc, t) => ({ ...acc, [t]: 0 }), {} as Record<PracticeType, number>)
const emptyByDetail = () =>
  TYPES.reduce((acc, t) => ({ ...acc, [t]: [] }), {} as Record<PracticeType, PracticeDetail[]>)

const day = (
  date: string,
  totalCount: number,
  byType: Partial<Record<PracticeType, number>> = {},
  byDetail: Partial<Record<PracticeType, PracticeDetail[]>> = {}
): DailyStats => ({
  date,
  totalCount,
  byType: { ...emptyByType(), ...byType },
  byDetail: { ...emptyByDetail(), ...byDetail },
})

const statsOf = (daily: DailyStats[]): PracticeStats => ({
  daily,
  total: {
    count: 999,
    byType: { ...emptyByType(), scale: 999 },
    byDetail: { ...emptyByDetail(), scale: [{ name: '总计', count: 999 }] },
  },
})

describe('getStatsByTimeRange', () => {
  it("range = total：直接返回 stats.total（同一对象，不重新聚合）", () => {
    const stats = statsOf([day(dateStr(new Date()), 5)])
    expect(getStatsByTimeRange(stats, 'total')).toBe(stats.total)
  })

  describe('时间边界', () => {
    it('today：只统计「今天本地 0 点」当天的记录', () => {
      const todayStart = getLocalDayStart(dateStr(new Date()))
      const stats = statsOf([
        day(dateStr(todayStart), 3, { scale: 3 }),
        day(dateStr(shift(todayStart, -1)), 7, { scale: 7 }),
      ])
      const r = getStatsByTimeRange(stats, 'today')
      expect(r.count).toBe(3)
      expect(r.byType.scale).toBe(3)
    })

    it('week：窗口是「7 天前的本地 0 点」起（边界当天算在内，再早一天不算）', () => {
      const weekStart = getLocalDaysAgoStart(7)
      const stats = statsOf([
        day(dateStr(shift(weekStart, 1)), 2, { interval: 2 }),
        day(dateStr(weekStart), 5, { interval: 5 }),
        day(dateStr(shift(weekStart, -1)), 9, { interval: 9 }),
      ])
      const r = getStatsByTimeRange(stats, 'week')
      expect(r.count).toBe(7)
      expect(r.byType.interval).toBe(7)
    })

    it('month：窗口是「1 个月前的本地 0 点」起', () => {
      const monthStart = getLocalMonthsAgoStart(1)
      const stats = statsOf([
        day(dateStr(shift(monthStart, 1)), 4, { chord_exercise: 4 }),
        day(dateStr(shift(monthStart, -1)), 8, { chord_exercise: 8 }),
      ])
      const r = getStatsByTimeRange(stats, 'month')
      expect(r.count).toBe(4)
      expect(r.byType.chord_exercise).toBe(4)
    })

    it('today 的窗口窄于 week：同一天数据在两个范围下得到不同结果', () => {
      const todayStart = getLocalDayStart(dateStr(new Date()))
      const stats = statsOf([
        day(dateStr(todayStart), 1),
        day(dateStr(shift(todayStart, -3)), 10),
      ])
      expect(getStatsByTimeRange(stats, 'today').count).toBe(1)
      expect(getStatsByTimeRange(stats, 'week').count).toBe(11)
    })

    it('月末（3/31）查「本月」：窗口起于 2/28，3/1、3/2 的记录不能被漏掉', () => {
      // 这条是 getLocalMonthsAgoStart 月末溢出 bug 的**用户可见**回归：
      // 修复前 setMonth 把 3/31 减一个月算成 3/3，于是「本月」窗口从 3/3 起，
      // 3 月 1 号、2 号的练习记录在统计里凭空消失。
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date(2026, 2, 31, 12, 0, 0)) // 2026-03-31 本地中午
        const stats = statsOf([
          day('2026-03-01', 1, { scale: 1 }),
          day('2026-03-02', 2, { scale: 2 }),
          day('2026-02-28', 4, { scale: 4 }), // 边界当天（夹取到 2 月末）→ 算在内
          day('2026-02-27', 8, { scale: 8 }), // 边界前一天 → 排除
        ])
        const r = getStatsByTimeRange(stats, 'month')
        expect(r.count).toBe(7)
        expect(r.byType.scale).toBe(7)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('聚合', () => {
    it('跨天累加 totalCount 与 byType', () => {
      const todayStart = getLocalDayStart(dateStr(new Date()))
      const stats = statsOf([
        day(dateStr(todayStart), 3, { pitch_finding: 2, scale: 1 }),
        day(dateStr(todayStart), 4, { pitch_finding: 1, scale: 3 }),
      ])
      const r = getStatsByTimeRange(stats, 'today')
      expect(r.count).toBe(7)
      expect(r.byType.pitch_finding).toBe(3)
      expect(r.byType.scale).toBe(4)
      expect(r.byType.interval).toBe(0)
    })

    it('byDetail 按 name 合并计数（同名相加，异名各自保留）', () => {
      const todayStart = getLocalDayStart(dateStr(new Date()))
      const stats = statsOf([
        day(dateStr(todayStart), 5, {}, {
          chord_exercise: [
            { name: '大七和弦', count: 2 },
            { name: '挂留和弦', count: 1 },
          ],
        }),
        day(dateStr(todayStart), 6, {}, {
          chord_exercise: [
            { name: '大七和弦', count: 3 },
            { name: '小七和弦', count: 2 },
          ],
        }),
      ])
      const r = getStatsByTimeRange(stats, 'today')
      const details = r.byDetail.chord_exercise
      expect(details.find((d) => d.name === '大七和弦')?.count).toBe(5)
      expect(details.find((d) => d.name === '挂留和弦')?.count).toBe(1)
      expect(details.find((d) => d.name === '小七和弦')?.count).toBe(2)
      expect(details.length).toBe(3)
    })

    it('没有任何记录时返回零值结构（而不是 undefined）', () => {
      const r = getStatsByTimeRange(statsOf([]), 'week')
      expect(r.count).toBe(0)
      for (const t of TYPES) {
        expect(r.byType[t]).toBe(0)
        expect(r.byDetail[t]).toEqual([])
      }
    })

    it('返回的是新对象，不与入参共享引用（改结果不影响原数据）', () => {
      const todayStart = getLocalDayStart(dateStr(new Date()))
      const src = day(dateStr(todayStart), 1, { scale: 1 })
      const stats = statsOf([src])
      const r = getStatsByTimeRange(stats, 'today')
      r.byType.scale = 12345
      r.byDetail.scale.push({ name: 'x', count: 1 })
      expect(stats.daily[0].byType.scale).toBe(1)
      expect(src.byDetail.scale).toEqual([])
    })
  })

  describe('脏数据容错（统计来自 localStorage/SQLite，字段可能缺失或类型不对）', () => {
    it('日期格式非法（不是 YYYY-MM-DD）的整天被跳过，而不是抛异常', () => {
      const todayStart = getLocalDayStart(dateStr(new Date()))
      const stats = statsOf([
        day(dateStr(todayStart), 3),
        { ...day('2026/01/01', 100), date: '2026/01/01' },
        { ...day('', 200), date: '' },
      ])
      expect(() => getStatsByTimeRange(stats, 'today')).not.toThrow()
      expect(getStatsByTimeRange(stats, 'today').count).toBe(3)
    })

    it('totalCount 非数字按 0 计；byType 非数字按 0 计', () => {
      const todayStart = getLocalDayStart(dateStr(new Date()))
      const broken = {
        date: dateStr(todayStart),
        totalCount: 'oops',
        byType: { scale: 'oops', interval: 2 },
        byDetail: {},
      } as unknown as DailyStats
      const r = getStatsByTimeRange(statsOf([broken]), 'today')
      expect(r.count).toBe(0)
      expect(r.byType.scale).toBe(0)
      expect(r.byType.interval).toBe(2)
    })

    it('byDetail 的非法条目被忽略（缺 count、count 非数字、非数组）', () => {
      const todayStart = getLocalDayStart(dateStr(new Date()))
      const broken = {
        date: dateStr(todayStart),
        totalCount: 1,
        byType: {},
        byDetail: {
          scale: [{ name: 'ok', count: 2 }, { name: 'bad', count: 'x' }, null],
          interval: 'not-an-array',
        },
      } as unknown as DailyStats
      const r = getStatsByTimeRange(statsOf([broken]), 'today')
      expect(r.byDetail.scale).toEqual([{ name: 'ok', count: 2 }])
      expect(r.byDetail.interval).toEqual([])
    })
  })
})
