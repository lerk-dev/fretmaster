"use client"

import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDegree, normalizeNoteName } from '@/lib/page-theory-functions'

interface IntervalQuestionProps {
  /** 翻译函数 */
  t: (key: string) => string
  /** 音程练习：当前题目（外层条件已保证非空） */
  currentIntervalExercise: { rootNote: string; interval: { name: string; symbol: string; semitones: number }; targetNote: string; allIntervals: { name: string; symbol: string; semitones: number }[]; currentIntervalDisplay: string; completedIntervals: number[]; answered: boolean }
  /** 音程练习：根音 */
  rootNote: string
  /** 音程练习：目标音 */
  targetNote: string
  /** 音程方向 */
  intervalDirection: "up" | "down" | "random" | "either"
  /** 音程练习队列 */
  intervalExerciseQueue: number[]
  /** 音程队列当前下标 */
  intervalCurrentQueueIndex: number
  /** 剩余时间（秒） */
  timeLeft: number
  /** 秒 → 时间串 */
  formatTime: (seconds: number) => string
}

/**
 * 音程练习当前题目显示（从 app/page.tsx 原样搬出，行为不变，指板隐藏时显示根音与音程队列进度）。
 */
export const IntervalQuestion = memo(function IntervalQuestion({
  t,
  currentIntervalExercise,
  rootNote: _rootNote,
  targetNote: _targetNote,
  intervalDirection,
  intervalExerciseQueue,
  intervalCurrentQueueIndex,
  timeLeft,
  formatTime,
}: IntervalQuestionProps) {
  return (
<Card>
  <CardContent className="p-6">
    <div className="text-center space-y-4">
      {/* 顶部信息栏 */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          <span>{formatTime(timeLeft)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>{t('direction')}: {intervalDirection === 'up' ? '↑' : intervalDirection === 'down' ? '↓' : intervalDirection === 'either' ? '↕' : '🔀'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>{intervalCurrentQueueIndex}/{intervalExerciseQueue.length}</span>
        </div>
      </div>
      
      {/* 根音显示 */}
      <div className="text-6xl font-bold">
        {normalizeNoteName(currentIntervalExercise.rootNote)}
      </div>
      {/* 音程题目显示 */}
      <div className="relative">
        {/* 背景：所有选中的音符*/}
        <div className="text-sm text-muted-foreground mb-2">
          {currentIntervalExercise.allIntervals.map(i => formatDegree(i.symbol)).join(' ')}
        </div>
        {/* 当前题目 */}
        <div className="text-4xl font-bold text-primary">
          {currentIntervalExercise.currentIntervalDisplay.split(' ').map((interval, idx) => (
            <span 
              key={idx}
              className={cn(
                "mx-2",
                currentIntervalExercise.completedIntervals.includes(idx) && "text-muted-foreground line-through"
              )}
            >
              {formatDegree(interval)}
            </span>
          ))}
        </div>
      </div>
      
      {/* 目标音符提示（可选） */}
      {currentIntervalExercise.answered && (
        <div className="text-lg text-green-600">
          {currentIntervalExercise.targetNote}
        </div>
      )}
    </div>
  </CardContent>
</Card>
  )
})
