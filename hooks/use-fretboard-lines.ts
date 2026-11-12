/**
 * 指板连线覆盖层的**测量逻辑**（两套皮肤共用）。
 *
 * 两套指板的布局完全不同（经典皮肤是 flex 行、GuitarRun 是 grid，且空弦列宽不同、
 * 手机上还会横向压缩），所以坐标**不能**按「第几品 × 固定格宽」解析算 —— 必须读真实
 * DOM 矩形。本 hook 负责：按 `data-position="弦-品"` 找到格子 → 取中心点 → 换算成
 * 相对容器的像素坐标；容器尺寸变化（窗口缩放 / 侧栏折叠 / 切全屏）时重算。
 *
 * 调用方只需把 `containerRef` 挂到**定位容器**（需 position: relative）上，
 * 再把返回的 `linePoints` 交给 `<FretboardPathOverlay>`。
 */
"use client"

import { useEffect, useRef, useState } from 'react'
import type { CellPos } from '@/lib/single-note-tour'

export interface LinePoint {
  x: number
  y: number
  /**
   * 「与上一个点的这段」是否用虚线。
   * 由调用方在点里带 `dashed`（页面按巡游顺序判断：跨过了未找到的位置 ⇒ 虚线段）。
   */
  dashed: boolean
}

/** 带分段样式的落点；不带 `dashed` 时等价于纯 `CellPos`（旧调用方无需改动）。 */
export interface PathPoint extends CellPos {
  dashed?: boolean
}

export function useFretboardLines(points?: ReadonlyArray<PathPoint>, measureKey?: unknown) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [linePoints, setLinePoints] = useState<LinePoint[]>([])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    // 少于两个点没有「线」可画：清空并按空数组退出（保留旧数组可避免无意义重渲染）
    if (!points || points.length < 2) {
      setLinePoints(prev => (prev.length === 0 ? prev : []))
      return
    }

    const measure = () => {
      const rect = container.getBoundingClientRect()
      const next: LinePoint[] = []
      for (const p of points) {
        const el = container.querySelector<HTMLElement>(
          `[data-position="${p.stringIndex}-${p.fret}"]`,
        )
        if (!el) continue
        const r = el.getBoundingClientRect()
        next.push({
          x: r.left - rect.left + r.width / 2,
          y: r.top - rect.top + r.height / 2,
          dashed: !!p.dashed,
        })
      }
      setLinePoints(next)
    }

    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(container)
    return () => ro.disconnect()
    // `measureKey`：皮肤切换时落点没变、但承载它的 DOM 容器换了（经典 ↔ GuitarRun ↔ 3D 琴颈），
    // 只依赖 points 的话会保留上一套布局的像素坐标 ⇒ 线画在空白处。
  }, [points, measureKey])

  return { containerRef, linePoints }
}
