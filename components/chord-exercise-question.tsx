"use client"

import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatDegree, getChordDisplayName, normalizeNoteName } from '@/lib/page-theory-functions'
import { useUser, useChordSymbols, useIsPlaying } from '@/lib/store'

interface ChordExerciseQuestionProps {
  /** 翻译函数 */
  t: (key: string) => string
  /** 和弦练习：目标和弦 */
  chordExerciseTargetChord: { root: string; type: string } | null
  /** 和弦练习：音级序列 */
  chordExerciseSequence: string[]
  /** 和弦练习：当前音级下标 */
  chordExerciseCurrentStep: number
  /** 下一题预览 */
  nextChordExerciseInfo: { root: string; type: string; sequence: string[] } | null
}

/**
 * 和弦练习当前题目显示（从 app/page.tsx 原样搬出，行为不变，指板隐藏时显示目标与音级序列）。
 */
export const ChordExerciseQuestion = memo(function ChordExerciseQuestion({
  t,
  chordExerciseTargetChord,
  chordExerciseSequence,
  chordExerciseCurrentStep,
  nextChordExerciseInfo,
}: ChordExerciseQuestionProps) {
// store 派生值（与页面同源）
  const user = useUser()
  const chordScaleDisplay = user.chordScaleDisplay
  const chordSymbols = useChordSymbols()
  const isPlaying = useIsPlaying()

  return (
<Card className="py-2">
  <CardContent className="p-0 px-4">
    <div className="text-center">
      {/* 当前题目 */}
      <div className="mb-3">
        {isPlaying && chordExerciseTargetChord ? (
          <>
            <h3 className="text-lg font-semibold">
              {normalizeNoteName(chordExerciseTargetChord.root)} {normalizeNoteName(getChordDisplayName(chordExerciseTargetChord.type, chordScaleDisplay, chordSymbols))}
            </h3>
            <div className="flex flex-wrap justify-center gap-2 mt-3">
              {chordExerciseSequence.map((degree, i) => (
                <Badge 
                  key={i} 
                  variant={i === chordExerciseCurrentStep ? "default" : "outline"}
                  className={cn(
                    "text-lg px-4 py-2",
                    i < chordExerciseCurrentStep && "opacity-50"
                  )}
                >
                  {formatDegree(degree)}
                </Badge>
              ))}
            </div>
          </>
        ) : (
          <div className="text-muted-foreground py-4">
            <p className="text-sm">{t('click_start_to_begin')}</p>
          </div>
        )}
      </div>

      {/* 下一题预览*/}
      {isPlaying && nextChordExerciseInfo && (
        <div className="py-1 border-t border-border/30 flex flex-col justify-center">
          <p className="text-2xs text-muted-foreground mb-0.5">{t('next_chord')}</p>
          <div className="text-sm font-medium text-muted-foreground mb-0.5">
            {normalizeNoteName(nextChordExerciseInfo.root)} {normalizeNoteName(getChordDisplayName(nextChordExerciseInfo.type, chordScaleDisplay, chordSymbols))}
          </div>
          <div className="text-xs text-muted-foreground tracking-tight">
            {nextChordExerciseInfo.sequence.map(formatDegree).join(' ')}
          </div>
        </div>
      )}
    </div>
  </CardContent>
</Card>
  )
})
