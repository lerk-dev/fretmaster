'use client'

import { useCallback, useRef, useState } from 'react'

import { generateChordSequence } from '@/lib/page-theory-functions'
import { NOTES } from '@/lib/page-theory-data'
import { useChordSymbols } from '@/lib/store'

/**
 * 和弦练习的页面级 state / ref 容器与出题逻辑。
 *
 * 从 app/page.tsx 原样搬出，逐行搬运、逻辑未改动：
 * - 第一部分：14 个 useState + 5 个 useRef（原样搬出，顺序不变）
 * - 第二部分：generateChordExercise / nextChordExercise（出题与推进）
 *
 * 依赖说明：序列生成已抽到 lib/page-theory-functions 的纯函数 generateChordSequence；
 * 出题本身不记录统计（统计在用户答对时由 handleMIDINoteInput 触发）。
 * 页面通过解构接回同名变量，因此页面正文一行都不用改。
 */
export function useChordExercise() {
  const [chordExerciseRoot, setChordExerciseRoot] = useState<string>("C")
  const [chordExerciseTypes, setChordExerciseTypes] = useState<string[]>(["Major"])
  const [chordExerciseLevel, setChordExerciseLevel] = useState<string>("single_chord_tones_root")
  const [chordExerciseOrder, setChordExerciseOrder] = useState<"asc" | "desc" | "random">("asc")
  const [chordExerciseBass, setChordExerciseBass] = useState<string>("root")
  const [showChordExerciseFretboard, setShowChordExerciseFretboard] = useState(false)
  const [chordExerciseCurrentStep, setChordExerciseCurrentStep] = useState(0)
  const [chordExerciseSequence, setChordExerciseSequence] = useState<string[]>([])
  const [chordExerciseTargetChord, setChordExerciseTargetChord] = useState<{root: string, type: string} | null>(null)
  const [chordExerciseIsAnswered, setChordExerciseIsAnswered] = useState(false)
  const [nextChordExerciseInfo, setNextChordExerciseInfo] = useState<{root: string, type: string, sequence: string[]} | null>(null)
  const [showChordExerciseStructure, setShowChordExerciseStructure] = useState(false)
  const [showChordExerciseLevelSelector, setShowChordExerciseLevelSelector] = useState(false)
  const [showChordExerciseKeyboard, setShowChordExerciseKeyboard] = useState(false)
  const nextChordExerciseRef = useRef<(() => void) | null>(null)
  const chordExerciseIsAnsweredRef = useRef(false)
  const chordExerciseTargetChordRef = useRef(chordExerciseTargetChord)
  const chordExerciseSequenceRef = useRef(chordExerciseSequence)
  const chordExerciseCurrentStepRef = useRef(chordExerciseCurrentStep)

  // 七和弦音阶选择属于和弦符号设置，直接读 store（同名局部变量 → 下方出题正文零改动）
  const chordSymbols = useChordSymbols()

  // 生成和弦练习
  const generateChordExercise = useCallback(() => {
    // 确定根音
    let root = chordExerciseRoot
    if (root === "random") {
      root = NOTES[Math.floor(Math.random() * NOTES.length)]
    }

    // 确定和弦类型（从选中的类型中随机选择）
    let chordType = "Major"
    if (chordExerciseTypes.length > 0) {
      const randomIndex = Math.floor(Math.random() * chordExerciseTypes.length)
      chordType = chordExerciseTypes[randomIndex]
    }

    // 确定低音音符
    let bass = chordExerciseBass
    if (bass === "random") {
      const bassOptions = ["root", "3rd", "5th", "7th"]
      bass = bassOptions[Math.floor(Math.random() * bassOptions.length)]
    }

    // 生成序列
    const sequence = generateChordSequence(root, chordType, chordExerciseLevel, chordExerciseOrder, bass, chordSymbols.sevenFlatNineScaleChoice)

    setChordExerciseTargetChord({ root, type: chordType })
    setChordExerciseSequence(sequence)
    setChordExerciseCurrentStep(0)
    setChordExerciseIsAnswered(false)
    chordExerciseIsAnsweredRef.current = false

    // 预生成下一题
    const nextRoot = chordExerciseRoot === "random" ? NOTES[Math.floor(Math.random() * NOTES.length)] : root
    const nextType = chordExerciseTypes.length > 0 ? chordExerciseTypes[Math.floor(Math.random() * chordExerciseTypes.length)] : chordType
    const nextBass = chordExerciseBass === "random" ? ["root", "3rd", "5th", "7th"][Math.floor(Math.random() * 4)] : bass
    const nextSequence = generateChordSequence(nextRoot, nextType, chordExerciseLevel, chordExerciseOrder, nextBass, chordSymbols.sevenFlatNineScaleChoice)

    setNextChordExerciseInfo({
      root: nextRoot,
      type: nextType,
      sequence: nextSequence
    })

    // 不在此处记录练习统计 —— 仅在用户答对时记录（见 handleMIDINoteInput）
  }, [chordExerciseRoot, chordExerciseTypes, chordExerciseLevel, chordExerciseOrder, chordExerciseBass, chordSymbols.sevenFlatNineScaleChoice])

  // 下一和弦练习
  const nextChordExercise = useCallback(() => {
    // 使用预览中的下一题信息
    if (nextChordExerciseInfo) {
      setChordExerciseTargetChord({ root: nextChordExerciseInfo.root, type: nextChordExerciseInfo.type })
      setChordExerciseSequence(nextChordExerciseInfo.sequence)
      setChordExerciseCurrentStep(0)
      setChordExerciseIsAnswered(false)
      chordExerciseIsAnsweredRef.current = false

      // 预生成新的下一题
      const newNextRoot = chordExerciseRoot === "random" ? NOTES[Math.floor(Math.random() * NOTES.length)] : nextChordExerciseInfo.root
      const newNextType = chordExerciseTypes.length > 0 ? chordExerciseTypes[Math.floor(Math.random() * chordExerciseTypes.length)] : nextChordExerciseInfo.type
      const newNextBass = chordExerciseBass === "random" ? ["root", "3rd", "5th", "7th"][Math.floor(Math.random() * 4)] : chordExerciseBass
      const newNextSequence = generateChordSequence(newNextRoot, newNextType, chordExerciseLevel, chordExerciseOrder, newNextBass, chordSymbols.sevenFlatNineScaleChoice)

      setNextChordExerciseInfo({
        root: newNextRoot,
        type: newNextType,
        sequence: newNextSequence
      })
    } else {
      // 如果没有预览信息，重新生成
      generateChordExercise()
    }
  }, [nextChordExerciseInfo, chordExerciseRoot, chordExerciseTypes, chordExerciseLevel, chordExerciseOrder, chordExerciseBass, generateChordExercise, chordSymbols.sevenFlatNineScaleChoice])

  return {
    chordExerciseRoot,
    setChordExerciseRoot,
    chordExerciseTypes,
    setChordExerciseTypes,
    chordExerciseLevel,
    setChordExerciseLevel,
    chordExerciseOrder,
    setChordExerciseOrder,
    chordExerciseBass,
    setChordExerciseBass,
    showChordExerciseFretboard,
    setShowChordExerciseFretboard,
    chordExerciseCurrentStep,
    setChordExerciseCurrentStep,
    chordExerciseSequence,
    setChordExerciseSequence,
    chordExerciseTargetChord,
    setChordExerciseTargetChord,
    chordExerciseIsAnswered,
    setChordExerciseIsAnswered,
    nextChordExerciseInfo,
    setNextChordExerciseInfo,
    showChordExerciseStructure,
    setShowChordExerciseStructure,
    showChordExerciseLevelSelector,
    setShowChordExerciseLevelSelector,
    showChordExerciseKeyboard,
    setShowChordExerciseKeyboard,
    nextChordExerciseRef,
    chordExerciseIsAnsweredRef,
    chordExerciseTargetChordRef,
    chordExerciseSequenceRef,
    chordExerciseCurrentStepRef,
    generateChordExercise,
    nextChordExercise,
  }
}
