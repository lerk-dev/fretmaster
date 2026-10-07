'use client'

// 和弦练习模式选择对话框（从 app/page.tsx 抽出，内容未改动）

import { memo } from 'react'
import { activateOnEnterSpace } from '@/lib/a11y'
import { Info, Layers } from 'lucide-react'
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
import { translateOr } from '@/lib/i18n'
import type { PracticeLevel } from '@/lib/practice-levels'

interface PracticeModeGroup {
  id: string
  name: string
  nameZh: string
  levels: PracticeLevel[]
}

interface ChordExerciseLevelSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: PracticeModeGroup[]
  /** 当前选中的等级 id */
  selectedLevelId: string
  onSelectLevel: (id: string) => void
  /** 点击 ⓘ 时展示等级详情 */
  onShowLevelInfo: (level: PracticeLevel) => void
  language: string
  t: (key: string) => string
}


function ChordExerciseLevelSelectorInner({
  open,
  onOpenChange,
  groups,
  selectedLevelId,
  onSelectLevel,
  onShowLevelInfo,
  language,
  t,
}: ChordExerciseLevelSelectorProps) {
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
            {groups.map((group) => (
              <div key={group.id} className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 bg-muted/50 rounded">
                  {language === 'zh-CN' ? group.nameZh : group.name}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {group.levels.map((level) => (
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
            ))}
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
export const ChordExerciseLevelSelector = memo(ChordExerciseLevelSelectorInner)
