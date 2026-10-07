'use client'

// 练习模式详细信息对话框（从 app/page.tsx 抽出，内容未改动）

import { memo } from 'react'
import { Check, Layers } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { translateOr } from '@/lib/i18n'
import type { PracticeLevel } from '@/lib/practice-levels'

interface LevelInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  level: PracticeLevel | null
  /** 点击「选择此等级」时回调（level 可能为 null，由调用方判空，与原逻辑一致） */
  onConfirm: (level: PracticeLevel | null) => void
  t: (key: string) => string
}

function LevelInfoDialogInner({ open, onOpenChange, level: selectedLevelInfo, onConfirm, t }: LevelInfoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            {selectedLevelInfo ? t(selectedLevelInfo.nameKey) : ''}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {selectedLevelInfo ? t(selectedLevelInfo.nameKey) : ''}
          </DialogDescription>
        </DialogHeader>

        {selectedLevelInfo && (
          <div className="space-y-4 py-4">
            {/* 基本信息 */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('practice_level')}</Label>
                <p className="text-sm font-medium">{t(selectedLevelInfo.nameKey)}</p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('description')}</Label>
                <p className="text-sm">
                  {translateOr(t, `level_desc_${selectedLevelInfo.id}`, selectedLevelInfo.description)}
                </p>
              </div>

              {/* SOLO风格等级选项 */}
              {(() => {
                const soloLevel = selectedLevelInfo as PracticeLevel
                if (soloLevel.sequences) {
                  return (
                    <div className="space-y-3 pt-2 border-t">
                      <Label className="text-xs text-muted-foreground">{t('level_options')}</Label>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="p-2 bg-muted/30 rounded flex items-center justify-between">
                          <span>{t('level_order_option')}</span>
                          <Badge variant={soloLevel.orderOption ? "default" : "outline"}>
                            {soloLevel.orderOption ? t('enabled') : t('disabled')}
                          </Badge>
                        </div>
                        <div className="p-2 bg-muted/30 rounded flex items-center justify-between">
                          <span>{t('level_random_option')}</span>
                          <Badge variant={soloLevel.randomOption ? "default" : "outline"}>
                            {soloLevel.randomOption ? t('enabled') : t('disabled')}
                          </Badge>
                        </div>
                        <div className="p-2 bg-muted/30 rounded flex items-center justify-between">
                          <span>{t('level_starting_interval')}</span>
                          <Badge variant="secondary">{soloLevel.startingIntervalOption}</Badge>
                        </div>
                        <div className="p-2 bg-muted/30 rounded flex items-center justify-between">
                          <span>{t('level_notes_per_chord')}</span>
                          <Badge variant="secondary">{soloLevel.notesPerChord}</Badge>
                        </div>
                        <div className="p-2 bg-muted/30 rounded flex items-center justify-between">
                          <span>{t('level_force_natural_five')}</span>
                          <Badge variant={soloLevel.forceNaturalFive ? "default" : "outline"}>
                            {soloLevel.forceNaturalFive ? t('yes') : t('no')}
                          </Badge>
                        </div>
                        {soloLevel.endOnStartingInterval !== undefined && (
                          <div className="p-2 bg-muted/30 rounded flex items-center justify-between">
                            <span>{t('level_end_on_starting')}</span>
                            <Badge variant={soloLevel.endOnStartingInterval ? "default" : "outline"}>
                              {soloLevel.endOnStartingInterval ? t('yes') : t('no')}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }
                return null
              })()}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={() => {
              onConfirm(selectedLevelInfo)
              onOpenChange(false)
            }}
          >
            <Check className="h-4 w-4 mr-2" />
            {t('select_this_level')}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('btn_close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// 包 memo：父组件重渲染时，若 props 未变化则跳过重渲染（弹窗关闭时避免重建整棵 JSX 子树）
export const LevelInfoDialog = memo(LevelInfoDialogInner)
