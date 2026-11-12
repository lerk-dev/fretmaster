/**
 * 指板上的「同音位置路径」覆盖层：把已找到的位置按巡游顺序连成一条虚线。
 *
 * 只负责画，不负责测量（坐标来自 `hooks/use-fretboard-lines.ts`）。
 * `pointer-events-none` 保证不挡住格子的点击；颜色走 `--brass`（制琴师工作台的黄铜件），
 * 22 套主题下都成立。
 *
 * 分段样式：逐段画而不是一条 polyline —— 某一段的两端中间**跨过了没找到的位置**时
 * 用虚线（`dashed`），一眼能看出缺口在哪。
 */
"use client"

import type { LinePoint } from '@/hooks/use-fretboard-lines'

export function FretboardPathOverlay({ points }: { points: LinePoint[] }) {
  if (points.length < 2) return null

  return (
    <svg
      className="fretboard-path-overlay absolute inset-0 z-20 h-full w-full pointer-events-none"
      aria-hidden="true"
    >
      {points.slice(1).map((p, i) => {
        const prev = points[i]
        return (
          <line
            key={`seg-${i}`}
            x1={prev.x}
            y1={prev.y}
            x2={p.x}
            y2={p.y}
            stroke="hsl(var(--brass))"
            strokeWidth={2}
            strokeDasharray={p.dashed ? '3 5' : undefined}
            strokeLinecap="round"
            opacity={p.dashed ? 0.55 : 1}
          />
        )
      })}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="hsl(var(--brass))" />
      ))}
    </svg>
  )
}
