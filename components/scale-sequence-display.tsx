"use client"

import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatDegree, getScaleDisplayName, normalizeNoteName } from '@/lib/page-theory-functions'
import { useUser, useIsPlaying } from '@/lib/store'
import { SCALE_MODES } from '@/lib/page-theory-data'

/**
 * 一弦三音（3NPS）当前把位视图。
 *
 * 刻意做成「页面侧算好的只读快照」而不是把原始 steps 传进来：
 * ① 滑窗（哪 9 步可见、哪一步是 current）是**算法**而非样式，已在
 *    `lib/three-notes-per-string.ts` 的 `threeNpsWindow` 里单测过，组件不该重算一遍；
 * ② 组件保持纯展示，测试里直接喂一个对象就能覆盖所有分支。
 */
export interface ThreeNpsView {
  /** 当前把位（1 起） */
  position: number
  totalPositions: number
  /** 连击（连续答对）；答错归零 */
  combo: number
  /** 本会话最高连击 */
  maxCombo: number
  direction: 'up' | 'down'
  /** 当前步是否是换把点（非首个把位的第一音） */
  isShift: boolean
  /** 当前步号（1 起）与总步数 */
  stepNow: number
  stepTotal: number
  /** 当前目标音（大字显示 + 弦/品提示） */
  target: {
    label: string
    note: string
    stringIndex: number
    fret: number
    isRoot: boolean
  } | null
  /** 9 步滑窗 */
  window: { label: string; done: boolean; current: boolean }[]
}

/** 一弦三音：Marathon 的下一个把位预览（换把前先看一眼要落到哪） */
export interface NextThreeNpsView {
  position: number
  totalPositions: number
  startStringIndex: number
  startFret: number
}

interface ScaleSequenceDisplayProps {
  /** 翻译函数 */
  t: (key: string) => string
  /** 音阶练习：调性 */
  scaleKey: string
  /** 音阶练习：当前音阶 */
  selectedScale: typeof SCALE_MODES.pentatonic[number]
  /** 音阶练习：音级序列 */
  scaleExerciseSequence: string[]
  /** 音阶练习：当前音级下标 */
  scaleExerciseCurrentStep: number
  /** 下一题预览 */
  nextScaleExerciseInfo: { key: string; scaleName: string; sequence: string[] } | null
  /** 一弦三音：当前把位视图（非 3NPS 模式传 null/不传） */
  threeNps?: ThreeNpsView | null
  /** 一弦三音：下一把位预览 */
  nextThreeNps?: NextThreeNpsView | null
}

/**
 * 音阶练习序列显示（从 app/page.tsx 原样搬出，行为不变，指板隐藏时显示当前音阶与序列）。
 *
 * 一弦三音模式下换成把位视图：`把位 n/7` + 上行/下行 + 目标音（含弦/品）+ 连击 + 9 步滑窗。
 * ⚠️ 原徽章行在 3NPS 下**不渲染**：35 步的音级标签横排根本看不出当前位置，
 * 这正是 GuitarRun 改用「9 步滑窗 + 当前步固定第 4 格」的原因。
 */
export const ScaleSequenceDisplay = memo(function ScaleSequenceDisplay({
  t,
  scaleKey,
  selectedScale,
  scaleExerciseSequence,
  scaleExerciseCurrentStep,
  nextScaleExerciseInfo,
  threeNps = null,
  nextThreeNps = null,
}: ScaleSequenceDisplayProps) {
// store 派生值（与页面同源）
  const user = useUser()
  const chordScaleDisplay = user.chordScaleDisplay
  const isPlaying = useIsPlaying()

  // 弦号按「1 起」显示（内部索引 0 = 最高音弦 = 1 弦）
  const stringNumber = (stringIndex: number) => stringIndex + 1
  const targetLocation = (stringIndex: number, fret: number) =>
    t('three_nps_target_location')
      .replace('{string}', String(stringNumber(stringIndex)))
      .replace('{fret}', String(fret))

  return (
<Card className="py-2">
  <CardContent className="p-0 px-4">
    <div className="text-center">
      {/* 当前题目 */}
      <div className="mb-3">
        {isPlaying && scaleExerciseSequence.length > 0 ? (
          <>
            <h3 className="text-lg font-semibold">{normalizeNoteName(scaleKey)} {getScaleDisplayName(selectedScale.name, chordScaleDisplay)}</h3>

            {threeNps ? (
              <>
                {/* 把位进度 + 方向 + 换把 */}
                <div className="flex flex-wrap items-center justify-center gap-2 mt-2 text-xs" role="status" aria-live="polite">
                  <span className="font-medium text-primary">
                    {t('three_nps_position_progress')
                      .replace('{current}', String(threeNps.position))
                      .replace('{total}', String(threeNps.totalPositions))}
                  </span>
                  <span className="text-muted-foreground">
                    {threeNps.isShift
                      ? t('three_nps_shift').replace('{position}', String(threeNps.position))
                      : threeNps.direction === 'up' ? t('three_nps_ascending') : t('three_nps_descending')}
                  </span>
                  <span className="text-muted-foreground">
                    {t('three_nps_combo').replace('{combo}', String(threeNps.combo))}
                  </span>
                </div>

                {/* 当前目标音 + 建议位置（同一音名别处也能弹，这里只是推荐位） */}
                {threeNps.target && (
                  <div className="mt-3 flex flex-col items-center gap-0.5">
                    <div className={cn(
                      "w-16 h-16 rounded-lg flex items-center justify-center text-3xl font-bold",
                      threeNps.target.isRoot ? "bg-blue-400/20 text-blue-500" : "bg-primary/10 text-primary"
                    )}>
                      {formatDegree(threeNps.target.label)}
                    </div>
                    <div className="text-sm font-medium">
                      {threeNps.target.note}
                      <span className="ml-1 text-xs text-muted-foreground font-normal">
                        {targetLocation(threeNps.target.stringIndex, threeNps.target.fret)}
                      </span>
                    </div>
                    <div className="text-2xs text-muted-foreground">
                      {threeNps.stepNow} / {threeNps.stepTotal}
                    </div>
                  </div>
                )}

                {/* 9 步滑窗：当前步固定第 4 格 */}
                <div className="flex flex-wrap justify-center gap-1 mt-2">
                  {threeNps.window.map((step, i) => (
                    <span
                      key={i}
                      className={cn(
                        "inline-flex items-center justify-center min-w-[26px] h-7 px-1.5 rounded border text-xs font-mono",
                        step.current
                          ? "bg-primary text-primary-foreground border-primary font-bold"
                          : step.done
                            ? "border-border/40 text-muted-foreground/50"
                            : "border-border text-muted-foreground"
                      )}
                    >
                      {formatDegree(step.label)}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-wrap justify-center gap-2 mt-3">
                {scaleExerciseSequence.map((degree, i) => (
                  <Badge
                    key={i}
                    variant={i === scaleExerciseCurrentStep ? "default" : "outline"}
                    className={cn(
                      "text-lg px-4 py-2",
                      i < scaleExerciseCurrentStep && "opacity-50"
                    )}
                  >
                    {formatDegree(degree)}
                  </Badge>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-muted-foreground py-4">
            <p className="text-sm">{t('click_start_to_begin')}</p>
          </div>
        )}
      </div>

      {/* 下一题预览*/}
      {isPlaying && nextThreeNps && (
        <div className="py-1 border-t border-border/30 flex flex-col justify-center">
          <p className="text-2xs text-muted-foreground mb-0.5">{t('next_chord')}</p>
          <div className="text-sm font-medium text-muted-foreground mb-0.5">
            {t('three_nps_next_position').replace('{position}', String(nextThreeNps.position))}
            <span className="ml-1 text-xs">
              {normalizeNoteName(scaleKey)} {getScaleDisplayName(selectedScale.name, chordScaleDisplay)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground tracking-tight">
            {targetLocation(nextThreeNps.startStringIndex, nextThreeNps.startFret)}
          </div>
        </div>
      )}

      {/* 下一题预览（普通音阶模式） */}
      {isPlaying && !nextThreeNps && nextScaleExerciseInfo && (
        <div className="py-1 border-t border-border/30 flex flex-col justify-center">
          <p className="text-2xs text-muted-foreground mb-0.5">{t('next_chord')}</p>
          <div className="text-sm font-medium text-muted-foreground mb-0.5">
            {normalizeNoteName(nextScaleExerciseInfo.key)} {getScaleDisplayName(nextScaleExerciseInfo.scaleName, chordScaleDisplay)}
          </div>
          <div className="text-xs text-muted-foreground tracking-tight">
            {nextScaleExerciseInfo.sequence.map(formatDegree).join(' ')}
          </div>
        </div>
      )}
    </div>
  </CardContent>
</Card>
  )
})
