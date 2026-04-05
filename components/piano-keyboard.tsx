"use client"

import { cn } from "@/lib/utils"
import { useMemo } from "react"

const PIANO_CONFIG = {
  startNote: 21,
  endNote: 108,
  WHITE_KEY_WIDTH: 24,
  WHITE_KEY_HEIGHT: 80,
  BLACK_KEY_WIDTH: 16,
  BLACK_KEY_HEIGHT: 50,
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

export function PianoKeyboard({
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

    return { whiteKeys, blackKeys, highlightedBases, currentStepBases }
  }, [highlightedNotes, currentStepNotes, minOctave, maxOctave])

  const { whiteKeys, blackKeys, highlightedBases, currentStepBases } = keyboardLayout

  const isHighlighted = (midiNote: number) => {
    return highlightedBases.has(getNoteBase(midiNote))
  }

  const isCurrentStep = (midiNote: number) => {
    return currentStepBases.has(getNoteBase(midiNote))
  }

  const isRootNote = (midiNote: number) => {
    if (!rootNote) return false
    return getNoteBase(midiNote) === rootNote
  }

  const getBlackKeyOffset = (midiNote: number) => {
    const noteIndex = midiNote % 12
    const offsets: Record<number, number> = {
      1: 0.7,
      3: 0.7,
      6: 0.7,
      8: 0.7,
      10: 0.7,
    }
    return offsets[noteIndex] || 0
  }

  const getPreviousWhiteKeyIndex = (midiNote: number) => {
    let count = 0
    for (let i = (minOctave + 1) * 12; i < midiNote; i++) {
      if (!isBlackKey(i)) count++
    }
    return count - 1
  }

  const getWhiteKeyStyle = (note: number, highlighted: boolean, currentStep: boolean, isRoot: boolean) => {
    let bgColor = "bg-white dark:bg-zinc-800"
    let textColor = "text-zinc-600 dark:text-zinc-400"
    let opacity = "opacity-70"

    if (isRoot && highlighted) {
      bgColor = "bg-blue-400/70"
      textColor = "text-white"
      opacity = "opacity-100"
    } else if (currentStep) {
      bgColor = "bg-emerald-400/70"
      textColor = "text-white"
      opacity = "opacity-100"
    } else if (highlighted) {
      bgColor = "bg-teal-300/60"
      textColor = "text-zinc-800"
      opacity = "opacity-90"
    }

    return cn(
      "relative border border-zinc-300 dark:border-zinc-700 rounded-b-md transition-all duration-150",
      "flex items-end justify-center pb-2",
      bgColor, textColor, opacity
    )
  }

  const getBlackKeyStyle = (highlighted: boolean, currentStep: boolean, isRoot: boolean) => {
    if (isRoot && highlighted) {
      return "bg-blue-500/80"
    } else if (currentStep) {
      return "bg-emerald-500/80"
    } else if (highlighted) {
      return "bg-teal-400/70"
    } else {
      return "bg-zinc-900 dark:bg-black"
    }
  }

  return (
    <div className={cn("relative w-full overflow-x-auto flex justify-center", className)}>
      <div className="relative min-w-max py-2">
        <div className="flex relative justify-center">
          <div className="flex">
            {whiteKeys.map((note, index) => {
              const highlighted = isHighlighted(note)
              const currentStep = isCurrentStep(note)
              const isRoot = isRootNote(note)
              
              return (
                <div
                  key={note}
                  className={getWhiteKeyStyle(note, highlighted, currentStep, isRoot)}
                  style={{ 
                    width: `${PIANO_CONFIG.WHITE_KEY_WIDTH}px`,
                    height: `${PIANO_CONFIG.WHITE_KEY_HEIGHT}px`,
                  }}
                >
                  {showLabels && (
                    <div className="flex flex-col items-center justify-end pb-1 h-full">
                      <span className={cn(
                        "text-[9px] font-bold leading-none",
                        (highlighted || currentStep || (isRoot && highlighted)) ? "opacity-100" : "opacity-60"
                      )}>
                        {getNoteBase(note)}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="absolute top-0 left-0 h-12 pointer-events-none">
            {blackKeys.map((note) => {
              const highlighted = isHighlighted(note)
              const currentStep = isCurrentStep(note)
              const isRoot = isRootNote(note)
              const whiteKeyIndex = getPreviousWhiteKeyIndex(note)
              const offset = getBlackKeyOffset(note)
              
              return (
                <div
                  key={note}
                  className={cn(
                    "absolute rounded-b-md transition-all duration-150 shadow-sm flex items-end justify-center pb-1",
                    getBlackKeyStyle(highlighted, currentStep, isRoot)
                  )}
                  style={{
                    left: `calc(${(whiteKeyIndex + 1) * PIANO_CONFIG.WHITE_KEY_WIDTH - PIANO_CONFIG.BLACK_KEY_WIDTH * offset}px)`,
                    width: `${PIANO_CONFIG.BLACK_KEY_WIDTH}px`,
                    height: `${PIANO_CONFIG.BLACK_KEY_HEIGHT}px`,
                    zIndex: 10,
                  }}
                >
                  {(highlighted || currentStep || (isRoot && highlighted)) && showLabels && (
                    <span className="text-[8px] font-bold text-white leading-none">
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
}

interface SimplePianoKeyboardProps {
  rootNote: string
  highlightedNotes: string[]
  currentStepNote?: string
  className?: string
}

export function SimplePianoKeyboard({
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
}

export default PianoKeyboard
