"use client"

import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { SimplePianoKeyboard } from '@/components/piano-keyboard'
import { DEGREE_TO_SEMITONE, NOTES } from '@/lib/page-theory-data'
import { getChordDegrees, getNoteIndex } from '@/lib/page-theory-functions'

interface ChordProgressionKeyboardProps {
  /** 和弦进行：已转调序列 */
  transposedChords: { root: string; type: string; bass?: string }[]
  /** 和弦进行：当前和弦下标 */
  currentChordIndex: number
  /** 和弦进行：等级 id */
  practiceLevel: string
  /** 和弦进行：当前音级下标 */
  chordDegreeCurrentStep: number
  /** 等级选项（传给 getChordDegrees） */
  getLevelOptions: () => { forceNaturalFive?: boolean; endOnStartingInterval?: boolean; usePassingNoteBebopScale?: boolean; sevenFlatNineScaleChoice?: 'altered' | 'diminishedWholeHalf' | 'diminishedHalfWhole' }
}

/**
 * 和弦转换钢琴键盘（从 app/page.tsx 原样搬出，行为不变）：取当前和弦，按等级选项计算高亮音；无当前和弦时不渲染。
 */
export const ChordProgressionKeyboard = memo(function ChordProgressionKeyboard({
  transposedChords,
  currentChordIndex,
  practiceLevel,
  chordDegreeCurrentStep,
  getLevelOptions,
}: ChordProgressionKeyboardProps) {
const chords = transposedChords
const currentChord = chords[currentChordIndex]
return currentChord ? (
  <Card className="py-2">
    <CardContent className="p-2 sm:p-4">
      <SimplePianoKeyboard
        rootNote={currentChord.root}
        highlightedNotes={(() => {
          const degrees = getChordDegrees(currentChord.type, practiceLevel, getLevelOptions())
          const rootIdx = getNoteIndex(currentChord.root)
          return degrees.map(degree => {
            const semitone = DEGREE_TO_SEMITONE[degree]
            if (semitone === undefined) return null
            const noteIdx = (rootIdx + semitone) % 12
            return NOTES[noteIdx]
          }).filter((n): n is string => n !== null)
        })()}
        currentStepNote={(() => {
          const degrees = getChordDegrees(currentChord.type, practiceLevel, getLevelOptions())
          const currentDegree = degrees[chordDegreeCurrentStep]
          if (!currentDegree) return undefined
          const semitone = DEGREE_TO_SEMITONE[currentDegree]
          if (semitone === undefined) return undefined
          const rootIdx = getNoteIndex(currentChord.root)
          const noteIdx = (rootIdx + semitone) % 12
          return NOTES[noteIdx]
        })()}
      />
    </CardContent>
  </Card>
) : null
})
