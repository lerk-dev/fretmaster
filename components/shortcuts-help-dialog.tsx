'use client'

// 快捷键帮助对话框（从 app/page.tsx 抽出，内容未改动）

import { memo } from 'react'
import { Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'

interface ShortcutsHelpDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  t: (key: string) => string
}

function ShortcutsHelpDialogInner({ open, onOpenChange, t }: ShortcutsHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            {t('shortcuts_title')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('shortcuts_title')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 全局快捷键*/}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {t('shortcuts_global')}
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{t('shortcuts_esc')}</kbd>
                <span className="text-sm">{t('shortcuts_esc_desc')}</span>
              </div>
              <div className="flex items-center justify-between">
                <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{t('shortcuts_number')}</kbd>
                <span className="text-sm">{t('shortcuts_number_desc')}</span>
              </div>
              <div className="flex items-center justify-between">
                <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{t('shortcuts_f')}</kbd>
                <span className="text-sm">{t('shortcuts_f_desc')}</span>
              </div>
              <div className="flex items-center justify-between">
                <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{t('shortcuts_m')}</kbd>
                <span className="text-sm">{t('shortcuts_m_desc')}</span>
              </div>
              <div className="flex items-center justify-between">
                <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{t('shortcuts_s')}</kbd>
                <span className="text-sm">{t('shortcuts_s_desc')}</span>
              </div>
              <div className="flex items-center justify-between">
                <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{t('shortcuts_p')}</kbd>
                <span className="text-sm">{t('shortcuts_p_desc')}</span>
              </div>
              <div className="flex items-center justify-between">
                <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{t('shortcuts_h')}</kbd>
                <span className="text-sm">{t('shortcuts_h_desc')}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* 练习模式快捷键*/}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {t('shortcuts_practice')}
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{t('shortcuts_space')}</kbd>
                <span className="text-sm">{t('shortcuts_space_desc')}</span>
              </div>
              <div className="flex items-center justify-between">
                <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{t('shortcuts_up')}</kbd>
                <span className="text-sm">{t('shortcuts_up_desc')}</span>
              </div>
              <div className="flex items-center justify-between">
                <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">{t('shortcuts_down')}</kbd>
                <span className="text-sm">{t('shortcuts_down_desc')}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline" size="sm">
            {t('shortcuts_close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// 包 memo：父组件重渲染时，若 props 未变化则跳过重渲染（弹窗关闭时避免重建整棵 JSX 子树）
export const ShortcutsHelpDialog = memo(ShortcutsHelpDialogInner)
