// 统计模块类型定义（从 app/page.tsx 抽出，内容未改动）

export type PracticeType = 'pitch_finding' | 'scale' | 'chord_exercise' | 'interval' | 'chord_progression'

// 练习详情记录
export interface PracticeDetail {
  name: string        // 练习名称（如：大七和弦、多里安音阶）
  count: number       // 练习次数
}

// 每日统计
export interface DailyStats {
  date: string        // 日期 YYYY-MM-DD
  totalCount: number  // 当日总练习次数
  byType: Record<PracticeType, number>  // 按练习类型统计
  byDetail: Record<PracticeType, PracticeDetail[]>  // 按详细类型统计
}

// 统计数据结构
export interface PracticeStats {
  daily: DailyStats[]     // 每日统计（保留最近30天）
  total: {
    count: number
    byType: Record<PracticeType, number>
    byDetail: Record<PracticeType, PracticeDetail[]>
  }
}

// 统计时间范围
export type StatsTimeRange = 'today' | 'week' | 'month' | 'total'


