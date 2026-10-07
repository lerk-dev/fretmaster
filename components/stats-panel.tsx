// 统计页面：时间范围切换 · 导出（CSV/PDF/JSON/HTML）· 分类计数 · 明细分布 · 近期记录
"use client"

import { memo } from 'react'
import { BarChart3, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PracticeDetail, PracticeType, StatsTimeRange } from '@/lib/page-stats-types'
import type { PracticeStats as ServerPracticeStats } from '@/lib/stats-api'
import { dbTimestampToLocalDate, parseDbTimestamp } from '@/lib/utils'
import { useUser } from '@/lib/store'

interface StatsPanelProps {
  /** 翻译函数 */
  t: (key: string) => string
  /** 当前时间范围 */
  statsTimeRange: StatsTimeRange
  onStatsTimeRangeChange: (v: StatsTimeRange) => void
  /** 按时间范围取聚合统计 */
  getStatsByTimeRange: (range: StatsTimeRange) => { count: number; byType: Record<PracticeType, number>; byDetail: Record<PracticeType, PracticeDetail[]> }
  /** 近期练习记录 */
  recentRecords: ServerPracticeStats[]
}

/**
 * 统计页面（从 app/page.tsx 原样搬出，行为不变）。
时间范围切换（今天/本周/本月/总计）+ CSV/PDF/JSON/HTML 四种导出 + 总次数与分类计数 +
按练习类型的明细分布 + 近期练习记录列表（含兼容多种类型名的中文映射）+ 无数据占位。
 */
export const StatsPanel = memo(function StatsPanel({
  t,
  statsTimeRange,
  onStatsTimeRangeChange,
  getStatsByTimeRange,
  recentRecords,
}: StatsPanelProps) {
// language 来自 user（与页面一致）：导出与时间格式化都要用
  const user = useUser()
  const language = user.language

  return (
<Card>
  <CardHeader className="pb-3">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <CardTitle className="text-lg flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        {t('nav_stats')}
      </CardTitle>
      <div className="flex gap-1 flex-wrap">
        {[
          { key: 'today', label: t('stats_today') },
          { key: 'week', label: t('stats_week') },
          { key: 'month', label: t('stats_month') },
          { key: 'total', label: t('stats_total') },
        ].map((range) => (
          <Button
            key={range.key}
            variant={statsTimeRange === range.key ? "default" : "outline"}
            size="sm"
            onClick={() => onStatsTimeRangeChange(range.key as StatsTimeRange)}
            className="text-xs h-7 px-2 flex-1 sm:flex-none"
          >
            {range.label}
          </Button>
        ))}
        <div className="flex gap-1 ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 px-2"
            onClick={async () => {
              try {
                const { getAllPracticeStats } = await import('@/lib/stats-api')
                const { exportPracticeData } = await import('@/lib/export-utils')
                const allStats = await getAllPracticeStats()
                const result = await exportPracticeData(allStats, { format: 'csv', language: language as 'zh-CN' | 'en' })
                if (result.success) {
                  toast.success(result.path ? `${t('export_success')} ${result.path}` : t('export_success'))
                } else if (result.error !== 'cancelled') {
                  toast.error(t('export_failed'))
                }
              } catch {
                toast.error(t('export_failed'))
              }
            }}
          >
            <Download className="h-3 w-3 mr-1" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 px-2"
            onClick={async () => {
              try {
                const { getAllPracticeStats } = await import('@/lib/stats-api')
                const { exportPracticeData } = await import('@/lib/export-utils')
                const allStats = await getAllPracticeStats()
                const result = await exportPracticeData(allStats, { format: 'pdf', language: language as 'zh-CN' | 'en' })
                if (result.success) {
                  toast.success(result.path ? `${t('export_success')} ${result.path}` : t('export_success'))
                } else if (result.error !== 'cancelled') {
                  toast.error(t('export_failed'))
                }
              } catch {
                toast.error(t('export_failed'))
              }
            }}
          >
            <Download className="h-3 w-3 mr-1" />
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 px-2"
            onClick={async () => {
              try {
                const { getAllPracticeStats } = await import('@/lib/stats-api')
                const { exportPracticeData } = await import('@/lib/export-utils')
                const allStats = await getAllPracticeStats()
                const result = await exportPracticeData(allStats, { format: 'json', language: language as 'zh-CN' | 'en' })
                if (result.success) {
                  toast.success(result.path ? `${t('export_success')} ${result.path}` : t('export_success'))
                } else if (result.error !== 'cancelled') {
                  toast.error(t('export_failed'))
                }
              } catch {
                toast.error(t('export_failed'))
              }
            }}
          >
            <Download className="h-3 w-3 mr-1" />
            JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 px-2"
            onClick={async () => {
              try {
                const { getAllPracticeStats } = await import('@/lib/stats-api')
                const { exportPracticeData } = await import('@/lib/export-utils')
                const allStats = await getAllPracticeStats()
                const result = await exportPracticeData(allStats, { format: 'html', language: language as 'zh-CN' | 'en' })
                if (result.success) {
                  toast.success(result.path ? `${t('export_success')} ${result.path}` : t('export_success'))
                } else if (result.error !== 'cancelled') {
                  toast.error(t('export_failed'))
                }
              } catch {
                toast.error(t('export_failed'))
              }
            }}
          >
            <Download className="h-3 w-3 mr-1" />
            HTML
          </Button>
        </div>
      </div>
    </div>
  </CardHeader>
  <CardContent className="space-y-4">
    {(() => {
      const stats = getStatsByTimeRange(statsTimeRange)
      const practiceTypeNames: Record<PracticeType, string> = {
        pitch_finding: t('nav_practice'),
        scale: t('nav_scale'),
        chord_exercise: t('nav_chord_exercise'),
        interval: t('nav_interval'),
        chord_progression: t('nav_chord')
      }
      
      return (
        <>
          {/* 总练习次数*/}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            <div className="bg-primary/5 rounded-lg p-2 sm:p-3 text-center">
              <div className="text-xl sm:text-2xl font-bold text-primary">{stats.count}</div>
              <div className="text-2xs sm:text-xs text-muted-foreground">{t('stats_total_practices')}</div>
            </div>
            {(Object.keys(stats.byType) as PracticeType[]).map(type => (
              <div key={type} className="bg-card/50 rounded-lg p-2 sm:p-3 text-center border border-border/30">
                <div className="text-lg sm:text-xl font-semibold">{stats.byType[type] || 0}</div>
                <div className="text-2xs sm:text-xs text-muted-foreground">{practiceTypeNames[type]}</div>
              </div>
            ))}
          </div>
          
          {/* 详细统计 - 找音练习和音程练习不显示详细分类 */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">{t('stats_detail_breakdown')}</h4>
            {(Object.keys(stats.byDetail) as PracticeType[])
              .filter(type => type !== 'pitch_finding' && type !== 'interval')
              .map(type => {
                const details = stats.byDetail[type]
                if (!details || details.length === 0) return null
                
                return (
                  <div key={type} className="bg-card/30 rounded-lg p-3 border border-border/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{practiceTypeNames[type]}</span>
                      <span className="text-xs text-muted-foreground">{t('stats_count')}: {stats.byType[type] || 0}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[...details]
                        .sort((a, b) => b.count - a.count)
                        .map(detail => (
                          <span
                            key={detail.name}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full"
                          >
                            {detail.name}
                            <span className="bg-primary/20 px-1 rounded text-2xs">{detail.count}</span>
                          </span>
                        ))}
                    </div>
                  </div>
                )
              })}
          </div>
          
          {/* 近期练习记录列表 */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">{t('stats_recent_records')}</h4>
            {recentRecords.length === 0 ? (
              <div className="text-center py-4 text-xs text-muted-foreground">
                {t('stats_recent_empty')}
              </div>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {recentRecords.map((rec, idx) => {
                  const dt = parseDbTimestamp(rec.created_at || rec.date)
                  const dateStr = isNaN(dt.getTime()) ? '-' : dbTimestampToLocalDate(rec.created_at || rec.date)
                  const timeStr = isNaN(dt.getTime()) ? '-' : dt.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })
                  // 提取练习项目名（兼容 "练习项目: xxx" 格式）
                  const notesStr = rec.notes || ''
                  const m = notesStr.match(/练习项目[:：]\s*(.+)/)
                  const detailName = m ? m[1].trim() : (notesStr.trim() || '-')
                  // 类型中文名映射
                  const typeDisplayMap: Record<string, string> = {
                    'pitch_finding': t('nav_practice'),
                    'find_note': t('nav_practice'),
                    '音高识别': t('nav_practice'),
                    '找音练习': t('nav_practice'),
                    'scale': t('nav_scale'),
                    '音阶练习': t('nav_scale'),
                    'chord_exercise': t('nav_chord_exercise'),
                    '和弦练习': t('nav_chord_exercise'),
                    'interval': t('nav_interval'),
                    '音程练习': t('nav_interval'),
                    'chord_progression': t('nav_chord'),
                    '和弦进行': t('nav_chord'),
                    '练习': t('nav_practice'),
                  }
                  const typeDisplay = typeDisplayMap[rec.exercise_type || rec.exerciseType || ''] || rec.exercise_type || rec.exerciseType || '-'
                  const acc = rec.accuracy != null ? Math.round(rec.accuracy <= 1 ? rec.accuracy * 100 : rec.accuracy) : null
                  return (
                    <div key={rec.id ?? idx} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-card/30 rounded border border-border/20 text-xs">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-muted-foreground tabular-nums shrink-0">{dateStr} {timeStr}</span>
                        <span className="text-primary shrink-0">{typeDisplay}</span>
                        <span className="truncate text-muted-foreground">{detailName}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-muted-foreground tabular-nums">
                        {acc != null && <span>{acc}%</span>}
                        {rec.duration ? <span>{rec.duration}{t('stats_duration_sec')}</span> : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          
          {stats.count === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('stats_no_data')}</p>
              <p className="text-xs mt-1">{t('stats_start_practicing')}</p>
            </div>
          )}
        </>
      )
    })()}
  </CardContent>
</Card>
  )
})
