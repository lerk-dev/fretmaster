"use client"

import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatDegree, formatChordShape, getChordDegrees } from '@/lib/page-theory-functions'
import { useUser, useChordSymbols } from '@/lib/store'

interface ChordDegreesDisplayProps {
  /** 翻译函数 */
  t: (key: string) => string
  /** 和弦进行：已转调序列 */
  transposedChords: { root: string; type: string; bass?: string }[]
  /** 和弦进行：当前和弦下标 */
  currentChordIndex: number
  /** 和弦进行：等级 id */
  practiceLevel: string
  /** 和弦进行：当前音级下标 */
  chordDegreeCurrentStep: number
  /** 等级选项 */
  getLevelOptions: () => { forceNaturalFive?: boolean; endOnStartingInterval?: boolean; usePassingNoteBebopScale?: boolean; sevenFlatNineScaleChoice?: 'altered' | 'diminishedWholeHalf' | 'diminishedHalfWhole' }
  /** 当前和弦显示名 */
  getCurrentChordDisplay: () => string
  /** 下一题预览 */
  getNextChordDisplay: () => { index: number; root: string; type: string; bass?: string; degrees: string[] } | null
  /** 跳到下一和弦 */
  nextChord: () => void
}

/**
 * 和弦进行度数显示（从 app/page.tsx 原样搬出，行为不变，指板隐藏时显示当前和弦与音级）。
 */
export const ChordDegreesDisplay = memo(function ChordDegreesDisplay({
  t,
  transposedChords,
  currentChordIndex,
  practiceLevel,
  chordDegreeCurrentStep,
  getLevelOptions,
  getCurrentChordDisplay,
  getNextChordDisplay,
  nextChord: _nextChord,
}: ChordDegreesDisplayProps) {
// store 派生值（与页面同源）
  const user = useUser()
  const chordScaleDisplay = user.chordScaleDisplay
  const chordSymbols = useChordSymbols()

  return (
<Card className="py-2">
  <CardContent className="p-0 px-4">
    <div className="text-center">
      {/* 当前题目 */}
      <div className="mb-3">
        <h3 className="text-lg font-semibold">{getCurrentChordDisplay()}</h3>
        <div className="flex flex-wrap justify-center gap-2 mt-2">
          {(() => {
            const chords = transposedChords
            const currentChord = chords[currentChordIndex]
            if (!currentChord) return null
            const degrees = getChordDegrees(currentChord.type, practiceLevel, getLevelOptions())
            return degrees.map((degree, i) => (
              <Badge 
                key={i} 
                variant={i === chordDegreeCurrentStep ? "default" : "outline"}
                className={cn(
                  "text-lg px-4 py-2",
                  i < chordDegreeCurrentStep && "opacity-50"
                )}
              >
                {formatDegree(degree)}
              </Badge>
            ))
          })()}
        </div>
      </div>

      {/* 下一题预览*/}
      {(() => {
        const nextChord = getNextChordDisplay()
        if (!nextChord) return null
        // 显示规则见 lib/page-theory-functions 的 formatChordShape（唯一真相源）——
        // 这里曾把同一套「大三不带后缀 + 根音/低音归一化」的规则又内联了一份。
        const displayName = formatChordShape(nextChord, chordScaleDisplay, chordSymbols)
        return (
          <div className="py-1 border-t border-border/30 flex flex-col justify-center">
            <p className="text-2xs text-muted-foreground mb-0.5">{t('next_chord')}</p>
            <div className="text-sm font-medium text-muted-foreground mb-0.5">
              {displayName}
            </div>
            <div className="text-xs text-muted-foreground tracking-tight">
              {nextChord.degrees.map(formatDegree).join(' ')}
            </div>
          </div>
        )
      })()}
    </div>
  </CardContent>
</Card>
  )
})
