'use client'

// 调音器侧边栏（从 app/page.tsx 抽出，内容未改动）

import { Activity, Mic, MicOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'

interface TunerSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  detectedNote: string
  detectedFrequency: number
  cents: number
  tunerActive: boolean
  onToggleTuner: () => void
  referenceFrequency: number
  onReferenceFrequencyChange: (value: number[]) => void
  t: (key: string) => string
}

export function TunerSheet({
  open,
  onOpenChange,
  detectedNote,
  detectedFrequency,
  cents,
  tunerActive,
  onToggleTuner,
  referenceFrequency,
  onReferenceFrequencyChange,
  t,
}: TunerSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <div data-onboarding="tuner">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            title={t('nav_tuner')}
            aria-label={t('nav_tuner')}
          >
            <Activity className="h-4 w-4" />
          </Button>
        </div>
      </SheetTrigger>
      <SheetContent className="w-80 overflow-y-auto">
        <SheetHeader className="px-4">
          <SheetTitle>{t('tuner_title')}</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 py-4 px-4">
          {/* 调音器显示*/}
          <div className="space-y-4">
            {/* 主显示区域：in-tune 时整块闪绿 + 放大反馈 */}
            <div
              className={`bg-card border rounded-lg p-6 text-center space-y-4 transition-all duration-200 ${
                detectedFrequency > 0 && Math.abs(cents) <= 5
                  ? 'border-green-500/60 bg-green-500/10 scale-[1.02] shadow-[0_0_24px_-4px] shadow-green-500/40'
                  : ''
              }`}
              role="status"
              aria-live="polite"
              aria-label={
                detectedFrequency > 0
                  ? t('tuner_detected_label')
                      .replace('{note}', detectedNote)
                      .replace('{cents}', String(cents))
                  : t('tuner_no_pitch_label')
              }
            >
              {/* 检测到的音高*/}
              <div className={`text-6xl font-bold tabular-nums transition-colors ${
                detectedFrequency > 0 && Math.abs(cents) <= 5 ? 'text-green-400' : 'text-primary'
              }`}>
                {detectedNote}
              </div>

              {/* 频率显示 */}
              <div className="text-sm text-muted-foreground tabular-nums">
                {detectedFrequency > 0 ? `${detectedFrequency} Hz` : '--'}
              </div>

              {/* 音分偏差指示器：加大尺寸 + 刻度标记 */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                  <span>-50¢</span>
                  <span className={`font-medium tabular-nums ${
                    Math.abs(cents) <= 5 ? 'text-green-400' : 'text-foreground'
                  }`}>
                    {cents > 0 ? '+' : ''}{cents}¢
                  </span>
                  <span>+50¢</span>
                </div>
                {/* bar 高度从 h-2 提升到 h-6，远距离可见 */}
                <div className="relative h-6 bg-muted rounded-full overflow-hidden border border-border/40">
                  {/* 中心刻度（0¢）*/}
                  <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-primary/60" />
                  {/* -10/-5/+5/+10 辅助刻度 */}
                  <div className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-muted-foreground/40" style={{ left: '40%' }} />
                  <div className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-muted-foreground/40" style={{ left: '45%' }} />
                  <div className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-muted-foreground/40" style={{ left: '55%' }} />
                  <div className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-muted-foreground/40" style={{ left: '60%' }} />
                  {/* in-tune 安全区（±5¢）*/}
                  <div className="absolute top-0 bottom-0 bg-green-500/15" style={{ left: '45%', width: '10%' }} />
                  {/* 指示器：从 w-1.5 加宽到 w-2 */}
                  <div
                    className="absolute top-0 bottom-0 w-2 rounded-full transition-all duration-100 shadow-md"
                    style={{
                      left: `${50 + Math.max(-50, Math.min(50, cents))}%`,
                      transform: 'translateX(-50%)',
                      backgroundColor: Math.abs(cents) <= 5 ? '#22c55e' : Math.abs(cents) <= 20 ? '#f59e0b' : '#ef4444'
                    }}
                  />
                </div>
                <div className="text-center text-xs font-medium tabular-nums">
                  {detectedFrequency > 0 && (
                    <span className={Math.abs(cents) <= 5 ? 'text-green-400' : cents < 0 ? 'text-amber-400' : 'text-red-400'}>
                      {Math.abs(cents) <= 5 ? t('tuner_in_tune') : cents < 0 ? t('tuner_too_low') : t('tuner_too_high')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 控制按钮 */}
            <Button
              onClick={onToggleTuner}
              variant={tunerActive ? "destructive" : "default"}
              className="w-full"
            >
              {tunerActive ? (
                <>
                  <MicOff className="h-4 w-4 mr-2" />
                  {t('tuner_stop')}
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4 mr-2" />
                  {t('tuner_start')}
                </>
              )}
            </Button>

            {/* 参考频率设置*/}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('tuner_reference')}</span>
                <span className="font-mono">{referenceFrequency} Hz</span>
              </div>
              <Slider
                value={[referenceFrequency]}
                onValueChange={onReferenceFrequencyChange}
                min={430}
                max={450}
                step={1}
              />
            </div>

            {/* 吉他标准音参考*/}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{t('tuner_strings')}</h4>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  { name: t('tuner_e6'), freq: 82.41 },
                  { name: t('tuner_a5'), freq: 110.00 },
                  { name: t('tuner_d4'), freq: 146.83 },
                  { name: t('tuner_g3'), freq: 196.00 },
                  { name: t('tuner_b2'), freq: 246.94 },
                  { name: t('tuner_e1'), freq: 329.63 },
                ].map((string) => (
                  <div
                    key={string.name}
                    className="bg-muted/50 rounded px-2 py-1.5 text-center"
                  >
                    <div className="font-medium">{string.name}</div>
                    <div className="text-muted-foreground">{string.freq} Hz</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
