"use client"

import { memo } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { CHORD_TYPES, NOTES } from '@/lib/page-theory-data'
import { getChordDisplayName } from '@/lib/page-theory-functions'
import { ALL_PRACTICE_LEVELS } from '@/lib/practice-levels'
import { translateOr } from '@/lib/i18n'

interface ChordExerciseControlsProps {
  t: (key: string) => string
  language: string
  /** 根音（'random' 表示随机） */
  root: string
  onRootChange: (v: string) => void
  /** 练习等级 id */
  level: string
  onOpenLevelSelector: () => void
  /** 低音音符选择 */
  bass: string
  onBassChange: (v: string) => void
  /** 演奏顺序 */
  chordOrder: 'asc' | 'desc' | 'random'
  onChordOrderChange: (v: 'asc' | 'desc' | 'random') => void
  showFretboard: boolean
  onShowFretboardChange: (v: boolean) => void
  showKeyboard: boolean
  onShowKeyboardChange: (v: boolean) => void
  showStructure: boolean
  onShowStructureChange: (v: boolean) => void
  /** 已选和弦类型名 */
  selectedTypes: string[]
  onSelectedTypesChange: (v: string[]) => void
}

/**
 * 和弦练习控制面板（从 app/page.tsx 原样搬出，行为不变）。
 */
export const ChordExerciseControls = memo(function ChordExerciseControls({
  t,
  language,
  root,
  onRootChange,
  level,
  onOpenLevelSelector,
  bass,
  onBassChange,
  chordOrder,
  onChordOrderChange,
  showFretboard,
  onShowFretboardChange,
  showKeyboard,
  onShowKeyboardChange,
  showStructure,
  onShowStructureChange,
  selectedTypes,
  onSelectedTypesChange,
}: ChordExerciseControlsProps) {
  return (
    <div 
      data-onboarding="chord-exercise"
      className="space-y-2"
    >
      {/* 第一行：基础设置 */}
      <div className="flex flex-wrap items-end gap-2">
        {/* 根音选择 */}
        <div className="w-[72px] sm:w-[80px] space-y-0.5">
          <div className="text-2xs text-muted-foreground leading-3">{t('chord_root_note')}</div>
          <Select value={root} onValueChange={onRootChange}>
            <SelectTrigger className="h-8 text-xs px-2 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="random" className="text-xs">{t('random')}</SelectItem>
              {NOTES.map(note => (
                <SelectItem key={note} value={note} className="text-xs">{note}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 练习模式 */}
        <div className="w-[130px] sm:w-[150px] space-y-0.5">
          <div className="text-2xs text-muted-foreground leading-3">{t('practice_level')}</div>
          <Button
            variant="outline"
            className="h-8 text-xs w-full justify-between px-2"
            onClick={() => onOpenLevelSelector()}
          >
            <span className="truncate">
              {translateOr(t, ALL_PRACTICE_LEVELS.find(l => l.id === level)?.nameKey ?? '', level)}
            </span>
            <ChevronRight className="h-3 w-3 ml-1 shrink-0" />
          </Button>
        </div>

        {/* 低音音符选择 */}
        <div className="w-[80px] sm:w-[88px] space-y-0.5">
          <div className="text-2xs text-muted-foreground leading-3">{t('chord_bass_note')}</div>
          <Select value={bass} onValueChange={onBassChange}>
            <SelectTrigger className="h-8 text-xs px-2 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="root" className="text-xs">{t('chord_bass_root')}</SelectItem>
              <SelectItem value="3rd" className="text-xs">{t('chord_bass_3rd')}</SelectItem>
              <SelectItem value="5th" className="text-xs">{t('chord_bass_5th')}</SelectItem>
              <SelectItem value="7th" className="text-xs">{t('chord_bass_7th')}</SelectItem>
              <SelectItem value="random" className="text-xs">{t('chord_bass_random')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 演奏顺序 - segmented */}
        <div className="w-[150px] sm:w-[168px] space-y-0.5">
          <div className="text-2xs text-muted-foreground leading-3">{t('chord_order')}</div>
          <div className="flex items-center bg-card/30 rounded-md border border-border/30 p-0.5 gap-0.5">
            {[
              { id: "asc", label: t('order_ascending') },
              { id: "desc", label: t('order_descending') },
              { id: "random", label: t('order_random') },
            ].map((order) => (
              <Button
                key={order.id}
                variant={chordOrder === order.id ? "default" : "ghost"}
                size="sm"
                onClick={() => onChordOrderChange(order.id as "asc" | "desc" | "random")}
                className="h-7 text-xs flex-1 px-1"
              >
                {order.label}
              </Button>
            ))}
          </div>
        </div>

        {/* 显示选项开关组 */}
        <div className="space-y-0.5">
          <div className="text-2xs text-muted-foreground leading-3">{t('display_options')}</div>
          <div className="flex items-center gap-1.5 h-8 px-2 bg-card/30 rounded-md border border-border/30">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="showFretboard" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">{t('fretboard')}</Label>
              <Switch
                id="showFretboard"
                checked={showFretboard}
                onCheckedChange={onShowFretboardChange}
                className="scale-90"
              />
            </div>
            <Separator orientation="vertical" className="h-4" />
            <div className="flex items-center gap-1.5">
              <Label htmlFor="showKeyboard" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">{t('keyboard')}</Label>
              <Switch
                id="showKeyboard"
                checked={showKeyboard}
                onCheckedChange={onShowKeyboardChange}
                className="scale-90"
              />
            </div>
            <Separator orientation="vertical" className="h-4" />
            <div className="flex items-center gap-1.5">
              <Label htmlFor="showStructure" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">{t('structure')}</Label>
              <Switch
                id="showStructure"
                checked={showStructure}
                onCheckedChange={onShowStructureChange}
                className="scale-90"
              />
            </div>
          </div>
        </div>

      </div>

      {/* 第二行：和弦类型选择 - 按分组显示 */}
      <div className="bg-card/30 rounded-md p-2 border border-border/30">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-2xs text-muted-foreground leading-3">{t('chord_type')}</div>
          <div className="flex items-center bg-background/40 rounded-md border border-border/30 p-0.5 gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSelectedTypesChange(CHORD_TYPES.map(t => t.name))}
              className="h-6 text-2xs-plus px-2"
            >
              {t('select_all')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSelectedTypesChange([])}
              className="h-6 text-2xs-plus px-2"
            >
              {t('clear_all')}
            </Button>
          </div>
        </div>
        <div className="max-h-[160px] overflow-y-auto pr-1">
        {(() => {
          const groups = CHORD_TYPES.reduce((acc, type) => {
            const groupKey = type.group || 'other'
            if (!acc[groupKey]) {
              acc[groupKey] = { name: type.groupName || type.groupZh || 'Other', nameZh: type.groupZh || '其他', types: [] }
            }
            acc[groupKey].types.push(type)
            return acc
          }, {} as Record<string, { name: string; nameZh: string; types: typeof CHORD_TYPES }>)
          
          return Object.entries(groups).map(([key, group]) => (
            <div key={key} className="mb-2 last:mb-0">
              <div className="text-2xs font-medium text-muted-foreground/70 mb-1 px-1">{language === 'zh-CN' ? group.nameZh : group.name}</div>
              <div className="flex flex-wrap gap-1">
                {group.types.map(type => (
                  <Button
                    key={type.name}
                    variant={selectedTypes.includes(type.name) ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      if (selectedTypes.includes(type.name)) {
                        onSelectedTypesChange(selectedTypes.filter(t => t !== type.name))
                      } else {
                        onSelectedTypesChange([...selectedTypes, type.name])
                      }
                    }}
                    className="h-7 text-xs px-2"
                  >
                    {/* Major 的 symbol 是空串（和弦记谱里不写，如 C 而非 CMaj），
                        这里会回退到英文 name —— 中文界面下改用中文术语（大三和弦等） */}
                    {type.symbol || (language === 'zh-CN' ? getChordDisplayName(type.name, 'chinese') : type.name)}
                  </Button>
                ))}
              </div>
            </div>
          ))
        })()}
        </div>
      </div>
    </div>
  )
})
