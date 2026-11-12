// GuitarRun 风格指板（备选显示方案）：复刻 guitarrun.com 的指板渲染 —— 深色舞台 + 横向品列，
// 每个音是一个圆点（不是经典皮肤的实心色块），弦线用格子内的横向细线拼出来，品记点在指板下沿。
//
// 与 `components/practice-fretboard.tsx` 的关系：
//   · 结构**不同**（GuitarRun 是 grid：行=弦、列=品，含一个"空弦"宽列）
//   · **判定完全同源** —— 两套皮肤都调 `lib/fretboard-cell-role.ts:resolveFretCellRole`，
//     由它保证「同一个格子在两套皮肤下是同一个角色」，这里只负责把角色翻译成 `.gr-*` class。
//   · 跟随本项目配置：品数取 `practiceSettings.fretCount`、弦数取乐器配置、音名跟升降号偏好，
//     **不照抄** GuitarRun 硬编码的 17 品 / 6 弦 / 只画升号。
"use client"

import { memo, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { resolveInstrumentConfig } from '@/lib/practice-suggestions'
import { formatDegree } from '@/lib/page-theory-functions'
import { useAppStore, useIsPlaying, useUser, usePracticeSettings } from '@/lib/store'
import { stringIndexToNumber } from '@/lib/string-index'
import {
  resolveFretCellRole,
  type FretCellRole,
  type ScaleLike,
  type ThreeNpsPreviewKind,
} from '@/lib/fretboard-cell-role'
import { TrainerFretboard, type TrainerCellView } from '@/components/trainer-fretboard'
import { useFretboardLines, type PathPoint } from '@/hooks/use-fretboard-lines'
import { FretboardPathOverlay } from '@/components/fretboard-path-overlay'

export interface GuitarRunFretboardProps {
  t: (key: string) => string
  formatNoteByAccidentalSetting: (note: string) => string
  handleFretClick: (stringIndex: number, fret: number) => void
  showAllNotes: boolean
  highlightedFrets: Map<string, boolean>
  selectedStrings: number[]
  rootNote: string
  selectedIntervals: number[]
  scaleKey: string
  selectedScale: ScaleLike
  scaleExerciseSequence: string[]
  transposedChords: { root: string; type: string; bass?: string }[]
  currentChordIndex: number
  chordExerciseTargetChord: { root: string; type: string } | null
  FRET_MARKERS: number[]
  /** 找音练习：目标音名 */
  targetNote: string
  /**
   * 单音全指板：该音名的全部落点都以 target 角色高亮。
   * 省略 = 未开启该模式（行为与旧版完全一致）。
   */
  singleNoteTarget?: string
  /** 单音全指板：已找到的位置（位置地图，已找到实心 / 未找到空心圈） */
  singleNoteFound?: ReadonlyArray<{ stringIndex: number; fret: number }>
  /** 单音全指板：已跳过（放弃）的位置 —— 画成灰色斜线圈，与「未找到」区分 */
  singleNoteSkipped?: ReadonlyArray<{ stringIndex: number; fret: number }>
  /**
   * 单音全指板「无提示」：未找到的落点不画（只显示已找到的），
   * 否则等于把答案直接圈在指板上。
   */
  singleNoteHideUnfound?: boolean
  /** 单音全指板：按巡游顺序连线（已找到的位置），少于 2 个点不画；`dashed` = 跨过缺口的段 */
  connectPoints?: ReadonlyArray<PathPoint>
  /** 找音练习：答题方式 */
  practiceAnswerMode: string
  /** 找音练习（按钮答题）：本轮要求点的格子 */
  highlightedTargetPosition: { stringIndex: number; fret: number } | null
  /** 一弦三音：当前把位的目标品 */
  threeNpsTarget: { stringIndex: number; fret: number } | null
  /** 一弦三音：当前把位覆盖的格子 */
  threeNpsCellKeys: ReadonlyMap<string, unknown>
  /** 一弦三音：下一把位预览 */
  nextThreeNpsCells?: ReadonlyMap<string, ThreeNpsPreviewKind>
  /**
   * 皮肤变体（默认 GuitarRun）：
   *   · `'guitarrun'` —— 原版霓虹圆点（`.gr-*`）；
   *   · `'trainer'`  —— MyFretboardTrainer 深色 3D 琴颈（`.ft-*`，由 `TrainerFretboard` 渲染）。
   * 两种变体**共用同一份角色判定结果**（见下方的 `rows`），只有外观不同。
   */
  skin?: 'guitarrun' | 'trainer'
}

/** 语义角色 → GuitarRun 皮肤的 class（前缀 `gr-` 避免与全局样式撞名） */
export const ROLE_CLASS: Record<FretCellRole, string> = {
  none: '',
  muted: 'gr-cell--muted',
  tone: 'gr-cell--tone',
  root: 'gr-cell--root',
  target: 'gr-cell--target',
  matched: 'gr-cell--hit',
  wrong: 'gr-cell--wrong',
  preview: 'gr-cell--next',
  previewRoot: 'gr-cell--next-root',
  previewStart: 'gr-cell--next-start',
}

/** 语义角色 → MyFretboardTrainer 皮肤的 data-role（颜色在 app/globals.css 的 `.ft-` 块里） */
export const TRAINER_ROLE: Record<FretCellRole, string> = {
  none: '',
  muted: 'muted',
  tone: 'tone',
  root: 'root',
  target: 'target',
  matched: 'matched',
  wrong: 'wrong',
  preview: 'preview',
  previewRoot: 'preview-root',
  previewStart: 'preview-start',
}

/**
 * 弦线粗细（px）：string index 0 = 最高音弦 = 最细。
 * GuitarRun 用 6 条硬编码规则（1 / 1.4 / 1.8 / 2.3 / 2.8 / 3.4），这里改成按索引连续计算，
 * 这样七弦吉他与贝斯（弦数不同）不会掉到同一条线上。
 */
export function stringLineWidth(stringIndex: number): number {
  return Math.round((1 + Math.max(0, stringIndex) * 0.48) * 100) / 100
}

export const GuitarRunFretboard = memo(function GuitarRunFretboard({
  t,
  formatNoteByAccidentalSetting,
  handleFretClick,
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
  FRET_MARKERS,
  targetNote,
  singleNoteTarget,
  singleNoteFound,
  singleNoteSkipped,
  singleNoteHideUnfound,
  connectPoints,
  practiceAnswerMode,
  highlightedTargetPosition,
  threeNpsTarget,
  threeNpsCellKeys,
  nextThreeNpsCells,
  skin = 'guitarrun',
}: GuitarRunFretboardProps) {
  const activeTab = useAppStore((s) => s.activeTab)
  const isPlaying = useIsPlaying()
  const user = useUser()
  const practiceSettings = usePracticeSettings()
  const instrumentConfig = resolveInstrumentConfig(user.instrument)
  // 🚨 弦数与调弦**只有一个来源**（乐器配置）：分隔/行迭代与音名推算都从 `tuning` 派生。
  // 修前这里 `STRING_COUNT` 取 config 的 stringCount、行数却取模块级全局 `getStringTuning()`，
  // 单独挂载时会画出「分隔线数与行数对不上、音名还是别的乐器」的指板。
  const tuning = instrumentConfig.tuning
  const STRING_COUNT = tuning.length
  const fretCount = practiceSettings.fretCount

  // 与经典皮肤同源的判定上下文（唯二差异：和弦来源按 tab 选，见下）
  const ctx = useMemo(
    () => ({
      activeTab,
      isPlaying,
      tuning,
      practiceAnswerMode,
      highlightedTargetPosition,
      targetNote,
      singleNoteTarget,
      showAllNotes,
      highlightedFrets,
      fretZoneEnabled: practiceSettings.fretZoneEnabled,
      fretZoneStart: practiceSettings.fretZoneStart,
      fretZoneSize: practiceSettings.fretZoneSize,
      fretCount,
      // 和弦转换练习用「当前进行的和弦」，和弦练习用「本轮目标和弦」——
      // 这一点必须与经典皮肤的颜色函数保持一致（它也是按 tab 分的）。
      chordTarget:
        activeTab === 'chord' ? (transposedChords[currentChordIndex] ?? null) : chordExerciseTargetChord,
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
      singleNoteTarget,
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
      nextThreeNpsCells,
    ],
  )

  const gridTemplateColumns = `var(--gr-open-w) repeat(${fretCount}, minmax(0, 1fr))`
  const strings = tuning

  // 角色判定**只在这里发生一次**：两套皮肤都消费这一份结果，
  // 保证「同一个格子在两套皮肤下是同一个角色」不会被渲染层的分支悄悄分叉（铁律 14）。
  const rows = useMemo(
    () =>
      strings.map((_, stringIndex) =>
        Array.from({ length: fretCount + 1 }, (_, fret) => resolveFretCellRole(ctx, stringIndex, fret)),
      ),
    [strings, fretCount, ctx],
  )

  // 单音全指板路径：坐标同样靠真实 DOM 矩形测量（grid 列宽随容器变化）
  const { containerRef, linePoints } = useFretboardLines(connectPoints, skin)

  /** 已找到位置集合：位置地图里区分「实心 / 空心圈」 */
  const singleNoteFoundKeys = useMemo(
    () => (singleNoteFound && singleNoteFound.length > 0
      ? new Set(singleNoteFound.map((p) => `${p.stringIndex}-${p.fret}`))
      : null),
    [singleNoteFound],
  )

  /** 已跳过位置集合：画灰色斜线圈（与「未找到」的空心圈区分） */
  const singleNoteSkippedKeys = useMemo(
    () => (singleNoteSkipped && singleNoteSkipped.length > 0
      ? new Set(singleNoteSkipped.map((p) => `${p.stringIndex}-${p.fret}`))
      : null),
    [singleNoteSkipped],
  )

  if (skin === 'trainer') {
    const cells = new Map<string, TrainerCellView>()
    for (let stringIndex = 0; stringIndex < rows.length; stringIndex++) {
      for (let fret = 0; fret < rows[stringIndex].length; fret++) {
        const { role, degree, showText, note } = rows[stringIndex][fret]
        const key = `${stringIndex}-${fret}`
        const isSingleNoteCell = !!singleNoteTarget && role === 'target'
        /** 精确提示：这一格就是「现在要弹的位置」 */
        const isPromptCell =
          isSingleNoteCell &&
          highlightedTargetPosition?.stringIndex === stringIndex &&
          highlightedTargetPosition?.fret === fret
        const isFoundCell = isSingleNoteCell && !!singleNoteFoundKeys?.has(key)
        const isSkippedCell = isSingleNoteCell && !!singleNoteSkippedKeys?.has(key)
        // 无提示：未找到的落点连角色都不给（不画圈、不上色）
        const hidden =
          isSingleNoteCell && !!singleNoteHideUnfound && !isFoundCell && !isPromptCell
        cells.set(key, {
          text: showText ? (degree ? formatDegree(degree) : formatNoteByAccidentalSetting(note)) : '',
          role: TRAINER_ROLE[hidden ? 'none' : role],
          // 🚨 圆点可见性 ≠ 文字可见性：单音模式的目标落点**不写音名**（写出来就是答案），
          // 但圆点本身必须画出来。之前这里直接等于 `showText`，于是 3D 琴颈下
          // 「精确提示选中的那一格」和没选中完全一样 —— 屏幕上什么都没有。
          visible: showText || (!hidden && role !== 'none'),
          // 音名**恒给**（即便这格不显示文字）—— 读屏标签里要用，见 TrainerCellView.note 的说明
          note: formatNoteByAccidentalSetting(note),
          // 单音全指板的位置地图：精确提示 / 已找到 / 未找到 / 已跳过，四种外观
          state: isSingleNoteCell && !hidden
            ? isSkippedCell
              ? 'skipped'
              : isFoundCell
                ? 'found'
                : isPromptCell
                  ? 'prompt'
                  : 'pending'
            : undefined,
        })
      }
    }
    return (
      <TrainerFretboard
        tuning={tuning}
        fretCount={fretCount}
        cells={cells}
        fretMarkers={FRET_MARKERS}
        openLabel={t('fretboard_open_label')}
        t={t}
        onCellClick={handleFretClick}
        isCellEnabled={(stringIndex) =>
          activeTab !== 'practice' || selectedStrings.includes(stringIndexToNumber(stringIndex))
        }
        // 连线：3D 皮肤的格子结构与 GuitarRun 完全不同，但测量只看 `[data-position]`，
        // 所以同一个 hook / 同一个覆盖层可以直接复用。
        overlayRef={containerRef}
        overlay={<FretboardPathOverlay points={linePoints} />}
      />
    )
  }

  return (
    <div className="gr-stage" data-onboarding="fretboard">
      <div className="gr-scroll">
        <div className="gr-grid">
          <div ref={containerRef} className="gr-fretboard relative" style={{ gridTemplateColumns }}>
            {rows.map((stringRow, stringIndex) => {
              // 找音练习：未被选中的弦不可点击（与经典皮肤一致）
              const isStringEnabled = activeTab !== 'practice' || selectedStrings.includes(stringIndexToNumber(stringIndex))
              const cells = []
              for (let fret = 0; fret <= fretCount; fret++) {
                const { role, degree, showText, note } = stringRow[fret]
                const isOpen = fret === 0
                const isMarker = !isOpen && FRET_MARKERS.includes(fret) && stringIndex === STRING_COUNT - 1
                const text = degree ? formatDegree(degree) : formatNoteByAccidentalSetting(note)
                // 单音全指板「位置地图」：未找到的落点画成空心圈（已找到/当前提示保持实心）
                const isSingleNoteCell = !!singleNoteTarget && role === 'target'
                const isPromptCell =
                  isSingleNoteCell &&
                  highlightedTargetPosition?.stringIndex === stringIndex &&
                  highlightedTargetPosition?.fret === fret
                const isFoundCell = isSingleNoteCell && !!singleNoteFoundKeys?.has(`${stringIndex}-${fret}`)
                const isSkippedCell = isSingleNoteCell && !!singleNoteSkippedKeys?.has(`${stringIndex}-${fret}`)
                // 无提示：未找到的落点不画（只显示弹对之后的实心点）
                const isHiddenCell =
                  isSingleNoteCell && !!singleNoteHideUnfound && !isFoundCell && !isPromptCell
                cells.push(
                  <button
                    key={fret}
                    type="button"
                    onClick={() => isStringEnabled && handleFretClick(stringIndex, fret)}
                    disabled={!isStringEnabled}
                    aria-label={
                      isStringEnabled
                        ? t('fretboard_position_label')
                            .replace('{note}', formatNoteByAccidentalSetting(note))
                            .replace('{string}', String(stringIndexToNumber(stringIndex)))
                            .replace('{fret}', String(fret))
                        : undefined
                    }
                    className={cn(
                      'gr-cell',
                      isOpen && 'gr-cell--open',
                      !isStringEnabled && 'gr-cell--disabled',
                      ROLE_CLASS[isHiddenCell ? 'none' : role],
                      // 当前位置提示：和「已找到」同为目标角色，光靠实心圆分不出来，
                      // 再加一层呼吸光环（样式见 app/globals.css 的 .gr-cell--prompt）
                      isPromptCell && 'gr-cell--prompt',
                      isSingleNoteCell && !isPromptCell && !isFoundCell && !isSkippedCell && !isHiddenCell && 'gr-cell--pending',
                      isSkippedCell && 'gr-cell--skipped',
                    )}
                    data-string={stringIndex}
                    data-fret={fret}
                    data-position={`${stringIndex}-${fret}`}
                    data-role={isHiddenCell ? 'none' : role}
                    data-marker={isMarker ? '1' : undefined}
                    style={{ ['--gr-string-w' as string]: `${stringLineWidth(stringIndex)}px` }}
                  >
                    <span className="gr-note-dot" data-visible={showText ? '1' : '0'}>
                      {text}
                    </span>
                  </button>,
                )
              }
              return cells
            })}

            {/* 单音全指板：已找到位置的黄铜虚线路径（绝对定位，不参与 grid 布局） */}
            <FretboardPathOverlay points={linePoints} />
          </div>

          {/* 品号行：0 品显示为「空弦」（GuitarRun 写 OPEN），品记位强调 */}
          <div className="gr-fret-numbers" style={{ gridTemplateColumns }}>
            <span className="gr-fret-number gr-fret-number--open">{t('fretboard_open_label')}</span>
            {Array.from({ length: fretCount }, (_, i) => {
              const fret = i + 1
              return (
                <span
                  key={fret}
                  className={cn('gr-fret-number', FRET_MARKERS.includes(fret) && 'gr-fret-number--marker')}
                >
                  {fret}
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
})
