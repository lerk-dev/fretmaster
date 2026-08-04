"use client"

import { cn } from "@/lib/utils"
import { useMemo, memo } from "react"

const PIANO_CONFIG = {
  startNote: 21,
  endNote: 108,
  WHITE_KEY_WIDTH: 26,
  WHITE_KEY_HEIGHT: 88,
  BLACK_KEY_WIDTH: 16,
  BLACK_KEY_HEIGHT: 56,
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

function getNoteName(midiNote: number): string {
  const noteIndex = midiNote % 12
  const octave = Math.floor(midiNote / 12) - 1
  return `${NOTE_NAMES[noteIndex]}${octave}`
}

function getNoteBase(midiNote: number): string {
  return NOTE_NAMES[midiNote % 12]
}

function getOctave(midiNote: number): number {
  return Math.floor(midiNote / 12) - 1
}

function isBlackKey(midiNote: number): boolean {
  const noteIndex = midiNote % 12
  return [1, 3, 6, 8, 10].includes(noteIndex)
}

interface PianoKeyboardProps {
  highlightedNotes?: number[]
  currentStepNotes?: number[]
  rootNote?: string
  className?: string
  showLabels?: boolean
  minOctave?: number
  maxOctave?: number
}

export const PianoKeyboard = memo(function PianoKeyboard({
  highlightedNotes = [],
  currentStepNotes = [],
  rootNote,
  className,
  showLabels = true,
  minOctave = 3,
  maxOctave = 5,
}: PianoKeyboardProps) {
  const keyboardLayout = useMemo(() => {
    const startMidi = Math.max(PIANO_CONFIG.startNote, (minOctave + 1) * 12)
    const endMidi = Math.min(PIANO_CONFIG.endNote, (maxOctave + 2) * 12 - 1)

    const allNotes: number[] = []
    for (let i = startMidi; i <= endMidi; i++) {
      allNotes.push(i)
    }

    const whiteKeys = allNotes.filter(note => !isBlackKey(note))
    const blackKeys = allNotes.filter(note => isBlackKey(note))

    const highlightedBases = new Set(highlightedNotes.map(hn => getNoteBase(hn)))
    const currentStepBases = new Set(currentStepNotes.map(cn => getNoteBase(cn)))

    // 预计算白键索引映射，用于黑键定位
    const whiteKeyIndexOf = (midiNote: number) => {
      let count = 0
      for (let i = (minOctave + 1) * 12; i < midiNote; i++) {
        if (!isBlackKey(i)) count++
      }
      return count
    }

    return { whiteKeys, blackKeys, highlightedBases, currentStepBases, whiteKeyIndexOf }
  }, [highlightedNotes, currentStepNotes, minOctave, maxOctave])

  const { whiteKeys, blackKeys, highlightedBases, currentStepBases, whiteKeyIndexOf } = keyboardLayout

  const isHighlighted = (midiNote: number) => highlightedBases.has(getNoteBase(midiNote))
  const isCurrentStep = (midiNote: number) => currentStepBases.has(getNoteBase(midiNote))
  const isRootNote = (midiNote: number) => {
    if (!rootNote) return false
    return getNoteBase(midiNote) === rootNote
  }

  // 单一蓝色强调色系：根音=深蓝锚点，当前步骤=亮蓝行动，和弦/音阶音=柔和浅蓝上下文
  const getWhiteKeyClass = (highlighted: boolean, currentStep: boolean, isRoot: boolean) => {
    if (isRoot && highlighted) {
      return "bg-blue-500 text-white shadow-[inset_0_-3px_0_0_rgba(0,0,0,0.18)]"
    }
    if (currentStep) {
      return "bg-sky-400 text-white shadow-[inset_0_-3px_0_0_rgba(0,0,0,0.15)]"
    }
    if (highlighted) {
      return "bg-blue-200/70 dark:bg-blue-500/25 text-blue-900 dark:text-blue-100"
    }
    return "bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-r border-zinc-200 dark:border-zinc-700"
  }

  const getBlackKeyClass = (highlighted: boolean, currentStep: boolean, isRoot: boolean) => {
    if (isRoot && highlighted) {
      return "bg-blue-500"
    }
    if (currentStep) {
      return "bg-sky-400"
    }
    if (highlighted) {
      return "bg-blue-400/80 dark:bg-blue-500/70"
    }
    return "bg-zinc-900 dark:bg-black"
  }

  return (
    <div className={cn("relative w-full overflow-x-auto", className)}>
      <div className="relative min-w-max py-3 flex justify-center">
        <div className="relative flex">
          {/* 白键层 */}
          <div className="flex relative z-0">
            {whiteKeys.map((note) => {
              const highlighted = isHighlighted(note)
              const currentStep = isCurrentStep(note)
              const isRoot = isRootNote(note)
              const showLabel = showLabels && (highlighted || currentStep || (isRoot && highlighted) || getNoteBase(note) === "C")

              return (
                <div
                  key={note}
                  className={cn(
                    "relative transition-colors duration-200 rounded-b-md",
                    "flex items-end justify-center pb-1.5 select-none",
                    getWhiteKeyClass(highlighted, currentStep, isRoot)
                  )}
                  style={{
                    width: `${PIANO_CONFIG.WHITE_KEY_WIDTH}px`,
                    height: `${PIANO_CONFIG.WHITE_KEY_HEIGHT}px`,
                  }}
                >
                  {/* 根音锚点：顶部小圆点 */}
                  {isRoot && highlighted && (
                    <span className="absolute top-1.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-white/90" />
                  )}
                  {/* 当前步骤：呼吸提示 */}
                  {currentStep && (
                    <span className="absolute top-1.5 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                  )}
                  {showLabel && (
                    <span className={cn(
                      "text-[9px] font-semibold leading-none transition-opacity",
                      (highlighted || currentStep || (isRoot && highlighted)) ? "opacity-100" : "opacity-50"
                    )}>
                      {getNoteBase(note)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* 黑键层：精确绝对定位 */}
          <div className="absolute top-0 left-0 pointer-events-none z-10">
            {blackKeys.map((note) => {
              const highlighted = isHighlighted(note)
              const currentStep = isCurrentStep(note)
              const isRoot = isRootNote(note)
              // 黑键中心对齐到前一个白键与后一个白键的交界处
              const prevWhiteIdx = whiteKeyIndexOf(note)
              const leftPx = (prevWhiteIdx + 1) * PIANO_CONFIG.WHITE_KEY_WIDTH - PIANO_CONFIG.BLACK_KEY_WIDTH / 2

              return (
                <div
                  key={note}
                  className={cn(
                    "absolute rounded-b-md transition-colors duration-200",
                    "flex items-end justify-center pb-1.5 select-none",
                    "shadow-[0_2px_4px_rgba(0,0,0,0.35)]",
                    getBlackKeyClass(highlighted, currentStep, isRoot)
                  )}
                  style={{
                    left: `${leftPx}px`,
                    width: `${PIANO_CONFIG.BLACK_KEY_WIDTH}px`,
                    height: `${PIANO_CONFIG.BLACK_KEY_HEIGHT}px`,
                  }}
                >
                  {highlighted && showLabels && (
                    <span className="text-[8px] font-bold text-white leading-none opacity-90">
                      {getNoteBase(note)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
})

interface SimplePianoKeyboardProps {
  rootNote: string
  highlightedNotes: string[]
  currentStepNote?: string
  className?: string
}

export const SimplePianoKeyboard = memo(function SimplePianoKeyboard({
  rootNote,
  highlightedNotes,
  currentStepNote,
  className,
}: SimplePianoKeyboardProps) {
  const noteToMidi = (noteName: string, octave: number): number => {
    const noteIndex = NOTE_NAMES.indexOf(noteName)
    if (noteIndex === -1) return 60
    return (octave + 1) * 12 + noteIndex
  }

  const highlightedMidis: number[] = []
  highlightedNotes.forEach(noteName => {
    for (let octave = 3; octave <= 5; octave++) {
      const midi = noteToMidi(noteName, octave)
      highlightedMidis.push(midi)
    }
  })

  const currentStepMidis: number[] = []
  if (currentStepNote) {
    for (let octave = 3; octave <= 5; octave++) {
      const midi = noteToMidi(currentStepNote, octave)
      currentStepMidis.push(midi)
    }
  }

  return (
    <PianoKeyboard
      highlightedNotes={highlightedMidis}
      currentStepNotes={currentStepMidis}
      rootNote={rootNote}
      className={className}
      minOctave={3}
      maxOctave={5}
    />
  )
})

export default PianoKeyboard
