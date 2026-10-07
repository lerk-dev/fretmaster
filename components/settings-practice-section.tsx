'use client'

// 设置面板的「练习」折叠段（从 app/page.tsx 抽出，内容未改动）
// 含：乐器选择 / 练习时长 / 品格数 / 冷却时间 + 限制练习（品区、八度切换、弱点加权）

import { Layers, SlidersHorizontal } from 'lucide-react'
import type { InstrumentType } from '@/lib/practice-suggestions'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

interface SettingsPracticeSectionProps {
  t: (key: string) => string
  language: string
  instrument: InstrumentType
  onInstrumentChange: (v: InstrumentType) => void
  practiceTime: number
  /** Slider 回传数组，取首值 */
  onPracticeTimeChange: (v: number[]) => void
  fretCount: number
  onFretCountChange: (v: number[]) => void
  cooldownEnabled: boolean
  onCooldownEnabledChange: (v: boolean) => void
  cooldownDuration: number
  onCooldownDurationChange: (v: number[]) => void
  fretZoneEnabled: boolean
  onFretZoneEnabledChange: (v: boolean) => void
  fretZoneStart: number
  onFretZoneStartChange: (v: number) => void
  fretZoneSize: number
  onFretZoneSizeChange: (v: number) => void
  octaveShiftEnabled: boolean
  onOctaveShiftEnabledChange: (v: boolean) => void
  octaveShiftMode: 'up' | 'down' | 'random'
  onOctaveShiftModeChange: (v: 'up' | 'down' | 'random') => void
  weaknessWeightedEnabled: boolean
  onWeaknessWeightedEnabledChange: (v: boolean) => void
}

export function SettingsPracticeSection({
  t,
  language,
  instrument,
  onInstrumentChange,
  practiceTime,
  onPracticeTimeChange,
  fretCount,
  onFretCountChange,
  cooldownEnabled,
  onCooldownEnabledChange,
  cooldownDuration,
  onCooldownDurationChange,
  fretZoneEnabled,
  onFretZoneEnabledChange,
  fretZoneStart,
  onFretZoneStartChange,
  fretZoneSize,
  onFretZoneSizeChange,
  octaveShiftEnabled,
  onOctaveShiftEnabledChange,
  octaveShiftMode,
  onOctaveShiftModeChange,
  weaknessWeightedEnabled,
  onWeaknessWeightedEnabledChange,
}: SettingsPracticeSectionProps) {
  /** 品区起始的最大值（品区不得越过指板末端） */
  const fretZoneStartMax = Math.max(0, fretCount - fretZoneSize)

  return (
    <AccordionItem value="practice" className="border-b-0">
      <AccordionTrigger className="py-2 text-sm font-medium flex items-center gap-2 hover:no-underline">
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          {t('settings_practice')}
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-3 pb-2">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t('instrument_select')}</span>
          <Select
            value={instrument}
            onValueChange={(v) => onInstrumentChange(v as InstrumentType)}
          >
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="six_string_guitar">{t('instrument_guitar_6')}</SelectItem>
              <SelectItem value="six_string_fourths">{t('instrument_guitar_6_fourths')}</SelectItem>
              <SelectItem value="seven_string_guitar">{t('instrument_guitar_7')}</SelectItem>
              <SelectItem value="seven_string_fourths">{t('instrument_guitar_7_fourths')}</SelectItem>
              <SelectItem value="four_string_bass">{t('instrument_bass_4')}</SelectItem>
              <SelectItem value="five_string_bass">{t('instrument_bass_5')}</SelectItem>
              <SelectItem value="b_flat_horn">{t('instrument_horn_bflat')}</SelectItem>
              <SelectItem value="e_flat_horn">{t('instrument_horn_eflat')}</SelectItem>
              <SelectItem value="concert_pitch">{t('instrument_concert')}</SelectItem>
              <SelectItem value="concert_pitch_minus_one">{t('instrument_concert_minus_one')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('practice_time')}</span>
          <span className="font-mono">{practiceTime}s</span>
        </div>
        <Slider
          value={[practiceTime]}
          onValueChange={onPracticeTimeChange}
          min={30}
          max={600}
          step={30}
        />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('fretboard_title')}</span>
          <span className="font-mono">{fretCount} frets</span>
        </div>
        <Slider
          value={[fretCount]}
          onValueChange={onFretCountChange}
          min={12}
          max={24}
          step={1}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{t('device_cooldown_enabled')}</span>
        <Switch checked={cooldownEnabled} onCheckedChange={onCooldownEnabledChange} />
      </div>
      {cooldownEnabled && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('device_cooldown_duration')}</span>
            <span className="font-mono">{cooldownDuration}ms</span>
          </div>
          <Slider
            value={[cooldownDuration]}
            onValueChange={onCooldownDurationChange}
            min={200}
            max={3000}
            step={100}
          />
        </div>
      )}

    <Separator className="my-1" />
    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
      <Layers className="h-3.5 w-3.5" />
      {t('limitation_exercises')}
    </div>
    <p className="text-xs text-muted-foreground">
      {language === 'zh-CN'
        ? '限制练习是 SOLO 教学法中的核心训练方式，通过约束演奏区域、方向或八度，强化指板熟悉度与即兴能力。'
        : 'Limitation Exercises are core training methods in the SOLO pedagogy. By constraining fretting region, direction, or octave, they strengthen fretboard familiarity and improvisation skills.'}
    </p>

    {/* 5 品区限制 */}
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{t('limit_fret_zone')}</span>
      <Switch checked={fretZoneEnabled} onCheckedChange={onFretZoneEnabledChange} />
    </div>
    {fretZoneEnabled && (
      <>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('limit_fret_zone_start')}</span>
            <span className="font-mono">{fretZoneStart}</span>
          </div>
          {/* 品区起始的最大值：品区必须落在指板内 ⇒ start ≤ fretCount - size。
              当品区覆盖整个指板（size === fretCount）时上界退化为 0，start 只能是 0、
              没有可选空间。此时**不能渲染 Slider** —— min === max 会让 radix 内部
              `(value - min) / (max - min)` 变成 0/0 = NaN，生成非法 CSS：
              严格 CSS 解析环境（如测试用的 jsdom/css-tree）直接抛错、整棵子树崩，
              浏览器里也只会得到一个位置异常的滑块。 */}
          {fretZoneStartMax > 0 && (
            <Slider
              value={[fretZoneStart]}
              onValueChange={(v) => onFretZoneStartChange(v[0])}
              min={0}
              max={fretZoneStartMax}
              step={1}
            />
          )}
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('limit_fret_zone_size')}</span>
            <span className="font-mono">{fretZoneSize}</span>
          </div>
          <Slider
            value={[fretZoneSize]}
            onValueChange={(v) => onFretZoneSizeChange(v[0])}
            min={2}
            max={fretCount}
            step={1}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {language === 'zh-CN'
            ? `当前品区：${fretZoneStart} - ${fretZoneStart + fretZoneSize - 1} 品`
            : `Current zone: frets ${fretZoneStart} - ${fretZoneStart + fretZoneSize - 1}`}
        </p>
      </>
    )}

    {/* 八度切换 */}
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{t('limit_octave_shift')}</span>
      <Switch checked={octaveShiftEnabled} onCheckedChange={onOctaveShiftEnabledChange} />
    </div>
    {octaveShiftEnabled && (
      <div className="space-y-1.5">
        <div className="text-2xs text-muted-foreground leading-3">{t('limit_octave_mode')}</div>
        <div className="flex items-center bg-card/30 rounded-md border border-border/30 p-0.5 gap-0.5">
          {[
            { id: 'up', label: t('direction_up') },
            { id: 'down', label: t('direction_down') },
            { id: 'random', label: t('direction_random') },
          ].map((mode) => (
            <Button
              key={mode.id}
              variant={octaveShiftMode === mode.id ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onOctaveShiftModeChange(mode.id as 'up' | 'down' | 'random')}
              className="h-7 text-xs px-2.5 flex-1"
            >
              {mode.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {language === 'zh-CN'
            ? '在同弦上等价八度位置间切换，扩展对指板不同区域的熟悉度。'
            : 'Shift between equivalent octave positions on the same string to expand fretboard familiarity.'}
        </p>
      </div>
    )}

    {/* 弱点加权出题 */}
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{t('weakness_weighted')}</span>
      <Switch checked={weaknessWeightedEnabled} onCheckedChange={onWeaknessWeightedEnabledChange} />
    </div>
    {weaknessWeightedEnabled && (
      <p className="text-xs text-muted-foreground">{t('weakness_weighted_desc')}</p>
    )}
      </AccordionContent>
    </AccordionItem>
  )
}
