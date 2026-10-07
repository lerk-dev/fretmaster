'use client'

// 设置面板的「显示与外观」折叠段（从 app/page.tsx 抽出，内容未改动）
// 含：全屏类型 / 语言 / 主题风格 / 显示大小 / 和弦与音阶显示 / 升降号 / 和弦符号细粒度偏好

import { Globe, Guitar, Monitor, Moon, Music, Palette, Piano, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  composeTheme,
  parseTheme,
  type ChordScaleDisplayMode,
  type ChordSymbolSettings,
  type FretboardStyle,
  type FullscreenModeType,
  type NoteAccidentalDisplay,
  type ThemeMode,
  type ThemeStyle,
} from '@/lib/store'
import type { PianoKeyboardStyle } from '@/lib/piano-keyboard-style'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

interface SettingsDisplaySectionProps {
  t: (key: string) => string
  language: string
  fullscreenMode: FullscreenModeType | undefined
  onFullscreenModeChange: (v: FullscreenModeType) => void
  /** 切换语言时同步切换和弦/音阶显示方案（由调用方处理） */
  onSelectLanguage: (lang: 'zh-CN' | 'en') => void
  theme: ThemeMode
  onThemeChange: (v: ThemeMode) => void
  displayScale: number
  onDisplayScaleChange: (v: number) => void
  chordScaleDisplay: ChordScaleDisplayMode
  onChordScaleDisplayChange: (v: ChordScaleDisplayMode) => void
  noteAccidentalDisplay: NoteAccidentalDisplay
  onNoteAccidentalDisplayChange: (v: NoteAccidentalDisplay) => void
  fretboardStyle: FretboardStyle
  onFretboardStyleChange: (v: FretboardStyle) => void
  pianoKeyboardStyle: PianoKeyboardStyle
  onPianoKeyboardStyleChange: (v: PianoKeyboardStyle) => void
  chordSymbols: ChordSymbolSettings
  onChordSymbolChange: (patch: Partial<ChordSymbolSettings>) => void
}

export function SettingsDisplaySection({
  t,
  language,
  fullscreenMode,
  onFullscreenModeChange,
  onSelectLanguage,
  theme,
  onThemeChange,
  displayScale,
  onDisplayScaleChange,
  chordScaleDisplay,
  onChordScaleDisplayChange,
  noteAccidentalDisplay,
  onNoteAccidentalDisplayChange,
  fretboardStyle,
  onFretboardStyleChange,
  pianoKeyboardStyle,
  onPianoKeyboardStyleChange,
  chordSymbols,
  onChordSymbolChange,
}: SettingsDisplaySectionProps) {
  return (
    <AccordionItem value="display" className="border-b-0">
      <AccordionTrigger className="py-2 text-sm font-medium flex items-center gap-2 hover:no-underline">
        <span className="flex items-center gap-2">
          <Palette className="h-4 w-4" />
          {language === 'zh-CN' ? '显示与外观' : 'Display & Appearance'}
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-3 pb-2">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {language === 'zh-CN' ? '全屏类型' : 'Fullscreen Type'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={fullscreenMode === 'windowed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onFullscreenModeChange('windowed')}
          >
            {language === 'zh-CN' ? '窗口全屏' : 'Windowed'}
          </Button>
          <Button
            variant={fullscreenMode === 'fullscreen' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onFullscreenModeChange('fullscreen')}
          >
            {language === 'zh-CN' ? '真全屏' : 'Fullscreen'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {language === 'zh-CN' 
            ? '窗口全屏：内容铺满当前窗口，窗口大小不变；真全屏：覆盖整个屏幕（含任务栏），沉浸式体验'
            : 'Windowed: fill the current window without resizing it; Fullscreen: cover the whole screen including the taskbar'}
        </p>
      </div>

    <Separator className="my-1" />
    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
      <Globe className="h-3.5 w-3.5" />
      {t('language')}
    </div>
      <div className="flex gap-2">
        <Button
          variant={language === 'zh-CN' ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            onSelectLanguage('zh-CN')
          }}
          className="flex-1"
        >
          <Globe className="h-4 w-4 mr-2" />
          {t('lang_zh')}
        </Button>
        <Button
          variant={language === 'en' ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            onSelectLanguage('en')
          }}
          className="flex-1"
        >
          <Globe className="h-4 w-4 mr-2" />
          {t('lang_en')}
        </Button>
      </div>

    <Separator className="my-1" />
    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
      <Palette className="h-3.5 w-3.5" />
      {t('general_theme')}
    </div>
      {(() => {
        const { style: currentStyle, brightness: currentBrightness } = parseTheme(theme)
        const themeStyleOptions: { id: ThemeStyle; name: string; desc: string; shortName: string; lightBg: string; darkBg: string; lightPrimary: string; darkPrimary: string }[] = [
          { id: 'classic', name: t('theme_style_classic'), desc: t('theme_style_classic_desc'), shortName: t('theme_style_classic').slice(0, 1), lightBg: 'hsl(40 12% 89%)', darkBg: 'hsl(220 14% 7%)', lightPrimary: 'hsl(142 68% 30%)', darkPrimary: 'hsl(142 65% 48%)' },
          { id: 'forest', name: t('theme_style_forest'), desc: t('theme_style_forest_desc'), shortName: t('theme_style_forest').slice(0, 1), lightBg: 'hsl(75 16% 86%)', darkBg: 'hsl(150 18% 7%)', lightPrimary: 'hsl(145 55% 24%)', darkPrimary: 'hsl(140 55% 46%)' },
          { id: 'ocean', name: t('theme_style_ocean'), desc: t('theme_style_ocean_desc'), shortName: t('theme_style_ocean').slice(0, 1), lightBg: 'hsl(200 26% 88%)', darkBg: 'hsl(215 32% 7%)', lightPrimary: 'hsl(205 72% 34%)', darkPrimary: 'hsl(195 75% 50%)' },
          { id: 'sunset', name: t('theme_style_sunset'), desc: t('theme_style_sunset_desc'), shortName: t('theme_style_sunset').slice(0, 1), lightBg: 'hsl(35 32% 89%)', darkBg: 'hsl(350 24% 7%)', lightPrimary: 'hsl(18 78% 40%)', darkPrimary: 'hsl(25 85% 56%)' },
          { id: 'monochrome', name: t('theme_style_monochrome'), desc: t('theme_style_monochrome_desc'), shortName: t('theme_style_monochrome').slice(0, 1), lightBg: 'hsl(220 10% 88%)', darkBg: 'hsl(220 8% 7%)', lightPrimary: 'hsl(220 10% 24%)', darkPrimary: 'hsl(220 6% 92%)' },
          { id: 'rose', name: t('theme_style_rose'), desc: t('theme_style_rose_desc'), shortName: t('theme_style_rose').slice(0, 1), lightBg: 'hsl(340 18% 89%)', darkBg: 'hsl(345 22% 7%)', lightPrimary: 'hsl(340 72% 36%)', darkPrimary: 'hsl(340 70% 54%)' },
          { id: 'midnight', name: t('theme_style_midnight'), desc: t('theme_style_midnight_desc'), shortName: t('theme_style_midnight').slice(0, 1), lightBg: 'hsl(230 28% 88%)', darkBg: 'hsl(235 32% 6%)', lightPrimary: 'hsl(235 65% 38%)', darkPrimary: 'hsl(230 60% 60%)' },
          { id: 'sand', name: t('theme_style_sand'), desc: t('theme_style_sand_desc'), shortName: t('theme_style_sand').slice(0, 1), lightBg: 'hsl(30 16% 87%)', darkBg: 'hsl(25 14% 7%)', lightPrimary: 'hsl(22 58% 36%)', darkPrimary: 'hsl(22 60% 52%)' },
          { id: 'celadon', name: t('theme_style_celadon'), desc: t('theme_style_celadon_desc'), shortName: t('theme_style_celadon').slice(0, 1), lightBg: 'hsl(165 18% 87%)', darkBg: 'hsl(170 20% 6%)', lightPrimary: 'hsl(172 58% 28%)', darkPrimary: 'hsl(172 55% 44%)' },
          { id: 'lavender', name: t('theme_style_lavender'), desc: t('theme_style_lavender_desc'), shortName: t('theme_style_lavender').slice(0, 1), lightBg: 'hsl(265 18% 89%)', darkBg: 'hsl(260 26% 7%)', lightPrimary: 'hsl(262 60% 38%)', darkPrimary: 'hsl(262 60% 58%)' },
          { id: 'carbon', name: t('theme_style_carbon'), desc: t('theme_style_carbon_desc'), shortName: t('theme_style_carbon').slice(0, 1), lightBg: 'hsl(215 10% 88%)', darkBg: 'hsl(215 14% 6%)', lightPrimary: 'hsl(212 45% 32%)', darkPrimary: 'hsl(212 55% 52%)' },
        ]
        return (
          <div className="space-y-2">
            {/* 主题风格色卡 - 8列两行 */}
            <div className="grid grid-cols-4 gap-1.5">
              {themeStyleOptions.map(opt => {
                const isActive = currentStyle === opt.id
                return (
                  <button
                    key={opt.id}
                    onClick={() => onThemeChange(composeTheme(opt.id, currentBrightness))}
                    title={`${opt.name} — ${opt.desc}`}
                    aria-label={opt.name}
                    aria-pressed={isActive}
                    className={cn(
                      "relative h-9 rounded-md overflow-hidden border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive
                        ? "border-primary shadow-sm ring-1 ring-primary/30"
                        : "border-transparent hover:border-border/60"
                    )}
                  >
                    {/* 浅色半 */}
                    <div className="absolute inset-y-0 left-0 w-1/2" style={{ background: opt.lightBg }} />
                    {/* 深色半 */}
                    <div className="absolute inset-y-0 right-0 w-1/2" style={{ background: opt.darkBg }} />
                    {/* 主色圆点居中 */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="h-2.5 w-2.5 rounded-full shadow ring-1 ring-black/10" style={{ background: currentBrightness === 'light' ? opt.lightPrimary : opt.darkPrimary }} />
                    </div>
                  </button>
                )
              })}
            </div>
            {/* 当前主题名称 */}
            <div className="text-2xs text-muted-foreground text-center">
              {themeStyleOptions.find(o => o.id === currentStyle)?.name} · {themeStyleOptions.find(o => o.id === currentStyle)?.desc}
            </div>
            {/* 明暗模式 */}
            <div className="flex gap-2">
              <Button
                variant={currentBrightness === 'dark' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onThemeChange(composeTheme(currentStyle, 'dark'))}
                className="flex-1"
              >
                <Moon className="h-4 w-4 mr-2" />
                {t('theme_dark')}
              </Button>
              <Button
                variant={currentBrightness === 'light' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onThemeChange(composeTheme(currentStyle, 'light'))}
                className="flex-1"
              >
                <Sun className="h-4 w-4 mr-2" />
                {t('theme_light')}
              </Button>
            </div>
          </div>
        )
      })()}

    <Separator className="my-1" />
    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
      <Monitor className="h-3.5 w-3.5" />
      {language === 'zh-CN' ? '显示大小' : 'Display Size'}
    </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {language === 'zh-CN' ? '缩放比例' : 'Scale'}
          </span>
          <span className="font-mono">{Math.round(displayScale * 100)}%</span>
        </div>
        <Slider
          value={[displayScale * 100]}
          onValueChange={([v]) => onDisplayScaleChange(v / 100)}
          min={80}
          max={150}
          step={10}
        />
        <p className="text-xs text-muted-foreground">
          {language === 'zh-CN' 
            ? '调整界面整体大小，适用于高分辨率屏幕'
            : 'Adjust overall UI size for high resolution screens'}
        </p>
      </div>

    <Separator className="my-1" />
    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
      <Guitar className="h-3.5 w-3.5" />
      {language === 'zh-CN' ? '指板显示方案' : 'Fretboard Style'}
    </div>
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant={fretboardStyle === 'classic' ? 'default' : 'outline'}
          size="sm"
          aria-pressed={fretboardStyle === 'classic'}
          onClick={() => onFretboardStyleChange('classic')}
        >
          {language === 'zh-CN' ? '经典' : 'Classic'}
        </Button>
        <Button
          variant={fretboardStyle === 'guitarrun' ? 'default' : 'outline'}
          size="sm"
          aria-pressed={fretboardStyle === 'guitarrun'}
          onClick={() => onFretboardStyleChange('guitarrun')}
        >
          {language === 'zh-CN' ? 'GuitarRun 风格' : 'GuitarRun'}
        </Button>
        <Button
          variant={fretboardStyle === 'trainer' ? 'default' : 'outline'}
          size="sm"
          aria-pressed={fretboardStyle === 'trainer'}
          onClick={() => onFretboardStyleChange('trainer')}
        >
          {language === 'zh-CN' ? '3D 琴颈风格' : '3D Neck'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {language === 'zh-CN'
          ? '经典：实心色块，跟随主题明暗；GuitarRun 风格：圆点霓虹皮肤；3D 琴颈风格：木纹颈身 + 金属弦 + 珠光品记的深色指板（后两者固定在深色指板上）'
          : 'Classic: solid color blocks that follow the theme; GuitarRun: dot-based neon skin; 3D Neck: dark wood-grain neck with metal strings and pearl inlays (the latter two keep a fixed dark board)'}
      </p>

    <Separator className="my-1" />
    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
      <Piano className="h-3.5 w-3.5" />
      {language === 'zh-CN' ? '钢琴键盘样式' : 'Piano Keyboard Style'}
    </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={pianoKeyboardStyle === 'classic' ? 'default' : 'outline'}
          size="sm"
          aria-pressed={pianoKeyboardStyle === 'classic'}
          onClick={() => onPianoKeyboardStyleChange('classic')}
        >
          {language === 'zh-CN' ? '经典' : 'Classic'}
        </Button>
        <Button
          variant={pianoKeyboardStyle === 'musmath' ? 'default' : 'outline'}
          size="sm"
          aria-pressed={pianoKeyboardStyle === 'musmath'}
          onClick={() => onPianoKeyboardStyleChange('musmath')}
        >
          {language === 'zh-CN' ? 'MusMath 风格' : 'MusMath'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {language === 'zh-CN'
          ? '经典：整键底色高亮（根音深蓝 / 当前步亮蓝）；MusMath 风格：键面留白，音阶与和弦音用十二音级色标标出，根音为方形'
          : 'Classic: whole-key tint (deep blue root, bright blue current step); MusMath: plain keys with a 12-chroma colour dot per scale/chord tone, square for the root'}
      </p>

    <Separator className="my-1" />
    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
      <Music className="h-3.5 w-3.5" />
      {t('chord_scale_display')}
    </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={chordScaleDisplay === 'chinese' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChordScaleDisplayChange('chinese')}
        >
          {t('display_chinese')}
        </Button>
        <Button
          variant={chordScaleDisplay === 'english' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChordScaleDisplayChange('english')}
        >
          {t('display_english')}
        </Button>
        <Button
          variant={chordScaleDisplay === 'english_short' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChordScaleDisplayChange('english_short')}
        >
          {t('display_english_short')}
        </Button>
        <Button
          variant={chordScaleDisplay === 'jazz' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChordScaleDisplayChange('jazz')}
        >
          {t('display_jazz')}
        </Button>
      </div>

    <Separator className="my-1" />
    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
      <Music className="h-3.5 w-3.5" />
      {language === 'zh-CN' ? '音符升降号显示' : 'Note Accidental Display'}
    </div>
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant={noteAccidentalDisplay === 'sharp' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onNoteAccidentalDisplayChange('sharp')}
        >
          {language === 'zh-CN' ? '升号 ♯' : 'Sharp ♯'}
        </Button>
        <Button
          variant={noteAccidentalDisplay === 'flat' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onNoteAccidentalDisplayChange('flat')}
        >
          {language === 'zh-CN' ? '降号 ♭' : 'Flat ♭'}
        </Button>
        <Button
          variant={noteAccidentalDisplay === 'mixed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onNoteAccidentalDisplayChange('mixed')}
        >
          {language === 'zh-CN' ? '混用' : 'Mixed'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {language === 'zh-CN'
          ? '升号：所有变化音用♯显示（如C♯, F♯）；降号：所有变化音用♭显示（如D♭, G♭）；混用：根据音名自动选择升降号'
          : 'Sharp: display all accidentals as ♯ (e.g. C♯, F♯); Flat: display all as ♭ (e.g. D♭, G♭); Mixed: auto-select based on note name'}
      </p>

    <Separator className="my-1" />
    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-1">
      <Music className="h-3.5 w-3.5" />
      {t('chord_symbol_fine_grained')}
    </div>
    <p className="text-xs text-muted-foreground">
      {language === 'zh-CN'
        ? '细粒度和弦符号偏好，仅对英文/爵士记谱法生效（中文显示不受影响）。'
        : 'Fine-grained chord symbol preferences. Only affects English/Jazz notation (Chinese display is unchanged).'}
    </p>

    {/* 小调和弦符号 */}
    <div className="space-y-1.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('chord_symbol_minor')}</div>
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant={chordSymbols.minorSymbol === 'm' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChordSymbolChange({ minorSymbol: 'm' })}
        >
          Cm7
        </Button>
        <Button
          variant={chordSymbols.minorSymbol === '-' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChordSymbolChange({ minorSymbol: '-' })}
        >
          C-7
        </Button>
        <Button
          variant={chordSymbols.minorSymbol === 'min' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChordSymbolChange({ minorSymbol: 'min' })}
        >
          Cmin7
        </Button>
      </div>
    </div>

    {/* 半减七和弦符号 */}
    <div className="space-y-1.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('chord_symbol_m7b5')}</div>
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant={chordSymbols.minor7flat5Symbol === 'm7b5' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChordSymbolChange({ minor7flat5Symbol: 'm7b5' })}
        >
          Cm7b5
        </Button>
        <Button
          variant={chordSymbols.minor7flat5Symbol === 'ø7' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChordSymbolChange({ minor7flat5Symbol: 'ø7' })}
        >
          Cø7
        </Button>
        <Button
          variant={chordSymbols.minor7flat5Symbol === 'half-dim' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChordSymbolChange({ minor7flat5Symbol: 'half-dim' })}
        >
          C half-dim
        </Button>
      </div>
    </div>

    {/* 属七降九符号 */}
    <div className="space-y-1.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('chord_symbol_7b9')}</div>
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant={chordSymbols.dominant7flat9Symbol === '7b9' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChordSymbolChange({ dominant7flat9Symbol: '7b9' })}
        >
          C7b9
        </Button>
        <Button
          variant={chordSymbols.dominant7flat9Symbol === '7♭9' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChordSymbolChange({ dominant7flat9Symbol: '7♭9' })}
        >
          C7♭9
        </Button>
        <Button
          variant={chordSymbols.dominant7flat9Symbol === '7-9' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChordSymbolChange({ dominant7flat9Symbol: '7-9' })}
        >
          C7-9
        </Button>
      </div>
    </div>

    {/* 7b9 和弦对应音阶 */}
    <div className="space-y-1.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('chord_symbol_7b9_scale')}</div>
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant={chordSymbols.sevenFlatNineScaleChoice === 'altered' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChordSymbolChange({ sevenFlatNineScaleChoice: 'altered' })}
        >
          Altered
        </Button>
        <Button
          variant={chordSymbols.sevenFlatNineScaleChoice === 'diminishedWholeHalf' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChordSymbolChange({ sevenFlatNineScaleChoice: 'diminishedWholeHalf' })}
        >
          W-H Dim
        </Button>
        <Button
          variant={chordSymbols.sevenFlatNineScaleChoice === 'diminishedHalfWhole' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChordSymbolChange({ sevenFlatNineScaleChoice: 'diminishedHalfWhole' })}
        >
          H-W Dim
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {language === 'zh-CN'
          ? '属七降九和弦（7b9）在和弦音阶练习中对应的音阶：Altered（变化音阶）/ 全半减音阶 / 半全减音阶。'
          : 'Scale used for 7b9 chords in chord-scale exercises: Altered / Whole-Half Diminished / Half-Whole Diminished.'}
      </p>
    </div>
      </AccordionContent>
    </AccordionItem>
  )
}
