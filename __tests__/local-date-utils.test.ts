/**
 * 本地时区日期工具的边界测试。
 *
 * 这套工具的存在意义就是「按本地时区算日期」——项目历史上踩过两次：
 *   1) 用 `new Date().toISOString().split('T')[0]` 取「今天」，在 UTC+8 凌晨 0-8 点
 *      会返回前一天，导致「今天」的统计显示错误；
 *   2) `getLocalMonthsAgoStart` 用 `setMonth(getMonth()-1)`，3/31 减一个月溢出成 3/3，
 *      使「本月」统计窗口凭空少几天（3 月的 1 号、2 号记录被漏掉）。
 *
 * 这里把三件事分开钉死：**本地午夜**、**跨月/跨年回退**、**月末夹取**。
 * 全部传入显式 `from`，不依赖「今天是几号」，所以任何一天跑结果都一样。
 */
import { describe, it, expect } from 'vitest'
import {
  getLocalDateString,
  getLocalDayStart,
  getLocalDaysAgoStart,
  getLocalMonthsAgoStart,
} from '@/lib/utils'

const atMidnight = (d: Date) =>
  d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

describe('getLocalDateString', () => {
  it('按本地时区取 YYYY-MM-DD（不是 UTC）', () => {
    // 本地 0:30 —— 若是 UTC 实现，在 UTC+8 会退到前一天
    expect(getLocalDateString(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05')
    // 本地 23:30 —— 若是 UTC 实现，在 UTC- 时区会进到后一天
    expect(getLocalDateString(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })

  it('补零到两位', () => {
    expect(getLocalDateString(new Date(2026, 8, 9))).toBe('2026-09-09')
  })
})

describe('getLocalDayStart', () => {
  it('字符串 YYYY-MM-DD 按本地时区解析，得到本地午夜（不是 UTC 午夜）', () => {
    const d = getLocalDayStart('2026-09-20')
    expect(atMidnight(d)).toBe(true)
    expect(ymd(d)).toBe('2026-09-20')
    // 关键点：new Date('2026-09-20') 是 UTC 午夜，在 UTC+8 本地时间是 08:00
    expect(d.getTime()).toBe(new Date(2026, 8, 20, 0, 0, 0, 0).getTime())
  })

  it('传 Date 时清零时分秒', () => {
    const d = getLocalDayStart(new Date(2026, 8, 20, 15, 42, 7, 123))
    expect(atMidnight(d)).toBe(true)
    expect(ymd(d)).toBe('2026-09-20')
  })
})

describe('getLocalDaysAgoStart', () => {
  it('回退 N 天，跨月跨年正确', () => {
    expect(ymd(getLocalDaysAgoStart(7, new Date(2026, 0, 3)))).toBe('2025-12-27')
    expect(ymd(getLocalDaysAgoStart(7, new Date(2026, 8, 20)))).toBe('2026-09-13')
  })

  it('0 天 = 当天本地午夜', () => {
    const from = new Date(2026, 8, 20, 18, 0)
    expect(getLocalDaysAgoStart(0, from).getTime()).toBe(getLocalDayStart(from).getTime())
  })

  it('结果始终是本地午夜', () => {
    expect(atMidnight(getLocalDaysAgoStart(90, new Date(2026, 8, 20, 13, 5)))).toBe(true)
  })
})

describe('getLocalMonthsAgoStart', () => {
  it('普通情况：同一天往回一个月', () => {
    expect(ymd(getLocalMonthsAgoStart(1, new Date(2026, 8, 20)))).toBe('2026-08-20')
    expect(ymd(getLocalMonthsAgoStart(3, new Date(2026, 8, 20)))).toBe('2026-06-20')
  })

  it('跨年回退正确（1/31 减 1 个月 → 上一年 12/31）', () => {
    expect(ymd(getLocalMonthsAgoStart(1, new Date(2026, 0, 31)))).toBe('2025-12-31')
    expect(ymd(getLocalMonthsAgoStart(2, new Date(2026, 0, 15)))).toBe('2025-11-15')
  })

  it('月末夹取：目标月没有该日时取该月最后一天，而不是溢到下个月', () => {
    // 修复前：3/31 减 1 个月 → setMonth 溢出 → 3/3（2 月没有 31 日）
    expect(ymd(getLocalMonthsAgoStart(1, new Date(2026, 2, 31)))).toBe('2026-02-28')
    // 闰年
    expect(ymd(getLocalMonthsAgoStart(1, new Date(2024, 2, 31)))).toBe('2024-02-29')
    // 5/31 减 1 个月 → 4 月只有 30 天
    expect(ymd(getLocalMonthsAgoStart(1, new Date(2026, 4, 31)))).toBe('2026-04-30')
    // 5/31 减 3 个月 → 2 月
    expect(ymd(getLocalMonthsAgoStart(3, new Date(2026, 4, 31)))).toBe('2026-02-28')
    // 7/31 减 1 个月 → 6 月只有 30 天
    expect(ymd(getLocalMonthsAgoStart(1, new Date(2026, 6, 31)))).toBe('2026-06-30')
  })

  it('月末夹取时也跨年正确（3/31 减 4 个月 → 上一年 11/30）', () => {
    expect(ymd(getLocalMonthsAgoStart(4, new Date(2026, 2, 31)))).toBe('2025-11-30')
  })

  it('0 个月 = 当天本地午夜', () => {
    const from = new Date(2026, 8, 20, 18, 0)
    expect(getLocalMonthsAgoStart(0, from).getTime()).toBe(getLocalDayStart(from).getTime())
  })

  it('结果始终是本地午夜', () => {
    expect(atMidnight(getLocalMonthsAgoStart(1, new Date(2026, 2, 31)))).toBe(true)
    expect(atMidnight(getLocalMonthsAgoStart(4, new Date(2026, 2, 31)))).toBe(true)
  })
})
