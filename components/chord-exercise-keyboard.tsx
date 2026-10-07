"use client"

import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { SimplePianoKeyboard } from '@/components/piano-keyboard'
import { DEGREE_TO_SEMITONE, NOTES } from '@/lib/page-theory-data'
import { getChordDegrees, getNoteIndex } from '@/lib/page-theory-functions'

interface ChordExerciseKeyboardProps {
  /** 和弦练习：根音 */
  chordExerciseRoot: string
  /** 和弦练习：已选和弦类型 */
  chordExerciseTypes: string[]
  /** 和弦练习：等级 id */
  chordExerciseLevel: string
  /** 和弦练习：目标和弦 */
  chordExerciseTargetChord: { root: string; type: string } | null
  /** 和弦练习：当前音级下标 */
  chordExerciseCurrentStep: number
  /** 等级选项（传给 getChordDegrees） */
  getLevelOptions: () => { forceNaturalFive?: boolean; endOnStartingInterval?: boolean; usePassingNoteBebopScale?: boolean; sevenFlatNineScaleChoice?: 'altered' | 'diminishedWholeHalf' | 'diminishedHalfWhole' }
}

/**
 * 和弦练习钢琴键盘（从 app/page.tsx 原样搬出，行为不变）：按目标和弦计算应高亮的音并显示。
 */
export const ChordExerciseKeyboard = memo(function ChordExerciseKeyboard({
  chordExerciseRoot,
  chordExerciseTypes,
  chordExerciseLevel,
  chordExerciseTargetChord,
  chordExerciseCurrentStep,
  getLevelOptions,
}: ChordExerciseKeyboardProps) {
  return (
<Card className="py-2">
  <CardContent className="p-2 sm:p-4">
    <SimplePianoKeyboard
      rootNote={chordExerciseTargetChord ? chordExerciseTargetChord.root : chordExerciseRoot}
      highlightedNotes={(() => {
        const targetChord = chordExerciseTargetChord
        if (targetChord) {
          const degrees = getChordDegrees(targetChord.type, chordExerciseLevel, getLevelOptions())
          const rootIdx = getNoteIndex(targetChord.root)
          return degrees.map(degree => {
            const semitone = DEGREE_TO_SEMITONE[degree]
            if (semitone === undefined) return null
            const noteIdx = (rootIdx + semitone) % 12
            return NOTES[noteIdx]
          }).filter((n): n is string => n !== null)
        } else {
          const chordType = chordExerciseTypes[0] || "Major"
          const degrees = getChordDegrees(chordType, chordExerciseLevel, getLevelOptions())
          const rootIdx = getNoteIndex(chordExerciseRoot)
          return degrees.map(degree => {
            const semitone = DEGREE_TO_SEMITONE[degree]
            if (semitone === undefined) return null
            const noteIdx = (rootIdx + semitone) % 12
            return NOTES[noteIdx]
          }).filter((n): n is string => n !== null)
        }
      })()}
      currentStepNote={chordExerciseTargetChord ? (() => {
        const degrees = getChordDegrees(chordExerciseTargetChord.type, chordExerciseLevel, getLevelOptions())
        const currentDegree = degrees[chordExerciseCurrentStep]
        if (!currentDegree) return undefined
        const semitone = DEGREE_TO_SEMITONE[currentDegree]
        if (semitone === undefined) return undefined
        const rootIdx = getNoteIndex(chordExerciseTargetChord.root)
        const noteIdx = (rootIdx + semitone) % 12
        return NOTES[noteIdx]
      })() : undefined}
    />
  </CardContent>
</Card>
  )
})
