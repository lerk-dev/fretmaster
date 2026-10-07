// 找音练习控制面板：目标音符 / 琴弦多选 / 练习时长 / 练习建议 / 显示全部音符 / 答题模式切换 +
// 按钮答题模式的音名按钮（等音判定、计分、逐位置掌握度统计）
"use client"

import { memo } from 'react'
import { Clock, Eye, EyeOff, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { NOTES } from '@/lib/page-theory-data'
import { getNoteAtPosition, isEquivalentNote } from '@/lib/page-theory-functions'

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
}

/**
 * 找音练习控制面板（从 app/page.tsx 原样搬出，行为不变）。
含按钮答题模式的判定与计分逻辑（isEquivalentNote 等音判定、recordPositionStat 逐位置统计）。
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
}: PracticeModeControlsProps) {
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
              // 检查答案是否正确（使用 isEquivalentNote 处理等音，如 C♯ = D♭）
              if (highlightedTargetPosition) {
                const { stringIndex, fret } = highlightedTargetPosition
                const correctNote = getNoteAtPosition(stringIndex, fret)
                const isCorrect = isEquivalentNote(note, correctNote)

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

                // 延迟后生成新题目
                setTimeout(() => {
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
