// 和弦进行控制面板：歌曲选择 · 调性 · 练习等级 · 和弦顺序 · 显示选项 · 下一和弦 ·
// 自定义和弦折叠区（手动添加 / iReal Pro 导入 / 序列保存·载入·导出·清空）
"use client"

import { memo } from 'react'
import { ChevronRight, Download, Plus, Save, SkipForward, Trash2, Upload, X } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { CHORD_TYPES, NOTES, NOTES_FLAT } from '@/lib/page-theory-data'
import { ALL_PRACTICE_LEVELS } from '@/lib/practice-levels'
import { translateOr } from '@/lib/i18n'
import { formatChordName, normalizeNoteName } from '@/lib/page-theory-functions'
import { SONG_PROGRESSIONS } from '@/lib/page-songs'

interface ChordProgressionControlsProps {
  /** 翻译函数 */
  t: (key: string) => string
  /** 界面语言（zh-CN / en） */
  language: string
  /** 当前选中的歌曲 */
  selectedSong: (typeof SONG_PROGRESSIONS)[number]
  /** 打开歌曲选择弹窗 */
  onShowSongSelectorChange: (v: boolean) => void
  /** 调性 */
  progressionKey: string
  onProgressionKeyChange: (v: string) => void
  /** 是否小调 */
  isMinor: boolean
  /** 练习等级 id */
  practiceLevel: string
  /** 打开等级选择弹窗 */
  onShowLevelSelectorChange: (v: boolean) => void
  /** 和弦顺序 */
  chordPlayOrder: "asc" | "desc" | "random"
  onChordPlayOrderChange: (v: "asc" | "desc" | "random") => void
  /** 循环进行 */
  progressionRepeat: boolean
  onProgressionRepeatChange: (v: boolean) => void
  /** 声部连接 */
  shouldVoiceLead: boolean
  onShouldVoiceLeadChange: (v: boolean) => void
  /** 循环时随机调性 */
  shouldRandomizeKeyOnRepeat: boolean
  onShouldRandomizeKeyOnRepeatChange: (v: boolean) => void
  /** 显示指板 */
  showChordFretboard: boolean
  onShowChordFretboardChange: (v: boolean) => void
  /** 显示和弦进行信息窗 */
  showChordStructure: boolean
  onShowChordStructureChange: (v: boolean) => void
  /** 显示键盘 */
  showChordKeyboard: boolean
  onShowChordKeyboardChange: (v: boolean) => void
  /** 练习进行中（决定「下一和弦」是否可用） */
  isPlaying: boolean
  /** 跳到下一和弦 */
  nextChord: () => void
  /** 自定义和弦根音 */
  newChordRoot: string
  onNewChordRootChange: (v: string) => void
  /** 自定义和弦类型 */
  newChordType: string
  onNewChordTypeChange: (v: string) => void
  /** 添加自定义和弦 */
  addCustomChord: () => void
  /** iReal Pro 文本输入 */
  irealInput: string
  onIrealInputChange: (v: string) => void
  /** 解析并导入 iReal Pro 文本 */
  importIrealPro: () => void
  /** 自定义和弦序列 */
  customChords: { root: string; type: string; bass?: string }[]
  removeCustomChord: (index: number) => void
  /** 序列名称（保存用） */
  customChordName: string
  onCustomChordNameChange: (v: string) => void
  saveCustomChords: () => void
  loadCustomChords: () => void
  exportCustomChords: () => void
  clearCustomChords: () => void
}

/**
 * 和弦进行控制面板（从 app/page.tsx 原样搬出，行为不变）。
歌曲/调性/等级/和弦顺序、显示选项开关组、下一和弦、自定义和弦（折叠：手动添加 · iReal Pro 导入 · 序列管理与存取）。
 */
export const ChordProgressionControls = memo(function ChordProgressionControls({
  t,
  language,
  selectedSong,
  onShowSongSelectorChange,
  progressionKey,
  onProgressionKeyChange,
  isMinor,
  practiceLevel,
  onShowLevelSelectorChange,
  chordPlayOrder,
  onChordPlayOrderChange,
  progressionRepeat,
  onProgressionRepeatChange,
  shouldVoiceLead,
  onShouldVoiceLeadChange,
  shouldRandomizeKeyOnRepeat,
  onShouldRandomizeKeyOnRepeatChange,
  showChordFretboard,
  onShowChordFretboardChange,
  showChordStructure,
  onShowChordStructureChange,
  showChordKeyboard,
  onShowChordKeyboardChange,
  isPlaying,
  nextChord,
  newChordRoot,
  onNewChordRootChange,
  newChordType,
  onNewChordTypeChange,
  addCustomChord,
  irealInput,
  onIrealInputChange,
  importIrealPro,
  customChords,
  removeCustomChord,
  customChordName,
  onCustomChordNameChange,
  saveCustomChords,
  loadCustomChords,
  exportCustomChords,
  clearCustomChords,
}: ChordProgressionControlsProps) {
  return (
<div className="space-y-2">
  {/* 第一行：歌曲选择、调性、练习模式、和弦顺序 */}
  <div className="flex flex-wrap items-end gap-2">
    <div className="w-[140px] sm:w-[180px] space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('select_song')}</div>
      <Button
        variant="outline"
        className="h-8 text-xs w-full justify-between px-2"
        onClick={() => onShowSongSelectorChange(true)}
      >
        <span className="truncate">{selectedSong.name === '__custom__' ? t('chord_custom') : selectedSong.name}</span>
        <ChevronRight className="h-3 w-3 ml-1 shrink-0" />
      </Button>
    </div>
    <div className="w-[110px] sm:w-[130px] space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('select_key')}</div>
      <Select value={progressionKey} onValueChange={(value) => onProgressionKeyChange(value)}>
        <SelectTrigger className="h-8 text-xs w-full px-2">
          <SelectValue>
            {normalizeNoteName(progressionKey) + (isMinor ? (language === 'zh-CN' ? '小调' : ' minor') : (language === 'zh-CN' ? '大调' : ' Major'))}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {NOTES.map((note, index) => {
            const flatNote = NOTES_FLAT[index]
            const displayName = note === flatNote
              ? note + (isMinor ? (language === 'zh-CN' ? '小调' : ' minor') : (language === 'zh-CN' ? '大调' : ' Major'))
              : `${note} / ${flatNote}` + (isMinor ? (language === 'zh-CN' ? '小调' : ' minor') : (language === 'zh-CN' ? '大调' : ' Major'))
            return (
              <SelectItem key={note} value={note} className="text-xs">{displayName}</SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </div>
    <div className="w-[130px] sm:w-[150px] space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('practice_level')}</div>
      <Button
        variant="outline"
        className="h-8 text-xs w-full justify-between px-2"
        onClick={() => onShowLevelSelectorChange(true)}
      >
        <span className="truncate">
          {translateOr(t, ALL_PRACTICE_LEVELS.find(l => l.id === practiceLevel)?.nameKey ?? '', practiceLevel)}
        </span>
        <ChevronRight className="h-3 w-3 ml-1 shrink-0" />
      </Button>
    </div>
    <div className="w-[110px] sm:w-[130px] space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('chord_order')}</div>
      <Select value={chordPlayOrder} onValueChange={(v: "asc" | "desc" | "random") => onChordPlayOrderChange(v)}>
        <SelectTrigger className="h-8 text-xs w-full px-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="asc" className="text-xs">{t('order_ordered')}</SelectItem>
          <SelectItem value="desc" className="text-xs">{t('order_reverse')}</SelectItem>
          <SelectItem value="random" className="text-xs">{t('order_random')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>

  {/* 第二行：开关选项 + 操作按钮 */}
  <div className="flex items-end gap-2 flex-wrap">
    <div className="space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('display_options')}</div>
      <div className="flex items-center gap-1.5 h-8 px-2 bg-card/30 rounded-md border border-border/30 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('progression_repeat')}</Label>
          <Switch
            checked={progressionRepeat}
            onCheckedChange={onProgressionRepeatChange}
            className="scale-90"
          />
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div className="flex items-center gap-1.5">
          <Label className={`text-xs whitespace-nowrap ${chordPlayOrder !== 'random' ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>{t('progression_voice_leading')}</Label>
          <Switch
            checked={shouldVoiceLead}
            onCheckedChange={onShouldVoiceLeadChange}
            disabled={chordPlayOrder === 'random'}
            className="scale-90"
          />
        </div>
        {progressionRepeat && (
          <>
            <Separator orientation="vertical" className="h-4" />
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('progression_randomize_key')}</Label>
              <Switch
                checked={shouldRandomizeKeyOnRepeat}
                onCheckedChange={onShouldRandomizeKeyOnRepeatChange}
                className="scale-90"
              />
            </div>
          </>
        )}
        <Separator orientation="vertical" className="h-4" />
        <div className="flex items-center gap-1.5">
          <Label htmlFor="showChordFretboard" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">{t('show_fretboard')}</Label>
          <Switch
            id="showChordFretboard"
            checked={showChordFretboard}
            onCheckedChange={onShowChordFretboardChange}
            className="scale-90"
          />
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div className="flex items-center gap-1.5">
          <Label htmlFor="showChordStructure" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">{t('chord_progression_structure')}</Label>
          <Switch
            id="showChordStructure"
            checked={showChordStructure}
            onCheckedChange={onShowChordStructureChange}
            className="scale-90"
          />
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div className="flex items-center gap-1.5">
          <Label htmlFor="showChordKeyboard" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">{t('show_keyboard')}</Label>
          <Switch
            id="showChordKeyboard"
            checked={showChordKeyboard}
            onCheckedChange={onShowChordKeyboardChange}
            className="scale-90"
          />
        </div>
      </div>
    </div>
    <div className="space-y-0.5 ml-auto">
      <div className="text-2xs text-transparent leading-3">&nbsp;</div>
      <Button
        onClick={nextChord}
        variant="outline"
        className="h-8 px-3 text-xs"
        disabled={!isPlaying}
      >
        <SkipForward className="h-3.5 w-3.5 mr-1" />
        {t('btn_next')}
      </Button>
    </div>
  </div>

  {/* 第三行：自定义和弦（折叠） */}
  <Accordion type="multiple" defaultValue={[]} className="w-full">
    <AccordionItem value="custom" className="border-0">
      <AccordionTrigger className="text-xs py-1.5 px-2 bg-card/30 rounded-md border border-border/30 hover:no-underline">
        {t('chord_custom')}
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3 pt-2 p-2 bg-card/20 rounded-b-md border-x border-b border-border/30">
          {/* 手动添加和弦 */}
          <div className="flex items-center gap-2">
            <div className="flex-1 grid grid-cols-12 gap-1">
              <Select value={newChordRoot} onValueChange={onNewChordRootChange}>
                <SelectTrigger className="col-span-3 h-8 text-xs px-2">
                  <SelectValue placeholder={t('chord_root_note')} />
                </SelectTrigger>
                <SelectContent>
                  {NOTES.map(note => (
                    <SelectItem key={note} value={note} className="text-xs">{note}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={newChordType} onValueChange={onNewChordTypeChange}>
                <SelectTrigger className="col-span-6 h-8 text-xs px-2">
                  <SelectValue placeholder={t('chord_type')} />
                </SelectTrigger>
                <SelectContent>
                  {CHORD_TYPES.map(type => (
                    <SelectItem key={type.name} value={type.name} className="text-xs">{type.symbol || type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={addCustomChord} size="sm" className="col-span-3 h-8 text-xs px-2">
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t('custom_chord_add')}
              </Button>
            </div>
          </div>

          {/* iReal Pro 导入 */}
          <div className="space-y-2 pt-2 border-t border-border/30">
            <p className="text-xs text-muted-foreground">{t('ireal_import_title')}</p>
            <Textarea
              placeholder={t('ireal_import_help')}
              value={irealInput}
              onChange={(e) => onIrealInputChange(e.target.value)}
              className="min-h-[50px] text-xs"
            />
            <Button onClick={importIrealPro} size="sm" className="w-full h-8 text-xs">
              <Upload className="h-3.5 w-3.5 mr-1" />
              {t('ireal_import_btn')}
            </Button>
          </div>

          {/* 和弦序列显示 */}
          {customChords.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-2 border-t border-border/30">
              {customChords.map((chord, index) => (
                <Badge key={index} variant="secondary" className="text-xs gap-1 py-0.5">
                  {formatChordName(chord, t)}
                  <button
                    onClick={() => removeCustomChord(index)}
                    className="hover:text-destructive"
                    aria-label={t('btn_remove_chord')}
                    title={t('btn_remove_chord')}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center gap-1 pt-2 border-t border-border/30 flex-wrap">
            <Input
              placeholder={t('custom_chord_sequence_name')}
              value={customChordName}
              onChange={(e) => onCustomChordNameChange(e.target.value)}
              className="h-8 text-xs flex-1 min-w-[120px]"
            />
            <Button variant="outline" size="sm" onClick={saveCustomChords} className="h-8 px-2 text-xs" disabled={customChords.length === 0}>
              <Save className="h-3.5 w-3.5 mr-1" />
              {t('custom_chord_save')}
            </Button>
            <Button variant="outline" size="sm" onClick={loadCustomChords} className="h-8 px-2 text-xs">
              <Upload className="h-3.5 w-3.5 mr-1" />
              {t('custom_chord_load')}
            </Button>
            <Button variant="outline" size="sm" onClick={exportCustomChords} className="h-8 px-2 text-xs" disabled={customChords.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1" />
              {t('custom_chord_export')}
            </Button>
            {customChords.length > 0 && (
              <Button variant="outline" size="sm" onClick={clearCustomChords} className="h-8 px-2 text-xs">
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                {t('custom_chord_clear')}
              </Button>
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  </Accordion>
</div>
  )
})
