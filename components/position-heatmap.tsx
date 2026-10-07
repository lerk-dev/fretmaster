'use client'

// 指板掌握度热力图
// 展示找音练习逐位置统计（弦 × 品）的正确率：
// - 绿色 = 熟练（正确率高）
// - 红色 = 薄弱（正确率低）
// - 无数据 = 中性底色
// 数据变化时通过 subscribePositionStats 实时刷新

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Flame, Trash2 } from 'lucide-react'
import { TRANSLATIONS } from '@/lib/i18n'
import { resolveInstrumentConfig, InstrumentType } from '@/lib/practice-suggestions'
import { getPositionStat, clearPositionStats, subscribePositionStats } from '@/lib/position-stats'
import { logger } from '@/lib/logger'

interface PositionHeatmapProps {
  instrument: InstrumentType
  fretCount: number
  language: string
}

/** 正确率 → 热力颜色（0% 红 → 100% 绿，HSL 插值） */
function accuracyColor(accuracy: number): string {
  // hue: 0(红) → 145(绿)
  const hue = Math.round(accuracy * 145)
  return `hsl(${hue} 70% 42%)`
}

export function PositionHeatmap({ instrument, fretCount, language }: PositionHeatmapProps) {
  const [, setTick] = useState(0)
  const t = (key: string) => {
    const translations = TRANSLATIONS[language as 'zh-CN' | 'en'] as Record<string, string>
    return translations?.[key] || key
  }

  // 订阅数据变化（记录/清空后刷新）
  useEffect(() => {
    return subscribePositionStats(() => setTick(v => v + 1))
  }, [])

  const config = resolveInstrumentConfig(instrument)
  const stringCount = config.stringCount

  // 汇总数据（每次渲染直接读取缓存，数据量小：弦数 × 品数）
  const snapshot = (() => {
    const cells: { stringIndex: number; fret: number; total: number; correct: number }[] = []
    let totalSum = 0
    let correctSum = 0
    let covered = 0
    for (let s = 0; s < stringCount; s++) {
      for (let f = 0; f <= fretCount; f++) {
        const stat = getPositionStat(instrument, s, f)
        if (!stat || stat.total === 0) continue
        cells.push({ stringIndex: s, fret: f, total: stat.total, correct: stat.correct })
        totalSum += stat.total
        correctSum += stat.correct
        covered++
      }
    }
    return { cells, totalSum, correctSum, covered }
  })()

  const hasData = snapshot.covered > 0
  const overallAccuracy = snapshot.totalSum > 0 ? snapshot.correctSum / snapshot.totalSum : 0

  const handleClear = async () => {
    if (!window.confirm(t('position_heatmap_clear_confirm'))) return
    try {
      await clearPositionStats(instrument)
    } catch (e) {
      logger.error('清空位置统计失败', e)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Flame className="h-5 w-5 text-primary" />
            {t('position_heatmap')}
          </CardTitle>
          {hasData && (
            <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={handleClear}>
              <Trash2 className="h-3 w-3 mr-1" />
              {t('position_heatmap_clear')}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t('position_heatmap_desc')}</p>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            {t('position_heatmap_no_data')}
          </div>
        ) : (
          <div className="space-y-3">
            {/* 汇总 */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                {t('position_heatmap_accuracy')}: <span className="font-semibold text-foreground">{Math.round(overallAccuracy * 100)}%</span>
              </span>
              <span>
                {t('stats_count')}: <span className="font-semibold text-foreground">{snapshot.totalSum}</span>
              </span>
            </div>

            {/* 热力网格：行 = 弦（上=高音弦），列 = 品（0..fretCount） */}
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full">
                {/* 品号表头 */}
                <div className="flex mb-1">
                  <div className="flex-[0.6] shrink-0" />
                  {Array.from({ length: fretCount + 1 }, (_, f) => (
                    <div key={f} className="flex-1 min-w-[28px] text-center text-2xs text-muted-foreground tabular-nums">
                      {f}
                    </div>
                  ))}
                </div>
                {Array.from({ length: stringCount }, (_, s) => {
                  const stringNum = s + 1
                  return (
                    <div key={s} className="flex items-center">
                      <div className="flex-[0.6] shrink-0 text-center text-2xs text-muted-foreground tabular-nums pr-1">
                        {stringNum}
                      </div>
                      {Array.from({ length: fretCount + 1 }, (_, f) => {
                        const cell = snapshot.cells.find(c => c.stringIndex === s && c.fret === f)
                        if (!cell || cell.total === 0) {
                          return (
                            <div
                              key={f}
                              className="flex-1 min-w-[28px] h-7 m-[1px] rounded-sm bg-muted/60 dark:bg-zinc-800/60"
                              title={`${stringNum} ${t('fretboard')} ${f}: ${t('stats_no_data')}`}
                            />
                          )
                        }
                        const accuracy = cell.correct / cell.total
                        return (
                          <div
                            key={f}
                            className="flex-1 min-w-[28px] h-7 m-[1px] rounded-sm flex items-center justify-center text-3xs font-semibold text-white tabular-nums"
                            style={{ backgroundColor: accuracyColor(accuracy) }}
                            title={`${stringNum} ${t('fretboard')} ${f}: ${t('position_heatmap_accuracy')} ${Math.round(accuracy * 100)}% (${cell.correct}/${cell.total})`}
                          >
                            {Math.round(accuracy * 100)}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 图例 */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{t('position_heatmap_weak')}</span>
              <div
                className="h-2 flex-1 max-w-40 rounded-full"
                style={{ background: 'linear-gradient(to right, hsl(0 70% 42%), hsl(72 70% 42%), hsl(145 70% 42%))' }}
              />
              <span>{t('position_heatmap_mastered')}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
