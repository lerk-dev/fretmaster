"use client"

import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { SimplePianoKeyboard } from '@/components/piano-keyboard'
import { DEGREE_TO_SEMITONE, NOTES, SCALE_MODES } from '@/lib/page-theory-data'
import { getNoteIndex } from '@/lib/page-theory-functions'

interface ScaleKeyboardProps {
  /** 音阶练习：调性 */
  scaleKey: string
  /** 音阶练习：当前音阶 */
  selectedScale: typeof SCALE_MODES.pentatonic[number]
  /** 音阶练习：调式分类 */
  selectedScaleCategory: keyof typeof SCALE_MODES
  /** 音阶练习：音级序列 */
  scaleExerciseSequence: string[]
  /** 音阶练习：当前音级下标 */
  scaleExerciseCurrentStep: number
}

/**
 * 音阶练习钢琴键盘（从 app/page.tsx 原样搬出，行为不变）：按当前音阶与练习序列高亮音与当前步。
 */
export const ScaleKeyboard = memo(function ScaleKeyboard({
  scaleKey,
  selectedScale,
  selectedScaleCategory,
  scaleExerciseSequence,
  scaleExerciseCurrentStep,
}: ScaleKeyboardProps) {
  return (
<Card className="py-2">
  <CardContent className="p-2 sm:p-4">
    <SimplePianoKeyboard
      rootNote={scaleKey}
      highlightedNotes={(() => {
        const keyIdx = getNoteIndex(scaleKey)
        const scale = SCALE_MODES[selectedScaleCategory].find(s => s.name === selectedScale.name)
        if (!scale) return []
        return scale.notes.map(interval => {
          const noteIdx = (keyIdx + interval) % 12
          return NOTES[noteIdx]
        }).filter((n): n is string => n !== null)
      })()}
      currentStepNote={scaleExerciseSequence.length > 0 ? (() => {
        const currentDegree = scaleExerciseSequence[scaleExerciseCurrentStep]
        if (!currentDegree) return undefined
        const semitone = DEGREE_TO_SEMITONE[currentDegree]
        if (semitone === undefined) return undefined
        const keyIdx = getNoteIndex(scaleKey)
        const noteIdx = (keyIdx + semitone) % 12
        return NOTES[noteIdx]
      })() : undefined}
    />
  </CardContent>
</Card>
  )
})
