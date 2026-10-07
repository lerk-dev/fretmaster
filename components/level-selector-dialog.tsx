'use client'

// 练习模式选择对话框（从 app/page.tsx 抽出，内容未改动；标识符按组件化需要重命名）

import { memo } from 'react'
import { activateOnEnterSpace } from '@/lib/a11y'
import { Info, Layers, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAppStore } from '@/lib/store'
import { translateOr } from '@/lib/i18n'
import {
  ALL_PRACTICE_LEVELS,
  SINGLE_CHORD_TONES_LEVELS,
  TWO_CHORD_TONES_LEVELS,
  THREE_CHORD_TONES_LEVELS,
  FOUR_CHORD_TONES_LEVELS,
  MELODIC_ROOT_TO_5TH_LEVELS,
  MELODIC_5TH_TO_9TH_LEVELS,
  VOICE_LED_LEVELS,
  SUSPENDED_LEVELS,
  CHORD_SCALES_LEVELS,
  PASSING_NOTE_CHORD_SCALES_LEVELS,
  ALTERED_LEVELS,
  DIMINISHED_SCALES_LEVELS,
  type PracticeLevel,
} from '@/lib/practice-levels'

// UI 层别名（沿用原 page.tsx 的历史命名，数据仍来自 lib/practice-levels）

const PRACTICE_LEVELS = [
  ...SINGLE_CHORD_TONES_LEVELS,
  ...TWO_CHORD_TONES_LEVELS,
  ...THREE_CHORD_TONES_LEVELS,
]
const MELODIC_STRUCTURE_R_TO_5TH = MELODIC_ROOT_TO_5TH_LEVELS
const MELODIC_STRUCTURE_5TH_TO_9TH = MELODIC_5TH_TO_9TH_LEVELS
const VOICE_LED_STRUCTURES = VOICE_LED_LEVELS
const PASSING_TONE_TECHNIQUES = [
  ...SUSPENDED_LEVELS,
  ...CHORD_SCALES_LEVELS,
  ...PASSING_NOTE_CHORD_SCALES_LEVELS,
]
const FOUR_CHORD_TONES = FOUR_CHORD_TONES_LEVELS

interface LevelSelectorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 当前选中的等级 id */
  selectedLevelId: string
  onSelectLevel: (id: string) => void
  /** 点击 ⓘ 时展示等级详情 */
  onShowLevelInfo: (level: PracticeLevel | null) => void
  t: (key: string) => string
}

function LevelSelectorDialogInner({
  open,
  onOpenChange,
  selectedLevelId,
  onSelectLevel,
  onShowLevelInfo,
  t,
}: LevelSelectorDialogProps) {
  // 收藏状态由本组件自己订阅。
  // 不能改用「父组件传进来的求值函数 isFavorite(id)」：本弹窗被 memo 包裹，
  // 且其余 props（t / onSelectLevel / onShowLevelInfo…）引用全部稳定，
  // 父组件即便因收藏变化而重渲染也会被 memo 跳过 —— 那样点击星标后
  // store 已更新、图标却不会刷新（回归测试见 __tests__/favorite-star-refresh.test.ts）。
  const levelFavorites = useAppStore((s) => s.favorites.levelFavorites)
  const toggleLevelFavorite = useAppStore.getState().toggleLevelFavorite

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            {t('practice_level')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('practice_level')}
          </DialogDescription>
        </DialogHeader>

        {/* 练习模式列表 */}
        <ScrollArea className="max-h-[60vh]">
          <div className="p-4 space-y-4">
            {/* 基础练习 */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 bg-muted/50 rounded">
                {t('practice_category_basic')}
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {PRACTICE_LEVELS.map((level) => (
                  <div
                    key={level.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedLevelId === level.id}
                    onClick={() => {
                      onSelectLevel(level.id)
                      onOpenChange(false)
                    }}
                    onKeyDown={activateOnEnterSpace(() => {
                      onSelectLevel(level.id)
                      onOpenChange(false)
                    })}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{t(level.nameKey)}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {translateOr(t, `level_desc_${level.id}`, level.description)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={levelFavorites.includes(level.id) ? t('remove_from_favorites') : t('add_to_favorites')}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleLevelFavorite(level.id)
                        }}
                      >
                        {levelFavorites.includes(level.id) ? (
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        ) : (
                          <Star className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('view_details')}
                        onClick={(e) => {
                          e.stopPropagation()
                          const fullLevel = ALL_PRACTICE_LEVELS.find(l => l.id === level.id)
                          onShowLevelInfo(fullLevel || null)
                        }}
                      >
                        <Info className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 四和弦音 */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 bg-muted/50 rounded">
                {t('level_group_four_chord_tones')}
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {FOUR_CHORD_TONES.map((level) => (
                  <div
                    key={level.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedLevelId === level.id}
                    onClick={() => {
                      onSelectLevel(level.id)
                      onOpenChange(false)
                    }}
                    onKeyDown={activateOnEnterSpace(() => {
                      onSelectLevel(level.id)
                      onOpenChange(false)
                    })}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{t(level.nameKey)}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {translateOr(t, `level_desc_${level.id}`, level.description)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('view_details')}
                      onClick={(e) => {
                        e.stopPropagation()
                        const fullLevel = ALL_PRACTICE_LEVELS.find(l => l.id === level.id)
                        onShowLevelInfo(fullLevel || null)
                      }}
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* 旋律结构 - R到3th */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 bg-muted/50 rounded">
                {t('practice_category_melodic_r5')}
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {MELODIC_STRUCTURE_R_TO_5TH.map((level) => (
                  <div
                    key={level.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedLevelId === level.id}
                    onClick={() => {
                      onSelectLevel(level.id)
                      onOpenChange(false)
                    }}
                    onKeyDown={activateOnEnterSpace(() => {
                      onSelectLevel(level.id)
                      onOpenChange(false)
                    })}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{t(level.nameKey)}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {translateOr(t, `level_desc_${level.id}`, level.description)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('view_details')}
                      onClick={(e) => {
                        e.stopPropagation()
                        const fullLevel = ALL_PRACTICE_LEVELS.find(l => l.id === level.id)
                        onShowLevelInfo(fullLevel || null)
                      }}
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* 旋律结构 - 5th到7th */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 bg-muted/50 rounded">
                {t('practice_category_melodic_59')}
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {MELODIC_STRUCTURE_5TH_TO_9TH.map((level) => (
                  <div
                    key={level.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedLevelId === level.id}
                    onClick={() => {
                      onSelectLevel(level.id)
                      onOpenChange(false)
                    }}
                    onKeyDown={activateOnEnterSpace(() => {
                      onSelectLevel(level.id)
                      onOpenChange(false)
                    })}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{t(level.nameKey)}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {translateOr(t, `level_desc_${level.id}`, level.description)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('view_details')}
                      onClick={(e) => {
                        e.stopPropagation()
                        const fullLevel = ALL_PRACTICE_LEVELS.find(l => l.id === level.id)
                        onShowLevelInfo(fullLevel || null)
                      }}
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* 声部连接 */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 bg-muted/50 rounded">
                {t('practice_category_voice_led')}
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {VOICE_LED_STRUCTURES.map((level) => (
                  <div
                    key={level.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedLevelId === level.id}
                    onClick={() => {
                      onSelectLevel(level.id)
                      onOpenChange(false)
                    }}
                    onKeyDown={activateOnEnterSpace(() => {
                      onSelectLevel(level.id)
                      onOpenChange(false)
                    })}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{t(level.nameKey)}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {translateOr(t, `level_desc_${level.id}`, level.description)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('view_details')}
                      onClick={(e) => {
                        e.stopPropagation()
                        const fullLevel = ALL_PRACTICE_LEVELS.find(l => l.id === level.id)
                        onShowLevelInfo(fullLevel || null)
                      }}
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* 经过音技巧*/}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 bg-muted/50 rounded">
                {t('practice_category_passing')}
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {PASSING_TONE_TECHNIQUES.map((level) => (
                  <div
                    key={level.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedLevelId === level.id}
                    onClick={() => {
                      onSelectLevel(level.id)
                      onOpenChange(false)
                    }}
                    onKeyDown={activateOnEnterSpace(() => {
                      onSelectLevel(level.id)
                      onOpenChange(false)
                    })}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{t(level.nameKey)}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {translateOr(t, `level_desc_${level.id}`, level.description)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('view_details')}
                      onClick={(e) => {
                        e.stopPropagation()
                        const fullLevel = ALL_PRACTICE_LEVELS.find(l => l.id === level.id)
                        onShowLevelInfo(fullLevel || null)
                      }}
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* 变化属和弦结构 */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 bg-muted/50 rounded">
                {t('level_group_altered')}
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {ALTERED_LEVELS.map((level) => (
                  <div
                    key={level.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedLevelId === level.id}
                    onClick={() => {
                      onSelectLevel(level.id)
                      onOpenChange(false)
                    }}
                    onKeyDown={activateOnEnterSpace(() => {
                      onSelectLevel(level.id)
                      onOpenChange(false)
                    })}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{t(level.nameKey)}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {translateOr(t, `level_desc_${level.id}`, level.description)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('view_details')}
                      onClick={(e) => {
                        e.stopPropagation()
                        onShowLevelInfo(level)
                      }}
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* 减音阶 */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 bg-muted/50 rounded">
                {t('level_group_diminished')}
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {DIMINISHED_SCALES_LEVELS.map((level) => (
                  <div
                    key={level.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedLevelId === level.id}
                    onClick={() => {
                      onSelectLevel(level.id)
                      onOpenChange(false)
                    }}
                    onKeyDown={activateOnEnterSpace(() => {
                      onSelectLevel(level.id)
                      onOpenChange(false)
                    })}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{t(level.nameKey)}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {translateOr(t, `level_desc_${level.id}`, level.description)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('view_details')}
                      onClick={(e) => {
                        e.stopPropagation()
                        onShowLevelInfo(level)
                      }}
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('btn_close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// 包 memo：父组件重渲染时，若 props 未变化则跳过重渲染（弹窗关闭时避免重建整棵 JSX 子树）
export const LevelSelectorDialog = memo(LevelSelectorDialogInner)
