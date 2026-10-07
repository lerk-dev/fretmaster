// MyFretboardTrainer 风格指板渲染器（深色 3D 琴颈：木纹颈身 + 金属弦 + 亮银品丝 + 珠光品记 + 发光圆点）。
//
// 这是一个**纯渲染器**：只负责「把一张格子表画成指板」，不判断任何练习/CAGED 语义。
// 两处调用方：
//   · `components/guitarrun-fretboard.tsx` 的 `skin='trainer'` 分支 —— 第三套练习皮肤
//     （格子角色由 `lib/fretboard-cell-role.ts` 的 `resolveFretCellRole` 判定，与 GuitarRun 皮肤**同一份**）
//   · `components/caged-board.tsx`                  —— 乐理面板的整幅 CAGED/音阶浏览器
// 这样「同一个格子在两处是同一个角色」由各自的数据源保证，渲染层不会偷偷分叉。
//
// 结构沿用与 GuitarRun 同构的 CSS Grid（行 = 弦、列 = 品，含一个更宽的 0 品列），
// 而不是参考站的「绝对定位 + JS 算像素」：那样在容器宽度变化时要重算，且无法复用已有护栏。

"use client"

import { memo } from 'react'
import { cn } from '@/lib/utils'

/** 一个格子的渲染信息（由调用方算好，渲染层不解释语义） */
export interface TrainerCellView {
  /** 圆点里的文字；空串 = 不显示文字（仍可能显示圆点） */
  text: string
  /** 视觉角色 → `data-role`，决定颜色（`form-C` / `form-DC` / `root` / `default` / `tone` …） */
  role: string
  /** 是否显示圆点 */
  visible: boolean
  /**
   * 该格的**音名**，只用于无障碍标签里的 `{note}` 占位符。
   *
   * 🚨 必填，不是可选的：`fretboard_position_label` 的模板是 `{note} {string}弦 {fret}品`，
   * 少替换一个占位符不会报错 —— 读屏会照着念「{note} 1弦 0品」。这个坑在本皮肤的第一版
   * 真实发生过（只替换了 `{string}` / `{fret}`），所以做成必填字段让类型系统兜住。
   */
  note: string
}

export interface TrainerFretboardProps {
  /** 各弦空弦音（半音值，索引 0 = 最高音弦） */
  tuning: number[]
  fretCount: number
  /** `"${stringIndex}-${fret}"` → 格子；缺省 = 该格不显示圆点 */
  cells: ReadonlyMap<string, TrainerCellView>
  fretMarkers: number[]
  /** 0 品列的文字（「空弦」/「OPEN」） */
  openLabel: string
  t: (key: string) => string
  /** 传入则格子可点击（练习皮肤）；不传则整块只读（乐理面板） */
  onCellClick?: (stringIndex: number, fret: number) => void
  /** 该弦是否可点（练习：未被选中的弦不可点）。缺省全部可点 */
  isCellEnabled?: (stringIndex: number) => boolean
  /** 整块指板的无障碍标签（已翻译好的文案） */
  ariaLabel?: string
}

/**
 * 弦线粗细（px）—— **乐器比例件**，不随显示缩放变粗。
 * 取值照参考站深色主题的六条规则（#string1..6 = 1 / 1.5 / 2 / 2.5 / 3.2 / 4.2）。
 * 超过 6 弦（七弦吉他 / 贝斯）走连续公式兜底，避免几根弦掉到同一宽度。
 */
export function trainerStringLineWidth(stringIndex: number): number {
    const sixString = [
        1,
        1.5,
        2,
        2.5,
        3.2,
        4.2
    ];
    return sixString[stringIndex] ?? Math.round((1 + Math.max(0, stringIndex) * 0.6) * 10) / 10;
}

export const TrainerFretboard = memo(function TrainerFretboard({
    tuning,
    fretCount,
    cells,
    fretMarkers,
    openLabel,
    t,
    onCellClick,
    isCellEnabled,
    ariaLabel,
}: TrainerFretboardProps) {
    const stringCount = tuning.length
    const gridTemplateColumns = `var(--ft-open-w) repeat(${fretCount}, minmax(0, 1fr))`
    // 品记点画在**中间那根弦**上（参考站就在颈身中央，不是最低音弦）
    const inlayStringIndex = Math.floor(stringCount / 2)
    const interactive = typeof onCellClick === 'function'

    return (
        <div className="ft-stage" data-fretboard-trainer="1">
            <div className="ft-scroll">
                <div className="ft-grid">
                    <div
                        className="ft-board"
                        style={{ gridTemplateColumns }}
                        role={ariaLabel ? 'group' : undefined}
                        aria-label={ariaLabel}
                    >
                        {tuning.map((_, stringIndex) => {
                            const enabled = isCellEnabled ? isCellEnabled(stringIndex) : true
                            return Array.from({ length: fretCount + 1 }, (_, fret) => {
                                const cell = cells.get(`${stringIndex}-${fret}`)
                                const isOpen = fret === 0
                                const isMarker =
                                    !isOpen && fretMarkers.includes(fret) && stringIndex === inlayStringIndex
                                const className = cn(
                                    'ft-cell',
                                    isOpen && 'ft-cell--open',
                                    !interactive && 'ft-cell--static',
                                    !enabled && 'ft-cell--disabled',
                                )
                                const inner = (
                                    <>
                                        {isMarker && <span className="ft-inlay" aria-hidden="true" />}
                                        <span
                                            className="ft-dot"
                                            data-role={cell?.role ?? 'default'}
                                            data-visible={cell && cell.visible ? '1' : '0'}
                                        >
                                            {cell && cell.visible ? cell.text : ''}
                                        </span>
                                    </>
                                )
                                // 只读模式用 div（不进 tab 序、不撒谎说是按钮）；练习模式用原生 button
                                if (!interactive) {
                                    return (
                                        <div
                                            key={fret}
                                            className={className}
                                            data-string={stringIndex}
                                            data-fret={fret}
                                            data-role={cell?.role}
                                            // 🚨 弦粗**两个分支都要设**：只设在 button 分支的话，
                                            // 只读的「整幅 CAGED」会全落到 `--ft-string-w` 的兜底 1px
                                            // ⇒ 六根弦一样粗，静默丢掉「低音弦更粗」的视觉线索。
                                            style={{
                                                ['--ft-string-w' as string]: `${trainerStringLineWidth(stringIndex)}px`,
                                            }}
                                        >
                                            {inner}
                                        </div>
                                    )
                                }
                                return (
                                    <button
                                        key={fret}
                                        type="button"
                                        onClick={() => enabled && onCellClick!(stringIndex, fret)}
                                        disabled={!enabled}
                                        /*
                                         * 🚨 三个占位符都要替换：`{note}` 漏一个不会报错，
                                         * 但读屏会照着念「{note} 1弦 0品」。
                                         * 末尾的 `\s+`→单空格 + trim 是兜底：万一调用方漏给 note，
                                         * 至少不把 `{note}` 这个记号念出来。
                                         * ⚠️ 注释不要写进 `aria-label={}` 表达式里面 ——
                                         * `hardcoded-a11y-labels` 护栏不剥行内注释，会判成字面量中文。
                                         */
                                        aria-label={
                                            enabled
                                                ? t('fretboard_position_label')
                                                      .replace('{note}', cell?.note ?? '')
                                                      .replace('{string}', String(stringIndex + 1))
                                                      .replace('{fret}', String(fret))
                                                      .replace(/\s+/g, ' ')
                                                      .trim()
                                                : undefined
                                        }
                                        className={className}
                                        data-string={stringIndex}
                                        data-fret={fret}
                                        data-role={cell?.role}
                                        style={{
                                            ['--ft-string-w' as string]: `${trainerStringLineWidth(stringIndex)}px`,
                                        }}
                                    >
                                        {inner}
                                    </button>
                                )
                            })
                        })}
                    </div>

                    {/* 品号行：0 品显示为「空弦」 */}
                    <div className="ft-nums" style={{ gridTemplateColumns }}>
                        <span className="ft-num--open">{openLabel}</span>
                        {Array.from({ length: fretCount }, (_, i) => {
                            const fret = i + 1
                            return (
                                <span
                                    key={fret}
                                    className={cn(fretMarkers.includes(fret) && 'ft-num--marker')}
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

/** 图例（C A G E D），颜色即形状色；只在 CAGED 档显示 */
export function TrainerCagedLegend({ size }: { size?: 'sm' }) {
    return (
        <div className="ft-legend" data-size={size} aria-hidden="true">
            {['C', 'A', 'G', 'E', 'D'].map((f) => (
                <span key={f} className={`ft-legend-${f}`}>
                    {f}
                </span>
            ))}
        </div>
    )
}
