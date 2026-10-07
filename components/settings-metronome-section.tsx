'use client'

// 设置面板的「节拍器」折叠段（从 app/page.tsx 抽出，内容未改动）

import { Activity } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

interface SettingsMetronomeSectionProps {
  t: (key: string) => string
  enabled: boolean
  onEnabledChange: (v: boolean) => void
  bpm: number
  /** Slider 回传的是数组，取首值 */
  onBpmChange: (v: number[]) => void
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
          min={40}
          max={240}
          step={1}
        />
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
