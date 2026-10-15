// 音阶练习控制面板：调性（随机调）· 调式分类 10 类 · 方向 segmented · 根音移动 ·
// 显示选项（指板/键盘/结构）· 练习序列 · 音阶类型多选（至少保留一个）
"use client"

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { NOTES, SCALE_MODES, SCALE_PRACTICE_SEQUENCES } from '@/lib/page-theory-data'
import { getScaleDisplayName } from '@/lib/page-theory-functions'

/**
 * 音阶分类下拉的选项。**这是分类 UI 的唯一真相源** —— 下拉选项与详情区标题都由它生成
 *（旧写法是「SelectItem 列表 + 15 路三元链标题」两份手写数据，加一个分类要改两处、漏改一处
 * 就会出现「下拉写着 A、标题写着 B」）。
 *
 * 🚨 这里**只列「新分组」**：`SCALE_MODES` 里的 church / minor / bebop / other / jazz
 * 与这些分组逐条重复（同一音阶在两个分组出现 = 典型「第二真相源」，用户会困惑）。
 * 那五个分组已于 2026-10-15 **连同数据一起删除**（删除前逐条证明 19 条都能在新分组
 * 找到同音高集合的对应，见 `__tests__/page-theory-data.test.ts` 的「旧分组零信息损失」）。
 * 它们独有的音阶此前已迁入 bebopScales / exotic。
 *
 * `resolvedCategory` 兜底仍然必要，但**不是为了迁就旧数据** —— 是因为
 * `scalePractice.selectedScaleCategory` 会被持久化，老用户的本地存储里可能还留着
 * `'church'` 这类已删除的键（索引 SCALE_MODES 会拿到 undefined）。
 * 另一处防御在 `scale-keyboard.tsx` 的 `SCALE_MODES[cat] ?? []`。
 */
export const SCALE_CATEGORY_OPTIONS: ReadonlyArray<{
  value: keyof typeof SCALE_MODES
  /** 下拉选项里的短标签 */
  labelZh: string
  labelEn: string
  /** 详情区标题（比短标签更完整） */
  titleZh: string
  titleEn: string
}> = [
  { value: 'pentatonic', labelZh: '五声音阶', labelEn: 'Pentatonic', titleZh: '五声音阶', titleEn: 'Pentatonic Scales' },
  { value: 'majorScaleModes', labelZh: '大调模式', labelEn: 'Major Modes', titleZh: '大调音阶模式', titleEn: 'Major Scale Modes' },
  { value: 'melodicMinorScaleModes', labelZh: '旋律小调模式', labelEn: 'Melodic Minor Modes', titleZh: '旋律小调模式', titleEn: 'Melodic Minor Scale Modes' },
  { value: 'harmonicMinorScaleModes', labelZh: '和声小调模式', labelEn: 'Harmonic Minor Modes', titleZh: '和声小调模式', titleEn: 'Harmonic Minor Scale Modes' },
  { value: 'harmonicMajorScaleModes', labelZh: '和声大调模式', labelEn: 'Harmonic Major Modes', titleZh: '和声大调模式', titleEn: 'Harmonic Major Scale Modes' },
  { value: 'otherScales', labelZh: '其他音阶', labelEn: 'Other Scales', titleZh: '其他音阶', titleEn: 'Other Scales' },
  { value: 'bebopScales', labelZh: 'Bebop音阶', labelEn: 'Bebop Scales', titleZh: 'Bebop音阶', titleEn: 'Bebop Scales' },
  { value: 'exotic', labelZh: '异域音阶', labelEn: 'Exotic', titleZh: '异域音阶', titleEn: 'Exotic Scales' },
  { value: 'symmetrical', labelZh: '对称音阶', labelEn: 'Symmetrical', titleZh: '对称音阶', titleEn: 'Symmetrical Scales' },
  { value: 'basic', labelZh: '基础', labelEn: 'Basic', titleZh: '基础音阶', titleEn: 'Basic Scales' },
]

interface ScaleControlsProps {
  /** 翻译函数 */
  t: (key: string) => string
  /** 界面语言（zh-CN / en） */
  language: string
  /** 调性是否随机 */
  isScaleKeyRandom: boolean
  onIsScaleKeyRandomChange: (v: boolean) => void
  /** 调性 */
  scaleKey: string
  onScaleKeyChange: (v: string) => void
  /** 调式分类 */
  selectedScaleCategory: keyof typeof SCALE_MODES
  onSelectedScaleCategoryChange: (v: keyof typeof SCALE_MODES) => void
  /** 当前音阶（用于练习） */
  selectedScale: typeof SCALE_MODES.pentatonic[number]
  onSelectedScaleChange: (v: typeof SCALE_MODES.pentatonic[number]) => void
  /** 进行方向 */
  scaleDirection: "up" | "down" | "up_down" | "random"
  onScaleDirectionChange: (v: "up" | "down" | "up_down" | "random") => void
  /** 根音移动方式 */
  scaleRootMovement: "static" | "random" | "upSemiTone" | "downSemiTone" | "circleOfFifths" | "circleOfFourths"
  onScaleRootMovementChange: (v: "static" | "random" | "upSemiTone" | "downSemiTone" | "circleOfFifths" | "circleOfFourths") => void
  /** 显示指板 */
  showScaleFretboard: boolean
  onShowScaleFretboardChange: (v: boolean) => void
  /** 显示键盘 */
  showScaleKeyboard: boolean
  onShowScaleKeyboardChange: (v: boolean) => void
  /** 显示结构 */
  showScaleStructure: boolean
  onShowScaleStructureChange: (v: boolean) => void
  /** 练习序列 id */
  scalePracticeSequence: string
  onScalePracticeSequenceChange: (v: string) => void
  /** 已选音阶（至少一个） */
  selectedScales: typeof SCALE_MODES.basic
  onSelectedScalesChange: (v: typeof SCALE_MODES.basic) => void
  /** 一弦三音（3NPS）是否生效（选了 3nps 序列且至少有一个七声音阶） */
  threeNpsActive: boolean
  /**
   * 可用把位列表。`index` 是数组下标（回传用），`position` 是把位号（1 起，显示用）。
   * 两者**不一定**相等：品数太小时个别把位会被整段剔除，把位号会跳号。
   */
  threeNpsPositions: { index: number; position: number }[]
  /** 当前选中的把位数组下标 */
  threeNpsSelectedIndex: number
  /** 手动选把位（数组下标） */
  onThreeNpsPositionChange: (positionIndex: number) => void
  /** 已选音阶里最少的音数（提示文案用：告诉用户当前音阶有几个音） */
  threeNpsShortestScaleNoteCount: number
}

/**
 * 音阶练习控制面板（从 app/page.tsx 原样搬出，行为不变）。
调性（含随机调）· 调式分类 · 方向 · 根音移动 · 显示选项 · 练习序列 · 音阶多选。
 */
export const ScaleControls = memo(function ScaleControls({
  t,
  language,
  isScaleKeyRandom,
  onIsScaleKeyRandomChange,
  scaleKey,
  onScaleKeyChange,
  selectedScaleCategory,
  onSelectedScaleCategoryChange,
  selectedScale: _selectedScale,
  onSelectedScaleChange,
  scaleDirection,
  onScaleDirectionChange,
  scaleRootMovement,
  onScaleRootMovementChange,
  showScaleFretboard,
  onShowScaleFretboardChange,
  showScaleKeyboard,
  onShowScaleKeyboardChange,
  showScaleStructure,
  onShowScaleStructureChange,
  scalePracticeSequence,
  onScalePracticeSequenceChange,
  selectedScales,
  onSelectedScalesChange,
  threeNpsActive,
  threeNpsPositions,
  threeNpsSelectedIndex,
  onThreeNpsPositionChange,
  threeNpsShortestScaleNoteCount,
}: ScaleControlsProps) {
  // 「一弦3音」被选中、但已选音阶里没有七声的 ⇒ 让用户知道为什么没反应。
  //
  // 🚨 这里**故意不再重复判断「练习序列是不是 3nps」**：下面渲染提示的 JSX
  // 已经在该条件内（外层那圈 `scalePracticeSequence` 判定），再判一次是两个地方
  // 各写一遍同一个条件。变异验证实测过：把这一半去掉，**所有用例都不挂** ——
  // 说明它不是安全网，只是冗余（见 `.workbuddy/tmp/mut-3nps.json` 的 M19 记录）。
  // `threeNpsActive` 由页面按「序列是 3nps 且至少有一个七声音阶」算出，取反即所需条件。
  const threeNpsBlocked = !threeNpsActive

  // 🚨 存量用户的 `selectedScaleCategory` 可能指向已从 UI 下线的旧分组
  //（church / minor / bebop / other / jazz）—— 直接喂给 Radix Select 会让 value 落空、
  // 触发区显示空白。故兜底回落到首项；数据仍在 SCALE_MODES 里，不会报错。
  const resolvedCategory = SCALE_CATEGORY_OPTIONS.some((o) => o.value === selectedScaleCategory)
    ? selectedScaleCategory
    : SCALE_CATEGORY_OPTIONS[0].value
  const categoryOption = SCALE_CATEGORY_OPTIONS.find((o) => o.value === resolvedCategory)!

  return (
<div 
  data-onboarding="scale-exercise"
  className="space-y-2"
>
  {/* 第一行：基础设置 */}
  <div className="flex flex-wrap items-end gap-2">
    {/* 调性选择 */}
    <div className="w-[80px] sm:w-[88px] space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('scale_key')}</div>
      <Select value={isScaleKeyRandom ? 'random' : scaleKey} onValueChange={(value) => {
        if (value === 'random') {
          onIsScaleKeyRandomChange(true)
          const randomNote = NOTES[Math.floor(Math.random() * NOTES.length)]
          onScaleKeyChange(randomNote)
        } else {
          onIsScaleKeyRandomChange(false)
          onScaleKeyChange(value)
        }
      }}>
        <SelectTrigger className="h-8 text-xs px-2 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {NOTES.map(note => (
            <SelectItem key={note} value={note} className="text-xs">{note}</SelectItem>
          ))}
          <SelectItem value="random" className="text-xs font-medium text-primary">
            {t('random_key')}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    {/* 调式分类 */}
    <div className="w-[120px] sm:w-[140px] space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('scale_mode')}</div>
      <Select value={resolvedCategory} onValueChange={(v: keyof typeof SCALE_MODES) => {
        onSelectedScaleCategoryChange(v)
        onSelectedScaleChange(SCALE_MODES[v][0])
      }}>
        <SelectTrigger className="h-8 text-xs px-2 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SCALE_CATEGORY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {language === 'zh-CN' ? opt.labelZh : opt.labelEn}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    {/* 方向 - segmented */}
    <div className="w-[180px] sm:w-[200px] space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('scale_direction')}</div>
      <div className="flex items-center bg-card/30 rounded-md border border-border/30 p-0.5 gap-0.5">
        {[
          { id: "up", label: t('order_ascending') },
          { id: "down", label: t('order_descending') },
          { id: "up_down", label: t('order_asc_desc') },
          { id: "random", label: t('order_random') },
        ].map((order) => (
          <Button
            key={order.id}
            variant={scaleDirection === order.id ? "default" : "ghost"}
            size="sm"
            // 一弦三音的序列**自带**上行 + 下行（35 步），方向选择对它是无意义的；
            // 置灰而不是「静默忽略」，否则用户改了方向却什么都不变、也看不出为什么。
            disabled={threeNpsActive}
            onClick={() => onScaleDirectionChange(order.id as "up" | "down" | "up_down" | "random")}
            className="h-7 text-xs flex-1 px-1"
          >
            {order.label}
          </Button>
        ))}
      </div>
    </div>

    {/* 根音移动 */}
    <div className="w-[130px] sm:w-[150px] space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('root_movement')}</div>
      <Select value={scaleRootMovement} onValueChange={(v) => onScaleRootMovementChange(v as typeof scaleRootMovement)}>
        <SelectTrigger className="h-8 text-xs px-2 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="static" className="text-xs">{t('root_movement_static')}</SelectItem>
          <SelectItem value="random" className="text-xs">{t('root_movement_random')}</SelectItem>
          <SelectItem value="upSemiTone" className="text-xs">{t('root_movement_up_semitone')}</SelectItem>
          <SelectItem value="downSemiTone" className="text-xs">{t('root_movement_down_semitone')}</SelectItem>
          <SelectItem value="circleOfFifths" className="text-xs">{t('root_movement_circle_of_fifths')}</SelectItem>
          <SelectItem value="circleOfFourths" className="text-xs">{t('root_movement_circle_of_fourths')}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    {/* 显示选项开关组 */}
    <div className="space-y-0.5">
      <div className="text-2xs text-muted-foreground leading-3">{t('display_options')}</div>
      <div className="flex items-center gap-1.5 h-8 px-2 bg-card/30 rounded-md border border-border/30">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="showScaleFretboard" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">{t('fretboard')}</Label>
          <Switch
            id="showScaleFretboard"
            checked={showScaleFretboard}
            onCheckedChange={onShowScaleFretboardChange}
            className="scale-90"
          />
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div className="flex items-center gap-1.5">
          <Label htmlFor="showScaleKeyboard" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">{t('keyboard')}</Label>
          <Switch
            id="showScaleKeyboard"
            checked={showScaleKeyboard}
            onCheckedChange={onShowScaleKeyboardChange}
            className="scale-90"
          />
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div className="flex items-center gap-1.5">
          <Label htmlFor="showScaleStructure" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">{t('structure')}</Label>
          <Switch
            id="showScaleStructure"
            checked={showScaleStructure}
            onCheckedChange={onShowScaleStructureChange}
            className="scale-90"
          />
        </div>
      </div>
    </div>
  </div>

  {/* 第二行：练习序列和音阶选择 */}
  <div className="flex flex-col sm:flex-row flex-wrap gap-2">
    {/* 练习序列选择 */}
    <div className="bg-card/30 rounded-md p-2 border border-border/30 sm:w-auto w-full">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-2xs text-muted-foreground leading-3">{t('scale_practice_sequence')}</div>
      </div>
      <div className="flex flex-wrap gap-1">
        {SCALE_PRACTICE_SEQUENCES.map((seq) => (
          <Button
            key={seq.id}
            variant={scalePracticeSequence === seq.id ? "default" : "outline"}
            size="sm"
            onClick={() => onScalePracticeSequenceChange(seq.id)}
            className="h-7 text-xs px-2"
          >
            {seq.id === 'random' ? t('random') : seq.id === '3nps' ? t('scale_seq_3nps') : seq.name}
          </Button>
        ))}
      </div>
    </div>

    {/* 音阶类型选择 */}
    <div className="bg-card/30 rounded-md p-2 border border-border/30 flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-2xs text-muted-foreground leading-3">
          {language === 'zh-CN' ? categoryOption.titleZh : categoryOption.titleEn}
          <span className="ml-1 text-3xs text-muted-foreground/70">({t('multi_select_hint')})</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {SCALE_MODES[resolvedCategory].map((scale) => (
          <Button
            key={scale.name}
            variant={selectedScales.some(s => s.name === scale.name) ? "default" : "outline"}
            size="sm"
            onClick={() => {
              const isSelected = selectedScales.some(s => s.name === scale.name)
              if (isSelected) {
                // 取消选择（至少保留一个）
                if (selectedScales.length > 1) {
                  const newScales = selectedScales.filter(s => s.name !== scale.name)
                  onSelectedScalesChange(newScales)
                  onSelectedScaleChange(newScales[0])
                }
              } else {
                // 添加选择
                const newScales = [...selectedScales, scale]
                onSelectedScalesChange(newScales)
                onSelectedScaleChange(scale)
              }
            }}
            className="h-7 text-xs px-2"
          >
            {getScaleDisplayName(scale.name, language === 'zh-CN' ? 'chinese' : 'english')}
          </Button>
        ))}
      </div>
    </div>
  </div>

  {/* 第三行：一弦三音（3NPS）把位选择 */}
  {scalePracticeSequence === '3nps' && (
    <div className="bg-card/30 rounded-md p-2 border border-border/30" data-testid="three-nps-positions">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-2xs text-muted-foreground leading-3">{t('three_nps_position')}</div>
        <div className="text-2xs text-muted-foreground/70">{t('three_nps_marathon_start')}</div>
      </div>
      {threeNpsBlocked ? (
        <p className="text-xs text-amber-600 dark:text-amber-500" role="status">
          {t('three_nps_not_eligible').replace('{count}', String(threeNpsShortestScaleNoteCount))}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {threeNpsPositions.map((p) => (
              <Button
                key={p.index}
                variant={threeNpsSelectedIndex === p.index ? 'default' : 'outline'}
                size="sm"
                onClick={() => onThreeNpsPositionChange(p.index)}
                className="h-7 min-w-[34px] text-xs px-2"
                aria-label={`${t('three_nps_position')} ${p.position}`}
              >
                P{p.position}
              </Button>
            ))}
          </div>
          <p className="text-2xs text-muted-foreground mt-1">{t('three_nps_position_hint')}</p>
        </>
      )}
    </div>
  )}
</div>
  )
})
