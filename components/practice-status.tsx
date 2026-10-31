"use client"

import { Badge } from '@/components/ui/badge'
import { Timer } from 'lucide-react'

/**
 * 练习状态徽章：**单次练习的得分**与**剩余时间**。
 *
 * ## 为什么抽出来
 *
 * 这两枚徽章原先只存在于 `components/app-header.tsx`（顶栏）。全屏练习层
 * （`components/fullscreen-overlay.tsx`）是 `fixed inset-0 z-[9999]`，把顶栏整个盖住
 * ⇒ 一进全屏，**「对了几题 / 还剩几分钟」就都看不到了**（2026-10-31 排查确认：
 * 全屏文本只有题目本身，得分与计时为 0 处）。
 *
 * 补的时候如果照抄一份百分比判定（`correct/total >= 0.7` 换配色），两处就会各自演化。
 * 所以这里把「怎么算、怎么显示」收成唯一实现，顶栏与全屏层共用。
 *
 * ⚠️ 组件是**纯展示**：得分/剩余时间由调用方从它已有的来源传入，
 * 组件自己不读 store —— 免得出现「全屏读到的是另一个 score」这类双源问题。
 */

export interface PracticeScore {
  correct: number
  total: number
}

interface PracticeScoreBadgeProps {
  t: (key: string) => string
  score: PracticeScore
}

/**
 * 得分徽章：`正确/总数` + 正确率百分比。
 *
 * 正确率 ≥ 70% 用实心（`default`），否则 `secondary` —— 这是既有的视觉口径，
 * 顶栏与全屏必须一致（在同一个练习里两处显示不同配色会让人以为数据不同）。
 */
export function PracticeScoreBadge({ t, score }: PracticeScoreBadgeProps) {
  return (
    <div
      className="flex items-center gap-2"
      role="status"
      aria-live="polite"
      aria-label={t('score_aria_label')
        .replace('{correct}', String(score.correct))
        .replace('{total}', String(score.total))}
    >
      <Badge variant="outline" className="font-mono tabular-nums text-xs">
        {score.correct}/{score.total}
      </Badge>
      {score.total > 0 && (
        <Badge
          variant={score.correct / score.total >= 0.7 ? 'default' : 'secondary'}
          className="tabular-nums text-xs"
        >
          {Math.round((score.correct / score.total) * 100)}%
        </Badge>
      )}
    </div>
  )
}

interface PracticeTimerBadgeProps {
  t: (key: string) => string
  /** 剩余秒数 */
  timeLeft: number
  /** 秒 → mm:ss */
  formatTime: (seconds: number) => string
}

/**
 * 剩余时间徽章。
 *
 * ⚠️ 是否显示由调用方判断（顶栏与全屏都用「练习中 且 本轮有设定时长」）。
 * 这里不再判一次，否则同一个条件会有两份实现。
 */
export function PracticeTimerBadge({ t, timeLeft, formatTime }: PracticeTimerBadgeProps) {
  return (
    <Badge
      variant="outline"
      className="font-mono tabular-nums gap-1 text-xs"
      role="status"
      aria-live="off"
      aria-label={t('time_left_aria_label').replace('{time}', formatTime(timeLeft))}
    >
      <Timer className="h-3 w-3" />
      {formatTime(timeLeft)}
    </Badge>
  )
}
