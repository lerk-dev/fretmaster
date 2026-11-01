// 全屏练习覆盖层：按 tab 显示练习内容 + 下一题预览 + 可交互指板（按 ↑/↓ 显隐）
"use client"

import { memo, useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { SCALE_MODES } from '@/lib/page-theory-data'
import { formatChordShape, formatDegree, getChordDegrees, getChordDisplayName, getScaleDisplayName, normalizeNoteName } from '@/lib/page-theory-functions'
import { useAppStore, useIsPlaying, useUser, useChordSymbols } from '@/lib/store'
import { GuitarRunFretboard } from '@/components/guitarrun-fretboard'
import { PracticeFretboard } from '@/components/practice-fretboard'
import type { ThreeNpsPreviewKind } from '@/lib/fretboard-cell-role'
import { pickTabFretboardFlag } from '@/lib/tab-fretboard-toggle'
import { intervalDirectionSymbol, type IntervalDirection } from '@/lib/interval-direction'
import { formatThreeNpsLocation } from '@/lib/three-notes-per-string'
import { PracticeScoreBadge, PracticeTimerBadge, type PracticeScore } from '@/components/practice-status'
import type { NextThreeNpsView, ThreeNpsView } from '@/components/scale-sequence-display'

interface FullscreenOverlayProps {
  /** 翻译函数 */
  t: (key: string) => string
  /** 退出/切换全屏（页面里是 handleToggleFullscreen） */
  setFullscreenMode: (enable?: boolean) => void
  /** 按变音号偏好格式化音名 */
  formatNoteByAccidentalSetting: (note: string) => string
  /** 找音练习：目标音符 */
  targetNote: string
  /** 找音练习：答题模式 */
  practiceAnswerMode: "fretboard" | "buttons"
  /** 练习建议文案 */
  currentPracticeSuggestion: string
  /** 找音练习：已选琴弦 */
  selectedStrings: number[]
  /** 是否显示全部音符 */
  showAllNotes: boolean
  /** 高亮反馈（key=stringIndex-fret） */
  highlightedFrets: Map<string, boolean>
  /** 和弦进行：当前和弦下标 */
  currentChordIndex: number
  /** 和弦练习等级 id */
  practiceLevel: string
  /** 和弦进行：已转调序列 */
  transposedChords: { root: string; type: string; bass?: string }[]
  /** 和弦进行：当前和弦显示名 */
  getCurrentChordDisplay: () => string
  /** 和弦进行：下一题预览 */
  getNextChordDisplay: () => { index: number; root: string; type: string; bass?: string; degrees: string[] } | null
  /** 等级选项（传给 getChordDegrees） */
  getLevelOptions: () => { forceNaturalFive?: boolean; endOnStartingInterval?: boolean; usePassingNoteBebopScale?: boolean; sevenFlatNineScaleChoice?: 'altered' | 'diminishedWholeHalf' | 'diminishedHalfWhole' }
  /**
   * 和弦进行：**当前音级下标**（= 已弹对的音的数量）。
   * 与普通模式 `components/chord-degrees-display.tsx` 同源 —— 那边早就按它逐个把
   * 已弹对的音级 `opacity-50` 变灰、当前音级高亮；全屏层原先**根本没接这个状态**，
   * 三个音级从头到尾都是 `text-primary` ⇒ 用户看不出弹到哪个音了
   * （只能等整和弦弹完切下一和弦）。2026-10-31 用户反馈后补上。
   */
  chordDegreeCurrentStep: number
  /** 和弦练习：目标和弦 */
  chordExerciseTargetChord: { root: string; type: string } | null
  /** 和弦练习：音级序列 */
  chordExerciseSequence: string[]
  /** 和弦练习：当前音级下标 */
  chordExerciseCurrentStep: number
  /** 和弦练习：下一题预览 */
  nextChordExerciseInfo: { root: string; type: string; sequence: string[] } | null
  /** 音阶练习：音级序列 */
  scaleExerciseSequence: string[]
  /** 音阶练习：当前音级下标 */
  scaleExerciseCurrentStep: number
  /** 音阶练习：调性 */
  scaleKey: string
  /** 音阶练习：当前音阶 */
  selectedScale: typeof SCALE_MODES.pentatonic[number]
  /** 音阶练习：下一题预览 */
  nextScaleExerciseInfo: { key: string; scaleName: string; sequence: string[] } | null
  /**
   * 音阶练习：一弦三音（3NPS）当前把位视图。
   *
   * 🚨 非 3NPS 时为 null。**必须显式传**：3NPS 的题面结构与普通音阶完全不同
   * （把位进度 / 换把 / 连击 / 目标音+弦品 / 9 步滑窗），这些数据只存在于页面侧的
   * 快照对象里，全屏层自己推不出来。类型与普通模式共用
   * （`components/scale-sequence-display.tsx` 导出的 `ThreeNpsView`）。
   */
  threeNps: ThreeNpsView | null
  /** 音阶练习：3NPS 的下一个把位预览（普通音阶模式为 null） */
  nextThreeNps: NextThreeNpsView | null
  /** 音程练习：当前题目 */
  currentIntervalExercise: { rootNote: string; interval: { name: string; symbol: string; semitones: number }; targetNote: string; allIntervals: { name: string; symbol: string; semitones: number }[]; currentIntervalDisplay: string; completedIntervals: number[]; answered: boolean } | null
  /**
   * 音程练习：方向（↑ / ↓ / ↕ / 🔀）。
   *
   * 🚨 必须显式传进来，不能从 `currentIntervalExercise` 推 —— 方向是**独立的设置项**
   * （`intervalPractice.direction`），一道题本身不携带它（`either` 模式下同一道题的
   * 上行/下行甚至由队列顺序决定）。原先全屏层没接这个 prop ⇒ 进全屏后方向信息
   * 整个消失，用户不知道该往上还是往下按。符号映射见 `lib/interval-direction.ts`。
   */
  intervalDirection: IntervalDirection
  /** 音程练习：本轮练习队列（用于显示第几题 / 共几题） */
  intervalExerciseQueue: number[]
  /** 音程练习：队列当前下标 */
  intervalCurrentQueueIndex: number
  /**
   * 本轮练习得分（`正确/总数`）。
   *
   * 🚨 全屏层是 `fixed inset-0 z-[9999]`，把顶栏整个盖住 —— 而得分徽章只在顶栏里
   * 显示过 ⇒ 一进全屏就看不到「对了几题」。所以这里显式传进来自己显示一份。
   * 徽章实现与顶栏共用 `components/practice-status.tsx`（含 70% 换色那条判定）。
   */
  score: PracticeScore
  /** 剩余秒数（顶栏同一份数据；全屏盖住顶栏后靠它显示） */
  timeLeft: number
  /** 本轮设定的练习时长（分钟数换算后的秒数）；为 0 表示不限时 ⇒ 不显示倒计时 */
  practiceTime: number
  /** 秒 → mm:ss */
  formatTime: (seconds: number) => string
  /** 是否显示「正确率统计」徽章（设置 → 显示与外观，默认关） */
  showAccuracy: boolean
  /** 是否显示「倒计时」徽章（设置 → 显示与外观，默认关；仅时有练习生效） */
  showTimer: boolean
  /** 找音练习：指板显隐 */
  showFretboard: boolean
  /** 音程练习：指板显隐 */
  showIntervalFretboard: boolean
  /** 和弦进行：指板显隐 */
  showChordFretboard: boolean
  /** 和弦练习：指板显隐 */
  showChordExerciseFretboard: boolean
  /** 音阶练习：指板显隐 */
  showScaleFretboard: boolean
  /** 全屏指板点击 */
  handleFretClick: (stringIndex: number, fret: number) => void
  /** 全屏指板的按钮配色 */
  getNoteButtonColor: (note: string, stringIndex: number, fret: number) => string
  /** 品记位置（页面模块级常量） */
  FRET_MARKERS: number[]
  // —— 以下 6 项是 GuitarRun 指板皮肤需要的输入（经典皮肤用不到） ——
  /** 找音练习（按钮答题）：本轮要求点的格子 */
  highlightedTargetPosition: { stringIndex: number; fret: number } | null
  /** 音程练习：根音 */
  rootNote: string
  /** 音程练习：已选音程下标 */
  selectedIntervals: number[]
  /** 一弦三音：当前把位的目标品 */
  threeNpsTarget: { stringIndex: number; fret: number } | null
  /** 一弦三音：当前把位覆盖的格子 */
  threeNpsCellKeys: ReadonlyMap<string, unknown>
  /** 一弦三音：下一把位预览 */
  nextThreeNpsCells: ReadonlyMap<string, ThreeNpsPreviewKind>
}

/**
 * 全屏练习覆盖层（从 app/page.tsx 原样搬出，行为不变）。
按当前 tab 显示不同内容（找音/和弦/和弦练习/音阶/音程）+ 下一题预览 + 可交互指板（↑ 显示 ↓ 隐藏）+ 退出提示。
点击任意处、Esc/Enter/Space 退出全屏。

🚨 **布局契约**：题目区声明是 `max-w-[400px]` 的窄列，指板必须是它的**兄弟**（同级宽列
`max-w-6xl`）而不是子节点 —— 否则指板可用宽度被压到约 304px，小于「空弦 + N 品」的最小
宽度（默认 384px），右侧的品会被 `overflow-hidden` 裁掉（2026-10-01 修）。
 */
export const FullscreenOverlay = memo(function FullscreenOverlay({
  t,
  setFullscreenMode,
  formatNoteByAccidentalSetting,
  targetNote,
  practiceAnswerMode,
  currentPracticeSuggestion,
  selectedStrings,
  showAllNotes,
  highlightedFrets,
  currentChordIndex,
  practiceLevel,
  transposedChords,
  getCurrentChordDisplay,
  getNextChordDisplay,
  getLevelOptions,
  chordDegreeCurrentStep,
  chordExerciseTargetChord,
  chordExerciseSequence,
  chordExerciseCurrentStep,
  nextChordExerciseInfo,
  scaleExerciseSequence,
  scaleExerciseCurrentStep,
  scaleKey,
  selectedScale,
  nextScaleExerciseInfo,
  threeNps,
  nextThreeNps,
  currentIntervalExercise,
  intervalDirection,
  intervalExerciseQueue,
  intervalCurrentQueueIndex,
  score,
  timeLeft,
  practiceTime,
  formatTime,
  showAccuracy,
  showTimer,
  showFretboard,
  showIntervalFretboard,
  showChordFretboard,
  showChordExerciseFretboard,
  showScaleFretboard,
  handleFretClick,
  getNoteButtonColor,
  FRET_MARKERS,
  highlightedTargetPosition,
  rootNote,
  selectedIntervals,
  threeNpsTarget,
  threeNpsCellKeys,
  nextThreeNpsCells,
}: FullscreenOverlayProps) {
// store 派生值：与页面用同一套 selector / 推导，正文里的名字保持不变
  const activeTab = useAppStore((s) => s.activeTab)
  const isPlaying = useIsPlaying()
  const user = useUser()
  const chordSymbols = useChordSymbols()

  // 「点击退出全屏」提示的自动显隐：
  // 进入全屏后先显示 3 秒 → 自动隐藏；鼠标/触摸移动时再显示，停下 3 秒后继续隐藏（循环）。
  // 用墙钟无关的计数器：只在状态翻转时 setState，移动时频繁触发只重置定时器不重渲。
  const EXIT_HINT_VISIBLE_MS = 3000
  const [exitHintVisible, setExitHintVisible] = useState(true)
  const exitHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleHideExitHint = useRef(() => {
    if (exitHintTimer.current) clearTimeout(exitHintTimer.current)
    exitHintTimer.current = setTimeout(() => setExitHintVisible(false), EXIT_HINT_VISIBLE_MS)
  })
  useEffect(() => {
    setExitHintVisible(true)
    scheduleHideExitHint.current()
    return () => {
      if (exitHintTimer.current) clearTimeout(exitHintTimer.current)
    }
  }, [])
  const handleExitHintActivity = () => {
    // React 在值不变（true === true）时会自动跳过重渲，故每次移动直接置 true 即可
    setExitHintVisible(true)
    scheduleHideExitHint.current()
  }
  // 🚨 弦数 / 调弦 / 品数**不再在这里派生**：经典皮肤已改为复用 `PracticeFretboard`，
  // 这三者的唯一来源（`resolveInstrumentConfig(user.instrument)` 与 `practiceSettings.fretCount`）
  // 都在那个组件内部；GuitarRun 皮肤则由 `GuitarRunFretboard` 自己读。两处都不必再传。
  const chordScaleDisplay = user.chordScaleDisplay

  /**
   * 全屏指板当前是否可见（按 tab 取各自的开关）。
   *
   * 🚨 **必须提到容器外层**：题目区是 `max-w-[400px]` 的窄列，指板若放在它**内部**
   * 就只剩约 304px 可用，而「空弦 + N 品」的最小宽度是 `(N+1) × min-w`（默认 16 列 × 24px
   * = 384px）⇒ 右侧几个品被外层 `overflow-hidden` 直接裁掉。表现就是用户看到的
   * 「指板非常窄、还填不满设定的品数」。所以题目窄列与指板宽列必须是**兄弟**。
   *
   * 🚨 tab→开关 的映射**不在这里写**（曾与 `app/page.tsx` 的 ↑/↓ 键各写一份，
   * 两份的分支顺序已经不同）—— 一律走唯一真相源 `lib/tab-fretboard-toggle.ts`。
   */
  const showFullscreenFretboard = isPlaying && pickTabFretboardFlag(activeTab, {
    showFretboard,
    showIntervalFretboard,
    showChordFretboard,
    showChordExerciseFretboard,
    showScaleFretboard,
  })

  // 🚨 2026-10-31 审计第 13 项：这层**不再**挂 role="button" / tabIndex / aria-label。
  //    原先整块全屏层（含指板按钮、钢琴键）是一个 role="button"：
  //    ① 读屏会把里面的**所有**控件当装饰（ARIA 规定 role=button 的子节点是
  //       presentational）⇒ 全屏练习里读屏用户既听不到、也操作不了指板；
  //    ② 容器的 keydown 会收到子元素冒泡 ⇒ 按 Enter 想激活当前格子，结果**退出全屏**。
  //    退出方式改为「点背景」+「Esc（全局快捷键 / 本层兜底）」，两者都在下面保留。
  return (
<div
  /* 🚨 `safe-center-y`（手写类，见 `app/globals.css`；不是裸 `justify-center`）：
     内容比视口高时，裸 center 会把溢出的那一半甩到**顶部之外** —— 顶部被裁掉
     **且滚不回去**（实测 1366×768：调式名「C 伊奥尼亚调式」只剩「调式」两个字）。
     `safe center` 在放不下时自动退回 `start` ⇒ 顶部可达、可正常滚动。

     ⚠️ **不能用 Tailwind 任意值**：`justify-[safe_center]` 在 Tailwind 3.4.19 下
     **不生成任何 CSS 规则**（实测，连 `justify-[center]` 也不生成）⇒ 类名进了产物
     JS、样式表里却没有 ⇒ 静默失效、页面退回默认 `flex-start`。 */
  className="fixed inset-0 z-[9999] bg-background flex flex-col items-center safe-center-y overflow-auto cursor-pointer"
  style={{ margin: 0, padding: 0, width: '100vw', height: '100vh', top: 0, left: 0, right: 0, bottom: 0 }}
  onClick={() => setFullscreenMode(false)}
  onMouseMove={handleExitHintActivity}
  onTouchMove={handleExitHintActivity}
  onKeyDown={(e) => {
    // 子控件已经用掉这次按键（`activateOnEnterSpace` 会 preventDefault）⇒ 别再退出全屏
    if (e.defaultPrevented) return
    // 只认 Esc：Enter / Space 归当前焦点控件（激活格子）与全局快捷键（下一题）
    if (e.key === 'Escape') {
      e.preventDefault()
      setFullscreenMode(false)
    }
  }}
>
  <div
    /* 🚨 `shrink-0`：**必须**禁掉 flex 压缩。
       根容器是 `flex flex-col` + 固定 `height:100vh`，子项默认 `flex-shrink:1`。
       内容总高超过视口（1366×768 ⇒ 768px）时，根容器会**压缩**子项来「装下」：
         · 窄列有 `min-h-[300px]` ⇒ 只能压到 472px，而它的**内容**是 565px
           ⇒ 溢出 93px，**直接画到兄弟节点（指板）上面**（实测「下一把位」文字压在指板格子上）；
         · 指板那格没有 min-height ⇒ 压得更狠，内容从自己的盒子溢出去。
       禁掉压缩后，内容按自然高度排开，根容器 `overflow-auto` 负责滚动。
       ⚠️ 这也解释了「**只有开指板才出问题**」：不开指板时根容器只有一个 flex 子项，
          压不动 ⇒ 不触发；有指板才有第二个子项一起被压。

       `p-4`：窄列是**透明**的，padding 只影响「内容相对这 400px 盒子边的距离」，
       肉眼几乎看不出来；但它**同时**是竖向（上下各 16px ⇒ 省 32px）与横向
       （内容宽 336 → 368px，9 步滑窗每格多 3.5px）的资源。
       竖向那 32px 正是 768p 笔记本「题目 + 指板一起放不下」的关键差额。 */
    className="text-center p-4 w-full max-w-[400px] min-h-[300px] flex flex-col items-center justify-center cursor-default shrink-0"
    onClick={(e) => e.stopPropagation()}
  >
    {/*
      🚨 得分 + 剩余时间（2026-10-31 补）。
      这两样原先只在顶栏（`components/app-header.tsx`）里显示，而全屏层是
      `fixed inset-0 z-[9999]`，把顶栏整个盖住 ⇒ 一进全屏，「对了几题 / 还剩几分钟」
      全部消失（实测：全屏文本里只有题目本身）。练习中这两项恰恰是要一直看到的。

      徽章实现与顶栏共用 `components/practice-status.tsx`（含 70% 换色的判定），
      这里只负责摆位置；是否显示的分支也与顶栏同口径（练习中 + 本轮有设定时长）。
    */}
    {isPlaying && (
      <div className="flex items-center justify-center gap-4 mb-6" data-fullscreen-status="">
        {showAccuracy && <PracticeScoreBadge t={t} score={score} />}
        {showTimer && practiceTime > 0 && (
          <PracticeTimerBadge t={t} timeLeft={timeLeft} formatTime={formatTime} />
        )}
      </div>
    )}

    {/* 根据当前练习模式显示不同内容 */}
    {activeTab === "practice" && isPlaying && (
      <div className="space-y-8">
        {practiceAnswerMode === "fretboard" ? (
          <>
            <div className="text-8xl font-bold text-primary">{formatNoteByAccidentalSetting(targetNote)}</div>
            <div className="text-2xl text-muted-foreground">{t('target_note')}</div>
          </>
        ) : (
          <>
            <div className="text-6xl font-bold text-primary">{t('target_note')}</div>
            <div className="text-2xl text-muted-foreground">{t('practice_mode_description_identify')}</div>
          </>
        )}
        {currentPracticeSuggestion && (
          <div data-focus-distraction className="mt-4 p-4 bg-card/50 rounded-lg border border-border/30 max-w-md">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-primary">{t('practice_suggestion_title')}:</span> {currentPracticeSuggestion}
            </p>
          </div>
        )}
      </div>
    )}
    
    {activeTab === "chord" && (
      <div className="space-y-8">
        {/*
          🚨 和弦名必须**一行**放得下：`whitespace-nowrap` 防换行（换行会改高度 ⇒
          整块内容上下跳，正是用户反馈的「影响其他部分」）。
          字号按断点收，保证**最长的中文和弦名**（「属七升五降九和弦」8 字 + 调性）
          在任何视口宽度都不出屏（出屏会顶出横向滚动条）：
            <640  text-4xl (36px) ⇒ 8×36+22 ≈ 310px < 358（390 手机的内容宽）
            ≥640  text-6xl (48px) ⇒ 8×48+29 ≈ 413px < 640
            ≥1024 text-7xl (72px) ⇒ 8×72+43 ≈ 619px < 1024
        */}
        <div data-fullscreen-title="" className="text-4xl sm:text-6xl lg:text-7xl font-bold text-primary whitespace-nowrap">{getCurrentChordDisplay()}</div>
        <div className="flex flex-wrap justify-center gap-4">
          {(() => {
            const chords = transposedChords
            const currentChord = chords[currentChordIndex]
            if (!currentChord) return null
            const degrees = getChordDegrees(currentChord.type, practiceLevel, getLevelOptions())
            /*
             * 🚨 逐音变灰（与普通模式 `components/chord-degrees-display.tsx` 同源口径）：
             *   `i < chordDegreeCurrentStep` 已弹对 ⇒ 变灰；
             *   `i === chordDegreeCurrentStep` 当前要弹 ⇒ 高亮（实心）；
             *   其余 ⇒ 待弹（暗色）。
             * 全屏层原先**根本没接 `chordDegreeCurrentStep`**，三个音级从头到尾都是
             * `text-primary` ⇒ 弹没弹对全一个样，用户只能等整和弦弹完切下一和弦才反应过来。
             * 2026-10-31 用户反馈后补上。
             */
            return degrees.map((degree, i) => (
              <span
                key={i}
                data-chord-degree=""
                data-done={i < chordDegreeCurrentStep ? '1' : '0'}
                className={cn(
                  'text-5xl font-bold transition-colors',
                  i < chordDegreeCurrentStep && 'text-muted-foreground/50',
                  i === chordDegreeCurrentStep && 'text-primary',
                  i > chordDegreeCurrentStep && 'text-muted-foreground/80',
                )}
              >
                {formatDegree(degree)}
              </span>
            ))
          })()}
        </div>
        {/* 下一题预览*/}
        {(() => {
          const nextChord = getNextChordDisplay()
          if (!nextChord) return null
          // 拼装规则走 `lib/page-theory-functions.formatChordShape`（唯一真相源）。
          // 这里原先内联了一份等价表达式（大三不带后缀 + 根音/低音归一化）——
          // 与普通模式 `components/chord-degrees-display.tsx` 各写一份，单边一改就会分叉。
          const displayName = formatChordShape(nextChord, chordScaleDisplay, chordSymbols)
          return (
            <div className="pt-8 mt-8 border-t border-border/30">
              <p className="text-sm text-muted-foreground mb-2">{t('next_chord')}</p>
              <div className="text-xl font-medium text-muted-foreground mb-1">{displayName}</div>
              <div className="text-lg text-muted-foreground/70">{nextChord.degrees.map(formatDegree).join(' ')}</div>
            </div>
          )
        })()}
      </div>
    )}
    
    {activeTab === "chord_exercise" && isPlaying && chordExerciseTargetChord && (
      <div className="space-y-8">
        {/* 🚨 和弦名一行放得下（`whitespace-nowrap`）—— 同和弦转换分支的说明与字号断点 */}
        <div data-fullscreen-title="" className="text-4xl sm:text-6xl lg:text-7xl font-bold text-primary whitespace-nowrap">
          {normalizeNoteName(chordExerciseTargetChord.root)} {normalizeNoteName(getChordDisplayName(chordExerciseTargetChord.type, chordScaleDisplay, chordSymbols))}
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          {chordExerciseSequence.map((degree, i) => (
            <span 
              key={i} 
              className={cn(
                "text-5xl font-bold",
                i === chordExerciseCurrentStep ? "text-primary" : "text-muted-foreground",
                i < chordExerciseCurrentStep && "opacity-30"
              )}
            >
              {formatDegree(degree)}
            </span>
          ))}
        </div>
        {/* 下一题预览*/}
        {nextChordExerciseInfo && (
          <div className="pt-8 mt-8 border-t border-border/30">
            <p className="text-sm text-muted-foreground mb-2">{t('next_chord')}</p>
            <div className="text-xl font-medium mb-1">
              {normalizeNoteName(nextChordExerciseInfo.root)} {normalizeNoteName(getChordDisplayName(nextChordExerciseInfo.type, chordScaleDisplay, chordSymbols))}
            </div>
            <div className="text-lg text-muted-foreground/70">
              {nextChordExerciseInfo.sequence.map(formatDegree).join(' ')}
            </div>
          </div>
        )}
      </div>
    )}
    
    {activeTab === "scale" && isPlaying && scaleExerciseSequence.length > 0 && (
      /* `space-y-3`：全屏竖向空间紧张（窄列 + 指板要一起放下），`space-y-4` 就已经
         多吃掉 16px，挤到 768p 笔记本就得滚动。 */
      <div className="space-y-3">
        {/* 🚨 音阶名必须**一行**放得下：`whitespace-nowrap` 防换行（换行改高度 ⇒ 内容上下跳）。
            字号按断点收，保证**最长的中文音阶名**（「变化属音阶bb7」= 5 中文 + 3 拉丁 + 调性）
            任何视口都不出屏：<640 text-3xl(30px)≈240px <358；≥640 text-5xl(48px)≈384px <640。 */}
        <div data-fullscreen-title="" className="text-3xl sm:text-5xl font-bold text-primary whitespace-nowrap">{normalizeNoteName(scaleKey)} {getScaleDisplayName(selectedScale.name, chordScaleDisplay)}</div>

        {/*
          🚨 一弦三音（3NPS）必须换成「把位视图」（2026-10-31 补）。
          原先这里**无条件**把 `scaleExerciseSequence` 全部铺成徽章行 —— 而 3NPS 的
          序列是 35 步（3×6 上行 + 17 下行）⇒ 全屏里变成 5 行纯数字墙
          （实测：`1 2 3 4 5 6 7 / 1 2 3 4 5 6 7 / 1 2 3 4 3 2 1 / …`），
          把位进度、换把、连击、目标音在几弦几品、9 步滑窗**一个都没有**，
          用户根本不知道弹到哪了、下一个该弹谁。

          而这个问题在普通模式里早就被解决过：`components/scale-sequence-display.tsx`
          的注释写着「35 步的音级标签横排根本看不出当前位置，这正是改用
          9 步滑窗 + 当前步固定第 4 格的原因」。全屏层是同一道题的另一套版式，
          信息项必须与普通模式对齐（数据同源：页面侧的 `threeNps` 快照）。
        */}
        {threeNps ? (
          <>
            {/* 把位进度 + 方向/换把 + 连击（与普通模式同批信息，放大显示） */}
            <div
              className="flex flex-wrap items-center justify-center gap-4 text-lg text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              <span className="font-medium text-primary">
                {t('three_nps_position_progress')
                  .replace('{current}', String(threeNps.position))
                  .replace('{total}', String(threeNps.totalPositions))}
              </span>
              <span>
                {threeNps.isShift
                  ? t('three_nps_shift').replace('{position}', String(threeNps.position))
                  : threeNps.direction === 'up'
                    ? t('three_nps_ascending')
                    : t('three_nps_descending')}
              </span>
              <span>{t('three_nps_combo').replace('{combo}', String(threeNps.combo))}</span>
            </div>

            {/* 当前目标音 + 建议位置（同一音名别处也能弹，这里只是推荐位） */}
            {threeNps.target && (
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    /* `w-20 h-20 text-4xl`：原来的 `w-28 h-28 text-6xl`(112px) 在全屏里
                       纯属浪费竖向空间 —— 一屏要同时装下「题目 + 指板」，高度是稀缺资源。 */
                    'w-20 h-20 rounded-xl flex items-center justify-center text-4xl font-bold',
                    threeNps.target.isRoot ? 'bg-blue-400/20 text-blue-500' : 'bg-primary/10 text-primary'
                  )}
                >
                  {formatDegree(threeNps.target.label)}
                </div>
                <div className="text-xl font-medium">
                  {threeNps.target.note}
                  <span className="ml-2 text-base font-normal text-muted-foreground">
                    {formatThreeNpsLocation(t, threeNps.target.stringIndex, threeNps.target.fret)}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {threeNps.stepNow} / {threeNps.stepTotal}
                </div>
              </div>
            )}

            {/* 9 步滑窗：当前步固定第 4 格（普通模式同款，只是放大）
                🚨 格子**不许用固定宽度**。
                全屏窄列的内容宽只有 336px（`max-w-[400px]` − `p-8`×2），而 9 个固定
                `w-12`(48px) + 8 个 `gap-2`(8px) = **496px** ⇒ `flex-wrap` 永远换行成
                2 排（实测 `rowCount=2`），「滑窗」变成两行数字，视觉语义直接崩掉。
                改成 `flex-1 basis-0 min-w-0` ⇒ 9 格平分列宽，**永远一行**，
                且列宽随视口变化时自动跟着变（窄屏也不会换行）。 */}
            <div className="flex flex-nowrap justify-center gap-1">
              {threeNps.window.map((step, i) => (
                <span
                  key={i}
                  data-three-nps-step=""
                  className={cn(
                    'inline-flex items-center justify-center flex-1 basis-0 min-w-0 h-12 px-0.5 rounded border text-lg font-mono',
                    step.current
                      ? 'bg-primary text-primary-foreground border-primary font-bold'
                      : step.done
                        ? 'border-border/40 text-muted-foreground/50'
                        : 'border-border text-muted-foreground'
                  )}
                >
                  {formatDegree(step.label)}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
            {scaleExerciseSequence.map((degree, i) => (
              <span
                key={i}
                className={cn(
                  'text-4xl font-bold',
                  i === scaleExerciseCurrentStep ? 'text-primary' : 'text-muted-foreground',
                  i < scaleExerciseCurrentStep && 'opacity-30'
                )}
              >
                {formatDegree(degree)}
              </span>
            ))}
          </div>
        )}

        {/* 下一题预览：3NPS 是「下一个把位」，普通音阶是下一题的调性 + 序列 */}
        {threeNps && nextThreeNps ? (
          <div className="pt-3 mt-3 border-t border-border/30">
            <p className="text-sm text-muted-foreground mb-2">{t('next_chord')}</p>
            <div className="text-xl font-medium mb-1">
              {t('three_nps_next_position').replace('{position}', String(nextThreeNps.position))}
              <span className="ml-2 text-base text-muted-foreground">
                {normalizeNoteName(scaleKey)} {getScaleDisplayName(selectedScale.name, chordScaleDisplay)}
              </span>
            </div>
            <div className="text-lg text-muted-foreground/70">
              {formatThreeNpsLocation(t, nextThreeNps.startStringIndex, nextThreeNps.startFret)}
            </div>
          </div>
        ) : nextScaleExerciseInfo ? (
          <div className="pt-3 mt-3 border-t border-border/30">
            <p className="text-sm text-muted-foreground mb-2">{t('next_chord')}</p>
            <div className="text-xl font-medium mb-1">
              {normalizeNoteName(nextScaleExerciseInfo.key)} {getScaleDisplayName(nextScaleExerciseInfo.scaleName, chordScaleDisplay)}
            </div>
            <div className="text-lg text-muted-foreground/70">
              {nextScaleExerciseInfo.sequence.map(formatDegree).join(' ')}
            </div>
          </div>
        ) : null}
      </div>
    )}

    {activeTab === "interval" && isPlaying && currentIntervalExercise && (
      <div className="space-y-8">
        {/*
          🚨 方向 + 队列进度（2026-10-31 补）：这里原先**只有一个根音和一串音程**，
             进全屏后方向信息整个消失 —— 用户不知道该往上还是往下按；
             `either`（上下都行）与 `random`（每道题随机）更是完全没有提示。

          信息项与普通模式的 `components/interval-question.tsx` 顶部栏对齐
          （那边是「计时 / 方向 / 进度」三项；全屏不显示倒计时，所以只补后两项）。
          符号走 `lib/interval-direction.ts` 的唯一真相源，不在两处各写一个三元。
        */}
        <div className="flex items-center justify-center gap-8 text-lg text-muted-foreground">
          <span data-interval-direction={intervalDirection}>
            {t('direction')}:{' '}
            <span className="align-middle text-3xl text-foreground">
              {intervalDirectionSymbol(intervalDirection)}
            </span>
          </span>
          <span data-interval-progress="">
            {intervalCurrentQueueIndex}/{intervalExerciseQueue.length}
          </span>
        </div>
        <div className="text-8xl font-bold text-primary">{normalizeNoteName(currentIntervalExercise.rootNote)}</div>
        {/* 本轮选中的音程集合（普通模式同款：作为背景信息，字号弱化）。
            信息项与 `components/interval-question.tsx` 对齐 —— 全屏是同一道题的另一套版式，
            普通模式有的上下文这里也该有。 */}
        {currentIntervalExercise.allIntervals.length > 0 && (
          <div className="text-base text-muted-foreground">
            {currentIntervalExercise.allIntervals.map((i) => formatDegree(i.symbol)).join(' ')}
          </div>
        )}
        <div className="text-6xl font-bold">
          {currentIntervalExercise.currentIntervalDisplay.split(' ').map((interval, idx) => (
            <span 
              key={idx}
              className={cn(
                "mx-4",
                currentIntervalExercise.completedIntervals.includes(idx) && "text-muted-foreground line-through"
              )}
            >
              {formatDegree(interval)}
            </span>
          ))}
        </div>
        {/* 答对后的目标音（普通模式同款：绿色给一次确认） */}
        {currentIntervalExercise.answered && (
          <div className="text-3xl text-green-600">{currentIntervalExercise.targetNote}</div>
        )}
      </div>
    )}
  </div>

  {/* 全屏模式指板 - 按 ↑ 显示，按 ↓ 隐藏。
      宽列：与题目窄列**同级**，不再受题目区 400px 限制；
      `stopPropagation` 防止「点品格」顺带触发外层「点任意处退出全屏」。 */}
  {showFullscreenFretboard && (
    <div
      /* 探针：契约测试靠它断言「指板是题目窄列的**兄弟**、且宽度上限不受 400px 约束」 */
      data-fullscreen-fretboard=""
      /* `shrink-0`：同窄列 —— 指板绝不能被根容器压缩（压缩 ⇒ 内容溢出到退出提示/视口外） */
      className="w-full max-w-6xl mt-8 px-4 cursor-default shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      {user.fretboardStyle !== 'classic' ? (
        /* 指板显示方案：圆点皮肤（GuitarRun / MyFretboardTrainer）与主区域用同一个组件，
           保证两处观感一致；skin 决定用 .gr-* 还是 .ft-* 外观 */
        <GuitarRunFretboard
              t={t}
              formatNoteByAccidentalSetting={formatNoteByAccidentalSetting}
              handleFretClick={handleFretClick}
              showAllNotes={showAllNotes}
              highlightedFrets={highlightedFrets}
              selectedStrings={selectedStrings}
              rootNote={rootNote}
              selectedIntervals={selectedIntervals}
              scaleKey={scaleKey}
              selectedScale={selectedScale}
              scaleExerciseSequence={scaleExerciseSequence}
              transposedChords={transposedChords}
              currentChordIndex={currentChordIndex}
              chordExerciseTargetChord={chordExerciseTargetChord}
              FRET_MARKERS={FRET_MARKERS}
              targetNote={targetNote}
              practiceAnswerMode={practiceAnswerMode}
              highlightedTargetPosition={highlightedTargetPosition}
              threeNpsTarget={threeNpsTarget}
              threeNpsCellKeys={threeNpsCellKeys}
              nextThreeNpsCells={nextThreeNpsCells}
              skin={user.fretboardStyle === 'trainer' ? 'trainer' : 'guitarrun'}
        />
      ) : (
        /*
         * 经典皮肤：与主区**共用**同一个指板组件（`embedded` = 不带 Card 外壳 / 不带
         * data-onboarding）。此前这里是**第二份内联复制**，已漂移 —— 列最小宽 24/32（主区是 20/28）
         * ⇒ 手机上 16 列要 384px 而容器只有 326px，被 `overflow-hidden` 裁掉右侧约 2 个品；
         * 另外还没有 `data-role`、不显示音级、字号与空弦列宽都不同。**别再在这里写第二份标记。**
         * 护栏：__tests__/fretboard-single-source.test.ts
         */
        <PracticeFretboard
          embedded
          t={t}
          formatNoteByAccidentalSetting={formatNoteByAccidentalSetting}
          handleFretClick={handleFretClick}
          getNoteButtonColor={getNoteButtonColor}
          showAllNotes={showAllNotes}
          highlightedFrets={highlightedFrets}
          selectedStrings={selectedStrings}
          rootNote={rootNote}
          selectedIntervals={selectedIntervals}
          scaleKey={scaleKey}
          selectedScale={selectedScale}
          scaleExerciseSequence={scaleExerciseSequence}
          transposedChords={transposedChords}
          currentChordIndex={currentChordIndex}
          chordExerciseTargetChord={chordExerciseTargetChord}
          targetNote={targetNote}
          practiceAnswerMode={practiceAnswerMode}
          highlightedTargetPosition={highlightedTargetPosition}
          threeNpsTarget={threeNpsTarget}
          threeNpsCellKeys={threeNpsCellKeys}
          nextThreeNpsCells={nextThreeNpsCells}
          FRET_MARKERS={FRET_MARKERS}
        />
      )}
    </div>
  )}

    {/*
      提示文字：进入全屏前 3 秒显示，之后自动隐藏；鼠标/触摸移动时再显示，停下 3 秒后继续隐藏。
      🚨 **必须脱离文档流**（`fixed`）：原来是流式布局里的一个块 + `mt-12` ⇒ 它一出现/消失，
      根容器的 `safe center` 居中基线就跟着动，**上面整块题目上下跳一下**（用户原话「有跳动的感觉，
      影响练习」）。改成 `fixed` 后它不参与 flex 布局 ⇒ 出现/消失完全不动其它元素的位置与大小。

      ⚠️ `pointer-events-none`：浮动后它可能压在指板底部（窄屏内容刚好放满时），
      若可点击就会**抢走品 格的点击**。提示语「点击退出全屏」说的是「点背景任意处即退出」
      （外层 onClick），本身不需要自己可点。
    */}
    {exitHintVisible && (
      <div
        data-exit-control=""
        className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[10000] rounded-full bg-background/70 px-3 py-1 text-sm text-muted-foreground backdrop-blur-sm whitespace-nowrap pointer-events-none"
      >
        {t('click_to_exit_fullscreen')}
      </div>
    )}
</div>
  )
})
