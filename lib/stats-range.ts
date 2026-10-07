// 按时间范围聚合练习统计（从 app/page.tsx 抽出，逻辑未改动）
//
// 说明：原来的实现直接闭包引用组件的 practiceStats；抽出后改为显式入参，
// 好处是可单测（构造任意 daily 数据即可验证时间边界），也避免函数体依赖组件状态。
// 时间边界的计算全部走 lib/utils 的「本地时区」工具——不要改回
// new Date().toISOString().split('T')[0]，那在 UTC+8 凌晨会算成前一天。
import { getLocalDateString, getLocalDayStart, getLocalDaysAgoStart, getLocalMonthsAgoStart } from "@/lib/utils"
import type { PracticeDetail, PracticeStats, PracticeType, StatsTimeRange } from "@/lib/page-stats-types"

/** 按时间范围聚合后的统计结果（getStatsByTimeRange 的返回结构） */
export interface StatsByTimeRangeResult {
  count: number
  byType: Record<PracticeType, number>
  byDetail: Record<PracticeType, PracticeDetail[]>
}

export const getStatsByTimeRange = (stats: PracticeStats, range: StatsTimeRange): StatsByTimeRangeResult => {
  // 使用本地时区的日期范围边界，避免 UTC 偏移导致"今天/本周/本月"判断错误
  // 旧代码使用 new Date().toISOString().split('T')[0] 得到的是 UTC 日期，
  // 在 UTC+8 时区凌晨 0-8 点会返回前一天，导致"今天"显示错误。
  const todayLocal = getLocalDateString(new Date())

  let startDate: Date
  switch (range) {
    case 'today':
      // 今天的本地 0 点
      startDate = getLocalDayStart(todayLocal)
      break
    case 'week':
      // 7 天前的本地 0 点（滑动窗口）
      startDate = getLocalDaysAgoStart(7)
      break
    case 'month':
      // 1 个月前的本地 0 点
      startDate = getLocalMonthsAgoStart(1)
      break
    case 'total':
    default:
      return stats.total
  }

  // daily 中的 date 是 YYYY-MM-DD 格式（本地日期），需要按本地时区解析
  const filtered = stats.daily.filter(d => {
    const parts = d.date.split('-')
    if (parts.length !== 3) return false
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    return date >= startDate
  })
  
  interface StatsResult {
    count: number
    byType: Record<PracticeType, number>
    byDetail: Record<PracticeType, Array<{ name: string; count: number }>>
  }
  
  const result: StatsResult = {
    count: 0,
    byType: {
      pitch_finding: 0,
      scale: 0,
      chord_exercise: 0,
      interval: 0,
      chord_progression: 0
    },
    byDetail: {
      pitch_finding: [],
      scale: [],
      chord_exercise: [],
      interval: [],
      chord_progression: []
    }
  }
  
  filtered.forEach(day => {
    // 确保 totalCount 是数字
    const count = typeof day.totalCount === 'number' ? day.totalCount : 0
    result.count += count
    
    // 确保 byType 存在
    if (day.byType && typeof day.byType === 'object') {
      (Object.keys(day.byType) as PracticeType[]).forEach(type => {
        const typeCount = typeof day.byType[type] === 'number' ? day.byType[type] : 0
        result.byType[type] += typeCount
      })
    }
    
    // 确保 byDetail 存在
    if (day.byDetail && typeof day.byDetail === 'object') {
      (Object.keys(day.byDetail) as PracticeType[]).forEach(type => {
        const details = day.byDetail[type]
        if (Array.isArray(details)) {
          details.forEach(detail => {
            if (detail && typeof detail === 'object' && typeof detail.count === 'number') {
              const existing = result.byDetail[type].find(d => d.name === detail.name)
              if (existing) {
                existing.count += detail.count
              } else {
                result.byDetail[type].push({ name: detail.name, count: detail.count })
              }
            }
          })
        }
      })
    }
  })
  
  return result
}
