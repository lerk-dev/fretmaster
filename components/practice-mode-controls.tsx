// 找音练习控制面板：目标音符 / 琴弦多选 / 练习时长 / 练习建议 / 显示全部音符 / 答题模式切换 +
// 按钮答题模式的音名按钮（等音判定、计分、逐位置掌握度统计）
"use client"

import { memo, useEffect, useRef } from 'react'
import { Clock, Eye, EyeOff, Settings, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { NOTES } from '@/lib/page-theory-data'
import { getNoteAtPosition } from '@/lib/page-theory-functions'
import {
  buildSingleTargetExpectation,
  judgeExpectation,
  noteNameToPitchClass,
} from '@/lib/answer-judge'

/** 单音全指板：位置提示方式（无提示 / 精确到弦品） */
export type SingleNotePromptMode = 'none' | 'exact'

/** 单音全指板的配置快照（父组件持有状态，这里只负责渲染） */
export interface SingleNoteConfig {
  enabled: boolean
  /** 固定目标音名 */
  note: string
  /** 一轮结束后自动换下一个音 */
  randomNote: boolean
  /** 一轮结束后按 C→C♯→…→B 顺序换下一个音（与 randomNote 互斥） */
  cycle: boolean
  /** 位置提示方式 */
  prompt: SingleNotePromptMode
  /** 一轮需要命中的次数（'all' = 当前指板品数内该音的全部位置） */
  quota: number | 'all'
  /** 是否画连线 */
  showLines: boolean
  /** 本轮已命中次数 */
  done: number
  /** 本轮总次数 */
  total: number
  /** 还有可提示的位置（false = 本轮已无可跳过的目标） */
  canSkip: boolean
  /** 最近一次命中的八度（E2 / E3 …），null = 不显示；seq 用于连续同八度重新播动画 */
  lastHit: { octave: number; seq: number } | null
}

interface PracticeModeControlsProps {
  /** 翻译函数 */
  t: (key: string) => string
  /** 答题模式 */
  practiceAnswerMode: "fretboard" | "buttons"
  onPracticeAnswerModeChange: (v: "fretboard" | "buttons") => void
  /** 按变音号偏好格式化音名 */
  formatNoteByAccidentalSetting: (note: string) => string
  /** 当前目标音符 */
  targetNote: string
  /** 琴弦数 */
  stringCount: number
  /** 已选琴弦（1 起） */
  selectedStrings: number[]
  onSelectedStringsChange: (updater: (prev: number[]) => number[]) => void
  /** 找音练习时长（分钟） */
  pitchFindingTime: number
  onPitchFindingTimeChange: (v: number) => void
  /** 显示练习建议 */
  showPracticeSuggestions: boolean
  onShowPracticeSuggestionsChange: (v: boolean) => void
  /** 显示全部音符 */
  showAllNotes: boolean
  onShowAllNotesChange: (updater: (prev: boolean) => boolean) => void
  /** 练习进行中 */
  isPlaying: boolean
  onIsPlayingChange: (v: boolean) => void
  /** 练习总时长（秒），切换答题模式时用于重置剩余时间 */
  practiceTime: number
  /** 剩余时间（秒） */
  timeLeft: number
  onTimeLeftChange: (v: number) => void
  /** 当前高亮的目标位置 */
  highlightedTargetPosition: { stringIndex: number; fret: number } | null
  /** 设置高亮反馈（key=stringIndex-fret，value=是否正确） */
  onHighlightedFretsChange: (m: Map<string, boolean>) => void
  onHighlightedTargetPositionChange: (v: { stringIndex: number; fret: number } | null) => void
  onScoreChange: (updater: (prev: { correct: number; total: number }) => { correct: number; total: number }) => void
  /** 记录逐位置掌握度 */
  recordPositionStat: (isCorrect: boolean) => void
  /** 生成下一题 */
  generateNewTarget: () => void
  formatTime: (seconds: number) => string
  /** 练习建议文案（空串表示无） */
  currentPracticeSuggestion: string
  /** 单音全指板配置（省略 = 不渲染该分区） */
  singleNote?: SingleNoteConfig
  /** 单音全指板配置变更（只传变化的字段） */
  onSingleNoteChange?: (patch: Partial<Omit<SingleNoteConfig, 'done' | 'total' | 'zoneStart' | 'canSkip' | 'lastHit'>>) => void
  /** 单音全指板：跳过当前提示位置 */
  onSingleNoteSkip?: () => void
}

/**
 * 找音练习控制面板（从 app/page.tsx 原样搬出，行为不变）。
含按钮答题模式的判定与计分逻辑（等音判定走 `lib/answer-judge.ts` 真相源、recordPositionStat 逐位置统计）。
 */
export const PracticeModeControls = memo(function PracticeModeControls({
  t,
  practiceAnswerMode,
  onPracticeAnswerModeChange,
  formatNoteByAccidentalSetting,
  targetNote,
  stringCount,
  selectedStrings,
  onSelectedStringsChange,
  pitchFindingTime,
  onPitchFindingTimeChange,
  showPracticeSuggestions,
  onShowPracticeSuggestionsChange,
  showAllNotes,
  onShowAllNotesChange,
  isPlaying,
  onIsPlayingChange,
  practiceTime,
  timeLeft,
  onTimeLeftChange,
  highlightedTargetPosition,
  onHighlightedFretsChange,
  onHighlightedTargetPositionChange,
  onScoreChange,
  recordPositionStat,
  generateNewTarget,
  formatTime,
  currentPracticeSuggestion,
  singleNote,
  onSingleNoteChange,
  onSingleNoteSkip,
}: PracticeModeControlsProps) {
  // 答完一题后「延迟 800ms 再出下一题」的定时器 handle。
  // 🚨 必须持有并在卸载时清掉：用户答完立刻切 tab / 结束练习的话，800ms 之后
  // `generateNewTarget()` 照样跑一次 —— 在已卸载的组件上触发换题，
  // 界面上表现为「刚切到别的模式、题目自己跳了一个」，而且无从归因。
  const nextTargetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (nextTargetTimer.current !== null) {
        clearTimeout(nextTargetTimer.current)
        nextTargetTimer.current = null
      }
    },
    []
  )

  // 一题一答锁：作答后到下一题到达前，忽略重复点击。
  // 🚨 此前「连点不叠加」只挡了定时器叠加（先清上一个 setTimeout），**没挡计分叠加** ——
  // 800ms 换题窗口内再点一次，onScoreChange / recordPositionStat 会为同一题再记一次，
  // 分数与逐位置掌握度都被灌水。answeredRef 在目标位置变化（= 新题目）时复位解锁。
  const answeredRef = useRef(false)
  useEffect(() => {
    answeredRef.current = false
  }, [highlightedTargetPosition])

  return (
<div className="space-y-2">
  <div className="flex flex-wrap items-end gap-2">
    {/* 目标音符 - 仅在指板点击模式下显示*/}
    {practiceAnswerMode === "fretboard" && (
      <div className="flex items-center gap-2 px-3 h-16 bg-primary/5 rounded-md border border-primary/20 min-w-[110px] sm:min-w-[130px]">
        <Target className="h-5 w-5 text-primary shrink-0" />
        <div className="min-w-0">
          <div className="text-2xs text-muted-foreground leading-3">{t('target_note')}</div>
          <div className="text-2xl sm:text-3xl font-bold text-primary leading-tight truncate">{formatNoteByAccidentalSetting(targetNote)}</div>
        </div>
      </div>
    )}

    {/* 琴弦选择 - segmented */}
    <div className="space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('select_strings')}</div>
      <div className="flex items-center bg-card/30 rounded-md border border-border/30 p-0.5 gap-0.5">
        {Array.from({ length: stringCount }, (_, i) => i + 1).map((stringNum) => (
          <Button
            key={stringNum}
            variant={selectedStrings.includes(stringNum) ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              if (selectedStrings.includes(stringNum)) {
                // 至少保留一根弦
                if (selectedStrings.length > 1) {
                  onSelectedStringsChange(prev => prev.filter(s => s !== stringNum))
                }
              } else {
                onSelectedStringsChange(prev => [...prev, stringNum].sort((a, b) => a - b))
              }
            }}
            className="h-7 w-7 p-0 text-xs"
          >
            {stringNum}
          </Button>
        ))}
      </div>
    </div>

    {/* 练习时长选择 */}
    <div className="space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('pitch_finding_practice_time')}</div>
      <Select value={String(pitchFindingTime)} onValueChange={(v) => onPitchFindingTimeChange(Number(v))}>
        <SelectTrigger className="w-[68px] sm:w-[80px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">{t('pitch_finding_1_minute')}</SelectItem>
          <SelectItem value="2">{t('pitch_finding_2_minutes')}</SelectItem>
          <SelectItem value="3">{t('pitch_finding_3_minutes')}</SelectItem>
          <SelectItem value="5">{t('pitch_finding_5_minutes')}</SelectItem>
          <SelectItem value="10">{t('pitch_finding_10_minutes')}</SelectItem>
          <SelectItem value="15">{t('pitch_finding_15_minutes')}</SelectItem>
          <SelectItem value="30">{t('pitch_finding_30_minutes')}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    {/* 练习建议开关 */}
    <div className="space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">&nbsp;</div>
      <div className="flex items-center gap-1.5 h-8 px-2 bg-card/30 rounded-md border border-border/30">
        <Label className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">{t('pitch_finding_show_suggestions')}</Label>
        <Switch
          checked={showPracticeSuggestions}
          onCheckedChange={onShowPracticeSuggestionsChange}
          className="scale-90"
        />
      </div>
    </div>

    {/* 显示/隐藏所有音符 */}
    <div className="space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">&nbsp;</div>
      <Button variant="outline" size="sm" onClick={() => onShowAllNotesChange(prev => !prev)} className="h-8 px-2 text-xs">
        {showAllNotes ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
        <span>{showAllNotes ? t('hide_notes') : t('show_all_notes')}</span>
      </Button>
    </div>

    {/* 单音全指板：行内只留开关 + 齿轮，详细设置收进浮层（否则这一排会被挤成三行） */}
    {singleNote && onSingleNoteChange && (
      <div className="space-y-0.5">
        <div className="text-2xs text-muted-foreground leading-3">&nbsp;</div>
        <div className="flex items-center gap-1.5 h-8 px-2 bg-card/30 rounded-md border border-border/30">
          <Label htmlFor="single-note-toggle" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
            {t('single_note_mode')}
          </Label>
          <Switch
            id="single-note-toggle"
            checked={singleNote.enabled}
            onCheckedChange={(v) => onSingleNoteChange({ enabled: v })}
            className="scale-90"
          />
          {singleNote.enabled && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 -mr-1 text-muted-foreground"
                  aria-label={t('single_note_settings')}
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(94vw,540px)] p-2 space-y-1.5">
                <div className="flex flex-wrap items-end gap-2">
                  {/* 目标音 + 一轮后随机换音 / 自动循环 */}
                  <div className="space-y-0.5">
                    <div className="text-2xs text-muted-foreground leading-3">{t('single_note_target')}</div>
                    <div className="flex items-center gap-1.5">
                      <Select
                        value={singleNote.note}
                        onValueChange={(v) => onSingleNoteChange({ note: v })}
                        disabled={singleNote.randomNote || singleNote.cycle}
                      >
                        <SelectTrigger className="w-[68px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NOTES.map((n) => (
                            <SelectItem key={n} value={n}>
                              {formatNoteByAccidentalSetting(n)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Label htmlFor="single-note-random" className="text-2xs text-muted-foreground whitespace-nowrap cursor-pointer">
                        {t('single_note_random')}
                      </Label>
                      <Switch
                        id="single-note-random"
                        checked={singleNote.randomNote}
                        onCheckedChange={(v) => onSingleNoteChange({ randomNote: v })}
                        className="scale-90"
                      />
                      <Label htmlFor="single-note-cycle" className="text-2xs text-muted-foreground whitespace-nowrap cursor-pointer">
                        {t('single_note_cycle')}
                      </Label>
                      <Switch
                        id="single-note-cycle"
                        checked={singleNote.cycle}
                        onCheckedChange={(v) => onSingleNoteChange({ cycle: v })}
                        className="scale-90"
                      />
                    </div>
                  </div>

                  {/* 位置提示 */}
                  <div className="space-y-0.5">
                    <div className="text-2xs text-muted-foreground leading-3">{t('single_note_prompt')}</div>
                    <div className="flex items-center bg-card/30 rounded-md border border-border/30 p-0.5 gap-0.5">
                      <Button
                        variant={singleNote.prompt === 'none' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => onSingleNoteChange({ prompt: 'none' })}
                        className="h-7 px-2 text-xs"
                      >
                        {t('single_note_prompt_none')}
                      </Button>
                      <Button
                        variant={singleNote.prompt === 'exact' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => onSingleNoteChange({ prompt: 'exact' })}
                        className="h-7 px-2 text-xs"
                      >
                        {t('single_note_prompt_exact')}
                      </Button>
                    </div>
                  </div>

                  {/* 一轮次数 */}
                  <div className="space-y-0.5">
                    <div className="text-2xs text-muted-foreground leading-3">{t('single_note_quota')}</div>
                    <div className="flex items-center bg-card/30 rounded-md border border-border/30 p-0.5 gap-0.5">
                      {[6, 12, 'all'].map((q) => (
                        <Button
                          key={String(q)}
                          variant={singleNote.quota === q ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => onSingleNoteChange({ quota: q as number | 'all' })}
                          className="h-7 px-2 text-xs"
                        >
                          {q === 'all' ? t('single_note_quota_all') : String(q)}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* 连线 */}
                  <div className="space-y-0.5">
                    <div className="text-2xs text-muted-foreground leading-3">&nbsp;</div>
                    <div className="flex items-center gap-1.5 h-8 px-2 bg-card/30 rounded-md border border-border/30">
                      <Label htmlFor="single-note-lines" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
                        {t('single_note_lines')}
                      </Label>
                      <Switch
                        id="single-note-lines"
                        checked={singleNote.showLines}
                        onCheckedChange={(v) => onSingleNoteChange({ showLines: v })}
                        className="scale-90"
                      />
                    </div>
                  </div>

                  {/* 进度 + 跳过（缺角 / 超出舒适把位时放弃当前提示位置） */}
                  <div className="space-y-0.5">
                    <div className="text-2xs text-muted-foreground leading-3">{t('single_note_progress')}</div>
                    <div className="flex items-center gap-1">
                      <div className="flex items-center h-8 px-2 rounded-md border border-primary/20 bg-primary/5 text-xs font-medium text-primary tabular-nums">
                        {singleNote.done} / {singleNote.total}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onSingleNoteSkip?.()}
                        disabled={!singleNote.canSkip}
                        className="h-8 px-2 text-xs"
                      >
                        {t('single_note_skip')}
                      </Button>
                      {/* 命中后短暂显示八度：把「同音不同八度」这件事显式打出来 */}
                      {singleNote.lastHit && (
                        <span
                          key={singleNote.lastHit.seq}
                          className="text-xs font-semibold text-accent tabular-nums px-1.5 py-0.5 rounded bg-accent/10 score-pop"
                        >
                          {formatNoteByAccidentalSetting(singleNote.note)}
                          {singleNote.lastHit.octave}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 麦克风只能拿音名、拿不到位置：精确提示只是引导，避免用户误以为「弹别处会判错」 */}
                {singleNote.prompt === 'exact' && (
                  <div className="text-2xs text-muted-foreground leading-tight">{t('single_note_mic_hint')}</div>
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    )}

    {/* 答题模式切换 - segmented */}
    <div className="space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('answer_mode')}</div>
      <div className="flex items-center bg-card/30 rounded-md border border-border/30 p-0.5 gap-0.5">
        <Button
          variant={practiceAnswerMode === "fretboard" ? "default" : "ghost"}
          size="sm"
          onClick={() => {
            // 如果正在练习中，先停止练习
            if (isPlaying) {
              onIsPlayingChange(false)
              onTimeLeftChange(practiceTime)
              onHighlightedFretsChange(new Map())
              onHighlightedTargetPositionChange(null)
            }
            onPracticeAnswerModeChange("fretboard")
          }}
          className="h-7 px-2.5 text-xs"
        >
          {t('practice_mode_find')}
        </Button>
        <Button
          variant={practiceAnswerMode === "buttons" ? "default" : "ghost"}
          size="sm"
          onClick={() => {
            // 如果正在练习中，先停止练习
            if (isPlaying) {
              onIsPlayingChange(false)
              onTimeLeftChange(practiceTime)
              onHighlightedFretsChange(new Map())
              onHighlightedTargetPositionChange(null)
            }
            onPracticeAnswerModeChange("buttons")
          }}
          className="h-7 px-2.5 text-xs"
        >
          {t('practice_mode_identify')}
        </Button>
      </div>
    </div>
  </div>


  {/* 按钮答题模式：显示音名按钮*/}
  {practiceAnswerMode === "buttons" && isPlaying && (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">{t('practice_mode_description_identify')}</div>
      <div className="flex flex-wrap gap-2">
        {NOTES.map((note) => (
          <Button
            key={note}
            variant="outline"
            size="sm"
            onClick={() => {
              // 检查答案是否正确 —— 走 `lib/answer-judge.ts` 唯一真相源（半音比对，
              // 天然处理等音，如 C♯ = D♭）。这里原用 `isEquivalentNote` 自算一份，
              // 是全仓第五处「答对判定」实现。
              if (highlightedTargetPosition) {
                // 一题只判一次：800ms 换题窗口内的连点直接忽略（防重复计分，见 answeredRef）
                if (answeredRef.current) return
                answeredRef.current = true
                const { stringIndex, fret } = highlightedTargetPosition
                const correctNote = getNoteAtPosition(stringIndex, fret)
                const correctIdx = noteNameToPitchClass(correctNote)
                const clickedIdx = noteNameToPitchClass(note)
                const isCorrect =
                  correctIdx >= 0 &&
                  clickedIdx >= 0 &&
                  judgeExpectation(
                    buildSingleTargetExpectation({ label: correctNote, targetSemitone: correctIdx }),
                    clickedIdx,
                  ).hit

                // 显示反馈
                onHighlightedFretsChange(new Map([[`${stringIndex}-${fret}`, isCorrect]]))

                // 更新分数
                onScoreChange(prev => ({
                  correct: prev.correct + (isCorrect ? 1 : 0),
                  total: prev.total + 1
                }))

                // 逐位置掌握度统计（buttons 路径：直接记录目标位置）
                recordPositionStat(isCorrect)

                // 音高识别统计改为按会话记录，不在此处累加 —— 见 pitchFindingSession 统计 effect

                // 延迟后生成新题目（连点时不叠加：先清掉上一题挂着的那个）
                if (nextTargetTimer.current !== null) clearTimeout(nextTargetTimer.current)
                nextTargetTimer.current = setTimeout(() => {
                  nextTargetTimer.current = null
                  onHighlightedFretsChange(new Map())
                  generateNewTarget()
                }, 800)
              }
            }}
            className="h-10 w-10 text-sm font-semibold"
          >
            {formatNoteByAccidentalSetting(note)}
          </Button>
        ))}
      </div>
    </div>
  )}
  
  {/* 显示剩余时间 */}
  {isPlaying && (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Clock className="h-4 w-4" />
      <span>{t('time_remaining')}: {formatTime(timeLeft)}</span>
    </div>
  )}
  
  {/* 显示练习建议（专注模式「隐藏干扰元素」时随 .focus-clean 收起） */}
  {isPlaying && currentPracticeSuggestion && (
    <div data-focus-distraction className="p-2 bg-card/50 rounded-lg border border-border/30">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-primary">{t('practice_suggestion_title')}:</span> {currentPracticeSuggestion}
      </p>
    </div>
  )}
</div>
  )
})
