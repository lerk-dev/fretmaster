/**
 * 经典皮肤的**格子配色**（唯一实现）。
 *
 * 从 `app/page.tsx` 原样搬出 —— **函数体逐字未改**，只是把闭包变量收进 `ctx` 参数。
 * 搬出来是为了两件事：
 *   ① 可单测：巨石里的 useCallback 无法独立触发，配色的 bug 只能靠肉眼看；
 *   ② 与 `lib/fretboard-cell-role.ts` 做**一致性护栏** —— 两套皮肤（经典 / GuitarRun）
 *      对「这个格子是什么」必须给出一致结论，否则换个皮肤结果就变，而且不报错、只教错。
 *
 * 🚨 判定顺序即优先级：**点击反馈 > 限制品区 > 按 tab 分派**。改顺序会改变
 * 「多个条件同时成立时谁赢」（例如「刚点错了」必须压过「这个音是根音」）。
 * 🚨 各 tab 的「是否只在练习中生效」一律读 `lib/fretboard-cell-role.ts` 的 `requiresPlaying`，
 * 不要在这里另写一份 —— 曾因两边各写一份，`chord` 只在一边漏判，导致未开始练习时
 * 「有颜色、没音级」。
 */
import { CHORD_TYPES, INTERVALS } from '@/lib/page-theory-data'
import { getNoteIndex, normalizeChordType } from '@/lib/page-theory-functions'
import { requiresPlaying, type ThreeNpsPreviewKind } from '@/lib/fretboard-cell-role'

/**
 * 一弦三音「下一把位预览」在经典皮肤下的三档配色。
 *
 * 语义与 GuitarRun 皮肤的 `.gr-cell--next / --next-root / --next-start` **一一对应**
 * （青 = 普通音 / 酸黄 = 根音 / 橙 = 起点），差别只是那边画圆点、这边是实心格子 ——
 * 两套皮肤对同一个角色必须给出「说得过去是一致的」视觉，否则换个皮肤就换了套语言。
 *
 * 🚨 三者必须**互不相同**，也必须与「把位外压暗」（`opacity-30 hover:bg-muted/50`）不同 ——
 * 预览的意义就是「看一眼下一把位落在哪」，要是长得跟「这个音不在这把位」一样就等于没提示。
 * 护栏见 `__tests__/fretboard-note-button-color.test.ts`。
 */
export const PREVIEW_CLASS: Record<ThreeNpsPreviewKind, string> = {
  note: 'bg-cyan-500/25 text-cyan-50 ring-1 ring-inset ring-cyan-400/60 border border-dashed border-cyan-400/70 fret-next-blink',
  root: 'bg-lime-400/70 text-black ring-2 ring-lime-300/80 border border-dashed border-lime-300',
  start: 'bg-orange-500 text-white ring-2 ring-orange-300 border border-dashed border-orange-300',
}

/** 配色所需的全部上下文（= 原来从页面闭包里读到的那些变量） */
export interface NoteButtonColorContext {
  activeTab: string
  isPlaying: boolean
  showAllNotes: boolean
  targetNote: string
  practiceAnswerMode: string
  highlightedTargetPosition: { stringIndex: number; fret: number } | null
  highlightedFrets: ReadonlyMap<string, boolean>
  /** 限制品区（练习中把区外压暗） */
  fretZoneEnabled: boolean
  fretZoneStart: number
  fretZoneSize: number
  fretCount: number
  /** 和弦练习：本轮目标和弦 */
  chordExerciseTargetChord: { root: string; type: string } | null
  rootNote: string
  selectedIntervals: number[]
  scaleKey: string
  selectedScale: { notes: number[]; intervals?: string[] }
  scaleExerciseSequence: string[]
  /** 和弦进行：已转调序列 + 当前下标（和弦进行的分支用这两个，不是上面那个 targetChord） */
  transposedChords: { root: string; type: string; bass?: string }[]
  currentChordIndex: number
  /** 一弦三音：当前把位的目标品 */
  threeNpsTarget: { stringIndex: number; fret: number } | null
  /** 一弦三音：当前把位覆盖的格子（key = `${stringIndex}-${fret}`） */
  threeNpsCellKeys: ReadonlyMap<string, unknown>
  /**
   * 一弦三音：下一把位预览（key = `${stringIndex}-${fret}`）。
   * ⚠️ 与真相源 `resolveFretCellRole` 同源：只在 `threeNpsTarget === null`（当前把位已跑完）时才读。
   * 省略 / 传空表 = 没有预览，不影响其它分支。
   */
  nextThreeNpsCells?: ReadonlyMap<string, ThreeNpsPreviewKind>
}

/**
 * 某个格子该用哪串 tailwind class。
 *
 * @param ctx         配色上下文（页面渲染时从 state 组出）
 * @param note        该格子的音名
 * @param stringIndex 弦索引（0 = 最高音弦）
 * @param fret        品号（0 = 空弦）
 */
export function getNoteButtonColor(
  ctx: NoteButtonColorContext,
  note: string,
  stringIndex: number,
  fret: number,
): string {
  // 原来这些名字直接从页面闭包里读，现在从 ctx 解构 —— 下面整段 body 与搬迁前逐字相同。
  const {
    activeTab,
    isPlaying,
    showAllNotes,
    targetNote,
    practiceAnswerMode,
    highlightedTargetPosition,
    highlightedFrets,
    fretZoneEnabled,
    fretZoneStart,
    fretZoneSize,
    fretCount,
    chordExerciseTargetChord,
    rootNote,
    selectedIntervals,
    scaleKey,
    selectedScale,
    scaleExerciseSequence,
    transposedChords,
    currentChordIndex,
    threeNpsTarget,
    threeNpsCellKeys,
    nextThreeNpsCells,
  } = ctx

    const key = `${stringIndex}-${fret}`
    
    // 优先显示点击反馈（正确绿色，错误红色，加 ✓/✗ 角标作为非颜色编码）
    if (highlightedFrets.has(key)) {
      const isCorrect = highlightedFrets.get(key)
      return isCorrect
        ? "bg-green-500 text-white fret-feedback-correct"
        : "bg-red-500 text-white fret-feedback-wrong"
    }

    // 限制练习 - 5品区: 品区外置灰（练习中生效，引导用户在品区内演奏）
    if (isPlaying && fretZoneEnabled) {
      const minFret = fretZoneStart
      const maxFret = Math.min(fretCount, fretZoneStart + fretZoneSize - 1)
      if (fret < minFret || fret > maxFret) {
        return "opacity-20 cursor-not-allowed hover:bg-transparent"
      }
    }

    // tab 级门禁：与 lib/fretboard-cell-role.ts 的 `requiresPlaying` **同源**
    //（那张表是唯一口径，别在这里再写一份）。未开始练习时，要求「练习中」的 tab 一律不上色
    // —— 否则会出现「有颜色、没音级」：配色亮着蓝绿，而文字层因为自己的 isPlaying 门禁
    // 一个字都不显示。`practice` 不在表内，不受影响（它的提示在未开始时也要亮）。
    if (requiresPlaying(activeTab) && !isPlaying) {
      return "hover:bg-muted/50"
    }

    if (activeTab === "practice") {
      // 优先显示点击反馈（正确绿色，错误红色，加 ✓/✗ 角标）
      if (highlightedFrets.has(key)) {
        const isCorrect = highlightedFrets.get(key)
        return isCorrect
          ? "bg-green-500 text-white fret-feedback-correct" 
          : "bg-red-500 text-white fret-feedback-wrong"
      }
      
      // 按钮答题模式下，高亮显示目标位置
      if (practiceAnswerMode === "buttons" && highlightedTargetPosition) {
        if (stringIndex === highlightedTargetPosition.stringIndex && fret === highlightedTargetPosition.fret) {
          return "bg-primary/80 text-primary-foreground"
        }
      }
      
      if (showAllNotes && note === targetNote) {
        return "bg-primary/80 text-primary-foreground"
      }
      // 未开始练习时只显示 hover 效果
      if (!isPlaying) {
        return "hover:bg-muted"
      }
    }

    if (activeTab === "chord_exercise") {
      // 和弦练习模式 - 色块按和弦转换练习样式
      const key = `${stringIndex}-${fret}`
      
      // 优先显示点击反馈（正确绿色，错误红色，加 ✓/✗ 角标）
      if (highlightedFrets.has(key)) {
        const isCorrect = highlightedFrets.get(key)
        return isCorrect
          ? "bg-green-500 text-white fret-feedback-correct" 
          : "bg-red-500 text-white fret-feedback-wrong"
      }
      
      // 开始练习后显示当前和弦的所有音 - 按和弦转换练习色块样式
      //（「没开始就不亮」由上面的 tab 级门禁统一管）
      if (chordExerciseTargetChord) {
        const noteIdx = getNoteIndex(note)
        const rootIdx = getNoteIndex(chordExerciseTargetChord.root)
        const normalizedType = normalizeChordType(chordExerciseTargetChord.type)
        const chordType = CHORD_TYPES.find(ct => ct.name === normalizedType || ct.symbol === normalizedType || ct.name === chordExerciseTargetChord.type)
        
        if (chordType) {
          const interval = (noteIdx - rootIdx + 12) % 12
          
          // 检查这个音是否在当前和弦中
          if (!chordType.intervals.includes(interval)) {
            return "hover:bg-muted/50"
          }

          // 根音用柔和的蓝色
          if (noteIdx === rootIdx) {
            return "bg-blue-400/60 text-white"
          }
          // 其他和弦音用柔和的绿色
          return "bg-emerald-400/50 text-white"
        }
      }
      // 不在和弦中的音，只显示 hover 效果
      return "hover:bg-muted/50"
    }

    if (activeTab === "interval") {
      // 音程练习 - 色块按和弦转换练习样式
      const key = `${stringIndex}-${fret}`
      
      // 优先显示点击反馈（正确绿色，错误红色，加 ✓/✗ 角标）
      if (highlightedFrets.has(key)) {
        const isCorrect = highlightedFrets.get(key)
        return isCorrect
          ? "bg-green-500 text-white fret-feedback-correct" 
          : "bg-red-500 text-white fret-feedback-wrong"
      }
      
      // （「练习未开始只显示 hover 效果」由上面的 tab 级门禁统一管，这里不再各判一次）

      // 开始练习后显示当前音程的所有音 - 按和弦转换练习色块样式
      const noteIdx = getNoteIndex(note)
      const rootIdx = getNoteIndex(rootNote)
      
      // 根音用柔和的蓝色
      if (noteIdx === rootIdx) {
        return "bg-blue-400/60 text-white"
      }
      
      // 选中的音程音用柔和的绿色
      const interval = (noteIdx - rootIdx + 12) % 12
      // 🚨 必须带存在性检查：`selectedIntervals` 混入越界下标时 `INTERVALS[i]` 是 undefined，
      // 直接取 `.semitones` 会抛 TypeError 把整个渲染打挂。真相源与经典皮肤的文字层都有这道守卫。
      if (selectedIntervals.some(i => INTERVALS[i] && INTERVALS[i].semitones % 12 === interval)) {
        return "bg-emerald-400/50 text-white"
      }
      
      // 不在选中音程中的音，只显示 hover 效果
      return "hover:bg-muted/50"
    }

    if (activeTab === "scale") {
      // 音阶练习模式 - 色块按和弦转换练习样式
      const key = `${stringIndex}-${fret}`
      
      // 优先显示点击反馈（正确绿色，错误红色，加 ✓/✗ 角标）
      if (highlightedFrets.has(key)) {
        const isCorrect = highlightedFrets.get(key)
        return isCorrect
          ? "bg-green-500 text-white fret-feedback-correct" 
          : "bg-red-500 text-white fret-feedback-wrong"
      }
      
      // 开始练习后显示当前音阶的所有音 - 按和弦转换练习色块样式
      //（「没在练习」由 tab 级门禁管；这里只剩「开始练了但序列还空」）
      if (scaleExerciseSequence.length > 0) {
        const noteIdx = getNoteIndex(note)
        const keyIdx = getNoteIndex(scaleKey)

        // 检查这个音是否在音阶中
        const interval = (noteIdx - keyIdx + 12) % 12
        if (!selectedScale.notes.includes(interval)) {
          return "hover:bg-muted/50"
        }

        if (threeNpsTarget) {
          // 一弦三音：只把**当前把位的指型**点亮（对齐 GuitarRun 的 oe(position)），
          // 当前目标品用强调色。把位外的音阶音压暗，否则整块指板都是绿的、看不出手该放哪。
          if (threeNpsTarget.stringIndex === stringIndex && threeNpsTarget.fret === fret) {
            return "bg-amber-400 text-black ring-2 ring-amber-500 ring-inset z-20"
          }
          if (threeNpsCellKeys.has(key)) {
            return interval === 0 ? "bg-blue-400/60 text-white" : "bg-emerald-400/50 text-white"
          }
          return "opacity-30 hover:bg-muted/50"
        }

        // 一弦三音：下一把位预览。判定点位必须与 `lib/fretboard-cell-role.ts:resolveBaseRole` 的 ②
        // 完全一致（只在 `threeNpsTarget === null` 时生效），否则会出现「文字层说是预览、
        // 配色层说不认识」⇒ 提示不可见。两套皮肤共用同一张产出表（`app/page.tsx:nextThreeNpsCells`）。
        const previewKind = nextThreeNpsCells?.get(key)
        if (previewKind) return PREVIEW_CLASS[previewKind]

        // 根音（1级）用柔和的蓝色
        if (interval === 0) {
          return "bg-blue-400/60 text-white"
        }
        // 其他音阶音用柔和的绿色
        return "bg-emerald-400/50 text-white"
      }

      // 不在音阶中的音，只显示 hover 效果
      return "hover:bg-muted/50"
    }

    if (activeTab === "chord") {
      // 和弦转换练习 - 指板样式参考找音练习
      const key = `${stringIndex}-${fret}`
      
      // 优先显示点击反馈（正确绿色，错误红色，加 ✓/✗ 角标）
      if (highlightedFrets.has(key)) {
        const isCorrect = highlightedFrets.get(key)
        return isCorrect
          ? "bg-green-500 text-white fret-feedback-correct" 
          : "bg-red-500 text-white fret-feedback-wrong"
      }
      
      const chords = transposedChords
      const currentChord = chords[currentChordIndex]
      if (!currentChord) return "hover:bg-muted/50"

      const noteIdx = getNoteIndex(note)
      const rootIdx = getNoteIndex(currentChord.root)

      // 检查这个音是否在当前和弦中
      const normalizedType = normalizeChordType(currentChord.type)
      const chordType = CHORD_TYPES.find(ct => ct.name === normalizedType || ct.symbol === normalizedType || ct.name === currentChord.type || ct.symbol === currentChord.type)
      if (!chordType) return "hover:bg-muted/50"

      const interval = (noteIdx - rootIdx + 12) % 12
      if (!chordType.intervals.includes(interval)) {
        // 不在和弦中的音，只显示 hover 效果
        return "hover:bg-muted/50"
      }

      // 根音用柔和的蓝色
      if (noteIdx === rootIdx) {
        return "bg-blue-400/60 text-white"
      }

      // 其他和弦音用柔和的绿色
      return "bg-emerald-400/50 text-white"
    }

    // 默认返回 hover 效果样式
    return "hover:bg-muted/50"
}
