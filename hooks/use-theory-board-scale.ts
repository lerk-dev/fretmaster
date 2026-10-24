/**
 * useTheoryBoardScale —— 乐理面板图形倍率的唯一读写口。
 *
 * 数值规则与持久化实现都在 `lib/theory-board-scale.ts`（可单测），
 * 这里只做 React 装配。
 *
 * ## 两个必须踩过的坑
 *
 * 1. **不能 `useState(readStoredBoardScale)`**：静态导出会 SSR 一次，那时没有
 *    `localStorage` ⇒ 服务端渲染 100%、客户端 hydrate 读到 130% ⇒ 水合不一致
 *    （React 会报 mismatch，并把这一小块推倒重渲染）。所以首帧恒为默认值，
 *    挂载后再从存储读一次。
 *
 * 2. **写存储不能放在 state updater 里**：`setScale(prev => { write(...); return v })`
 *    在并发渲染下会被调用两次（updater 必须是纯函数，铁律 3），存储也会被写两遍。
 *    这里改为「先用当前值算出目标值，再一次性设值 + 落盘」。
 */
import { useCallback, useEffect, useState } from 'react'
import {
  BOARD_SCALE_DEFAULT,
  BOARD_SCALE_MAX,
  BOARD_SCALE_MIN,
  BOARD_SCALE_STEP,
  normalizeBoardScale,
  readStoredBoardScale,
  stepBoardScale,
  writeStoredBoardScale,
} from '@/lib/theory-board-scale'

export interface TheoryBoardScaleControls {
  /** 当前倍率（1 = 原始尺寸） */
  scale: number
  /** 直接设定（会先归一化：非法值回落 1、越界钳制） */
  setScale: (next: number) => void
  /** 步进一档（正负均可） */
  step: (delta: number) => void
  /** 放大一档 */
  increase: () => void
  /** 缩小一档 */
  decrease: () => void
  /** 回到 100% */
  reset: () => void
  canIncrease: boolean
  canDecrease: boolean
}

export function useTheoryBoardScale(): TheoryBoardScaleControls {
  const [scale, setScaleState] = useState<number>(BOARD_SCALE_DEFAULT)

  // 挂载后再读存储：避免 SSR/静态导出与水合阶段读到不同的值
  useEffect(() => {
    setScaleState(readStoredBoardScale())
  }, [])

  const setScale = useCallback((next: number) => {
    const value = normalizeBoardScale(next)
    setScaleState(value)
    writeStoredBoardScale(value)
  }, [])

  const step = useCallback((delta: number) => {
    const value = stepBoardScale(scale, delta)
    setScaleState(value)
    writeStoredBoardScale(value)
  }, [scale])

  const increase = useCallback(() => step(BOARD_SCALE_STEP), [step])
  const decrease = useCallback(() => step(-BOARD_SCALE_STEP), [step])
  const reset = useCallback(() => {
    setScaleState(BOARD_SCALE_DEFAULT)
    writeStoredBoardScale(BOARD_SCALE_DEFAULT)
  }, [])

  return {
    scale,
    setScale,
    step,
    increase,
    decrease,
    reset,
    // 用 1e-9 容差：step 已把值 round 到 2 位小数，但浮点比较仍不要写 `=== MAX`
    canIncrease: scale < BOARD_SCALE_MAX - 1e-9,
    canDecrease: scale > BOARD_SCALE_MIN + 1e-9,
  }
}
