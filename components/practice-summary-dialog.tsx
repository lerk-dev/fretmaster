'use client'

// 练习总结对话框（从 app/page.tsx 抽出，内容未改动）

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface PracticeSummaryData {
  correct: number
  total: number
  duration: number
}

interface PracticeSummaryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: PracticeSummaryData
  /** 点击「再练一次」时回调（调用方需自行关闭弹窗） */
  onPracticeAgain: () => void
  t: (key: string) => string
}

export function PracticeSummaryDialog({
  open,
  onOpenChange,
  data,
  onPracticeAgain,
  t,
}: PracticeSummaryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold">
            {t('practice_summary_title')}
          </DialogTitle>
          <DialogDescription className="text-center text-sm text-muted-foreground sr-only">
            {t('practice_summary_title')}
          </DialogDescription>
        </DialogHeader>
        <div className="text-center mb-2">
          <div className="text-4xl mb-2" aria-hidden="true">
            {data.total > 0 && (data.correct / data.total) >= 0.8 ? '🎉' :
             data.total > 0 && (data.correct / data.total) >= 0.5 ? '👍' : '💪'}
          </div>
          <p className="text-sm text-muted-foreground">
            {data.total > 0 && (data.correct / data.total) >= 0.8 ? t('practice_summary_excellent') :
             data.total > 0 && (data.correct / data.total) >= 0.5 ? t('practice_summary_good') : t('practice_summary_keep')}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-500">{data.correct}</div>
            <div className="text-xs text-muted-foreground">{t('practice_summary_correct')}</div>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-red-600 dark:text-red-500">{data.total - data.correct}</div>
            <div className="text-xs text-muted-foreground">{t('practice_summary_wrong')}</div>
          </div>
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-primary">
              {data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0}%
            </div>
            <div className="text-xs text-muted-foreground">{t('practice_summary_accuracy')}</div>
          </div>
          <div className="bg-accent/10 border border-accent/20 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-accent">{Math.floor(data.duration / 60)}:{String(data.duration % 60).padStart(2, '0')}</div>
            <div className="text-xs text-muted-foreground">{t('practice_summary_duration')}</div>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            {t('practice_summary_close')}
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onOpenChange(false)
              onPracticeAgain()
            }}
          >
            {t('practice_summary_again')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
