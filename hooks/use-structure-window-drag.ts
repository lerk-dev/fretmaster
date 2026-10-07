import { useCallback, useRef, useState } from 'react'

/**
 * useStructureWindowDrag
 *
 * 浮动窗口拖动（和弦进行结构 / 音阶结构 / 和弦练习结构三个窗口）。
 * 
 * 从 app/page.tsx 原样搬出，逐行搬运、逻辑未改动：
 * - state：三个窗口的位移 {x,y}
 * - ref：dragRef（拖拽会话）、rafRef（rAF 句柄）、pendingPositionRef（待提交位移）
 * - 逻辑：handleDragStart / updatePosition / handleDragMove / handleDragEnd
 *   （鼠标与触摸共用；位移更新用 requestAnimationFrame 节流）
 * 页面通过解构接回同名变量，因此页面正文一行都不用改。
 */
export function useStructureWindowDrag() {
  // 浮动窗口拖动位置状态
  const [chordStructurePosition, setChordStructurePosition] = useState({ x: 0, y: 0 })
  const [scaleStructurePosition, setScaleStructurePosition] = useState({ x: 0, y: 0 })
  const [chordExerciseStructurePosition, setChordExerciseStructurePosition] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    target: 'chord' | 'scale' | 'chordExercise' | null;
  }>({
    isDragging: false,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    target: null
  })
  const rafRef = useRef<number | null>(null)
  const pendingPositionRef = useRef<{ x: number; y: number; target: 'chord' | 'scale' | 'chordExercise' } | null>(null)
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent, target: 'chord' | 'scale' | 'chordExercise') => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    
    let initialPos = { x: 0, y: 0 }
    if (target === 'chord') initialPos = chordStructurePosition
    else if (target === 'scale') initialPos = scaleStructurePosition
    else if (target === 'chordExercise') initialPos = chordExerciseStructurePosition
    
    dragRef.current = {
      isDragging: true,
      startX: clientX,
      startY: clientY,
      initialX: initialPos.x,
      initialY: initialPos.y,
      target
    }
  }, [chordStructurePosition, scaleStructurePosition, chordExerciseStructurePosition])
  const updatePosition = useCallback(() => {
    if (pendingPositionRef.current) {
      const { x, y, target } = pendingPositionRef.current
      if (target === 'chord') setChordStructurePosition({ x, y })
      else if (target === 'scale') setScaleStructurePosition({ x, y })
      else if (target === 'chordExercise') setChordExerciseStructurePosition({ x, y })
      pendingPositionRef.current = null
    }
    rafRef.current = null
  }, [])
  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragRef.current.isDragging || !dragRef.current.target) return

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

    const deltaX = clientX - dragRef.current.startX
    const deltaY = clientY - dragRef.current.startY

    const newX = dragRef.current.initialX + deltaX
    const newY = dragRef.current.initialY + deltaY

    pendingPositionRef.current = { x: newX, y: newY, target: dragRef.current.target }

    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(updatePosition)
    }
  }, [updatePosition])
  const handleDragEnd = useCallback(() => {
    dragRef.current.isDragging = false
    dragRef.current.target = null
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    pendingPositionRef.current = null
  }, [])

  return {
    chordStructurePosition,
    setChordStructurePosition,
    scaleStructurePosition,
    setScaleStructurePosition,
    chordExerciseStructurePosition,
    setChordExerciseStructurePosition,
    dragRef,
    rafRef,
    pendingPositionRef,
    handleDragStart,
    updatePosition,
    handleDragMove,
    handleDragEnd,
  }
}
