'use client'

// 乐理知识面板
// 五个教学模块（其中 4/5 的展示方式参考 myfretboardtrainer.com）：
// 1. 五度圈 —— 交互式 SVG，12 个大调（外圈）+ 12 个小调（内圈），点击查看调号与关系调
// 2. 和弦音阶 —— 选择和弦类型，展示可搭配音阶及音符构成（CHORD_SCALE_OPTIONS）+ 整指板和弦音位图
// 3. 把位教学 —— 度数锚定把位指型 + CAGED 五指型（仅六弦标准调弦）
// 4. 调式图鉴 —— 大调/和声小调/旋律小调三族 × 7 调式 × 12 根音的全指板分布，
//    音名↔音级切换，每个调式附特征/用法教学文字与父调提示
// 5. 音程探索 —— 整指板每格显示与根音的音程，点击任意格子换根音；按互补对分组着色

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { BookOpen } from 'lucide-react'
import { CagedBoard } from '@/components/caged-board'
import { NOTES } from '@/lib/page-theory-data'
import { TRANSLATIONS } from '@/lib/i18n'
import { InstrumentType, resolveInstrumentConfig } from '@/lib/practice-suggestions'
import {
  ChordType,
  CHORD_INTERVALS,
  NOTE_UNICODE_NAMES,
  NOTE_UNICODE_NAMES_FLAT,
  getChordNotes,
  getChordTypeUnicodeDisplayString,
  Note,
} from '@/lib/chord-theory'
import {
  ScaleType,
  getScaleNotes,
  getScaleDisplayName,
  getScaleOptionsForChord,
} from '@/lib/scale-theory'
import {
  generateScalePositions,
  getCagedShapes,
  getDegreeLabels,
  isStandardSixStringGuitar,
  getScaleNotesInWindow,
  type ChordQuality,
} from '@/lib/fretboard-positions'
import { SCALE_MODES } from '@/lib/page-theory-data'
// ⚠️ 与上面 `@/lib/scale-theory` 的同名函数**不是一回事**：这个吃「音阶英文名」，
// 用于按 SCALE_MODES 的 name 取本地化显示名（调式按钮/名称/父调提示），故别名区分。
import { formatDegree, getScaleDisplayName as getScaleDisplayNameByName } from '@/lib/page-theory-functions'
import {
  MODE_FAMILIES,
  INTERVAL_DEGREE_LABELS,
  INTERVAL_GROUPS,
  intervalGroupOf,
  chordToneLabel,
  parentKeyOf,
  type IntervalGroup,
} from '@/lib/theory-mode-guide'

/** 音程互补对 → 格子配色（图例同色）。root 组就是根音本身，走主色。 */
const INTERVAL_GROUP_CLASS: Record<IntervalGroup['id'], string> = {
  root: 'bg-primary/80 text-primary-foreground border-primary',
  halfStep: 'bg-rose-500/25 text-foreground border-rose-500/40',
  wholeStep: 'bg-amber-500/25 text-foreground border-amber-500/40',
  thirdPair: 'bg-violet-500/25 text-foreground border-violet-500/40',
  sixthPair: 'bg-sky-500/25 text-foreground border-sky-500/40',
  perfect: 'bg-emerald-500/25 text-foreground border-emerald-500/40',
  tritone: 'bg-orange-500/30 text-foreground border-orange-500/50',
}

interface TheoryPanelProps {
  instrument: InstrumentType
  fretCount: number
  language: string
  /** 品记品（与练习指板同一份取值，由 page 传入 —— 不在这里再写一份，避免两处 diverge） */
  fretMarkers: number[]
}

// ==================== 五度圈数据 ====================

// 12 个位置，顺时针每步纯五度；位置 6 起用降号命名（传统记法）
// pitch class: C=0 … B=11
const CIRCLE_MAJOR_PC = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]
const CIRCLE_MAJOR_NAMES = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F']
const CIRCLE_MINOR_NAMES = ['Am', 'Em', 'Bm', 'F♯m', 'C♯m', 'G♯m', 'D♯m', 'B♭m', 'G♭m', 'E♭m', 'Cm', 'Gm']
// 大调调号（正 = 升号数，负 = 降号数）
const CIRCLE_MAJOR_KEY_SIG = [0, 1, 2, 3, 4, 5, 6, -5, -4, -3, -2, -1]

// ==================== 和弦音阶数据 ====================

// 常用和弦子集（完整 ChordType 有 60+ 项，全列出可用性差）
const COMMON_CHORD_TYPES: ChordType[] = [
  ChordType.majorTriad,
  ChordType.minorTriad,
  ChordType.dominantSeven,
  ChordType.majorSeven,
  ChordType.minorSeven,
  ChordType.minorSevenFlatFive,
  ChordType.diminishedTriad,
  ChordType.augmentedTriad,
  ChordType.susFourTriad,
  ChordType.susTwoTriad,
  ChordType.six,
  ChordType.minorSix,
  ChordType.dominantNine,
  ChordType.majorNine,
  ChordType.minorNine,
  ChordType.dominantSevenFlatNine,
  ChordType.dominantSevenSharpNine,
  ChordType.dominantSevenAlt,
  ChordType.dominantThirteen,
  ChordType.majorThirteen,
]

// ==================== 把位教学数据 ====================

const POSITION_SCALES: ScaleType[] = [
  ScaleType.major,
  ScaleType.naturalMinor,
  ScaleType.harmonicMinor,
  ScaleType.melodicMinor,
  ScaleType.dorian,
  ScaleType.phrygian,
  ScaleType.lydian,
  ScaleType.mixolydian,
  ScaleType.majorPentatonic,
  ScaleType.minorPentatonic,
  ScaleType.blues,
]

const ROOT_PC_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']

function pcName(pc: number, preferFlat = false): string {
  return (preferFlat ? NOTE_UNICODE_NAMES_FLAT : NOTE_UNICODE_NAMES)[pc] ?? 'C'
}

// ==================== 迷你指板 ====================

interface MiniFretboardProps {
  stringCount: number
  tuning: number[] // 高音 → 低音（半音值）
  startFret: number
  endFret: number
  // 位置 → 显示内容；未命中的格子渲染为空
  cells: Map<string, { label: string; isRoot: boolean; sub?: string }>
  /** 提供时格子变成按钮（音程探索：点格子换根音）。a11y 标签由调用方经 t() 生成 */
  onCellClick?: (stringIndex: number, fret: number) => void
  /** 可点击格子的 aria-label（必须经 t()，禁中文字面量） */
  cellAriaLabel?: (stringIndex: number, fret: number) => string
  /** 提供时覆盖默认配色（音程探索按互补对分组着色） */
  cellClass?: (stringIndex: number, fret: number) => string | undefined
}

/** 迷你指板：行 = 弦（上 = 高音弦），列 = 品窗；命中的格子显示音级/音名 */
function MiniFretboard({ stringCount, tuning, startFret, endFret, cells, onCellClick, cellAriaLabel, cellClass }: MiniFretboardProps) {
  const frets = Array.from({ length: endFret - startFret + 1 }, (_, i) => startFret + i)
  const renderCell = (s: number, f: number) => {
    const cell = cells.get(`${s}-${f}`)
    const cls = cellClass?.(s, f)
    const inner = cell ? (
      <>
        <span>{cell.label}</span>
        {cell.sub && <span className="text-4xs opacity-70 font-normal">{cell.sub}</span>}
      </>
    ) : null
    const colorCls = cls ?? (cell
      ? cell.isRoot
        ? 'bg-primary/80 text-primary-foreground border-primary'
        : 'bg-emerald-500/25 text-foreground border-emerald-500/40'
      : '')
    if (onCellClick) {
      return (
        <button
          key={f}
          type="button"
          data-cell={`${s}-${f}`}
          aria-label={cellAriaLabel?.(s, f)}
          onClick={() => onCellClick(s, f)}
          className={`w-8 sm:w-9 h-6 m-[1px] rounded-sm flex items-center justify-center gap-0.5 text-2xs font-semibold tabular-nums border ${colorCls || 'bg-muted/50 dark:bg-zinc-800/50 border-border/20'} cursor-pointer hover:brightness-110`}
        >
          {inner}
        </button>
      )
    }
    if (!cell) {
      return (
        <div
          key={f}
          data-cell={`${s}-${f}`}
          className="w-8 sm:w-9 h-6 m-[1px] rounded-sm bg-muted/50 dark:bg-zinc-800/50 border border-border/20"
        />
      )
    }
    return (
      <div
        key={f}
        data-cell={`${s}-${f}`}
        className={`w-8 sm:w-9 h-6 m-[1px] rounded-sm flex items-center justify-center gap-0.5 text-2xs font-semibold tabular-nums border ${colorCls}`}
      >
        {inner}
      </div>
    )
  }
  return (
    <div className="inline-block" data-fretboard="mini">
      {/* 品号行 */}
      <div className="flex mb-0.5">
        <div className="w-6 shrink-0" />
        {frets.map(f => (
          <div key={f} className="w-8 sm:w-9 text-center text-3xs text-muted-foreground tabular-nums">
            {f}
          </div>
        ))}
      </div>
      {/* 弦行：索引 0 = 最高音弦（顶部） */}
      {Array.from({ length: stringCount }, (_, s) => {
        const openName = NOTE_UNICODE_NAMES[tuning[s]] ?? ''
        return (
          <div key={s} className="flex items-center">
            <div className="w-6 shrink-0 text-center text-3xs text-muted-foreground">{openName}</div>
            {frets.map(f => renderCell(s, f))}
          </div>
        )
      })}
    </div>
  )
}

// ==================== 主组件 ====================

export function TheoryPanel({ instrument, fretCount, language, fretMarkers }: TheoryPanelProps) {
  const lang = language === 'en' ? 'en' : 'zh-CN'
  const t = (key: string) => {
    const translations = TRANSLATIONS[lang as 'zh-CN' | 'en'] as Record<string, string>
    return translations?.[key] || key
  }

  const config = resolveInstrumentConfig(instrument)

  // 五度圈选中状态
  const [circleIndex, setCircleIndex] = useState(0)
  const [circleMode, setCircleMode] = useState<'major' | 'minor'>('major')

  // 和弦音阶状态
  const [chordType, setChordType] = useState<ChordType>(ChordType.dominantSeven)
  const [chordRoot, setChordRoot] = useState(0)

  // 把位教学状态
  const [posScale, setPosScale] = useState<ScaleType>(ScaleType.majorPentatonic)
  const [posRoot, setPosRoot] = useState(0)
  const [cagedQuality, setCagedQuality] = useState<ChordQuality>('major')
  // CAGED 区块的呈现样式：split = 每个形状各一张小图（原有）；merged = 五个形状叠在一张整幅指板上
  const [cagedView, setCagedView] = useState<'split' | 'merged'>('split')

  // 调式图鉴状态（展示方式参考 myfretboardtrainer.com 的 Modes 页）
  const [familyIdx, setFamilyIdx] = useState(0)
  const [modeIndex, setModeIndex] = useState(0)
  const [modesRoot, setModesRoot] = useState(0)
  const [modesShowIntervals, setModesShowIntervals] = useState(true)
  const [modesPreferFlat, setModesPreferFlat] = useState(false)

  // 音程探索状态
  const [intRoot, setIntRoot] = useState(0)
  const [intShowIntervals, setIntShowIntervals] = useState(true)

  // ===== 五度圈详情 =====
  const circleDetail = useMemo(() => {
    const pc = CIRCLE_MAJOR_PC[circleIndex]
    const keySig = CIRCLE_MAJOR_KEY_SIG[circleIndex]
    const majorName = CIRCLE_MAJOR_NAMES[circleIndex]
    const minorName = CIRCLE_MINOR_NAMES[circleIndex]
    // 音阶音符（负调号用降号显示）
    const scaleType = circleMode === 'major' ? ScaleType.major : ScaleType.naturalMinor
    const scale = getScaleNotes(pc as Note, scaleType)
    return {
      pc,
      keySig,
      majorName,
      minorName,
      scale,
    }
  }, [circleIndex, circleMode])

  // ===== 和弦音阶 =====
  /**
   * 根音选择器给的是**混用拼写**的名字（C♯ 但 E♭ / A♭ / B♭，黑键取惯用写法）。
   * 因此显示和弦符号与音名时要跟着所选的拼写走：选了 E♭ 就该是 E♭7 / E♭ G B♭ D♭，
   * 不能一律套升号表显示成 D♯7 / D♯ G A♯ C♯。
   */
  const rootPrefersFlat = ROOT_PC_NAMES[chordRoot]?.includes('♭') ?? false

  const chordScaleInfo = useMemo(() => {
    const notes = getChordNotes(chordRoot, chordType)
    const chordSymbol = `${pcName(chordRoot, rootPrefersFlat)}${getChordTypeUnicodeDisplayString(chordType)}`
    const options = getScaleOptionsForChord(chordType)
    const scales = options.map(st => ({
      type: st,
      name: getScaleDisplayName(st, true, lang === 'en' ? 'en' : 'zh'),
      notes: getScaleNotes(chordRoot as Note, st),
    }))
    return { notes, chordSymbol, scales }
  }, [chordRoot, chordType, lang, rootPrefersFlat])

  // ===== 把位指型 =====
  const positions = useMemo(() => {
    return generateScalePositions(posRoot, posScale, config, fretCount)
  }, [posRoot, posScale, config, fretCount])

  const degreeLabels = useMemo(() => getDegreeLabels(posScale), [posScale])

  const cagedShapes = useMemo(() => {
    if (!isStandardSixStringGuitar(config)) return []
    return getCagedShapes(posRoot, config, fretCount, cagedQuality)
  }, [posRoot, config, fretCount, cagedQuality])

  // ===== 调式图鉴 =====
  const langKey = lang === 'en' ? ('english' as const) : ('chinese' as const)
  const modeFamily = MODE_FAMILIES[familyIdx]
  const modeScaleDef = SCALE_MODES[modeFamily.dataKey][modeIndex]
  const modeInfo = modeFamily.modes[modeIndex]
  const modeDisplayName = getScaleDisplayNameByName(modeInfo.name, langKey)

  /**
   * 全指板格子：`SCALE_MODES` 的 notes 是**相对音阶根音**的半音集合，
   * 所以必须先 `(pc − 根音)` 折算成相对半音再查表 —— 直接用绝对 pc 会让
   * 「换根音」只挪动高亮而不移调（音集还是 C 调那一套）。
   */
  const modeCells = useMemo(() => {
    const cells = new Map<string, { label: string; isRoot: boolean }>()
    for (let s = 0; s < config.stringCount; s++) {
      for (let f = 0; f <= fretCount; f++) {
        const pc = (config.tuning[s] + f) % 12
        const rel = (((pc - modesRoot) % 12) + 12) % 12
        const idx = modeScaleDef.notes.indexOf(rel)
        if (idx < 0) continue
        cells.set(`${s}-${f}`, {
          label: modesShowIntervals ? formatDegree(modeScaleDef.intervals[idx] ?? '') : pcName(pc, modesPreferFlat),
          isRoot: rel === 0,
        })
      }
    }
    return cells
  }, [config, fretCount, modeScaleDef, modesShowIntervals, modesPreferFlat, modesRoot])

  // 父调：各族第 1 个调式就是父音阶
  const modeParent = useMemo(
    () => parentKeyOf(modeFamily.dataKey, modeIndex, modesRoot),
    [modeFamily, modeIndex, modesRoot],
  )
  const parentDisplayName = getScaleDisplayNameByName(modeFamily.modes[0].name, langKey)

  // ===== 音程探索 =====
  const intervalCells = useMemo(() => {
    const cells = new Map<string, { label: string; isRoot: boolean }>()
    for (let s = 0; s < config.stringCount; s++) {
      for (let f = 0; f <= fretCount; f++) {
        const pc = (config.tuning[s] + f) % 12
        const semitone = (((pc - intRoot) % 12) + 12) % 12
        cells.set(`${s}-${f}`, {
          label: intShowIntervals ? formatDegree(INTERVAL_DEGREE_LABELS[semitone]) : pcName(pc),
          isRoot: semitone === 0,
        })
      }
    }
    return cells
  }, [config, fretCount, intRoot, intShowIntervals])

  const intervalCellClass = (s: number, f: number) => {
    const pc = (config.tuning[s] + f) % 12
    const group = intervalGroupOf((((pc - intRoot) % 12) + 12) % 12)
    return group ? INTERVAL_GROUP_CLASS[group] : undefined
  }

  const cellPositionAria = (s: number, f: number) => {
    const pc = (config.tuning[s] + f) % 12
    return t('fretboard_position_label')
      .replace('{note}', pcName(pc))
      .replace('{string}', String(s + 1))
      .replace('{fret}', String(f))
  }

  // ===== 和弦音位图（整指板）=====
  const chordMapCells = useMemo(() => {
    const intervals = CHORD_INTERVALS[chordType] ?? []
    const cells = new Map<string, { label: string; isRoot: boolean }>()
    for (let s = 0; s < config.stringCount; s++) {
      for (let f = 0; f <= fretCount; f++) {
        const pc = (config.tuning[s] + f) % 12
        const iv = intervals.find((iv2) => (((chordRoot + iv2) % 12) + 12) % 12 === pc)
        if (iv === undefined) continue
        cells.set(`${s}-${f}`, { label: formatDegree(chordToneLabel(iv)), isRoot: iv === 0 })
      }
    }
    return cells
  }, [config, fretCount, chordType, chordRoot])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          {t('theory_panel')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="circle">
          <TabsList className="mb-3">
            <TabsTrigger value="circle" className="text-xs">{t('theory_tab_circle')}</TabsTrigger>
            <TabsTrigger value="chordscale" className="text-xs">{t('theory_tab_chord_scale')}</TabsTrigger>
            <TabsTrigger value="positions" className="text-xs">{t('theory_tab_positions')}</TabsTrigger>
            <TabsTrigger value="modes" className="text-xs">{t('theory_tab_modes')}</TabsTrigger>
            <TabsTrigger value="intervals" className="text-xs">{t('theory_tab_intervals')}</TabsTrigger>
          </TabsList>

          {/* ==================== 五度圈 ==================== */}
          <TabsContent value="circle" className="space-y-4">
            <p className="text-xs text-muted-foreground">{t('theory_circle_hint')}</p>
            <div className="flex flex-col lg:flex-row gap-4 items-start">
              {/* SVG 五度圈 */}
              <div className="shrink-0 mx-auto">
                <svg viewBox="0 0 320 320" className="w-72 h-72 sm:w-80 sm:h-80">
                  {/* 圈背景 */}
                  <circle cx="160" cy="160" r="145" fill="none" stroke="currentColor" strokeWidth="1" className="text-border" />
                  <circle cx="160" cy="160" r="97" fill="none" stroke="currentColor" strokeWidth="1" className="text-border" />
                  {/* 外圈：大调 */}
                  {CIRCLE_MAJOR_NAMES.map((name, i) => {
                    const angle = (i * 30 * Math.PI) / 180
                    const x = 160 + 121 * Math.sin(angle)
                    const y = 160 - 121 * Math.cos(angle)
                    const selected = circleIndex === i && circleMode === 'major'
                    return (
                      <g
                        key={`maj-${i}`}
                        role="button"
                        tabIndex={0}
                        aria-label={name}
                        onClick={() => { setCircleIndex(i); setCircleMode('major') }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setCircleIndex(i); setCircleMode('major')
                          }
                        }}
                        className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <circle
                          cx={x}
                          cy={y}
                          r={20}
                          className={selected ? 'fill-primary' : 'fill-card stroke-border'}
                          stroke={selected ? 'none' : 'currentColor'}
                          strokeWidth="1"
                        />
                        <text
                          x={x}
                          y={y}
                          textAnchor="middle"
                          dominantBaseline="central"
                          className={selected ? 'fill-primary-foreground' : 'fill-foreground'}
                          fontSize="13"
                          fontWeight={selected ? 700 : 500}
                        >
                          {name}
                        </text>
                      </g>
                    )
                  })}
                  {/* 内圈：小调 */}
                  {CIRCLE_MINOR_NAMES.map((name, i) => {
                    const angle = (i * 30 * Math.PI) / 180
                    const x = 160 + 74 * Math.sin(angle)
                    const y = 160 - 74 * Math.cos(angle)
                    const selected = circleIndex === i && circleMode === 'minor'
                    return (
                      <g
                        key={`min-${i}`}
                        role="button"
                        tabIndex={0}
                        aria-label={name}
                        onClick={() => { setCircleIndex(i); setCircleMode('minor') }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setCircleIndex(i); setCircleMode('minor')
                          }
                        }}
                        className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <circle
                          cx={x}
                          cy={y}
                          r={17}
                          className={selected ? 'fill-primary' : 'fill-muted/60 stroke-border'}
                          stroke={selected ? 'none' : 'currentColor'}
                          strokeWidth="1"
                        />
                        <text
                          x={x}
                          y={y}
                          textAnchor="middle"
                          dominantBaseline="central"
                          className={selected ? 'fill-primary-foreground' : 'fill-muted-foreground'}
                          fontSize="11"
                          fontWeight={selected ? 700 : 400}
                        >
                          {name}
                        </text>
                      </g>
                    )
                  })}
                  {/* 中心：当前选中 */}
                  <text x="160" y="160" textAnchor="middle" dominantBaseline="central" className="fill-foreground" fontSize="16" fontWeight="700">
                    {circleMode === 'major' ? circleDetail.majorName : circleDetail.minorName}
                  </text>
                </svg>
              </div>

              {/* 详情面板 */}
              <div className="flex-1 space-y-3 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">{circleMode === 'major' ? t('theory_circle_major') : t('theory_circle_minor')}</Badge>
                  <span className="text-2xl font-bold">
                    {circleMode === 'major' ? circleDetail.majorName : circleDetail.minorName}
                  </span>
                </div>

                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">{t('theory_circle_key_signature')}</span>
                    {circleDetail.keySig === 0 ? (
                      <span>—</span>
                    ) : (
                      <span className="font-mono">
                        {circleDetail.keySig > 0 ? '♯'.repeat(circleDetail.keySig) : '♭'.repeat(-circleDetail.keySig)}
                        <span className="text-muted-foreground text-xs ml-1">
                          ({circleDetail.keySig > 0 ? `+${circleDetail.keySig}` : circleDetail.keySig})
                        </span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">{t('theory_circle_relative_minor')}</span>
                    <span className="font-medium">{circleDetail.minorName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">{t('theory_circle_relative_major')}</span>
                    <span className="font-medium">{circleDetail.majorName}</span>
                  </div>
                </div>

                {/* 音阶音符 */}
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">
                    {t('scale_notes')}（{circleMode === 'major' ? t('theory_circle_major') : t('theory_circle_minor')}）
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {circleDetail.scale.map((n, i) => (
                      <span
                        key={`${n}-${i}`}
                        className={`px-2 py-0.5 rounded text-xs font-mono ${
                          i === 0 ? 'bg-primary/15 text-primary font-bold' : 'bg-muted/60 text-foreground'
                        }`}
                      >
                        {pcName(n, circleDetail.keySig < 0)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ==================== 和弦音阶 ==================== */}
          <TabsContent value="chordscale" className="space-y-4">
            <p className="text-xs text-muted-foreground">{t('theory_chord_scale_hint')}</p>

            {/* 选择器 */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <div className="text-2xs text-muted-foreground leading-3">{t('theory_root_note')}</div>
                <Select value={String(chordRoot)} onValueChange={v => setChordRoot(parseInt(v))}>
                  <SelectTrigger className="w-[72px] h-8 text-xs px-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROOT_PC_NAMES.map((name, i) => (
                      <SelectItem key={i} value={String(i)} className="text-xs">{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <div className="text-2xs text-muted-foreground leading-3">{t('theory_chord')}</div>
                <Select value={chordType} onValueChange={v => setChordType(v as ChordType)}>
                  <SelectTrigger className="w-[130px] h-8 text-xs px-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMMON_CHORD_TYPES.map(ct => (
                      <SelectItem key={ct} value={ct} className="text-xs">
                        {getChordTypeUnicodeDisplayString(ct)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1.5 pb-1">
                <span className="text-lg font-bold font-mono">{chordScaleInfo.chordSymbol}</span>
                <span className="text-xs text-muted-foreground">=</span>
                {chordScaleInfo.notes.map((n, i) => (
                  <span key={`${n}-${i}`} className={`px-1.5 py-0.5 rounded text-xs font-mono ${i === 0 ? 'bg-primary/15 text-primary font-bold' : 'bg-muted/60'}`}>
                    {pcName(n, rootPrefersFlat)}
                  </span>
                ))}
              </div>
            </div>

            {/* 音阶列表 */}
            <div className="grid gap-2 sm:grid-cols-2">
              {chordScaleInfo.scales.map(scale => (
                <div key={scale.type} className="bg-card/50 rounded-lg p-2.5 border border-border/30">
                  <div className="text-xs font-medium mb-1.5">{scale.name}</div>
                  <div className="flex flex-wrap gap-1">
                    {scale.notes.map((n, i) => (
                      <span key={`${scale.type}-${n}-${i}`} className="px-1.5 py-0.5 rounded bg-muted/60 text-2xs font-mono">
                        {pcName(n, rootPrefersFlat)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* 整指板和弦音位图（展示方式参考 myfretboardtrainer.com 的 Include chords） */}
            <div className="space-y-2 pt-1">
              <div className="text-xs font-medium text-muted-foreground">{t('theory_chord_map')}</div>
              <div className="overflow-x-auto pb-1">
                <MiniFretboard
                  stringCount={config.stringCount}
                  tuning={config.tuning}
                  startFret={0}
                  endFret={fretCount}
                  cells={chordMapCells}
                />
              </div>
              <p className="text-2xs text-muted-foreground">
                {t('theory_chord_map_hint')}
              </p>
            </div>
          </TabsContent>

          {/* ==================== 把位教学 ==================== */}
          <TabsContent value="positions" className="space-y-4">
            <p className="text-xs text-muted-foreground">{t('theory_positions_hint')}</p>

            {/* 选择器 */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <div className="text-2xs text-muted-foreground leading-3">{t('theory_root_note')}</div>
                <Select value={String(posRoot)} onValueChange={v => setPosRoot(parseInt(v))}>
                  <SelectTrigger className="w-[72px] h-8 text-xs px-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROOT_PC_NAMES.map((name, i) => (
                      <SelectItem key={i} value={String(i)} className="text-xs">{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <div className="text-2xs text-muted-foreground leading-3">{t('theory_scale')}</div>
                <Select value={posScale} onValueChange={v => setPosScale(v as ScaleType)}>
                  <SelectTrigger className="w-[130px] h-8 text-xs px-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {POSITION_SCALES.map(st => (
                      <SelectItem key={st} value={st} className="text-xs">
                        {getScaleDisplayName(st, true, lang === 'en' ? 'en' : 'zh')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 度数锚定把位 */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">{t('theory_position')}</h4>
              {positions.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('stats_no_data')}</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {positions.map(pos => {
                    const cells = new Map<string, { label: string; isRoot: boolean; sub?: string }>()
                    pos.notes.forEach(n => {
                      cells.set(`${n.stringIndex}-${n.fret}`, {
                        label: degreeLabels[n.degree - 1] ?? String(n.degree),
                        isRoot: n.isRoot,
                        sub: n.finger > 0 ? String(n.finger) : undefined,
                      })
                    })
                    return (
                      <div key={pos.index} className="bg-card/50 rounded-lg p-2.5 border border-border/30 space-y-1.5">
                        <div className="flex items-center gap-2 text-xs">
                          <Badge variant={pos.anchorDegree === 1 ? 'default' : 'secondary'}>
                            {t('theory_position')} {pos.index}
                          </Badge>
                          {pos.anchorDegree === 1 && (
                            <span className="text-primary font-medium">{t('theory_position_root')}</span>
                          )}
                          <span className="text-muted-foreground tabular-nums">{pos.startFret}–{pos.endFret}</span>
                        </div>
                        <MiniFretboard
                          stringCount={config.stringCount}
                          tuning={config.tuning}
                          startFret={pos.startFret}
                          endFret={pos.endFret}
                          cells={cells}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
              <p className="text-2xs text-muted-foreground">
                {t('theory_fingering')}: 1 = {lang === 'en' ? 'index' : '食指'}, 2 = {lang === 'en' ? 'middle' : '中指'}, 3 = {lang === 'en' ? 'ring' : '无名指'}, 4 = {lang === 'en' ? 'pinky' : '小指'}
              </p>
            </div>

            {/* CAGED 系统 */}
            <div className="space-y-3 pt-2 border-t border-border/30">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="text-sm font-medium text-muted-foreground">{t('theory_caged')}</h4>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="flex items-center gap-1 bg-card/30 rounded-md border border-border/30 p-0.5">
                    {(['split', 'merged'] as const).map(v => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={cagedView === v}
                        onClick={() => setCagedView(v)}
                        className={`px-2.5 h-6 rounded text-xs transition-colors ${
                          cagedView === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {v === 'split' ? t('trainer_view_split') : t('trainer_view_merged')}
                      </button>
                    ))}
                  </div>
                  {/* 整幅样式自带一组「性质」切换（且它还管着基础音集），所以外层这组只在分图时显示，
                      否则同一个区块里会出现两组功能重叠又互不同步的按钮 */}
                  {cagedView === 'split' && (
                    <div className="flex items-center gap-1 bg-card/30 rounded-md border border-border/30 p-0.5">
                      {(['major', 'minor'] as ChordQuality[]).map(q => (
                        <button
                          key={q}
                          onClick={() => setCagedQuality(q)}
                          className={`px-2.5 h-6 rounded text-xs transition-colors ${
                            cagedQuality === q ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {q === 'major' ? t('theory_quality_major') : t('theory_quality_minor')}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {cagedView === 'split' ? t('theory_caged_hint') : t('trainer_hint')}
              </p>

              {isStandardSixStringGuitar(config) ? (
                cagedView === 'merged' ? (
                  <CagedBoard
                    t={t}
                    language={language}
                    config={config}
                    fretCount={fretCount}
                    fretMarkers={fretMarkers}
                    openLabel={t('theory_open_string')}
                    defaultRoot={NOTES[posRoot]}
                    quality={cagedQuality}
                    onQualityChange={setCagedQuality}
                    preferFlat={modesPreferFlat}
                  />
                ) : cagedShapes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('stats_no_data')}</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {cagedShapes.map(shape => {
                      // 和弦指法格子
                      const chordCells = new Map<string, { label: string; isRoot: boolean }>()
                      shape.chordTones.forEach(ct => {
                        chordCells.set(`${ct.stringIndex}-${ct.fret}`, {
                          label: ct.role === 'root' ? 'R' : ct.role === 'third' ? '3' : '5',
                          isRoot: ct.role === 'root',
                        })
                      })
                      // 五声盒子音符
                      const pentScale = shape.suggestedScale
                      const pentNotes = getScaleNotesInWindow(
                        posRoot, pentScale, config, shape.windowStart, shape.windowEnd,
                      )
                      const pentLabels = getDegreeLabels(pentScale)
                      const pentCells = new Map<string, { label: string; isRoot: boolean }>()
                      pentNotes.forEach(n => {
                        pentCells.set(`${n.stringIndex}-${n.fret}`, {
                          label: pentLabels[n.degree - 1] ?? String(n.degree),
                          isRoot: n.isRoot,
                        })
                      })
                      return (
                        <div key={`${shape.form}-${shape.rootFret}`} className="bg-card/50 rounded-lg p-2.5 border border-border/30 space-y-2">
                          <div className="flex items-center gap-2 text-xs">
                            <Badge variant="default">{shape.form}</Badge>
                            <span className="text-muted-foreground tabular-nums">{shape.windowStart}–{shape.windowEnd}</span>
                          </div>
                          <div>
                            <div className="text-2xs text-muted-foreground mb-1">{t('theory_caged_chord')}</div>
                            <MiniFretboard
                              stringCount={config.stringCount}
                              tuning={config.tuning}
                              startFret={shape.windowStart}
                              endFret={shape.windowEnd}
                              cells={chordCells}
                            />
                          </div>
                          <div>
                            <div className="text-2xs text-muted-foreground mb-1">{t('theory_caged_pentatonic')}</div>
                            <MiniFretboard
                              stringCount={config.stringCount}
                              tuning={config.tuning}
                              startFret={shape.windowStart}
                              endFret={shape.windowEnd}
                              cells={pentCells}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              ) : (
                <p className="text-xs text-muted-foreground">{t('theory_caged_unsupported')}</p>
              )}
            </div>
          </TabsContent>
          {/* ==================== 调式图鉴 ==================== */}
          <TabsContent value="modes" className="space-y-4">
            <p className="text-xs text-muted-foreground">{t('theory_modes_hint')}</p>

            {/* 调式族 + 调式 + 根音 + 显示切换 */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <div className="text-2xs text-muted-foreground leading-3">{t('theory_modes_family')}</div>
                <div className="flex items-center gap-1 bg-card/30 rounded-md border border-border/30 p-0.5">
                  {MODE_FAMILIES.map((family, i) => (
                    <button
                      key={family.id}
                      type="button"
                      onClick={() => { setFamilyIdx(i); setModeIndex(0) }}
                      className={`px-2.5 h-6 rounded text-xs transition-colors ${
                        familyIdx === i ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t(family.nameKey)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-2xs text-muted-foreground leading-3">{t('theory_root_note')}</div>
                <Select value={String(modesRoot)} onValueChange={v => setModesRoot(parseInt(v))}>
                  <SelectTrigger className="w-[72px] h-8 text-xs px-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROOT_PC_NAMES.map((name, i) => (
                      <SelectItem key={i} value={String(i)} className="text-xs">{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <div className="text-2xs text-muted-foreground leading-3">{t('theory_modes_spelling')}</div>
                <div className="flex items-center gap-1 bg-card/30 rounded-md border border-border/30 p-0.5">
                  <button
                    type="button"
                    aria-label={t('theory_spelling_sharps')}
                    onClick={() => setModesPreferFlat(false)}
                    className={`px-2.5 h-6 rounded text-xs transition-colors ${
                      !modesPreferFlat ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    ♯
                  </button>
                  <button
                    type="button"
                    aria-label={t('theory_spelling_flats')}
                    onClick={() => setModesPreferFlat(true)}
                    className={`px-2.5 h-6 rounded text-xs transition-colors ${
                      modesPreferFlat ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    ♭
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-2xs text-muted-foreground leading-3">{t('theory_modes_display')}</div>
                <div className="flex items-center gap-1 bg-card/30 rounded-md border border-border/30 p-0.5">
                  <button
                    type="button"
                    onClick={() => setModesShowIntervals(true)}
                    className={`px-2.5 h-6 rounded text-xs transition-colors ${
                      modesShowIntervals ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('theory_show_intervals')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setModesShowIntervals(false)}
                    className={`px-2.5 h-6 rounded text-xs transition-colors ${
                      !modesShowIntervals ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('theory_show_notes')}
                  </button>
                </div>
              </div>
            </div>

            {/* 调式按钮行（7 个） */}
            <div className="flex flex-wrap gap-1">
              {modeFamily.modes.map((m, i) => (
                <button
                  key={m.name}
                  type="button"
                  onClick={() => setModeIndex(i)}
                  className={`px-2.5 h-7 rounded-md text-xs border transition-colors ${
                    modeIndex === i
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card/40 text-muted-foreground hover:text-foreground border-border/40'
                  }`}
                >
                  {getScaleDisplayNameByName(m.name, langKey)}
                </button>
              ))}
            </div>

            {/* 当前调式：名称 + 特征 + 用法 + 父调 */}
            <div className="bg-card/50 rounded-lg p-3 border border-border/30 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-bold">{modeDisplayName}</span>
                <Badge variant="secondary">{t(modeFamily.nameKey)}</Badge>
                <span className="text-xs font-mono text-muted-foreground">{formatDegree(modeScaleDef.formula)}</span>
              </div>
              <p className="text-xs leading-5">{lang === 'en' ? modeInfo.descEn : modeInfo.descZh}</p>
              <p className="text-xs leading-5 text-muted-foreground">
                <span className="font-medium">{t('theory_modes_usage')}：</span>
                {lang === 'en' ? modeInfo.usageEn : modeInfo.usageZh}
              </p>
              {modeIndex > 0 && (
                <p className="text-xs text-primary/90">
                  {t('theory_modes_parent')
                    .replace('{parent}', `${pcName(modeParent.parentPc, modesPreferFlat)} ${parentDisplayName}`)
                    .replace('{degree}', String(modeParent.degree))}
                </p>
              )}
            </div>

            {/* 全指板图 */}
            <div className="overflow-x-auto pb-1">
              <MiniFretboard
                stringCount={config.stringCount}
                tuning={config.tuning}
                startFret={0}
                endFret={fretCount}
                cells={modeCells}
              />
            </div>
          </TabsContent>

          {/* ==================== 音程探索 ==================== */}
          <TabsContent value="intervals" className="space-y-4">
            <p className="text-xs text-muted-foreground">{t('theory_intervals_hint')}</p>

            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <div className="text-2xs text-muted-foreground leading-3">{t('theory_intervals_root_hint')}</div>
                <Select value={String(intRoot)} onValueChange={v => setIntRoot(parseInt(v))}>
                  <SelectTrigger className="w-[72px] h-8 text-xs px-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROOT_PC_NAMES.map((name, i) => (
                      <SelectItem key={i} value={String(i)} className="text-xs">{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <div className="text-2xs text-muted-foreground leading-3">{t('theory_modes_display')}</div>
                <div className="flex items-center gap-1 bg-card/30 rounded-md border border-border/30 p-0.5">
                  <button
                    type="button"
                    onClick={() => setIntShowIntervals(true)}
                    className={`px-2.5 h-6 rounded text-xs transition-colors ${
                      intShowIntervals ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('theory_show_intervals')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIntShowIntervals(false)}
                    className={`px-2.5 h-6 rounded text-xs transition-colors ${
                      !intShowIntervals ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('theory_show_notes')}
                  </button>
                </div>
              </div>
            </div>

            {/* 全指板：每格显示与根音的音程；点击换根音 */}
            <div className="overflow-x-auto pb-1">
              <MiniFretboard
                stringCount={config.stringCount}
                tuning={config.tuning}
                startFret={0}
                endFret={fretCount}
                cells={intervalCells}
                onCellClick={(s, f) => setIntRoot((config.tuning[s] + f) % 12)}
                cellAriaLabel={cellPositionAria}
                cellClass={intervalCellClass}
              />
            </div>

            {/* 图例：互补对同形状，所以成对着色 */}
            <div className="flex flex-wrap gap-1.5">
              {INTERVAL_GROUPS.map(g => (
                <span
                  key={g.id}
                  className={`px-2 py-0.5 rounded text-2xs border ${INTERVAL_GROUP_CLASS[g.id]}`}
                >
                  {lang === 'en' ? g.labelEn : g.labelZh}
                </span>
              ))}
            </div>
            <p className="text-2xs text-muted-foreground">{t('theory_intervals_legend_hint')}</p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
