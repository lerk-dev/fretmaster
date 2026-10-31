// 全屏练习覆盖层：按 tab 显示练习内容 + 下一题预览 + 可交互指板（按 ↑/↓ 显隐）
"use client"

import { memo } from 'react'
import { cn } from '@/lib/utils'
import { SCALE_MODES } from '@/lib/page-theory-data'
import { formatDegree, getChordDegrees, getChordDisplayName, getScaleDisplayName, normalizeNoteName } from '@/lib/page-theory-functions'
import { useAppStore, useIsPlaying, useUser, useChordSymbols } from '@/lib/store'
import { GuitarRunFretboard } from '@/components/guitarrun-fretboard'
import { PracticeFretboard } from '@/components/practice-fretboard'
import type { ThreeNpsPreviewKind } from '@/lib/fretboard-cell-role'
import { pickTabFretboardFlag } from '@/lib/tab-fretboard-toggle'
import { intervalDirectionSymbol, type IntervalDirection } from '@/lib/interval-direction'

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
  chordExerciseTargetChord,
  chordExerciseSequence,
  chordExerciseCurrentStep,
  nextChordExerciseInfo,
  scaleExerciseSequence,
  scaleExerciseCurrentStep,
  scaleKey,
  selectedScale,
  nextScaleExerciseInfo,
  currentIntervalExercise,
  intervalDirection,
  intervalExerciseQueue,
  intervalCurrentQueueIndex,
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
  className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center overflow-auto cursor-pointer"
  style={{ margin: 0, padding: 0, width: '100vw', height: '100vh', top: 0, left: 0, right: 0, bottom: 0 }}
  onClick={() => setFullscreenMode(false)}
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
    className="text-center p-8 w-full max-w-[400px] min-h-[300px] flex flex-col items-center justify-center cursor-default"
    onClick={(e) => e.stopPropagation()}
  >
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
        <div className="text-7xl font-bold text-primary">{getCurrentChordDisplay()}</div>
        <div className="flex flex-wrap justify-center gap-4">
          {(() => {
            const chords = transposedChords
            const currentChord = chords[currentChordIndex]
            if (!currentChord) return null
            const degrees = getChordDegrees(currentChord.type, practiceLevel, getLevelOptions())
            return degrees.map((degree, i) => (
              <span key={i} className="text-5xl font-bold text-primary">{formatDegree(degree)}</span>
            ))
          })()}
        </div>
        {/* 下一题预览*/}
        {(() => {
          const nextChord = getNextChordDisplay()
          if (!nextChord) return null
          const chordTypeName = getChordDisplayName(nextChord.type, chordScaleDisplay, chordSymbols)
          const displayName = `${normalizeNoteName(nextChord.root)}${chordTypeName === getChordDisplayName('Major', chordScaleDisplay, chordSymbols) ? '' : normalizeNoteName(chordTypeName)}${nextChord.bass ? '/' + normalizeNoteName(nextChord.bass) : ''}`
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
        <div className="text-7xl font-bold text-primary">
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
      <div className="space-y-6">
        <div className="text-6xl font-bold text-primary">{normalizeNoteName(scaleKey)} {getScaleDisplayName(selectedScale.name, chordScaleDisplay)}</div>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
          {scaleExerciseSequence.map((degree, i) => (
            <span 
              key={i} 
              className={cn(
                "text-4xl font-bold",
                i === scaleExerciseCurrentStep ? "text-primary" : "text-muted-foreground",
                i < scaleExerciseCurrentStep && "opacity-30"
              )}
            >
              {formatDegree(degree)}
            </span>
          ))}
        </div>
        {/* 下一题预览*/}
        {nextScaleExerciseInfo && (
          <div className="pt-6 mt-6 border-t border-border/30">
            <p className="text-sm text-muted-foreground mb-2">{t('next_chord')}</p>
            <div className="text-xl font-medium mb-1">
              {normalizeNoteName(nextScaleExerciseInfo.key)} {getScaleDisplayName(nextScaleExerciseInfo.scaleName, chordScaleDisplay)}
            </div>
            <div className="text-lg text-muted-foreground/70">
              {nextScaleExerciseInfo.sequence.map(formatDegree).join(' ')}
            </div>
          </div>
        )}
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
      className="w-full max-w-6xl mt-8 px-4 cursor-default"
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

    {/* 提示文字 */}
    <div className="mt-12 text-sm text-muted-foreground">
      {t('click_to_exit_fullscreen')}
    </div>
</div>
  )
})
