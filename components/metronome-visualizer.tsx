'use client'

import { useEffect, useState, useRef, memo, useSyncExternalStore } from 'react'
import { getMetronomeBeat, subscribeMetronomeBeat } from '@/lib/metronome-clock'

interface MetronomeVisualizerProps {
  bpm: number
  enabled: boolean
  isPlaying: boolean
  beatsPerMeasure?: number
  /** 调用方（app/page.tsx）会传语言；当前 UI 没有需要翻译的文案，保留字段以兼容调用方 */
  language?: 'zh-CN' | 'en'
}

/** 历史柱最多保留几根 */
const HISTORY_LIMIT = 16
/** 脉冲放大到还原的时长（毫秒） */
const PULSE_MS = 100

export const MetronomeVisualizer = memo(function MetronomeVisualizer({
  bpm,
  enabled,
  isPlaying,
  beatsPerMeasure = 4,
}: MetronomeVisualizerProps) {
  // 🚨 拍事件来自 `lib/metronome-clock.ts`（由 `hooks/use-metronome-scheduler.ts`
  // 在**音频时钟**上排程后广播）。本组件**不再自己起定时器** —— 修前它和声音各有一个
  // `setInterval`，启动时刻与漂移速率都不同 ⇒ 圆点与「咔哒」逐渐错开（#14）。
  // 用 useSyncExternalStore 而不是 setState 隧道：只有这一小块订阅，page.tsx 不重渲染。
  // 第三个参数（getServerSnapshot）是 SSR 必需的，缺了会在静态导出时抛错。
  const beat = useSyncExternalStore(subscribeMetronomeBeat, getMetronomeBeat, getMetronomeBeat)

  const [pulseScale, setPulseScale] = useState(1)
  const [beatHistory, setBeatHistory] = useState<number[]>([])
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 已处理过的拍序号。**初值取挂载那一刻的 seq**：练习中途打开可视化时不会
  // 凭空补一根历史柱（只有「挂载之后新来的拍」才推进）。跨会话不需要归零 ——
  // seq 单调递增，重新开始练习时第一拍必然是一个新值。
  const lastSeqRef = useRef(beat.seq)

  // 🚨 拍号必须夹到 >= 1：`x % 0` 是 **NaN** ⇒ 圆点计数变 NaN（渲染出 "NaN"、且永不命中任何圆点）。
  // 调用方目前固定传 4，但它是 props，将来接拍号选择器时会直接暴露。
  const safeBeats = Number.isFinite(beatsPerMeasure) && beatsPerMeasure >= 1
    ? Math.floor(beatsPerMeasure)
    : 4
  // 同理 bpm：渲染里有 `60 / bpm` 与动画时长，bpm<=0 会得到 Infinity。
  const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : null
  const running = enabled && isPlaying && safeBpm !== null

  // 新的一拍：脉冲放大 + 记一根历史柱。
  // 🚨 判据是 `seq`（单调递增）而不是 index —— index 会循环回 0，
  // 用 index 判断「是否新拍」会把每个小节的第一拍当成重复而漏记。
  useEffect(() => {
    if (!running) return
    if (beat.seq === lastSeqRef.current) return
    lastSeqRef.current = beat.seq
    setPulseScale(1.3)
    if (pulseTimerRef.current !== null) clearTimeout(pulseTimerRef.current)
    pulseTimerRef.current = setTimeout(() => {
      pulseTimerRef.current = null
      setPulseScale(1)
    }, PULSE_MS)
    setBeatHistory((prev) => [...prev, beat.index].slice(-HISTORY_LIMIT))
  }, [beat, running])

  useEffect(
    () => () => {
      if (pulseTimerRef.current !== null) clearTimeout(pulseTimerRef.current)
    },
    []
  )

  // 停止练习：清空历史柱并把脉冲还原（修前由「另一个定时器」顺手做，现在必须显式做）。
  useEffect(() => {
    if (!isPlaying) {
      setBeatHistory([])
      setPulseScale(1)
    }
  }, [isPlaying])

  // 🚨 `bpm <= 0` 不渲染是有意为之：`60 / 0` = Infinity 会写进 `style.animationDuration`（非法 CSS）。
  // 且 bpm 在 store 里已被 `clampMetronomeBpm` 钳住 ⇒ 走到这里必是脏值，
  // 此时排程器不会出声 —— 画面若还动就是「看得见、听不到」，与声音路径口径矛盾。
  if (!running) return null

  // 小节内位置由**排程器**给出（不是 `seq % safeBeats`：seq 跨会话不归零，取模会算错）。
  const currentBeat = Math.min(beat.index, safeBeats - 1)

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className="flex flex-col items-center gap-2">
        <div
          className="relative flex items-center justify-center"
          style={{
            transform: `scale(${pulseScale})`,
            transition: 'transform 0.1s ease-out',
          }}
        >
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-primary/40 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <span className="text-primary-foreground text-lg font-bold">
                  {currentBeat + 1}
                </span>
              </div>
            </div>
          </div>
          <div
            className="absolute inset-0 rounded-full border-2 border-primary/50 animate-ping"
            style={{ animationDuration: `${(60 / safeBpm) * 1000}ms` }}
          />
        </div>

        <div className="flex items-center gap-1.5">
          {Array.from({ length: safeBeats }).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all duration-100 ${
                i === currentBeat
                  ? 'bg-primary scale-150'
                  : i < currentBeat
                  ? 'bg-primary/40'
                  : 'bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>

        <div className="flex items-end gap-0.5 h-6">
          {beatHistory.map((beatIndex, i) => (
            <div
              key={`${i}-${beatIndex}`}
              className="w-1 bg-primary/60 rounded-full transition-all"
              style={{
                height: `${Math.max(4, (beatIndex + 1) * 4)}px`,
                opacity: 0.3 + (i / beatHistory.length) * 0.7,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
})
