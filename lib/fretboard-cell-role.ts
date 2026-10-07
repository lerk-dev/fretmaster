/**
 * 指板格子的**语义角色**（唯一真相源）。
 *
 * 项目里有两条指板渲染路径：
 *   ① `components/practice-fretboard.tsx` —— 经典皮肤：格子 = 实心色块，颜色由
 *      `app/page.tsx` 里的 `getNoteButtonColor` 给 tailwind class；
 *   ② `components/guitarrun-fretboard.tsx` —— GuitarRun 皮肤：格子 = 圆点，靠 `.gr-*`
 *      语义 class 上色。
 * 两者**必须对「这个格子是什么」给出一致结论**，否则同一个练习在两套皮肤下会点亮不同的音 ——
 * 这种分叉不会报错，只会让人以为「换了皮肤结果就变了」。本模块就是那个唯一真相源。
 *
 * 判定**分支顺序**照抄经典皮肤的颜色函数（先命中反馈 → 再品区限制 → 再按 tab 分派），
 * 因为顺序决定了多个条件同时成立时谁赢：例如「刚点错了」必须压过「这个音是根音」，
 * 又例如品区限制必须压过一切题目高亮。
 *
 * 🚨 改这里的判定时，请同步核对经典皮肤的颜色函数 —— 它决定了哪种角色该长什么样。
 */
import { INTERVALS } from '@/lib/page-theory-data'
import {
  getNoteAtPosition,
  getNoteDegreeInChord,
  getNoteIndex,
} from '@/lib/page-theory-functions'

/**
 * 格子的语义角色。
 * - `none`         什么都没（不在题目内，也不该高亮）
 * - `muted`        属于题目但被**压暗**（限制品区外、一弦三音的把位外）
 * - `tone`         题目内的普通音（音阶音 / 和弦音 / 音程音）
 * - `root`         题目内的根音（比 tone 多一层强调）
 * - `target`       当前**要弹**的目标音（最强调）
 * - `matched`      刚点对（瞬时反馈，优先级最高）
 * - `wrong`        刚点错（瞬时反馈，优先级最高）
 * - `preview` / `previewRoot` / `previewStart`
 *                  一弦三音：**下一把位**的预览（青色虚线闪烁那一套）。
 *                  只在**当前把位已跑完**（`threeNpsTarget === null`）时出现 —— 与
 *                  `app/page.tsx` 的 `nextThreeNpsCells` 产出时机同源，见 `resolveBaseRole` 的 ②。
 */
export type FretCellRole =
  | 'none'
  | 'muted'
  | 'tone'
  | 'root'
  | 'target'
  | 'matched'
  | 'wrong'
  | 'preview'
  | 'previewRoot'
  | 'previewStart'

/** 下一把位预览的三种强调级别（对应 GuitarRun 的 next-preview / -root / -start） */
export type ThreeNpsPreviewKind = 'note' | 'root' | 'start'

/**
 * 音阶练习的音级符号兜底表（半音 → 标签）。
 *
 * 🚨 这只是**兜底**：真相源是音阶自带的 `intervals[i] ↔ notes[i]` 对齐表 —— 手写表在
 * Altered / Whole Tone 这类音阶上会给出错的标签（如把半音 1 写成 `b9` 而该音阶里是 `b2`）。
 * 与 `lib/page-theory-functions.ts:resolveScaleDegreeSemitone` 是**反函数**关系，改一处要看另一处。
 */
export const SCALE_SEMITONE_DEGREE_FALLBACK: Record<number, string> = {
  0: '1', 1: 'b9', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
}

/** 音阶（`notes` 是相对根音的半音数组，`intervals` 是对应音级标签） */
export interface ScaleLike {
  notes: number[]
  intervals?: string[]
}

export interface FretboardRoleContext {
  activeTab: string
  isPlaying: boolean
  /**
   * 该乐器的调弦（高音弦 → 低音弦，半音值）—— 来自 `INSTRUMENT_CONFIG[x].tuning`。
   *
   * 🚨 **组件务必传**。省略会回退到模块级全局 `getStringTuning()`，于是「渲染迭代用的弦数」
   * （组件从乐器配置取）与「算音名用的调弦」（全局）成了两个来源：一旦不同步就会画出
   * 「分隔线数量与行数对不上、音名还是别的乐器」的指板，不报错。详见
   * `__tests__/practice-fretboard-exercise.test.ts` 的「乐器自洽」一节。
   */
  tuning?: number[]
  /** 找音练习：答题方式（`buttons` = 按钮答题，会在指板上亮出目标位置） */
  practiceAnswerMode?: string
  /** 找音练习（按钮答题）：本轮要求点的格子 */
  highlightedTargetPosition?: { stringIndex: number; fret: number } | null
  /** 找音练习：当前目标音名 */
  targetNote?: string
  showAllNotes: boolean
  /** 点击反馈：key = `${stringIndex}-${fret}`，value = 对/错 */
  highlightedFrets: ReadonlyMap<string, boolean>
  // 限制品区
  fretZoneEnabled: boolean
  fretZoneStart: number
  fretZoneSize: number
  fretCount: number
  // 和弦（和弦转换 / 和弦练习共用）
  chordTarget?: { root: string; type: string } | null
  // 音程
  rootNote: string
  selectedIntervals: number[]
  // 音阶
  scaleKey: string
  selectedScale: ScaleLike
  scaleExerciseSequence: string[]
  /** 一弦三音：当前把位的目标品 */
  threeNpsTarget?: { stringIndex: number; fret: number } | null
  /** 一弦三音：当前把位覆盖的格子（key = `${stringIndex}-${fret}`，只关心 key 是否存在） */
  threeNpsCellKeys?: ReadonlyMap<string, unknown>
  /** 一弦三音：下一把位预览（key = `${stringIndex}-${fret}`）。⚠️ 只在 `threeNpsTarget === null` 时才读 */
  nextThreeNpsCells?: ReadonlyMap<string, ThreeNpsPreviewKind>
}

export interface FretCellRoleResult {
  /** 该格子的原始音名（未按变音号偏好格式化） */
  note: string
  role: FretCellRole
  /** 文字是否可见（经典皮肤用 opacity 切换，GuitarRun 皮肤用 color:transparent） */
  showText: boolean
  /** 命中题目时应显示的音级符号；空串表示该显示音名 */
  degree: string
}

const cellKey = (stringIndex: number, fret: number) => `${stringIndex}-${fret}`

/**
 * 各 tab 的**题目高亮**是否只在「练习进行中」生效。
 *
 * 🚨 这是一张**共享口径表**，下列两处必须读它、不许各写一份：
 *   · 本文件的 `resolveBaseRole` —— 决定两套皮肤的角色 / 音级 / 可见性；
 *   · `lib/fretboard-note-button-color.ts` 的 `getNoteButtonColor` —— 经典皮肤的配色。
 * 曾经两边各写一份（且都不完整），`chord` 只在配色层漏判 ⇒ 未开始练习时同一块指板
 * 「有颜色、没音级」（配色亮着蓝绿、文字一个字都不显示）；而 GuitarRun 皮肤走真相源，
 * 它会「有颜色、有音级」⇒ 换个皮肤结果就变。
 *
 * `practice` 是刻外的 false：找音练习的「按钮答题目标」与「显示全部音符」在未开始时
 * 也要亮 —— 它们是**提示**不是答案（答案要用户自己点，点了才有反馈）。
 */
export const TAB_REQUIRES_PLAYING: Readonly<Record<string, boolean>> = {
  practice: false,
  chord: true,
  chord_exercise: true,
  interval: true,
  scale: true,
}

/**
 * 该 tab 的题目高亮是否要求 `isPlaying`。
 * 未知 tab 返回 `false`：新加的 tab 不该被静默门禁掉（宁可多显示，也不要「什么都没亮」）。
 */
export function requiresPlaying(activeTab: string): boolean {
  return TAB_REQUIRES_PLAYING[activeTab] === true
}

/**
 * 取某个「相对根音的半音数」在当前音阶里的音级标签。
 * 优先用音阶自己的对齐表（`notes.indexOf(interval)` → `intervals[下标]`），
 * 查不到才落到手写兜底表。
 */
export function scaleDegreeLabel(scale: ScaleLike, interval: number): string {
  const idx = scale.notes.indexOf(interval)
  if (idx >= 0 && scale.intervals && scale.intervals[idx]) return scale.intervals[idx]
  return SCALE_SEMITONE_DEGREE_FALLBACK[interval] ?? ''
}

/**
 * 一个品格格子在当前练习上下文下的角色。
 *
 * @param ctx    练习上下文（从页面 props 直接映射，见 `FretboardRoleContext`）
 * @param stringIndex 弦索引（0 = 最高音弦，与 `INSTRUMENT_CONFIG.tuning` 一致）
 * @param fret   品号（0 = 空弦）
 */
export function resolveFretCellRole(
  ctx: FretboardRoleContext,
  stringIndex: number,
  fret: number,
): FretCellRoleResult {
  // 调弦只认 `ctx.tuning`（组件从乐器配置传进来）；没传才落到模块级全局。
  const note = getNoteAtPosition(stringIndex, fret, ctx.tuning)
  const key = cellKey(stringIndex, fret)

  const result = (role: FretCellRole, degree = '', showText = true): FretCellRoleResult => ({
    note,
    role,
    showText,
    degree,
  })

  /**
   * 辨音模式（按钮答题）本轮的目标格 —— **只亮位置、不写音名**。
   *
   * 🚨 屏幕上的音名就是答案：用户在辨音模式下要「听音 → 在音名按钮里选」，
   * 指板把目标格的音名写出来等于直接把答案给出去。
   * 以前这一格走 `result('target')`（`showText` 默认 `true`）⇒ 亮着的同时把音名写在脸上。
   *
   * 判定**只在这里做一次**，下面两处都读它（铁律 14：同一「量」不许两份判定）：
   *   · `resolveBaseRole` 的 practice 分支 ⇒ 给出 `showText:false`；
   *   · 末尾的空弦列兜底 ⇒ **不能**再把 0 品目标强行改回 `true`（空弦目标同样要藏）。
   */
  const isButtonsTarget =
    ctx.activeTab === 'practice' &&
    ctx.practiceAnswerMode === 'buttons' &&
    !!ctx.highlightedTargetPosition &&
    ctx.highlightedTargetPosition.stringIndex === stringIndex &&
    ctx.highlightedTargetPosition.fret === fret

  let out: FretCellRoleResult

  // ① 点击反馈压过一切（GuitarRun 的 .note-hit 也是 !important 级别）
  const feedback = ctx.highlightedFrets.get(key)
  if (feedback !== undefined) {
    out = result(feedback ? 'matched' : 'wrong', '', true)
  } else {
    // ② 按 tab 做题目判定（这一步**不看**限制品区 —— 品区只影响「压暗」不影响「有没有信息」，
    //    与经典皮肤一致：那边也是颜色函数管压暗、文字函数管显隐，两件事分开）
    const base = resolveBaseRole(ctx, stringIndex, fret, note, key, result, isButtonsTarget)

    // ③ 限制品区：把**题目内**的格子压暗（题目外的格子本来就是 none，不需要压暗）
    if (base.role !== 'none' && ctx.isPlaying && ctx.fretZoneEnabled) {
      const minFret = ctx.fretZoneStart
      const maxFret = Math.min(ctx.fretCount, ctx.fretZoneStart + ctx.fretZoneSize - 1)
      if (fret < minFret || fret > maxFret) out = { ...base, role: 'muted' }
    }
    out ??= base
  }

  // ⓪ 空弦列（0 品）是**弦标签**：音名恒显示（与 GuitarRun 的 OPEN 列同义），
  // 不参与「藏答案」——把 0 品并入统一判定时曾把它一起藏掉，用户实测反馈「空弦音都不显示了」。
  // 题目命中不受影响：命中表达在 role/degree（音级符号 + 配色），这里只兜住**可见性**。
  //
  // 🚨 唯一的例外是**辨音模式的目标格**（`isButtonsTarget`）：那一格就是答案，即使落在
  // 空弦列也必须藏 —— 否则「亮着的空弦格」会把音名写在脸上，与本次修复的目的正好相反。
  if (fret === 0 && !isButtonsTarget) out = { ...out, showText: true }

  return out
}

/**
 * ② 的实体：按 tab 判定，返回不含「品区压暗」的角色。
 *
 * @param isButtonsTarget 该格是否为**辨音模式**本轮的目标格（判定在 `resolveFretCellRole`
 *   里只做一次，见那里的说明）—— 是则只亮不写字。
 */
function resolveBaseRole(
  ctx: FretboardRoleContext,
  stringIndex: number,
  fret: number,
  note: string,
  key: string,
  result: (role: FretCellRole, degree?: string, showText?: boolean) => FretCellRoleResult,
  isButtonsTarget: boolean,
): FretCellRoleResult {
  // ⓪ tab 级门禁：没在练习就不产生题目信息（`practice` 例外，理由见 `TAB_REQUIRES_PLAYING`）。
  //    以前是各分支自己判一次 isPlaying，`chord` 那份漏了 —— 于是真相源说「亮」、
  //    经典皮肤文字层说「不显示」、经典皮肤配色层说「亮」⇒ 三方结论互不相同。
  if (requiresPlaying(ctx.activeTab) && !ctx.isPlaying) return result('none', '', false)

  // 找音练习
  if (ctx.activeTab === 'practice') {
    // 🚨 辨音模式的目标格：**只亮位置，不写音名** —— 写出来就是答案（判定见
    //    `resolveFretCellRole` 的 `isButtonsTarget`）。`degree` 留空，`showText` 显式 false。
    if (isButtonsTarget) return result('target', '', false)
    // 「显示全部音符」= 所有格子都亮出音名（与经典皮肤的 showAllNotes 同义）；目标音额外强调
    if (ctx.showAllNotes) {
      return result(ctx.targetNote && note === ctx.targetNote ? 'target' : 'none', '', true)
    }
    return result('none', '', false)
  }

  // 和弦练习 / 和弦转换练习：和弦音 = tone，根音 = root
  // （「没开始练习就不亮」由 ⓪ 统一管，这里不再各判一次）
  if (ctx.activeTab === 'chord_exercise' || ctx.activeTab === 'chord') {
    const chord = ctx.chordTarget
    if (!chord) return result('none', '', false)
    const degree = getNoteDegreeInChord(note, chord.root, chord.type)
    if (!degree) return result('none', '', false)
    return result(getNoteIndex(note) === getNoteIndex(chord.root) ? 'root' : 'tone', degree)
  }

  // 音程练习
  if (ctx.activeTab === 'interval') {
    const noteIdx = getNoteIndex(note)
    const rootIdx = getNoteIndex(ctx.rootNote)
    if (noteIdx === rootIdx) return result('root', '1')
    const interval = (noteIdx - rootIdx + 12) % 12
    const hit = ctx.selectedIntervals.find((i) => INTERVALS[i] && INTERVALS[i].semitones % 12 === interval)
    if (hit === undefined) return result('none', '', false)
    return result('tone', INTERVALS[hit].symbol)
  }

  // 音阶练习
  if (ctx.activeTab === 'scale') {
    // 「没在练习」由 ⓪ 管；这里只剩「序列是空的」这一条（开始练了但还没生成序列）
    if (ctx.scaleExerciseSequence.length === 0) {
      return result('none', '', false)
    }
    const noteIdx = getNoteIndex(note)
    const keyIdx = getNoteIndex(ctx.scaleKey)
    const interval = (noteIdx - keyIdx + 12) % 12
    if (!ctx.selectedScale.notes.includes(interval)) return result('none', '', false)
    const degree = scaleDegreeLabel(ctx.selectedScale, interval)

    // ① 当前把位进行中：目标品 > 当前把位内 > 把位外（压暗，但仍保留文字）。
    //    此时**不看**下一把位预览 —— 见 ② 的说明。
    const target = ctx.threeNpsTarget
    if (target) {
      if (target.stringIndex === stringIndex && target.fret === fret) return result('target', degree)
      if (ctx.threeNpsCellKeys?.has(key)) {
        return result(interval === 0 ? 'root' : 'tone', degree)
      }
      return result('muted', degree, true)
    }

    // ② 下一把位预览：只在**当前把位已跑完**（`threeNpsTarget === null`，界面停在那里等
    //    「下一题」）时画，承担「换把前先看一眼落点」。
    //
    //    🚨 判定点位必须与产出侧 `app/page.tsx` 的 `nextThreeNpsCells` 完全对齐：
    //    那边也只在 `!isThreeNpsActive || threeNpsTarget` 为**假**时才填数据。
    //    两者曾在同一个提交里写反 —— 产出只在「无 target」、消费只在「有 target」
    //    ⇒ 互斥，这个提示**一次都没显示过**（两套皮肤都没有，不是「只有 GuitarRun 有」）。
    //    改这里之前先确认产出侧的守卫，改产出侧同理。
    const previewKind = ctx.nextThreeNpsCells?.get(key)
    if (previewKind === 'start') return result('previewStart', degree)
    if (previewKind === 'root') return result('previewRoot', degree)
    if (previewKind === 'note') return result('preview', degree)

    return result(interval === 0 ? 'root' : 'tone', degree)
  }

  return result('none', '', false)
}

