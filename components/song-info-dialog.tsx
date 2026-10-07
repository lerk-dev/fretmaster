'use client'

// 乐曲信息对话框（从 app/page.tsx 抽出，内容未改动）

import { memo } from 'react'
import { Check, Music } from 'lucide-react'
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
import { Separator } from '@/components/ui/separator'
import type { SONG_PROGRESSIONS } from '@/lib/page-songs'

export type SongInfo = (typeof SONG_PROGRESSIONS)[number]

interface SongInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  song: SongInfo | null
  /** 点击「选择此曲」时回调（song 可能为 null，由调用方判空，与原逻辑一致） */
  onConfirm: (song: SongInfo | null) => void
  t: (key: string) => string
}

function SongInfoDialogInner({ open, onOpenChange, song, onConfirm, t }: SongInfoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            {song?.name}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {song?.name}
          </DialogDescription>
        </DialogHeader>

        {song && (
          <div className="space-y-4 py-4">
            {/* 基本信息 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('song_composer')}</Label>
                <p className="text-sm font-medium">{song.composer || t('unknown')}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('song_year')}</Label>
                <p className="text-sm font-medium">{song.year || t('unknown')}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('song_style')}</Label>
                <p className="text-sm font-medium">{song.style || t('jazz_standard')}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('song_tempo')}</Label>
                <p className="text-sm font-medium">{song.tempo || t('unknown')}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('song_key')}</Label>
                <p className="text-sm font-medium">{song.key || t('unknown')}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('chord_count')}</Label>
                <p className="text-sm font-medium">{song.chords?.length || 0} {t('chords')}</p>
              </div>
            </div>

            <Separator />

            {/* 和弦进行 */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{t('chord_progression')}</Label>
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-sm font-mono leading-relaxed">
                  {song.chords?.join(' - ') || t('no_chords')}
                </p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={() => {
              onConfirm(song)
              onOpenChange(false)
            }}
          >
            <Check className="h-4 w-4 mr-2" />
            {t('select_this_song')}
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
export const SongInfoDialog = memo(SongInfoDialogInner)
