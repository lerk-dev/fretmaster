// 练习指板：弦分隔线 + 空弦/各品按钮 + 品数行（泛音点高亮），按 tab 决定高亮与可否点击
"use client"

import { memo, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { SCALE_MODES } from '@/lib/page-theory-data'
import { resolveInstrumentConfig } from '@/lib/practice-suggestions'
import { resolveFretCellRole, type FretboardRoleContext, type ThreeNpsPreviewKind } from '@/lib/fretboard-cell-role'
import { formatDegree } from '@/lib/page-theory-functions'
import { useAppStore, useIsPlaying, useUser, usePracticeSettings } from '@/lib/store'

interface PracticeFretboardProps {
  /** 翻译函数 */
  t: (key: string) => string
  /** 按变音号偏好格式化音名 */
  formatNoteByAccidentalSetting: (note: string) => string
  /** 点击品格 */
  handleFretClick: (stringIndex: number, fret: number) => void
  /** 按当前练习类型决定按钮配色/高亮 */
  getNoteButtonColor: (note: string, stringIndex: number, fret: number) => string
  /** 是否显示全部音符 */
  showAllNotes: boolean
  /** 高亮反馈（key=stringIndex-fret） */
  highlightedFrets: Map<string, boolean>
  /** 找音练习：已选琴弦 */
  selectedStrings: number[]
  /** 音程练习：根音 */
  rootNote: string
  /** 音程练习：已选音程下标 */
  selectedIntervals: number[]
  /** 音阶练习：调性 */
  scaleKey: string
  /** 音阶练习：当前音阶 */
  selectedScale: typeof SCALE_MODES.pentatonic[number]
  /** 音阶练习：音级序列 */
  scaleExerciseSequence: string[]
  /** 和弦进行：已转调序列 */
  transposedChords: { root: string; type: string; bass?: string }[]
  /** 和弦进行：当前和弦下标 */
  currentChordIndex: number
  /** 和弦练习：目标和弦 */
  chordExerciseTargetChord: { root: string; type: string } | null
  /** 找音练习：目标音名 */
  targetNote: string
  /** 找音练习：答题方式（`buttons` = 按钮答题） */
  practiceAnswerMode: string
  /** 找音练习（按钮答题）：本轮要求点的格子 */
  highlightedTargetPosition: { stringIndex: number; fret: number } | null
  /** 一弦三音：当前把位的目标品 */
  threeNpsTarget: { stringIndex: number; fret: number } | null
  /** 一弦三音：当前把位覆盖的格子（key = `${stringIndex}-${fret}`） */
  threeNpsCellKeys: ReadonlyMap<string, unknown>
  /**
   * 一弦三音：下一把位预览（key = `${stringIndex}-${fret}`）。
   * 与 GuitarRun 皮肤共用同一张产出表（`app/page.tsx:nextThreeNpsCells`）。
   */
  nextThreeNpsCells?: ReadonlyMap<string, ThreeNpsPreviewKind>
  /** 品记位置（页面模块级常量） */
  FRET_MARKERS: number[]
  /**
   * 无外壳模式：只渲染**指板主体**（弦行 + 空弦/各品按钮 + 品数行），不套 `Card`、
   * 不落 `data-onboarding`。供全屏覆盖层复用 —— 全屏与主区必须共用同一份指板标记。
   */
  embedded?: boolean
}

/**
 * 练习指板（从 app/page.tsx 原样搬出，行为不变）。
按当前 tab 高亮不同内容（找音目标/音程/和弦音级/音阶序列/和弦练习题目），弦分隔线 + 0 品空弦 +
1 品以上按品渲染，品数行（泛音点绿色标记）；点击品触发 handleFretClick。
 */
export const PracticeFretboard = memo(function PracticeFretboard({
  t,
  formatNoteByAccidentalSetting,
  handleFretClick,
  getNoteButtonColor,
  showAllNotes,
  highlightedFrets,
  selectedStrings,
  rootNote,
  selectedIntervals,
  scaleKey,
  selectedScale,
  scaleExerciseSequence,
  transposedChords,
  currentChordIndex,
  chordExerciseTargetChord,
  targetNote,
  practiceAnswerMode,
  highlightedTargetPosition,
  threeNpsTarget,
  threeNpsCellKeys,
  nextThreeNpsCells,
  FRET_MARKERS,
  embedded = false,
}: PracticeFretboardProps) {
// store 派生值：与页面用同一套 selector / 推导，正文里的名字保持不变
  const activeTab = useAppStore((s) => s.activeTab)
  const isPlaying = useIsPlaying()
  const user = useUser()
  const practiceSettings = usePracticeSettings()
  const instrumentConfig = resolveInstrumentConfig(user.instrument)
  /**
   * 🚨 **弦数就是调弦长度**，只有一个来源（乐器配置）—— 分隔线与行数都从这里派生。
   *
   * 修前：分隔线数取 `instrumentConfig.stringCount`，行数与音名却走模块级全局
   * `lib/string-tuning.ts`。真实页面靠 `app/page.tsx` 渲染期写全局来对齐，所以单独挂载
   * 本组件时会画成「3 条分隔线 + 6 行、且音名还是标准吉他」（四弦贝斯）。不报错，整体画错。
   * 现在两者同源，`tuning` 还一并透传给真相源（`roleCtx.tuning`）算音名。
   * 不变量 `stringCount === tuning.length` 由 `__tests__/practice-fretboard-exercise.test.ts` 扫全乐器钉住。
   */
  const tuning = instrumentConfig.tuning
  const STRING_COUNT = tuning.length
  const fretCount = practiceSettings.fretCount

  /**
   * 与 GuitarRun 皮肤**同源**的判定上下文。
   *
   * 🚨 判定全部委托给 `resolveFretCellRole`（共享真相源），本组件只负责把
   * `note` / `degree` / `showText` 翻成 DOM。此前这里自带一份实现（四条 tab 分支 +
   * 手写音程匹配 + 手写「半音 → 音级」表），与真相源分叉过两次，两次都「不报错、只教错」：
   *   ① 音阶音级走手写兜底表 ⇒ 29 个音阶上 53 处错标签（Phrygian 的 ♭2 写成 b9）；
   *   ② 音程分支漏了「根音恒 `1`」⇒ 根音格子「有颜色、没音级」。
   *
   * 唯二需要自己决定的：和弦来源**按 tab 选**（和弦进行用当前和弦、和弦练习用目标和弦），
   * 这一点必须与 `getNoteButtonColor`（配色层）保持一致。
   *
   * `tuning` 是本组件的乐器调弦（与上面的弦数同源），必须显式传 —— 否则真相源会去读
   * 模块级全局，又变成两个来源。
   *
   * `nextThreeNpsCells`（下一把位预览）两套皮肤共用同一张表：文字层在这里读、配色层在
   * `lib/fretboard-note-button-color.ts` 读，两边判定点位与真相源 `resolveBaseRole` 的 ② 对齐
   * （只在当前把位跑完时生效）。
   */
  const roleCtx: FretboardRoleContext = useMemo(
    () => ({
      activeTab,
      isPlaying,
      tuning,
      practiceAnswerMode,
      highlightedTargetPosition,
      targetNote,
      showAllNotes,
      highlightedFrets,
      fretZoneEnabled: practiceSettings.fretZoneEnabled,
      fretZoneStart: practiceSettings.fretZoneStart,
      fretZoneSize: practiceSettings.fretZoneSize,
      fretCount,
      chordTarget:
        activeTab === 'chord'
          ? (transposedChords[currentChordIndex] ?? null)
          : chordExerciseTargetChord,
      rootNote,
      selectedIntervals,
      scaleKey,
      selectedScale,
      scaleExerciseSequence,
      threeNpsTarget,
      threeNpsCellKeys,
      nextThreeNpsCells,
    }),
    [
      activeTab,
      isPlaying,
      tuning,
      practiceAnswerMode,
      highlightedTargetPosition,
      targetNote,
      showAllNotes,
      highlightedFrets,
      practiceSettings.fretZoneEnabled,
      practiceSettings.fretZoneStart,
      practiceSettings.fretZoneSize,
      fretCount,
      transposedChords,
      currentChordIndex,
      chordExerciseTargetChord,
      rootNote,
      selectedIntervals,
      scaleKey,
      selectedScale,
      scaleExerciseSequence,
      threeNpsTarget,
      threeNpsCellKeys,
      // 🚨 `nextThreeNpsCells` 必须在这里：产出侧（`app/page.tsx:nextThreeNpsCells`）的 deps
      //    含 `isThreeNpsActive` 与 `nextScaleExerciseInfo`，这两项**都不在本数组里**
      //    ⇒ 漏它时「产出换了新 Map、这里还握旧引用」，下一把位预览该刷不刷。
      //    它是 useMemo（引用在自身 deps 不变时稳定），加进来不会造成每次渲染重算。
      nextThreeNpsCells,
    ]
  )

/**
 * 某个品格位置在当前题目下该显示什么。
 *
 * 返回 `note`（原始音名，供 aria-label / 配色用）、`role`（语义角色，**只用于落 `data-role`**，
 * 让「两套皮肤对同一格给出同一角色」这件事在 DOM 上可断言；GuitarRun 皮肤也落同一个属性）、
 * `displayText`（命中当前题目 ⇒ 音级符号；否则 ⇒ 按变音号偏好格式化后的音名）
 * 与 `showText`（该不该可见）。
 *
 * ⚠️ `showText` 对**空弦（0 品）恒为 true**（那是弦标签，不参与藏答案）——
 * 这条刻外写在真相源里，0 品与 1..n 品共用同一条路。
 */
  const cellOf = (stringIndex: number, fret: number) => {
    const cell = resolveFretCellRole(roleCtx, stringIndex, fret)
    return {
      note: cell.note,
      role: cell.role,
      displayText: cell.degree ? cell.degree : formatNoteByAccidentalSetting(cell.note),
      showText: cell.showText,
    }
  }
  /**
   * 指板主体：弦分隔线 + 空弦/各品按钮 + 品数行。**全仓只有这一份实现。**
   *
   * 🚨 2026-10-01 去重：此前 `components/fullscreen-overlay.tsx` 里经典皮肤自带**第二份复制**，
   * 且已漂移 5 处 —— 列最小宽 `24/32` vs 本组件 `20/28`（⇒ 手机上 16 列要 384px、
   * 容器只有 326px，被 `overflow-hidden` 裁掉右侧 58px，约 2 个品）、不落 `data-role`、
   * 不显示音级（恒音名）、格字号与空弦列宽都不同。**不报错，只在全屏里画错。**
   * 现在全屏走 `embedded`，两处渲染同一段 JSX；护栏 `__tests__/fretboard-single-source.test.ts`。
   */
  const boardBody = (
    <>
    {/* 指板外层容器 - 统一圆角 */}
    <div className="relative rounded-lg overflow-hidden border border-border bg-muted/30 dark:bg-zinc-900/30">
      {/* 琴弦之间的虚线分隔 - 深浅主题都显示，浅色主题使用更浅的颜色*/}
      {Array.from({ length: STRING_COUNT - 1 }).map((_, i) => (
        <div
          key={`string-separator-${i}`}
          className="absolute left-0 right-0 pointer-events-none block z-10 dark:border-t dark:border-dashed dark:border-[oklch(0.35_0.02_260_/_0.8)]"
          style={{
            top: `${((i + 1) / STRING_COUNT) * 100}%`,
            borderTop: '1px dashed oklch(0.7 0.02 260 / 0.5)',
            transform: 'translateY(-1px)',
          }}
        />
      ))}

      {/* String labels and frets */}
      {tuning.map((_, stringIndex) => {
        // 找音练习：检查弦是否被选中（stringIndex 0-5 对应 1-6弦）
        const stringNum = stringIndex + 1
        const isStringEnabled = activeTab !== "practice" || selectedStrings.includes(stringNum)
        const openCell = cellOf(stringIndex, 0)

        return (
        <div key={stringIndex} className={cn(
          "flex items-center",
          !isStringEnabled && "opacity-60"
        )}>
          {/* Frets - 包含空弦（0品） */}
          <div className="flex-1 flex">
            {/* 空弦（0品） */}
            <button
              onClick={() => isStringEnabled && handleFretClick(stringIndex, 0)}
              disabled={!isStringEnabled}
              data-role={openCell.role}
              aria-label={isStringEnabled ? t('fretboard_position_label').replace('{note}', formatNoteByAccidentalSetting(openCell.note)).replace('{string}', String(stringIndex + 1)).replace('{fret}', '0') : undefined}
              className={cn(
                // 🚨 字体与 1..n 品**必须同一条栈**（Globals.css 的 --font-fretboard）：
                // 空弦原来是 `font-mono`、其余品是默认 sans ⇒ 同一个音名在第 0 品与第 1 品
                // 字形不同（Consolas vs Segoe UI），字号也差一档。护栏 fretboard-font-parity。
                "flex-[0.8] h-8 sm:h-10 text-2xs sm:text-xs font-fretboard font-semibold transition-all duration-150 relative",
                "flex items-center justify-center",
                isStringEnabled 
                  ? cn("text-foreground/80 bg-secondary/80 hover:bg-secondary", getNoteButtonColor(openCell.note, stringIndex, 0))
                  : "text-muted-foreground/50 bg-muted/30 cursor-not-allowed"
              )}
            >
              <span className={cn(
                "transition-opacity duration-150",
                openCell.showText ? "opacity-100" : "opacity-0"
              )}>
                {formatDegree(openCell.displayText)}
              </span>
            </button>
            
            {/* 1品及以上 */}
            {Array.from({ length: fretCount }, (_, fret) => {
              const actualFret = fret + 1
              // 与空弦（0 品）共用同一套判定：命中题目 ⇒ 音级符号，否则 ⇒ 音名；可见性也一致
              const { note, role, displayText, showText } = cellOf(stringIndex, actualFret)
              return (
                <button
                  key={actualFret}
                  onClick={() => isStringEnabled && handleFretClick(stringIndex, actualFret)}
                  disabled={!isStringEnabled}
                  data-role={role}
                  aria-label={isStringEnabled ? t('fretboard_position_label').replace('{note}', formatNoteByAccidentalSetting(note)).replace('{string}', String(stringIndex + 1)).replace('{fret}', String(actualFret)) : undefined}
                  className={cn(
                    // 🚨 音名字号比空弦列小一档是**刻意**的（刻度 4xs8 < 3xs9 < 2xs10 < xs12）；
                    // 2026-10-07 用户要求「音字体调大一号」⇒ 由 `text-4xs sm:text-2xs` 上移一档。
                    // 此串被 `__tests__/fretboard-font-parity.test.ts` 当锚点钉住，改字号要同步改那边。
                    "flex-1 h-8 sm:h-10 text-3xs sm:text-xs font-fretboard font-medium transition-all duration-150 min-w-[20px] sm:min-w-[28px]",
                    "flex items-center justify-center relative z-10",
                    "border-r",
                    isStringEnabled
                      ? cn("border-border/50 dark:border-zinc-600/50", getNoteButtonColor(note, stringIndex, actualFret))
                      : "border-border/30 dark:border-zinc-800/50 text-muted-foreground/50 bg-muted/30 cursor-not-allowed"
                  )}
                >
                  <span className={cn(
                    "transition-opacity duration-150",
                    showText ? "opacity-100" : "opacity-0"
                  )}>
                    {formatDegree(displayText)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )})}
    </div>
    
    {/* Fret numbers - 品数显示（泛音点位置用绿色标记） */}
    <div className="flex items-center py-1">
      <div className="flex-1 flex">
        {/* 0品占位（与指板空弦对齐） */}
        <div className="flex-[0.8]" />
        {/* 品数 */}
        {Array.from({ length: fretCount }, (_, fret) => {
          const actualFret = fret + 1
          const isMarker = FRET_MARKERS.includes(actualFret)
          return (
            <div key={actualFret} className="flex-1 flex justify-center min-w-[20px] sm:min-w-[28px]">
              <span className={cn(
                "text-2xs font-fretboard",
                isMarker ? "text-primary font-semibold" : "text-muted-foreground"
              )}>
                {actualFret}
              </span>
            </div>
          )
        })}
      </div>
    </div>

    </>
  )

  // 无外壳模式（全屏覆盖层复用）：只给指板主体 —— 不带 Card、不带 data-onboarding
  if (embedded) return boardBody

  return (
<Card
  data-onboarding="fretboard"
  className="gap-0 pt-3 sm:pt-4 pb-0"
>
  <CardContent className="p-2 sm:p-4 pt-0">
    {boardBody}
  </CardContent>
</Card>
  )
})
