'use client'

// 设置面板的「节拍器」折叠段（从 app/page.tsx 抽出，内容未改动）

import { Activity } from 'lucide-react'
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
// BPM 合法区间与 store 的钳制逻辑同源 —— 别在这里写死 40/240，
// 否则改一处漏一处会让「滑块范围」与「实际钳制范围」分叉。
// 拍号同理：选项必须来自 store 的白名单常量（见其注释）。
import { METRONOME_BEATS_OPTIONS, METRONOME_BPM_MAX, METRONOME_BPM_MIN } from '@/lib/store'

interface SettingsMetronomeSectionProps {
  t: (key: string) => string
  enabled: boolean
  onEnabledChange: (v: boolean) => void
  bpm: number
  /** Slider 回传的是数组，取首值 */
  onBpmChange: (v: number[]) => void
  /** 拍号：每小节几拍（决定重音与可视化圆点数） */
  beatsPerMeasure: number
  onBeatsPerMeasureChange: (v: number) => void
  sound: boolean
  onSoundChange: (v: boolean) => void
  flash: boolean
  onFlashChange: (v: boolean) => void
  visualize: boolean
  onVisualizeChange: (v: boolean) => void
}

export function SettingsMetronomeSection({
  t,
  enabled,
  onEnabledChange,
  bpm,
  onBpmChange,
  beatsPerMeasure,
  onBeatsPerMeasureChange,
  sound,
  onSoundChange,
  flash,
  onFlashChange,
  visualize,
  onVisualizeChange,
}: SettingsMetronomeSectionProps) {
  return (
    <AccordionItem value="metronome" className="border-b-0">
      <AccordionTrigger className="py-2 text-sm font-medium flex items-center gap-2 hover:no-underline">
        <span className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          {t('device_metronome')}
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-3 pb-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground" id="metronome-toggle-label">{t('device_metronome')}</span>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} aria-labelledby="metronome-toggle-label" />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('device_tempo')}</span>
          <span className="font-mono">{bpm} BPM</span>
        </div>
        <Slider
          value={[bpm]}
          onValueChange={onBpmChange}
          min={METRONOME_BPM_MIN}
          max={METRONOME_BPM_MAX}
          step={1}
        />
      </div>
      {/* 拍号（#14）：决定重音落在哪一拍、可视化画几个圆点。
          选项来自 store 的白名单常量 —— 别在这里另写一份列表，
          否则「下拉能选的」与「store 校验认的」会分叉。 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground" id="metronome-beats-label">{t('metronome_beats')}</span>
        <Select value={String(beatsPerMeasure)} onValueChange={(v) => onBeatsPerMeasureChange(Number(v))}>
          <SelectTrigger className="h-8 w-[76px] text-xs" aria-labelledby="metronome-beats-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METRONOME_BEATS_OPTIONS.map((b) => (
              <SelectItem key={b} value={String(b)} className="text-xs">
                {b}/4
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{t('metronome_sound')}</span>
        <Switch checked={sound} onCheckedChange={onSoundChange} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{t('metronome_flash')}</span>
        <Switch checked={flash} onCheckedChange={onFlashChange} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{t('metronome_visualize')}</span>
        <Switch checked={visualize} onCheckedChange={onVisualizeChange} />
      </div>
      </AccordionContent>
    </AccordionItem>
  )
}
