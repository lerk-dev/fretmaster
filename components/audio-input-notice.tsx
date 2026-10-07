// 音频输入未开启提示条（练习模式专享）
//
// 背景：练习模式的音高识别依赖 `micEnabled`（默认 false，lib/store.ts:515），
// 而调音器走的是**完全独立的音频链路**（自己的 getUserMedia/AudioContext/analyser），
// 不需要这个开关。于是出现「调音器能识别音高，但练习怎么弹都没反应」——
// 用户完全无从得知要去设置里开音频输入。此提示即为消除这一盲区。
"use client"

import { memo } from 'react'
import { MicOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AudioInputNoticeProps {
  t: (key: string) => string
  /** 点击后打开设置抽屉（定位到音频区） */
  onOpenSettings: () => void
}

export const AudioInputNotice = memo(function AudioInputNotice({ t, onOpenSettings }: AudioInputNoticeProps) {
  return (
    <div
      role="status"
      className="mb-2 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
    >
      <MicOff className="h-4 w-4 shrink-0" />
      <span className="flex-1 min-w-0">{t('audio_input_required')}</span>
      <Button
        size="sm"
        variant="outline"
        className="h-6 shrink-0 px-2 text-xs"
        onClick={onOpenSettings}
      >
        {t('audio_input_open_settings')}
      </Button>
    </div>
  )
})
