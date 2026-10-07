// 音程练习控制面板：根音/根音模式/选项开关组、时长与方向、自动推进与指板时长、音程多选
"use client"

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { INTERVALS, NOTES } from '@/lib/page-theory-data'
import { formatDegree } from '@/lib/page-theory-functions'

interface IntervalControlsProps {
  /** 翻译函数 */
  t: (key: string) => string
  /** 根音 */
  rootNote: string
  onRootNoteChange: (v: string) => void
  /** 根音模式 */
  intervalRootMode: "fixed" | "random"
  onIntervalRootModeChange: (v: "fixed" | "random") => void
  /** 先找根音 */
  findRootFirst: boolean
  onFindRootFirstChange: (v: boolean) => void
  /** 根音回到起点 */
  addRootBack: boolean
  onAddRootBackChange: (v: boolean) => void
  /** 显示指板 */
  showIntervalFretboard: boolean
  onShowIntervalFretboardChange: (v: boolean) => void
  /** 练习时长（分钟） */
  intervalPracticeDuration: number
  onIntervalPracticeDurationChange: (v: number) => void
  /** 音程方向 */
  intervalDirection: "up" | "down" | "random" | "either"
  onIntervalDirectionChange: (v: "up" | "down" | "random" | "either") => void
  /** 自动推进 */
  intervalAutoAdvance: boolean
  onIntervalAutoAdvanceChange: (v: boolean) => void
  /** 指板显示时长（秒） */
  intervalFretboardDuration: number
  onIntervalFretboardDurationChange: (v: number) => void
  /** 随机顺序 */
  intervalRandomizeOrder: boolean
  onIntervalRandomizeOrderChange: (v: boolean) => void
  /** 已选音程下标 */
  selectedIntervals: number[]
  onToggleInterval: (index: number) => void
  /** 练习进行中（未开始则显示提示） */
  isPlaying: boolean
}

/**
 * 音程练习控制面板（从 app/page.tsx 原样搬出，行为不变）。
 */
export const IntervalControls = memo(function IntervalControls({
  t,
  rootNote,
  onRootNoteChange,
  intervalRootMode,
  onIntervalRootModeChange,
  findRootFirst,
  onFindRootFirstChange,
  addRootBack,
  onAddRootBackChange,
  showIntervalFretboard,
  onShowIntervalFretboardChange,
  intervalPracticeDuration,
  onIntervalPracticeDurationChange,
  intervalDirection,
  onIntervalDirectionChange,
  intervalAutoAdvance,
  onIntervalAutoAdvanceChange,
  intervalFretboardDuration,
  onIntervalFretboardDurationChange,
  intervalRandomizeOrder,
  onIntervalRandomizeOrderChange,
  selectedIntervals,
  onToggleInterval,
  isPlaying,
}: IntervalControlsProps) {
  return (
<div className="space-y-2">
  {/* 第一行：基础设置 */}
  <div className="flex flex-wrap items-end gap-2">
    {/* 根音 */}
    <div className="space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('interval_root_note_label')}</div>
      <Select value={rootNote} onValueChange={onRootNoteChange} disabled={intervalRootMode === "random"}>
        <SelectTrigger className="w-[68px] h-8 text-xs px-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {NOTES.map(note => (
            <SelectItem key={note} value={note} className="text-xs">{note}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    {/* 根音模式 */}
    <div className="space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('interval_root_mode_label')}</div>
      <Select value={intervalRootMode} onValueChange={(v: "fixed" | "random") => onIntervalRootModeChange(v)}>
        <SelectTrigger className="w-[80px] sm:w-[92px] h-8 text-xs px-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="fixed" className="text-xs">{t('fixed_root')}</SelectItem>
          <SelectItem value="random" className="text-xs">{t('random_root')}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    {/* 选项开关组 */}
    <div className="space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">&nbsp;</div>
      <div className="flex items-center gap-2 h-8 px-2 bg-card/30 rounded-md border border-border/30">
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="findRootFirst"
            checked={findRootFirst}
            onCheckedChange={(c) => onFindRootFirstChange(c as boolean)}
            className="h-3.5 w-3.5"
          />
          <Label htmlFor="findRootFirst" className="text-xs cursor-pointer whitespace-nowrap">{t('find_root_first')}</Label>
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="addRootBack"
            checked={addRootBack}
            onCheckedChange={(c) => onAddRootBackChange(c as boolean)}
            className="h-3.5 w-3.5"
          />
          <Label htmlFor="addRootBack" className="text-xs cursor-pointer whitespace-nowrap">{t('add_root_back')}</Label>
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div className="flex items-center gap-1.5">
          <Switch
            id="showIntervalFretboard"
            checked={showIntervalFretboard}
            onCheckedChange={onShowIntervalFretboardChange}
            className="scale-90"
          />
          <Label htmlFor="showIntervalFretboard" className="text-xs cursor-pointer whitespace-nowrap">{t('show_fretboard')}</Label>
        </div>
      </div>
    </div>
  </div>

  {/* 第二行：高级设置 */}
  <div className="flex flex-wrap items-end gap-2">
    {/* 练习时长 */}
    <div className="space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('practice_duration')}</div>
      <Select value={String(intervalPracticeDuration)} onValueChange={(v) => onIntervalPracticeDurationChange(Number(v))}>
        <SelectTrigger className="w-[68px] h-8 text-xs px-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[1, 3, 5, 10, 15, 20].map(min => (
            <SelectItem key={min} value={String(min)} className="text-xs">{min}{t('minutes')}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    {/* 音程方向 - segmented */}
    <div className="space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('interval_direction')}</div>
      <div className="flex items-center bg-card/30 rounded-md border border-border/30 p-0.5 gap-0.5">
        {[
          { id: "up", label: t('direction_up') },
          { id: "down", label: t('direction_down') },
          { id: "either", label: t('direction_either') },
          { id: "random", label: t('direction_random') },
        ].map((dir) => (
          <Button
            key={dir.id}
            variant={intervalDirection === dir.id ? "default" : "ghost"}
            size="sm"
            onClick={() => onIntervalDirectionChange(dir.id as "up" | "down" | "random" | "either")}
            className="h-7 text-xs px-2.5"
          >
            {dir.label}
          </Button>
        ))}
      </div>
    </div>

    {/* 自动推进 + 指板时长 */}
    <div className="space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">&nbsp;</div>
      <div className="flex items-center gap-2 h-8 px-2 bg-card/30 rounded-md border border-border/30">
        <div className="flex items-center gap-1.5">
          <Switch
            id="intervalAutoAdvance"
            checked={intervalAutoAdvance}
            onCheckedChange={onIntervalAutoAdvanceChange}
            className="scale-90"
            disabled={!showIntervalFretboard}
          />
          <Label htmlFor="intervalAutoAdvance" className="text-xs cursor-pointer whitespace-nowrap">{t('auto_advance')}</Label>
        </div>
        {intervalAutoAdvance && showIntervalFretboard && (
          <>
            <Separator orientation="vertical" className="h-4" />
            <Select value={String(intervalFretboardDuration)} onValueChange={(v) => onIntervalFretboardDurationChange(Number(v))}>
              <SelectTrigger className="w-[52px] h-7 text-xs px-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 5, 7, 10].map(sec => (
                  <SelectItem key={sec} value={String(sec)} className="text-xs">{sec}s</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>
    </div>

    {/* 随机顺序 */}
    <div className="space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">&nbsp;</div>
      <div className="flex items-center gap-1.5 h-8 px-2 bg-card/30 rounded-md border border-border/30">
        <Switch
          id="intervalRandomizeOrder"
          checked={intervalRandomizeOrder}
          onCheckedChange={onIntervalRandomizeOrderChange}
          className="scale-90"
        />
        <Label htmlFor="intervalRandomizeOrder" className="text-xs cursor-pointer whitespace-nowrap">{t('randomize_order')}</Label>
      </div>
    </div>
  </div>

  {/* 音程选择 - segmented 多选 */}
  <div className="space-y-0.5">
    <div className="text-2xs text-muted-foreground leading-3">{t('select_intervals_label')}</div>
    <div className="flex flex-wrap items-center bg-card/30 rounded-md border border-border/30 p-0.5 gap-0.5 w-fit">
      {INTERVALS.map((interval, index) => (
        <Button
          key={interval.name}
          variant={selectedIntervals.includes(index) ? "default" : "ghost"}
          size="sm"
          onClick={() => onToggleInterval(index)}
          className="text-xs h-7 px-2 min-w-[36px]"
        >
          {formatDegree(interval.symbol)}
        </Button>
      ))}
    </div>
  </div>

  {/* 开始练习提示*/}
  {!isPlaying && (
    <div className="text-muted-foreground text-sm py-4">
      {t('click_start_to_begin')}
    </div>
  )}
</div>
  )
})
